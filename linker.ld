ENTRY(_start)
PHDRS { dma PT_LOAD FLAGS(6); text PT_LOAD FLAGS(5); rodata PT_LOAD FLAGS(4); data PT_LOAD FLAGS(6); }
SECTIONS {
    . = 1M;
    .multiboot : { KEEP(*(.multiboot)) } :text
    .text ALIGN(4K) : { *(.text.boot) *(.text*) } :text
    .audio_dma ALIGN(64K) (NOLOAD) : { KEEP(*(.audio_dma)) } :dma
    ASSERT(ADDR(.audio_dma) + SIZEOF(.audio_dma) <= 16M, "ISA DMA above 16 MiB")
    ASSERT(SIZEOF(.audio_dma) == 2048, "unexpected audio DMA ring size")
    .rodata ALIGN(4K) : { *(.rodata*) } :rodata
    .data ALIGN(4K) : { *(.data*) } :data
    .bss ALIGN(4K) : { *(COMMON) *(.bss*) } :data
    kernel_end = .;
    /DISCARD/ : { *(.eh_frame*) *(.comment*) *(.note*) }
}
