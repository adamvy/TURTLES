// Independent function acceptance tests: ECMAScript values, the pinned T0
// interpreter running our guest compiler, and the actual bare-metal ARM guest.
// Build the full images first. --oracle checks the fixtures without QEMU.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { FullQemuSession } from './full-qemu.mjs';
import { createReference } from './reference.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = (name, setup, expression, expected, checks = []) => ({ name, setup, expression, expected, checks });

// These programs deliberately stay inside the documented JS-like subset.
// Function-local let is not tested for ECMAScript TDZ/block-scope behavior.
export const functionCases = [
  fixture('named declaration', 'function add(a,b){return a+b;};', 'add(20,22)', '42'),
  fixture('anonymous immediate call', '', '(function(x){return x*2;})(21)', '42'),
  fixture('function assigned to variable', 'twice=function(x){return x*2;};', 'twice(21)', '42'),
  fixture('single parameter arrow expression', 'twice=x=>x*2;', 'twice(21)', '42'),
  fixture('multiple parameter arrow expression', 'add=(x,y)=>x+y;', 'add(20,22)', '42'),
  fixture('empty parameter arrow block', 'answer=()=>{let x=41;return x+1;};', 'answer()', '42'),
  fixture('nested arrow lexical capture', 'make=x=>y=>x+y;', 'make(20)(22)', '42'),
  fixture('arrows stored and called through arrays', 'fs=[x=>x+1,x=>x*2];', 'fs[1](21)', '42'),
  fixture('arrow mutable lexical capture', 'make=x=>{let n=x;return ()=>{n++;return n;};};next=make(40);', 'next()+next()', '83'),
  fixture('ordered parameter binding', 'function pack(a,b,c){return [a,b,c];};', 'pack(1,2,3)', '1,2,3'),
  fixture('missing trailing argument', 'function second(a,b){return b;};', 'second(1)', 'undefined'),
  fixture('missing all arguments', 'function first(a,b){return a;};', 'first()', 'undefined'),
  fixture('extra arguments still run', 'i=0;function first(a){return a;};', 'first(++i,++i,++i)', '1', [['i', '3']]),
  fixture('no parameters ignore evaluated arguments', 'i=0;function answer(){return 42;};', 'answer(++i,++i)', '42', [['i', '2']]),
  fixture('fallthrough discards expression temporaries', 'function noise(){1;2;3;};', 'noise()', 'undefined'),
  fixture('empty function', 'function empty(){};', 'empty()', 'undefined'),
  fixture('bare return discards temporaries', 'function stop(){42;return;99;};', 'stop()', 'undefined'),
  fixture('return skips later effects', 'flag=0;function stop(){return 7;flag=9;};', 'stop()', '7', [['flag', '0']]),
  fixture('return through loop and branch', 'function seek(n){let x=0;while(x<n){if(x==3)return x;x++;};return -1;};', 'seek(5)', '3'),
  fixture('recursive named function', 'function factorial(n){if(n<=1)return 1;return n*factorial(n-1);};', 'factorial(6)', '720'),
  fixture('private named expression recursion', 'f=function factorial(n){if(n<=1)return 1;return n*factorial(n-1);};', 'f(6)', '720'),
  fixture('named expression self-binding survives external reassignment', 'a=function self(n){if(n==0)return 1;return self(n-1)+1;};b=a;a=0;', 'b(3)', '4'),
  fixture('declarations need no separator after body', 'function one(){return 1;} function two(){return one()+1;}', 'two()', '2'),
  fixture('local function declaration shadows global', 'function helper(){return 100;} function outer(){function helper(){return 42;} return helper();}', 'outer()', '42', [['helper()', '100']]),
  fixture('mutually recursive local declarations', 'function outer(n){function even(x){if(x==0)return true;return odd(x-1);} function odd(x){if(x==0)return false;return even(x-1);} return even(n);}', 'outer(6)', 'true'),
  fixture('arguments evaluated left to right', 'trace=0;function mark(v){trace=trace*10+v;return v;};function combine(a,b){return a*10+b;};', 'combine(mark(1),mark(2))', '12', [['trace', '12']]),
  fixture('callee captured before argument effects', 'function old(x){return 10;};function newer(x){return 20;};f=old;', 'f(f=newer)', '10', [['f(0)', '20']]),
  fixture('returned callee precedes nested arguments', 'trace=0;function mark(v){trace=trace*10+v;return v;};function combine(a,b){return a*10+b;};function getF(){trace=trace*10+1;return combine;};', 'getF()(mark(2),mark(3))', '23', [['trace', '123']]),
  fixture('functions in arrays', 'fs=[function(x){return x+1;},function(x){return x*2;}];', 'fs[1](21)', '42'),
  fixture('array argument retains identity', 'a=[1];function identity(x){return x;};', 'identity(a)==a', 'true'),
  fixture('returned lexical capture', 'function make(a){return function(b){return a+b;};};f=make(40);', 'f(2)', '42'),
  fixture('independent mutable captures', 'function make(start){let n=start;return function(){n++;return n;};};a=make(0);b=make(10);', 'a()+a()+b()', '14', [['a()', '3'], ['b()', '12']]),
  fixture('function-local let shadows global', 'x=100;function bump(){let x=1;x++;return x;};', 'bump()', '2', [['x', '100']]),
  fixture('uninitialized local let', 'function missing(){let x;return x;};', 'missing()', 'undefined'),
  fixture('closure captures later initialized local', 'function maker(){let f=function(){return x;};let x=42;return f;};', 'maker()()', '42'),
  fixture('nested parameter shadows outer parameter', 'function make(x){let y=x;return function(x){return x+y;};};f=make(20);', 'f(22)', '42'),
  fixture('returned closures keep independent argument frames', 'function make(x){return function(){return x;};};a=make(20);b=make(22);', 'a()+b()', '42'),
  fixture('nested return does not return outer function', 'function outer(){let inner=function(){return 40;};inner();return 42;};', 'outer()', '42'),
  fixture('function call in arithmetic preserves earlier operand', 'function twice(x){100;return x*2;};', '10+twice(16)', '42'),
  fixture('parameter named dup does not replace compiler machinery', 'function f(dup){let x=1;x++;return x;}', 'f(100)', '2'),
  fixture('parameter named swap does not replace call machinery', 'function identity(x){return x;} function f(swap){return identity(42);}', 'f(100)', '42'),
  fixture('local named neg does not replace unary operator', 'function f(){let neg=100;return -42;}', 'f()', '-42'),
  fixture('parameter named mod does not replace remainder operator', 'function f(mod){return 8%3;}', 'f(100)', '2'),
  fixture('local named ifelse does not replace ternary operator', 'function f(){let ifelse=100;return true?42:0;}', 'f()', '42'),
  fixture('parameters do not replace T0 compiler metadata', 'function f(input,ip,readSym,__proto__){return input+ip+readSym+__proto__;}', 'f(10,11,12,9)', '42'),
  fixture('function names do not replace T0 compiler metadata', 'function input(x){return x+1;} function ip(x){return x+1;} function readSym(x){return x+1;} function __proto__(x){return x+1;}', '__proto__(readSym(ip(input(38))))', '42'),
];

function t0String(source) {
  assert.doesNotMatch(source, /[\r\n]|"""/, 'Curated fixtures must fit one T0 string/UART line');
  return `""" ${source}"""`;
}

function checkOracle(example) {
  // Trusted repository fixtures only; vm is not a security sandbox.
  const context = vm.createContext({});
  vm.runInContext(example.setup, context, { timeout: 1000 });
  for (const [source, expected] of [[example.expression, example.expected], ...example.checks]) {
    assert.equal(String(vm.runInContext(`(${source})`, context, { timeout: 1000 })), expected,
      `${example.name}: independent ECMAScript result for ${source}`);
  }
}

function checkReference(example) {
  const reference = createReference({ loadJS: true, timeoutMs: 5000 });
  const setup = reference.evaluateJS(example.setup || '0');
  assert.equal(setup.accepted, true, `${example.name}: reference accepts setup`);
  assert.deepEqual(setup.diagnostics, [], `${example.name}: reference setup diagnostics`);
  reference.evaluate(Array(reference.snapshot().stack.length).fill('drop').join(' '));
  for (const [source, expected] of [[example.expression, example.expected], ...example.checks]) {
    reference.evaluate('777');
    const result = reference.evaluateJS(source);
    assert.equal(result.accepted, true, `${example.name}: reference accepts ${source}`);
    assert.deepEqual(result.diagnostics, [], `${example.name}: reference expression diagnostics`);
    assert.equal(result.stack.length, 2, `${example.name}: exactly one result above caller stack`);
    assert.equal(result.stack[0], 777, `${example.name}: caller stack value remains intact`);
    assert.deepEqual(reference.evaluate('print print').output, [expected, '777']);
  }
}

export async function runFunctionTests({ oracleOnly = false, filter = '', transcriptPath = resolve(root, 'build/functions-transcript.json') } = {}) {
  const selected = functionCases.filter(example => !filter || example.name.toLowerCase().includes(filter.toLowerCase()));
  assert.ok(selected.length, `No function cases matched ${JSON.stringify(filter)}`);
  const results = [];
  let guest;
  let imageSha256;
  let interrupted;
  const abort = signal => {
    interrupted ??= Object.assign(new Error(`Function tests interrupted by ${signal}`), { exitCode: signal === 'SIGINT' ? 130 : 143 });
    guest?.fail(interrupted);
    void guest?.stop();
  };
  const onInterrupt = () => abort('SIGINT');
  const onTerminate = () => abort('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  try {
    for (const example of selected) {
      if (interrupted) throw interrupted;
      try {
        checkOracle(example);
        if (!oracleOnly) {
          checkReference(example);
          if (!guest) {
            guest = new FullQemuSession({ mode: 't0', timeoutMs: 15000 });
            imageSha256 = createHash('sha256').update(await readFile(guest.imagePath)).digest('hex');
            await guest.start();
          } else {
            await guest.sendLine('reset');
          }
          assert.deepEqual((await guest.sendLine('" parsers.t0" include " jsparser.t0" include " js-repl.t0" include')).output, []);
          assert.deepEqual((await guest.sendLine(`${t0String(example.setup || '0')} jsEval clear`)).output, [], `${example.name}: guest setup`);
          for (const [source, expected] of [[example.expression, example.expected], ...example.checks]) {
            const native = await guest.sendLine(`777 ${t0String(source)} jsEval print depth print print depth print`);
            assert.deepEqual(native.output, [expected, '1', '777', '0'],
              `${example.name}: native value and complete caller-stack isolation for ${source}`);
          }
        }
        results.push({ name: example.name, passed: true });
        console.log(`PASS ${example.name}`);
      } catch (error) {
        results.push({ name: example.name, passed: false, error: String(error) });
        console.error(`FAIL ${example.name}\n${error}`);
        if (guest?.failure) {
          await guest.stop();
          guest = undefined;
        }
      }
    }
  } finally {
    await guest?.stop();
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    if (!oracleOnly) {
      await mkdir(dirname(transcriptPath), { recursive: true });
      await writeFile(transcriptPath, JSON.stringify({ imageSha256, results, uart: guest?.transcript || '' }, null, 2) + '\n');
    }
  }
  console.log(`${results.filter(result => result.passed).length}/${results.length} function cases passed (${oracleOnly ? 'ECMAScript fixture oracle' : 'ECMAScript, upstream T0, ARM QEMU'}).`);
  if (interrupted) throw interrupted;
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const filterIndex = args.indexOf('--filter');
  const filter = filterIndex >= 0 ? args.splice(filterIndex, 2)[1] : '';
  for (const arg of args) if (arg !== '--oracle') throw new Error(`Unknown argument ${arg}`);
  const results = await runFunctionTests({ oracleOnly: args.includes('--oracle'), filter });
  if (results.some(result => !result.passed)) process.exitCode = 1;
}
