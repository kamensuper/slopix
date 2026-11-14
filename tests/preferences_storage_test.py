"""Configuration behavior on missing, degraded, full and injected device-write failures."""
import struct,subprocess,tempfile,hashlib
from pathlib import Path
from qemu_driver import Guest,ROOT
with tempfile.TemporaryDirectory(dir=ROOT/'build') as d:
 d=Path(d);disk=d/'policy.img';subprocess.run(['python3',str(ROOT/'tools/create_disk.py'),str(disk)],check=True);original=disk.read_bytes()
 cases=['missing','dirty','full','writefault']
 for mode in cases:
  disk.write_bytes(original)
  if mode=='dirty':
   raw=bytearray(original)
   for sector in [32,1056]:struct.pack_into('<I',raw,sector*512+4,0x07ffffff)
   disk.write_bytes(raw)
  if mode=='full':
   filler=d/'FILL.BIN'
   with filler.open('wb') as f:f.truncate((128992-8-2)*512)
   subprocess.run(['mcopy','-i',str(disk),str(filler),'::FILL.BIN'],check=True)
  before=hashlib.sha256(disk.read_bytes()).hexdigest()
  config=d/'write-error.conf';config.write_text('[inject-error]\nevent = \"write_aio\"\nerrno = \"5\"\nimmediately = \"on\"\nonce = \"off\"\n')
  backend=f'blkdebug:{config}:{disk}' if mode=='writefault' else str(disk)
  extra=[] if mode=='missing' else ['-drive',f'file={backend},format=raw,if=ide,index=0,media=disk']
  g=Guest(extra)
  try:
   g.command('settings volume 28','Setting applied');g.command('settings save')
   out=g.output()
   expected='Session only: storage unavailable or read-only' if mode in ['missing','dirty'] else 'Disk full; original file preserved' if mode=='full' else 'Disk I/O failed; writes disabled until reboot'
   assert expected in out,out[-2000:]
   if mode in ['dirty','full']:g.command('cat WELCOME.TXT','Welcome to Slopix persistent FAT32 storage!')
   g.command('echo settings_failure_survived','\nsettings_failure_survived\n');(ROOT/'build'/('settings-policy-'+mode+'.log')).write_text(g.output())
  finally:g.close()
  if mode!='missing':assert hashlib.sha256(disk.read_bytes()).hexdigest()==before,mode+' changed disk on rejected save'
print('PASS: missing/read-only/degraded/full and device write failures handled; rejected saves preserve disk bytes')
