#!/usr/bin/env python3
"""Acceptance test for full Ring-3 apps + real HTTP over QEMU's RTL8139.
This test MUST actually run in a Fedora QEMU environment to count as passed.
It uses a copy of the CP06 disk and a temporary host HTTP server.
"""
import functools
import http.server
import re
import shutil
import tempfile
import threading
import time
from pathlib import Path
from qemu_driver import Guest, ROOT

source=ROOT/'storage/genesis-cp06-ring3-ready.img'
assert source.is_file(),f'Missing disposable CP06 disk: {source}'
assert (ROOT/'build/slopix.iso').is_file(),'First build the ISO with make -j4'

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):
        pass

handler=functools.partial(Quiet,directory=str(ROOT/'network-demo'))
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
thread=threading.Thread(target=server.serve_forever,daemon=True)
thread.start()
try:
    with tempfile.TemporaryDirectory(dir=ROOT/'build') as tmp:
        disk=Path(tmp)/'genesis-cp06-test.img'
        shutil.copyfile(source,disk)
        g=Guest(['-nic','user,model=rtl8139', '-drive',f'file={disk},format=raw,if=ide,index=0,media=disk'])
        try:
            g.wait('NET_RTL8139_READY',8)
            g.wait('TERM_RING3_LAUNCHED',20)
            def launch(app,tag):
                before=len(g.output());g.app(app);g.wait(tag,20,start=before)
                found=re.findall(r'PROCESS_CREATED pid=(\d+)',g.output()[before:])
                assert found,f'Ring-3 app {app} lacked a PID'
                return int(found[-1])
            def close(pid):
                before=len(g.output());g.key('f4','alt')
                g.wait(f'PROCESS_EXIT pid={pid} ',15,start=before)
                g.wait('GENESIS_CLOSE: userspace process terminated',10,start=before)
            for app in (3,4,5,1):
                pid=launch(app,'DEMO_RING3_LAUNCHED' if app==1 else 'GENESIS_CP05_RING3_LAUNCHED')
                close(pid)
            browser=launch(6,'BROWSE_RING3_LAUNCHED')
            g.click(765,181)
            g.type(f'http://10.0.2.2:{server.server_port}/TEST.HTM')
            before=len(g.output());g.key('ret')
            g.wait('NET_HTTP_BEGIN',20,start=before)
            g.wait('NET_HTTP_OK',40,start=before)
            g.screenshot('genesis-cp06-http-guest.ppm')
            # Browser's HTML parser must resolve NEXT.HTM against the web URL.
            before=len(g.output());g.key('tab');g.key('ret')
            g.wait('NET_HTTP_OK',40,start=before)
            g.screenshot('genesis-cp06-relative-link.ppm')
            close(browser)
            pid=launch(2,'DOOM_RING3_LAUNCHED')
            g.wait('DOOM_RING3_READY',120)
            assert f'PROCESS_FAULT pid={pid}' not in g.output()
            g.key('up');g.key('ctrl');time.sleep(.8)
            close(pid)
            new=launch(2,'DOOM_RING3_LAUNCHED')
            assert new!=pid
            g.wait('DOOM_RING3_READY',120)
            close(new)
            (ROOT/'build/genesis-cp06-guest.log').write_text(g.output())
        finally:
            g.close()
finally:
    server.shutdown();server.server_close();thread.join(timeout=5)
print('PASS: genuine guest Ring-3 lifecycle, DOOM restart and RTL8139 HTTP page')
