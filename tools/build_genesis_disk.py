#!/usr/bin/env python3
"""Create a NEW Slopix Genesis FAT32 test disk with a genuine Ring-3 demo.

This tool only creates files with exclusive-create mode. It never updates the
existing storage/slopix-data.img, even if called with the same path.
It seeds the FAT32 volume directly using create_disk.py's known layout.
"""
import argparse
import math
import struct
import sys
from pathlib import Path
from create_disk import create, RESERVED, FATS, FAT_SIZE, ROOT_CLUSTERS, CLUSTERS, SECTOR

def dos83(name):
    stem,ext=name.split('.')
    if not (1<=len(stem)<=8 and 1<=len(ext)<=3):raise ValueError(name)
    return (stem.ljust(8)+ext.ljust(3)).encode('ascii')

def seed(image, sources):
    image=Path(image)
    if image.exists():raise FileExistsError(f'Refusing to change existing disk: {image}')
    # Preflight everything before creating any disk image.
    files=[]
    for name,src in sources:
        filedata=Path(src).read_bytes()
        if not filedata:raise ValueError(f'Empty payload: {src}')
        files.append((dos83(name),filedata))
    first=2+ROOT_CLUSTERS+2  # root 2..9; seeded WELCOME.TXT and LICENSE.TXT 10, 11
    used=sum(math.ceil(len(data)/SECTOR) for _,data in files)
    if first+used>=CLUSTERS+2:raise ValueError('Files exceed volume capacity')
    create(image)
    fat_start=RESERVED*SECTOR
    fat_bytes=FAT_SIZE*SECTOR
    data_start=(RESERVED+FATS*FAT_SIZE)*SECTOR
    with image.open('r+b') as f:
        fat=bytearray(fat_bytes)
        f.seek(fat_start);fat[:]=f.read(fat_bytes)
        f.seek(data_start);root=bytearray(f.read(ROOT_CLUSTERS*SECTOR))
        cluster=first
        for i,(name,data) in enumerate(files,4):
            count=math.ceil(len(data)/SECTOR)
            if i>=ROOT_CLUSTERS*16:raise ValueError('Root directory entry limit exceeded')
            offset=i*32;root[offset:offset+11]=name;root[offset+11]=0x20
            for dateoff in (16,18,24):struct.pack_into('<H',root,offset+dateoff,0x21)
            struct.pack_into('<H',root,offset+20,(cluster>>16)&65535)
            struct.pack_into('<H',root,offset+26,cluster&65535)
            struct.pack_into('<I',root,offset+28,len(data))
            for j in range(count):
                c=cluster+j
                struct.pack_into('<I',fat,c*4,c+1 if j+1<count else 0x0fffffff)
                f.seek(data_start+(c-2)*SECTOR)
                f.write(data[j*SECTOR:(j+1)*SECTOR])
            print(f'{name.decode()}: {len(data)} bytes, {count} clusters')
            cluster+=count
        f.seek(data_start);f.write(root)
        f.seek(fat_start);f.write(fat)
        f.seek(fat_start+fat_bytes);f.write(fat)
        for sector in (1,7):
            f.seek(sector*SECTOR);info=bytearray(f.read(SECTOR))
            # Keep the formatter's already-reserved root/welcome/license clusters.
            struct.pack_into('<I',info,488,CLUSTERS-ROOT_CLUSTERS-2-used)
            struct.pack_into('<I',info,492,cluster)
            f.seek(sector*SECTOR);f.write(info)
    return image

def main():
    a=argparse.ArgumentParser(description=__doc__)
    a.add_argument('image',nargs='?',default='storage/genesis-test.img')
    a.add_argument('--packages-only',action='store_true',help='Include DEMO.SLP for install-from-package testing instead of preinstalled DEMO.ELF')
    a.add_argument('--bundles',action='store_true',help='Create a fresh package-first disk with SlopBrowse and HELLOGUI .slop bundles')
    a.add_argument('--browser-ready',action='store_true',help='Create a fresh disk with BROWSE.ELF, START.HTM, and ABOUT.HTM already installed')
    opts=a.parse_args()
    root=Path(__file__).resolve().parents[1]
    if opts.bundles and opts.browser_ready:a.error('Choose only one disk mode')
    if opts.bundles:
        files=[('BROWSE.SLP',root/'build/BROWSE.SLP'),('HELLOGUI.SLP',root/'build/HELLOGUI.SLP'),('DEMO.SLP',root/'build/DEMO.SLOP'),('HELLO.SLP',root/'build/HELLO.SLOP'),('STORE.SLP',root/'build/STORE.SLOP')]
    elif opts.browser_ready:
        files=[('DEMO.ELF',root/'sdk/DEMO.ELF'),('BROWSE.ELF',root/'sdk/BROWSE.ELF'),('START.HTM',root/'sdk/pages/START.HTM'),('ABOUT.HTM',root/'sdk/pages/ABOUT.HTM'),('HELLO.SLP',root/'build/HELLO.SLOP')]
    else:
        files=[('DEMO.SLP',root/'build/DEMO.SLOP') if opts.packages_only else ('DEMO.ELF',root/'sdk/DEMO.ELF'),('HELLO.SLP',root/'build/HELLO.SLOP'),('STORE.SLP',root/'build/STORE.SLOP')]
    try:seed(opts.image,files)
    except (OSError,ValueError) as e:a.exit(1,f'ERROR: {e}\n')
if __name__=='__main__':main()
