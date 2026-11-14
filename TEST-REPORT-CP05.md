# CP05 verification and evidence report

## Passed locally

- `make -C sdk DOOM.ELF`: standalone DoomGeneric engine and custom userspace libc + FAT32 WAD + PCM backend compiled and linked.
- `make genesis-cp05-host-test`: eight user ELFs each independently loaded into fresh VM and destroyed three times; GUI ownership/surface/keyboard/mouse test passed; static syscall ABI invariants passed.
- `make genesis-cp05-disk-test`: full byte-exact SHA256 of `DOOM.ELF` and `FREEDOM.WAD` recovered via actual FAT32 cluster chain from both ready and bundle images passed.
- `make genesis-cp04-net-test`: HTTP parser/ARP/DNS/IPv4/TCP simulated-wire integration tests passed.
- `make genesis-browser-interaction-test`: address field, history, links, HTTP response, explicit HTTPS rejection passed.
- `build/genesis-package-fat-test storage/genesis-cp05-ring3-bundles.img`: verify/info/install/remove and FAT32 cold mount tests passed.
- C `-Werror` build for changed desktop, app, GUI and process source passed; `make -k -j8` reported only missing `rustc` and no other C compilation errors.

## Not run / not demonstrated

- Full ISO build (`rustc` missing). No full kernel link or boot ISO created in this environment.
- Real QEMU guest execution (QEMU not installed), therefore no verified Doom playing/audio/FAT32 reads as Ring 3.
- `make genesis-cp05-guest-test` provided but not executed; all user-visible claims must remain conditional until logs confirm the boot session.
- Live HTTP or HTTPS requests from QEMU; previous CP04 stack's host simulation does not prove network access.

## Known gaps

- Kernel contains legacy Ring-0 Doom engine **as fallback** if user ELF/WAD cannot launch; kernel debug helpers remain. Thus 'FULL Ring 3' describes the new desktop application execution paths, not complete removal of the legacy code or verified guest behavior.
- Userspace Terminal, Find, Settings and Files implement core workflows, not every legacy screen or shell command.
- New userspace memory footprint and Doom frame pacing under QEMU unmeasured. Large FAT32 random reads may be slow; real QEMU integration required.
