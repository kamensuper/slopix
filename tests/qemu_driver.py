import os
import json
import uuid
import re
import select
import subprocess
import time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class Guest:
    def __init__(self,extra_args=None):
        self.log=ROOT/('build/serial-'+uuid.uuid4().hex+'.log');self.log.unlink(missing_ok=True)
        self.serial_text=''
        # Select the requested frontend once rather than passing duplicate options.
        extra_args=list(extra_args or []);display='none'
        if '-display' in extra_args:
            at=extra_args.index('-display');display=extra_args[at+1];del extra_args[at:at+2]
        nic='none'
        if '-nic' in extra_args:
            at=extra_args.index('-nic');nic=extra_args[at+1];del extra_args[at:at+2]
        self.p=subprocess.Popen(['qemu-system-x86_64','-machine','pc','-accel','tcg','-cpu','qemu64','-m','256','-vga','std','-nic',nic,'-cdrom',os.environ.get('SLOPIX_TEST_ISO',str(ROOT/'build/slopix.iso')),'-boot','d','-display',display,'-chardev','ringbuf,id=serial0,size=1048576','-serial','chardev:serial0','-qmp','stdio','-no-reboot','-no-shutdown']+(extra_args or []),stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
        try:
            self.receive();self.request('qmp_capabilities');self.wait('INTERACTIVE_DESKTOP_READY',45)
        except BaseException:
            # A failed constructor must not leave an orphan emulator running.
            if self.p.poll() is None:
                self.p.terminate();self.p.wait(timeout=5)
            raise
        self.x,self.y=640,400
        self.key_delay=.016
    def output(self):
        self.serial_text+=self.request('ringbuf-read',{'device':'serial0','size':65536,'format':'utf8'})
        self.log.write_text(self.serial_text)
        return self.serial_text
    def receive(self):
        data=bytearray();deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            if select.select([self.p.stdout],[],[],.1)[0]:
                c=self.p.stdout.read(1)
                if not c:raise RuntimeError('QMP closed: '+self.p.stderr.read().decode())
                data.extend(c)
                if c==b'\n':return json.loads(data)
        raise RuntimeError('QMP timeout')
    def request(self,command,arguments=None):
        packet={'execute':command}
        if arguments is not None:packet['arguments']=arguments
        self.p.stdin.write((json.dumps(packet)+'\n').encode())
        while True:
            r=self.receive()
            if 'error' in r:raise RuntimeError(r)
            if 'return' in r:return r['return']
    def wait(self,needle,timeout=5,start=0):
        deadline=time.monotonic()+timeout
        while time.monotonic()<deadline:
            out=self.output()
            if 'PANIC:' in out or 'FAULT vector=' in out:raise RuntimeError(out)
            if needle in out[start:]:return
            if self.p.poll() is not None:raise RuntimeError(self.p.communicate()[1].decode())
            time.sleep(.02)
        self.screenshot('failure.ppm')
        (ROOT/'build/failure-registers.txt').write_text(self.request('human-monitor-command',{'command-line':'info registers'}))
        raise RuntimeError('Missing '+repr(needle)+'\n'+self.output()[-3000:])
    def event(self,events):self.request('input-send-event',{'events':events})
    def key(self,key,mod=None):
        events=[]
        for k in ([mod] if mod else [])+[key]:
            events.append({'type':'key','data':{'down':True,'key':{'type':'qcode','data':k}}})
        for k in [key]+([mod] if mod else []):
            events.append({'type':'key','data':{'down':False,'key':{'type':'qcode','data':k}}})
        self.event(events);time.sleep(self.key_delay)
    def type(self,text):
        punctuation={' ':'spc','.':'dot','-':'minus','/':'slash','=':'equal','_':'minus','!':'1','?':'slash',':':'semicolon'}
        for c in text:
            self.key(punctuation.get(c,c.lower()),'shift' if c.isupper() or c in '_!?:' else None)
    def command(self,text,expect=None):
        start=len(self.output());self.type(text);self.key('ret');self.wait('CMD: '+text+'\n',start=start)
        if expect:self.wait(expect,start=start)
    def move(self,x,y):
        while self.x!=x or self.y!=y:
            dx=max(-60,min(60,x-self.x));dy=max(-60,min(60,y-self.y))
            self.event([{'type':'rel','data':{'axis':'x','value':dx}},{'type':'rel','data':{'axis':'y','value':dy}}])
            self.x+=dx;self.y+=dy;time.sleep(.025)
        time.sleep(.05)
    def app(self,appid):
        raw=self.screenshot('driver-geometry.ppm');w,h=map(int,raw.split(b'\n',3)[1].split())
        self.x=min(self.x,w-1);self.y=min(self.y,h-1)
        panels=re.findall(r'PANEL_LAYOUT top=(\d+) y=(\d+) count=(\d+) button=(\d+)',self.output())
        if panels:
            top,y,count,bw=map(int,panels[-1]);assert appid<count
            self.move(w-1,33 if top else h-1);time.sleep(.2)
            details=re.findall(r'PANEL_LAYOUT .*?start=(\d+) height=(\d+)',self.output());left,ph=map(int,details[-1]) if details else (52,48)
            self.click(left+appid*bw+(bw-3)//2,y+ph//2)
        else:
            self.move(w-1,40);time.sleep(.65);self.click(w//2+(appid-2)*108,h-60)
    def button(self,down):
        self.event([{'type':'btn','data':{'down':down,'button':'left'}}]);time.sleep(.08)
    def click(self,x,y):self.move(x,y);self.button(True);self.button(False)
    def screenshot(self,name):
        time.sleep(.1);self.request('screendump',{'filename':str(ROOT/'build'/name)})
        return (ROOT/'build'/name).read_bytes()
    def close(self):
        if self.p.poll() is None:
            self.request('quit');self.p.wait(timeout=5)
        if self.p.returncode:
            raise RuntimeError(f'QEMU exited with {self.p.returncode}: '+self.p.stderr.read().decode())
