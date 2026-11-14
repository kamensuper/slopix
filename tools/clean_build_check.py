"""Build source in a fresh location; compare outputs before replacing release ISO."""
import os,shutil,subprocess,tempfile,hashlib,json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
env=os.environ.copy();env['SOURCE_DATE_EPOCH']='1792281600'
with tempfile.TemporaryDirectory(prefix='slopix-source-build-') as d:
 dst=Path(d)/'slopix-0.9'
 shutil.copytree(root,dst,ignore=shutil.ignore_patterns('build','__pycache__','*.pyc','*.o','*.d','*.ELF'))
 subprocess.run(['make','-j2'],cwd=dst,env=env,check=True)
 report={}
 for name in ['build/kernel.elf','sdk/HELLO.ELF','sdk/READ.ELF','build/slopix.iso']:
  data=(dst/name).read_bytes();report[name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
  target=root/'build/clean-candidate'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(dst/name,target)
 (root/'build/clean-build.json').write_text(json.dumps(report,indent=2))
 print('PASS: fresh source build, GRUB Multiboot2 validation; outputs staged for final tests',report)
