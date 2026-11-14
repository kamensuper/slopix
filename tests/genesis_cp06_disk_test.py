#!/usr/bin/env python3
"""Verify all CP06 FAT32 boot assets, including browser bundle bytes.
This is a host disk test, not proof of QEMU execution.
"""
from pathlib import Path
import hashlib
import mmap
import struct

ROOT=Path(__file__).resolve().parents[1]
COMMON={'TERM.ELF':'sdk/TERM.ELF','FIND.ELF':'sdk/FIND.ELF',
        'SET.ELF':'sdk/SET.ELF','FILES.ELF':'sdk/FILES.ELF',
        'DEMO.ELF':'sdk/DEMO.ELF','DOOM.ELF':'sdk/DOOM.ELF',
        'FREEDOM.WAD':'assets/freedoom/freedoom1.wad'}
READY=dict(COMMON,**{'BROWSE.ELF':'sdk/BROWSE.ELF',
                      'START.HTM':'sdk/pages/START.HTM',
                      'ABOUT.HTM':'sdk/pages/ABOUT.HTM',
                      'HELLO.SLP':'build/HELLO.SLOP'})
BUNDLES=dict(COMMON,**{'BROWSE.SLP':'build/BROWSE.SLP',
                        'HELLOGUI.SLP':'build/HELLOGUI.SLP',
                        'HELLO.SLP':'build/HELLO.SLOP'})

def check(filename,sources):
    path=ROOT/'storage'/filename
    with path.open('rb') as fd, mmap.mmap(fd.fileno(),0,access=mmap.ACCESS_READ) as image:
        sector=struct.unpack_from('<H',image,11)[0]
        sectors_per_cluster=image[13]
        reserved=struct.unpack_from('<H',image,14)[0]
        fats=image[16]
        fat_sectors=struct.unpack_from('<I',image,36)[0]
        root=struct.unpack_from('<I',image,44)[0]
        assert sector==512 and sectors_per_cluster==1 and fats==2
        fat=reserved*sector
        fat_size=fat_sectors*sector
        data=(reserved+fats*fat_sectors)*sector
        def at_cluster(c): return data+(c-2)*sector
        entries={}
        for i in range(0,sector,32):
            offset=at_cluster(root)+i
            name=image[offset:offset+11]
            if name[0] in (0,0xe5): continue
            if image[offset+11]&0x08: continue
            label=name[:8].decode('ascii').rstrip()+'.'+name[8:].decode('ascii').rstrip()
            length=struct.unpack_from('<I',image,offset+28)[0]
            start=(struct.unpack_from('<H',image,offset+20)[0]<<16)|struct.unpack_from('<H',image,offset+26)[0]
            entries[label]=(length,start)
        for label,source in sources.items():
            assert label in entries,f'{filename}: missing {label}'
            expected=ROOT/source
            size,start=entries[label]
            assert expected.stat().st_size==size,f'{label}: file size changed'
            sha=hashlib.sha256()
            count=0;seen=set();c=start
            while count<size:
                assert c>=2 and c not in seen,f'{label}: FAT loop or bad cluster'
                seen.add(c)
                n=min(size-count,512)
                sha.update(image[at_cluster(c):at_cluster(c)+n])
                count+=n
                if count<size:
                    c=struct.unpack_from('<I',image,fat+c*4)[0]&0x0fffffff
            assert sha.digest()==hashlib.sha256(expected.read_bytes()).digest(),f'{label}: wrong bytes'
        # Two redundant FATs must agree: no half-written metadata image.
        assert image[fat:fat+fat_size]==image[fat+fat_size:fat+2*fat_size]
        print(f'PASS: {filename}, {len(sources)} boot assets, complete SHA256, mirrored FATs')

check('genesis-cp06-ring3-ready.img',READY)
check('genesis-cp06-ring3-bundles.img',BUNDLES)
