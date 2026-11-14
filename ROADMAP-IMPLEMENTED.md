# Slopix 0.85 scope

SlopFind is the fourth app; Slopettings is the fifth. Both use the existing
kernel-integrated window framework. Terminal, DOOM and the four 3D models remain.

Required work implemented: measured shared-loop telemetry and targeted composition/
pacing fixes; native-pixel modes including explicit 800x600; maximize work area
reserving the Dock; corner resizing; Alt+Tab, Alt+F4 and Super launcher; Settings
appearance/display/audio controls; bounded custom P6 wallpapers; validated dual-slot
FAT32 preferences; SlopFind application/command/help registry; SlopFetch, SlopMon,
history/date/about/audioinfo and colored Terminal prompts/errors.

Session-only changes are explicitly reported when storage is unavailable. Saves
are debounced 1.5 seconds, and wait while playback is active. An explicit Save
button/command is available. Custom image loading also asks the user to stop
playback rather than risking a long storage read during DMA playback.

No clipboard, screenshot tool, file manager, browser, networking, new userspace,
filesystem redesign or preemptive scheduler is added. Automatic host-window size
notification remains outside this release. Optional polish was not prioritized.
