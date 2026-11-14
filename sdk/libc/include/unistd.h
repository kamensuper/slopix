#ifndef SLOPIX_UNISTD_H
#define SLOPIX_UNISTD_H
#include <stddef.h>
#include <stdint.h>

/* Process ID */
typedef int pid_t;
typedef unsigned int uid_t;
typedef unsigned int gid_t;
typedef long off_t;
typedef long ssize_t;

/* Scheduling */
struct sched_param {
    int sched_priority;
    uint64_t deadline_ns;
    uint64_t period_ns;
    uint64_t runtime_ns;
};

struct timespec {
    long tv_sec;
    long tv_nsec;
};

/* Scheduling policies */
#define SCHED_OTHER     0
#define SCHED_FIFO      1
#define SCHED_RR        2
#define SCHED_DEADLINE  3

/* Process control */
pid_t fork(void);
int execv(const char *path, char *const argv[]);
int execve(const char *path, char *const argv[], char *const envp[]);
int execl(const char *path, const char *arg, ...);
int execlp(const char *file, const char *arg, ...);
void _exit(int status) __attribute__((noreturn));

/* File operations */
int open(const char *path, int flags, ...);
ssize_t read(int fd, void *buf, size_t count);
ssize_t write(int fd, const void *buf, size_t count);
off_t lseek(int fd, off_t offset, int whence);
int close(int fd);
int mkdir(const char *path, int mode);
int rmdir(const char *path);
int unlink(const char *path);
int chdir(const char *path);
char *getcwd(char *buf, size_t size);

/* Process info */
pid_t getpid(void);
pid_t getppid(void);
uid_t getuid(void);
gid_t getgid(void);

/* Sleep */
unsigned sleep(unsigned seconds);
int usleep(unsigned microseconds);

/* Slopix extensions */
int spawn(const char *path, uint64_t arg);
/* Kernel's own process/scheduler report (PROCESS ... / SCHED ... lines). */
int proc_report(char *buf, size_t size);
int sched_param(int policy, const struct sched_param *param);
int futex_wait(int *uaddr, int val, const struct timespec *timeout);
int futex_wake(int *uaddr, int count);
int clock_gettime(int clk_id, struct timespec *tp);

/* Clock ids */
#define CLOCK_MONOTONIC 0
#define CLOCK_REALTIME  1

#endif