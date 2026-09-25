scope.eval$(`// Early-bound generated instructions cannot be shadowed by JS variable names.
{ | dup } ::__js$dup
{ | drop } ::__js$drop
{ | swap } ::__js$swap
{ | len } ::__js$len
{ | neg } ::__js$neg
{ | mod } ::__js$mod
{ | if } ::__js$if
{ | ifelse } ::__js$ifelse
{ | while } ::__js$while



{ l op r |
  { o | [ l o .call [ op r o .call ] seq opt ] seq }
} ::binary // binary operator, ie. expr +/0 expr13

{ operand op |
  { o | [ operand o .call [ op operand o .call ] seq star ] seq }
} ::leftBinary

{ v |
  v 0 @
  v 1 @ { | "  " v 1 @ 1 @ "  " v 1 @ 0 @ +$ +$ +$ +$ } if
} :infix // convert an infix operator to postfix

{ v |
  v 0 @
  v 1 @ { part | "  " part 1 @ "  " part 0 @ +$ +$ +$ +$ } do
} :leftInfix

{ a | a { v | v } filter join } ::joinPresent


// Keywords must end at an identifier boundary. The outer tok disables whitespace
// skipping during the boundary check, then restores the grammar's ignore parser.
{ word |
  [ word lit [ '_ lit 'a 'z range 'A 'Z range '0 '9 range ] alt notp ] 0 seq1 tok
} ::jsKeyword

{ name |
  [ 'input 'ip 'readChar 'readSym 'match 'evalSym 'parseFloat_ '__proto__ ]
    name indexOf$ -1 >
    { | " __js$user$" name +$ }
    { | name }
  ifelse
} ::__js$name

// Statement nodes keep lexical declaration discovery in T0. Expressions remain
// generated T0 strings; nested function bodies own their separate local scope.
{ node |
  node 0 @ switch$
    'let { | node 1 @ }
    'function { | node 1 @ }
    'block { | node 1 @ { child | child __js$jsCollectLocals } do }
    'if { | node 2 @ __js$jsCollectLocals node 3 @ { | node 3 @ __js$jsCollectLocals } if }
    'while { | node 2 @ __js$jsCollectLocals }
    { | }
  end ()
} ::__js$jsCollectLocals

{ node inside |
  node 0 @ switch$
    'return { | inside }
    'block { | node 1 @ true { child | child inside __js$jsValidStatement & } reduce }
    'if { | node 2 @ inside __js$jsValidStatement node 3 @ { | node 3 @ inside __js$jsValidStatement & } if }
    'while { | node 2 @ inside __js$jsValidStatement }
    { | true }
  end ()
} ::__js$jsValidStatement

{ nodes inside | nodes " " { child | "  " child inside __js$jsEmitStatement +$ +$ } reduce } ::__js$jsEmitStatements

{ params body ownName let false :locals false :code |
  [ body __js$jsCollectLocals ] :locals
  [
    " { __js$args | [ { :__js$return let "
    locals { name | "  [ ] 0 @ :" name +$ } map join
    params { name | "  [ ] 0 @ :" name +$ } map join
    "  | "
    // All slots exist before any parameter expression or body closure is made.
    0 params len 1 - { i | [ "  __js$args " i >$ "  @ :" params i @ ] join } for
    body true __js$jsEmitStatement
    "  [ ] 0 @ } () ] __js$dup __js$len 1 - @ }"
  ] join :code
  ownName
    { | [ " { let [ ] 0 @ :" ownName "  | " code "  __js$dup :" ownName "  } ()" ] join }
    { | code }
  ifelse
} ::__js$jsEmitFunction

{ node inside |
  node 0 @ switch$
    'expr { | node 1 @ inside { | "  __js$drop" +$ } if }
    'block { | node 1 @ inside __js$jsEmitStatements }
    'let { | [ node 2 @ { | node 2 @ } { | " [ ] 0 @" } ifelse "  :" node 1 @ ] join }
    'return { | [ node 1 @ { | node 1 @ } { | " [ ] 0 @" } ifelse "  __js$return<-" ] join }
    'function { | [ node 2 @ node 3 @ false __js$jsEmitFunction "  :" node 1 @ ] join }
    'if { | [
      node 1 @ "  { | " node 2 @ inside __js$jsEmitStatement "  }"
      node 3 @
        { | "  { | " node 3 @ inside __js$jsEmitStatement "  } __js$ifelse " }
        { | "  __js$if " }
      ifelse
    ] join }
    'while { | [ "  { | " node 1 @ "  } { | " node 2 @ inside __js$jsEmitStatement "  } __js$while " ] join }
    { | " " }
  end ()
} ::__js$jsEmitStatement

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_Precedence

// Just a Parser, validates but has no semantic actions
{ let
  false :parse$
  false :call
  false :start
  false :stmt
  false :simpleStmt
  false :compoundStmt
  false :exprStatement
  false :letStmt
  false :returnStmt
  false :functionDecl
  false :functionExpr
  false :arrow
  false :arrowParams
  false :arrowBody
  false :params
  false :postfix
  false :indexPart
  false :callPart
  false :undefined
  false :if
  false :while
  false :block
  false :stmts
  false :equality
  false :inequality
  false :and
  false :or
  false :ternary
  false :assignment
  false :expr
  false :expr2
  false :expr3
  false :expr4
  false :expr5
  false :expr8
  false :expr9
  false :expr10
  false :expr11
  false :expr12
  false :expr13
  false :expr14
  false :expr15
  false :postIncrement
  false :expr16
  false :expr17
  false :expr18
  false :notPrefix
  false :unaryMinus
  false :iPrefix
  false :group
  false :numberBase
  false :exponent
  false :number
  false :digit
  false :bool
  false :array
  false :space
  false :comment
  false :ignore
  false :lhs
  false :variable
|
  { s o | s 0 nil o .ignore PStream [ o .ignore opt o .start ] 1 seq1 () .value } :parse$
  { m o | o m o () () } :call
  { o | o .stmts } :start
  { o | [ o .compoundStmt o .simpleStmt ] alt } :stmt
  { o | [ o .letStmt o .returnStmt o .exprStatement ] alt } :simpleStmt
  { o | [ o .functionDecl o .if o .while o .block ] alt } :compoundStmt
  { o | o .expr } :exprStatement
  { o | [ 'let jsKeyword o .lhs [ '= lit o .expr ] 1 seq1 opt ] seq } :letStmt
  { o | [ 'return jsKeyword o .expr opt ] seq } :returnStmt
  { o | [ 'function jsKeyword o .lhs '( lit o .params ') lit o .block ] seq } :functionDecl
  { o | [ 'function jsKeyword o .lhs opt '( lit o .params ') lit o .block ] seq } :functionExpr
  { o | o .lhs ', lit delim } :params
  { o | [ o .arrowParams '=> lit o .arrowBody ] seq } :arrow
  { o | [ [ '( lit o .params ') lit ] 1 seq1 o .lhs { name | [ name ] } mapp ] alt } :arrowParams
  { o | [ o .block o .expr ] alt } :arrowBody
  { o | [ 'if jsKeyword '( lit o .expr ') lit o .stmt [ '; lit opt 'else jsKeyword o .stmt ] 2 seq1 opt ] seq } :if
  { o | [ 'while jsKeyword '( lit o .expr ') lit o .stmt ] seq } :while
  { o | [ '{ lit o .stmts '} lit ] 1 seq1 } :block
  { o | [
    [ [ o .compoundStmt '; lit opt ] 0 seq1 [ o .simpleStmt '; lit ] 0 seq1 ] alt star
    o .simpleStmt opt
  ] seq { a | [ a 0 @ { child | child } do a 1 @ { | a 1 @ } __js$if ] } mapp } :stmts
  [ '== '= litMap '!= lit ] alt :equality
  [ '<= lit '< lit '>= lit '> lit ] alt :inequality
  '&& lit :and
  '|| lit :or
  { o | [ o .expr3 [ '? lit o .expr3 " :" lit o .expr3 ] seq opt ] seq } :ternary
  { o | [ o .lhs '= lit o .expr ] seq } :assignment
  { o | o .expr2 } :expr
  { o | [ o .assignment o .arrow o .ternary o .expr3 ] alt } :expr2
  'expr4 or 'expr3 binary :expr3
  'expr5 and 'expr4 binary :expr4
  { o | o .expr8 } :expr5
  'expr9 equality leftBinary :expr8
  'expr10 inequality leftBinary :expr9
  { o | o .expr11 } :expr10
  'expr12 '+- anyChar leftBinary :expr11
  'expr13 [ '*/ anyChar '% '__js$mod litMap ] alt leftBinary :expr12
  'expr14 '** '^ litMap 'expr13 binary :expr13
  { o | [ o .notPrefix o .iPrefix o .unaryMinus o .expr15 ] alt } :expr14
  { o | [ o .postIncrement o .expr16 ] alt } :expr15
  { o | [ o .lhs [ '++ lit '-- lit ] alt ] seq } :postIncrement
  { o | o .expr17 } :expr16
  { o | [ o .expr18 o .postfix star ] seq } :expr17
  { o | [ o .indexPart o .callPart ] alt } :postfix
  { o | [ '[ lit o .expr '] lit ] 1 seq1 } :indexPart
  { o | [ '( lit o .expr ', lit delim ') lit ] 1 seq1 } :callPart
  { o | [ o .functionExpr o .undefined o .variable o .number o .bool o .group o .array ] alt } :expr18
  { o | 'undefined jsKeyword } :undefined
  { o | [ '! lit o .expr15 ] 1 seq1 } :notPrefix
  { o | [ '- lit o .expr14 ] 1 seq1 } :unaryMinus
  { o | [ [ '-- lit '++ lit ] alt o .lhs ] seq } :iPrefix
  { o | [ '( lit o .expr ') lit ] 1 seq1 } :group
  { o | [
    [ o .digit plus &join mapp [ '. lit o .digit star &join mapp ] seq &join mapp opt ] seq &joinPresent mapp
    [ '. lit o .digit plus &join mapp ] seq { a | " 0" a join +$ } mapp
  ] alt } :numberBase
  { o | [ [ 'e lit 'E lit ] alt '+- anyChar opt o .digit plus &join mapp ] seq &joinPresent mapp } :exponent
  { o | [ o .numberBase o .exponent opt ] seq &joinPresent mapp tok } :number
  { o | '0 '9 range } :digit
  { o | [ 'true jsKeyword 'false jsKeyword ] alt } :bool
  { o | [ '[ lit o .expr ', lit delim '] lit ] 1 seq1 } :array
  { o | [ tab lit cr lit nl lit "  " lit ] alt plus } :space
  { o | [ " //" lit nl notChars star nl lit ] seq } :comment
  { o | [ o .space  o .comment ] alt plus tok } :ignore
  { o | [
    [ 'function 'return 'let 'const 'if 'else 'while 'true 'false 'undefined ]
      { word | word jsKeyword } map alt notp
    [
      [ '_ lit 'a 'z range 'A 'Z range ] alt
      [ '_ lit 'a 'z range 'A 'Z range '0 '9 range ] alt star &join mapp
    ] seq &join mapp tok
  ] 1 seq1 } :lhs
  { o | o .lhs } :variable
  { | ?? }
} :FormulaParser

// Add semantic actions to parser to create a JS to T0 compiler
{ | { let FormulaParser () :super |
  // TODO: factor out common actions
  { m | m switch$
    'super      { m o | o m super () () () }
    'parse$     { s o | s o 'parse$ super () () false __js$jsEmitStatements }
    'if         { | m super { a | [ 'if a 2 @ a 4 @ a 5 @ ] } action }
    'while      { | m super { a | [ 'while a 2 @ a 4 @ ] } action }
    'block      { | m super { a | [ 'block a ] } action }
    'exprStatement { | m super { a | [ 'expr a ] } action }
    'letStmt    { | m super { a | [ 'let a 1 @ a 2 @ ] } action }
    'returnStmt { | m super { a | [ 'return a 1 @ ] } action }
    'functionDecl { | m super { a | [ 'function a 1 @ a 3 @ a 5 @ ] } action }
    'functionExpr { | m super { a | a 3 @ a 5 @ a 1 @ __js$jsEmitFunction } action }
    'arrowBody { o | [ o .block o .expr { code | [ 'block [ [ 'return code ] ] ] } mapp ] alt }
    'arrow { | m super { a | a 0 @ a 2 @ false __js$jsEmitFunction } action }
    'undefined  { | m super { a | " [ ] 0 @" } action }
    'ternary    { | m super { a | a 1 @ { | [ a 0 @ "  { | " a 1 @ 1 @ "  } { | " a 1 @ 3 @ "  } __js$ifelse" ] join } { | a 0  @ } ifelse } action }
    'assignment { | m super { a | a 2 @ "  __js$dup :" a 0 @ +$ +$ } action }
    'expr3      { | m super { a | a 1 @ { | [ a 0 @ [ a 1 @ 0 @ " { | " a 1 @ 1 @ "  }" +$ +$ ] ] } { | a } ifelse  infix () } action }
    'expr4      { | m super { a | a 1 @ { | [ a 0 @ [ a 1 @ 0 @ " { | " a 1 @ 1 @ "  }" +$ +$ ] ] } { | a } ifelse  infix () } action }
    'expr8      { | m super leftInfix action }
    'expr9      { | m super leftInfix action }
    'expr11     { | m super leftInfix action }
    'expr12     { | m super leftInfix action }
    'expr13     { | m super infix action }
    'postIncrement { | m super { a | [ " '" a 0 @ "  ?? __js$dup 1 " a 1 @ '++ =$ { | '+ } { | '- } ifelse "  :" a 0 @ ] join } action }
    'indexPart  { | m super { a | [ 'index a ] } action }
    'callPart   { | m super { a | [ 'call a ] } action }
    'expr17     { | m super { a |
      a 0 @ a 1 @ { part |
        part 0 @ 'index =$
          { | "  " part 1 @ "  @" +$ +$ +$ }
          { | "  [ " part 1 @ { arg | "  " arg +$ +$ } do "  ] __js$swap ()" +$ +$ }
        ifelse
      } do
    } action }
    'notPrefix  { | m super { | "  !" +$ } action }
    'unaryMinus { | m super { a let a 0 nil false PStream super .number () :number |
      number { | number .pos a sourceLen = } &&
        { | '- a +$ } { | a "  __js$neg" +$ } ifelse
    } action }
    'iPrefix    { | m super { a | [ " '" a 1 @ "  ?? 1 " a 0 @ '++ =$ { | '+ } { | '- } ifelse "  __js$dup :" a 1 @ ] join } action }
    'lhs        { | m super &__js$name action }
    'variable   { | m super { a | " '" a "  ??" +$ +$ } action }
    'array      { | m super  { a | " [" a { e | "  " +$ e +$ } do "  ]" +$ } action }
    { | m super () () }
  end }
} () } ::FormulaCompiler
`);

scope.eval$(`// REPL adapters for the upstream-derived FormulaCompiler.
// jsCompile: source -> compiled T0 string, or false for invalid/incomplete input.
// Append a newline so a final // comment has its required line terminator.
{ source let
  source nl +$ :text
  FormulaCompiler :compiler
  false :result
|
  text 0 nil compiler .ignore PStream
  [ compiler .ignore opt compiler .start ] 1 seq1 () :result
  result
    { | result .pos text sourceLen =
      { | [ 'block result .value ] false __js$jsValidStatement
        { | result .value false __js$jsEmitStatements }
        { | false }
        ifelse }
      { | false }
      ifelse }
    { | false }
  ifelse
} ::jsCompile

// jsEval keeps T0's stack effects: expression statements can leave more than
// one value. The interactive frontend can display the newest top value.
{ source let source jsCompile :code |
  code false = !
    { | code eval }
    { | " Error: invalid JS-like source" print$ }
  ifelse
} ::jsEval
`);

// Compile embedded JS-like source into the caller's T0 builder and scope.
scope['js{'] = code => {
  var start = scope.ip, end = start, token;
  while ( (token = scope.readSym()) !== '}js' ) {
    if ( ! token ) throw new SyntaxError('Unterminated js{ block (expected }js)');
    end = scope.ip;
  }
  var source = scope.input.substring(start, end);
  stack.push(source);
  scope.eval$('jsCompile');
  var compiled = stack.pop();
  if ( compiled === false ) throw new SyntaxError('Invalid JS-like source');
  scope.compile$(compiled, code);
};
