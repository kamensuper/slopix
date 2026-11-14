# Slopix user SDK v1 (experimental)

Build `make -C sdk` with x86-64 GCC and binutils. It produces HELLO.ELF without
editing/relinking the kernel. Copy it onto a stopped VM's FAT32 data image:

```sh
mcopy -i storage/slopix-data.img sdk/HELLO.ELF ::HELLO.ELF
```

Do not overwrite an existing user file. The delivered release image includes the
example; use a fresh image or another short name when experimenting. Never modify
an image concurrently with a running VM. In Terminal, `run HELLO.ELF` starts it,
`ps` shows actual processes, and `kill PID` terminates a running/blocked process.
A normal example verifies CPL3, prints a message and exits. The process may run
alongside the existing legacy desktop apps.

## ABI

Software interrupt `int 0x80`: RAX number; RDI, RSI, RDX arguments; RAX result.
Other general registers and x87/SSE state are preserved. Negative errno is returned
directly, without libc/TLS. Calls trap to a kernel stack, save context, return to
the normal kernel thread, and are then serviced with interrupts enabled. This is
an experimental, documented v1 interface, not a promised stable third-party ABI.

| Number | Name | Arguments | Result |
|---|---|---|---|
| 1 | WRITE | user pointer, length <=127 | bytes; 512 bytes/second/process quota |
| 2 | EXIT | signed 32-bit status | terminates and frees resources |
| 3 | TIME | none | boot clock microseconds |
| 4 | MAP | 1..8 pages | private zeroed RW/NX virtual address |
| 5 | YIELD | none | 0 on next scheduled slice |
| 6 | SLEEP | microseconds <=10,000,000 | blocks until deadline; then 0 |
| 7 | PID | none | actual process ID |
| 8 | OPEN | NUL-terminated root 8.3 name <=12 bytes | read-only handle 1..4 |
| 9 | READ | handle, writable user buffer, length <=4096 | bytes; advances offset |
| 10 | CLOSE | handle | 0; later reuse is rejected |

File syscalls stream up to 4096 bytes per READ and support four read-only
handles per process. The kernel loader can load static ELF files up to 1 MiB.
No raw block, port, framebuffer or kernel-memory access is exposed. WRITE sanitizes
non-printing control bytes and has a bounded rate. Important errors: EFAULT -14,
ENOMEM -12, EINVAL -22, EBADF -9, EIO -5, EMFILE -24, ENOSYS -38, EAGAIN -11.
No fork, signals, dynamic linking, libc, TLS, AVX, userspace audio or POSIX ABI.
Experimental Ring-3 GUI surface syscalls 13–15 are described below.
The process starts in `_start(uint64_t mode)`; it must EXIT instead of returning.

## Executable subset and layout

ELF64 little-endian x86-64 ET_EXEC. At most 16 program headers and 1400 user pages.
PT_LOAD code/data are below 0x100400000 and above 0x100000fff. Page-aligned segment
permissions cannot overlap. Writable executable pages, dynamic/interpreted/TLS
programs and executable stacks are rejected. Sections are irrelevant to loading.
Entry must point inside actual bytes of an executable segment. user.ld is the
reference layout. BSS and stack pages are zeroed. Heap begins at 0x100400000;
four stack pages end at 0x100800000, with an unmapped guard immediately below.
The lower kernel identity map is supervisor-only in every address space.

## Fault and scheduler tests

`run HELLO.ELF MODE` selects these deliberate tests:

| Mode | Behavior |
|---|---|
| 0 | CPL3 check, print, normal exit |
| 1 | UD2 invalid instruction |
| 2 | attempt supervisor memory write |
| 3 | attempt privileged CLI |
| 4 | divide by zero |
| 5 | infinite loop; timer must preempt it; terminate with kill |
| 6 | pointer/handle validation, zeroed mapping, actual file reads |
| 7 | execute an NX heap page |
| 8 | touch stack guard |
| 9 | process-specific SSE token across 50 sleeps |
| 10 | attempt code-page write |
| 11 | attempt supervisor memory read |
| 12 | execute NX stack |
| 13 | NT flag sanitization on return |
| 14 | 128 pages of private zeroed writable memory |
| 15 | overflow/cross-boundary user-pointer rejection |

Use serial logs for PROCESS_CREATED/EXIT/FAULT and USER_PAGE_FAULT/ERROR. `ps` and
SlopMon report scheduler counters. `sh run.sh` exposes serial output; `make debug`
provides a GDB remote stub. Fault vectors and page-fault error bits are real CPU
values. Kernel faults remain panics; legacy Ring-0 applications are not isolated.

Scheduling is single-CPU round-robin, one nominal 2 ms user slice per desktop
iteration. Timer IRQs preempt user code, with x87/SSE state saved separately from
the kernel. Kernel/driver code remains cooperative. Reported slice time includes
interrupt and host delays and is not CPU utilization or a hard real-time bound.

## Let There Be Light additions

ABI v1 retains syscall numbers1–10. OPEN now accepts bounded nested paths
(up to127 bytes); READ fetches at most4096 bytes at its advancing offset and
no longer loads the whole file into the kernel I/O buffer.

11 SEEK(handle, absolute_offset,0) returns the offset (<=UINT32_MAX); invalid
handles return-9, overflow-22. Seeking beyond EOF is allowed and reads return0.
12 SPAWN(path_pointer, numeric_argument,0) validates the string and calls the
normal ELF loader; failure returns-11, bad pointer-14. Child processes have their
own pages and handles. There is no inherited-handle or waitpid API.

`exec READ.ELF /DIR/FILE.BIN` uses an optional second entry argument in RSI,
pointing to a copied NUL-terminated <=127-byte string on the program's own stack.
RDI keeps the existing numeric argument convention. `run` remains compatible.
READ.ELF streams the actual file with4KiB memory and reports byte count/FNV-1a;
this fingerprint is a test/data comparison, not a cryptographic hash.

## Genesis development additions (experimental, subject to change)

The Ring-3 virtual address window is now 8 MiB (rather than 2 MiB), with
1400-page quota and up to 1 MiB ELF input. Existing syscall numbers 1–12
are unchanged. These additions currently have only host-side verification.

| Number | Name | Arguments | Result |
|---|---|---|---|
| 13 | GUI_OPEN | width <=640, height <=400 | opens one process-owned surface |
| 14 | GUI_PRESENT | RGB888 user pointer, pixel count | publishes frame, validates pointer |
| 15 | GUI_POLL | none | next packed key event, or 0 |
| 16 | CREATE | path, mode 0=new only or 1=truncate/create | writable/readable file handle |
| 17 | FWRITE | handle, user pointer, length <=4096 | bytes appended at seek offset |

`make -C sdk` additionally compiles `DEMO.ELF`, a genuinely standalone static
Ring-3 implementation of the original 3D meshes and renderer. To display the
new demo, boot on the dedicated Genesis test FAT32 disk with `DEMO.ELF`
installed. Launching the SlopDE 3D Demo spawns that program and its close
button calls `process_kill` on the process. A disk without `DEMO.ELF` shows a clear install message. Genesis no longer
silently runs the legacy Ring-0 renderer.

The GUI ABI is an early step, not a multi-window public toolkit: only one
user surface can be open at a time, and the desktop currently attaches it to
the 3D Demo window. DOOM and the other legacy GUI apps still run in Ring 0.

### `.slop` packages (v1 prototype)

The host tool `python3 tools/slop_package.py pack HELLO sdk/HELLO.ELF
HELLO.SLOP` creates an executable-only `.slop` package (32-byte versioned
header, single ELF payload, CRC32). Because the guest filesystem still
implements only FAT32 short 8.3 names, put it on disk under the alias
`HELLO.SLP`. In guest Terminal: `slop verify HELLO.SLP`,
`slop install HELLO.SLP`, `run HELLO.ELF`, `slop list`, `slop remove HELLO`.

The format is not signed and has no dependency solving, icons, or repository
handling. Only use trusted local packages. This is not yet the full Genesis
package-management goal.

### Ring-3 persistent storage writer

`STORE.ELF` is a real independently linked Ring-3 program that calls CREATE,
FWRITE, SEEK, READ and CLOSE. It truncates/creates `GENESIS.TXT`, writes 320 KiB
in 4 KiB chunks, reads it all back, and checks every byte. Once a Genesis
QEMU guest is built with writable FAT32 attached, try `run STORE.ELF` after
copying the file or installing `STORE.SLP`. The host build validates the ELF,
while the full guest execution path still requires a boot test.

FWRITE supports bounded RAM use and FAT32 EOF appends without recopying prior
file data. Non-EOF edits preserve the preexisting copy-on-write implementation.
The in-place streaming append is **not atomic across sudden power failure**;
this filesystem has no journal and requires `fsck.fat` if damaged.

## Genesis checkpoint 02 addendum

- `BROWSE.ELF`: standalone local HTML reader (actual Ring-3, *no network yet*).
  The browser's `START.HTM` and `ABOUT.HTM` assets live in `sdk/pages/`.
- `HELLOGUI.ELF`: independent graphical example built from SDK headers and font.
- SDK `font.h` is a copy of Slopix's licensed DejaVu-derived raster header
  (`assets/FONT-LICENSE.txt`). A GUI SDK app doesn't need the kernel `src/` tree.
- Package v2 example from the repository root:

```
python3 tools/slop_package.py bundle BROWSE sdk/BROWSE.ELF BROWSE.SLP sdk/pages/START.HTM sdk/pages/ABOUT.HTM
python3 tools/slop_package.py verify BROWSE.SLP
```

Until VFAT long filenames exist, the `.slop` package is named `.SLP` on the
Slopix FAT32 disk; packages are not yet cryptographically signed.

## Checkpoint 04 experimental HTTP syscall (number 18)

`SX_HTTP_GET=18`: RDI points to a NUL-terminated plain `http://` URL (maximum
127 bytes), RSI points to a writable user buffer, RDX is its capacity (1–32768).
Returns response body bytes, or a negative error; failed requests do **not**
return an HTML page. The kernel validates and copies the user data. Only a
single HTTP/1.0 request can run at once; it is currently **synchronous** and
can block GUI scheduling for several seconds. The main QEMU launch stays offline
unless `SLOPIX_NET=1` or `make run-net` is used.

Key error values: `-19` NIC absent, `-22` invalid URL, `-101` route/ARP failure,
`-110` timeout, `-71` malformed HTTP, `-90` oversize, `-95` unsupported chunked
encoding, `-1000-STATUS` non-200 HTTP status. No sockets API, HTTP redirects,
TLS/HTTPS or DHCP. Do not use this for secrets or authentication.
