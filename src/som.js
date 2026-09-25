scope.eval$(`
{ a w let true :first | a ! { | " " <- } if a { i | i } filter { i | first { | false :first i } { | w i + } ifelse } map join } ::joinWith // join, space separated, removing false values
{ a | a "  " joinWith } ::joins // join, space separated, removing false values

// "translated from: https://github.com/SOM-st/SOM/blob/master/specification/SOM.g4"
{ let
  call:   { m o | o m o () () } ;
  program: { o | o .classdef plus } ;
  classdef: { o | [
    o .identifier '= o .superclass '(
      o .instanceFields
      o .method star
      [ o .Separator o .classFields opt o .method star ] seq opt
    ')
  ] seq } ;
  superclass: { o | o .Identifier opt } ;
  instanceFields: { o | o .fields } ;
  classFields: { o | o .fields } ;
  fields: { o | [ '| o .variable star '| ] 1 seq1 opt } ;
  method: { o | [ o .pattern '= [ o .STPrimitive o .methodBlock ] alt ] seq } ;
  pattern: { o | [ o .keywordPattern o .binaryPattern o .unaryPattern ] alt } ;
  unaryPattern: { o | o .unarySelector } ;
  binaryPattern: { o | [ o .binarySelector o .argument ] seq } ;
  keywordPattern: { o | [ o .keyword o .argument ] seq plus } ;
  methodBlock: { o | [ '( o .blockContents opt ') ] 1 seq1 } ;
  unarySelector: { o | [ o .identifier " :" lit notp ] 0 seq1 } ;
  binarySelector: { o | [ o .Separator notp o .OperatorSequence ] 1 seq1 } ;
  identifier: { o | o .Identifier } ;
  keyword: { o | o .Keyword } ;
  argument: { o | o .variable } ;
  blockContents: { o | [ [ '| o .localDefs '| ] 1 seq1 opt { | o .blockBody () } ] seq } ;
  localDefs: { o | o .variable star } ;
  blockBody: { o | [ { | o .blockBodyReturn () } { | o .blockBodyExpression () } ] alt } ;
  blockBodyReturn: { o |  [ '^ o .result ] 1 seq1 } ;
  blockBodyExpression: { o | [ { | o .expression () } [ '. { | o .blockBody () } opt ] 1 seq1 opt ] seq } ;
  result: { o | [ o .expression '. lit opt ] 0 seq1 } ;
  expression: { o | [ o .assignation o .evaluation ] alt } ;
  assignation: { o | [ o .assignments o .evaluation ] seq } ;
  assignments: { o | o .assignment plus } ;
  assignment: { o | [ o .variable ':= ] 0 seq1 } ;
  evaluation: { o | [ o .primary o .messages opt ] seq } ;
  primary: { o | [ o .variable { | o .nestedTerm () } { | o .nestedBlock () } { | o .literal () } ] alt } ;
  variable: { o | o .identifier } ;
  messages: { o | [ o .unaryMessage star o .binaryMessage star o .keywordMessage opt ] seq } ;
  unaryMessage: { o | { | o .unarySelector () } } ;
  binaryMessage: { o | [ o .binarySelector o .binaryOperand ] seq } ;
  binaryOperand: { o | [ o .primary o .unaryMessage star ] seq } ;
  keywordMessage: { o | [ o .keyword o .formula ] seq plus } ;
  formula: { o | [ o .binaryOperand { | o .binaryMessage () } star ] seq } ;
  nestedTerm: { o | [ '( o .expression ') ] 1 seq1 } ;
  literal: { o | [ o .literalArray o .literalSymbol  o .literalString  o .literalNumber ] alt } ;
  literalArray: { o | [ '# '( { | o .literal () } star ') ] 2 seq1 } ;
  literalNumber: { o | o .Number } ;
  literalSymbol: { o | [ '# [ o .string o .selector ] alt ] 1 seq1 tok } ;
  literalString: { o | o .STString } ;
  selector: { o | [ o .binarySelector o .keywordSelector o .unarySelector ] alt } ;
  keywordSelector: { o | o .KeywordSequence } ;
  string: { o | o .STString } ;
  nestedBlock: { o | [ '[  { | o .blockPattern () } opt { | o .blockContents () } opt '] ] seq } ;
  blockPattern: { o | [ o .blockArguments '| ] 0 seq1 } ;
  blockArguments: { o | [ " :" o .argument ] seq &join mapp plus } ;
//  Number: { o | [ '- lit opt o .Num plus [ '. o .Num plus ] seq opt ] seq tok } ;
  Number: { o | [ '- lit opt o .Num plus &join mapp [ '. o .Num plus &join mapp ] seq &join mapp opt ] seq { | { i | i } filter join } mapp tok } ;
  Alpha: { o | [ 'a 'z range 'A 'Z range ] alt } ;
  Num: { o | '0 '9 range } ;
  AlphaNum: { o | [ o .Alpha o .Num ] alt } ;
  Identifier: { o | [ o .Alpha o .AlphaNum star &join mapp ] seq &join mapp tok } ;
  STPrimitive: { o | 'primitive lit } ;
  Separator: { o | '- lit 4 repeat tok } ;
  OperatorSequence: { o | '~&|*/\+<>,%@-= anyChar plus &join mapp } ;
  Keyword: { o | [ o .Identifier " :" ] seq &join mapp tok } ;
  KeywordSequence: { o | o .Keyword plus tok } ;
  // Javascript string escaping is causing need for extra escaping
  STStringChar: { o | [ '\\b '\\n '\\r '\\f '\\0 '\\' '\\\\ '' notChars ] alt } ;
  STString: { o | [ '' o .STStringChar star '' ] 1 seq1 &join mapp tok } ;
  Comment: { o | [ '" '" notChars star '" ] 1 seq1 tok } ;
  Whitespace: { o | [ tab cr nl "  " ] alt plus tok } ;
  ignore: { o | [ o .Whitespace  o .Comment ] alt plus tok } ;
  | { m | m ?? }
} ::SOMParser

`);

scope.eval$(`
// Shared SOM values and message dispatch. Numbers, strings and booleans stay T0 values.
{ | dup } ::__som$dup
{ | drop } ::__som$drop
{ | swap } ::__som$swap
{ | join } ::__som$join
{ | charCode } ::__som$charCode
[ ] 0 @ :__som$nil
{ value tag | value array? { | value 0 @ tag = } && } ::__som$tagged
{ name parent fields methods classFields classMethods | [ '__som$class name parent fields methods classFields classMethods ] } ::__som$class
'Object false [ ] [ ] [ ] [ ] __som$class :Object
'Class Object [ ] [ ] [ ] [ ] __som$class :Class
{ value | value '__som$class __som$tagged { | value } { | value '__som$object __som$tagged { | value 1 @ } { | false } ifelse } ifelse } ::__som$classOf
{ :__som$hasFieldReturn receiver name let receiver __som$classOf :class receiver '__som$class __som$tagged { | 5 } { | 3 } ifelse :slot |
  { | class } { | class slot @ name indexOf -1 > { | true __som$hasFieldReturn<- } if class 2 @ :class } while false
} ::__som$hasField
{ receiver name | receiver " __som$field$" name + @ } ::__som$field
{ receiver name value | value receiver " __som$field$" name + :@ value } ::__som$setField
{ receiver name | receiver name __som$hasField { | receiver name __som$field } { | name __som$name ?? } ifelse } ::__som$read
{ receiver name value | receiver name __som$hasField { | receiver name value __som$setField } { | name __som$name value ; value } ifelse } ::__som$write
{ class let [ '__som$object class ] :object class :cursor |
  { | cursor } { | cursor 3 @ { name | object name __som$nil __som$setField drop } do cursor 2 @ :cursor } while object
} ::__som$new
{ :__som$methodReturn class selector side let false :found |
  { | class } { |
    class side { | 6 } { | 4 } ifelse @ { method | method 0 @ selector = { | [ method 1 @ class ] :found } if } do
    found { | found __som$methodReturn<- } if class 2 @ :class
  } while false
} ::__som$method
{ message | " Error: SOM " message + print false () } ::__som$error
{ block arguments | block '__som$block __som$tagged { | arguments block 1 @ () } { | block } ifelse } ::__som$block
{ :__som$sendReturn receiver selector arguments let receiver '__som$class __som$tagged :side receiver __som$classOf :class false :method |
  receiver '__som$super __som$tagged { | receiver 1 @ :class receiver 2 @ :receiver receiver '__som$class __som$tagged :side } if
  class { | class selector side __som$method :method } if
  method { | receiver arguments method 1 @ method 0 @ () __som$sendReturn<- } if
  selector switch
    'new { | side { | receiver __som$new } { | " new requires a class" __som$error } ifelse }
    'class { | receiver '__som$class __som$tagged { | Class } { | class } ifelse }
    'name { | side { | receiver 1 @ } { | " name requires a class" __som$error } ifelse }
    '+ { | receiver arguments 0 @ + }
    '- { | receiver arguments 0 @ - }
    '* { | receiver arguments 0 @ * }
    '/ { | receiver arguments 0 @ / }
    '%' { | receiver arguments 0 @ mod }
    " rem:" { | receiver arguments 0 @ mod }
    '< { | receiver arguments 0 @ < }
    '<= { | receiver arguments 0 @ <= }
    '> { | receiver arguments 0 @ > }
    '>= { | receiver arguments 0 @ >= }
    '= { | receiver arguments 0 @ = }
    '== { | receiver arguments 0 @ = }
    '~= { | receiver arguments 0 @ != }
    '<> { | receiver arguments 0 @ != }
    'negated { | receiver neg }
    'abs { | receiver 0 < { | receiver neg } { | receiver } ifelse }
    'sqrt { | receiver 0.5 ^ }
    'not { | receiver ! }
    " ifTrue:" { | receiver true = { | arguments 0 @ [ ] __som$block } { | __som$nil } ifelse }
    " ifFalse:" { | receiver false = { | arguments 0 @ [ ] __som$block } { | __som$nil } ifelse }
    " ifTrue:ifFalse:" { | receiver true = { | arguments 0 @ } { | arguments 1 @ } ifelse [ ] __som$block }
    " ifFalse:ifTrue:" { | receiver false = { | arguments 0 @ } { | arguments 1 @ } ifelse [ ] __som$block }
    " and:" { | receiver true = { | arguments 0 @ [ ] __som$block } { | false } ifelse }
    " or:" { | receiver true = { | true } { | arguments 0 @ [ ] __som$block } ifelse }
    'value { | receiver arguments __som$block }
    " value:" { | receiver arguments __som$block }
    " value:with:" { | receiver arguments __som$block }
    " value:with:with:" { | receiver arguments __som$block }
    " whileTrue:" { | { | receiver [ ] __som$block } { | arguments 0 @ [ ] __som$block drop } while __som$nil }
    " whileFalse:" { | { | receiver [ ] __som$block ! } { | arguments 0 @ [ ] __som$block drop } while __som$nil }
    " timesRepeat:" { | 1 receiver { i | arguments 0 @ [ ] __som$block drop } for __som$nil }
    " to:do:" { | receiver arguments 0 @ { i | arguments 1 @ [ i ] __som$block drop } for __som$nil }
    " at:" { | receiver string? { | receiver arguments 0 @ 1 - charAt } { | receiver arguments 0 @ 1 - @ } ifelse }
    " at:put:" { | arguments 1 @ receiver arguments 0 @ 1 - :@ arguments 1 @ }
    'length { | receiver len }
    'size { | receiver len }
    " do:" { | receiver { item | arguments 0 @ [ item ] __som$block drop } do receiver }
    ', { | receiver arguments 0 @ + }
    'asString { | " " receiver + }
    'print { | receiver print receiver }
    'println { | receiver print receiver }
    'isNil { | receiver __som$nil = }
    'notNil { | receiver __som$nil != }
    { | " message not understood: " selector + __som$error }
  end ()
} ::__som$send

{ text let 0 :i false :character |
  [ { | i text sourceLen < } { |
    text i sourceCharAt :character
    text i sourceNext :i
    character 92 charCode = i text sourceLen < & { |
      text i sourceCharAt :character text i sourceNext :i
      character switch
        'n { | nl } 'r { | cr } 't { | tab } 'b { | 8 charCode }
        'f { | 12 charCode } '0 { | 0 charCode }
        { | character }
      end ()
    } { | character } ifelse
  } while ] join
} ::__som$decode

// AST construction extends the existing grammar; no host parser participates.
{ node messages |
  messages { |
    messages 0 @ { selector | [ 'send node selector [ ] ] :node } do
    messages 1 @ { part | [ 'send node part 0 @ [ part 1 @ ] ] :node } do
    messages 2 @ { | [ 'send node messages 2 @ 0 @ messages 2 @ 1 @ ] :node } if
  } if node
} ::__som$messages
{ | { let SOMParser :super |
  { m | m switch
    'primary { o | [ o .variable { name | [ 'var name ] } mapp { | o .nestedTerm () } { | o .nestedBlock () } { | o .literal () } ] alt }
    'blockArguments { o | [ " :" o .argument ] 1 seq1 plus }
    'parse$ { source o | source somCompile }
    'literalNumber { | m super { value | [ 'number value ] } action }
    'literalString { | m super { value | [ 'string value __som$decode ] } action }
    'literalSymbol { | m super { value | [ 'string value array? { | value join } { | value } ifelse ] } action }
    'literalArray { | m super { values | [ 'array values ] } action }
    'evaluation { | m super { a | a 0 @ a 1 @ __som$messages } action }
    'binaryOperand { | m super { a | a 0 @ [ a 1 @ [ ] false ] __som$messages } action }
    'formula { | m super { a | a 0 @ [ [ ] a 1 @ false ] __som$messages } action }
    'keywordMessage { | m super { parts | [ parts { part | part 0 @ } map join parts { part | part 1 @ } map ] } action }
    'assignation { | m super { a | [ 'assign a 0 @ a 1 @ ] } action }
    'blockBodyReturn { | m super { value | [ 'return value ] } action }
    'blockBodyExpression { | m super { a | [ 'sequence a 0 @ a 1 @ ] } action }
    'blockContents { | m super { a | [ 'body a 0 @ { | a 0 @ } { | [ ] } ifelse a 1 @ ] } action }
    'nestedBlock { | m super { a | [ 'block a 1 @ { | a 1 @ } { | [ ] } ifelse a 2 @ ] } action }
    'unaryPattern { | m super { name | [ name [ ] ] } action }
    'binaryPattern { | m super { a | [ a 0 @ [ a 1 @ ] ] } action }
    'keywordPattern { | m super { a | [ a { part | part 0 @ } map join a { part | part 1 @ } map ] } action }
    'method { | m super { a | [ a 0 @ 0 @ a 0 @ 1 @ a 2 @ 'primitive = { | [ 'unsupported ] } { | a 2 @ } ifelse ] } action }
    'classdef { | m super { a | [ 'class a 0 @ a 2 @ { | a 2 @ } { | 'Object } ifelse a 4 @ { | a 4 @ } { | [ ] } ifelse a 5 @ a 6 @ ] } action }
    'program { | m super { classes | [ 'program classes ] } action }
    { | m super () () }
  end }
} () } ::SOMCompiler

// Source generation uses reserved helper names, preserving ordinary shared globals.
{ name | [ 'input 'ip 'readChar 'readSym 'match 'evalSym 'parseFloat_ '__proto__ ] name indexOf -1 > { | " __js$user$" name + } { | name } ifelse } ::__som$name
{ text let 0 :i |
  [ " [ " { | i text sourceLen < } { |
    text i sourceCharAt 34 charCode = { | " 34 __som$charCode " } { | [ 34 charCode "  " text i sourceCharAt 34 charCode "  " ] join } ifelse
    text i sourceNext :i
  } while " ] __som$join " ] join
} ::__som$quote
0 :__som$nextReturn
{ | '__som$nextReturn ?? 1 + :__som$nextReturn " __som$return" '__som$nextReturn ?? + } ::__som$returnName
{ :__som$validReturn node canReturn |
  node ! { | true __som$validReturn<- } if
  node 0 @ switch
    'unsupported { | false }
    'return { | canReturn node 1 @ canReturn __som$valid & }
    'send { | node 1 @ canReturn __som$valid node 3 @ true { child | child canReturn __som$valid & } reduce & }
    'array { | node 1 @ true { child | child canReturn __som$valid & } reduce }
    'assign { | node 2 @ canReturn __som$valid }
    'sequence { | node 1 @ canReturn __som$valid node 2 @ canReturn __som$valid & }
    'body { | node 2 @ canReturn __som$valid }
    'block { | node 2 @ false __som$valid }
    'class { | node 4 @ true { method | method 2 @ true __som$valid & } reduce node 5 @ { | node 5 @ 2 @ true { method | method 2 @ true __som$valid & } reduce & } if }
    'program { | node 1 @ true { child | child false __som$valid & } reduce }
    'combined { | node 1 @ false __som$valid node 2 @ false __som$valid & }
    { | true }
  end ()
} ::__som$valid
{ :__som$variableReturn name locals inMethod |
  name 'nil = { | "  [ ] 0 @" __som$variableReturn<- } if
  name 'self = inMethod & { | "  __som$self" __som$variableReturn<- } if
  name 'super = inMethod & { | "  [ '__som$super __som$owner 2 @ __som$self ]" __som$variableReturn<- } if
  locals name indexOf -1 > { | "  __som$local$" name + __som$variableReturn<- } if
  inMethod { | [ "  __som$self " name __som$quote "  __som$read" ] join } { | [ "  '" name __som$name "  ??" ] join } ifelse
} ::__som$variable
{ :__som$assignmentReturn name locals inMethod |
  locals name indexOf -1 > { | "  __som$dup :__som$local$" name + __som$assignmentReturn<- } if
  inMethod { | [ "  { __som$value | __som$self " name __som$quote "  __som$value __som$write } ()" ] join } { | "  __som$dup :" name __som$name + } ifelse
} ::__som$assignment
{ params body locals inMethod returnName isMethod let body { | body 1 @ } { | [ ] } ifelse :ownLocals false :allLocals |
  [ locals { name | name } do ownLocals { name | name } do params { name | name } do ] :allLocals
  [
    isMethod { | [ "  { :" returnName "  __som$self __som$args __som$owner" ] join } { | "  { __som$args" } ifelse
    "   let " ownLocals { name | "  [ ] 0 @ :__som$local$" name + } map join
    params { name | "  [ ] 0 @ :__som$local$" name + } map join "   | "
    0 params len 1 - { i | [ "  __som$args " i "  @ :__som$local$" params i @ ] join } for
    body { | body 2 @ allLocals inMethod returnName __som$emit } { | "  [ ] 0 @" } ifelse
    isMethod { | "  __som$drop __som$self" } { | "  " } ifelse
    "  }"
  ] join
} ::__som$function
{ methods | [ "  [ " methods { method | [ "  [ " method 0 @ __som$quote method 1 @ method 2 @ [ ] true __som$returnName true __som$function "  ] " ] join } map join "  ] " ] join } ::__som$methods
{ :__som$emitReturn node locals inMethod returnName |
  node ! { | "  [ ] 0 @" __som$emitReturn<- } if
  node 0 @ switch
    'number { | node 1 @ }
    'string { | node 1 @ __som$quote }
    'var { | node 1 @ locals inMethod __som$variable }
    'array { | [ "  [ " node 1 @ { child | child locals inMethod returnName __som$emit "   " + } map join "  ] " ] join }
    'send { | [ node 1 @ locals inMethod returnName __som$emit "   " node 2 @ __som$quote "  [ " node 3 @ { child | child locals inMethod returnName __som$emit "   " + } map join "  ] __som$send" ] join }
    'assign { | [ node 2 @ locals inMethod returnName __som$emit "   " node 1 @ { name | name locals inMethod __som$assignment "   " + } map join ] join }
    'sequence { | [ node 1 @ locals inMethod returnName __som$emit node 2 @ { | [ "  __som$drop " node 2 @ locals inMethod returnName __som$emit ] join } { | "  " } ifelse ] join }
    'body { | [ "  { let " node 1 @ { name | "  [ ] 0 @ :__som$local$" name + } map join "  | " node 2 @ [ locals { name | name } do node 1 @ { name | name } do ] inMethod returnName __som$emit "  } ()" ] join }
    'block { | [ "  [ '__som$block " node 1 @ node 2 @ locals inMethod returnName false __som$function "  ]" ] join }
    'return { | [ node 1 @ locals inMethod returnName __som$emit "   " returnName '<- ] join }
    'class { | [ node 1 @ __som$quote "  '" node 2 @ __som$name "  ?? [ " node 3 @ { name | name __som$quote } map join "  ] " node 4 @ __som$methods
      node 5 @ { | [ "  [ " node 5 @ 1 @ { | node 5 @ 1 @ { name | name __som$quote } map join } { | "  " } ifelse "  ] " node 5 @ 2 @ __som$methods ] join } { | "  [ ] [ ]" } ifelse
      "  __som$class :" node 1 @ __som$name "   " ] join }
    'program { | node 1 @ { child | child locals inMethod returnName __som$emit } map join }
    'combined { | [ node 1 @ locals inMethod returnName __som$emit "  " node 2 @ locals inMethod returnName __som$emit ] join }
    { | "  " }
  end ()
} ::__som$emit
{ source let source nl + :text SOMCompiler :compiler false :start false :result false :classes |
  text 0 nil compiler .ignore PStream [ compiler .ignore opt ] 0 seq1 () :start
  start compiler .program () :result
  result
    { | result .pos text sourceLen != { |
      result .value :classes result compiler .blockContents () :result
      result { | [ 'combined classes result .value ] result .:value :result } if
    } if }
    { | start compiler .blockContents opt () :result }
  ifelse
  result { | result .pos text sourceLen = { | result .value false __som$valid { | result .value { | result .value [ ] false " " __som$emit } { | " " } ifelse } { | false } ifelse } { | false } ifelse } { | false } ifelse
} ::somCompile
{ source let source somCompile :code | code string? { | code eval } { | " Error: invalid or unsupported SOM source" print } ifelse } ::somEval
`);
