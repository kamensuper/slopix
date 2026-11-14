/* GRUB enters at _start in 32-bit protected mode (Multiboot2). */
.section .multiboot,"a"
.balign 8
header:
.long 0xe85250d6, 0, header_end-header
.long -(0xe85250d6 + (header_end-header))
.short 5, 0
.long 20, 1280, 800, 32
.balign 8
.short 0, 0
.long 8
header_end:

.section .text.boot,"ax"
.code32
.global _start
.type _start,@function
_start:
    cli
    cld
    mov %ebx, %edi
    mov %eax, %esi
    mov $stack_top, %esp
    /* Four page directories identity-map 0..4 GiB using 2 MiB pages. */
    mov $pdpt, %eax
    or $3, %eax
    mov %eax, pml4
    xor %ecx, %ecx
1:
    mov %ecx, %eax
    shl $12, %eax
    add $pds, %eax
    or $3, %eax
    mov %eax, pdpt(,%ecx,8)
    inc %ecx
    cmp $4, %ecx
    jne 1b
    xor %ecx, %ecx
2:
    mov %ecx, %eax
    shl $21, %eax
    or $0x83, %eax
    mov %eax, pds(,%ecx,8)
    inc %ecx
    cmp $2048, %ecx
    jne 2b
    mov %cr4, %eax
    or $0x20, %eax
    mov %eax, %cr4
    mov $pml4, %eax
    mov %eax, %cr3
    mov $0xc0000080, %ecx
    rdmsr
    or $0x100, %eax
    wrmsr
    lgdt gdt_ptr
    mov %cr0, %eax
    or $0x80000000, %eax
    mov %eax, %cr0
    ljmp $8, $long_entry
.code64
long_entry:
    mov $16, %ax
    mov %ax, %ds
    mov %ax, %es
    mov %ax, %ss
    xor %eax, %eax
    mov %ax, %fs
    mov %ax, %gs
    mov $stack_top, %rsp
    /* Enable x87/SSE once, before any C code runs: the kernel's bulk copies
     * and fills use SSE2 (src/sse.S) and Doom uses scalar float. Kernel C is
     * compiled -mgeneral-regs-only, so no XMM value is live across a call;
     * per-process SSE state is FXSAVEd/FXRSTORed in src/user/user.S. */
    mov %cr0, %rax
    and $-13, %rax
    or $2, %rax
    mov %rax, %cr0
    mov %cr4, %rax
    or $0x600, %rax
    mov %rax, %cr4
    fninit
    xor %ebp, %ebp
    /* edi=information address; esi=Multiboot magic; SysV ABI. */
    call kernel_main
.global kernel_idle
kernel_idle:
    cli
    hlt
    jmp kernel_idle
.balign 8
gdt:
.quad 0, 0x00af9a000000ffff, 0x00cf92000000ffff
gdt_ptr:
.word .-gdt-1
.long gdt
.section .bss,"aw",@nobits
.balign 4096
pml4: .skip 4096
.global boot_pdpt
boot_pdpt:
pdpt: .skip 4096
.global boot_page_directories
boot_page_directories:
pds: .skip 16384
.balign 16
stack_bottom: .skip 65536
stack_top:
.section .note.GNU-stack,"",@progbits

.section .text,"ax"
.code64
.extern arch_fault
.macro EXCEPTION n, error=0
.global fault_\n
fault_\n:
.if !\error
    pushq $0
.endif
    pushq $\n
    jmp fault_common
.endm
EXCEPTION 0
EXCEPTION 1
EXCEPTION 2
EXCEPTION 3
EXCEPTION 4
EXCEPTION 5
EXCEPTION 6
EXCEPTION 7
EXCEPTION 8,1
EXCEPTION 9
EXCEPTION 10,1
EXCEPTION 11,1
EXCEPTION 12,1
EXCEPTION 13,1
EXCEPTION 14,1
EXCEPTION 15
EXCEPTION 16
EXCEPTION 17,1
EXCEPTION 18
EXCEPTION 19
EXCEPTION 20
EXCEPTION 21,1
EXCEPTION 22
EXCEPTION 23
EXCEPTION 24
EXCEPTION 25
EXCEPTION 26
EXCEPTION 27
EXCEPTION 28
EXCEPTION 29,1
EXCEPTION 30,1
EXCEPTION 31
/* Uniform saved-register layout matches struct user_frame exactly. */
.macro SAVE_REGS
    push %rax
    push %rbx
    push %rcx
    push %rdx
    push %rsi
    push %rdi
    push %rbp
    push %r8
    push %r9
    push %r10
    push %r11
    push %r12
    push %r13
    push %r14
    push %r15
.endm
.macro RESTORE_REGS
    pop %r15
    pop %r14
    pop %r13
    pop %r12
    pop %r11
    pop %r10
    pop %r9
    pop %r8
    pop %rbp
    pop %rdi
    pop %rsi
    pop %rdx
    pop %rcx
    pop %rbx
    pop %rax
.endm
fault_common:
    cli
    cld
    SAVE_REGS
    mov %rsp,%rdi
    and $-16,%rsp
    call process_exception
    jmp kernel_idle
.macro IRQ_HANDLER name, function, vector, pointer=0
.global \name
\name:
    cld
    pushq $0
    pushq $\vector
    SAVE_REGS
    mov %rsp,%rbx
.if \pointer
    mov %rbx,%rdi
.endif
    and $-16,%rsp
    call \function
    mov %rbx,%rsp
    RESTORE_REGS
    add $16,%rsp
    iretq
.endm
IRQ_HANDLER irq_timer, timer_dispatch, 32, 1
IRQ_HANDLER irq_keyboard, keyboard_irq, 33
IRQ_HANDLER irq_mouse, mouse_irq, 44
IRQ_HANDLER irq_audio, audio_irq, 37
IRQ_HANDLER syscall_entry, process_syscall, 128, 1
.section .rodata,"a"
.global exception_stubs
exception_stubs:
.macro PTR n
.quad fault_\n
.endm
PTR 0
PTR 1
PTR 2
PTR 3
PTR 4
PTR 5
PTR 6
PTR 7
PTR 8
PTR 9
PTR 10
PTR 11
PTR 12
PTR 13
PTR 14
PTR 15
PTR 16
PTR 17
PTR 18
PTR 19
PTR 20
PTR 21
PTR 22
PTR 23
PTR 24
PTR 25
PTR 26
PTR 27
PTR 28
PTR 29
PTR 30
PTR 31
