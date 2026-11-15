#ifndef SLOPIX_STDIO_H
#define SLOPIX_STDIO_H
#include <stddef.h>
#include <stdint.h>
#include <stdarg.h>

/* Don't redefine NULL - stddef.h provides it */
#define EOF (-1)
#define BUFSIZ 1024
#define FILENAME_MAX 128
#define FOPEN_MAX 8

typedef long off_t;
typedef long ssize_t;

/* File stream */
typedef struct {
    int fd;
    unsigned flags;
    char *buf;
    size_t buf_size;
    size_t buf_pos;
    size_t buf_len;
    off_t offset;
    char path[128];   /* retained so SEEK_END can stat the file */
} FILE;

#define STDIN_FILENO  0
#define STDOUT_FILENO 1
#define STDERR_FILENO 2

/* Standard streams */
extern FILE *stdin;
extern FILE *stdout;
extern FILE *stderr;

/* File operations */
FILE *fopen(const char *path, const char *mode);
int fclose(FILE *stream);
size_t fread(void *ptr, size_t size, size_t nmemb, FILE *stream);
size_t fwrite(const void *ptr, size_t size, size_t nmemb, FILE *stream);
int fflush(FILE *stream);
int fseek(FILE *stream, long offset, int whence);
long ftell(FILE *stream);
int fgetc(FILE *stream);
int fputc(int c, FILE *stream);
char *fgets(char *s, int size, FILE *stream);
int fputs(const char *s, FILE *stream);
int feof(FILE *stream);
int ferror(FILE *stream);
void clearerr(FILE *stream);
int fileno(FILE *stream);

/* Formatted I/O */
int fprintf(FILE *stream, const char *format, ...);
int printf(const char *format, ...);
int sprintf(char *str, const char *format, ...);
int snprintf(char *str, size_t size, const char *format, ...);
int vfprintf(FILE *stream, const char *format, va_list ap);
int vprintf(const char *format, va_list ap);
int vsprintf(char *str, const char *format, va_list ap);
int vsnprintf(char *str, size_t size, const char *format, va_list ap);

/* Character I/O */
int getchar(void);
int putchar(int c);
int puts(const char *s);

/* File management */
int remove(const char *path);
int rename(const char *oldpath, const char *newpath);

/* Slopix extensions */
FILE *fdopen(int fd, const char *mode);
int open(const char *path, int flags, ...);
ssize_t read(int fd, void *buf, size_t count);
ssize_t write(int fd, const void *buf, size_t count);
off_t lseek(int fd, off_t offset, int whence);
int close(int fd);
int mkdir(const char *path, int mode);

/* File mode flags */
#define O_RDONLY    0x0000
#define O_WRONLY    0x0001
#define O_RDWR      0x0002
#define O_CREAT     0x0100
#define O_TRUNC     0x0200
#define O_APPEND    0x0400
#define O_EXCL      0x0800

/* Seek whence */
#define SEEK_SET 0
#define SEEK_CUR 1
#define SEEK_END 2

#endif