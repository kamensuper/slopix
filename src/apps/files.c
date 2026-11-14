/* FileSlop: bounded previews and path navigation. Paint never performs I/O. */
#include "files.h"
#include "../fs/vfs.h"
#include "../apps.h"
#include "../ui/shell.h"
#include "../preferences.h"
#include "../clipboard.h"
#include "../user/process.h"
#define ENTRIES 128
#define VIEW_LINES 4096
struct file_entry {char name[13];uint32_t size;int directory;};
static struct file_entry entries[ENTRIES];
static unsigned count,selected,top,rows=8,view_top,horizontal,line_count,columns=1;
static int icon_view,context,context_x,context_y;static unsigned context_row;
static unsigned offsets[VIEW_LINES];
static char data[FS_MAX_FILE+1],name[13],edit[1024],confirm_name[13],message[128]="Refresh to read the root directory";
static char cwd[256]="/",operation_source[256];
static unsigned create_operation;static int confirm_directory;
static uint32_t bytes;static unsigned edit_len,name_len,mode,focus_name=1;static int truncated;
enum {BROWSE,VIEW,CREATE,CONFIRM};
static uint32_t ink(void){return prefs.light?0x293d48:0xdbe4dc;}
static uint32_t muted(void){return prefs.light?0x536977:0x9eb5c0;}
static int equal(const char*a,const char*b){while(*a&&*b){char x=*a++,y=*b++;if(x>='a'&&x<='z')x-=32;if(y>='a'&&y<='z')y-=32;if(x!=y)return 0;}return *a==*b;}
static void status(const char*s){copystr(message,s,sizeof(message));logstr("FILES: ");logstr(message);logstr("\n");}
static void entry(const char*n,uint32_t size,int directory){if(count==ENTRIES){truncated=1;return;}copystr(entries[count].name,n,sizeof(entries[count].name));entries[count].size=size;entries[count++].directory=directory;}
static int path_for(const char *leaf,char out[256]){size_t a=length(cwd),b=length(leaf);if(a+b+2>256){status("Path exceeds 255 bytes");return 0;}copystr(out,cwd,256);if(a>1)copystr(out+a,"/",256-a);copystr(out+length(out),leaf,256-length(out));return 1;}
static void refresh(void){count=0;truncated=0;if(!vfs_list_path(cwd,entry)){status(vfs_error());return;}if(selected>=count)selected=0;top=0;status(truncated?"Listing limited to 128 entries":"Enter open / Backspace up / N new / M folder / R rename / C copy");}
int files_allow_close(void){if(mode==CREATE&&(name_len||edit_len)){status("Unsaved text or name / Save first, or Esc to discard");return 0;}return 1;}
void files_open(void){if(mode==CREATE&&(name_len||edit_len))return;mode=BROWSE;context=0;refresh();}
static struct file_entry*chosen(void){return selected<count?&entries[selected]:0;}
static void button(int x,int y,int w,const char*label,int active){roundbox(x,y,w,30,3,active?prefs.accent:(prefs.light?0xd4dfdf:0x344a57),255);text(x+8,y+5,label,active?0x24383c:ink());}
static int hit(int x,int y,int bx,int by,int bw,int bh){return x>=bx&&y>=by&&x<bx+bw&&y<by+bh;}
static int is_elf(const char*s){size_t n=length(s);return n>=4&&equal(s+n-4,".ELF");}
static void open_selected(void){
 struct file_entry*f=chosen();if(!f){status("Select a file");return;}if(f->directory){char path[256];if(!path_for(f->name,path))return;copystr(cwd,path,sizeof(cwd));selected=top=0;refresh();return;}if(is_elf(f->name)){status("Select Run ELF to execute this program");return;}
 char path[256];if(!path_for(f->name,path))return;
 if(!vfs_read_at(path,0,data,FS_MAX_FILE,&bytes)||bytes>FS_MAX_FILE){status(vfs_error());return;}
 for(unsigned i=0;i<bytes;i++){unsigned char c=(unsigned char)data[i];if(c!='\n'&&c!='\r'&&c!='\t'&&(c<32||c>126)){status("Unsupported text encoding or binary file");return;}}
 data[bytes]=0;line_count=1;offsets[0]=0;truncated=0;for(unsigned i=0;i<bytes;i++)if(data[i]=='\n'){if(line_count==VIEW_LINES){truncated=1;break;}offsets[line_count++]=i+1;}
 view_top=horizontal=0;mode=VIEW;status(f->size>FS_MAX_FILE?"Preview limited to first 64 KiB; file unchanged":truncated?"View limited to 4096 lines; file unchanged":"Text view / arrows scroll / Esc returns / Ctrl+C copies");
}
static void create_begin(void){if(!vfs_info().writable){status("Storage unavailable or read-only");return;}create_operation=0;mode=CREATE;name[0]=edit[0]=0;name_len=edit_len=0;focus_name=1;status("New file / Tab changes field / existing files are preserved");}
static void action_begin(unsigned operation){
 if(operation==1){create_begin();if(mode==CREATE){create_operation=1;status("New folder / enter short name / click Save");}return;}
 struct file_entry*f=chosen();if(!f)return;char path[256];if(!path_for(f->name,path))return;
 create_begin();if(mode!=CREATE)return;create_operation=operation;copystr(operation_source,path,sizeof(operation_source));status(operation==2?"Rename within this folder / enter new name / Save":"Copy file to this folder / enter new name / Save");
}
static void go_up(void){size_t n=length(cwd);if(n>1){while(n>1&&cwd[n-1]!='/')n--;if(n>1)n--;cwd[n]=0;}selected=top=0;refresh();}
static int exists;
static void check_existing(const char*n,uint32_t size,int dir){(void)size;(void)dir;if(equal(n,name))exists=1;}
static void create_save(void){
 if(!name_len){status("Enter an 8.3 filename");return;}exists=0;if(!vfs_list_path(cwd,check_existing)){status(vfs_error());return;}if(exists){status("File already exists; choose a new name");return;}
 char path[256];if(!path_for(name,path))return;
 int ok=create_operation==1?vfs_mkdir(path):create_operation==2?vfs_rename(operation_source,path):create_operation==3?vfs_copy(operation_source,path):vfs_write(path,edit,edit_len);
 if(!ok){status(vfs_error());return;}mode=BROWSE;refresh();status(create_operation?"Saved and synced":"File created and synced");
}
static void delete_begin(void){struct file_entry*f=chosen();if(!f)return;if(!vfs_info().writable){status("Storage unavailable or read-only");return;}copystr(confirm_name,f->name,sizeof(confirm_name));confirm_directory=f->directory;mode=CONFIRM;status("Confirm deletion or press Esc to cancel");}
static void delete_confirm(void){char path[256];if(!path_for(confirm_name,path))return;if(!(confirm_directory?vfs_rmdir(path):vfs_remove(path))){status(vfs_error());return;}mode=BROWSE;refresh();status("File deleted and synced");}
static void run_selected(void){struct file_entry*f=chosen();if(!f||f->directory||!is_elf(f->name)){status("Select an ELF program first");return;}char path[256];if(!path_for(f->name,path))return;int pid=process_spawn(path,0);if(pid<0){status("Executable rejected or process limit reached");return;}status("User program started; output is in Terminal");desktop_open_app(0);}
static void paste(void){size_t n;const char*s=clipboard_get(&n);if(focus_name){for(size_t i=0;i<n&&name_len<12;i++){if((unsigned char)s[i]>=33&&(unsigned char)s[i]<=126)name[name_len++]=s[i];}name[name_len]=0;}else {size_t available=sizeof(edit)-1-edit_len;if(n>available){n=available;status("Paste limited to the 1023-byte editor capacity");}for(size_t i=0;i<n;i++)edit[edit_len++]=s[i];edit[edit_len]=0;}}
static void context_action(void){context=0;if(context_row==0)open_selected();else if(context_row==1){struct file_entry*f=chosen();if(f){clipboard_set(f->name,length(f->name));status("Filename copied");}}else delete_begin();}
void files_key(unsigned key){
 if(context){if(key==KEY_ESCAPE){context=0;return;}if(key==KEY_UP)context_row=(context_row+2)%3;else if(key==KEY_DOWN)context_row=(context_row+1)%3;else if(key==KEY_ENTER)context_action();return;}

 if(key==KEY_ESCAPE){mode=BROWSE;status(cwd);return;}
 if(mode==CONFIRM){if(key==KEY_ENTER)delete_confirm();return;}
 if(mode==CREATE){
  if(key==KEY_TAB){focus_name=!focus_name;return;}if(key==KEY_COPY){clipboard_set(focus_name?name:edit,focus_name?name_len:edit_len);status("Text copied");return;}if(key==KEY_PASTE){paste();return;}
  if(key==KEY_ENTER){if(focus_name){if(create_operation)create_save();else focus_name=0;}else if(edit_len<sizeof(edit)-1)edit[edit_len++]='\n';}
  else if(key==KEY_BACKSPACE){if(focus_name){if(name_len)name[--name_len]=0;}else if(edit_len)edit[--edit_len]=0;}
  else if(key>=32&&key<=126){if(focus_name){if(name_len<12)name[name_len++]=(char)key;}else if(edit_len<sizeof(edit)-1)edit[edit_len++]=(char)key;}
  name[name_len]=0;edit[edit_len]=0;return;
 }
 if(mode==VIEW){
  if(key==KEY_COPY){size_t n=clipboard_set(data,bytes);status(n<bytes?"Copy allocation failed or was limited; file unchanged":"Text copied");}
  else if(key==KEY_UP){if(view_top)view_top--;}else if(key==KEY_DOWN){if(view_top+1<line_count)view_top++;}
  else if(key==KEY_PGUP)view_top=view_top>rows?view_top-rows:0;
  else if(key==KEY_PGDN)view_top=view_top+rows<line_count?view_top+rows:line_count-1;
  else if(key==KEY_HOME)view_top=0;else if(key==KEY_END)view_top=line_count?line_count-1:0;
  else if(key==KEY_LEFT)horizontal=horizontal>10?horizontal-10:0;else if(key==KEY_RIGHT&&horizontal<65520)horizontal+=10;
  return;
 }
 if(key==KEY_BACKSPACE){go_up();return;}
 if(key=='n'||key=='N'){create_begin();return;}if(key=='m'||key=='M'){action_begin(1);return;}if(key=='r'||key=='R'){action_begin(2);return;}if(key=='c'||key=='C'){action_begin(3);return;}
 if(key==KEY_REFRESH){refresh();return;}if(key==KEY_ENTER){open_selected();return;}if(key==KEY_DELETE){delete_begin();return;}
 if(!count)return;
 if(key==KEY_LEFT&&icon_view){if(selected)selected--;}else if(key==KEY_RIGHT&&icon_view){if(selected+1<count)selected++;}else if(key==KEY_UP){unsigned step=icon_view?columns:1;selected=selected>=step?selected-step:0;}else if(key==KEY_DOWN){unsigned step=icon_view?columns:1;if(selected+step<count)selected+=step;}else if(key==KEY_HOME)selected=0;else if(key==KEY_END)selected=count-1;
 else if(key==KEY_PGUP)selected=selected>rows?selected-rows:0;else if(key==KEY_PGDN)selected=selected+rows<count?selected+rows:count-1;
}
void files_mouse(int x,int y,int w,int h){
 if(context){if(hit(x,y,context_x,context_y,172,96)){context_row=(unsigned)(y-context_y)/32;context_action();}else context=0;return;}
 if(mode==BROWSE&&hit(x,y,w-62,84,42,30)){icon_view=!icon_view;top=0;status(icon_view?"Icon view / arrows select / Enter opens":"List view / arrows select / Enter opens");return;}
 if(mode==CONFIRM){if(hit(x,y,20,232,110,30))delete_confirm();else if(hit(x,y,140,232,110,30))mode=BROWSE;return;}
 if(mode==CREATE){if(hit(x,y,20,h-70,110,30))create_save();else if(hit(x,y,140,h-70,110,30))mode=BROWSE;else if(hit(x,y,260,h-70,110,30))paste();else if(hit(x,y,20,128,200,30))focus_name=1;else if(y>=190&&y<h-90)focus_name=0;return;}
 if(mode==VIEW){if(hit(x,y,20,84,100,30))mode=BROWSE;else if(hit(x,y,130,84,120,30))files_key(KEY_COPY);return;}
 if(y>=84&&y<114&&x>=20&&x<20+5*92&&(x-20)%92<86){switch((x-20)/92){case 0:open_selected();break;case 1:create_begin();break;case 2:delete_begin();break;case 3:refresh();break;case 4:run_selected();break;}return;}
 if(icon_view){if(y>=124&&x>=20&&x<w-20){unsigned n=top+(unsigned)(y-124)/96*columns+(unsigned)(x-20)/140;if((unsigned)(x-20)/140<columns&&n<count&&n<top+rows)selected=n;}}
 else if(y>=124&&y<124+(int)rows*26&&x>=20&&x<w-20){unsigned n=top+(unsigned)(y-124)/26;if(n<count)selected=n;}
}
void files_context(int x,int y,int w,int h){if(mode!=BROWSE||x<20||x>=w-20||y<124||y>=h-45)return;unsigned at=icon_view?top+(unsigned)(y-124)/96*columns+(unsigned)(x-20)/140:top+(unsigned)(y-124)/26;if(at>=count||at>=top+rows||(icon_view&&(unsigned)(x-20)/140>=columns))return;selected=at;context_x=x>w-176?w-176:x;context_y=y>h-132?h-132:y;if(context_x<4)context_x=4;if(context_y<118)context_y=118;context=1;context_row=0;status("File actions / Esc cancels");}
static void draw_view(int x,int y,int w,int h){
 button(x+20,y+84,100,"Back",0);button(x+130,y+84,120,"Copy text",0);if(chosen())text(x+280,y+90,chosen()->name,ink());unsigned cols=(unsigned)(w-48)/10;if(cols>187)cols=187;
 for(unsigned row=0;row<rows&&view_top+row<line_count;row++){unsigned at=offsets[view_top+row],end=at;while(end<bytes&&data[end]!='\n')end++;if(end>at&&data[end-1]=='\r')end--;if(horizontal>end-at)at=end;else at+=horizontal;char line[192];unsigned n=0;while(at<end&&n<cols){char c=data[at++];line[n++]=c=='\t'?' ':c;}line[n]=0;text(x+24,y+127+(int)row*20,line,ink());}
 (void)h;
}
void files_draw(int x,int y,int w,int h){
 char title[320];copystr(title,cwd,sizeof(title));copystr(title+length(title)," / ",sizeof(title)-length(title));copystr(title+length(title),vfs_name(),sizeof(title)-length(title));copystr(title+length(title),vfs_info().writable?" / read-write":" / read-only",sizeof(title)-length(title));char free_text[21];struct fs_info fs=vfs_info();decimal((uint64_t)fs.free_clusters*fs.cluster_bytes/1024,free_text);copystr(title+length(title)," / free ",sizeof(title)-length(title));copystr(title+length(title),free_text,sizeof(title)-length(title));copystr(title+length(title)," KiB",sizeof(title)-length(title));text(x+20,y+53,fs.mounted?title:"No mounted filesystem / storage unavailable",muted());
 columns=icon_view&&mode==BROWSE?(unsigned)(w-40)/140:1;if(!columns)columns=1;rows=(unsigned)(h-180)/(mode==VIEW?20:icon_view&&mode==BROWSE?96:26);if(!rows)rows=1;if(mode==BROWSE&&icon_view)rows*=columns;
 if(mode==CONFIRM){text(x+20,y+112,"Delete this file permanently?",ink());text(x+20,y+146,confirm_name,ink());text(x+20,y+184,"Confirm to remove; Esc cancels",muted());button(x+20,y+232,110,"Delete",1);button(x+140,y+232,110,"Cancel",0);}
 else if(mode==CREATE){
  text(x+20,y+100,"Name (8.3)",ink());button(x+20,y+128,200,name,focus_name);
  text(x+20,y+167,create_operation?"Enter saves / Esc cancels":"Text (1023 bytes maximum / Tab changes field)",muted());rect(x+20,y+190,w-40,h-280,prefs.light?0xffffff:0x172833);
  unsigned col=0,row=0,maxcol=(unsigned)(w-48)/10,maxrow=(unsigned)(h-280)/20;for(unsigned i=0;i<edit_len&&row<maxrow;i++){char c=edit[i];if(c=='\n'){row++;col=0;continue;}char letter[2]={c=='\t'?' ':c,0};text(x+24+(int)col*10,y+194+(int)row*20,letter,ink());if(++col>=maxcol){row++;col=0;}}
  button(x+20,y+h-70,110,"Save",1);button(x+140,y+h-70,110,"Cancel",0);button(x+260,y+h-70,110,"Paste",0);
 }else if(mode==VIEW)draw_view(x,y,w,h);
 else {
  button(x+w-62,y+84,42,icon_view?"=":"[]",0);
  const char*labels[]={"Open","Create","Delete","Refresh","Run ELF"};for(unsigned i=0;i<5;i++)button(x+20+(int)i*92,y+84,86,labels[i],0);
  if(selected<top)top=selected;
  if(selected>=top+rows)top=selected-rows+1;
  if(!count)text(x+28,y+130,"No files available",muted());
  if(icon_view){top=(selected/rows)*rows;for(unsigned cell=0;cell<rows&&top+cell<count;cell++){unsigned i=top+cell;struct file_entry*f=&entries[i];int xx=x+20+(int)(cell%columns)*140,yy=y+124+(int)(cell/columns)*96;if(i==selected)roundbox(xx,yy,136,92,3,prefs.accent,255);ui_icon(f->directory?5:is_elf(f->name)?7:6,xx+50,yy+3,36);text(xx+8,yy+44,f->name,i==selected?0x253b40:ink());char n[21];decimal(f->size,n);text(xx+8,yy+66,n,i==selected?0x253b40:muted());}}
  else for(unsigned row=0;row<rows&&top+row<count;row++){unsigned i=top+row;struct file_entry*f=&entries[i];int yy=y+124+(int)row*26;if(i==selected)rect(x+20,yy,w-40,26,prefs.accent);ui_icon(f->directory?5:is_elf(f->name)?7:6,x+25,yy+4,18);text(x+52,yy+3,f->name,i==selected?0x253b40:ink());char n[21];decimal(f->size,n);text(x+210,yy+3,n,i==selected?0x253b40:muted());text(x+330,yy+3,f->directory?"directory":"bytes",i==selected?0x253b40:muted());}
 }
 text(x+20,y+h-34,message,muted());
 if(context){const char*actions[]={"Open","Copy name","Delete..."};rect(x+context_x+3,y+context_y+3,172,96,0x273b45);for(unsigned i=0;i<3;i++){rect(x+context_x,y+context_y+(int)i*32,172,32,i==context_row?prefs.accent:(prefs.light?0xe3e4d9:0x354952));text(x+context_x+8,y+context_y+(int)i*32+5,actions[i],i==context_row?0x253b40:ink());}}

}
