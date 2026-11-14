#include "kernel.h"
#include "perf.h"
static int mouse_x,mouse_y,shift_left,shift_right,ctrl_left,ctrl_right,alt,caps,caps_down,extended;
static uint8_t packet[3];static unsigned packet_n;
static uint64_t packet_tick;
#define QUEUE_SIZE 4096
static volatile struct {uint8_t status,value;} queue[QUEUE_SIZE];
static volatile uint64_t queued_at[QUEUE_SIZE];
static volatile unsigned producer,consumer,dropped;
static void input_capture(void) {
    uint64_t stamp=timer_us();
    for(unsigned i=0;i<32;i++) {
        uint8_t status=inb(0x64);if(!(status&1))break;
        uint8_t value=inb(0x60);unsigned next=(producer+1)%QUEUE_SIZE;
        if(next==consumer) {dropped=1;continue;}
        queue[producer].status=status;queue[producer].value=value;queued_at[producer]=stamp;producer=next;
    }
}
void keyboard_irq(void) {input_capture();outb(0x20,0x20);}
void mouse_irq(void) {input_capture();outb(0xa0,0x20);outb(0x20,0x20);}

static int ready_write(void) {for(unsigned i=0;i<100000;i++)if(!(inb(0x64)&2))return 1;return 0;}
static int command(uint8_t v) {if(!ready_write())return 0;outb(0x64,v);return 1;}
static int data(uint8_t v) {if(!ready_write())return 0;outb(0x60,v);return 1;}
static int response(int aux) {
    for(unsigned i=0;i<100000;i++) {
        uint8_t s=inb(0x64);
        if(s&1) {uint8_t v=inb(0x60);if(!!(s&32)==aux)return v;}
    }return -1;
}
static int device(int aux,uint8_t value) {
    for(int retry=0;retry<3;retry++) {
        if(aux&&!command(0xd4))return 0;
        if(!data(value))return 0;
        int r=response(aux);if(r==0xfa)return 1;if(r!=0xfe)return 0;
    }return 0;
}
void input_init(void) {
    mouse_x=(int)width/2;mouse_y=(int)height/2;
    if(!command(0xad)||!command(0xa7))panic("PS/2 controller timeout");
    for(unsigned i=0;i<256&&(inb(0x64)&1);i++)(void)inb(0x60);
    if(!command(0x20))panic("PS/2 config timeout");
    int config=response(0);if(config<0)panic("PS/2 config unavailable");
    config=(config|0x40)&~0x33; /* translate keyboard set 2 to set 1, no IRQ1/12 */
    if(!command(0x60)||!data((uint8_t)config)||!command(0xae)||!command(0xa8))panic("PS/2 enable failed");
    if(!device(0,0xf6)||!device(0,0xf4))panic("keyboard setup failed");
    logstr("PS2_KEYBOARD_READY\n");
    if(!device(1,0xf6)||!device(1,0xe6)||!device(1,0xf4))panic("mouse setup failed");
    logstr("PS2_MOUSE_READY\n");
    /* Interrupt handlers capture bytes even while the software renderer runs. */
    if(!command(0x60)||!data((uint8_t)(config|3)))panic("PS/2 IRQ enable failed");
    outb(0x21,0xf8);outb(0xa1,0xef);
    logstr("PS2_IRQ_QUEUE_READY\n");
}
static const char normal[128]={
    [2]='1',[3]='2',[4]='3',[5]='4',[6]='5',[7]='6',[8]='7',[9]='8',[10]='9',[11]='0',[12]='-',[13]='=',
    [16]='q',[17]='w',[18]='e',[19]='r',[20]='t',[21]='y',[22]='u',[23]='i',[24]='o',[25]='p',[26]='[',[27]=']',
    [30]='a',[31]='s',[32]='d',[33]='f',[34]='g',[35]='h',[36]='j',[37]='k',[38]='l',[39]=';',[40]='\'',[41]='`',[43]='\\',
    [44]='z',[45]='x',[46]='c',[47]='v',[48]='b',[49]='n',[50]='m',[51]=',',[52]='.',[53]='/',[57]=' '};
static const char shifted[128]={
    [2]='!',[3]='@',[4]='#',[5]='$',[6]='%',[7]='^',[8]='&',[9]='*',[10]='(',[11]=')',[12]='_',[13]='+',
    [26]='{',[27]='}',[39]=':',[40]='"',[41]='~',[43]='|',[51]='<',[52]='>',[53]='?'};
static void keyboard(uint8_t raw) {
    if(extended>=2) {if(++extended==7)extended=0;return;}
    if(raw==0xe0) {extended=1;return;}
    /* Pause's multibyte sequence is ignored; it is not a supported key. */
    if(raw==0xe1) {extended=2;return;}
    int released=raw&128;unsigned code=raw&127;int ext=extended;extended=0;
    if(code==56){alt=!released;if(released)desktop_shortcut(5);}
    if(ext&&(code==91||code==92)){if(!released)desktop_shortcut(3);return;}
    extern int desktop_doom_focused(void);
    if(alt&&ext&&!released&&(code==75||code==77)&&!desktop_doom_focused()){desktop_shortcut(code==75?6:7);return;}
    if(alt&&!released&&(code==15||code==62)){desktop_shortcut(code==15?1:2);return;}
    if(code==1&&!released&&desktop_find_focused()){desktop_shortcut(4);return;}
    desktop_scancode(code,ext,!released);
    if(code==42&&!ext) {shift_left=!released;return;}
    if(code==54&&!ext) {shift_right=!released;return;}
    if(code==29) {if(ext)ctrl_right=!released;else ctrl_left=!released;return;}
    if(code==58&&!ext) {if(!released&&!caps_down)caps=!caps;caps_down=!released;return;}
    if(released)return;
    if(code==88&&!ext) {desktop_key(1001);return;}
    if(code==87&&!ext) {desktop_key(1000);return;}
    unsigned key=0;
    if(code==28)key=KEY_ENTER;
    else if(code==15)key=KEY_TAB;
    else if(code==1)key=KEY_ESCAPE;
    else if(code==63&&!ext)key=KEY_REFRESH;
    else if(code==14)key=KEY_BACKSPACE;
    else if(ext||code>=71) {
        switch(code) {
            case 71:key=KEY_HOME;break;case 72:key=KEY_UP;break;
            case 73:key=KEY_PGUP;break;case 75:key=KEY_LEFT;break;
            case 77:key=KEY_RIGHT;break;case 79:key=KEY_END;break;
            case 80:key=KEY_DOWN;break;case 81:key=KEY_PGDN;break;
            case 83:key=KEY_DELETE;break;default:break;
        }
    } else {
        char c=normal[code];int shift=shift_left||shift_right;
        if(ctrl_left||ctrl_right) {if(c=='l')key=KEY_CLEAR;else if(c=='u')key=KEY_ERASE;else if(c=='c')key=KEY_COPY;else if(c=='v')key=KEY_PASTE;}
        else if(c) {
            if(c>='a'&&c<='z') {if(shift^caps)c=(char)(c-'a'+'A');}
            else if(shift&&shifted[code])c=shifted[code];
            key=(unsigned char)c;
        }
    }
    if(key)desktop_key(key);
}
static void mouse(uint8_t value) {
    uint64_t now=ticks_now();if(packet_n&&now-packet_tick>TIMER_HZ/10)packet_n=0;
    packet_tick=now;
    if(!packet_n&&!(value&8))return;
    packet[packet_n++]=value;if(packet_n<3)return;packet_n=0;
    if(packet[0]&0xc0)return;
    int dx=(int)packet[1]-((packet[0]&16)?256:0);
    int dy=(int)packet[2]-((packet[0]&32)?256:0);
    mouse_x+=dx;mouse_y-=dy;
    if(mouse_x<0)mouse_x=0;
    if(mouse_y<0)mouse_y=0;
    if(mouse_x>=(int)width)mouse_x=(int)width-1;
    if(mouse_y>=(int)height)mouse_y=(int)height-1;
    desktop_mouse(mouse_x,mouse_y,packet[0]&7);
}
void input_poll(void) {
    if(dropped) {
        uint64_t flags=irq_save();consumer=producer;dropped=0;
        shift_left=shift_right=ctrl_left=ctrl_right=alt=caps_down=extended=0;packet_n=0;
        irq_restore(flags);desktop_shortcut(5);logstr("PS2_RING_OVERFLOW: discarded input\n");
    }
    for(unsigned i=0;i<1024&&consumer!=producer;i++) {
        uint8_t status=queue[consumer].status,value=queue[consumer].value;
        perf_add(P_QUEUE,timer_us()-queued_at[consumer]);
        consumer=(consumer+1)%QUEUE_SIZE;
        if(status&0xc0){desktop_shortcut(5);packet_n=0;shift_left=shift_right=ctrl_left=ctrl_right=alt=caps_down=extended=0;continue;}
        if(status&32)mouse(value);else keyboard(value);
    }
}

void input_display_resize(int *x,int *y){
    if(mouse_x>=(int)width)mouse_x=(int)width-1;
    if(mouse_y>=(int)height)mouse_y=(int)height-1;
    *x=mouse_x;*y=mouse_y;
}

int input_alt_down(void) { return alt; }
int input_ctrl_down(void) { return ctrl_left || ctrl_right; }
int input_shift_down(void) { return shift_left || shift_right; }
