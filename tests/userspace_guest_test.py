"""Real disk ELF -> CPL3 -> syscalls -> isolated faults -> complete page cleanup."""
import subprocess,tempfile,re,time
from pathlib import Path
from qemu_driver import Guest,ROOT
with tempfile.TemporaryDirectory(dir=ROOT/'build') as d:
 disk=Path(d)/'user.img';subprocess.run(['python3',str(ROOT/'tools/create_disk.py'),str(disk)],check=True)
 subprocess.run(['make','-C',str(ROOT/'sdk')],check=True)
 subprocess.run(['mcopy','-i',str(disk),str(ROOT/'sdk/HELLO.ELF'),'::HELLO.ELF'],check=True)
 bad=Path(d)/'BAD.ELF';bad.write_bytes(bytes(64));subprocess.run(['mcopy','-i',str(disk),str(bad),'::BAD.ELF'],check=True)
 g=Guest(['-drive',f'file={disk},format=raw,if=ide,index=0,media=disk','-audiodev',f'wav,id=sound0,path={ROOT/"build/user-doom.wav"}','-device','sb16,audiodev=sound0'])
 try:
  g.wait('USERSPACE_READY')
  def free_pages():
   start=len(g.output());g.command('meminfo');g.wait('COMMAND_COMPLETE',start=start)
   return int(re.search(r'Free physical pages: (\d+)',g.output()[start:])[1])
  baseline=free_pages()
  g.command('run BAD.ELF','Executable load failed');assert free_pages()==baseline
  g.app(2);g.wait('DOOM_READY',30);g.key('esc');time.sleep(.2)
  for _ in range(3):g.key('ret');time.sleep(.3)
  g.wait('DOOM_STATS');g.app(0);g.command('audio tone 440 10000','AUDIO_TONE_STARTED')
  frame_start=int(re.findall(r'DOOM_STATS .*?frames=(\d+)',g.output())[-1])
  for pid,mode in enumerate([0,6,1,2,3,4,7,8,9,10,11,12,13,14,15],1):
   start=len(g.output());g.command(f'run HELLO.ELF {mode}')
   marker='PROCESS_EXIT' if mode in [0,6,9,13,14,15] else 'PROCESS_FAULT'
   g.wait(f'{marker} pid={pid} ',10,start=start)
   if mode in [0,6,9,13,14,15]:assert f'PROCESS_EXIT pid={pid} value=0' in g.output()[start:]
   g.command('echo kernel_survived','\nkernel_survived\n');assert free_pages()==baseline,'process leaked pages'
  start=len(g.output())
  for _ in range(3):g.command('run HELLO.ELF 9')
  for pid in [16,17,18]:g.wait(f'PROCESS_EXIT pid={pid} value=0',10,start=start)
  assert free_pages()==baseline,'concurrent SSE tasks leaked pages'
  g.command('audio tone 440 10000','AUDIO_TONE_STARTED')
  start=len(g.output());g.command('run HELLO.ELF 5');g.wait('PROCESS_CREATED pid=19',start=start)
  g.command('run HELLO.ELF 5');g.wait('PROCESS_CREATED pid=20',start=start)
  g.command('run HELLO.ELF 0');g.wait('PROCESS_EXIT pid=21 value=0',10,start=start)
  g.command('ps');g.wait('SCHED ');assert re.search(r'preemptions=[1-9]',g.output())
  g.command('kill 19','Process terminated');g.command('kill 20','Process terminated')
  # Fill all eight scheduler slots and prove rejection cannot steal/leak pages.
  g.command('audio tone 440 10000','AUDIO_TONE_STARTED')
  for pid in range(22,30):
   start=len(g.output());g.command('run HELLO.ELF 5');g.wait(f'PROCESS_CREATED pid={pid}',start=start)
  occupied=free_pages();g.command('run HELLO.ELF 5','Executable load failed');assert free_pages()==occupied
  for pid in range(22,30):g.command(f'kill {pid}','Process terminated')
  assert free_pages()==baseline,'slot exhaustion leaked pages'
  g.command('ps');g.wait('pages=0');g.command('memtest','MEMTEST PASS');g.command('cat WELCOME.TXT','Welcome to Slopix persistent FAT32 storage!')
  g.command('audio info','Underruns: 0');g.wait('Device faults: 0')
  assert free_pages()==baseline
  frame_end=int(re.findall(r'DOOM_STATS .*?frames=(\d+)',g.output())[-1]);assert frame_end>frame_start+50,'DOOM stopped during user faults'
  g.command('echo user_gate_alive','\nuser_gate_alive\n');(ROOT/'build/userspace-guest.log').write_text(g.output())
 finally:g.close()
print('PASS: disk ELF CPL3, syscalls, normal exit, pointer validation, UD/PF/GP/divide/NX/stack-guard isolation, SSE sleep state, timer preemption, kill, allocator checks')
