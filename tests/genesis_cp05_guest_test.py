#!/usr/bin/env python3
"""QEMU acceptance test for CP05. Run only with actual built ISO and QEMU installed.
The disk is copied before running; this test never modifies a shipped image.
"""
import re
import shutil
import tempfile
import time
from pathlib import Path
from qemu_driver import Guest,ROOT

source=ROOT/'storage/genesis-cp05-ring3-ready.img'
assert source.exists(),f'No CP05 test disk: {source}'
with tempfile.TemporaryDirectory(dir=ROOT/'build') as tmp:
    disk=Path(tmp)/'cp05-guest.img'
    shutil.copyfile(source,disk)
    g=Guest(['-drive',f'file={disk},format=raw,if=ide,index=0,media=disk'])
    try:
        def launch(id,tag,seconds=20):
            begin=len(g.output());g.app(id);g.wait(tag,seconds,start=begin)
            text=g.output()[begin:]
            matches=re.findall(r'PROCESS_CREATED pid=(\d+)',text)
            assert matches,f'Missing Ring-3 PID for app {id}'
            return int(matches[-1])
        def close(pid):
            before=len(g.output());g.key('f4','alt')
            g.wait(f'PROCESS_EXIT pid={pid} ',20,start=before)
            g.wait('GENESIS_CLOSE: userspace process terminated',10,start=before)
        # Terminal startup is intentionally login-gated, rather than kernel UI.
        g.wait('TERM_RING3_LAUNCHED',15)
        for app in (3,4,5):
            pid=launch(app,'GENESIS_CP05_RING3_LAUNCHED')
            close(pid)
        demo=launch(1,'DEMO_RING3_LAUNCHED');close(demo)
        browser=launch(6,'BROWSE_RING3_LAUNCHED');close(browser)
        # Doom owns a real Ring-3 process and its 28 MiB WAD stays on disk.
        doom=launch(2,'DOOM_RING3_LAUNCHED',40)
        g.wait('DOOM_RING3_READY',120)
        start=len(g.output());g.key('up');g.key('ctrl');time.sleep(1)
        assert 'PROCESS_FAULT' not in g.output()[start:],'DOOM faulted during input'
        close(doom)
        g.app(2);g.wait('DOOM_RING3_READY',120)
        new=re.findall(r'PROCESS_CREATED pid=(\d+)',g.output())
        assert new and int(new[-1])!=doom,'DOOM reused terminated PID'
        close(int(new[-1]))
        (ROOT/'build/genesis-cp05-guest.log').write_text(g.output())
    finally:
        g.close()
print('PASS: guest Ring-3 desktop utilities, Doom cold start/key/close/reopen')
