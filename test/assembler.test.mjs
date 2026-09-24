import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { assemble } from '../tools/assembler.mjs';
import { elf64 } from '../tools/image.mjs';

function words(source, options) {
  const { buffer } = assemble(source, options);
  return Array.from({ length: buffer.length / 4 }, (_, i) => buffer.readUInt32LE(i * 4));
}

test('instructions, labels, constants, strings and data relocation', () => {
  const { buffer, symbols } = assemble(`
    .equ COUNT, 2 * (3 + 1)
    start: mov x0, #COUNT
    b end
    message: .asciz "a//b\\n"
    .balign 8
    pointer: .quad message
    .byte -1, 0, 255
    .space 5, 0xaa
    end: ret
  `);
  assert.equal(symbols.get('start'), 0x40080000);
  assert.equal(symbols.get('COUNT'), 8);
  assert.equal(symbols.get('message'), 0x40080008);
  assert.equal(symbols.get('pointer'), 0x40080010);
  assert.equal(symbols.get('end'), 0x40080020);
  assert.equal(buffer.readUInt32LE(0), 0xd2800100);
  assert.equal(buffer.readUInt32LE(4), 0x14000007);
  assert.equal(buffer.subarray(8, 14).toString(), 'a//b\n\0');
  assert.equal(buffer.readBigUInt64LE(16), 0x40080008n);
  assert.deepEqual([...buffer.subarray(24, 32)], [255, 0, 255, 170, 170, 170, 170, 170]);
  assert.equal(buffer.readUInt32LE(32), 0xd65f03c0);
});

test('arbitrary 64-bit move values and forward absolute addresses', () => {
  assert.deepEqual(words('mov x3, #0x123456789abcdef0'), [0xd29bde03, 0xf2b35783, 0xf2cacf03, 0xf2e24683]);
  assert.deepEqual(words('mov x0, #-1'), [0x92800000]);
  assert.deepEqual(words('mov w0, #-1'), [0x12800000]);
  const result = assemble('mov x0, #end\nend: ret');
  assert.equal(result.symbols.get('end'), 0x40080010);
  assert.equal(result.buffer.length, 20);
});

test('rejects undefined symbols, out-of-range displacements and invalid encodings', () => {
  for (const [source, pattern] of [
    ['b missing', /undefined symbol/], ['wat x0', /unknown instruction/],
    ['b 0', /branch displacement/], ['b 0x40080002', /aligned/],
    ['ldr x0, [x1, #32768]', /12 bits/], ['stp x0,x1,[sp,#7]', /aligned/],
    ['movz x0, #65536', /16 bits/], ['mov x0, #0x10000000000000000', /64 bits/],
    ['lsl w0,w1,#32', /5 bits/], ['add x0,w1,#1', /widths/],
    ['and x0,x1,#0', /bitmask/], ['ret w0', /X register/],
    ['and x0,x1,#0x10000000000000001', /64 bits/],
    ['orr w0,w1,#0x100000001', /32 bits/],
    ['orr x0,x1,x2,lsl #3', /not supported/],
    ['ldr x0,[xzr]', /address base/], ['str sp,[x0]', /cannot be SP/],
    ['ldrsw w0,[x1]', /X register/], ['mrs w0,CurrentEL', /X register/],
    ['mov sp,xzr', /cannot combine/], ['add x0,xzr,#1', /zero register/],
    ['mul d0,d1,d2', /integer registers/], ['sub x0,x1,sp', /integer registers/],
    ['label: nop\nlabel: ret', /duplicate/], ['.byte 256', /8 bits/],
    ['.byte 1\nret', /aligned/], ['.equ X,Y\n.equ Y,X\n.quad X', /cyclic/],
  ]) assert.throws(() => assemble(source), pattern, source);
});

test('ELF64 program header has a loadable AArch64 image and entry point', () => {
  const raw = assemble('nop\nret').buffer;
  for (const base of [0x40080000, 0x40080004, 0x40200000]) {
    const image = elf64(raw, base, base + 4), offset = Number(image.readBigUInt64LE(72));
    assert.equal(image.subarray(0, 4).toString('hex'), '7f454c46');
    assert.equal(image[4], 2); assert.equal(image[5], 1);
    assert.equal(image.readUInt16LE(18), 183);
    assert.equal(image.readBigUInt64LE(24), BigInt(base + 4));
    assert.equal(image.readUInt16LE(56), 1);
    assert.equal(image.readUInt32LE(64), 1);
    assert.equal(image.readUInt32LE(68), 7);
    assert.equal(image.readBigUInt64LE(80), BigInt(base));
    assert.equal(image.readBigUInt64LE(88), BigInt(base));
    assert.equal(image.readBigUInt64LE(96), BigInt(raw.length));
    assert.equal(image.readBigUInt64LE(104), BigInt(raw.length));
    assert.equal(offset % 4096, base % 4096);
    assert.deepEqual(image.subarray(offset), raw);
  }
  assert.throws(() => elf64(raw, 0x40080000, 0), /entry/);
});

function textSection(elf) {
  assert.equal(elf.readUInt16LE(18), 183);
  const shoff = Number(elf.readBigUInt64LE(40)), shsize = elf.readUInt16LE(58), count = elf.readUInt16LE(60);
  const namesHeader = shoff + elf.readUInt16LE(62) * shsize;
  const namesOffset = Number(elf.readBigUInt64LE(namesHeader + 24));
  for (let i = 0; i < count; i++) {
    const header = shoff + i * shsize, nameOffset = namesOffset + elf.readUInt32LE(header);
    const name = elf.toString('utf8', nameOffset, elf.indexOf(0, nameOffset));
    if (name === '.text') { const offset = Number(elf.readBigUInt64LE(header + 24)), length = Number(elf.readBigUInt64LE(header + 32)); return elf.subarray(offset, offset + length); }
  }
  throw Error('clang object has no .text section');
}

const oracleInstructions = `
mov x0, x1
mov w2, w3
mov x4, sp
mov sp, x4
mov x5, #0x1234
mov x6, #-1
movz x7, #0x1234, lsl #48
movk w8, #0x5678, lsl #16
movn x9, #0xabcd, lsl #32
add x0, x1, #7
adds w2, w3, #4095
sub sp, sp, #16
subs x4, x5, #1, lsl #12
add x0, x1, x2
add x0, sp, x2
add w0, wsp, w2
sub x3, x4, x5, lsr #3
adds w6, w7, w8, asr #5
cmp x9, x10
cmp w11, #23
cmn x12, x13
mul x14, x15, x16
madd w1, w2, w3, w4
msub x17, x18, x19, x20
sdiv x21, x22, x23
udiv w24, w25, w26
and x0, x1, x2
orr w3, w4, w5
eor x6, x7, x8
and x1, x1, #0xfffffffffffffff8
orr x0, x1, #1
eor w0, w1, #0xff00ff00
tst x3, #32
lsl x0, x1, #3
lsr w2, w3, #7
asr x4, x5, #63
lsl x6, x7, x8
lsr w9, w10, w11
asr x12, x13, x14
neg x15, x16
mvn w17, w18
clz x0, x1
clz w2, w3
.Lhere:
adr x0, .Lhere
b .Lhere
bl .Lhere
b.eq .Lhere
b.hi .Lhere
cbz x1, .Lhere
cbnz w2, .Lhere
tbz x3, #42, .Lhere
tbnz w4, #7, .Lhere
br x5
blr x6
ret
ret x7
ldr x0, [x1]
str w2, [x3, #8]
ldrb w4, [x5, #7]
strb w6, [x7]
ldrh w8, [x9, #14]
strh w10, [x11, #12]
ldrsw x12, [x13, #4]
ldr x14, [x15, #-8]!
str x16, [x17], #8
ldur x18, [x19, #-7]
stur w20, [x21, #3]
ldurb w22, [x23, #-1]
sturb w24, [x25, #2]
ldr x0, [x1, x2, lsl #3]
str w3, [x4, x5, lsl #2]
ldrb w6, [x7, x8]
ldr d0, [x1, #8]
str d2, [x3], #8
stp x29, x30, [sp, #-16]!
ldp x29, x30, [sp], #16
stp w0, w1, [x2, #12]
ldp d3, d4, [x5, #16]
csel x0, x1, x2, lt
cset w3, ne
nop
wfe
wfi
brk #123
svc #8
hvc #9
isb
dsb sy
dmb sy
mrs x0, CurrentEL
mrs x1, cpacr_el1
mrs x2, daif
mrs x3, cntfrq_el0
mrs x4, cntpct_el0
mrs x5, cntvct_el0
msr cpacr_el1, x6
msr daifset, #15
msr daifclr, #2
fmov d0, x1
fmov x2, d3
fmov d4, d5
scvtf d6, x7
scvtf d8, w9
ucvtf d10, x11
fcvtzs x12, d13
fcvtzs w14, d15
fcvtzu x16, d17
fadd d0, d1, d2
fsub d3, d4, d5
fmul d6, d7, d8
fdiv d9, d10, d11
fcmp d12, d13
fcmp d14, #0.0
fneg d15, d16
fabs d17, d18
fsqrt d19, d20
`;

test('instruction bytes agree with the independent clang AArch64 assembler', t => {
  const probe = spawnSync('clang', ['--version'], { encoding: 'utf8', timeout: 10_000 });
  if (probe.error || probe.status !== 0) { t.skip('optional clang oracle is unavailable'); return; }
  const directory = mkdtempSync(join(tmpdir(), 'turtles-assembler-'));
  try {
    const input = join(directory, 'oracle.s'), output = join(directory, 'oracle.o');
    // Some installed clang builds omit the AArch64 backend. Check a trivial
    // instruction separately so errors in our real fixture still fail tests.
    writeFileSync(input, '.text\nnop\n');
    const targetProbe = spawnSync('clang', ['--target=aarch64-none-elf', '-c', input, '-o', output], { encoding: 'utf8', timeout: 10_000 });
    if (targetProbe.error || targetProbe.status !== 0) { t.skip('optional clang AArch64 target is unavailable'); return; }
    writeFileSync(input, '.text\n' + oracleInstructions);
    const compile = spawnSync('clang', ['--target=aarch64-none-elf', '-c', input, '-o', output], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(compile.status, 0, compile.stderr);
    const expected = textSection(readFileSync(output)), actual = assemble(oracleInstructions, { base: 0 }).buffer;
    assert.equal(actual.length, expected.length);
    const instructions = oracleInstructions.trim().split('\n').filter(line => !line.endsWith(':'));
    for (let i = 0; i < actual.length; i += 4) assert.equal(actual.readUInt32LE(i), expected.readUInt32LE(i), `${instructions[i / 4]} at +${i}`);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
