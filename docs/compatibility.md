# Compatibility contract and evidence

The semantic oracle is the unchanged pinned `vendor/upstream/t0.js` from
[TURTLES revision 217cb43d7a16a98abd3e9984d1fc0416f8898d98](https://github.com/kgrgreer/TURTLES/tree/217cb43d7a16a98abd3e9984d1fc0416f8898d98).
The native implementation covers the intended T0 language vocabulary and
prelude. Differential tests exercise the actual ARM guest; passing a host-only
oracle test is not counted as evidence of guest compatibility.

## What is covered

- Binary64 literals/arithmetic, strict equality, numeric/string comparisons,
  JS-style coercions used by the operators, infinities, NaN and signed zero.
- UTF-16 strings, both quote forms, comments, character operations, array/string
  indexing, growing arrays, holes, custom properties and cyclic formatting.
- Reversed arguments, lexical locals and mutable captures, early-bound known
  names, dynamic forward references, automatic calls and quoted references.
- `i[`/`emit`, compiler operation boundaries, `switch`, captured `??`, source
  text/index access, dot methods, `eval`, local/named returns and all original
  prelude words.
- Parser combinators and the JS-like compiler executing in T0 inside QEMU;
  complete-input rejection, per-line REPL behavior and complete resulting stacks.
- Multiline terminal input, error recovery, real ELF/raw boot and permanent
  halts for each bounded storage category.

The generated `build/full-conformance-results.json` and
`build/full-boot-transcript.txt` record the broad matrix and actual UART output.
`test/core-full.mjs` adds focused compiler regressions. The numeric harness
runs an independent machine-code image: the expanded sweep has 5,913 checks.
Parsing, formatting and remainder are exact comparisons; general finite power
allows one ULP versus Node because ECMAScript permits implementation approximation.
See [NUMBERS.md](../runtime/full/NUMBERS.md) for exact-vector evidence and limits.

These are executable coverage claims, not a mathematical equivalence proof.

## Intentional core repairs and platform adaptations

| Behavior | Native policy |
| --- | --- |
| Upstream allocates only parameters before local initializers, allowing later local stores to overwrite captured frames allocated by earlier calls. | Reserve every local slot at entry, initialized to undefined. |
| Several malformed strings/comments/blocks loop forever at EOF in upstream. | Report an error and recover to the prompt. EOF line comments terminate normally. |
| Upstream errors can leave global compiler/frame state partially switched. | Restore a valid top-level compiler state while retaining data-stack values, definitions and prior effects. |
| Host memory is ultimately managed by JavaScript/its collector. | Monotonic bounded arena/heap; exhaustion halts and requires reboot. |
| `print` writes to the browser/host console. | Convert the value and write UTF-8 through PL011 UART. |
| `include` is an asynchronous browser `fetch` helper, not an ordinary stack word. | A stack word loads named embedded T0 modules synchronously. No network/filesystem is implied. |
| `debugger` invokes a JS debugger statement. | No-op without an attached debugger, matching ordinary unattended execution. |
| JavaScript globals/prototypes are incidentally reachable through host functions/properties. | No JavaScript host-object or prototype-reflection API. Arrays and T0 closures support own custom properties; this does not expose Object/Function constructors, native JS methods or a browser. |

Primitive behavior is preserved even when surprising: empty stack pops yield
undefined; `pick` follows upstream's expression order; array construction uses
the string marker `__arrayStart__`; negative zero prints as zero; T0 short-circuit
operators return booleans on their short-circuit branch; and `eval` with a number,
boolean or zero-length object is a no-op. A T0 source file cannot rely on the
browser's JavaScript object model to reach an arbitrary JS engine in this guest.

`depth`, `clear`, `reset`, bundled `include` and the terminal paste protocol are
platform extensions. They do not imply garbage collection. Resource HALTs do
not recover on further serial input.

## Derived language repairs

The upstream JS-like frontend is unfinished: EOF matching, lexical storage,
token boundaries, list delimiters, statement separators, mutable-variable reads
and several operator/syntax details required corrections to make a reliable
REPL. The original files remain verbatim in `vendor/upstream`; every adaptation
is described in [language/README.md](../language/README.md). The same adapted T0
libraries run in both the unmodified JS core and the ARM guest for comparison.

The native `js{ ... }js` adapter emits into the caller's compiler builder;
upstream's host hook accidentally evaluates that text at compile time even
inside a function. The adapter's documented correction makes normal function
bodies and lexical variables usable. Invalid JS-like input is rejected in full.

The derived frontend now also supports named/anonymous functions, private named
function expressions, calls through values/arrays/returned closures, positional
parameters, lexical mutable captures, recursion, returns, and arrows. These are
new T0-written grammar/compiler features, not claims about the original upstream
frontend. Callee and argument evaluation order is preserved; missing arguments
are `undefined`, extra arguments are evaluated and ignored, and each call leaves
one result without consuming unrelated T0 operands. Bare/fallthrough returns
produce `undefined`; nested control flow can return from its enclosing function.

`let` is function scoped with no temporal dead zone; local cells are initialized
to `undefined` at function entry. Initializers and function declaration values
execute at their source positions. Top-level `let` creates persistent bindings.
`const`, block-scoped bindings, declaration value hoisting, `this`, `arguments`,
objects, JS string literals, classes, default/rest/destructured parameters,
spread calls, automatic semicolon insertion, and full ECMAScript coercion are
not implemented. Top-level expression statements retain the original dialect's
T0 stack effects; function statement temporaries are discarded. Generated helper
names are protected from user parameters and locals.

The supported dialect is this extended JS-like layer, not full ECMAScript or
the future SOM-derived T1. The unfinished SOM experiment is preserved as
upstream reference but is not loaded by these boot variants.

## Extent of self-hosting

The parser combinators and JS-like compiler are T0 programs that run in the
guest. The native T0 compiler creates new closures and operations after boot.
The primitive core is written in ARM assembly and the ARM assembler/packager
still runs under Node. A guest-generated replacement native boot image has
not been implemented or claimed. That is a distinct subsequent milestone.
