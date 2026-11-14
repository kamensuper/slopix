"""Independent FAT32 sector/chain read-back of the new Genesis test image."""
import hashlib
import struct
import subprocess
import tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def get_file(image,name):
    with image.open('rb') as f:
        boot=f.read(512)
        sectors=struct.unpack_from('<H',boot,11)[0]
        assert sectors==512
        spc=boot[13];reserved=struct.unpack_from('<H',boot,14)[0]
        fats=boot[16];fatsectors=struct.unpack_from('<I',boot,36)[0]
        start=(reserved+fats*fatsectors)*512
        f.seek(start);root=f.read(512)
        key=(name.split('.')[0].ljust(8)+name.split('.')[1].ljust(3)).encode()
        for i in range(0,512,32):
            if root[i:i+11]==key:
                c=struct.unpack_from('<H',root,i+26)[0]|struct.unpack_from('<H',root,i+20)[0]<<16
                n=struct.unpack_from('<I',root,i+28)[0]
                out=bytearray();seen=set()
                while len(out)<n:
                    assert c>=2 and c not in seen;seen.add(c)
                    f.seek(start+(c-2)*spc*512);out.extend(f.read(spc*512))
                    f.seek(reserved*512+c*4);c=struct.unpack('<I',f.read(4))[0]&0x0fffffff
                assert c>=0x0ffffff8
                return bytes(out[:n])
        raise AssertionError(f'{name} missing')
with tempfile.TemporaryDirectory() as d:
    path=Path(d)/'test.img'
    subprocess.run(['python3',str(ROOT/'tools/build_genesis_disk.py'),str(path)],check=True)
    demo=get_file(path,'DEMO.ELF')
    assert demo==(ROOT/'sdk/DEMO.ELF').read_bytes()
    pack=get_file(path,'HELLO.SLP')
    assert pack==(ROOT/'build/HELLO.SLOP').read_bytes()
    assert get_file(path,'STORE.SLP')==(ROOT/'build/STORE.SLOP').read_bytes()
    before=hashlib.sha256(path.read_bytes()).hexdigest()
    p=subprocess.run(['python3',str(ROOT/'tools/build_genesis_disk.py'),str(path)],capture_output=True)
    assert p.returncode!=0
    assert hashlib.sha256(path.read_bytes()).hexdigest()==before
    package_disk=Path(d)/'packages.img'
    subprocess.run(['python3',str(ROOT/'tools/build_genesis_disk.py'),'--packages-only',str(package_disk)],check=True)
    assert get_file(package_disk,'DEMO.SLP')==(ROOT/'build/DEMO.SLOP').read_bytes()
    assert get_file(package_disk,'HELLO.SLP')==(ROOT/'build/HELLO.SLOP').read_bytes()
    assert get_file(package_disk,'STORE.SLP')==(ROOT/'build/STORE.SLOP').read_bytes()
    try:get_file(package_disk,'DEMO.ELF')
    except AssertionError:pass
    else:raise AssertionError('Packages-only image must not preinstall DEMO.ELF')
    browser_disk=Path(d)/'browser.img'
    subprocess.run(['python3',str(ROOT/'tools/build_genesis_disk.py'),'--browser-ready',str(browser_disk)],check=True)
    assert get_file(browser_disk,'BROWSE.ELF')==(ROOT/'sdk/BROWSE.ELF').read_bytes()
    assert get_file(browser_disk,'START.HTM')==(ROOT/'sdk/pages/START.HTM').read_bytes()
    assert get_file(browser_disk,'ABOUT.HTM')==(ROOT/'sdk/pages/ABOUT.HTM').read_bytes()
    bundle_disk=Path(d)/'bundles.img'
    subprocess.run(['python3',str(ROOT/'tools/build_genesis_disk.py'),'--bundles',str(bundle_disk)],check=True)
    assert get_file(bundle_disk,'BROWSE.SLP')==(ROOT/'build/BROWSE.SLP').read_bytes()
    assert get_file(bundle_disk,'HELLOGUI.SLP')==(ROOT/'build/HELLOGUI.SLP').read_bytes()
    try:get_file(bundle_disk,'BROWSE.ELF')
    except AssertionError:pass
    else:raise AssertionError('Bundle disk should not preinstall browser')
    print('PASS: four distinct FAT32 disk profiles; exact ELFs, .slop bundles, browser HTML, no overwrites')
