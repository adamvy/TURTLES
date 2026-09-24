// The original jsparser.js hook evaluates emitted code at compile time. This
// test registers the documented, corrected adapter over the unchanged pinned
// core, then compares it with the native guest (including local-frame access).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { QemuSession } from './qemu.mjs';

const output = [];
const context = vm.createContext({ console: {
  log: (...args) => { if (args.length === 1) output.push(String(args[0])); },
  error: (...args) => { throw Error(args.join(' ')); },
} });
vm.runInContext(readFileSync(new URL('../vendor/upstream/t0.js', import.meta.url), 'utf8'), context, { timeout: 1000 });
for (const file of ['parsers.t0', 'jsparser.t0', 'js-repl.t0']) {
  context.moduleSource = readFileSync(new URL(`../language/${file}`, import.meta.url), 'utf8');
  vm.runInContext('scope.eval$(moduleSource)', context, { timeout: 3000 });
}
vm.runInContext(`
  scope['js{'] = code => {
    const start = scope.ip;
    let end = start;
    for (;;) {
      const token = scope.readSym();
      if (!token) throw Error('unterminated js{ block');
      if (token === '}js') break;
      end = scope.ip;
    }
    stack.push(scope.input.substring(start, end));
    scope.jsCompile({ push: operation => operation() });
    const generated = stack.pop();
    if (typeof generated !== 'string') throw Error('invalid JS-like source');
    const oldInput = scope.input, oldIp = scope.ip;
    scope.input = generated; scope.ip = 0;
    try {
      for (let token; (token = scope.readSym());) scope.evalSym(token, code);
    } finally { scope.input = oldInput; scope.ip = oldIp; }
  };
`, context);
function reference(source) {
  const start = output.length;
  context.testSource = source;
  vm.runInContext('scope.eval$(testSource)', context, { timeout: 3000 });
  return output.slice(start);
}

const cases = [
  ['immediate expression', 'js{ 1 + 2 * 3 }js print'],
  ['following T0 input resumes', 'js{ 8 }js 9 + print'],
  ['multiple inline blocks', 'js{ 1 }js js{ 2 }js + print'],
  ['function-local parameter', '{ x | js{ x * x + 1 }js } :inlineSquare 4 inlineSquare () print'],
  ['local mutation', '{ let 1 :x | js{ x=x+2; x++; x }js print print print x print } ()'],
  ['captured outer parameter', '10 { x | { y | js{ x+y }js } } () :inlineCapture 7 inlineCapture () print'],
  ['side effects wait for function call', '0 :inlineCounter { | js{ inlineCounter=inlineCounter+1 }js } :inlineTick inlineCounter print inlineTick () print inlineTick () print inlineCounter print'],
  ['array parser and index', 'js{ [1,2,3][1] }js print'],
  ['empty source', 'js{ }js 42 print'],
  ['same builder around inline source', '{ x | x js{ x+1 }js + } :inlineSum 20 inlineSum () print'],
];

const guest = new QemuSession({ elfPath: 'build/t0-full.elf', timeoutMs: 15_000 });
guest.args[guest.args.indexOf('-m') + 1] = '512M';
try {
  await guest.start();
  assert.deepEqual((await guest.sendLine('js{ 1+2 }js')).output, ['Error: js{ requires the loaded jsCompile language adapter']);
  assert.deepEqual((await guest.sendLine('47 print')).output, ['47']);
  console.log('PASS missing-language error and recovery');
  const loaded = await guest.sendLine('" parsers.t0" include " jsparser.t0" include " js-repl.t0" include');
  assert.deepEqual(loaded.output, []);
  for (const [name, source] of cases) {
    assert.deepEqual((await guest.sendLine(source)).output, reference(source), name);
    console.log(`PASS ${name}`);
  }
  assert.throws(() => reference('js{ 1 trailing }js'), /invalid JS-like source/);
  assert.deepEqual((await guest.sendLine('11 js{ 1 trailing }js')).output, ['Error: invalid JS-like source in js{ block']);
  assert.deepEqual((await guest.sendLine('print')).output, ['11']);
  console.log('PASS invalid source rejects its valid prefix and preserves caller stack');
  assert.throws(() => reference('js{ 1+2'), /unterminated js\{ block/);
  assert.deepEqual((await guest.sendLine('js{ 1+2')).output, ['Error: unterminated js{ block (expected }js)']);
  assert.deepEqual((await guest.sendLine('6 7 * print')).output, ['42']);
  console.log('PASS missing terminator and recovery');
  console.log(`Verified ${cases.length} differential inline-JS cases and three error/recovery cases in QEMU.`);
} finally {
  await guest.stop();
}
