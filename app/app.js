// Leonida Cover Lab - a GTA 6 style cover art maker.
// Turns photos and a caption into multi-panel poster covers (Vice City sunset / neon grade),
// exported as real PNGs at 1080x1080, 1080x1350 and 1920x1080. Everything is drawn with the
// canvas 2D API: per-panel crops, blend-mode grade overlays, film grain, vignette, panel
// dividers and bold condensed caption lettering. No libraries, no network, system fonts only.
//
// Views: #editor (build the cover), #export (the exported cover shown large). With ?shot=1
// the app skips localStorage and stages a finished cover for screenshots; the optional
// size=square|portrait|landscape parameter picks the staging (default landscape).
// No Rockstar Games logos, wordmarks, artwork or fonts appear anywhere - all original.

'use strict';

// ---------------------------------------------------------------- helpers

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Loads an image from a URL under app/, resolving to the HTMLImageElement. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`cannot load ${url}`));
    img.src = url;
  });
}

// ---------------------------------------------------------------- constants

const SIZES = {
  square: { w: 1080, h: 1080, label: '1080 x 1080' },
  portrait: { w: 1080, h: 1350, label: '1080 x 1350' },
  landscape: { w: 1920, h: 1080, label: '1920 x 1080' },
};

// The poster face: heavy condensed capitals. Impact / Arial Black on desktop systems,
// Nimbus Sans Narrow / Liberation Sans Bold on Linux - all system fonts, none shipped.
const POSTER_FONT =
  "'Arial Black', Impact, Haettenschweiler, 'Arial Narrow', 'Nimbus Sans Narrow', 'Franklin Gothic Bold', 'Helvetica Neue', Helvetica, 'Liberation Sans', sans-serif";

const CAPTION_COLORS = { white: '#ffffff', orange: '#ffb347', cyan: '#41f0ff' };
const OUTLINE_COLORS = { vice: '#3a0a2e', neon: '#081331', dusk: '#050a26' };

// ---------------------------------------------------------------- panel layouts

// Each layout maps to panel regions on the unit square. shape 'rect' or 'tri', pts the
// polygon (normalized), bbox the cover-fit box the photo fills before clipping.
const LAYOUTS = {
  single: () => [
    { shape: 'rect', pts: [[0, 0], [1, 0], [1, 1], [0, 1]], bbox: { x: 0, y: 0, w: 1, h: 1 } },
  ],
  split2: () => [
    { shape: 'rect', pts: [[0, 0], [0.5, 0], [0.5, 1], [0, 1]], bbox: { x: 0, y: 0, w: 0.5, h: 1 } },
    { shape: 'rect', pts: [[0.5, 0], [1, 0], [1, 1], [0.5, 1]], bbox: { x: 0.5, y: 0, w: 0.5, h: 1 } },
  ],
  diag2: () => [
    { shape: 'tri', pts: [[0, 0], [1, 0], [0, 1]], bbox: { x: 0, y: 0, w: 1, h: 1 } },
    { shape: 'tri', pts: [[0, 1], [1, 1], [1, 0]], bbox: { x: 0, y: 0, w: 1, h: 1 } },
  ],
  thirds: () => [
    { shape: 'rect', pts: [[0, 0], [1 / 3, 0], [1 / 3, 1], [0, 1]], bbox: { x: 0, y: 0, w: 1 / 3, h: 1 } },
    { shape: 'rect', pts: [[1 / 3, 0], [2 / 3, 0], [2 / 3, 1], [1 / 3, 1]], bbox: { x: 1 / 3, y: 0, w: 1 / 3, h: 1 } },
    { shape: 'rect', pts: [[2 / 3, 0], [1, 0], [1, 1], [2 / 3, 1]], bbox: { x: 2 / 3, y: 0, w: 1 / 3, h: 1 } },
  ],
  asym: () => [
    { shape: 'rect', pts: [[0, 0], [0.3, 0], [0.3, 1], [0, 1]], bbox: { x: 0, y: 0, w: 0.3, h: 1 } },
    { shape: 'rect', pts: [[0.3, 0], [0.7, 0], [0.7, 1], [0.3, 1]], bbox: { x: 0.3, y: 0, w: 0.4, h: 1 } },
    { shape: 'rect', pts: [[0.7, 0], [1, 0], [1, 1], [0.7, 1]], bbox: { x: 0.7, y: 0, w: 0.3, h: 1 } },
  ],
};

// The divider lines drawn between panels, per layout (normalized segments).
const DIVIDERS = {
  single: [],
  split2: [[[0.5, 0], [0.5, 1]]],
  diag2: [[[0, 1], [1, 0]]],
  thirds: [[[1 / 3, 0], [1 / 3, 1]], [[2 / 3, 0], [2 / 3, 1]]],
  asym: [[[0.3, 0], [0.3, 1]], [[0.7, 0], [0.7, 1]]],
};

// ---------------------------------------------------------------- state

const photos = new Map(); // photoId -> { img, name, sample: boolean }
let uploadCount = 0;

const state = {
  size: 'landscape',
  layout: 'asym',
  panels: [
    { photoId: 'boulevard', zoom: 1.15, ox: -0.5, oy: 0.4 },
    { photoId: 'cruiser', zoom: 1.18, ox: -0.18, oy: 0.32 },
    { photoId: 'boardwalk', zoom: 1.18, ox: 0.1, oy: 0.45 },
  ],
  caption: 'WELCOME TO LEONIDA',
  subtitle: 'VICE NEVER SLEEPS',
  captionColor: 'white',
  captionSize: 62, // 30..100 -> 7%..17.5% of canvas height
  captionPos: 'bottom',
  grade: 'vice',
  grain: true,
  vignette: true,
  activePanel: 0,
};

// Diagonal panels default to a headroom-friendly crop: no extra zoom and the photo
// top-aligned (oy +1) so a portrait subject's head sits fully inside the frame with the
// photo's own space above it, instead of the diagonal clip eating the top edge. Zoom below
// 1.0 would letterbox, because the diag2 bbox is the full canvas; 1.0 + oy 1 is the floor.
const newPanel = () => (state.layout === 'diag2'
  ? { photoId: null, zoom: 1.0, ox: 0, oy: 1, flip: false }
  : { photoId: null, zoom: 1.2, ox: 0, oy: 0, flip: false });

/** The panels of the current layout, st.panels[i] filled to length. */
function panelStates() {
  const n = LAYOUTS[state.layout]().length;
  while (state.panels.length < n) state.panels.push(newPanel());
  return state.panels.slice(0, n);
}

// ---------------------------------------------------------------- drawing

function tracePath(ctx, w, h, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * w, pts[0][1] * h);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] * w, pts[i][1] * h);
  ctx.closePath();
}

/** One photo, cover-fitted to the panel bbox at the panel's zoom and offset, clipped to the panel. */
function drawPanel(ctx, w, h, region, ps) {
  const bx = region.bbox.x * w;
  const by = region.bbox.y * h;
  const bw = region.bbox.w * w;
  const bh = region.bbox.h * h;
  ctx.save();
  tracePath(ctx, w, h, region.pts);
  ctx.clip();
  if (ps.flip) {
    // Mirror around the panel's vertical centre so the photo faces the other way.
    ctx.translate(bx * 2 + bw, 0);
    ctx.scale(-1, 1);
  }
  const photo = photos.get(ps.photoId);
  if (photo && photo.img.naturalWidth > 0) {
    const scale = Math.max(bw / photo.img.naturalWidth, bh / photo.img.naturalHeight) * ps.zoom;
    const dw = photo.img.naturalWidth * scale;
    const dh = photo.img.naturalHeight * scale;
    const maxX = Math.max(0, (dw - bw) / 2);
    const maxY = Math.max(0, (dh - bh) / 2);
    const cx = bx + bw / 2 + ps.ox * maxX;
    const cy = by + bh / 2 + ps.oy * maxY;
    ctx.drawImage(photo.img, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    // Empty panel placeholder: dark fill with faint diagonal hatching and a prompt.
    const grad = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
    grad.addColorStop(0, '#1d1333');
    grad.addColorStop(1, '#120b24');
    ctx.fillStyle = grad;
    ctx.fillRect(bx, by, bw, bh);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = Math.max(1, w / 540);
    for (let d = -bh; d < bw + bh; d += Math.max(20, w / 48)) {
      ctx.beginPath();
      ctx.moveTo(bx + d, by);
      ctx.lineTo(bx + d + bh, by + bh);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `700 ${Math.round(h * 0.035)}px ${POSTER_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = `${Math.round(h * 0.006)}px`;
    ctx.fillText('PICK A PHOTO', bx + bw / 2, by + bh / 2);
    ctx.letterSpacing = '0px';
  }
  // Soft dark falloff along the panel's right and bottom edges for depth.
  ctx.restore();
}

function fillGradient(ctx, w, h, stops, dir = 'y') {
  const g = dir === 'y'
    ? ctx.createLinearGradient(0, 0, 0, h)
    : ctx.createLinearGradient(0, 0, w, h);
  for (const [pos, color] of stops) g.addColorStop(pos, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** The grade: layered gradient passes in overlay/multiply/screen/color blend modes, never a flat tint. */
function applyGrade(ctx, w, h, grade) {
  if (grade === 'vice') {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.55;
    fillGradient(ctx, w, h, [[0, '#ffb85c'], [0.52, '#ff5e8a'], [1, '#c94bd6']], 'diag');
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 1;
    const glow = ctx.createRadialGradient(w * 0.72, h * 0.05, 0, w * 0.72, h * 0.05, Math.hypot(w, h) * 0.62);
    glow.addColorStop(0, 'rgba(255,160,80,0.34)');
    glow.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 1;
    fillGradient(ctx, w, h, [[0, 'rgba(44,8,52,0)'], [0.55, 'rgba(44,10,52,0.25)'], [1, 'rgba(34,8,50,0.6)']]);
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ff7846';
    ctx.fillRect(0, 0, w, h);
  } else if (grade === 'neon') {
    ctx.globalCompositeOperation = 'color';
    ctx.globalAlpha = 0.62;
    fillGradient(ctx, w, h, [[0, '#00e5ff'], [1, '#ff2bd6']]);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.5;
    fillGradient(ctx, w, h, [[0, 'rgba(0,229,255,0.55)'], [1, 'rgba(255,43,214,0.6)']]);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 1;
    fillGradient(ctx, w, h, [[0, 'rgba(0,229,255,0.18)'], [0.55, 'rgba(0,0,0,0)'], [1, 'rgba(255,43,214,0.22)']]);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 1;
    fillGradient(ctx, w, h, [[0, 'rgba(8,4,36,0.18)'], [1, 'rgba(6,2,26,0.55)']]);
  } else {
    // dusk: deep purple-blue night, teal rim light
    ctx.globalCompositeOperation = 'color';
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = '#5c78eb';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 1;
    fillGradient(ctx, w, h, [[0, 'rgba(9,13,52,0.42)'], [1, 'rgba(58,12,84,0.4)']]);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 1;
    fillGradient(ctx, w, h, [[0, 'rgba(24,230,210,0.3)'], [1, 'rgba(170,70,240,0.36)']], 'diag');
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 1;
    fillGradient(ctx, w, h, [[0, 'rgba(40,235,215,0.2)'], [0.3, 'rgba(40,235,215,0)'], [1, 'rgba(255,94,138,0.1)']]);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

/** diag2 only: a soft dark feather band along the diagonal seam so the two halves blend
 * instead of colliding. A linear gradient runs perpendicular to the seam, transparent at
 * the band edges, darkest at the divider line itself, which is drawn on top after. */
function drawDiagonalFeather(ctx, w, h) {
  if (state.layout !== 'diag2') return;
  // Seam from (0,h) to (w,0); unit normal (h,w)/L.
  const L = Math.hypot(w, h);
  const nx = h / L;
  const ny = w / L;
  const s = Math.max(8, (w / 1080) * 12); // ~12px half-band at export size
  const g = ctx.createLinearGradient(w / 2 - nx * s, h / 2 - ny * s, w / 2 + nx * s, h / 2 + ny * s);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.35, 'rgba(0,0,0,0.18)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.5)');
  g.addColorStop(0.65, 'rgba(0,0,0,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Bold 1-3px panel dividers (neon glow on the neon grade) plus a faint outer frame. */
function drawDividers(ctx, w, h, grade) {
  const segs = DIVIDERS[state.layout] ?? [];
  const color = grade === 'neon' ? '#41f0ff' : grade === 'dusk' ? 'rgba(150,235,255,0.92)' : 'rgba(255,255,255,0.96)';
  const lw = Math.max(2, (w / 1080) * 2.0);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  if (grade === 'neon') {
    ctx.shadowColor = 'rgba(65,240,255,0.95)';
    // A tighter glow on the diagonal layout so the seam feather stays visible.
    ctx.shadowBlur = lw * (state.layout === 'diag2' ? 2.0 : 3.5);
  }
  for (const [a, b] of segs) {
    ctx.beginPath();
    ctx.moveTo(a[0] * w, a[1] * h);
    ctx.lineTo(b[0] * w, b[1] * h);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.38)';
  ctx.lineWidth = Math.max(1, lw * 0.55);
  ctx.strokeRect(lw + 8, lw + 8, w - (lw + 8) * 2, h - (lw + 8) * 2);
  ctx.restore();
}

/** Radial darkening toward the corners. */
function drawVignette(ctx, w, h) {
  const cx = w / 2;
  const cy = h * 0.47;
  const g = ctx.createRadialGradient(cx, cy, Math.min(w, h) * 0.4, cx, cy, Math.hypot(w, h) * 0.66);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.72, 'rgba(0,0,0,0.26)');
  g.addColorStop(1, 'rgba(0,0,0,0.68)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// Procedural noise tiles, built once with a fixed seed so re-renders match.
let grainTile = null;
let scanTile = null;
function ensureTiles() {
  if (!grainTile) {
    grainTile = document.createElement('canvas');
    grainTile.width = grainTile.height = 160;
    const g = grainTile.getContext('2d');
    const rnd = mulberry32(7);
    const px = g.createImageData(160, 160);
    for (let i = 0; i < px.data.length; i += 4) {
      const v = 80 + Math.floor(rnd() * 175);
      px.data[i] = v;
      px.data[i + 1] = v;
      px.data[i + 2] = v;
      px.data[i + 3] = 26;
    }
    g.putImageData(px, 0, 0);
    scanTile = document.createElement('canvas');
    scanTile.width = 1;
    scanTile.height = 4;
    const s = scanTile.getContext('2d');
    s.fillStyle = 'rgba(0,0,0,0.4)';
    s.fillRect(0, 0, 1, 1);
  }
  return { grainTile, scanTile };
}

/** Film grain (overlay noise) and faint scanlines. */
function drawGrain(ctx, w, h) {
  const { grainTile: gt, scanTile: st } = ensureTiles();
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = ctx.createPattern(gt, 'repeat');
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.38;
  ctx.fillStyle = ctx.createPattern(st, 'repeat');
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Bold condensed caption with layered shadow, hard outline and fill, plus the subtitle. */
function drawCaption(ctx, w, h, st) {
  const text = st.caption.trim().toUpperCase();
  if (text) {
    const color = CAPTION_COLORS[st.captionColor] ?? '#ffffff';
    const outline = OUTLINE_COLORS[st.grade] ?? '#160a26';
    const maxW = w * 0.9;
    let size = h * (0.07 + (st.captionSize / 100) * 0.105);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const setFont = (s) => { ctx.font = `900 ${s}px ${POSTER_FONT}`; };
    setFont(size);
    while (size > 8 && ctx.measureText(text).width > maxW) {
      size *= 0.965;
      setFont(size);
    }
    ctx.letterSpacing = `${-size * 0.018}px`;
    const y = st.captionPos === 'top'
      ? h * 0.05 + size * 0.78
      : st.captionPos === 'center' ? h * 0.48 : h * 0.8;
    const cx = w / 2;
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.72)';
    ctx.shadowBlur = size * 0.1;
    ctx.shadowOffsetY = size * 0.05;
    ctx.strokeStyle = outline;
    ctx.lineWidth = size * 0.13;
    ctx.strokeText(text, cx, y);
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = color;
    ctx.fillText(text, cx, y);

    const sub = st.subtitle.trim().toUpperCase();
    if (sub) {
      const ssize = Math.max(10, size * 0.27);
      ctx.letterSpacing = `${ssize * 0.34}px`;
      ctx.font = `700 ${ssize}px ${POSTER_FONT}`;
      const subY = y + size * 0.62;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = ssize * 0.18;
      ctx.strokeText(sub, cx, subY);
      ctx.fillStyle = color;
      ctx.fillText(sub, cx, subY);
    }
    ctx.letterSpacing = '0px';
  }
}

/** Draws the whole cover onto a 2D context at its own resolution. */
function renderCover(ctx, w, h, st) {
  ctx.save();
  ctx.fillStyle = '#140b22';
  ctx.fillRect(0, 0, w, h);
  const regions = LAYOUTS[st.layout]();
  const panels = panelStates();
  regions.forEach((region, i) => drawPanel(ctx, w, h, region, panels[i]));
  ctx.restore();
  applyGrade(ctx, w, h, st.grade);
  drawDiagonalFeather(ctx, w, h);
  drawDividers(ctx, w, h, st.grade);
  if (st.vignette) drawVignette(ctx, w, h);
  if (st.grain) drawGrain(ctx, w, h);
  drawCaption(ctx, w, h, st);
}

// ---------------------------------------------------------------- preview + export views

const preview = $('preview');
const exportCanvas = $('exportCanvas');

/** The preview canvas resolution: the export aspect fitted to 960px on the long side. */
function previewSize() {
  const s = SIZES[state.size];
  const scale = Math.min(960 / s.w, 960 / s.h);
  return { w: Math.round(s.w * scale), h: Math.round(s.h * scale) };
}

function renderPreview() {
  const d = previewSize();
  if (preview.width !== d.w) preview.width = d.w;
  if (preview.height !== d.h) preview.height = d.h;
  renderCover(preview.getContext('2d'), d.w, d.h, state);
}

/** The export view: the cover drawn at its native export resolution, scaled to fit the window. */
function showExportView() {
  const s = SIZES[state.size];
  exportCanvas.width = s.w;
  exportCanvas.height = s.h;
  renderCover(exportCanvas.getContext('2d'), s.w, s.h, state);
  $('exportInfo').textContent = `PNG ${s.label} - ${state.caption.toUpperCase()}`;
  $('exportView').hidden = false;
  document.body.classList.add('exporting');
}

function showEditorView() {
  $('exportView').hidden = true;
  document.body.classList.remove('exporting');
  renderPreview();
}

/** Renders a PNG at the exact export size and downloads it, then opens the export view. */
function exportPNG(sizeKey) {
  state.size = sizeKey;
  const s = SIZES[sizeKey];
  const canvas = document.createElement('canvas');
  canvas.width = s.w;
  canvas.height = s.h;
  renderCover(canvas.getContext('2d'), s.w, s.h, state);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `leonida-cover-${s.w}x${s.h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    setStatus(`Saved leonida-cover-${s.w}x${s.h}.png`);
  }, 'image/png');
  location.hash = '#export';
  saveState();
}

// ---------------------------------------------------------------- photos

async function addSample(id) {
  if (photos.has(id)) return photos.get(id);
  const entry = { img: await loadImage(`samples/${id}.jpg`), name: id, sample: true };
  photos.set(id, entry);
  return entry;
}

function addUploadedFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const id = `u${++uploadCount}`;
        photos.set(id, { img, name: file.name.replace(/\.[^.]+$/, '').slice(0, 18) || `photo ${uploadCount}`, sample: false });
        resolve(id);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Puts a photo into the first empty panel, else into the active panel. */
function assignPhoto(photoId) {
  const n = panelStates().length;
  let target = state.activePanel;
  for (let i = 0; i < n; i++) {
    if (!state.panels[i] || !state.panels[i].photoId) { target = i; break; }
  }
  if (target >= state.panels.length) state.panels.push(newPanel());
  state.panels[target].photoId = photoId;
  state.activePanel = target;
  syncAll();
  renderPreview();
  saveState();
}

// ---------------------------------------------------------------- drag + hit testing

/** Point in polygon test on normalized coordinates. */
function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function hitTestPanel(nx, ny) {
  const regions = LAYOUTS[state.layout]();
  for (let i = 0; i < regions.length; i++) {
    if (pointInPoly(nx, ny, regions[i].pts)) return i;
  }
  return -1;
}

function canvasPoint(e) {
  const rect = preview.getBoundingClientRect();
  return {
    x: ((e.clientX - rect.left) / rect.width) * preview.width,
    y: ((e.clientY - rect.top) / rect.height) * preview.height,
  };
}

let drag = null;

// ---------------------------------------------------------------- controls

function syncAll() {
  document.querySelectorAll('#layoutButtons button').forEach((b) => {
    b.classList.toggle('chosen', b.dataset.layout === state.layout);
  });
  const n = panelStates().length;
  const pb = $('panelButtons');
  pb.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const p = state.panels[i] ?? newPanel();
    const name = photos.get(p.photoId)?.name ?? 'empty';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `panelbtn${i === state.activePanel ? ' chosen' : ''}`;
    btn.dataset.panel = String(i);
    btn.innerHTML = `P${i + 1} <small>${name}</small>`;
    btn.addEventListener('click', () => {
      state.activePanel = i;
      syncAll();
    });
    pb.appendChild(btn);
  }
  const active = state.panels[state.activePanel] ?? newPanel();
  $('zoomRange').value = String(Math.round(active.zoom * 100));
  $('zoomValue').textContent = `${Math.round(active.zoom * 100)}%`;
  $('flipBtn').classList.toggle('chosen', Boolean(active.flip));
  $('captionInput').value = state.caption;
  $('subtitleInput').value = state.subtitle;
  $('captionSize').value = String(state.captionSize);
  document.querySelectorAll('#colorButtons .swatch').forEach((b) => {
    b.classList.toggle('chosen', b.dataset.captioncolor === state.captionColor);
  });
  document.querySelectorAll('#captionPos button').forEach((b) => {
    b.classList.toggle('chosen', b.dataset.captionpos === state.captionPos);
  });
  document.querySelectorAll('#gradeButtons .gradebtn').forEach((b) => {
    b.classList.toggle('chosen', b.dataset.grade === state.grade);
  });
  $('grainToggle').checked = state.grain;
  $('vignetteToggle').checked = state.vignette;
  renderThumbs();
}

function renderThumbs() {
  const box = $('photoThumbs');
  box.innerHTML = '';
  for (const [id, entry] of photos) {
    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'thumb';
    thumb.title = `Put ${entry.name} in the active panel`;
    const img = document.createElement('img');
    img.src = entry.img.src;
    img.alt = entry.name;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = entry.name;
    thumb.appendChild(img);
    thumb.appendChild(who);
    thumb.addEventListener('click', () => assignPhoto(id));
    box.appendChild(thumb);
  }
}

function setStatus(text) {
  $('status').textContent = text;
  clearTimeout(setStatus._t);
  setStatus._t = setTimeout(() => { $('status').textContent = ''; }, 4000);
}

function syncTabs() {
  const h = location.hash || '#editor';
  $('tabEditor').classList.toggle('active', h === '#editor' || h === '');
  $('tabExport').classList.toggle('active', h.startsWith('#export'));
}

// ---------------------------------------------------------------- persistence

const STORE_KEY = 'leonida-cover-lab.v1';

function saveState() {
  if (SHOT) return;
  try {
    const data = {
      size: state.size,
      layout: state.layout,
      panels: state.panels.map((p) => ({
        ...p,
        photoId: p.photoId && photos.get(p.photoId)?.sample ? p.photoId : null,
        flip: Boolean(p.flip),
      })),
      caption: state.caption,
      subtitle: state.subtitle,
      captionColor: state.captionColor,
      captionSize: state.captionSize,
      captionPos: state.captionPos,
      grade: state.grade,
      grain: state.grain,
      vignette: state.vignette,
      activePanel: state.activePanel,
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable - ignore */
  }
}

function loadState() {
  if (SHOT) return;
  let data = null;
  try { data = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null'); } catch { data = null; }
  if (!data) return;
  if (SIZES[data.size]) state.size = data.size;
  if (LAYOUTS[data.layout]) state.layout = data.layout;
  if (Array.isArray(data.panels)) {
    state.panels = data.panels.map((p) => ({
      photoId: photos.has(p?.photoId) ? p.photoId : null,
      zoom: clamp(Number(p?.zoom) || 1.2, 1, 3),
      ox: clamp(Number(p?.ox) || 0, -1, 1),
      oy: clamp(Number(p?.oy) || 0, -1, 1),
      flip: Boolean(p?.flip),
    }));
  }
  if (typeof data.caption === 'string') state.caption = data.caption;
  if (typeof data.subtitle === 'string') state.subtitle = data.subtitle;
  if (CAPTION_COLORS[data.captionColor]) state.captionColor = data.captionColor;
  if (Number.isFinite(data.captionSize)) state.captionSize = clamp(data.captionSize, 30, 100);
  if (['top', 'center', 'bottom'].includes(data.captionPos)) state.captionPos = data.captionPos;
  if (['vice', 'neon', 'dusk'].includes(data.grade)) state.grade = data.grade;
  state.grain = data.grain !== false;
  state.vignette = data.vignette !== false;
  state.activePanel = clamp(Number(data.activePanel) || 0, 0, 2);
}

// ---------------------------------------------------------------- screenshot staging

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') === '1';

/** ?shot=1: a finished cover, fully deterministic (no localStorage). */
function applyShotStaging() {
  const size = params.get('size') ?? 'landscape';
  state.size = SIZES[size] ? size : 'landscape';
  state.grain = true;
  state.vignette = true;
  state.captionSize = 62;
  state.captionPos = 'bottom';
  if (state.size === 'square') {
    state.layout = 'diag2';
    state.panels = [
      // Headroom defaults: both photos top-aligned (oy 1) so faces sit fully inside the
      // frame with space above; the zooms keep the subjects clear of the seam.
      { photoId: 'boardwalk', zoom: 1.6, ox: -0.75, oy: 1 },
      { photoId: 'cruiser', zoom: 1.25, ox: 1, oy: 1 },
    ];
    state.caption = 'LEONIDA NIGHTS';
    state.subtitle = 'SUNSET STATE OF MIND';
    state.captionColor = 'cyan';
    state.grade = 'neon';
  } else if (state.size === 'portrait') {
    state.layout = 'diag2';
    state.panels = [
      { photoId: 'cruiser', zoom: 1.32, ox: -0.35, oy: 1 },
      { photoId: 'boulevard', zoom: 1.35, ox: 0.95, oy: 1 },
    ];
    state.caption = 'VICE NEVER SLEEPS';
    state.subtitle = 'WELCOME TO LEONIDA';
    state.captionColor = 'white';
    state.grade = 'dusk';
  } else {
    state.layout = 'asym';
    state.panels = [
      { photoId: 'boulevard', zoom: 1.15, ox: -0.5, oy: 0.4 },
      { photoId: 'cruiser', zoom: 1.18, ox: -0.18, oy: 0.32 },
      { photoId: 'boardwalk', zoom: 1.18, ox: 0.1, oy: 0.45 },
    ];
    state.caption = 'WELCOME TO LEONIDA';
    state.subtitle = 'VICE NEVER SLEEPS';
    state.captionColor = 'white';
    state.grade = 'vice';
  }
  state.activePanel = 0;
}

// ---------------------------------------------------------------- wiring

function wireControls() {
  $('photoInput').addEventListener('change', async (e) => {
    for (const file of e.target.files ?? []) {
      const id = await addUploadedFile(file);
      assignPhoto(id);
    }
    e.target.value = '';
  });

  document.querySelectorAll('#layoutButtons button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.layout = btn.dataset.layout;
      state.activePanel = 0;
      syncAll();
      renderPreview();
      saveState();
    });
  });

  $('zoomRange').addEventListener('input', () => {
    const active = state.panels[state.activePanel] ?? (state.panels[state.activePanel] = newPanel());
    active.zoom = clamp(Number($('zoomRange').value) / 100, 1, 3);
    $('zoomValue').textContent = `${Math.round(active.zoom * 100)}%`;
    renderPreview();
    saveState();
  });

  $('flipBtn').addEventListener('click', () => {
    const active = state.panels[state.activePanel] ?? (state.panels[state.activePanel] = newPanel());
    active.flip = !active.flip;
    syncAll();
    renderPreview();
    saveState();
  });

  $('captionInput').addEventListener('input', () => {
    state.caption = $('captionInput').value;
    renderPreview();
    saveState();
  });
  $('subtitleInput').addEventListener('input', () => {
    state.subtitle = $('subtitleInput').value;
    renderPreview();
    saveState();
  });
  $('captionSize').addEventListener('input', () => {
    state.captionSize = Number($('captionSize').value);
    renderPreview();
    saveState();
  });

  document.querySelectorAll('#colorButtons .swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.captionColor = btn.dataset.captioncolor;
      syncAll();
      renderPreview();
      saveState();
    });
  });

  document.querySelectorAll('#captionPos button').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.captionPos = btn.dataset.captionpos;
      syncAll();
      renderPreview();
      saveState();
    });
  });

  document.querySelectorAll('#gradeButtons .gradebtn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.grade = btn.dataset.grade;
      syncAll();
      renderPreview();
      saveState();
    });
  });

  $('grainToggle').addEventListener('change', () => {
    state.grain = $('grainToggle').checked;
    renderPreview();
    saveState();
  });
  $('vignetteToggle').addEventListener('change', () => {
    state.vignette = $('vignetteToggle').checked;
    renderPreview();
    saveState();
  });

  document.querySelectorAll('.exportbtn').forEach((btn) => {
    btn.addEventListener('click', () => exportPNG(btn.dataset.size));
  });
  $('downloadAgain').addEventListener('click', () => exportPNG(state.size));
  $('backToEditor').addEventListener('click', () => { location.hash = '#editor'; });

  // drag to reposition a photo inside its panel; wheel zooms the active panel
  preview.addEventListener('pointerdown', (e) => {
    const pt = canvasPoint(e);
    const idx = hitTestPanel(pt.x / preview.width, pt.y / preview.height);
    if (idx >= 0) {
      state.activePanel = idx;
      syncAll();
    }
    drag = idx >= 0 ? { idx, last: pt } : null;
    if (drag) preview.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  preview.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const pt = canvasPoint(e);
    const p = state.panels[drag.idx] ?? (state.panels[drag.idx] = newPanel());
    const dir = p.flip ? -1 : 1; // dragging feels the same on a mirrored panel
    p.ox = clamp(p.ox + ((pt.x - drag.last.x) / preview.width) * 2.2 * dir / p.zoom, -1, 1);
    p.oy = clamp(p.oy + ((pt.y - drag.last.y) / preview.height) * 2.2 / p.zoom, -1, 1);
    drag.last = pt;
    renderPreview();
    saveState();
  });
  const endDrag = () => { drag = null; };
  preview.addEventListener('pointerup', endDrag);
  preview.addEventListener('pointercancel', endDrag);
  preview.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = state.panels[state.activePanel] ?? (state.panels[state.activePanel] = newPanel());
    p.zoom = clamp(p.zoom * (e.deltaY < 0 ? 1.09 : 0.92), 1, 3);
    $('zoomRange').value = String(Math.round(p.zoom * 100));
    $('zoomValue').textContent = `${Math.round(p.zoom * 100)}%`;
    renderPreview();
    saveState();
  }, { passive: false });

  window.addEventListener('hashchange', () => {
    syncTabs();
    route();
  });
}

// ---------------------------------------------------------------- routing

function route() {
  const h = location.hash || '#editor';
  if (h.startsWith('#export')) {
    if (h === '#export-square') state.size = 'square';
    else if (h === '#export-portrait') state.size = 'portrait';
    else if (h === '#export-landscape') state.size = 'landscape';
    showExportView();
  } else {
    showEditorView();
  }
}

// ---------------------------------------------------------------- init

async function init() {
  await Promise.all(['boulevard', 'pier', 'boardwalk', 'cruiser'].map(addSample));
  if (SHOT) {
    applyShotStaging();
  } else {
    loadState();
  }
  wireControls();
  syncAll();
  syncTabs();
  route();
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}

init();
