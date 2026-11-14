#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "../src/perf.h"
static char report[8000];
void logstr(const char*s){(void)s;}
size_t length(const char*s){return strlen(s);}
void copystr(char*d,const char*s,size_t n){if(n)snprintf(d,n,"%s",s);}
void decimal(uint64_t n,char*s){sprintf(s,"%llu",(unsigned long long)n);}
static void line(const char*s){assert(strlen(report)+strlen(s)+2<sizeof(report));strcat(report,s);strcat(report,"\n");}
int main(void){
 perf_reset();perf_record(P_LOOP,5);perf_record(P_LOOP,15);perf_record(P_LOOP,300);perf_record(P_COUNT,999);
 perf_frame(0,1);perf_frame(0,1500001);perf_report(line);
 assert(strstr(report,"PERF loop count=3 avg_us=106 max_us=300"));assert(strstr(report,"max_us=1500000"));
 perf_pause(0);perf_frame(0,9000000);report[0]=0;perf_report(line);assert(strstr(report,"app=0 n=1"));
 perf_reset();for(unsigned i=0;i<400;i++)perf_frame(1,1+(uint64_t)i*16667);report[0]=0;perf_report(line);assert(strstr(report,"app=1 n=256"));
 perf_reset();uint64_t t=1;perf_frame(0,t);for(unsigned i=1;i<=100;i++){t+=(uint64_t)i*1000;perf_frame(0,t);}report[0]=0;perf_report(line);
 assert(strstr(report,"p95_us=95000 p99_us=99000 max_us=100000"));
 puts("PASS: bounded telemetry ring, average/max, long stalls retained, hidden gap excluded explicitly");
}
