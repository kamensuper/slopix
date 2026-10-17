CC := gcc
LD := ld
HOSTCC ?= cc
RUSTC ?= rustc
ICONS ?= terminal demo doom
GRUB_MKRESCUE ?= grub-mkrescue
CFLAGS := -std=c11 -O2 -g -Wall -Wextra -Werror -ffreestanding -fno-builtin -fno-pie -fno-stack-protector -fno-asynchronous-unwind-tables -m64 -mno-red-zone -mgeneral-regs-only
include doom.mk
.DEFAULT_GOAL := all
OBJS := build/entry.o build/kernel.o build/arch.o build/graphics.o build/terminal.o build/input.o build/desktop.o build/cube.o build/memory.o build/runtime.o build/brand.o build/doom_libc.o build/doom_app.o build/doom_system.o build/wad.o $(DOOM_OBJS)
ifneq ($(BENCH),)
CFLAGS += -DRENDER_BENCH
endif
LDFLAGS := --gc-sections -nostdlib -z max-page-size=0x1000 -T linker.ld
.PHONY: all run debug smoke test renderer-test memory-test icons clean
all: build/slopix.iso
build:
	mkdir -p build
build/entry.o: src/entry.S | build
	$(CC) -m64 -g -fno-pie -c $< -o $@
build/%.o: src/%.c src/kernel.h src/font.h src/sine.h src/icons.h | build
	$(CC) $(CFLAGS) -c $< -o $@
build/libslopix_memory.a: rust/memory.rs rust-toolchain.toml | build
	$(RUSTC) --edition=2021 --crate-name slopix_memory --crate-type=staticlib --target x86_64-unknown-none -C panic=abort -C opt-level=2 -C relocation-model=static $< -o $@
src/icons.h: tools/build_icons.py $(foreach icon,$(ICONS),assets/icons/source/$(icon)-256.png)
	python3 tools/build_icons.py --icons $(ICONS)
icons:
	python3 tools/build_icons.py --icons $(ICONS)
build/kernel.elf: $(OBJS) build/libslopix_memory.a linker.ld
	$(LD) $(LDFLAGS) $(OBJS) build/libslopix_memory.a -o $@
	grub-file --is-x86-multiboot2 $@
	@test -z "`nm -u $@`"
build/slopix.iso: build/kernel.elf boot/grub/grub.cfg
	mkdir -p build/iso/boot/grub
	cp build/kernel.elf build/iso/boot/kernel.elf
	cp boot/grub/grub.cfg build/iso/boot/grub/grub.cfg
	$(GRUB_MKRESCUE) -o $@ build/iso
run: all
	qemu-system-x86_64 -machine pc -accel tcg -cpu qemu64 -m 256 -vga std -nic none -cdrom build/slopix.iso -boot d -serial stdio -no-reboot -no-shutdown
debug: all
	qemu-system-x86_64 -machine pc -accel tcg -cpu qemu64 -m 256 -vga std -nic none -cdrom build/slopix.iso -boot d -serial stdio -no-reboot -no-shutdown -s -S
smoke: all
	python3 tests/smoke.py
build/renderer-test: tests/renderer_test.c src/cube.c src/kernel.h src/sine.h src/icons.h | build
	$(HOSTCC) -std=c11 -O1 -g -fsanitize=address,undefined $< -o $@
build/graphics-test: tests/graphics_test.c src/graphics.c src/kernel.h src/font.h | build
	$(HOSTCC) -std=c11 -O1 -g -fsanitize=address,undefined $< -o $@
renderer-test: build/renderer-test build/graphics-test
	ASAN_OPTIONS=detect_leaks=0 timeout 30s ./build/renderer-test
	ASAN_OPTIONS=detect_leaks=0 timeout 30s ./build/graphics-test
build/memory-rust-tests: rust/memory.rs | build
	$(RUSTC) --edition=2021 --test $< -o $@
build/libmemory-host.a: rust/memory.rs | build
	$(RUSTC) --edition=2021 --crate-name slopix_memory_host --crate-type=staticlib -C panic=abort -C opt-level=2 $< -o $@
build/memory-abi-test: tests/memory_abi_test.c src/memory.h build/libmemory-host.a
	$(HOSTCC) -std=c11 -Wall -Wextra -Werror $< build/libmemory-host.a -ldl -lpthread -lm -o $@
memory-test: build/memory-rust-tests build/memory-abi-test
	./build/memory-rust-tests
	./build/memory-abi-test
test: memory-test renderer-test runtime-test doom-compat-test smoke
	python3 tests/icon_test.py
	python3 tests/telemetry.py
	python3 tests/terminal_test.py
	python3 tests/memory_guest_test.py
	python3 tests/input_regression_test.py
	python3 tests/clock_test.py
	python3 tests/window_test.py
	python3 tests/cube_test.py
	python3 tests/reboot_test.py
	python3 tests/models_dock_test.py
	python3 tests/doom_test.py
clean:
	rm -rf build

build/brand.o: src/brand.S assets/brand/wallpaper.rgb
	$(CC) -m64 -c $< -o $@
assets/brand/wallpaper.rgb src/brand.h &: tools/build_brand.py
	python3 tools/build_brand.py
src/meshes.h: tools/build_meshes.py
	python3 tools/build_meshes.py
build/cube.o: src/meshes.h
build/desktop.o: src/brand.h

DOOM_COMPAT_NAMES := malloc free calloc realloc strlen strcmp strncmp strcasecmp strncasecmp strcpy strncpy strcat strchr strrchr strstr strdup abs strtol atoi atof getenv exit abort system printf fprintf vfprintf snprintf vsnprintf sprintf puts putchar fputs fputc fflush sscanf fscanf fopen fclose fread fwrite fseek ftell feof ferror remove rename mkdir fabs stdin stdout stderr errno
build/doom-compat-test.o: src/doom/libc.c
	$(HOSTCC) -std=c11 -O1 -g -fno-builtin -fwrapv -fsanitize=address,undefined -I src/doom/include $(foreach name,$(DOOM_COMPAT_NAMES),-D$(name)=dc_$(name)) -c $< -o $@
build/doom-compat-test: tests/doom_compat_test.c build/doom-compat-test.o build/wad.o
	$(HOSTCC) -std=c11 -O1 -g -no-pie -fsanitize=address,undefined $^ -o $@
doom-compat-test: build/doom-compat-test
	ASAN_OPTIONS=detect_leaks=0 timeout 30s ./build/doom-compat-test

build/runtime-test.o: src/runtime.c src/kernel.h
	$(HOSTCC) -std=c11 -O1 -g -fno-builtin -fsanitize=address,undefined -Dmemcpy=mr_test_memcpy -Dmemmove=mr_test_memmove -Dmemset=mr_test_memset -Dmemcmp=mr_test_memcmp -c $< -o $@
build/runtime-test: tests/runtime_test.c build/runtime-test.o
	$(HOSTCC) -std=c11 -O1 -g -fsanitize=address,undefined $^ -o $@
runtime-test: build/runtime-test
	ASAN_OPTIONS=detect_leaks=0 timeout 30s ./build/runtime-test
