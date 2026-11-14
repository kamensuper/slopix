"""Steady-phase CPU measurement, idle stability and sustained guest animation.
CPU clock is the live QEMU child process's POSIX CPU clock, not /proc sampling.
All data excludes guest cold-boot/setup from the measured phase.
"""
import argparse,ctypes,importlib.util,json,re,time
from pathlib import Path
from telemetry import parse_cube_stats as stats
ROOT=Path(__file__).resolve().parents[1]
def cpu_clock(pid):
    clock=ctypes.c_int();libc=ctypes.CDLL(None)
    rc=libc.clock_getcpuclockid(ctypes.c_int(pid),ctypes.byref(clock))
    if rc:raise RuntimeError('clock_getcpuclockid failed: '+str(rc))
    return lambda:time.clock_gettime(clock.value)
def run(project,idle_seconds,animation_seconds,disk=None):
    spec=importlib.util.spec_from_file_location('guest_driver_'+project.name,project/'tests/qemu_driver.py');driver=importlib.util.module_from_spec(spec);spec.loader.exec_module(driver)
    results={}
    for mode,duration in [('idle',idle_seconds),('animated',animation_seconds)]:
        g=driver.Guest(['-drive',f'file={disk},format=raw,if=ide,index=0,media=disk'] if disk else None)
        try:
            if mode=='animated':g.app(1);g.wait('CUBE_STATS',10)
            clock=cpu_clock(g.p.pid);cpu_start=clock();start=time.monotonic();initial=g.output();initial_count=len(stats(initial));last_count=initial_count;last_command=0;latencies=[];arrivals=[(start,stats(initial)[-1]["frames"])] if mode=="animated" else []
            while time.monotonic()-start<duration:
                elapsed=time.monotonic()-start
                if mode=='animated' and elapsed>last_command+10:
                    g.click(200,300);t=time.monotonic();g.command('echo sustained_ok','\nsustained_ok\n');latencies.append(time.monotonic()-t);last_command=elapsed
                if mode=='animated':
                    samples_now=stats(g.output())
                    if len(samples_now)>last_count:
                        arrivals.append((time.monotonic(),samples_now[-1]['frames']));last_count=len(samples_now)
                time.sleep(.1)
            cpu=clock()-cpu_start;wall=time.monotonic()-start;output=g.output();samples=stats(output)[initial_count:]
            assert 'PANIC:' not in output and 'PS2_RING_OVERFLOW' not in output
            if mode!='animated':
                # Idle guest must still accept input after the quiet interval.
                g.command('echo idle_still_alive','\nidle_still_alive\n')
            results[mode]={'wall_s':wall,'qemu_cpu_s':cpu,'percent_one_core':cpu/wall*100,'samples':samples,'command_roundtrip_s':latencies,'host_frame_fps':((arrivals[-1][1]-arrivals[0][1])/(arrivals[-1][0]-arrivals[0][0]) if len(arrivals)>1 else None)}
            print(project.name,mode,'CPU % one core',round(cpu/wall*100,2),'samples',len(samples),flush=True)
            if project.resolve()==ROOT.resolve() and mode=='animated':g.screenshot('sustained.ppm')
            (ROOT/'build'/('stability-'+project.name+'-'+mode+'.log')).write_text(g.output())
            (ROOT/'build'/('stability-'+project.name+'-'+mode+'.json')).write_text(json.dumps(results[mode],indent=2))
            if mode=='animated':assert len(samples)>=max(1,int(duration)-3) and min(s['fps10'] for s in samples)>400
        finally:g.close()
    return results
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--disk',type=Path);p.add_argument('--baseline',type=Path);p.add_argument('--idle',type=float,default=15);p.add_argument('--animation',type=float,default=60);a=p.parse_args()
    results={}
    if a.baseline:results['0.3']=run(a.baseline.resolve(),a.idle,15)
    results['0.9']=run(ROOT,a.idle,a.animation,a.disk.resolve() if a.disk else None)
    (ROOT/'build/stability.json').write_text(json.dumps(results,indent=2))
    print('PASS: idle remains usable; sustained animation and periodic Terminal commands; measured process CPU excluding boot',flush=True)
