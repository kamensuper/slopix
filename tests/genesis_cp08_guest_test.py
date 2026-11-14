#!/usr/bin/env python3
"""Checkpoint 08 acceptance test: SSE2 bulk primitives and FPU/SSE context.

Boots a disposable FAT32 disk, performs the first-run account wizard, unlocks
the desktop and drives the Ring-3 terminal (as CP07 did). Then it runs:

  * LIBCDEMO.ELF - the CP07 libc/scheduler matrix, still green.
  * BENCH.ELF    - measures SSE2 memcpy/memset throughput, syscall cost and,
                   most importantly, proves the kernel keeps each process's
                   SSE state: the parent holds a marker in xmm5 across a
                   blocking syscall while its child floods all 16 XMM
                   registers, and the child does the same with xmm6.
                   A shared or missing FXSAVE area makes one of them fail.
"""
import re
import subprocess
import tempfile
import time
from pathlib import Path
from qemu_driver import Guest, ROOT

ACCOUNT = "slopix"
PASSWORD = "slopix123"
APPS = ("TERM.ELF", "LIBCDEMO.ELF", "BENCH.ELF", "HELLO.ELF")


def check(condition, message):
    if not condition:
        raise AssertionError(message)


with tempfile.TemporaryDirectory(dir=ROOT / "build") as tmp:
    disk = Path(tmp) / "cp08-user.img"
    subprocess.run(["python3", str(ROOT / "tools/create_disk.py"), str(disk)], check=True)
    subprocess.run(["make", "-C", str(ROOT / "sdk")], check=True)
    for name in APPS:
        subprocess.run(["mcopy", "-i", str(disk), str(ROOT / "sdk" / name), f"::{name}"],
                       check=True)

    g = Guest(["-drive", f"file={disk},format=raw,if=ide,index=0,media=disk"])
    try:
        g.wait("USERSPACE_READY")
        g.wait("AUTH_SETUP_REQUIRED")

        # ---- first-run assistant, then sign in -----------------------------
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

        def run(prog, pid, timeout=90):
            begin = len(g.output())
            g.type(f"run {prog}")
            g.key("ret")
            g.wait(f"PROCESS_CREATED pid={pid} ", 30, start=begin)
            g.wait(f"PROCESS_EXIT pid={pid} value=0", timeout, start=begin)
            return g.output()[begin:]

        # ---- CP07 regression: libc + scheduler still work ------------------
        demo = run("LIBCDEMO.ELF", 2)
        check("LIBCDEMO FAIL" not in demo, "libc demo reported a failure:\n" + demo)
        check("LIBCDEMO: ok" in demo, "libc demo did not finish cleanly:\n" + demo)
        check("policy=deadline prio=28" in demo, "SCHED_DEADLINE was not applied:\n" + demo)

        # ---- CP08: SSE2 throughput and cross-process SSE state -------------
        bench = run("BENCH.ELF", 3)
        check("BENCH start" in bench, "benchmark did not start:\n" + bench)
        check("BENCH worker spawn failed" not in bench, "the benchmark could not spawn its worker:\n" + bench)
        check("BENCH worker BAD" not in bench, "the worker lost its SSE state:\n" + bench)
        check("BENCH worker ok" in bench, "the worker never confirmed its SSE state:\n" + bench)
        check("BENCH fpu BAD" not in bench, "the parent lost its SSE state:\n" + bench)
        check("BENCH fpu ok" in bench, "the parent never confirmed its SSE state:\n" + bench)
        check("BENCH: ok" in bench, "benchmark did not finish cleanly:\n" + bench)

        numbers = re.findall(r"BENCH mem(?:cpy|set) \w+=(\d+) MB/s", bench)
        check(len(numbers) >= 4, "missing throughput measurements:\n" + bench)
        check(all(int(n) > 0 for n in numbers), "throughput measured as zero:\n" + bench)
        check("BENCH roundtrip=" in bench, "missing syscall round-trip measurement:\n" + bench)

        check("PROCESS_CREATED pid=4 " in bench, "the worker process was not created:\n" + bench)
        check("PROCESS_EXIT pid=4 value=0" in bench, "the worker process did not exit cleanly:\n" + bench)

        # The mp/s numbers and the child's verdict are printed to serial; keep
        # a log so a slower or faster machine is easy to compare later.
        (ROOT / "build/genesis-cp08-guest.log").write_text(g.output())
        print(bench.strip())
    finally:
        g.close()

print("PASS: SSE2 memcpy/memset throughput, syscall cost, and per-process "
      "SSE state preserved across preemption (parent xmm5 + worker xmm6)")
