#![cfg_attr(not(test), no_std)]
//! Slopix kernel components written in freestanding Rust (`core` only, no
//! allocator). Every module exports the same C ABI as the C file it replaced,
//! so the rest of the kernel calls it through the existing headers.
//!
//! The kernel links all modules. Host test builds pass `--cfg host_subset`
//! plus one `--cfg 'part="NAME"'` per module under test, so the C test can
//! stub the module's dependencies (for example the PMM) without symbol clashes.
use core::cell::UnsafeCell;

#[cfg(any(not(host_subset), part = "memory"))]
pub mod memory;
#[cfg(any(not(host_subset), part = "heap"))]
pub mod heap;
#[cfg(any(not(host_subset), part = "clipboard"))]
pub mod clipboard;
#[cfg(any(not(host_subset), part = "perf"))]
pub mod perf;
#[cfg(any(not(host_subset), part = "preferences"))]
pub mod preferences;
#[cfg(any(not(host_subset), part = "vfs"))]
pub mod vfs;
#[cfg(any(not(host_subset), part = "slop_package"))]
pub mod slop_package;

/// Kernel main-thread state shared with C callbacks.
///
/// The kernel is single-threaded outside IRQ handlers, and none of these
/// modules is called from an IRQ. Callers may re-enter a module through C
/// callbacks (the heap's audio checkpoint, for example), so code reaches the
/// state through the raw pointer and never holds a reference across a call
/// back into C.
pub struct Global<T>(UnsafeCell<T>);
// SAFETY: see the type documentation; access is confined to the main thread.
unsafe impl<T> Sync for Global<T> {}
impl<T> Global<T> {
    pub const fn new(value: T) -> Self {
        Self(UnsafeCell::new(value))
    }
    pub fn get(&self) -> *mut T {
        self.0.get()
    }
}

#[cfg(not(test))]
#[panic_handler]
fn panic(_info: &core::panic::PanicInfo) -> ! {
    extern "C" {
        fn rust_panic_abort() -> !;
    }
    // SAFETY: supplied by the linked C kernel, never returns or unwinds.
    unsafe { rust_panic_abort() }
}
