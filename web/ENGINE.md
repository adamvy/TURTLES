# Browser emulator

The page runs Kevin Greer's Turtles ARM image in **QEMU inside the browser**.
The web server supplies static files. There is no server-side QEMU, terminal
proxy, Linux guest, or JavaScript reimplementation of the T0 evaluator.

`engine-lock.mjs` pins the author's prebuilt QEMU Wasm AArch64 artifacts to
[`b7c549b5e6f4c376f76483a03e983214421434ad`](https://github.com/ktock/qemu-wasm-demo-images/tree/b7c549b5e6f4c376f76483a03e983214421434ad/raspi3ap).
The browser fetches three files directly from that repository only when Boot is
pressed, verifies every SHA-256 checksum, and creates local Blob URLs for the
JavaScript module and pthread worker. The public site does **not** redistribute
those emulator binaries. The ARM guest ELF is verified against the site manifest.

The three downloaded files remain byte-for-byte unchanged. A small application
module supplies Emscripten's `locateFile` option to each pthread before calling
the original loader: worker initialization otherwise attempts to resolve a
relative Wasm filename against a `blob:` URL, which browsers reject. The workers
receive the already-compiled Wasm module and shared memory from their owner.

The download is 57,700,409 bytes (about 55 MiB). The emulator identifies itself as
QEMU 8.2.0 and runs `virt-8.2`, Cortex-A53, one CPU, 512 MiB guest RAM and a 32 MiB
translation cache. This author-supplied build reserves 2300 MiB of shared Wasm
linear memory, which includes guest RAM and emulator overhead. This is a desktop
browser target; successful operation on a mobile browser is not assumed.

QEMU Wasm is experimental. See the author's
[QEMU Wasm source and build instructions](https://github.com/ktock/qemu-wasm),
[demo build recipe](https://github.com/ktock/qemu-wasm-demo/blob/0208c86ea45253c26c0ea6907f6db2dec89eb7b2/create-images.sh),
[GPL-2.0 license](https://github.com/ktock/qemu-wasm/blob/master/COPYING), and
[LGPL license](https://github.com/ktock/qemu-wasm/blob/master/COPYING.LIB).
The artifact commit does not state the exact source commit or complete compiler
environment used to build it. Our lock file guarantees repeatable artifact
selection and integrity, **not** a reproducible source build of QEMU. The Turtles
guest itself continues to build locally using our JavaScript assembler.

Shared WebAssembly memory requires a secure context and cross-origin isolation.
The development server sends `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. Static hosting must provide equivalent
isolation (the site's service worker provides it when the hosting provider does
not allow those headers). No browser protection needs to be disabled.

To test the static-host path locally, build the site and run
`node tools/serve-web.mjs --root dist --port 63822 --pages`. This mode deliberately
omits the HTTP isolation headers. On a fresh origin, the page must install its
service worker and reload before browser QEMU can boot.

Each boot lives in a disposable same-origin iframe. Removing it and creating a
new one restarts the machine and releases its worker context. The PTY adapter
passes UTF-8 bytes to the guest's PL011 UART; it does not interpret source code.

For development only, `node tools/browser-engine.mjs` downloads a verified local
cache under `web/vendor/qemu/`; `--verify` checks that cache without downloading.
The internal `boot({ localEngine: true, ... })` option uses it. These downloaded
files are excluded from source control and public site packaging.
