"""Real QEMU animation/performance, two-window and responsiveness integration test."""
import json
import re
import statistics
import time
from qemu_driver import Guest,ROOT
from telemetry import parse_cube_stats as stats

def roi(ppm,x,y,w,h):
    magic,size,depth,data=ppm.split(b'\n',3)
    width,height=map(int,size.split());assert magic==b'P6' and depth==b'255'
    return b''.join(data[((y+j)*width+x)*3:((y+j)*width+x+w)*3] for j in range(h))

g=Guest();result={}
try:
    g.app(1);g.wait('DEMO: opened-from-dock')
    before=g.screenshot('cube-warmup.ppm')
    g.wait('CUBE_STATS',10);time.sleep(.2)
    a=g.screenshot('cube-a.ppm');time.sleep(.3);b=g.screenshot('cube-b.ppm')
    assert roi(a,684,169,512,324)!=roi(b,684,169,512,324),'cube did not animate'
    assert roi(before,684,502,490,20)!=roi(b,684,502,490,20),'FPS label did not change from measuring state'
    print('PASS: cube pixels animate and measured FPS text updates',flush=True)
    time.sleep(2)
    # Cross-check timer FPS against elapsed host wall time, with no injected pause.
    previous=len(stats(g.output()));arrivals=[]
    deadline=time.monotonic()+5
    while time.monotonic()<deadline and len(arrivals)<4:
        samples=stats(g.output())
        if len(samples)>previous:
            arrivals.append((time.monotonic(),samples[-1]['frames']));previous=len(samples)
        time.sleep(.005)
    assert len(arrivals)>=3
    result['host_wall_fps']=(arrivals[-1][1]-arrivals[0][1])/(arrivals[-1][0]-arrivals[0][0])
    samples=stats(g.output())[1:]
    result['steady_fps']=[s['fps10']/10 for s in samples]
    result['steady_frame_us']=[s['frame_us'] for s in samples]
    result['steady_work_us']=[s['render_us']+s['compose_us']+s['upload_us'] for s in samples]
    assert min(result['steady_fps'])>10,'unexpectedly stalled animation'
    print('Measured steady FPS:',result['steady_fps'],'host wall:',round(result['host_wall_fps'],2),flush=True)
    # Drag Demo, maximize it, restore it; both apps remain registered/open.
    g.move(950,137);g.button(True);g.move(900,197);g.button(False)
    g.wait('DEMO_POSITION: 610,175')
    g.click(677,197);g.wait('DEMO: maximized');time.sleep(2)
    g.screenshot('cube-maximized.ppm')
    g.click(67,54);g.wait('DEMO: restored')
    # No keys should leak from focused Demo into Terminal's input.
    g.type('ignored');g.click(200,300)
    latencies=[]
    for i in range(12):
        cmd='echo Live_'+str(i);start=len(g.output());g.type(cmd)
        t=time.monotonic();g.key('ret');g.wait('\nLive_'+str(i)+'\n',start=start)
        latencies.append((time.monotonic()-t)*1000)
    result['enter_latency_ms']=latencies
    assert max(latencies)<500,latencies
    g.command('uname','Slopix x86_64');g.command('meminfo','Kernel heap active')
    g.command('version','Slopix 0.9');g.command('uptime','Uptime:')
    # Drag Terminal while the other app continues to animate.
    start=len(g.output());g.move(350,177);g.button(True);g.move(380,207);g.button(False)
    g.wait('POSITION: 90,185',start=start)
    g.command('echo Both_apps_work!','\nBoth_apps_work!\n');g.screenshot('desktop.ppm')
    # Cover Demo completely with maximized Terminal: animation work must pause.
    g.key('f11');g.wait('WINDOW: maximized');time.sleep(.1)
    count=len(stats(g.output()));time.sleep(1.2);assert len(stats(g.output()))==count
    g.key('f11');g.wait('WINDOW: restored');g.wait('CUBE_STATS',start=len(g.output()),timeout=3)
    # Close/reopen Terminal without stopping Demo.
    g.click(113,207);g.wait('WINDOW: closed')
    g.app(0);g.wait('WINDOW: opened-from-dock');g.command('echo Terminal_back','\nTerminal_back\n')
    # Bring Demo to front, close it, verify it stops rendering, reopen it.
    g.click(1100,300);g.click(633,197);g.wait('DEMO: closed')
    time.sleep(.1);count=len(stats(g.output()));time.sleep(1.2);assert len(stats(g.output()))==count
    g.app(1);g.wait('DEMO: opened-from-dock',start=len(g.output())-80)
    g.wait('CUBE_STATS',start=len(g.output()),timeout=3)
    # Minimize and reopen Demo, then test its keyboard maximize toggle.
    g.click(655,197);g.wait('DEMO: minimized');g.app(1)
    start=len(g.output());g.key('f11');g.wait('DEMO: maximized',start=start)
    start=len(g.output());g.key('f11');g.wait('DEMO: restored',start=start)
    time.sleep(1.2);g.screenshot('cube-final.ppm')
    assert 'PS2_RING_OVERFLOW' not in g.output()
    assert 'PANIC:' not in g.output()
    result['all_stats']=stats(g.output())
    (ROOT/'build/cube-test.log').write_text(g.output())
    (ROOT/'build/performance.json').write_text(json.dumps(result,indent=2))
    print('PASS: two app focus/stacking; both drags; Demo maximize/restore/close/minimize/reopen; occlusion pause; Terminal commands while animated',flush=True)
    print('Enter latency range (host ms):',round(min(latencies),2),round(max(latencies),2),flush=True)
finally:g.close()
