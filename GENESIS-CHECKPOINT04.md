# Slopix 1.0 Genesis — Checkpoint 04 (experimental HTTP)

**Development source checkpoint, NOT a completed Slopix 1.0 release.**

Checkpoint 04 is based on the actual supplied Checkpoint 03 full source. It does
not overwrite the original 0.9 system or CP03 FAT32 disks. It preserves the
Ring-3 programs, `.slop` v2 package installer, SB16 audio integration, and GUI
process lifecycle code from CP03.

## What was implemented

1. **PCI RTL8139 driver** (`src/net/rtl8139.c`): QEMU PCI device enumeration,
   bus-master enable, separate DMA RX/TX buffers, 8 KiB receive ring with
   overrun padding, bounded receive polling, four TX descriptors, IRQ masked,
   no user pointers passed to DMA. PCI IRQ support is intentionally absent.
2. **Ethernet/ARP/IPv4** (`src/net/stack.c`): Ethernet filtering, neighbor
   resolution, one-entry ARP cache, packet bounds, IPv4 header checksums,
   unfragmented IPv4 packets and a fixed route for QEMU user-mode networking.
3. **UDP and DNS**: checksum on outbound UDP packets; query ID verification,
   bounded response parsing for A records, retries/timeouts.
4. **TCP client**: three-way client connection establishment, in-order segment
   receive, cumulative ACK/FIN, bounded receive buffers, TCP checksums, SYN
   retransmission and a bounded fetch deadline. **Not a complete RFC-compliant
   TCP stack**: no receive reordering, congestion control, PMTU, general socket
   API, robust data retransmission or connection multiplexing.
5. **HTTP**: real outbound HTTP/1.0 GET with response parsing and status checks.
   One request at a time, maximum 32 KiB HTML body plus bounded headers;
   chunked transfer encoding is detected and rejected. HTTP redirects are not
   followed. **HTTPS is NOT implemented**: no TLS, certificate store/validation,
   or HTTP/2/3.
6. **Ring-3 system call 18, `SX_HTTP_GET`**: validates a short userspace URL and
   writable buffer, performs a single bounded fetch through kernel staging,
   then copies the result into Ring-3 memory. The fetch is synchronous and
   makes the GUI temporarily unresponsive. PIT wakeups service audio during
   blocking network waits; simultaneous apps are not scheduled during the call.
7. **SlopBrowse 0.4**: keeps working local FAT32 HTML and extends address entry
   and history to HTTP URLs. Clickable absolute `http://` links, HTTP errors,
   and explicit HTTPS rejection. Longer typed addresses scroll in the toolbar.
8. **Diagnostics**: `net` in Terminal; serial markers `NET_RTL8139_READY`,
   `NET_HTTP_BEGIN`, `NET_TCP_CONNECTED`, `NET_HTTP_OK` / failure.
9. **Opt-in networking**: use `SLOPIX_NET=1`, or `make run-net`. Normal `make run`
   remains `-nic none` to preserve old regression behavior.
10. **Fresh disposable test FAT32 images** in `storage/`:
    `genesis-cp04-browser.img` (BROWSE.ELF installed) and
    `genesis-cp04-bundles.img` (installable `.SLP` archives). Both were generated
    fresh and never overwrite an old image.

## Try live HTTP on Fedora, step by step

First install all required host build tools, including Rust and its
`x86_64-unknown-none` target, GRUB i386-pc BIOS tools, xorriso, mtools, GCC,
Python 3 and QEMU. The source build is **not** an already-bootable verified ISO.

In Terminal A (start a small real HTTP server on your Fedora host):

```sh
python3 -m http.server 8000 --bind 0.0.0.0 --directory network-demo
```

In Terminal B:

```sh
make -j4
SLOPIX_NET=1 SLOPIX_DISK=storage/genesis-cp04-browser.img make run
```

Or, with the project default source build already done:

```sh
SLOPIX_DISK=storage/genesis-cp04-browser.img make run-net
```

In the Slopix Terminal, type `net` to confirm that RTL8139 was detected.
Launch SlopBrowse, click its home-page **Test real HTTP networking** link,
or click the address bar and type:

```text
http://10.0.2.2:8000/TEST.HTM
```

A successful end-to-end test will display a page titled **REAL HTTP FROM
SLOPIX!** served by Python over the QEMU network, not from FAT32. The serial
console should include `NET_HTTP_OK`. Confirm that the browser can still open
`START.HTM` locally and that DOOM audio is intact afterward. Keep the server
running during the test. For remote Internet DNS, try
`http://neverssl.com/`, but modern servers may redirect or reject old HTTP.

To test `.slop` installation separately, close QEMU and boot the other disk:

```sh
SLOPIX_NET=1 SLOPIX_DISK=storage/genesis-cp04-bundles.img make run
```

Then use `slop verify BROWSE.SLP`, `slop install BROWSE.SLP`, `slop launch BROWSE`.
Never open **the same FAT32 image** from two QEMU instances at once.

## Verification performed in this environment

**Passed:**

- All modified freestanding C code compiled with GCC and `-Werror`.
- `make genesis-cp04-net-test`: HTTP parser tests, Internet checksum test,
  and deterministic Ethernet/ARP/DNS/TCP/HTTP mock RTL8139 integration test.
- `make genesis-browser-test`: local and absolute HTTP link parsing.
- `make genesis-browser-interaction-test`: actual SlopBrowse handler paths,
  mouse navigation, mock HTTP response rendering, HTTPS rejection.
- `make genesis-apps-elf-test`: Ring-3 browser, 3D Demo, HELLOGUI ELF
  validation/VM ownership and reclamation tests.
- End-to-end in-memory FAT32/VFS `.slop` v1/v2 install/verify/remove with
  `storage/genesis-cp04-bundles.img`, byte-exact program and page comparison.
- Bundle format host tests; fresh 64 MiB FAT32 disk creation.
- Whole C/kernel build compilation reached the Rust dependency.

**NOT verified:** Guest QEMU boot, PCI device behavior, live DNS or HTTP traffic,
regression-free audio/desktop during a real network request, a bootable ISO,
userspace process cleanup during a blocking HTTP syscall. No QEMU, `rustc`,
GRUB ISO creator, or package repository network was available in the developer
container. The mock wire test is not a replacement for actual guest testing.

## Known constraints / next milestone

- Fixed QEMU SLIRP config: 10.0.2.15/24, gateway 10.0.2.2, DNS 10.0.2.3.
  **DHCP is not implemented.** Not yet a generic Ethernet configuration stack.
- For real desktop responsiveness, replace the synchronous HTTP syscall with
  per-process asynchronous bounded sockets and network timeouts. Timer-driven
  audio servicing is retained, but GUI rendering blocks during fetch.
- Harden TCP with retransmission, receive reordering, duplicate ACK analysis,
  large flows and per-process connection ownership. Test fragmentation handling.
- Implement TLS 1.2/1.3 only with cryptographic verification and correct time.
  Do NOT call the current version an HTTPS browser.
- CP03 release blockers still remaining: DOOM, Terminal, FileSlop and other
  legacy applications require full Ring-3 migration. Persistent FAT32 still
  lacks power-loss journaling; framebuffer and network are QEMU-PC specific.

**This archive is a substantive network implementation and a host-verified
protocol-stack checkpoint, not a guest-proven release.**
