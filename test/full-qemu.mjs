import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { QemuSession, toSingleLine } from './qemu.mjs';
import { allCases } from './cases.mjs';
import { fullCases } from './full-cases.mjs';
import { jsCases, invalidJSCases } from './js-cases.mjs';
import { createReference, runReference } from './reference.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));

export class FullQemuSession extends QemuSession {
  constructor({ mode = 't0', timeoutMs = 10000, ...options } = {}) {
    super({ elfPath: resolve(root, `build/${mode}-full.elf`), timeoutMs, ...options });
    this.args[this.args.indexOf('-m') + 1] = '512M';
    this.mode = mode;
    this.prompt = mode === 'js' ? 'js> ' : 't0> ';
    this.waitingForHalt = false;
  }

  consumePrompt() {
    if (!this.pending) return;
    const halt = /(?:^|\n)HALTED: [^\r\n]*\r?\n/.exec(this.buffer);
    const prompt = new RegExp(`(?:^|\\n)${this.prompt}`).exec(this.buffer);
    if (halt && !this.waitingForHalt) {
      this.fail(new Error(`Unexpected guest halt: ${halt[0].trim()}`));
      return;
    }
    if (this.waitingForHalt && prompt && !halt) {
      this.fail(new Error('Guest returned a prompt instead of halting on exhaustion'));
      return;
    }
    const match = this.waitingForHalt ? halt : prompt;
    if (!match) return;
    const end = match.index + match[0].length;
    const raw = this.buffer.slice(0, end);
    this.buffer = this.buffer.slice(end);
    clearTimeout(this.pending.timer);
    const pending = this.pending;
    this.pending = null;
    pending.resolve(raw);
  }

  async sendLine(source, { timeoutMs = this.timeoutMs } = {}) {
    if (!this.child) throw new Error('QEMU session has not started');
    if (this.pending) throw new Error('Only one QEMU request may be outstanding');
    if (/[\r\n]/.test(source)) throw new Error('Full T0 UART input is line-oriented');
    if (Buffer.byteLength(source) >= 65536) throw new Error('Input exceeds the full REPL buffer');
    const waiting = this.waitForPrompt(timeoutMs);
    if (!this.failure) this.child.stdin.write(`${source}\n`);
    const raw = await waiting;
    const body = raw.replace(/\r\n/g, '\n').slice(0, -this.prompt.length);
    const output = body.split('\n');
    assert.equal(output.shift(), source, 'UART source echo must match submitted bytes');
    if (output.at(-1) === '') output.pop();
    return { raw, output };
  }

  async sendUntilHalt(source) {
    if (this.pending) throw new Error('Only one QEMU request may be outstanding');
    this.waitingForHalt = true;
    const waiting = this.waitForPrompt();
    this.child.stdin.write(`${source}\n`);
    const raw = await waiting;
    // A halted no-GC image cannot silently reset or execute another command.
    const length = this.transcript.length;
    this.child.stdin.write('1 2 + print\n');
    await delay(150);
    assert.equal(this.transcript.length, length, 'HALTED must remain stopped until host reboot');
    return raw;
  }

  async sendPaste(source, { cancel = false } = {}) {
    if (this.pending) throw new Error('Only one QEMU request may be outstanding');
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    if (lines.at(-1) === '') lines.pop();
    if (lines.some(line => line === ':end' || line === ':cancel')) throw new Error('Source contains a paste protocol terminator');
    const terminator = cancel ? ':cancel' : ':end';
    const waiting = this.waitForPrompt();
    this.child.stdin.write(`:paste\n${lines.map(line => `${line}\n`).join('')}${terminator}\n`);
    const raw = await waiting;
    const normalized = raw.replace(/\r\n/g, '\n');
    const echo = `:paste\n${lines.map(line => `... ${line}\n`).join('')}... ${terminator}\n`;
    assert.equal(normalized.slice(0, echo.length), echo, 'Multiline source must echo before evaluation');
    const output = normalized.slice(echo.length, -this.prompt.length).split('\n');
    if (output.at(-1) === '') output.pop();
    return { raw, output, source: cancel ? '' : lines.map(line => `${line}\n`).join('') };
  }
}

function printed(value, inArray = false) {
  if (value === null) return inArray ? '' : 'null';
  if (Array.isArray(value)) return value.map(item => printed(item, true)).join(',');
  if (value?.type === 'number') return value.value;
  if (value?.type === 'undefined') return inArray ? '' : 'undefined';
  return String(value);
}

function nativeLines(referenceLines) {
  return referenceLines.flatMap(line => line.replace(/\r\n/g, '\n').split('\n'));
}

// The supported JS-like grammar has no string literals. Removing // comments
// and joining physical lines preserves these curated REPL examples exactly.
function jsLine(source) {
  return source.replace(/\/\/[^\r\n]*/g, '').replace(/[\r\n]/g, ' ').trim();
}

const resourceCases = [
  { name: 'arena exhaustion halts', source: '10000000 0 []WithValue drop 10000000 0 []WithValue', message: /HALTED: compiler\/frame arena exhausted/ },
  { name: 'value heap exhaustion halts', source: '{ let \'x :text | 0 29 { i | text text + :text } for } ()', message: /HALTED: value heap exhausted/ },
  { name: 'data stack exhaustion halts', source: '0 70000 { i | 1 } for', message: /HALTED: data stack exhausted/ },
  { name: 'native call stack exhaustion halts', source: '{ | recurse } ::recurse recurse', message: /HALTED: native call stack exhausted/ },
];

export async function runFullQemuTests({ t0 = true, js = true, exhaustion = true, filter = '', transcriptPath = resolve(root, 'build/full-boot-transcript.txt') } = {}) {
  const results = [];
  const sessions = [];
  let session;
  let interrupted;
  const abort = signal => {
    if (interrupted) return;
    interrupted = Object.assign(new Error(`Full QEMU tests interrupted by ${signal}`), { exitCode: signal === 'SIGINT' ? 130 : 143 });
    for (const child of sessions) child.fail(interrupted);
    void Promise.allSettled(sessions.map(child => child.stop()));
  };
  const onInterrupt = () => abort('SIGINT');
  const onTerminate = () => abort('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  const selected = name => !filter || name.toLowerCase().includes(filter.toLowerCase());
  const open = async mode => {
    const next = new FullQemuSession({ mode });
    next.imageSha256 = createHash('sha256').update(await readFile(next.imagePath)).digest('hex');
    sessions.push(next);
    const boot = await next.start();
    assert.match(boot, /TURTLES \/ AArch64 bare metal/);
    return next;
  };
  const record = async (name, execute) => {
    if (interrupted) throw interrupted;
    if (!selected(name)) return;
    try {
      await execute();
      results.push({ name, passed: true });
      console.log(`PASS ${name}`);
    } catch (error) {
      results.push({ name, passed: false, error: String(error) });
      console.error(`FAIL ${name}\n${error}`);
      if (session?.failure) {
        await session.stop();
        session = undefined;
      }
    }
  };
  const reset = async mode => {
    if (session?.mode !== mode) {
      if (session) await session.stop();
      session = undefined;
    }
    if (!session) session = await open(mode);
    else await session.sendLine('reset');
  };
  try {
    if (t0) {
      for (const example of [...allCases, ...fullCases]) {
        await record(`T0: ${example.name}`, async () => {
          await reset('t0');
          const source = toSingleLine(example.source);
          const reference = runReference(source);
          assert.deepEqual(reference.diagnostics.filter(item => item.level === 'error'), []);
          const native = await session.sendLine(source);
          assert.deepEqual(native.output, nativeLines(reference.output));
        });
      }
      const multilineCases = [
        { name: 'comments and block source', source: '{ x |\n// retain this line break\nx 2 *\n} :twice\n21 twice () print' },
        { name: 'triple quoted multiline string', source: '""" alpha\nβ😀\nomega""" print' },
        { name: 'input and instruction positions retain newlines', source: 'input_ print\nip_ print\n{ | input_ } :readSource\nreadSource () print' },
      ];
      for (const example of multilineCases) {
        await record(`Multiline: ${example.name}`, async () => {
          await reset('t0');
          const actual = await session.sendPaste(example.source);
          assert.deepEqual(actual.output, nativeLines(runReference(actual.source).output));
        });
      }
      await record('Multiline: cancel discards source without side effects', async () => {
        await reset('t0');
        await session.sendLine('42 :survivor');
        assert.deepEqual((await session.sendPaste('99 :survivor\n1 0 / print', { cancel: true })).output, []);
        assert.deepEqual((await session.sendLine('survivor print')).output, ['42']);
      });
      await record('Multiline: overflow drains through end and discards all source', async () => {
        await reset('t0');
        await session.sendLine('42 :survivor');
        const oversized = `99 :survivor\n${' '.repeat(66000)}\n88 :survivor`;
        assert.deepEqual((await session.sendPaste(oversized)).output, ['Error: input exceeds 65535 UTF8 bytes']);
        assert.deepEqual((await session.sendLine('survivor print 6 7 * print')).output, ['42', '42']);
      });
      await record('Multiline: exact-fit source still accepts end directive', async () => {
        await reset('t0');
        const prefix = '42 print';
        // read_source appends one LF after the content line: 65,534 + LF is
        // exactly 65,535 bytes. The following :end is terminal protocol and
        // must not need additional room in the already-full source buffer.
        const source = prefix + ' '.repeat(65534 - prefix.length);
        assert.deepEqual((await session.sendPaste(source)).output, ['42']);
        assert.deepEqual((await session.sendLine('6 7 * print')).output, ['42']);
      });
      await record('Multiline: exact-fit source can still be cancelled', async () => {
        await reset('t0');
        await session.sendLine('42 :survivor');
        const prefix = '99 :survivor';
        const source = prefix + ' '.repeat(65534 - prefix.length);
        assert.deepEqual((await session.sendPaste(source, { cancel: true })).output, []);
        assert.deepEqual((await session.sendLine('survivor print')).output, ['42']);
      });
      await record('Multiline: short source tail fits through directive scratch buffer', async () => {
        await reset('t0');
        const prefix = '42';
        // First line + LF uses 65,529 bytes, leaving seven bytes including
        // NUL. "print" + LF exactly fills the remaining source capacity.
        const source = prefix + ' '.repeat(65528 - prefix.length) + '\nprint';
        assert.deepEqual((await session.sendPaste(source)).output, ['42']);
      });
      await record('Interactive: backspace removes whole UTF8 character', async () => {
        await reset('t0');
        for (const removed of ['é', '😀']) {
          const waiting = session.waitForPrompt();
          session.child.stdin.write(`'${removed}\x7fX print\n`);
          const raw = (await waiting).replace(/\r\n/g, '\n');
          assert.equal(raw, `'${removed}\b \bX print\nX\nt0> `);
        }
        assert.deepEqual((await session.sendLine('6 7 * print')).output, ['42']);
      });
      await record('Interactive: runtime errors preserve definitions and partial values', async () => {
        await reset('t0');
        await session.sendLine('42 :survivor');
        assert.match((await session.sendLine('99 __missing_full_test_word__')).output.join('\n'), /^Error:/);
        assert.deepEqual((await session.sendLine('print survivor print')).output, ['99', '42']);
        for (const badSource of ['1 ()', '{ x | x', '" unterminated', '/* unterminated', '" x" 9 charAt eval', '[ ] 0 @ eval', '[ 1 ] eval']) {
          assert.match((await session.sendLine(badSource)).output.join('\n'), /^Error:/);
          assert.deepEqual((await session.sendLine('survivor print 6 7 * print')).output, ['42', '42']);
        }
      });
    }
    if (js) {
      await record('Multiline: JS-like block and comments', async () => {
        await reset('js');
        const source = 'i=0;\n// grow the counter\nwhile(i<3){\ni=i+1;\n};\ni';
        const actual = await session.sendPaste(source);
        const expected = createReference({ loadJS: true, timeoutMs: 3000 }).evaluateJS(actual.source);
        assert.equal(expected.accepted, true);
        assert.deepEqual(actual.output, [printed(expected.stack.at(-1))]);
      });
      for (const example of jsCases) {
        await record(`JS REPL: ${example.name}`, async () => {
          await reset('js');
          const reference = createReference({ loadJS: true, timeoutMs: 3000 });
          let oldLength = 0;
          for (const source of example.sources.map(jsLine)) {
            const expected = reference.evaluateJS(source);
            assert.equal(expected.accepted, true);
            const expectedOutput = [...expected.output];
            if (expected.stack.length > oldLength) expectedOutput.push(printed(expected.stack.at(-1)));
            oldLength = expected.stack.length;
            assert.deepEqual((await session.sendLine(source)).output, nativeLines(expectedOutput));
          }
          assert.deepEqual(reference.snapshot().stack, example.expected);
        });
      }
      for (const source of invalidJSCases) {
        await record(`JS rejects: ${JSON.stringify(source)}`, async () => {
          await reset('js');
          assert.deepEqual((await session.sendLine('answer=42')).output, ['42']);
          assert.deepEqual((await session.sendLine(source)).output, ['Error: invalid JS-like source']);
          assert.deepEqual((await session.sendLine('answer')).output, ['42']);
        });
      }
      for (const example of jsCases) {
        await record(`JS complete stack through T0: ${example.name}`, async () => {
          await reset('t0');
          assert.deepEqual((await session.sendLine("'parsers.t0 include 'jsparser.t0 include 'js-repl.t0 include")).output, []);
          for (const source of example.sources.map(jsLine)) {
            assert.deepEqual((await session.sendLine(`""" ${source}""" jsEval`)).output, []);
          }
          if (example.expected.length) {
            const actual = await session.sendLine(Array(example.expected.length).fill('print').join(' '));
            assert.deepEqual(actual.output, nativeLines([...example.expected].reverse().map(value => printed(value))));
          }
          assert.deepEqual((await session.sendLine('depth print')).output, ['0']);
        });
      }
    }
    if (exhaustion) {
      for (const example of resourceCases) {
        await record(`Resources: ${example.name}`, async () => {
          if (session) await session.stop();
          session = await open('t0');
          try {
            assert.match(await session.sendUntilHalt(example.source), example.message);
          } finally {
            await session.stop();
            session = undefined;
          }
        });
      }
    }
  } finally {
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    for (const child of sessions) await child.stop();
    await mkdir(dirname(transcriptPath), { recursive: true });
    await writeFile(transcriptPath, sessions.map((child, index) => `# Session ${index + 1}: ${child.mode}\n# ELF SHA256: ${child.imageSha256}\n# ${child.qemuBinary} ${child.args.join(' ')}\n${child.transcript}`).join('\n'));
    await writeFile(resolve(root, 'build/full-conformance-results.json'), JSON.stringify(results, null, 2));
  }
  console.log(`${results.filter(result => result.passed).length}/${results.length} full QEMU cases passed`);
  console.log(`UART transcript: ${transcriptPath}`);
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--t0-only') options.js = false;
    else if (args[i] === '--js-only') options.t0 = false;
    else if (args[i] === '--no-exhaustion') options.exhaustion = false;
    else if (args[i] === '--filter' && args[i + 1]) options.filter = args[++i];
    else throw new Error('Usage: node test/full-qemu.mjs [--t0-only|--js-only] [--no-exhaustion] [--filter text]');
  }
  const results = await runFullQemuTests(options);
  if (results.some(result => !result.passed)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = error.exitCode ?? 1; });
}
