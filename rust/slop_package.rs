//! Genesis .slop package manager: legacy executable packages and v2 bundles
//! (C ABI in src/slop_package.h). Bounded 8.3 files, complete pre-verification,
//! temp-file staging and cleanup. Integrity CRCs are NOT a signature or an
//! authentication mechanism.
use crate::Global;
use core::ffi::{c_char, c_int, c_void};

const CHUNK: usize = 4096;
const HEADER: u32 = 32;
const ENTRY: u32 = 24;
const FILES: usize = 8;
const MAX_IMAGE: u32 = 1024 * 1024;
const MAX_ASSET: u32 = 512 * 1024;
const MAX_PAYLOAD: u32 = 2 * 1024 * 1024;

type Line = extern "C" fn(*const c_char);

extern "C" {
    fn slopde_launch_installed(name: *const c_char) -> c_int;
    fn vfs_stat(path: *const c_char, size: *mut u32, directory: *mut c_int) -> c_int;
    fn vfs_read_at(path: *const c_char, at: u32, dst: *mut c_void, cap: u32, size: *mut u32) -> c_int;
    fn vfs_write_at(path: *const c_char, at: u32, src: *const c_void, size: u32) -> c_int;
    fn vfs_write(path: *const c_char, src: *const c_void, size: u32) -> c_int;
    fn vfs_remove(path: *const c_char) -> c_int;
    fn vfs_rename(from: *const c_char, to: *const c_char) -> c_int;
    fn vfs_list(entry: Option<extern "C" fn(*const c_char, u32, c_int)>) -> c_int;
}

struct State {
    buffer: [u8; CHUNK],
    line: Option<Line>,
}
static STATE: Global<State> = Global::new(State { buffer: [0; CHUNK], line: None });

macro_rules! say {
    ($s:literal) => {
        say_c(concat!($s, "\0").as_ptr() as *const c_char)
    };
}
unsafe fn say_c(s: *const c_char) {
    if let Some(f) = (*STATE.get()).line {
        f(s)
    }
}

/// The bytes of a NUL-terminated C string, without the terminator.
unsafe fn cstr<'a>(p: *const c_char) -> &'a [u8] {
    let mut n = 0;
    while *p.add(n) != 0 {
        n += 1;
    }
    core::slice::from_raw_parts(p as *const u8, n)
}
/// Bytes of a fixed buffer up to its first NUL.
fn upto_nul(b: &[u8]) -> &[u8] {
    &b[..b.iter().position(|&c| c == 0).unwrap_or(b.len())]
}

fn le32(p: &[u8]) -> u32 {
    u32::from_le_bytes([p[0], p[1], p[2], p[3]])
}
fn crc32_step(mut crc: u32, p: &[u8]) -> u32 {
    for &byte in p {
        crc ^= byte as u32;
        for _ in 0..8 {
            crc = (crc >> 1) ^ if crc & 1 != 0 { 0xedb88320 } else { 0 };
        }
    }
    crc
}
fn name_char(c: u8) -> bool {
    c.is_ascii_uppercase() || c.is_ascii_digit() || c == b'_'
}
fn valid_name(s: &[u8]) -> bool {
    (1..=8).contains(&s.len()) && s.iter().all(|&c| name_char(c))
}
fn valid_filename(s: &[u8]) -> bool {
    let Some(stem) = s.iter().position(|&c| c == b'.') else { return false };
    let ext = &s[stem + 1..];
    valid_name(&s[..stem]) && (1..=3).contains(&ext.len()) && ext.iter().all(|&c| name_char(c))
}
fn ends(s: &[u8], ext: &[u8]) -> bool {
    s.ends_with(ext)
}

type Name13 = [u8; 13];

/// Until VFAT long names land, the CLI accepts a .slop spelling but stores the
/// package on FAT32 under its compatible 8.3 .SLP filename.
unsafe fn resolve_package_filename(input: *const c_char, alias: &mut Name13) -> *const c_char {
    let s = cstr(input);
    let n = s.len();
    if !(6..=13).contains(&n) {
        return input;
    }
    let ext = &s[n - 5..];
    if ext[0] != b'.' || ext[1] | 32 != b's' || ext[2] | 32 != b'l' || ext[3] | 32 != b'o' || ext[4] | 32 != b'p' {
        return input;
    }
    let base = n - 5;
    if !(1..=8).contains(&base) {
        return input;
    }
    for i in 0..base {
        let c = s[i].to_ascii_uppercase();
        if !name_char(c) {
            return input;
        }
        alias[i] = c;
    }
    alias[base..base + 5].copy_from_slice(b".SLP\0");
    alias.as_ptr() as *const c_char
}

fn entry_name(name: &[u8], extension: &[u8]) -> Name13 {
    let mut out = [0u8; 13];
    let name = &name[..name.len().min(8)];
    out[..name.len()].copy_from_slice(name);
    out[name.len()] = b'.';
    let ext = &extension[..extension.len().min(3)];
    out[name.len() + 1..name.len() + 1 + ext.len()].copy_from_slice(ext);
    out
}

#[derive(Clone, Copy)]
struct PkgFile {
    name: Name13,
    size: u32,
    crc: u32,
    kind: u32,
    offset: u32,
}
#[derive(Clone, Copy)]
struct Pkg {
    name: [u8; 9],
    major: u32,
    minor: u32,
    count: u32,
    meta_size: u32,
    total: u32,
    files: [PkgFile; FILES],
}
impl Pkg {
    fn new() -> Pkg {
        let f = PkgFile { name: [0; 13], size: 0, crc: 0, kind: 0, offset: 0 };
        Pkg { name: [0; 9], major: 0, minor: 0, count: 0, meta_size: 0, total: 0, files: [f; FILES] }
    }
    fn name(&self) -> &[u8] {
        upto_nul(&self.name)
    }
}

unsafe fn exists(n: *const c_char) -> bool {
    let (mut size, mut dir) = (0u32, 0 as c_int);
    vfs_stat(n, &mut size, &mut dir) != 0
}
unsafe fn read_exact(path: *const c_char, at: u32, dst: &mut [u8]) -> bool {
    let mut n = 0u32;
    vfs_read_at(path, at, dst.as_mut_ptr() as *mut c_void, dst.len() as u32, &mut n) != 0 && n as usize == dst.len()
}
fn np(n: &Name13) -> *const c_char {
    n.as_ptr() as *const c_char
}

/// `registry` selects a short, validated manifest instead of a full package.
unsafe fn manifest(path: *const c_char, p: &mut Pkg, registry: bool) -> bool {
    let (mut bytes, mut directory) = (0u32, 0 as c_int);
    let mut h = [0u8; HEADER as usize];
    if vfs_stat(path, &mut bytes, &mut directory) == 0 || directory != 0 || bytes < HEADER || !read_exact(path, 0, &mut h) {
        return false;
    }
    let version = match &h[..8] {
        b"SLOPPKG1" => 1,
        b"SLOPPKG2" => 2,
        _ => return false,
    };
    let n = upto_nul(&h[8..16]).len();
    p.name = [0; 9];
    p.name[..n].copy_from_slice(&h[8..8 + n]);
    if h[8 + n..16].iter().any(|&c| c != 0) || !valid_name(&h[8..8 + n]) || le32(&h[28..]) != 1 {
        return false;
    }
    p.major = h[24] as u32 | (h[25] as u32) << 8;
    p.minor = h[26] as u32 | (h[27] as u32) << 8;
    if version == 1 {
        p.meta_size = HEADER;
        p.count = 1;
        p.total = le32(&h[16..]);
        if p.total < 64 || p.total > MAX_IMAGE {
            return false;
        }
        let name = *p;
        p.files[0] = PkgFile { name: entry_name(name.name(), b"ELF"), size: p.total, crc: le32(&h[20..]), kind: 1, offset: HEADER };
        return bytes == if registry { HEADER } else { HEADER + p.total };
    }
    p.count = le32(&h[16..]);
    p.total = le32(&h[20..]);
    if p.count == 0 || p.count as usize > FILES || p.total > MAX_PAYLOAD {
        return false;
    }
    p.meta_size = HEADER + p.count * ENTRY;
    if bytes != if registry { p.meta_size } else { p.meta_size + p.total } {
        return false;
    }
    let (mut offset, mut sum, mut elfs) = (p.meta_size, 0u32, 0u32);
    for i in 0..p.count as usize {
        let mut e = [0u8; ENTRY as usize];
        if !read_exact(path, HEADER + i as u32 * ENTRY, &mut e) {
            return false;
        }
        let k = upto_nul(&e[..12]).len();
        if e[k..12].iter().any(|&c| c != 0) {
            return false;
        }
        let mut f = PkgFile { name: [0; 13], size: le32(&e[12..]), crc: le32(&e[16..]), kind: le32(&e[20..]), offset };
        f.name[..k].copy_from_slice(&e[..k]);
        let fname = upto_nul(&f.name);
        if !valid_filename(fname) || ends(fname, b".REG") || ends(fname, b".TMP") || ends(fname, b".SLP") {
            return false;
        }
        if (0..i).any(|j| upto_nul(&p.files[j].name) == fname) {
            return false;
        }
        if f.kind == 1 {
            let expected = entry_name(p.name(), b"ELF");
            if fname != upto_nul(&expected) || f.size < 64 || f.size > MAX_IMAGE {
                return false;
            }
            elfs += 1;
        } else if f.kind != 2 || f.size == 0 || f.size > MAX_ASSET || ends(fname, b".ELF") {
            return false;
        }
        if sum > MAX_PAYLOAD - f.size {
            return false;
        }
        sum += f.size;
        offset += f.size;
        p.files[i] = f;
    }
    sum == p.total && elfs == 1
}

unsafe fn verify_file(path: *const c_char, f: &PkgFile, offset: u32, exact_size: bool) -> bool {
    if exact_size {
        let (mut actual, mut dir) = (0u32, 0 as c_int);
        if vfs_stat(path, &mut actual, &mut dir) == 0 || dir != 0 || actual != f.size {
            return false;
        }
    }
    let buffer = &mut (*STATE.get()).buffer;
    let mut crc = 0xffff_ffffu32;
    let mut off = 0u32;
    while off < f.size {
        let cap = (f.size - off).min(CHUNK as u32) as usize;
        if !read_exact(path, offset + off, &mut buffer[..cap]) {
            return false;
        }
        if f.kind == 1 && off == 0 && !(buffer[..6] == [127, b'E', b'L', b'F', 2, 1] && buffer[18] == 62 && buffer[19] == 0) {
            return false;
        }
        crc = crc32_step(crc, &buffer[..cap]);
        off += cap as u32;
    }
    crc ^ 0xffff_ffff == f.crc
}

unsafe fn verify(path: *const c_char, p: &Pkg) -> bool {
    p.files[..p.count as usize].iter().all(|f| verify_file(path, f, f.offset, false))
}

fn push_decimal(out: &mut [u8], at: &mut usize, mut n: u32) {
    let mut digits = [0u8; 10];
    let mut k = 0;
    loop {
        digits[k] = b'0' + (n % 10) as u8;
        k += 1;
        n /= 10;
        if n == 0 {
            break;
        }
    }
    while k > 0 {
        k -= 1;
        out[*at] = digits[k];
        *at += 1;
    }
}
unsafe fn print_pkg(p: &Pkg) {
    let mut s = [0u8; 100];
    let mut at = 0;
    for part in [&b"Package "[..], p.name(), b" version "] {
        s[at..at + part.len()].copy_from_slice(part);
        at += part.len();
    }
    push_decimal(&mut s, &mut at, p.major);
    s[at] = b'.';
    at += 1;
    push_decimal(&mut s, &mut at, p.minor);
    say_c(s.as_ptr() as *const c_char);
}

extern "C" fn listing(name: *const c_char, bytes: u32, directory: c_int) {
    // SAFETY: called by the VFS backend with a NUL-terminated name.
    unsafe {
        if directory != 0 || bytes < HEADER || bytes > HEADER + FILES as u32 * ENTRY {
            return;
        }
        if !ends(cstr(name), b".REG") {
            return;
        }
        let mut p = Pkg::new();
        if !manifest(name, &mut p, true) {
            return;
        }
        let reg = entry_name(p.name(), b"REG");
        let exe = entry_name(p.name(), b"ELF");
        if cstr(name) == upto_nul(&reg) && exists(np(&exe)) {
            say_c(name);
        }
    }
}

fn temporary(i: usize) -> Name13 {
    let mut n = [0u8; 13];
    n[..9].copy_from_slice(b"SLP0.TMP\0");
    n[3] = b'0' + i as u8;
    n
}

unsafe fn install(path: *const c_char, p: &Pkg) -> bool {
    let count = p.count as usize;
    let reg = entry_name(p.name(), b"REG");
    if exists(np(&reg)) {
        say!("Name already installed or in use; no files replaced");
        return false;
    }
    for i in 0..count {
        if exists(np(&p.files[i].name)) {
            say!("Name already installed or in use; no files replaced");
            return false;
        }
        // A staging file left by an interrupted install is ours (apps cannot
        // create SLP*.TMP); clean it up instead of blocking every future install.
        let tmp = temporary(i);
        if exists(np(&tmp)) && vfs_remove(np(&tmp)) == 0 {
            say!("Stale SLP*.TMP from an interrupted install could not be removed");
            return false;
        }
    }
    let buffer = &mut (*STATE.get()).buffer;
    let (mut staged, mut moved, mut ok) = (0usize, 0usize, true);
    let mut i = 0;
    while i < count && ok {
        let f = &p.files[i];
        let tmp = temporary(i);
        let mut written = 0u32;
        while written < f.size {
            let cap = (f.size - written).min(CHUNK as u32) as usize;
            if !read_exact(path, f.offset + written, &mut buffer[..cap])
                || vfs_write_at(np(&tmp), written, buffer.as_ptr() as *const c_void, cap as u32) == 0
            {
                ok = false;
                break;
            }
            written += cap as u32;
        }
        staged += 1;
        i += 1;
    }
    if ok {
        for i in 0..count {
            if vfs_rename(np(&temporary(i)), np(&p.files[i].name)) == 0 {
                ok = false;
                break;
            }
            moved += 1;
        }
    }
    if ok {
        // The registry is written LAST: only fully committed packages appear installed.
        let mut metadata = [0u8; (HEADER + FILES as u32 * ENTRY) as usize];
        let meta = &mut metadata[..p.meta_size as usize];
        if !read_exact(path, 0, meta) || vfs_write(np(&reg), meta.as_ptr() as *const c_void, p.meta_size) == 0 {
            ok = false;
        }
    }
    if !ok {
        for i in 0..staged {
            vfs_remove(np(&temporary(i)));
        }
        for i in 0..moved {
            vfs_remove(np(&p.files[i].name));
        }
        vfs_remove(np(&reg));
        say!("Installation failed; staged files rolled back where possible");
        return false;
    }
    print_pkg(p);
    say!("Installed package; slop launch NAME (or run NAME.ELF)");
    true
}

#[no_mangle]
pub unsafe extern "C" fn slop_package_command(command: *const c_char, args: *mut c_char, out: Line) -> c_int {
    if cstr(command) != b"slop" {
        return 0;
    }
    (*STATE.get()).line = Some(out);
    let mut args = args;
    if *args == 0 || cstr(args) == b"help" {
        say!("slop install FILE.SLP | verify FILE.SLP | info FILE.SLP");
        say!("slop list | remove PACKAGENAME | launch PACKAGENAME");
        return 1;
    }
    let opt = args;
    while *args != 0 && *args as u8 != b' ' {
        args = args.add(1);
    }
    if *args != 0 {
        *args = 0;
        args = args.add(1);
        while *args as u8 == b' ' {
            args = args.add(1);
        }
    }
    let opt = cstr(opt);
    let arg = cstr(args);
    if opt == b"list" {
        if !arg.is_empty() || vfs_list(Some(listing)) == 0 {
            say!("Package list unavailable");
        }
        return 1;
    }
    if opt == b"launch" {
        if !valid_name(arg) {
            say!("Usage: slop launch PACKAGENAME (A-Z/0-9/_)");
            return 1;
        }
        let exe = entry_name(arg, b"ELF");
        let reg = entry_name(arg, b"REG");
        let mut p = Pkg::new();
        if !manifest(np(&reg), &mut p, true) || p.name() != arg || !exists(np(&exe)) {
            say!("Package is not installed");
            return 1;
        }
        if slopde_launch_installed(np(&exe)) == 0 {
            say!("Unable to start app (another installed window open or ELF invalid)");
        } else {
            say!("Launched standalone Ring-3 graphical application");
        }
        return 1;
    }
    if opt == b"remove" {
        if !valid_name(arg) {
            say!("Invalid package name (uppercase A-Z/0-9/_; max 8)");
            return 1;
        }
        let reg = entry_name(arg, b"REG");
        let mut p = Pkg::new();
        if !manifest(np(&reg), &mut p, true) || p.name() != arg {
            say!("Not a valid registered Slop package");
            return 1;
        }
        // A user may have replaced an installed asset with personal data: never
        // delete that on uninstall, and validate everything before deleting any.
        // Files already gone (a previous remove failed half way) are skipped, so
        // a failed uninstall can always be retried.
        let files = &p.files[..p.count as usize];
        if files.iter().any(|f| exists(np(&f.name)) && !verify_file(np(&f.name), f, 0, true)) {
            say!("Installed file was modified; refusing destructive uninstall");
            return 1;
        }
        let mut ok = true;
        for f in files {
            if exists(np(&f.name)) && vfs_remove(np(&f.name)) == 0 {
                ok = false;
            }
        }
        if !ok {
            say!("Could not remove all package files; registration retained for retry");
        } else if vfs_remove(np(&reg)) == 0 {
            say!("Package files removed; registry cleanup failed");
        } else {
            say!("Package removed");
        }
        return 1;
    }
    if opt != b"install" && opt != b"verify" && opt != b"info" {
        say!("Unknown slop action; try slop help");
        return 1;
    }
    if arg.is_empty() || arg.len() > 255 {
        say!("Specify a valid .SLP package file path");
        return 1;
    }
    let mut alias = [0u8; 13];
    let package_path = resolve_package_filename(args, &mut alias);
    let mut p = Pkg::new();
    if !manifest(package_path, &mut p, false) {
        say!("Invalid package header, ABI, filenames or file sizes");
        return 1;
    }
    if opt == b"info" {
        print_pkg(&p);
        return 1;
    }
    if !verify(package_path, &p) {
        say!("Package CRC32/ELF verification failed");
        return 1;
    }
    if opt == b"verify" {
        print_pkg(&p);
        say!("Package integrity OK (CRC32; not a digital signature)");
        return 1;
    }
    install(package_path, &p);
    1
}
