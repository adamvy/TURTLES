Kevin Greer's Turtles boots from an AArch64 machine-code image, with no guest OS or C runtime. The browser demo runs the same image in QEMU WebAssembly.

Try the [live browser machine](https://adamvy.github.io/TURTLES/). Choose raw T0 or the JS-like language, then Boot. The emulator downloads only on demand; programs are compiled and evaluated inside the ARM guest.

The T0-written JS-like compiler now supports named and anonymous functions, lexical closures, recursion, argument lists, returns and arrow functions. It remains an experimental dialect, not full ECMAScript. See the repository's language and compatibility documentation.

Downloads:

- `turtles-t0.elf` and `.bin`: raw T0 REPL with original prelude.
- `turtles-js.elf` and `.bin`: T0 plus its self-hosted parser and JS-like compiler.
- Per-image JSON manifests, `latest.json` and `SHA256SUMS`: architecture, build inputs, image hashes and site manifest.

Native boot: `qemu-system-aarch64 -machine virt-8.2 -cpu cortex-a53 -accel tcg -m 512M -smp 1 -nographic -device loader,file=turtles-js.elf,cpu-num=0`. Exit with Ctrl-a, then x. A raw `.bin` additionally needs `addr=0x40200000,force-raw=on` on the loader device.

The 512 MiB guest has bounded, monotonic storage and no garbage collector. Exhaustion halts the machine; reboot starts a new session. Desktop Chrome is the browser target. QEMU Wasm is fetched directly from its author's pinned, checksum-verified artifacts and is not included in these downloads.

Publication requires the native differential, function, numeric, image-boot and exact QEMU Wasm suites to pass. This demonstrates bare-metal execution in an emulated ARM machine, not a physical hardware boot. The native assembly core and Node image builder are documented parts of the bootstrap.
