"""Actual ATA/FAT32 guest persistence across independent QEMU processes.
Uses disposable image copies, never the user's normal persistent disk.
"""
import hashlib,json,re,subprocess,tempfile,time
from pathlib import Path
from qemu_driver import Guest,ROOT

def args(path):return ['-drive',f'file={path},format=raw,if=ide,index=0,media=disk']
def command(g,text,expected):
    start=len(g.output());g.command(text,expected);g.wait('COMMAND_COMPLETE',start=start)
def log(g,name): (ROOT/'build'/name).write_text(g.output())
result={}
with tempfile.TemporaryDirectory(dir=ROOT/'build') as d:
    disk=Path(d)/'persistent.img'
    subprocess.run(['python3',str(ROOT/'tools/create_disk.py'),str(disk)],check=True)
    initial=hashlib.sha256(disk.read_bytes()).hexdigest()
    assert subprocess.run(['python3',str(ROOT/'tools/create_disk.py'),str(disk)],capture_output=True).returncode!=0
    assert hashlib.sha256(disk.read_bytes()).hexdigest()==initial
    g=Guest(args(disk))
    try:
        assert 'FAT32_MOUNTED_RW' in g.output()
        command(g,'diskinfo','FAT32 mounted read-write')
        command(g,'ls','WELCOME.TXT')
        command(g,'cat welcome.txt','Welcome to Slopix persistent FAT32 storage!')
        command(g,'cat empty.txt','COMMAND_COMPLETE')
        command(g,'cat missing.txt','File not found')
        command(g,'write ../bad invalid','Path escapes root')
        command(g,'write toolonggg.txt invalid','8.3 limit')
        command(g,'write NOTE.TXT persisted_first_boot','Saved and synced:')
        command(g,'append note.txt second_line','Saved and synced:')
        command(g,'cat NOTE.TXT','second_line')
        command(g,'write DELETE.TXT remove_across_boot','Saved and synced:')
        command(g,'rm delete.txt','File removed and synced')
        # More than a sector of content using real keyboard input, max input size.
        for _ in range(4):command(g,'append NOTE.TXT '+('a'*200),'Saved and synced:')
        command(g,'sync','Storage flushed')
        g.screenshot('storage-first-boot.ppm');log(g,'storage-first-boot.log')
    finally:
        # Abrupt emulator termination after acknowledged sync, not a snapshot or
        # normal guest shutdown; successful data must already be durable.
        g.p.kill();g.p.wait(timeout=5)
    result['cold_boot_process_1']='PASS'
    # This is a new QEMU process; no old guest RAM or snapshot survives.
    g=Guest(args(disk))
    try:
        assert 'FAT32_MOUNTED_RW' in g.output()
        command(g,'cat note.txt','persisted_first_boot');command(g,'cat note.txt','second_line')
        command(g,'cat delete.txt','File not found')
        command(g,'write NOTE.TXT overwritten_after_restart','Saved and synced:')
        command(g,'cat note.txt','overwritten_after_restart')
        # Three simultaneous applications + disk writes and keyboard input.
        g.app(2);g.wait('DOOM_READY',30)
        g.key('esc');time.sleep(.2)
        for _ in range(3):g.key('ret');time.sleep(.25)
        g.app(1);g.key('4');g.wait('MODEL: Torus');g.wait('CUBE_STATS',10)
        g.click(200,300)
        times=[]
        for i in range(5):
            g.type('write LIVE.TXT live_'+str(i));offset=len(g.output());start=time.monotonic();g.key('ret');g.wait('Saved and synced:',start=offset);
            # Use a fresh output boundary for every measured operation.
            g.wait('COMMAND_COMPLETE',start=offset);times.append((time.monotonic()-start)*1000)
            command(g,'cat live.txt','live_'+str(i))
        result['write_command_ms_including_driver_delay']=times
        command(g,'echo Terminal_alive','\nTerminal_alive\n')
        command(g,'memtest','MEMTEST PASS')
        g.key('f11');g.wait('WINDOW: maximized');g.key('f11');g.wait('WINDOW: restored')
        # Terminal retains content across close/reopen.
        g.click(83,177);g.wait('WINDOW: closed');g.app(0);g.wait('WINDOW: opened-from-dock')
        command(g,'cat note.txt','overwritten_after_restart')
        g.screenshot('storage-three-apps.ppm');log(g,'storage-three-apps.log')
        out=g.output();assert 'DOOM_STATS' in out and 'CUBE_STATS' in out
        assert 'PS2_RING_OVERFLOW' not in out and 'DOOM_ERROR:' not in out
    finally:g.close()
    result['cold_boot_process_2_and_three_apps']='PASS'
    g=Guest(args(disk))
    try:
        command(g,'cat note.txt','overwritten_after_restart')
        command(g,'cat LIVE.TXT','live_4')
        command(g,'rm NOTE.TXT','File removed and synced');log(g,'storage-third-boot.log')
    finally:g.close()
    g=Guest(args(disk))
    try:
        command(g,'cat NOTE.TXT','File not found');command(g,'cat live.txt','live_4');log(g,'storage-fourth-boot.log')
    finally:g.close()
    result['cold_boot_process_3_and_4_delete_persistence']='PASS'
    # Independently inspect the same image while no emulator has it open.
    if subprocess.run(['sh','-c','command -v fsck.fat'],capture_output=True).returncode==0:
        checked=subprocess.run(['fsck.fat','-vn',str(disk)],capture_output=True,text=True)
        (ROOT/'build/storage-fsck.log').write_text(checked.stdout+checked.stderr);assert checked.returncode==0,checked.stdout
        result['independent_fsck']='PASS'
    if subprocess.run(['sh','-c','command -v mtype'],capture_output=True).returncode==0:
        checked=subprocess.run(['mtype','-i',str(disk),'::LIVE.TXT'],capture_output=True,text=True,check=True)
        assert checked.stdout=='live_4\n';result['host_reads_guest_file']='PASS'
        host=Path(d)/'HOST.TXT';host.write_text('host_to_guest_interoperability\n')
        subprocess.run(['mcopy','-i',str(disk),str(host),'::HOST.TXT'],check=True)
        g=Guest(args(disk))
        try:command(g,'cat host.txt','host_to_guest_interoperability');log(g,'storage-host-interop.log')
        finally:g.close()
        result['guest_reads_host_file']='PASS'
    # A broken disk must never stop the Terminal or autoformat anything.
    raw=bytearray(disk.read_bytes());raw[12]=0;disk.write_bytes(raw)
    before=hashlib.sha256(raw).hexdigest();g=Guest(args(disk))
    try:
        command(g,'diskinfo','No FAT32 disk mounted');command(g,'write X.TXT nope','No FAT32 disk mounted')
        command(g,'echo corrupt_disk_safe','\ncorrupt_disk_safe\n');log(g,'storage-corrupt-disk.log')
    finally:g.close()
    assert hashlib.sha256(disk.read_bytes()).hexdigest()==before
    result['corrupt_volume_unchanged']='PASS'
# No attached disk must remain a valid boot configuration.
g=Guest()
try:
    command(g,'diskinfo','No FAT32 disk mounted');command(g,'write X.TXT nope','No FAT32 disk mounted');command(g,'echo no_disk_safe','\nno_disk_safe\n');log(g,'storage-no-disk.log')
finally:g.close()
result['no_disk']='PASS'
(ROOT/'build/storage-results.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2),flush=True)
print('PASS: real ATA writes, four cold QEMU processes, append/overwrite/delete persistence, simultaneous apps, malformed/no disk safety',flush=True)
