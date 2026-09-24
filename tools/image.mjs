import { Buffer } from 'node:buffer';

/** Package an already relocated image as an executable AArch64 ELF64 file. */
export function elf64(buffer, base, entry = base) {
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) throw TypeError('image must be a Buffer or Uint8Array');
  if (!Number.isSafeInteger(base) || base < 0 || base % 4) throw Error('base must be a nonnegative, 4-byte aligned safe integer');
  if (!Number.isSafeInteger(entry) || entry % 4 || entry < base || entry >= base + buffer.length) throw Error('entry must be an aligned address inside the image');
  // ELF requires p_offset and p_vaddr to be congruent modulo p_align.
  const alignment = 4096, payloadOffset = alignment + (base % alignment);
  const image = Buffer.alloc(payloadOffset + buffer.length);
  image.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0], 0);
  image.writeUInt16LE(2, 16); // ET_EXEC
  image.writeUInt16LE(183, 18); // EM_AARCH64
  image.writeUInt32LE(1, 20);
  image.writeBigUInt64LE(BigInt(entry), 24);
  image.writeBigUInt64LE(64n, 32); // e_phoff
  image.writeUInt16LE(64, 52); // e_ehsize
  image.writeUInt16LE(56, 54); // e_phentsize
  image.writeUInt16LE(1, 56); // e_phnum
  image.writeUInt32LE(1, 64); // PT_LOAD
  image.writeUInt32LE(7, 68); // PF_R | PF_W | PF_X (the initial flat runtime)
  image.writeBigUInt64LE(BigInt(payloadOffset), 72);
  image.writeBigUInt64LE(BigInt(base), 80);
  image.writeBigUInt64LE(BigInt(base), 88);
  image.writeBigUInt64LE(BigInt(buffer.length), 96);
  image.writeBigUInt64LE(BigInt(buffer.length), 104);
  image.writeBigUInt64LE(BigInt(alignment), 112);
  image.set(buffer, payloadOffset);
  return image;
}
