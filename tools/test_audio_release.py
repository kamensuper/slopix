#!/usr/bin/env python3
"""Release regression excludes deferred FAT32 tests; failures retain exit status."""
import json,subprocess,sys,time
from pathlib import Path
root=Path(__file__).resolve().parents[1]
results=[]
for name in ['icon_test','telemetry','smoke','terminal_test','memory_guest_test','input_regression_test','clock_test','window_test','cube_test','reboot_test','models_dock_test','doom_test','audio_guest_test','doom_audio_test']:
    start=time.monotonic()
    with (root/'build'/f'{name}-runner.log').open('w') as log:
        p=subprocess.run([sys.executable,str(root/'tests'/f'{name}.py')],cwd=root,stdout=log,stderr=subprocess.STDOUT)
    results.append({'test':name,'exit':p.returncode,'wall_s':time.monotonic()-start})
    (root/'build/release-tests.json').write_text(json.dumps(results,indent=2))
    print(name, 'PASS' if p.returncode==0 else 'FAIL',round(results[-1]['wall_s'],2),'seconds',flush=True)
    if p.returncode:sys.exit(p.returncode)
