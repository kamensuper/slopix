# Let There Be Light architecture additions

See RELEASE-LIGHT.md for the new heap, streaming FAT32 API, lifecycle reset and
SDK additions. The following documents the preserved Pre-Genesis foundations;
its old whole-file/editor/clipboard limits are superseded where noted there.

# Pre-Genesis architecture decisions

## M0 first

The baseline passed existing regressions; new graphical PulseAudio testing
reproduced a real deadline miss. Main-thread DMA refill and stable engine asset
checkpoints are retained; see M0-AUDIO-REPORT.md for failed intermediate fixes
and measurements. No mixing, allocation or WAD lease release occurs inside IRQs.

## Protected userspace alongside legacy apps

The existing physical allocator remains in Rust. A C VM module allocates four
page-table pages and tracked private 4 KiB pages per process; every path reclaims
both. Kernel low identity mappings remain supervisor-only. The separate user
subtree has 4 KiB RX or RW/NX leaves; W^X is mandatory. Enabling EFER.NXE and
CR0.WP is architecture code. Boot still uses the original kernel and GRUB BIOS.

New GDT user descriptors, TSS.RSP0, denied I/O bitmap and private kernel entry
stacks establish privilege transitions. Assembly saves the complete general
register/interrupt frame and x87/SSE state. User return selectors/flags are
sanitized; a user fault is recorded and leaves that process. Kernel faults still
panic. The SDK and disk ELF loader are separate modules from kernel initialization.

Only user slices are timer-preemptible. A user trap saves context and returns to
the kernel main loop; syscalls run there with interrupts enabled. This preserves
main-thread ownership of the PMM, FAT32, software renderer and source leases.
It deliberately does not make the existing Ring-0 app code reentrant. Round-robin
selection interleaves user work with input, audio and desktop work. SLEEP has real
blocked/wakeup state. EXIT, faults and kill reclaim mappings/handles.

The initial syscall subset provides bounded console output, time, mapping,
yield/sleep, PID and read-only short-name file handles. No arbitrary device or
kernel address is accepted. Kernel-side copies translate validated owned pages;
no untrusted user pointer is directly dereferenced. The paused single-threaded
process cannot alter its mappings during a validated copy. Limits and ABI are in
sdk/README.md. This is an experimental interface rather than a compatibility
promise. Existing desktop apps remain in Ring 0 during this transition.

## Build staging

A stale temporary kernel file was found in the reused ISO staging tree. New ISO
builds stage exactly the kernel and GRUB config in a fresh temporary directory and
replace the output only on success. This prevents stray staging files from being
shipped and preserves the previous working ISO on a failed packaging command.

## Desktop and application boundaries

`src/ui/desktop_service.c` routes public desktop calls through a validated typed
backend table. Selection is boot-only and locks after initialization; SlopDE 2 is
the implemented backend. Display, input and kernel boot retain their public
interfaces. No runtime plugin loading or stable third-party desktop ABI is claimed.
The application registry owns names, descriptions and minimum window dimensions.
`src/ui/shell.c` owns panel, pinboard, context menu and the common work area;
`chrome.c` owns original vector icon and window-tab drawing. Visible tab shapes
and hitboxes share geometry. The existing dirty compositor and framebuffer APIs
remain underneath. Two explicit tile states retain restoration geometry.

Legacy 68-byte preference records remain version 1 and are loaded unchanged.
Panel and pinboard records use separate 96-byte version-2 DESK0/1.CFG slots with
checksums, bounds checks, generation selection and readback. Valid 92-byte version-1 records migrate in memory, retaining pin positions. Writes are debounced
and deferred during playback. This preserves earlier files without pretending
that dual records provide journaled/atomic power-loss recovery.

## Storage, FileSlop and clipboard

`src/fs/vfs.c` exposes a bounded whole-file, root-only interface; `fat_backend.c`
is its adapter. It is used by the new loader, user file syscalls, desktop config
and FileSlop. The inherited FAT32 implementation is preserved, including legacy
Terminal/preferences callers. No directory or rename operation is invented.
FileSlop scans on refresh/open, never during paint. Its static list, line index,
editor and clipboard all have explicit caps. Creation checks the complete root
listing case-insensitively before writing; deletion requires confirmation.
The clipboard copies filtered text into owned storage; there are no shared raw
pointers or automatic pasted-command execution.

## Audio ownership

The device API is private to src/audio/device.h. IRQ5 only acknowledges/counts
completed blocks; the main-thread mixer refills a four-block ring. Cheap safe
points check whether completion changed before reading expensive timer state.
Engine cache boundaries and batches of PMM self-test operations service audio
without reentering either subsystem. This reduces measured deadline misses;
it is not arbitrary kernel preemption. Mode regeneration still completes
synchronously. See M0-AUDIO-REPORT.md for the reproduced failure and rejected fixes.
