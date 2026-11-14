"""Read-only corruption policy and storage with PIT timing in actual QEMU."""
import hashlib,struct,subprocess,tempfile
from pathlib import Path
from qemu_driver import Guest,ROOT
with tempfile.TemporaryDirectory(dir=ROOT/'build') as d:
    disk=Path(d)/'safe.img'
    subprocess.run(['python3',str(ROOT/'tools/create_disk.py'),str(disk)],check=True)
    original=disk.read_bytes()
    for mode in ('dirty','mismatched','pit'):
        raw=bytearray(original)
        if mode=='dirty':
            for sector in (32,1056):struct.pack_into('<I',raw,sector*512+4,0x07ffffff)
        if mode=='mismatched':raw[1056*512+40]^=1
        disk.write_bytes(raw);before=hashlib.sha256(raw).hexdigest()
        extra=['-drive',f'file={disk},format=raw,if=ide,index=0,media=disk']
        if mode=='pit':extra+=['-machine','pc,hpet=off']
        g=Guest(extra)
        try:
            if mode=='dirty':
                g.command('diskinfo','FAT32 mounted read-only');g.command('cat welcome.txt','Welcome to Slopix');g.command('write X.TXT blocked','read-only')
            elif mode=='mismatched':g.command('diskinfo','No FAT32 disk mounted');g.command('write X.TXT blocked','No FAT32 disk mounted')
            else:
                assert 'PIT IRQ-count fallback' in g.output()
                g.command('write PIT.TXT fallback_clock','Saved and synced:');g.command('cat pit.txt','fallback_clock')
            start=len(g.output());g.command('echo safe_after_'+mode,'\nsafe_after_'+mode+'\n');g.wait('COMMAND_COMPLETE',start=start)
            (ROOT/'build'/('storage-safety-'+mode+'.log')).write_text(g.output())
        finally:g.close()
        if mode!='pit':assert hashlib.sha256(disk.read_bytes()).hexdigest()==before
        print('PASS: QEMU '+mode+' storage case; Terminal usable'+('; disk unchanged' if mode!='pit' else ''),flush=True)
