#!/usr/bin/env python3
"""Original short Slopix chime, generated offline using Python's standard library."""
import math,struct,wave
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'assets/audio/genesis.wav'
p.parent.mkdir(parents=True,exist_ok=True)
rate=22050; notes=[261.6256,329.6276,391.9954,523.2511]
samples=[]
for i in range(rate*3):
    t=i/rate;value=0
    for k,f in enumerate(notes):
        age=t-k*.24
        if 0<=age<1.8:
            envelope=min(1,age/.012)*math.exp(-3*age)*min(1,(1.8-age)/.1)
            value+=math.sin(2*math.pi*f*age)*envelope*.18
    samples.append(struct.pack('<h',max(-32768,min(32767,round(value*32767)))))
with wave.open(str(p),'wb') as w:
    w.setparams((1,2,rate,0,'NONE','not compressed'));w.writeframes(b''.join(samples))
print(p)
