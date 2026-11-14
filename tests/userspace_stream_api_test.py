"""Independent guest exercise of new seek/spawn pointer and handle boundaries."""
import tempfile,subprocess,shutil,re
from pathlib import Path
from qemu_driver import Guest,ROOT
source=r'''
#include "slopix.h"
static unsigned char data[4096];
static char unterminated[128];
#define CHECK(x,n) do{if(!(x))sx_exit(n);}while(0)
__attribute__((noreturn)) void _start(uint64_t mode){
 (void)mode;CHECK(sx_seek(99,0)==-9,10);
 CHECK(sx_call(SX_SPAWN,0x100000,0,0)==-14,11);
 for(unsigned i=0;i<128;i++)unterminated[i]='A';
 CHECK(sx_open(unterminated)==-14,12);
 int64_t h=sx_open("WELCOME.TXT");CHECK(h>0,13);
 CHECK(sx_read((int)h,(void*)UINT64_MAX,16)==-14,14);
 CHECK(sx_read((int)h,data,4097)==-14,15);
 CHECK(sx_seek((int)h,UINT64_C(0x100000000))==-22,16);
 CHECK(sx_seek((int)h,UINT32_MAX)==UINT32_MAX,17);
 CHECK(sx_read((int)h,data,1)==0,18);
 CHECK(sx_seek((int)h,0)==0,19);CHECK(sx_read((int)h,data,16)==16,20);
 CHECK(sx_close((int)h)==0&&sx_close((int)h)==-9,21);
 CHECK(sx_spawn("MISSING.ELF",0)==-11,22);
 CHECK(sx_spawn("HELLO.ELF",1)>0,23);
 sx_write("STREAM_ABI_PASS",15);sx_exit(0);
}
'''
with tempfile.TemporaryDirectory(dir=ROOT/'build') as temp:
 d=Path(temp);(d/'api.c').write_text(source)
 subprocess.run(['cc','-std=c11','-O2','-Wall','-Wextra','-Werror','-ffreestanding','-fno-pie','-fno-stack-protector','-fno-asynchronous-unwind-tables','-mcmodel=large','-m64','-mno-red-zone','-I',str(ROOT/'sdk'),'-c',str(d/'api.c'),'-o',str(d/'api.o')],check=True)
 subprocess.run(['ld','-nostdlib','-z','max-page-size=0x1000','-T',str(ROOT/'sdk/user.ld'),str(d/'api.o'),'-o',str(d/'API.ELF')],check=True)
 disk=d/'api.img';shutil.copy2(ROOT/'storage/slopix-data.img',disk)
 subprocess.run(['mcopy','-i',str(disk),str(d/'API.ELF'),'::API.ELF'],check=True)
 g=Guest(['-drive',f'file={disk},format=raw,if=ide,index=0,media=disk'])
 try:
  g.command('run API.ELF');g.wait('STREAM_ABI_PASS');g.wait('PROCESS_EXIT pid=1 value=0');g.wait('PROCESS_FAULT pid=2 value=6')
  g.command('meminfo','Allocated physical pages: 0');g.command('echo child_fault_isolated','\nchild_fault_isolated\n')
  (ROOT/'build/light-userspace-api.log').write_text(g.output())
 finally:g.close()
print('PASS: real CPL3 stream/seek/spawn pointer, EOF, handle errors and child fault isolation')
