# Native binary64 numbers

`numbers.s` is standalone AArch64 assembly; JavaScript assembles it into the
image. It has no C, libc, semihosting, operating-system, or host-math dependency.
It follows `ABI.md` and uses only scratch `d0..d7`; all required general-purpose
callee-saved registers are preserved. `number_format` returns a normal UTF16
string through the shared string allocators. Other functions allocate no heap.

## Decimal conversion

`number_parse` implements decimal-prefix `Number.parseFloat` (mode 0) and whole
trimmed-string `Number` conversion (mode 1), including radix prefixes in mode 1,
ECMAScript whitespace, infinity, NaN, signed zero, malformed exponent rollback,
subnormals, overflow, and round-to-nearest/ties-to-even. Conversion is an exact
rational operation on three bounded 256-limb unsigned integers. It keeps 1,150
significant decimal digits and a nonzero-tail sticky bit. This exceeds the
finite decimal expansion of every binary64 rounding boundary, including the
smallest half-subnormal at 2^-1075. Larger input strings are scanned fully for
syntax, exponent scale, and the sticky bit; they do not grow scratch storage.

`number_format` expands the binary64 significand and exponent into an exact
decimal integer. It tests nearest decimal candidates at increasing precision
(1 through 17 digits) with the exact parser. Adjacent candidates are also tested
to cover the asymmetric rounding intervals at powers of two. The nearest
candidate wins, with ties resolved by even decimal coefficient. It then applies
JavaScript's fixed/scientific notation cutoffs and signs. Negative zero prints
`0`; infinities and NaN have their JavaScript spellings. This favors a small,
auditable implementation over the speed of a table-heavy Ryu implementation.

Scratch is reclaimed on return: parsing uses 3,408 bytes including saved
registers; formatting uses 4,176 bytes plus its nested parser scratch. The
formatter's only persistent allocation is the returned string.

## Remainder and power

`number_mod` computes the remainder by exact binary significand subtraction and
shifting. It does not form a rounded or overflowing floating-point quotient.
The sign follows the dividend, including signed zero; invalid combinations
return NaN.

`number_pow` implements the JavaScript special cases, integer parity for
negative bases, and fractional powers. Its finite core uses double-double
arithmetic with TwoSum/Dekker error-free transforms. After normalizing the base,
it evaluates the rapidly converging atanh series for log, multiplies by the
exponent, reduces by a split ln(2), and evaluates exp. Subnormal results receive
an explicit integer ties-to-even rounding step.

Like ECMAScript's `Math.pow`, power is implementation-approximated, as specified
by [Number::exponentiate](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-exponentiate). It is not
promised to be bit-identical to a particular JavaScript engine, nor proved
correctly rounded for every pair of binary64 inputs. Regression tests demand
exact special cases and known high-precision vectors, and permit at most one
ULP versus Node for the broad finite power sweep. Three cases in that sweep
differ by one ULP from Node; independent 150-digit Decimal calculations confirm
the native answer is correctly rounded for those cases. Decimal parsing,
formatting, and remainder do not use this approximate power path.

## Standalone QEMU checks

```
node test/numbers.mjs
NUMBER_POW=1 NUMBER_RANDOM=2000 node test/numbers.mjs
```

The test builds an independent ELF directly with the JavaScript assembler,
boots QEMU, and compares numeric bits and returned decimal strings with host
oracles. No host result is available to the running guest. Coverage includes
random binary64 bit patterns, exact halfway decimals with decisive digits
beyond position 1,150, exponent/radix syntax, minimum subnormal, normal/subnormal
boundaries, maximum finite overflow, and power special cases. Set `QEMU` to
override the executable path. Generated harness images live under
`/private/tmp/turtles-numbers`.
