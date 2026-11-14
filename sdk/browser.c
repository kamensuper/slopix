/* SlopBrowse 0.5: local FAT32 HTML plus experimental real HTTP GET in Ring 3.
 * No HTTPS/TLS, CSS, JS or RFC-complete web compatibility. */
#include "slopix.h"
#include "browser_html.h"
#include "font.h"
#define BW 512u
#define BH 320u
#define DOC_CAP 32768u
#define VIEW_ROWS 8u
static uint32_t screen[BW*BH];
static char doc[DOC_CAP+1];
static struct bh_page page;
static char address[96]="START.HTM",history[8][96];
static unsigned history_count,history_index,scroll,edit,dirty=1,selected=BH_MAX_LINES;
static int address_mode,show_help,replace_address;
static char error[70];
static void cp(char*d,const char*s,unsigned cap){unsigned i=0;if(!cap)return;while(s[i]&&i+1<cap){d[i]=s[i];i++;}d[i]=0;}
static unsigned slen(const char*s){unsigned n=0;while(s[n])n++;return n;}
static void fill(unsigned x,unsigned y,unsigned w,unsigned h,uint32_t c){
 for(unsigned yy=y;yy<y+h&&yy<BH;yy++)for(unsigned xx=x;xx<x+w&&xx<BW;xx++)screen[yy*BW+xx]=c;
}
static uint32_t blend(uint32_t bg,uint32_t fg,unsigned a){unsigned i=255-a;
 return (((((bg>>16)&255)*i+((fg>>16)&255)*a)/255)<<16)|(((((bg>>8)&255)*i+((fg>>8)&255)*a)/255)<<8)|(((bg&255)*i+(fg&255)*a)/255);
}
static void label(unsigned x,unsigned y,const char*s,uint32_t color){
 while(*s&&x+10<BW){unsigned char c=(unsigned char)*s++;if(c<32||c>126)c='?';
  for(unsigned j=0;j<20;j++)for(unsigned k=0;k<10;k++)if(x+k<BW&&y+j<BH){unsigned a=font[c-32][j][k];if(a)screen[(y+j)*BW+x+k]=blend(screen[(y+j)*BW+x+k],color,a);}
  x+=10;
 }
}
static int prefix(const char*s,const char*begin){while(*begin){if(*s++!=*begin++)return 0;}return 1;}
static void net_error(int code){
 if(code==-19)cp(error,"Network offline: run make run-net",sizeof(error));
 else if(code==-110)cp(error,"HTTP/DNS timeout. Check network server",sizeof(error));
 else if(code==-90)cp(error,"Page exceeds 32 KiB HTTP limit",sizeof(error));
 else if(code==-95)cp(error,"HTTPS or encoding is unsupported",sizeof(error));
 else if(code==-40)cp(error,"Too many HTTP redirects",sizeof(error));
 else if(code==-101)cp(error,"Could not reach the gateway",sizeof(error));
 else if(code==-22)cp(error,"Invalid URL (plain http:// only)",sizeof(error));
 else if(code<=-1300&&code>-1600)cp(error,"HTTP response was not successful (non-200)",sizeof(error));
 else cp(error,"HTTP request failed or unsupported response",sizeof(error));
}
static int readfile(const char*name){
 int64_t fd=sx_open(name);if(fd<0)return 0;
 unsigned n=0;int ok=1;
 while(n<DOC_CAP){int64_t got=sx_read((int)fd,doc+n,4096);if(got<0){ok=0;break;}if(!got)break;n+=(unsigned)got;}
 if(n==DOC_CAP){char extra;int64_t got=sx_read((int)fd,&extra,1);if(got!=0)ok=0;}
 sx_close((int)fd);doc[n]=0;if(!ok)return 0;
 bh_parse(&page,doc,n);return 1;
}
static void navigate(const char*name,int record){
 char target[96];cp(target,name,sizeof(target));
 int remote=prefix(target,"http://");
 if(prefix(target,"https://")){
  cp(error,"HTTPS is unavailable (no TLS/cert validation)",sizeof(error));dirty=1;return;
 }
 if(!remote){char safe[13];if(!bh_filename(target,safe)){
  cp(error,"Local .HTM or plain http:// URL only",sizeof(error));dirty=1;return;
 }cp(target,safe,sizeof(target));}
 cp(address,target,sizeof(address));edit=0;address_mode=0;replace_address=0;
 scroll=0;selected=BH_MAX_LINES;error[0]=0;
 if(remote){
  int64_t n=sx_http_get(address,doc,DOC_CAP);
  if(n<0){page.count=0;net_error((int)n);}
  else{doc[(unsigned)n]=0;bh_parse(&page,doc,(unsigned)n);}
 }else if(!readfile(address)){
  page.count=0;cp(error,"Page missing or larger than 32 KiB",sizeof(error));
 }
 if(record){
  if(!history_count){history_count=1;history_index=0;cp(history[0],address,sizeof(history[0]));}
  else{if(history_index+1<history_count)history_count=history_index+1;
   if(history_count<8){history_index=history_count++;cp(history[history_index],address,sizeof(history[0]));}
   else{for(unsigned i=1;i<8;i++)cp(history[i-1],history[i],sizeof(history[0]));history_index=7;cp(history[7],address,sizeof(history[0]));}}
 }
 dirty=1;
}
/* Relative links must stay on the current HTTP origin, not escape into
 * FAT32. Only plain HTTP is supported; never downgrade an HTTPS link. */
static int resolve_link(const char*base,const char*ref,char*out,unsigned cap){
 unsigned n=slen(ref);
 if(!n||n>=cap||ref[0]=='#')return 0;
 if(prefix(ref,"http://")||prefix(ref,"https://")){cp(out,ref,cap);return 1;}
 if(!prefix(base,"http://")){cp(out,ref,cap);return 1;}
 /* Reject other schemes and protocol-relative references until HTTPS exists. */
 if(ref[0]=='/'&&ref[1]=='/')return 0;
 for(unsigned i=0;i<n;i++)if(ref[i]==':'||ref[i]=='\\'||ref[i]=='#')return 0;
 unsigned hostend=7;while(base[hostend]&&base[hostend]!='/')hostend++;
 if(hostend>=cap)return 0;
 if(ref[0]=='?'){
  unsigned end=hostend;
  while(base[end]&&base[end]!='?'&&base[end]!='#')end++;
  if(end+n>=cap)return 0;
  for(unsigned i=0;i<end;i++)out[i]=base[i];
  for(unsigned i=0;i<=n;i++)out[end+i]=ref[i];
  return 1;
 }
 unsigned at=0;
 for(unsigned i=0;i<hostend;i++)out[at++]=base[i];
 out[at]=0;
 char path[96];unsigned k=0;
 if(ref[0]=='/'){cp(path,ref,sizeof(path));}
 else {
  unsigned pos=hostend,dir=0;
  if(base[pos]=='/'){
   while(base[pos]&&base[pos]!='?'&&base[pos]!='#'){
    if(base[pos]=='/')dir=pos-hostend+1;
    pos++;
   }
  }
  if(!dir)path[k++]='/';
  else {for(unsigned i=0;i<dir&&k<sizeof(path)-1;i++)path[k++]=base[hostend+i];}
  if(k+n>=sizeof(path))return 0;
  for(unsigned i=0;i<=n;i++)path[k+i]=ref[i];
 }
 /* Normalize literal dot segments, without percent-decoding URI path data. */
 char clean[96];unsigned w=0,pos=0;
 while(path[pos]&&path[pos]!='?'&&path[pos]!='#'){
  while(path[pos]=='/')pos++;
  if(!path[pos]||path[pos]=='?'||path[pos]=='#')break;
  unsigned first=pos;while(path[pos]&&path[pos]!='/'&&path[pos]!='?'&&path[pos]!='#')pos++;
  unsigned len=pos-first;
  if(len==1&&path[first]=='.')continue;
  if(len==2&&path[first]=='.'&&path[first+1]=='.'){
   if(w) {while(w&&clean[w-1]!='/')w--;if(w)w--;}
   continue;
  }
  if(w+len+1>=sizeof(clean))return 0;
  clean[w++]='/';for(unsigned i=0;i<len;i++)clean[w++]=path[first+i];
 }
 if(!w)clean[w++]='/';
 if(pos&&path[pos-1]=='/'&&clean[w-1]!='/'&&w+1<sizeof(clean))clean[w++]='/';
 if(path[pos]=='?'){while(path[pos]&&w+1<sizeof(clean))clean[w++]=path[pos++];if(path[pos])return 0;}
 if(at+w>=cap)return 0;
 for(unsigned i=0;i<w;i++)out[at++]=clean[i];
 out[at]=0;
 return 1;
}
static void follow_link(void){
 if(selected>=page.count||!page.lines[selected].href[0])return;
 char link[96];if(!resolve_link(address,page.lines[selected].href,link,sizeof(link))){
  cp(error,"Unsupported or oversized hyperlink",sizeof(error));dirty=1;return;
 }navigate(link,1);
}
static void jump_link(void){
 unsigned next=bh_next_link(&page,selected==BH_MAX_LINES?BH_MAX_LINES-1:selected);
 if(next==BH_MAX_LINES){cp(error,"This page has no links",sizeof(error));dirty=1;return;}
 selected=next;error[0]=0;
 if(selected<scroll)scroll=selected;
 if(selected>=scroll+VIEW_ROWS)scroll=selected-VIEW_ROWS+1;
 dirty=1;
}
static void history_move(int direction){
 if(direction<0&&history_index){history_index--;navigate(history[history_index],0);}
 if(direction>0&&history_index+1<history_count){history_index++;navigate(history[history_index],0);}
}
static void mouse_click(unsigned x,unsigned y){
 if(y<43){
  if(x<35){history_move(-1);return;}
  if(x<68){history_move(1);return;}
  if(x<105){navigate(address,0);return;}
  if(x<500){address_mode=1;edit=slen(address);replace_address=1;error[0]=0;dirty=1;return;}
 }
 if(show_help){show_help=0;dirty=1;return;}
 if(y>=52&&y<52+VIEW_ROWS*29){
  unsigned i=scroll+(y-52)/29;
  if(i<page.count){selected=i;dirty=1;if(page.lines[i].href[0])follow_link();}
 }
}
static void paint(void){
 fill(0,0,BW,BH,0xf5f8f9);fill(0,0,BW,43,0x223e52);fill(0,43,BW,1,0x7296a7);
 label(12,9,"<",0xe9f5fc);label(42,9,">",0xe9f5fc);label(76,9,"R",0xe9f5fc);
 fill(105,6,395,30,address_mode?0xfff7d9:0xffffff);/* Scroll long URLs inside the address field rather than writing over chrome. */
 unsigned alen=slen(address),skip=alen>36?alen-36:0;
 label(114,10,address+skip,0x213d4d);
 if(address_mode){
  if(!edit)label(114,10,"type local .HTM file",0x7c959f);
  fill(114+10u*(edit>36?36:edit),29,8,2,0x209eb6);
}
 if(error[0]){label(15,51,error,0xa53c39);}
 if(show_help){
  fill(8,77,BW-16,187,0xe7f0ec);
  label(16,88,"SLOPBROWSE 0.5",0x17506e);
  label(16,122,"/  address | Enter  load",0x29485c);
  label(16,151,"Tab link | Enter  follow",0x29485c);
  label(16,180,"[ back | ] forward | R reload",0x29485c);
  label(16,209,"Up/Down scroll | H help",0x29485c);
  label(16,238,"HTTP GET supported; HTTPS not yet.",0x5f6c70);
 }else if(page.count){
  for(unsigned i=0;i<VIEW_ROWS&&i+scroll<page.count;i++){
   unsigned index=i+scroll;const struct bh_line*line=&page.lines[index];unsigned y=52+i*29;
   if(line->style==2)fill(10,y-2,BW-20,27,0xe0ecf5);
   if(index==selected)fill(10,y-2,BW-20,26,0xc5e7e4);
   label(16,y,line->text,line->href[0]?0x08729b:line->style==2?0x193d56:line->style==1?0x315d7d:0x283e4d);
   if(line->href[0]){unsigned span=10u*slen(line->text);if(span>BW-32)span=BW-32;fill(15,y+22,span,1,0x0c8ba6);}
  }
 }else if(!error[0])label(15,66,"This page is empty",0x425a6b);
 fill(0,BH-23,BW,23,0xdce8ea);
 label(12,BH-21,"Click address/links | / edit | H help",0x506a77);
 sx_gui_present(screen,BW*BH);dirty=0;
}
static void handle_event(uint64_t e){
   if(sx_gui_event_type(e)==SX_GUI_EVENT_MOUSE){
    if(sx_gui_mouse_buttons(e)&1)mouse_click(sx_gui_mouse_x(e),sx_gui_mouse_y(e));
    return;
   }
   unsigned k=(unsigned)e;if(sx_gui_event_type(e)!=SX_GUI_EVENT_KEY)return;
   if(address_mode){
    if(k==SXK_ESCAPE){address_mode=0;replace_address=0;dirty=1;}
    else if(k==SXK_BACKSPACE){if(replace_address){address[0]=0;edit=0;replace_address=0;}else if(edit)address[--edit]=0;dirty=1;}
    else if(k==SXK_ENTER){navigate(address,1);}
    else if(k>=32&&k<=126){if(replace_address){address[0]=0;edit=0;replace_address=0;}if(edit<sizeof(address)-1){address[edit++]=(char)k;address[edit]=0;}dirty=1;}
    return;
   }
   if(k==SXK_TAB)jump_link();
   else if(k==SXK_ENTER)follow_link();
   else if(k==SXK_UP||k==SXK_PGUP){if(scroll){scroll--;dirty=1;}}
   else if(k==SXK_DOWN||k==SXK_PGDN){if(scroll+VIEW_ROWS<page.count){scroll++;dirty=1;}}
   else if(k=='r'||k=='R')navigate(address,0);
   else if(k=='<'||k=='['||k==SXK_LEFT)history_move(-1);
   else if(k=='>'||k==']'||k==SXK_RIGHT)history_move(1);
   else if(k=='/'){address_mode=1;edit=0;address[0]=0;replace_address=0;dirty=1;}
   else if(k=='h'||k=='H'){show_help=!show_help;dirty=1;}
}
__attribute__((noreturn)) void _start(void){
 unsigned short cs;__asm__ volatile("mov %%cs,%0":"=r"(cs));if((cs&3)!=3)sx_exit(90);
 if(sx_gui_open(BW,BH)<0)sx_exit(10);
 navigate("START.HTM",1);
 for(;;){
  uint64_t e;while((e=sx_gui_poll()))handle_event(e);
  if(dirty)paint();
  sx_sleep(12000);
 }
}
