//! Kernel heap (C ABI in src/heap.h): contiguous PMM page spans carved into
//! 16-byte-aligned blocks. Main thread only, never IRQ.
//!
//! Each block starts with a 32-byte header. Headers are only followed after a
//! span-registry membership check, so arbitrary frees never dereference user
//! input. Audio is serviced at checkpoints, which may re-enter the heap; at
//! those points no metadata pointer is live, and pages acquired but not yet
//! published stay privately owned by the interrupted transaction.
use crate::Global;
use core::mem::size_of;
use core::ptr::{null_mut, write_bytes};

const PAGE: usize = 4096;
const SPANS: usize = 2048;
const MAX_PAGES: usize = 4096;
const MAGIC: u64 = 0x534c_4f50_4845_4150;
/// Bytes after which long copies and fills service audio.
const SERVICE_BYTES: usize = 4096;

#[repr(C)]
struct Block {
    length: usize,
    requested: usize,
    magic: u64,
    reserved: u64,
}
const HEADER: usize = size_of::<Block>();

#[derive(Clone, Copy)]
struct Span {
    base: usize,
    pages: usize,
}
impl Span {
    const EMPTY: Span = Span { base: 0, pages: 0 };
    fn end(self) -> usize {
        self.base + self.pages * PAGE
    }
}

/// Mirrors `struct heap_stats`.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct HeapStats {
    live_bytes: usize,
    peak_bytes: usize,
    allocations: usize,
    span_pages: usize,
    failures: usize,
    invalid_frees: usize,
}

struct State {
    spans: [Span; SPANS],
    stats: HeapStats,
    ready: bool,
    busy: bool,
    servicing: bool,
}
static STATE: Global<State> = Global::new(State {
    spans: [Span::EMPTY; SPANS],
    stats: HeapStats { live_bytes: 0, peak_bytes: 0, allocations: 0, span_pages: 0, failures: 0, invalid_frees: 0 },
    ready: false,
    busy: false,
    servicing: false,
});

extern "C" {
    fn mr_pmm_alloc() -> u64;
    fn mr_pmm_free(address: u64) -> i32;
    fn audio_checkpoint();
}

unsafe fn checkpoint() {
    let s = STATE.get();
    if !(*s).servicing {
        (*s).servicing = true;
        audio_checkpoint();
        (*s).servicing = false;
    }
}

/// Lets audio run in the middle of a transaction, which then resumes.
unsafe fn transaction_checkpoint() {
    let s = STATE.get();
    (*s).busy = false;
    checkpoint();
    (*s).busy = true;
}

fn rounded(n: usize) -> usize {
    (n + 15) & !15
}

/// Takes `need` bytes from the free block `b`, splitting off the remainder.
unsafe fn claim(b: *mut Block, need: usize, bytes: usize) -> *mut u8 {
    let remain = (*b).length - need;
    if remain >= HEADER + 16 {
        ((b as usize + need) as *mut Block).write(Block { length: remain, requested: 0, magic: MAGIC, reserved: 0 });
        (*b).length = need;
    }
    (*b).requested = bytes;
    let stats = &mut (*STATE.get()).stats;
    stats.live_bytes += bytes;
    stats.allocations += 1;
    if stats.live_bytes > stats.peak_bytes {
        stats.peak_bytes = stats.live_bytes;
    }
    b.add(1) as *mut u8
}

fn first_free_slot(spans: &[Span; SPANS]) -> Option<usize> {
    spans.iter().position(|span| span.base == 0)
}

unsafe fn allocate(bytes: usize) -> *mut u8 {
    let s = STATE.get();
    if bytes == 0 || bytes > MAX_PAGES * PAGE - HEADER {
        (*s).stats.failures += 1;
        return null_mut();
    }
    let need = rounded(bytes) + HEADER;
    let mut have_slot = false;
    for i in 0..SPANS {
        if i != 0 && i % 32 == 0 {
            transaction_checkpoint();
        }
        let span = (*s).spans[i];
        if span.base == 0 {
            have_slot = true;
            continue;
        }
        let mut p = span.base;
        while p < span.end() {
            let b = p as *mut Block;
            if (*b).requested == 0 && (*b).length >= need {
                return claim(b, need, bytes);
            }
            p += (*b).length;
        }
    }
    if !have_slot {
        (*s).stats.failures += 1;
        return null_mut();
    }

    let pages = need.div_ceil(PAGE);
    let mut got = 0;
    let mut base = 0;
    while got < pages {
        if got != 0 && got % 32 == 0 {
            transaction_checkpoint();
        }
        let p = mr_pmm_alloc() as usize;
        if p == 0 {
            break;
        }
        if got == 0 {
            base = p;
        } else if p != base + got * PAGE {
            mr_pmm_free(p as u64);
            break;
        }
        got += 1;
    }
    // Audio callbacks may have allocated spans while we acquired pages.
    let slot = first_free_slot(&(*s).spans);
    let Some(slot) = slot.filter(|_| got == pages) else {
        while got != 0 {
            got -= 1;
            mr_pmm_free((base + got * PAGE) as u64);
            if got % 32 == 0 {
                transaction_checkpoint();
            }
        }
        (*s).stats.failures += 1;
        return null_mut();
    };
    (*s).spans[slot] = Span { base, pages };
    (*s).stats.span_pages += pages;
    let b = base as *mut Block;
    b.write(Block { length: pages * PAGE, requested: 0, magic: MAGIC, reserved: 0 });
    // Allocate directly; do not rescan all spans.
    claim(b, need, bytes)
}

/// A live block found through the span registry.
struct Found {
    span: usize,
    block: *mut Block,
    previous: *mut Block,
}

/// Finds the live block whose payload starts at `ptr`, validating every
/// header walked on the way.
unsafe fn find(ptr: *mut u8) -> Option<Found> {
    let addr = ptr as usize;
    let spans = &(*STATE.get()).spans;
    let span = spans.iter().position(|s| s.base != 0 && addr >= s.base && addr < s.end())?;
    let end = spans[span].end();
    let mut previous = null_mut();
    let mut p = spans[span].base;
    while p < end {
        let b = p as *mut Block;
        if (*b).magic != MAGIC || (*b).length < HEADER || (*b).length > end - p {
            return None;
        }
        if b.add(1) as usize == addr && (*b).requested != 0 {
            return Some(Found { span, block: b, previous });
        }
        previous = b;
        p += (*b).length;
    }
    None
}

unsafe fn release(ptr: *mut u8) -> bool {
    let s = STATE.get();
    let Some(Found { span, block, previous }) = find(ptr) else {
        (*s).stats.invalid_frees += 1;
        return false;
    };
    let mut b = block;
    (*s).stats.live_bytes -= (*b).requested;
    (*s).stats.allocations -= 1;
    (*b).requested = 0;
    let Span { base, pages } = (*s).spans[span];
    let next = (b as usize + (*b).length) as *mut Block;
    if (next as usize) < base + pages * PAGE && (*next).requested == 0 {
        (*b).length += (*next).length;
    }
    if !previous.is_null() && (*previous).requested == 0 {
        (*previous).length += (*b).length;
        b = previous;
    }
    if b as usize == base && (*b).length == pages * PAGE {
        (*s).spans[span] = Span::EMPTY;
        (*s).stats.span_pages -= pages;
        for j in 0..pages {
            mr_pmm_free((base + j * PAGE) as u64);
            if j != 0 && j % 32 == 0 {
                transaction_checkpoint();
            }
        }
    }
    true
}

/// Runs `operation` as one non-reentrant heap transaction, servicing audio
/// before and after it. Returns `None` when the heap is not ready or busy.
unsafe fn transaction<T>(operation: impl FnOnce() -> T) -> Option<T> {
    let s = STATE.get();
    if !(*s).ready || (*s).busy {
        return None;
    }
    checkpoint();
    if (*s).busy {
        return None;
    }
    (*s).busy = true;
    let result = operation();
    (*s).busy = false;
    checkpoint();
    Some(result)
}

#[no_mangle]
pub extern "C" fn heap_init() {
    // SAFETY: main-thread state (see Global).
    unsafe { (*STATE.get()).ready = true }
}

#[no_mangle]
pub extern "C" fn heap_alloc(bytes: usize) -> *mut u8 {
    // SAFETY: main-thread state; the transaction rejects reentry.
    unsafe { transaction(|| allocate(bytes)).unwrap_or(null_mut()) }
}

#[no_mangle]
pub extern "C" fn heap_free(ptr: *mut u8) -> i32 {
    if ptr.is_null() {
        return 1;
    }
    // SAFETY: release validates ptr against the span registry before use.
    unsafe { transaction(|| release(ptr)).unwrap_or(false) as i32 }
}

#[no_mangle]
pub extern "C" fn heap_calloc(count: usize, bytes: usize) -> *mut u8 {
    let Some(total) = count.checked_mul(bytes) else {
        return null_mut();
    };
    let p = heap_alloc(total);
    if !p.is_null() {
        for start in (0..total).step_by(SERVICE_BYTES) {
            let n = SERVICE_BYTES.min(total - start);
            // SAFETY: p owns total bytes.
            unsafe {
                write_bytes(p.add(start), 0, n);
                if n == SERVICE_BYTES {
                    checkpoint();
                }
            }
        }
    }
    p
}

#[no_mangle]
pub extern "C" fn heap_realloc(ptr: *mut u8, bytes: usize) -> *mut u8 {
    if ptr.is_null() {
        return heap_alloc(bytes);
    }
    if bytes == 0 {
        heap_free(ptr);
        return null_mut();
    }
    // SAFETY: main-thread state; ptr is validated by find before it is read.
    unsafe {
        let s = STATE.get();
        if !(*s).ready || (*s).busy {
            return null_mut();
        }
        let Some(found) = find(ptr) else {
            (*s).stats.invalid_frees += 1;
            return null_mut();
        };
        let old = (*found.block).requested;
        let p = heap_alloc(bytes);
        if p.is_null() {
            return null_mut();
        }
        let total = old.min(bytes);
        for start in (0..total).step_by(SERVICE_BYTES) {
            let n = SERVICE_BYTES.min(total - start);
            p.add(start).copy_from_nonoverlapping(ptr.add(start), n);
            if n == SERVICE_BYTES {
                checkpoint();
            }
        }
        heap_free(ptr);
        p
    }
}

#[no_mangle]
pub extern "C" fn heap_get_stats() -> HeapStats {
    // SAFETY: main-thread state.
    unsafe { (*STATE.get()).stats }
}

/// Bounded, nondestructive main-thread exercise.
#[no_mangle]
pub extern "C" fn heap_selftest() -> i32 {
    let before = heap_get_stats();
    let mut ok = true;
    let mut p = [null_mut::<u8>(); 32];
    // SAFETY: every pointer written was just returned by heap_alloc with at
    // least the accessed size.
    unsafe {
        for _ in 0..3 {
            for i in 0..32 {
                p[i] = heap_alloc(17 + i * 113);
                if p[i].is_null() {
                    ok = false;
                    break;
                }
                if p[i] as usize & 15 != 0 {
                    ok = false;
                }
                *p[i] = i as u8;
            }
            for slot in p.iter_mut().step_by(2) {
                if !slot.is_null() {
                    ok &= heap_free(*slot) != 0;
                    *slot = null_mut();
                }
            }
            for (i, slot) in p.iter_mut().enumerate().skip(1).step_by(2) {
                if !slot.is_null() {
                    if **slot != i as u8 {
                        ok = false;
                    }
                    ok &= heap_free(*slot) != 0;
                    *slot = null_mut();
                }
            }
        }
        // Optional large-span exercise: a fragmented system may decline the run.
        for _ in 0..3 {
            let bytes = 16 * 1024 * 1024 - HEADER;
            let large = heap_alloc(bytes);
            if !large.is_null() {
                for i in (0..bytes).step_by(PAGE) {
                    *large.add(i) = (i / PAGE) as u8;
                }
                for i in (0..bytes).step_by(PAGE) {
                    if *large.add(i) != (i / PAGE) as u8 {
                        ok = false;
                    }
                }
                ok &= heap_free(large) != 0;
            }
        }
    }
    let after = heap_get_stats();
    (ok && after.live_bytes == before.live_bytes && after.span_pages == before.span_pages) as i32
}
