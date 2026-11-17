# Time travel for apps

Slopix can save a complete checkpoint of a running Ring-3 program and later
rewind it to that exact moment, or bring it back after it exited, was killed
or crashed.

## Commands

| Command | What it does |
|---|---|
| `snap PID` | Save a checkpoint of a live process |
| `rewind PID` | Rewind to the newest checkpoint of that PID |
| `rewind PID ID` | Rewind to a specific checkpoint |
| `snaps` | List checkpoints (id, pid, name, pages, age) |
| `snapdrop ID` | Delete a checkpoint and free its memory |

Up to four checkpoints are kept; taking a fifth evicts the oldest.

## Try it

```
run LIBCDEMO.ELF      # note the pid it prints
snap 1                # checkpoint id=1
ps                    # let it run for a bit
rewind 1              # it continues from the checkpoint again
kill 1
rewind 1              # revived from the checkpoint
```

Serial log markers: `PROCESS_SNAPSHOT pid=N value=PAGES` and
`PROCESS_REWIND pid=N value=CHECKPOINT_ID`.

## What is captured

Every mapped user page (code, data, heap, stack), the full register frame,
x87/SSE state (FXSAVE area), TLS base, heap break, open descriptors and their
offsets, and scheduling parameters.

A rewind builds a completely new address space from the checkpoint and swaps it
in only after every page was allocated and copied, so a failed rewind leaves
the program exactly as it was.

## What is not rewound

- Files on disk (only descriptor offsets are restored)
- GUI windows and audio voices
- Other processes
- Futex waiters resume READY (a spurious wakeup); sleepers keep their remaining
  sleep time

## Cost

A checkpoint copies every user page, so it uses as much physical memory as the
program itself. `snap` refuses to run when fewer than 2048 pages (8 MiB) would
remain free. Copy-on-write checkpoints are the natural next step.
