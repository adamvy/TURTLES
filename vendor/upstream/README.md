# Pinned T0 JavaScript reference

Upstream: [Kevin Greer's TURTLES](https://github.com/kgrgreer/TURTLES).
Revision: `217cb43d7a16a98abd3e9984d1fc0416f8898d98` (2024-09-02).

- `t0.js` is an unmodified copy of upstream `src/t0.js`.
- `tests.js` is an unmodified copy of upstream `src/tests.js`, retained as
  documentation and examples. It is not our automated acceptance suite.
- `parsers.js`, `jsparser.js`, `parsetests.js`, `som.js`, `SOMTests.js`, and
  `index.html` are complete, unmodified copies from upstream `src/`.
- `PROJECT_README.md` and `SOURCE_README.md` preserve the original root and
  `src/` READMEs respectively. This file is local provenance documentation.
- `LICENSE` is the upstream Apache License, Version 2.0. Keep this license and
  the upstream attribution when redistributing these files.

The original project describes T0 as the lowest-level stack language for its
language-building environment, with lexical scope and closures. Its JavaScript
implementation compiles T0 source into arrays of JavaScript function objects,
not ARM instructions or a portable bytecode image. The host engine supplies
numbers, strings, arrays, function calls, exceptions, and garbage collection.
T0 activation frames themselves are retained in an ever-growing JavaScript
array. There is no existing ARM runtime to extract from this reference.

The native bootstrap uses this code as a behavioral oracle. It does not compile
or execute C, and no JavaScript engine is present in the guest.

The adapted, demo-free parser/compiler sources in `language/` are intentionally
separate from these originals. See `language/README.md` for each frontend fix,
the full-input REPL adapter, and the distinction between a JS-like frontend,
upstream's planned SOM-derived T1, and complete self-hosting.

## Semantic details that affect a port

Source links below are pinned to the revision above.

- [Dictionary and token evaluation](https://github.com/kgrgreer/TURTLES/blob/217cb43d7a16a98abd3e9984d1fc0416f8898d98/src/t0.js#L25-L63):
  `:name` binds a value; `::name` binds an automatically called closure and an
  `&name` reference. Already-known names are bound when a block is compiled;
  unresolved names are looked up later. For example,
  `2 :x { | x } :f 3 :x f () print x print` prints `2`, then `3` upstream.
  A native implementation that interprets stored block source at call time
  instead will print `3`, then `3`; the current compiler/VM preserves the original early binding.
- [Lexical frames and closures](https://github.com/kgrgreer/TURTLES/blob/217cb43d7a16a98abd3e9984d1fc0416f8898d98/src/t0.js#L65-L123):
  parameters consume stack values in reverse order; closure environments retain
  mutable variable slots and a parent link. Call frames cannot simply be
  discarded on return when an escaping closure still refers to them.
- [Numbers and arithmetic](https://github.com/kgrgreer/TURTLES/blob/217cb43d7a16a98abd3e9984d1fc0416f8898d98/src/t0.js#L161-L207):
  upstream uses JavaScript binary64 numbers. `1 2 /` is `0.5`; `+` also performs
  JavaScript string concatenation. The current native runtime uses binary64,
  explicit coercion, exact decimal conversion and shortest-roundtrip formatting.
  The earlier integer-only bring-up has been superseded.
- [Compile-time execution](https://github.com/kgrgreer/TURTLES/blob/217cb43d7a16a98abd3e9984d1fc0416f8898d98/src/t0.js#L175-L184):
  `i[ ... ]` executes while compiling, and `emit` captures a resulting value,
  potentially including a closure. This requires more than saving source text
  if compilation is to be moved across the host/guest boundary.
- [Control and runtime lookup](https://github.com/kgrgreer/TURTLES/blob/217cb43d7a16a98abd3e9984d1fc0416f8898d98/src/t0.js#L208-L224):
  `()` calls closures, `??` retains a lexical dictionary, and `include` is a
  browser `fetch` adapter. Nonlocal returns use JavaScript exceptions.
  The current native compiler/VM implements `switch`, `??`, immediate
  compilation and named returns; embedded `include` adapts the host helper.
- [Prelude and known issues](https://github.com/kgrgreer/TURTLES/blob/217cb43d7a16a98abd3e9984d1fc0416f8898d98/src/t0.js#L228-L280):
  useful words such as `dup`, `for`, and `map` are written in T0. `nil` is an
  empty function and is truthy, which upstream itself marks as a TODO.

## Reference validation

From the repository root:

```sh
node test/reference.mjs
node test/reference.mjs --extended
node --test test/parser-reference.test.mjs
```

The first command checks the curated core cases in `test/cases.mjs`. The second
also checks compiler features and observable upstream quirks. Every program
runs in a fresh interpreter and prints explicit results. Forward-reference
warnings are collected separately from T0 output.

The complete upstream demos are not a passing baseline: `tests.js` aborts near
the malformed functional-programming example at line 318, and the browser's
default SOM demo sequence references `repeat` although the parser library
defines `repeatp`. The curated suite makes no claim that these upstream issues
are fixed or that all JavaScript T0 behavior is covered.
