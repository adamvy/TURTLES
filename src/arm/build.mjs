#!/usr/bin/env node
// Node assembles the guest and embeds the same T0 modules used by the JS host.
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {assemble} from './assembler.mjs';
import {elf64} from './image.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFileSync(resolve(root, file), 'utf8');
const primitives = {
  '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', mod: 'mod', '^': 'pow', '%': 'percent',
  '=': 'equal', '!=': 'not_equal', '<': 'less', '<=': 'less_equal', '>': 'greater', '>=': 'greater_equal',
  '!': 'not', '&': 'and', '|': 'or', '&&': 'lazy_and', '||': 'lazy_or', if: 'if', ifelse: 'ifelse', while: 'while',
  '()': 'call', eval: 'eval', print: 'print', debugger: 'debugger', const: 'const', ';': 'semicolon', parseInt: 'parse_int',
  pick: 'pick', '[': 'array_start', ']': 'array_end', '@': 'get', ':@': 'set', len: 'len', byteLen: 'byte_len',
  sourceLen: 'byte_len', sourceCharAt: 'source_char_at', sourceNext: 'source_next',
  '[]WithValue': 'array_value', '[]WithFn': 'array_fn',
  '+$': 'concat', '=$': 'string_equal', '$<': 'string_less', '$<=': 'string_less_equal',
  '$>': 'string_greater', '$>=': 'string_greater_equal', strlen: 'string_len',
  'print$': 'string_print', '>$': 'to_string', '$indexOf': 'string_index_of',
  charAt: 'char_at', charCode: 'char_code', indexOf: 'index_of', depth: 'depth', clear: 'clear', reset: 'reset', include: 'include',
};

function string(label, value) {
  const bytes = Buffer.from(value, 'utf8');
  return `.align 3\n${label}:\n .quad ${bytes.length}\n .byte ${[...bytes, 0].join(',')}\n`;
}

function moduleSource(file) {
  const sources = [];
  // Trusted repository wrappers: capture evaluated template strings, including
  // their JS escapes, without running the T0 compiler on the build host.
  vm.runInNewContext(read(file), {scope: {eval$(source) {
    if (typeof source !== 'string') throw Error(`Invalid T0 module: ${file}`);
    sources.push(source);
  }}}, {filename: file, timeout: 1000});
  if (!sources.length) throw Error(`No scope.eval$ source in ${file}`);
  return sources.join('\n');
}

export function build() {
  const runtime = ['boot', 'platform', 'values', 'primitives', 'core', 'numbers']
    .map(name => read(`src/arm/${name}.s`)).join('\n.align 3\n');
  const prelude = read('src/t0.js').match(/scope\.eval\$\(`([\s\S]*?)`\);/)?.[1];
  if (!prelude) throw Error('T0 prelude not found in src/t0.js');
  const modules = Object.fromEntries(['parsers', 'jsparser', 'som'].map(name => [name, moduleSource(`src/${name}.js`)]));
  let data = '.align 3\nprimitive_table:\n';
  Object.entries(primitives).forEach(([name, op], i) => { data += ` .quad primitive_name_${i}, prim_${op}\n`; });
  data += ' .quad 0, 0\n';
  Object.keys(primitives).forEach((name, i) => { data += string(`primitive_name_${i}`, name); });
  for (const [label, value] of Object.entries({str_empty: '', str_array_marker: '__arrayStart__',
    js_eval_command: 'jsEval', som_eval_command: 'somEval', boot_prelude: prelude})) data += string(label, value);
  for (const [name, source] of Object.entries(modules)) data += string(`module_${name}`, source);
  data += '.align 3\nembedded_modules:\n';
  for (const name of Object.keys(modules)) data += ` .quad module_name_${name}, module_${name}\n`;
  data += ' .quad 0, 0\n';
  for (const name of Object.keys(modules)) data += string(`module_name_${name}`, `${name}.js`);
  mkdirSync(resolve(root, 'build'), {recursive: true});
  const base = 0x40200000, {buffer, symbols} = assemble(`${runtime}\n${data}`, {base});
  if (base + buffer.length >= 0x40800000) throw Error('Image overlaps the T0 data stack');
  const entry = symbols.get('_start'), stem = resolve(root, 'build/turtles');
  writeFileSync(`${stem}.bin`, buffer);
  writeFileSync(`${stem}.elf`, elf64(buffer, base, entry));
  console.log(`Built build/turtles.elf and .bin (${buffer.length} ARM bytes)`);
  return {base, entry, bytes: buffer.length, elf: `${stem}.elf`, bin: `${stem}.bin`};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw Error('Usage: node src/arm/build.mjs');
  build();
}
