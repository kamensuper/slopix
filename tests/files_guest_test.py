"""FileSlop creation/view/delete/cancel, real shared clipboard and user ELF launch."""
import subprocess,tempfile,time
from pathlib import Path
from qemu_driver import Guest,ROOT
with tempfile.TemporaryDirectory(dir=ROOT/'build') as d:
 disk=Path(d)/'files.img';subprocess.run(['python3',str(ROOT/'tools/create_disk.py'),str(disk)],check=True)
 subprocess.run(['mcopy','-i',str(disk),str(ROOT/'sdk/HELLO.ELF'),'::HELLO.ELF'],check=True)
 args=['-drive',f'file={disk},format=raw,if=ide,index=0,media=disk']
 g=Guest(args)
 try:
  g.app(5);g.wait('FILES: opened-from-dock');g.click(345,199);g.type('NOTE.TXT');g.key('tab');g.type('hello from files');g.click(260,525);g.wait('FILES: File created and synced')
  g.app(0);g.command('cat NOTE.TXT','hello from files')
  g.app(5);g.key('end');g.key('ret');g.wait('FILES: Text view');g.key('c','ctrl');g.wait('FILES: Text copied')
  g.app(0);start=len(g.output());g.type('echo ');g.key('v','ctrl');g.wait('CLIPBOARD: pasted without execution',start=start)
  assert 'CMD: echo hello from files' not in g.output()[start:],'paste executed a command'
  g.key('ret');g.wait('\nhello from files\n',start=start)
  g.app(5);g.key('end');g.click(437,199);g.wait('FILES: Confirm deletion');g.key('esc')
  g.app(0);g.command('cat NOTE.TXT','hello from files')
  g.app(5);g.key('end');g.click(437,199);g.key('ret');g.wait('FILES: File deleted and synced')
  g.app(0);g.command('cat NOTE.TXT','File not found');g.command('cat WELCOME.TXT','Welcome to Slopix persistent FAT32 storage!')
  g.app(5);g.key('home')
  for _ in range(3):g.key('down')
  g.click(621,199);g.wait('PROCESS_CREATED pid=1');g.wait('Hello from a disk-loaded Ring-3 program!');g.wait('PROCESS_EXIT pid=1 value=0')
  g.app(0);g.type('terminal to files');g.key('c','ctrl');g.key('u','ctrl')
  g.app(5);g.click(345,199);g.type('PASTE.TXT');g.key('tab');g.key('v','ctrl');g.click(260,525);g.wait('FILES: File created and synced')
  g.app(0);g.command('cat PASTE.TXT','terminal to files')
  g.app(5);g.screenshot('fileslop.ppm');(ROOT/'build/files-first.log').write_text(g.output())
 finally:g.close()
 g=Guest(args)
 try:
  g.command('cat PASTE.TXT','terminal to files');g.command('cat NOTE.TXT','File not found');g.command('cat WELCOME.TXT','Welcome to Slopix persistent FAT32 storage!');(ROOT/'build/files-cold.log').write_text(g.output())
 finally:g.close()
 check=subprocess.run(['fsck.fat','-vn',str(disk)],capture_output=True,text=True);assert check.returncode==0,check.stdout;(ROOT/'build/files-fsck.log').write_text(check.stdout)
print('PASS: FileSlop real create/view/cancel/delete, cross-app clipboard without auto-execution, disk ELF launch, cold persistence and user-file preservation')
