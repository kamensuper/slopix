//! Bounded ELF64 ET_EXEC loader for user programs (C ABI in src/user/elf.h):
//! x86-64, little endian, static PT_LOAD, W^X. No relocations, interpreter,
//! TLS, dynamic linking, executable stack or overlap. The caller destroys the
//! entire private VM on any load failure.
use core::ffi::c_void;

const USER_BASE: u64 = 0x1_0000_0000;
const USER_CODE_END: u64 = USER_BASE + 0x40_0000;
const USER_STACK: u64 = USER_BASE + 0x500_0000;
const USER_STACK_PAGES: u64 = 4;
const VM_WRITE: u64 = 2;
const VM_NX: u64 = 1 << 63;

#[repr(C)]
#[derive(Clone, Copy)]
struct Ehdr {
    ident: [u8; 16],
    kind: u16,
    machine: u16,
    version: u32,
    entry: u64,
    phoff: u64,
    shoff: u64,
    flags: u32,
    ehsize: u16,
    phsize: u16,
    phnum: u16,
    shsize: u16,
    shnum: u16,
    shstr: u16,
}
#[repr(C)]
#[derive(Clone, Copy)]
struct Phdr {
    kind: u32,
    flags: u32,
    offset: u64,
    va: u64,
    pa: u64,
    filesz: u64,
    memsz: u64,
    align: u64,
}
const _: () = assert!(core::mem::size_of::<Ehdr>() == 64 && core::mem::size_of::<Phdr>() == 56);

extern "C" {
    fn user_vm_map(v: *mut c_void, va: u64, flags: u64) -> i32;
    fn user_vm_executable(v: *const c_void, va: u64) -> i32;
    fn user_loader_checkpoint();
}

/// Loads the image into `v` (a `struct user_vm` whose first field is the
/// `tables` array of physical table addresses). Returns 1 and sets `*entry`
/// on success, 0 on any rejection.
#[no_mangle]
pub unsafe extern "C" fn user_elf_load(v: *mut c_void, data: *const u8, bytes: usize, entry: *mut u64) -> i32 {
    if bytes < 64 || bytes > 1_048_576 {
        return 0;
    }
    let b = core::slice::from_raw_parts(data, bytes);
    let e = (b.as_ptr() as *const Ehdr).read_unaligned();
    if e.ident[..7] != [127, b'E', b'L', b'F', 2, 1, 1]
        || e.kind != 2
        || e.machine != 62
        || e.version != 1
        || e.ehsize != 64
        || e.phsize != 56
        || e.phnum == 0
        || e.phnum > 16
        || e.flags != 0
        || e.phoff < 64
        || e.phoff > bytes as u64
        || e.phnum as u64 > (bytes as u64 - e.phoff) / 56
    {
        return 0;
    }
    let (mut loaded, mut entry_valid) = (0u32, false);
    for n in 0..e.phnum as usize {
        let p = (b.as_ptr().add(e.phoff as usize + n * 56) as *const Phdr).read_unaligned();
        if p.kind == 2 || p.kind == 3 || p.kind == 7 || (p.kind == 0x6474_e551 && p.flags & 1 != 0) {
            return 0;
        }
        if p.kind != 1 || p.memsz == 0 {
            continue;
        }
        if p.flags & !7 != 0
            || p.flags & 4 == 0
            || p.flags & 3 == 3
            || p.va < USER_BASE + 4096
            || p.va >= USER_CODE_END
            || p.memsz > USER_CODE_END - p.va
            || p.filesz > p.memsz
            || p.offset > bytes as u64
            || p.filesz > bytes as u64 - p.offset
            || p.va & 4095 != p.offset & 4095
            || p.align > 4096
            || (p.align != 0 && p.align & (p.align - 1) != 0)
        {
            return 0;
        }
        let first = p.va & !4095;
        let end = (p.va + p.memsz + 4095) & !4095;
        let flags = if p.flags & 2 != 0 {
            VM_WRITE | VM_NX
        } else if p.flags & 1 != 0 {
            0
        } else {
            VM_NX
        };
        let mut a = first;
        while a < end {
            if user_vm_map(v, a, flags) == 0 {
                return 0;
            }
            user_loader_checkpoint();
            a += 4096;
        }
        if p.flags & 1 != 0 && e.entry >= p.va && e.entry - p.va < p.filesz {
            entry_valid = true;
        }
        // The loader writes through supervisor identity aliases, including read-only code.
        let tables = v as *const u64;
        let mut done = 0u64;
        while done < p.filesz {
            let a = p.va + done;
            let bank = ((a - USER_BASE) >> 21) as usize;
            let pt = *tables.add(3 + bank) as usize as *const u64;
            let page = *pt.add(((a >> 12) & 511) as usize);
            if page & 1 == 0 {
                return 0;
            }
            let n = (4096 - (a & 4095)).min(p.filesz - done) as usize;
            let dst = ((page & 0x000f_ffff_ffff_f000) + (a & 4095)) as usize as *mut u8;
            core::ptr::copy_nonoverlapping(b.as_ptr().add((p.offset + done) as usize), dst, n);
            done += n as u64;
        }
        loaded += 1;
    }
    if loaded == 0 || !entry_valid || user_vm_executable(v, e.entry) == 0 {
        return 0;
    }
    for i in 0..USER_STACK_PAGES {
        if user_vm_map(v, USER_STACK - (i + 1) * 4096, VM_WRITE | VM_NX) == 0 {
            return 0;
        }
    }
    *entry = e.entry;
    1
}
