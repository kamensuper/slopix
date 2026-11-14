"""Selected 0.8 release checks against one immutable ISO; no automatic retries."""
import hashlib,json,subprocess,sys,time
from pathlib import Path
root=Path(__file__).resolve().parents[1]
iso=root/'build/slopix.iso';digest=hashlib.sha256(iso.read_bytes()).hexdigest()
results={'iso_sha256':digest,'tests':[]}
checks=['smoke.py','display_test.py','display_fallback_test.py','window_test.py','terminal_test.py','cube_test.py','audio_guest_test.py','doom_audio_test.py']
for test in checks:
    start=time.monotonic()
    p=subprocess.run([sys.executable,str(root/'tests'/test)],cwd=root,capture_output=True,text=True,timeout=180)
    (root/'build'/('release-'+test+'.log')).write_text(p.stdout+p.stderr)
    results['tests'].append({'test':test,'seconds':round(time.monotonic()-start,3),'returncode':p.returncode})
    (root/'build/release-0.8-results.json').write_text(json.dumps(results,indent=2))
    print(('PASS' if not p.returncode else 'FAIL'),test,results['tests'][-1]['seconds'],flush=True)
    if p.returncode:
        print(p.stdout+p.stderr,flush=True);sys.exit(p.returncode)
assert hashlib.sha256(iso.read_bytes()).hexdigest()==digest,'ISO changed during validation'
print('PASS: all selected guest tests used the same ISO '+digest,flush=True)
