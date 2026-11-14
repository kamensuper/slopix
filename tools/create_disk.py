#!/usr/bin/env python3
"""Create a NEW 64 MiB FAT32 superfloppy; refuse to overwrite existing data.
Standard-library only. Host-side formatting, never called by the guest.
"""
import argparse, struct
from pathlib import Path
SECTOR=512
TOTAL=64*1024*1024//SECTOR
RESERVED=32
FATS=2
FAT_SIZE=1024
CLUSTERS=TOTAL-RESERVED-FATS*FAT_SIZE
ROOT_CLUSTERS=8

def create(path):
    path=Path(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    boot=bytearray(512)
    boot[:3]=b'\xeb\x58\x90';boot[3:11]=b'SLOPIX  '
    struct.pack_into('<HBHBHHBHHHII',boot,11,512,1,RESERVED,2,0,0,0xf8,0,63,255,0,TOTAL)
    struct.pack_into('<IHHIHH',boot,36,FAT_SIZE,0,0,2,1,6)
    boot[64]=0x80;boot[66]=0x29
    struct.pack_into('<I',boot,67,0x534c4f50)
    boot[71:82]=b'SLOPIX DATA';boot[82:90]=b'FAT32   '
    boot[510:512]=b'\x55\xaa'
    info=bytearray(512)
    struct.pack_into('<I',info,0,0x41615252)
    struct.pack_into('<IIII',info,484,0x61417272,CLUSTERS-ROOT_CLUSTERS-2,12,0)
    struct.pack_into('<I',info,508,0xaa550000)
    fat=bytearray(FAT_SIZE*512)
    for c,n in ((0,0x0ffffff8),(1,0x0fffffff)):
        struct.pack_into('<I',fat,c*4,n)
    for c in range(2,2+ROOT_CLUSTERS):
        struct.pack_into('<I',fat,c*4,c+1 if c<1+ROOT_CLUSTERS else 0x0fffffff)
    for c in (2+ROOT_CLUSTERS,3+ROOT_CLUSTERS):
        struct.pack_into('<I',fat,c*4,0x0fffffff)
    root=bytearray(512)
    root[:11]=b'SLOPIX DATA';root[11]=8
    files=[('WELCOME TXT',b'Welcome to Slopix persistent FAT32 storage!\nTry: ls, cat WELCOME.TXT, write NOTE.TXT hello, append NOTE.TXT world\nEach successful write is flushed to this disk image.\n'),
           ('LICENSE TXT',b'Slopix project: GNU GPLv3. Bundled third-party notices remain applicable.\n'),
           ('EMPTY   TXT',b'')]
    for i,(name,data) in enumerate(files,1):
        off=i*32;root[off:off+11]=name.encode();root[off+11]=0x20
        for dateoff in (16,18,24):struct.pack_into('<H',root,off+dateoff,0x21)
        # EMPTY has no allocated cluster.
        struct.pack_into('<H',root,off+26,i+1+ROOT_CLUSTERS if data else 0)
        struct.pack_into('<I',root,off+28,len(data))
    struct.pack_into('<I',info,488,CLUSTERS-ROOT_CLUSTERS-2)
    with path.open('xb') as f:
        f.truncate(TOTAL*512)
        for relative,payload in ((0,boot),(1,info),(6,boot),(7,info),(RESERVED,fat),(RESERVED+FAT_SIZE,fat),(RESERVED+FATS*FAT_SIZE,root)):
            f.seek(relative*512);f.write(payload)
        for i,(_,data) in enumerate(files,1):
            if data:
                f.seek((RESERVED+FATS*FAT_SIZE+ROOT_CLUSTERS+i-1)*512);f.write(data)
    print(f'Created {path}: 64 MiB FAT32, {CLUSTERS} clusters (512 bytes each)')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path',nargs='?',default='storage/slopix-data.img')
    args=parser.parse_args()
    try:create(args.path)
    except FileExistsError:parser.exit(1,f'Refusing to overwrite existing disk: {args.path}\n')
