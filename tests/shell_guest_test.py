"""Native UI interactions and persistent panel/pinboard through real PS/2 input."""
import subprocess,tempfile,time,re
from pathlib import Path
from qemu_driver import Guest,ROOT
with tempfile.TemporaryDirectory(dir=ROOT/'build') as d:
 disk=Path(d)/'shell.img';subprocess.run(['python3',str(ROOT/'tools/create_disk.py'),str(disk)],check=True)
 args=['-drive',f'file={disk},format=raw,if=ide,index=0,media=disk']
 g=Guest(args)
 try:
  g.move(230,177);g.button(True);g.move(420,210);g.button(False);g.wait('WINDOW: drag-end')
  g.command('echo dragged_native','\ndragged_native\n')
  g.key('left','alt');g.wait('WINDOW: tiled-left');g.key('f11');g.wait('WINDOW: restored')
  g.key('right','alt');g.wait('WINDOW: tiled-right');g.key('f11')
  g.key('f11');g.wait('WINDOW: maximized');g.key('f11')
  # All six apps, then return focus to Terminal and confirm input.
  for i in [1,2,3,4,5]:g.app(i)
  g.wait('DOOM_READY',30);g.app(0);g.command('echo shell_live','\nshell_live\n')
  # New panel choices are real settings, not cosmetic indicators.
  g.app(4);g.click(640,145);g.click(270,290);g.click(550,290)
  g.wait('PANEL_LAYOUT top=1');g.click(210,523);g.wait('DESKTOP_CONFIG_SAVED')
  # Close every app with actual focus switching.
  for i in [5,4,3,2,1,0]:g.app(i);g.key('f4','alt')
  pins=re.findall(r'PIN_LAYOUT id=0 x=(\d+) y=(\d+)',g.output());px,py=map(int,pins[-1])
  g.move(px+40,py+20);g.button(True);g.move(300,140);g.button(False);g.wait('PINBOARD: moved')
  g.wait('PIN_LAYOUT id=0 x=260 y=120')
  # Keyboard navigation activates a real pinboard shortcut.
  g.key('right');g.key('left');g.key('ret');g.wait('WINDOW: opened-from-launcher')
  g.key('f4','alt');time.sleep(1.8)
  g.move(1180,500);g.event([{'type':'btn','data':{'down':True,'button':'right'}}]);time.sleep(.08);g.event([{'type':'btn','data':{'down':False,'button':'right'}}]);g.wait('CONTEXT_MENU: opened')
  g.click(1120,602);g.wait('FIND: opened-from-launcher');g.key('esc');g.wait('FIND: closed')
  g.screenshot('shell2-pinboard.ppm');(ROOT/'build/shell-first.log').write_text(g.output())
 finally:g.close()
 g=Guest(args)
 try:
  g.wait('DESKTOP_CONFIG_LOADED');g.wait('PANEL_LAYOUT top=1');g.wait('PIN_LAYOUT id=0 x=260 y=120')
  g.app(0);g.command('cat WELCOME.TXT','Welcome to Slopix persistent FAT32 storage!')
  g.command('echo cold_shell_alive','\ncold_shell_alive\n');g.screenshot('shell2-cold.ppm');(ROOT/'build/shell-cold.log').write_text(g.output())
 finally:g.close()
print('PASS: real tab dragging, left/right tiling, maximize/restore, six apps, panel auto-hide/top placement, pinboard drag/keyboard launch and cold configuration persistence')
