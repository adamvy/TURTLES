#!/usr/bin/env node
// Package verified images with a static site. QEMU itself downloads from its author.
import {readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {engineLock} from '../web/engine-lock.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const read = file => readFileSync(resolve(root, file));
const revision = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const repository = process.env.GITHUB_REPOSITORY || 'adamvy/TURTLES';
const releaseTag = process.env.RELEASE_TAG || 'preview';
if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository) || !/^[a-zA-Z0-9_.-]+$/.test(releaseTag)) throw Error('Invalid repository or release tag');
const releaseURL = `https://github.com/${repository}/releases/${releaseTag === 'preview' ? 'latest' : `tag/${releaseTag}`}`;
const downloadBase = `https://github.com/${repository}/releases/${releaseTag === 'preview' ? 'latest/download' : `download/${releaseTag}`}`;
const imageManifests = Object.fromEntries(['t0', 'js'].map(mode => [mode, JSON.parse(read(`build/${mode}.json`))]));
// Refuse to ship stale or partially rebuilt guest bytes.
for (const [mode, manifest] of Object.entries(imageManifests)) {
  if (manifest.mode !== mode || manifest.machine !== 'virt-8.2' || manifest.ramMiB !== 512) throw Error(`Unsupported ${mode} image`);
  for (const [file, expected] of Object.entries({...manifest.inputs, ...manifest.outputs})) {
    if (hash(read(file)) !== expected) throw Error(`Stale or modified build input/output: ${file}. Rebuild both images.`);
  }
}
const destination = resolve(root, 'dist'), releaseDirectory = resolve(root, 'build/release');
rmSync(destination, {recursive: true, force: true});
rmSync(releaseDirectory, {recursive: true, force: true});
mkdirSync(destination, {recursive: true}); mkdirSync(releaseDirectory, {recursive: true});
const files = ['index.html', 'style.css', 'mark.svg', 'app.mjs', 'isolation.js', 'coi-serviceworker.js',
  'engine.mjs', 'engine-lock.mjs', 'guest.html', 'guest.mjs', 'ENGINE.md', 'vendor/coi/LICENSE', 'vendor/coi/README.md'];
for (const file of files) {
  const target = resolve(destination, file); mkdirSync(dirname(target), {recursive: true});
  copyFileSync(resolve(root, 'web', file), target);
}
copyFileSync(resolve(root, 'LICENSE'), resolve(destination, 'LICENSE'));
writeFileSync(resolve(destination, '.nojekyll'), '');
const images = {}, checksums = [];
for (const mode of ['t0', 'js']) {
  const urls = {};
  for (const extension of ['elf', 'bin', 'json']) {
    const bytes = read(`build/${mode}.${extension}`), sha256 = hash(bytes);
    const filename = `turtles-${mode}.${extension}`;
    const url = `images/${sha256}/${filename}`;
    mkdirSync(dirname(resolve(destination, url)), {recursive: true});
    writeFileSync(resolve(destination, url), bytes);
    writeFileSync(resolve(releaseDirectory, filename), bytes);
    checksums.push(`${sha256}  ${filename}`);
    urls[extension] = {url, sha256, bytes: bytes.length, downloadURL: `${downloadBase}/${filename}`};
  }
  images[mode] = {...urls.elf, raw: urls.bin, manifest: urls.json};
}
const manifest = {schema: 1, repository, revision, releaseTag, releaseURL,
  machine: 'virt-8.2', architecture: 'aarch64', cpu: 'cortex-a53', ramMiB: 512,
  engine: {commit: engineLock.commit, qemuVersion: engineLock.qemuVersion}, images};
const json = JSON.stringify(manifest, null, 2) + '\n';
writeFileSync(resolve(destination, 'latest.json'), json);
writeFileSync(resolve(releaseDirectory, 'latest.json'), json);
checksums.push(`${hash(json)}  latest.json`);
writeFileSync(resolve(releaseDirectory, 'SHA256SUMS'), checksums.join('\n') + '\n');
console.log(`Static site: dist/ (${releaseTag}, ${revision.slice(0, 7)}). Release assets: build/release/`);
