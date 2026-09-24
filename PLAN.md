# T0 on bare-metal AArch64

## Goal

Provide the complete intended T0 language experience from Kevin Greer's pinned
[TURTLES](https://github.com/kgrgreer/TURTLES/tree/217cb43d7a16a98abd3e9984d1fc0416f8898d98),
including its available self-hosted language layers, with no C bootstrap.
Build two QEMU images: raw T0 and T0 with its JS-like parser/compiler and REPL.
Do not add garbage collection in this milestone: use bounded monotonic storage
and halt on exhaustion. Preserve an explicit distinction between the T0
language, unfinished upstream experiments, and browser/JavaScript host APIs.

## Chosen route

Upstream T0 compiles tokens into arrays of JavaScript closures. Serializing
those closures would not produce ARM instructions. We take the user's other
proposed route: implement T0's compiler, closure VM and value model directly
in AArch64, then assemble and package it with JavaScript. The original JavaScript
remains an independent semantic oracle. No C compiler, runtime, linker or guest
JavaScript engine participates in the build or boot.

The target is QEMU `virt-8.2`, Cortex-A53, one CPU, 512 MiB, TCG. The generic
loader starts the image at `0x40200000`, above QEMU's DTB reservation. Console
I/O uses PL011 UART. This establishes a repeatable platform before selecting
physical ARM hardware.

## Implementation and acceptance

1. Pin and preserve upstream source, license and provenance. Build an oracle
   that executes the unmodified core and the documented derived libraries.
2. Write a JavaScript AArch64 assembler and ELF/raw image packager. Independently
   check instruction encodings and make image generation deterministic.
3. Bring up ARM entry, floating-point access, UART and guarded memory regions.
4. Implement all intended T0 runtime/compiler forms: binary64/coercions,
   UTF-16, arrays, lexical closures and locals, early/late binding, immediate
   evaluation/emission, switch, captured dictionary lookup and nonlocal returns.
5. Port the T0-written parser/compiler layers. Repair the upstream library
   defects that prevent a usable REPL; retain and document original behavior.
6. Package raw T0 and JS-like images. Support guest evaluation of new source,
   multiline submissions, persistent session state and explicit host reboot.
7. Differentially test the actual QEMU serial interface; verify error recovery,
   each storage limit's permanent halt, and ELF/raw boot. Leave a working live
   console and reproducible commands.

The initial integer interpreter was a bring-up milestone, not the acceptance
boundary. It has been superseded by the compiler/VM under `runtime/full`.

## Meaning of self-hosting here

The existing parser combinators and JS-like compiler are T0 programs; they
execute and compile new input inside ARM. Upstream T0's primitive core itself
is JavaScript, so upstream does not already provide a native self-rebuilding
system. This milestone does not pretend otherwise: the guest compiler emits
T0 operations, and the ARM assembler/packager remains a host JavaScript tool.

A stronger future milestone is a T0-written ARM backend plus assembler and
packager that builds a replacement boot image from inside the guest, followed
by a reproducible second-generation build. That requires additional work.

## Following OS milestones

1. Add exception vectors and fault diagnostics, timer/interrupt support, and
   device-tree discovery instead of fixed board device addresses.
2. Add persistent image storage and virtio block I/O; define an image format
   for saved definitions and explicit code/data roots.
3. Design the memory/task/protection model and scheduling around the language.
   Revisit garbage collection only when requested; it is intentionally outside
   this milestone, so long-running sessions eventually exhaust storage.
4. Move the ARM backend and image tools into T0 and prove a rebuild in the guest.
5. Select real ARM hardware and supply its boot and device backend. QEMU `virt`
   is one virtual board, and the upstream RP2040/Cortex-M0+ target has a different
   instruction set and boot process.

A bootable language environment is the foundation here. Storage, scheduling,
process isolation, networking and a finished operating system remain future
work.
