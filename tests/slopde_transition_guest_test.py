"""No-disk QEMU smoke test for SlopDE lifecycle interactions.

Uses a disposable session-only account; it does not mount or modify a disk.
Real userspace clients are unavailable without the separately populated disk.
"""
import time
from qemu_driver import Guest


def pixel(image, x, y):
    magic, geometry, depth, data = image.split(b'\n', 3)
    assert magic == b'P6' and depth == b'255'
    width, height = map(int, geometry.split())
    assert 0 <= x < width and 0 <= y < height
    offset = (y * width + x) * 3
    return data[offset:offset + 3]


g = Guest()
try:
    g.wait('AUTH_SETUP_REQUIRED')
    g.key('ret')
    g.type('testuser')
    g.key('ret')
    time.sleep(.4)
    g.type('test123')
    g.key('ret')
    time.sleep(.4)
    g.type('test123')
    g.key('ret')
    g.wait('AUTH_SESSION_ACCOUNT', 20)
    time.sleep(.4)
    g.type('test123')
    g.key('ret')
    g.wait('AUTH_UNLOCKED', 20)
    g.wait('TERM_RING3_MISSING', 20)
    time.sleep(.5)
    initial = g.screenshot('slopde-transition-initial.ppm')
    width, height = map(int, initial.split(b'\n', 3)[1].split())
    x, y = (40, 65) if height < 700 else (60, 155)
    # Minimize and restore through the actual chrome and taskbar hitboxes.
    g.click(x + 44, y + 20)
    g.wait('WINDOW: minimized', 10)
    g.app(0)
    g.wait('WINDOW: opened-from-launcher', 10)
    time.sleep(.35)
    # Drag follows the mouse; the old window area must repaint its background.
    g.move(x + 240, y + 20)
    g.button(True)
    g.move(x + 340, y + 70)
    g.button(False)
    g.wait('WINDOW: drag-end', 10)
    time.sleep(.35)
    moved = g.screenshot('slopde-transition-moved.ppm')
    assert pixel(initial, x + 10, y + 200) != pixel(moved, x + 10, y + 200), 'old window pixels not restored'
    # Close, reopen, and dismiss a context menu while no process owns a client.
    g.click(x + 120, y + 70)
    g.wait('WINDOW: closed', 10)
    g.app(0)
    time.sleep(.35)
    g.move(width - 180, height - 300)
    g.event([{'type': 'btn', 'data': {'down': True, 'button': 'right'}}])
    time.sleep(.08)
    g.event([{'type': 'btn', 'data': {'down': False, 'button': 'right'}}])
    g.wait('CONTEXT_MENU: opened', 10)
    g.key('esc')
    time.sleep(.3)
    output = g.output()
    assert 'FAULT vector=' not in output and 'PANIC:' not in output
    assert 'PS2_RING_OVERFLOW' not in output
    print('PASS: session unlock, minimize/restore, drag repaint, close/reopen and menu dismissal')
finally:
    g.close()
