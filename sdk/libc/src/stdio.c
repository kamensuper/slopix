#include "stdio.h"
#include "stdlib.h"
#include "string.h"
#include "errno.h"
#include "syscall.h"
#include "unistd.h"

#define FLAG_READ     1
#define FLAG_WRITE    2
#define FLAG_BUF      4
#define FLAG_EOF      8
#define FLAG_ERR      16
#define FLAG_CONSOLE  32
/* SX_WRITE accepts at most 127 bytes and is rate limited by the kernel. */
#define CONSOLE_CHUNK 96

/* Static console buffers: alloc_file() is not reachable from a static
 * initializer, so the three standard streams own their storage here. */
static char stdin_buffer[BUFSIZ];
static char stdout_buffer[BUFSIZ];
static char stderr_buffer[BUFSIZ];

FILE *stdin  = &(FILE){.fd=0,.flags=FLAG_READ|FLAG_CONSOLE,.buf=stdin_buffer,.buf_size=BUFSIZ};
FILE *stdout = &(FILE){.fd=1,.flags=FLAG_WRITE|FLAG_BUF|FLAG_CONSOLE,.buf=stdout_buffer,.buf_size=BUFSIZ};
FILE *stderr = &(FILE){.fd=2,.flags=FLAG_WRITE|FLAG_BUF|FLAG_CONSOLE,.buf=stderr_buffer,.buf_size=BUFSIZ};

static FILE *fd_table[FOPEN_MAX] = {0};

static FILE *alloc_file(int fd, int flags) {
    for (int i = 3; i < FOPEN_MAX; i++) {
        if (!fd_table[i]) {
            FILE *f = malloc(sizeof(FILE));
            if (!f) return NULL;
            memset(f, 0, sizeof(*f));
            f->fd = fd;
            f->flags = flags;
            f->buf = malloc(BUFSIZ);
            f->buf_size = f->buf ? BUFSIZ : 0;
            fd_table[i] = f;
            return f;
        }
    }
    return NULL;
}

static void free_file(FILE *f) {
    for (int i = 3; i < FOPEN_MAX; i++) {
        if (fd_table[i] == f) {
            fd_table[i] = NULL;
            if (f->buf) free(f->buf);
            free(f);
            return;
        }
    }
}

/* Single write path: console streams use SX_WRITE (no fd), everything else
 * uses the descriptor-relative SX_FWRITE. Both are chunked and short writes
 * are retried so the caller never sees a silent truncation. */
static int raw_write(FILE *f, const char *buf, size_t n) {
    size_t done = 0;
    while (done < n) {
        size_t chunk = n - done;
        size_t limit = (f->flags & FLAG_CONSOLE) ? CONSOLE_CHUNK : 4096u;
        if (chunk > limit) chunk = limit;
        long r = (f->flags & FLAG_CONSOLE)
            ? syscall3(SX_WRITE, (long)(buf + done), (long)chunk, 0)
            : syscall3(SX_FWRITE, f->fd, (long)(buf + done), (long)chunk);
        if (r <= 0) {
            if (r < 0) { f->flags |= FLAG_ERR; __set_errno(r); }
            return -1;
        }
        done += (size_t)r;
    }
    return 0;
}

static int flush_buffer(FILE *f) {
    if (!(f->flags & FLAG_WRITE) || f->buf_pos == 0) return 0;
    if (raw_write(f, f->buf, f->buf_pos) < 0) return -1;
    f->offset += (off_t)f->buf_pos;
    f->buf_pos = 0;
    return 0;
}

static int fill_buffer(FILE *f) {
    if (!(f->flags & FLAG_READ)) return -1;
    if (f->flags & FLAG_EOF) return -1;
    long read = syscall3(SX_READ, f->fd, (long)f->buf, f->buf_size);
    if (read <= 0) {
        if (read < 0) { f->flags |= FLAG_ERR; __set_errno(read); }
        else f->flags |= FLAG_EOF;
        f->buf_len = 0;
        f->buf_pos = 0;
        return -1;
    }
    f->buf_len = (size_t)read;
    f->buf_pos = 0;
    f->offset += (off_t)read;
    return 0;
}

FILE *fopen(const char *path, const char *mode) {
    int flags;
    if (mode[0] == 'r') flags = FLAG_READ | (mode[1] == '+' ? FLAG_WRITE : 0);
    else if (mode[0] == 'w') flags = FLAG_WRITE | (mode[1] == '+' ? FLAG_READ : 0);
    else if (mode[0] == 'a') flags = FLAG_WRITE | (mode[1] == '+' ? FLAG_READ : 0);
    else { __set_errno(-EINVAL); return NULL; }

    int fd;
    if (flags & FLAG_READ) {
        long r = syscall1(SX_OPEN, (long)path);
        if (r < 0) { __set_errno(r); return NULL; }
        fd = (int)r;
    } else {
        long r = syscall2(SX_CREATE, (long)path, (mode[0] == 'w'));
        if (r < 0) { __set_errno(r); return NULL; }
        fd = (int)r;
        if (mode[0] == 'a') syscall2(SX_SEEK, fd, 0x7fffffff);
    }

    FILE *f = alloc_file(fd, flags | FLAG_BUF);
    if (!f) { syscall1(SX_CLOSE, fd); __set_errno(-ENOMEM); return NULL; }
    size_t n = strlen(path);
    if (n >= sizeof(f->path)) n = sizeof(f->path) - 1;
    memcpy(f->path, path, n);
    f->path[n] = 0;
    return f;
}

int fclose(FILE *stream) {
    if (!stream) return -1;
    int ret = fflush(stream);
    long r = syscall1(SX_CLOSE, stream->fd);
    if (r < 0) { __set_errno(r); ret = -1; }
    free_file(stream);
    return ret;
}

size_t fread(void *ptr, size_t size, size_t nmemb, FILE *stream) {
    if (!stream || !(stream->flags & FLAG_READ) || !size || !nmemb) return 0;
    size_t total = size * nmemb;
    size_t read = 0;
    char *dst = ptr;
    while (read < total) {
        if (stream->buf_pos >= stream->buf_len) {
            if (fill_buffer(stream) < 0) break;
        }
        size_t avail = stream->buf_len - stream->buf_pos;
        size_t need = total - read;
        size_t copy = avail < need ? avail : need;
        memcpy(dst + read, stream->buf + stream->buf_pos, copy);
        stream->buf_pos += copy;
        read += copy;
    }
    return read / size;
}

size_t fwrite(const void *ptr, size_t size, size_t nmemb, FILE *stream) {
    if (!stream || !(stream->flags & FLAG_WRITE) || !size || !nmemb) return 0;
    size_t total = size * nmemb;
    /* Unbuffered stream (allocation failed): write straight through. */
    if (!stream->buf || !stream->buf_size) {
        return raw_write(stream, ptr, total) == 0 ? nmemb : 0;
    }
    size_t written = 0;
    const char *src = ptr;
    while (written < total) {
        if (stream->buf_pos >= stream->buf_size) {
            if (flush_buffer(stream) < 0) break;
        }
        size_t avail = stream->buf_size - stream->buf_pos;
        size_t need = total - written;
        size_t copy = avail < need ? avail : need;
        memcpy(stream->buf + stream->buf_pos, src + written, copy);
        stream->buf_pos += copy;
        written += copy;
    }
    return written / size;
}

int fflush(FILE *stream) {
    if (!stream) {
        for (int i = 0; i < FOPEN_MAX; i++) if (fd_table[i]) fflush(fd_table[i]);
        return flush_buffer(stdout) | flush_buffer(stderr);
    }
    if (!(stream->flags & FLAG_WRITE)) return 0;
    return flush_buffer(stream);
}

/* Logical position: for write streams, kernel offset plus pending bytes; for
 * read streams, kernel offset minus bytes still sitting in the buffer. */
long ftell(FILE *stream) {
    if (!stream) { __set_errno(-EBADF); return -1; }
    if (stream->flags & FLAG_CONSOLE) { __set_errno(-ESPIPE); return -1; }
    if (stream->flags & FLAG_WRITE) return (long)(stream->offset + (off_t)stream->buf_pos);
    return (long)(stream->offset - (off_t)(stream->buf_len - stream->buf_pos));
}

int fseek(FILE *stream, long offset, int whence) {
    if (!stream) { __set_errno(-EBADF); return -1; }
    if (stream->flags & FLAG_CONSOLE) { __set_errno(-ESPIPE); return -1; }
    if (whence != SEEK_SET && whence != SEEK_CUR && whence != SEEK_END) {
        __set_errno(-EINVAL); return -1;
    }
    off_t target;
    if (whence == SEEK_END) {
        uint32_t size = 0;
        long r = syscall2(SX_STAT, (long)stream->path, (long)&size);
        if (r < 0) { __set_errno(r); return -1; }
        target = (off_t)size + offset;
    } else {
        off_t base = 0;
        if (whence == SEEK_CUR) {
            base = ftell(stream);
            if (base < 0) return -1;
        }
        target = base + offset;
    }
    if (target < 0) { __set_errno(-EINVAL); return -1; }
    if (stream->flags & FLAG_WRITE) { if (flush_buffer(stream) < 0) return -1; }
    stream->buf_pos = 0;
    stream->buf_len = 0;
    stream->flags &= ~(FLAG_EOF | FLAG_ERR);
    long r = syscall2(SX_SEEK, stream->fd, (long)target);
    if (r < 0) { __set_errno(r); return -1; }
    stream->offset = target;
    return 0;
}

int fgetc(FILE *stream) {
    unsigned char c;
    if (fread(&c, 1, 1, stream) != 1) return EOF;
    return c;
}

int fputc(int c, FILE *stream) {
    unsigned char uc = (unsigned char)c;
    if (fwrite(&uc, 1, 1, stream) != 1) return EOF;
    /* Console streams are line buffered so prompts appear immediately. */
    if ((stream->flags & FLAG_CONSOLE) && uc == '\n') fflush(stream);
    return c;
}

char *fgets(char *s, int size, FILE *stream) {
    if (!s || size <= 0) return NULL;
    int i = 0;
    while (i < size - 1) {
        int c = fgetc(stream);
        if (c == EOF) { if (i == 0) return NULL; break; }
        s[i++] = (char)c;
        if (c == '\n') break;
    }
    s[i] = '\0';
    return s;
}

int fputs(const char *s, FILE *stream) {
    size_t n = strlen(s);
    return fwrite(s, 1, n, stream) == n ? 0 : EOF;
}

int feof(FILE *stream) { return stream ? (stream->flags & FLAG_EOF) != 0 : 0; }
int ferror(FILE *stream) { return stream ? (stream->flags & FLAG_ERR) != 0 : 0; }
void clearerr(FILE *stream) { if (stream) stream->flags &= ~(FLAG_EOF | FLAG_ERR); }
int fileno(FILE *stream) { return stream ? stream->fd : -1; }

/* ---- formatted output ---------------------------------------------------- */

static int vfprintf_internal(FILE *stream, const char *fmt, va_list ap);

int vfprintf(FILE *stream, const char *format, va_list ap) {
    return vfprintf_internal(stream, format, ap);
}
int fprintf(FILE *stream, const char *format, ...) {
    va_list ap; va_start(ap, format);
    int r = vfprintf_internal(stream, format, ap);
    va_end(ap);
    return r;
}
int vprintf(const char *format, va_list ap) { return vfprintf_internal(stdout, format, ap); }
int printf(const char *format, ...) {
    va_list ap; va_start(ap, format);
    int r = vfprintf_internal(stdout, format, ap);
    va_end(ap);
    return r;
}

int vsnprintf(char *str, size_t size, const char *format, va_list ap) {
    FILE f;
    memset(&f, 0, sizeof(f));
    f.fd = -1;
    f.flags = FLAG_WRITE;
    f.buf = str;
    f.buf_size = size ? size - 1 : 0;
    int r = vfprintf_internal(&f, format, ap);
    if (size) str[f.buf_pos < f.buf_size ? f.buf_pos : f.buf_size] = '\0';
    return r;
}
int snprintf(char *str, size_t size, const char *format, ...) {
    va_list ap; va_start(ap, format);
    int r = vsnprintf(str, size, format, ap);
    va_end(ap);
    return r;
}
int vsprintf(char *str, const char *format, va_list ap) {
    return vsnprintf(str, (size_t)0x7fffffff, format, ap);
}
int sprintf(char *str, const char *format, ...) {
    va_list ap; va_start(ap, format);
    int r = vsnprintf(str, (size_t)0x7fffffff, format, ap);
    va_end(ap);
    return r;
}

static int vfprintf_internal(FILE *stream, const char *fmt, va_list ap) {
    int count = 0;
    while (*fmt) {
        if (*fmt != '%') {
            if (fputc(*fmt++, stream) == EOF) return count;
            count++;
            continue;
        }
        fmt++;
        int width = 0, precision = -1, long_fmt = 0, left = 0, plus = 0;
        char pad = ' ';
        if (*fmt == '-') { left = 1; fmt++; }
        if (*fmt == '+') { plus = 1; fmt++; }
        if (*fmt == '0') { pad = '0'; fmt++; }
        while (*fmt >= '0' && *fmt <= '9') width = width * 10 + (*fmt++ - '0');
        if (*fmt == '.') {
            fmt++; precision = 0;
            while (*fmt >= '0' && *fmt <= '9') precision = precision * 10 + (*fmt++ - '0');
        }
        if (*fmt == 'z' || *fmt == 't') { fmt++; long_fmt = 1; }
        if (*fmt == 'l') { long_fmt = 1; fmt++; if (*fmt == 'l') fmt++; }

        char tmp[24];
        int len = 0;
        int sign = 0;
        char conv = *fmt++;
        switch (conv) {
        case 'd': case 'i': {
            long val = long_fmt ? va_arg(ap, long) : va_arg(ap, int);
            if (val < 0) { sign = '-'; val = -val; }
            else if (plus) sign = '+';
            unsigned long u = (unsigned long)val;
            do { tmp[len++] = (char)('0' + u % 10); u /= 10; } while (u);
            break;
        }
        case 'u': {
            unsigned long u = long_fmt ? va_arg(ap, unsigned long) : va_arg(ap, unsigned);
            do { tmp[len++] = (char)('0' + u % 10); u /= 10; } while (u);
            break;
        }
        case 'x': case 'X': {
            unsigned long u = long_fmt ? va_arg(ap, unsigned long) : va_arg(ap, unsigned);
            const char *digits = (conv == 'X') ? "0123456789ABCDEF" : "0123456789abcdef";
            do { tmp[len++] = digits[u & 15]; u >>= 4; } while (u);
            break;
        }
        case 'p': {
            unsigned long u = (unsigned long)(uintptr_t)va_arg(ap, void *);
            fputc('0', stream); fputc('x', stream); count += 2;
            do { tmp[len++] = "0123456789abcdef"[u & 15]; u >>= 4; } while (u);
            break;
        }
        case 'c': {
            char c = (char)va_arg(ap, int);
            fputc(c, stream); count++;
            continue;
        }
        case 's': {
            const char *s = va_arg(ap, const char *);
            if (!s) s = "(null)";
            size_t n = strlen(s);
            if (precision >= 0 && n > (size_t)precision) n = (size_t)precision;
            int fill = (left || pad == '0') ? 0 : width - (int)n;
            while (fill-- > 0) { fputc(' ', stream); count++; }
            if (n) { fwrite(s, 1, n, stream); count += (int)n; }
            int trail = left ? width - (int)n : 0;
            while (trail-- > 0) { fputc(' ', stream); count++; }
            continue;
        }
        case '%':
            fputc('%', stream); count++;
            continue;
        default:
            fputc('%', stream); count++;
            continue;
        }
        if (len == 0) tmp[len++] = '0';
        int total = len + (sign ? 1 : 0);
        if (left) {
            if (sign) { fputc(sign, stream); count++; }
            while (len--) { fputc(tmp[len], stream); count++; }
            int filln = width - total;
            while (filln-- > 0) { fputc(' ', stream); count++; }
        } else if (pad == '0') {
            if (sign) { fputc(sign, stream); count++; }
            int filln = width - total;
            while (filln-- > 0) { fputc('0', stream); count++; }
            while (len--) { fputc(tmp[len], stream); count++; }
        } else {
            int filln = width - total;
            while (filln-- > 0) { fputc(' ', stream); count++; }
            if (sign) { fputc(sign, stream); count++; }
            while (len--) { fputc(tmp[len], stream); count++; }
        }
    }
    return count;
}

int getchar(void) { return fgetc(stdin); }
int putchar(int c) { return fputc(c, stdout); }
int puts(const char *s) {
    if (fputs(s, stdout) == EOF) return EOF;
    return putchar('\n') == EOF ? EOF : 0;
}

/* ---- descriptor API ------------------------------------------------------ */

int remove(const char *path) {
    long r = syscall1(SX_REMOVE, (long)path);
    if (r < 0) { __set_errno(r); return -1; }
    return 0;
}

int rename(const char *oldpath, const char *newpath) {
    (void)oldpath; (void)newpath;
    __set_errno(-ENOSYS);
    return -1;
}

FILE *fdopen(int fd, const char *mode) {
    int flags;
    if (mode[0] == 'r') flags = FLAG_READ | (mode[1] == '+' ? FLAG_WRITE : 0);
    else if (mode[0] == 'w' || mode[0] == 'a') flags = FLAG_WRITE | (mode[1] == '+' ? FLAG_READ : 0);
    else { __set_errno(-EINVAL); return NULL; }
    FILE *f = alloc_file(fd, flags | FLAG_BUF);
    if (!f) { __set_errno(-ENOMEM); return NULL; }
    return f;
}

/* Descriptor space is disjoint by construction: 0..2 are console channels and
 * 10..13 are per-process file slots, so no call is ambiguous. */
int open(const char *path, int flags, ...) {
    int fd;
    if (flags & O_CREAT) {
        int truncate = (flags & O_TRUNC) || (flags & O_WRONLY) || !(flags & O_RDWR);
        long r = syscall2(SX_CREATE, (long)path, truncate);
        if (r < 0) { __set_errno(r); return -1; }
        fd = (int)r;
    } else {
        long r = syscall1(SX_OPEN, (long)path);
        if (r < 0) { __set_errno(r); return -1; }
        fd = (int)r;
    }
    if (flags & O_APPEND) syscall2(SX_SEEK, fd, 0x7fffffff);
    return fd;
}

ssize_t read(int fd, void *buf, size_t count) {
    if (fd < 0) { __set_errno(-EBADF); return -1; }
    if (fd <= STDERR_FILENO) return 0;   /* no stdin device for disk ELFs */
    if (fd < SX_FD_BASE || fd >= SX_FD_BASE + SX_FD_MAX) { __set_errno(-EBADF); return -1; }
    if (count > 4096) count = 4096;
    if (!count) return 0;
    long r = syscall3(SX_READ, fd, (long)buf, (long)count);
    if (r < 0) { __set_errno(r); return -1; }
    return (ssize_t)r;
}

ssize_t write(int fd, const void *buf, size_t count) {
    if (fd < 0) { __set_errno(-EBADF); return -1; }
    if (!count) return 0;
    size_t done = 0;
    while (done < count) {
        size_t chunk = count - done;
        size_t limit = (fd <= STDERR_FILENO) ? CONSOLE_CHUNK : 4096u;
        if (chunk > limit) chunk = limit;
        long r = (fd <= STDERR_FILENO)
            ? syscall3(SX_WRITE, (long)((const char *)buf + done), (long)chunk, 0)
            : syscall3(SX_FWRITE, fd, (long)((const char *)buf + done), (long)chunk);
        if (r <= 0) {
            if (r < 0) __set_errno(r);
            return done ? (ssize_t)done : -1;
        }
        done += (size_t)r;
    }
    return (ssize_t)done;
}

/* SX_SEEK is absolute-only, so only SEEK_SET is honoured here. */
off_t lseek(int fd, off_t offset, int whence) {
    if (whence != SEEK_SET) { __set_errno(-ESPIPE); return -1; }
    if (offset < 0) { __set_errno(-EINVAL); return -1; }
    if (fd < SX_FD_BASE || fd >= SX_FD_BASE + SX_FD_MAX) { __set_errno(-EBADF); return -1; }
    long r = syscall2(SX_SEEK, fd, offset);
    if (r < 0) { __set_errno(r); return -1; }
    return (off_t)r;
}

int close(int fd) {
    long r = syscall1(SX_CLOSE, fd);
    if (r < 0) { __set_errno(r); return -1; }
    return 0;
}

int mkdir(const char *path, int mode) {
    (void)mode;
    long r = syscall1(SX_MKDIR, (long)path);
    if (r < 0) { __set_errno(r); return -1; }
    return 0;
}

int clock_gettime(int clk_id, struct timespec *tp) {
    if (!tp) { __set_errno(-EFAULT); return -1; }
    struct { int64_t sec, nsec; } raw;
    long r = syscall3(SX_CLOCK_GET, clk_id, (long)&raw, 0);
    if (r < 0) { __set_errno(r); return -1; }
    tp->tv_sec = (long)raw.sec;
    tp->tv_nsec = (long)raw.nsec;
    return 0;
}

int spawn(const char *path, uint64_t arg) {
    long r = syscall2(SX_SPAWN, (long)path, (long)arg);
    if (r < 0) { __set_errno(r); return -1; }
    return (int)r;
}

/* The kernel caps this buffer at 2048 bytes and returns the byte count. */
int proc_report(char *buf, size_t size) {
    if (!buf || size < 64 || size > 2048) { __set_errno(-EINVAL); return -1; }
    long r = syscall2(SX_PROCINFO, (long)buf, (long)size);
    if (r < 0) { __set_errno(r); return -1; }
    return (int)r;
}

pid_t getpid(void) { return (pid_t)syscall1(SX_PID, 0); }
pid_t getppid(void) { return 1; }
uid_t getuid(void) { return 0; }
gid_t getgid(void) { return 0; }

unsigned sleep(unsigned seconds) {
    syscall1(SX_SLEEP, (long)((uint64_t)seconds * 1000000u));
    return 0;
}

int usleep(unsigned microseconds) {
    if (microseconds > 10000000u) microseconds = 10000000u;
    syscall1(SX_SLEEP, (long)microseconds);
    return 0;
}

int sched_param(int policy, const struct sched_param *param) {
    struct { int policy; int priority; uint64_t deadline_ns, period_ns, runtime_ns; } wire;
    if (!param) { __set_errno(-EINVAL); return -1; }
    wire.policy = policy;
    wire.priority = param->sched_priority;
    wire.deadline_ns = param->deadline_ns;
    wire.period_ns = param->period_ns;
    wire.runtime_ns = param->runtime_ns;
    long r = syscall3(SX_SCHED_PARAM, (long)policy, (long)&wire, 0);
    if (r < 0) { __set_errno(r); return -1; }
    return 0;
}

int futex_wait(int *uaddr, int val, const struct timespec *timeout) {
    long r = syscall3(SX_FUTEX, (long)uaddr, (long)val, (long)timeout);
    if (r < 0) { __set_errno(r); return -1; }
    return 0;
}

int futex_wake(int *uaddr, int count) {
    long r = syscall3(SX_FUTEX, (long)uaddr, (long)((unsigned)count | 0x80000000u), 0);
    if (r < 0) { __set_errno(r); return -1; }
    return (int)r;
}