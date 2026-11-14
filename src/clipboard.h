#ifndef SLOPIX_CLIPBOARD_H
#define SLOPIX_CLIPBOARD_H
#include <stddef.h>
/* Main-thread copied text; allocation failure returns 0 and preserves old text.
 * get() is borrowed until the next successful set(). No host bridge. */
size_t clipboard_set(const char*data,size_t bytes);
const char*clipboard_get(size_t*bytes);
#endif
