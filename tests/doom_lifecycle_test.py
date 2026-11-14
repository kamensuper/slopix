"""Guest regression: close ends a session; reopen starts fresh; minimize resumes."""
import re,time
from qemu_driver import Guest,ROOT

def samples(g):
    out=g.output();out=out[:out.rfind('\n')+1]
    return [{k:int(v) for k,v in re.findall(r'(\w+)=(-?\d+)',line)}
            for line in out.splitlines() if line.startswith('DOOM_STATS ')]
def after(g,count,predicate=lambda s:True):
    end=time.monotonic()+12
    while time.monotonic()<end:
        s=samples(g)
        assert 'DOOM_ERROR:' not in g.output(),g.output()[-2000:]
        if len(s)>count and predicate(s[-1]):return s[-1]
        time.sleep(.04)
    raise AssertionError(g.output()[-2500:])
def hold(g,key,down):
    g.event([{'type':'key','data':{'down':down,'key':{'type':'qcode','data':key}}}])
g=Guest()
try:
    g.app(2);g.wait('DOOM_READY',30);g.move(1100,650)
    g.key('esc');time.sleep(.2)
    for _ in range(3):g.key('ret');time.sleep(.25)
    first=after(g,0,lambda s:s['state']==0 and s['health']>0)
    hold(g,'ctrl',True);time.sleep(1.3);hold(g,'ctrl',False)
    spent=after(g,len(samples(g))-1,lambda s:s['ammo']<50)
    heaps=[]
    for cycle in range(4):
        # Original Doom window x550,y80; close is the first titlebar button.
        hold(g,'right',True);time.sleep(.15)
        start=len(g.output());g.click(573,102);hold(g,'right',False)
        g.wait('DOOM_SESSION_CLOSED',start=start)
        count=len(samples(g));time.sleep(1.3)
        assert len(samples(g))==count,'closed engine continued ticking'
        start=len(g.output());g.app(2);g.wait('DOOM_SESSION_FRESH',start=start);g.move(1100,650)
        fresh=after(g,count,lambda s:s['state']==0)
        assert fresh['ammo']==50 and fresh['health']==100,fresh
        assert (fresh['x'],fresh['y'])==(first['x'],first['y']),(fresh,first)
        heaps.append(fresh['heap'])
        settled=after(g,len(samples(g)))
        assert settled['angle']==fresh['angle'],'turn input survived close'
    assert len(set(heaps))==1,('repeated reopen grew heap',heaps)
    before=samples(g)[-1]
    g.click(595,102);g.wait('DOOM: minimized');count=len(samples(g));time.sleep(1.3)
    assert len(samples(g))==count
    g.app(2);g.move(1100,650);resumed=after(g,count)
    assert resumed['ammo']==before['ammo'] and resumed['heap']==before['heap']
    assert g.output().count('DOOM_READY')==1
    assert 'PANIC:' not in g.output() and 'FAULT vector=' not in g.output()
    (ROOT/'build/doom-lifecycle-test.log').write_text(g.output())
    print('PASS: closed sessions stop; four reopens reset player/input with stable heap; minimize resumes')
finally:g.close()
