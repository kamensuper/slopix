# Slopix Genesis Checkpoint 06 - Ring-3-only desktop execution + HTTP fixes

**Development source checkpoint, NOT a guest-verified Genesis 1.0 release.**

This archive is based on the original CP05 source, not the CP04-only HTTP
foundation. It preserves the SlopDE desktop, Ring-3 SDK, FAT32 storage, audio,
DoomGeneric/Freedoom userspace executable, browser, and `.slop` packaging.

## What CP06 actually changes

### Ring-3 application execution

- Removed the kernel's Ring-0 DOOM gameplay engine, old `doom_app`, its
  embedded Freedoom WAD, and related DoomGeneric vendor objects **from the
  kernel link**. The external `DOOM.ELF` and FAT32 `FREEDOM.WAD` remain.
- Removed the desktop's Doom open/tick/draw/input/close fallback branches.
  Missing or crashing `DOOM.ELF` now produces an honest unavailable state,
  never silent Ring-0 execution.
- Removed the Ring-0 Terminal UI fallback from SlopDE (render and input).
  Terminal must be a process spawned from `TERM.ELF` on FAT32.
- SlopDE's Finder, Settings, FileSlop, Demo, SlopBrowse, and installed-app
  paths continue to dispatch through independent process-owned ELFs.
- Focus changes to/from DOOM send visibility events so held inputs can be
  released when the game loses focus. Closing terminates its PID.
- Old diagnostic kernel terminal helper code remains for kernel logging and
  debug use, NOT as the SlopDE Terminal application. The whole kernel does
  NOT run in Ring 3: hardware, MMU, syscall implementations, and scheduling
  properly remain Ring 0.

**The change is source-level and host-tested. It has NOT been proven inside
QEMU. A successful ELF link/load is not evidence of a running, playable game.**

### HTTP / SlopBrowse 0.5

- HTTP/1.0 and 1.1 response parser with explicit Content-Length checking,
  bounded RFC chunked-response decoding, and rejection of malformed or
  ambiguous response framing.
- Handles bounded HTTP redirects 301, 302, 303, 307, 308, including absolute
  plain-HTTP locations and relative/root-relative locations. HTTPS redirects
  are rejected rather than downgraded.
- HTTP bodies with Content-Length or completed chunked framing can finish
  without waiting for the server's FIN (keep-alive peer support).
- SlopBrowse HTML parser preserves relative HTTP hyperlinks. The browser
  resolves links against the current origin rather than treating website
  paths as local FAT32 filenames. Local 8.3 HTML pages remain supported.
- Normal URL loading, back/forward/reload, keyboard and mouse interaction,
  and process-owned rendering remain in userspace.
- New `network-demo/NEXT.HTM` exercises relative HTTP navigation.
- QEMU driver can now opt in to an RTL8139 NIC and type `:` in web URLs.

The network remains **experimental**, QEMU slirp configuration is static
10.0.2.15/24 (no DHCP), TCP is a single-connection bounded client, and
HTTPS/TLS with real certificate validation is **not implemented**. Modern
CSS/JavaScript and general web compatibility are not implemented either.

## On Fedora

Install the build toolchain, Rust target `x86_64-unknown-none`, GRUB ISO
components, `xorriso`, and QEMU. In the extracted project root:

```sh
make -j4
SLOPIX_NET=1 SLOPIX_DISK=storage/genesis-cp06-ring3-ready.img make run
```

Start a separate Fedora terminal with the local HTTP test server:

```sh
python3 -m http.server 8000 --bind 127.0.0.1 --directory network-demo
```

In SlopBrowse, navigate to:

```
http://10.0.2.2:8000/TEST.HTM
```

You should see `REAL HTTP FROM SLOPIX!`. Follow its `NEXT.HTM` link to test
relative HTTP navigation. This is a real HTTP server on the *host*, not a
hardcoded webpage in the guest. The test only counts as successful if it
actually runs inside QEMU with network access enabled.

To run source-level tests without QEMU:

```sh
make genesis-cp06-host-test
make genesis-cp06-disk-test
```

After building the ISO, to run the actual end-to-end guest acceptance test:

```sh
make genesis-cp06-guest-test
```

The guest test boots a copy of the CP06 disk, launches and terminates Ring-3
apps, loads DOOM and reopens it, starts a temporary host HTTP server and
requests actual pages via RTL8139. It captures screenshot and serial logs.

For package-manager testing use the other new, disposable disk:

```sh
SLOPIX_NET=1 SLOPIX_DISK=storage/genesis-cp06-ring3-bundles.img make run
```

**Never overwrite** `storage/slopix-data.img` or your previous 0.9 / CP05
images. The CP06 disk generator refuses to replace any existing file:
`make genesis-cp06-disks` should only be run to create *missing* CP06 images.

## Remaining release blockers

- No completed ISO or in-guest acceptance report in this environment. The
  available container has `gcc` but not `rustc`, `grub-mkrescue`, or QEMU.
- CP05's Ring-3 utilities do not yet perfectly reproduce every legacy UI
  feature. They must be operated and tested before 1.0 is called complete.
- Real QEMU HTTP and DOOM gameplay/audio haven't been observed here.
- HTTPS and DHCP are not implemented. The network stack remains minimal and
  should not be exposed to untrusted networks as a hardened OS.

## Checks

See `TEST-REPORT-CP06.md` for the exact host checks and missing guest proof.
