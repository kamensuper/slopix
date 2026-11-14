#ifndef SLOPIX_FILES_H
#define SLOPIX_FILES_H
#include "../kernel.h"
void files_open(void);
int files_allow_close(void);
void files_draw(int x,int y,int w,int h);
void files_key(unsigned key);
void files_context(int x,int y,int w,int h);
void files_mouse(int x,int y,int w,int h);
#endif
