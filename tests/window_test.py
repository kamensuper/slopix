"""Actual PS/2 mouse events exercise window bounds, lifecycle and focus."""
from qemu_driver import Guest,ROOT

def pixel(ppm,x,y):
    magic,geometry,depth,data=ppm.split(b'\n',3)
    assert magic==b'P6' and depth==b'255'
    width,height=map(int,geometry.split());assert 0<=x<width and 0<=y<height
    offset=(y*width+x)*3;return tuple(data[offset:offset+3])

g=Guest()
try:
    initial=g.screenshot('initial.ppm')
    assert pixel(initial,70,300)==(245,247,244)
    assert b'\xf8\xf9\xfc' in initial, 'software cursor missing'
    g.move(300,177);g.button(True);g.move(390,217);g.button(False)
    g.wait('WINDOW: drag-end');g.wait('POSITION: 150,195')
    dragged=g.screenshot('dragged.ppm')
    assert pixel(dragged,70,300)!=(245,247,244), 'old window area not restored'
    g.click(217,217);g.wait('WINDOW: maximized')
    g.command('echo fullscreen','\nfullscreen\n')
    maximized=g.screenshot('maximized.ppm')
    assert pixel(maximized,10,400)==(245,247,244)
    g.click(67,54);g.wait('WINDOW: restored')
    g.click(173,217);g.wait('WINDOW: closed')
    closed=g.screenshot('closed.ppm')
    assert pixel(closed,600,400)!=(245,247,244)
    g.type('ignored')
    g.app(0);g.wait('WINDOW: opened-from-dock')
    g.command('echo reopened','\nreopened\n')
    start=len(g.output());g.key('f11');g.wait('WINDOW: maximized',start=start)
    start=len(g.output());g.key('f11');g.wait('WINDOW: restored',start=start)
    g.click(20,400);g.type('ignored')
    g.click(600,400);g.command('echo focused','\nfocused\n')
    g.click(195,217);g.wait('WINDOW: minimized')
    start=len(g.output());g.app(0);g.wait('WINDOW: opened-from-dock',start=start)
    g.command('echo retained','\nretained\n')
    g.move(0,0);g.move(1279,799);g.move(1150,400)
    g.command('help','Arrows: edit/history')
    g.screenshot('desktop.ppm')
    assert 'PS2_RING_OVERFLOW' not in g.output()
    (ROOT/'build/window-test.log').write_text(g.output())
    print('PASS: cursor pixels, dragging/restored background, maximize/restore, close/reopen, F11, focus routing, minimize, screen edges',flush=True)
finally:g.close()
