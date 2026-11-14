"""FileSlop nested folders, same-folder rename/copy and unsaved close guard."""
import subprocess,tempfile
from pathlib import Path
from qemu_driver import Guest,ROOT
with tempfile.TemporaryDirectory(dir=ROOT/'build') as temp:
 disk=Path(temp)/'paths.img';subprocess.run(['python3',str(ROOT/'tools/create_disk.py'),str(disk)],check=True)
 args=['-drive',f'file={disk},format=raw,if=ide,index=0,media=disk']
 g=Guest(args)
 try:
  g.app(5);g.key('m');g.type('FOLDER');g.key('ret');g.wait('FILES: Saved and synced')
  g.key('end');g.key('ret');g.key('n');g.type('NOTE.TXT');g.key('tab');g.type('nested files content')
  start=len(g.output());g.key('f4','alt');g.wait('FILES: Unsaved text or name',start=start)
  assert 'FILES: closed' not in g.output()[start:]
  g.click(260,525);g.wait('FILES: File created and synced')
  g.key('home');g.key('r');g.type('RENAMED.TXT');g.key('ret');g.wait('FILES: Saved and synced',start=start)
  start=len(g.output());g.key('c');g.type('COPY.TXT');g.key('ret');g.wait('FILES: Saved and synced',start=start)
  g.key('m');g.type('CHILD');g.key('ret');g.key('end');g.key('ret');g.key('backspace')
  # Backspace returned from CHILD to FOLDER; Enter can now open a copied file.
  g.key('home');g.key('ret');g.wait('FILES: Text view');g.key('esc');g.key('backspace')
  g.screenshot('files-paths.ppm');(ROOT/'build/files-paths.log').write_text(g.output())
  g.app(0);g.command('cat /FOLDER/RENAMED.TXT','nested files content');g.command('cat /FOLDER/COPY.TXT','nested files content');g.command('ls /FOLDER','CHILD <DIR>')
 finally:g.close()
 g=Guest(args)
 try:
  g.command('cat /FOLDER/RENAMED.TXT','nested files content');g.command('cat /FOLDER/COPY.TXT','nested files content')
  (ROOT/'build/files-paths-cold.log').write_text(g.output())
 finally:g.close()
 checked=subprocess.run(['fsck.fat','-vn',str(disk)],capture_output=True,text=True);assert checked.returncode==0,checked.stdout
 (ROOT/'build/files-paths-fsck.log').write_text(checked.stdout)
print('PASS: FileSlop folder creation/navigation, rename/copy, save after blocked unsaved close, cold persistence and clean FAT')
