/* Single-CPU, main-loop initiated user slices. IRQ C code uses general registers.
 * FXSAVE/FXRSTOR preserve kernel and each process's complete x87/SSE state.
 * AVX/XSAVE and kernel preemption are deliberately not enabled. */
.section .bss
.balign 16
kernel_fp: .skip 512
saved_rsp: .quad 0
saved_cr3: .quad 0
active_fp: .quad 0
.section .rodata
mxcsr_default: .long 0x1f80
.section .text
.global user_fp_init
user_fp_init:
 fxsave kernel_fp(%rip)
 fninit
 .rept 8
 fldz
 .endr
 fninit
 ldmxcsr mxcsr_default(%rip)
 pxor %xmm0,%xmm0
 pxor %xmm1,%xmm1
 pxor %xmm2,%xmm2
 pxor %xmm3,%xmm3
 pxor %xmm4,%xmm4
 pxor %xmm5,%xmm5
 pxor %xmm6,%xmm6
 pxor %xmm7,%xmm7
 pxor %xmm8,%xmm8
 pxor %xmm9,%xmm9
 pxor %xmm10,%xmm10
 pxor %xmm11,%xmm11
 pxor %xmm12,%xmm12
 pxor %xmm13,%xmm13
 pxor %xmm14,%xmm14
 pxor %xmm15,%xmm15
 fxsave (%rdi)
 fxrstor kernel_fp(%rip)
 ret
.global user_enter
user_enter:
 pushfq
 cli
 push %rbx
 push %rbp
 push %r12
 push %r13
 push %r14
 push %r15
 mov %rsp,saved_rsp(%rip)
 mov %cr3,%rax
 mov %rax,saved_cr3(%rip)
 mov %rdx,active_fp(%rip)
 fxsave kernel_fp(%rip)
 fxrstor (%rdx)
 mov %rsi,%cr3
 mov %rdi,%rsp
 mov $0x1b,%ax
 mov %ax,%ds
 mov %ax,%es
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
 add $16,%rsp
 iretq
.global user_leave
user_leave:
 cli
 mov active_fp(%rip),%rax
 fxsave (%rax)
 fxrstor kernel_fp(%rip)
 mov saved_cr3(%rip),%rax
 mov %rax,%cr3
 mov $0x10,%ax
 mov %ax,%ds
 mov %ax,%es
 mov %ax,%ss
 mov saved_rsp(%rip),%rsp
 pop %r15
 pop %r14
 pop %r13
 pop %r12
 pop %rbp
 pop %rbx
 popfq
 ret
.section .note.GNU-stack,"",@progbits
