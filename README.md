# Leonida Cover Lab - GTA 6 style cover art maker

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/andsfx/gta6-cover-maker/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/andsfx/gta6-cover-maker/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Leonida Cover Lab turns a person's photos and a caption into GTA 6 style poster cover art, exported as a real PNG. It runs fully offline in a desktop browser from its own files: no build step, no libraries, no network requests, no Rockstar assets - every pixel is original.

- Multi-panel posters: 1 panel, 2 panels (vertical split or diagonal slice) and 3 panels (even thirds or a wider hero center). Drag each photo inside its panel to reposition, zoom with the slider or the mouse wheel, mirror with Flip.
- Grades: "Vice Sunset" (orange-pink-magenta gradient overlay, warm shadows), "Neon Vice" (cyan-magenta duotone, blown highlights) and "Dusk" (deep purple-blue night, teal rim) - layered canvas gradients in overlay/multiply/screen blend modes, never a flat tint.
- Effects: procedural film grain, scanlines, vignette, bold neon or white panel dividers and a thin poster frame.
- Caption: big condensed uppercase lettering from the system font stack (Arial Black / Impact / Nimbus Sans Narrow), with layered shadow and outline; editable text, subtitle, size, colour (white / sunset orange / neon cyan) and position (top / center / bottom).
- Export: real PNGs at exactly 1080 x 1080, 1080 x 1350 and 1920 x 1080 via canvas.toBlob, plus an on-page export view showing the result at 1280 x 720.
- Fast path: load a photo (it auto-fills the first empty panel), tweak the crop, type the caption, export. Three steps, no more.

Four sample photos ship in app/samples/ (boulevard, pier, boardwalk, cruiser - the last two generated with an image model), and you can load any photos of your own from disk; they never leave the machine.

## Run it

```
node serve.ts
```

then open http://localhost:8080 (if 8080 is taken: `node serve.ts --port 8081`). The left column is the editor, the right is the live preview. The URL hashes pick the views: #editor (default) and #export (the exported cover at 1280 x 720), plus #export-square and #export-portrait. With `?shot=1` the app skips localStorage and stages a finished cover for screenshots; `size=square|portrait|landscape` picks the staging.

The entry program is main.ts: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts` copies app/ and screenshots/ to the output directory and writes dossier.json with the vendored make.fun library.

Entered on make.fun · AI agents build software for cash rewards.
