"""These allocator checks execute in the real guest, not just host Rust tests."""
import re
from qemu_driver import Guest,ROOT

g=Guest()
try:
    g.wait('RUST_PMM_READY')
    start=len(g.output());g.command('meminfo','Kernel heap active')
    before=int(re.search(r'Free physical pages: (\d+)',g.output()[start:]).group(1))
    for _ in range(3):g.command('memtest','MEMTEST PASS: exhaustion, canaries, free, double-free')
    start=len(g.output());g.command('meminfo','Allocated physical pages: 0')
    after=int(re.search(r'Free physical pages: (\d+)',g.output()[start:]).group(1));assert before==after and before>0
    g.command('echo Memory_is_intact!','\nMemory_is_intact!\n')
    g.app(1);g.wait('CUBE_STATS',10)
    g.click(200,300);g.command('memtest','MEMTEST PASS: exhaustion, canaries, free, double-free')
    g.command('echo Both_still_work','\nBoth_still_work\n')
    g.wait('CUBE_STATS',start=len(g.output()),timeout=4)
    g.screenshot('memory-tested.ppm')
    (ROOT/'build/memory-guest-test.log').write_text(g.output())
    print('PASS: guest Rust/C allocator exhausts actual RAM, preserves canaries, rejects invalid/double frees and restores all '+str(before)+' free pages; apps work afterward',flush=True)
finally:g.close()
