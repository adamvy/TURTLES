// Shared full-runtime target; no installed guest OS is needed.
import { resolve, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { root, modes, buildImages } from './build.mjs';

export function validateMode(mode) {
  if (!modes.includes(mode)) throw Error('Mode must be t0 or js');
  return mode;
}
export function imageFor({ mode = 't0', image, raw = false } = {}) {
  validateMode(mode);
  const path = image ? resolve(image) : resolve(root, `build/${mode}.${raw ? 'bin' : 'elf'}`);
  if (!existsSync(path)) {
    if (image) throw Error(`Image does not exist: ${path}`);
    buildImages([mode]);
  }
  return { path, raw: raw || extname(path).toLowerCase() === '.bin' };
}
export function qemuArguments({ image, raw = false, interactive = false }) {
  const path = image.replaceAll(',', ',,');
  return ['-machine', 'virt-8.2', '-cpu', 'cortex-a53', '-accel', 'tcg', '-m', '512M', '-smp', '1',
    ...(interactive ? ['-nographic'] : ['-display', 'none', '-monitor', 'none', '-serial', 'stdio']),
    '-device', raw ? `loader,file=${path},addr=0x40200000,cpu-num=0,force-raw=on`
      : `loader,file=${path},cpu-num=0`];
}
export const qemuBinary = () => process.env.QEMU_BINARY || process.env.QEMU || 'qemu-system-aarch64';
