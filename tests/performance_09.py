"""Sequential 0.9 pipeline measurements, fixed TCG config; no physical scanout claim."""
import time,re,json,os,sys,hashlib
from pathlib import Path
from qemu_driver import Guest,ROOT
from stability_test import cpu_clock
iso_sha=hashlib.sha256(Path(os.environ.get('SLOPIX_TEST_ISO',str(ROOT/'build/slopix.iso'))).read_bytes()).hexdigest()
results=[]
if '--resume' in sys.argv:
 gate=json.loads((ROOT/'build/release09-results.json').read_text())
 assert gate['iso_sha256']==hashlib.sha256((ROOT/'build/slopix.iso').read_bytes()).hexdigest()
 prior=json.loads((ROOT/'build/performance09.json').read_text())
 (ROOT/'build/performance09-interrupted.json').write_text(json.dumps(prior,indent=2))
 for mode in [(800,600),(1024,600),(1280,800),(1600,900),(1920,1080)]:
  group=[r for r in prior if r['resolution']==list(mode)]
  if all(r.get('iso_sha256')==iso_sha for r in group) and [r['workload'] for r in group]==['alone','audio','terminal','cube','all_six']:results.extend(group)
 print('Retained complete resolution workloads:',len(results),flush=True)

def rows(out,prefix):return [{k:int(v) for k,v in re.findall(r'(\w+)=(-?\d+)',s)} for s in out.splitlines() if s.startswith(prefix)]
def hold(g,on):g.event([{'type':'key','data':{'down':on,'key':{'type':'qcode','data':'ctrl'}}}])
def geom(g):
 raw=g.screenshot('matrix09-mode.ppm');w,h=map(int,raw.split(b'\n',3)[1].split());g.x=min(g.x,w-1);g.y=min(g.y,h-1);return w,h
for w,h in [(800,600),(1024,600),(1280,800),(1600,900),(1920,1080)]:
 if any(r['resolution']==[w,h] for r in results):continue
 for audio in [False,True]:
  extra=['-audiodev','none,id=sound0','-device','sb16,audiodev=sound0'] if audio else []
  g=Guest(extra)
  try:
   g.command('slopmon trace')
   if (w,h)!=(1280,800):g.command(f'display {w} {h}','Display mode applied');assert geom(g)==(w,h)
   g.app(2);g.wait('DOOM_READY',30);g.key('esc');time.sleep(.2)
   for _ in range(3):g.key('ret');time.sleep(.3)
   for phase in (['audio','terminal','cube','all_six'] if audio else ['alone']):
    g.app(0);g.command('slopmon reset')
    if phase in ['alone','audio']:
     box=rows(g.output(),'DISPLAY_LAYOUT ');box=[b for b in box if b['id']==0];x,y=(box[-1]['x'],box[-1]['y']) if box else (60,155);g.click(x+23,y+22)
    if phase=='all_six':
     for i in [0,3,4,5]:g.app(i)
    g.app(2)
    if phase in ['cube','all_six']:g.app(1)
    if audio:
     # Focus DOOM briefly to refill ammunition, then restore the measured stack.
     g.app(2);g.type('idkfa');hold(g,True)
     if phase in ['cube','all_six']:g.app(1) # focus loss intentionally releases fire
    g.move(w-1,40);offset=len(g.output());clock=cpu_clock(g.p.pid);c=clock();start=time.monotonic();time.sleep(8);out=g.output()[offset:];wall=time.monotonic()-start;used=clock()-c
    hold(g,False);ds=rows(out,'DOOM_STATS ');assert len(ds)>=5 and all(v['state']==0 for v in ds),ds
    frames=[r for r in rows(out,'FRAMES ') if r['app']==0];assert frames and frames[-1]['n']>=80,frames
    g.app(0);begin=len(g.output());g.type('echo measured_input');t=time.monotonic();g.key('ret');g.wait('\nmeasured_input\n',start=begin);latency=(time.monotonic()-t)*1000
    start=len(g.output());g.command('slopmon');report=g.output()[start:];g.command('audio info','Underruns: 0');g.wait('Device faults: 0')
    row={'iso_sha256':iso_sha,'resolution':[w,h],'workload':phase,'audio_device':audio,'wall_s':wall,'cpu_percent_one_core':100*used/wall,'frames':frames[-1],'fps_samples':[v['fps10']/10 for v in ds],'doom_work_ms':[v['work_us']/1000 for v in ds],'enter_serial_ms_including_16ms_driver_delay':latency,'audio_underruns':0,'stages_after_input':report}
    results.append(row);(ROOT/'build/performance09.json').write_text(json.dumps(results,indent=2));print(w,h,phase,frames[-1],'input_ms',round(latency,2),flush=True)
   (ROOT/'build'/f'performance09-{w}-{h}-{audio}.log').write_text(g.output())
  finally:g.close()
print('PASS: all 25 sequential resolution/workload samples; measured pacing, CPU, input and audio counters')
