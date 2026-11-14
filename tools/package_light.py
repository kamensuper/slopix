"""Package only a tested 0.9 ISO, complete sources and selected evidence."""
from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parents[1]
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
iso=root/'build/slopix.iso';gate=json.loads((root/'build/release09-results.json').read_text())
assert gate['iso_sha256']==digest(iso)
assert len(gate['results'])==33 and all(x['exit_code']==0 for x in gate['results']), 'Full gate incomplete'
performance=json.loads((root/'build/performance09.json').read_text());assert len(performance)==25 and all(x['audio_underruns']==0 and x['iso_sha256']==gate['iso_sha256'] for x in performance)
probe=json.loads((root/'build/final09-pa-10000.json').read_text())
assert [r['label'] for r in probe]==['tone','doom','all_apps','mode_changes']
assert all(r['iso_sha256']==gate['iso_sha256'] and 'Underruns: 0' in r['report'] and 'Device faults: 0' in r['report'] for r in probe)
assert 'PulseAudio monitor samples:' in (root/'build/graphical09.log').read_text()
assert 'pixels changed without forced refresh: True' in (root/'build/final09-refresh-sdl.log').read_text()
assert 'PASS: real CPL3 stream/seek/spawn' in (root/'build/light-userspace-api-console.log').read_text()
assert 'PASS: actual native-pixel UI captures' in (root/'build/light-visual-console.log').read_text()
assert 'PASS: idle remains usable' in (root/'build/final09-stability.log').read_text()
clean=json.loads((root/'build/clean-build.json').read_text())
assert all(clean[n]['sha256']==digest(root/n) for n in clean)
required=['README.md','TEST-RESULTS-0.9.md','PERFORMANCE-0.9.md','ARCHITECTURE-0.9.md','sdk/HELLO.ELF','storage/slopix-data.img','build/graphical09.log','RELEASE-LIGHT.md','sdk/READ.ELF']
assert all((root/x).is_file() for x in required)
selected=[]
for p in sorted(root.rglob('*')):
 if not p.is_file():continue
 rel=p.relative_to(root)
 if '__pycache__' in rel.parts or p.suffix in ['.pyc','.o','.d']:continue
 if rel.parts[0]=='build':
  if len(rel.parts)!=2:continue
  if rel.name not in ['slopix.iso','kernel.elf'] and not (p.suffix in ['.log','.json','.png','.txt'] and rel.name.startswith(('release09','performance09','baseline09-gate','before-','after-','ring4-only-','unthrottled-checkpoint-','m0-','userspace-','storage-','settings-policy-','utilities-','stability-slopix-0.9','files-','shell-','user-','clean-build','graphical09','final09','gtk-','sdl-','sustained-final','m3-memtest-underrun','light-','heap-','doom-lifecycle'))):continue
 if rel.parts[0]=='storage' and rel.name!='slopix-data.img':continue
 if rel.name in ['SHA256SUMS','CHECKPOINT.md']:continue
 selected.append(p)
manifest=''.join(digest(p)+'  '+p.relative_to(root).as_posix()+'\n' for p in selected)
(root/'SHA256SUMS').write_text(manifest)
output=root.parent/'slopix-0.9-let-there-be-light.zip'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
 for p in selected+[root/'SHA256SUMS']:z.write(p,Path(root.name)/p.relative_to(root))
with zipfile.ZipFile(output) as z:
 assert z.testzip() is None
 for p in selected:assert hashlib.sha256(z.read(str(Path(root.name)/p.relative_to(root)))).hexdigest()==digest(p)
print(output,output.stat().st_size,digest(output), 'ISO',digest(iso))
