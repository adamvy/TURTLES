#!/usr/bin/env node
// Build the images and package one static REPL. QEMU downloads from its author.
import {readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve, dirname, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
execFileSync(process.execPath, ['src/arm/build.mjs'], {cwd: root, stdio: 'inherit'});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const revision = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
const repository = process.env.GITHUB_REPOSITORY || 'adamvy/TURTLES';
const releaseTag = process.env.RELEASE_TAG || 'preview';
if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^[\w.-]+$/.test(releaseTag)) throw Error('Invalid repository or release tag');
const releaseURL = `https://github.com/${repository}/releases/${releaseTag === 'preview' ? 'latest' : `tag/${releaseTag}`}`;
const downloadBase = `https://github.com/${repository}/releases/${releaseTag === 'preview' ? 'latest/download' : `download/${releaseTag}`}`;
const destination = resolve(root, 'dist'), releases = resolve(root, 'build/release');
for (const path of [destination, releases]) { rmSync(path, {recursive: true, force: true}); mkdirSync(path, {recursive: true}); }
for (const file of ['index.html', 'style.css', 'repl.mjs', 'isolation.js', 'coi-serviceworker.js',
  'qemu.mjs', 'guest.html', 'guest.mjs', 'host.js', 't0.js', 'parsers.js', 'jsparser.js']) {
  copyFileSync(resolve(root, 'src', file), resolve(destination, file));
}
for (const file of ['LICENSE', 'turtles.png']) copyFileSync(resolve(root, file), resolve(destination, file));
copyFileSync(resolve(root, 'LICENSE'), resolve(releases, 'LICENSE'));
writeFileSync(resolve(destination, '.nojekyll'), '');
const images = {}, checksums = [`${hash(readFileSync(resolve(root, 'LICENSE')))}  LICENSE`];
for (const mode of ['t0', 'js']) {
  const formats = {};
  for (const extension of ['elf', 'bin']) {
    const filename = `turtles-${mode}.${extension}`;
    const bytes = readFileSync(resolve(root, 'build', filename)), sha256 = hash(bytes);
    const url = `images/${sha256}/${filename}`;
    mkdirSync(dirname(resolve(destination, url)), {recursive: true});
    writeFileSync(resolve(destination, url), bytes);
    writeFileSync(resolve(releases, filename), bytes);
    checksums.push(`${sha256}  ${filename}`);
    formats[extension] = {url, sha256, bytes: bytes.length, downloadURL: `${downloadBase}/${filename}`};
  }
  images[mode] = {...formats.elf, raw: formats.bin};
}
const manifest = {schema: 1, repository, revision, releaseTag, releaseURL,
  machine: 'virt-8.2', architecture: 'aarch64', cpu: 'cortex-a53', ramMiB: 512, images};
const json = JSON.stringify(manifest, null, 2) + '\n';
for (const directory of [destination, releases]) writeFileSync(resolve(directory, 'latest.json'), json);
checksums.push(`${hash(json)}  latest.json`);
writeFileSync(resolve(releases, 'SHA256SUMS'), checksums.join('\n') + '\n');
console.log(`Site: dist/ (${releaseTag}, ${revision.slice(0, 7)}). Release images: build/release/`);

if (process.argv.includes('--serve')) {
  const types = {'.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png'};
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const path = resolve(destination, '.' + name + (name.endsWith('/') ? 'index.html' : ''));
      if (!path.startsWith(destination + sep)) { res.writeHead(403).end(); return; }
      const info = await stat(path);
      if (!info.isFile()) throw Error('Not a file');
      res.writeHead(200, {'Content-Type': types[extname(path)] || 'application/octet-stream', 'Content-Length': info.size});
      if (req.method === 'HEAD') res.end();
      else createReadStream(path).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404).end('Not found'); }
  });
  server.listen(Number(process.env.PORT || 63820), '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${server.address().port}/`));
}
