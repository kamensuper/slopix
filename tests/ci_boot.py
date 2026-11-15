#!/usr/bin/env python3
"""Headless boot test for CI.

Boots build/slopix.iso in QEMU (TCG, no disk, no display) and watches the
serial log. It passes only when the guest kernel itself prints
INTERACTIVE_DESKTOP_READY; a running QEMU process is not treated as success.
It fails on a kernel panic or CPU fault message, on an early QEMU exit, or on
timeout. The serial log is kept in ci-logs/ for the workflow to upload.

Usage: python3 tests/ci_boot.py [--timeout SECONDS]
"""
import argparse
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
LOGDIR = ROOT / 'ci-logs'
SUCCESS = 'INTERACTIVE_DESKTOP_READY'
FAILURES = ('PANIC:', 'FAULT vector=', 'invalid user trap context')


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--timeout', type=int, default=240)
    args = parser.parse_args()

    iso = ROOT / 'build' / 'slopix.iso'
    if not iso.exists():
        print('FAIL: build/slopix.iso does not exist; run make first')
        return 2
    LOGDIR.mkdir(exist_ok=True)
    serial = LOGDIR / 'boot-serial.log'
    serial.write_text('')
    cmd = ['qemu-system-x86_64', '-machine', 'pc', '-accel', 'tcg', '-cpu', 'qemu64',
           '-m', '256', '-vga', 'std', '-nic', 'none', '-display', 'none',
           '-no-reboot', '-cdrom', str(iso), '-boot', 'd',
           '-serial', 'file:' + str(serial)]
    print('+', ' '.join(cmd), flush=True)
    qemu = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    started = time.monotonic()
    verdict, reason = 'FAIL', 'timed out after %d s without %s' % (args.timeout, SUCCESS)
    try:
        while time.monotonic() - started < args.timeout:
            text = serial.read_text(errors='replace')
            hit = next((m for m in FAILURES if m in text), None)
            if hit:
                verdict, reason = 'FAIL', 'guest reported %r' % hit
                break
            if SUCCESS in text:
                verdict, reason = 'PASS', 'desktop ready after %.1f s' % (time.monotonic() - started)
                break
            if qemu.poll() is not None:
                verdict, reason = 'FAIL', 'QEMU exited early with status %s' % qemu.returncode
                break
            time.sleep(0.5)
    finally:
        if qemu.poll() is None:
            qemu.kill()
        qemu_out = qemu.communicate(timeout=30)[0].decode(errors='replace')
        (LOGDIR / 'boot-qemu.log').write_text(qemu_out)
    text = serial.read_text(errors='replace')
    print('---- last 40 serial lines ----')
    print('\n'.join(text.splitlines()[-40:]))
    print('BOOT_TEST: %s (%s)' % (verdict, reason))
    return 0 if verdict == 'PASS' else 1


if __name__ == '__main__':
    sys.exit(main())
