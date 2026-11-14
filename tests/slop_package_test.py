"""Host package tool: valid ELF, crc failures, overflow, traversal and header spoofing."""
import os
import subprocess
import struct
import tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
TOOL=ROOT/'tools/slop_package.py'
def run(*args,expected=0):
    p=subprocess.run(['python3',str(TOOL),*map(str,args)],capture_output=True,text=True)
    assert (p.returncode==0)==(expected==0),(p.stdout,p.stderr)
    return p
with tempfile.TemporaryDirectory() as d:
    d=Path(d);exe=ROOT/'sdk/HELLO.ELF';pkg=d/'HELLO.SLOP'
    run('pack','HELLO',exe,pkg)
    run('verify',pkg)
    raw=bytearray(pkg.read_bytes());raw[-1]^=1;bad=d/'bad.slop';bad.write_bytes(raw);run('verify',bad,expected=1)
    raw=bytearray(pkg.read_bytes());struct.pack_into('<I',raw,16,0xffffffff);bad.write_bytes(raw);run('verify',bad,expected=1)
    raw=bytearray(pkg.read_bytes());raw[8:16]=b'../HELLO!';bad.write_bytes(raw);run('verify',bad,expected=1)
    run('pack','../EXPLOIT',exe,pkg,expected=1)
    run('pack','NINECHARS',exe,pkg,expected=1)
    browser=ROOT/'sdk/BROWSE.ELF'
    bundle=d/'BROWSE.SLP'
    start=ROOT/'sdk/pages/START.HTM'
    about=ROOT/'sdk/pages/ABOUT.HTM'
    run('bundle','BROWSE',browser,bundle,start,about)
    run('verify',bundle)
    raw=bytearray(bundle.read_bytes())
    assert raw[:8]==b'SLOPPKG2' and struct.unpack_from('<I',raw,16)[0]==3
    raw[-1]^=0x40;bad.write_bytes(raw);run('verify',bad,expected=1)
    raw=bytearray(bundle.read_bytes());raw[32:44]=b'../EVIL.HTM\0';bad.write_bytes(raw);run('verify',bad,expected=1)
    raw=bytearray(bundle.read_bytes());raw[32+24:32+36]=raw[32:44];bad.write_bytes(raw);run('verify',bad,expected=1)
    run('bundle','../BAD',browser,bundle,start,expected=1)
    run('bundle','BROWSE',browser,bundle,start,start,expected=1)
    print('PASS: legacy and bundled .slop formats, CRCs, duplicate/traversal checks, ABI, sizes')
