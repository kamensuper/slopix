#!/usr/bin/env python3
"""PNG -> premultiplied Lanczos filtering -> straight RGBA -> embedded C assets."""
import argparse
import re
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
def resize_icon(image,size):
    if image.width!=image.height or not 16<=image.width<=4096:raise ValueError('icons must be square, 16..4096 px')
    image=image.convert('RGBA')
    # Filter premultiplied RGBa so invisible RGB cannot create dark/color fringes.
    return image.convert('RGBa').resize((size,size),Image.Resampling.LANCZOS).convert('RGBA')
def build(source,output,header,names=("terminal","demo")):
    output.mkdir(parents=True,exist_ok=True)
    blocks=['/* Generated straight RGBA; rebuild with make icons. */','#ifndef SLOPIX_ICONS_H','#define SLOPIX_ICONS_H']
    for name in names:
        if not re.fullmatch(r'[a-z][a-z0-9_]*',name):raise ValueError('invalid C icon name')
        with Image.open(source/(name+'-256.png')) as original:
            for size in [16,32,48,64,96]:
                im=resize_icon(original,size);raw=im.tobytes()
                im.save(output/f'{name}-{size}.png',optimize=True)
                (output/f'{name}-{size}.rgba').write_bytes(raw)
                if size in [16,64,96]:
                    blocks.append(f'static const unsigned char icon_{name}_{size}[{len(raw)}]={{')
                    blocks.extend(','.join(str(x) for x in raw[i:i+64])+',' for i in range(0,len(raw),64))
                    blocks.append('};')
    blocks.append('#endif');header.write_text('\n'.join(blocks)+'\n')
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--icons',nargs='+',default=['terminal','demo']);parser.add_argument('--source',type=Path,default=ROOT/'assets/icons/source');parser.add_argument('--output',type=Path,default=ROOT/'assets/icons/generated');parser.add_argument('--header',type=Path,default=ROOT/'src/icons.h');args=parser.parse_args()
    build(args.source,args.output,args.header,args.icons)
