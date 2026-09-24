# Native T0 architecture

The image is a language runtime on QEMU bare metal, and a foundation for later
OS work. JavaScript emits AArch64 machine code from assembly and writes the
ELF headers. ARM executes the compiler, VM, parser libraries and user programs.
There is no guest C, libc, JavaScript engine, Linux or host evaluation service.

The reference is unchanged [upstream T0](https://github.com/kgrgreer/TURTLES/blob/217cb43d7a16a98abd3e9984d1fc0416f8898d98/src/t0.js).
`runtime/full/ABI.md` is the detailed implementation contract.

## Build and boot

The build combines the assembly modules under `runtime/full`, a generated
primitive table, typed UTF-16 literals, the original T0 prelude and three
T0-written language modules. `tools/assembler.mjs` directly encodes instructions;
`tools/image.mjs` packages the bytes into ELF64. An external compiler/linker is
unnecessary. Clang is used only as an optional independent test oracle.

Both variants embed the language source. Raw T0 loads only the original prelude
at boot; JS-like mode also evaluates the parser combinators, FormulaCompiler
and REPL adapter. Raw T0 can later load the same bundled modules with `include`.
Build artifacts include ELF, raw bytes, symbol maps, assembled source and
manifests recording the target, pinned revision and hashes. The build is local,
deterministic and dependency-free.

QEMU uses `virt-8.2`, Cortex-A53, one CPU, 512 MiB RAM and TCG. The generic loader
sets CPU 0's entry point to `0x40200000`; raw loading supplies this address
explicitly. This follows the [generic loader](https://www.qemu.org/docs/master/system/generic-loader.html)
path, not Linux's kernel boot protocol. The image sits above the board's DTB
reservation. The [virt board documentation](https://www.qemu.org/docs/master/system/arm/virt.html#hardware-configuration-information-for-bare-metal-programming)
explains its bare-metal hardware description; this runtime currently pins the
PL011 UART address instead of discovering devices through the DTB.

Entry masks interrupts, enables FP/SIMD access, initializes the stack and
allocation cursors, seeds the compiler dictionary, and loads the chosen T0
sources. Initialization errors halt rather than displaying a misleading ready
prompt.

## Memory and values

Addresses are physical. Upper bounds below are exclusive; there is no MMU or
page-based protection yet.

| Range/address | Use |
| --- | --- |
| `0x09000000` | PL011 UART |
| `0x40000000`–`0x60000000` | 512 MiB RAM |
| `0x40000000`–`0x40100000` | Reserved DTB region |
| `0x40200000` upward | Code, static source/data, 64 KiB input buffer |
| `0x40800000`–`0x40880000` | Data stack: 65,536 value slots |
| `0x40a00000`–`0x40c00000` | Guarded normal native stack region, growing down |
| `0x41000000`–`0x47000000` | 96 MiB arena for compiler records, frames, backing arrays |
| `0x48000000`–`0x5f000000` | 368 MiB value heap |

All language values occupy a 64-bit slot. False, true, undefined and null have
distinct immediate encodings. Other values are aligned pointers to typed
objects. Numbers contain an IEEE-754 binary64 payload; strings store a length
and UTF-16 units; closures carry their template, captured frame and custom
properties; arrays carry length, capacity, backing storage and custom properties.
The private zero cell denotes an array hole; an actual undefined element uses
the language's undefined encoding.

Arrays grow with new monotonic backing allocations; old backing storage is
not reclaimed. Shrinking clears truncated elements so regrowth creates holes.
String conversions preserve JS-style comma joining and elide array cycles.
UART bytes are UTF-8, decoded to UTF-16 for compilation and values; isolated
surrogates are displayed with the replacement character while their internal
code units remain intact.

`x22`, `x23`, `x24` are the data stack, arena and heap cursors. Native helpers
preserve `x19..x21` and `x25..x28`, save return addresses across calls, and keep
SP aligned to 16 bytes. `d0..d7` are scratch floating-point registers. This is
an internal ABI, not a libc calling interface.

Allocation checks precede writes. Resource exhaustion prints its category and
enters a permanent WFI loop: heap, arena, data stack or native call stack.
Dropping values and clearing the stack do not free storage. The `reset`
extension reinitializes the entire guest while it is responsive; after a
HALT, only the host can reboot it. Guards are software checks, not guard pages.

## Compiler and VM

Upstream compiles to arrays of JS functions. The native compiler instead emits
linked, 32-byte instruction nodes containing a handler, two operands and a
next pointer. A builder tracks head, tail and a template backlink. Emitting
into an empty already-created template updates its entry point, preserving
upstream's mutable `i[`/`emit` behavior.

A compiler scope has a parent, binding list and optional owned input/index.
Inherited source state matters for `??`, `input_` and `ip_`: closures can capture
a compiler scope that later sees inherited input, or source owned by an earlier
compile-time evaluation. The current source offset counts UTF-16 units.

Known bindings are resolved at compile time. A previously unknown name emits
a runtime dictionary lookup. For example:

```t0
2 :x { | x } :f 3 :x f () print x print
```

Both upstream and native print `2`, then `3`. Automatic-call definitions retain
their individual operation boundaries; those boundaries also matter when
`switch` evaluates one instruction per key during compilation.

A closure template stores code, parameter/local counts, optional return name,
source text and compiler scope. Its closure object captures a lexical frame.
Calling it allocates a new frame with a parent pointer, reversed parameters,
and all local slots reserved before executing initializers. This last detail
repairs upstream's frame-aliasing bug. Locals compile to frame-depth/slot
accesses; setters and increment/decrement update the captured cell.

`i[` evaluates source during compilation and `emit` adds a constant push to
the active outer builder. `switch` preserves compile-time key evaluation and
runtime selection. `??` invokes a dictionary entry in its captured compiler
scope. Local and named returns propagate through nested calls/loops using an
explicit pending-return state until the matching function catches it. Values
already pushed remain on the data stack.

## Parser layers and numbers

The parser combinators and FormulaCompiler are T0 source derived from the
pinned upstream. After boot they compile new JS-like input entirely inside the
guest. `jsCompile` checks complete consumption before accepting a source;
`jsEval` evaluates the resulting T0. `js{ ... }js` compiles the generated T0
into its caller's builder. Its deliberate timing repair is documented in the
[language notes](../language/README.md).

The parser/compiler are self-hosted language layers; the ARM primitive core,
assembler and packager are not self-rebuilt in the guest. The current frontend
emits T0, not native ARM machine code.

The [numeric implementation](../runtime/full/NUMBERS.md) uses exact bounded
integer arithmetic for decimal parsing, shortest-roundtrip formatting and
binary remainder. FP arithmetic is binary64. Power uses double-double log/exp
and follows ECMAScript's implementation-approximated contract. It is checked
against special cases, independent exact vectors and a broad one-ULP oracle
sweep; it is not asserted identical to every host JavaScript engine.

## REPL and host console

Ordinary lines evaluate immediately. `:paste` collects lines until `:end`,
preserving newlines and evaluating the submission once; `:cancel` discards it.
Oversized submissions are drained and rejected before evaluation. The limit
is 65,535 UTF-8 bytes. Backspace removes the preceding UTF-8 sequence, CRLF is
accepted, and malformed UTF-8 is replaced during decoding.

Language errors report through UART and restore compiler/interpreter state to
the global prompt. Existing values, definitions and earlier side effects remain;
this is error recovery, not transactional execution. Allocations stay consumed.
Resource failure instead halts permanently. A JS-like submission prints its
new top stack value when the data stack grows; it does not emulate ECMAScript
statement completion or discard the T0 stack.

The optional Node/browser console bridges the actual QEMU serial stream over
loopback HTTP/SSE. It uses a random URL token and same-origin checks for writes.
Changing mode or rebooting starts a new QEMU process. The page contains no
language evaluator. Closing the page does not stop the server or guest; Ctrl-c
stops the host console process.

## Next platform work

The environment currently has polled serial I/O and a language runtime. It has
no interrupt-driven devices, scheduler, protected tasks, filesystem, persistence
or networking. Exception vectors, DTB discovery, timers and virtio storage are
natural next platform steps. A T0-written ARM backend and image builder would
establish the stronger self-rebuilding milestone. Real hardware needs its own
boot/device backend; QEMU `virt` is not a generic specification for all ARM
boards.
