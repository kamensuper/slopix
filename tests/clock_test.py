import time
from qemu_driver import Guest,ROOT
for fallback in [False,True]:
    g=Guest(['-machine','pc,hpet=off'] if fallback else None)
    try:
        expected='Clocksource: PIT IRQ-count fallback' if fallback else 'Clocksource: HPET free-running counter'
        g.wait(expected)
        g.command('uptime',expected);time.sleep(1.2);g.command('uptime','Uptime:')
        g.command('echo clock_alive','\nclock_alive\n')
        (ROOT/'build'/('clock-fallback.log' if fallback else 'clock-hpet.log')).write_text(g.output())
        print('PASS:',expected,'cold boot and commands',flush=True)
    finally:g.close()
