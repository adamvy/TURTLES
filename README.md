# TURTLES on bare-metal ARM, in your browser

**[Boot the live demo in Chrome](https://adamvy.github.io/TURTLES/)** ·
[Download the ARM images](https://github.com/adamvy/TURTLES/releases/latest) ·
[Original TURTLES project](https://github.com/kgrgreer/TURTLES)

Kevin Greer's [TURTLES](https://github.com/kgrgreer/TURTLES), running directly on
an emulated ARM CPU. This implementation covers T0's language core, original
prelude, and its T0-written parser/compiler layers. It replaces the initial
integer subset with a native compiler and VM, binary64 numbers, UTF-16 strings,
growing arrays, lexical closures, compile-time evaluation and nonlocal returns.
The upstream sources remain unchanged under `src/`; the ARM and browser port
and the extended JS-like functions live alongside them in this fork.

JavaScript assembles AArch64 instructions and packages the boot images. The
guest uses no C, libc, JavaScript engine, operating system or semihosting.
There is no garbage collector: allocations advance through a bounded arena
and heap; exhaustion prints `HALTED` and stops until the guest is rebooted.

## Build and boot

Requires Node.js 20+ and `qemu-system-aarch64` supporting `virt-8.2`. This Mac
has Node 24.1.0 and QEMU 9.1.2. No npm dependencies or compiler installation
are needed.

```sh
npm run build
npm start -- --mode t0
npm start -- --mode js
```

Both variants use one Cortex-A53, 512 MiB RAM and TCG software emulation.
Exit the terminal guest with **Ctrl-a, then x**. `--raw` selects the raw image;
`QEMU_BINARY` selects another QEMU executable. `boot.command` is a macOS
Terminal launcher.

For the static, entirely client-side browser emulator:

```sh
npm run build:web
npm run preview
```

Open the printed URL and click Boot. The page downloads and verifies QEMU
WebAssembly on demand, then boots the same ARM image. Choose raw T0 or the
JS-like frontend. The public site uses this path and needs no server process.
See [browser hosting and releases](docs/browser.md) for engine provenance,
memory requirements, manifests and the GitHub Pages publication workflow.

For the separate native-QEMU development console:

```sh
npm run console
```

Open the local URL it prints. The page relays the actual QEMU UART; evaluation
happens in the guest. Select raw T0 or JS-like mode and reboot from the page.
Rebooting discards the old guest's definitions and values. Stop the server with
Ctrl-c when finished.

## Raw T0

The `t0>` variant loads the original T0 prelude. Try:

```t0
1 2 / print
{ x | x x * } ::square
9 square print
1 { count | { | count 1 + :count count } } () :counter
counter () print
counter () print
{ | i[ 6 7 * emit ] } () print
[ 1 2 3 ] { x | x x * } map print
```

The results are `0.5`, `81`, `2`, `3`, `42`, and `1,4,9`. Definitions, compiled
blocks and captured state are created inside ARM after boot. T0 separates
tokens with whitespace, including `{`, `|`, and `}`. Its quote word consumes
the following text: `" hello"` is the string `hello`.

`depth` pushes the stack depth, `clear` empties the data stack, and `reset`
restarts guest initialization. Neither dropping values nor clearing the stack
reclaims memory. Once the guest is halted, use the host reboot control.

For multiline input, enter `:paste`, enter the source lines, then enter
`:end`. `:cancel` discards a paste. The guest evaluates the collected source
once, preserving newlines. The browser supports multiline source directly.
A submission can contain at most 65,535 UTF-8 bytes.

## JS-like environment

The `js>` variant also loads the upstream-derived parser combinators,
`FormulaParser`/`FormulaCompiler`, and a small REPL adapter, all written in T0:

```js
1 + 2 * 3
answer=42
answer + 0.5
[1,[2,3]][1][0]
function square(x) { return x * x; }
square(9)
let twice = x => x * 2;
twice(21)
```

The expression results are `7`, `42`, `42.5`, `2`, `81`, and `42`. The REPL prints the newest top
value when a submission grows the T0 stack. Earlier values persist. This is
the upstream-derived **JS-like dialect**, with documented repairs and extensions, rather
than a full ECMAScript engine. It supports numbers, booleans, assignments,
arrays, conditionals, loops, blocks, line comments, named/anonymous functions,
arrow functions, lexical mutable captures, recursion, calls, returns and
function-scoped `let`. It does not support objects, string literals, `const`,
classes or the ECMAScript standard library. See the
[language notes](language/README.md) for syntax and compatibility boundaries.

The raw environment can load these same layers explicitly:

```t0
'parsers.t0 include
'jsparser.t0 include
'js-repl.t0 include
" 1.5 + 2.25" jsEval print
js{ 6 * 7 }js print
```

Upstream describes **T1 as a future SOM-derived language**; this existing
JS-like frontend is not a completed T1.

## Compatibility and self-hosting

The pinned semantic reference is unchanged upstream `t0.js` at revision
`217cb43d7a16a98abd3e9984d1fc0416f8898d98`. The ARM core implements the intended
T0 vocabulary, including `i[`/`emit`, `switch`, `??`, `.method` dispatch,
`input_`/`ip_`, local and named returns, early binding and forward references.
Numbers and coercions follow the JavaScript value behavior used by that core;
strings index UTF-16 code units. Arrays grow, preserve identity, allow custom
properties, and distinguish holes from explicit undefined values.

The parser combinators and JS-like compiler run in T0 **inside the guest**.
That preserves the self-hosted layers upstream currently supplies. The T0
primitive core is ARM assembly; the assembler and packager still run under
Node. The guest does not yet rebuild its ARM implementation or its boot image.
This takes the requested assembly-Turtles route, not a general JavaScript-to-ARM
transpiler.

Compatibility is checked with differential tests, not claimed from booting
alone. Deliberate repairs, host integration boundaries and numeric accuracy are
listed in [compatibility notes](docs/compatibility.md). In particular, browser
`fetch` and JavaScript object-prototype reflection are not guest APIs; embedded
`include` replaces file loading, and `debugger` is inert without a debugger.

## Verification

```sh
npm test
npm run fetch:engine
npm run test:wasm
npm run build:web
node test/site-package.mjs
```

Tests compare ARM execution with the pinned JavaScript core, verify the
JS-like REPL and complete resulting stacks, check memory-exhaustion halts,
and boot ELF/raw images. The assembler has an independent Clang encoding
oracle when Clang's AArch64 backend is available; building never uses Clang.
The broad numeric sweep checks 5,913 cases. Decimal conversion and remainder
comparisons are exact; general `Math.pow` comparisons allow one ULP, with exact
special-case and independently checked high-precision vectors.

The native suites cover the full environment, focused compiler regressions,
inline JS, functions and four launcher/image paths. Function tests compare the
T0-written compiler on upstream T0 and actual ARM, with a separate ECMAScript
oracle for the supported subset. Generated test results and
actual UART transcripts are saved under `build/`.
The [architecture](docs/architecture.md) explains the compiler, memory layout
and build. The [plan](PLAN.md) records the decision and next OS milestones.
Unchanged upstream sources and their Apache-2.0 license are in
[vendor/upstream](vendor/upstream/README.md).
