"""Original Slopix utility artwork; generated at 256px and filtered by build_icons."""
from pathlib import Path
from PIL import Image,ImageDraw
p=Path(__file__).resolve().parents[1]/'assets/icons/source'
for name in ['find','settings']:
 im=Image.new('RGBA',(256,256));d=ImageDraw.Draw(im)
 d.rounded_rectangle((12,12,244,244),radius=52,fill='#203554',outline='#91b2d2',width=5)
 if name=='find':
  d.ellipse((48,40,177,169),fill='#386584',outline='#a4e8db',width=16);d.line((160,154,210,207),fill='#a4e8db',width=25);d.arc((71,63,151,143),190,260,fill='#d8ffff',width=7)
 else:
  for y,x in [(73,93),(128,166),(183,114)]:
   d.line((48,y,208,y),fill='#adbed5',width=11);d.rounded_rectangle((x-14,y-24,x+14,y+24),8,fill='#a4e8db',outline='#d8ffff',width=3)
 im.save(p/(name+'-256.png'))
