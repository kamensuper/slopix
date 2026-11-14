"""Cold QEMU boots, real PS/2 controls, FAT settings and graphical utilities."""
import json,subprocess,tempfile,time
from pathlib import Path
from PIL import Image
from qemu_driver import Guest,ROOT
logs=[]
with tempfile.TemporaryDirectory(dir=ROOT/'build') as d:
 disk=Path(d)/'prefs.img';subprocess.run(['python3',str(ROOT/'tools/create_disk.py'),str(disk)],check=True)
 wall=Path(d)/'WALL.PPM';Image.new('RGB',(160,120),(30,90,150)).save(wall)
 subprocess.run(['mcopy','-i',str(disk),str(wall),'::WALL.PPM'],check=True)
 args=['-drive',f'file={disk},format=raw,if=ide,index=0,media=disk','-audiodev',f'wav,id=sound0,path={ROOT/"build/utilities.wav"}','-device','sb16,audiodev=sound0']
 g=Guest(args)
 try:
  g.command('slopfetch','Open desktop applications: 1');g.command('slopmon','PERF compose');g.command('date','RTC 20');g.command('history','slopfetch');g.command('audioinfo','SlopAudio: SB16')
  g.app(3);g.wait('FIND: opened-from-dock');g.screenshot('slopfind.ppm');g.type('dOoM');g.key('ret');g.wait('DOOM_READY',30);g.wait('FIND_SELECTED: DOOM')
  g.key('f4','alt');g.wait('DOOM: closed');g.key('esc');g.wait('FIND: closed')
  g.app(4);g.wait('SETTINGS: opened-from-dock');g.screenshot('slopettings.ppm');g.click(490,150);g.click(200,275)
  g.key('f4','alt');g.wait('SETTINGS: closed');g.app(0);g.command('settings show','Volume: 55');g.key('meta_l');g.wait('FIND: opened-from-launcher');g.key('esc');g.wait('FIND: closed');g.app(4);g.key('tab','alt');g.command('echo alt_tab_ok','\nalt_tab_ok\n');g.app(4);g.key('f4','alt');g.app(0)
  g.command('settings wallpaper WALL.PPM','Applied; save pending');g.command('settings fit 1','Setting applied');g.command('settings volume 37','Setting applied');g.command('settings save','Saved and synced to FAT32')
  g.command('write USER.TXT preserved_085','Saved and synced:');g.command('memtest','MEMTEST PASS')
  # Window resizing must preserve Terminal state and input after the drag.
  g.move(775,610);g.button(True);g.move(850,640);g.button(False);g.wait('WINDOW: resized')
  g.command('echo resized_input_ok','\nresized_input_ok\n')
  for app in [1,3,4]:g.app(app)
  for w,h in [(800,600),(1920,1080),(1024,600),(1600,900),(1280,800)]:
   g.app(0);g.command(f'display {w} {h}','Display mode applied');raw=g.screenshot('utility-mode.ppm');assert raw.split(b'\n',3)[1]==f'{w} {h}'.encode()
  g.command('settings save','Saved and synced to FAT32');g.command('audioinfo','Underruns: 0');g.wait('Device faults: 0')
  g.screenshot('utilities-desktop.ppm');logs.append(g.output());(ROOT/'build/utilities-first.log').write_text(g.output())
 finally:g.close()
 # New emulator process: no RAM or snapshot reuse.
 g=Guest(args)
 try:
  g.wait('PREFERENCES_LOADED');g.command('settings show','Wallpaper: 3');g.wait('Volume: 37');g.wait('WALL.PPM');g.command('cat USER.TXT','preserved_085')
  g.command('audioinfo','Volume: 37 percent');g.screenshot('utilities-restored.ppm');logs.append(g.output());(ROOT/'build/utilities-cold.log').write_text(g.output())
 finally:g.close()
 check=subprocess.run(['fsck.fat','-vn',str(disk)],capture_output=True,text=True);assert check.returncode==0,check.stdout; (ROOT/'build/preferences-fsck.log').write_text(check.stdout)
 # Both invalid files: safe default config without deleting other files.
 bad=Path(d)/'bad.cfg';bad.write_bytes(b'not a supported configuration')
 for name in ['SLOP0.CFG','SLOP1.CFG']:subprocess.run(['mcopy','-o','-i',str(disk),str(bad),'::'+name],check=True)
 g=Guest(args)
 try:
  g.command('settings show','Volume: 65');g.command('cat USER.TXT','preserved_085');assert 'PREFERENCES_LOADED' not in g.output();(ROOT/'build/utilities-corrupt.log').write_text(g.output())
 finally:g.close()
print('PASS: SlopFind launch/search, GUI settings, measured tools/RTC/history, corner resize, 800..1920 modes, cold persistence/custom wallpaper, corrupted configuration defaults, independent FAT check, user files retained')
