#!/usr/bin/env python3
"""Optional asset regeneration; the checked-in header needs no Python to build."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 16)
out = ['/* Rasterized DejaVu Sans Mono; see assets/FONT-LICENSE.txt. */',
       'static const unsigned char font[95][20][10] = {']
for code in range(32, 127):
    im = Image.new('L', (10, 20))
    ImageDraw.Draw(im).text((0, 0), chr(code), font=font, fill=255)
    px = [im.getpixel((x,y)) for y in range(im.height) for x in range(im.width)]
    out.append('{' + ','.join('{' + ','.join(map(str, px[y*10:(y+1)*10])) + '}' for y in range(20)) + '},')
out.append('};')
Path(__file__).resolve().parents[1].joinpath('src/font.h').write_text('\n'.join(out)+'\n')
