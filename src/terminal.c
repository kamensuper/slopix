#include "display/display.h"
#include "kernel.h"
#include "user/process.h"
#include "perf.h"
#include "apps.h"
#include "clipboard.h"
#include "preferences.h"
#include "memory.h"
#include "audio/audio.h"
#include "storage/storage.h"
#include "heap.h"
#include "slop_package.h"
#define LINES 256
#define LINE_CAP 128
#define INPUT_CAP 256
#define HISTORY 32
static char lines[LINES][LINE_CAP],input[INPUT_CAP],history[HISTORY][INPUT_CAP],draft[INPUT_CAP];
static unsigned first,count,tail,pos,input_len,hfirst,hcount,hindex;
static int scroll;
static unsigned output_style,line_style[LINES];
static void output(const char *s) {
    logstr(s);logstr("\n");
    do {
        if(count==LINES) {first=(first+1)%LINES;count--;}
        tail=(first+count)%LINES;line_style[tail]=output_style;unsigned i=0;
        while(*s&&i<LINE_CAP-1) lines[tail][i++]=*s++;
        lines[tail][i]=0;count++;
    } while(*s);
    scroll=0;scene_dirty=1;
}
static int equal(const char *a,const char *b) {
    while(*a&&*a==*b) {a++;b++;}return *a==*b;
}
static void number_line(const char *label,uint64_t n,const char *suffix) {
    char s[128],value[21];copystr(s,label,sizeof(s));decimal(n,value);
    copystr(s+length(s),value,sizeof(s)-length(s));copystr(s+length(s),suffix,sizeof(s)-length(s));output(s);
}
static uint8_t file_buffer[4096];
static char storage_cwd[256]="/";
static int storage_path(const char *arg,char out[256]){
    if(!arg||!*arg){output("A path is required");return 0;}
    size_t a=arg[0]=='/'?0:length(storage_cwd),b=length(arg);
    if(a+b+2>256){output("Path exceeds 255 bytes");return 0;}
    out[0]=0;if(a){copystr(out,storage_cwd,256);if(a>1)copystr(out+a,"/",256-a);}
    copystr(out+length(out),arg,256-length(out));return 1;
}
static int storage_cd(const char *arg){
    char joined[256],out[256]="/";
    if(!*arg)arg="/";
    if(!storage_path(arg,joined))return 0;
    unsigned at=1;const char *p=joined;
    while(*p){while(*p=='/')p++;unsigned n=0;const char *start=p;while(*p&&*p!='/'){p++;n++;}
        if(!n)break;
        if(n==1&&start[0]=='.')continue;
        if(n==2&&start[0]=='.'&&start[1]=='.'){if(at>1){while(at>1&&out[at-1]!='/')at--;if(at>1)at--;out[at]=0;}continue;}
        if(at>1)out[at++]='/';
        for(unsigned i=0;i<n;i++)out[at++]=start[i];
        out[at]=0;
    }
    uint32_t size;int dir;if(!fat_stat(out,&size,&dir)||!dir){output("Directory not found");return 0;}copystr(storage_cwd,out,sizeof(storage_cwd));output(storage_cwd);return 1;
}
static void storage_error(void){output_style=2;output(fat_error());output_style=0;}
static void file_entry(const char *name,uint32_t size,int directory){
    char label[48];copystr(label,name,sizeof(label));copystr(label+length(label),directory?" <DIR> ":" ",sizeof(label)-length(label));
    number_line(label,size," bytes");
}
static void storage_command(const char *name,char *args){
    if(equal(name,"diskinfo")){
        struct fs_info i=fat_info();
        output(i.mounted?(i.writable?"FAT32 mounted read-write":"FAT32 mounted read-only"):"No FAT32 disk mounted");
        if(i.mounted){number_line("Volume sectors: ",i.sectors,"");number_line("Cluster bytes: ",i.cluster_bytes,"");number_line("Free clusters: ",i.free_clusters,"");number_line("Free bytes: ",(uint64_t)i.free_clusters*i.cluster_bytes,"");}
        output(fat_error());return;
    }
    if(equal(name,"pwd")){output(storage_cwd);return;}
    if(equal(name,"cd")){storage_cd(args);return;}
    if(equal(name,"ls")){char path[256];if(!*args)copystr(path,storage_cwd,sizeof(path));else if(!storage_path(args,path))return;if(!fat_list_path(path,file_entry))storage_error();return;}
    if(equal(name,"sync")){if(fat_sync())output("Storage flushed");else storage_error();return;}
    char *value=args;while(*value&&*value!=' ')value++;
    if(*value){*value++=0;while(*value==' ')value++;}
    char path[256];if(!storage_path(args,path))return;
    if(equal(name,"mkdir")){if(fat_mkdir(path))output("Directory created and synced");else storage_error();return;}
    if(equal(name,"rmdir")){if(fat_rmdir(path))output("Directory removed and synced");else storage_error();return;}
    if(equal(name,"cp")||equal(name,"mv")){char dest[256];if(!storage_path(value,dest))return;if(equal(name,"cp")?fat_copy(path,dest):fat_rename(path,dest))output("Completed and synced");else storage_error();return;}
    if(equal(name,"stat")){uint32_t size;int dir;if(fat_stat(path,&size,&dir))number_line(dir?"Directory bytes: ":"File bytes: ",size,"");else storage_error();return;}
    if(equal(name,"cat")){
        uint32_t size=0,total=0;int dir;
        if(!fat_stat(path,&total,&dir)||dir){storage_error();return;}
        uint32_t limit=total>65536?65536:total,offset=0;
        char line[LINE_CAP];unsigned n=0;
        while(offset<limit){
        uint32_t cap=limit-offset;if(cap>sizeof(file_buffer))cap=sizeof(file_buffer);
        if(!fat_read_at(path,offset,file_buffer,cap,&size)||!size){storage_error();return;}
        offset+=size;
        /* Render bounded lines, replace non-text bytes; never parse file as format. */
        for(uint32_t i=0;i<size;i++){
            uint8_t c=file_buffer[i];if(c=='\r')continue;
            if(c=='\n'){line[n]=0;output(line);n=0;continue;}
            line[n++]=(c>=32&&c<=126)?(char)c:'.';
            if(n==LINE_CAP-1){line[n]=0;output(line);n=0;}
        }
        }
        if(n){line[n]=0;output(line);}if(total>limit)output("Preview limited to first 64 KiB; file unchanged");return;
    }
    if(equal(name,"rm")){if(fat_remove(path))output("File removed and synced");else storage_error();return;}
    uint32_t size=0;
    int dir=0;if(equal(name,"append")&&!fat_stat(path,&size,&dir)){storage_error();return;}
    if(dir){output("Cannot append to a directory");return;}
    uint32_t n=(uint32_t)length(value);
    if(n+1>sizeof(file_buffer)){output("Input exceeds command buffer");return;}
    for(uint32_t i=0;i<n;i++)file_buffer[i]=(uint8_t)value[i];
    file_buffer[n++]='\n';
    int ok=equal(name,"append")?fat_write_at(path,size,file_buffer,n):fat_write(path,file_buffer,n);
    if(ok)number_line("Saved and synced: ",(uint64_t)size+n," bytes");else storage_error();
}
static int audio_numbers(char *p,unsigned *hz,unsigned *ms){
    unsigned values[2]={0,0};
    for(unsigned k=0;k<2;k++){
        unsigned n=0;while(*p>='0'&&*p<='9'&&n<5){values[k]=values[k]*10+(unsigned)(*p++-'0');n++;}
        if(!n)return 0;
        if(k==0){if(*p++!=' ')return 0;}else if(*p)return 0;
    }
    *hz=values[0];*ms=values[1];return 1;
}
static void audio_command(char *args){
    if(equal(args,"info")||!*args){
        struct audio_status s=audio_get_status();
        output(s.available?"SlopAudio: SB16 / 22050 Hz / mono / 8-bit output":"SlopAudio: no supported device (SB16 required)");
        output(s.playing?"Playback active":"Playback stopped");
        number_line("Volume: ",s.volume," percent");number_line("Completed DMA blocks: ",s.blocks,"");
        struct audio_diagnostics ad=audio_diagnostics();number_line("Audio service mean gap us: ",ad.services?ad.total_gap_us/ad.services:0,"");number_line("Audio service worst gap us: ",ad.max_gap_us,"");number_line("Audio start worst us: ",ad.start_max_us,"");number_line("Audio maximum pending blocks: ",ad.max_pending,"");
        number_line("Underruns: ",s.underruns,"");number_line("Device faults: ",s.faults,"");output(audio_error());
    }else if(equal(args,"test")){output(audio_tone(440,2000)?"AUDIO_TONE_STARTED 440 Hz / 2000 ms":audio_error());}
    else if(equal(args,"demo")){output(audio_play_wav(audio_demo_start,(size_t)(audio_demo_end-audio_demo_start))?"AUDIO_WAV_STARTED original Slopix chime":audio_error());}
    else if(length(args)>=5&&args[0]=='t'&&args[1]=='o'&&args[2]=='n'&&args[3]=='e'&&args[4]==' '){
        unsigned hz,ms;if(!audio_numbers(args+5,&hz,&ms))output("Usage: audio tone HZ MILLISECONDS");
        else output(audio_tone(hz,ms)?"AUDIO_TONE_STARTED":audio_error());
    }
    else if(equal(args,"stop")){audio_stop();output("Audio stopped");}
    else if(length(args)>=7&&args[0]=='v'&&args[1]=='o'&&args[2]=='l'&&args[3]=='u'&&args[4]=='m'&&args[5]=='e'&&args[6]==' '){
        char *p=args+7;unsigned n=0,digits=0;while(*p>='0'&&*p<='9'&&digits<4){n=n*10+(unsigned)(*p++-'0');digits++;}
        if(!digits||*p||n>100)output("Usage: audio volume 0..100");
        else if(audio_volume(n)){prefs.volume=n;preferences_changed(0);number_line("Audio volume: ",n," percent");}
    }else output("Usage: audio info | test | tone HZ MS | demo | stop | volume 0..100");
}
static void display_command(char *args){
    if(!*args){
        number_line("Display width: ",width," pixels");number_line("Display height: ",height," pixels");
        output(display_available()?"Runtime display: QEMU standard VGA":"Runtime display unavailable; fixed boot framebuffer");
        output("display WIDTH HEIGHT | display next | F12: next mode");
        output("1024x600 1024x768 1280x720 1280x800");output("1440x900 1600x900 1920x1080 | native pixels, no UI scaling");return;
    }
    if(equal(args,"next")){if(display_cycle())output("Display mode applied");else output(display_error());return;}
    unsigned w=0,h=0,n=0;char *p=args;
    while(*p>='0'&&*p<='9'&&n<4){w=w*10+(unsigned)(*p++-'0');n++;}
    if(!n||*p!=' '){output("Usage: display WIDTH HEIGHT | display next");return;}
    while(*p==' ')p++;
    n=0;
    while(*p>='0'&&*p<='9'&&n<4){h=h*10+(unsigned)(*p++-'0');n++;}
    if(!n||*p){output("Usage: display WIDTH HEIGHT | display next");return;}
    if(display_set(w,h))output("Display mode applied");else output(display_error());
}
static void clear(void) { first=count=tail=0;scroll=0;scene_dirty=1; }
static void execute(void) {
    input[input_len]=0;logstr("CMD: ");logstr(input);logstr("\n");
    char prompt[INPUT_CAP+3];copystr(prompt,"> ",sizeof(prompt));copystr(prompt+2,input,sizeof(prompt)-2);output_style=1;output(prompt);output_style=0;
    if(input_len) {
        if(hcount==HISTORY) {hfirst=(hfirst+1)%HISTORY;hcount--;}
        copystr(history[(hfirst+hcount)%HISTORY],input,INPUT_CAP);hcount++;
    }
    hindex=hcount;
    char command[INPUT_CAP];copystr(command,input,sizeof(command));
    input_len=pos=0;input[0]=0;draft[0]=0;
    char *name=command;while(*name==' ') name++;
    char *args=name;while(*args&&*args!=' ') args++;
    if(*args) {*args++=0;while(*args==' ')args++;}
    if(!*name) {logstr("COMMAND_COMPLETE\n");return;}
    if(equal(name,"help")) {
        output("help clear echo uname version uptime meminfo reboot memtest heapinfo heaptest");
        output("Arrows: edit/history | Home/End | Ctrl+U: erase input");
        output("PgUp/PgDn: scroll | Ctrl+L: clear | F11: maximize");
        output("diskinfo ls [PATH] cd pwd stat cat write append rm sync");
        output("mkdir PATH | rmdir PATH | cp SRC DEST | mv SRC DEST (same folder)");
        output("exec FILE.ELF [PATH] | heapinfo | heaptest");
        output("audio info / test / demo / stop / volume 0..100");
        output("display WIDTH HEIGHT / next | F12: resolution");
        output("slopfind settings slopfetch slopmon history date about audioinfo");
        output("Alt+Tab switch | Alt+F4 close | Super SlopFind");
        output("run FILE.ELF [MODE] | ps | kill PID | sysinfo | net");
    } else if(equal(name,"slopmon")){if(equal(args,"reset"))perf_reset();else if(equal(args,"trace"))perf_trace=1;else {output("Measured elapsed work since boot/reset; stages may be nested. Submitted-frame window: last 256 intervals.");perf_report(output);number_line("Uptime seconds: ",timer_us()/1000000,"");number_line("Available physical KiB: ",mr_pmm_stat(0)*4,"");number_line("Allocated physical KiB: ",mr_pmm_stat(1)*4,"");output("wait = HLT elapsed, including wake/host delays; work stages overlap, not CPU utilization.");struct audio_status a=audio_get_status();number_line("Audio underruns: ",a.underruns,"");number_line("Resolution width: ",width,"");number_line("Resolution height: ",height,"");number_line("Open desktop applications: ",desktop_open_count(),"");process_report(output);}}
    else if(equal(name,"clear")) clear();
    else if(equal(name,"history")){for(unsigned i=0;i<hcount;i++)output(history[(hfirst+i)%HISTORY]);}
    else if(equal(name,"audioinfo")){char a[]="info";audio_command(a);}
    else if(slop_package_command(name,args,output)){}
    else if(process_command(name,args,output)){}
    else if(apps_terminal(name,args,output)){}
    else if(equal(name,"echo")) output(args);
    else if(equal(name,"display")) display_command(args);
    else if(equal(name,"audio")) audio_command(args);
    else if(equal(name,"pwd")||equal(name,"cd")||equal(name,"mkdir")||equal(name,"rmdir")||equal(name,"stat")||equal(name,"cp")||equal(name,"mv")||equal(name,"diskinfo")||equal(name,"ls")||equal(name,"cat")||equal(name,"write")||equal(name,"append")||equal(name,"rm")||equal(name,"sync"))storage_command(name,args);
    else if(equal(name,"uname")) output("Slopix x86_64 (original kernel; no POSIX ABI yet)");
    else if(equal(name,"version")) output("Slopix 0.9 - interactive desktop / kernel terminal");
    else if(equal(name,"uptime")) {number_line("Uptime: ",timer_us()/1000000," seconds");output(arch_clock_name());}
    else if(equal(name,"meminfo")) {
        number_line("Boot-map usable RAM: ",boot_usable/(1024*1024)," MiB");
        extern char kernel_end[];
        number_line("Kernel reserved span: ",((uintptr_t)kernel_end-0x100000+1023)/1024," KiB (includes static graphics buffers)");
        number_line("Free physical pages: ",mr_pmm_stat(0)," (4 KiB each)");
        number_line("Allocated physical pages: ",mr_pmm_stat(1),"");
        output("Kernel heap active: heapinfo for usage / heaptest for validation.");
    } else if(equal(name,"heapinfo")) {struct heap_stats h=heap_get_stats();number_line("Heap live bytes: ",h.live_bytes,"");number_line("Heap peak bytes: ",h.peak_bytes,"");number_line("Heap allocations: ",h.allocations,"");number_line("Heap pages: ",h.span_pages,"");number_line("Heap failures: ",h.failures,"");number_line("Heap invalid frees: ",h.invalid_frees,"");
    } else if(equal(name,"heaptest")) {output(heap_selftest()?"HEAPTEST PASS":"HEAPTEST FAIL");
    } else if(equal(name,"memtest")) {output(memory_selftest()?"MEMTEST PASS: exhaustion, canaries, free, double-free":"MEMTEST FAIL");
    } else if(equal(name,"reboot")) {output("Rebooting via i8042 controller...");logstr("REBOOT_REQUESTED\n");reboot();}
    else {output_style=2;output("Unknown command. Type help for available built-ins.");output_style=0;}
    logstr("COMMAND_COMPLETE\n");
}
void terminal_init(void) {
    output("Slopix Terminal 0.9");
    output("Working kernel-integrated commands. Type help to begin.");
    output("FAT32 paths: ls / cd / mkdir / cp / mv / cat / write / append / rm");
    output("");
}
void terminal_focus(void) {scroll=0;scene_dirty=1;}
void terminal_scroll(int delta) {
    scroll+=delta;if(scroll<0)scroll=0;if(scroll>LINES*16)scroll=LINES*16;
    scene_dirty=1;
    logstr("SCROLL: ");char n[21];decimal((unsigned)scroll,n);logstr(n);logstr("\n");
}
static void history_load(void) {
    copystr(input,hindex==hcount?draft:history[(hfirst+hindex)%HISTORY],INPUT_CAP);
    input_len=pos=(unsigned)length(input);
}
void terminal_key(unsigned key) {
    if(key==KEY_PGUP) {terminal_scroll(8);return;}
    if(key==KEY_PGDN) {terminal_scroll(-8);return;}
    scroll=0;scene_dirty=1;
    if(key==KEY_COPY){clipboard_set(input,input_len);logstr("CLIPBOARD: command copied\n");return;}
    if(key==KEY_PASTE){size_t n;const char*s=clipboard_get(&n);unsigned take=(unsigned)n,available=INPUT_CAP-1-input_len;if(take>available)take=available;
        for(unsigned i=input_len+1;i>pos;i--)input[i-1+take]=input[i-1];
        for(unsigned i=0;i<take;i++){char c=s[i];input[pos+i]=(c=='\n'||c=='\r'||c=='\t')?' ':c;}
        pos+=take;input_len+=take;if(n>take)output("Paste clipped to command capacity");logstr("CLIPBOARD: pasted without execution\n");return;
    }
    if(key==KEY_ENTER) {execute();return;}
    if(key==KEY_CLEAR) {clear();return;}
    if(key==KEY_ERASE) {input_len=pos=0;input[0]=0;return;}
    if(key==KEY_UP) {if(hindex==hcount)copystr(draft,input,INPUT_CAP);if(hindex)hindex--;history_load();return;}
    if(key==KEY_DOWN) {if(hindex<hcount)hindex++;history_load();return;}
    if(key==KEY_LEFT) {if(pos)pos--;return;}
    if(key==KEY_RIGHT) {if(pos<input_len)pos++;return;}
    if(key==KEY_HOME) {pos=0;return;}
    if(key==KEY_END) {pos=input_len;return;}
    if(key==KEY_BACKSPACE) {
        if(!pos)return;
        for(unsigned i=pos-1;i<input_len;i++)input[i]=input[i+1];
        pos--;input_len--;return;
    }
    if(key==KEY_DELETE) {
        if(pos==input_len)return;
        for(unsigned i=pos;i<input_len;i++)input[i]=input[i+1];
        input_len--;return;
    }
    if(key>=32&&key<=126&&input_len<INPUT_CAP-1) {
        for(unsigned i=input_len+1;i>pos;i--)input[i]=input[i-1];
        input[pos++]=(char)key;input_len++;
    }
}
void terminal_draw(int x,int y,int w,int h,int focused) {
    int cols=(w-48)/10,rows=(h-116)/20;
    if(cols<1||rows<1)return;
    int total=0;
    for(unsigned i=0;i<count;i++) {
        int len=(int)length(lines[(first+i)%LINES]);total+=len?(len+cols-1)/cols:1;
    }
    int maxscroll=total>rows?total-rows:0;
    if(scroll>maxscroll)scroll=maxscroll;
    int start=total-rows-scroll;if(start<0)start=0;
    int visual=0,painted=0;
    for(unsigned i=0;i<count;i++) {
        const char *s=lines[(first+i)%LINES];int len=(int)length(s),chunks=len?(len+cols-1)/cols:1;
        for(int j=0;j<chunks;j++,visual++) {
            if(visual<start||painted>=rows)continue;
            char part[LINE_CAP];int n=len-j*cols;if(n>cols)n=cols;
            for(int k=0;k<n;k++) {part[k]=s[j*cols+k];}
            part[n]=0;
            unsigned style=line_style[(first+i)%LINES];
            text(x+24,y+54+painted*20,part,style==1?(prefs.light?blend(prefs.accent,0x172b33,155):prefs.accent):style==2?(prefs.light?0x9d3030:0xf39e9e):prefs.light?0x283447:0xc6cee1);painted++;
        }
    }
    int py=y+h-53;
    rect(x+22,py-8,w-44,1,0x333c55);
    text(x+24,py,">",focused?(prefs.light?0x304c56:prefs.accent):0x6e7893);
    unsigned visible=(unsigned)(cols-3),offset=pos>=visible?pos-visible+1:0;
    char shown[INPUT_CAP];unsigned n=0;
    while(offset+n<input_len&&n<visible) {shown[n]=input[offset+n];n++;}shown[n]=0;
    text(x+44,py,shown,prefs.light?0x283447:0xf1f2fa);
    if(focused) rect(x+44+(int)(pos-offset)*10,py+2,2,17,prefs.light?0x304c56:0x9cddc7);
    text(x+24,y+h-25,scroll?"Scrollback / PgDn to return":"Kernel built-ins / help / F11 maximize",0x7d8aa9);
    if(total>rows) {
        int track=rows*20,thumb=track*rows/total;if(thumb<12)thumb=12;
        int top=(track-thumb)*(maxscroll-scroll)/(maxscroll?maxscroll:1);
        roundbox(x+w-12,y+54+top,4,thumb,2,0x65718c,180);
    }
}

void terminal_prefill(const char*command){copystr(input,command,sizeof(input));input_len=pos=(unsigned)length(input);scene_dirty=1;}

void terminal_process_output(unsigned pid,const char*s){char line[160]="[user ",n[21];decimal(pid,n);copystr(line+length(line),n,sizeof(line)-length(line));copystr(line+length(line),"] ",sizeof(line)-length(line));unsigned prefix=(unsigned)length(line),at=prefix;for(;;){char c=*s++;if(!c||c=='\n'){line[at]=0;output(line);at=prefix;if(!c||!*s)break;}else if(at<sizeof(line)-1)line[at++]=c;}}
