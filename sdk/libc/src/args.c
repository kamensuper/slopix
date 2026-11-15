/* Build argv for main() from the kernel spawn payload.
 *
 * The kernel enters _start with rdi = numeric payload (SX_SPAWN) and
 * rsi = optional command-line text (terminal "run NAME args...", at most 127
 * bytes, stored above the initial stack pointer). Text wins when present: it
 * is split on blanks, and single or double quotes group words ("a b" -> one
 * argument, "" -> an empty argument). Otherwise a nonzero number becomes
 * argv[1] in decimal, which keeps older SX_SPAWN callers working.
 *
 * All strings are copied into `store`, so argv stays valid for the whole
 * program regardless of what happens to the stack. */
#include <stdint.h>
#include <stddef.h>

int __libc_build_argv(uint64_t number, const char *text, char *store, size_t cap,
                      char **argv, int max_args);

int __libc_build_argv(uint64_t number, const char *text, char *store, size_t cap,
                      char **argv, int max_args) {
    if (!argv || max_args < 2) return 0;
    int argc = 0;
    argv[argc++] = (char *)"slopix";
    size_t used = 0;
    if (store && cap >= 2 && text && *text) {
        const char *s = text;
        while (*s && argc < max_args - 1 && used < cap - 1) {
            while (*s == ' ' || *s == '\t') s++;
            if (!*s) break;
            argv[argc++] = store + used;
            char quote = 0;
            while (*s && (quote || (*s != ' ' && *s != '\t'))) {
                if (!quote && (*s == '"' || *s == '\'')) { quote = *s++; continue; }
                if (quote && *s == quote) { quote = 0; s++; continue; }
                if (used < cap - 1) store[used++] = *s;
                s++;
            }
            store[used++] = 0;
        }
    } else if (store && number) {
        char digits[24];
        int n = 0;
        while (number && n < 20) { digits[n++] = (char)('0' + number % 10); number /= 10; }
        if (used + (size_t)n + 1 <= cap) {
            argv[argc++] = store + used;
            while (n) store[used++] = digits[--n];
            store[used++] = 0;
        }
    }
    argv[argc] = NULL;
    return argc;
}
