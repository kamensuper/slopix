#include "kernel.h"
#include "perf.h"
int perf_trace;
static struct perf_value values[P_COUNT];
static uint32_t gaps[2][256];static unsigned next[2],count[2];static uint64_t previous[2],last_log;
void perf_reset(void){for(unsigned i=0;i<P_COUNT;i++)values[i]=(struct perf_value){0};for(unsigned a=0;a<2;a++){next[a]=count[a]=0;previous[a]=0;}}
void perf_record(unsigned id,uint64_t us){if(id>=P_COUNT)return;struct perf_value*v=&values[id];v->count++;v->total+=us;if(us>v->maximum)v->maximum=us;}
void perf_pause(unsigned app){if(app<2)previous[app]=0;}
void perf_frame(unsigned app,uint64_t now){if(app>1)return;if(previous[app]){uint64_t elapsed=now-previous[app];gaps[app][next[app]++%256]=elapsed>UINT32_MAX?UINT32_MAX:(uint32_t)elapsed;if(count[app]<256)count[app]++;}previous[app]=now;}
static const char*names[]={"loop","input","desktop","compose","upload","audio","doom","game","doom_render","cube","wait","event_queue"};
static void field(char*s,const char*name,uint64_t n){char b[21];decimal(n,b);copystr(s+length(s),name,240-length(s));copystr(s+length(s),b,240-length(s));}
void perf_report(void(*line)(const char*)){
 for(unsigned i=0;i<P_COUNT;i++){struct perf_value v=values[i];char s[240]="PERF ";copystr(s+5,names[i],235);field(s," count=",v.count);field(s," avg_us=",v.count?v.total/v.count:0);field(s," max_us=",v.maximum);line(s);}
 for(unsigned a=0;a<2;a++){unsigned n=count[a];if(!n)continue;uint32_t sorted[256];uint64_t sum=0;for(unsigned i=0;i<n;i++){sorted[i]=gaps[a][i];sum+=sorted[i];}for(unsigned i=1;i<n;i++){uint32_t v=sorted[i];unsigned j=i;while(j&&sorted[j-1]>v){sorted[j]=sorted[j-1];j--;}sorted[j]=v;}unsigned tail=n/100;if(!tail)tail=1;uint64_t slow=0;for(unsigned i=n-tail;i<n;i++)slow+=sorted[i];char s[240]="FRAMES ";field(s,"app=",a);field(s," n=",n);field(s," fps10=",sum?(uint64_t)n*10000000/sum:0);field(s," low1_fps10=",slow?(uint64_t)tail*10000000/slow:0);field(s," p95_us=",sorted[(n-1)*95/100]);field(s," p99_us=",sorted[(n-1)*99/100]);field(s," max_us=",sorted[n-1]);line(s);}
}
static void serial_line(const char*s){logstr(s);logstr("\n");}
void perf_log(uint64_t now){if(perf_trace&&now-last_log>=5000000){last_log=now;perf_report(serial_line);}}
