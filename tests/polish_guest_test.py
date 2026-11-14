"""Design-guidance polish: v1 config migration, presets, dark theme and file actions."""
import tempfile,subprocess,struct,time
from pathlib import Path
from qemu_driver import Guest,ROOT
with tempfile.TemporaryDirectory(dir=ROOT/'build') as d:
 d=Path(d);disk=d/'polish.img';subprocess.run(['python3',str(ROOT/'tools/create_disk.py'),str(disk)],check=True)
 values=[0x32454453,1,92,9,0,0]+[26+i*80 for i in range(8)]+[74+i*40 for i in range(8)]
 raw=struct.pack('<22I',*values);checksum=2166136261
 for c in raw:checksum=((checksum^c)*16777619)&0xffffffff
 old=d/'old.cfg';old.write_bytes(raw+struct.pack('<I',checksum));subprocess.run(['mcopy','-i',str(disk),str(old),'::DESK1.CFG'],check=True)
 args=['-drive',f'file={disk},format=raw,if=ide,index=0,media=disk']
 g=Guest(args)
 try:
  g.wait('DESKTOP_CONFIG_LOADED');g.wait('PIN_LAYOUT id=0 x=26 y=74')
  g.app(4);g.click(640,145);start=len(g.output());g.click(425,340);g.wait('height=60 style=1',start=start)
  g.app(0);g.command('echo dock_preset_alive','\ndock_preset_alive\n')
  g.app(4);start=len(g.output());g.click(605,340);g.wait('height=36 style=2',start=start)
  g.click(230,145);g.click(506,449);g.click(210,523);g.wait('DESKTOP_CONFIG_SAVED')
  g.app(5);g.click(788,199);g.wait('FILES: Icon view');g.move(240,244)
  g.event([{'type':'btn','data':{'down':True,'button':'right'}}]);time.sleep(.08);g.event([{'type':'btn','data':{'down':False,'button':'right'}}]);g.wait('FILES: File actions')
  g.key('down');g.key('ret');g.wait('FILES: Filename copied');g.screenshot('final09-polish-files.ppm')
  g.app(0);start=len(g.output());g.type('echo ');g.key('v','ctrl');assert 'CMD: echo WELCOME.TXT' not in g.output()[start:];g.key('ret');g.wait('\nWELCOME.TXT\n',start=start)
  (ROOT/'build/final09-polish-first.log').write_text(g.output())
 finally:g.close()
 g=Guest(args)
 try:
  g.wait('PREFERENCES_LOADED');g.wait('DESKTOP_CONFIG_LOADED');g.wait('height=36 style=2');g.wait('PIN_LAYOUT id=0 x=26 y=74');g.app(0);g.command('cat WELCOME.TXT','Welcome to Slopix persistent FAT32 storage!');g.screenshot('final09-polish-cold.ppm');(ROOT/'build/final09-polish-cold.log').write_text(g.output())
 finally:g.close()
 cfg=d/'new.cfg';subprocess.run(['mcopy','-i',str(disk),'::DESK0.CFG',str(cfg)],check=True);assert len(cfg.read_bytes())==96 and struct.unpack_from('<I',cfg.read_bytes(),4)[0]==2
 prefs=d/'prefs.cfg';subprocess.run(['mcopy','-i',str(disk),'::SLOP1.CFG',str(prefs)],check=True);assert struct.unpack_from('<I',prefs.read_bytes(),28)[0]==0
 check=subprocess.run(['fsck.fat','-vn',str(disk)],capture_output=True,text=True);assert check.returncode==0,check.stdout
print('PASS: legacy desktop record migration, live Dock/Minimal presets and launch hitboxes, dark-theme persistence, FileSlop icon view/context copy, cold reboot and clean FAT')
