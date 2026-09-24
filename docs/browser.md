# Browser boot and publication

The public demo is [adamvy.github.io/TURTLES](https://adamvy.github.io/TURTLES/).
It is a static site. After Boot is clicked, the browser fetches the author's
pinned QEMU AArch64 WebAssembly engine, verifies its hashes, and boots our ARM
ELF. Serial input goes to the guest PL011 UART. No server evaluates programs.
Both raw T0 and the JS-like compiler run inside the ARM guest.

See [engine provenance and limitations](../web/ENGINE.md) for the artifact pin,
licenses, author source links and memory requirements. The engine download is
about 58 MB and reserves 2300 MiB of shared Wasm memory, including 512 MiB guest
RAM. The guest core, parser and compiler are much smaller. Desktop Chrome with
enough available memory is the primary browser target.

GitHub Pages cannot set arbitrary response headers. The pinned MIT-licensed
[coi-serviceworker](../web/vendor/coi/README.md) adds COOP/COEP headers to
same-origin responses and reloads the page once to enable shared memory.
The worker does not store programs or image responses. Browser protections stay
enabled. A site without secure context, service-worker access or sufficient
memory reports a startup error.
First-visit setup waits for the worker to become active and control the page
before reloading; Boot stays disabled until shared memory is available. This
avoids a race where an early reload still receives an unisolated document.
A visible Reload control provides recovery if browser policy prevents setup.

## Latest images and permanent downloads

The site reads a same-origin `latest.json` on load. Its schema and target must
match the frontend, and each image URL contains its SHA-256 hash. The fetched
ELF is checked again before boot. The image and frontend are deployed together.
The update control checks the manifest without changing a running machine;
reboot applies the new image. Reload the page to update the frontend itself.

The build verifies all guest source/output hashes before packaging. Pages gets
the exact verified image bytes, avoiding cross-origin restrictions on GitHub
Release downloads. Releases additionally retain ELF/raw images, build manifests
and SHA-256 checksums as permanent, versioned downloads. CI artifacts retain
test transcripts temporarily. Neither site packaging nor releases contain
the QEMU engine binaries.

Push a version tag such as `v0.2.0` to publish. The release workflow tests both
native images and the exact browser engine, packages the site, creates the
release, then atomically deploys Pages. Existing release assets cannot silently
be replaced: a retry compares their bytes. A normal branch or pull-request push
runs verification and provides downloadable CI artifacts without publishing.

## Local development

```sh
npm run build
npm run build:web
npm run preview
```

Open the printed localhost URL. The preview server provides COOP/COEP headers
directly. The public frontend downloads QEMU on Boot. For the optional Node/Wasm
compatibility test, `npm run fetch:engine` creates a checksum-verified local cache
and `npm run test:wasm` tests it. That cache is ignored by Git and excluded from
the public package.

`npm run console` is a separate development tool: it starts native QEMU on the
host and relays UART over HTTP. It is useful during runtime development but is
not the public browser emulator.
