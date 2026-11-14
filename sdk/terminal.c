/* Genesis CP05 standalone Ring-3 Terminal. Command parsing and input history
 * live entirely in this ELF. Privileged services use finite, copied syscalls. */
#include "gui_kit.h"
#define NL 36
static char lines[NL][64],command[100];
static unsigned count,head,pos,scroll;
static int dirty=1;
static void output(const char*s){
 while(*s){unsigned n=0;char *line=lines[head];
  while(s[n]&&s[n]!='\n'&&n<63){line[n]=s[n];n++;}line[n]=0;
  head=(head+1)%NL;if(count<NL)count++;
  s+=n;if(*s=='\n')s++;else if(n==63&&*s){} }
 scroll=0;dirty=1;
}
static void status(int64_t value){output(value<0?"Operation failed (kernel returned error)":"OK");}
static void command_run(void){
 char full[100];gc(full,command,sizeof(full));output(command);
 char *args=full;while(*args&&*args!=' ')args++;if(*args)*args++=0;
 while(*args==' ')args++;
 if(ge(full,"help"))output("help clear echo ls cat write mkdir rm\nrun slop ps time apps browser files settings");
 else if(ge(full,"clear")){count=head=scroll=0;}
 else if(ge(full,"echo"))output(args);
 else if(ge(full,"uname"))output("Slopix Genesis CP05 x86_64 Ring-3");
 else if(ge(full,"time")){char tmp[16];gd(tmp,(unsigned)(sx_time()/1000000));output(tmp);}
 else if(ge(full,"pwd"))output("/");
 else if(ge(full,"ls")){struct sx_dirent entries[48];int64_t n=sx_readdir("/",entries,48);if(n<0)status(n);else for(int i=0;i<n;i++)output(entries[i].name);}
 else if(ge(full,"cat")){int64_t fd=sx_open(args);if(fd<0)status(fd);else{char b[256];int64_t n=sx_read((int)fd,b,sizeof(b)-1);if(n>=0){b[n]=0;output(b);}else status(n);sx_close((int)fd);}}
 else if(ge(full,"write")){
  char *body=args;while(*body&&*body!=' ')body++;if(*body)*body++=0;
  if(!*args||!*body)output("Usage: write FILE.TXT text");else{int64_t fd=sx_create(args,1);if(fd<0)status(fd);else{int64_t r=sx_fwrite((int)fd,body,gs(body));sx_close((int)fd);status(r);}}}
 else if(ge(full,"rm"))status(sx_remove(args));
 else if(ge(full,"mkdir"))status(sx_mkdir(args));
 else if(ge(full,"run")){
  /* `run FILE.ELF [mode]` - the mode becomes _start's first argument. */
  char *m=args;while(*m&&*m!=' ')m++;uint64_t mode=0;
  if(*m){*m++=0;while(*m==' ')m++;while(*m>='0'&&*m<='9')mode=mode*10+(unsigned)(*m++-'0');}
  int64_t n=sx_spawn(args,mode);if(n<0)status(n);else{char b[16];gd(b,(unsigned)n);output("Started PID:");output(b);}}
 else if(ge(full,"slop")){char b[2048];int64_t n=sx_package(args,b,sizeof(b));if(n<0)status(n);else if(n)output(b);else output("slop command completed");}
 else if(ge(full,"ps")){char b[2048];int64_t n=sx_procinfo(b,sizeof(b));if(n<0)status(n);else output(b);}
 else if(ge(full,"apps")||ge(full,"find"))status(sx_desktop_open(3));
 else if(ge(full,"browser"))status(sx_desktop_open(6));
 else if(ge(full,"files"))status(sx_desktop_open(5));
 else if(ge(full,"settings"))status(sx_desktop_open(4));
 else if(ge(full,"doom"))status(sx_desktop_open(2));
 else if(ge(full,"demo"))status(sx_desktop_open(1));
 else if(*full)output("Unknown command. Type help");
 pos=0;command[0]=0;dirty=1;
}
static void key(unsigned k){
 if(k==SXK_ENTER){command_run();return;}
 if(k==SXK_BACKSPACE){if(pos)command[--pos]=0;dirty=1;return;}
 if(k==SXK_PGUP){if(scroll+1<count)scroll++;dirty=1;return;}
 if(k==SXK_PGDN){if(scroll)scroll--;dirty=1;return;}
 if(k>=32&&k<=126&&pos<sizeof(command)-1){command[pos++]=(char)k;command[pos]=0;dirty=1;}
}
static void draw(void){
 gbase("SlopTerm / Ring 3");gt(12,44,"Independent ELF / syscalls",0x507484);
 gf(8,68,496,203,0xffffff);
 unsigned rows=9,view=count>scroll?count-scroll:0;if(view>rows)view=rows;
 unsigned start=(head+NL-(count-scroll))%NL;
 if(count>scroll+rows)start=(start+count-scroll-rows)%NL;
 for(unsigned i=0;i<view;i++)gt(16,72+i*21,lines[(start+i)%NL],0x253f52);
 gf(10,276,490,30,0xe0efeb);gt(15,280,">",0x267f87);gt(39,280,command,0x203b51);
 gp();dirty=0;
}
__attribute__((noreturn)) void _start(void){
 if(sx_gui_open(GW,GH)<0)sx_exit(1);
 output("Slopix Genesis Terminal / userspace");output("Type help. PageUp/PageDown scroll.");
 for(;;){uint64_t e;while((e=sx_gui_poll()))if(sx_gui_event_type(e)==SX_GUI_EVENT_KEY)key((unsigned)e);
  for(unsigned i=0;i<4;i++){char line[128];int64_t got=sx_console_poll(line,sizeof(line));if(got<=0)break;output(line);}
  if(dirty){draw();}sx_sleep(12000);}
}
