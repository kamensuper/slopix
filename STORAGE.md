> Historical experimental subsystem: all further work is deferred to 1.0
> Genesis. An intermittent ATA append failure remains unresolved. The 0.7
> launcher disconnects this disk by default; --disk explicitly opts in.

# FAT32 persistent storage in Slopix 0.6

## Run and use

`sh run.sh` attaches `storage/slopix-data.img` as the primary-master IDE hard
disk, separate from the boot CD. The included image is a real 64 MiB FAT32
superfloppy with two FATs, FSInfo and backup boot/FSInfo sectors. If the image
is missing, the launcher creates it; it never recreates or truncates an existing
image. `make clean` removes only build products, not persistent data.

In Terminal:

```text
diskinfo
ls
cat WELCOME.TXT
write NOTE.TXT hello from Slopix
append NOTE.TXT this is another line
cat note.txt
sync
rm NOTE.TXT
```

`write` creates or replaces a file. `append` requires an existing file.
Both append a newline to the supplied text; `write EMPTY.TXT` writes one newline,
not a zero-byte file. Input is still limited to 255 bytes per command. The
filesystem API reads/writes binary files up to 64 KiB; the Terminal is a text
interface and replaces nonprintable file bytes with dots. `cat` emits bounded
lines into the existing 256-line scrollback. Names are case-insensitive ASCII
8.3 names using letters, digits, underscore and hyphen; there are no paths,
subdirectory creation, long filename creation, rename or shell redirection yet.

Every successful file mutation is flushed before the success message. `sync`
explicitly flushes the device too. Data lives in the image: keep that file when
upgrading the ISO. Replacing the ISO does not replace the disk. Do not run two
VMs against the same writable image or edit it from the host while QEMU runs.

## Implementation and scope

- `src/storage/ata.c`: legacy primary-master LBA28 ATA PIO, single 512-byte sector
  commands and FLUSH CACHE. No BIOS calls, external filesystem library or host
  filesystem service is used by the guest. QEMU PC/IDE is the tested controller.
- `src/storage/fat32.c`: freestanding C with a bounded FAT cache, directory cache,
  and cluster-ownership bitmap. No dynamic kernel heap is introduced.
- `src/storage/storage.h`: explicit block-device and filesystem interfaces.
- `tools/create_disk.py`: deterministic standard-library host formatter, exclusive
  file creation. This never runs inside the kernel. It refuses an existing path.

A FAT32 superfloppy or the first type 0x0b/0x0c MBR partition is supported.
512-byte sectors, power-of-two clusters of 1..128 sectors, two mirrored FATs,
FAT32 version 0 and ordinary mirroring flags are required. The volume must have
65,525..262,142 data clusters. Larger/unsupported layouts are rejected.
The root chain can contain at most 128 sectors (64 KiB) and is not grown by the
kernel. The supplied root reserves eight clusters: 128 directory slots,
including the volume label and three initial files (124 slots initially free).
Files use at most 64 KiB through the API; an existing larger file is listed but
cannot be read by `cat` or replaced by `append`.

Mount checks include volume/partition/disk bounds, arithmetic overflow, FAT
capacity, matching FAT copies, reserved FAT entries, root bounds, duplicate
short names, chain validity/length, cycles and crosslinks among supported root
files and the root directory. Free-cluster accounting is recomputed from FAT;
FSInfo is a hint, never trusted for allocation. Bad clusters are never allocated.

Volumes containing long filename entries or subdirectories are mounted read-only:
Slopix can list their root short aliases and read root regular files, but does
not recursively validate or modify unsupported trees. Unclean volumes and lost
allocated clusters also force read-only mode. Structural corruption or mismatched
FATs rejects mounting. No disk/invalid disk remains a usable desktop and Terminal;
the kernel never formats, repairs or silently resets an image.

## Write ordering and failure behavior

Replacing a file uses a fresh chain while the previous chain remains allocated.
The operation clears the FAT clean flag in both copies and flushes it, invalidates
FSInfo counts, writes/flushes new data and mirrored FAT entries, then publishes
and flushes the root entry. Only then are the old clusters freed and flushed.
Free counts are updated, and the clean flag is set and flushed last. Deletion
publishes a deleted directory entry before freeing its chain. The FAT high
reserved nibble is retained. No stale data leaks from partial new sectors.

Copy-on-write requires spare room for the replacement as well as the old file.
Out-of-space and directory-full failures occur before starting a transaction and
preserve the old file. Allocation is bounded and prevents live cluster reuse.
Any device read/write/flush failure disables writes for the rest of that boot.

This is not a journal or a claim of power-loss atomicity. Loss of power during a
metadata transaction can leave a dirty volume, lost clusters, a torn sector, or
mismatched FAT copies requiring a host repair. Successful mutations are synced;
transactions interrupted before success are not guaranteed recoverable by
Slopix. Back up the image before running host repair tools.

## Timing and responsiveness

Disk commands execute synchronously on the existing main kernel thread. ATA
commands poll briefly, then sleep using HLT while awaiting readiness; PIT and
input interrupts remain enabled. Each wait has a 100 ms timer deadline and an
independent iteration budget. The driver uses no DMA or additional IRQ handlers.
A slow/faulty device can briefly pause composition, and this is not preemptive
I/O scheduling. Short successful write latency with three apps is recorded in
`build/storage-results.json`; it includes QMP's input-driver delay, not just disk
time. Terminal output and large file operations may take longer.

A guest cannot safely unmount/eject an arbitrary device yet. The launcher uses a
dedicated disk image. Real hardware, AHCI/NVMe/USB, GPT, partitions outside the
LBA28 range, and physical disks have not been tested.

## Host interoperability

With the VM stopped and dosfstools/mtools installed:

```sh
fsck.fat -vn storage/slopix-data.img
mdir -i storage/slopix-data.img ::
mtype -i storage/slopix-data.img ::NOTE.TXT
mcopy -i storage/slopix-data.img host.txt ::HOST.TXT
```

Use 8.3 destination names. Long-name metadata or subdirectories added by the
host intentionally make the volume read-only to Slopix. `fsck.fat -vn` checks
without changing anything; repair is a separate host action.

## What does not persist yet

Desktop/window state, Terminal history, and DOOM saves/settings are still RAM
only. DOOM's private stdio adapter remains restricted to the embedded WAD; the
new filesystem is not silently exposed to the engine. Its save/load menu now
says the save adapter is not connected. Persistent game saves need their own
bounded stream adapter and save/load regression tests in a later change.

## References

On-disk layout reference: Microsoft FAT specification version 1.03:
https://www.cs.fsu.edu/~cop4610t/assignments/project3/spec/fatspec.pdf

The implementation is original C; no reference filesystem implementation is
copied. Build-time verification uses independent dosfstools/mtools optionally.
