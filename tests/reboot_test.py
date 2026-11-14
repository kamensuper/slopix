"""Verify reboot requests an actual machine reset, not merely printed text."""
import time
from qemu_driver import Guest,ROOT

g=Guest()
try:
    g.command('reboot','REBOOT_REQUESTED')
    deadline=time.monotonic()+5
    while time.monotonic()<deadline:
        status=g.request('query-status')['status']
        if status=='shutdown':break
        time.sleep(.05)
    else:raise AssertionError('Reset did not stop QEMU under -no-reboot: '+status)
    assert 'PANIC:' not in g.output()
    (ROOT/'build/reboot-test.log').write_text(g.output()+'\nQMP status: '+status+'\n')
    print('PASS: reboot caused actual QEMU reset/shutdown under -no-reboot',flush=True)
finally:g.close()
