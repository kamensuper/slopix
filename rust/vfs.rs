//! Single-backend VFS dispatcher (C ABI in src/fs/vfs.h). The backend and its
//! callbacks have static kernel lifetime and run on the main thread only.
use crate::Global;
use core::ffi::{c_char, c_int, c_void};
use core::ptr::null;

const FS_MAX_FILE: u32 = 65536;

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct FsInfo {
    sectors: u32,
    clusters: u32,
    free_clusters: u32,
    cluster_bytes: u32,
    mounted: c_int,
    writable: c_int,
}

type Name = *const c_char;
type Entry = Option<unsafe extern "C" fn(Name, u32, c_int)>;

#[repr(C)]
pub struct FsBackend {
    name: Name,
    info: Option<unsafe extern "C" fn() -> FsInfo>,
    error: Option<unsafe extern "C" fn() -> Name>,
    list: Option<unsafe extern "C" fn(Entry) -> c_int>,
    read: Option<unsafe extern "C" fn(Name, *mut c_void, u32, *mut u32) -> c_int>,
    write: Option<unsafe extern "C" fn(Name, *const c_void, u32) -> c_int>,
    remove: Option<unsafe extern "C" fn(Name) -> c_int>,
    sync: Option<unsafe extern "C" fn() -> c_int>,
    stat: Option<unsafe extern "C" fn(Name, *mut u32, *mut c_int) -> c_int>,
    list_path: Option<unsafe extern "C" fn(Name, Entry) -> c_int>,
    read_at: Option<unsafe extern "C" fn(Name, u32, *mut c_void, u32, *mut u32) -> c_int>,
    write_at: Option<unsafe extern "C" fn(Name, u32, *const c_void, u32) -> c_int>,
    mkdir: Option<unsafe extern "C" fn(Name) -> c_int>,
    rmdir: Option<unsafe extern "C" fn(Name) -> c_int>,
    rename: Option<unsafe extern "C" fn(Name, Name) -> c_int>,
    copy: Option<unsafe extern "C" fn(Name, Name) -> c_int>,
}

static ACTIVE: Global<*const FsBackend> = Global::new(null());

/// The bound backend, if any.
unsafe fn active() -> Option<&'static FsBackend> {
    (*ACTIVE.get()).as_ref()
}

#[no_mangle]
pub unsafe extern "C" fn vfs_bind(b: *const FsBackend) -> c_int {
    let Some(b) = b.as_ref() else { return 0 };
    if active().is_some()
        || b.name.is_null()
        || b.info.is_none()
        || b.error.is_none()
        || b.list.is_none()
        || b.read.is_none()
        || b.write.is_none()
        || b.remove.is_none()
        || b.sync.is_none()
    {
        return 0;
    }
    *ACTIVE.get() = b;
    1
}

#[no_mangle]
pub unsafe extern "C" fn vfs_name() -> Name {
    match active() {
        Some(a) => a.name,
        None => b"Unavailable\0".as_ptr() as Name,
    }
}

#[no_mangle]
pub unsafe extern "C" fn vfs_info() -> FsInfo {
    match active() {
        Some(a) => (a.info.unwrap())(),
        None => FsInfo::default(),
    }
}

#[no_mangle]
pub unsafe extern "C" fn vfs_error() -> Name {
    match active() {
        Some(a) => (a.error.unwrap())(),
        None => b"No filesystem backend\0".as_ptr() as Name,
    }
}

#[no_mangle]
pub unsafe extern "C" fn vfs_list(entry: Entry) -> c_int {
    match active() {
        Some(a) if entry.is_some() => (a.list.unwrap())(entry),
        _ => 0,
    }
}

#[no_mangle]
pub unsafe extern "C" fn vfs_read(n: Name, b: *mut c_void, cap: u32, size: *mut u32) -> c_int {
    match active() {
        Some(a) if !n.is_null() && !b.is_null() && !size.is_null() && cap <= FS_MAX_FILE => (a.read.unwrap())(n, b, cap, size),
        _ => 0,
    }
}

#[no_mangle]
pub unsafe extern "C" fn vfs_write(n: Name, b: *const c_void, size: u32) -> c_int {
    match active() {
        Some(a) if !n.is_null() && (!b.is_null() || size == 0) && size <= FS_MAX_FILE => (a.write.unwrap())(n, b, size),
        _ => 0,
    }
}

#[no_mangle]
pub unsafe extern "C" fn vfs_remove(n: Name) -> c_int {
    match active() {
        Some(a) if !n.is_null() => (a.remove.unwrap())(n),
        _ => 0,
    }
}

#[no_mangle]
pub unsafe extern "C" fn vfs_sync() -> c_int {
    match active() {
        Some(a) => (a.sync.unwrap())(),
        None => 0,
    }
}

#[no_mangle]
pub unsafe extern "C" fn vfs_stat(p: Name, s: *mut u32, d: *mut c_int) -> c_int {
    match active().and_then(|a| a.stat) {
        Some(f) if !p.is_null() && !s.is_null() && !d.is_null() => f(p, s, d),
        _ => 0,
    }
}

#[no_mangle]
pub unsafe extern "C" fn vfs_list_path(p: Name, e: Entry) -> c_int {
    match active().and_then(|a| a.list_path) {
        Some(f) if !p.is_null() && e.is_some() => f(p, e),
        _ => 0,
    }
}

#[no_mangle]
pub unsafe extern "C" fn vfs_read_at(p: Name, o: u32, b: *mut c_void, c: u32, s: *mut u32) -> c_int {
    match active().and_then(|a| a.read_at) {
        Some(f) if !p.is_null() && (!b.is_null() || c == 0) && !s.is_null() => f(p, o, b, c, s),
        _ => 0,
    }
}

#[no_mangle]
pub unsafe extern "C" fn vfs_write_at(p: Name, o: u32, b: *const c_void, s: u32) -> c_int {
    match active().and_then(|a| a.write_at) {
        Some(f) if !p.is_null() && (!b.is_null() || s == 0) => f(p, o, b, s),
        _ => 0,
    }
}

#[no_mangle]
pub unsafe extern "C" fn vfs_mkdir(p: Name) -> c_int {
    match active().and_then(|a| a.mkdir) {
        Some(f) if !p.is_null() => f(p),
        _ => 0,
    }
}

#[no_mangle]
pub unsafe extern "C" fn vfs_rmdir(p: Name) -> c_int {
    match active().and_then(|a| a.rmdir) {
        Some(f) if !p.is_null() => f(p),
        _ => 0,
    }
}

#[no_mangle]
pub unsafe extern "C" fn vfs_rename(a: Name, b: Name) -> c_int {
    match active().and_then(|x| x.rename) {
        Some(f) if !a.is_null() && !b.is_null() => f(a, b),
        _ => 0,
    }
}

#[no_mangle]
pub unsafe extern "C" fn vfs_copy(a: Name, b: Name) -> c_int {
    match active().and_then(|x| x.copy) {
        Some(f) if !a.is_null() && !b.is_null() => f(a, b),
        _ => 0,
    }
}
