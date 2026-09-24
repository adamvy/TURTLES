#!/usr/bin/env node
// Optional local development cache. Public pages fetch these author-hosted files
// on demand; this script does not rebuild QEMU and makes no source-build claim.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { engineLock } from '../web/engine-lock.mjs';

const directory = new URL('../web/vendor/qemu/', import.meta.url);
const verifyOnly = process.argv.includes('--verify');
if (process.argv.some(x => x.startsWith('--') && x !== '--verify')) throw Error('Usage: node tools/browser-engine.mjs [--verify]');
await mkdir(directory, { recursive: true });
for (const [name, expected] of Object.entries(engineLock.files)) {
  const destination = new URL(name, directory);
  let bytes;
  try { bytes = await readFile(destination); } catch {}
  const valid = data => data?.length === expected.bytes && createHash('sha256').update(data).digest('hex') === expected.sha256;
  if (!valid(bytes)) {
    if (verifyOnly) throw Error(`Missing or mismatched browser engine: ${name}`);
    console.log(`Downloading ${name} (${(expected.bytes / 1048576).toFixed(1)} MiB) from the author's pinned repository`);
    const response = await fetch(new URL(name, engineLock.baseURL));
    if (!response.ok) throw Error(`Engine download failed: ${response.status} ${name}`);
    bytes = Buffer.from(await response.arrayBuffer());
    if (!valid(bytes)) throw Error(`Refusing mismatched engine file: ${name}`);
    await writeFile(destination, bytes);
  }
  console.log(`Verified ${name}: ${expected.sha256}`);
}
console.log(`Local development cache: ${fileURLToPath(directory)}`);
