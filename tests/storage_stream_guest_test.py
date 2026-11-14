"""Real ATA: nested multi-MiB streaming, range append, copy/rename, cold boot.
Host mtools seeds fragmented extents; guest mutations are independently checked.
"""
import subprocess,tempfile,struct,time,json
from pathlib import Path
from qemu_driver import Guest,ROOT

def run(argv):return subprocess.run(argv,check=True,capture_output=True)
timings=[]
def command(g,text,expect):
    start=len(g.output());g.type(text);begin=time.monotonic();g.key('ret')
    g.wait('CMD: '+text+'\n',30,start=start);g.wait(expect,30,start=start);g.wait('COMMAND_COMPLETE',30,start=start)
    timings.append({'command':text,'enter_to_complete_seconds_including_driver_poll':time.monotonic()-begin})
    (ROOT/'build/storage-stream-command-times.json').write_text(json.dumps(timings,indent=2))
def fnv(data):
    h=2166136261
    for b in data:h=((h^b)*16777619)&0xffffffff
    return h
with tempfile.TemporaryDirectory(dir=ROOT/'build') as temp:
    d=Path(temp);disk=d/'stream.img'
    run(['python3',str(ROOT/'tools/create_disk.py'),str(disk)])
    data=bytes((i*37+(i>>11))&255 for i in range(3*1024*1024+137))
    payload=d/'LARGE.BIN';payload.write_bytes(data)
    filler=d/'FILL.BIN';filler.write_bytes(bytes(512*1024))
    for n in range(8):run(['mcopy','-i',str(disk),str(filler),f'::F{n}.BIN'])
    for n in range(0,8,2):run(['mdel','-i',str(disk),f'::F{n}.BIN'])
    run(['mmd','-i',str(disk),'::STREAM']);run(['mmd','-i',str(disk),'::STREAM/NEST'])
    # Reset the allocator hint into the freed holes to force disjoint extents.
    raw=bytearray(disk.read_bytes());info=struct.unpack_from('<H',raw,48)[0];backup=struct.unpack_from('<H',raw,50)[0]
    for sector in [info,backup+info]:struct.pack_into('<I',raw,sector*512+492,12)
    disk.write_bytes(raw)
    run(['mcopy','-i',str(disk),str(payload),'::STREAM/NEST/LARGE.BIN'])
    extents=run(['mshowfat','-i',str(disk),'::STREAM/NEST/LARGE.BIN']).stdout.decode()
    assert extents.count('<')>1,extents
    (ROOT/'build/storage-stream-extents.log').write_text(extents)
    run(['mcopy','-i',str(disk),str(ROOT/'sdk/READ.ELF'),'::READ.ELF'])
    args=['-drive',f'file={disk},format=raw,if=ide,index=0,media=disk','-audiodev','none,id=sound0','-device','sb16,audiodev=sound0']
    expected=data+b'guest_tail\n';hashline=f'READ bytes={len(expected)} fnv32={fnv(expected)}'
    g=Guest(args)
    try:
        command(g,'diskinfo','FAT32 mounted read-write')
        command(g,'cd STREAM/NEST','/STREAM/NEST')
        command(g,'stat LARGE.BIN',f'File bytes: {len(data)}')
        command(g,'append LARGE.BIN guest_tail','Saved and synced:')
        command(g,'audio tone 440 10000','AUDIO_TONE_STARTED')
        command(g,'cp LARGE.BIN COPY.BIN','Completed and synced')
        command(g,'audio info','Underruns: 0')
        command(g,'mv COPY.BIN MOVED.BIN','Completed and synced')
        command(g,'mkdir CHILD','Directory created and synced')
        command(g,'write CHILD/NOTE.TXT nested_guest','Saved and synced:')
        command(g,'cat CHILD/NOTE.TXT','nested_guest')
        command(g,'cd /','\n/\n')
        command(g,'exec READ.ELF /STREAM/NEST/MOVED.BIN','PROCESS_CREATED')
        g.wait(hashline,30);g.wait('value=0',30)
        (ROOT/'build/storage-stream-first.log').write_text(g.output())
        g.screenshot('storage-stream.ppm')
    finally:g.close()
    g=Guest(args)
    try:
        command(g,'diskinfo','FAT32 mounted read-write')
        command(g,'cat /STREAM/NEST/CHILD/NOTE.TXT','nested_guest')
        command(g,'exec READ.ELF /STREAM/NEST/MOVED.BIN','PROCESS_CREATED');g.wait(hashline,30);g.wait('value=0',30)
        command(g,'rm /STREAM/NEST/CHILD/NOTE.TXT','File removed and synced')
        command(g,'rmdir /STREAM/NEST/CHILD','Directory removed and synced')
        (ROOT/'build/storage-stream-cold.log').write_text(g.output())
    finally:g.close()
    for name in ['LARGE.BIN','MOVED.BIN']:
        out=d/('verified-'+name);run(['mcopy','-i',str(disk),f'::STREAM/NEST/{name}',str(out)])
        assert out.read_bytes()==expected
    check=run(['fsck.fat','-vn',str(disk)])
    (ROOT/'build/storage-stream-fsck.log').write_bytes(check.stdout+check.stderr)
print('PASS: real ATA fragmented 3 MiB append/copy/rename, nested create/delete, Ring-3 full-file FNV hash and SEEK, cold process, independent exact bytes + fsck')
