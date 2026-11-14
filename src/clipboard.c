#include "clipboard.h"
#include "heap.h"
static char *content;static size_t size;
size_t clipboard_set(const char*data,size_t bytes){
    if((!data&&bytes)||bytes==(size_t)-1)return 0;
    if(!bytes){heap_free(content);content=0;size=0;return 0;}
    char*next=heap_alloc(bytes+1);if(!next)return 0;
    for(size_t i=0;i<bytes;i++){unsigned char c=(unsigned char)data[i];next[i]=(c=='\n'||c=='\r'||c=='\t'||(c>=32&&c<=126))?(char)c:'?';}
    next[bytes]=0;heap_free(content);content=next;size=bytes;return size;
}
const char*clipboard_get(size_t*bytes){if(bytes)*bytes=size;return content?content:"";}
