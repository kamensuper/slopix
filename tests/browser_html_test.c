#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "../sdk/browser_html.h"
int main(void){
 const char *html="<h1>Hello</h1><p>Some text <a href=\"ABOUT.HTM\">About us</a> please ";
 struct bh_page p={0};bh_parse(&p,html,strlen(html));
 assert(p.count>=3);
 assert(p.lines[0].style==2);
 unsigned i=bh_next_link(&p,BH_MAX_LINES-1);
 assert(i!=BH_MAX_LINES);
 assert(!strcmp(p.lines[i].href,"ABOUT.HTM"));
 assert(!strcmp(p.lines[i].text,"About us"));
 assert(bh_next_link(&p,i)==i);
 char name[13];assert(bh_filename("about.htm",name)&&!strcmp(name,"ABOUT.HTM"));
 assert(!bh_filename("../EVIL.HTM",name));
 assert(!bh_filename("http://x",name));
 assert(!bh_filename("WHATEVER.SCRIPT",name));
 bh_parse(&p,"<a href=\"http://example.org/test\">Web link</a>",strlen("<a href=\"http://example.org/test\">Web link</a>"));
 assert(p.count==1 && !strcmp(p.lines[0].href,"http://example.org/test"));
 bh_parse(&p,"<p>No links</p>",15);assert(bh_next_link(&p,0)==BH_MAX_LINES);
 puts("PASS: browser HTML heading, separate link ownership, traversal rejection, link selection");
}
