#!/usr/bin/env python3
"""PNG/JPEG -> bounded kernel P6 RGB wallpaper. Install with mcopy while QEMU is OFF."""
import argparse
from pathlib import Path
from PIL import Image,ImageOps
p=argparse.ArgumentParser();p.add_argument('source',type=Path);p.add_argument('output',type=Path);a=p.parse_args()
with Image.open(a.source) as im:
 im=ImageOps.exif_transpose(im).convert('RGB');im.thumbnail((160,120),Image.Resampling.LANCZOS)
 data=f'P6\n{im.width} {im.height}\n255\n'.encode()+im.tobytes()
 if len(data)>65536:raise SystemExit('Wallpaper exceeds filesystem limit')
 a.output.write_bytes(data);print(a.output,len(data),'bytes; FAT32 root filename must be 8.3, e.g. WALL.PPM')
