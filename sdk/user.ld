ENTRY(_start)
PHDRS { code PT_LOAD FLAGS(5); data PT_LOAD FLAGS(6); }
SECTIONS {
 . = 0x100001000;
 .text : { *(.text*) *(.rodata*) } :code
 . = ALIGN(4096);
 .data : { *(.data*) } :data
 .bss : { *(.bss*) *(COMMON) } :data
 /DISCARD/ : { *(.eh_frame*) *(.comment*) *(.note*) }
}
