# Third-party components

The Slopix 0.9 project and combined kernel are distributed under GPL-3.0-or-later;
see LICENSE and COPYING. New storage and audio components use that SPDX identifier.
Earlier first-party kernel code and PNG artwork retain their original MIT
permissions and attribution, preserved in LICENSE-FIRST-PARTY-MIT. Choosing
GPLv3 for the combined distribution does not erase those permissions or
replace any upstream component's notices. Full corresponding source is included.
The raster
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
The PNG artwork retains its original MIT permission notice;
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

The SlopAudio implementation and generated chime are original GPL-3.0-or-later
Slopix work. Python generates the chime offline; no third-party audio library
is linked. Freedoom sound-effect data retains the WAD's separate license.

0.85 adds original SlopFind/Slopettings PNG artwork and kernel utilities.
DoomGeneric telemetry changes are recorded in vendor/doomgeneric/slopix-0.85.patch.
Existing upstream attribution and earlier patches remain intact.

Pre-Genesis incremental engine changes relative to 0.85 are supplied in
`vendor/doomgeneric/slopix-0.9.patch` alongside the original adapter patch.
