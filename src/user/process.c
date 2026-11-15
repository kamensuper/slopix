/* Bounded single-CPU scheduler with priority classes and EDF support.
 * Only user execution is timer-preemptible. Syscalls are captured by the trap,
 * then serviced back on the normal kernel thread with IRQs enabled. No
 * filesystem, allocator or compositor work in IRQs.
 *
 * Scheduling model (CP07):
 *   - three fixed classes: SCHED_OTHER / SCHED_FIFO / SCHED_RR / SCHED_DEADLINE
 *   - fixed-priority pick with weighted-fair vruntime tie-break
 *   - SCHED_DEADLINE tasks always outrank fixed-priority tasks and are ordered
 *     by earliest absolute deadline; misses are counted, never hidden.
 *   - every preemption and quantum is integer-only: the kernel is compiled
 *     with -mgeneral-regs-only, so no floating point is available. */
#include "process.h"
#include "elf.h"
#include "../kernel.h"
#include "../memory.h"
#include "../fs/vfs.h"
#include "../audio/audio.h"
#include "gui.h"
#include "../net/stack.h"
#include "../preferences.h"
#include "../apps.h"
#include "../slop_package.h"
#include "../../sdk/slopix.h"
#define PROCESSES 12
#define KSTACK 32768
#define QUANTUM_US 2000
#define PRIO_DEFAULT 16u
#define PRIO_MAX 32u
#define PRIO_USER_MAX 20u
#define STARVE_US 100000u /* a runnable task waits at most ~100 ms */
#define USER_IMAGE_CAP (1024u*1024u)
#define IA32_FS_BASE 0xc0000100u
/* Descriptor space: 0..2 are the standard console channels (which are not
 * per-process objects), 10..13 are the per-process file slots. Keeping them
 * disjoint means a libc can dispatch open/read/write without ambiguity. */
#define FD_BASE 10u
#define FD_MAX 4u
struct user_file {char name[128];uint32_t offset,size;int used;};
/* States are real scheduler state; exited slots retain diagnostics until reused. */
enum {EMPTY,READY,RUNNING,BLOCKED,EXITED};
enum {POLICY_OTHER,POLICY_FIFO,POLICY_RR,POLICY_DEADLINE};
struct timespec64 {int64_t tv_sec,tv_nsec;};
struct process {
 struct user_vm vm;struct user_frame frame;
 _Alignas(16) unsigned char fp[512];
 unsigned pid,state,reason,fault,suspended;int exit_status,crashed;
 uint64_t wake,started,runtime,slices,quota_epoch;unsigned printed;
 /* CP07 scheduling metadata. priority is 1..PRIO_MAX; vruntime is weighted. */
 unsigned policy,priority;uint64_t vruntime,deadline_ns,period_ns,runtime_ns,next_deadline_ns;
 uint64_t futex_addr,fs_base;
 char name[13];struct user_file files[FD_MAX];
 char console_line[120];unsigned console_used;
};
static struct process tasks[PROCESSES];
static _Alignas(16) unsigned char stacks[PROCESSES][KSTACK];
static unsigned next_pid=1;static int enabled;
static struct process*active;
static uint64_t switches,preemptions,crashes,max_slice,deadline_misses;
static unsigned char image[USER_IMAGE_CAP],io[4096],net_output[32768];
/* One kernel-thread-only staging area for safe, finite userspace metadata. */
#define SX_DIR_MAX 48u
static struct sx_dirent entries[SX_DIR_MAX];
static unsigned entry_count;
static unsigned entry_skip; /* SX_READDIR paging offset */
#define CONSOLE_RING 32u
static char console_messages[CONSOLE_RING][128];
static unsigned console_head,console_tail;
static void console_append(unsigned pid,const char *message){
 char *dst=console_messages[console_head];char num[21];decimal(pid,num);
 copystr(dst,"[",128);copystr(dst+length(dst),num,128-length(dst));
 copystr(dst+length(dst),"] ",128-length(dst));
 unsigned n=(unsigned)length(dst);for(unsigned i=0;message[i]&&n<127;i++){
  unsigned char c=(unsigned char)message[i];dst[n++]=(c==10||c==13)?' ':(c<32||c>126)?'?':(char)c;
 }dst[n]=0;
 console_head=(console_head+1)%CONSOLE_RING;
 if(console_head==console_tail)console_tail=(console_tail+1)%CONSOLE_RING;
}

static void console_flush(struct process *p){
 if(!p->console_used)return;
 p->console_line[p->console_used]=0;
 terminal_process_output(p->pid,p->console_line);
 console_append(p->pid,p->console_line);
 p->console_used=0;
}
static void console_write(struct process *p,const char *data,unsigned n){
 for(unsigned i=0;i<n;i++){
  unsigned char c=(unsigned char)data[i];
  if(c=='\n'||c=='\r'){console_flush(p);continue;}
  if(c<32||c>126)c='?';
  p->console_line[p->console_used++]=(char)c;
  if(p->console_used==sizeof(p->console_line))console_flush(p);
 }
}

static void collect_dir(const char *name,uint32_t size,int directory){
 if(entry_skip){entry_skip--;return;}
 if(entry_count>=SX_DIR_MAX)return;
 struct sx_dirent *e=&entries[entry_count++];
 for(unsigned i=0;i<sizeof(*e);i++)((unsigned char*)e)[i]=0;
 copystr(e->name,name,sizeof(e->name));e->size=size;e->directory=(unsigned)!!directory;
}
static unsigned voice_owner[AUDIO_VOICES];
static uint8_t pcm_staging[AUDIO_SFX_MAX];
static char report_buffer[3072];static unsigned report_length;
static void append_report(const char*message){
 unsigned n=(unsigned)length(message);
 if(n>=sizeof(report_buffer)-report_length)n=sizeof(report_buffer)-report_length-1;
 for(unsigned i=0;i<n;i++)report_buffer[report_length++]=message[i];
 if(report_length<sizeof(report_buffer)-1)report_buffer[report_length++]='\n';
 report_buffer[report_length]=0;
}

void user_loader_checkpoint(void){audio_checkpoint();}
static int equal(const char*a,const char*b){while(*a&&*a==*b){a++;b++;}return *a==*b;}
static void message(const char*kind,unsigned pid,uint64_t value){char n[21];logstr(kind);decimal(pid,n);logstr(n);logstr(" value=");decimal(value,n);logstr(n);logstr("\n");}
void process_init(void){extern int arch_user_init(void);enabled=arch_user_init();if(!enabled){logstr("USERSPACE_DISABLED: NX unavailable\n");return;}logstr("USERSPACE_READY: separate CR3, NX, TSS, int80, timer slices, EDF\n");}
static void exit_process(struct process*p,int status,int fault){console_flush(p);for(unsigned i=0;i<AUDIO_VOICES;i++)if(voice_owner[i]==p->pid){audio_sfx_stop(i);voice_owner[i]=0;}gui_process_exit(p->pid);for(unsigned i=0;i<FD_MAX;i++)p->files[i].used=0;p->state=EXITED;p->exit_status=status;p->fault=fault>=0?(unsigned)fault:0;p->crashed=fault>=0;if(fault>=0){crashes++;message("PROCESS_FAULT pid=",p->pid,fault);}else message("PROCESS_EXIT pid=",p->pid,(uint32_t)status);}
static void capture(struct user_frame*f,unsigned reason){
 if(!active||(f->cs&3)!=3)panic("invalid user trap context");
 active->frame=*f;active->reason=reason;user_leave();
}
void process_exception(struct user_frame*f){
 if((f->cs&3)==3&&active){
  /* Classify page faults and retain actual fault address/error for diagnostics. */
  if(f->vector==14){uint64_t cr2;__asm__ volatile("mov %%cr2,%0":"=r"(cr2));message("USER_PAGE_FAULT pid=",active->pid,cr2);message("USER_PAGE_ERROR pid=",active->pid,f->error);}
  capture(f,3);return;
 }
 extern void arch_fault(uint64_t,uint64_t,uint64_t);arch_fault(f->vector,f->error,f->rip);
}
/* Per-process quantum scales inversely with priority, clamped so a high
 * priority task still yields the machine within a millisecond. */
static unsigned quantum_of(const struct process*p){
 unsigned q=QUANTUM_US*PRIO_DEFAULT/(p->priority?p->priority:1);
 if(q<500)q=500;
 if(q>10000)q=10000;
 return q;
}
void process_timer(struct user_frame*f){
 if(active&&(f->cs&3)==3&&timer_us()-active->started>=quantum_of(active)){preemptions++;capture(f,1);}
}
void process_syscall(struct user_frame*f){if(active&&(f->cs&3)==3){capture(f,2);return;}panic("syscall outside userspace");}
/* Two-level pick: EDF first, then highest fixed priority with the lowest
 * weighted virtual runtime. Pure integer arithmetic, bounded by PROCESSES. */
static int pick_next(void){
 int best=-1;uint64_t best_deadline=UINT64_MAX;
 for(unsigned i=0;i<PROCESSES;i++){const struct process*p=&tasks[i];
  if(p->state!=READY||p->suspended||p->policy!=POLICY_DEADLINE)continue;
  if(p->next_deadline_ns<best_deadline){best_deadline=p->next_deadline_ns;best=(int)i;}
 }
 if(best>=0)return best;
 /* Starvation guard (B-08): a runnable task that has not been picked for
  * STARVE_US goes next whatever its priority, so a busy high-priority
  * loop slows others down but can never freeze them. */
 uint64_t now=timer_us(),oldest=UINT64_MAX;
 for(unsigned i=0;i<PROCESSES;i++){const struct process*p=&tasks[i];
  if(p->state!=READY||p->suspended||p->policy==POLICY_DEADLINE)continue;
  if(now-p->started>=STARVE_US&&p->started<oldest){oldest=p->started;best=(int)i;}
 }
 if(best>=0)return best;
 unsigned best_prio=0;uint64_t best_vruntime=UINT64_MAX;
 for(unsigned i=0;i<PROCESSES;i++){const struct process*p=&tasks[i];
  if(p->state!=READY||p->suspended)continue;
  if(best<0||p->priority>best_prio||(p->priority==best_prio&&p->vruntime<best_vruntime)){
   best=(int)i;best_prio=p->priority;best_vruntime=p->vruntime;
  }
 }
 return best;
}
static int spawn_with_arg(const char*path,uint64_t arg,const char*text_arg){
 if(!enabled||!next_pid||next_pid>0x7fffffff)return -1;
 unsigned at;for(at=0;at<PROCESSES;at++)if(tasks[at].state==EMPTY||tasks[at].state==EXITED)break;if(at==PROCESSES)return -1;
 struct process*p=&tasks[at];if(p->vm.tables[0])user_vm_destroy(&p->vm);
 unsigned char*b=(unsigned char*)p;for(size_t i=0;i<sizeof(*p);i++)b[i]=0;
 if(length(path)>127)return -1;
 uint32_t size=0,got=0;int directory=0;
 if(!vfs_stat(path,&size,&directory)||directory||size>sizeof(image)||size<64||!vfs_read_at(path,0,image,size,&got)||got!=size){logstr("USER_LOAD: missing, oversized or unreadable ELF\n");return -1;}
 uint64_t entry;if(!user_vm_create(&p->vm)||!user_elf_load(&p->vm,image,size,&entry)){user_vm_destroy(&p->vm);logstr("USER_LOAD: invalid/unsupported ELF or allocation failure\n");return -1;}
 p->pid=next_pid++;p->frame=(struct user_frame){.rdi=arg,.rip=entry,.cs=0x23,.flags=0x202,.rsp=USER_STACK-264,.ss=0x1b} /* the 256 bytes above rsp hold the command-line text */;
 p->priority=PRIO_DEFAULT;p->policy=POLICY_OTHER;
 if(text_arg){size_t n=length(text_arg);if(n>127||!user_vm_copy(&p->vm,USER_STACK-256,(void*)text_arg,n+1,1)){user_vm_destroy(&p->vm);return -1;}p->frame.rsi=USER_STACK-256;}
 copystr(p->name,path,sizeof(p->name));user_fp_init(p->fp);p->state=READY;message("PROCESS_CREATED pid=",p->pid,p->vm.count+USER_TABLES);return (int)p->pid;
}
int process_spawn(const char*path,uint64_t arg){return spawn_with_arg(path,arg,0);}
static int copy_name(struct process*p,uint64_t address,char out[128]){
 for(unsigned i=0;i<128;i++){if(!user_vm_copy(&p->vm,address+i,out+i,1,0))return 0;if(!out[i])return i!=0;}
 return 0;
}
/* System files that Ring-3 programs may not open, create, overwrite or
 * remove (B-07): the login record, both preference slots, and the package
 * manager's staging files. The kernel itself (auth, Settings via
 * SX_PREF_SAVE, slop install) still uses them through the VFS directly. */
static int protected_path(const char*path){
 while(*path=='/')path++;
 char up[16];unsigned n=0;
 for(;path[n]&&n<15;n++){char c=path[n];if(c=='/')return 0;up[n]=(c>='a'&&c<='z')?(char)(c-32):c;}
 if(path[n])return 0;
 up[n]=0;
 static const char*const names[]={"ACCOUNT.DAT","SLOP0.CFG","SLOP1.CFG"};
 for(unsigned i=0;i<sizeof(names)/sizeof(names[0]);i++)if(equal(up,names[i]))return 1;
 return n>=8&&up[0]=='S'&&up[1]=='L'&&up[2]=='P'&&equal(up+n-4,".TMP");
}
int process_exit_info(unsigned pid,int*crashed,unsigned*fault){
 for(unsigned i=0;i<PROCESSES;i++)if(tasks[i].pid==pid&&tasks[i].state==EXITED){*crashed=tasks[i].crashed;*fault=tasks[i].fault;return 1;}
 return 0;
}
static int64_t syscall(struct process*p){
 struct user_frame*f=&p->frame;uint64_t a=f->rdi,b=f->rsi,c=f->rdx;
 switch(f->rax){
 case SX_WRITE:{
  if(b>127||!user_vm_copy(&p->vm,a,io,(size_t)b,0))return -14;
  uint64_t second=timer_us()/1000000;if(second!=p->quota_epoch){p->quota_epoch=second;p->printed=0;}if(b>16384-p->printed)return -11; /* 16 KiB/s per process; libc retries on EAGAIN */
  p->printed+=(unsigned)b;console_write(p,(const char*)io,(unsigned)b);return (int64_t)b;
 }
 case SX_EXIT:exit_process(p,(int)(uint32_t)a,-1);return 0;
 case SX_TIME:return (int64_t)timer_us();
 case SX_PID:return p->pid;
 case SX_YIELD:p->vruntime+=quantum_of(p);return 0;
 case SX_SLEEP:if(a>10000000)return -22;p->futex_addr=0;p->wake=timer_us()+a;p->state=BLOCKED;return 0;
 case SX_MAP:{
  if(!a||a>8||a>(USER_HEAP_END-p->vm.heap)/4096||a>USER_MAX_PAGES-p->vm.count)return -12;
  /* Preallocate in a temporary suffix, rolling it back on exhaustion. */
  unsigned old=p->vm.count;uint64_t start=p->vm.heap;
  for(unsigned i=0;i<a;i++)if(!user_vm_map(&p->vm,start+(uint64_t)i*4096,VM_WRITE|VM_NX)){
   while(p->vm.count>old){struct user_page*q=&p->vm.pages[--p->vm.count];unsigned bank=(unsigned)((q->va-USER_BASE)>>21);uint64_t*pt=(uint64_t*)(uintptr_t)p->vm.tables[3+bank];pt[(q->va>>12)&511]=0;mr_pmm_free(q->pa);}return -12;
  }
  p->vm.heap+=a*4096;return (int64_t)start;
 }
 case SX_GUI_OPEN:return gui_open(p->pid,(unsigned)a,(unsigned)b);
 case SX_GUI_POLL:return (int64_t)gui_poll(p->pid);
 case SX_GUI_PRESENT:{
  /* Validate the full pointer range before touching user memory; never
   * expose kernel pointers or map the actual framebuffer into Ring 3. */
  if(!gui_active(p->pid)||b>640u*400u||!user_vm_range(&p->vm,a,(size_t)b*4,0))return -14;
  /* Bounded static staging avoids re-entrant use of the GUI heap allocation. */
  static uint32_t pixels[640u*400u];
  if(!user_vm_copy(&p->vm,a,pixels,(size_t)b*4,0))return -14;
  return gui_present(p->pid,pixels,(unsigned)b);
 }
 case SX_OPEN:{
  char name[128];if(!copy_name(p,a,name))return -14;
  if(protected_path(name))return -13; /* EACCES */
  uint32_t size;int directory;
  if(!vfs_stat(name,&size,&directory))return -2;   /* ENOENT */
  if(directory)return -21;                          /* EISDIR */
  for(unsigned i=0;i<FD_MAX;i++)if(!p->files[i].used){copystr(p->files[i].name,name,sizeof(p->files[i].name));p->files[i].offset=0;p->files[i].size=size;p->files[i].used=1;return (int64_t)(FD_BASE+i);}
  return -24;
 }
 case SX_READ:{
  if(a<FD_BASE||a>=FD_BASE+FD_MAX||!p->files[a-FD_BASE].used)return -9;
  struct user_file *file=&p->files[a-FD_BASE];
  if(c>sizeof(io)||!user_vm_range(&p->vm,b,(size_t)c,1))return -14;
  uint32_t got=0,off=file->offset,size;int directory;
  if(file->offset==0){
   if(!vfs_stat(file->name,&size,&directory)||directory)return -5;
   file->size=size;
  }else size=file->size;
  if(off>=size)return 0; /* EOF preserves the logical seek offset. */
  if(!vfs_read_at(file->name,off,io,(uint32_t)c,&got))return -5;
  if(got>c||got>UINT32_MAX-off)return -5;
  if(!user_vm_copy(&p->vm,b,io,got,1))return -14;
  file->offset=off+got;return got;
 }
 case SX_STAT:{
  char name[128];if(!copy_name(p,a,name))return -14;
  uint32_t size=0;int directory=0;
  if(!vfs_stat(name,&size,&directory))return -2;
  if(!user_vm_copy(&p->vm,b,&size,sizeof(size),1))return -14;
  return directory?1:0;
 }
 case SX_PCM_START:{
  struct sx_pcm_request r;
  if(!user_vm_copy(&p->vm,a,&r,sizeof(r),0))return -14;
  if(r.channel>=AUDIO_VOICES||r.size==0||r.size>AUDIO_SFX_MAX||
     r.rate<4000||r.rate>48000||r.volume>127)return -22;
  if(voice_owner[r.channel]&&voice_owner[r.channel]!=p->pid&&audio_sfx_playing(r.channel))return -13;
  if(!user_vm_copy(&p->vm,r.data,pcm_staging,r.size,0))return -14;
  if(!audio_sfx_start(r.channel,pcm_staging,r.size,r.rate,r.volume))return -19;
  voice_owner[r.channel]=p->pid;return (int64_t)r.channel;
 }
 case SX_PCM_STOP:{
  if(a>=AUDIO_VOICES||voice_owner[a]!=p->pid)return -13;
  audio_sfx_stop((unsigned)a);voice_owner[a]=0;return 0;
 }
 case SX_PCM_VOLUME:{
  if(a>=AUDIO_VOICES||voice_owner[a]!=p->pid||b>127)return -13;
  audio_sfx_volume((unsigned)a,(unsigned)b);return 0;
 }
 case SX_PCM_PLAYING:{
  if(a>=AUDIO_VOICES||voice_owner[a]!=p->pid)return 0;
  return audio_sfx_playing((unsigned)a);
 }
 case SX_READDIR:{
  char path[128];if(!copy_name(p,a,path))return -14;
  /* rdx = count | offset<<16 (B-11): callers page through big directories. */
  unsigned want=(unsigned)(c&0xffffu),skip=(unsigned)((c>>16)&0xffffu);
  if(!want||want>SX_DIR_MAX||(c>>32)||!user_vm_range(&p->vm,b,(size_t)want*sizeof(struct sx_dirent),1))return -14;
  entry_count=0;entry_skip=skip;
  if(!vfs_list_path(path,collect_dir))return -5;
  unsigned count=entry_count<want?entry_count:want;
  if(!user_vm_copy(&p->vm,b,entries,count*sizeof(entries[0]),1))return -14;
  return count;
 }
 case SX_REMOVE:case SX_MKDIR:{
  char path[128];if(!copy_name(p,a,path))return -14;
  if(protected_path(path))return -13; /* EACCES */
  return f->rax==SX_REMOVE?(vfs_remove(path)?0:-5):(vfs_mkdir(path)?0:-5);
 }
 case SX_DESKTOP_OPEN:
  if(a>=APP_COUNT)return -22;
  desktop_open_app((unsigned)a);return 0;
 case SX_PREF_GET:{
  struct sx_prefs current={prefs.accent,prefs.light,prefs.volume,prefs.magnify,prefs.wallpaper,prefs.fit};
  return user_vm_copy(&p->vm,a,&current,sizeof(current),1)?0:-14;
 }
 case SX_PREF_SET:{
  switch(a){
   case 0:if(b>0xffffffu)return -22;prefs.accent=(uint32_t)b;break;
   case 1:if(b>1)return -22;prefs.light=(uint32_t)b;break;
   case 2:if(b>100)return -22;prefs.volume=(uint32_t)b;break;
   case 3:if(b>1)return -22;prefs.magnify=(uint32_t)b;break;
   case 4:if(b>2)return -22;prefs.wallpaper=(uint32_t)b;break;
   case 5:if(b>3)return -22;prefs.fit=(uint32_t)b;break;
   default:return -22;
  }
  preferences_changed(a!=2&&a!=3);return 0;
 }
 case SX_PREF_SAVE:return preferences_save()?0:-5;
 case SX_PACKAGE:{
  char args[128];if(!copy_name(p,a,args))return -14;
  if(!c||c>2048||!user_vm_range(&p->vm,b,(size_t)c,1))return -14;
  report_length=0;report_buffer[0]=0;
  if(!slop_package_command("slop",args,append_report))return -22;
  unsigned n=report_length<(unsigned)c-1?report_length:(unsigned)c-1;
  report_buffer[n]=0;
  return user_vm_copy(&p->vm,b,report_buffer,n+1,1)?(int64_t)n:-14;
 }
 case SX_CONSOLE_POLL:{
  if(b<2||b>128||!user_vm_range(&p->vm,a,(size_t)b,1))return -14;
  if(console_head==console_tail)return 0;
  const char *line=console_messages[console_tail];unsigned n=(unsigned)length(line);
  if(n>=b)n=(unsigned)b-1;
  if(!user_vm_copy(&p->vm,a,(void*)line,n,1))return -14;
  const char end=0;if(!user_vm_copy(&p->vm,a+n,(void*)&end,1,1))return -14;
  console_tail=(console_tail+1)%CONSOLE_RING;return n;
 }
 case SX_PROCINFO:{
  if(!b||b>2048||!user_vm_range(&p->vm,a,(size_t)b,1))return -14;
  report_length=0;report_buffer[0]=0;process_report(append_report);
  unsigned n=report_length<(unsigned)b-1?report_length:(unsigned)b-1;
  report_buffer[n]=0;
  return user_vm_copy(&p->vm,a,report_buffer,n+1,1)?(int64_t)n:-14;
 }
 case SX_HTTP_GET:{
  /* Copy and verify the user URL and destination before invoking drivers.
   * Kernel-controlled staging prevents arbitrary writes into supervisor pages. */
  char url[128];if(!copy_name(p,a,url))return -14;
  if(!c||c>sizeof(net_output)||!user_vm_range(&p->vm,b,(size_t)c,1))return -14;
  int count=net_http_get(url,net_output,(unsigned)c);
  if(count<0)return count;
  if(!user_vm_copy(&p->vm,b,net_output,(size_t)count,1))return -14;
  return count;
 }
 case SX_CREATE:{
  if(b>2)return -22; /* 0=create new, 1=create or truncate, 2=open or create, keep contents */
  char name[128];if(!copy_name(p,a,name))return -14;
  if(protected_path(name))return -13; /* EACCES */
  uint32_t size=0;int directory=0;
  int exists=vfs_stat(name,&size,&directory);
  if(exists&&(directory||!b))return directory?-21:-17;
  unsigned slot=0;while(slot<FD_MAX&&p->files[slot].used)slot++;
  if(slot==FD_MAX)return -24;
  int keep=b==2&&exists;
  if(!keep&&!vfs_write(name,0,0))return -5;
  copystr(p->files[slot].name,name,sizeof(p->files[slot].name));
  p->files[slot].offset=0;p->files[slot].size=keep?size:0;p->files[slot].used=1;return (int64_t)(FD_BASE+slot);
 }
 case SX_FWRITE:{
  if(a<FD_BASE||a>=FD_BASE+FD_MAX||!p->files[a-FD_BASE].used)return -9;
  struct user_file *file=&p->files[a-FD_BASE];
  if(c>sizeof(io)||!user_vm_range(&p->vm,b,(size_t)c,0))return -14;
  if(!c)return 0;
  if(c>UINT32_MAX-file->offset)return -27;
  if(!user_vm_copy(&p->vm,b,io,(size_t)c,0))return -14;
  if(!vfs_write_at(file->name,file->offset,io,(uint32_t)c))return -5;
  file->offset+=(uint32_t)c;if(file->offset>file->size)file->size=file->offset;return (int64_t)c;
 }
 case SX_SEEK:{
  if(a<FD_BASE||a>=FD_BASE+FD_MAX||!p->files[a-FD_BASE].used)return -9;
  if(b>UINT32_MAX)return -22;
  p->files[a-FD_BASE].offset=(uint32_t)b;return (int64_t)b;
 }
 case SX_SPAWN:{
  char name[128];if(!copy_name(p,a,name))return -14;
  int pid=process_spawn(name,b);return pid<0?-11:pid;
 }
 case SX_CLOSE:if(a<FD_BASE||a>=FD_BASE+FD_MAX||!p->files[a-FD_BASE].used)return -9;p->files[a-FD_BASE].used=0;return 0;
 /* ---- CP07 additions ---------------------------------------------------- */
 case SX_SCHED_PARAM:{
  struct sx_sched_param r;
  if(!user_vm_copy(&p->vm,b,&r,sizeof(r),0))return -14;
  if(r.policy<0||r.policy>POLICY_DEADLINE)return -22;
  if(r.priority<1||(unsigned)r.priority>PRIO_MAX)return -22;
  /* Ordinary programs may not outrank the default class by much (B-08). */
  if((unsigned)r.priority>PRIO_USER_MAX)r.priority=(int)PRIO_USER_MAX;
  if(r.policy==POLICY_DEADLINE){
   if(!r.period_ns||!r.runtime_ns||r.runtime_ns>r.period_ns)return -22;
   if(r.deadline_ns>r.period_ns)return -22;
  }
  p->policy=(unsigned)r.policy;p->priority=(unsigned)r.priority;
  p->deadline_ns=r.deadline_ns;p->period_ns=r.period_ns;p->runtime_ns=r.runtime_ns;
  if(p->policy==POLICY_DEADLINE){
   p->next_deadline_ns=(timer_us()+p->period_ns/1000)*1000;
   char q[21];logstr("SCHED_DEADLINE pid=");decimal(p->pid,q);logstr(q);
   logstr(" period_us=");decimal(p->period_ns/1000,q);logstr(q);
   logstr(" runtime_us=");decimal(p->runtime_ns/1000,q);logstr(q);
   logstr("\n");
  }else p->next_deadline_ns=0;
  return 0;
 }
 case SX_FUTEX:{
  if(b&0x80000000u){ /* FUTEX_WAKE: b holds the desired wake count. */
   unsigned want=(unsigned)(b&0x7fffffffu);if(!want)want=1;unsigned woke=0;
   for(unsigned i=0;i<PROCESSES&&woke<want;i++){
    struct process*q=&tasks[i];
    /* Same process only (B-09): addresses are per address space. */
    if(q->state==BLOCKED&&q->futex_addr==a&&q->pid==p->pid){q->state=READY;q->futex_addr=0;q->wake=0;woke++;}
   }
   return (int64_t)woke;
  }
  int value;
  if(!user_vm_range(&p->vm,a,sizeof(value),0))return -14;
  if(!user_vm_copy(&p->vm,a,&value,sizeof(value),0))return -14;
  if(value!=(int)(uint32_t)b)return -11; /* EAGAIN: value changed, caller re-checks. */
  uint64_t wake=UINT64_MAX;
  if(c){
   struct timespec64 ts;
   if(!user_vm_copy(&p->vm,c,&ts,sizeof(ts),0))return -14;
   if(ts.tv_sec<0||ts.tv_nsec<0||ts.tv_nsec>=1000000000)return -22;
   uint64_t us=(uint64_t)ts.tv_sec*1000000u+(uint64_t)ts.tv_nsec/1000u;
   if(us>10000000u)return -22;
   wake=timer_us()+us;
  }
  p->futex_addr=a;p->wake=wake;p->state=BLOCKED;return 0;
 }
 case SX_TLS_BASE:{
  /* Userspace supplies the base of its own static TLS block. The kernel only
   * programs IA32_FS_BASE for the duration of that process's slice. */
  if(a<USER_BASE+4096||a>=USER_STACK||!user_vm_range(&p->vm,a,8,1))return -14;
  p->fs_base=a;return 0;
 }
 case SX_CLOCK_GET:{
  if(a>1)return -22;
  struct timespec64 ts;uint64_t us=timer_us();
  ts.tv_sec=(int64_t)(us/1000000u);ts.tv_nsec=(int64_t)((us%1000000u)*1000u);
  return user_vm_copy(&p->vm,b,&ts,sizeof(ts),1)?0:-14;
 }
 default:return -38;
 }
}
int process_step(void){
 uint64_t now=timer_us();
 for(unsigned i=0;i<PROCESSES;i++){
  struct process*q=&tasks[i];
  if(q->state!=BLOCKED)continue;
  if(q->wake&&now>=q->wake){if(q->futex_addr)q->frame.rax=(uint64_t)-110; /* futex timed out: ETIMEDOUT, not a wake */
   q->state=READY;q->wake=0;q->futex_addr=0;
   if(q->policy==POLICY_DEADLINE)q->next_deadline_ns=(now+q->period_ns/1000)*1000;
  }
 }
 int picked=pick_next();if(picked<0)return 0;
 unsigned at=(unsigned)picked;struct process*p=&tasks[at];
 active=p;p->state=RUNNING;p->reason=0;p->started=timer_us();
 if(p->policy==POLICY_DEADLINE){
  uint64_t now_ns=p->started*1000;
  if(!p->next_deadline_ns)p->next_deadline_ns=now_ns+p->period_ns;
  else if(now_ns>p->next_deadline_ns){deadline_misses++;message("DEADLINE_MISS pid=",p->pid,(now_ns-p->next_deadline_ns)/1000);p->next_deadline_ns=now_ns+p->period_ns;}
 }
 /* User cannot select privilege, IOPL, NT or arbitrary return selectors. */
 p->frame.cs=0x23;p->frame.ss=0x1b;p->frame.flags=(p->frame.flags&0xcd5)|0x202;
 if(p->frame.rip<USER_BASE||p->frame.rip>=USER_STACK||p->frame.rsp<USER_BASE||p->frame.rsp>USER_STACK){exit_process(p,-1,13);active=0;user_vm_destroy(&p->vm);return 1;}
 arch_user_stack((uint64_t)(uintptr_t)&stacks[at][KSTACK]);
 arch_user_fs(p->fs_base);
 switches++;p->slices++;
 user_enter(&p->frame,p->vm.tables[0],p->fp);
 arch_user_fs(0);
 uint64_t elapsed=timer_us()-p->started;p->runtime+=elapsed;if(elapsed>max_slice)max_slice=elapsed;
 p->vruntime+=elapsed*256/(p->priority?p->priority:1);
 active=0;p->state=READY;
 if(p->reason==3)exit_process(p,-1,(int)p->frame.vector);
 else if(p->reason==2)p->frame.rax=(uint64_t)syscall(p);
 if(p->state==EXITED)user_vm_destroy(&p->vm);
 audio_checkpoint();return 1;
}
int process_alive(unsigned pid){for(unsigned i=0;i<PROCESSES;i++)if(tasks[i].pid==pid&&tasks[i].state!=EMPTY&&tasks[i].state!=EXITED)return 1;return 0;}
int process_suspend(unsigned pid){
 for(unsigned i=0;i<PROCESSES;i++)if(tasks[i].pid==pid&&tasks[i].state!=EMPTY&&tasks[i].state!=EXITED){tasks[i].suspended=1;message("PROCESS_SUSPEND pid=",pid,0);return 1;}
 return 0;
}
int process_resume(unsigned pid){
 for(unsigned i=0;i<PROCESSES;i++)if(tasks[i].pid==pid&&tasks[i].state!=EMPTY&&tasks[i].state!=EXITED){tasks[i].suspended=0;message("PROCESS_RESUME pid=",pid,0);return 1;}
 return 0;
}
int process_kill(unsigned pid){for(unsigned i=0;i<PROCESSES;i++)if(tasks[i].pid==pid&&tasks[i].state!=EMPTY&&tasks[i].state!=EXITED){exit_process(&tasks[i],-9,-1);user_vm_destroy(&tasks[i].vm);return 1;}return 0;}
static void field(char*s,const char*k,uint64_t n){char b[21];copystr(s+length(s),k,200-length(s));decimal(n,b);copystr(s+length(s),b,200-length(s));}
static const char *policy_name(unsigned p){switch(p){case POLICY_FIFO:return "fifo";case POLICY_RR:return "rr";case POLICY_DEADLINE:return "deadline";default:return "other";}}
void process_report(void(*line)(const char*)){
 const char*states[]={"empty","ready","running","blocked","exited"};
 for(unsigned i=0;i<PROCESSES;i++){struct process*p=&tasks[i];if(!p->pid)continue;char s[200]="PROCESS ";field(s,"pid=",p->pid);copystr(s+length(s)," state=",200-length(s));copystr(s+length(s),states[p->state],200-length(s));field(s," pages=",p->vm.count+(p->vm.tables[0]?USER_TABLES:0));field(s," slices=",p->slices);field(s," us=",p->runtime);field(s," exit=",(uint32_t)p->exit_status);field(s," fault=",p->fault);field(s," crashed=",p->crashed);field(s," paused=",p->suspended);copystr(s+length(s)," policy=",200-length(s));copystr(s+length(s),policy_name(p->policy),200-length(s));field(s," prio=",p->priority);field(s," vr=",p->vruntime);line(s);}
 char s[200]="SCHED ";field(s,"switches=",switches);field(s," preemptions=",preemptions);field(s," crashes=",crashes);field(s," max_slice_us=",max_slice);field(s," deadline_misses=",deadline_misses);line(s);
}
int process_command(const char*name,char*args,void(*line)(const char*)){
 if(equal(name,"net")){net_report(line);return 1;}
 if(equal(name,"ps")){process_report(line);return 1;}
 if(equal(name,"sysinfo")){line("x86-64 / Ring-3 / supervisor kernel / NX + W^X / int80 ABI v2 / EDF");process_report(line);return 1;}
 if(equal(name,"kill")){unsigned n=0;while(*args>='0'&&*args<='9'&&n<0x10000000)n=n*10+(unsigned)(*args++-'0');line(!*args&&n&&process_kill(n)?"Process terminated":"Invalid or inactive PID");return 1;}
 if(equal(name,"exec")){
  char*value=args;while(*value&&*value!=' ')value++;if(*value)*value++=0;while(*value==' ')value++;
  int pid=*args?spawn_with_arg(args,0,value):-1;
  if(pid<0)line("Executable load failed; see serial diagnostics");else {char s[200]="User process started ";field(s,"pid=",(unsigned)pid);line(s);}return 1;
 }
 if(!equal(name,"run"))return 0;
 char*arg=args;while(*arg&&*arg!=' ')arg++;uint64_t mode=0;if(*arg){*arg++=0;while(*arg==' ')arg++;unsigned digits=0;while(*arg>='0'&&*arg<='9'&&digits<2){mode=mode*10+(unsigned)(*arg++-'0');digits++;}if(!digits||*arg||mode>15){line("run FILE.ELF [0..15]");return 1;}}
 int pid=process_spawn(args,mode);if(pid<0)line("Executable load failed; see serial diagnostics");else {char s[200]="User process started ";field(s,"pid=",(unsigned)pid);line(s);}return 1;
}
