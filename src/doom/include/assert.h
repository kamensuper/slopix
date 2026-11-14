void slop_assert(const char *,const char *,int) __attribute__((noreturn));
#define assert(x) ((x)?(void)0:slop_assert(#x,__FILE__,__LINE__))
