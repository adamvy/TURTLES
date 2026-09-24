// Curated executable programs for the first native milestone. Each case runs
// in a fresh T0 environment and reports its result exclusively through print.
// These are deliberately separate from the unfinished upstream demonstration
// suite; passing them does not imply complete T0 compatibility.
export const cases = [
  {
    name: 'integer arithmetic',
    source: '7 5 + print 7 5 - print 7 5 * print 36 6 / print 17 5 mod print',
    expected: ['12', '2', '35', '6', '2'],
  },
  {
    name: 'signed arithmetic',
    source: '-7 2 + print 3 8 - print -6 3 * print -18 3 / print -17 5 mod print',
    expected: ['-5', '-5', '-18', '-6', '-2'],
  },
  {
    name: 'comparisons',
    source: '2 2 = print 2 3 != print 2 3 < print 3 3 <= print 4 3 > print 4 4 >= print 4 3 = print',
    expected: ['true', 'true', 'true', 'true', 'true', 'true', 'false'],
  },
  {
    name: 'boolean operations',
    source: 'true ! print false ! print true false & print true false | print',
    expected: ['false', 'true', 'false', 'true'],
  },
  {
    name: 'data stack words',
    source: '7 dup + print 2 9 swap - print 123 drop 4 print',
    expected: ['14', '7', '4'],
  },
  {
    name: 'value definitions',
    source: '42 :answer answer print 43 :answer answer print',
    expected: ['42', '43'],
  },
  {
    name: 'constant definitions',
    source: "17 'seventeen const seventeen print",
    expected: ['17'],
  },
  {
    name: 'closure parameters',
    source: '2 5 { a b | a b - } () print 3 4 5 { a b c | a b * c + } () print',
    expected: ['-3', '17'],
  },
  {
    name: 'named closure calls',
    source: '{ x | x x * } :square 9 square () print',
    expected: ['81'],
  },
  {
    name: 'automatic closure calls and references',
    source: '{ x | x x * } ::square 9 square print 7 &square () print',
    expected: ['81', '49'],
  },
  {
    name: 'captured lexical value',
    source: '42 { a | { | a } } () :answer answer () print',
    expected: ['42'],
  },
  {
    name: 'deep lexical capture',
    source: '42 { a | { | { | a } } } () () () print',
    expected: ['42'],
  },
  {
    name: 'mutable captured state',
    source: '1 { count | { | count 1 + :count count } } () :counter counter () print counter () print',
    expected: ['2', '3'],
  },
  {
    name: 'independent closure environments',
    source: '{ count | { | count 1 + :count count } } :counter 0 counter () :a 10 counter () :b a () print b () print a () print',
    expected: ['1', '11', '2'],
  },
  {
    name: 'lexical shadowing',
    source: '1 { a | 2 { a | a print } () a print } ()',
    expected: ['2', '1'],
  },
  {
    name: 'local variables',
    source: '5 { x let x 1 + :y | x y + print y 1 + :y y print } ()',
    expected: ['11', '7'],
  },
  {
    name: 'let shadows an outer lexical variable',
    source: '5 { x | { let 7 :x | x print } () x print } ()',
    expected: ['7', '5'],
  },
  {
    name: 'if and ifelse',
    source: "true { | 'yes print } if false { | 'unexpected print } if true { | 11 } { | 22 } ifelse print false { | 11 } { | 22 } ifelse print",
    expected: ['yes', '11', '22'],
  },
  {
    name: 'while with mutable local',
    source: '{ let 0 :i 0 :sum | { | i 5 < } { | sum i + :sum i++ } while sum print i print } ()',
    expected: ['10', '5'],
  },
  {
    name: 'recursive forward reference',
    source: '{ n | n 1 <= { | 1 } { | n n 1 - fact () * } ifelse } :fact 10 fact () print',
    expected: ['3628800'],
  },
  {
    name: 'string literals and concatenation',
    source: '" hello world" print \'hello \'world + print \'hello len print',
    expected: ['hello world', 'helloworld', '5'],
  },
  {
    name: 'string indexing',
    source: "'hello 1 charAt print 'hello 'll indexOf print 65 charCode print",
    expected: ['e', '2', 'A'],
  },
  {
    name: 'array construction and mutation',
    source: '[ 1 2 3 ] :a a len print a 1 @ print 9 a 1 :@ a 1 @ print',
    expected: ['3', '2', '9'],
  },
  {
    name: 'nested arrays',
    source: '[ 1 [ 2 3 ] 4 ] 1 @ 0 @ print',
    expected: ['2'],
  },
  {
    name: 'guest source evaluation',
    source: '" 6 7 *" eval print " { x | x x * } ::square" eval 9 square print',
    expected: ['42', '81'],
  },
  {
    name: 'comments',
    source: '1 /* ignored tokens */ 2 + // ignored rest of line\nprint',
    expected: ['3'],
  },
];

// Desired compatibility beyond the initial integer-based native environment.
// These pass on the pinned JS reference; native test runners should opt in only
// after implementing the feature. Some record upstream quirks rather than a
// recommendation to keep them forever.
export const extendedCases = [
  {
    name: 'fractional arithmetic',
    source: '1 2 / print 15 % print 3.5 2 * print',
    expected: ['0.5', '0.15', '7'],
  },
  {
    name: 'numeric exponentiation',
    source: '2 8 ^ print',
    expected: ['256'],
  },
  {
    name: 'mixed string and number addition',
    source: "'answer= 42 + print",
    expected: ['answer=42'],
  },
  {
    name: 'compile-time binding of known names',
    source: '2 :x { | x } :f 3 :x f () print x print',
    expected: ['2', '3'],
  },
  {
    name: 'immediate evaluation and emit',
    source: '{ | i[ 1 2 + emit ] } () print',
    expected: ['3'],
  },
  {
    name: 'emitted closure',
    source: '{ | i[ { x | x 2 * } emit ] } :bar 3 bar () () print',
    expected: ['6'],
  },
  {
    name: 'switch dispatch',
    source: "2 switch 1 { | 'one } 2 { | 'two } { | 'other } end () print",
    expected: ['two'],
  },
  {
    name: 'lexical dictionary lookup',
    source: "{ m let 42 :a 66 :b | m ?? } :dispatch 'a dispatch () print 'b dispatch () print",
    expected: ['42', '66'],
  },
  {
    name: 'local return',
    source: '{ | 1 <- 2 } () print',
    expected: ['1'],
  },
  {
    name: 'named nonlocal return preserves stack',
    source: '{ :o | 1 { | 10 o<- 11 } () 2 } () print print',
    expected: ['10', '1'],
  },
  {
    name: 'nil is truthy upstream',
    source: 'nil { | 1 } { | 2 } ifelse print nil nil = print',
    expected: ['1', 'true'],
  },
  {
    name: 'short circuit booleans',
    source: "false { | 'unexpected print true } && print true { | 'unexpected print false } || print",
    expected: ['false', 'true'],
  },
  {
    name: 'array constructors',
    source: "3 'hello []WithValue 1 @ print 4 { i | i i * } []WithFn 3 @ print",
    expected: ['hello', '9'],
  },
  {
    name: 'higher order collection words',
    source: '[ 1 2 3 ] { v | v v * } map 0 { | + } reduce print',
    expected: ['14'],
  },
];

export const allCases = [...cases, ...extendedCases];
