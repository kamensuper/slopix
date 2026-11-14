/* Slopix userspace linker script.
 * Deliberately emits no PT_TLS: the kernel ELF loader accepts only PT_LOAD and
 * explicitly rejects PT_TLS/PT_DYNAMIC/PT_INTERP. Each process owns a private
 * address space, so ordinary .bss storage is already per-process "TLS". */
ENTRY(_start)
PHDRS {
    code PT_LOAD FLAGS(5);      /* R-X */
    data PT_LOAD FLAGS(6);      /* RW- */
}
SECTIONS {
    . = 0x100001000;
    .text : {
        *(.text.unlikely) *(.text.startup) *(.text.exit)
        *(.text) *(.text.*) *(.gnu.linkonce.t.*)
        *(.rodata) *(.rodata.*) *(.gnu.linkonce.r.*)
        *(.init_array) *(.fini_array)
    } :code

    . = ALIGN(4096);
    .data : {
        *(.data) *(.data.*) *(.gnu.linkonce.d.*)
        *(.tdata) *(.tdata.*)
    } :data

    .bss : {
        *(.tbss) *(.tbss.*)
        *(.bss) *(.bss.*) *(.gnu.linkonce.b.*)
        *(COMMON)
        . = ALIGN(8);
        __bss_end = .;
    } :data

    /DISCARD/ : {
        *(.eh_frame) *(.eh_frame_hdr) *(.comment) *(.note.*)
    }
}