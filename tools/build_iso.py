"""Fresh staging and atomic ISO replacement; never reuse stray staging files."""
import argparse,subprocess,tempfile,shutil,os
from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--grub',default='grub-mkrescue');p.add_argument('--platform',default='/usr/lib/grub/i386-pc');a=p.parse_args()
with tempfile.TemporaryDirectory(prefix='iso-stage-',dir=root/'build') as d:
 d=Path(d);stage=d/'stage';(stage/'boot/grub').mkdir(parents=True)
 shutil.copy2(root/'build/kernel.elf',stage/'boot/kernel.elf');shutil.copy2(root/'boot/grub/grub.cfg',stage/'boot/grub/grub.cfg')
 result=d/'slopix.iso';subprocess.run([a.grub,'-d',a.platform,'-o',str(result),str(stage)],check=True)
 os.replace(result,root/'build/slopix.iso')
