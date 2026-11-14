"""Unmodified release or instrument-only ISO: matched quiet/firing/combined workload."""
import os,sys,time,re,json
from qemu_driver import Guest,ROOT
from stability_test import cpu_clock
label=sys.argv[1]; iso=sys.argv[2] if len(sys.argv)>2 else ROOT/'build/slopix.iso'
os.environ['SLOPIX_TEST_ISO']=str(iso)
g=Guest(['-audiodev',f'wav,id=sound0,path={ROOT/"build"/(label+".wav")}','-device','sb16,audiodev=sound0'])
results={}
try:
 g.click(748,740);g.wait('DOOM_READY',30);g.move(1100,650);time.sleep(1.1);g.key('esc');time.sleep(.2)
 for _ in range(3):g.key('ret');time.sleep(.3)
 time.sleep(1)
 for phase in ['quiet','firing','combined']:
  if phase=='firing':g.event([{'type':'key','data':{'down':True,'key':{'type':'qcode','data':'ctrl'}}}])
  if phase=='combined':
   g.event([{'type':'key','data':{'down':False,'key':{'type':'qcode','data':'ctrl'}}}]);g.click(640,740);g.move(1100,650)
  start=len(g.output());clock=cpu_clock(g.p.pid);cpu=clock();t=time.monotonic();time.sleep(7)
  out=g.output()[start:];wall=time.monotonic()-t
  stats=[{k:int(v) for k,v in re.findall(r'(\w+)=(-?\d+)',s)} for s in out.splitlines() if s.startswith('DOOM_STATS')]
  results[phase]={'wall_s':wall,'cpu_percent_one_core':100*(clock()-cpu)/wall,'doom_stats':stats,'telemetry': [s for s in out.splitlines() if s.startswith(('PERF ','FRAMES '))]}
  print(label,phase,'FPS', [s['fps10']/10 for s in stats],flush=True)
 g.click(200,300);g.type('echo responsive');t=time.monotonic();g.key('ret');g.wait('\nresponsive\n');results['enter_ms']=(time.monotonic()-t)*1000
 g.command('audio info','Underruns: 0');g.wait('Device faults: 0')
 (ROOT/'build'/(label+'.log')).write_text(g.output());(ROOT/'build'/(label+'.json')).write_text(json.dumps(results,indent=2))
finally:g.close()
