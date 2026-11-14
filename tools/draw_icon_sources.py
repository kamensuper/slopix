#!/usr/bin/env python3
"""Original, reproducible vector-style artwork rasterized into 256px RGBA PNGs."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFilter
ROOT=Path(__file__).resolve().parents[1]/'assets/icons/source'
SCALE=4; N=256*SCALE

def polygon(draw,points,fill):draw.polygon([(int(x*SCALE),int(y*SCALE)) for x,y in points],fill=fill)
def line(draw,points,fill,width):draw.line([(int(x*SCALE),int(y*SCALE)) for x,y in points],fill=fill,width=width*SCALE,joint='curve')
def tile(top,bottom):
    mask=Image.new('L',(N,N));d=ImageDraw.Draw(mask);d.rounded_rectangle((24*SCALE,16*SCALE,232*SCALE,224*SCALE),radius=48*SCALE,fill=255)
    shade=Image.new('RGBA',(N,N));shadow=Image.new('RGBA',(N,N));shadow.putalpha(mask.filter(ImageFilter.GaussianBlur(7*SCALE)).point(lambda a:a*70//255));shade.alpha_composite(shadow,(0,8*SCALE))
    face=Image.new('RGBA',(N,N));pix=face.load()
    for y in range(N):
        t=min(1,max(0,(y/SCALE-16)/208));c=tuple(round(a*(1-t)+b*t) for a,b in zip(top,bottom))+(255,)
        for x in range(N):pix[x,y]=c
    face.putalpha(mask);shade.alpha_composite(face)
    return shade

terminal=tile((60,78,108),(18,25,46));d=ImageDraw.Draw(terminal)
d.rounded_rectangle((26*SCALE,18*SCALE,230*SCALE,222*SCALE),radius=46*SCALE,outline=(190,220,255,100),width=2*SCALE)
for x,c in [(57,(255,135,138,255)),(80,(255,206,122,255)),(103,(123,223,179,255))]:d.ellipse(((x-6)*SCALE,43*SCALE,(x+6)*SCALE,55*SCALE),fill=c)
line(d,[(66,96),(102,126),(66,156)],(193,250,225,255),12)
line(d,[(123,157),(179,157)],(223,233,254,255),12)
ROOT.mkdir(parents=True,exist_ok=True)
terminal.convert('RGBa').resize((256,256),Image.Resampling.LANCZOS).convert('RGBA').save(ROOT/'terminal-256.png')

demo=tile((102,90,170),(43,45,92));d=ImageDraw.Draw(demo)
d.rounded_rectangle((26*SCALE,18*SCALE,230*SCALE,222*SCALE),radius=46*SCALE,outline=(218,210,255,110),width=2*SCALE)
polygon(d,[(128,51),(194,89),(128,128),(62,89)],(255,191,114,255))
polygon(d,[(62,89),(128,128),(128,205),(62,166)],(153,160,255,255))
polygon(d,[(128,128),(194,89),(194,166),(128,205)],(89,225,209,255))
line(d,[(62,89),(128,128),(194,89)],(237,242,255,180),2)
line(d,[(128,128),(128,205)],(230,245,255,170),2)
demo.convert('RGBa').resize((256,256),Image.Resampling.LANCZOS).convert('RGBA').save(ROOT/'demo-256.png')
print('Created original 256px PNG icon sources')

# Original Freedoom app emblem: green armored face, no proprietary game logo.
doom=tile((104,61,53),(36,29,46));d=ImageDraw.Draw(doom)
polygon(d,[(72,68),(128,43),(184,68),(194,143),(164,188),(92,188),(62,143)],(106,151,88,255))
polygon(d,[(81,86),(128,68),(175,86),(171,126),(85,126)],(28,39,35,255))
line(d,[(87,106),(111,112)],(255,193,106,255),7);line(d,[(144,112),(169,106)],(255,193,106,255),7)
polygon(d,[(94,141),(162,141),(151,172),(105,172)],(194,201,167,255))
line(d,[(114,144),(114,170)],(45,58,48,255),4);line(d,[(139,144),(139,170)],(45,58,48,255),4)
doom.convert('RGBa').resize((256,256),Image.Resampling.LANCZOS).convert('RGBA').save(ROOT/'doom-256.png')
