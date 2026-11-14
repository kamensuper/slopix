#!/usr/bin/env python3
"""CP05: create-only FAT32 disks with real Ring-3 desktop ELF programs.
Never touches any CP04, CP03 or 0.9 persistent user disk.
"""
import argparse
from pathlib import Path
from build_genesis_disk import seed

ROOT=Path(__file__).resolve().parents[1]
BOOT_APPS=[('TERM.ELF','sdk/TERM.ELF'),('FIND.ELF','sdk/FIND.ELF'),('SET.ELF','sdk/SET.ELF'),('FILES.ELF','sdk/FILES.ELF'),('DEMO.ELF','sdk/DEMO.ELF'),('DOOM.ELF','sdk/DOOM.ELF'),('FREEDOM.WAD','assets/freedoom/freedoom1.wad'),('LIBCDEMO.ELF','sdk/LIBCDEMO.ELF')]
BROWSER=[('BROWSE.ELF','sdk/BROWSE.ELF'),('START.HTM','sdk/pages/START.HTM'),('ABOUT.HTM','sdk/pages/ABOUT.HTM')]
BUNDLES=[('BROWSE.SLP','build/BROWSE.SLP'),('HELLOGUI.SLP','build/HELLOGUI.SLP'),('HELLO.SLP','build/HELLO.SLOP')]

def main():
 p=argparse.ArgumentParser(description=__doc__)
 p.add_argument('filename',help='New, nonexisting disposable FAT32 disk image')
 p.add_argument('--bundles',action='store_true',help='Leave browser and sample apps as installable .SLP bundles')
 a=p.parse_args()
 files=BOOT_APPS+(BUNDLES if a.bundles else BROWSER+[('HELLO.SLP','build/HELLO.SLOP')])
 assert len(files)<=12,"Root directory capacity exceeded"
 try:seed(a.filename,[(name,ROOT/source) for name,source in files])
 except (OSError,ValueError) as e:p.exit(1,f'ERROR: {e}\n')
if __name__=='__main__':main()
