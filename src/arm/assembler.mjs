// Small dependency-free AArch64 assembler used to bootstrap Turtles from JS.
// This intentionally implements the instruction subset used by src/arm/*.s.
import { Buffer } from 'node:buffer';

const CONDITIONS = { eq: 0, ne: 1, cs: 2, hs: 2, cc: 3, lo: 3, mi: 4, pl: 5, vs: 6, vc: 7, hi: 8, ls: 9, ge: 10, lt: 11, gt: 12, le: 13, al: 14, nv: 15 };
const MASK64 = (1n << 64n) - 1n;

function splitOperands(text) {
  const parts = []; let depth = 0, quoted = false, escaped = false, start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') depth--;
    else if (c === ',' && depth === 0) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  if (text.slice(start).trim()) parts.push(text.slice(start).trim());
  return parts;
}

function stripComment(line) {
  let quoted = false, escaped = false;
  for (let i = 0; i < line.length; i++) {
    if (quoted) { if (escaped) escaped = false; else if (line[i] === '\\') escaped = true; else if (line[i] === '"') quoted = false; }
    else if (line[i] === '"') quoted = true;
    else if (line.slice(i, i + 2) === '//') return line.slice(0, i);
  }
  return line;
}

function expression(source, lookup, pc) {
  const s = source.trim().replace(/^#/, '');
  const tokens = s.match(/0x[\da-f]+|0b[01]+|\d+|[A-Za-z_.$][\w.$]*|<<|>>|[()+\-~*/%&|^]/gi) || [];
  if (tokens.join('') !== s.replace(/\s/g, '')) throw Error(`invalid expression: ${source}`);
  let index = 0;
  const precedence = { '|': 1, '^': 2, '&': 3, '<<': 4, '>>': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
  function parse(min = 0) {
    const token = tokens[index++]; let left;
    if (token === '(') { left = parse(); if (tokens[index++] !== ')') throw Error('missing closing parenthesis'); }
    else if (token === '-' || token === '+' || token === '~') { left = parse(7); if (token === '-') left = -left; else if (token === '~') left = ~left; }
    else if (token === '.') left = BigInt(pc);
    else if (token && /^\d/.test(token)) left = BigInt(token);
    else if (token && /^[A-Za-z_.$]/.test(token)) left = lookup(token);
    else throw Error(`invalid expression: ${source}`);
    while (index < tokens.length && (precedence[tokens[index]] || 0) > min) {
      const op = tokens[index++], right = parse(precedence[op]);
      switch (op) {
        case '+': left += right; break; case '-': left -= right; break;
        case '*': left *= right; break; case '/': left /= right; break; case '%': left %= right; break;
        case '<<': left <<= right; break; case '>>': left >>= right; break;
        case '&': left &= right; break; case '|': left |= right; break; case '^': left ^= right; break;
      }
    }
    return left;
  }
  const result = parse();
  if (index !== tokens.length) throw Error(`invalid expression: ${source}`);
  return result;
}

function reg(text) {
  const t = text?.toLowerCase();
  if (t === 'sp' || t === 'wsp' || t === 'xzr' || t === 'wzr') return { n: 31, bits: t[0] === 'w' ? 32 : 64, sp: t.endsWith('sp'), fp: false };
  const m = /^([xwds])(\d+)$/.exec(t || '');
  if (!m || Number(m[2]) > (m[1] === 'd' || m[1] === 's' ? 31 : 30)) throw Error(`invalid register: ${text}`);
  return { n: Number(m[2]), bits: m[1] === 'x' || m[1] === 'd' ? 64 : 32, sp: false, fp: m[1] === 'd' || m[1] === 's' };
}
function isReg(text) { return /^(?:[xwds]\d+|sp|wsp|xzr|wzr)$/i.test(text || ''); }
function range(value, bits, signed = false, description = 'immediate') {
  value = BigInt(value);
  const min = signed ? -(1n << BigInt(bits - 1)) : 0n, max = (1n << BigInt(signed ? bits - 1 : bits)) - 1n;
  if (value < min || value > max) throw Error(`${description} ${value} does not fit ${signed ? 'signed ' : ''}${bits} bits`);
  return Number(BigInt.asUintN(bits, value));
}
function sameWidth(...registers) {
  if (registers.some(r => r.bits !== registers[0].bits || r.fp !== registers[0].fp)) throw Error('register widths/types do not match');
}
function integerRegisters(registers, allowSP = false) {
  if (registers.some(r => r.fp || (!allowSP && r.sp))) throw Error(`expected integer registers${allowSP ? '' : ' other than SP'}`);
}
function condition(text) { if (!(text in CONDITIONS)) throw Error(`unknown condition: ${text}`); return CONDITIONS[text]; }
function sf(r) { return r.bits === 64 ? 0x80000000 : 0; }

function moveWords(r, value, count) {
  const lanes = r.bits / 16, mask = (1n << BigInt(r.bits)) - 1n;
  if (value < -(1n << BigInt(r.bits - 1)) || value > mask) throw Error(`move immediate does not fit ${r.bits} bits`);
  value &= mask;
  const half = Array.from({ length: lanes }, (_, i) => Number((value >> BigInt(i * 16)) & 65535n));
  const nonzero = half.map((v, i) => v !== 0 ? i : -1).filter(i => i >= 0);
  const nonones = half.map((v, i) => v !== 65535 ? i : -1).filter(i => i >= 0);
  const inverted = !count && nonones.length < nonzero.length;
  const indices = count ? Array.from({ length: count }, (_, i) => i) : (inverted ? nonones : nonzero);
  if (!indices.length) indices.push(0);
  return indices.map((lane, i) => ((sf(r) | (i === 0 ? (inverted ? 0x12800000 : 0x52800000) : 0x72800000)) + (lane << 21) + ((i === 0 && inverted ? (~half[lane] & 65535) : half[lane]) << 5) + r.n) >>> 0);
}

function logicalImmediate(value, bits) {
  const mask = (1n << BigInt(bits)) - 1n;
  if (value < -(1n << BigInt(bits - 1)) || value > mask) throw Error(`logical immediate does not fit ${bits} bits`);
  value &= mask;
  for (let size = 2; size <= bits; size *= 2) {
    const elementMask = (1n << BigInt(size)) - 1n;
    for (let ones = 1; ones < size; ones++) {
      const onesMask = (1n << BigInt(ones)) - 1n;
      for (let rot = 0; rot < size; rot++) {
        const element = ((onesMask >> BigInt(rot)) | (onesMask << BigInt(size - rot))) & elementMask;
        let repeated = 0n; for (let shift = 0; shift < bits; shift += size) repeated |= element << BigInt(shift);
        if (repeated === value) return ((size === 64 ? 1 : 0) << 22) | (rot << 16) | ((((-(size << 1)) | (ones - 1)) & 63) << 10);
      }
    }
  }
  throw Error(`immediate 0x${value.toString(16)} is not an AArch64 logical bitmask`);
}

function encode(node, evaluate) {
  const { op, args: a, pc } = node;
  const imm = text => evaluate(text, pc);
  const number = text => Number(imm(text));
  const relative = (target, bits) => { const delta = imm(target) - BigInt(pc); if (delta % 4n) throw Error('branch target must be 4-byte aligned'); return range(delta / 4n, bits, true, 'branch displacement'); };
  const emit = word => [word >>> 0];
  const r = index => reg(a[index]);
  if (op === 'mov') {
    const d = r(0);
    if (!isReg(a[1])) { if (d.sp || d.fp) throw Error('immediate mov requires a general register'); return moveWords(d, imm(a[1]), node.fixedMove ? d.bits / 16 : undefined); }
    const n = r(1); sameWidth(d, n); integerRegisters([d, n], true);
    if ((d.sp && n.n === 31 && !n.sp) || (n.sp && d.n === 31 && !d.sp)) throw Error('mov cannot combine SP and a zero register');
    return emit((d.sp || n.sp ? (sf(d) | 0x11000000) + (n.n << 5) : (sf(d) | 0x2a0003e0) + (n.n << 16)) + d.n);
  }
  if (['movz', 'movk', 'movn'].includes(op)) {
    const d = r(0), shift = a[2] ? number(a[2].replace(/^lsl\s+/i, '')) : 0;
    integerRegisters([d]);
    if (shift % 16 || shift < 0 || shift >= d.bits) throw Error('move shift must be a multiple of 16 below register width');
    return emit((sf(d) | { movz: 0x52800000, movk: 0x72800000, movn: 0x12800000 }[op]) + (shift / 16 << 21) + (range(imm(a[1]), 16) << 5) + d.n);
  }
  if (['add', 'sub', 'adds', 'subs', 'cmp', 'cmn'].includes(op)) {
    const compare = op === 'cmp' || op === 'cmn', actual = op === 'cmp' ? 'subs' : op === 'cmn' ? 'adds' : op;
    const d = compare ? { ...r(0), n: 31, sp: false } : r(0), n = r(compare ? 0 : 1), operand = a[compare ? 1 : 2], extra = a[compare ? 2 : 3];
    sameWidth(d, n); integerRegisters([d, n], true);
    if (actual.endsWith('s') && d.sp) throw Error('flag-setting arithmetic cannot write SP');
    const flags = (actual.startsWith('sub') ? 0x40000000 : 0) | (actual.endsWith('s') ? 0x20000000 : 0);
    if (isReg(operand)) {
      const m = reg(operand); sameWidth(d, m); integerRegisters([m]);
      const match = /^(lsl|lsr|asr)\s+(.+)$/i.exec(extra || 'lsl #0'); if (!match) throw Error('invalid register shift');
      const shift = range(imm(match[2]), d.bits === 64 ? 6 : 5);
      if (d.sp || n.sp) {
        if (match[1].toLowerCase() !== 'lsl' || shift > 4) throw Error('SP register arithmetic only supports lsl #0..4');
        if (!actual.endsWith('s') && d.n === 31 && !d.sp) throw Error('extended arithmetic destination is SP, not a zero register');
        return emit((sf(d) | flags | (d.bits === 64 ? 0x0b206000 : 0x0b204000)) + (m.n << 16) + (shift << 10) + (n.n << 5) + d.n);
      }
      return emit((sf(d) | flags | 0x0b000000) + ({ lsl: 0, lsr: 1, asr: 2 }[match[1].toLowerCase()] << 22) + (m.n << 16) + (shift << 10) + (n.n << 5) + d.n);
    }
    let value = imm(operand), shift = extra ? number(extra.replace(/^lsl\s+/i, '')) : 0;
    if (n.n === 31 && !n.sp) throw Error('immediate arithmetic cannot read a zero register');
    if (!actual.endsWith('s') && d.n === 31 && !d.sp) throw Error('immediate arithmetic destination is SP, not a zero register');
    if (!extra && value > 4095n && value % 4096n === 0n) { value /= 4096n; shift = 12; }
    if (shift !== 0 && shift !== 12) throw Error('add/sub immediate shift must be 0 or 12');
    return emit((sf(d) | flags | 0x11000000) + (shift === 12 ? 1 << 22 : 0) + (range(value, 12) << 10) + (n.n << 5) + d.n);
  }
  if (['mul', 'madd', 'msub', 'sdiv', 'udiv'].includes(op)) {
    const d = r(0), n = r(1), m = r(2); sameWidth(d, n, m); integerRegisters([d, n, m]);
    const base = { mul: 0x1b007c00, madd: 0x1b000000, msub: 0x1b008000, sdiv: 0x1ac00c00, udiv: 0x1ac00800 }[op];
    const accumulator = op === 'msub' || op === 'madd' ? r(3) : null; if (accumulator) { sameWidth(d, accumulator); integerRegisters([accumulator]); }
    return emit((sf(d) | base) + (m.n << 16) + (accumulator ? accumulator.n << 10 : 0) + (n.n << 5) + d.n);
  }
  if (['and', 'ands', 'orr', 'eor', 'tst'].includes(op)) {
    const test = op === 'tst', actual = test ? 'ands' : op;
    const d = test ? { ...r(0), n: 31 } : r(0), n = r(test ? 0 : 1), operand = a[test ? 1 : 2]; sameWidth(d, n); integerRegisters([d, n]);
    if (a.length !== (test ? 2 : 3)) throw Error('logical register shifts are not supported');
    const opc = { and: 0, orr: 1, eor: 2, ands: 3 }[actual] << 29;
    if (isReg(operand)) { const m = reg(operand); sameWidth(d, m); integerRegisters([m]); return emit((sf(d) | opc | 0x0a000000) + (m.n << 16) + (n.n << 5) + d.n); }
    return emit((sf(d) | opc | 0x12000000) + logicalImmediate(imm(operand), d.bits) + (n.n << 5) + d.n);
  }
  if (['lsl', 'lsr', 'asr'].includes(op)) {
    const d = r(0), n = r(1); sameWidth(d, n); integerRegisters([d, n]);
    if (isReg(a[2])) { const m = r(2); sameWidth(d, m); integerRegisters([m]); return emit((sf(d) | { lsl: 0x1ac02000, lsr: 0x1ac02400, asr: 0x1ac02800 }[op]) + (m.n << 16) + (n.n << 5) + d.n); }
    const shift = range(imm(a[2]), d.bits === 64 ? 6 : 5), immr = op === 'lsl' ? (d.bits - shift) % d.bits : shift, imms = op === 'lsl' ? d.bits - 1 - shift : d.bits - 1;
    return emit((sf(d) | (d.bits === 64 ? 1 << 22 : 0) | (op === 'asr' ? 0x13000000 : 0x53000000)) + (immr << 16) + (imms << 10) + (n.n << 5) + d.n);
  }
  if (op === 'neg' || op === 'mvn') { const d = r(0), n = r(1); sameWidth(d, n); integerRegisters([d, n]); return emit((sf(d) | (op === 'neg' ? 0x4b0003e0 : 0x2a2003e0)) + (n.n << 16) + d.n); }
  if (op === 'adr' || op === 'adrp') {
    const d = r(0); if (d.bits !== 64 || d.fp || d.sp) throw Error('adr requires X register');
    const delta = op === 'adr' ? imm(a[1]) - BigInt(pc) : (imm(a[1]) >> 12n) - (BigInt(pc) >> 12n), value = range(delta, 21, true, 'address displacement');
    return emit((op === 'adr' ? 0x10000000 : 0x90000000) + ((value & 3) << 29) + ((value >>> 2) << 5) + d.n);
  }
  if (op === 'b' || op === 'bl') return emit((op === 'b' ? 0x14000000 : 0x94000000) + relative(a[0], 26));
  if (op.startsWith('b.')) return emit(0x54000000 + (relative(a[0], 19) << 5) + condition(op.slice(2)));
  if (op === 'cbz' || op === 'cbnz') { integerRegisters([r(0)]); return emit((sf(r(0)) | (op === 'cbz' ? 0x34000000 : 0x35000000)) + (relative(a[1], 19) << 5) + r(0).n); }
  if (op === 'tbz' || op === 'tbnz') { const n = r(0), bit = range(imm(a[1]), n.bits === 64 ? 6 : 5); integerRegisters([n]); return emit((op === 'tbz' ? 0x36000000 : 0x37000000) + ((bit >>> 5) * 0x80000000) + ((bit & 31) << 19) + (relative(a[2], 14) << 5) + n.n); }
  if (['br', 'blr', 'ret'].includes(op)) { const n = a[0] ? r(0) : { n: 30, bits: 64 }; if (n.bits !== 64 || n.fp || n.sp) throw Error('branch requires X register'); return emit({ br: 0xd61f0000, blr: 0xd63f0000, ret: 0xd65f0000 }[op] + (n.n << 5)); }
  if (['ldr', 'str', 'ldrb', 'strb', 'ldrh', 'strh', 'ldrsw', 'ldur', 'stur', 'ldurb', 'sturb'].includes(op)) {
    const d = r(0), load = op.startsWith('ld'), byte = op.endsWith('b'), half = op.endsWith('h'), signWord = op === 'ldrsw';
    if (d.sp) throw Error('load/store value cannot be SP');
    if (signWord && (d.bits !== 64 || d.fp)) throw Error('ldrsw requires X register');
    const scale = byte ? 1 : half ? 2 : signWord ? 4 : d.bits / 8;
    if ((byte || half) && (d.bits !== 32 || d.fp)) throw Error('byte/halfword access requires W register');
    const match = /^\[(.+)\](!?)$/.exec(a[1]); if (!match) throw Error('invalid load/store address');
    const fields = splitOperands(match[1]), n = reg(fields[0]); if (n.bits !== 64 || n.fp || (n.n === 31 && !n.sp)) throw Error('address base requires X register or SP');
    const size = Math.log2(scale), v = d.fp ? 1 << 26 : 0, opc = signWord ? 0x800000 : load ? 0x400000 : 0;
    if (fields[1] && isReg(fields[1])) {
      const m = reg(fields[1]); if (m.bits !== 64 || m.fp || m.sp) throw Error('index requires X register');
      const shift = fields[2] ? number(fields[2].replace(/^lsl\s+/i, '')) : 0;
      if (shift !== 0 && shift !== size) throw Error(`load/store index shift must be 0 or ${size}`);
      if (match[2] || a[2]) throw Error('register indexed access cannot write back');
      return emit((size * 0x40000000 + v + opc + 0x38206800) + (m.n << 16) + (shift ? 1 << 12 : 0) + (n.n << 5) + d.n);
    }
    if (match[2] && a[2]) throw Error('address cannot use pre- and post-index together');
    const offset = imm(a[2] || fields[1] || '0'), pre = Boolean(match[2]), post = Boolean(a[2]);
    if (!pre && !post && !op.includes('ur') && offset >= 0n && offset % BigInt(scale) === 0n) return emit(size * 0x40000000 + v + opc + 0x39000000 + (range(offset / BigInt(scale), 12) << 10) + (n.n << 5) + d.n);
    return emit(size * 0x40000000 + v + opc + 0x38000000 + (range(offset, 9, true) << 12) + (pre ? 0xc00 : post ? 0x400 : 0) + (n.n << 5) + d.n);
  }
  if (op === 'stp' || op === 'ldp') {
    const d = r(0), t = r(1); sameWidth(d, t);
    if (d.sp || t.sp) throw Error('load/store pair value cannot be SP');
    const match = /^\[(.+)\](!?)$/.exec(a[2]); if (!match) throw Error('invalid pair address');
    const fields = splitOperands(match[1]), n = reg(fields[0]); if (n.bits !== 64 || n.fp || (n.n === 31 && !n.sp)) throw Error('address base requires X register or SP');
    if (match[2] && a[3]) throw Error('address cannot use pre- and post-index together');
    const offset = imm(a[3] || fields[1] || '0'), scale = BigInt(d.bits / 8); if (offset % scale) throw Error('pair offset must be aligned to register size');
    const mode = match[2] ? 0x01800000 : a[3] ? 0x00800000 : 0x01000000;
    const type = d.fp ? (d.bits === 64 ? 0x44000000 : 0x04000000) : sf(d);
    return emit(type + 0x28000000 + mode + (op === 'ldp' ? 1 << 22 : 0) + (range(offset / scale, 7, true) << 15) + (t.n << 10) + (n.n << 5) + d.n);
  }
  if (op === 'csel') { const d = r(0), n = r(1), m = r(2); sameWidth(d, n, m); integerRegisters([d, n, m]); return emit((sf(d) | 0x1a800000) + (m.n << 16) + (condition(a[3]) << 12) + (n.n << 5) + d.n); }
  if (op === 'cset') { integerRegisters([r(0)]); return emit((sf(r(0)) | 0x1a9f07e0) + ((condition(a[1]) ^ 1) << 12) + r(0).n); }
  if (['nop', 'wfe', 'wfi', 'isb', 'dsb', 'dmb'].includes(op)) return emit({ nop: 0xd503201f, wfe: 0xd503205f, wfi: 0xd503207f, isb: 0xd5033fdf, dsb: 0xd5033f9f, dmb: 0xd5033fbf }[op]);
  if (op === 'brk' || op === 'svc' || op === 'hvc') return emit({ brk: 0xd4200000, svc: 0xd4000001, hvc: 0xd4000002 }[op] + (range(imm(a[0] || '0'), 16) << 5));
  const systemRegisters = { currentel: 0x4240, cpacr_el1: 0x1040, sctlr_el1: 0x1000, vbar_el1: 0xc000, elr_el1: 0x4020, spsr_el1: 0x4000, sp_el0: 0x4100, mpidr_el1: 0xa0, daif: 0x34220, cntfrq_el0: 0x3e000, cntpct_el0: 0x3e020, cntvct_el0: 0x3e040 };
  if (op === 'mrs' || op === 'msr') {
    const name = a[op === 'mrs' ? 1 : 0].toLowerCase();
    if (op === 'msr' && (name === 'daifset' || name === 'daifclr')) return emit((name === 'daifset' ? 0xd50340df : 0xd50340ff) + (range(imm(a[1]), 4) << 8));
    if (!(name in systemRegisters)) throw Error(`unknown system register: ${name}`);
    const n = r(op === 'mrs' ? 0 : 1); if (n.bits !== 64 || n.fp || n.sp) throw Error('system register access requires X register');
    return emit((op === 'mrs' ? 0xd5380000 : 0xd5180000) + systemRegisters[name] + n.n);
  }
  if (op === 'fmov') {
    const d = r(0), n = r(1); if (d.bits !== 64 || n.bits !== 64) throw Error('fmov currently supports X/D registers only');
    if (!d.fp && !n.fp) throw Error('fmov needs a floating point register');
    return emit((d.fp && n.fp ? 0x1e604000 : d.fp ? 0x9e670000 : 0x9e660000) + (n.n << 5) + d.n);
  }
  if (op === 'scvtf' || op === 'ucvtf' || op === 'fcvtzs' || op === 'fcvtzu') {
    const d = r(0), n = r(1), toFloat = op.endsWith('cvtf'), fpReg = toFloat ? d : n, intReg = toFloat ? n : d;
    if (!fpReg.fp || intReg.fp || fpReg.bits !== 64) throw Error('conversion requires a D register and an integer register');
    const base = { scvtf: 0x1e620000, ucvtf: 0x1e630000, fcvtzs: 0x1e780000, fcvtzu: 0x1e790000 }[op];
    return emit((sf(intReg) | base) + (n.n << 5) + d.n);
  }
  if (['fadd', 'fsub', 'fmul', 'fdiv'].includes(op)) { const d = r(0), n = r(1), m = r(2); sameWidth(d, n, m); if (!d.fp || d.bits !== 64) throw Error('arithmetic requires D registers'); return emit({ fadd: 0x1e602800, fsub: 0x1e603800, fmul: 0x1e600800, fdiv: 0x1e601800 }[op] + (m.n << 16) + (n.n << 5) + d.n); }
  if (op === 'fcmp') { const n = r(0); if (!n.fp || n.bits !== 64) throw Error('fcmp requires D registers'); if (isReg(a[1])) { const m = r(1); sameWidth(n, m); return emit(0x1e602000 + (m.n << 16) + (n.n << 5)); } if (imm(a[1].replace(/0\.0+$/, '0')) !== 0n) throw Error('fcmp immediate must be zero'); return emit(0x1e602008 + (n.n << 5)); }
  if (['fneg', 'fabs', 'fsqrt'].includes(op)) { const d = r(0), n = r(1); sameWidth(d, n); if (!d.fp || d.bits !== 64) throw Error('floating unary operation requires D registers'); return emit({ fneg: 0x1e614000, fabs: 0x1e60c000, fsqrt: 0x1e61c000 }[op] + (n.n << 5) + d.n); }
  if (op === 'clz') { const d = r(0), n = r(1); sameWidth(d, n); integerRegisters([d, n]); return emit((sf(d) | 0x5ac01000) + (n.n << 5) + d.n); }
  throw Error(`unknown instruction: ${op}`);
}

/** Assemble little-endian AArch64 code. Symbol addresses are in a Map. */
export function assemble(source, { base = 0x40080000 } = {}) {
  if (!Number.isSafeInteger(base) || base < 0 || base % 4) throw Error('base must be a nonnegative, 4-byte aligned safe integer');
  const nodes = [], symbols = new Map(), definitions = new Map(); let pc = base;
  const lookup = (name, visiting = new Set()) => {
    if (symbols.has(name)) return BigInt(symbols.get(name));
    if (!definitions.has(name)) throw Error(`undefined symbol: ${name}`);
    if (visiting.has(name)) throw Error(`cyclic constant: ${name}`);
    visiting.add(name); const definition = definitions.get(name);
    const value = expression(definition.text, key => lookup(key, new Set(visiting)), definition.pc);
    return value;
  };
  const evaluate = (text, address = pc) => expression(text, key => lookup(key), address);
  const fail = (line, error) => { throw Error(`assembly line ${line}: ${error.message}`); };
  for (const [index, original] of source.split(/\r?\n/).entries()) {
    const line = index + 1; let text = stripComment(original).trim(); if (!text) continue;
    try {
      let match;
      while ((match = /^([A-Za-z_.$][\w.$]*):/.exec(text))) {
        if (symbols.has(match[1]) || definitions.has(match[1])) throw Error(`duplicate symbol: ${match[1]}`);
        symbols.set(match[1], pc); text = text.slice(match[0].length).trim();
      }
      if (!text) continue;
      match = /^(\S+)(?:\s+(.*))?$/.exec(text);
      const op = match[1].toLowerCase(), args = splitOperands(match[2] || ''), node = { op, args, pc, line, size: 0 };
      if (op === '.equ' || op === '.set') {
        if (args.length !== 2 || !/^[A-Za-z_.$][\w.$]*$/.test(args[0])) throw Error('expected .equ name, expression');
        if (symbols.has(args[0]) || definitions.has(args[0])) throw Error(`duplicate symbol: ${args[0]}`);
        definitions.set(args[0], { text: args[1], pc }); continue;
      }
      if (['.text', '.data', '.rodata', '.bss', '.global', '.globl', '.section', '.type', '.size'].includes(op)) continue;
      if (op === '.align' || op === '.p2align' || op === '.balign') {
        const value = evaluate(args[0]), alignment = op === '.balign' ? Number(value) : 2 ** range(value, 5);
        if (!Number.isSafeInteger(alignment) || alignment < 1) throw Error('invalid alignment');
        node.size = (alignment - pc % alignment) % alignment;
      } else if (op === '.byte' || op === '.word' || op === '.quad') node.size = args.length * { '.byte': 1, '.word': 4, '.quad': 8 }[op];
      else if (op === '.asciz' || op === '.ascii') { node.data = Buffer.concat(args.map(arg => { const value = JSON.parse(arg); if (typeof value !== 'string') throw Error('expected a quoted string'); return Buffer.from(value + (op === '.asciz' ? '\0' : ''), 'utf8'); })); node.size = node.data.length; }
      else if (op === '.space' || op === '.zero') node.size = range(evaluate(args[0]), 28);
      else if (op.startsWith('.')) throw Error(`unknown directive: ${op}`);
      else {
        if (pc % 4) throw Error('instruction is not 4-byte aligned; use .align 2');
        node.size = 4;
        if (op === 'mov' && !isReg(args[1])) {
          try { node.size = moveWords(reg(args[0]), evaluate(args[1])).length * 4; }
          catch (error) { if (!error.message.startsWith('undefined symbol:')) throw error; node.fixedMove = true; node.size = reg(args[0]).bits / 4; }
        }
      }
      pc += node.size; if (pc - base > 256 * 1024 * 1024) throw Error('image exceeds 256 MiB'); nodes.push(node);
    } catch (error) { fail(line, error); }
  }
  const buffer = Buffer.alloc(pc - base);
  for (const node of nodes) {
    try {
      const offset = node.pc - base;
      if (node.data) node.data.copy(buffer, offset);
      else if (node.op === '.byte' || node.op === '.word' || node.op === '.quad') {
        const width = { '.byte': 1, '.word': 4, '.quad': 8 }[node.op];
        node.args.forEach((arg, i) => {
          const value = evaluate(arg, node.pc + i * width), bits = width * 8;
          if (value < -(1n << BigInt(bits - 1)) || value > (1n << BigInt(bits)) - 1n) throw Error(`data does not fit ${bits} bits`);
          const unsigned = BigInt.asUintN(bits, value);
          if (width === 8) buffer.writeBigUInt64LE(unsigned, offset + i * width); else if (width === 4) buffer.writeUInt32LE(Number(unsigned), offset + i * width); else buffer[offset + i] = Number(unsigned);
        });
      } else if (node.op === '.space' && node.args[1]) buffer.fill(range(evaluate(node.args[1], node.pc), 8), offset, offset + node.size);
      else if (!node.op.startsWith('.')) {
        const words = encode(node, evaluate);
        if (words.length * 4 !== node.size) throw Error('internal instruction-size mismatch');
        words.forEach((word, i) => buffer.writeUInt32LE(word, offset + i * 4));
      }
    } catch (error) { fail(node.line, error); }
  }
  // Labels remain exact safe integer addresses. Constants are included when safe.
  for (const name of definitions.keys()) { const value = lookup(name); if (value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)) symbols.set(name, Number(value)); }
  return { buffer, symbols };
}
