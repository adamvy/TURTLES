#!/usr/bin/env node
// JavaScript emits every ARM instruction, data object, ELF header, and manifest.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { assemble } from './assembler.mjs';
import { elf64 } from './image.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const modes = ['t0', 'js'];
const revision = '217cb43d7a16a98abd3e9984d1fc0416f8898d98';
const runtimeFiles = ['boot', 'platform', 'values', 'primitives', 'core', 'numbers'].map(name => `runtime/full/${name}.s`);
const inputFiles = [...runtimeFiles, 'vendor/upstream/t0.js', 'language/parsers.t0', 'language/jsparser.t0',
  'language/js-repl.t0', 'tools/assembler.mjs', 'tools/image.mjs', 'tools/build.mjs', 'tools/build-full.mjs'];
const primitives = {
  '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', mod: 'mod', '^': 'pow', '%': 'percent',
  '=': 'equal', '!=': 'not_equal', '<': 'less', '<=': 'less_equal', '>': 'greater', '>=': 'greater_equal',
  '!': 'not', '&': 'and', '|': 'or', '&&': 'lazy_and', '||': 'lazy_or', if: 'if', ifelse: 'ifelse', while: 'while',
  '()': 'call', eval: 'eval', print: 'print', debugger: 'debugger', const: 'const', ';': 'semicolon', parseFloat: 'parse_float',
  pick: 'pick', '[': 'array_start', ']': 'array_end', '@': 'get', ':@': 'set', len: 'len',
  '[]WithValue': 'array_value', '[]WithFn': 'array_fn', 'string?': 'string_query', 'array?': 'array_query',
  charAt: 'char_at', charCode: 'char_code', indexOf: 'index_of', depth: 'depth', clear: 'clear', reset: 'reset', include: 'include',
};
const hash = content => createHash('sha256').update(content).digest('hex');
function stringObject(label, value) {
  return `.align 3\n${label}:\n .quad 1, ${value.length}\n .byte ${[...Buffer.from(value, 'utf16le'), 0, 0].join(',')}\n`;
}

export function buildImages(requestedModes = modes) {
  if (!requestedModes.length || requestedModes.some(mode => !modes.includes(mode))) throw Error('Build modes must be t0 or js');
  // Capture every input once, so both modes and their hashes describe one snapshot.
  const inputs = new Map(inputFiles.map(path => [path, readFileSync(resolve(root, path))]));
  const read = path => inputs.get(path).toString('utf8');
  const inputHashes = Object.fromEntries([...inputs].map(([path, content]) => [path, hash(content)]));
  const prelude = read('vendor/upstream/t0.js').match(/scope\.eval\$\(`([\s\S]*?)`\);/)?.[1];
  if (!prelude) throw Error('Pinned upstream T0 prelude not found');
  const outputDirectory = resolve(root, 'build');
  mkdirSync(outputDirectory, { recursive: true });
  const built = [];
  for (const mode of [...new Set(requestedModes)]) {
    let source = `.equ BOOT_JS, ${mode === 'js' ? 1 : 0}\n` + runtimeFiles.map(read).join('\n.align 3\n');
    let data = '.align 3\nprimitive_table:\n';
    Object.entries(primitives).forEach(([name, op], index) => { data += ` .quad primitive_name_${index}, prim_${op}\n`; });
    data += ' .quad 0, 0\n';
    Object.keys(primitives).forEach((name, index) => { data += stringObject(`primitive_name_${index}`, name); });
    for (const [label, text] of Object.entries({
      str_empty: '', str_false: 'false', str_true: 'true', str_undefined: 'undefined', str_null: 'null',
      str_length: 'length', str_array_marker: '__arrayStart__', js_eval_command: 'jsEval',
    })) data += stringObject(label, text);
    data += stringObject('boot_prelude', prelude);
    for (const name of ['parsers', 'jsparser', 'jsrepl']) {
      data += stringObject(`module_${name}`, read(name === 'jsrepl' ? 'language/js-repl.t0' : `language/${name}.t0`));
    }
    data += '.align 3\nembedded_modules:\n';
    const modules = { 'parsers.t0': 'parsers', 'parsers.js': 'parsers', 'jsparser.t0': 'jsparser', 'jsparser.js': 'jsparser', 'js-repl.t0': 'jsrepl' };
    Object.entries(modules).forEach(([name, label], index) => { data += ` .quad module_name_${index}, module_${label}\n`; });
    data += ' .quad 0, 0\n';
    Object.keys(modules).forEach((name, index) => { data += stringObject(`module_name_${index}`, name); });
    data += `full_prompt: .asciz ${JSON.stringify(`${mode}> `)}\n`;
    data += `full_ready_message: .asciz ${JSON.stringify(mode === 'js'
      ? 'JS-like REPL ready. Parser and compiler execute in T0.\r\n'
      : 'Raw T0 REPL ready.\r\n')}\n`;
    source += '\n' + data;
    const base = 0x40200000;
    const { buffer, symbols } = assemble(source, { base });
    if (base + buffer.length >= 0x40800000) throw Error('Image overlaps the T0 data stack');
    const entry = symbols.get('_start');
    const outputs = {
      bin: buffer,
      elf: elf64(buffer, base, entry),
      s: source,
      map: [...symbols].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([name, address]) => `${address.toString(16).padStart(16, '0')} ${name}`).join('\n') + '\n',
    };
    const manifest = {
      format: 2, mode, architecture: 'aarch64', machine: 'virt-8.2', cpu: 'cortex-a53', ramMiB: 512,
      base, entry, bytes: buffer.length, sha256: hash(buffer),
      upstream: 'https://github.com/kgrgreer/TURTLES', revision,
      guest: mode === 'js' ? 'Native T0 compiler and VM with the upstream-derived JS-like compiler in T0'
        : 'Native T0 compiler and VM with the upstream T0 prelude',
      builder: 'JavaScript; no external assembler, compiler or linker', gc: false,
      inputs: inputHashes,
      outputs: Object.fromEntries(Object.entries(outputs).map(([extension, content]) => [`build/${mode}.${extension}`, hash(content)])),
    };
    for (const [extension, content] of Object.entries(outputs)) {
      writeFileSync(resolve(outputDirectory, `${mode}.${extension}`), content);
      // Existing focused tests still refer to the full-runtime milestone names.
      writeFileSync(resolve(outputDirectory, `${mode}-full.${extension}`), content);
    }
    const json = JSON.stringify(manifest, null, 2) + '\n';
    writeFileSync(resolve(outputDirectory, `${mode}.json`), json);
    writeFileSync(resolve(outputDirectory, `${mode}-full.json`), json);
    built.push(manifest);
    console.log(`Built ${mode}: ${buffer.length.toLocaleString()} bytes → build/${mode}.elf + build/${mode}.bin`);
  }
  writeFileSync(resolve(outputDirectory, 'manifest.json'), JSON.stringify({
    format: 2, builder: 'JavaScript', revision,
    variants: Object.fromEntries(built.map(manifest => [manifest.mode, {
      manifest: `build/${manifest.mode}.json`, sha256: hash(JSON.stringify(manifest, null, 2) + '\n'),
    }])),
  }, null, 2) + '\n');
  return built;
}

export function buildCLI(args = process.argv.slice(2)) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node tools/build.mjs [--mode t0|js]\nWith no mode, builds both raw T0 and the JS-like frontend.');
    return;
  }
  if (args[0] === '--mode' && args.length === 2) return buildImages([args[1]]);
  if (!args.length || args.every(arg => modes.includes(arg))) return buildImages(args.length ? args : modes);
  throw Error('Usage: node tools/build.mjs [--mode t0|js]');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) buildCLI();
