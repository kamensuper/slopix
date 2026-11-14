#ifndef SLOPIX_BROWSER_HTML_H
#define SLOPIX_BROWSER_HTML_H
/* Deliberately bounded HTML-ish text flow for Genesis local documents.
 * NOT a standards-compliant HTML/CSS parser. It never executes scripts.
 * Host-testable without any Slopix kernel dependencies. */
#include <stddef.h>
#include <stdint.h>
#define BH_MAX_LINES 128
#define BH_TEXT 72
struct bh_line {char text[BH_TEXT];char href[96];uint8_t style;};
struct bh_page {struct bh_line lines[BH_MAX_LINES];unsigned count;};
static int bh_space(char c){return c==' '||c=='\t'||c=='\n'||c=='\r';}
static char bh_upper(char c){return c>='a'&&c<='z'?(char)(c-32):c;}
static int bh_tag(const char*s,const char*tag){while(*tag&&bh_upper(*s)==bh_upper(*tag)){s++;tag++;}return !*tag&&(!*s||bh_space(*s)||*s=='>');}
static int bh_filename(const char*s,char out[13]){
 unsigned n=0,stem=0,ext=0;int dot=0;
 if(!s||!*s)return 0;
 if(s[0]=='#')return 0;
 while(*s&&*s!='#'&&*s!='?'&&n<12){char c=bh_upper(*s++);
  if(c=='.'&&!dot&&stem){dot=1;out[n++]=c;continue;}
  if(!((c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='_'))return 0;
  if(!dot){if(++stem>8)return 0;}else if(++ext>3)return 0;
  out[n++]=c;
 }
 out[n]=0;return dot&&ext>0&&!*s; /* no paths, schemes, fragments or query */
}
static void bh_push(struct bh_page*p,const char*text,unsigned len,unsigned style,const char*href){
 while(len&&p->count<BH_MAX_LINES){
  while(len&&bh_space(*text)){text++;len--;}
  if(!len)break;
  unsigned chunk=len<BH_TEXT-1?len:BH_TEXT-1;
  if(chunk<len){unsigned cut=chunk;while(cut>0&&!bh_space(text[cut]))cut--;if(cut>0)chunk=cut;}
  struct bh_line *line=&p->lines[p->count++];
  for(unsigned i=0;i<chunk;i++)line->text[i]=text[i];
  line->text[chunk]=0;
  line->style=(uint8_t)style;unsigned i=0;
  if(href)for(;i<95&&href[i];i++)line->href[i]=href[i];
  line->href[i]=0;
  text+=chunk;len-=chunk;
 }
}
/* Returns first link after 'from', wrapping once. BH_MAX_LINES signals none. */
static unsigned bh_next_link(const struct bh_page*p,unsigned from){
 if(!p->count)return BH_MAX_LINES;
 for(unsigned offset=1;offset<=p->count;offset++){
  unsigned i=(from+offset)%p->count;
  if(p->lines[i].href[0])return i;
 }
 return BH_MAX_LINES;
}
static void bh_parse(struct bh_page*p,const char *html,size_t bytes){
 p->count=0;size_t at=0;unsigned style=0;char link[96]={0};
 char pending[BH_TEXT*2];unsigned plen=0;
 while(at<bytes&&html[at]&&p->count<BH_MAX_LINES){
  if(html[at]=='<'){
   size_t end=at+1;while(end<bytes&&html[end]&&html[end]!='>'&&end-at<256)end++;
   if(end<bytes&&html[end]=='>'){
    char tag[256];unsigned n=(unsigned)(end-at-1);for(unsigned i=0;i<n;i++)tag[i]=html[at+1+i];tag[n]=0;
    int break_before=bh_tag(tag,"h1")||bh_tag(tag,"h2")||bh_tag(tag,"p")||bh_tag(tag,"div")||bh_tag(tag,"li")||bh_tag(tag,"br")||bh_tag(tag,"/p")||bh_tag(tag,"/h1")||bh_tag(tag,"/h2")||bh_tag(tag,"/div")||bh_tag(tag,"/li")||bh_tag(tag,"a")||bh_tag(tag,"/a");
    if(break_before&&plen){bh_push(p,pending,plen,style,link[0]?link:0);plen=0;}
    if(bh_tag(tag,"h1"))style=2;else if(bh_tag(tag,"h2"))style=1;
    else if(bh_tag(tag,"/h1")||bh_tag(tag,"/h2"))style=0;
    if(bh_tag(tag,"/a"))link[0]=0;
    else if((bh_upper(tag[0])=='A')&&bh_space(tag[1])){
     for(unsigned i=1;i+5<n;i++)if(bh_upper(tag[i])=='H'&&bh_upper(tag[i+1])=='R'&&bh_upper(tag[i+2])=='E'&&bh_upper(tag[i+3])=='F'&&tag[i+4]=='='){
      char quote=tag[i+5];unsigned k=i+5;if(quote=='\''||quote=='"')k++;
      char raw[96];unsigned j=0;while(tag[k]&&j<sizeof(raw)-1&&((quote=='\''||quote=='"')?tag[k]!=quote:!bh_space(tag[k])))raw[j++]=tag[k++];raw[j]=0;
      /* Preserve local and relative HTTP hyperlinks. Security checks and
       * absolute-URL resolution happen in navigate()/follow_link(). */
      int safe=j>0&&j<sizeof(link);
      for(unsigned z=0;z<j;z++)if((unsigned char)raw[z]<=32||raw[z]=='\\'||raw[z]=='\"'||raw[z]=='\'')safe=0;
      if(safe){for(unsigned z=0;z<=j;z++)link[z]=raw[z];}
      else link[0]=0;
      break;
     }
    }
    at=end+1;continue;
   }
  }
  char c=html[at++];if(bh_space(c))c=' ';
  if(c=='&'&&at<bytes){if(at+3<bytes&&html[at]=='a'&&html[at+1]=='m'&&html[at+2]=='p'&&html[at+3]==';'){c='&';at+=4;}}
  if(plen>=sizeof(pending)-2){bh_push(p,pending,plen,style,link[0]?link:0);plen=0;}
  pending[plen++]=(c>=32&&c<127)?c:'?';
 }
 if(plen)bh_push(p,pending,plen,style,link[0]?link:0);
}
#endif
