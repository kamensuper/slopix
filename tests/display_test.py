"""Real DISPI scanout geometry and native-pixel layout, not host zoom."""
import io,json,re,time
from PIL import Image
from qemu_driver import Guest,ROOT

def image(g,name):
    im=Image.open(io.BytesIO(g.screenshot(name))).convert('RGB')
    g.x=min(g.x,im.width-1);g.y=min(g.y,im.height-1)
    return im
def layout(g):
    result={}
    for line in g.output().splitlines():
        if line.startswith('DISPLAY_LAYOUT '):
            row={k:int(v) for k,v in re.findall(r'(\w+)=(\d+)',line)};result[row['id']]=row
    return result

g=Guest(['-audiodev',f'wav,id=sound0,path={ROOT/"build/display-audio.wav"}','-device','sb16,audiodev=sound0'])
results=[]
try:
    g.wait('DISPLAY_DISPI_READY');g.move(100,60)
    initial=image(g,'display-1280.ppm');assert initial.size==(1280,800)
    # Exact pixel comparison of a title button and idle Dock icon across growth.
    button=initial.crop((76,170,91,185)).tobytes()
    icon=initial.crop((57,764,81,788)).tobytes()
    g.command('echo screen_contents_survive','\nscreen_contents_survive\n')
    g.command('display 1600 900','Display mode applied')
    larger=image(g,'display-1600.ppm');assert larger.size==(1600,900)
    b=layout(g)[0];assert (b['x'],b['y'],b['w'],b['h'])==(60,155,720,460),b
    assert larger.crop((76,170,91,185)).tobytes()==button,'title controls must remain native-sized'
    assert larger.crop((57,864,81,888)).tobytes()==icon,'Dock icon must remain native-sized'
    g.key('f12');g.wait('DISPLAY_MODE 1920x1080');assert image(g,'display-1920.ppm').size==(1920,1080)
    g.key('f11');g.wait('WINDOW: maximized');g.key('f12');g.wait('DISPLAY_MODE 1024x600')
    assert image(g,'display-max-small.ppm').size==(1024,600)
    b=layout(g)[0];assert (b['x'],b['y'],b['w'],b['h'],b['max'])==(0,32,1024,516,1),b
    g.key('f11');g.command('display 1280 800','Display mode applied')
    b=layout(g)[0];assert (b['x'],b['y'],b['w'],b['h'])==(60,155,720,460),b
    for bad in ['0 0','1025 768','1920 1081']:
        g.command('display '+bad,'Display: width');assert image(g,'display-rejected.ppm').size==(1280,800)
    for _ in range(2):
        for w,h in [(1024,600),(1024,768),(1280,720),(1440,900),(1600,900),(1920,1080),(1280,800)]:
            g.command(f'display {w} {h}','Display mode applied')
            assert image(g,'display-cycle.ppm').size==(w,h)
            boxes=layout(g)
            for b in boxes.values():
                assert b['x']>=0 and b['y']>=32 and b['x']+b['w']<=w and b['y']+b['h']<=h-52,b
            results.append({'width':w,'height':h,'windows':boxes})
    g.command('display 1360 768','Display mode applied')
    assert image(g,'display-custom.ppm').size==(1360,768)
    g.command('display 1280 800','Display mode applied')
    g.click(910,15);time.sleep(.3)
    assert image(g,'display-menu.ppm').size==(1440,900)
    g.command('display 1280 800','Display mode applied')
    g.command('memtest','MEMTEST PASS')
    g.app(1);g.wait('CUBE_STATS',10)
    g.app(2);g.wait('DOOM_READY',30);time.sleep(1.2);g.key('esc');time.sleep(.2)
    for _ in range(3):g.key('ret');time.sleep(.5)
    g.wait('DOOM_SFX_STARTED',10)
    g.event([{'type':'key','data':{'down':True,'key':{'type':'qcode','data':'ctrl'}}}])
    # Keep a held game key and sound live while the desktop resolution changes.
    for w,h in [(1440,900),(1600,900),(1920,1080),(1024,600),(1024,768)]:
        g.key('f12');time.sleep(.3)
        assert image(g,"display-live.ppm").size==(w,h)
    g.event([{'type':'key','data':{'down':False,'key':{'type':'qcode','data':'ctrl'}}}])
    # Return to a known mode without routing typed commands into DOOM.
    # F12 from 1280x800 after five cycles lands at 1024x768.
    g.key('f12');time.sleep(.5);g.key('f12');time.sleep(.5)
    g.key('f12');time.sleep(.5) # 1440x900; Terminal left/bottom remains reachable
    g.click(90,320);g.command('display 1280 800','Display mode applied')
    g.command('audio info','Underruns: 0');g.wait('Device faults: 0')
    g.command('echo resized_and_alive','\nresized_and_alive\n')
    out=g.output();assert 'FAULT vector=' not in out and 'DOOM_ERROR:' not in out
    (ROOT/'build/display-test.log').write_text(out)
    (ROOT/'build/display-results.json').write_text(json.dumps(results,indent=2))
    print('PASS: actual scanout dimensions, native-pixel controls/Dock, anchors, maximize/restore, all modes/repeat, rejection, PMM exhaustion, simultaneous DOOM/cube/audio/Terminal')
finally:g.close()
