import time
from qemu_driver import Guest,ROOT

def key_event(key,down):return {'type':'key','data':{'down':down,'key':{'type':'qcode','data':key}}}
g=Guest()
try:
    # Either Ctrl key can keep a modifier active after the other is released.
    g.type('discard')
    g.event([key_event('ctrl',True),key_event('ctrl_r',True),key_event('ctrl',False)])
    g.key('u');g.event([key_event('ctrl_r',False)])
    g.command('echo modifiers_ok','\nmodifiers_ok\n')
    start=len(g.output());g.type('echo ')
    g.event([key_event('caps_lock',True),key_event('caps_lock',True),key_event('caps_lock',False)])
    g.key('a');g.key('caps_lock');g.key('ret');g.wait('\nA\n',start=start)
    # ~333 ordinary ASCII key pairs per second; below PS/2 byte-stream bandwidth.
    g.key_delay=.003;g.command('echo rapid_input_survives_0123456789','\nrapid_input_survives_0123456789\n');g.key_delay=.016
    g.command('echo normal_again','\nnormal_again\n')
    # Repeated S make codes are ordinary ASCII inside the guest, never an IME.
    start=len(g.output());g.type('echo ')
    for _ in range(30):
        g.event([key_event('s',True)]);time.sleep(.035)
    g.event([key_event('s',False)])
    g.key('ret');g.wait('\n'+'s'*30+'\n',start=start)

    g.app(1);g.wait('CUBE_STATS',10);g.click(200,300)
    g.key_delay=.003;g.command('echo rapid_with_cube','\nrapid_with_cube\n');g.key_delay=.016
    assert 'PS2_RING_OVERFLOW' not in g.output()
    (ROOT/'build/input-regression.log').write_text(g.output())
    print('PASS: dual Ctrl release, repeated Caps press, rapid typing and rapid input while cube animates',flush=True)
finally:g.close()
