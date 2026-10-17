DOOM_NAMES := dummy am_map doomdef doomstat dstrings d_event d_items d_iwad d_loop d_main d_mode d_net f_finale f_wipe g_game hu_lib hu_stuff info i_cdmus i_endoom i_joystick i_scale i_sound i_timer memio m_argv m_bbox m_cheat m_config m_controls m_fixed m_menu m_misc m_random p_ceilng p_doors p_enemy p_floor p_inter p_lights p_map p_maputl p_mobj p_plats p_pspr p_saveg p_setup p_sight p_spec p_switch p_telept p_tick p_user r_bsp r_data r_draw r_main r_plane r_segs r_sky r_things sha1 sounds statdump st_lib st_stuff s_sound tables v_video wi_stuff w_checksum w_file w_main w_wad z_zone w_file_stdc i_input i_video doomgeneric
DOOM_OBJS := $(addprefix build/doom/,$(addsuffix .o,$(DOOM_NAMES)))
DOOM_FLAGS := $(filter-out -Werror -mgeneral-regs-only,$(CFLAGS)) -w -fwrapv -ffunction-sections -fdata-sections -I src/doom/include -I vendor/doomgeneric -DDOOMGENERIC_RESX=320 -DDOOMGENERIC_RESY=200
DOOM_HEADERS := $(wildcard vendor/doomgeneric/*.h src/doom/include/*.h src/doom/include/sys/*.h)
build/doom/%.o: vendor/doomgeneric/%.c doom.mk $(DOOM_HEADERS)
	mkdir -p build/doom
	$(CC) $(DOOM_FLAGS) -c $< -o $@
PORT_FLAGS := $(filter-out -mgeneral-regs-only,$(CFLAGS)) -Wno-misleading-indentation -fwrapv -ffunction-sections -fdata-sections -I src/doom/include -I vendor/doomgeneric -DDOOMGENERIC_RESX=320 -DDOOMGENERIC_RESY=200
build/doom_libc.o: src/doom/libc.c doom.mk $(DOOM_HEADERS)
	$(CC) $(PORT_FLAGS) -c $< -o $@
build/doom_app.o: src/doom/app.c doom.mk src/kernel.h $(DOOM_HEADERS)
	$(CC) $(PORT_FLAGS) -c $< -o $@
build/doom_system.o: src/doom/system.c doom.mk $(DOOM_HEADERS)
	$(CC) $(PORT_FLAGS) -c $< -o $@
build/wad.o: src/doom/wad.S assets/freedoom/freedoom1.wad
	$(CC) -m64 -c $< -o $@
