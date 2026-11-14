#!/usr/bin/env python3
from qemu_driver import Guest,ROOT

g=Guest()
try:
    print('PASS: boot and PS/2 initialization',flush=True)
    for cmd,expected in [('help','help clear echo uname version uptime meminfo reboot'),('echo hello','\nhello\n'),('uname','Slopix x86_64'),('version','Slopix 0.9'),('uptime','Uptime:'),('meminfo','Kernel heap active'),('nonsense','Unknown command')]:
        g.command(cmd,expected)
    g.screenshot('terminal.ppm')
    regs=g.request('human-monitor-command',{'command-line':'info registers'})
    assert 'CS64' in regs and 'EFER=0000000000000d00' in regs
    (ROOT/'build/registers.txt').write_text(regs)
    (ROOT/'build/smoke-test.log').write_text(g.output())
    print('PASS: built-in commands entered through emulated keyboard',flush=True)
finally:g.close()
