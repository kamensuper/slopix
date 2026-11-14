#!/usr/bin/env python3
"""Checkpoint 07 ABI guard: the kernel header and the userspace libc header
must agree, and every syscall the libc can issue must be dispatched.

This is a static test. It exists because a numbering drift between
`sdk/slopix.h` (kernel) and `sdk/libc/include/syscall.h` (libc) is invisible
until something silently returns -ENOSYS at runtime.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def enum_values(text, name):
    body = re.search(r"enum\s*\{(.*?)\}", text, re.S)[1]
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)
    body = re.sub(r"//.*", "", body)
    values, nxt = {}, 1
    for item in body.split(","):
        item = item.strip()
        if not item:
            continue
        if "=" in item:
            key, raw = item.split("=", 1)
            nxt = int(raw.strip(), 0)
        else:
            key = item
        values[key.strip()] = nxt
        nxt += 1
    return {k: v for k, v in values.items() if k.startswith("SX_")}


sdk = (ROOT / "sdk/slopix.h").read_text()
libc = (ROOT / "sdk/libc/include/syscall.h").read_text()
unistd = (ROOT / "sdk/libc/include/unistd.h").read_text()
kernel = (ROOT / "src/user/process.c").read_text()

sdk_values = enum_values(sdk, "sdk")
libc_values = enum_values(libc, "libc")

assert sdk_values, "no SX_* enumerators found in sdk/slopix.h"
assert libc_values, "no SX_* enumerators found in sdk/libc/include/syscall.h"

missing = sorted(set(libc_values) - set(sdk_values))
assert not missing, f"libc defines syscalls the kernel header does not: {missing}"

drift = {k: (v, sdk_values[k]) for k, v in libc_values.items() if v != sdk_values[k]}
assert not drift, f"syscall numbers drifted (name: libc vs kernel): {drift}"

undispatched = [k for k in libc_values if not re.search(r"case\s+" + k + r"\s*:", kernel)]
assert not undispatched, f"libc can issue syscalls the kernel never dispatches: {undispatched}"

# The descriptor space is shared too: libc validates against these numbers and
# the kernel hands them out.
def macro(text, name):
    return int(re.search(r"#define\s+" + name + r"\s+(\d+)", text)[1])


def macro_maybe(text, name):
    found = re.search(r"#define\s+" + name + r"\s+(\d+)", text)
    return int(found[1]) if found else None


for name in ("SX_FD_BASE", "SX_FD_MAX"):
    assert macro(sdk, name) == macro(libc, name), f"{name} differs between kernel and libc"

fd_base = macro(sdk, "SX_FD_BASE")
assert re.search(r"#define\s+FD_BASE\s+" + str(fd_base) + r"u?\b", kernel), \
    "kernel FD_BASE does not match the ABI"
assert re.search(r"#define\s+FD_MAX\s+" + str(macro(sdk, "SX_FD_MAX")) + r"u?\b", kernel), \
    "kernel FD_MAX does not match the ABI"

# CP07 scheduler surface: policies and the syscalls the kernel implements.
for sym in ("SX_SCHED_PARAM", "SX_FUTEX", "SX_TLS_BASE", "SX_CLOCK_GET"):
    assert sym in sdk_values, f"missing CP07 syscall {sym}"
assert "SX_TLS_BASE" in libc_values, "libc cannot set a TLS base"

for policy, sdk_name in (("SCHED_OTHER", "SX_SCHED_OTHER"),
                         ("SCHED_FIFO", "SX_SCHED_FIFO"),
                         ("SCHED_RR", "SX_SCHED_RR"),
                         ("SCHED_DEADLINE", "SX_SCHED_DEADLINE")):
    assert sdk_name in sdk, f"missing {sdk_name} in sdk/slopix.h"
    kernel_policy = "POLICY_" + policy.split("_", 1)[1]
    assert re.search(r"\b" + kernel_policy + r"\b", kernel), f"kernel does not implement {kernel_policy}"
    assert macro_maybe(unistd, policy) == macro_maybe(sdk, sdk_name), \
        f"{policy} value differs between libc and sdk/slopix.h"

ld = (ROOT / "sdk/libc/user.ld").read_text()
phdrs = re.search(r"PHDRS\s*\{(.*?)\}", ld, re.S)[1]
segments = re.findall(r"(\w+)\s+(\w+)", re.sub(r"/\*.*?\*/", "", phdrs, flags=re.S))
assert segments, "user.ld declares no program headers"
bad = [(n, t) for n, t in segments if t != "PT_LOAD"]
assert not bad, f"libc/user.ld emits headers the kernel rejects: {bad}"
# TLS sections must be folded into .data/.bss instead of becoming an output
# section (which is what makes the linker emit PT_TLS).
assert re.search(r"\.data\s*:\s*\{[^}]*\*\(\.tdata\)", ld), "user.ld must fold .tdata into .data"
assert re.search(r"\.bss\s*:\s*\{[^}]*\*\(\.tbss\)", ld), "user.ld must fold .tbss into .bss"

print("CP07_ABI_OK "
      f"({len(libc_values)} syscalls, fd base {fd_base}, policies "
      "OTHER/FIFO/RR/DEADLINE, no PT_TLS)")
