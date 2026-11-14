/* Checkpoint 07 demo: a normal C program built against sdk/libc.
 *
 * Exercises the parts that previously forced every app to hand-roll helpers:
 * formatted output, malloc/strdup, buffered file I/O with SEEK_END, errno,
 * clock_gettime() and sched_param(). Prints a single summary line so a guest
 * test can assert on the serial log. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <errno.h>

static int failures;

static void expect(int ok, const char *what) {
    if (!ok) {
        printf("LIBCDEMO FAIL %s\n", what);
        failures++;
    }
}

int main(int argc, char **argv) {
    char buf[64];

    printf("LIBCDEMO start argc=%d\n", argc);
    if (argc > 1) printf("LIBCDEMO arg=%s\n", argv[1]);

    snprintf(buf, sizeof(buf), "%05d|%x|%s", 42, 0xbeef, "ok");
    expect(strcmp(buf, "00042|beef|ok") == 0, "snprintf");

    char *dup = strdup("heap works");
    expect(dup != NULL, "strdup");
    if (dup) {
        expect(strcmp(dup, "heap works") == 0, "strdup-content");
        free(dup);
    }

    char *zeros = calloc(32, 1);
    expect(zeros != NULL, "calloc");
    if (zeros) {
        int clean = 1;
        for (int i = 0; i < 32; i++) if (zeros[i]) clean = 0;
        expect(clean, "calloc-zeroed");
        free(zeros);
    }

    FILE *f = fopen("LIBC.TXT", "w");
    expect(f != NULL, "fopen-w");
    if (f) {
        expect(fprintf(f, "cp07 %d\n", 7) == 7, "fprintf");
        expect(fclose(f) == 0, "fclose-w");
    }

    f = fopen("LIBC.TXT", "r");
    expect(f != NULL, "fopen-r");
    if (f) {
        expect(fgets(buf, sizeof(buf), f) != NULL, "fgets");
        expect(strcmp(buf, "cp07 7\n") == 0, "roundtrip");
        expect(fseek(f, 0, SEEK_END) == 0, "fseek-end");
        expect(ftell(f) == 7, "ftell-end");
        expect(fseek(f, 0, SEEK_SET) == 0, "fseek-set");
        expect(ftell(f) == 0, "ftell-set");
        expect(fclose(f) == 0, "fclose-r");
    }

    struct timespec ts;
    expect(clock_gettime(CLOCK_MONOTONIC, &ts) == 0, "clock");
    expect(ts.tv_sec >= 0, "clock-range");

    /* Futex timeout path: block, then let the scheduler wake us. */
    static int futex_word;
    struct timespec tiny;
    tiny.tv_sec = 0;
    tiny.tv_nsec = 5000000;
    expect(futex_wait(&futex_word, 0, &tiny) == 0, "futex-timeout");

    struct sched_param sp;
    memset(&sp, 0, sizeof(sp));
    sp.sched_priority = 20;
    expect(sched_param(SCHED_OTHER, &sp) == 0, "sched-other");
    sp.sched_priority = 28;
    sp.period_ns = 20000000;
    sp.runtime_ns = 4000000;
    sp.deadline_ns = 20000000;
    expect(sched_param(SCHED_DEADLINE, &sp) == 0, "sched-deadline");
    sp.sched_priority = 28;
    expect(sched_param(SCHED_DEADLINE, &sp) == 0, "sched-deadline-reapply");

    /* Ask the kernel how it sees this process while SCHED_DEADLINE is
     * active, and hand the scheduler counters back out for the test.
     * Static storage: the user stack is four pages and the kernel rejects
     * any range that would extend above USER_STACK. Output stays short so a
     * line is never split across console writes. */
    static char report[2048];
    if (proc_report(report, sizeof(report)) > 0) {
        /* Print the trailing SCHED line first: truncating a PROCESS line
         * would hide everything after it. */
        char *sched = strstr(report, "SCHED ");
        if (sched) {
            char *end = strchr(sched, '\n');
            if (end) *end = 0;
            printf("%s\n", sched);
        }
        char needle[40];
        snprintf(needle, sizeof(needle), "PROCESS pid=%d ", (int)getpid());
        char *mine = strstr(report, needle);
        char *policy = mine ? strstr(mine, " policy=") : NULL;
        if (policy) {
            char *end = strchr(policy, '\n');
            if (end) *end = 0;
            printf("SELF%s\n", policy);
        }
    }

    /* Restore so the demo cannot starve the desktop for long. */
    sp.sched_priority = 16;
    expect(sched_param(SCHED_OTHER, &sp) == 0, "sched-restore");

    errno = 0;
    expect(fopen("MISSING.TXT", "r") == NULL && errno == ENOENT, "errno-enoent");

    printf(failures ? "LIBCDEMO: failed\n" : "LIBCDEMO: ok\n");
    return failures ? 1 : 0;
}