/* Links a host build of the Rust kernel parts (build/librust-host-*.a) into a
 * C host test. Rust panics abort; host core has unwind metadata, but unwinding
 * is forbidden and traps if invoked. */
#include <stdlib.h>
void rust_panic_abort(void){abort();}
void rust_eh_personality(void){abort();}
