.section .rodata
.global audio_demo_start, audio_demo_end
audio_demo_start:
.incbin "assets/audio/genesis.wav"
audio_demo_end:
.section .note.GNU-stack,"",@progbits
