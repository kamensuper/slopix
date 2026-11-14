from pathlib import Path
import importlib.util
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('build_icons',ROOT/'tools/build_icons.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
for name in ['terminal','demo','doom','find','settings']:
    source=Image.open(ROOT/f'assets/icons/source/{name}-256.png').convert('RGBA')
    assert source.size==(256,256) and source.getextrema()[3][0]==0 and source.getextrema()[3][1]==255
    for size in [16,32,48,64,96]:
        im=Image.open(ROOT/f'assets/icons/generated/{name}-{size}.png').convert('RGBA')
        assert im.size==(size,size)
        assert im.tobytes()==(ROOT/f'assets/icons/generated/{name}-{size}.rgba').read_bytes()
        assert im.tobytes()==module.resize_icon(source,size).tobytes()
# Invisible green must not contaminate a red shape's filtered edge.
im=Image.new('RGBA',(64,64),(0,255,0,0))
for y in range(16,48):
    for x in range(16,48):im.putpixel((x,y),(255,0,0,255))
small=module.resize_icon(im,16)
assert all(g==0 and b==0 for r,g,b,a in (small.getpixel((x,y)) for y in range(small.height) for x in range(small.width)) if a>0)
print('PASS: 16/32/48/64/96 PNG and RGBA output, transparency, reproducibility, premultiplied filtering without color halos')
