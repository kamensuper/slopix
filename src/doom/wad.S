.section .rodata.wad,"a"
.balign 16
.global freedoom_wad_start,freedoom_wad_end
freedoom_wad_start:
.incbin "assets/freedoom/freedoom1.wad"
freedoom_wad_end:
.section .note.GNU-stack,"",@progbits
