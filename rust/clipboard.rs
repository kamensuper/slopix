//! Main-thread text clipboard (C ABI in src/clipboard.h), stored on the
//! kernel heap. Allocation failure returns 0 and preserves the old text.
use crate::Global;
use core::ffi::c_char;
use core::ptr::null_mut;

struct Clipboard {
    content: *mut u8,
    size: usize,
}
extern "C" {
    fn heap_alloc(bytes: usize) -> *mut u8;
    fn heap_free(ptr: *mut u8) -> i32;
}

static CLIPBOARD: Global<Clipboard> = Global::new(Clipboard { content: null_mut(), size: 0 });

/// Keeps printable ASCII and line/tab whitespace; anything else becomes '?'.
fn sanitize(c: u8) -> u8 {
    match c {
        b'\n' | b'\r' | b'\t' | 32..=126 => c,
        _ => b'?',
    }
}

#[no_mangle]
pub unsafe extern "C" fn clipboard_set(data: *const c_char, bytes: usize) -> usize {
    let clip = CLIPBOARD.get();
    if (data.is_null() && bytes != 0) || bytes == usize::MAX {
        return 0;
    }
    if bytes == 0 {
        heap_free((*clip).content);
        (*clip).content = null_mut();
        (*clip).size = 0;
        return 0;
    }
    let next = heap_alloc(bytes + 1);
    if next.is_null() {
        return 0;
    }
    // SAFETY: the caller passes `bytes` readable bytes; next holds bytes + 1.
    let source = core::slice::from_raw_parts(data as *const u8, bytes);
    let target = core::slice::from_raw_parts_mut(next, bytes + 1);
    for (out, &c) in target.iter_mut().zip(source) {
        *out = sanitize(c);
    }
    target[bytes] = 0;
    heap_free((*clip).content);
    (*clip).content = next;
    (*clip).size = bytes;
    bytes
}

#[no_mangle]
pub unsafe extern "C" fn clipboard_get(bytes: *mut usize) -> *const c_char {
    let clip = CLIPBOARD.get();
    if !bytes.is_null() {
        *bytes = (*clip).size;
    }
    if (*clip).content.is_null() {
        c"".as_ptr()
    } else {
        (*clip).content as *const c_char
    }
}
