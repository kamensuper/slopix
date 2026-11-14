#ifndef SLOPIX_ERRNO_H
#define SLOPIX_ERRNO_H

/* Errno values (match kernel negatives) */
#define EPERM         1
#define ENOENT        2
#define ESRCH         3
#define EINTR         4
#define EIO           5
#define ENXIO         6
#define E2BIG         7
#define ENOEXEC       8
#define EBADF         9
#define ECHILD        10
#define EAGAIN        11
#define ENOMEM        12
#define EACCES        13
#define EFAULT        14
#define ENOTBLK       15
#define EBUSY         16
#define EEXIST        17
#define EXDEV         18
#define ENODEV        19
#define ENOTDIR       20
#define EISDIR        21
#define EINVAL        22
#define ENFILE        23
#define EMFILE        24
#define ENOTTY        25
#define ETXTBSY       26
#define EFBIG         27
#define ENOSPC        28
#define ESPIPE        29
#define EROFS         30
#define EMLINK        31
#define EPIPE         32
#define EDOM          33
#define ERANGE        34
#define EDEADLK       35
#define ENAMETOOLONG  36
#define ENOLCK        37
#define ENOSYS        38
#define ENOTEMPTY     39
#define ELOOP         40
#define ENOMSG        42
#define EIDRM         43
#define ECHRNG        44
#define EL2NSYNC      45
#define EL3HLT        46
#define EL3RST        47
#define ELNRNG        48
#define EUNATCH       49
#define ENOCSI        50
#define EL2HLT        51
#define EBADE         52
#define EBADR         53
#define EXFULL        54
#define ENOANO        55
#define EBADRQC       56
#define EBADSLT       57
#define EDEADLOCK     EDEADLK

/* Thread-local errno */
#ifdef __cplusplus
extern "C" {
#endif
int *__errno_location(void);
#define errno (*__errno_location())
#ifdef __cplusplus
}
#endif

#endif