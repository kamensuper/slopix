#!/usr/bin/env python3
"""CP08: the CP05 desktop disk plus BENCH.ELF (SSE2 throughput + FPU state).

The root directory now spans more than one 512-byte sector, so this image has
13 entries (the CP05 layout had 12). build_genesis_disk.seed writes the whole
root cluster chain, which the kernel's FAT32 driver already walks.
"""
import argparse
from pathlib import Path
from build_genesis_disk import seed
from build_genesis_cp05_disk import BOOT_APPS, BROWSER

ROOT = Path(__file__).resolve().parents[1]
CP08_APPS = BOOT_APPS + [('BENCH.ELF', 'sdk/BENCH.ELF')]


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('filename', help='New, nonexisting disposable FAT32 disk image')
    a = p.parse_args()
    files = CP08_APPS + BROWSER + [('HELLO.SLP', 'build/HELLO.SLOP')]
    assert len(files) <= 16 * 8, 'Root directory cluster chain capacity exceeded'
    try:
        seed(a.filename, [(name, ROOT / source) for name, source in files])
    except (OSError, ValueError) as e:
        p.exit(1, f'ERROR: {e}\n')


if __name__ == '__main__':
    main()
