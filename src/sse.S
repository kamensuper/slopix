/* Checkpoint 08: SSE2 bulk copy primitives.
 *
 * The kernel is compiled -mgeneral-regs-only, so GCC refuses XMM clobbers in
 * inline asm; these routines live in assembly instead. They are called by
 * runtime.c only for count >= 64 and they save/restore xmm0..3 themselves,
 * because an IRQ can land in the middle of a block and run another copy.
 * Only whole 16-byte blocks are touched: no access crosses [base,base+count).
 *
 * SysV AMD64 ABI: rdi, rsi, rdx in; rax = dst out. */
.section .text

/* void *slopix_memcpy_sse(void *dst, const void *src, size_t count) */
.global slopix_memcpy_sse
.type slopix_memcpy_sse,@function
slopix_memcpy_sse:
    sub $64,%rsp
    movdqu %xmm0, 0(%rsp)
    movdqu %xmm1,16(%rsp)
    movdqu %xmm2,32(%rsp)
    movdqu %xmm3,48(%rsp)
    mov %rdi,%rax
.Lcp64:
    cmp $64,%rdx
    jb .Lcp16
    movdqu  0(%rsi),%xmm0
    movdqu 16(%rsi),%xmm1
    movdqu 32(%rsi),%xmm2
    movdqu 48(%rsi),%xmm3
    movdqu %xmm0, 0(%rdi)
    movdqu %xmm1,16(%rdi)
    movdqu %xmm2,32(%rdi)
    movdqu %xmm3,48(%rdi)
    add $64,%rsi
    add $64,%rdi
    sub $64,%rdx
    jmp .Lcp64
.Lcp16:
    mov %rdx,%rcx
    shr $4,%rcx
    jz .Lcptail
.Lcp16loop:
    movdqu (%rsi),%xmm0
    movdqu %xmm0,(%rdi)
    add $16,%rsi
    add $16,%rdi
    dec %rcx
    jnz .Lcp16loop
.Lcptail:
    and $15,%rdx
    jz .Lcpdone
.Lcpbyte:
    movzbl (%rsi),%ecx
    mov %cl,(%rdi)
    inc %rsi
    inc %rdi
    dec %rdx
    jnz .Lcpbyte
.Lcpdone:
    movdqu 0(%rsp),%xmm0
    movdqu 16(%rsp),%xmm1
    movdqu 32(%rsp),%xmm2
    movdqu 48(%rsp),%xmm3
    add $64,%rsp
    ret

/* void *slopix_memset_sse(void *dst, int value, size_t count) */
.global slopix_memset_sse
.type slopix_memset_sse,@function
slopix_memset_sse:
    sub $16,%rsp
    movdqu %xmm0,(%rsp)
    movzbl %sil,%r8d
    imul $0x01010101,%r8d,%eax
    movd %eax,%xmm0
    pshufd $0,%xmm0,%xmm0
    mov %rdi,%rax
.Lms64:
    cmp $64,%rdx
    jb .Lms16
    movdqu %xmm0, 0(%rdi)
    movdqu %xmm0,16(%rdi)
    movdqu %xmm0,32(%rdi)
    movdqu %xmm0,48(%rdi)
    add $64,%rdi
    sub $64,%rdx
    jmp .Lms64
.Lms16:
    mov %rdx,%rcx
    shr $4,%rcx
    jz .Lmstail
.Lms16loop:
    movdqu %xmm0,(%rdi)
    add $16,%rdi
    dec %rcx
    jnz .Lms16loop
.Lmstail:
    and $15,%rdx
    jz .Lmsdone
.Lmsbyte:
    mov %r8b,(%rdi)
    inc %rdi
    dec %rdx
    jnz .Lmsbyte
.Lmsdone:
    movdqu (%rsp),%xmm0
    add $16,%rsp
    ret

/* void *slopix_memmove_sse(void *dst, const void *src, size_t count)
 * Precondition: dst > src and the ranges overlap. Copies backwards. */
.global slopix_memmove_sse
.type slopix_memmove_sse,@function
slopix_memmove_sse:
    sub $16,%rsp
    movdqu %xmm0,(%rsp)
    mov %rdi,%rax
    add %rdx,%rdi
    add %rdx,%rsi
.Lmm16:
    cmp $16,%rdx
    jb .Lmmtail
    sub $16,%rdi
    sub $16,%rsi
    movdqu (%rsi),%xmm0
    movdqu %xmm0,(%rdi)
    sub $16,%rdx
    jmp .Lmm16
.Lmmtail:
    test %rdx,%rdx
    jz .Lmmdone
.Lmmbyte:
    dec %rdi
    dec %rsi
    movzbl (%rsi),%ecx
    mov %cl,(%rdi)
    dec %rdx
    jnz .Lmmbyte
.Lmmdone:
    movdqu (%rsp),%xmm0
    add $16,%rsp
    ret

/* void slopix_mask_copy(uint32_t *dst, const uint32_t *src, size_t pixels)
 * dst[i] = src[i] & 0x00ffffff, 8 pixels per iteration. Used by the
 * framebuffer present path when no channel swizzle is required. */
.global slopix_mask_copy
.type slopix_mask_copy,@function
slopix_mask_copy:
    sub $48,%rsp
    movdqu %xmm0, 0(%rsp)
    movdqu %xmm1,16(%rsp)
    movdqu %xmm2,32(%rsp)
    pcmpeqd %xmm2,%xmm2
    psrld $8,%xmm2
.Lmc8:
    cmp $8,%rdx
    jb .Lmctail
    movdqu  0(%rsi),%xmm0
    movdqu 16(%rsi),%xmm1
    pand %xmm2,%xmm0
    pand %xmm2,%xmm1
    movdqu %xmm0, 0(%rdi)
    movdqu %xmm1,16(%rdi)
    add $32,%rsi
    add $32,%rdi
    sub $8,%rdx
    jmp .Lmc8
.Lmctail:
    test %rdx,%rdx
    jz .Lmcdone
.Lmc1:
    mov (%rsi),%eax
    and $0x00ffffff,%eax
    mov %eax,(%rdi)
    add $4,%rsi
    add $4,%rdi
    dec %rdx
    jnz .Lmc1
.Lmcdone:
    movdqu  0(%rsp),%xmm0
    movdqu 16(%rsp),%xmm1
    movdqu 32(%rsp),%xmm2
    add $48,%rsp
    ret

.section .note.GNU-stack,"",@progbits
