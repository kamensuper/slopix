/* First-run assistant + pre-desktop sign-in. SlopDE never receives unauthenticated
 * input or draw/step events. Cursors and screen are drawn with Slopix primitives. */
#include "auth.h"
#include "account.h"
#include "kernel.h"
#include "storage/storage.h"
#include "brand.h"
#include <stdint.h>

enum phase {UNLOCKED,WELCOME,USERNAME,PASSWORD,CONFIRM,LOGIN,RECOVER};
static enum phase phase;
static char name[32],pass[64],entry[64],message[100];
static unsigned used,passlen;
static uint64_t last_second,entropy;
static int pointer_x,pointer_y,oldbuttons,dirty=1,session_warning;
static int min(int a,int b){return a<b?a:b;}
static void note(const char*s){copystr(message,s,sizeof(message));dirty=1;}
static void clear_entry(void){account_scrub(entry,sizeof(entry));used=0;dirty=1;}
static void clear_password(void){account_scrub(pass,sizeof(pass));passlen=0;}
int auth_active(void){return phase!=UNLOCKED;}
void auth_init(void){
 int state=account_load();phase=state<0?RECOVER:state?LOGIN:WELCOME;
 session_warning=!(fat_info().mounted&&fat_info().writable);
 pointer_x=(int)width/2;pointer_y=(int)height/2;oldbuttons=0;last_second=0;entropy=timer_us();
 name[0]=0;clear_entry();clear_password();message[0]=0;dirty=1;
 logstr(state<0?"AUTH_ACCOUNT_CORRUPT\n":state?"AUTH_LOGIN_REQUIRED\n":"AUTH_SETUP_REQUIRED\n");
}
static void proceed(void){
 if(phase==WELCOME){phase=USERNAME;note("");clear_entry();return;}
 if(phase==USERNAME){if(!account_name_valid(entry)){note("Use 1-24 letters, numbers, spaces, _ . -");return;}copystr(name,entry,sizeof(name));phase=PASSWORD;clear_entry();note("");return;}
 if(phase==PASSWORD){if(used<6){note("Choose a password of at least 6 characters");return;}copystr(pass,entry,sizeof(pass));passlen=used;phase=CONFIRM;clear_entry();note("");return;}
 if(phase==CONFIRM){
  unsigned mismatch=passlen^used;for(unsigned i=0;i<sizeof(pass);i++){unsigned char a=(unsigned char)pass[i],b=(unsigned char)entry[i];mismatch|=a^b;}
  if(mismatch){phase=PASSWORD;clear_entry();clear_password();note("Passwords didn't match. Try again.");return;}
  int status=account_create(name,pass,entropy^timer_us());clear_password();clear_entry();
  if(!status){note("Could not save account. Check the FAT32 data disk.");return;}
  phase=LOGIN;session_warning=status==2;
  note(status==2?"Session-only account: add writable FAT32 for persistence":"Account saved. Sign in to continue.");
  logstr(status==2?"AUTH_SESSION_ACCOUNT\n":"AUTH_ACCOUNT_SAVED\n");return;
 }
 if(phase==LOGIN){
  if(!used){note("Enter your password to unlock Slopix.");return;}
  int ok=account_check(entry);clear_entry();
  if(ok){phase=UNLOCKED;logstr("AUTH_UNLOCKED\n");note("");}
  else note("Incorrect password. Please try again.");
 }
}
void auth_key(unsigned key){
 if(!auth_active())return;
 /* Keyboard timing contributes to the session salt; not a CSPRNG. */
 entropy^=(timer_us()+0x9e3779b97f4a7c15ULL+(entropy<<6)+(entropy>>2));
 if(key==KEY_ENTER){proceed();return;}
 if(key==KEY_ESCAPE){
  if(phase==CONFIRM){phase=PASSWORD;clear_entry();clear_password();note("");}
  else if(phase==PASSWORD){phase=USERNAME;clear_entry();note("");}
  else if(phase==USERNAME){phase=WELCOME;clear_entry();note("");}
  else {clear_entry();}
  return;
 }
 if(key==KEY_BACKSPACE){if(used){entry[--used]=0;dirty=1;}return;}
 if(key>=32&&key<=126&&used+1<sizeof(entry)){
  if(phase==USERNAME&&used>=24)return;
  if(phase==WELCOME||phase==RECOVER)return;
  entry[used++]=(char)key;entry[used]=0;dirty=1;
 }
}
static void centered(int x,int y,int w,const char*s,uint32_t c){int chars=(int)length(s);text(x+(w-chars*10)/2,y,s,c);}
static void small_pill(int x,int y,int w,const char*s,int selected){roundbox(x,y,w,30,15,selected?0x76ded6:0x213a55,selected?255:220);centered(x,y+5,w,s,selected?0x102f40:0xd8e9f6);}
static void field(int x,int y,int w,const char *label,int secret){
 text(x,y-31,label,0xb4d5e6);
 roundbox(x-2,y-2,w+4,50,12,0x83d8d2,55);
 roundbox(x,y,w,46,11,0x10283e,240);
 char view[48];unsigned n=min((int)used,38);for(unsigned i=0;i<n;i++)view[i]=secret?'*':entry[i];view[n]=0;
 if(n){text(x+16,y+11,view,0xffffff);text(x+16+(int)n*10,y+11,"|",0x72e8ce);}
 else text(x+16,y+11,secret?"Password":"Type here...",0x7396a9);
}
/* Seven-segment clock inspired by the large, quiet macOS lock-screen clock. */
static void segment(int x,int y,int horizontal){roundbox(x,y,horizontal?29:5,horizontal?5:18,2,0xe5fcfa,245);}
static void clock_digit(int x,int y,unsigned digit){
 static const unsigned segments[10]={0x3f,0x06,0x5b,0x4f,0x66,0x6d,0x7d,0x07,0x7f,0x6f};
 unsigned m=segments[digit];
 if(m&1)segment(x+4,y,1);
 if(m&2)segment(x+32,y+5,0);
 if(m&4)segment(x+32,y+27,0);
 if(m&8)segment(x+4,y+45,1);
 if(m&16)segment(x,y+27,0);
 if(m&32)segment(x,y+5,0);
 if(m&64)segment(x+4,y+22,1);
}
static void lock_clock(int w,int y){
 extern int arch_date(char*,unsigned);
 char date[48];if(!arch_date(date,sizeof(date)))return;
 if(length(date)<20||date[15]<'0'||date[15]>'9'||date[16]<'0'||date[16]>'9'||date[18]<'0'||date[18]>'9'||date[19]<'0'||date[19]>'9')return;
 int x=w/2-94;
 clock_digit(x,y,(unsigned)(date[15]-'0'));
 clock_digit(x+43,y,(unsigned)(date[16]-'0'));
 disc(x+92,y+15,3,0xe5fcfa);disc(x+92,y+35,3,0xe5fcfa);
 clock_digit(x+106,y,(unsigned)(date[18]-'0'));
 clock_digit(x+149,y,(unsigned)(date[19]-'0'));
}
static void screen_background(void){
 int h=(int)height,w=(int)width;
 /* A lightweight layered aurora instead of a bitmap requiring more assets. */
 for(int y=0;y<h;y+=3){uint32_t c=blend(0x07152b,0x126779,(unsigned)y*255/(unsigned)h);rect(0,y,w,3,c);}
 roundbox(w/2-580,h/2-250,700,350,160,0x3cbabb,28);
 roundbox(w/2+140,h/2-190,430,360,160,0x7cb7ff,25);
 roundbox(w/2-450,h/2+130,780,200,100,0x1eb99d,28);
 for(int i=0;i<6;i++){rect(0,h-100+i*10,w,10,blend(0x15354c,0x07152b,(unsigned)i*38));}
 text(28,20,"SLOPIX",0xd5f9ed);
 text(w-230,20,"Pre-Genesis / 0.9",0xc0d5e2);
 text(32,h-34,"slopix // the machine is yours",0x94bbca);
}
void auth_render(void){
 if(!auth_active())return;
 graphics_reset_clip();screen_background();
 int w=(int)width,h=(int)height,cw=510,ch=456,cx=(w-cw)/2,cy=(h-ch)/2;
 if(phase==LOGIN&&h>=740)lock_clock(w,49);
 roundbox(cx+5,cy+13,cw,ch,28,0x06101d,95);
 roundbox(cx,cy,cw,ch,28,0x0b2036,232);
 roundbox(cx+1,cy+1,cw-2,1,1,0x85cfdd,110);
 /* Setup progress indicator + centered Slopix identity symbol. */
 disc(w/2,cy+71,40,0x153c51);disc(w/2,cy+71,35,0x2caeab);
 rgba_blit(slopix_logo,28,28,w/2-14,cy+57);
 if(phase==WELCOME){
  centered(cx,cy+143,cw,"Welcome to Slopix.",0xf3ffff);
  centered(cx,cy+186,cw,"A little OS with big ideas.",0xb3d0e0);
  centered(cx,cy+221,cw,"Make this machine your own.",0xb3d0e0);
  centered(cx,cy+257,cw,"One minute. Two questions. Done.",0x9fb8cf);
 }else if(phase==USERNAME){
  centered(cx,cy+139,cw,"What is your name?",0xf3ffff);
  centered(cx,cy+177,cw,"This is how Slopix will greet you.",0xb3d0e0);
  field(cx+65,cy+259,cw-130,"YOUR NAME",0);
 }else if(phase==PASSWORD||phase==CONFIRM){
  centered(cx,cy+139,cw,phase==PASSWORD?"Create a password":"One more time...",0xf3ffff);
  centered(cx,cy+180,cw,phase==PASSWORD?"For your own little corner of Slopix.":"Confirm your password to finish.",0xb3d0e0);
  field(cx+65,cy+259,cw-130,phase==PASSWORD?"PASSWORD":"CONFIRM PASSWORD",1);
 }else if(phase==LOGIN){
  centered(cx,cy+136,cw,"Welcome back,",0xb3d0e0);
  centered(cx,cy+171,cw,account_name(),0xffffff);
  field(cx+65,cy+267,cw-130,"ENTER PASSWORD",1);
 }else if(phase==RECOVER){
  centered(cx,cy+140,cw,"Account data needs repair",0xffffff);
  centered(cx,cy+188,cw,"ACCOUNT.DAT exists but is invalid.",0xf3c5b3);
  centered(cx,cy+220,cw,"Your disk has not been changed.",0xb3d0e0);
  centered(cx,cy+259,cw,"Back it up before making repairs.",0xb3d0e0);
 }
 if(phase!=RECOVER){
  small_pill(cx+142,cy+351,cw-284,phase==WELCOME?"Let's begin  >":phase==LOGIN?"Unlock  >":phase==CONFIRM?"Finish setup  >":"Continue  >",1);
  centered(cx,cy+398,cw,phase==WELCOME?"Press Enter to begin":phase==LOGIN?"Press Enter to sign in":"Enter to continue  /  Esc to go back",0x90b2c4);
 }
 if(message[0])centered(cx,cy+322,cw,message,0xffd5ab);
 if(session_warning&&phase!=RECOVER){
  centered(cx,cy+426,cw,"No writable disk: account lasts this session",0xe8c9a9);
 }else if(phase==LOGIN&&account_persistent())centered(cx,cy+426,cw,"Your account is stored on the Slopix FAT32 disk",0x92bdba);
 damage(0,0,w,h);present();
 if(pointer_x>=0&&pointer_y>=0)cursor_present(pointer_x,pointer_y);
 graphics_reset_clip();dirty=0;
}
void auth_mouse(int x,int y,int buttons){
 pointer_x=x;pointer_y=y;entropy^=timer_us()+((uint64_t)(unsigned)x<<20)+(unsigned)y;
 int clicked=(buttons&1)&&!(oldbuttons&1);oldbuttons=buttons;
 if(clicked&&phase!=RECOVER){int cx=((int)width-510)/2,cy=((int)height-456)/2;
  if(x>=cx+142&&x<cx+510-142&&y>=cy+351&&y<cy+381)proceed();}
 if(clicked)dirty=1;else if(!dirty)cursor_present(x,y);
}
void auth_step(uint64_t now){
 if(!auth_active())return;
 if(now/1000000!=last_second){last_second=now/1000000;dirty=1;}
 if(dirty)auth_render();
}
void auth_resized(void){dirty=1;pointer_x=(int)width/2;pointer_y=(int)height/2;}
