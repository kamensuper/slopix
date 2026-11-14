CC ?= gcc
LD ?= ld
CFLAGS := -std=c11 -O2 -Wall -Wextra -Werror -ffreestanding -fno-pie -fno-stack-protector -fno-asynchronous-unwind-tables -mcmodel=large -m64 -mno-red-zone
all: HELLO.ELF READ.ELF DEMO.ELF STORE.ELF BROWSE.ELF HELLOGUI.ELF TERM.ELF FIND.ELF SET.ELF FILES.ELF DOOM.ELF LIBCDEMO.ELF BENCH.ELF
example.o: example.c slopix.h
	$(CC) $(CFLAGS) -c $< -o $@
HELLO.ELF: example.o user.ld
	$(LD) -nostdlib -z max-page-size=0x1000 -T user.ld example.o -o $@
read.o: read.c slopix.h
	$(CC) $(CFLAGS) -c $< -o $@
READ.ELF: read.o user.ld
	$(LD) -nostdlib -z max-page-size=0x1000 -T user.ld read.o -o $@
demo.o: demo.c demo_shim.h slopix.h font.h
	$(CC) $(CFLAGS) -c $< -o $@
demo_cube.o: ../src/cube.c ../src/meshes.h ../src/sine.h demo_shim.h
	$(CC) $(CFLAGS) -DSLOPIX_USER -c $< -o $@
DEMO.ELF: demo.o demo_cube.o user.ld
	$(LD) -nostdlib -z max-page-size=0x1000 -T user.ld demo.o demo_cube.o -o $@
store.o: store.c slopix.h
	$(CC) $(CFLAGS) -c $< -o $@
STORE.ELF: store.o user.ld
	$(LD) -nostdlib -z max-page-size=0x1000 -T user.ld store.o -o $@
browser.o: browser.c browser_html.h slopix.h font.h
	$(CC) $(CFLAGS) -c $< -o $@
BROWSE.ELF: browser.o user.ld
	$(LD) -nostdlib -z max-page-size=0x1000 -T user.ld browser.o -o $@
clean:
	rm -rf doom-build doom.o doom_libc.o doom_system.o doom_sound.o DOOM.ELF
	rm -f terminal.o find.o settings.o files.o TERM.ELF FIND.ELF SET.ELF FILES.ELF example.o read.o demo.o demo_cube.o store.o browser.o hellogui.o HELLO.ELF READ.ELF DEMO.ELF STORE.ELF BROWSE.ELF HELLOGUI.ELF
	rm -f libcdemo.o LIBCDEMO.ELF bench.o BENCH.ELF
	$(MAKE) -C libc clean
.PHONY: all clean

hellogui.o: hellogui.c slopix.h font.h
	$(CC) $(CFLAGS) -c $< -o $@
HELLOGUI.ELF: hellogui.o user.ld
	$(LD) -nostdlib -z max-page-size=0x1000 -T user.ld hellogui.o -o $@

# Checkpoint 07: a program built against sdk/libc instead of hand-rolled helpers.
libc/libc.a libc/crt0.o: $(wildcard libc/src/*.c) $(wildcard libc/include/*.h) libc/Makefile
	$(MAKE) -C libc

libcdemo.o: libcdemo.c $(wildcard libc/include/*.h)
	$(CC) $(CFLAGS) -I libc/include -c $< -o $@

LIBCDEMO.ELF: libcdemo.o libc/crt0.o libc/libc.a libc/user.ld
	$(LD) -nostdlib --gc-sections -z max-page-size=0x1000 -T libc/user.ld libc/crt0.o libcdemo.o libc/libc.a -o $@

# Checkpoint 08: SSE2 throughput and cross-process SSE state integrity.
bench.o: bench.c $(wildcard libc/include/*.h)
	$(CC) $(CFLAGS) -I libc/include -c $< -o $@

BENCH.ELF: bench.o libc/crt0.o libc/libc.a libc/user.ld
	$(LD) -nostdlib --gc-sections -z max-page-size=0x1000 -T libc/user.ld libc/crt0.o bench.o libc/libc.a -o $@

# Native Ring-3 Genesis desktop applications (no kernel UI linkage).
TERM.ELF: terminal.c gui_kit.h font.h slopix.h user.ld
	$(CC) $(CFLAGS) -c terminal.c -o terminal.o
	$(LD) -nostdlib -z max-page-size=0x1000 -T user.ld terminal.o -o $@
FIND.ELF: find.c gui_kit.h font.h slopix.h user.ld
	$(CC) $(CFLAGS) -c find.c -o find.o
	$(LD) -nostdlib -z max-page-size=0x1000 -T user.ld find.o -o $@
SET.ELF: settings.c gui_kit.h font.h slopix.h user.ld
	$(CC) $(CFLAGS) -c settings.c -o settings.o
	$(LD) -nostdlib -z max-page-size=0x1000 -T user.ld settings.o -o $@
FILES.ELF: files.c gui_kit.h font.h slopix.h user.ld
	$(CC) $(CFLAGS) -c files.c -o files.o
	$(LD) -nostdlib -z max-page-size=0x1000 -T user.ld files.o -o $@

# Genuine Ring-3 DoomGeneric build with private ELF code/data and FAT32 WAD.
DOOM_NAMES := dummy am_map doomdef doomstat dstrings d_event d_items d_iwad d_loop d_main d_mode d_net f_finale f_wipe g_game hu_lib hu_stuff info i_cdmus i_endoom i_joystick i_scale i_sound i_timer memio m_argv m_bbox m_cheat m_config m_controls m_fixed m_menu m_misc m_random p_ceilng p_doors p_enemy p_floor p_inter p_lights p_map p_maputl p_mobj p_plats p_pspr p_saveg p_setup p_sight p_spec p_switch p_telept p_tick p_user r_bsp r_data r_draw r_main r_plane r_segs r_sky r_things sha1 sounds statdump st_lib st_stuff s_sound tables v_video wi_stuff w_checksum w_file w_main w_wad z_zone w_file_stdc i_input i_video doomgeneric
DOOM_OBJS := $(addprefix doom-build/,$(addsuffix .o,$(DOOM_NAMES)))
DOOM_USER_FLAGS := $(filter-out -Werror,$(CFLAGS)) -w -fwrapv -ffunction-sections -fdata-sections -I../src/doom/include -I../vendor/doomgeneric -DSLOPIX_USER -DSLOPIX_SFX -DDOOMGENERIC_RESX=320 -DDOOMGENERIC_RESY=200
DHEADERS := $(wildcard ../src/doom/include/*.h ../src/doom/include/sys/*.h ../vendor/doomgeneric/*.h)
doom-build/%.o: ../vendor/doomgeneric/%.c $(DHEADERS)
	mkdir -p doom-build
	$(CC) $(DOOM_USER_FLAGS) -c $< -o $@
doom.o: doom.c slopix.h $(DHEADERS)
	$(CC) $(DOOM_USER_FLAGS) -c $< -o $@
doom_libc.o: doom_libc.c slopix.h $(DHEADERS)
	$(CC) $(DOOM_USER_FLAGS) -c $< -o $@
doom_system.o: doom_system.c slopix.h $(DHEADERS)
	$(CC) $(DOOM_USER_FLAGS) -c $< -o $@
doom_sound.o: doom_sound.c slopix.h $(DHEADERS)
	$(CC) $(DOOM_USER_FLAGS) -c $< -o $@
DOOM.ELF: doom.o doom_libc.o doom_system.o doom_sound.o $(DOOM_OBJS) user.ld
	$(LD) -nostdlib --gc-sections -z max-page-size=0x1000 -T user.ld doom.o doom_libc.o doom_system.o doom_sound.o $(DOOM_OBJS) -o $@
