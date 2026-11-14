"""A different framebuffer device must retain its boot mode safely."""
import io
from PIL import Image
from qemu_driver import Guest,ROOT
g=Guest(['-vga','vmware'])
try:
    before=Image.open(io.BytesIO(g.screenshot('display-fallback-before.ppm'))).size
    assert 'DISPLAY_DISPI_READY' not in g.output()
    g.command('display','Runtime display unavailable; fixed boot framebuffer')
    g.command('display 1600 900','Runtime resolution requires QEMU PCI standard VGA')
    after=Image.open(io.BytesIO(g.screenshot('display-fallback-after.ppm'))).size
    assert before==after
    g.command('echo fixed_framebuffer_alive','\nfixed_framebuffer_alive\n')
    (ROOT/'build/display-fallback.log').write_text(g.output())
    print('PASS: non-standard framebuffer keeps its boot mode and usable Terminal')
finally:g.close()
