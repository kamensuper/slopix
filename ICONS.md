# PNG icon pipeline

Source PNGs live in `assets/icons/source/`. The provided Terminal, 3D Demo and DOOM
artwork is original, transparent 256 x 256 RGBA artwork, reproducible from
`python3 tools/draw_icon_sources.py`. You can replace those PNGs with artwork
from an image editor. Square 128 x 128 artwork also works; 256 x 256 is preferred.
The source filename suffix remains `-256.png` by convention, not a size check.
Source dimensions from 16 to 4096 are accepted.

```sh
make icons
make
```

`tools/build_icons.py` generates transparent 16, 32, 48, 64 and 96 px PNGs and raw
RGBA files in `assets/icons/generated/`. Filtering converts to premultiplied
RGBA, performs Lanczos downsampling, then converts back to **straight RGBA**.
This prevents invisible source colors from producing edge halos. The C header
`src/icons.h` embeds the selected 16 px title-bar and 96 px Dock sources (64–96 px on screen).
There is no PNG decoder in the guest. Dock magnification samples the embedded
96px straight-RGBA sources; high-quality downsampling is performed offline.

The framebuffer renderer accepts straight RGBA8 bytes in R,G,B,A order, clips
before iteration, skips alpha-zero pixels and blends partial alpha once against
the existing pixel. It also supports the validated alternate framebuffer channel
orders. Generated headers are included so the source remains reviewable; changing
PNG source artwork triggers regeneration during `make`. Pillow is a build-time
dependency, not a guest library.

Future apps can reuse this pipeline without editing its Python code:

```sh
# Add assets/icons/source/my_app-256.png, then:
make icons ICONS='terminal demo doom my_app'
make ICONS='terminal demo doom my_app'
```

This emits `icon_my_app_16` and `icon_my_app_64` arrays as well. Use
`rgba_blit(icon_my_app_64,64,64,x,y)` in the relevant application/Dock UI.
Adding an app still requires registering its window/icon behavior; the asset
pipeline does not create applications by itself.

`tests/icon_test.py` verifies sizes, RGBA byte consistency, reproducible scaling
and filtering without invisible-color halos. `tests/graphics_test.c` verifies
partial-alpha blending and clipping under address/undefined-behavior sanitizers.

The menu-bar snake logo and starry hills wallpaper are original PNG artwork
from `tools/build_brand.py` in `assets/brand/`. The source PNGs accompany the
embedded 28px RGBA logo and RGB wallpaper bytes. Those assets are converted
offline, like the icons. The renderer scales the wallpaper once at boot to the
validated display size and retains it in the existing background cache.
