// Runs the exact browser engine bytes under Node's WebAssembly implementation.
// This checks ARM image compatibility; Chrome delivery/isolation is tested in UI.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytePty } from '../web/engine.mjs';
const root = new URL('../', import.meta.url);
const script = fileURLToPath(import.meta.url);
const mode = process.argv[2];

if (!mode) {
  const check = spawnSync(process.execPath, [fileURLToPath(new URL('tools/browser-engine.mjs', root)), '--verify'], { stdio: 'inherit' });
  if (check.status !== 0) process.exit(check.status ?? 1);
  for (const variant of ['t0', 'js']) {
    const result = spawnSync(process.execPath, [script, variant], { stdio: 'inherit', timeout: 90000 });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  console.log('Exact browser-Wasm engine: both ARM images booted and evaluated guest programs.');
} else {
  if (!['t0', 'js'].includes(mode)) throw Error('Mode must be t0 or js');
  const engine = new URL('web/vendor/qemu/', root);
  const { default: createQemu } = await import(new URL('out.js', engine));
  const scratch = mkdtempSync(join(tmpdir(), 'turtles-wasm-worker-'));
  const worker = join(scratch, 'worker.cjs');
  // Emscripten's worker wrapper uses require() on Node; .cjs selects that mode.
  // Bytes remain identical to the checksum-verified browser .worker.js file.
  copyFileSync(new URL('qemu-system-aarch64.worker.js', engine), worker);
  const cases = mode === 't0' ? [
    ['1 2 / print', '0.5'],
    ['{ x | x x * } ::square 9 square print', '81'],
    ['2 :x { | x } :f 3 :x f () print x print', '2\n3'],
    ['{ | i[ 1 2 + emit ] } () print', '3'],
    ["'😀 len print", '2'],
    ['{ n | { x | n x + } } ::adder\n10 adder :add10\n7 add10 () print', '17'],
  ] : [
    ['1 + 2 * 3', '7'],
    ['answer = 42', '42'],
    ['answer + 0.5', '42.5'],
    ['[1,[2,3]][1][0]', '2'],
    ['if (2>1) { 11; } else { 22; }', '11'],
    ['function square(x) { return x * x; }\nsquare(9)', '81'],
    ['function counter(start) {\n let n = start;\n return function() { n = n + 1; return n; };\n}\nlet next = counter(40);\n[next(), next()]', '41,42'],
    ['function factorial(n) {\n if (n <= 1) { return 1; }\n return n * factorial(n - 1);\n}\nfactorial(6)', '720'],
    ['(x=>y=>x+y)(40)(2)', '42'],
    ['let values = [2, 3, 5];\nvalues[0] * values[1] + values[2]', '11'],
  ];
  let instance, buffer = '', next = 0, active, ended = false;
  const finish = error => {
    if (ended) return;
    ended = true; clearTimeout(timeout);
    instance?.PThread.terminateAllThreads(); rmSync(scratch, { recursive: true, force: true });
    if (error) { console.error(error); process.exit(1); }
    console.log(`${mode}: ${cases.length} guest programs passed in the browser Wasm engine`);
    process.exit(0);
  };
  const timeout = setTimeout(() => finish(Error(`Timed out: ${mode}\n${buffer}`)), 75000);
  const pty = bytePty(text => {
    buffer += text;
    if (/(?:^|[\r\n])HALTED: [^\r\n]*\r?\n$/.test(buffer)) return finish(Error(`${mode} guest halted during ${active?.[0] ?? 'boot'}:\n${buffer}`));
    if (!buffer.endsWith(`${mode}> `)) return;
    const response = buffer.replaceAll('\r', ''); buffer = '';
    if (active) {
      const [source, expected] = active;
      const echo = ':paste\n' + source.split('\n').map(line => `... ${line}\n`).join('') + '... :end\n';
      if (!response.startsWith(echo)) return finish(Error(`Unexpected ${mode} UART echo: ${response}`));
      const body = response.slice(echo.length, -`${mode}> `.length).trim();
      if (body !== expected) return finish(Error(`${mode}: ${source}\nExpected: ${expected}\nReceived: ${body}`));
    }
    if (next === cases.length) return finish();
    active = cases[next++];
    setTimeout(() => pty.input(`:paste\n${active[0]}\n:end\n`), 0);
  });
  try {
    instance = await createQemu({
      pty, arguments: ['-machine', 'virt-8.2', '-cpu', 'cortex-a53', '-accel', 'tcg,tb-size=32', '-m', '512M', '-smp', '1',
        '-nic', 'none', '-display', 'none', '-monitor', 'none', '-serial', 'stdio', '-device', 'loader,file=/guest.elf,cpu-num=0'],
      wasmBinary: readFileSync(new URL('qemu-system-aarch64.wasm', engine)),
      mainScriptUrlOrBlob: new URL('out.js', engine).href,
      locateFile: name => name.endsWith('.worker.js') ? worker : fileURLToPath(new URL(name, engine)),
      preRun: [module => module.FS_createDataFile('/', 'guest.elf', readFileSync(new URL(`build/${mode}.elf`, root)), true, false, true)],
      print: console.log, printErr: console.error, onAbort: reason => finish(Error(String(reason))),
    });
    const oldPoll = instance.TTY.stream_ops.poll;
    instance.TTY.stream_ops.poll = function(stream, wait) { return pty.readable ? oldPoll.call(this, stream, wait) : 4; };
  } catch (error) { finish(error); }
}
