// Focused compiler/VM regressions, compared with the unmodified upstream JS.
// Run after `node tools/build-full.mjs t0`; this uses the actual ARM guest.
import assert from 'node:assert/strict';
import { QemuSession } from './qemu.mjs';
import { createReference } from './reference.mjs';

const programs = [
  ['argument ordering', '1 2 { a b | a print b print } ()'],
  ['duplicate parameter binding', '1 2 { x x | x } () print'],
  ['let initialization', '5 { a let a 3 * :b 7 :c | b c + } () print'],
  ['constant early binding', '2 :earlyX { | earlyX } :earlyF 3 :earlyX earlyF () print earlyX print'],
  ['auto-call early binding', '{ | 1 } ::earlyAuto { | earlyAuto } :earlyCaller { | 2 } ::earlyAuto earlyCaller () print earlyAuto print'],
  ['forward binding', '{ | laterWord } :forwardF 29 :laterWord forwardF () print'],
  ['mutable capture', '1 { count | { | count 1 + :count count } } () :coreCounter coreCounter () print coreCounter () print'],
  ['compile-time emit', '{ | i[ 1 2 + emit ] } () print'],
  ['emitted closure', '{ | i[ { x | x 2 * } emit ] } :emitted 3 emitted () () print'],
  ['late emit into empty closure', '{ | i[ ] } :lateEmit 42 emit lateEmit () print'],
  ['late emit into switch options', '{ | switch i[ ] end } :lateSwitch 7 emit 5 lateSwitch () print'],
  ['switch dispatch', "2 switch 1 { | 'one } 2 { | 'two } { | 'other } end () print"],
  ['switch preserves auto-call node boundaries', "{ | 7 } ::switchSeven 7 switch switchSeven { | 'hit } { | 'miss } end () print"],
  ['captured local dictionary', "{ m let 42 :a 66 :b | m ?? } :coreDispatch 'a coreDispatch () print 'b coreDispatch () print"],
  ['local return', '{ | 1 <- 2 } () print'],
  ['named nonlocal return', '{ :coreOuter | 1 { | 10 coreOuter<- 11 } () 2 } () print print'],
  ['closure source text', '{ x | x } print'],
  ['method expansion', "{ m | m switch 'answer { self | 42 } { self | 0 } end } :coreObject coreObject .answer print"],
  ['capture compiler context', '{ key | key ?? } :showCoreContext'],
  ['inherited source and captured index', "'input_ showCoreContext () print 'ip_ showCoreContext () print"],
  ['capture compile-time source', '{ | i[ 7 emit ] { key | key ?? } } () :showCoreLocal'],
  ['scope-owned source and index', "'input_ showCoreLocal () print 'ip_ showCoreLocal () print"],
  ['array callback can shorten a coerced bound', '[ 3 ] :shrinkingBound shrinkingBound { i | 1 shrinkingBound 0 :@ i } []WithFn print'],
  ['array callback can extend a coerced bound', '[ 1 ] :growingBound growingBound { i | 3 growingBound 0 :@ i } []WithFn print'],
  ['array callback returns before huge allocation', '{ :constructorDone | 1000000000 { i | 7 constructorDone<- } []WithFn } () print'],
];

const reference = createReference();
const guest = new QemuSession({ elfPath: 'build/t0-full.elf', timeoutMs: 10_000 });
guest.args[guest.args.indexOf('-m') + 1] = '512M';
try {
  const banner = await guest.start();
  assert.match(banner, /Raw T0 REPL ready/);
  for (const [name, source] of programs) {
    const expected = reference.evaluate(source).output;
    const actual = (await guest.sendLine(source)).output;
    assert.deepEqual(actual, expected, name);
    console.log(`PASS ${name}`);
  }
  console.log(`Verified ${programs.length} compiler/VM regressions against upstream in QEMU.`);
} finally {
  await guest.stop();
}
