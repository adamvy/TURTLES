#!/usr/bin/env node
// A loopback-only UART bridge. All submitted programs execute in the ARM guest.
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { root } from './build.mjs';
import { imageFor, qemuArguments, qemuBinary, validateMode } from './qemu-config.mjs';

const usage = 'Usage: node tools/console.mjs [--port PORT] [--mode t0|js]';
let requestedPort = 0, mode = 't0';
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { console.log(usage); process.exit(0); }
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--port' && /^\d+$/.test(args[index + 1] || '')) requestedPort = Number(args[++index]);
  else if (args[index] === '--mode' && args[index + 1]) mode = validateMode(args[++index]);
  else throw Error(usage);
}
if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) throw Error('Port must be between 0 and 65535');
const images = Object.fromEntries(['t0', 'js'].map(value => [value, imageFor({ mode: value }).path]));
const token = randomBytes(32).toString('hex');
const nonce = randomBytes(24).toString('base64');
const html = readFileSync(resolve(root, 'tools/console.html'), 'utf8')
  .replaceAll('__CONSOLE_NONCE__', nonce).replace('__CONSOLE_TOKEN_JSON__', JSON.stringify(token));
const clients = new Set(), history = [];
const HISTORY_LIMIT = 256 * 1024;
let historyBytes = 0, historyTruncated = false, diagnostics = '', child, origin;
let stopping = false, restarting = false, childAlive = false, epoch = 0, serialTail = '';
let lifecycle = { state: 'starting', message: 'Starting QEMU…', mode, epoch };

function packet(event, data) { return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; }
function send(client, event, data) {
  if (client.destroyed || client.writableEnded) { clients.delete(client); return; }
  if (client.writableLength > 1024 * 1024) { clients.delete(client); client.destroy(); return; }
  client.write(packet(event, data));
}
function broadcast(event, data) { for (const client of clients) send(client, event, data); }
function status(state, message, extra = {}) {
  lifecycle = { state, message, mode, epoch, ...extra };
  broadcast('status', lifecycle);
}
function appendUART(text) {
  const bytes = Buffer.byteLength(text);
  history.push({ text, bytes }); historyBytes += bytes;
  while (historyBytes > HISTORY_LIMIT && history.length) {
    historyBytes -= history.shift().bytes; historyTruncated = true;
  }
  broadcast('uart', { text, epoch });
  serialTail = (serialTail + text).slice(-1024);
  if (lifecycle.state === 'booting' && serialTail.includes(mode === 'js' ? 'JS-like REPL ready.' : 'Raw T0 REPL ready.')) {
    status('running', `${mode === 'js' ? 'JS-like frontend' : 'Raw T0'} ready · Cortex-A53 · 512 MiB`);
  }
  if (/(?:^|\n)HALTED: /.test(serialTail) && lifecycle.state !== 'halted') {
    status('halted', 'Guest halted. Reboot to start a fresh machine; the UART output gives the reason.');
  }
}
function reply(response, code, text) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end(text);
}
function authorized(url) {
  const supplied = url.searchParams.get('token') || '';
  return /^[a-f0-9]{64}$/.test(supplied) && timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
}
function readBody(request, limit) {
  return new Promise((resolveBody, reject) => {
    let bytes = 0, overflow = false; const chunks = [];
    request.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > limit) overflow = true;
      else if (!overflow) chunks.push(chunk);
    });
    request.on('end', () => {
      if (overflow) { reject(Object.assign(Error('Source exceeds the guest’s 65,535-byte input buffer'), { status: 413 })); return; }
      try { resolveBody(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
      catch { reject(Object.assign(Error('Source must be valid UTF-8'), { status: 400 })); }
    });
    request.on('error', reject);
  });
}
async function stopGuest() {
  const target = child;
  if (!target || target.exitCode !== null || target.signalCode !== null || !target.pid) return;
  await new Promise(resolveStop => {
    const force = setTimeout(() => target.kill('SIGKILL'), 1500);
    target.once('close', () => { clearTimeout(force); resolveStop(); });
    target.kill('SIGTERM');
  });
}
function startGuest() {
  serialTail = ''; childAlive = false;
  status('booting', `Booting ${mode === 'js' ? 'the JS-like frontend' : 'raw T0'}…`);
  const target = child = spawn(qemuBinary(), qemuArguments({ image: images[mode] }), { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  target.stdout.setEncoding('utf8'); target.stderr.setEncoding('utf8');
  target.stdout.on('data', text => { if (child === target && !restarting && !stopping) appendUART(text); });
  target.stderr.on('data', text => {
    if (child !== target || restarting || stopping) return;
    diagnostics = (diagnostics + text).slice(-16384); broadcast('diagnostic', { text: diagnostics });
  });
  target.once('spawn', () => { if (child === target) childAlive = true; });
  target.once('error', error => { if (child === target) { childAlive = false; status('failed', `Cannot start QEMU: ${error.message}`); } });
  target.stdin.on('error', error => {
    if (child === target && !stopping && !restarting && childAlive) status('failed', `QEMU input failed: ${error.message}`);
  });
  target.once('close', (code, signal) => {
    if (child !== target) return;
    childAlive = false;
    if (!stopping && !restarting) status('exited', signal ? `QEMU exited after ${signal}` : `QEMU exited with status ${code}`, { code, signal });
  });
}
async function reboot(nextMode) {
  if (stopping || restarting) throw Object.assign(Error('A guest restart is already in progress'), { status: 409 });
  restarting = true;
  status('restarting', 'Stopping the current QEMU process…');
  try {
    await stopGuest();
    if (stopping) return;
    mode = nextMode; epoch++;
    history.length = 0; historyBytes = 0; historyTruncated = false; diagnostics = '';
    broadcast('snapshot', { text: '', truncated: false, epoch });
    broadcast('diagnostic', { text: '' });
    restarting = false;
    startGuest();
  } finally { restarting = false; }
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`);
  try {
    // Exact Host, session token, and Origin checks protect the local UART bridge.
    if (!origin || request.headers.host !== new URL(origin).host) { reply(response, 403, 'Invalid host'); request.resume(); return; }
    const url = new URL(request.url, origin);
    if (!authorized(url)) { reply(response, 403, 'This console requires its session URL'); request.resume(); return; }
    if (request.headers.origin && request.headers.origin !== origin) { reply(response, 403, 'Cross-origin requests are not allowed'); request.resume(); return; }
    if (url.pathname !== '/' && request.headers['sec-fetch-site'] === 'cross-site') { reply(response, 403, 'Cross-site requests are not allowed'); request.resume(); return; }
    if (request.method === 'GET' && url.pathname === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html); return;
    }
    if (request.method === 'GET' && url.pathname === '/events') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      response.flushHeaders(); clients.add(response);
      send(response, 'snapshot', { text: history.map(chunk => chunk.text).join(''), truncated: historyTruncated, epoch });
      send(response, 'status', lifecycle);
      if (diagnostics) send(response, 'diagnostic', { text: diagnostics });
      request.on('close', () => clients.delete(response)); return;
    }
    if (request.method === 'POST' && ['/input', '/reboot'].includes(url.pathname)) {
      if (request.headers.origin !== origin) { reply(response, 403, 'A same-origin request is required'); request.resume(); return; }
      if (!/^text\/plain(?:;|$)/i.test(request.headers['content-type'] || '')) { reply(response, 415, 'Send text/plain'); request.resume(); return; }
      const target = child, submittedEpoch = epoch;
      const text = await readBody(request, url.pathname === '/reboot' ? 16 : 65536);
      if (url.pathname === '/reboot') {
        if (!['t0', 'js'].includes(text)) { reply(response, 400, 'Mode must be t0 or js'); return; }
        await reboot(text); response.writeHead(204); response.end(); return;
      }
      if (!childAlive || stopping || restarting || lifecycle.state !== 'running' || child !== target || epoch !== submittedEpoch || target.stdin.destroyed) {
        reply(response, 409, 'The guest is not ready; wait for its prompt or reboot'); return;
      }
      const source = text.replaceAll('\r\n', '\n');
      if (/[\r\x00-\x08\x0b-\x1f\x7f]/.test(source)) { reply(response, 400, 'Source may contain tabs and newlines, but no other control characters'); return; }
      let serial = source + '\n';
      if (source.includes('\n')) {
        if (/^:(?:end|cancel)$/m.test(source)) { reply(response, 400, 'Standalone :end and :cancel lines are reserved by the guest paste protocol'); return; }
        const pasted = source.endsWith('\n') ? source : source + '\n';
        if (Buffer.byteLength(pasted) > 65535) { reply(response, 413, 'Multiline source must fit within 65,535 UTF-8 bytes, including its final newline'); return; }
        serial = ':paste\n' + pasted + ':end\n';
      } else if (Buffer.byteLength(source) > 65535) { reply(response, 413, 'One source line may contain at most 65,535 UTF-8 bytes'); return; }
      if (target.stdin.writableLength > 131072) { reply(response, 429, 'The guest input queue is full'); return; }
      target.stdin.write(serial, error => {
        if (error) reply(response, 502, 'QEMU input is unavailable');
        else if (!response.destroyed) { response.writeHead(204); response.end(); }
      });
      return;
    }
    reply(response, 404, 'Not found'); request.resume();
  } catch (error) { reply(response, error.status || 500, error.message); }
});
server.requestTimeout = 15_000; server.headersTimeout = 10_000; server.maxHeadersCount = 32;
await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(requestedPort, '127.0.0.1', resolveListen); });
origin = `http://127.0.0.1:${server.address().port}`;
console.log(`Turtles UART console: ${origin}/?token=${token}`);
console.log('Raw T0 and JS-like modes use separate bare-metal images. The browser displays actual QEMU serial output.');
startGuest();
const heartbeat = setInterval(() => {
  for (const client of clients) {
    if (client.writableLength > 1024 * 1024) { clients.delete(client); client.destroy(); }
    else client.write(': keepalive\n\n');
  }
}, 15_000);
heartbeat.unref();
async function shutdown() {
  if (stopping) return;
  stopping = true; status('stopping', 'Console server is stopping'); clearInterval(heartbeat);
  for (const client of clients) client.end(); clients.clear();
  server.close(); server.closeIdleConnections();
  await stopGuest(); server.closeAllConnections();
}
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
