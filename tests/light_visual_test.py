"""Capture actual native-pixel guest UI at release resolutions."""
import tempfile,shutil,time
from pathlib import Path
from PIL import Image
from qemu_driver import Guest,ROOT
with tempfile.TemporaryDirectory(dir=ROOT/'build') as temp:
 disk=Path(temp)/'visual.img';shutil.copy2(ROOT/'storage/slopix-data.img',disk)
 g=Guest(['-drive',f'file={disk},format=raw,if=ide,index=0,media=disk'])
 try:
  g.app(1);g.wait('CUBE_STATS',10);g.app(5)
  for w,h in [(800,600),(1280,800),(1920,1080)]:
   g.app(0);g.command(f'display {w} {h}','Display mode applied');g.x=min(g.x,w-1);g.y=min(g.y,h-1)
   g.app(5);g.move(w-1,h//2);time.sleep(.2)
   p=ROOT/'build'/f'light-desktop-{w}-{h}.ppm';g.screenshot(p.name)
   im=Image.open(p);assert im.size==(w,h);im.save(p.with_suffix('.png'))
  (ROOT/'build/light-visual.log').write_text(g.output())
 finally:g.close()
print('PASS: actual native-pixel UI captures at800x600,1280x800,1920x1080')
