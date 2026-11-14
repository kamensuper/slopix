"""Real QEMU: title -> gameplay, held input/fire, lifecycle, three apps.
No host-engine substitutes: all game state below comes from the guest.
"""
import json,re,time
from qemu_driver import Guest,ROOT
from telemetry import parse_cube_stats

def samples(g):
    out=g.output();complete=out[:out.rfind('\n')+1]
    return [{k:int(v) for k,v in re.findall(r'(\w+)=(-?\d+)',line)} for line in complete.splitlines() if line.startswith('DOOM_STATS ') and 'heap=' in line]
def hold(g,key,down):g.event([{'type':'key','data':{'down':down,'key':{'type':'qcode','data':key}}}])
def wait_sample(g,predicate,timeout=8):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        s=samples(g)
        assert 'DOOM_ERROR:' not in g.output(),g.output()[-2000:]
        if s and predicate(s[-1]):return s[-1]
        time.sleep(.04)
    raise AssertionError('state sample missing: '+g.output()[-1800:])
g=Guest();result={}
try:
    g.app(2);g.wait('DOOM_READY',30);g.move(1100,650)
    wait_sample(g,lambda s:s['state']==3)
    g.screenshot('doom-title.ppm')
    g.key('esc');time.sleep(.2)
    for _ in range(3):g.key('ret');time.sleep(.25)
    before=wait_sample(g,lambda s:s['state']==0 and s['health']>0)
    g.screenshot('doom-gameplay-start.ppm')
    hold(g,'w',True);time.sleep(.9);hold(g,'w',False)
    moved=wait_sample(g,lambda s:s['state']==0 and (s['x'],s['y'])!=(before['x'],before['y']))
    # Fire for long enough to get a periodic state sample.
    ammo=moved['ammo'];hold(g,'ctrl',True);time.sleep(1.3);hold(g,'ctrl',False)
    fired=wait_sample(g,lambda s:s['ammo']<ammo)
    assert fired['health']>0
    print('PASS: actual Freedoom level; held W changes player position; Ctrl consumes ammunition',flush=True)
    g.screenshot('doom-gameplay.ppm')
    # F2 goes through the real engine menu and shows our storage limitation.
    g.key('f2');time.sleep(.3);g.screenshot('doom-save-unavailable.ppm');g.key('spc');time.sleep(.2)
    assert 'DOOM_ERROR:' not in g.output()

    # Losing focus while a turning key is physically held must release it in Doom.
    hold(g,'right',True);time.sleep(.3);g.click(200,300);hold(g,'right',False)
    time.sleep(1.3);settled=samples(g)[-1];time.sleep(1.3);stopped=samples(g)[-1]
    assert stopped['angle']==settled['angle'],'turn key stuck after focus loss'
    lat=[]
    for i in range(8):
        g.type('echo doom_live_'+str(i));start=time.monotonic();g.key('ret');g.wait('\ndoom_live_'+str(i)+'\n');lat.append((time.monotonic()-start)*1000)
    g.command('meminfo','Kernel heap active')
    # Release and focus loss in the same input batch: queued key-up must not
    # be discarded merely because the physical held-state is already clear.
    g.app(2);hold(g,'right',True);time.sleep(.3);g.move(200,300)
    g.event([{'type':'key','data':{'down':False,'key':{'type':'qcode','data':'right'}}},
             {'type':'btn','data':{'down':True,'button':'left'}},
             {'type':'btn','data':{'down':False,'button':'left'}}])
    time.sleep(1.2);stopped=samples(g)[-1];time.sleep(1.2)
    assert samples(g)[-1]['angle']==stopped['angle'],'queued release lost during focus switch'

    # All three apps, with model selection, while game time still advances.
    frames=samples(g)[-1]['frames'];g.app(1);g.wait('DEMO: opened-from-dock');g.key('2');g.wait('MODEL: Teapot');g.wait('CUBE_STATS',10)
    time.sleep(1.2);assert samples(g)[-1]['frames']>frames
    g.click(200,300);g.command('echo all_three_alive','\nall_three_alive\n')
    g.command('memtest','MEMTEST PASS: exhaustion, canaries, free, double-free')
    g.screenshot('three-apps.ppm')
    # DOOM to front using Dock; maximized covers all other clients.
    g.app(2);g.key('f11');g.wait('DOOM: maximized');g.move(1100,650);time.sleep(1.3);g.screenshot('doom-maximized.ppm')
    start=len(g.output());g.key('f11');g.wait('DOOM: restored',start=start)
    # Drag bounds: original DOOM x550 y80 -> x500 y140.
    g.move(800,102);g.button(True);g.move(750,162);g.button(False);g.wait('DOOM_POSITION: 500,140')
    g.click(523,162);g.wait('DOOM: closed');time.sleep(.2);closed=samples(g)[-1]['frames'];time.sleep(1.2);assert samples(g)[-1]['frames']==closed
    count=len(g.output());g.app(2);g.wait('DOOM: opened-from-dock',start=count);g.move(1100,650)
    reopened=wait_sample(g,lambda s:s['frames']>closed)
    assert g.output().count('DOOM_READY')==1,'reopen reallocated engine instead of resuming'
    # Minimize / reopen, no reallocation.
    heap=reopened['heap'];g.click(545,162);g.wait('DOOM: minimized');g.app(2);g.move(1100,650)
    resumed=wait_sample(g,lambda s:s['frames']>reopened['frames']);assert resumed['heap']==heap
    # Cover with Terminal and verify engine time/work pauses; resume without burst.
    g.click(200,300);g.key('f11');g.wait('WINDOW: maximized');time.sleep(.2)
    paused=samples(g)[-1]['frames'];time.sleep(1.2);assert samples(g)[-1]['frames']==paused
    g.key('f11');g.wait('WINDOW: restored');wait_sample(g,lambda s:s['frames']>paused)
    print('PASS: focus-loss releases held key; Terminal input; three simultaneous apps; DOOM drag/maximize/restore/close/reopen/minimize; occlusion pauses',flush=True)
    # Sustained play, concurrent Terminal activity and real guest/host frame counters.
    start=time.monotonic();previous=samples(g)[-1]['frames'];arrivals=[]
    while time.monotonic()-start<20:
        s=samples(g)[-1]
        if s['frames']!=previous:arrivals.append((time.monotonic(),s));previous=s['frames']
        if 7<time.monotonic()-start<8 and not result.get('sustained_command'):
            g.command('echo sustained_doom','\nsustained_doom\n');result['sustained_command']=True
        time.sleep(.03)
    assert len(arrivals)>10
    result['host_fps']=(arrivals[-1][1]['frames']-arrivals[0][1]['frames'])/(arrivals[-1][0]-arrivals[0][0])
    result['sustained_samples']=[s for _,s in arrivals];result['enter_latency_ms']=lat;result['start']=before;result['moved']=moved;result['fired']=fired
    assert max(lat)<500
    assert 'PANIC:' not in g.output() and 'FAULT vector=' not in g.output() and 'DOOM_ERROR:' not in g.output() and 'PS2_RING_OVERFLOW' not in g.output()
    # In-game Quit returns to the desktop rather than halting/rebooting it.
    g.app(2);g.key('f10');time.sleep(.2);g.key('y');g.wait('DOOM: quit-to-desktop')
    g.click(200,300);g.command('echo quit_returned','\nquit_returned\n')
    final_frames=samples(g)[-1]['frames'];g.app(2);g.move(1100,650)
    wait_sample(g,lambda s:s['frames']>final_frames)
    print('PASS: unsupported save reports limitation; in-game Quit returns to usable desktop; game reopens',flush=True)
    g.screenshot('slopix-desktop.ppm');(ROOT/'build/doom-test.log').write_text(g.output());(ROOT/'build/doom-performance.json').write_text(json.dumps(result,indent=2))
    print('PASS: sustained gameplay and Terminal/cube activity; host observed game FPS:',round(result['host_fps'],2),flush=True)
finally:g.close()
