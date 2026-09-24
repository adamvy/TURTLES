import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const defaultImage = resolve(root, 'build/t0.elf');
/**
 * Flatten trusted T0 test programs for single-line differential cases.
 * T0 recognizes comments and string openers as whitespace-delimited tokens.
 * Preserve literal text and block comments; remove // comments. A multiline
 * string requires the separate native paste transport, so reject it here.
 */
export function toSingleLine(source) {
  const parts = [];
  let position = 0;
  while (position < source.length) {
    while (position < source.length && /\s/.test(source[position])) position++;
    if (position === source.length) break;
    const start = position;
    while (position < source.length && !/\s/.test(source[position])) position++;
    const token = source.slice(start, position);
    if (token === '//') {
      const end = source.indexOf('\n', position);
      position = end < 0 ? source.length : end + 1;
      continue;
    }
    if (token === '/*') {
      let ended = false;
      while (position < source.length) {
        while (position < source.length && /\s/.test(source[position])) position++;
        const wordStart = position;
        while (position < source.length && !/\s/.test(source[position])) position++;
        if (source.slice(wordStart, position) === '*/') {
          ended = true;
          break;
        }
      }
      if (!ended) throw new Error('Cannot flatten an unterminated T0 block comment');
      parts.push(source.slice(start, position).replace(/\r\n|[\r\n]/g, ' '));
      continue;
    }
    if (token === '"' || token === '"""') {
      // readSym consumes one whitespace character before the string reader.
      const contentStart = Math.min(position + 1, source.length);
      const end = source.indexOf(token, contentStart);
      if (end < 0) throw new Error('Cannot flatten an unterminated T0 string');
      const content = source.slice(contentStart, end);
      if (/[\r\n]/.test(content)) throw new Error('Use the paste transport for multiline strings');
      parts.push(`${token} ${content}${token}`);
      position = end + token.length;
      continue;
    }
    parts.push(token);
  }
  return parts.join(' ');
}

/** A bounded, serial request/response session with the actual emulated UART. */
export class QemuSession {
  constructor({ elfPath = defaultImage, rawPath, rawAddress = '0x40200000', qemuBinary = process.env.QEMU_BINARY || process.env.QEMU || 'qemu-system-aarch64', timeoutMs = 5000 } = {}) {
    this.elfPath = resolve(elfPath);
    this.rawPath = rawPath === undefined ? undefined : resolve(rawPath);
    this.imagePath = this.rawPath || this.elfPath;
    this.qemuBinary = qemuBinary;
    this.timeoutMs = timeoutMs;
    this.args = [
      '-machine', 'virt-8.2', '-cpu', 'cortex-a53', '-accel', 'tcg',
      '-m', '512M', '-smp', '1', '-display', 'none', '-monitor', 'none',
      '-serial', 'stdio', '-device', this.rawPath
        ? `loader,file=${this.rawPath},addr=${rawAddress},cpu-num=0,force-raw=on`
        : `loader,file=${this.elfPath},cpu-num=0`,
    ];
    this.transcript = '';
    this.stderr = '';
    this.buffer = '';
    this.pending = null;
    this.failure = null;
    this.child = null;
    this.closed = null;
  }

  async start() {
    if (this.child) throw new Error('QEMU session already started');
    await access(this.imagePath);
    const child = this.child = spawn(this.qemuBinary, this.args, {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.closed = new Promise(resolveClose => child.once('close', (code, signal) => {
      this.fail(new Error(`QEMU exited (${signal || code})${this.stderr ? `: ${this.stderr.trim()}` : ''}`));
      resolveClose({ code, signal });
    }));
    child.once('error', error => this.fail(error));
    child.stdin.on('error', error => this.fail(error));
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      this.transcript += chunk;
      this.buffer += chunk;
      this.consumePrompt();
    });
    child.stderr.on('data', chunk => { this.stderr += chunk; });
    return this.waitForPrompt(Math.max(this.timeoutMs, 10000));
  }

  fail(error) {
    this.failure ??= error;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      const pending = this.pending;
      this.pending = null;
      pending.reject(this.failure);
    }
  }

  consumePrompt() {
    if (!this.pending) return;
    const match = /(?:^|\n)t0> /.exec(this.buffer);
    if (!match) return;
    const end = match.index + match[0].length;
    const raw = this.buffer.slice(0, end);
    this.buffer = this.buffer.slice(end);
    clearTimeout(this.pending.timer);
    const pending = this.pending;
    this.pending = null;
    pending.resolve(raw);
  }

  waitForPrompt(timeoutMs = this.timeoutMs) {
    if (this.failure) return Promise.reject(this.failure);
    if (this.pending) return Promise.reject(new Error('Only one QEMU request may be outstanding'));
    return new Promise((resolvePrompt, reject) => {
      const timer = setTimeout(() => {
        this.fail(new Error(`Timed out waiting for the T0 prompt after ${timeoutMs} ms. UART tail: ${JSON.stringify(this.buffer.slice(-1000))}`));
      }, timeoutMs);
      this.pending = { resolve: resolvePrompt, reject, timer };
      this.consumePrompt();
    });
  }

  async sendLine(source, { timeoutMs = this.timeoutMs } = {}) {
    if (!this.child) throw new Error('QEMU session has not started');
    if (this.pending) throw new Error('Only one QEMU request may be outstanding');
    if (/[\r\n]/.test(source)) throw new Error('sendLine requires a single line; use toSingleLine for T0 programs');
    if (Buffer.byteLength(source) >= 65536) throw new Error('Source exceeds the native REPL input buffer');
    const waiting = this.waitForPrompt(timeoutMs);
    if (!this.failure) this.child.stdin.write(`${source}\n`);
    const raw = await waiting;
    const body = raw.replace(/\r\n/g, '\n').replace(/\rt0> $/, '\nt0> ').replace(/t0> $/, '');
    const output = body.split('\n');
    assert.equal(output.shift(), source, 'QEMU UART must echo the complete submitted source');
    // Remove the line terminator before the prompt, retaining intentional
    // empty lines printed by the program.
    if (output.at(-1) === '') output.pop();
    return { raw, output };
  }

  async stop() {
    if (!this.child) return;
    const child = this.child;
    if (child.exitCode !== null || child.signalCode !== null) {
      await this.closed;
      return;
    }
    child.kill('SIGTERM');
    let timer;
    const force = new Promise(resolveForce => {
      timer = setTimeout(() => {
        child.kill('SIGKILL');
        resolveForce();
      }, 1000);
    });
    await Promise.race([this.closed, force]);
    clearTimeout(timer);
    await this.closed;
  }
}

// Retain the original test command as an entry point to the complete suite.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length > 2) throw Error('Use node test/full-qemu.mjs for filtering options');
  import('./full-qemu.mjs').then(async ({ runFullQemuTests }) => {
    const results = await runFullQemuTests();
    if (results.some(result => !result.passed)) process.exitCode = 1;
  }).catch(error => { console.error(error); process.exitCode = 1; });
}
