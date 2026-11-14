#!/usr/bin/env python3
"""Checkpoint 07 acceptance test: userspace libc + CP07 scheduler.

Runs on QEMU with a freshly created FAT32 data disk. Since CP06 all desktop
input is gated behind the first-run account wizard, so the test performs the
setup, unlocks, and then drives the Ring-3 terminal (TERM.ELF) with `run`.

LIBCDEMO.ELF is a normal C program linked against sdk/libc. It reports through
the serial console, so this test can assert that:

  * formatted output, malloc/strdup/calloc and string helpers work
  * buffered FILE I/O over FAT32 works, including fseek(SEEK_END)/ftell
  * errno, clock_gettime, sched_param(DEADLINE) and futex timeouts work
  * the kernel really applied SCHED_DEADLINE (policy=deadline, prio=28)
  * the scheduler keeps making progress and preempts a spinning task
  * repeated runs map the same number of pages (no address-space leak)
"""
import re
import subprocess
import tempfile
import time
from pathlib import Path
from qemu_driver import Guest, ROOT

ACCOUNT = "slopix"
PASSWORD = "slopix123"
APPS = ("TERM.ELF", "LIBCDEMO.ELF", "HELLO.ELF")


def check(condition, message):
    if not condition:
        raise AssertionError(message)


with tempfile.TemporaryDirectory(dir=ROOT / "build") as tmp:
    disk = Path(tmp) / "cp07-user.img"
    subprocess.run(["python3", str(ROOT / "tools/create_disk.py"), str(disk)], check=True)
    subprocess.run(["make", "-C", str(ROOT / "sdk")], check=True)
    for name in APPS:
        subprocess.run(["mcopy", "-i", str(disk), str(ROOT / "sdk" / name), f"::{name}"],
                       check=True)

    g = Guest(["-drive", f"file={disk},format=raw,if=ide,index=0,media=disk"])
    try:
        g.wait("USERSPACE_READY")
        g.wait("AUTH_SETUP_REQUIRED")
        check("EDF" in g.output(), "kernel did not report the CP07 scheduler")

        # ---- first-run assistant, then sign in -----------------------------
        # Pauses keep one field's keystrokes out of the next phase: the account
        # save pumps the desktop loop, which would otherwise consume them.
        g.key("ret")
        g.type(ACCOUNT)
        g.key("ret")
        time.sleep(0.3)
        g.type(PASSWORD)
        g.key("ret")
        time.sleep(0.3)
        g.type(PASSWORD)
        g.key("ret")
        g.wait("AUTH_ACCOUNT_SAVED", 20)
        time.sleep(0.5)
        g.type(PASSWORD)
        g.key("ret")
        g.wait("AUTH_UNLOCKED", 10)
        g.wait("TERM_RING3_LAUNCHED", 20)

        def run_demo(pid):
            """Run the libc demo and return the serial output it produced."""
            begin = len(g.output())
            g.type("run LIBCDEMO.ELF")
            g.key("ret")
            g.wait(f"PROCESS_CREATED pid={pid} ", 30, start=begin)
            g.wait(f"PROCESS_EXIT pid={pid} value=0", 40, start=begin)
            text = g.output()[begin:]
            check("LIBCDEMO FAIL" not in text, "libc demo reported a failure:\n" + text)
            check("LIBCDEMO: ok" in text, "libc demo did not finish cleanly:\n" + text)
            return text

        # ---- first run: the libc feature matrix ----------------------------
        first = run_demo(2)
        check("SCHED_DEADLINE pid=2 period_us=20000 runtime_us=4000" in first,
              "sched_param(SCHED_DEADLINE) was not applied:\n" + first)
        check("policy=deadline prio=28" in first,
              "the kernel did not switch the process to SCHED_DEADLINE:\n" + first)

        switches1, preemptions1 = map(int, re.search(
            r"SCHED switches=(\d+) preemptions=(\d+)", first).groups())
        check("deadline_misses=" in first and "max_slice_us=" in first,
              "scheduler counters are not reported:\n" + first)
        pages1 = re.search(r"PROCESS_CREATED pid=2 value=(\d+)", first).group(1)

        # ---- preemption while a Ring-3 task spins ---------------------------
        begin = len(g.output())
        g.type("run HELLO.ELF 5")      # mode 5 is an intentional busy loop
        g.key("ret")
        g.wait("PROCESS_CREATED pid=3 ", 30, start=begin)
        time.sleep(1.0)

        second = run_demo(4)
        switches2, preemptions2 = map(int, re.search(
            r"SCHED switches=(\d+) preemptions=(\d+)", second).groups())
        check(switches2 > switches1,
              f"scheduler made no progress ({switches1} -> {switches2})")
        check(preemptions2 > preemptions1,
              f"no timer preemption occurred ({preemptions1} -> {preemptions2})")

        # An identical program must receive the same number of pages: the
        # exited process released its address space instead of leaking it.
        pages2 = re.search(r"PROCESS_CREATED pid=4 value=(\d+)", second).group(1)
        check(pages1 == pages2,
              f"address space leaked between runs ({pages1} -> {pages2} pages)")

        (ROOT / "build/genesis-cp07-guest.log").write_text(g.output())
    finally:
        g.close()

print("PASS: userspace libc (printf/malloc/FILE/SEEK_END/errno/clock/futex), "
      "sched_param(DEADLINE) applied, scheduler progress + preemption, "
      "stable address-space size")
