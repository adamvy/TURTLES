# TURTLES
TURTLES Ultra-Recursive Tool for Language EnvironmentS

An experimental language creation system.

![Turtles](turtles.png)

[A Short Presentation on TURTLES](https://docs.google.com/presentation/d/1-irLTlLX8lQCXIby8AH4SC7q8lq6VhL9OTqDS79akxY/edit#slide=id.p)

T0

T0 is the lowest-level language in TURTLES, and is meant to act like a VM for higher-level languages. Like Java's JVM and the Forth programming language, it is stack based.
It is lexically scoped and supports closures.

T0 is currently written in Javascript, as this provides an easy development environment,
but is also the start of a C version.

Goals

TURTLES is meant to allow for experimentation in the following areas:
1. GC-aware data-structures. [Copying Garbage Collectors](https://en.wikipedia.org/wiki/Cheney%27s_algorithm#:~:text=Garbage%20collection%20is%20performed%20by,previous%20stop%20and%20copy%20technique.) work by dividing memory into two pools and when one becomes full, then copying all live objects to the other pool and then freeing the whole original pool. But if you're going to copy something like a binary-tree, why would you just blindly copy it as is, when with similar effort, you could instead create a perfectly balanced version in the new pool? Similarly, hashtables, vectors and caches could all be resized to more desirable sizes when copied.
2. Flyweight objects. By separating an object's class from its data (the flyweight pattern), you could remove some of the size and performance overhead often caused by OO languages. For example, if you wanted to create a homogeneous Array of Integer objects, the array could store the class only once, rather than for each instance, and the resulting array would be much smaller. Similarly, when classes are known in methods, the class handling code could be partial-eval-ed away, resulting in procedural code with no dynamic dispatch overhead.  
3. Extensibility through FOAM-like axioms.

Targets

1. RP2040 microcontroller.
2. The KAOS operating system (which doesn't exist yet).

Higher-Level Languages

Currently, the following higher-level languages are (partially) supported:

1. JS - a subset of a Javascript-like language.
2. [SOM](http://som-st.github.io/) - a subset of the Smalltalk language.

The intention is to create T1 as a derivative of SOM and and then T2 as higher-level
axiom-based language on top of T1 (maybe to be named "Axiom").

An ARM Cortex M0+ assembler is also planned, as this is the controller used by the RP2040.

## Multilanguage REPL and AArch64 port

[Try the REPL](https://adamvy.github.io/TURTLES/) or [download an image](https://github.com/adamvy/TURTLES/releases/latest).
The page can run either the original JavaScript interpreter or an ARM image in browser QEMU. Changing the execution backend starts a fresh session; changing only the language does not.
Both use the same `src/parsers.js`, `src/jsparser.js` and `src/som.js`, written in T0. One image loads T0 and both language layers at boot. `:js` and `:som` select the active reader/compiler; `:t0` returns to T0. Switching preserves the shared stack, bindings, closures and heap; only reboot starts a new session. The language buttons do the same thing. The JS-like layer adds functions, arrows, mutable lexical closures, recursion and returns. It remains a dialect: `let` is function-scoped; there are no objects, classes, string literals, `const`, declaration hoisting or full ECMAScript semantics.

The SOM reader reuses the existing grammar and compiles expressions, message sends, blocks and classes into T0. For example, `[ :x | x * x ] value: 9` yields `81`. It is an experimental subset: native `primitive` declarations, nonlocal returns from blocks (`^` inside `[ ... ]`), and the full SOM standard library are unsupported. Method `^` returns are supported. Different readers share storage, but their object models and calling conventions can differ.

The ARM target is **ARMv8-A / AArch64, Cortex-A53, QEMU `virt-8.2`, 512 MiB RAM**, with a PL011 serial console. This is separate from the RP2040 target discussed above. There is no guest OS, C runtime or garbage collector. The arena and heap grow until exhausted, then halt; reboot clears memory. T0's intended core operations are implemented, with repairs for malformed input, captured locals and error recovery. JavaScript host-object/prototype access is unavailable on ARM. General finite powers may differ from a JS engine by one ULP. The parser/compiler runs in T0; rebuilding the native boot image from within the guest remains future work. Physical hardware boot is not yet demonstrated.

Build with Node.js 20 or newer; no dependencies or external assembler are required:

```sh
npm run build      # build/turtles.{elf,bin}
npm start          # builds and serves the REPL at http://127.0.0.1:63820/
```

Install QEMU (`brew install qemu` on macOS, `sudo apt install qemu-system-arm` on Ubuntu). Run a downloaded image from its directory:

```sh
qemu-system-aarch64 -machine virt-8.2 -cpu cortex-a53 -accel tcg -m 512M -smp 1 -nographic -device loader,file=turtles.elf,cpu-num=0
```

Use `build/turtles.elf` for local builds. The image starts at `t0>`; use `:js`, `:som` or `:t0` to change languages, and `:help` for commands. Exit with Ctrl-a, then x. Enter `:paste`, a multiline program, and `:end` on its own line. For raw binaries, use `loader,file=turtles.bin,addr=0x40200000,cpu-num=0,force-raw=on` instead.

The browser downloads ~58 MB of [QEMU Wasm](https://github.com/ktock/qemu-wasm) on demand from pinned, checksum-verified author-hosted assets. Their exact source commit was not supplied by the author. Desktop Chrome is the primary browser target; shared Wasm memory reserves more address space than the guest's 512 MiB RAM. A small service worker enables cross-origin isolation on GitHub Pages. Programs stay in the browser.

`src/arm/` holds the assembly runtime and JavaScript image builder. `npm run build:site` packages `dist/` and `build/release/`; pushing a `v*` tag publishes immutable images with SHA-256 checksums and updates the site. Earlier experimental releases remain available under their original tags.
