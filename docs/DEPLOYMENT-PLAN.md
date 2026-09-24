# Browser demo and release plan

Goal: let a visitor open a public URL in Chrome, download a QEMU WebAssembly
engine on demand, and boot the real AArch64 Turtles image. The visitor's browser
executes the machine; the site is not a remote terminal or a JavaScript imitation
of the ARM guest.

Repository: https://github.com/adamvy/TURTLES, forked from kgrgreer/TURTLES.
Preserve upstream history, original src/, project attribution and license.

1. Extend the T0-written JS-like parser/compiler with functions, lexical captures,
   calls and returns. Keep parsing/compilation in the guest. Test function scope,
   recursion, argument order/arity and stack discipline against the reference.
2. Pin the browser QEMU engine, source revision, build recipe and artifact hashes.
   Boot both current images in Chrome with matching board/CPU/RAM options.
3. Build a static frontend with raw T0/JS-like modes, examples, UART terminal,
   loading progress, restart, downloadable images and visible build identity.
   Download the engine only after the visitor chooses to boot.
4. Publish image .elf/.bin files, manifests and checksums in GitHub Releases,
   and retain CI artifacts for each tested build. Build the static site from
   the same verified files. Serve images same-origin for predictable browser
   fetch/CORS behavior; link permanent release assets for downloads.
5. Deploy GitHub Pages with a same-origin isolation service worker if required
   by QEMU threads. The page checks its isolation before downloading the engine.
6. Each successful deployment publishes an atomic latest.json manifest pointing
   to immutable content-addressed images. Running sessions stay on their chosen
   build; checking for updates offers a fresh boot rather than changing memory.
7. Verify the public HTTPS page in Chrome: cold load, both boots, functions,
   examples, reboot, and downloads. Publish accurate documentation and URLs.

The site will describe bare-metal execution inside an emulated machine, not
claim that physical ARM hardware has been booted. No message will be sent to
Kevin as part of this work; the user will receive a shareable demo URL.
