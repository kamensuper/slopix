"""Actual QEMU SB16 -> WAV samples, controls, concurrent cube and Terminal."""
import json,math,time,wave,subprocess
from pathlib import Path
from qemu_driver import Guest,ROOT
capture=ROOT/'build/audio-capture.wav'
capture.unlink(missing_ok=True)
g=Guest(['-audiodev',f'wav,id=sound0,path={capture}', '-device','sb16,audiodev=sound0,iobase=0x220,irq=5,dma=1'])
results={}
try:
    g.wait('AUDIO_SB16_READY')
    g.command('audio info','SlopAudio: SB16')
    g.command('audio volume 100','Audio volume: 100 percent')
    g.command('audio test','AUDIO_TONE_STARTED')
    # Input must complete while the two-second tone is active.
    t=time.monotonic();g.command('echo during_audio','\nduring_audio\n');results['terminal_command_s']=time.monotonic()-t
    time.sleep(2.2);g.command('audio info','Playback complete')
    g.command('audio demo','AUDIO_WAV_STARTED')
    # Cube animation, drag and Terminal controls during WAV playback.
    g.app(1);g.wait('CUBE_STATS',10)
    g.click(200,300);g.command('echo wav_and_cube','\nwav_and_cube\n')
    time.sleep(3.3);g.command('audio info','Playback complete')
    g.command('audio volume 0','Audio volume: 0 percent');g.command('audio test','AUDIO_TONE_STARTED')
    time.sleep(2.3);g.command('audio info','Playback complete')
    g.command('audio volume 65','Audio volume: 65 percent')
    for i in range(5):
        g.command('audio demo','AUDIO_WAV_STARTED');g.command('audio stop','Audio stopped')
    g.command('audio volume 101','Usage: audio volume 0..100')
    g.command('audio volume nonsense','Usage: audio volume 0..100')
    g.command('audio tone 0 100','Tone: 40..8000 Hz, 20..10000 ms')
    g.command('audio tone 999999999 10','Usage: audio tone HZ MILLISECONDS')
    g.command('audio info','Underruns: 0');g.wait('Device faults: 0')
    g.screenshot('audio-desktop.ppm')
    (ROOT/'build/audio-guest.log').write_text(g.output())
    results['irq_controls_and_concurrent_desktop']='passed'
finally:g.close()
# WAV header is finalized only when QEMU exits cleanly.
import numpy as np
with wave.open(str(capture),'rb') as w:
    rate=w.getframerate();channels=w.getnchannels();bits=w.getsampwidth()*8
    raw=w.readframes(w.getnframes())
assert bits==16,(bits,rate)
a=np.frombuffer(raw,dtype='<i2').reshape(-1,channels).mean(axis=1)/32768
assert len(a)>rate*5
# Find sustained nonzero audio; verify actual dominant pitch of the test tone.
windows=[]
for start in range(0,len(a)-rate//2,rate//10):
    segment=a[start:start+rate//2];rms=float(np.sqrt(np.mean(segment**2)))
    if rms>.03:
        spectrum=abs(np.fft.rfft(segment*np.hanning(len(segment))))
        peak=float(np.fft.rfftfreq(len(segment),1/rate)[np.argmax(spectrum)])
        windows.append((start/rate,rms,peak))
assert any(abs(x[2]-440)<5 for x in windows),windows[:10]
# Original chime's first note is C4; the capture must contain it too.
assert any(abs(x[2]-262)<8 for x in windows),windows
assert np.max(abs(a))<=1
# Silence is zero AC energy; host integer conversion can add a constant DC bias.
# Independently verify the actual native U8 midpoint below rather than allowing noise.
flat=best=0
for i in range(1,len(a)):
    flat=flat+1 if a[i]==a[i-1] else 0;best=max(best,flat)
assert best>rate*1.5,('volume-zero capture varies',best,rate)
results.update(capture_rate=rate,capture_channels=channels,capture_seconds=len(a)/rate,peak=float(np.max(abs(a))),nonzero_windows=windows)
(ROOT/'build/audio-results.json').write_text(json.dumps(results,indent=2))
print('PASS: real SB16 DMA/IRQ capture, measured 440Hz tone and C4 chime, controls, zero reported underruns/faults, Terminal and cube',flush=True)
# Absent hardware must not affect boot or existing commands.
g=Guest()
try:
    g.command('audio info','no supported device');g.command('audio test','No audio device available')
    g.command('echo no_audio_ok','\nno_audio_ok\n')
    (ROOT/'build/audio-no-device.log').write_text(g.output())
finally:g.close()
print('PASS: no-device boot and Terminal remain usable')

# Actual DMA/IRQ playback must also work without HPET.
pit=ROOT/'build/audio-pit.wav';pit.unlink(missing_ok=True)
g=Guest(['-machine','pc,hpet=off','-audiodev',f'wav,id=sound0,path={pit}','-device','sb16,audiodev=sound0'])
try:
    g.command('audio test','AUDIO_TONE_STARTED');time.sleep(2.3)
    g.command('audio info','Playback complete');g.wait('Underruns: 0');g.wait('Device faults: 0')
    g.command('echo audio_pit_alive','\naudio_pit_alive\n')
    (ROOT/'build/audio-pit.log').write_text(g.output())
finally:g.close()
with wave.open(str(pit),'rb') as w:
    raw=w.readframes(w.getnframes());assert any(raw)
print('PASS: audio with PIT fallback, actual captured nonzero data and responsive Terminal')

# Native format capture isolates the DMA byte stream from host 16-bit conversion.
native=ROOT/'build/audio-mute-u8.wav';native.unlink(missing_ok=True)
g=Guest(['-audiodev',f'wav,id=sound0,path={native},out.frequency=22050,out.channels=1,out.format=u8','-device','sb16,audiodev=sound0'])
try:
    g.command('audio volume 0','Audio volume: 0 percent');g.command('audio test','AUDIO_TONE_STARTED')
    symbols=subprocess.check_output(['nm','-S','-an',str(ROOT/'build/kernel.elf')],text=True)
    symbol=next(line.split() for line in symbols.splitlines() if line.endswith(' b dma'))
    address,size=int(symbol[0],16),int(symbol[1],16)
    assert size==2048,'four 512-byte DMA blocks required'
    assert address<0x1000000 and (address&65535)+size<=65536,'ISA DMA placement/boundary'
    dma_file=ROOT/'build/muted-dma.bin'
    g.request('pmemsave',{'val':address,'size':size,'filename':str(dma_file)})
    assert set(dma_file.read_bytes())=={128},'guest DMA silence must be exact U8 midpoint'
    time.sleep(2.3);g.command('audio info','Playback complete')
finally:g.close()
with wave.open(str(native),'rb') as w:
    assert w.getsampwidth()==1 and w.getframerate()==22050
    raw=w.readframes(w.getnframes())
    assert len(raw)>22050 and len(set(raw))==1 and abs(raw[0]-128)<=1,(len(raw),set(raw))
print('PASS: guest physical DMA mute is exactly 128; native-rate capture constant within one LSB after QEMU conversion')
