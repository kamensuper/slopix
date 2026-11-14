# Baseline audit and resolution — Slopix 0.9

# Pre-Genesis audit (in progress)

Baseline: unchanged Slopix 0.85 ISO SHA-256
2da0c78e3623fe442a47e4508068cbfbaddf6e64dff622633a2f6393df92be2e.
Development occurs only in slopix-0.9. Earlier release trees are preserved.

The inherited kernel uses a Rust physical-page bitmap, no general kernel heap,
and statically bounded application/render/audio buffers. Boot memory regions,
framebuffer aperture and modules are reserved before the PMM is sealed. FAT32
is root-only short names with bounded 64 KiB file operations. Rename and directory
navigation are not available. A file manager must expose these limits accurately.

Boot paging maps 0..4 GiB with supervisor 2 MiB identity pages. There is no user
address space, user GDT descriptor, TSS, syscall gate or process context. Kernel
exceptions panic unconditionally. Merely adding a ring transition would not
provide isolation or safe exception recovery. User mapping/ownership, safe trap
entry, FPU preservation and cleanup must be implemented together and verified.

Input IRQs append to a bounded queue; the foreground loop consumes input, services
SB16, updates apps, composes dirty regions, copies pixels, and sleeps with HLT.
Legacy apps execute cooperatively in Ring 0. A new scheduler must not pretend
those apps are protected processes or preempt non-reentrant filesystem/renderer
code. User execution must have a timer-limited budget and return to desktop work.

Audio currently uses two 512-byte halves, each 23.22 ms. audio_step stops on two
pending completions, while worst framebuffer-submission gaps previously exceeded
50 ms. This is a demonstrated design constraint, not yet a reproduced explanation
of the user's host-audio failure. Diagnostics and backend-period tests precede a
buffering change. Main-thread ownership of sound-lump leases must be retained.

Existing framebuffer clipping, cache, damage and opaque-window composition are
retained. Window appearance/input geometry tests must be adapted together when
SlopDE changes; assertions for actual behavior must not be removed.

The preceding findings describe the pre-change 0.85 baseline. The completed
implementation adds protected userspace, a four-block audio ring and new desktop
modules; see ARCHITECTURE-0.9.md and final regression reports for evidence.
