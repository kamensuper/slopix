"""Input editing, bounded buffers, history, ring rollover and real timer tests."""
import re
import time
from qemu_driver import Guest,ROOT

g=Guest()
try:
    g.command('clear')
    start=len(g.output());g.key('ret');g.wait('COMMAND_COMPLETE',start=start)
    start=len(g.output());g.type('   ');g.key('ret');g.wait('COMMAND_COMPLETE',start=start)
    g.command('echo Hello_World!?','\nHello_World!?\n')
    start=len(g.output());g.type('echo worlx');g.key('backspace');g.type('d');g.key('ret');g.wait('\nworld\n',start=start)
    start=len(g.output());g.type('echo ac');g.key('left');g.type('b');g.key('ret');g.wait('\nabc\n',start=start)
    start=len(g.output());g.type('echo abxc');g.key('left');g.key('left');g.key('delete');g.key('end');g.key('ret');g.wait('\nabc\n',start=start)
    start=len(g.output());g.type('cho home');g.key('home');g.type('e');g.key('end');g.key('ret');g.wait('\nhome\n',start=start)
    start=len(g.output());g.key('up');g.key('ret');g.wait('CMD: echo home\n',start=start)
    g.type('discard me');g.key('u',mod='ctrl');g.command('echo erased','\nerased\n')
    print('PASS: Shift, Backspace, insert/delete, Home/End, history, Ctrl+U',flush=True)
    start=len(g.output());g.type('echo '+('a'*270));g.key('ret')
    expected='echo '+('a'*250)
    g.wait('CMD: '+expected+'\n',start=start)
    commands=re.findall(r'^CMD: (.*)$',g.output()[start:],re.M)
    assert commands==[expected],commands
    g.command('echo after-limit','\nafter-limit\n')
    print('PASS: input capped at 255 bytes; overflow ignored; subsequent commands work',flush=True)
    for i in range(145):
        g.command('echo '+str(i),'\n'+str(i)+'\n')
        if i and i%40==0:print('Stress commands:',i,flush=True)
    assert g.output().count('COMMAND_COMPLETE')>=150
    g.key('pgup');g.wait('SCROLL: 8')
    g.screenshot('scrollback.ppm')
    g.key('pgdn');g.wait('SCROLL: 0')
    print('PASS: >256 output lines rolled over safely; scrolling works',flush=True)
    g.key('l',mod='ctrl');g.command('echo Still_running!','\nStill_running!\n')
    start=len(g.output());g.command('uptime','Uptime:')
    a=int(re.search(r'Uptime: (\d+)',g.output()[start:]).group(1));time.sleep(1.2)
    start=len(g.output());g.command('uptime','Uptime:')
    b=int(re.search(r'Uptime: (\d+)',g.output()[start:]).group(1));assert b>a,(a,b)
    g.command('help','Arrows: edit/history')
    g.screenshot('terminal-tested.ppm')
    (ROOT/'build/terminal-test.log').write_text(g.output())
    print('PASS: Ctrl+L, continued usability and advancing PIT uptime',flush=True)
finally:g.close()
