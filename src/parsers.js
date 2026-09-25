// Parser cursors use native string offsets: UTF16 units on the JS host,
// UTF8 bytes on ARM. The ARM core supplies these cursor operations directly.
if (scope.charAt) {
  scope.sourceLen = scope.len;
  scope.sourceCharAt = scope.charAt;
  scope.sourceNext = bfn((str, pos) => pos + 1);
}

scope.eval$(`

// A Parser Stream - used as input for parsers
{ str pos value ignore let false :tail |
  { m |
    m switch
      'parse  { parser this | this parser () }
      'parseToken { parser this |
        ignore
          {
            let this .ignoreOff parser () :result |
            result
              { | ignore result .ignoreOn }
              { | result }
            ifelse
          }
          { |
            this parser ()
          }
        ifelse
      }
      'ignoreOff { this | str pos value false PStream }
      'ignoreOn { ignore this | str pos value ignore PStream .maybeIgnore }
      'pos    { this | pos }
      'head   { this |
        // [ " pos: " pos " , head-> " str pos sourceCharAt ] join print
        str pos sourceCharAt }
      'tail   { this |
        tail !
          { | str str pos sourceNext this .head ignore PStream ignore { | .maybeIgnore } if :tail }
        if
        tail
      }
      'maybeIgnore { this let this ignore () :ps |
        ps
          { | this .value ps .:value  }
          { | this }
        ifelse
      }
      'value  { this | value }
      ':value { v2 this | value v2 = { | this } { | str pos v2 ignore PStream } ifelse }
      'toString { this | " PStream: " pos " , '" value '' + + + + }
      { this | " PStream Unknown Method '" m + '' + print }
    end
  }
} ::PStream


{ p | { ps | p ps .parseToken } } ::tok

{ str v | { ps let 0 :i |
  { | i str sourceLen <  { | ps .head str i sourceCharAt = } && } { | str i sourceNext :i ps .tail :ps } while
  str sourceLen i = { | v ps .:value } { | false } ifelse
} tok } ::litMap

{ str | str str litMap } ::lit

{ start end c | c string? { | c start >=  c end <= & } && } ::inRange
{ start end | { ps |
  start end ps .head inRange { | ps .tail } { | false } ifelse
} } ::range

{ parsers | parsers { p | p string? { | p lit } { | p } ifelse } map } ::prepare

{ parsers | parsers prepare :parsers { ps let 0 :i |
  [ { | i parsers len < { | parsers i @ ps .parse :ps ps } && } { | i++ ps .value } while ]
  parsers len i = { a | a ps .:value } { _ | false } ifelse
} } ::seq

{ parsers i | parsers seq { a | a i @ } mapp } ::seq1

{ parsers | parsers prepare :parsers { ps let 0 :i false :ret |
  { | i parsers len < { | parsers i @ ps .parse :ret ret ! } && } { | i++ } while
  ret
} } ::alt

{ parser min | { ps let 0 :i false :ret |
  [ { | ps :ret  parser ps .parse :ps ps } { | i++ ps .value } while ]
  i min >=  { a | a ret .:value } { _ | false } ifelse
} } ::repeatp
{ | repeatp } ::repeat

{ | 0 repeatp } ::star
{ | 1 repeatp } ::plus

{ parser delim |
  [ [ parser delim ] 0 seq1 0 repeatp parser opt ] seq
  { a | [ a 0 @  { e | e } do a 1 @ { | a 1 @ } if ] } mapp
} ::delim

{ parser | { ps let parser ps .parse :ret | ret { | ret } { | false ps .:value } ifelse } } ::opt

{ parser | { ps | parser ps .parse { | false } { | ps } ifelse } } ::notp

{ str | { ps | ps .head string? { | str ps .head indexOf -1 = } && { | ps .tail } { | false } ifelse } } ::notChars

{ str | { ps | ps .head string? { | str ps .head indexOf -1 > } && { | ps .tail } { | false } ifelse } } ::anyChar

{ p f | { ps | p ps .parse :ps ps { | ps .value f () ps .:value } { | false } ifelse } } ::mapp

{ o m super f | { ps | o m super () () f mapp ps .parse } } ::action
`);
