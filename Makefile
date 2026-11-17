CC := gcc
LD := ld
HOSTCC ?= cc
RUSTC ?= rustc
ICONS ?= terminal demo doom find settings
GRUB_MKRESCUE ?= grub-mkrescue
GRUB_PLATFORM_DIR ?= /usr/lib/grub/i386-pc
CFLAGS := -std=c11 -O2 -g -MMD -MP -ffile-prefix-map="$(CURDIR)"=. -Wall -Wextra -Werror -ffreestanding -fno-builtin -fno-pie -fno-stack-protector -fno-asynchronous-unwind-tables -m64 -mno-red-zone -mgeneral-regs-only
include doom.mk
.DEFAULT_GOAL := all
OBJS := build/rtl8139.o build/net_stack.o build/net_http.o build/account.o build/auth.o build/slop_package.o build/files_app.o build/vfs.o build/fat_backend.o build/desktop_service.o build/ui_shell.o build/ui_chrome.o build/dwm.o build/user_vm.o build/user_elf.o build/process.o build/user_gui.o build/user_arch.o build/user_asm.o build/apps.o build/display.o build/audio.o build/sb16.o build/audio_demo.o build/entry.o build/kernel.o build/ata.o build/fat32.o build/arch.o build/graphics.o build/terminal.o build/input.o build/desktop.o build/cube.o build/memory.o build/runtime.o build/brand.o build/sse.o
ifneq ($(BENCH),)
CFLAGS += -DRENDER_BENCH
endif
LDFLAGS := --gc-sections -nostdlib -z max-page-size=0x1000 -T linker.ld
.PHONY: all run run-no-disk debug smoke test renderer-test memory-test icons clean
all: build/slopix.iso sdk
build:
	mkdir -p build
build/entry.o: src/entry.S | build
	$(CC) -m64 -g -ffile-prefix-map="$(CURDIR)"=. -fno-pie -c $< -o $@
build/%.o: src/%.c src/kernel.h src/font.h src/sine.h src/icons.h | build
	$(CC) $(CFLAGS) -c $< -o $@
build/dwm.o: src/ui/dwm.c src/kernel.h src/font.h src/sine.h src/icons.h | build
	$(CC) $(CFLAGS) -c $< -o $@
RUST_SRCS := $(wildcard rust/*.rs)
RUSTFLAGS_COMMON := --edition=2021 -C panic=abort -C opt-level=2
build/libslopix.a: $(RUST_SRCS) rust-toolchain.toml | build
	$(RUSTC) $(RUSTFLAGS_COMMON) --crate-name slopix --crate-type=staticlib --target x86_64-unknown-none -C relocation-model=static rust/lib.rs -o $@
# Host staticlib holding only the Rust parts named in the target, separated by
# dashes (build/librust-host-heap-clipboard.a), so a C host test can stub the rest.
build/librust-host-%.a: $(RUST_SRCS) | build
	$(RUSTC) $(RUSTFLAGS_COMMON) --crate-name slopix_host --crate-type=staticlib --cfg host_subset $(foreach part,$(subst -, ,$*),--cfg 'part="$(part)"') rust/lib.rs -o $@
src/icons.h: tools/build_icons.py $(foreach icon,$(ICONS),assets/icons/source/$(icon)-256.png)
	python3 tools/build_icons.py --icons $(ICONS)
icons:
	python3 tools/build_icons.py --icons $(ICONS)
	python3 tools/build_ui_icons.py
build/kernel.elf: $(OBJS) build/libslopix.a linker.ld
	$(LD) $(LDFLAGS) $(OBJS) build/libslopix.a -o $@
	grub-file --is-x86-multiboot2 $@
	@test -z "`nm -u $@`"
build/slopix.iso: build/kernel.elf boot/grub/grub.cfg tools/build_iso.py
	python3 tools/build_iso.py --grub "$(GRUB_MKRESCUE)" --platform "$(GRUB_PLATFORM_DIR)"

run: all
	sh run.sh
# original explicit launcher is retained for no-disk regression tests
run-no-disk: all
	qemu-system-x86_64 -machine pc -accel tcg -cpu qemu64 -m 256 -vga std -nic none -cdrom build/slopix.iso -boot d -serial stdio -no-reboot -no-shutdown
debug: all
	qemu-system-x86_64 -machine pc -accel tcg -cpu qemu64 -m 256 -vga std -nic none -cdrom build/slopix.iso -boot d -serial stdio -no-reboot -no-shutdown -s -S
smoke: all
	python3 tests/smoke.py
build/renderer-test: tests/renderer_test.c src/cube.c src/kernel.h src/sine.h src/icons.h | build
	$(HOSTCC) -std=c11 -O1 -g -fsanitize=address,undefined $< -o $@
build/graphics-test: tests/graphics_test.c src/graphics.c src/kernel.h src/font.h | build
	$(HOSTCC) -std=c11 -O1 -g -fsanitize=address,undefined $< -o $@
.PHONY: slopde-geom-test
build/slopde-geom-test: tests/slopde_geom_test.c src/ui/chrome_geom.h | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fwrapv $< -o $@
slopde-geom-test: build/slopde-geom-test
	./build/slopde-geom-test
.PHONY: slopde-window-test slopde-anim-test slopde-test
build/slopde-window-test: tests/slopde_window_test.c src/ui/winid.h | build
	$(HOSTCC) -std=c11 -O2 -g -Wall -Wextra -Werror -Warray-bounds=2 -fwrapv $< -o $@
slopde-window-test: build/slopde-window-test
	./build/slopde-window-test
build/slopde-anim-test: tests/slopde_anim_test.c src/ui/anim.h | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fwrapv $< -o $@
slopde-anim-test: build/slopde-anim-test
	./build/slopde-anim-test
build/slopde-transition-test: tests/slopde_transition_test.c src/desktop.c src/ui/anim.h src/ui/winid.h | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -ffunction-sections -fdata-sections $< -Wl,--gc-sections -o $@
.PHONY: slopde-transition-test
slopde-transition-test: build/slopde-transition-test
	./build/slopde-transition-test
slopde-test: slopde-geom-test slopde-window-test slopde-anim-test slopde-transition-test
renderer-test: build/renderer-test build/graphics-test
	ASAN_OPTIONS=detect_leaks=0 timeout 30s ./build/renderer-test
	ASAN_OPTIONS=detect_leaks=0 timeout 30s ./build/graphics-test
build/memory-rust-tests: $(RUST_SRCS) | build
	$(RUSTC) --edition=2021 --test --cfg host_subset --cfg 'part="memory"' rust/lib.rs -o $@
build/memory-abi-test: tests/memory_abi_test.c src/memory.h build/librust-host-memory.a
	$(HOSTCC) -std=c11 -Wall -Wextra -Werror $< build/librust-host-memory.a -ldl -lpthread -lm -o $@
memory-test: build/memory-rust-tests build/memory-abi-test
	./build/memory-rust-tests
	./build/memory-abi-test
test: memory-test renderer-test graphics-resize-test runtime-test doom-compat-test audio-test doom-sound-test smoke
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
	python3 tests/audio_guest_test.py
	python3 tests/doom_audio_test.py
	python3 tests/display_test.py
	python3 tests/display_fallback_test.py
	python3 tests/userspace_guest_test.py
	python3 tests/shell_guest_test.py
	python3 tests/files_guest_test.py
	python3 tests/integration09.py
	python3 tests/polish_guest_test.py
clean:
	rm -rf build
	$(MAKE) -C sdk/libc clean

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
build/doom-compat-test: tests/doom_compat_test.c build/doom-compat-test.o
	$(HOSTCC) -std=c11 -O1 -g -no-pie -fsanitize=address,undefined $^ -o $@
doom-compat-test: build/doom-compat-test
	ASAN_OPTIONS=detect_leaks=0 timeout 30s ./build/doom-compat-test

build/sse-host.o: src/sse.S
	$(HOSTCC) -c $< -o $@
build/runtime-test.o: src/runtime.c src/kernel.h
	$(HOSTCC) -std=c11 -O1 -g -fno-builtin -mno-red-zone -fsanitize=address,undefined -Dmemcpy=mr_test_memcpy -Dmemmove=mr_test_memmove -Dmemset=mr_test_memset -Dmemcmp=mr_test_memcmp -c $< -o $@
build/runtime-test: tests/runtime_test.c build/runtime-test.o build/sse-host.o
	$(HOSTCC) -std=c11 -O1 -g -fsanitize=address,undefined $^ -o $@
runtime-test: build/runtime-test
	ASAN_OPTIONS=detect_leaks=0 timeout 60s ./build/runtime-test
# Sanitizers are unavailable in some containers, so the guarded-memory test is
# also buildable without them.
build/runtime-test-plain.o: src/runtime.c src/kernel.h
	$(HOSTCC) -std=c11 -O2 -g -Wall -Wextra -Werror -fno-builtin -fno-stack-protector -mno-red-zone -Dmemcpy=mr_test_memcpy -Dmemmove=mr_test_memmove -Dmemset=mr_test_memset -Dmemcmp=mr_test_memcmp -c $< -o $@
build/runtime-test-plain: tests/runtime_test.c build/runtime-test-plain.o build/sse-host.o
	$(HOSTCC) -std=c11 -O2 -g -Wall -Wextra -Werror $^ -o $@
runtime-test-plain: build/runtime-test-plain
	timeout 60s ./build/runtime-test-plain

# Storage is separate from kernel initialization and graphics.
build/ata.o: src/storage/ata.c src/storage/storage.h src/kernel.h | build
	$(CC) $(CFLAGS) -c $< -o $@
build/fat32.o: src/storage/fat32.c src/storage/storage.h | build
	$(CC) $(CFLAGS) -c $< -o $@
.PHONY: disk storage-test
disk:
	python3 tools/create_disk.py
storage-test:
	python3 tests/storage_host_test.py

# Audio hardware and PCM code remain separate from boot and desktop code.
build/audio.o: src/audio/audio.c src/audio/audio.h | build
	$(CC) $(CFLAGS) -c $< -o $@
build/sb16.o: src/audio/sb16.c src/audio/audio.h src/kernel.h | build
	$(CC) $(CFLAGS) -c $< -o $@
build/audio_demo.o: src/audio/demo.S assets/audio/genesis.wav | build
	$(CC) -m64 -c $< -o $@
assets/audio/genesis.wav: tools/build_audio.py
	python3 tools/build_audio.py
.PHONY: audio-test
audio-test: | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined tests/audio_test.c src/audio/audio.c -o build/audio-test
	ASAN_OPTIONS=detect_leaks=0 ./build/audio-test

.PHONY: doom-sound-test
doom-sound-test: | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined -I vendor/doomgeneric tests/doom_sound_test.c src/doom/sound.c src/audio/audio.c -o build/doom-sound-test
	ASAN_OPTIONS=detect_leaks=0 ./build/doom-sound-test

build/display.o: src/display/display.c src/display/display.h src/kernel.h src/audio/audio.h | build
	$(CC) $(CFLAGS) -c $< -o $@

build/kernel.o build/desktop.o build/terminal.o: src/display/display.h
.PHONY: graphics-resize-test
graphics-resize-test: | build
	$(HOSTCC) -std=c11 -O1 -g -fsanitize=address,undefined tests/graphics_resize_test.c -o build/graphics-resize-test
	ASAN_OPTIONS=detect_leaks=0 ./build/graphics-resize-test

build/desktop.o: src/audio/audio.h

build/apps.o: src/apps.c src/apps.h src/preferences.h src/perf.h
	$(CC) $(CFLAGS) -Wno-misleading-indentation -c $< -o $@
.PHONY: preferences-test
preferences-test: build/librust-host-preferences.a
	$(HOSTCC) -std=c11 -O1 -g -Wno-misleading-indentation -fsanitize=address,undefined tests/preferences_test.c tests/rust_host_stubs.c build/librust-host-preferences.a -ldl -lpthread -lm -o build/preferences-test
	ASAN_OPTIONS=detect_leaks=0 ./build/preferences-test

build/desktop.o build/terminal.o: src/apps.h src/preferences.h src/perf.h
build/display.o build/kernel.o: src/preferences.h
build/doom/d_main.o: src/perf.h
.PHONY: perf-test
perf-test: build/librust-host-perf.a
	$(HOSTCC) -std=c11 -O1 -g -fsanitize=address,undefined tests/perf_test.c tests/rust_host_stubs.c build/librust-host-perf.a -ldl -lpthread -lm -o build/perf-test
	ASAN_OPTIONS=detect_leaks=0 ./build/perf-test
test: preferences-test perf-test
test: slopde-test
build/input.o: src/perf.h

build/user_vm.o: src/user/vm.c src/user/vm.h src/memory.h
	$(CC) $(CFLAGS) -c $< -o $@
build/user_elf.o: src/user/elf.c src/user/elf.h src/user/vm.h
	$(CC) $(CFLAGS) -c $< -o $@
build/process.o: src/user/process.c src/user/process.h src/user/vm.h src/user/elf.h sdk/slopix.h
	$(CC) $(CFLAGS) -c $< -o $@
build/user_arch.o: src/user/arch.c src/user/process.h
	$(CC) $(CFLAGS) -c $< -o $@
build/user_asm.o: src/user/user.S
	$(CC) -m64 -g -ffile-prefix-map="$(CURDIR)"=. -fno-pie -c $< -o $@
build/sse.o: src/sse.S
	$(CC) -m64 -g -ffile-prefix-map="$(CURDIR)"=. -fno-pie -c $< -o $@
.PHONY: user-test sdk
sdk:
	$(MAKE) -C sdk
user-test: sdk
	$(HOSTCC) -std=c11 -O1 -g -no-pie -fsanitize=address,undefined tests/user_vm_test.c src/user/vm.c src/user/elf.c -o build/user-vm-test
	ASAN_OPTIONS=detect_leaks=0 ./build/user-vm-test sdk/HELLO.ELF

build/ui_shell.o: src/ui/shell.c src/ui/shell.h src/apps.h src/preferences.h src/ui/chrome_geom.h
	$(CC) $(CFLAGS) -c $< -o $@
build/ui_chrome.o: src/ui/chrome.c src/ui/shell.h src/apps.h src/preferences.h src/ui/chrome_geom.h
	$(CC) $(CFLAGS) -c $< -o $@
build/desktop.o build/apps.o: src/ui/shell.h

build/vfs.o: src/fs/vfs.c src/fs/vfs.h
	$(CC) $(CFLAGS) -c $< -o $@
build/fat_backend.o: src/fs/fat_backend.c src/fs/vfs.h src/storage/storage.h
	$(CC) $(CFLAGS) -c $< -o $@
build/desktop_service.o: src/ui/desktop_service.c src/ui/desktop_backend.h
	$(CC) $(CFLAGS) -c $< -o $@
build/desktop.o: src/ui/desktop_backend.h
build/audio.o build/sb16.o: src/audio/device.h
build/kernel.o build/process.o build/ui_shell.o build/ata.o build/fat32.o: src/fs/vfs.h
.PHONY: boundaries-test
boundaries-test:
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined tests/boundaries_test.c src/ui/desktop_service.c src/fs/vfs.c -o build/boundaries-test
	ASAN_OPTIONS=detect_leaks=0 ./build/boundaries-test

build/files_app.o: src/apps/files.c src/apps/files.h src/apps.h src/fs/vfs.h src/clipboard.h src/kernel.h
	$(CC) $(CFLAGS) -c $< -o $@
build/apps.o: src/apps/files.h

build/terminal.o: src/clipboard.h

.PHONY: files-test
files-test: tests/rust_host_stubs.c build/librust-host-clipboard.a
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined tests/files_test.c $^ -o build/files-test
	ASAN_OPTIONS=detect_leaks=0 ./build/files-test

# Track module headers as well as explicit asset/build prerequisites.
-include $(wildcard build/*.d build/doom/*.d)

# Every specialized kernel rule also works in a completely empty build tree.
$(OBJS): | build

test: user-test boundaries-test files-test

build/heap-test: tests/heap_test.c tests/rust_host_stubs.c build/librust-host-heap-clipboard.a
	$(HOSTCC) -std=c11 -Wall -Wextra -Werror -O1 -g -fsanitize=address,undefined $^ -o $@
heap-test: build/heap-test
	ASAN_OPTIONS=detect_leaks=0 ./build/heap-test

src/ui_icons.h: tools/build_ui_icons.py tools/build_icons.py $(foreach icon,$(ICONS),assets/icons/source/$(icon)-256.png)
	python3 tools/build_ui_icons.py
build/ui_chrome.o: src/ui_icons.h
ui-icons-test:
	python3 tests/ui_icon_test.py

# First-boot account and login regression.
.PHONY: account-test
account-test: | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined tests/account_test.c src/account.c -o build/account-test
	ASAN_OPTIONS=detect_leaks=0 ./build/account-test
.PHONY: auth-flow-test
auth-flow-test: | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined tests/auth_flow_test.c src/auth.c -o build/auth-flow-test
	ASAN_OPTIONS=detect_leaks=0 ./build/auth-flow-test
test: account-test auth-flow-test

.PHONY: package-test
package-test: sdk
	python3 tests/slop_package_test.py

build/user_gui.o: src/user/gui.c src/user/gui.h src/heap.h
	$(CC) $(CFLAGS) -c $< -o $@

# Safe Genesis test disk: new filename, never touch storage/slopix-data.img.
.PHONY: genesis-disk
genesis-disk: sdk build/HELLO.SLOP build/STORE.SLOP
	python3 tools/build_genesis_disk.py storage/genesis-test.img
	@echo 'Boot with: SLOPIX_DISK=storage/genesis-test.img make run'
.PHONY: genesis-host-test
genesis-host-test: sdk | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined tests/user_gui_host_test.c src/user/gui.c -o build/user-gui-host-test
	ASAN_OPTIONS=detect_leaks=0 ./build/user-gui-host-test
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined tests/user_demo_elf_test.c src/user/vm.c src/user/elf.c -o build/user-demo-elf-test
	ASAN_OPTIONS=detect_leaks=0 ./build/user-demo-elf-test sdk/DEMO.ELF
	python3 tests/slop_package_test.py
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined tests/genesis_package_fat_test.c src/storage/fat32.c src/fs/vfs.c src/fs/fat_backend.c src/slop_package.c -o build/genesis-package-fat-test
	ASAN_OPTIONS=detect_leaks=0 ./build/genesis-package-fat-test storage/genesis-test.img
	ASAN_OPTIONS=detect_leaks=0 ./build/genesis-package-fat-test storage/genesis-packages.img

build/HELLO.SLOP: sdk/HELLO.ELF tools/slop_package.py | build
	python3 tools/slop_package.py pack HELLO sdk/HELLO.ELF $@

.PHONY: genesis-disk-test
genesis-disk-test: sdk build/HELLO.SLOP build/DEMO.SLOP build/STORE.SLOP
	python3 tests/genesis_disk_test.py

# Optional package-first disk. Installing DEMO.SLP from the Terminal makes
# the real Ring-3 renderer available without rebuilding the kernel.
build/DEMO.SLOP: sdk/DEMO.ELF tools/slop_package.py | build
	python3 tools/slop_package.py pack DEMO sdk/DEMO.ELF $@
.PHONY: genesis-packages-disk
genesis-packages-disk: sdk build/HELLO.SLOP build/DEMO.SLOP build/STORE.SLOP
	python3 tools/build_genesis_disk.py --packages-only storage/genesis-packages.img
	@echo 'Boot with: SLOPIX_DISK=storage/genesis-packages.img make run'

.PHONY: genesis-fat-stream-test
genesis-fat-stream-test: | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined tests/genesis_fat_stream_test.c src/storage/fat32.c -o build/genesis-fat-stream-test
	python3 tests/genesis_fat_stream_test.py

build/STORE.SLOP: sdk/STORE.ELF tools/slop_package.py | build
	python3 tools/slop_package.py pack STORE sdk/STORE.ELF $@

# Genesis 1.0 bundle packages: executable plus independently stored HTML assets.
build/BROWSE.SLP: sdk/BROWSE.ELF sdk/pages/START.HTM sdk/pages/ABOUT.HTM tools/slop_package.py | build
	python3 tools/slop_package.py bundle BROWSE sdk/BROWSE.ELF $@ sdk/pages/START.HTM sdk/pages/ABOUT.HTM
build/HELLOGUI.SLP: sdk/HELLOGUI.ELF tools/slop_package.py | build
	python3 tools/slop_package.py bundle HELLOGUI sdk/HELLOGUI.ELF $@
.PHONY: genesis-bundles-disk genesis-browser-disk genesis-bundle-test
genesis-bundles-disk: sdk build/BROWSE.SLP build/HELLOGUI.SLP build/DEMO.SLOP build/HELLO.SLOP build/STORE.SLOP
	python3 tools/build_genesis_disk.py --bundles storage/genesis-bundles.img
genesis-browser-disk: sdk build/BROWSE.SLP build/HELLO.SLOP
	python3 tools/build_genesis_disk.py --browser-ready storage/genesis-browser.img
genesis-bundle-test: sdk build/BROWSE.SLP build/HELLOGUI.SLP | build
	@test -f storage/genesis-bundles.img || (echo "Run make genesis-bundles-disk first"; exit 1)
	python3 tests/slop_package_test.py
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined tests/genesis_package_fat_test.c src/storage/fat32.c src/fs/vfs.c src/fs/fat_backend.c src/slop_package.c -o build/genesis-package-fat-test
	ASAN_OPTIONS=detect_leaks=0 ./build/genesis-package-fat-test storage/genesis-bundles.img

.PHONY: genesis-browser-test
genesis-browser-test: sdk | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined tests/browser_html_test.c -o build/browser-html-test
	ASAN_OPTIONS=detect_leaks=0 ./build/browser-html-test
.PHONY: genesis-apps-elf-test
genesis-apps-elf-test: sdk | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined tests/genesis_apps_elf_test.c src/user/vm.c src/user/elf.c -o build/genesis-apps-elf-test
	ASAN_OPTIONS=detect_leaks=0 ./build/genesis-apps-elf-test sdk/BROWSE.ELF sdk/HELLOGUI.ELF sdk/DEMO.ELF

# Checkpoint 03: run host integration on the *new* disposable images.
# Does not require rustc, GRUB or QEMU.
.PHONY: genesis-cp03-host-test genesis-cp03-guest-test

genesis-cp03-host-test: sdk build/BROWSE.SLP build/HELLOGUI.SLP | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined tests/user_gui_host_test.c src/user/gui.c -o build/user-gui-host-test
	ASAN_OPTIONS=detect_leaks=0 ./build/user-gui-host-test
	$(MAKE) genesis-browser-test genesis-apps-elf-test
	python3 tests/slop_package_test.py
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined tests/genesis_package_fat_test.c src/storage/fat32.c src/fs/vfs.c src/fs/fat_backend.c src/slop_package.c -o build/genesis-package-fat-test
	ASAN_OPTIONS=detect_leaks=0 ./build/genesis-package-fat-test storage/genesis-cp03-bundles.img

genesis-cp03-guest-test: all
	python3 tests/genesis_gui_lifecycle_guest.py

.PHONY: genesis-browser-interaction-test
genesis-browser-interaction-test: | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=address,undefined tests/genesis_browser_interaction_test.c -o build/genesis-browser-interaction-test
	ASAN_OPTIONS=detect_leaks=0 ./build/genesis-browser-interaction-test

.PHONY: genesis-cp04-host-test
genesis-cp04-host-test: | build
	$(HOSTCC) -std=c11 -O2 -Wall -Wextra -Werror -fsanitize=address,undefined net/http.c tests/genesis_http_test.c -o build/genesis-http-test
	ASAN_OPTIONS=detect_leaks=0 ./build/genesis-http-test

# Checkpoint 04: real (experimental) RTL8139 + IPv4/HTTP kernel networking.
build/rtl8139.o: src/net/rtl8139.c src/net/rtl8139.h src/kernel.h | build
	$(CC) $(CFLAGS) -c $< -o $@
build/net_stack.o: src/net/stack.c src/net/stack.h src/net/rtl8139.h net/http.h | build
	$(CC) $(CFLAGS) -c $< -o $@
build/net_http.o: net/http.c net/http.h | build
	$(CC) $(CFLAGS) -c $< -o $@
.PHONY: run-net genesis-cp04-net-test
run-net: all
	SLOPIX_NET=1 sh run.sh
genesis-cp04-net-test: | build
	$(HOSTCC) -std=c11 -O2 -Wall -Wextra -Werror -fsanitize=undefined net/http.c tests/genesis_http_test.c -o build/genesis-http-test
	./build/genesis-http-test
	$(HOSTCC) -std=c11 -O2 -Wall -Wextra -Werror -fsanitize=undefined -DHOST_NET_TEST tests/genesis_net_test.c src/net/stack.c net/http.c -o build/genesis-net-test
	./build/genesis-net-test
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=undefined tests/genesis_net_integration_test.c src/net/stack.c net/http.c -o build/genesis-net-integration-test
	./build/genesis-net-integration-test

.PHONY: genesis-cp04-browser-disk genesis-cp04-bundles-disk
# Always create NEW disposable test disks; the generator refuses overwrite.
genesis-cp04-browser-disk: sdk build/HELLO.SLOP
	python3 tools/build_genesis_disk.py --browser-ready storage/genesis-cp04-browser.img
genesis-cp04-bundles-disk: sdk build/BROWSE.SLP build/HELLOGUI.SLP build/DEMO.SLOP build/HELLO.SLOP build/STORE.SLOP
	python3 tools/build_genesis_disk.py --bundles storage/genesis-cp04-bundles.img

# Checkpoint 05: independent Ring-3 desktop clients, safe metadata syscalls.
.PHONY: genesis-cp05-host-test genesis-cp05-disks genesis-cp07-disks genesis-cp05-disk-test

genesis-cp05-host-test: sdk | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=undefined tests/genesis_apps_elf_test.c src/user/vm.c src/user/elf.c -o build/genesis-cp05-elf-test
	./build/genesis-cp05-elf-test sdk/TERM.ELF sdk/FIND.ELF sdk/SET.ELF sdk/FILES.ELF sdk/BROWSE.ELF sdk/DEMO.ELF sdk/HELLOGUI.ELF sdk/DOOM.ELF sdk/BENCH.ELF
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -fsanitize=undefined tests/user_gui_host_test.c src/user/gui.c -o build/genesis-cp05-gui-test
	./build/genesis-cp05-gui-test
	python3 tests/genesis_cp05_abi_test.py

genesis-cp05-disks: sdk build/BROWSE.SLP build/HELLOGUI.SLP build/HELLO.SLOP
	python3 tools/build_genesis_cp05_disk.py storage/genesis-cp05-ring3-ready.img
	python3 tools/build_genesis_cp05_disk.py storage/genesis-cp05-ring3-bundles.img --bundles

# Bootable data disk that also contains LIBCDEMO.ELF (`run LIBCDEMO.ELF`).
genesis-cp07-disks: sdk build/BROWSE.SLP build/HELLOGUI.SLP build/HELLO.SLOP
	python3 tools/build_genesis_cp05_disk.py storage/genesis-cp07-ring3-ready.img

# Checkpoint 08: same desktop disk plus BENCH.ELF (`run BENCH.ELF`).
genesis-cp08-disks: sdk build/BROWSE.SLP build/HELLOGUI.SLP build/HELLO.SLOP
	python3 tools/build_genesis_cp08_disk.py storage/genesis-cp08-ring3-ready.img

# Run after seeding the two new disposable images.
genesis-cp05-disk-test:
	python3 tests/genesis_cp05_disk_test.py

# Requires rustc + grub + QEMU. Always copies the distributable test disk.
.PHONY: genesis-cp05-guest-test
genesis-cp05-guest-test: all
	python3 tests/genesis_cp05_guest_test.py

.PHONY: genesis-cp06-host-test
# No emulator required. These are protocol and syscall/loader regressions only.
genesis-cp06-host-test: | build
	$(HOSTCC) -std=c11 -O2 -Wall -Wextra -Werror -fsanitize=undefined tests/genesis_cp06_http_test.c net/http.c -o build/genesis-cp06-http-test
	./build/genesis-cp06-http-test
	$(MAKE) genesis-browser-interaction-test genesis-cp04-net-test genesis-cp05-host-test

.PHONY: genesis-cp06-disks genesis-cp06-guest-test
genesis-cp06-disks: sdk build/BROWSE.SLP build/HELLOGUI.SLP build/HELLO.SLOP
	python3 tools/build_genesis_cp05_disk.py storage/genesis-cp06-ring3-ready.img
	python3 tools/build_genesis_cp05_disk.py storage/genesis-cp06-ring3-bundles.img --bundles
genesis-cp06-guest-test: all
	python3 tests/genesis_cp06_guest_test.py

.PHONY: genesis-cp06-disk-test
genesis-cp06-disk-test:
	python3 tests/genesis_cp06_disk_test.py

# ---------------------------------------------------------------------------
# Checkpoint 07: userspace libc (host-testable) and the CP07 syscall set.
# ---------------------------------------------------------------------------
.PHONY: libc libc-host-test libc-elf-test cp07-host-test genesis-cp07-guest-test

libc:
	$(MAKE) -C sdk/libc

# The library is built with -DSLOPIX_HOST so syscall1/2/3 dispatch into a fake
# kernel provided by the test. No emulator, no GRUB, no rustc required.
build/libc-host-test: tests/libc_host_test.c $(wildcard sdk/libc/src/*.c) $(wildcard sdk/libc/include/*.h) | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror -DSLOPIX_HOST -fno-builtin -U_FORTIFY_SOURCE -D_FORTIFY_SOURCE=0 \
	  -I sdk/libc/include \
	  tests/libc_host_test.c \
	  sdk/libc/src/stdlib.c sdk/libc/src/string.c sdk/libc/src/stdio.c sdk/libc/src/errno.c sdk/libc/src/args.c \
	  -o $@

libc-host-test: build/libc-host-test
	./build/libc-host-test

# The real ELF loader must accept the libc-linked binary (PT_LOAD only).
build/libc-elf-test: tests/genesis_apps_elf_test.c src/user/vm.c src/user/elf.c | build
	$(HOSTCC) -std=c11 -O1 -g -Wall -Wextra -Werror $^ -o $@

libc-elf-test: build/libc-elf-test sdk
	./build/libc-elf-test sdk/LIBCDEMO.ELF sdk/BENCH.ELF sdk/TERM.ELF

cp07-host-test: libc libc-host-test libc-elf-test
	python3 tests/genesis_cp07_abi_test.py
	python3 tests/genesis_cp05_abi_test.py
	python3 tests/slop_package_test.py

genesis-cp07-guest-test: all
	python3 tests/genesis_cp07_guest_test.py

# ---------------------------------------------------------------------------
# Checkpoint 08: SSE2 bulk primitives (kernel + libc) and FPU/SSE context.
# ---------------------------------------------------------------------------
.PHONY: cp08-host-test genesis-cp08-guest-test

cp08-host-test: libc libc-host-test libc-elf-test runtime-test-plain
	python3 tests/genesis_cp07_abi_test.py
	python3 tests/genesis_cp05_abi_test.py
	python3 tests/slop_package_test.py

# Native A/B benchmark of the shipped SSE2 memcpy/memset against the CP07 word
# loops. Runs on the host CPU: QEMU TCG is far too noisy for microbenchmarks.
.PHONY: cp08-membench
cp08-membench: | build
	$(HOSTCC) -std=c11 -O2 -fno-builtin -I sdk/libc/include \
	  -Dmemcpy=slopix_memcpy -Dmemset=slopix_memset \
	  -c sdk/libc/src/string.c -o build/membench-string.o
	$(HOSTCC) -std=c11 -O2 -Wall -Wextra -Werror -fno-builtin \
	  tools/membench.c build/membench-string.o -o build/membench
	./build/membench

genesis-cp08-guest-test: all
	python3 tests/genesis_cp08_guest_test.py

# Disposable no-disk first-boot and desktop interaction smoke test.
.PHONY: slopde-transition-guest-test
slopde-transition-guest-test: all
	python3 tests/slopde_transition_guest_test.py
