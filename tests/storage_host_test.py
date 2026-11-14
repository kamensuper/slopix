"""Host sanitizer tests of exactly the FAT32 code linked into the kernel."""
import os,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as d:
    disk=Path(d)/'fat.img'
    subprocess.run(['python3',str(ROOT/'tools/create_disk.py'),str(disk)],check=True)
    binary=ROOT/'build/fat32-host-test'
    subprocess.run(['cc','-std=c11','-Wall','-Wextra','-Werror','-O1','-g','-fsanitize=address,undefined',str(ROOT/'tests/storage_host_test.c'),str(ROOT/'src/storage/fat32.c'),'-o',str(binary)],check=True)
    subprocess.run([str(binary),str(disk),str(ROOT/'build/host-fat32-tested.img')],env={**os.environ,'ASAN_OPTIONS':'detect_leaks=0'},timeout=60,check=True)
