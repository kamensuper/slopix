"""Genesis CP03 native QEMU smoke: actual Ring-3 close/minimize/restore,
mouse address bar and navigation. Requires a built ISO, QEMU and tools.
Disk is copied before boot; never mutates the archived test image.
"""
import re
import shutil
import tempfile
import time
from pathlib import Path
from qemu_driver import Guest, ROOT

image = ROOT / 'storage/genesis-cp03-browser.img'
assert image.exists(), 'Missing Genesis CP03 test disk'
with tempfile.TemporaryDirectory(dir=ROOT / 'build') as d:
    disk = Path(d) / 'test.img'
    shutil.copyfile(image, disk)
    g = Guest(['-drive', f'file={disk},format=raw,if=ide,index=0,media=disk'])
    try:
        # Ring-3 demo: distinct PID on each launch, zero execution after close.
        initial = len(g.output())
        g.app(1)
        g.wait('DEMO_RING3_LAUNCHED', 12, start=initial)
        text = g.output()[initial:]
        pids = re.findall(r'PROCESS_CREATED pid=(\d+)', text)
        assert pids, 'Demo did not start as a Ring-3 process'
        first = int(pids[-1])
        g.wait('CUBE_STATS fps10=', 15, start=initial)
        g.app(1)
        g.click(705, 135)   # Minimize 3D (x=660 + 45, y=115 + 20 at 1280x800)
        g.wait(f'PROCESS_SUSPEND pid={first} ', 5, start=initial)
        start = len(g.output())
        time.sleep(2.3)
        assert 'CUBE_STATS ' not in g.output()[start:], 'Demo still consuming CPU while minimized'
        g.app(1)
        g.wait(f'PROCESS_RESUME pid={first} ', 5, start=start)
        start = len(g.output())
        g.key('f4', 'alt')
        g.wait(f'PROCESS_EXIT pid={first} ', 5, start=start)
        g.wait('GENESIS_CLOSE: userspace process terminated', 5, start=start)
        start = len(g.output())
        time.sleep(2.3)
        assert 'CUBE_STATS ' not in g.output()[start:], 'Demo continued after close'
        g.app(1)
        g.wait('DEMO_RING3_LAUNCHED', 10, start=start)
        next_pids = re.findall(r'PROCESS_CREATED pid=(\d+)', g.output()[start:])
        assert next_pids and int(next_pids[-1]) != first, 'Reopen reused dead process'
        g.key('f4', 'alt')
        g.wait('GENESIS_CLOSE: userspace process terminated', 5, start=start)
        # Ring-3 SlopBrowse: click visible address field and navigate a local file.
        start = len(g.output())
        g.app(6)
        g.wait('BROWSE_RING3_LAUNCHED', 10, start=start)
        before = g.screenshot('genesis-cp03-browser-before.ppm')
        g.click(765, 181)  # browser x=590, client x=604, address x=709..1104
        g.type('ABOUT.HTM')
        g.key('ret')
        time.sleep(1.0)
        after = g.screenshot('genesis-cp03-browser-after.ppm')
        def area(ppm):
            _magic, geometry, _depth, pixels = ppm.split(b'\n', 3)
            w, h = map(int, geometry.split())
            assert w == 1280 and h == 800, 'This guest test assumes 1280x800'
            return b''.join(pixels[(y*w + 620)*3:(y*w + 1080)*3] for y in range(218, 405))
        assert area(before) != area(after), 'Clicking address failed to load ABOUT.HTM'
        g.key('f4', 'alt')
        g.wait('GENESIS_CLOSE: userspace process terminated', 5, start=start)
        (ROOT / 'build/genesis-cp03-lifecycle.log').write_text(g.output())
    finally:
        g.close()
print('PASS: Guest Ring-3 demo minimize/pause, resume, kill/reopen, browser clickable address and close')
