//! Versioned bounded preferences (C ABI in src/preferences.h). Existing FAT
//! copy-on-write API with two recovery slots; this does not make FAT directory
//! publication atomic across power loss.
use crate::Global;
use core::ffi::{c_char, c_int};

const FS_MAX_FILE: usize = 65536;
const MAGIC: u32 = 0x504f_4c53;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct Preferences {
    magic: u32,
    version: u32,
    bytes: u32,
    generation: u32,
    wallpaper: u32,
    fit: u32,
    accent: u32,
    light: u32,
    volume: u32,
    magnify: u32,
    display_w: u32,
    display_h: u32,
    desktop_backend: u32,
    path: [u8; 16],
    checksum: u32,
}
const PREFS_BYTES: usize = core::mem::size_of::<Preferences>();

#[repr(C)]
struct FsInfo {
    sectors: u32,
    clusters: u32,
    free_clusters: u32,
    cluster_bytes: u32,
    mounted: c_int,
    writable: c_int,
}
#[repr(C)]
struct AudioStatus {
    available: c_int,
    playing: c_int,
    volume: u32,
    blocks: u32,
    underruns: u32,
    faults: u32,
}

extern "C" {
    static width: u32;
    static height: u32;
    static wallpaper_rgb: [u8; 0];
    fn logstr(s: *const c_char);
    fn length(s: *const c_char) -> usize;
    fn copystr(dst: *mut c_char, src: *const c_char, cap: usize);
    fn timer_us() -> u64;
    fn blend(a: u32, b: u32, t: u32) -> u32;
    fn audio_get_status() -> AudioStatus;
    fn audio_volume(percent: u32) -> c_int;
    fn fat_info() -> FsInfo;
    fn fat_error() -> *const c_char;
    fn fat_read(name: *const c_char, buf: *mut u8, cap: u32, size: *mut u32) -> c_int;
    fn fat_write(name: *const c_char, buf: *const u8, size: u32) -> c_int;
    fn desktop_background_changed();
}

#[no_mangle]
pub static mut prefs: Preferences = Preferences {
    magic: 0, version: 0, bytes: 0, generation: 0, wallpaper: 0, fit: 0, accent: 0, light: 0,
    volume: 0, magnify: 0, display_w: 0, display_h: 0, desktop_backend: 0, path: [0; 16],
    checksum: 0,
};

struct State {
    status: *const u8,
    custom_w: u32,
    custom_h: u32,
    custom: [u8; FS_MAX_FILE],
    incoming: [u8; FS_MAX_FILE],
    pending: bool,
    save_after: u64,
}
static STATE: Global<State> = Global::new(State {
    status: b"Session defaults; no settings saved\0".as_ptr(),
    custom_w: 0,
    custom_h: 0,
    custom: [0; FS_MAX_FILE],
    incoming: [0; FS_MAX_FILE],
    pending: false,
    save_after: 0,
});
const SLOTS: [&[u8]; 2] = [b"SLOP0.CFG\0", b"SLOP1.CFG\0"];

unsafe fn set_status(s: *const u8) {
    (*STATE.get()).status = s;
}
fn cs(s: &'static [u8]) -> *const c_char {
    s.as_ptr() as *const c_char
}

fn checksum(p: &Preferences) -> u32 {
    // SAFETY: Preferences is repr(C) plain integers with no padding (72 bytes).
    let b = unsafe { core::slice::from_raw_parts(p as *const _ as *const u8, PREFS_BYTES - 4) };
    b.iter().fold(2166136261u32, |h, &x| (h ^ x as u32).wrapping_mul(16777619))
}

/// Schema version 2: SlopDE is the default desktop backend (dwm stays
/// selectable). Version 1 files predate that change and are rejected so they
/// fall back to the defaults and are replaced by the next save.
fn valid(p: &Preferences) -> bool {
    p.magic == MAGIC
        && p.version >= 2
        && p.bytes as usize == PREFS_BYTES
        && p.checksum == checksum(p)
        && p.wallpaper <= 3
        && p.fit < 4
        && p.accent <= 0xffffff
        && p.light < 2
        && p.volume <= 100
        && p.magnify < 2
        && (800..=1920).contains(&p.display_w)
        && p.display_w & 7 == 0
        && (600..=1080).contains(&p.display_h)
        && p.desktop_backend < 2
        && p.path[15] == 0
}

fn number(b: &[u8], at: &mut usize) -> Option<u32> {
    while *at < b.len() && matches!(b[*at], b' ' | b'\n' | b'\r' | b'\t') {
        *at += 1;
    }
    let (mut v, mut d) = (0u32, 0);
    while *at < b.len() && b[*at].is_ascii_digit() {
        d += 1;
        if d > 5 {
            return None;
        }
        v = v * 10 + (b[*at] - b'0') as u32;
        *at += 1;
    }
    if d != 0 { Some(v) } else { None }
}

#[no_mangle]
pub unsafe extern "C" fn preferences_wallpaper(name: *const c_char) -> c_int {
    let st = STATE.get();
    if audio_get_status().playing != 0 {
        set_status(b"Stop playback before loading a custom image\0".as_ptr());
        return 0;
    }
    if length(name) > 12 {
        set_status(b"Use a FAT32 root 8.3 filename\0".as_ptr());
        return 0;
    }
    let mut n = 0u32;
    if fat_read(name, (*st).incoming.as_mut_ptr(), FS_MAX_FILE as u32, &mut n) == 0 {
        set_status(fat_error() as *const u8);
        return 0;
    }
    let b = &(*st).incoming[..n as usize];
    let mut at = 2usize;
    let header = if n >= 8 && b[0] == b'P' && b[1] == b'6' {
        match (number(b, &mut at), number(b, &mut at), number(b, &mut at)) {
            (Some(w), Some(h), Some(255)) if w != 0 && h != 0 && w <= 1024 && h <= 1024 && at < b.len() => Some((w, h)),
            _ => None,
        }
    } else {
        None
    };
    let Some((w, h)) = header else {
        set_status(b"Invalid P6 RGB wallpaper\0".as_ptr());
        return 0;
    };
    if !matches!(b[at], b' ' | b'\t' | b'\n' | b'\r') {
        set_status(b"Invalid PPM separator\0".as_ptr());
        return 0;
    }
    let cr = b[at] == b'\r';
    at += 1;
    if cr && at < b.len() && b[at] == b'\n' {
        at += 1;
    }
    let bytes = w as u64 * h as u64 * 3;
    if bytes != (b.len() - at) as u64 || bytes > FS_MAX_FILE as u64 {
        set_status(b"Wallpaper size does not match pixels\0".as_ptr());
        return 0;
    }
    let bytes = bytes as usize;
    (*st).custom[..bytes].copy_from_slice(&(*st).incoming[at..at + bytes]);
    (*st).custom_w = w;
    (*st).custom_h = h;
    let p = &raw mut prefs;
    copystr((*p).path.as_mut_ptr() as *mut c_char, name, 16);
    (*p).wallpaper = 3;
    set_status(b"Custom wallpaper loaded\0".as_ptr());
    1
}

#[no_mangle]
pub unsafe extern "C" fn preferences_init() {
    let p = &raw mut prefs;
    *p = Preferences {
        magic: MAGIC, version: 2, bytes: PREFS_BYTES as u32, generation: 0, wallpaper: 1, fit: 0,
        accent: 0x91c8e8, light: 1, volume: 65, magnify: 1, display_w: 1280, display_h: 800,
        desktop_backend: 0, path: [0; 16], checksum: 0,
    };
    let mut best = *p;
    let mut found = false;
    for slot in SLOTS {
        let mut cand = core::mem::zeroed::<Preferences>();
        let mut n = 0u32;
        if fat_read(cs(slot), &raw mut cand as *mut u8, PREFS_BYTES as u32, &mut n) != 0
            && n as usize == PREFS_BYTES
            && valid(&cand)
            && (!found || cand.generation > best.generation)
        {
            best = cand;
            found = true;
        }
    }
    if found {
        *p = best;
        set_status(b"Settings loaded from FAT32\0".as_ptr());
        logstr(cs(b"PREFERENCES_LOADED\n\0"));
        if (*p).wallpaper == 3 {
            let mut name = [0 as c_char; 16];
            copystr(name.as_mut_ptr(), (*p).path.as_ptr() as *const c_char, 16);
            if preferences_wallpaper(name.as_ptr()) == 0 {
                (*p).wallpaper = 0;
                set_status(b"Saved wallpaper unavailable; default selected\0".as_ptr());
            }
        }
    } else if fat_info().mounted != 0 {
        set_status(b"Defaults: no valid settings file\0".as_ptr());
    } else {
        set_status(b"Session only: no FAT32 disk\0".as_ptr());
    }
    audio_volume((*p).volume);
}

#[no_mangle]
pub unsafe extern "C" fn preferences_status() -> *const c_char {
    (*STATE.get()).status as *const c_char
}

#[no_mangle]
pub unsafe extern "C" fn preferences_changed(background: c_int) {
    let st = STATE.get();
    audio_volume(prefs.volume);
    if background != 0 {
        desktop_background_changed();
    }
    (*st).pending = true;
    (*st).save_after = timer_us().wrapping_add(1_500_000);
    set_status(b"Applied; save pending\0".as_ptr());
}

#[no_mangle]
pub unsafe extern "C" fn preferences_save() -> c_int {
    let st = STATE.get();
    if audio_get_status().playing != 0 {
        (*st).pending = true;
        set_status(b"Applied; save waits for audio playback to finish\0".as_ptr());
        return 0;
    }
    let info = fat_info();
    if info.mounted == 0 || info.writable == 0 {
        (*st).pending = false;
        set_status(b"Session only: storage unavailable or read-only\0".as_ptr());
        return 0;
    }
    let mut p = prefs;
    if p.generation == u32::MAX {
        set_status(b"Configuration generation exhausted\0".as_ptr());
        (*st).pending = false;
        return 0;
    }
    p.generation += 1;
    p.checksum = checksum(&p);
    let slot = cs(SLOTS[(p.generation & 1) as usize]);
    if fat_write(slot, &raw const p as *const u8, PREFS_BYTES as u32) == 0 {
        set_status(fat_error() as *const u8);
        (*st).pending = false;
        return 0;
    }
    let mut check = core::mem::zeroed::<Preferences>();
    let mut n = 0u32;
    if fat_read(slot, &raw mut check as *mut u8, PREFS_BYTES as u32, &mut n) == 0
        || n as usize != PREFS_BYTES
        || !valid(&check)
        || check.generation != p.generation
    {
        set_status(b"Configuration readback failed\0".as_ptr());
        (*st).pending = false;
        return 0;
    }
    prefs = p;
    (*st).pending = false;
    set_status(b"Saved and synced to FAT32\0".as_ptr());
    logstr(cs(b"PREFERENCES_SAVED\n\0"));
    1
}

#[no_mangle]
pub unsafe extern "C" fn preferences_step(now: u64) {
    let st = STATE.get();
    if (*st).pending && now >= (*st).save_after && audio_get_status().playing == 0 {
        preferences_save();
    }
}

#[no_mangle]
pub unsafe extern "C" fn preferences_pixel(x: u32, y: u32) -> u32 {
    let st = STATE.get();
    let p = prefs;
    let (w_, h_) = (width, height);
    let solid = if p.light != 0 { 0xd8e0ed } else { 0x16243c };
    if p.wallpaper == 2 {
        return p.accent;
    }
    if p.wallpaper == 1 {
        // Original Azure tide: smooth diagonal light ribbons, rendered only when
        // the desktop background cache is rebuilt, with no floating-point work.
        let nx = x.wrapping_mul(1024) / if w_ != 0 { w_ } else { 1 };
        let ny = y.wrapping_mul(1024) / if h_ != 0 { h_ } else { 1 };
        let mut base = blend(0x073d6c, 0x31a3b4, ny.wrapping_mul(255) / 1024);
        let d = (nx as i32 + ny as i32 / 2 - 720).abs();
        let glow = if d < 400 { (400 - d as u32) * 105 / 400 } else { 0 };
        base = blend(base, 0x9de7df, glow);
        let ribbon = (ny as i32 * 3 - nx as i32 - 1350).abs();
        if ribbon < 110 {
            base = blend(base, 0x8ad8e8, (110 - ribbon as u32) * 65 / 110);
        }
        return base;
    }
    let custom = p.wallpaper == 3;
    let (sw, sh) = if custom { ((*st).custom_w, (*st).custom_h) } else { (1280, 800) };
    let data: *const u8 = if custom { (*st).custom.as_ptr() } else { wallpaper_rgb.as_ptr() };
    if sw == 0 || sh == 0 {
        return solid;
    }
    let (sx, sy): (i32, i32);
    if p.fit == 3 {
        sx = (x % sw) as i32;
        sy = (y % sh) as i32;
    } else if p.fit == 2 {
        sx = (x as i32).wrapping_sub((w_ as i32).wrapping_sub(sw as i32) / 2);
        sy = (y as i32).wrapping_sub((h_ as i32).wrapping_sub(sh as i32) / 2);
    } else {
        let mut dw = w_;
        let mut dh = (sh as u64 * w_ as u64 / sw as u64) as u32;
        if (p.fit == 0 && dh < h_) || (p.fit == 1 && dh > h_) {
            dh = h_;
            dw = (sw as u64 * h_ as u64 / sh as u64) as u32;
        }
        if dw == 0 || dh == 0 {
            return solid;
        }
        let px = (x as i32).wrapping_sub((w_ as i32).wrapping_sub(dw as i32) / 2);
        let py = (y as i32).wrapping_sub((h_ as i32).wrapping_sub(dh as i32) / 2);
        if px < 0 || py < 0 || px as u32 >= dw || py as u32 >= dh {
            return solid;
        }
        sx = (px as u64 * sw as u64 / dw as u64) as i32;
        sy = (py as u64 * sh as u64 / dh as u64) as i32;
    }
    if sx < 0 || sy < 0 || sx as u32 >= sw || sy as u32 >= sh {
        return solid;
    }
    let at = (sy as usize * sw as usize + sx as usize) * 3;
    (*data.add(at) as u32) << 16 | (*data.add(at + 1) as u32) << 8 | *data.add(at + 2) as u32
}
