"""Measured 15s idle and 60s cube with recurring 10s tones; no disk I/O."""
import json,time
from qemu_driver import Guest,ROOT
from telemetry import parse_cube_stats
from stability_test import cpu_clock
capture=ROOT/'build/sustained-audio.wav';capture.unlink(missing_ok=True)
g=Guest(['-audiodev',f'wav,id=sound0,path={capture}','-device','sb16,audiodev=sound0,iobase=0x220,irq=5,dma=1'])
results={}
try:
    clock=cpu_clock(g.p.pid);t=time.monotonic();cpu=clock();time.sleep(15)
    results['idle']={'wall_s':time.monotonic()-t,'cpu_s':clock()-cpu}
    results['idle']['percent_one_core']=results['idle']['cpu_s']/results['idle']['wall_s']*100
    g.command('echo idle_alive','\nidle_alive\n')
    g.app(1);g.wait('CUBE_STATS',10);g.move(1100,650);g.click(200,300)
    g.move(1100,650)
    quiet_initial=parse_cube_stats(g.output());quiet_count=len(quiet_initial)
    quiet_clock=clock();quiet_start=time.monotonic();quiet_arrivals=[];last_quiet=quiet_count
    while time.monotonic()-quiet_start<20:
        q=parse_cube_stats(g.output())
        if len(q)>last_quiet:quiet_arrivals.append((time.monotonic(),q[-1]['frames']));last_quiet=len(q)
        time.sleep(.05)
    quiet_wall=time.monotonic()-quiet_start;quiet_cpu=clock()-quiet_clock
    results['animated_quiet']={'wall_s':quiet_wall,'cpu_s':quiet_cpu,'percent_one_core':quiet_cpu/quiet_wall*100,'host_frame_fps':(quiet_arrivals[-1][1]-quiet_arrivals[0][1])/(quiet_arrivals[-1][0]-quiet_arrivals[0][0]),'samples':parse_cube_stats(g.output())[quiet_count:]}
    g.click(200,300);g.command('audio tone 440 10000','AUDIO_TONE_STARTED');g.move(1100,650)
    initial=parse_cube_stats(g.output());arrivals=[];count=len(initial)
    cpu=clock();start=time.monotonic();last=start;latencies=[]
    while time.monotonic()-start<60:
        now=time.monotonic()
        if now-last>9.0:
            g.move(200,300);g.click(200,300)
            t=time.monotonic();g.command('audio tone 440 10000','AUDIO_TONE_STARTED');latencies.append(time.monotonic()-t)
            g.move(1100,650);last=time.monotonic()
        current=parse_cube_stats(g.output())
        if len(current)>count:arrivals.append((time.monotonic(),current[-1]['frames']));count=len(current)
        time.sleep(.05)
    wall=time.monotonic()-start;cpu=clock()-cpu
    current=parse_cube_stats(g.output());samples=current[len(initial):]
    results['animated_audio']={'wall_s':wall,'cpu_s':cpu,'percent_one_core':cpu/wall*100,'host_frame_fps':(arrivals[-1][1]-arrivals[0][1])/(arrivals[-1][0]-arrivals[0][0]),'samples':samples,'command_roundtrip_s':latencies}
    g.click(200,300);g.command('audio info','Underruns: 0');g.wait('Device faults: 0')
    g.command('audio stop','Audio stopped');g.command('echo sustained_audio_alive','\nsustained_audio_alive\n')
    (ROOT/'build/audio-performance.log').write_text(g.output())
    assert len(samples)>50
finally:
    (ROOT/'build/audio-performance.json').write_text(json.dumps(results,indent=2));g.close()
print(json.dumps({k:{a:b for a,b in v.items() if a!='samples'} for k,v in results.items()},indent=2))
