#!/usr/bin/env python3
"""Package the tested 0.7 ISO, complete sources and current evidence."""
from pathlib import Path
import hashlib,zipfile
root=Path(__file__).resolve().parents[1]
allowed={'.log','.json','.png','.txt','.wav','.sha256','.bin'}
output=root.parent/'slopix-0.7-audio.zip'
with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for p in sorted(root.rglob('*')):
        if not p.is_file():continue
        rel=p.relative_to(root)
        if '__pycache__' in rel.parts:continue
        if rel.parts[0]=='build':
            if rel.name!='slopix.iso' and p.suffix not in allowed:continue
            if len(rel.parts)>2 and rel.parts[1]!='early-attempt':continue
            if rel.name=='sustained-audio.wav':continue # raw 60s capture is large; summary and logs retained
        z.write(p,Path('slopix-0.7-audio')/rel)
print(output,output.stat().st_size,hashlib.sha256(output.read_bytes()).hexdigest())
