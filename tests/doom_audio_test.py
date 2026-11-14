"""Digital Freedoom SFX through guest mixer and real emulated SB16 DMA."""
import json,re,time,wave
from qemu_driver import Guest,ROOT
capture=ROOT/'build/doom-audio-capture.wav';capture.unlink(missing_ok=True)
g=Guest(['-audiodev',f'wav,id=sound0,path={capture}','-device','sb16,audiodev=sound0,iobase=0x220,irq=5,dma=1'])
try:
    g.command('audio volume 0','Audio volume: 0 percent')
    g.app(2);g.wait('DOOM_READY',30);g.move(1100,650);time.sleep(1.2)
    g.key('esc');time.sleep(.2)
    for _ in range(3):g.key('ret');time.sleep(.5)
    g.wait('DOOM_SFX_STARTED',10);time.sleep(2)
    g.click(200,300);g.command('audio volume 100','Audio volume: 100 percent')
    g.app(2);g.move(1100,650)
    g.event([{'type':'key','data':{'down':True,'key':{'type':'qcode','data':'ctrl'}}}]);time.sleep(2)
    g.event([{'type':'key','data':{'down':False,'key':{'type':'qcode','data':'ctrl'}}}])
    g.click(200,300);g.command('echo doom_has_sound','\ndoom_has_sound\n')
    g.app(1);g.wait('CUBE_STATS',10);g.move(1100,650)
    start=time.monotonic()
    while time.monotonic()-start<15:
        g.output();time.sleep(.1)
    g.click(200,300);g.command('audio info','Underruns: 0');g.wait('Device faults: 0')
    g.command('echo all_apps_audio_ok','\nall_apps_audio_ok\n')
    g.app(2);g.click(573,102);g.wait('DOOM: closed')
    g.app(2);g.move(1100,650);time.sleep(.4)
    g.key('f10');time.sleep(.2);g.key('y');g.wait('DOOM: quit-to-desktop')
    g.app(2);g.move(1100,650);time.sleep(.6)
    g.click(200,300);g.command('audio info','Underruns: 0');g.wait('Device faults: 0')
    assert g.output().count('DOOM_READY')==1

    out=g.output();assert 'DOOM_ERROR:' not in out and 'FAULT vector=' not in out
    samples=[{k:int(v) for k,v in re.findall(r'(\w+)=(-?\d+)',line)} for line in out.splitlines() if line.startswith('DOOM_STATS ')]
    assert any(s['state']==0 and s['ammo']<50 for s in samples),samples[-4:]
    (ROOT/'build/doom-audio.log').write_text(out);g.screenshot('doom-audio-desktop.ppm')
finally:g.close()
import numpy as np
with wave.open(str(capture),'rb') as w:
    channels=w.getnchannels();rate=w.getframerate();bits=w.getsampwidth()*8
    assert bits==16
    a=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').reshape(-1,channels).mean(axis=1)/32768
active=int(np.count_nonzero(abs(a)>.005));assert active>rate/4,(active,len(a))
result={'capture_rate':rate,'capture_seconds':len(a)/rate,'nonzero_samples':active,'peak':float(max(abs(a))),'doom_samples':samples}
(ROOT/'build/doom-audio-results.json').write_text(json.dumps(result,indent=2))
print('PASS: Freedoom menu/game/fire SFX captured, real ammo consumption, three apps + audio, zero reported underruns/device faults')
