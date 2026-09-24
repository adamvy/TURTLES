// Author-hosted artifacts: exact asset selection is reproducible. The author did
// not publish a corresponding source-commit identifier for these compiled files.
export const engineLock = Object.freeze({
  project: 'https://github.com/ktock/qemu-wasm',
  artifacts: 'https://github.com/ktock/qemu-wasm-demo-images',
  commit: 'b7c549b5e6f4c376f76483a03e983214421434ad',
  baseURL: 'https://raw.githubusercontent.com/ktock/qemu-wasm-demo-images/b7c549b5e6f4c376f76483a03e983214421434ad/raspi3ap/',
  qemuVersion: '8.2.0',
  files: {
    'out.js': { bytes: 222823, sha256: '88997f526b8ddd53a8c5da9b3ecab052851175e532f89ecb5425aa00e494d7a6' },
    'qemu-system-aarch64.worker.js': { bytes: 6001, sha256: '0fe5449bd103bcac7ba9a5adc6a8eb5357d2d260522529dbe90ba95bdca910c2' },
    'qemu-system-aarch64.wasm': { bytes: 57471585, sha256: 'b37148882e0b7e6d3ca93072439f5680069c303cbb0ee5b6901b9beb395cde42' },
  },
});
