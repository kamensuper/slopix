"""Run every required existing regression; fail without hiding or retrying failures."""
import subprocess,time,json,hashlib,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];iso=ROOT/'build/slopix.iso';before=hashlib.sha256(iso.read_bytes()).hexdigest();results=[]
cmds=[['make','memory-test','renderer-test','graphics-resize-test','runtime-test','doom-compat-test','audio-test','doom-sound-test','preferences-test','perf-test'],*([ 'python3','tests/'+p] for p in ['icon_test.py','telemetry.py','smoke.py','clock_test.py','memory_guest_test.py','input_regression_test.py','window_test.py','terminal_test.py','cube_test.py','models_dock_test.py','doom_test.py','audio_guest_test.py','doom_audio_test.py','display_test.py','display_fallback_test.py','storage_host_test.py','storage_interop_test.py','storage_safety_guest_test.py','storage_guest_test.py','reboot_test.py','utilities_guest_test.py','preferences_storage_test.py'])]
if '--resume' in sys.argv:
 prior=json.loads((ROOT/'build/release085-results.json').read_text());assert prior['iso_sha256']==before
 for row in prior['results']:
  if row['exit_code']!=0:break
  assert row['command']==cmds[len(results)];results.append(row)
 print('Retained passed checks on identical ISO:',len(results),flush=True)
for i,cmd in enumerate(cmds):
 if i<len(results):continue
 t=time.monotonic();p=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True);duration=time.monotonic()-t
 (ROOT/'build'/f'release085-{i:02}.log').write_text(p.stdout+p.stderr);results.append({'command':cmd,'seconds':duration,'exit_code':p.returncode});print(cmd[-1],p.returncode,round(duration,2),flush=True)
 (ROOT/'build/release085-results.json').write_text(json.dumps({'iso_sha256':before,'results':results},indent=2))
 if p.returncode:print((p.stdout+p.stderr)[-2500:],flush=True);raise SystemExit(p.returncode)
assert before==hashlib.sha256(iso.read_bytes()).hexdigest();print('PASS: all required checks on unchanged packaged ISO',before,flush=True)
