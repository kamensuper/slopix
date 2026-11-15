# Continuation notes for the next agent session

- Repo: github.com/kamensuper/slopix. Work branch: `slopix-opus-revival`, created from `slopix-2-wowzer` @ `67068f1`. Never reset to `main`.
- PRs #1 (Flock Fury) must stay untouched. PR #2 (time travel) and PR #3 (black bars/resize/console/DOOM) are unbuilt; port ideas from #3 by hand, do not merge it.
- The agent's desktop shell is Git for Windows under Wine: no compiler/make/python/QEMU. Pipes and `grep -r` are unreliable; use `git grep`, plain `sed -n`, and awk to write files. Set `core.autocrlf false` in any clone.
- Verification happens only in GitHub Actions (`.github/workflows/ci.yml`). Read its logs (artifact `slopix-ci-logs`) before claiming anything works.
- Status of every item: `docs/OPUS_IMPLEMENTATION_STATUS.md`.
- Audit deliverables (BUG_REGISTER.md, COMPLETE_OS_FEATURES.md, TEST_PLAN.md, ...) were produced in chat on 2026-11-15 and are not in the repo; the status file lists the B-xx ids it references.
