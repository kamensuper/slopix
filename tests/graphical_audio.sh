#!/bin/sh
# Virtual X11 + a real PulseAudio server, all in one test namespace.
# No physical screen or speakers are implied by this automation.
set -eu
cd "$(dirname "$0")/.."
probe_dir=$(mktemp -d /tmp/slopix-graphical-XXXXXX)
export XDG_RUNTIME_DIR="$probe_dir"
cat > "$probe_dir/server.pa" <<'EOF'
load-module module-null-sink sink_name=slopix_test rate=22050 channels=1
set-default-sink slopix_test
load-module module-native-protocol-tcp listen=127.0.0.1 port=47139 auth-anonymous=1
EOF
x_number=$((200 + $$ % 2000))
while [ -e "/tmp/.X${x_number}-lock" ]; do x_number=$((x_number + 1)); done
export DISPLAY="127.0.0.1:$x_number" PULSE_SERVER=tcp:127.0.0.1:47139
Xvfb ":$x_number" -screen 0 1920x1080x24 -ac -pn -listen tcp -nolisten unix > build/gtk-xvfb.log 2>&1 &
x_pid=$!
pulseaudio -n --daemonize=no --exit-idle-time=-1 --disable-shm=1 --use-pid-file=no --file="$probe_dir/server.pa" > build/gtk-pulse.log 2>&1 &
pulse_pid=$!
rec_pid=
trap 'kill "$x_pid" "$pulse_pid" ${rec_pid:-} 2>/dev/null || true; rm -rf "$probe_dir"' EXIT
python3 - <<'PY'
import time,subprocess,os
from PIL import ImageGrab
for _ in range(50):
 try:
  ImageGrab.grab(xdisplay=os.environ['DISPLAY'])
  if subprocess.run(['pactl','info'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:break
 except OSError:pass
 time.sleep(.1)
else:raise SystemExit('Virtual display/audio server failed')
PY
parec --device=slopix_test.monitor --format=s16le --rate=22050 --channels=1 > build/gtk-pulse.raw 2> build/gtk-parec.log &
rec_pid=$!
QEMU_DISPLAY="${QEMU_DISPLAY:-sdl}" AUDIO_BACKEND=pa python3 "${GRAPHICAL_TEST:-tests/audio_deadline_probe.py}"
kill "$rec_pid"
wait "$rec_pid" 2>/dev/null || true
rec_pid=
python3 - <<'PY'
from pathlib import Path
import array
raw=Path('build/gtk-pulse.raw').read_bytes();a=array.array('h');a.frombytes(raw[:len(raw)//2*2])
assert len(a)>22050 and any(a),'No audible PCM samples reached PulseAudio monitor'
print('PulseAudio monitor samples:',len(a),'peak:',max(abs(v) for v in a))
PY
