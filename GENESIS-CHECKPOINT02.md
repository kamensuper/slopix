# Slopix 1.0 Genesis — Checkpoint 02 (source integration candidate)

This is an **unfinished development checkpoint**, not Slopix 1.0 final.
The original Slopix 0.9 Light disk and source remain unchanged.

## What is implemented

- Ring-3 GUI surface manager supports **six independent process-owned surfaces**;
  the 3D Demo and browser launch as separate ELF applications from SlopDE.
  A package-installed GUI app uses a generic launch window via `slop launch NAME`.
- SlopBrowse 0.2 is an independent Ring-3 ELF. It displays local FAT32 HTML
  documents (`START.HTM`, `ABOUT.HTM`), headings, paragraphs, selectable links,
  keyboard navigation, address editing, history and scrolling. It is **not**
  yet an internet browser. There is no actual NIC/TCP/HTTP/TLS integration.
- `slop` supports legacy `SLOPPKG1` and new `SLOPPKG2` asset bundles. v2 packages
  carry one static x86-64 ELF and up to seven additional 8.3 asset files.
  Each file has an independent CRC32 and size, and the package has bounded metadata.
  Installer checks all names/integrity before writing, stages temporary files,
  commits the registration LAST, and cleans up on errors where possible.
  Uninstall refuses to destroy a changed/missing installed file.
- `HELLOGUI.ELF` demonstrates an independently built, SDK-only Ring-3 graphical
  application with process-owned graphics and keyboard events.
- New disposable FAT32 disks:
  - `storage/genesis-browser.img`: preinstalled `DEMO.ELF`, `BROWSE.ELF`,
    `START.HTM`, `ABOUT.HTM`.
  - `storage/genesis-bundles.img`: `BROWSE.SLP`, `HELLOGUI.SLP`, `DEMO.SLP`,
    `HELLO.SLP`, `STORE.SLP` for testing package installation.

## Test results in the current build environment

- `make genesis-bundle-test`: PASS (host Python format tests + real C FAT32/VFS
  install, remount, byte-exact extraction, safe-uninstall checks).
- `make genesis-browser-test`: PASS (HTML heading/link parser, URL/path safety).
- `make genesis-apps-elf-test`: PASS (browser, hello-GUI and 3D ELFs load three
  consecutive times into isolated VM page mappings and release all host physical pages).
- `make genesis-host-test`: PASS (older GUI ownership, 3D loader, packages).
- `make genesis-fat-stream-test`: PASS (1,600 streaming appends and exact FAT32
  max file-size boundary on a sparse host device).
- Full C compilation reached the Rust allocator with no C compile errors; **the
  ISO build failed because `rustc` is unavailable here**.
- **No QEMU screenshot, guest boot, interactive browser session, or DOOM lifecycle
  validation was performed here**. Please run the guest on a Fedora machine.

## Fedora build + boot

Extract to a path WITHOUT parentheses/spaces, install your standard Slopix
build dependencies (including Rust target `x86_64-unknown-none`, GCC, GRUB,
`xorriso`, and QEMU), then:

```sh
make -j4
SLOPIX_DISK=storage/genesis-browser.img make run
```

For package-first testing (using the **disposable** disk image):

```sh
SLOPIX_DISK=storage/genesis-bundles.img make run
```

Once logged in, open Terminal and use:

```text
slop verify BROWSE.SLP
slop install BROWSE.SLP
slop list
slop launch BROWSE
slop install HELLOGUI.SLP
slop launch HELLOGUI
slop remove HELLOGUI
```

Only **one** generic package window is supported at once, but the dedicated
3D and Browser processes have distinct surfaces. After installing BROWSE,
click the SlopBrowse desktop item to launch the dedicated browser slot.

Browser keys: `/` address, Enter load or follow, Tab next hyperlink,
`[` back, `]` forward, `r` reload, arrows scroll, `h` help. Pages must currently
be named using FAT32 8.3 conventions, with no paths or URLs.

## Important limits (not done)

- **DOOM remains kernel-integrated** and its special-case restart bug is not fixed.
- Terminal, FileSlop, SlopFind and Slopettings remain kernel-integrated.
- The actual Ring-3 GUI close/reopen behavior has not yet been guest-tested.
- No native networking/HTTP/TLS, remote `.slop` repository, icons/dependencies
  in packages, or long filenames. FAT32 remains non-journaled.
- `.SLP` is the FAT32 8.3 filename; the external archive format is `.slop`.
- CRC32 only detects corruption; packages are not authenticated or signed.
  Treat only trusted executables as installable.
- No automatic package namespace: assets are stored at FAT32 root; name
  collisions are rejected instead of overwriting files.
- Package staging/cleanup is **not crash-atomic**, and the guest-side
  filesystem may need repair after power loss during writes.

Next release-blocking work: guest QEMU lifecycle verification, genuine DOOM
Ring-3 port with fresh process on every launch, GUI migration of remaining apps,
and real network stack + browser fetch.
