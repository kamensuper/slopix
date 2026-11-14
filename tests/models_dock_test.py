"""Real guest rendering, model controls and animated Dock hit testing."""
import json,re,time
from qemu_driver import Guest,ROOT
from telemetry import parse_cube_stats

g=Guest();result={}
try:
    # SlopDE 2 uses native-size panel buttons and hover icon emphasis.
    def panel(ppm):
        _,size,_,data=ppm.split(b'\n',3);w,h=map(int,size.split())
        return b''.join(data[((h-48+y)*w+52)*3:((h-48+y)*w+724)*3] for y in range(48))
    g.move(1000,650);time.sleep(.3);base=g.screenshot('panel-normal.ppm')
    g.move(106,776);hover=g.screenshot('panel-hover.ppm')
    assert panel(base)!=panel(hover),'panel hover has no visible feedback'
    g.app(0);g.wait('WINDOW: opened-from-dock')
    g.move(1000,650);restored=g.screenshot('panel-restored.ppm')
    assert panel(base)==panel(restored),'panel hover did not restore'
    g.app(1);g.wait('DEMO: opened-from-dock');g.move(1100,650)
    for i,name in enumerate(['Cube','Teapot','Circle','Torus']):
        start=len(g.output());g.key(str(i+1));g.wait('MODEL: '+name,start=start)
        g.wait('CUBE_STATS',5,start);time.sleep(1.1)
        a=g.screenshot('model-'+name.lower()+'.ppm');time.sleep(.25);b=g.screenshot('model-'+name.lower()+'-motion.ppm')
        def roi(ppm):
            _,size,_,data=ppm.split(b'\n',3);w,h=map(int,size.split())
            return b''.join(data[((169+j)*w+684)*3:((169+j)*w+1196)*3] for j in range(324))
        assert roi(a)!=roi(b),name+' not animated'
        samples=parse_cube_stats(g.output()[start:]);assert samples and min(s['fps10'] for s in samples)>100
        result[name]=samples
    # Clicking the footer also selects models.
    start=len(g.output());g.click(815,553);g.wait('MODEL: Teapot',start=start)
    # Maximized work area now reserves the Dock; launching remains accessible.
    g.key('f11');g.wait('DEMO: maximized');time.sleep(.3)
    start=len(g.output());g.app(0);g.wait('WINDOW: opened-from-dock',start=start)
    g.app(1);g.key('f11');g.wait('DEMO: restored')
    (ROOT/'build/models-dock-test.log').write_text(g.output());(ROOT/'build/models-performance.json').write_text(json.dumps(result,indent=2))
    print('PASS: panel hover feedback, fixed launch hitboxes, restoration, occlusion; all four models animate with updating FPS; keyboard and mouse model selection',flush=True)
finally:g.close()
