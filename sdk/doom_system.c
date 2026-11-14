/* Ring-3 replacement for DoomGeneric system service. */
#include "slopix.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "i_system.h"
extern void doom_fail(const char *) __attribute__((noreturn));
void I_AtExit(atexit_func_t f,boolean e){(void)f;(void)e;}
byte *I_ZoneBase(int *size){*size=32*1024*1024;byte*p=malloc(*size);if(!p)doom_fail("DOOM zone allocation failed");return p;}
void I_Quit(void){sx_exit(0);}
void I_Error(char*fmt,...){char s[256];va_list a;va_start(a,fmt);vsnprintf(s,sizeof(s),fmt,a);va_end(a);doom_fail(s);}
boolean I_ConsoleStdout(void){return true;}
void I_PrintStartupBanner(char*s){printf("Ring-3 DOOM: %s\n",s);}
void I_PrintBanner(char*s){puts(s);}
void I_PrintDivider(void){}
void I_Tactile(int a,int b,int c){(void)a;(void)b;(void)c;}
boolean I_GetMemoryValue(unsigned offset,void*value,int size){(void)offset;if(size!=1&&size!=2&&size!=4)return false;memset(value,0,(size_t)size);return true;}
