//! Physical-page bookkeeping only. No heap, paging instructions, or pointer dereferences.
use core::cell::UnsafeCell;
use core::sync::atomic::{AtomicBool, Ordering};
const PAGE: u64 = 4096;
const MAX_PAGES: usize = 1 << 20; // bounded by the C/Assembly identity map, 4 GiB
const WORDS: usize = MAX_PAGES / 64;
const OK: i32 = 0;
const INVALID: i32 = -1;
const PHASE: i32 = -2;
const BUSY: i32 = -3;
struct Pages {
    eligible: [u64; WORDS],
    allocated: [u64; WORDS],
    limit: usize,
    cursor: usize,
    available: u64,
    used: u64,
    sealed: bool,
}
impl Pages {
    const fn new() -> Self {
        Self { eligible: [0; WORDS], allocated: [0; WORDS], limit: 0, cursor: 0, available: 0, used: 0, sealed: false }
    }
    fn reset(&mut self, bytes: u64) -> i32 {
        if self.sealed { return PHASE; }
        if bytes < PAGE || bytes > (MAX_PAGES as u64) * PAGE { return INVALID; }
        self.eligible.fill(0); self.allocated.fill(0);
        self.limit = (bytes / PAGE) as usize;
        self.cursor = 1; self.available = 0; self.used = 0; self.sealed = false;
        OK
    }
    fn range(&mut self, base: u64, length: u64, usable: bool) -> i32 {
        if self.sealed { return PHASE; }
        let Some(end) = base.checked_add(length) else { return INVALID; };
        if length == 0 { return OK; }
        let ceiling = self.limit as u64 * PAGE;
        let start = if usable { base.saturating_add(PAGE - 1) / PAGE } else { base / PAGE };
        let finish = if usable { end.min(ceiling) / PAGE } else { end.min(ceiling).saturating_add(PAGE - 1) / PAGE };
        for page in (start.min(self.limit as u64) as usize)..(finish.min(self.limit as u64) as usize) {
            if page == 0 { continue; } // null is the allocation-failure sentinel
            let bit = 1u64 << (page % 64);
            let word = &mut self.eligible[page / 64];
            let was = (*word & bit) != 0;
            if usable { *word |= bit; if !was { self.available += 1; } }
            else { *word &= !bit; if was { self.available -= 1; } }
        }
        OK
    }
    fn allocate(&mut self) -> u64 {
        if !self.sealed || self.used == self.available { return 0; }
        // Each successful scan starts at the previous allocation, avoiding quadratic exhaustion.
        for offset in 0..self.limit {
            let page = (self.cursor + offset) % self.limit;
            let bit = 1u64 << (page % 64);
            if self.eligible[page / 64] & bit != 0 && self.allocated[page / 64] & bit == 0 {
                self.allocated[page / 64] |= bit; self.used += 1;
                self.cursor = (page + 1) % self.limit;
                return page as u64 * PAGE;
            }
        }
        0
    }
    fn release(&mut self, address: u64) -> i32 {
        if !self.sealed { return PHASE; }
        if address == 0 || address % PAGE != 0 || address / PAGE >= self.limit as u64 { return INVALID; }
        let page = (address / PAGE) as usize; let bit = 1u64 << (page % 64);
        if self.eligible[page / 64] & bit == 0 || self.allocated[page / 64] & bit == 0 { return INVALID; }
        self.allocated[page / 64] &= !bit; self.used -= 1;
        OK
    }
}
struct Locked { held: AtomicBool, pages: UnsafeCell<Pages> }
// SAFETY: every access to pages goes through with_pages, which grants one mutable
// reference only after acquiring held. IRQ handlers must never call these APIs.
// The nonblocking gate returns BUSY rather than deadlocking on accidental reentry.
unsafe impl Sync for Locked {}
static STATE: Locked = Locked { held: AtomicBool::new(false), pages: UnsafeCell::new(Pages::new()) };
fn with_pages<T>(busy: T, operation: impl FnOnce(&mut Pages) -> T) -> T {
    if STATE.held.compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed).is_err() { return busy; }
    // SAFETY: the acquired gate excludes all other mutable references, and the
    // reference cannot escape this private closure. Kernel panics halt, never unwind.
    let result = operation(unsafe { &mut *STATE.pages.get() });
    STATE.held.store(false, Ordering::Release);
    result
}
#[no_mangle] pub extern "C" fn mr_pmm_reset(bytes: u64) -> i32 { with_pages(BUSY, |p| p.reset(bytes)) }
#[no_mangle] pub extern "C" fn mr_pmm_add_usable(base: u64, bytes: u64) -> i32 { with_pages(BUSY, |p| p.range(base, bytes, true)) }
#[no_mangle] pub extern "C" fn mr_pmm_reserve(base: u64, bytes: u64) -> i32 { with_pages(BUSY, |p| p.range(base, bytes, false)) }
#[no_mangle] pub extern "C" fn mr_pmm_seal() -> i32 { with_pages(BUSY, |p| { if p.sealed || p.limit == 0 { return PHASE; } p.sealed = true; OK }) }
#[no_mangle] pub extern "C" fn mr_pmm_alloc() -> u64 { with_pages(0, |p| p.allocate()) }
#[no_mangle] pub extern "C" fn mr_pmm_free(address: u64) -> i32 { with_pages(BUSY, |p| p.release(address)) }
#[no_mangle] pub extern "C" fn mr_pmm_stat(which: u32) -> u64 {
    with_pages(u64::MAX, |p| match which { 0 => p.available - p.used, 1 => p.used, 2 => p.available, 3 => p.limit as u64, _ => u64::MAX })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn boundaries_and_exhaustion() {
        let mut p = Pages::new(); assert_eq!(p.reset(16 * PAGE), OK);
        assert_eq!(p.range(0, 16 * PAGE, true), OK);
        assert_eq!(p.range(PAGE + 1, PAGE, false), OK); // outward: reserve pages 1 and 2
        assert_eq!(p.range(u64::MAX - 2, 9, true), INVALID);
        assert_eq!(p.allocate(), 0); p.sealed = true;
        let mut pages = [0; 13];
        for (i, slot) in pages.iter_mut().enumerate() { *slot = p.allocate(); assert_eq!(*slot, (i as u64 + 3) * PAGE); }
        assert_eq!(p.allocate(), 0); assert_eq!(p.used, 13);
        assert_eq!(p.release(0), INVALID); assert_eq!(p.release(PAGE), INVALID); assert_eq!(p.release(pages[0]+1), INVALID);
        for page in pages { assert_eq!(p.release(page), OK); assert_eq!(p.release(page), INVALID); }
        assert_eq!(p.used, 0); assert_eq!(p.range(0, PAGE, true), PHASE);
    }
    #[test] fn partial_overlap_and_repeat() {
        let mut p = Pages::new(); p.reset(64 * PAGE);
        p.range(PAGE+1, 10*PAGE-2, true); assert_eq!(p.available, 8);
        p.range(PAGE+1, 10*PAGE-2, true); assert_eq!(p.available, 8);
        p.range(4*PAGE, 2*PAGE, false); assert_eq!(p.available, 6); p.sealed=true;
        for _ in 0..500 { let a=p.allocate();let b=p.allocate(); assert_ne!(a,b);assert!(a>0&&b>0);assert_eq!(p.release(a),OK);assert_eq!(p.release(b),OK); }
        assert_eq!(p.release(64*PAGE),INVALID);
    }
}
