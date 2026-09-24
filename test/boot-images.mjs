#!/usr/bin/env node
// Exercise the public launcher, not a separate QEMU configuration: both frontend
// modes must boot from both ELF and raw ARM images and leave through the monitor.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = path => readFileSync(resolve(root, path));
const hash = content => createHash('sha256').update(content).digest('hex');
const aggregate = JSON.parse(read('build/manifest.json'));
const modes = ['t0', 'js'];
for (const mode of modes) {
  const manifestPath = `build/${mode}.json`;
  const manifest = JSON.parse(read(manifestPath));
  assert.equal(manifest.mode, mode);
  assert.equal(manifest.ramMiB, 512);
  assert.equal(manifest.base, 0x40200000);
  assert.equal(manifest.bytes, read(`build/${mode}.bin`).length);
  assert.equal(manifest.sha256, hash(read(`build/${mode}.bin`)), `${mode} raw-image hash`);
  for (const [path, expected] of Object.entries(manifest.inputs)) {
    assert.equal(hash(read(path)), expected, `${mode} manifest input ${path}; rebuild images after source changes`);
  }
  for (const [path, expected] of Object.entries(manifest.outputs)) {
    assert.equal(hash(read(path)), expected, `${mode} manifest output ${path}`);
  }
  assert.equal(aggregate.variants[mode]?.manifest, manifestPath);
  assert.equal(aggregate.variants[mode]?.sha256, hash(read(manifestPath)), `${mode} manifest hash`);
  for (const extension of ['bin', 'elf']) {
    assert.deepEqual(read(`build/${mode}-full.${extension}`), read(`build/${mode}.${extension}`), `${mode} compatibility ${extension} image`);
  }
}
console.log('PASS manifests: input/output hashes, image sizes, target RAM, and compatibility aliases');

async function bootImage(mode, raw) {
  const label = `${mode} ${raw ? 'raw ARM' : 'ELF'}`;
  const args = ['tools/run.mjs', '--mode', mode, '--image', `build/${mode}.${raw ? 'bin' : 'elf'}`];
  if (raw) args.push('--raw');
  const child = spawn(process.execPath, args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '', diagnostics = '', commandSent = false, exitSent = false, timedOut = false, processError;
  let force;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM'); // tools/run.mjs forwards this to its QEMU child.
    force = setTimeout(() => child.kill('SIGKILL'), 2000);
  }, 20_000);
  child.on('error', error => { processError = error; });
  child.stdin.on('error', error => { processError ??= error; });
  child.stderr.setEncoding('utf8');
  child.stdout.setEncoding('utf8');
  child.stderr.on('data', text => { diagnostics = (diagnostics + text).slice(-8192); });
  child.stdout.on('data', text => {
    output = (output + text).slice(-65536);
    if (!commandSent && output.includes(`${mode}> `)) {
      commandSent = true;
      child.stdin.write(mode === 'js' ? '6 * 7\n' : '6 7 * print\n');
    }
    if (!exitSent && /(?:^|\r?\n)42\r?\n/.test(output)) {
      exitSent = true;
      child.stdin.write('\x01x'); // QEMU's public Ctrl-a, x exit sequence.
    }
  });
  const { code, signal } = await new Promise(resolveClose => child.once('close', (code, signal) => resolveClose({ code, signal })));
  clearTimeout(timeout); clearTimeout(force);
  const context = `${label}\n${output}\n${diagnostics}`;
  assert.equal(timedOut, false, `Launcher timed out: ${context}`);
  assert.equal(processError, undefined, `Launcher stream/process error: ${processError?.message}\n${context}`);
  assert.equal(commandSent, true, `Guest prompt was not reached: ${context}`);
  assert.equal(exitSent, true, `Guest did not evaluate to 42: ${context}`);
  assert.equal(signal, null, `Launcher was killed: ${context}`);
  assert.equal(code, 0, `QEMU monitor exit failed: ${context}`);
  assert.match(output, /512 MiB/, `Launcher memory description: ${context}`);
  console.log(`PASS launcher: ${label} boots, evaluates 42, and exits through QEMU's monitor`);
}

for (const mode of modes) for (const raw of [false, true]) await bootImage(mode, raw);
console.log('Verified all 4 public launcher/image combinations.');
