#!/usr/bin/env python3
"""Generate a SPARSE 5GiB FAT32 superfloppy for MAX_FILE_SIZE boundary tests.

Only ~2MiB of FAT metadata occupies host disk storage. It never creates
actual 4GiB of file payload, and it refuses existing paths.
"""
import argparse
import struct
from pathlib import Path
SECTOR=512
TOTAL=5*1024*1024*1024//512
SPC=64
RESERVED=32
FATSZ=1536
FATS=2
CLUSTERS=(TOTAL-RESERVED-FATS*FATSZ)//SPC
FILE_BYTES=0xffffff00
USED=(FILE_BYTES+SPC*SECTOR-1)//(SPC*SECTOR)
assert CLUSTERS>=65525 and USED+3<CLUSTERS+2

def create(path):
    path=Path(path)
    boot=bytearray(512)
    boot[:3]=b'\xeb\x58\x90';boot[3:11]=b'SLOPIX  '
    struct.pack_into('<HBHBHHBHHHII',boot,11,512,SPC,RESERVED,2,0,0,0xf8,0,63,255,0,TOTAL)
    struct.pack_into('<IHHIHH',boot,36,FATSZ,0,0,2,1,6)
    boot[64]=0x80;boot[66]=0x29;struct.pack_into('<I',boot,67,0x47454e31)
    boot[71:82]=b'GENESIS FAT';boot[82:90]=b'FAT32   ';boot[510:512]=b'\x55\xaa'
    info=bytearray(512)
    struct.pack_into('<I',info,0,0x41615252)
    struct.pack_into('<IIII',info,484,0x61417272,CLUSTERS-USED-1,USED+3,0)
    struct.pack_into('<I',info,508,0xaa550000)
    fat=bytearray(FATSZ*SECTOR)
    struct.pack_into('<III',fat,0,0x0ffffff8,0x0fffffff,0x0fffffff)
    for c in range(3,3+USED):struct.pack_into('<I',fat,c*4,0x0fffffff if c==2+USED else c+1)
    root=bytearray(512);root[:11]=b'GENESIS FAT';root[11]=8
    entry=32;root[entry:entry+11]=b'MAXFILE BIN';root[entry+11]=0x20
    for i in (16,18,24):struct.pack_into('<H',root,entry+i,0x21)
    struct.pack_into('<H',root,entry+26,3)
    struct.pack_into('<I',root,entry+28,FILE_BYTES)
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open('xb') as f:
        f.truncate(TOTAL*SECTOR)
        for lba,data in ((0,boot),(1,info),(6,boot),(7,info),(RESERVED,fat),
                         (RESERVED+FATSZ,fat),(RESERVED+2*FATSZ,root)):
            f.seek(lba*SECTOR);f.write(data)
    print(f'Sparse FAT32 fixture: logical {TOTAL*SECTOR:,} bytes, {USED} clusters for {FILE_BYTES:,}-byte file')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('output');a=p.parse_args();create(a.output)
