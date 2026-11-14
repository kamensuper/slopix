"""Dedicated, non-concurrent QEMU DOOM measurement; engine capped at 35 Hz."""
import json,re,time
from qemu_driver import Guest,ROOT
from stability_test import cpu_clock

def samples(g):
    out=g.output();complete=out[:out.rfind('\n')+1]
    return [{k:int(v) for k,v in re.findall(r'(\w+)=(-?\d+)',line)} for line in complete.splitlines() if line.startswith('DOOM_STATS ') and 'heap=' in line]
g=Guest()
try:
    g.app(2);g.wait('DOOM_READY',30);g.move(1100,650);time.sleep(1.1)
    g.key('esc');time.sleep(.2)
    for _ in range(3):g.key('ret');time.sleep(.25)
    time.sleep(2);s=samples(g);assert s[-1]['state']==0
    previous=s[-1]['frames'];arrivals=[];clock=cpu_clock(g.p.pid);cpu_start=clock();start=time.monotonic()
    while time.monotonic()-start<20:
        ss=samples(g);last=ss[-1]
        if last['frames']!=previous:arrivals.append((time.monotonic(),last));previous=last['frames']
        time.sleep(.025)
    cpu=clock()-cpu_start;wall=time.monotonic()-start
    assert len(arrivals)>12 and all(s['state']==0 for _,s in arrivals)
    result={'mode':'DOOM default window 320x200 scene, 640x400 integer display; Terminal open behind; no Demo', 'wall_s':wall,'qemu_cpu_s':cpu,'percent_one_core':cpu/wall*100,'host_fps':(arrivals[-1][1]['frames']-arrivals[0][1]['frames'])/(arrivals[-1][0]-arrivals[0][0]),'samples':[s for _,s in arrivals]}
    (ROOT/'build/doom-only-performance.json').write_text(json.dumps(result,indent=2));(ROOT/'build/doom-only-performance.log').write_text(g.output());g.screenshot('doom-performance.ppm')
    print('Measured DOOM only: host FPS',round(result['host_fps'],3),'one-second guest FPS',min(s['fps10'] for s in result['samples'])/10,max(s['fps10'] for s in result['samples'])/10,'CPU % one core',round(result['percent_one_core'],2),flush=True)
finally:g.close()
