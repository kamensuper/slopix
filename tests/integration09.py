"""Delivered disk/ELF plus all six windows through top-panel mode changes."""
import tempfile,shutil,re,time,subprocess
from pathlib import Path
from qemu_driver import Guest,ROOT
with tempfile.TemporaryDirectory(dir=ROOT/'build') as d:
 disk=Path(d)/'delivered.img';shutil.copy2(ROOT/'storage/slopix-data.img',disk)
 g=Guest(['-drive',f'file={disk},format=raw,if=ide,index=0,media=disk','-audiodev','none,id=sound0','-device','sb16,audiodev=sound0'])
 try:
  g.command('run HELLO.ELF');g.wait('PROCESS_EXIT pid=1 value=0')
  g.command('run HELLO.ELF 1');g.wait('PROCESS_FAULT pid=2 value=6');g.command('echo isolated_fault','\nisolated_fault\n')
  for i in [1,2,3,4,5]:g.app(i)
  g.wait('DOOM_READY',30)
  g.app(4);g.click(640,145);g.click(550,290);g.wait('PANEL_LAYOUT top=1')
  for w,h in [(800,600),(1024,600),(1920,1080),(1600,900),(1280,800)]:
   g.app(0);g.command('audio tone 440 10000','AUDIO_TONE_STARTED');g.command(f'display {w} {h}','Display mode applied')
   raw=g.screenshot('integration09-mode.ppm');assert raw.split(b'\n',3)[1]==f'{w} {h}'.encode()
   g.x=min(g.x,w-1);g.y=min(g.y,h-1)
   boxes={}
   for s in g.output().splitlines():
    if s.startswith('DISPLAY_LAYOUT '):
     r={k:int(v) for k,v in re.findall(r'(\w+)=(\d+)',s)};boxes[r['id']]=r
   assert len(boxes)==6,boxes
   for r in boxes.values():assert r['x']>=0 and r['y']>=84 and r['x']+r['w']<=w and r['y']+r['h']<=h-4,r
   for i in [5,3,4,1,2,0]:g.app(i)
   g.command('echo six_windows_live','\nsix_windows_live\n')
  g.command('audio info','Underruns: 0');g.wait('Device faults: 0');g.command('cat WELCOME.TXT','Welcome to Slopix persistent FAT32 storage!')
  g.command('audio stop');g.screenshot('integration09.ppm');(ROOT/'build/final09-integration.log').write_text(g.output())
 finally:g.close()
 check=subprocess.run(['fsck.fat','-vn',str(disk)],capture_output=True,text=True);assert check.returncode==0,check.stdout
print('PASS: supplied disk ELF normal/fault exit, all six apps, top-panel bounds and hitboxes across five modes, tone deadlines and original file preservation')
