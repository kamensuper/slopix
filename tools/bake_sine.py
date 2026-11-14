from pathlib import Path
import math
values=[round(math.sin(i*2*math.pi/256)*32767) for i in range(257)]
Path(__file__).resolve().parents[1].joinpath('src/sine.h').write_text('/* Q15 sine table, generated with tools/bake_sine.py. */\nstatic const int32_t sine_table[257]={\n'+','.join(map(str,values))+'\n};\n')
