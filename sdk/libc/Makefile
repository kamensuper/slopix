CC ?= gcc
AR ?= ar
CFLAGS := -std=c11 -O2 -Wall -Wextra -Werror -ffreestanding -fno-pie -fno-stack-protector \
          -fno-asynchronous-unwind-tables -mcmodel=large -m64 -mno-red-zone \
          -fno-builtin -Iinclude -fvisibility=hidden

OBJS := src/crt0.o src/errno.o src/stdlib.o src/string.o src/stdio.o src/args.o

all: libc.a crt0.o

libc.a: $(OBJS)
	$(AR) rcs $@ $^

crt0.o: src/crt0.o
	cp $< $@

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

src/crt0.o: src/crt0.c include/syscall.h include/stdlib.h include/errno.h
src/errno.o: src/errno.c include/syscall.h include/errno.h
src/args.o: src/args.c
src/stdlib.o: src/stdlib.c include/syscall.h include/stdlib.h include/string.h include/limits.h include/errno.h
src/string.o: src/string.c include/string.h include/stdlib.h
src/stdio.o: src/stdio.c include/stdio.h include/stdlib.h include/string.h include/errno.h include/unistd.h include/syscall.h

clean:
	rm -f $(OBJS) libc.a

.PHONY: all clean