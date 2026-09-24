# Full T0 implementation contract

This replaces the first source-interpreted integer milestone. No C and no GC.
All code modules assemble with tools/assembler.mjs. Each module uses unique
labels (prefix recommended). Native call ABI: x0..x18 scratch, x19..x21 and
x25..x28 preserved, x30 saved across calls, sp16 aligned. x22 is global data
stack cursor, x23 monotonic arena cursor, x24 monotonic value-heap cursor.
No module may repurpose x22/x23/x24. d0..d7 scratch; preserve d8..d15 if used.

## Memory

QEMU virt-8.2,cortex-a53,512MiB RAM. Image0x40200000.
Data stack0x40800000..0x40880000. Native stack top0x40c00000,
normal lower guard0x40a00000. Arena0x41000000..0x47000000 (compiler nodes,
scopes, frames, arrays' backing storage). Heap0x48000000..0x5f000000 (values,
strings, closures, numeric boxes). Exhaustion branches fatal_arena/fatal_heap/
fatal_stack/fatal_native, prints HALTED then wfi loop. No automatic reset/GC.

## Values (all 64bit)

No tagged integers in this revision. FALSE=2, TRUE=6, UNDEFINED=10, NULL=14,
ARRAY_MARK=18. Zero is the internal array-hole sentinel, never a language
value: indexed reads convert holes to UNDEFINED, while string conversion
treats holes as absent elements. Aligned pointer objects at other addresses:
- String kind1: +0 kind, +8 UTF16-code-unit length, +16 inline UTF16LE units,
  trailing zero16. Native ASCII literals may use generated typed string data.
- Closure kind2 (32 bytes): +0 kind, +8 template pointer, +16 captured frame
  pointer, +24 extra-properties list pointer (initially zero).
- Array kind3: +0 kind, +8 length (raw uint32), +16 capacity raw,
  +24 backing pointer to value cells, +32 extra-properties list pointer.
- Number kind4: +0 kind, +8 IEEE754 binary64 bits.

Array/closure property entries are 24 arena bytes: next pointer, UTF16 string
key, value. Zero terminates a property list. Array backing cells distinguish
holes (zero) from explicit UNDEFINED (10), including after length changes.

All JavaScript numeric operations use binary64, including literals. Primitive
values are immutable; array/closure identity is pointer identity. Undefined
and null remain distinct. `nil` comes from the upstream empty-function prelude.

## Shared helpers (root provides values.s/platform.s/primitives.s)

- arena_alloc(x0 bytes)->x0 ptr; heap_alloc(x0 bytes)->x0 ptr, align8.
- value_push(x0 value); value_pop()->x0 value (empty ->UNDEFINED like JS.pop).
- uart_putc(x0 byte), uart_getc()->x0 byte, puts(x0 raw UTF8 NUL ptr), newline.
- string_new(x0 raw UTF16 ptr,x1 length)->x0 str; string_from_utf8(x0 ptr,x1
  byteLength)->x0 str; string_to_utf8/print_value; string_equal(x0,x1)->x0 0/1.
- string_concat(x0 str,x1 str)->x0 str; value_to_string(x0 value)->x0 str.
- value_to_number(x0 value)->d0, coercions incl strings/booleans/null/undefined.
- value_truthy(x0 value)->x0 native0/1; value_equal(x0,x1)->x0 native0/1 strict.
- number_box(d0)->x0 Number; number_from_int(x0 signed native)->x0 Number.
- array_new(x0 length)->x0 array initialized with holes; array_get(x0 arr,x1
  value index/key)->x0 value; array_set(x0 arr,x1 key,x2 value); array_append.
- runtime_error(x0 raw UTF8 message)->never (prints, recovers top REPL).
- fatal_* ->never (prints, halts; host reboot needed).
- primitive_table generated static pairs of string-object name/native handler,
  followed by zero pair. Primitive handlers take no args, operate data stack,
  preserve ABI, may call runtime_call. Table excludes compiler-special words.

## Numeric library (numbers.s, independent agent)

- number_parse(x0 string,x1 mode)->d0. mode0 Number.parseFloat semantics:
  whitespace/sign, decimal prefix/exponent/Infinity, NaN if no numeric prefix.
  mode1 Number conversion: whole trimmed string, empty ->0, hex/bin/oct prefixes.
- number_format(d0)->x0 UTF16 string with JS Number.toString formatting:
  shortest roundtrippable decimal, special values, exponent rules; -0 ->"0".
- number_pow(d0 base,d1 exponent)->d0 JS Math.pow semantics.
- number_mod(d0 dividend,d1 divisor)->d0 JS remainder, incl signs/NaN/Infinity.
- root number_box/value conversion helpers can be called; string_new available.
- Numeric code can use generated constants/tables in numbers-data.s via JS
  tools if useful; no host services, C, libc or guest semihosting.

## Compiler/VM (core.s, independent agent)

Static cells supplied by core: compiler_scope, global_scope, current_frame,
compiler_input (str), compiler_index (raw UTF16 offset), compiler_builder,
outer_builder, throw_pending, throw_value, repl_saved_sp.

- core_init(): initialize global/compiler scope and populate primitive_table
  plus compiler-special words. Does not load prelude.
- t0_eval(x0 sourceString): equivalent scope.eval$, preserving prior input/ip
  and builder. Uses current compiler_scope, immediate sink for each token.
- core_compile_source(x0 sourceString): preserves prior input/ip while
  compiling into the current builder and scope; builder zero executes
  immediately. Used by the native `js{ ... }js` adapter.
- compile_symbol(x0 symbolString): compile in current scope/builder (builder0
  means execute pushed instruction immediately).
- runtime_call(x0 closure): invoke with lexical frame, restore caller, handle
  matching return name; nonmatching throws propagate via throw_pending.
- execute_code(x0 firstNode): execute ordered instructions, return on throw.

Instruction node32bytes: handler,arg1,arg2,next. Handler called with x0=node.
Builder24: head,tail,templateBacklink (zero until a block template exists).
Appending the first node updates a captured empty template through this
backlink, preserving later `emit` behavior. Compiler binding lookup preserves
early binding of known names and emits late lookup for unknown names.
Compiler scope32: parent,entryHead,ownInput,ownIndex. ownInput zero inherits
from the parent; ownIndex -1 inherits. A global scope initially owns
UNDEFINED input and index zero. Reading tokens stores an own index, while
source evaluation stores/restores own input and index. `core_scope_refresh`
mirrors the active scope's inherited state to compiler_input/compiler_index;
`??` uses it when switching scopes. Binding entry48:
next,name,kind,arg1,arg2,ownerScope. Kinds: 1 native handler, 2 constant
(arg2 auto-call flag), 3 local (arg1 slot, arg2 mode), 4 named return, 5 compiler
handler. Local modes: 0 read, 1 write, 2 increment, 3 decrement. These details
are core-owned; other modules should use the exported lookup/define helpers.
Closure template48: codehead,paramCount,slotCount,nameString,sourceString,
compileScope. Frame `(slotCount+1)*8`: parentFrame followed by slots (args in
reverse order, uninitialized locals UNDEFINED). Locals resolved by compile
scope depth/slot. Named returns match names as upstream; preserve stack.

Compiler-special words include `{`, `switch`, `i[`, `emit`, quotes/comments,
`??`, `js{`; definitions :/::, name:, .methods, lexical increments/decrements,
constant semicolon/const and captured input_/ip_ handled as required upstream.
Compiler must preserve exact JS-closure-array op boundaries for switch keys
and compile-time evaluation. A switch pair uses one emitted op for key and
one for result, including arbitrary op-count behavior matching upstream.
Switch descriptors are 32 bytes: pairHead,initialDefault,pairCount,builder.
Pair entries are 24 bytes: keyValue,resultNode,nextPair. Runtime fallback
reads the live builder tail so later `emit` additions remain visible.

Compiler-facing runtime helpers exported by core: core_define(x0 nameStr,
x1 value,x2 autoCall0/1) at current compiler scope (fresh binding replacing
entry); core_lookup(x0 name)->entry or0; core_dynamic_lookup(x0 name) execute
binding in immediate sink. Root const/semicolon may use core_define.
Additional helpers: core_read_symbol()->UTF16 string (empty at EOF),
core_read_char()->UTF16 unit or -1, core_emit(x0 handler,x1 arg1,x2 arg2)->node,
core_compile_entry(x0 binding), core_execute_one(x0 node), core_scope_refresh().

Strings are UTF16 throughout compiler (input_ original text, ip_ unit offset).
Quoted strings preserve upstream whitespace consumption. The `js{ ... }js`
compiler adapter requires the loaded guest `jsCompile` word. It reads through
a whitespace-delimited `}js`, calls that T0 compiler, validates its string
result, then compiles the generated T0 in the caller's scope and builder.
This intentionally repairs the upstream hook's compile-time execution bug:
inside a function, generated operations run when the function is invoked and
local references capture its compile scope. Missing terminators, missing
language modules, and rejected source invoke runtime_error. No host parser or
host evaluation participates in guest compilation.

## Responsibility split

Root: values, primitives, platform, boot/build/REPLs, integration/QA.
Compiler agent: core.s only + focused core tests if necessary, ABI proposals
communicated before interface changes.
Numbers agent: numbers.s + data generator/tests only.
Parser agent: upstream libraries, adaptations, oracle/conformance cases.
