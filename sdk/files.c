/* Slopix FileSlop CP05: completely separate Ring-3 ELF. FAT32 access only
 * through bounded syscalls. Read, view, create, remove and mkdir supported. */
#include "gui_kit.h"
#define FILES_MAX 128u
static struct sx_dirent entries[FILES_MAX];
static unsigned mouse_held;
static char cwd[112]="/",name[16],content[600],message[52];
static unsigned count,selected,top,edit_len;
static int mode,dirty=1,confirm_dir,edit_stage;
static char selected_path[128];
enum {LIST,VIEW,NEW,DELETE_CONFIRM};
static void info(const char*s){gc(message,s,sizeof(message));dirty=1;}
static void join(const char*entry,char*path){gc(path,cwd,128);unsigned n=gs(path);if(n>1&&n<126)path[n++]='/';path[n]=0;gc(path+n,entry,128-n);}
/* Pages through the directory 48 entries at a time (B-11); the list used to
 * stop silently at 48. */
static void refresh(void){int64_t n=0;count=0;
 for(;;){unsigned want=FILES_MAX-count;if(want>48)want=48;if(!want)break;n=sx_readdir_at(cwd,entries+count,want,count);if(n<0)break;count+=(unsigned)n;if((unsigned)n<want)break;}
 if(n<0&&!count)info("Cannot list FAT32 path");
 else info(count>=FILES_MAX?"Showing the first 128 entries":"Enter open | N new | M mkdir | D delete");
 if(selected>=count)selected=0;if(top>selected)top=selected;}
static void open_selected(void){if(selected>=count)return;struct sx_dirent *e=&entries[selected];join(e->name,selected_path);
 if(e->directory){gc(cwd,selected_path,sizeof(cwd));selected=top=0;refresh();return;}
 int64_t fd=sx_open(selected_path);if(fd<0){info("File could not be opened");return;}
 int64_t n=sx_read((int)fd,content,sizeof(content)-1);sx_close((int)fd);
 if(n<0){info("File could not be read");return;}content[n]=0;
 for(int64_t i=0;i<n;i++){unsigned char c=content[i];if((c<32&&c!=10&&c!=13&&c!=9)||c>126)content[i]='.';}
 mode=VIEW;info("Preview (first 599 bytes). Esc returns");}
static void up(void){if(gs(cwd)<2)return;unsigned n=gs(cwd);while(n>1&&cwd[n-1]!='/')n--;if(n>1)n--;cwd[n]=0;selected=top=0;refresh();}
static void start_new(int directory){mode=NEW;edit_stage=directory?2:0;edit_len=0;name[0]=content[0]=0;info(directory?"New folder: enter name, then Enter":"New file: name, Enter, text, Enter");}
static void save(void){if(!name[0]){info("Missing 8.3 filename");return;}
 char path[128];join(name,path);
 if(edit_stage==2){if(sx_mkdir(path)<0){info("mkdir failed");return;}}
 else{int64_t fd=sx_create(path,0);if(fd<0){info("File exists or invalid name");return;}
  int64_t n=sx_fwrite((int)fd,content,gs(content));sx_close((int)fd);if(n<0){info("Write failed");return;}}
 mode=LIST;refresh();info("Saved on FAT32");}
static void do_delete(void){if(sx_remove(selected_path)<0)info("Delete failed / directory unsupported");else{mode=LIST;refresh();info("Deleted");}}
static void key(unsigned k){
 if(k==SXK_ESCAPE){mode=LIST;dirty=1;return;}
 if(mode==DELETE_CONFIRM){if(k==SXK_ENTER&&!confirm_dir)do_delete();else if(k==SXK_ENTER)info("Cannot delete folders here");return;}
 if(mode==VIEW)return;
 if(mode==NEW){
  if(k==SXK_ENTER){if(edit_stage==0){edit_stage=1;edit_len=0;info("Now enter file contents, then Enter");}
   else {save();}dirty=1;return;}
  if(k==SXK_BACKSPACE){if(edit_len){edit_len--;if(edit_stage==1)content[edit_len]=0;else name[edit_len]=0;}dirty=1;return;}
  if(k>=32&&k<=126){if(edit_stage==1){if(edit_len<sizeof(content)-1){content[edit_len++]=(char)k;content[edit_len]=0;}}
   else if(edit_len<12){name[edit_len++]=(char)k;name[edit_len]=0;gu(name);}
   dirty=1;return;}
  return;
 }
 if(k==SXK_BACKSPACE){up();return;}
 if(k==SXK_UP&&selected){selected--;if(selected<top)top=selected;dirty=1;}
 else if(k==SXK_DOWN&&selected+1<count){selected++;if(selected>=top+8)top=selected-7;dirty=1;}
 else if(k==SXK_ENTER)open_selected();
 else if(k=='n'||k=='N')start_new(0);
 else if(k=='m'||k=='M')start_new(1);
 else if((k=='d'||k=='D')&&selected<count){join(entries[selected].name,selected_path);confirm_dir=(int)entries[selected].directory;mode=DELETE_CONFIRM;info("Delete selected file? Enter to confirm");}
 else if(k=='r'||k=='R')refresh();
}
static void paint(void){gbase("FileSlop / Ring 3");gt(15,46,cwd,0x34596b);
 if(mode==LIST){
  gt(15,73,"Name                  Bytes",0x415e67);
  for(unsigned i=0;i<8&&i+top<count;i++){unsigned j=i+top;gbutton(14,99+i*24,484,entries[j].name,j==selected);
   char bytes[16];gd(bytes,entries[j].size);gt(332,103+i*24,entries[j].directory?"DIR":bytes,0x476171);}
 }else if(mode==VIEW){gt(14,79,"Text preview",0x30536b);
  unsigned x=14,y=114;for(unsigned i=0;content[i]&&y<265;i++){char c=content[i];if(c=='\n'||x>=480){x=14;y+=21;if(c=='\n')continue;}
   char text[2]={c,0};gt(x,y,text,0x233c4f);x+=10;}}
 else if(mode==NEW){gt(14,79,edit_stage==2?"Create folder":edit_stage==1?"New file contents":"New file name",0x294b60);
  gbutton(14,115,480,name,edit_stage!=1);if(edit_stage==1)gbutton(14,157,480,content,1);
  gt(14,224,"Enter saves | Esc cancels",0x294b60);}
 else if(mode==DELETE_CONFIRM){gt(14,89,"Confirm delete (no undo)",0xa34241);gt(14,127,selected_path,0x304e5c);
  gt(14,162,confirm_dir?"Folder deletion unsupported":"Press Enter to delete",0x506c7b);}
 gt(12,281,message,0x41657a);gp();dirty=0;}
__attribute__((noreturn)) void _start(void){if(sx_gui_open(GW,GH)<0)sx_exit(1);refresh();for(;;){uint64_t e;
 while((e=sx_gui_poll())){if(sx_gui_event_type(e)==SX_GUI_EVENT_CLOSE)sx_exit(0);if(sx_gui_event_type(e)==SX_GUI_EVENT_KEY)key((unsigned)e);
 else if(sx_gui_event_type(e)==SX_GUI_EVENT_MOUSE&&sx_gui_left_pressed(e,&mouse_held)){unsigned y=sx_gui_mouse_y(e);if(mode==LIST&&y>=99&&y<99+8*24){unsigned n=top+(y-99)/24;if(n<count){selected=n;open_selected();dirty=1;}}}}
 if(dirty){paint();}sx_sleep(14000);}}
