# Upstream-derived JS-like language

Load `parsers.t0`, then `jsparser.t0`, then `js-repl.t0` into T0. The first
file defines parser combinators; the second defines `FormulaParser` and
`FormulaCompiler`; the last adds the terminal adapters:

- `jsCompile` consumes a source string and returns compiled T0 text, or `false`
  if the whole input was not accepted. It does not execute a valid prefix of
  an invalid line.
- `jsEval` consumes a source string, compiles it, and evaluates the resulting
  T0 text. Invalid input prints `Error: invalid JS-like source` without running
  the prefix. The empty program and comment-only programs are valid.

For example:

```text
" 1.5 + 2.25" jsEval print
" i=0; while(i<3)i++; i" jsEval print
" [1,[2,3]][1][0]" jsCompile print
```

The corresponding results are `3.75`, `3`, and compiled T0 source. T0's data
stack persists. Top-level expression statements and loop bodies can leave multiple
values; a terminal frontend can display the newest top value when the stack
grows. `jsEval` does not discard earlier values or impose ECMAScript statement
completion rules. Function calls have a separate, isolated return contract described below.

The native T0 compiler also accepts `js{ ... }js` after these modules are
loaded. Both delimiters must be separate whitespace-delimited T0 tokens:

```text
js{ 1 + 2 * 3 }js print
{ x | js{ x * x + 1 }js } :squarePlusOne
4 squarePlusOne () print
```

The results are `7` and `17`. The adapter calls the guest's `jsCompile`, then
compiles the resulting T0 into the current function and lexical scope. This
repairs the original `jsparser.js` hook, which ignored its destination code
array and evaluated generated code immediately during compilation. Native
function bodies therefore retain local-variable access and defer side effects
until invocation. The correction is tested against the pinned core with a
corresponding reference adapter; it is not claimed as unchanged upstream
`js{ ... }js` timing.

## Origin and scope

The implementation is derived from Kevin Greer's
[TURTLES revision 217cb43d7a16a98abd3e9984d1fc0416f8898d98](https://github.com/kgrgreer/TURTLES/tree/217cb43d7a16a98abd3e9984d1fc0416f8898d98).
Complete, unchanged originals are in `vendor/upstream`. `parsers.t0` is the
evaluated contents of the original `parsers.js` template literal. The starting
point for `jsparser.t0` is the evaluated first `jsparser.js` template literal,
ending before `'startCommentTest print`. The extraction evaluates JavaScript
template-string escapes; it does not copy escaped source bytes verbatim.

The original demo expressions, verbose `jsEval` demonstration wrapper, and
JavaScript implementation of `js{ ... }js` are omitted from the clean library.
The native compiler supplies the corrected `js{ ... }js` bridge described above.
The separate `js-repl.t0` adapter replaces the demo wrapper. The parser and
compiler still execute as T0 code in the target; the host does not compile
user input for the guest.

Upstream calls this a subset of a JavaScript-like language. Its
[README](https://github.com/kgrgreer/TURTLES/blob/217cb43d7a16a98abd3e9984d1fc0416f8898d98/README.md#L30-L40)
describes **T1 as a future SOM-derived language**, and T2 as a later axiom-based
language. Calling this existing JS-like frontend a completed T1 would therefore
be inaccurate. `som.js` is preserved as another upstream reference, but is not
part of this frontend's boot library.

The parser combinators and language compiler are self-hosted in T0. The T0
primitive core, ARM runtime, image builder, and assembler are not thereby
self-hosted. This frontend emits T0 source, not native ARM machine code.

## Intentional frontend repairs

These changes apply to the extracted language library. The pinned `t0.js`
reference remains unchanged. They are not claims about original upstream
behavior or about full ECMAScript compatibility.

| Area | Upstream issue | Adaptation |
| --- | --- | --- |
| End of input | `range` can accept the EOF `null` as a digit through JS comparison coercion; `notChars` also accepts EOF and can loop forever. | Require a string character before `inRange`, `notChars`, and `anyChar` match. |
| Token boundaries | Character-level automatic whitespace skipping can merge `1 2` into `12` or `a b` into `ab`. | Enable the existing `tok` wrapper for literal matching and wrap entire numeric and identifier tokens. |
| Delimited lists | The absent final optional element contributes a `false` placeholder, so an empty array compiles with an element and an empty statement list compiles `false`. | Omit the absent optional tail. The original optional-parser protocol still uses false for absence. |
| Statement separators | An expression statement consumes `;` and the enclosing statement list also expects `;`. | Consume a simple statement separator once. Blocks, conditionals, loops, and function declarations may be followed by another statement without an extra semicolon; an optional semicolon remains accepted. |
| Parser fields | `name: value ;` writes global names under the pinned core and construction overwrites primitive `if` and `while`. | Use actual lexical `:name` setters for parser fields. |
| Frame allocation workaround | Upstream reserves only parameter slots at call entry. Calls during early local initializers can allocate captured frames that later local stores overwrite. | Initialize all parser field slots to false before performing any initializer calls. This avoids relying on the core's frame-aliasing bug. |
| Mutable JS-like variables | T0 compiles already-known globals into captured values, so an ordinary compiled loop never sees later global assignment. | Emit `'name ??` for variable reads, keeping assignments as `:name`. Prefix/postfix increment and decrement use these same reads/setters. |
| Numeric syntax | The original grammar accepts only digits. | Extend that grammar with decimal points, signed exponents, and unary minus. A leading decimal point is normalized to `0.` because T0 treats tokens beginning with `.` as method sends. |
| Operators | `%` emits T0's unary percent operator; arithmetic/comparison chains associate to the right. | Map `%` to `mod`; fold arithmetic, equality, and comparison chains to the left. Exponentiation retains right association. |
| Literal typos | `'z'` includes a trailing apostrophe; `':` is parsed by T0's name-colon rule instead of representing a colon character. | Use `'z` and the quoted string `" :"`. |
| Complete input | `parse$` discards the final parser-stream position and accepts prefixes. | `jsCompile` checks the final position against the full input length. A terminating newline allows a final `//` comment to finish. |

## Functions and lexical variables

Functions are an extension of the upstream frontend. Their parser, statement
nodes, scope analysis, and T0 emission are all implemented in `jsparser.t0`.
No host JavaScript parser or evaluator compiles guest input.

```javascript
function square(x) { return x * x; }
square(9)

function counter(start) {
  let n = start;
  return function() { n = n + 1; return n; };
}
let next = counter(40);
[next(), next()]

function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
factorial(6)

(x => y => x + y)(40)(2)
[ x => x + 1, x => x * 2 ][1](21)
```

These produce `81`, `[41, 42]`, `720`, `42`, and `42`. Use the terminal's
`:paste` / `:end` protocol for multiline definitions, or enter each complete
program on one line. Ordinary function declarations, anonymous function
expressions, private named function expressions, expression arrows, and block
arrows are supported. Function values can be stored in arrays, passed as
arguments, returned, and called through any supported call/index chain.

A call evaluates its callee first and arguments from left to right. The emitted
function takes one hidden argument array: missing parameters read `undefined`,
extra arguments are evaluated and then ignored, and no argument consumes an
unrelated T0 operand. A named T0 return block handles early `return` through
nested branches and loops. Every call leaves exactly one result; falling off
the end or using bare `return` yields `undefined`. Function expression
statements discard their temporary values, and an array boundary isolates the
result from the caller's data stack. Top-level statement stack behavior remains
unchanged.

`let` is deliberately **function scoped**, initialized to `undefined` at call
entry, and has **no temporal dead zone**. The T0 compiler walks statement nodes
to reserve local cells before creating body closures, so mutable captures and
captures of later declarations work. A declaration's initializer still runs
where it appears. Local function declaration bindings are reserved in the same
way, but their function values are installed when execution reaches the
declaration; calling a declaration before that point is not supported.
Top-level `let` defines a persistent dictionary binding without leaving the
initializer on the data stack. `const` is unsupported and rejected.

Generated primitive instructions use private aliases so parameters such as
`dup`, `swap`, or `mod` cannot replace compiler machinery. Identifiers that
collide with upstream interpreter metadata (`input`, `ip`, `readChar`,
`readSym`, `match`, `evalSym`, `parseFloat_`, and `__proto__`) receive private
T0 names. Ordinary identifiers retain the existing T0 lexical embedding behavior.
The `$` character is reserved for compiler-generated names and is not accepted
in source identifiers.

## Dialect boundaries

This grammar supports numeric/boolean/undefined expressions, assignment,
identifier reads, arrays and indexing, `if`/`else`, `while`, blocks,
prefix/postfix increment/decrement, line comments, `let`, functions, calls,
returns, and arrows. It remains a JS-like language rather than a full
ECMAScript implementation.

It does not implement objects, JS string literals, properties, `this`,
`arguments`, constructors, classes, default/rest/destructured parameters,
spread calls, `const`, strict-equality operators, or ECMAScript's object and
coercion model. Arrows share the supported positional-parameter/lexical-capture
semantics of ordinary functions; ECMAScript's `this` and `arguments` differences
are outside this dialect. Function declarations are not value-hoisted, `let`
is not block scoped, and JavaScript automatic semicolon insertion is not
implemented. Use explicit separators between simple statements.

Existing `==` maps to T0's strict `=`. Branch and ternary grammar follows the
upstream dialect (for example `if(true) 1 else 2`); it does not implement all
ECMAScript ternary-nesting rules. Unary minus binds as an operand of
exponentiation in this dialect. T0 `&&`/`||` semantics are retained, including
their boolean short-circuit results. The generated code shares T0's dictionary;
the native primitive core and raw T0 namespace remain accessible from raw T0.

## Oracle and verification

`test/reference.mjs` exports:

```js
runReference(t0Source, { loadParsers: true })
runReference(t0Source, { loadJS: true })
createReference({ loadJS: true }) // evaluate, compileJS, evaluateJS, snapshot
runJSReference(['answer=40', 'answer+2'])
```

The core is always the unmodified pinned JavaScript implementation. `loadJS`
loads all three adapted library files. `compileJS` returns T0 text or false;
`evaluateJS` includes the generated text, acceptance result, printed output,
and complete normalized stack. Multiple sources passed to `runJSReference`
share state, matching a REPL. Compiler forward-reference warnings are kept
separate from printed output.

Run `node --test test/parser-reference.test.mjs` for the language oracle checks,
including functions, arrows, the documented `let` behavior, malformed sources,
and parser integration/provenance. `node test/functions-native.mjs` independently
compares function fixture expectations with ECMAScript, the pinned T0 core
running this compiler, and the actual ARM guest. It also seeds an unrelated
caller operand and verifies complete stack isolation, argument evaluation order,
mutable captures, recursion, returns, and generated-name hygiene. Only the
shared supported behavior is compared to ECMAScript; the documented dialect
differences have separate tests.
