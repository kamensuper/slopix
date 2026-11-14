from qemu_driver import Guest,ROOT
import time

g=Guest()
try:
    g.app(1);g.wait('DEMO: opened-from-dock');g.wait('CUBE_STATS',10)
    time.sleep(3)
    g.screenshot('cube-preview.ppm')
    g.click(200,300);g.command('echo Cube_is_alive!','\nCube_is_alive!\n')
    g.command('uptime','Uptime:')
    g.screenshot('simultaneous.ppm')
    print(g.output(),flush=True)
    (ROOT/'build/cube-preview.log').write_text(g.output())
finally:g.close()
