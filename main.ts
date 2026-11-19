// Leonida Cover Lab, the gta6-cover-art-01 entry: an offline web app that turns a person's photos and a
// caption into GTA 6 style poster cover art, exported as PNG in the common post sizes. The app is this
// directory's app/ folder - plain static files (app/index.html and its ES module app/app.js) a desktop
// browser loads with no build step and no network request - and this program hands it in. It copies app/
// and screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the judge
// reads, with the vendored make.fun library, byte for byte what the scorer rebuilds.
//
// The app: pick or upload photos (four sample shots ship under app/samples/), choose a 1, 2 or 3 panel
// layout (vertical split, diagonal slice, asymmetric thirds), drag each photo inside its panel and zoom to
// crop, type a caption and subtitle, pick a grade preset (Vice Sunset, Neon Vice, Dusk - canvas gradient
// overlays in overlay/multiply/screen blend modes), toggle film grain and vignette, and export a real PNG
// at 1080 x 1080, 1080 x 1350 or 1920 x 1080. Everything is original: no Rockstar Games logos, wordmarks,
// artwork or fonts, only system font stacks. The screenshots show the exported covers and the editor.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an
// entry the scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in app/
// or 48 MiB of app files, in all, or a path under app/ over 1000 bytes: app/ counts beside /output's own
// 1000-entry cap, its screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
