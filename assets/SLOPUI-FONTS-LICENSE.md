# SlopUI font assets

`sdk/slopfont_data.h` contains glyph bitmaps rasterized from the fonts below by
`tools/bake_slopui_fonts.py`. Rasterized bitmaps of these fonts are distributed
under the same license as the source fonts.

| Face | Source file | Version | Copyright | License |
|---|---|---|---|---|
| Noto Sans (Regular 400 / SemiBold 600 instances) 12, 14, 18 px | `NotoSans[wght].ttf` | 2.013 | Copyright 2022 The Noto Project Authors (https://github.com/notofonts/latin-greek-cyrillic) | SIL Open Font License 1.1 |
| Liberation Mono Regular 13, 15 px | `LiberationMono-Regular.ttf` | 2.1.5 | Digitized data copyright (c) 2010 Google Corporation. Copyright (c) 2012 Red Hat, Inc. Reserved Font Name "Liberation". | SIL Open Font License 1.1 |

License values were read from each file's OpenType `name` table (IDs 0, 5, 13, 14).
The SHA-256 of each source file is recorded in the header of the generated file.

Full license text: https://openfontlicense.org/open-font-license-official-text/
(SIL Open Font License, Version 1.1, 26 February 2007). Under OFL 1.1 the fonts
may be bundled, embedded and redistributed with software, provided this notice
is kept and the fonts are not sold on their own.

## Regenerating

```
python3 tools/bake_slopui_fonts.py \
  --sans /usr/share/fonts/google-noto-vf/NotoSans[wght].ttf \
  --mono /usr/share/fonts/liberation-mono/LiberationMono-Regular.ttf \
  -o sdk/slopfont_data.h
```

This was baked with Pillow 13.0.0 (FreeType backend). Only ASCII 0x20-0x7E is covered,
with no kerning, stored as 4-bit alpha (31,211 glyph bytes for all 7 faces).
