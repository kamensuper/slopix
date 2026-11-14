#!/usr/bin/env python3
"""Slopix Genesis .slop package builder/verifier.

SLOPPKG1: legacy single ELF. SLOPPKG2: ELF plus bounded 8.3 assets.
CRC32 detects accidental damage, NOT malicious tampering. Packages are unsigned.
"""
import argparse
import re
import struct
import zlib
from pathlib import Path

MAGIC1 = b'SLOPPKG1'
MAGIC2 = b'SLOPPKG2'
HEADER = struct.Struct('<8s8sIIHHI')
ENTRY = struct.Struct('<12sIII')
MAX_IMAGE = 1024 * 1024
MAX_ASSET = 512 * 1024
MAX_TOTAL = 2 * 1024 * 1024
MAX_FILES = 8
NAME = re.compile(r'[A-Z0-9_]{1,8}')
FILE = re.compile(r'[A-Z0-9_]{1,8}\.[A-Z0-9_]{1,3}')


def normalize_name(name):
    name = name.upper()
    if not NAME.fullmatch(name):
        raise ValueError('Package name must be 1..8 uppercase letters, digits or underscore')
    return name


def validate_elf(payload):
    if (len(payload) < 64 or len(payload) > MAX_IMAGE or
            payload[:6] != b'\x7fELF\x02\x01' or payload[18:20] != b'\x3e\x00'):
        raise ValueError('Expected static x86-64 little-endian ELF <= 1 MiB')


def pack(name, src, dest, major, minor):
    name = normalize_name(name)
    payload = Path(src).read_bytes()
    validate_elf(payload)
    if not 0 <= major <= 65535 or not 0 <= minor <= 65535:
        raise ValueError('Invalid version')
    head = HEADER.pack(MAGIC1, name.encode().ljust(8, b'\0'), len(payload), zlib.crc32(payload), major, minor, 1)
    Path(dest).write_bytes(head + payload)
    print(f'{dest}: legacy package {name} version {major}.{minor}, ELF bytes {len(payload)}')


def bundle(name, src, assets, dest, major, minor):
    name = normalize_name(name)
    if not 0 <= major <= 65535 or not 0 <= minor <= 65535:
        raise ValueError('Invalid version')
    exe = Path(src).read_bytes()
    validate_elf(exe)
    items = [(f'{name}.ELF', exe, 1)]
    for filename in assets:
        path = Path(filename)
        short = path.name.upper()
        if not FILE.fullmatch(short) or short.endswith(('.REG', '.TMP', '.ELF', '.SLP')):
            raise ValueError(f'Unsafe or unsupported 8.3 asset filename: {filename}')
        data = path.read_bytes()
        if not 0 < len(data) <= MAX_ASSET:
            raise ValueError(f'Asset must be 1..{MAX_ASSET} bytes')
        items.append((short, data, 2))
    if not 1 <= len(items) <= MAX_FILES:
        raise ValueError('Too many package files')
    names = [item[0] for item in items]
    if len(set(names)) != len(names):
        raise ValueError('Duplicate filenames in package')
    total = sum(len(item[1]) for item in items)
    if total > MAX_TOTAL:
        raise ValueError('Package payload exceeds 2 MiB')
    head = HEADER.pack(MAGIC2, name.encode().ljust(8, b'\0'), len(items), total, major, minor, 1)
    records = b''.join(ENTRY.pack(filename.encode().ljust(12, b'\0'), len(data), zlib.crc32(data), kind)
                       for filename, data, kind in items)
    Path(dest).write_bytes(head + records + b''.join(data for _, data, _ in items))
    print(f'{dest}: bundle {name} version {major}.{minor}, {len(items)} files, {total} payload bytes')


def parse(path):
    raw = Path(path).read_bytes()
    if len(raw) < HEADER.size:
        raise ValueError('Short package')
    magic, raw_name, a, b, major, minor, abi = HEADER.unpack_from(raw)
    name = raw_name.split(b'\0')[0]
    if (magic not in (MAGIC1, MAGIC2) or abi != 1 or
            not NAME.fullmatch(name.decode('ascii', errors='replace')) or
            name.ljust(8, b'\0') != raw_name):
        raise ValueError('Invalid header')
    if magic == MAGIC1:
        payload = raw[HEADER.size:]
        if len(payload) != a:
            raise ValueError('Incorrect size')
        validate_elf(payload)
        if zlib.crc32(payload) != b:
            raise ValueError('CRC mismatch')
        return name.decode(), major, minor, [(name.decode() + '.ELF', len(payload))]
    count, total = a, b
    if not 1 <= count <= MAX_FILES or total > MAX_TOTAL:
        raise ValueError('Invalid file count or payload total')
    at = HEADER.size + count * ENTRY.size
    if at + total != len(raw):
        raise ValueError('Incorrect bundle length')
    filenames = set()
    files = []
    elf_count = 0
    for i in range(count):
        entry = HEADER.size + i * ENTRY.size
        fname, size, crc, kind = ENTRY.unpack_from(raw, entry)
        filename = fname.split(b'\0')[0].decode('ascii', errors='replace')
        if (not FILE.fullmatch(filename) or fname != filename.encode().ljust(12, b'\0') or
                filename in filenames or kind not in (1, 2) or
                size < 1 or size > (MAX_IMAGE if kind == 1 else MAX_ASSET) or
                filename.endswith(('.REG', '.TMP', '.SLP'))):
            raise ValueError('Invalid bundle entry')
        filenames.add(filename)
        data = raw[at:at+size]
        if len(data) != size or zlib.crc32(data) != crc:
            raise ValueError('Truncated entry or CRC mismatch')
        if kind == 1:
            if filename != name.decode() + '.ELF':
                raise ValueError('Executable name must match package name')
            validate_elf(data)
            elf_count += 1
        elif filename.endswith('.ELF'):
            raise ValueError('Asset masquerading as ELF')
        files.append((filename, size))
        at += size
    if at != len(raw) or elf_count != 1:
        raise ValueError('Missing ELF or trailing payload')
    return name.decode(), major, minor, files


def verify(path):
    name, major, minor, files = parse(path)
    print(f'PASS: {name} version {major}.{minor}; {len(files)} files: ' + ', '.join(f'{n}={s}' for n, s in files))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest='cmd', required=True)
    b = sub.add_parser('pack', help='Legacy executable-only package')
    b.add_argument('name'); b.add_argument('elf'); b.add_argument('output')
    b.add_argument('--major', type=int, default=1); b.add_argument('--minor', type=int, default=0)
    q = sub.add_parser('bundle', help='Executable + 8.3 asset files')
    q.add_argument('name'); q.add_argument('elf'); q.add_argument('output')
    q.add_argument('assets', nargs='*'); q.add_argument('--major', type=int, default=1); q.add_argument('--minor', type=int, default=0)
    v = sub.add_parser('verify'); v.add_argument('package')
    a = p.parse_args()
    try:
        if a.cmd == 'pack':
            pack(a.name, a.elf, a.output, a.major, a.minor)
        elif a.cmd == 'bundle':
            bundle(a.name, a.elf, a.assets, a.output, a.major, a.minor)
        else:
            verify(a.package)
    except (ValueError, OSError) as e:
        p.exit(1, f'ERROR: {e}\n')

if __name__ == '__main__':
    main()
