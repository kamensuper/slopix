#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
# Reuse a persistent disk; never format or repair user data automatically.
# --disk keeps the default image; --no-disk selects session-only operation.
if [ "${1:-}" = --no-disk ]; then
    set --
elif [ "$#" = 0 ] || [ "${1:-}" = --disk ]; then
    # Prefer the documented data image. Checkpoints ship a ready-made disk
    # instead, so fall back to the newest genesis-*ring3-ready image rather
    # than refusing to start.
    disk=${SLOPIX_DISK:-}
    if [ -z "$disk" ]; then
        if [ -f storage/slopix-data.img ]; then
            disk=storage/slopix-data.img
        else
            disk=$(ls -1 storage/genesis-*ring3-ready.img 2>/dev/null | sort -V | tail -n 1 || true)
        fi
    fi
    if [ -z "$disk" ] || [ ! -f "$disk" ]; then
        echo "Missing data disk." >&2
        echo "  Create one:  python3 tools/create_disk.py storage/slopix-data.img" >&2
        echo "  Or boot the shipped image:  SLOPIX_DISK=storage/genesis-cp08-ring3-ready.img sh run.sh" >&2
        echo "  Or run without storage:  sh run.sh --no-disk" >&2
        exit 1
    fi
    echo "slopix: disk $disk" >&2
    set -- -drive file="$disk",format=raw,if=ide,index=0,media=disk
else
    echo 'Usage: sh run.sh [--no-disk | --disk]' >&2
    exit 1
fi
if [ ! -f build/slopix.iso ]; then
    echo "Missing build/slopix.iso; run: make -j4" >&2
    exit 1
fi
# Explicit opt-in, preserving ordinary regression runs without a NIC.
if [ "${SLOPIX_NET:-0}" = 1 ]; then
    network="user,model=rtl8139"
else
    network=none
fi
exec qemu-system-x86_64 -machine pc -accel tcg -cpu qemu64 -m 256 -vga std -nic "$network" -display "${SLOPIX_DISPLAY:-sdl}" \
    -cdrom build/slopix.iso -boot d -audiodev "${SLOPIX_AUDIO_BACKEND:-pa},id=sound0" \
    -device sb16,audiodev=sound0,iobase=0x220,irq=5,dma=1 \
    -serial stdio -no-reboot -no-shutdown "$@"
