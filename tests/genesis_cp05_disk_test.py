#!/usr/bin/env python3
"""Confirm FAT32 image includes every standalone userspace ELF and unaltered Freedoom IWAD.
Tests the disk on the host; NOT a substitute for booting Slopix in QEMU.
"""
import hashlib
import mmap
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
REQUIRED=['TERM.ELF','FIND.ELF','SET.ELF','FILES.ELF','DEMO.ELF','DOOM.ELF','FREEDOM.WAD']
WAD=ROOT/'assets/freedoom/freedoom1.wad'

def verify(path):
    with path.open('rb') as fd,mmap.mmap(fd.fileno(),0,access=mmap.ACCESS_READ) as image:
        sector_size=struct.unpack_from('<H',image,11)[0]
        sectors_per_cluster=image[13]
        reserved=struct.unpack_from('<H',image,14)[0]
        fats=image[16]
        fat_sectors=struct.unpack_from('<I',image,36)[0]
        fat_base=reserved*sector_size
        data_base=(reserved+fats*fat_sectors)*sector_size
        cluster_bytes=sector_size*sectors_per_cluster
        assert sector_size==512 and sectors_per_cluster==1
        def cluster_at(c):return data_base+(c-2)*cluster_bytes
        root=struct.unpack_from('<I',image,44)[0]
        found={}
        for i in range(0,cluster_bytes,32):
            at=cluster_at(root)+i
            name=image[at:at+11]
            if name[0] in (0,0xe5):continue
            stem=name[:8].decode('ascii').rstrip();ext=name[8:].decode('ascii').rstrip()
            label=stem+('.'+ext if ext else '')
            size=struct.unpack_from('<I',image,at+28)[0]
            first=(struct.unpack_from('<H',image,at+20)[0]<<16)|struct.unpack_from('<H',image,at+26)[0]
            found[label]=(size,first)
        for name in REQUIRED:assert name in found,f'{path.name}: missing {name}'
        for name,source in [('DOOM.ELF',ROOT/'sdk/DOOM.ELF'),('FREEDOM.WAD',WAD)]:
            size,c=found[name];expected=hashlib.sha256(source.read_bytes()).hexdigest()
            assert size==source.stat().st_size
            digest=hashlib.sha256();left=size;seen=set()
            while left:
                assert 2<=c<129000 and c not in seen,f'{name}: invalid FAT chain'
                seen.add(c)
                n=min(left,cluster_bytes);digest.update(image[cluster_at(c):cluster_at(c)+n]);left-=n
                if left:
                    c=struct.unpack_from('<I',image,fat_base+c*4)[0]&0x0fffffff
            assert digest.hexdigest()==expected,f'{name}: bytes altered in FAT32 image'
        print(f'PASS: {path.name} ({len(REQUIRED)} standalone app assets; byte-for-byte WAD and DOOM ELF)')

for filename in ('genesis-cp05-ring3-ready.img','genesis-cp05-ring3-bundles.img'):
    verify(ROOT/'storage'/filename)
