#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
exec qemu-system-x86_64 -machine pc -accel tcg -cpu qemu64 -m 256 -vga std -nic none -cdrom build/slopix.iso -boot d -serial stdio -no-reboot -no-shutdown
