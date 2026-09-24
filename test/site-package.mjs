// Verify the publication boundary: live manifest, mirrored bytes and release assets.
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const manifest = JSON.parse(read('dist/latest.json'));
assert.equal(manifest.schema, 1);
assert.equal(manifest.machine, 'virt-8.2');
assert.deepEqual(read('dist/latest.json'), read('build/release/latest.json'));
const files = new Set(readdirSync(new URL('../dist/', import.meta.url), {recursive: true}));
assert(![...files].some(file => /\.wasm$|vendor\/qemu|engine-test/.test(file)), 'Do not publish downloaded engine/test files');
for (const mode of ['t0', 'js']) {
  for (const [extension, artifact] of [['elf', manifest.images[mode]], ['bin', manifest.images[mode].raw], ['json', manifest.images[mode].manifest]]) {
    const bytes = read(`dist/${artifact.url}`);
    assert.equal(hash(bytes), artifact.sha256);
    assert.equal(bytes.length, artifact.bytes);
    assert(artifact.url.includes(artifact.sha256));
    assert.deepEqual(bytes, read(`build/${mode}.${extension}`));
    assert.deepEqual(bytes, read(`build/release/turtles-${mode}.${extension}`));
  }
}
for (const line of read('build/release/SHA256SUMS').toString().trim().split('\n')) {
  const [expected, path] = line.split('  '); assert.equal(hash(read(`build/release/${path}`)), expected);
}
for (const file of ['index.html', 'guest.html']) {
  const html = read(`dist/${file}`).toString();
  for (const match of html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)) assert(files.has(match[1]), `Missing ${match[1]}`);
}
console.log('Site/release parity, content-addressed images, manifest hashes and static resources passed.');
