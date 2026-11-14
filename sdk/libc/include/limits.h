#ifndef SLOPIX_LIMITS_H
#define SLOPIX_LIMITS_H

/* Sizes */
#define CHAR_BIT      8
#define SCHAR_MIN   (-128)
#define SCHAR_MAX     127
#define UCHAR_MAX     255
#define SHRT_MIN    (-32768)
#define SHRT_MAX      32767
#define USHRT_MAX     65535
#define INT_MIN     (-2147483647 - 1)
#define INT_MAX       2147483647
#define UINT_MAX      4294967295U
#define LONG_MIN    (-9223372036854775807L - 1)
#define LONG_MAX      9223372036854775807L
#define ULONG_MAX     18446744073709551615UL

/* Limits */
#define PATH_MAX      128
#define NAME_MAX      127
#define OPEN_MAX      4
#define CHILD_MAX     12
#define ARG_MAX       4096
#define LINE_MAX      2048
#define NGROUPS_MAX   0
#define STREAM_MAX    4
#define TZNAME_MAX    32
#define _POSIX_VERSION 200809L

/* Slopix-specific */
#define SLOPIX_USER_BASE     0x100001000UL
#define SLOPIX_USER_STACK    0x100200000UL
#define SLOPIX_USER_HEAP     0x100400000UL
#define SLOPIX_MAX_HEAP_PAGES 8

#endif