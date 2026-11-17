//! Bounded frame/stage telemetry (C ABI in src/perf.h). Fixed-size state, no
//! allocation; text is formatted with the kernel's `length`/`copystr`/`decimal`.
use crate::Global;
use core::ffi::{c_char, c_int};

const P_COUNT: usize = 12;
const RING: usize = 256;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct PerfValue {
    count: u64,
    total: u64,
    maximum: u64,
}

extern "C" {
    fn logstr(s: *const c_char);
    fn length(s: *const c_char) -> usize;
    fn copystr(dst: *mut c_char, src: *const c_char, cap: usize);
    fn decimal(n: u64, out: *mut c_char);
}

struct State {
    values: [PerfValue; P_COUNT],
    gaps: [[u32; RING]; 2],
    next: [usize; 2],
    count: [usize; 2],
    previous: [u64; 2],
    last_log: u64,
}

static STATE: Global<State> = Global::new(State {
    values: [PerfValue { count: 0, total: 0, maximum: 0 }; P_COUNT],
    gaps: [[0; RING]; 2],
    next: [0; 2],
    count: [0; 2],
    previous: [0; 2],
    last_log: 0,
});

#[no_mangle]
pub static mut perf_trace: c_int = 0;

const NAMES: [&[u8]; P_COUNT] = [
    b"loop\0", b"input\0", b"desktop\0", b"compose\0", b"upload\0", b"audio\0", b"doom\0",
    b"game\0", b"doom_render\0", b"cube\0", b"wait\0", b"event_queue\0",
];

#[no_mangle]
pub unsafe extern "C" fn perf_reset() {
    let s = STATE.get();
    (*s).values = [PerfValue { count: 0, total: 0, maximum: 0 }; P_COUNT];
    (*s).next = [0; 2];
    (*s).count = [0; 2];
    (*s).previous = [0; 2];
}

#[no_mangle]
pub unsafe extern "C" fn perf_record(id: u32, us: u64) {
    if id as usize >= P_COUNT {
        return;
    }
    let v = &mut (*STATE.get()).values[id as usize];
    v.count = v.count.wrapping_add(1);
    v.total = v.total.wrapping_add(us);
    if us > v.maximum {
        v.maximum = us;
    }
}

#[no_mangle]
pub unsafe extern "C" fn perf_pause(app: u32) {
    if app < 2 {
        (*STATE.get()).previous[app as usize] = 0;
    }
}

#[no_mangle]
pub unsafe extern "C" fn perf_frame(app: u32, now: u64) {
    if app > 1 {
        return;
    }
    let a = app as usize;
    let s = STATE.get();
    if (*s).previous[a] != 0 {
        let elapsed = now.wrapping_sub((*s).previous[a]);
        let gap = if elapsed > u32::MAX as u64 { u32::MAX } else { elapsed as u32 };
        let slot = (*s).next[a] % RING;
        (*s).next[a] = (*s).next[a].wrapping_add(1);
        (*s).gaps[a][slot] = gap;
        if (*s).count[a] < RING {
            (*s).count[a] += 1;
        }
    }
    (*s).previous[a] = now;
}

/// Appends `name` then the decimal `n` to the NUL-terminated line `s` (240 bytes).
unsafe fn field(s: *mut c_char, name: *const u8, n: u64) {
    let mut b = [0 as c_char; 21];
    decimal(n, b.as_mut_ptr());
    let l = length(s);
    copystr(s.add(l), name as *const c_char, 240 - l);
    let l = length(s);
    copystr(s.add(l), b.as_ptr(), 240 - l);
}

#[no_mangle]
pub unsafe extern "C" fn perf_report(line: extern "C" fn(*const c_char)) {
    let st = STATE.get();
    for i in 0..P_COUNT {
        let v = (*st).values[i];
        let mut s = [0 as c_char; 240];
        copystr(s.as_mut_ptr(), b"PERF \0".as_ptr() as *const c_char, 6);
        copystr(s.as_mut_ptr().add(5), NAMES[i].as_ptr() as *const c_char, 235);
        let p = s.as_mut_ptr();
        field(p, b" count=\0".as_ptr(), v.count);
        field(p, b" avg_us=\0".as_ptr(), if v.count != 0 { v.total / v.count } else { 0 });
        field(p, b" max_us=\0".as_ptr(), v.maximum);
        line(p);
    }
    for a in 0..2usize {
        let n = (*st).count[a];
        if n == 0 {
            continue;
        }
        let mut sorted = [0u32; RING];
        let mut sum = 0u64;
        for i in 0..n {
            sorted[i] = (*st).gaps[a][i];
            sum += sorted[i] as u64;
        }
        sorted[..n].sort_unstable();
        let tail = if n / 100 == 0 { 1 } else { n / 100 };
        let slow: u64 = sorted[n - tail..n].iter().map(|&g| g as u64).sum();
        let mut s = [0 as c_char; 240];
        copystr(s.as_mut_ptr(), b"FRAMES \0".as_ptr() as *const c_char, 8);
        let p = s.as_mut_ptr();
        field(p, b"app=\0".as_ptr(), a as u64);
        field(p, b" n=\0".as_ptr(), n as u64);
        field(p, b" fps10=\0".as_ptr(), if sum != 0 { n as u64 * 10_000_000 / sum } else { 0 });
        field(p, b" low1_fps10=\0".as_ptr(), if slow != 0 { tail as u64 * 10_000_000 / slow } else { 0 });
        field(p, b" p95_us=\0".as_ptr(), sorted[(n - 1) * 95 / 100] as u64);
        field(p, b" p99_us=\0".as_ptr(), sorted[(n - 1) * 99 / 100] as u64);
        field(p, b" max_us=\0".as_ptr(), sorted[n - 1] as u64);
        line(p);
    }
}

extern "C" fn serial_line(s: *const c_char) {
    // SAFETY: C kernel logger; `s` is a NUL-terminated buffer from perf_report.
    unsafe {
        logstr(s);
        logstr(b"\n\0".as_ptr() as *const c_char);
    }
}

#[no_mangle]
pub unsafe extern "C" fn perf_log(now: u64) {
    let s = STATE.get();
    if perf_trace != 0 && now.wrapping_sub((*s).last_log) >= 5_000_000 {
        (*s).last_log = now;
        perf_report(serial_line);
    }
}
