# Third-party components

The first-party kernel components and original PNG artwork are MIT-licensed.
The combined DoomGeneric-containing kernel is distributed under GPL-2.0-or-later
with full corresponding source; see COPYING and DOOM-PORT.md. The raster
font is derived from DejaVu Sans Mono; its notices and license are included in
`assets/FONT-LICENSE.txt`.

The bootable ISO includes unmodified GRUB 2 BIOS modules from Ubuntu's
`grub-pc-bin` package, version `2.12-1ubuntu7.3`. GRUB is GPL-licensed;
`assets/GRUB-COPYRIGHT.txt` lists component copyright and license details.
The matching Ubuntu source package is included under `third_party/grub-source`
(the upstream source archive, Debian/Ubuntu packaging/patch archive and source
descriptor). It can be extracted with `dpkg-source -x` on Ubuntu with the
appropriate packaging tools installed. See the source's `INSTALL` and
`debian/` instructions for bootloader build details. These are external
bootloader sources, not Slopix kernel sources.

Protocol reference:
https://www.gnu.org/software/grub/manual/multiboot2/multiboot.html

GCC, binutils, xorriso, Python and QEMU are build/test dependencies and are not
part of the guest kernel. DejaVu asset regeneration optionally uses Pillow.

The Rust component is original Slopix source. The freestanding static link
includes Rust core/compiler-builtins as needed from Rust 1.85.1 for
x86_64-unknown-none. Rust copyright and MIT/Apache notices are in
assets/RUST-*.txt. No host Rust standard library is linked into the guest.
The PNG artwork is original Slopix art under the project's MIT license;
Pillow is a development-time asset tool, not part of the kernel.

DoomGeneric: https://github.com/ozkl/doomgeneric, GPL-2.0-or-later.
Pinned revision and original license: vendor/doomgeneric/UPSTREAM.txt and
vendor/doomgeneric/LICENSE. Original file notices retain id Software, Simon
Howard and other contributor copyrights. Full engine and adapter source is
included; local modifications are recorded in vendor/doomgeneric/slopix.patch.

Freedoom: https://github.com/freedoom/freedoom/releases/tag/v0.13.0, Phase 1 WAD.
Data is separately BSD-3-Clause, with COPYING.txt, CREDITS.txt and
CREDITS-MUSIC.txt retained in assets/freedoom. Commercial DOOM data is absent.

The teapot, torus and circle meshes are original procedural geometry generated
by tools/build_meshes.py. The teapot does not embed third-party Utah mesh data.
