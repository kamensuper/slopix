"""Optional independent dosfstools/mtools interoperability (not kernel tests)."""
import shutil,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
for tool in ('mkfs.fat','fsck.fat','mcopy','mtype'):
    if not shutil.which(tool):raise SystemExit('Not run: install dosfstools and mtools for '+tool)
with tempfile.TemporaryDirectory(dir=ROOT/'build') as temp:
    d=Path(temp);disk=d/'host-format.img'
    with disk.open('wb') as f:f.truncate(64*1024*1024)
    subprocess.run(['mkfs.fat','-F','32',str(disk)],check=True)
    data=d/'EXTERN.BIN';data.write_bytes(bytes((i*7)%256 for i in range(65536)))
    subprocess.run(['mcopy','-i',str(disk),str(data),'::EXTERN.BIN'],check=True)
    data.write_bytes(b'external\n')
    for i in range(24):subprocess.run(['mcopy','-i',str(disk),str(data),'::F'+str(i)+'.TXT'],check=True)
    binary=ROOT/'build/fat32-interop-test'
    subprocess.run(['cc','-O1','-g','-Wall','-Wextra','-Werror','-fsanitize=address,undefined',str(ROOT/'tests/storage_interop_test.c'),str(ROOT/'src/storage/fat32.c'),'-o',str(binary)],check=True)
    import os
    subprocess.run([str(binary),str(disk)],env={**os.environ,'ASAN_OPTIONS':'detect_leaks=0'},check=True,timeout=30)
    check=subprocess.run(['fsck.fat','-vn',str(disk)],capture_output=True,text=True)
    (ROOT/'build/storage-host-interop-fsck.log').write_text(check.stdout+check.stderr);assert check.returncode==0,check.stdout
    data=subprocess.run(['mtype','-i',str(disk),'::SLOPIX.TXT'],capture_output=True,check=True).stdout
    assert data==b'host-formatted FAT32\n',data
    print('PASS: independent fsck accepts mutations and mtools reads exact written bytes')
