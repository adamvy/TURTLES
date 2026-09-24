#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { imageFor, qemuArguments, qemuBinary, validateMode } from './qemu-config.mjs';

const usage = 'Usage: node tools/run.mjs [--mode t0|js] [--raw] [--image PATH]';
let mode = 't0', image, raw = false;
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { console.log(usage + '\nQuit QEMU: Ctrl-a then x.'); process.exit(0); }
for (let index = 0; index < args.length; index++) {
  if (args[index] === '--raw') raw = true;
  else if (args[index] === '--mode' && args[index + 1]) mode = validateMode(args[++index]);
  else if (args[index] === '--image' && args[index + 1]) image = args[++index];
  else throw Error(usage);
}
const selected = imageFor({ mode, image, raw });
console.log(`Booting ${mode === 'js' ? 'the JS-like frontend in T0' : 'raw T0'} · Cortex-A53 · 512 MiB.`);
console.log(`Image: ${selected.path}\nQuit QEMU: Ctrl-a then x.`);
const child = spawn(qemuBinary(), qemuArguments({ image: selected.path, raw: selected.raw, interactive: true }), { stdio: 'inherit' });
child.on('error', error => { console.error(`Cannot start QEMU: ${error.message}`); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));
