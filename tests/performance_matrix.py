"""Sequential matched QEMU workloads. No parallel guests or invented baseline percentiles.
Frame intervals are kernel framebuffer-submission times, not physical scanout.
Reported worst/1% include deliberate focus/control transitions near each phase.
"""
import os,sys,time,re,json
from pathlib import Path
from qemu_driver import Guest,ROOT
from stability_test import cpu_clock
label=sys.argv[1] if len(sys.argv)>1 else '085';legacy=label!='085'
if len(sys.argv)>2:os.environ['SLOPIX_TEST_ISO']=str(Path(sys.argv[2]).resolve())
modes=[(1024,600),(1280,800),(1600,900),(1920,1080)] if legacy else [(800,600),(1024,600),(1280,800),(1600,900),(1920,1080)]
results=[]
def geometry(g):
 raw=g.screenshot('matrix-geometry.ppm');w,h=map(int,raw.split(b'\n',3)[1].split());g.x=min(g.x,w-1);g.y=min(g.y,h-1);return w,h
def app(g,i):
 w,h=geometry(g);g.move(w-1,40);time.sleep(.6);g.click(w//2+(i-(1 if legacy else 2))*108,h-60)
def termclose(g):
 # Resize-log geometry is actual guest state; startup coordinates are known only
 # for the unchanged 1280x800 initial mode.
 rows=re.findall(r'DISPLAY_LAYOUT id=0 x=(\d+) y=(\d+)',g.output());x,y=map(int,rows[-1]) if rows else (60,155)
 g.click(x+23,y+22)
def samples(out,prefix):return [{k:int(v) for k,v in re.findall(r'(\w+)=(-?\d+)',s)} for s in out.splitlines() if s.startswith(prefix)]
for w,h in modes:
 for audio in [False,True]:
  extra=['-audiodev',f'wav,id=sound0,path={ROOT/"build"/f"matrix-{label}-{w}-{h}.wav"}','-device','sb16,audiodev=sound0'] if audio else []
  g=Guest(extra)
  try:
   if not legacy:g.command('slopmon trace')
   if (w,h)!=(1280,800):g.command(f'display {w} {h}','Display mode applied');assert geometry(g)==(w,h)
   app(g,2);g.wait('DOOM_READY',30);g.move(w-1,40);time.sleep(1);g.key('esc');time.sleep(.2)
   for _ in range(3):g.key('ret');time.sleep(.3)
   phases=['audio','terminal','combined','maximized'] if audio else ['alone']
   for phase in phases:
    app(g,0);g.command('slopmon reset');
    if phase in ['alone','audio']:termclose(g)
    app(g,2)
    if phase=='combined':app(g,1)
    if phase=='maximized':g.key('f11')
    g.move(w-1,40)
    if phase=='audio':g.event([{'type':'key','data':{'down':True,'key':{'type':'qcode','data':'ctrl'}}}])
    offset=len(g.output());cpu=cpu_clock(g.p.pid);c=cpu();t=time.monotonic();time.sleep(6);out=g.output()[offset:];wall=time.monotonic()-t;cpu_used=cpu()-c
    if phase=='audio':g.event([{'type':'key','data':{'down':False,'key':{'type':'qcode','data':'ctrl'}}}])
    if phase=='maximized':g.key('f11')
    app(g,0);begin=len(g.output());g.type('echo matrix_input');t=time.monotonic();g.key('ret');g.wait('\nmatrix_input\n',start=begin);latency=(time.monotonic()-t)*1000
    begin=len(g.output());g.command('slopmon');report=g.output()[begin:]
    frames=[v for v in samples(report,'FRAMES ') if v['app']==0]
    ds=samples(out,'DOOM_STATS ');assert len(ds)>=3 and all(v['state']==0 for v in ds),ds
    row={'release':label,'resolution':[w,h],'workload':phase,'wall_s':wall,'qemu_cpu_percent_one_core':100*cpu_used/wall,'guest_interval_fps':[v['fps10']/10 for v in ds],'doom_work_ms':[v['work_us']/1000 for v in ds],'frame_window':frames[-1] if frames else None,'stage_report':report,'enter_serial_ms_including_driver_delay':latency}
    if frames:assert frames[-1]['n']>=100,frames
    g.command('audio info','Underruns: 0');g.wait('Device faults: 0');row['audio_underruns']=0
    results.append(row);(ROOT/'build'/f'matrix-{label}.json').write_text(json.dumps(results,indent=2));print(label,w,h,phase,'FPS',row['guest_interval_fps'],'frames',row['frame_window'],flush=True)
   (ROOT/'build'/f'matrix-{label}-{w}-{h}-{int(audio)}.log').write_text(g.output())
  finally:g.close()
print('PASS: sequential resolution/workload matrix with audio and input checks',label)
