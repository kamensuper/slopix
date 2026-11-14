"""Host verification of every embedded icon size and transparent filtering."""
import importlib.util
from pathlib import Path
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('build_icons',ROOT/'tools/build_icons.py')
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
names=('terminal','demo','doom','find','settings','files','document','image','disk','sound','system')
for name in names:
    with Image.open(ROOT/f'assets/icons/source/{name}-256.png') as image:
        assert image.size==(256,256)
        for size in (16,24,32,48,64,96):
            with Image.open(ROOT/f'assets/icons/generated/{name}-{size}.png') as result:
                assert result.size==(size,size) and result.mode=='RGBA'
                assert result.getextrema()[3]==(0,255)
                assert result.tobytes()==mod.resize_icon(image,size).tobytes()
                assert result.tobytes()==(ROOT/f'assets/icons/generated/{name}-{size}.rgba').read_bytes()
# Hidden green must never bleed into the red foreground edge.
im=Image.new('RGBA',(256,256),(0,255,0,0))
for y in range(64,192):
    for x in range(64,192):im.putpixel((x,y),(255,0,0,255))
for size in (16,24,32,48,64,96):
    small=mod.resize_icon(im,size)
    assert all(small.getpixel((x,y))[1:3]==(0,0) for y in range(size) for x in range(size) if small.getpixel((x,y))[3])
print('PASS: 66 icon rasters, dimensions, alpha, deterministic output, no hidden-color halos')
