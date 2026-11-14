"""Verify selected frontend pixels advance without forcing a device refresh."""
import os,time
from PIL import ImageGrab,ImageChops
from qemu_driver import Guest,ROOT
(ROOT/'build').mkdir(exist_ok=True)
(ROOT/'build/final09-qemu-events.txt').write_text('console_refresh\ngd_update\ngd_switch\n')
args=['-trace','events='+str(ROOT/'build/final09-qemu-events.txt')+',file='+str(ROOT/'build/final09-qemu-refresh.trace'),'-display',os.environ.get('TEST_DISPLAY','gtk'),'-audiodev','pa,id=sound0,server='+os.environ['PULSE_SERVER'],'-device','sb16,audiodev=sound0']
frontend=os.environ.get('TEST_DISPLAY','gtk');g=Guest(args)
try:
 g.command('audio tone 440 10000','AUDIO_TONE_STARTED');g.app(1);g.move(1000,650);time.sleep(1)
 a=ImageGrab.grab(xdisplay=os.environ['DISPLAY']);a.save(ROOT/('build/final09-'+frontend+'-refresh-a.png'))
 time.sleep(3)
 b=ImageGrab.grab(xdisplay=os.environ['DISPLAY']);b.save(ROOT/('build/final09-'+frontend+'-refresh-b.png'))
 changed=sum(1 for p in ImageChops.difference(a,b).convert('RGB').getdata() if p!=(0,0,0))>5000
 (ROOT/('build/final09-'+frontend+'-refresh.log')).write_text(g.output())
 print(frontend.upper()+' cube pixels changed without forced refresh:',changed,flush=True)
 assert changed,frontend+' frontend stayed stale without QMP screendump'
finally:g.close()
