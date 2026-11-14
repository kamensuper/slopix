"""Record actual audio counters with a controlled QEMU backend service period.
This is diagnostic fault injection, not a physical-speaker listening test.
Run only one guest/test suite at a time.
"""
import json,os,re,time,hashlib
from pathlib import Path
from qemu_driver import Guest,ROOT
period=int(os.environ.get('AUDIO_TIMER_US','10000'))
backend=os.environ.get('AUDIO_BACKEND','none')
options=(',server='+os.environ['PULSE_SERVER']) if backend=='pa' and os.environ.get('PULSE_SERVER') else ''
extra=['-audiodev',f'{backend},id=sound0,timer-period={period}'+options,'-device','sb16,audiodev=sound0']
if os.environ.get('QEMU_DISPLAY'):extra+=['-display',os.environ['QEMU_DISPLAY']]
g=Guest(extra);rows=[]
label=os.environ.get('PROBE_LABEL','probe')+f'-{backend}-{period}'
seconds=float(os.environ.get('PROBE_SECONDS','6'))
def observe(phase):
 g.event([{'type':'key','data':{'down':False,'key':{'type':'qcode','data':'ctrl'}}}])
 if os.environ.get('QEMU_DISPLAY'):
  from PIL import ImageGrab
  ImageGrab.grab(xdisplay=os.environ['DISPLAY']).save(ROOT/'build'/(os.environ['QEMU_DISPLAY']+'-'+phase+'.png'))
 g.app(0);begin=len(g.output());g.command('audio info');g.wait('COMMAND_COMPLETE',start=begin);report_begin=len(g.output());g.command('slopmon');g.wait('COMMAND_COMPLETE',start=report_begin);out=g.output()[begin:];rows.append({'iso_sha256':hashlib.sha256(Path(os.environ.get('SLOPIX_TEST_ISO',str(ROOT/'build/slopix.iso'))).read_bytes()).hexdigest(),'label':phase,'report':out});(ROOT/'build'/(label+'.json')).write_text(json.dumps(rows,indent=2));(ROOT/'build'/(label+'.log')).write_text(g.output());print(phase,out[out.find('Audio service'):out.find('COMMAND_COMPLETE')],flush=True)
 if os.environ.get('EXPECT_UNDERRUNS') is not None:
  match=re.search(r'Underruns: (\d+)',out);assert match and int(match[1])==int(os.environ['EXPECT_UNDERRUNS']),out
  assert 'Device faults: 0' in out,out
try:
 g.command('audio tone 440 10000','AUDIO_TONE_STARTED');time.sleep(3);observe('tone')
 g.app(2);g.wait('DOOM_READY',30);g.move(1100,650);time.sleep(.5);g.key('esc')
 for _ in range(3):g.key('ret');time.sleep(.3)
 g.type('idkfa');time.sleep(.15);g.event([{'type':'key','data':{'down':True,'key':{'type':'qcode','data':'ctrl'}}}]);time.sleep(seconds)
 observe('doom')
 for i in [1,3,4,5]:g.app(i)
 # Move the cube left before focusing DOOM, keeping both renderers visible
 # while held fire remains routed to DOOM. Utilities stay open behind them.
 g.app(1);g.move(860,137);g.button(True);g.move(210,137);g.button(False)
 g.wait('DEMO_POSITION: 10,115')
 cube_before=len(re.findall(r'CUBE_STATS ',g.output()))
 g.app(2);g.type('idkfa');time.sleep(.15);g.event([{'type':'key','data':{'down':True,'key':{'type':'qcode','data':'ctrl'}}}]);time.sleep(seconds)
 assert len(re.findall(r'CUBE_STATS ',g.output()))>=cube_before+max(3,int(seconds)-2),'Cube stopped during concurrent firing'
 observe('all_apps')
 # Large redraws while audio is active, through real display commands.
 for w,h in [(1920,1080),(800,600),(1024,600),(1600,900),(1280,800)]:
  g.app(0);g.command('audio tone 440 10000','AUDIO_TONE_STARTED');g.command(f'display {w} {h}','Display mode applied');time.sleep(.5)
 observe('mode_changes')
 label=os.environ.get('PROBE_LABEL','probe')+f'-{backend}-{period}'
 (ROOT/'build'/(label+'.log')).write_text(g.output());(ROOT/'build'/(label+'.json')).write_text(json.dumps(rows,indent=2))
finally:g.close()
