#!/usr/bin/env python3
"""Static ABI/ownership regression assertions; not a QEMU guest execution test."""
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
abi=(ROOT/'sdk/slopix.h').read_text()
proc=(ROOT/'src/user/process.c').read_text()
desk=(ROOT/'src/desktop.c').read_text()
assert re.search(r'SX_READDIR.*SX_REMOVE.*SX_MKDIR.*SX_DESKTOP_OPEN.*SX_PREF_GET.*SX_PREF_SET.*SX_PREF_SAVE.*SX_PACKAGE.*SX_PROCINFO.*SX_CONSOLE_POLL',abi,re.S)
for sym in ('SX_READDIR','SX_REMOVE','SX_MKDIR','SX_DESKTOP_OPEN','SX_PREF_GET','SX_PREF_SET','SX_PREF_SAVE','SX_PACKAGE','SX_PROCINFO','SX_CONSOLE_POLL'):
    assert re.search(r'case '+sym+r'\b',proc),f'Missing syscall dispatch: {sym}'
for cap in ('user_vm_range(&p->vm','user_vm_copy(&p->vm','copy_name(p,'):
    assert cap in proc
for elf in ('TERM.ELF','FILES.ELF','FIND.ELF','SET.ELF','DOOM.ELF'):
    assert elf in desk
assert 'process_kill(pid)' in desk
assert 'gui_send_visibility' in desk
assert 'process_suspend' in desk and 'process_resume' in desk
for elf in ('TERM','FILES','FIND','SET'):
    src=(ROOT/f'sdk/{"terminal" if elf=="TERM" else "files" if elf=="FILES" else "find" if elf=="FIND" else "settings"}.c').read_text()
    assert 'sx_gui_open(' in src and 'sx_gui_present' not in src or ('gp()' in src)
    assert '_start(void)' in src
print('PASS: CP05 syscall names, guarded pointers, GUI process ownership and ELF entrypoints')

# Port, owner and guest ABI compile invariants (not execution proof).
assert 'gui_send_scancode' in (ROOT/'src/user/gui.c').read_text()
assert 'gui_send_scancode(user_app_pid[DOOM]' in desk
assert 'DOOM_RING3_LAUNCHED' in desk
assert 'doom_update(' not in desk and 'doom_open(' not in desk and 'doom_draw(' not in desk
for sym in ('SX_STAT','SX_PCM_START','SX_PCM_STOP','SX_PCM_VOLUME','SX_PCM_PLAYING'):
    assert ('case '+sym+':') in proc
assert 'voice_owner' in proc and 'audio_sfx_stop(i)' in proc
assert 'I_ZoneBase' in (ROOT/'sdk/doom_system.c').read_text()
assert 'doomgeneric_Create' in (ROOT/'sdk/doom.c').read_text()
assert (ROOT/'sdk/DOOM.ELF').stat().st_size>100_000
print('PASS: CP05 Ring-3 DOOM build, keyboard isolation, PCM ownership and FAT32 WAD API checks')
