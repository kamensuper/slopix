/* Plain byte/word loops, not compiler builtins: a libc must never expand
 * memcpy() into a call to memcpy() for unknown lengths.
 *
 * Checkpoint 08: on x86-64 the bulk path moves 16 bytes per SSE2 load/store
 * and 64 bytes per unrolled block. XMM registers are caller-saved, and the
 * kernel FXSAVEs/FXRSTORs the whole SSE state on every process switch, so a
 * preemption in the middle of a block cannot corrupt either side. Requests
 * smaller than 16 bytes never touch XMM and never read past an end. */
#include "string.h"
#include "stdlib.h"

#if defined(__x86_64__)
#include <emmintrin.h>
#define SLOPIX_SSE2 1
#endif

typedef uint64_t unaligned64 __attribute__((aligned(1), may_alias));
typedef uint32_t unaligned32 __attribute__((aligned(1), may_alias));

void *memcpy(void *dest, const void *src, size_t n) {
    unsigned char *d = (unsigned char *)dest;
    const unsigned char *s = (const unsigned char *)src;
#ifdef SLOPIX_SSE2
    while (n >= 64) {
        __m128i a = _mm_loadu_si128((const __m128i *)(const void *)(s + 0));
        __m128i b = _mm_loadu_si128((const __m128i *)(const void *)(s + 16));
        __m128i c = _mm_loadu_si128((const __m128i *)(const void *)(s + 32));
        __m128i e = _mm_loadu_si128((const __m128i *)(const void *)(s + 48));
        _mm_storeu_si128((__m128i *)(void *)(d + 0), a);
        _mm_storeu_si128((__m128i *)(void *)(d + 16), b);
        _mm_storeu_si128((__m128i *)(void *)(d + 32), c);
        _mm_storeu_si128((__m128i *)(void *)(d + 48), e);
        d += 64; s += 64; n -= 64;
    }
    while (n >= 16) {
        __m128i a = _mm_loadu_si128((const __m128i *)(const void *)s);
        _mm_storeu_si128((__m128i *)(void *)d, a);
        d += 16; s += 16; n -= 16;
    }
#endif
    while (n >= 8) { *(unaligned64 *)(void *)d = *(const unaligned64 *)(const void *)s; d += 8; s += 8; n -= 8; }
    if (n >= 4) { *(unaligned32 *)(void *)d = *(const unaligned32 *)(const void *)s; d += 4; s += 4; n -= 4; }
    while (n--) *d++ = *s++;
    return dest;
}

void *memmove(void *dest, const void *src, size_t n) {
    unsigned char *d = (unsigned char *)dest;
    const unsigned char *s = (const unsigned char *)src;
    if (d == s || n == 0) return dest;
    if (d < s || d >= s + n) return memcpy(dest, src, n);
    /* Overlapping and dest is above src: copy backwards. */
#ifdef SLOPIX_SSE2
    d += n; s += n;
    while (n >= 16) {
        d -= 16; s -= 16;
        __m128i a = _mm_loadu_si128((const __m128i *)(const void *)s);
        _mm_storeu_si128((__m128i *)(void *)d, a);
        n -= 16;
    }
    while (n--) *--d = *--s;
#else
    for (size_t i = n; i > 0; i--) d[i - 1] = s[i - 1];
#endif
    return dest;
}

void *memset(void *s, int c, size_t n) {
    unsigned char *p = (unsigned char *)s;
    unsigned char v = (unsigned char)c;
    uint64_t word = 0;
    for (unsigned i = 0; i < 8; i++) word = (word << 8) | v;
#ifdef SLOPIX_SSE2
    if (n >= 16) {
        __m128i fill = _mm_set1_epi8((char)v);
        while (n >= 64) {
            _mm_storeu_si128((__m128i *)(void *)(p + 0), fill);
            _mm_storeu_si128((__m128i *)(void *)(p + 16), fill);
            _mm_storeu_si128((__m128i *)(void *)(p + 32), fill);
            _mm_storeu_si128((__m128i *)(void *)(p + 48), fill);
            p += 64; n -= 64;
        }
        while (n >= 16) {
            _mm_storeu_si128((__m128i *)(void *)p, fill);
            p += 16; n -= 16;
        }
    }
#endif
    while (n >= 8) { *(unaligned64 *)(void *)p = word; p += 8; n -= 8; }
    while (n--) *p++ = v;
    return s;
}

int memcmp(const void *s1, const void *s2, size_t n) {
    const unsigned char *a = (const unsigned char *)s1;
    const unsigned char *b = (const unsigned char *)s2;
    for (size_t i = 0; i < n; i++) {
        if (a[i] != b[i]) return (int)a[i] - (int)b[i];
    }
    return 0;
}

void *memchr(const void *s, int c, size_t n) {
    const unsigned char *p = (const unsigned char *)s;
    for (size_t i = 0; i < n; i++) if (p[i] == (unsigned char)c) return (void *)(p + i);
    return NULL;
}

size_t strlen(const char *s) {
    size_t n = 0;
    while (s[n]) n++;
    return n;
}

char *strcpy(char *dest, const char *src) {
    char *d = dest;
    while ((*d++ = *src++)) { }
    return dest;
}

char *strncpy(char *dest, const char *src, size_t n) {
    size_t i = 0;
    while (i < n && src[i]) { dest[i] = src[i]; i++; }
    while (i < n) dest[i++] = '\0';
    return dest;
}

char *strcat(char *dest, const char *src) {
    char *d = dest + strlen(dest);
    while ((*d++ = *src++)) { }
    return dest;
}

char *strncat(char *dest, const char *src, size_t n) {
    char *d = dest + strlen(dest);
    size_t i = 0;
    while (i < n && src[i]) { d[i] = src[i]; i++; }
    d[i] = '\0';
    return dest;
}

int strcmp(const char *s1, const char *s2) {
    while (*s1 && *s1 == *s2) { s1++; s2++; }
    return (int)(unsigned char)*s1 - (int)(unsigned char)*s2;
}

int strncmp(const char *s1, const char *s2, size_t n) {
    while (n && *s1 && *s1 == *s2) { s1++; s2++; n--; }
    if (!n) return 0;
    return (int)(unsigned char)*s1 - (int)(unsigned char)*s2;
}

static char lower(char c) { return (c >= 'A' && c <= 'Z') ? (char)(c + 32) : c; }

int strcasecmp(const char *s1, const char *s2) {
    while (*s1 && lower(*s1) == lower(*s2)) { s1++; s2++; }
    return (int)(unsigned char)lower(*s1) - (int)(unsigned char)lower(*s2);
}

int strncasecmp(const char *s1, const char *s2, size_t n) {
    while (n && *s1 && lower(*s1) == lower(*s2)) { s1++; s2++; n--; }
    if (!n) return 0;
    return (int)(unsigned char)lower(*s1) - (int)(unsigned char)lower(*s2);
}

char *strchr(const char *s, int c) {
    char target = (char)c;
    do {
        if (*s == target) return (char *)s;
    } while (*s++);
    return NULL;
}

char *strrchr(const char *s, int c) {
    const char *last = NULL;
    char target = (char)c;
    do {
        if (*s == target) last = s;
    } while (*s++);
    return (char *)last;
}

char *strstr(const char *haystack, const char *needle) {
    if (!*needle) return (char *)haystack;
    for (; *haystack; haystack++) {
        const char *h = haystack, *n = needle;
        while (*h && *h == *n) { h++; n++; }
        if (!*n) return (char *)haystack;
    }
    return NULL;
}

char *strdup(const char *s) {
    size_t len = strlen(s) + 1;
    char *p = malloc(len);
    if (p) memcpy(p, s, len);
    return p;
}

char *strndup(const char *s, size_t n) {
    size_t len = 0;
    while (len < n && s[len]) len++;
    char *p = malloc(len + 1);
    if (p) {
        memcpy(p, s, len);
        p[len] = '\0';
    }
    return p;
}

size_t strcspn(const char *s, const char *reject) {
    size_t count = 0;
    while (s[count]) {
        if (strchr(reject, s[count])) break;
        count++;
    }
    return count;
}

size_t strspn(const char *s, const char *accept) {
    size_t count = 0;
    while (s[count] && strchr(accept, s[count])) count++;
    return count;
}

static char *strtok_state;

char *strtok(char *str, const char *delim) {
    char *p = str ? str : strtok_state;
    if (!p) return NULL;
    p += strspn(p, delim);
    if (!*p) { strtok_state = NULL; return NULL; }
    char *end = p + strcspn(p, delim);
    if (*end) *end++ = '\0';
    strtok_state = end;
    return p;
}

void *memccpy(void *dest, const void *src, int c, size_t n) {
    unsigned char *d = (unsigned char *)dest;
    const unsigned char *s = (const unsigned char *)src;
    for (size_t i = 0; i < n; i++) {
        d[i] = s[i];
        if (d[i] == (unsigned char)c) return d + i + 1;
    }
    return NULL;
}

char *stpcpy(char *dest, const char *src) {
    while ((*dest = *src)) { dest++; src++; }
    return dest;
}

char *stpncpy(char *dest, const char *src, size_t n) {
    size_t i = 0;
    while (i < n && src[i]) { dest[i] = src[i]; i++; }
    char *end = dest + i;
    while (i < n) dest[i++] = '\0';
    return end;
}