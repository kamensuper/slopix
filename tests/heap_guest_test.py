"""Real PMM-backed heap under simultaneous Doom/SB16 load."""
import time,re
from qemu_driver import Guest,ROOT
g=Guest(['-audiodev','none,id=sound0','-device','sb16,audiodev=sound0'])
try:
 g.app(2);g.wait('DOOM_READY',30);g.key('esc');time.sleep(.2)
 for _ in range(3):g.key('ret');time.sleep(.25)
 g.app(0);g.command('audio tone 440 10000','AUDIO_TONE_STARTED')
 for _ in range(3):g.command('heaptest','HEAPTEST PASS')
 g.command('heapinfo','Heap live bytes: 0');g.wait('Heap pages: 0')
 g.command('audio info','Underruns: 0');g.wait('Device faults: 0')
 g.command('echo heap_load_alive','\nheap_load_alive\n');g.app(2);g.move(1100,650);time.sleep(2)
 assert len(re.findall('DOOM_STATS ',g.output()))>=2
 (ROOT/'build/heap-guest.log').write_text(g.output())
 print('PASS: PMM-backed heap cycles and cleanup during SB16 tone; Doom continues')
finally:g.close()
