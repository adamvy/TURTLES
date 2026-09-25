scope.eval$(`
{ a w let true :first | a ! { | " " <- } if a { i | i } filter { i | first { | false :first i } { | w i +$ } ifelse } map join } ::joinWith // join, space separated, removing false values
{ a | a "  " joinWith } ::joins // join, space separated, removing false values

// "translated from: https://github.com/SOM-st/SOM/blob/master/specification/SOM.g4"
{ let
  call:   { m o | o m o () () } ;
  program: { o | o .classdef plus } ;
  classdef: { o | [
    o .identifier '= lit o .superclass '( lit
      o .instanceFields
      o .method star
      [ o .Separator o .classFields opt o .method star ] seq opt
    ') lit
  ] seq } ;
  superclass: { o | o .Identifier opt } ;
  instanceFields: { o | o .fields } ;
  classFields: { o | o .fields } ;
  fields: { o | [ '| lit o .variable star '| lit ] 1 seq1 opt } ;
  method: { o | [ o .pattern '= lit [ o .STPrimitive o .methodBlock ] alt ] seq } ;
  pattern: { o | [ o .keywordPattern o .binaryPattern o .unaryPattern ] alt } ;
  unaryPattern: { o | o .unarySelector } ;
  binaryPattern: { o | [ o .binarySelector o .argument ] seq } ;
  keywordPattern: { o | [ o .keyword o .argument ] seq plus } ;
  methodBlock: { o | [ '( lit o .blockContents opt ') lit ] 1 seq1 } ;
  unarySelector: { o | [ o .identifier " :" lit notp ] 0 seq1 } ;
  binarySelector: { o | [ o .Separator notp o .OperatorSequence ] 1 seq1 } ;
  identifier: { o | o .Identifier } ;
  keyword: { o | o .Keyword } ;
  argument: { o | o .variable } ;
  blockContents: { o | [ [ '| lit o .localDefs '| lit ] 1 seq1 opt { | o .blockBody () } ] seq } ;
  localDefs: { o | o .variable star } ;
  blockBody: { o | [ { | o .blockBodyReturn () } { | o .blockBodyExpression () } ] alt } ;
  blockBodyReturn: { o |  [ '^ lit o .result ] 1 seq1 } ;
  blockBodyExpression: { o | [ { | o .expression () } [ '. lit { | o .blockBody () } opt ] 1 seq1 opt ] seq } ;
  result: { o | [ o .expression '. lit opt ] 0 seq1 } ;
  expression: { o | [ o .assignation o .evaluation ] alt } ;
  assignation: { o | [ o .assignments o .evaluation ] seq } ;
  assignments: { o | o .assignment plus } ;
  assignment: { o | [ o .variable ':= lit ] 0 seq1 } ;
  evaluation: { o | [ o .primary o .messages opt ] seq } ;
  primary: { o | [ o .variable { | o .nestedTerm () } { | o .nestedBlock () } { | o .literal () } ] alt } ;
  variable: { o | o .identifier } ;
  messages: { o | [ o .unaryMessage star o .binaryMessage star o .keywordMessage opt ] seq } ;
  unaryMessage: { o | { | o .unarySelector () } } ;
  binaryMessage: { o | [ o .binarySelector o .binaryOperand ] seq } ;
  binaryOperand: { o | [ o .primary o .unaryMessage star ] seq } ;
  keywordMessage: { o | [ o .keyword o .formula ] seq plus } ;
  formula: { o | [ o .binaryOperand { | o .binaryMessage () } star ] seq } ;
  nestedTerm: { o | [ '( lit o .expression ') lit ] 1 seq1 } ;
  literal: { o | [ o .literalArray o .literalSymbol  o .literalString  o .literalNumber ] alt } ;
  literalArray: { o | [ '# lit '( lit { | o .literal () } star ') lit ] 2 seq1 } ;
  literalNumber: { o | o .Number } ;
  literalSymbol: { o | [ '# lit [ o .string o .selector ] alt ] 1 seq1 tok } ;
  literalString: { o | o .STString } ;
  selector: { o | [ o .binarySelector o .keywordSelector o .unarySelector ] alt } ;
  keywordSelector: { o | o .KeywordSequence } ;
  string: { o | o .STString } ;
  nestedBlock: { o | [ '[ lit { | o .blockPattern () } opt { | o .blockContents () } opt '] lit ] seq } ;
  blockPattern: { o | [ o .blockArguments '| lit ] 0 seq1 } ;
  blockArguments: { o | [ " :" lit o .argument ] 1 seq1 plus } ;
//  Number: { o | [ '- lit opt o .Num plus [ '. lit o .Num plus ] seq opt ] seq tok } ;
  Number: { o | [ '- lit opt o .Num plus &join mapp [ '. lit o .Num plus &join mapp ] seq &join mapp opt ] seq { | { i | i } filter join } mapp tok } ;
  Alpha: { o | [ 'a 'z range 'A 'Z range ] alt } ;
  Num: { o | '0 '9 range } ;
  AlphaNum: { o | [ o .Alpha o .Num ] alt } ;
  Identifier: { o | [ o .Alpha o .AlphaNum star &join mapp ] seq &join mapp tok } ;
  STPrimitive: { o | 'primitive lit } ;
  Separator: { o | '- lit 4 repeat tok } ;
  OperatorSequence: { o | '~&|*/\+<>,%@-= anyChar plus &join mapp } ;
  Keyword: { o | [ o .Identifier " :" lit ] seq &join mapp tok } ;
  KeywordSequence: { o | o .Keyword plus &join mapp tok } ;
  // Javascript string escaping is causing need for extra escaping
  STStringChar: { o | [ '\\b lit '\\n lit '\\r lit '\\f lit '\\0 lit '\\' lit '\\\\ lit '' notChars ] alt } ;
  STString: { o | [ '' lit o .STStringChar star '' lit ] 1 seq1 &join mapp tok } ;
  Comment: { o | [ '" lit '" notChars star '" lit ] 1 seq1 tok } ;
  Whitespace: { o | [ tab lit cr lit nl lit "  " lit ] alt plus tok } ;
  ignore: { o | [ o .Whitespace  o .Comment ] alt plus tok } ;
  | { m | m ?? }
} ::SOMParser

`);

scope.eval$(`
// Instances and classes are selector closures; fields are captured T0 locals.
{ | { m | m switch$
  'class { self | Object }
  { self | " Error: unknown SOM message" print$ 0 }
end } } ::Object_
{ m | m switch$
  'new { self | Object_ }
  'name { self | 'Object }
  { self | " Error: unknown SOM class message" print$ 0 }
end } :Object

{ text let 0 :i false :character |
  [ { | i text len < } { |
    text i charAt :character text i nextCharPos :i
    character 92 charCode =$ i text len < & { |
      text i charAt :character text i nextCharPos :i
      character switch$
        'n { | nl } 'r { | cr } 't { | tab } 'b { | 8 charCode }
        'f { | 12 charCode } '0 { | 0 charCode } { | character }
      end ()
    } { | character } ifelse
  } while ] join
} ::__som$decode
{ text let 0 :i |
  [ " [ " { | i text len < } { |
    text i charAt 34 charCode =$ { | " 34 charCode " } { | [ 34 charCode "  " text i charAt 34 charCode "  " ] join } ifelse
    text i nextCharPos :i
  } while " ] join " ] join
} ::__som$quote

// Generate a call at compile time, with no common runtime message dispatcher.
{ selector arguments let arguments joins :args |
  arguments len 0 = { |
    selector switch$
      'value { | " ()" } 'length { | " len" } 'size { | " len" }
      'negated { | " neg" } 'not { | " !" } 'asString { | " >$" }
      'print { | " dup print" } 'printString { | " dup print$" }
      { | " ." selector +$ }
    end ()
  } { |
    selector switch$
      '+ { | args "  +" +$ } '- { | args "  -" +$ }
      '* { | args "  *" +$ } '/ { | args "  /" +$ }
      '%' { | args "  mod" +$ } " rem:" { | args "  mod" +$ }
      '< { | args "  <" +$ } '<= { | args "  <=" +$ }
      '> { | args "  >" +$ } '>= { | args "  >=" +$ }
      '= { | args "  =" +$ } '== { | args "  =" +$ }
      '~= { | args "  !=" +$ } '<> { | args "  !=" +$ }
      ', { | args "  +$" +$ }
      " at:" { | args "  1 - charAt" +$ }
      " arrayAt:" { | args "  1 - @" +$ }
      " at:put:" { | [ " { __som$r | " arguments 0 @ "  1 - " arguments 1 @ "  { __som$i __som$v | __som$v __som$r __som$i :@ __som$v } () } ()" ] join }
      " value:" { | [ " { __som$r | " args "  __som$r () } ()" ] join }
      " value:with:" { | [ " { __som$r | " args "  __som$r () } ()" ] join }
      " value:with:with:" { | [ " { __som$r | " args "  __som$r () } ()" ] join }
      " ifTrue:" { | [ " { __som$c | __som$c " args "  { | 0 } ifelse } ()" ] join }
      " ifFalse:" { | [ " { __som$c | __som$c { | 0 } " args "  ifelse } ()" ] join }
      " ifTrue:ifFalse:" { | args "  ifelse" +$ }
      { | [ " { __som$r | " args "  __som$r ." selector "  } ()" ] join }
    end ()
  } ifelse
} ::__som$message

false :__som$invalid
// Each parser action produces source text immediately, as in Kevin's compiler.
{ canReturn | { let SOMParser :super |
  { m | m switch$
    'methodBlock { o | [ '( lit true __som$compiler .blockContents opt ') lit ] 1 seq1 { body | body { | body } { | '0 } ifelse } mapp }
    'nestedBlock { o | [ '[ lit o .blockPattern opt false __som$compiler .blockContents opt '] lit ] seq { a | [ " { " a 1 @ { | a 1 @ joins } { | " " } ifelse "  | " a 2 @ { | a 2 @ } { | '0 } ifelse "  } " ] join } mapp }
    'method { | m super { a | [ "  " 34 charCode "  " a 0 @ 0 @ 34 charCode "  { :--- " a 0 @ 1 @ "  self | " a 2 @ "  drop self } " ] join } action }
    'STPrimitive { | m super { a | true :__som$invalid '0 } action }
    'Number { | m super { a | a '. $indexOf -1 > { | true :__som$invalid } if a } action }
    'blockContents { | m super { a | a 0 @ { | [ " { let " a 0 @ { name | " 0 :" name +$ } map joins "  | " a 1 @ "  } ()" ] join } { | a 1 @ } ifelse } action }
    'blockBodyReturn { | m super { a | canReturn { | a "  ---<-" +$ } { | true :__som$invalid '0 } ifelse } action }
    'blockBodyExpression { | m super { a | a 1 @ { | [ a 0 @ "  drop " a 1 @ ] join } { | a 0 @ } ifelse } action }
    'formula { | m super { a | [ a 0 @ a 1 @ { part | part 0 @ [ part 1 @ ] __som$message } map joins ] joins } action }
    'binaryOperand { | m super { a | [ a 0 @ a 1 @ { selector | selector [ ] __som$message } map joins ] joins } action }
    'keywordMessage { | m super { parts | [ parts { part | part 0 @ } map join parts { part | part 1 @ } map ] } action }
    'messages { | m super { a | [
      a 0 @ { selector | selector [ ] __som$message } map joins
      a 1 @ { part | part 0 @ [ part 1 @ ] __som$message } map joins
      a 2 @ { | a 2 @ 0 @ a 2 @ 1 @ __som$message } { | " " } ifelse
    ] joins } action }
    'evaluation { | m super { a | a joins } action }
    'unaryPattern { | m super { a | [ a " " ] } action }
    'binaryPattern { | m super { a | a } action }
    'keywordPattern { | m super { a | [ a { part | part 0 @ } map join a { part | part 1 @ } map joins ] } action }
    'assignation { | m super { a | [ a 1 @ "  " a 0 @ { name | "  dup :" name +$ } map joins ] join } action }
    'fields { | m super { a | a { | a { name | "  0 :" name +$ } map joins } { | " " } ifelse } action }
    'STString { | m super { a | a __som$decode __som$quote } action }
    'literalSymbol { o | [ '# lit [ o .string o .selector { name | name __som$quote } mapp ] alt ] 1 seq1 tok }
    'literalArray { | m super { a | [ " [ " a joins "  ] " ] join } action }
    'superclass { | m super { a | a { | a } { | 'Object } ifelse } action }
    'program { | m super { a | a nl joinWith } action }
    'classdef { | m super { a let
      name_: a 0 @ ; superName_: a 2 @ ; instanceFields_: a 4 @ ; methods_: a 5 @ ;
      classFields_: a 6 @ { | a 6 @ 1 @ } { | " " } ifelse ;
      classMethods_: a 6 @ { | a 6 @ 2 @ } { | [ ] } ifelse ;
    | [
      " { | { let " instanceFields_ "  " superName_ " _ :super | { m | m switch$ "
      " 'class { self | " name_ "  } " methods_ nl joinWith
      "  { | m super () () } end } } () } ::" name_ " _ "
      " { let " classFields_ "  " superName_ "  :super | { m | m switch$ "
      " 'new { self | " name_ " _ } 'name { self | '" name_ "  } "
      classMethods_ nl joinWith "  { | m super () () } end } } () :" name_ "  "
    ] join } action }
    { | m super () () }
  end }
} () } ::__som$compiler
{ | false __som$compiler } ::SOMCompiler

{ source let source nl +$ :text SOMCompiler :compiler false :start false :result " " :code |
  false :__som$invalid
  text 0 nil compiler .ignore PStream [ compiler .ignore opt ] 0 seq1 () :start
  start compiler .program () :result
  result { |
    result .value :code
    result .pos text len != { |
      result compiler .blockContents () :result
      result { | [ code "  " result .value ] join :code } if
    } if
  } { |
    start compiler .blockContents opt () :result
    result { | result .value { | result .value :code } if } if
  } ifelse
  result { | result .pos text len = '__som$invalid ?? ! & { | "  " code +$ } { | false } ifelse } { | false } ifelse
} ::somCompile
{ source let source somCompile :code | code { | code eval } { | " Error: invalid or unsupported SOM source" print$ } ifelse } ::somEval
`);
