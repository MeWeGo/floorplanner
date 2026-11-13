#!/usr/bin/env node
'use strict';
/* ===================== Kat Planı Çizici — MCP Server =====================
   Zero-dependency Model Context Protocol server (stdio / JSON-RPC 2.0)
   for the Kat Planı Çizici / Floor Planner web app (../index.html).

   Lets AI agents (Claude Desktop, OpenCode, Cursor, ...) create and edit
   floor plans in the SAME JSON format the app imports / exports:

       agent: new_project → add_rect_walls → add_opening → ... → save_project
       user:  open the saved .json in the app (📂 Aç / File ▸ Open JSON)

   Conventions (mirrors app.js — keep in sync!):
   - All units are CENTIMETRES; the Y axis points DOWN (screen convention).
   - Wall { id, a:{x,y}, b:{x,y}, t, h, wt:'solid'|'curtain'|'railing'|'fence', mul?:cm, mulN?:n (curtain mullions), rs?:'bars'|'glass'|'cable'|'solid' (railing style), color?:'#hex' }.
   - Openings are parametric on a wall: d = distance from the wall's "a" end
     to the opening CENTRE (cm). Deleting a wall deletes its openings.
   - Furniture comes from the catalogue (see CATALOG below).
   - IDs are 7-char random strings; unique across all kinds.

   The CATALOG / OPENINGS / ROOMCOL blocks mirror app.js constants.
   When you change them there, change them here too.

   Run:      node mcp/server.js
   Requires: Node.js >= 16. No npm packages, no build step.
   ======================================================================== */

const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');

const SERVER_NAME = 'floorplanner';
const SERVER_VERSION = '1.0.0';

/* ---------- Catalogue (mirror of CAT_DEFS / OPENINGS / ROOMCOL in app.js) ---------- */
const CATS = ['Living', 'Bedroom', 'Kitchen', 'Bathroom', 'Office', 'Structure & Outdoor'];
const CATALOG = [
  { id: 'sofa3', cat: 0, name: '3 Kişilik Koltuk', en: '3-Seat Sofa', w: 210, d: 90, h: 85, icon: '🛋️', k: 'sofa', color: '#a5b4fc' },
  { id: 'sofa2', cat: 0, name: '2 Kişilik Koltuk', en: '2-Seat Sofa', w: 160, d: 90, h: 85, icon: '🛋️', k: 'sofa', color: '#a5b4fc' },
  { id: 'armchair', cat: 0, name: 'Berjer', en: 'Armchair', w: 85, d: 85, h: 85, icon: '💺', k: 'sofa', color: '#c4b5fd' },
  { id: 'coffee', cat: 0, name: 'Orta Sehpa', en: 'Coffee Table', w: 100, d: 55, h: 40, icon: '▭', k: 'rect', color: '#d6b88f' },
  { id: 'billiard', cat: 0, name: 'Bilardo Masası', en: 'Billiards Table', w: 280, d: 155, h: 85, icon: '🎱', k: 'rect', color: '#5b3a24' },
  { id: 'tv', cat: 0, name: 'TV Ünitesi', en: 'TV Unit', w: 180, d: 40, h: 50, icon: '📺', k: 'rect', color: '#9ca3af' },
  { id: 'table4', cat: 0, name: '4 Kişilik Masa', en: '4-Seat Table', w: 140, d: 80, h: 75, icon: '🍽️', k: 'rect', color: '#d6b88f' },
  { id: 'table6', cat: 0, name: '6 Kişilik Masa', en: '6-Seat Table', w: 180, d: 90, h: 75, icon: '🍽️', k: 'rect', color: '#d6b88f' },
  { id: 'tableR', cat: 0, name: 'Yuvarlak Masa', en: 'Round Table', w: 110, d: 110, h: 75, icon: '⭕', k: 'round', color: '#d6b88f' },
  { id: 'chair', cat: 0, name: 'Sandalye', en: 'Chair', w: 45, d: 45, h: 45, icon: '🪑', k: 'rect', color: '#e5c9a0' },
  { id: 'bookcase', cat: 0, name: 'Kitaplık', en: 'Bookcase', w: 100, d: 35, h: 200, icon: '📚', k: 'rect', color: '#b08968' },
  { id: 'rug', cat: 0, name: 'Halı', en: 'Rug', w: 200, d: 140, h: 2, icon: '▦', k: 'rect', color: '#fca5a5' },
  { id: 'plant', cat: 0, name: 'Bitki', en: 'Plant', w: 40, d: 40, h: 90, icon: '🪴', k: 'round', color: '#86efac' },
  { id: 'bed2', cat: 1, name: 'Çift Kişilik Yatak', en: 'Double Bed', w: 160, d: 200, h: 50, icon: '🛏️', k: 'bed', color: '#fde68a' },
  { id: 'bed1', cat: 1, name: 'Tek Kişilik Yatak', en: 'Single Bed', w: 100, d: 200, h: 50, icon: '🛏️', k: 'bed', color: '#fde68a' },
  { id: 'bedK', cat: 1, name: 'King Yatak', en: 'King Bed', w: 180, d: 200, h: 50, icon: '🛏️', k: 'bed', color: '#fde68a' },
  { id: 'bunk', cat: 1, name: 'Ranza', en: 'Bunk Bed', w: 100, d: 200, h: 160, icon: '🛏️', k: 'bed', color: '#fdba74' },
  { id: 'crib', cat: 1, name: 'Bebek Yatağı', en: 'Crib', w: 70, d: 130, h: 90, icon: '🍼', k: 'rect', color: '#fbcfe8' },
  { id: 'night', cat: 1, name: 'Komodin', en: 'Nightstand', w: 45, d: 40, h: 50, icon: '▫', k: 'rect', color: '#d6b88f' },
  { id: 'wardrobe', cat: 1, name: 'Gardrop', en: 'Wardrobe', w: 200, d: 60, h: 220, icon: '🚪', k: 'rect', color: '#b08968' },
  { id: 'dresser', cat: 1, name: 'Şifonyer', en: 'Dresser', w: 120, d: 45, h: 90, icon: '🗄️', k: 'rect', color: '#b08968' },
  { id: 'vanity', cat: 1, name: 'Makyaj Masası', en: 'Vanity Table', w: 100, d: 45, h: 75, icon: '🪞', k: 'rect', color: '#d6b88f' },
  { id: 'fridge', cat: 2, name: 'Buzdolabı', en: 'Refrigerator', w: 70, d: 70, h: 180, icon: '🧊', k: 'rect', color: '#cbd5e1' },
  { id: 'stove', cat: 2, name: 'Ocak / Fırın', en: 'Stove / Oven', w: 60, d: 60, h: 90, icon: '🔥', k: 'rect', color: '#94a3b8' },
  { id: 'sinkK', cat: 2, name: 'Evye', en: 'Kitchen Sink', w: 120, d: 60, h: 90, icon: '🚰', k: 'rect', color: '#cbd5e1' },
  { id: 'dish', cat: 2, name: 'Bulaşık Mak.', en: 'Dishwasher', w: 60, d: 60, h: 90, icon: '🍽', k: 'rect', color: '#cbd5e1' },
  { id: 'counter', cat: 2, name: 'Tezgâh 120', en: 'Counter 120', w: 120, d: 60, h: 90, icon: '▭', k: 'rect', color: '#e2e8f0' },
  { id: 'counter2', cat: 2, name: 'Tezgâh 60', en: 'Counter 60', w: 60, d: 60, h: 90, icon: '▭', k: 'rect', color: '#e2e8f0' },
  { id: 'island', cat: 2, name: 'Ada Tezgâh', en: 'Kitchen Island', w: 180, d: 90, h: 90, icon: '▭', k: 'rect', color: '#e2e8f0' },
  { id: 'wm', cat: 2, name: 'Çamaşır Mak.', en: 'Washing Machine', w: 60, d: 60, h: 85, icon: '🧺', k: 'rect', color: '#cbd5e1' },
  { id: 'wc', cat: 3, name: 'Klozet', en: 'Toilet', w: 40, d: 70, h: 40, icon: '🚽', k: 'rect', color: '#f1f5f9' },
  { id: 'basin', cat: 3, name: 'Lavabo', en: 'Washbasin', w: 60, d: 45, h: 85, icon: '🚰', k: 'rect', color: '#f1f5f9' },
  { id: 'basin2', cat: 3, name: 'Çift Lavabo', en: 'Double Washbasin', w: 120, d: 50, h: 85, icon: '🚰', k: 'rect', color: '#f1f5f9' },
  { id: 'shower', cat: 3, name: 'Duş Teknesi', en: 'Shower', w: 90, d: 90, h: 200, icon: '🚿', k: 'rect', color: '#bae6fd' },
  { id: 'tub', cat: 3, name: 'Küvet', en: 'Bathtub', w: 170, d: 75, h: 55, icon: '🛁', k: 'rect', color: '#bae6fd' },
  { id: 'bidet', cat: 3, name: 'Bide', en: 'Bidet', w: 40, d: 55, h: 40, icon: '🚽', k: 'rect', color: '#f1f5f9' },
  { id: 'desk', cat: 4, name: 'Çalışma Masası', en: 'Office Desk', w: 140, d: 70, h: 75, icon: '🖥️', k: 'rect', color: '#d6b88f' },
  { id: 'deskL', cat: 4, name: 'L Masa', en: 'L-Shaped Desk', w: 180, d: 140, h: 75, icon: '🖥️', k: 'rect', color: '#d6b88f' },
  { id: 'ochair', cat: 4, name: 'Ofis Koltuğu', en: 'Office Chair', w: 60, d: 60, h: 100, icon: '💺', k: 'round', color: '#94a3b8' },
  { id: 'meet', cat: 4, name: 'Toplantı Masası', en: 'Meeting Table', w: 300, d: 110, h: 75, icon: '🗣️', k: 'rect', color: '#d6b88f' },
  { id: 'shelf', cat: 4, name: 'Raf Ünitesi', en: 'Shelving Unit', w: 120, d: 35, h: 180, icon: '📚', k: 'rect', color: '#b08968' },
  { id: 'printer', cat: 4, name: 'Yazıcı', en: 'Printer', w: 50, d: 45, h: 40, icon: '🖨️', k: 'rect', color: '#cbd5e1' },
  { id: 'stairs', cat: 5, name: 'Merdiven', en: 'Stairs', w: 100, d: 300, h: 270, icon: '🪜', k: 'stairs', color: '#e2e8f0' },
  { id: 'ramp', cat: 5, name: 'Rampa', en: 'Ramp', w: 120, d: 500, h: 35, icon: '♿', k: 'ramp', color: '#cbd5e1' },
  { id: 'column', cat: 5, name: 'Kolon', en: 'Round Column', w: 40, d: 40, h: 270, icon: '', k: 'round', color: '#64748b' },
  { id: 'colSq', cat: 5, name: 'Kare Kolon', en: 'Square Column', w: 40, d: 40, h: 270, icon: '', k: 'rect', color: '#64748b' },
  { id: 'car', cat: 5, name: 'Araba', en: 'Car', w: 180, d: 450, h: 150, icon: '🚗', k: 'rect', color: '#fca5a5' },
  { id: 'table_o', cat: 5, name: 'Bahçe Masası', en: 'Patio Table', w: 120, d: 80, h: 75, icon: '⛱️', k: 'rect', color: '#d6b88f' },
  { id: 'tree', cat: 5, name: 'Ağaç', en: 'Tree', w: 200, d: 200, h: 400, icon: '🌳', k: 'round', color: '#86efac' },
  { id: 'pool', cat: 5, name: 'Havuz', en: 'Swimming Pool', w: 400, d: 800, h: 5, icon: '🏊', k: 'rect', color: '#7dd3fc' },
  { id: 'fireplace', cat: 5, name: 'Şömine', en: 'Fireplace', w: 120, d: 40, h: 120, icon: '🔥', k: 'rect', color: '#94a3b8' },
  { id: 'tvw', cat: 0, name: 'Duvar TV', en: 'Wall TV', w: 140, d: 6, h: 80, icon: '📺', k: 'rect', color: '#111827' },
  { id: 'art', cat: 0, name: 'Tablo', en: 'Wall Art', w: 80, d: 3, h: 60, icon: '🖼️', k: 'rect', color: '#8a6a4f' },
  { id: 'shelfW', cat: 0, name: 'Duvar Rafı', en: 'Wall Shelf', w: 100, d: 25, h: 4, icon: '▭', k: 'rect', color: '#b08968' },
  { id: 'ac', cat: 0, name: 'Klima', en: 'Air Conditioner', w: 90, d: 25, h: 30, icon: '❄️', k: 'rect', color: '#f8fafc' },
  { id: 'cabU', cat: 2, name: 'Üst Dolap', en: 'Wall Cabinet', w: 80, d: 35, h: 70, icon: '🗄️', k: 'rect', color: '#e2e8f0' },
  { id: 'wmirror', cat: 3, name: 'Ayna', en: 'Mirror', w: 60, d: 3, h: 90, icon: '🪞', k: 'rect', color: '#cbd5e1' },
];
const BYID = Object.fromEntries(CATALOG.map(c => [c.id, c]));
// height above the floor (cm) that wall-mounted catalogue items get by default — mirror of app.js CAT_ELEV (#61)
const CAT_ELEV = { tvw: 80, art: 120, shelfW: 150, ac: 220, cabU: 145, wmirror: 110 };
const FURN_ELEV_MAX = 500, WALL_ELEV_MAX = 500; // duvar taban kotu (app.js wallElev ile aynı aralık)
const OPENINGS = [
  { id: 'door', name: 'Kapı', en: 'Door', w: 90, h: 210, sill: 0 },
  { id: 'double', name: 'Çift Kanatlı Kapı', en: 'Double Door', w: 160, h: 210, sill: 0 },
  { id: 'slide', name: 'Sürgülü Kapı', en: 'Sliding Door', w: 180, h: 210, sill: 0 },
  { id: 'arch', name: 'Açıklık / Kemer', en: 'Archway / Opening', w: 120, h: 210, sill: 0 },
  { id: 'window', name: 'Pencere', en: 'Window', w: 120, h: 120, sill: 90 },
  { id: 'window2', name: 'Geniş Pencere', en: 'Wide Window', w: 200, h: 140, sill: 70 },
  { id: 'wsmall', name: 'Küçük Pencere', en: 'Small Window', w: 60, h: 60, sill: 130 },
];
const OPDEF = Object.fromEntries(OPENINGS.map(o => [o.id, o]));
const ROOMCOL = ['#bfdbfe', '#fde68a', '#bbf7d0', '#fecaca', '#e9d5ff', '#fed7aa', '#a5f3fc', '#fbcfe8'];
const FLOORPATS = ['none', 'wood', 'tile', 'carpet', 'marble', 'concrete', 'stone', 'grass', 'water', 'gravel', 'deck', 'asphalt', 'glass']; // + 'tex:<id>' custom textures (#40)
// a finish is a built-in pattern or "tex:<id>" of a texture listed in project.textures (image data lives in the browser)
const finishOk = v => FLOORPATS.includes(v) || (typeof v === 'string' && /^tex:/.test(v) && ((P && P.textures) || []).some(t => 'tex:' + t.id === v));
/* TEXGEN:BEGIN — procedural floor textures. Pure JS (no DOM, no globals), pasted VERBATIM into
   app.js and mcp/server.js; tests/texture-gen.test.js fails if the two copies differ.
   texGen(spec) → { svg, w, h, name, spec }: a seamless SVG tile whose viewBox is in cm, so one
   repeat is exactly w × h cm (that is what P.textures[].w / .h store). texGenUrl(svg) → data: URL. */
const TEXGEN_PATTERNS = {
  tile: ['Karo', 'Tiles'], brick: ['Tuğla', 'Brick'], plank: ['Parke / tahta', 'Planks'], basket: ['Hasır örgü parke', 'Basket weave'],
  hex: ['Altıgen karo', 'Hex tiles'], checker: ['Dama', 'Checkerboard'], terrazzo: ['Terrazzo', 'Terrazzo'], stripe: ['Çizgili', 'Stripes'],
};
// w × h = one unit (tile, brick, plank) in cm; joint = grout / mortar / seam width in cm
const TEXGEN_DEF = {
  tile: { w: 60, h: 60, joint: 0.4, color: '#e7e5e4', color2: '#a8a29e' },
  brick: { w: 24, h: 7, joint: 1, color: '#b45309', color2: '#d6d3d1' },
  plank: { w: 120, h: 18, joint: 0.3, color: '#b08968', color2: '#6b4a2e' },
  basket: { w: 30, h: 10, joint: 0.3, color: '#c8a27a', color2: '#6b4a2e' },
  hex: { w: 20, h: 20, joint: 0.4, color: '#f5f5f4', color2: '#78716c' },
  checker: { w: 40, h: 40, joint: 0, color: '#f5f5f4', color2: '#292524' },
  terrazzo: { w: 60, h: 60, joint: 0, color: '#e7e5e4', color2: '#57534e' },
  stripe: { w: 100, h: 10, joint: 0, color: '#e2e8f0', color2: '#94a3b8' },
};
const texgenHex = (c, d) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase()
  : typeof c === 'string' && /^#[0-9a-f]{3}$/i.test(c) ? ('#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]).toLowerCase() : d;
function texgenMix(a, b, t) {
  const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)), A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
const texgenShade = (c, k) => k >= 0 ? texgenMix(c, '#ffffff', Math.min(1, k)) : texgenMix(c, '#000000', Math.min(1, -k));
function texgenRng(seed) { // mulberry32: same seed → same texture in the app and in the MCP server
  let a = (seed >>> 0) || 1;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function texGenClean(spec) {
  const s = spec && typeof spec === 'object' ? spec : {};
  const pattern = TEXGEN_PATTERNS[s.pattern] ? s.pattern : 'tile', d = TEXGEN_DEF[pattern];
  const num = (v, def, lo, hi) => { const n = +v; return Number.isFinite(n) && v !== '' && v != null ? Math.min(hi, Math.max(lo, n)) : def; };
  const w = num(s.w, d.w, 1, 500), h = num(s.h, d.h, 1, 500);
  return {
    pattern, w, h,
    joint: num(s.joint, d.joint, 0, Math.min(w, h) / 3),
    color: texgenHex(s.color, d.color), color2: texgenHex(s.color2, d.color2),
    vary: num(s.vary, 0.12, 0, 0.6),
    seed: Math.round(num(s.seed, 1, 0, 999999)),
    name: typeof s.name === 'string' ? s.name.trim().slice(0, 60) : '',
  };
}
function texGen(spec) {
  const s = texGenClean(spec), { pattern, w, h, joint: j, color, color2, vary } = s, rnd = texgenRng(s.seed + 7);
  const f = v => +v.toFixed(3), vc = () => texgenShade(color, (rnd() * 2 - 1) * vary);
  let W, H, out = '';
  const rect = (x, y, rw, rh, fill, op) => { if (rw > 0 && rh > 0) out += `<rect x="${f(x)}" y="${f(y)}" width="${f(rw)}" height="${f(rh)}" fill="${fill}"${op ? ` opacity="${op}"` : ''}/>`; };
  // a unit that crosses the right / bottom edge is drawn again one period earlier, so the tile is seamless
  const wrapRect = (x, y, rw, rh, fill, op) => {
    for (const dx of x + rw > W + 1e-6 ? [0, -W] : [0]) for (const dy of y + rh > H + 1e-6 ? [0, -H] : [0]) rect(x + dx, y + dy, rw, rh, fill, op);
  };
  const unit = (x, y, uw, uh, fill) => wrapRect(x + j / 2, y + j / 2, uw - j, uh - j, fill);
  const grain = (x, y, uw, uh, fill, along) => { // a few thin darker lines along the board
    const n = 2 + Math.floor(rnd() * 2), gc = texgenShade(fill, -0.14);
    for (let i = 0; i < n; i++) {
      const t = 0.2 + rnd() * 0.6, len = 0.35 + rnd() * 0.55, st = rnd() * (1 - len);
      if (along === 'x') wrapRect(x + j / 2 + (uw - j) * st, y + j / 2 + (uh - j) * t, (uw - j) * len, Math.max(0.08, (uh - j) * 0.02), gc, 0.55);
      else wrapRect(x + j / 2 + (uw - j) * t, y + j / 2 + (uh - j) * st, Math.max(0.08, (uw - j) * 0.02), (uh - j) * len, gc, 0.55);
    }
  };
  if (pattern === 'tile' || pattern === 'checker') {
    W = 4 * w; H = 4 * h; rect(0, 0, W, H, j > 0 ? color2 : color);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const base = pattern === 'checker' && (r + c) % 2 ? color2 : color;
      const fill = pattern === 'checker' ? texgenShade(base, (rnd() * 2 - 1) * vary * 0.5) : vc();
      if (j > 0) unit(c * w, r * h, w, h, fill); else rect(c * w, r * h, w, h, fill);
    }
  } else if (pattern === 'brick' || pattern === 'plank') {
    const cols = pattern === 'brick' ? 4 : 2, offs = pattern === 'brick' ? [0, 0.5, 0, 0.5] : [0, 0.5, 0.25, 0.75];
    W = cols * w; H = 4 * h; rect(0, 0, W, H, color2);
    for (let r = 0; r < 4; r++) for (let c = 0; c < cols; c++) {
      const x = c * w + offs[r] * w, fill = vc();
      unit(x, r * h, w, h, fill);
      if (pattern === 'plank') grain(x, r * h, w, h, fill, 'x');
    }
  } else if (pattern === 'basket') {
    const n = Math.max(2, Math.round(w / h)), B = n * h; W = H = 2 * B; rect(0, 0, W, H, color2);
    for (let bi = 0; bi < 2; bi++) for (let bj = 0; bj < 2; bj++) for (let k = 0; k < n; k++) {
      const fill = vc(), bx = bi * B, by = bj * B;
      if ((bi + bj) % 2 === 0) { unit(bx, by + k * h, B, h, fill); grain(bx, by + k * h, B, h, fill, 'x'); }
      else { unit(bx + k * h, by, h, B, fill); grain(bx + k * h, by, h, B, fill, 'y'); }
    }
  } else if (pattern === 'hex') {
    // pointy-top hexagons, w = across the flats; period w × √3·w
    const sd = w / Math.sqrt(3), r0 = Math.max(0.01, sd - j / Math.sqrt(3)); W = w; H = 3 * sd; rect(0, 0, W, H, j > 0 ? color2 : color);
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H], [W / 2, 1.5 * sd]]) {
      const pts = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; pts.push(f(cx + r0 * Math.cos(a)) + ',' + f(cy + r0 * Math.sin(a))); }
      out += `<polygon points="${pts.join(' ')}" fill="${vc()}"/>`;
    }
  } else if (pattern === 'terrazzo') {
    W = w; H = h; rect(0, 0, W, H, color);
    const cols = [color2, texgenMix(color2, color, 0.5), texgenShade(color, -0.25), texgenShade(color, 0.6)];
    const n = Math.min(500, Math.round(W * H / 30));
    for (let i = 0; i < n; i++) {
      const cx = rnd() * W, cy = rnd() * H, r = 0.4 + rnd() * rnd() * 2.2, k = 3 + Math.floor(rnd() * 3), a0 = rnd() * 6.283, fill = cols[Math.floor(rnd() * cols.length)];
      const ring = []; for (let q = 0; q < k; q++) { const a = a0 + q * 6.283 / k + (rnd() - 0.5) * 0.8, rr = r * (0.6 + rnd() * 0.4); ring.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      for (const dx of cx + r > W ? [0, -W] : [0]) for (const dy of cy + r > H ? [0, -H] : [0])
        out += `<polygon points="${ring.map(p => f(cx + dx + p[0]) + ',' + f(cy + dy + p[1])).join(' ')}" fill="${fill}"/>`;
    }
  } else { // stripe: bands of height h, alternating colour / colour 2
    W = w; H = 4 * h;
    for (let r = 0; r < 4; r++) rect(0, r * h, W, h, texgenShade(r % 2 ? color2 : color, (rnd() * 2 - 1) * vary * 0.4));
  }
  const k = Math.min(16, 1024 / Math.max(W, H)), px = Math.max(1, Math.round(W * k)), py = Math.max(1, Math.round(H * k));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${py}" viewBox="0 0 ${f(W)} ${f(H)}" preserveAspectRatio="none">${out}</svg>`;
  const nm = s.name || (TEXGEN_PATTERNS[pattern][1] + ' ' + (pattern === 'hex' ? f(w) : f(w) + '×' + f(h)));
  return { svg, w: f(W), h: f(H), name: nm, spec: s };
}
const texGenUrl = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
/* TEXGEN:END */
const FINISH_DOC = FLOORPATS.join(' | ') + ' | "tex:<id>" (a custom texture from project.textures)';
// door material / colours (#41), mirrors DOOR_MATS in app.js
const DOOR_MATS = ['wood', 'glass', 'paneled', 'metal'];
const KINDS = { walls: 'wall', ops: 'op', furn: 'furn', rooms: 'room', slabs: 'slab', voids: 'void', sections: 'section', dims: 'dim', texts: 'text', sketches: 'sketch', drafts: 'draft' };

/* ---------- Small helpers (mirror app.js) ---------- */
const uid = () => Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const wLen = w => dist(w.a, w.b);
const opType = id => (id.startsWith('window') || id === 'wsmall') ? 'window' : id;
const fmtArea = c2 => (c2 / 10000).toFixed(2) + ' m²';
const fmtLen = cm => (cm / 100).toFixed(2) + ' m';
function polyArea(pts) { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y); return Math.abs(a / 2); }
function polyPerim(pts) { let p = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) p += dist(pts[j], pts[i]); return p; }

function num(v, def, name) {
  if (v === undefined || v === null || v === '') {
    if (def !== undefined) return def;
    throw new Error(name + ' is required');
  }
  const n = +v;
  if (!Number.isFinite(n)) throw new Error(name + ' must be a number, got: ' + JSON.stringify(v));
  return n;
}
function parsePts(v, min, name) {
  if (!Array.isArray(v) || v.length < min) throw new Error(name + ' must be an array of at least ' + min + ' {x,y} points');
  return v.map((p, i) => ({ x: num(p && p.x, undefined, name + '[' + i + '].x'), y: num(p && p.y, undefined, name + '[' + i + '].y') }));
}

/* PARTS-ENGINE:BEGIN ---------- Çok parçalı mobilya (programlanabilir mobilya, şema v1) ----------
   This block is copied VERBATIM into app.js and mcp/server.js (tests/furniture-parts.test.js compares them).
   A furniture item may carry   parts: [{ name?, type, x, y, z, w, d, h, rot?, color?, mat?, axis?, pts?, gid? }]
   plus pbase: { w, d, h } (the design box the parts were drawn in) and partsV (schema version).
   - Local cm, centre of the item = (0, 0), y points down like the plan, z = BOTTOM elevation above the floor.
   - type: box | cyl | sphere | extrude. cyl stands upright (axis z) unless axis is 'x' or 'y' (lying);
     its w × d × h is always the bounding box. extrude = pts polygon (cm, relative to x, y) lifted h from z.
   - rot = degrees clockwise on the plan, like furniture rot. mat: matte (default) | gloss | metal | glass.
   - rx / ry = optional tilt in degrees about the part's own x / y axis (all-axis rotation). The part turns about its
     centre (x, y, z + h/2) as R = Rz(rot) · Ry(ry) · Rx(rx): first rx, then ry, then rot. Absent = 0 (upright).
   - gid = optional group id (1–16 letters / digits / _ / -). Parts with the same gid form a group in the furniture
     studio (select / move / rotate together); rendering ignores it, so grouping never changes the model.
   - When the item is resized (w / d / h ≠ pbase) the parts scale with it; old items without parts are untouched. */
const PARTS_V = 1;
const PART_TYPES = ['box', 'cyl', 'sphere', 'extrude'];
const PART_ALIAS = Object.assign(Object.create(null), { box: 'box', cube: 'box', cyl: 'cyl', cylinder: 'cyl', sphere: 'sphere', sph: 'sphere', ball: 'sphere', extrude: 'extrude', prism: 'extrude' }); // no prototype keys ("constructor")
const PART_MATS = ['matte', 'gloss', 'metal', 'glass'];
const PARTS_MAX = 64, PARTS_SOFT = 40;
// small helpers kept inside the block on purpose (instead of the app's rnd / clamp) so it can be pasted verbatim into mcp/server.js
const partFin = v => v !== null && v !== undefined && v !== '' && typeof v !== 'boolean' && Number.isFinite(+v);
const partHex = c => typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);
const partR = v => Math.round(v * 100) / 100;
function partPts(v) {
  if (!Array.isArray(v) || v.length < 3) return null;
  const pts = v.map(q => q && partFin(q.x) && partFin(q.y) ? { x: partR(+q.x), y: partR(+q.y) } : null);
  return pts.every(Boolean) ? pts : null;
}
// lenient: any input → a valid part (used when loading projects; bad fields fall back to defaults)
function cleanPart(p) {
  p = p && typeof p === 'object' ? p : {};
  const n = (v, d) => partFin(v) ? partR(+v) : d;
  let type = PART_ALIAS[String(p.type === undefined ? 'box' : p.type).toLowerCase()] || 'box';
  const pts = type === 'extrude' ? partPts(p.pts) : null;
  if (type === 'extrude' && !pts) type = 'box';
  const q = { type };
  if (p.name) q.name = String(p.name).slice(0, 40);
  if (typeof p.gid === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(p.gid)) q.gid = p.gid;
  q.x = n(p.x, 0); q.y = n(p.y, 0); q.z = n(p.z, 0);
  if (pts) {
    const xs = pts.map(a => a.x), ys = pts.map(a => a.y);
    q.w = partR(Math.max(...xs) - Math.min(...xs)) || 0.1; q.d = partR(Math.max(...ys) - Math.min(...ys)) || 0.1; q.pts = pts;
  } else { q.w = Math.max(0.1, Math.abs(n(p.w, 10))); q.d = Math.max(0.1, Math.abs(n(p.d, 10))); }
  q.h = Math.max(0.1, Math.abs(n(p.h, 10)));
  const r = n(p.rot, 0); if (r) q.rot = partR(((r % 360) + 360) % 360);
  for (const k of ['rx', 'ry']) { const t = partR(((n(p[k], 0) % 360) + 360) % 360); if (t && t !== 360) q[k] = t; }
  if (partHex(p.color)) q.color = p.color;
  if (PART_MATS.includes(p.mat) && p.mat !== 'matte') q.mat = p.mat;
  if (type === 'cyl' && (p.axis === 'x' || p.axis === 'y')) q.axis = p.axis;
  return q;
}
// all-axis rotation: 3 × 3 matrix (rows) of R = Rz(rz) · Ry(ry) · Rx(rx) in the plan frame (x right, y down, z up), degrees
function partRotM(rx, ry, rz) {
  const r = Math.PI / 180, A = (rx || 0) * r, B = (ry || 0) * r, G = (rz || 0) * r;
  const ca = Math.cos(A), sa = Math.sin(A), cb = Math.cos(B), sb = Math.sin(B), cg = Math.cos(G), sg = Math.sin(G);
  const m = [[cb, sb * sa, sb * ca], [0, ca, -sa], [-sb, cb * sa, cb * ca]]; // Ry · Rx
  return [[cg * m[0][0] - sg * m[1][0], cg * m[0][1] - sg * m[1][1], cg * m[0][2] - sg * m[1][2]],
    [sg * m[0][0] + cg * m[1][0], sg * m[0][1] + cg * m[1][1], sg * m[0][2] + cg * m[1][2]], m[2]];
}
const partTilted = q => !!(q && (+q.rx || +q.ry));
// sample points of a CLEAN part's surface in item-local cm ([x, y, z]); exact corners for boxes / extrusions, 24-gons for round shapes
function partCloud(q) {
  const M = partRotM(q.rx, q.ry, q.rot), hw = q.w / 2, hd = q.d / 2, hh = q.h / 2, loc = [], N = 24;
  if (q.type === 'extrude' && q.pts) for (const p of q.pts) loc.push([p.x, p.y, -hh], [p.x, p.y, hh]);
  else if (q.type === 'box') for (const x of [-hw, hw]) for (const y of [-hd, hd]) for (const z of [-hh, hh]) loc.push([x, y, z]);
  else for (let i = 0; i < N; i++) {
    const c = Math.cos(i * 2 * Math.PI / N), s = Math.sin(i * 2 * Math.PI / N);
    if (q.type === 'sphere') for (const t of [-60, -30, 0, 30, 60]) { const ct = Math.cos(t * Math.PI / 180), st = Math.sin(t * Math.PI / 180); loc.push([hw * c * ct, hd * s * ct, hh * st]); }
    else if (q.axis === 'x') loc.push([-hw, hd * c, hh * s], [hw, hd * c, hh * s]);
    else if (q.axis === 'y') loc.push([hw * c, -hd, hh * s], [hw * c, hd, hh * s]);
    else loc.push([hw * c, hd * s, -hh], [hw * c, hd * s, hh]);
  }
  if (q.type === 'sphere') loc.push([0, 0, -hh], [0, 0, hh]);
  return loc.map(([x, y, z]) => [q.x + M[0][0] * x + M[0][1] * y + M[0][2] * z, q.y + M[1][0] * x + M[1][1] * y + M[1][2] * z, q.z + hh + M[2][0] * x + M[2][1] * y + M[2][2] * z]);
}
// convex hull of 2D points [[u, v], …] (monotone chain), counter-clockwise
function partHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// footprint + height range of a CLEAN part in item-local cm: { x0, x1, y0, y1, z0, z1 }
function partBounds(q) {
  if (partTilted(q)) {
    if (q.type === 'sphere') { // exact extents of the turned ellipsoid
      const M = partRotM(q.rx, q.ry, q.rot), ax = [q.w / 2, q.d / 2, q.h / 2], e = M.map(r => Math.hypot(r[0] * ax[0], r[1] * ax[1], r[2] * ax[2]));
      return { x0: q.x - e[0], x1: q.x + e[0], y0: q.y - e[1], y1: q.y + e[1], z0: q.z + ax[2] - e[2], z1: q.z + ax[2] + e[2] };
    }
    const c = partCloud(q), col = i => c.map(p => p[i]);
    return { x0: Math.min(...col(0)), x1: Math.max(...col(0)), y0: Math.min(...col(1)), y1: Math.max(...col(1)), z0: Math.min(...col(2)), z1: Math.max(...col(2)) };
  }
  const a = (q.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  if (q.type === 'sphere' || (q.type === 'cyl' && !q.axis)) { // round footprint: exact extents of the rotated ellipse
    const ex = Math.hypot(q.w / 2 * c, q.d / 2 * s), ey = Math.hypot(q.w / 2 * s, q.d / 2 * c);
    return { x0: q.x - ex, x1: q.x + ex, y0: q.y - ey, y1: q.y + ey, z0: q.z, z1: q.z + q.h };
  }
  const loc = q.pts || [{ x: -q.w / 2, y: -q.d / 2 }, { x: q.w / 2, y: -q.d / 2 }, { x: q.w / 2, y: q.d / 2 }, { x: -q.w / 2, y: q.d / 2 }];
  const pts = loc.map(p => ({ x: q.x + p.x * c - p.y * s, y: q.y + p.x * s + p.y * c }));
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), z0: q.z, z1: q.z + q.h };
}
// strict: problems with a RAW part (empty list = valid). base = the design box { w, d, h }
function partIssues(p, base) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return ['part must be an object'];
  const e = [], t = PART_ALIAS[String(p.type === undefined ? 'box' : p.type).toLowerCase()];
  if (!t) e.push('type "' + p.type + '" is not one of ' + PART_TYPES.join(', '));
  for (const k of ['x', 'y', 'z', 'rot', 'rx', 'ry']) if (p[k] !== undefined && p[k] !== null && !partFin(p[k])) e.push(k + ' must be a number');
  if (t === 'extrude') {
    if (!partPts(p.pts)) e.push('extrude needs pts: 3+ {x, y} points in cm, relative to the part centre');
    if (!(partFin(p.h) && +p.h > 0)) e.push('h must be a number > 0');
  } else for (const k of ['w', 'd', 'h']) if (!(partFin(p[k]) && +p[k] > 0)) e.push(k + ' must be a number > 0');
  if (p.color !== undefined && p.color !== null && !partHex(p.color)) e.push('color must be #rgb or #rrggbb');
  if (p.mat !== undefined && p.mat !== null && !PART_MATS.includes(p.mat)) e.push('mat must be one of ' + PART_MATS.join(', '));
  if (p.axis !== undefined && p.axis !== null && !['x', 'y', 'z'].includes(p.axis)) e.push('axis must be x, y or z');
  if (p.gid !== undefined && p.gid !== null && !(typeof p.gid === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(p.gid))) e.push('gid must be 1-16 letters, digits, _ or -');
  if (!e.length && base) {
    const b = partBounds(cleanPart(p)), tol = 1;
    if (b.x0 < -base.w / 2 - tol || b.x1 > base.w / 2 + tol || b.y0 < -base.d / 2 - tol || b.y1 > base.d / 2 + tol)
      e.push('sticks out of the ' + base.w + ' × ' + base.d + ' cm footprint (x ' + partR(b.x0) + '…' + partR(b.x1) + ', y ' + partR(b.y0) + '…' + partR(b.y1) + '; the item spans x ±' + base.w / 2 + ', y ±' + base.d / 2 + ')');
    if (b.z0 < -tol) e.push('starts below the floor (z ' + partR(b.z0) + ' < 0)');
    if (b.z1 > base.h + tol) e.push('top at ' + partR(b.z1) + ' cm is above the item height ' + base.h + ' cm');
  }
  return e;
}
// normalise an item's parts in place (lenient). No parts field → untouched, so old projects stay byte-identical
function cleanParts(o) {
  if (!o || !('parts' in o)) return o;
  if (!Array.isArray(o.parts)) { delete o.parts; delete o.pbase; delete o.partsV; return o; }
  o.parts = o.parts.filter(p => p && typeof p === 'object').slice(0, PARTS_MAX).map(cleanPart);
  const b = o.pbase && typeof o.pbase === 'object' ? o.pbase : {};
  o.pbase = { w: +b.w > 0 ? partR(+b.w) : o.w, d: +b.d > 0 ? partR(+b.d) : o.d, h: +b.h > 0 ? partR(+b.h) : o.h };
  o.partsV = PARTS_V;
  return o;
}
// parts are drawn in pbase; a resized item scales them
function partsScale(o) {
  const b = o.pbase || o, f = (v, bv) => +bv > 0 && +v > 0 ? v / bv : 1;
  return { sx: f(o.w, b.w), sy: f(o.d, b.d), sz: f(o.h, b.h) };
}
// whole-item check → { ok, errors, warnings, count }
function validateParts(o) {
  const errors = [], warnings = [];
  if (!o || typeof o !== 'object') return { ok: false, errors: ['not a furniture object'], warnings, count: 0 };
  for (const k of ['w', 'd', 'h']) if (!(partFin(o[k]) && +o[k] > 0)) errors.push('item ' + k + ' must be a number > 0');
  const parts = Array.isArray(o.parts) ? o.parts : [], base = o.pbase || { w: o.w, d: o.d, h: o.h };
  if (!Array.isArray(o.parts)) warnings.push('no parts: the item renders as a plain ' + (o.k || 'box'));
  else if (!parts.length) warnings.push('no parts yet: add components (the item renders as a plain box until then)');
  if (parts.length > PARTS_MAX) errors.push(parts.length + ' parts; the limit is ' + PARTS_MAX);
  else if (parts.length > PARTS_SOFT) warnings.push(parts.length + ' parts is heavy for 3D; try to stay under ' + PARTS_SOFT);
  const label = (p, i) => 'part ' + i + (p && p.name ? ' "' + p.name + '"' : '');
  parts.forEach((p, i) => { for (const m of partIssues(p, errors.length ? null : base)) errors.push(label(p, i) + ': ' + m); });
  if (!errors.length) {
    // floating parts: nothing under them (another part's top or the floor) where they overlap
    const bs = parts.map(p => partBounds(cleanPart(p)));
    bs.forEach((b, i) => {
      if (b.z0 <= 0.5) return;
      const held = bs.some((c, j) => j !== i && c.z1 >= b.z0 - 1 && c.z0 < b.z0 && c.x0 < b.x1 && c.x1 > b.x0 && c.y0 < b.y1 && c.y1 > b.y0);
      if (!held) warnings.push(label(parts[i], i) + ' floats at z ' + partR(b.z0) + ' cm with nothing under it');
    });
  }
  return { ok: !errors.length, errors, warnings, count: parts.length };
}
// reference example: a 9-ft style billiards table built from parts (w = long side)
function billiardParts(w = 280, d = 155, h = 85) {
  const rail = Math.min(14, d * 0.09), felt = h - 6, rail3 = felt + 3.8, bed = felt - 3, ap = 10, legH = bed - ap, ball = 5.7;
  const wood = '#5b3a24', woodD = '#3d2516', railC = '#6b4026', cloth = '#1f7a4a', cush = '#17603a', out = [];
  const add = (name, type, x, y, z, pw, pd, ph, color, extra) => out.push(Object.assign({ name, type, x: partR(x), y: partR(y), z: partR(z), w: partR(pw), d: partR(pd), h: partR(ph), color }, extra || {}));
  const lx = w / 2 - 30, ly = d / 2 - 24;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) add('leg', 'box', sx * lx, sy * ly, 0, 14, 14, legH, woodD);
  for (const sy of [-1, 1]) add('stretcher', 'box', 0, sy * ly, 18, 2 * lx, 8, 8, woodD);
  add('apron', 'box', 0, 0, legH, w - 16, d - 16, ap, wood);
  add('felt bed', 'box', 0, 0, bed, w - 2 * rail, d - 2 * rail, 3, cloth);
  for (const sy of [-1, 1]) add('long rail', 'box', 0, sy * (d / 2 - rail / 2), bed, w, rail, rail3 - bed, railC, { mat: 'gloss' });
  for (const sx of [-1, 1]) add('short rail', 'box', sx * (w / 2 - rail / 2), 0, bed, rail, d - 2 * rail, rail3 - bed, railC, { mat: 'gloss' });
  for (const sy of [-1, 1]) add('cushion', 'box', 0, sy * (d / 2 - rail - 1.5), felt, w - 2 * rail, 3, 3, cush);
  for (const sx of [-1, 1]) add('cushion', 'box', sx * (w / 2 - rail - 1.5), 0, felt, 3, d - 2 * rail - 6, 3, cush);
  const px = w / 2 - rail + 1, py = d / 2 - rail + 1;
  for (const [x, y] of [[-px, -py], [0, -py - 1], [px, -py], [px, py], [0, py + 1], [-px, py]]) add('pocket', 'cyl', x, y, bed + 0.1, 12, 12, rail3 - bed + 0.2, '#111111');
  add('cue ball', 'sphere', -w / 4, 0, felt, ball, ball, ball, '#f8fafc', { mat: 'gloss' });
  const rack = ['#facc15', '#2563eb', '#dc2626', '#7c3aed', '#111111', '#f97316'], rx = w / 4, dx = ball * 0.87;
  let k = 0;
  for (let row = 0; row < 3; row++) for (let j = 0; j <= row; j++) add('ball', 'sphere', rx + row * dx, (j - row / 2) * ball * 1.02, felt, ball, ball, ball, rack[k++], { mat: 'gloss' });
  add('cue', 'cyl', -w * 0.06, d / 2 - rail - 16, felt, Math.min(147, w - 2 * rail - 20), 2.6, 2.6, '#d9b48a', { axis: 'x', rot: 4 });
  return out;
}
// starting points for the furniture studio and create_furniture { template }: parts(w, d, h) fits any size (checked at 0.8× / 1× / 1.3×)
const FURN_TEMPLATES = {
  table: {
    tr: "Yemek Masası",
    en: "Dining Table",
    icon: "🍽️",
    w: 140,
    d: 80,
    h: 75,
    color: "#c9a87c",
    parts: (w, d, h) => {
      const r = v => Math.round(v * 100) / 100;
      const add = (name, type, x, y, z, pw, pd, ph, color, extra) =>
        Object.assign({ name, type, x: r(x), y: r(y), z: r(z), w: r(pw), d: r(pd), h: r(ph), color }, extra || {});
      const topT = 3.5, legW = 5, legD = 5, legH = h - topT, apH = 7, apT = 2;
      const inX = Math.min(6, w * 0.05), inY = Math.min(6, d * 0.05);
      const lx = w / 2 - inX - legW / 2, ly = d / 2 - inY - legD / 2;
      const wood = "#c9a87c", woodD = "#a88457", woodL = "#d8b98d";
      const out = [];
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          out.push(add("leg", "box", sx * lx, sy * ly, 0, legW, legD, legH, woodD));
        }
      }
      for (const sy of [-1, 1]) {
        out.push(add("apron", "box", 0, sy * ly, legH - apH, 2 * lx + legW, apT, apH, wood));
      }
      for (const sx of [-1, 1]) {
        out.push(add("apron", "box", sx * lx, 0, legH - apH, apT, 2 * ly, apH, wood));
      }
      out.push(add("top", "box", 0, 0, legH, w, d, topT, woodL));
      return out;
    }
  },

  desk: {
    tr: "Çalışma Masası",
    en: "Desk",
    icon: "🖥️",
    w: 120,
    d: 60,
    h: 75,
    color: "#c2a382",
    parts: (w, d, h) => {
      const r = v => Math.round(v * 100) / 100;
      const add = (name, type, x, y, z, pw, pd, ph, color, extra) =>
        Object.assign({ name, type, x: r(x), y: r(y), z: r(z), w: r(pw), d: r(pd), h: r(ph), color }, extra || {});
      const topT = 3, legW = 4.5, legD = 4.5, legH = h - topT;
      const wood = "#c2a382", woodD = "#9a7753", woodL = "#d8be9f", metal = "#94a3b8";
      const out = [];
      const lx = -w / 2 + 5, inY = 5, ly = d / 2 - inY - legD / 2;
      out.push(add("leg", "box", lx, -ly, 0, legW, legD, legH, woodD));
      out.push(add("leg", "box", lx, ly, 0, legW, legD, legH, woodD));
      const pedW = Math.max(26, w * 0.32);
      const rOuterX = w / 2 - 1.5;
      const rInnerX = w / 2 - pedW;
      const pedD = d - 4;
      out.push(add("side panel", "box", rOuterX, 0, 0, 3, pedD, legH, wood));
      out.push(add("side panel", "box", rInnerX, 0, 0, 3, pedD, legH, wood));
      const dwCenter = (rOuterX + rInnerX) / 2;
      const dwWidth = (rOuterX - rInnerX) + 2;
      out.push(add("shelf", "box", dwCenter, 0, 10, dwWidth, pedD - 2, 2.5, woodD));
      const drBottomZ = legH - 18;
      const drFrontH = 15;
      const drFrontZ = drBottomZ + 0.5;
      const drFrontY = d / 2 - 2;
      out.push(add("drawer bottom", "box", dwCenter, (drFrontY - 2) / 2, drBottomZ, dwWidth, drFrontY + 2, 2, woodD));
      out.push(add("drawer front", "box", dwCenter, drFrontY, drFrontZ, pedW - 2, 2, drFrontH, woodL));
      out.push(add("handle", "box", dwCenter, drFrontY + 1.2, drFrontZ + drFrontH / 2 - 1, 8, 0.8, 2, metal, { mat: "metal" }));
      const modW = rInnerX - lx;
      const modX = (rInnerX + lx) / 2;
      out.push(add("backrest", "box", modX, -ly, 25, modW + 2, 2, legH - 28, wood));
      out.push(add("top", "box", 0, 0, legH, w, d, topT, woodL));
      return out;
    }
  },

  chair: {
    tr: "Sandalye",
    en: "Chair",
    icon: "🪑",
    w: 45,
    d: 50,
    h: 90,
    color: "#a4794e",
    parts: (w, d, h) => {
      const r = v => Math.round(v * 100) / 100;
      const add = (name, type, x, y, z, pw, pd, ph, color, extra) =>
        Object.assign({ name, type, x: r(x), y: r(y), z: r(z), w: r(pw), d: r(pd), h: r(ph), color }, extra || {});
      const legW = 3.5, legD = 3.5;
      const seatH = 42, seatT = 3;
      const wood = "#a4794e", woodD = "#7f5933", fabric = "#475569";
      const out = [];
      const lx = w / 2 - 3.5, fy = d / 2 - 3.5, by = -d / 2 + 3.5;
      out.push(add("leg", "box", -lx, fy, 0, legW, legD, seatH, woodD));
      out.push(add("leg", "box", lx, fy, 0, legW, legD, seatH, woodD));
      out.push(add("leg", "box", -lx, by, 0, legW, legD, h, woodD));
      out.push(add("leg", "box", lx, by, 0, legW, legD, h, woodD));
      out.push(add("stretcher", "box", -lx, 0, 12, legW * 0.8, d - 6, 2.5, wood));
      out.push(add("stretcher", "box", lx, 0, 12, legW * 0.8, d - 6, 2.5, wood));
      out.push(add("seat", "box", 0, 0.5, seatH, w - 1, d - 4, seatT, fabric));
      out.push(add("backrest", "box", 0, by, h - 10, w - 2, 2.5, 8, wood));
      out.push(add("backrest", "box", 0, by, h - 25, w - 2, 2.5, 6, wood));
      return out;
    }
  },

  stool: {
    tr: "Tabure",
    en: "Stool",
    icon: "🪑",
    w: 35,
    d: 35,
    h: 65,
    color: "#966f45",
    parts: (w, d, h) => {
      const r = v => Math.round(v * 100) / 100;
      const add = (name, type, x, y, z, pw, pd, ph, color, extra) =>
        Object.assign({ name, type, x: r(x), y: r(y), z: r(z), w: r(pw), d: r(pd), h: r(ph), color }, extra || {});
      const topT = 3.5, legR = 3.2, legH = h - topT;
      const wood = "#966f45", woodD = "#75502b", woodL = "#b58d63";
      const out = [];
      const rad = w / 2 - 4.5;
      out.push(add("leg", "cyl", rad, 0, 0, legR, legR, legH, woodD));
      out.push(add("leg", "cyl", -rad, 0, 0, legR, legR, legH, woodD));
      out.push(add("leg", "cyl", 0, rad, 0, legR, legR, legH, woodD));
      out.push(add("leg", "cyl", 0, -rad, 0, legR, legR, legH, woodD));
      out.push(add("stretcher", "box", 0, 0, 18, 2 * rad + 2, 2.5, 2.5, wood));
      out.push(add("stretcher", "box", 0, 0, 21, 2.5, 2 * rad + 2, 2.5, wood));
      out.push(add("stretcher", "box", 0, 0, 38, 2 * rad + 2, 2.5, 2.5, wood));
      out.push(add("stretcher", "box", 0, 0, 41, 2.5, 2 * rad + 2, 2.5, wood));
      out.push(add("seat", "cyl", 0, 0, legH, w, d, topT, woodL));
      return out;
    }
  },

  bed: {
    tr: "Çift Kişilik Yatak",
    en: "Double Bed",
    icon: "🛏️",
    w: 160,
    d: 200,
    h: 100,
    color: "#dcd3c5",
    parts: (w, d, h) => {
      const r = v => Math.round(v * 100) / 100;
      const add = (name, type, x, y, z, pw, pd, ph, color, extra) =>
        Object.assign({ name, type, x: r(x), y: r(y), z: r(z), w: r(pw), d: r(pd), h: r(ph), color }, extra || {});
      const headT = 8, sideW = 6, sideH = 34, footH = 40;
      const wood = "#785338", fabric = "#dcd3c5", sheet = "#f1f5f9", blanket = "#94a3b8";
      const out = [];
      out.push(add("headboard", "box", 0, -d / 2 + headT / 2, 0, w, headT, h, wood));
      const railD = d - headT - 4;
      const railY = (-d / 2 + headT + d / 2 - 4) / 2;
      out.push(add("side rail", "box", -w / 2 + sideW / 2, railY, 0, sideW, railD, sideH, wood));
      out.push(add("side rail", "box", w / 2 - sideW / 2, railY, 0, sideW, railD, sideH, wood));
      out.push(add("footboard", "box", 0, d / 2 - 2, 0, w, 4, footH, wood));
      const baseZ = 24;
      out.push(add("slat base", "box", 0, railY, baseZ, w - 8, railD, 4, "#5c3d26"));
      const matZ = baseZ + 4;
      const matH = 22;
      const matD = railD - 2;
      out.push(add("mattress", "box", 0, railY, matZ, w - 10, matD, matH, fabric));
      const pilZ = matZ + matH;
      const pilW = (w - 24) / 2;
      const pilD = 36;
      const pilY = -d / 2 + headT + pilD / 2 + 4;
      out.push(add("pillow", "box", -pilW / 2 - 2, pilY, pilZ, pilW, pilD, 8, sheet));
      out.push(add("pillow", "box", pilW / 2 + 2, pilY, pilZ, pilW, pilD, 8, sheet));
      const duvD = matD * 0.65;
      const duvY = railY + (matD - duvD) / 2;
      out.push(add("cushion", "box", 0, duvY, pilZ, w - 8, duvD, 3, blanket));
      return out;
    }
  },

  bookcase: {
    tr: "Kitaplık",
    en: "Bookcase",
    icon: "📚",
    w: 80,
    d: 30,
    h: 180,
    color: "#996d47",
    parts: (w, d, h) => {
      const r = v => Math.round(v * 100) / 100;
      const add = (name, type, x, y, z, pw, pd, ph, color, extra) =>
        Object.assign({ name, type, x: r(x), y: r(y), z: r(z), w: r(pw), d: r(pd), h: r(ph), color }, extra || {});
      const sideW = 2.5, backD = 1.5, topH = 3, plinthH = 7;
      const wood = "#996d47", woodD = "#7a5332", woodL = "#b5875d";
      const out = [];
      out.push(add("back panel", "box", 0, -d / 2 + backD / 2, 0, w, backD, h, woodD));
      out.push(add("side panel", "box", -w / 2 + sideW / 2, 0, 0, sideW, d, h, wood));
      out.push(add("side panel", "box", w / 2 - sideW / 2, 0, 0, sideW, d, h, wood));
      out.push(add("plinth", "box", 0, d / 2 - 2, 0, w - 2 * sideW, 3, plinthH, woodD));
      out.push(add("top", "box", 0, 0, h - topH, w, d, topH, wood));
      const shT = 2.2;
      const shW = w - sideW;
      const shD = d - backD + 0.5;
      const shY = (-d / 2 + backD - 0.5 + d / 2) / 2;
      const usableH = (h - topH) - plinthH;
      for (let i = 0; i < 4; i++) {
        const shZ = plinthH + (usableH - shT) * (i / 4);
        out.push(add("shelf", "box", 0, shY, shZ, shW, shD, shT, woodL));
      }
      return out;
    }
  },

  cabinet: {
    tr: "Dolap",
    en: "Cabinet",
    icon: "🗄️",
    w: 80,
    d: 40,
    h: 90,
    color: "#8c6239",
    parts: (w, d, h) => {
      const r = v => Math.round(v * 100) / 100;
      const add = (name, type, x, y, z, pw, pd, ph, color, extra) =>
        Object.assign({ name, type, x: r(x), y: r(y), z: r(z), w: r(pw), d: r(pd), h: r(ph), color }, extra || {});
      const plinthH = 7, topH = 3, sideW = 2.5, backD = 1.5;
      const wood = "#8c6239", woodD = "#6b4724", woodL = "#aa7d4f", metal = "#e2e8f0";
      const out = [];
      out.push(add("plinth", "box", 0, 0, 0, w, d, plinthH, woodD));
      const bodyH = h - plinthH - topH;
      out.push(add("back panel", "box", 0, -d / 2 + backD / 2, plinthH, w, backD, bodyH, woodD));
      out.push(add("side panel", "box", -w / 2 + sideW / 2, 0, plinthH, sideW, d, bodyH, wood));
      out.push(add("side panel", "box", w / 2 - sideW / 2, 0, plinthH, sideW, d, bodyH, wood));
      out.push(add("shelf", "box", 0, 0, plinthH + bodyH * 0.48, w - sideW, d - 4, 2, woodL));
      out.push(add("top", "box", 0, 0, h - topH, w, d, topH, wood));
      const dw = (w - 1) / 2;
      const doorH = bodyH - 1;
      const doorZ = plinthH + 0.5;
      const doorY = d / 2 - 2;
      out.push(add("door", "box", -dw / 2, doorY, doorZ, dw - 0.5, 2, doorH, woodL));
      out.push(add("door", "box", dw / 2, doorY, doorZ, dw - 0.5, 2, doorH, woodL));
      const hH = 8, hZ = doorZ + doorH * 0.55;
      const hY = doorY + 1.2;
      out.push(add("handle", "box", -3, hY, hZ, 1.5, 0.8, hH, metal, { mat: "metal" }));
      out.push(add("handle", "box", 3, hY, hZ, 1.5, 0.8, hH, metal, { mat: "metal" }));
      return out;
    }
  },

  sofa: {
    tr: "Koltuk",
    en: "Sofa",
    icon: "🛋️",
    w: 200,
    d: 90,
    h: 85,
    color: "#5b6b7a",
    parts: (w, d, h) => {
      const r = v => Math.round(v * 100) / 100;
      const add = (name, type, x, y, z, pw, pd, ph, color, extra) =>
        Object.assign({ name, type, x: r(x), y: r(y), z: r(z), w: r(pw), d: r(pd), h: r(ph), color }, extra || {});
      const baseH = 22, armW = Math.min(22, w * 0.12), armH = 40;
      const backD = Math.min(24, d * 0.25);
      const fabric = "#5b6b7a", fabricD = "#455360", fabricL = "#718394", cushionC = "#8395a6";
      const out = [];
      out.push(add("base", "box", 0, 0, 0, w, d, baseH, fabricD));
      out.push(add("backrest", "box", 0, -d / 2 + backD / 2, baseH, w, backD, h - baseH, fabric));
      const armD = d - 4;
      out.push(add("armrest", "box", -w / 2 + armW / 2, 2, baseH, armW, armD, armH, fabric));
      out.push(add("armrest", "box", w / 2 - armW / 2, 2, baseH, armW, armD, armH, fabric));
      const seatW = w - 2 * armW;
      const cw = seatW / 3;
      const seatD = d - backD;
      const seatY = (-d / 2 + backD + d / 2) / 2;
      const seatH = 15;
      for (let i = 0; i < 3; i++) {
        const cx = -seatW / 2 + cw * (i + 0.5);
        out.push(add("cushion", "box", cx, seatY, baseH, cw - 1, seatD - 2, seatH, fabricL));
      }
      const bCushH = h - baseH - seatH;
      const bCushD = 12;
      const bCushY = -d / 2 + backD + bCushD / 2;
      for (let i = 0; i < 3; i++) {
        const cx = -seatW / 2 + cw * (i + 0.5);
        out.push(add("cushion", "box", cx, bCushY, baseH + seatH, cw - 1, bCushD, bCushH, cushionC));
      }
      return out;
    }
  },

  coffee: {
    tr: "Orta Sehpa",
    en: "Coffee Table",
    icon: "☕",
    w: 100,
    d: 55,
    h: 40,
    color: "#ba9266",
    parts: (w, d, h) => {
      const r = v => Math.round(v * 100) / 100;
      const add = (name, type, x, y, z, pw, pd, ph, color, extra) =>
        Object.assign({ name, type, x: r(x), y: r(y), z: r(z), w: r(pw), d: r(pd), h: r(ph), color }, extra || {});
      const topT = 3, legW = 4, legD = 4, legH = h - topT;
      const wood = "#ba9266", woodD = "#946f45", woodL = "#d4ad80";
      const out = [];
      const inX = Math.min(5, w * 0.06), inY = Math.min(5, d * 0.08);
      const lx = w / 2 - inX - legW / 2, ly = d / 2 - inY - legD / 2;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          out.push(add("leg", "box", sx * lx, sy * ly, 0, legW, legD, legH, woodD));
        }
      }
      const shZ = 10;
      out.push(add("shelf", "box", 0, 0, shZ, 2 * lx + legW, 2 * ly + legD, 2, wood));
      const apH = 4, apZ = legH - apH;
      for (const sy of [-1, 1]) {
        out.push(add("apron", "box", 0, sy * ly, apZ, 2 * lx + legW, 2, apH, wood));
      }
      for (const sx of [-1, 1]) {
        out.push(add("apron", "box", sx * lx, 0, apZ, 2, 2 * ly, apH, wood));
      }
      out.push(add("top", "box", 0, 0, legH, w, d, topT, woodL));
      return out;
    }
  },

  wardrobe: {
    tr: "Gardırop",
    en: "Wardrobe",
    icon: "🚪",
    w: 120,
    d: 60,
    h: 200,
    color: "#6b4728",
    parts: (w, d, h) => {
      const r = v => Math.round(v * 100) / 100;
      const add = (name, type, x, y, z, pw, pd, ph, color, extra) =>
        Object.assign({ name, type, x: r(x), y: r(y), z: r(z), w: r(pw), d: r(pd), h: r(ph), color }, extra || {});
      const plinthH = 10, topH = 4, sideW = 3, backD = 2;
      const wood = "#6b4728", woodD = "#50331a", woodL = "#875b34", metal = "#e2e8f0";
      const out = [];
      out.push(add("plinth", "box", 0, 0, 0, w, d, plinthH, woodD));
      const bodyH = h - plinthH - topH;
      out.push(add("back panel", "box", 0, -d / 2 + backD / 2, plinthH, w, backD, bodyH, woodD));
      out.push(add("side panel", "box", -w / 2 + sideW / 2, 0, plinthH, sideW, d, bodyH, wood));
      out.push(add("side panel", "box", w / 2 - sideW / 2, 0, plinthH, sideW, d, bodyH, wood));
      const shZ = h - topH - 35;
      out.push(add("shelf", "box", 0, 0, shZ, w - sideW, d - 4, 2.5, woodL));
      out.push(add("shelf", "cyl", 0, -1, shZ - 6, w - sideW, 3, 3, metal, { axis: "x", mat: "metal" }));
      out.push(add("top", "box", 0, 0, h - topH, w, d, topH, wood));
      const dw = (w - 1) / 2;
      const doorH = bodyH - 1;
      const doorZ = plinthH + 0.5;
      const doorY = d / 2 - 2;
      out.push(add("door", "box", -dw / 2, doorY, doorZ, dw - 0.5, 2, doorH, woodL));
      out.push(add("door", "box", dw / 2, doorY, doorZ, dw - 0.5, 2, doorH, woodL));
      const hH = 16, hZ = doorZ + doorH * 0.5;
      const hY = doorY + 1.2;
      out.push(add("handle", "box", -3.5, hY, hZ, 1.5, 0.8, hH, metal, { mat: "metal" }));
      out.push(add("handle", "box", 3.5, hY, hZ, 1.5, 0.8, hH, metal, { mat: "metal" }));
      return out;
    }
  },

  nightstand: {
    tr: "Komodin",
    en: "Nightstand",
    icon: "▫",
    w: 45,
    d: 40,
    h: 55,
    color: "#9e774f",
    parts: (w, d, h) => {
      const r = v => Math.round(v * 100) / 100;
      const add = (name, type, x, y, z, pw, pd, ph, color, extra) =>
        Object.assign({ name, type, x: r(x), y: r(y), z: r(z), w: r(pw), d: r(pd), h: r(ph), color }, extra || {});
      const topT = 2.5, legW = 3.5, legD = 3.5, legH = h - topT;
      const wood = "#9e774f", woodD = "#7c5a35", woodL = "#bd9469", metal = "#e2e8f0";
      const out = [];
      const inX = 3, inY = 3;
      const lx = w / 2 - inX - legW / 2, ly = d / 2 - inY - legD / 2;
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          out.push(add("leg", "box", sx * lx, sy * ly, 0, legW, legD, legH, woodD));
        }
      }
      out.push(add("shelf", "box", 0, 0, 10, 2 * lx + legW, 2 * ly + legD, 2, wood));
      const boxH = 18;
      const boxZ = legH - boxH;
      out.push(add("side panel", "box", -lx, 0, boxZ, legW, 2 * ly + legD, boxH, wood));
      out.push(add("side panel", "box", lx, 0, boxZ, legW, 2 * ly + legD, boxH, wood));
      out.push(add("back panel", "box", 0, -ly, boxZ, 2 * lx + legW, legD, boxH, woodD));
      const drBottomZ = boxZ + 0.5;
      const drFrontH = boxH - 2;
      const drFrontZ = boxZ + 1;
      const drFrontY = d / 2 - 2;
      out.push(add("drawer bottom", "box", 0, (drFrontY - ly) / 2, drBottomZ, 2 * lx, drFrontY + ly + 1, 1.5, wood));
      out.push(add("drawer front", "box", 0, drFrontY, drFrontZ, 2 * lx, 2, drFrontH, woodL));
      out.push(add("handle", "box", 0, drFrontY + 1.2, drFrontZ + drFrontH / 2 - 0.75, 8, 0.8, 1.5, metal, { mat: "metal" }));
      out.push(add("top", "box", 0, 0, legH, w, d, topT, woodL));
      return out;
    }
  },
  billiards: { tr: "Bilardo Masası", en: "Billiards Table", icon: "🎱", w: 280, d: 155, h: 85, color: "#5b3a24", parts: billiardParts }
};
/* PARTS-ENGINE:END */
/* IFC-IMPORT:BEGIN ---------- IFC içe aktarma (Revit / ArchiCAD / BIM dışa aktarımı) ----------
   Saf JS, bağımlılıksız; DOM'a ve global duruma dokunmaz. ifcToProject(text, opts) bir IFC-SPF
   (ISO 10303-21 / STEP, IFC2x3 ve IFC4) metnini Kat Planı projesine çevirir: katlar
   (IfcBuildingStorey), duvarlar ve perde duvarlar, duvardaki kapı / pencere açıklıkları,
   odalar (IfcSpace), döşemeler (IfcSlab, çatılar hariç), döşeme boşlukları, kolonlar (IfcColumn),
   korkuluklar (IfcRailing), özel bileşenler / mobilyalar (proxy, furnishing, sanitary, assembly → çokgen şekil),
   çatılar (IfcRoof / ROOF döşemeleri → yüzleriyle 'roof' öğesi), merdivenler (IfcStair → parametrik merdiven) ve
   rampalar (IfcRamp → parametrik rampa); renkler (yüzey stilleri) ve malzeme adlarından kaplama / kapı malzemesi.
   Elemanlar gerçek kotlarına göre kata yerleşir; birden çok katı geçen duvar / kolon her katta parça olarak çizilir.
   Plan: x = X, y = -Y (SVG'de y aşağı), her şey cm. Bu blok mcp/server.js içinde birebir durur. */
const IFC_WALLS = new Set(['IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE', 'IFCCURTAINWALL']);
const IFC_DOORS = new Set(['IFCDOOR', 'IFCDOORSTANDARDCASE']);
const IFC_WINDOWS = new Set(['IFCWINDOW', 'IFCWINDOWSTANDARDCASE']);
const IFC_OPENINGS = new Set(['IFCOPENINGELEMENT', 'IFCOPENINGSTANDARDCASE']);
const IFC_SLABS = new Set(['IFCSLAB', 'IFCSLABSTANDARDCASE', 'IFCSLABELEMENTEDCASE']);
const IFC_COLUMNS = new Set(['IFCCOLUMN', 'IFCCOLUMNSTANDARDCASE']);
const IFC_RAILINGS = new Set(['IFCRAILING']);
// malzeme adı → kaplama / kapı malzemesi (Türkçe ve İngilizce Revit adları; sözcük bazlı, ilk eşleşen kazanır)
const IFC_FINISH = [[/^(glass|glazing|cam|kp_cam)$/, 'glass'], [/^(parke|parquet|wood|timber|ahsap|ahşap|oak|mese|meşe|laminat|laminate)$/, 'wood'], [/^(marble|mermer)$/, 'marble'],
  [/^(tile|tiles|seramik|fayans|ceramic|porcelain|porselen)$/, 'tile'], [/^(carpet|hali|halı)$/, 'carpet'], [/^(grass|cim|çim|lawn)$/, 'grass'], [/^(gravel|cakil|çakıl)$/, 'gravel'],
  [/^(asphalt|asfalt)$/, 'asphalt'], [/^(decking)$/, 'deck'], [/^(stone|tas|taş|granit|granite)$/, 'stone'], [/^(water)$/, 'water'],
  [/^(concrete|beton|betonarme|gazbeton|screed|sap|şap)$/, 'concrete']];
const IFC_DOOR_MAT = [[/^(glass|glazing|cam)$/, 'glass'], [/^(metal|steel|celik|çelik|aluminium|aluminum|aluminyum|iron|demir)$/, 'metal'], [/^(wood|timber|ahsap|ahşap|oak|mese|meşe|veneer)$/, 'wood']];
const ifcWords = s => String(s || '').toLowerCase().split(/[^a-z0-9çğıöşü]+/).filter(Boolean);
const ifcPick = (table, names) => { for (const w of ifcWords(names)) for (const [rx, v] of table) if (rx.test(w)) return v; return null; }; // ilk eşleşen sözcük (üst katman) kazanır
// gri / beyaz (doygunluk yok) → duvarda boya sayılmaz: Revit'in varsayılan malzemeleri planı gri şeritlerle doldurmasın
const ifcNeutral = hex => { const n = parseInt(String(hex).slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; return Math.max(r, g, b) - Math.min(r, g, b) < 14; };
// korkuluk stili (rs) adı / malzemesinden: cam panel, yatay çubuk / halat, dolu parapet; yoksa dikmeli
const IFC_RAIL_STYLE = [[/^(glass|glazed|glazing|cam|camli|camlı)$/, 'glass'], [/^(cable|wire|kablo|halat|horizontal|yatay|rod)$/, 'cable'], [/^(parapet|solid|dolu|concrete|beton|betonarme|masonry|duvar|brick|tugla|tuğla)$/, 'solid']];
const IFC_LEVEL_MERGE = 100; // bundan yakın seviyeler (Revit yardımcı / referans seviyeleri) tek kat olur; = FLOOR_H_MIN
const IFC_ROOF_MAX_FACES = 600; // çatı yüzü sınırı: üstü taban izinden düz çatıya düşer (proje / geri al hafif kalsın)
const IFC_COMPONENTS = new Set(['IFCBUILDINGELEMENTPROXY', 'IFCFURNISHINGELEMENT', 'IFCFURNITURE', 'IFCSYSTEMFURNITUREELEMENT', 'IFCSANITARYTERMINAL', 'IFCELEMENTASSEMBLY', 'IFCFLOWTERMINAL', 'IFCELECTRICAPPLIANCE', 'IFCAUDIOVISUALAPPLIANCE']);
// Revit ailesi → katalog öğesi (#88). Önce bileşik adlar (tam metinde), sonra tek sözcükler: SON eşleşen sözcük kazanır
// ("Dining Table" → table, "Yatak Odası Dolabı" → dolap). sofa / bed / table boyuta göre katalog çeşidine çevrilir.
const IFC_CAT_PHRASE = [[/coffee\s*table|sehpa/, 'coffee'], [/bedside|night\s*stand|komodin/, 'night'], [/office\s*chair|task\s*chair|ofis\s*(sandalye|koltu)|çalışma\s*(sandalye|koltu)/, 'ochair'],
  [/dish\s*washer|bulaşık|bulasik/, 'dish'], [/washing|washer|tumble|çamaşır|camasir/, 'wm'], [/arm\s*chair|berjer/, 'armchair'], [/water\s*closet/, 'wc'],
  [/book\s*(case|shelf)|kitapl[ıi]k/, 'bookcase'], [/sink\s*vanity|vanity\s*sink|pedestal|wash\s*(hand\s*)?basin/, 'basin'], [/bath\s*tub/, 'tub'], [/bunk|ranza/, 'bunk']];
const IFC_CAT_WORD = [[/^(wc|toilet|toilets|klozet[a-z0-9çğıöşü]*|tuvalet[a-z0-9çğıöşü]*|toiletpan|wcseat|alafranga)$/, 'wc'], [/^(bidet|bide)$/, 'bidet'], [/^(bath|tub|küvet[a-z0-9çğıöşü]*|kuvet[a-z0-9çğıöşü]*|jakuzi|jacuzzi)$/, 'tub'],
  [/^(shower|duş[a-z0-9çğıöşü]*|dus|dusakabin)$/, 'shower'], [/^(basin|lavabo[a-z0-9çğıöşü]*|lavatory)$/, 'basin'], [/^(sink|evye[a-z0-9çğıöşü]*|eviye[a-z0-9çğıöşü]*)$/, 'sinkK'],
  [/^(refrigerator|fridge|freezer|fridgefreezer|buzdolab[a-z0-9çğıöşü]*)$/, 'fridge'], [/^(cooker|stove|ocak[a-z0-9çğıöşü]*|range|hob|cooktop|oven|fırın[a-z0-9çğıöşü]*|firin[a-z0-9çğıöşü]*|electriccooker)$/, 'stove'],
  [/^(tv|television|televizyon[a-z0-9çğıöşü]*|display)$/, 'tv'], [/^(crib|cot|beşik[a-z0-9çğıöşü]*|besik[a-z0-9çğıöşü]*)$/, 'crib'], [/^(bed|beds|yata[kğ][a-z0-9çğıöşü]*|karyola[a-z0-9çğıöşü]*|baza)$/, 'bed'],
  [/^(sofa|sofas|couch|kanepe[a-z0-9çğıöşü]*|koltu[kğ][a-z0-9çğıöşü]*|settee|loveseat)$/, 'sofa'], [/^(wardrobe|gardrop[a-z0-9çğıöşü]*|gardırop[a-z0-9çğıöşü]*|dola[bp][a-z0-9çğıöşü]*|closet)$/, 'wardrobe'], [/^(dresser|şifonyer[a-z0-9çğıöşü]*|sifonyer[a-z0-9çğıöşü]*)$/, 'dresser'],
  [/^(desk|desks|workstation)$/, 'desk'], [/^(table|tables|masa[a-z0-9çğıöşü]*|dining)$/, 'table'], [/^(chair|chairs|sandalye[a-z0-9çğıöşü]*|stool|tabure[a-z0-9çğıöşü]*)$/, 'chair'],
  [/^(car|cars|otomobil[a-z0-9çğıöşü]*|araba[a-z0-9çğıöşü]*|sedan)$/, 'car'], [/^(tree|trees|ağa[cç][a-z0-9çğıöşü]*|agac[a-z0-9çğıöşü]*)$/, 'tree'], [/^(plant|planter|bitki[a-z0-9çğıöşü]*|saks[ıi][a-z0-9çğıöşü]*)$/, 'plant'], [/^(fireplace|şömine[a-z0-9çğıöşü]*|somine[a-z0-9çğıöşü]*)$/, 'fireplace']];
const ifcCatKey = names => {
  const s = String(names || '').toLowerCase(); for (const [rx, v] of IFC_CAT_PHRASE) if (rx.test(s)) return v;
  let hit = null; for (const w of ifcWords(s)) for (const [rx, v] of IFC_CAT_WORD) if (rx.test(w)) { hit = v; break; }
  return hit;
};
// oda zemin kaplaması özelliği (Pset_SpaceCommon.FloorFinish, Revit "Floor Finish" / "Zemin Kaplaması")
const IFC_FLOOR_PROP = /^(floor\s*finish|floorfinish|floor\s*covering|floorcovering|finish\s*floor|zemin\s*kaplama[a-z0-9çğıöşü]*|d[öo][şs]eme\s*kaplama[a-z0-9çğıöşü]*|zemin)$/i;
// STEP metnini varlıklara böler; parametreler ilk erişimde (ifcArgs) ayrıştırılır, büyük dosyalar hızlı açılır
function ifcParse(text) {
  text = String(text || '');
  if (/^PK/.test(text)) throw new Error('ifcZIP: unzip it or export a plain .ifc file');
  if (/^\s*<\?xml/.test(text)) throw new Error('ifcXML is not supported: export a plain .ifc (STEP) file');
  if (!/ISO-10303-21/.test(text.slice(0, 2000))) throw new Error('not an IFC (STEP) file');
  const sm = /FILE_SCHEMA\s*\(\s*\(\s*'([^']*)'/i.exec(text.slice(0, 20000));
  const db = { text, ents: new Map(), byType: new Map(), schema: sm ? sm[1].toUpperCase() : '' };
  const n = text.length;
  let i = text.search(/\bDATA\s*;/); if (i < 0) throw new Error('IFC file has no DATA section');
  i = text.indexOf(';', i) + 1;
  while (i < n) {
    let c = text.charCodeAt(i);
    if (c <= 32) { i++; continue; }
    if (c === 47 && text.charCodeAt(i + 1) === 42) { const e = text.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c !== 35) { // '#' değilse: ENDSEC ya da bozuk satır → sonraki ';'
      if (text.startsWith('ENDSEC', i)) break;
      const e = text.indexOf(';', i); i = e < 0 ? n : e + 1; continue;
    }
    let j = i + 1, id = 0;
    while (j < n && (c = text.charCodeAt(j)) >= 48 && c <= 57) { id = id * 10 + c - 48; j++; }
    while (j < n && text.charCodeAt(j) <= 32) j++;
    if (text[j] !== '=') { const e = text.indexOf(';', j); i = e < 0 ? n : e + 1; continue; }
    j++; while (j < n && text.charCodeAt(j) <= 32) j++;
    const t0 = j; while (j < n && /[A-Za-z0-9_]/.test(text[j])) j++;
    const type = text.slice(t0, j).toUpperCase();
    while (j < n && text[j] !== '(') j++;
    const s = j + 1; let depth = 0, k = j;
    for (; k < n; k++) {
      const ch = text[k];
      if (ch === "'") { k++; while (k < n) { if (text[k] === "'") { if (text[k + 1] === "'") k += 2; else break; } else k++; } }
      else if (ch === '(') depth++;
      else if (ch === ')') { if (--depth === 0) break; }
    }
    db.ents.set(id, { t: type, s, e: k, a: null });
    let l = db.byType.get(type); if (!l) db.byType.set(type, l = []); l.push(id);
    const e = text.indexOf(';', k); i = e < 0 ? n : e + 1;
  }
  return db;
}
function ifcStr(s) {
  return s.replace(/''/g, "'")
    .replace(/\\X2\\([0-9A-F]+)\\X0\\/gi, (m, h) => { let o = ''; for (let k = 0; k + 4 <= h.length; k += 4) o += String.fromCharCode(parseInt(h.substr(k, 4), 16)); return o; })
    .replace(/\\X\\([0-9A-F]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\S\\(.)/g, (m, ch) => String.fromCharCode(ch.charCodeAt(0) + 128))
    .replace(/\\\\/g, '\\');
}
// Parametre listesi: $ / * → null, #12 → { r: 12 }, .ENUM. → { e }, 'metin' → string, (..) → dizi, TİP(v) → { tv, v }
function ifcValues(text, s, e) {
  let i = s;
  const ws = () => { while (i < e && text.charCodeAt(i) <= 32) i++; };
  const val = () => {
    ws(); const c = text[i];
    if (c === '$' || c === '*') { i++; return null; }
    if (c === '#') { i++; const m = /^\d+/.exec(text.slice(i, i + 12)); i += m ? m[0].length : 0; return { r: m ? +m[0] : 0 }; }
    if (c === "'") {
      let j = i + 1; while (j < e) { if (text[j] === "'") { if (text[j + 1] === "'") j += 2; else break; } else j++; }
      const v = ifcStr(text.slice(i + 1, j)); i = j + 1; return v;
    }
    if (c === '.') { const j = text.indexOf('.', i + 1); const v = text.slice(i + 1, j); i = j + 1; return { e: v.toUpperCase() }; }
    if (c === '(') { i++; return list(); }
    if (c === '"') { const j = text.indexOf('"', i + 1); const v = text.slice(i + 1, j); i = j + 1; return v; }
    if (/[A-Za-z]/.test(c)) {
      const t0 = i; while (i < e && /[A-Za-z0-9_]/.test(text[i])) i++;
      const tv = text.slice(t0, i).toUpperCase(); ws();
      if (text[i] === '(') { i++; const a = list(); return { tv, v: a[0] }; }
      return { tv, v: null };
    }
    const m = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(text.slice(i, i + 40));
    if (m) { i += m[0].length; return +m[0]; }
    i++; return null;
  };
  const list = () => {
    const out = []; ws();
    if (text[i] === ')') { i++; return out; }
    for (;;) { out.push(val()); ws(); if (text[i] === ',') { i++; continue; } if (text[i] === ')') i++; return out; }
  };
  const out = [];
  ws(); if (i >= e) return out;
  for (;;) { out.push(val()); ws(); if (i < e && text[i] === ',') { i++; continue; } return out; }
}
function ifcToProject(text, opts = {}) {
  const db = ifcParse(text);
  const uid = opts.uid || (() => Math.random().toString(36).slice(2, 9));
  const tr = opts.L || ((a, b) => b);
  const colors = opts.colors || ['#bfdbfe', '#fde68a', '#bbf7d0', '#fecaca', '#e9d5ff', '#fed7aa', '#a5f3fc', '#fbcfe8'];
  const T = id => { const e = db.ents.get(id); return e ? e.t : ''; };
  const A = id => { const e = db.ents.get(id); if (!e) return []; if (!e.a) e.a = ifcValues(db.text, e.s, e.e); return e.a; };
  const R = v => (v && v.r) || 0;
  const num = v => (typeof v === 'number' ? v : v && typeof v.v === 'number' ? v.v : NaN);
  const ids = set => { const out = []; for (const t of set) out.push(...(db.byType.get(t) || [])); return out; };
  const stats = { schema: db.schema, floors: 0, walls: 0, ops: 0, rooms: 0, slabs: 0, voids: 0, columns: 0, railings: 0, components: 0, roofs: 0, stairs: 0, ramps: 0, skipped: 0, matched: 0, roomsDetected: 0, rotated: 0 };
  const cat = opts.catalog || null; // katalog (id → { id, name, en, w, d, h, icon, k, color }): verilirse tanınan aileler katalog öğesi olur

  /* --- Birimler: uzunluk → cm, düzlem açı → radyan --- */
  const PREFIX = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 100, DECA: 10, DECI: 0.1, CENTI: 0.01, MILLI: 1e-3, MICRO: 1e-6, NANO: 1e-9 };
  const unitScale = (id, depth = 0) => {
    const t = T(id), a = A(id);
    if (t === 'IFCSIUNIT') return (a[2] && PREFIX[a[2].e]) || 1;
    if (t === 'IFCCONVERSIONBASEDUNIT' && depth < 4) { const m = A(R(a[3])); return (num(m[0]) || 1) * unitScale(R(m[1]), depth + 1); }
    return 1;
  };
  let cm = 100, rad = 1;
  const proj = (db.byType.get('IFCPROJECT') || [])[0];
  const ua = proj ? R(A(proj)[8]) : (db.byType.get('IFCUNITASSIGNMENT') || [])[0];
  for (const u of (ua ? A(ua)[0] : []) || []) {
    const a = A(R(u)), ut = a[1] && a[1].e;
    if (ut === 'LENGTHUNIT') cm = unitScale(R(u)) * 100;
    if (ut === 'PLANEANGLEUNIT') rad = unitScale(R(u));
  }

  /* --- Yerleşim matrisleri { o, x, y, z } --- */
  const I = () => ({ o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const app = (M, p) => [0, 1, 2].map(k => M.o[k] + M.x[k] * p[0] + M.y[k] * p[1] + M.z[k] * (p[2] || 0));
  const rot = (M, v) => [0, 1, 2].map(k => M.x[k] * v[0] + M.y[k] * v[1] + M.z[k] * v[2]);
  const mul = (A1, B) => ({ o: app(A1, B.o), x: rot(A1, B.x), y: rot(A1, B.y), z: rot(A1, B.z) });
  const pt = v => { const c = A(R(v))[0] || []; return [+c[0] || 0, +c[1] || 0, +c[2] || 0]; };
  const dir = (v, d) => { if (!R(v)) return d; const c = A(R(v))[0] || []; return norm([+c[0] || 0, +c[1] || 0, +c[2] || 0]); };
  const placeCache = new Map();
  const place = id => {
    if (!id) return I();
    if (placeCache.has(id)) return placeCache.get(id);
    placeCache.set(id, I()); // döngüye karşı
    const t = T(id), a = A(id); let M = I();
    if (t === 'IFCAXIS2PLACEMENT3D') {
      const z = dir(a[1], [0, 0, 1]); let x = dir(a[2], Math.abs(z[2]) > 0.99 ? [1, 0, 0] : [0, 0, 1]);
      const dz = x[0] * z[0] + x[1] * z[1] + x[2] * z[2]; x = norm([x[0] - dz * z[0], x[1] - dz * z[1], x[2] - dz * z[2]]);
      M = { o: pt(a[0]), x, y: cross(z, x), z };
    } else if (t === 'IFCAXIS2PLACEMENT2D') {
      const x = dir(a[1], [1, 0, 0]); M = { o: pt(a[0]), x: [x[0], x[1], 0], y: [-x[1], x[0], 0], z: [0, 0, 1] };
    } else if (t === 'IFCLOCALPLACEMENT') M = mul(place(R(a[0])), place(R(a[1])));
    else if (/^IFCCARTESIANTRANSFORMATIONOPERATOR/.test(t)) {
      const x = dir(a[0], [1, 0, 0]), s = typeof a[3] === 'number' ? a[3] : 1;
      const z = dir(a[4], [0, 0, 1]); const y = dir(a[1], cross(z, x));
      M = { o: pt(a[2]), x: x.map(v => v * s), y: y.map(v => v * s), z: z.map(v => v * s) };
    }
    placeCache.set(id, M); return M;
  };

  /* --- Eğri ve profil noktaları (temsil koordinatlarında) --- */
  const ARC_STEP = Math.PI / 18;
  const curve = (id, depth = 0) => {
    const t = T(id), a = A(id); if (depth > 8) return [];
    if (t === 'IFCPOLYLINE') return (a[0] || []).map(pt);
    if (t === 'IFCINDEXEDPOLYCURVE') {
      const P0 = (A(R(a[0]))[0] || []).map(c => [+c[0] || 0, +c[1] || 0, +c[2] || 0]);
      if (!Array.isArray(a[1]) || !a[1].length) return P0;
      const out = [], push = p => { if (p && out[out.length - 1] !== p) out.push(p); };
      for (const sg of a[1]) {
        const ix = (sg && sg.v) || [];
        if (sg && sg.tv === 'IFCARCINDEX' && ix.length === 3 && P0[ix[0] - 1] && P0[ix[1] - 1] && P0[ix[2] - 1]) { // üç noktalı yay: dilimlenir (#88)
          push(P0[ix[0] - 1]); out.push(...ifcArc3(P0[ix[0] - 1], P0[ix[1] - 1], P0[ix[2] - 1], ARC_STEP)); push(P0[ix[2] - 1]);
        } else for (const k of ix) push(P0[k - 1]);
      }
      return out;
    }
    if (t === 'IFCCOMPOSITECURVE') {
      const out = [];
      for (const sg of a[0] || []) { const sa = A(R(sg)); let p = curve(R(sa[2]), depth + 1); if (sa[1] && sa[1].e === 'F') p = p.slice().reverse(); for (const q of p) { const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 1e-9) out.push(q); } }
      return out;
    }
    if (t === 'IFCCIRCLE' || t === 'IFCELLIPSE') {
      const M = place(R(a[0])), r1 = +a[1] || 0, r2 = t === 'IFCELLIPSE' ? +a[2] || 0 : r1, out = [];
      for (let k = 0; k < 24; k++) { const g = k / 24 * 2 * Math.PI; out.push(app(M, [r1 * Math.cos(g), r2 * Math.sin(g), 0])); }
      return out;
    }
    if (t === 'IFCTRIMMEDCURVE') {
      const bt = T(R(a[0])), ba = A(R(a[0])), sense = !(a[3] && a[3].e === 'F');
      const trim = (tl, fn) => { for (const v of tl || []) if (v && v.tv === 'IFCPARAMETERVALUE') return fn(num(v), null); for (const v of tl || []) if (R(v)) return fn(NaN, pt(v)); return fn(NaN, null); };
      if (bt === 'IFCLINE') {
        const p0 = pt(ba[0]), va = A(R(ba[1])), d = dir(va[0], [1, 0, 0]), mg = +va[1] || 1;
        const at = (u, p) => p || [p0[0] + d[0] * mg * u, p0[1] + d[1] * mg * u, p0[2] + d[2] * mg * u];
        return [trim(a[1], at), trim(a[2], at)];
      }
      if (bt === 'IFCCIRCLE') {
        const M = place(R(ba[0])), r = +ba[1] || 0;
        const ang = (u, p) => { if (!isNaN(u)) return u * rad; if (!p) return 0; const dx = p[0] - M.o[0], dy = p[1] - M.o[1], dz = p[2] - M.o[2]; return Math.atan2(dx * M.y[0] + dy * M.y[1] + dz * M.y[2], dx * M.x[0] + dy * M.x[1] + dz * M.x[2]); };
        const g1 = trim(a[1], ang); let g2 = trim(a[2], ang);
        if (sense) { while (g2 <= g1 + 1e-9) g2 += 2 * Math.PI; } else { while (g2 >= g1 - 1e-9) g2 -= 2 * Math.PI; }
        const nSeg = Math.max(1, Math.ceil(Math.abs(g2 - g1) / ARC_STEP)), out = [];
        for (let k = 0; k <= nSeg; k++) { const g = g1 + (g2 - g1) * k / nSeg; out.push(app(M, [r * Math.cos(g), r * Math.sin(g), 0])); }
        return out;
      }
      return curve(R(a[0]), depth + 1);
    }
    if (t === 'IFCGEOMETRICCURVESET' || t === 'IFCGEOMETRICSET') { const out = []; for (const v of a[0] || []) out.push(...curve(R(v), depth + 1)); return out; }
    return [];
  };
  const profile = (id, depth = 0) => {
    const t = T(id), a = A(id); if (depth > 6) return [];
    const M = () => place(R(a[2]));
    if (/^IFC(ROUNDED)?RECTANGLE(HOLLOW)?PROFILEDEF$/.test(t)) { const x = (+a[3] || 0) / 2, y = (+a[4] || 0) / 2, m = M(); return [[-x, -y], [x, -y], [x, y], [-x, y]].map(p => app(m, p)); }
    if (t === 'IFCCIRCLEPROFILEDEF' || t === 'IFCCIRCLEHOLLOWPROFILEDEF' || t === 'IFCELLIPSEPROFILEDEF') {
      const r1 = +a[3] || 0, r2 = t === 'IFCELLIPSEPROFILEDEF' ? +a[4] || 0 : r1, m = M(), out = [];
      for (let k = 0; k < 16; k++) { const g = k / 16 * 2 * Math.PI; out.push(app(m, [r1 * Math.cos(g), r2 * Math.sin(g), 0])); }
      return out;
    }
    if (t === 'IFCARBITRARYCLOSEDPROFILEDEF' || t === 'IFCARBITRARYPROFILEDEFWITHVOIDS') return curve(R(a[2]));
    if (t === 'IFCDERIVEDPROFILEDEF') { const m = place(R(a[3])); return profile(R(a[2]), depth + 1).map(p => app(m, p)); }
    if (t === 'IFCCOMPOSITEPROFILEDEF') { const out = []; for (const v of a[2] || []) out.push(...profile(R(v), depth + 1)); return out; }
    if (/PROFILEDEF$/.test(t) && a[2] && R(a[2])) { // I / T / L / U / C / Z kesitleri: dış dikdörtgen (I: genişlik a[3], derinlik a[4]; diğerleri: derinlik a[3], genişlik a[4])
      const ish = /ISHAPE/.test(t), x = (+(ish ? a[3] : a[4]) || 2) / 2, y = (+(ish ? a[4] : a[3]) || 2) / 2, m = M();
      return [[-x, -y], [x, -y], [x, y], [-x, y]].map(p => app(m, p));
    }
    return [];
  };
  const loopPts = id => { const a = A(id); return T(id) === 'IFCPOLYLOOP' ? (a[0] || []).map(pt) : []; };
  // tabandaki yatay yüzlerin birleşimi → dış hat (her bağımsız bölge bir taban poligonu) + içteki halkalar (foot.holes): içbükey L / U
  // döşemeler dışbükey zarfa düşmez, üçgenlenmiş tabanlar tek poligon olur, profil içi boşluklar kaybolmaz (#88)
  const footFrom = (faces, foot) => {
    let z0 = Infinity; for (const f of faces) for (const p of f) z0 = Math.min(z0, p[2]);
    const bot = faces.filter(f => f.length >= 3 && f.every(p => Math.abs(p[2] - z0) < 0.5 / cm)); if (!bot.length) return;
    const loops = ifcOutline(bot, cm * 50).sort((p, q) => Math.abs(ifcArea(q)) - Math.abs(ifcArea(p))), outers = [];
    for (const lp of loops) {
      if (outers.some(o => ifcInPoly(lp[0], o))) (foot.holes = foot.holes || []).push(lp); else { outers.push(lp); foot.push(lp); }
    }
  };
  // Katı → dünya noktaları (out) ve, düşey çekilmişse, taban poligonları (foot)
  // fc (isteğe bağlı): yüz çokgenleri (dünya koordinatı) — yalnızca çatılar için toplanır
  // DIFFERENCE ile yarım uzay (IfcHalfSpaceSolid / IfcPolygonalBoundedHalfSpace): out[i0..] içinde silinen tarafta kalan
  // noktalar düşey olarak kesme düzlemine indirilir (Revit'te çatıya bağlanan duvar üstleri). Düşey düzlemler ve sınır dışı noktalar dokunulmaz.
  const clipHalf = (hid, M, out, i0) => {
    const t = T(hid); if (t !== 'IFCHALFSPACESOLID' && t !== 'IFCPOLYGONALBOUNDEDHALFSPACE' && t !== 'IFCBOXEDHALFSPACE') return;
    const h = A(hid), pl = R(h[0]); if (T(pl) !== 'IFCPLANE') return;
    const P = mul(M, place(R(A(pl)[0]))), n = norm(P.z); if (Math.abs(n[2]) < 0.05) return;
    const sgn = h[1] && h[1].e === 'F' ? 1 : -1; // AgreementFlag T: normal malzemeden dışarı bakar → malzeme (silinen) normalin tersi
    let B = null, poly = null;
    if (t === 'IFCPOLYGONALBOUNDEDHALFSPACE') { B = mul(M, place(R(h[2]))); poly = curve(R(h[3])).map(p => [p[0], p[1]]); if (poly.length < 3) return; }
    const dt = (v, w) => v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
    for (let i = i0; i < out.length; i++) {
      const p = out[i], d = dt([p[0] - P.o[0], p[1] - P.o[1], p[2] - P.o[2]], n);
      if (d * sgn <= 0.01) continue;
      if (B) { const v = [p[0] - B.o[0], p[1] - B.o[1], p[2] - B.o[2]]; if (!ifcInPoly([dt(v, B.x) / (dt(B.x, B.x) || 1), dt(v, B.y) / (dt(B.y, B.y) || 1)], poly)) continue; }
      out[i] = [p[0], p[1], p[2] - d / n[2]];
    }
  };
  const solid = (id, M, out, foot, depth = 0, fc = null) => {
    const t = T(id), a = A(id); if (!t || depth > 10) return;
    if (t === 'IFCEXTRUDEDAREASOLID' || t === 'IFCEXTRUDEDAREASOLIDTAPERED') {
      const m = R(a[1]) ? mul(M, place(R(a[1]))) : M, d = dir(a[2], [0, 0, 1]), h = +a[3] || 0;
      const pr = profile(R(a[0])); const base = [], top = [];
      for (const p of pr) { const b = app(m, p), tp = app(m, [p[0] + d[0] * h, p[1] + d[1] * h, (p[2] || 0) + d[2] * h]); base.push(b); top.push(tp); out.push(b, tp); }
      if (fc && base.length >= 3) { fc.push(base.slice().reverse(), top); for (let i = 0; i < base.length; i++) { const j = (i + 1) % base.length; fc.push([base[i], base[j], top[j], top[i]]); } }
      const wd = norm(rot(m, d)); if (foot && Math.abs(wd[2]) > 0.9 && base.length >= 3) foot.push(wd[2] > 0 ? base : base.map(p => [p[0], p[1], p[2] + rot(m, d)[2] * h]));
      if (foot && Math.abs(wd[2]) > 0.9 && T(R(a[0])) === 'IFCARBITRARYPROFILEDEFWITHVOIDS') for (const ic of A(R(a[0]))[3] || []) { // profilin iç halkaları: döşeme boşluğu
        const hp = curve(R(ic)).map(p => app(m, p)); if (hp.length >= 3) (foot.holes = foot.holes || []).push(hp);
      }
    } else if (t === 'IFCREVOLVEDAREASOLID' || t === 'IFCREVOLVEDAREASOLIDTAPERED') { // döndürülmüş katı: profil eksen etrafında dilimlenir
      const m = R(a[1]) ? mul(M, place(R(a[1]))) : M, ax = A(R(a[2])), o = pt(ax[0]), d = dir(ax[1], [0, 0, 1]);
      const ang = (num(a[3]) || 0) * rad, n = Math.max(1, Math.ceil(Math.abs(ang) / ARC_STEP));
      for (const p of profile(R(a[0]))) for (let k = 0; k <= n; k++) {
        const g = ang * k / n, c = Math.cos(g), sn = Math.sin(g), v = [p[0] - o[0], p[1] - o[1], (p[2] || 0) - o[2]], dt = v[0] * d[0] + v[1] * d[1] + v[2] * d[2], cr = cross(d, v);
        out.push(app(m, [0, 1, 2].map(i => o[i] + v[i] * c + cr[i] * sn + d[i] * dt * (1 - c))));
      }
    } else if (t === 'IFCBOOLEANCLIPPINGRESULT' || t === 'IFCBOOLEANRESULT') {
      const i0 = out.length;
      solid(R(a[1]), M, out, foot, depth + 1, fc);
      if (a[0] && a[0].e === 'UNION') solid(R(a[2]), M, out, foot, depth + 1, fc);
      else if (a[0] && a[0].e === 'DIFFERENCE') clipHalf(R(a[2]), M, out, i0); // Revit: duvar üstü çatıya / eğik düzleme kırpılır
    } else if (t === 'IFCMAPPEDITEM') {
      const src = A(R(a[0])), m = mul(mul(M, place(R(a[1]))), place(R(src[0])));
      for (const it of A(R(src[1]))[3] || []) solid(R(it), m, out, foot, depth + 1, fc);
    } else if (t === 'IFCFACETEDBREP' || t === 'IFCFACETEDBREPWITHVOIDS' || t === 'IFCCLOSEDSHELL' || t === 'IFCOPENSHELL' || t === 'IFCSHELLBASEDSURFACEMODEL' || t === 'IFCFACEBASEDSURFACEMODEL' || t === 'IFCCONNECTEDFACESET') {
      const shells = t === 'IFCFACETEDBREP' || t === 'IFCFACETEDBREPWITHVOIDS' ? [a[0]] : t === 'IFCSHELLBASEDSURFACEMODEL' || t === 'IFCFACEBASEDSURFACEMODEL' ? a[0] || [] : null;
      if (shells) { for (const s of shells) solid(R(s), M, out, foot, depth + 1, fc); return; }
      const faces = [];
      for (const f of a[0] || []) {
        const bs = A(R(f))[0] || [], hasOuter = bs.some(b => T(R(b)) === 'IFCFACEOUTERBOUND');
        for (const b of bs) { const lp = loopPts(R(A(R(b))[0])).map(p => app(M, p)); if (!lp.length) continue; faces.push(lp); out.push(...lp); if (fc && lp.length >= 3 && (!hasOuter || T(R(b)) === 'IFCFACEOUTERBOUND')) fc.push(lp); } // çatı yüzü: delikler (iç sınır) atlanır
      }
      if (foot && faces.length) footFrom(faces, foot); // tabandaki yatay yüzler = taban poligonu (iç sınırlar delik)
    } else if (t === 'IFCPOLYGONALFACESET' || t === 'IFCTRIANGULATEDFACESET') {
      const cs = (A(R(a[0]))[0] || []).map(c => app(M, [+c[0] || 0, +c[1] || 0, +c[2] || 0])); out.push(...cs);
      if (fc || foot) {
        const tri = t === 'IFCTRIANGULATEDFACESET', idx = tri ? a[3] || [] : (a[2] || []).map(f => A(R(f))[0] || []), faces = [];
        const loop = ix => (ix || []).map(i => cs[(+i || 0) - 1]).filter(Boolean);
        for (const ix of idx) { const f = loop(ix); if (f.length >= 3) { faces.push(f); if (fc) fc.push(f); } }
        if (!tri) for (const f of a[2] || []) if (T(R(f)) === 'IFCINDEXEDPOLYGONALFACEWITHVOIDS') for (const ix of A(R(f))[1] || []) { const h = loop(ix); if (h.length >= 3) faces.push(h); } // iç halkalar
        if (foot && faces.length) footFrom(faces, foot);
      }
    } else if (t === 'IFCBOUNDINGBOX') {
      const c = pt(a[0]), x = +a[1] || 0, y = +a[2] || 0, z = +a[3] || 0;
      for (const p of [[0, 0, 0], [x, 0, 0], [0, y, 0], [x, y, 0], [0, 0, z], [x, 0, z], [0, y, z], [x, y, z]]) out.push(app(M, [c[0] + p[0], c[1] + p[1], c[2] + p[2]]));
    }
  };
  // Ürün geometrisi, plan koordinatlarında (cm, y aşağı): body = [x,y,z] noktaları, axis = eksen noktaları, foot = taban poligonları
  const toPlan = p => [p[0] * cm, -p[1] * cm, p[2] * cm];
  const geomCache = new Map();
  const geom = pid => {
    if (geomCache.has(pid)) return geomCache.get(pid);
    const a = A(pid), M = place(R(a[5])), g = { body: [], axis: [], foot: [], M };
    const repList = R(a[6]) ? A(R(a[6]))[2] || [] : [];
    const raw = [], foot = [], fp = [], box = [];
    for (const rv of repList) {
      const ra = A(R(rv)), ident = String(ra[1] || '').toLowerCase();
      if (ident === 'axis') { for (const it of ra[3] || []) { const c = curve(R(it)); if (c.length >= 2) { g.axis = c.map(p => toPlan(app(M, p))); break; } } continue; }
      if (ident === 'footprint') { for (const it of ra[3] || []) { const c = curve(R(it)); if (c.length >= 3) fp.push(c.map(p => app(M, p))); } continue; }
      if (ident === 'box') { for (const it of ra[3] || []) solid(R(it), M, box, null); continue; }
      if (ident && ident !== 'body' && ident !== 'facetation' && ident !== 'mappedrepresentation') continue;
      for (const it of ra[3] || []) solid(R(it), M, raw, foot);
    }
    g.body = (raw.length ? raw : box).map(toPlan);
    g.foot = (fp.length ? fp : foot).map(f => f.map(toPlan));
    g.holes = (foot.holes || []).map(f => f.map(toPlan));
    geomCache.set(pid, g); return g;
  };

  const facesOf = pid => {
    const a = A(pid), M = place(R(a[5])), fc = [], tmp = [];
    for (const rv of R(a[6]) ? A(R(a[6]))[2] || [] : []) {
      const ra = A(R(rv)), ident = String(ra[1] || '').toLowerCase();
      if (ident && ident !== 'body' && ident !== 'facetation' && ident !== 'mappedrepresentation') continue;
      for (const it of ra[3] || []) solid(R(it), M, tmp, null, 0, fc);
    }
    return fc.map(f => f.map(toPlan));
  };

  // korkuluğun gerçek izi: yüzlerin plandaki uzun kenarları doğrultu + konuma göre kümelenir; aynı çizgideki kenarlar (şeridin iki
  // yüzü, cam + küpeşte) tek bir kol olur, kolun orta çizgisi bir parça. Tek parça L / kırık breplerde de çalışır. → { segs, t } | null
  const railSegs = pid => {
    const edges = [];
    for (const f of facesOf(pid)) for (let i = 0; i < f.length; i++) {
      const p = f[i], q = f[(i + 1) % f.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 20) continue;
      let ang = Math.atan2(q[1] - p[1], q[0] - p[0]); if (ang < 0) ang += Math.PI; if (ang >= Math.PI - 1e-9) ang -= Math.PI;
      edges.push({ p, q, L, ang });
    }
    if (!edges.length) return null;
    edges.sort((x, y) => y.L - x.L);
    const groups = [];
    for (const e of edges) {
      let g = null;
      for (const c of groups) {
        let da = Math.abs(e.ang - c.ang); da = Math.min(da, Math.PI - da); if (da > 0.035) continue;
        const o1 = (e.p[0] - c.o[0]) * -c.u[1] + (e.p[1] - c.o[1]) * c.u[0], o2 = (e.q[0] - c.o[0]) * -c.u[1] + (e.q[1] - c.o[1]) * c.u[0];
        if (Math.abs(o1) > 15 || Math.abs(o2) > 15) continue;
        const s1 = (e.p[0] - c.o[0]) * c.u[0] + (e.p[1] - c.o[1]) * c.u[1], s2 = (e.q[0] - c.o[0]) * c.u[0] + (e.q[1] - c.o[1]) * c.u[1];
        if (Math.min(s1, s2) > c.s1 + 5 || Math.max(s1, s2) < c.s0 - 5) continue; // aynı çizgide ama ayrı kol
        g = c; g.s0 = Math.min(g.s0, s1, s2); g.s1 = Math.max(g.s1, s1, s2); g.f0 = Math.min(g.f0, o1, o2); g.f1 = Math.max(g.f1, o1, o2); break;
      }
      if (!g) { const u = [(e.q[0] - e.p[0]) / e.L, (e.q[1] - e.p[1]) / e.L]; groups.push({ ang: e.ang, u, o: e.p, s0: 0, s1: e.L, f0: 0, f1: 0 }); }
    }
    const segs = [], ts = [];
    for (const c of groups) {
      if (c.s1 - c.s0 < 30) continue;
      const m = (c.f0 + c.f1) / 2, ox = c.o[0] - c.u[1] * m, oy = c.o[1] + c.u[0] * m;
      segs.push([{ x: ox + c.u[0] * c.s0, y: oy + c.u[1] * c.s0 }, { x: ox + c.u[0] * c.s1, y: oy + c.u[1] * c.s1 }]); ts.push(c.f1 - c.f0);
    }
    if (!segs.length) return null;
    ts.sort((x, y) => x - y);
    return { segs, t: ts[ts.length >> 1] || 6 };
  };

  /* --- İlişkiler --- */
  const parent = new Map(), kids = new Map(), voidHost = new Map(), fillOf = new Map(), matOf = new Map(), typeOf = new Map();
  for (const r of db.byType.get('IFCRELCONTAINEDINSPATIALSTRUCTURE') || []) { const a = A(r); for (const e of a[4] || []) parent.set(R(e), R(a[5])); }
  for (const r of db.byType.get('IFCRELAGGREGATES') || []) { const a = A(r); for (const e of a[5] || []) { parent.set(R(e), R(a[4])); let l = kids.get(R(a[4])); if (!l) kids.set(R(a[4]), l = []); l.push(R(e)); } }
  for (const r of db.byType.get('IFCRELVOIDSELEMENT') || []) { const a = A(r); voidHost.set(R(a[5]), R(a[4])); }
  for (const r of db.byType.get('IFCRELFILLSELEMENT') || []) { const a = A(r); fillOf.set(R(a[5]), R(a[4])); }
  for (const r of db.byType.get('IFCRELASSOCIATESMATERIAL') || []) { const a = A(r); for (const e of a[4] || []) matOf.set(R(e), R(a[5])); }
  for (const r of db.byType.get('IFCRELDEFINESBYTYPE') || []) { const a = A(r); for (const e of a[4] || []) typeOf.set(R(e), R(a[5])); }
  const allKids = id => { const out = []; for (const c of kids.get(id) || []) out.push(c, ...allKids(c)); return out; };
  // özellik kümeleri (Pset): nesne → küme kimlikleri; propOf(id, /ad/) = ilk eşleşen tekil değer (metin)
  const psets = new Map();
  for (const r of db.byType.get('IFCRELDEFINESBYPROPERTIES') || []) { const a = A(r); for (const e of a[4] || []) { let l = psets.get(R(e)); if (!l) psets.set(R(e), l = []); l.push(R(a[5])); } }
  const propOf = (id, rx) => {
    for (const ps of psets.get(id) || []) {
      if (T(ps) !== 'IFCPROPERTYSET') continue;
      for (const pr of A(ps)[4] || []) { const pa = A(R(pr)); if (T(R(pr)) !== 'IFCPROPERTYSINGLEVALUE' || !rx.test(String(pa[0] || '').trim())) continue; const v = pa[2], sv = v && typeof v === 'object' ? v.v : v; if (sv != null && sv !== '') return String(sv); }
    }
    return '';
  };
  // zemin kaplamaları (IfcCovering FLOORING): mekâna ilişkiyle (IfcRelCoversSpaces / içerme) ya da konumla bağlanır
  const coverOf = new Map();
  for (const r of db.byType.get('IFCRELCOVERSSPACES') || []) { const a = A(r); for (const c of a[5] || []) { let l = coverOf.get(R(a[4])); if (!l) coverOf.set(R(a[4]), l = []); l.push(R(c)); } }
  const layerThick = id => {
    const m = matOf.get(id) || matOf.get(typeOf.get(id)); if (!m) return 0;
    let set = m; if (T(set) === 'IFCMATERIALLAYERSETUSAGE') set = R(A(set)[0]);
    if (T(set) !== 'IFCMATERIALLAYERSET') return 0;
    let s = 0; for (const l of A(set)[0] || []) s += +A(R(l))[1] || 0;
    return s * cm;
  };

  /* --- Renkler ve malzemeler: geometri öğesinin stili (IfcStyledItem → yüzey stili → RGB), yoksa malzemenin stili --- */
  const hx = v => Math.max(0, Math.min(255, Math.round((+v || 0) * 255))).toString(16).padStart(2, '0');
  const styleOf = (id, depth = 0) => { // → { col, tr, name } | null
    if (!id || depth > 5) return null; const t = T(id), a = A(id);
    if (t === 'IFCPRESENTATIONSTYLEASSIGNMENT' || t === 'IFCSURFACESTYLE') { for (const x of (t === 'IFCSURFACESTYLE' ? a[2] : a[0]) || []) { const r = styleOf(R(x), depth + 1); if (r) { if (t === 'IFCSURFACESTYLE' && !r.name) r.name = String(a[0] || ''); return r; } } return null; }
    if (t === 'IFCSURFACESTYLERENDERING' || t === 'IFCSURFACESTYLESHADING') { const c = R(a[0]); if (T(c) !== 'IFCCOLOURRGB') return null; const ca = A(c); return { col: '#' + hx(ca[1]) + hx(ca[2]) + hx(ca[3]), tr: num(a[1]) || 0, name: '' }; }
    return null;
  };
  const stylesOfList = list => { for (const x of list || []) { const r = styleOf(R(x)); if (r) return r; } return null; };
  const itemStyle = new Map();
  for (const id of db.byType.get('IFCSTYLEDITEM') || []) { const a = A(id); if (R(a[0]) && !itemStyle.has(R(a[0]))) { const r = stylesOfList(a[1]); if (r) itemStyle.set(R(a[0]), r); } }
  const matStyle = new Map();
  for (const id of db.byType.get('IFCMATERIALDEFINITIONREPRESENTATION') || []) {
    const a = A(id), m = R(a[3]); if (!m || matStyle.has(m)) continue;
    for (const rp of a[2] || []) for (const si of A(R(rp))[3] || []) { const r = stylesOfList(A(R(si))[1]); if (r && !matStyle.has(m)) matStyle.set(m, r); }
  }
  const matsOf = (id, depth = 0) => { // ürün / tip → IfcMaterial kimlikleri (katman, liste, bileşen, profil kümeleri açılır)
    const one = (m, d) => {
      const t = T(m), a = A(m); if (!m || d > 4) return [];
      if (t === 'IFCMATERIAL') return [m];
      if (t === 'IFCMATERIALLAYERSETUSAGE' || t === 'IFCMATERIALPROFILESETUSAGE') return one(R(a[0]), d + 1);
      if (t === 'IFCMATERIALLAYERSET' || t === 'IFCMATERIALPROFILESET') return (a[t === 'IFCMATERIALLAYERSET' ? 0 : 2] || []).flatMap(x => one(R(x), d + 1));
      if (t === 'IFCMATERIALLAYER') return one(R(a[0]), d + 1);
      if (t === 'IFCMATERIALPROFILE' || t === 'IFCMATERIALCONSTITUENT') return one(R(a[2]), d + 1);
      if (t === 'IFCMATERIALLIST') return (a[0] || []).flatMap(x => one(R(x), d + 1));
      if (t === 'IFCMATERIALCONSTITUENTSET') return (a[2] || []).flatMap(x => one(R(x), d + 1));
      return [];
    };
    return one(matOf.get(id) || matOf.get(typeOf.get(id)), depth);
  };
  const bodyItems = pid => {
    const out = [], a = A(pid);
    const walk = (it, d) => { if (!it || d > 6) return; out.push(it); const t = T(it), ia = A(it); if (t === 'IFCMAPPEDITEM') { for (const x of A(R(A(R(ia[0]))[1]))[3] || []) walk(R(x), d + 1); } else if (t === 'IFCBOOLEANRESULT' || t === 'IFCBOOLEANCLIPPINGRESULT') walk(R(ia[1]), d + 1); };
    for (const rv of R(a[6]) ? A(R(a[6]))[2] || [] : []) { const ra = A(R(rv)), ident = String(ra[1] || '').toLowerCase(); if (ident && ident !== 'body' && ident !== 'facetation' && ident !== 'mappedrepresentation') continue; for (const it of ra[3] || []) walk(R(it), 0); }
    return out;
  };
  // görünüm: col = ilk opak stil (cam şeffaf), glass = şeffaf stil var mı, names = malzeme + stil adları
  const looksCache = new Map();
  const looksOf = id => {
    if (!id) return { col: null, glass: false, names: '' };
    if (looksCache.has(id)) return looksCache.get(id);
    const sts = []; for (const it of bodyItems(id)) if (itemStyle.has(it)) sts.push(itemStyle.get(it));
    const ms = matsOf(id); if (!sts.length) for (const m of ms) if (matStyle.has(m)) sts.push(matStyle.get(m));
    const op = sts.find(x => x.tr < 0.5), names = ms.map(m => String(A(m)[0] || '')).concat(sts.map(x => x.name)).join(' ');
    const r = { col: (op || sts[0] || {}).col || null, glass: sts.some(x => x.tr >= 0.5), names };
    looksCache.set(id, r); return r;
  };
  // parçalardan (montaj / çatı) görünüm: ilk renkli parça
  const looksDeep = id => { let l = looksOf(id); if (l.col) return l; for (const c of kids.get(id) || []) { const k = looksDeep(c); if (k.col) return k; } return l; };

  /* --- Katlar --- */
  const allStoreys = (db.byType.get('IFCBUILDINGSTOREY') || []).map(id => {
    const a = A(id); return { id, name: String(a[2] || a[7] || ''), z: place(R(a[5])).o[2] * cm, elev: num(a[9]) * cm };
  });
  if (allStoreys.length > 1 && allStoreys.every(s => Math.abs(s.z - allStoreys[0].z) < 1) && allStoreys.some(s => !isNaN(s.elev) && Math.abs(s.elev - allStoreys[0].elev) > 1)) allStoreys.forEach(s => { s.z = isNaN(s.elev) ? 0 : s.elev; });
  allStoreys.sort((p, q) => p.z - q.z);
  // yardımcı seviyeler: IFC_LEVEL_MERGE'den yakın seviyeler tek kat olur (uygulamada kat ≥ 100 cm). Kotu ve adı grupta en çok eleman
  // barındıran seviyeden gelir; elemanlar gerçek kotlarını duvar / mobilya elev'i ve döşeme off'u olarak taşır, mesafe kaybolmaz.
  const nIn = new Map(); for (const p of parent.values()) nIn.set(p, (nIn.get(p) || 0) + 1);
  const groups = [];
  for (const s of allStoreys) { const g = groups[groups.length - 1]; if (opts.mergeLevels !== false && g && s.z - g[g.length - 1].z < IFC_LEVEL_MERGE) g.push(s); else groups.push([s]); }
  const storeys = groups.map(g => g.reduce((m, s) => ((nIn.get(s.id) || 0) > (nIn.get(m.id) || 0) ? s : m), g[0]));
  const SBY = new Map(); groups.forEach((g, i) => g.forEach(s => SBY.set(s.id, storeys[i])));
  const merged = allStoreys.length - storeys.length;
  const topOf = s => { const i = storeys.indexOf(s); return i >= 0 && i + 1 < storeys.length ? storeys[i + 1].z : Infinity; };
  const storeyAt = z => { if (!storeys.length) return null; let best = storeys[0]; for (const s of storeys) if (s.z <= z + 30) best = s; return best; };
  // kat: önce içerme ilişkisi; ama geometri o katın kot aralığı dışındaysa (Revit'te üst kata bağlı, eksi ofsetli eleman) gerçek kota göre
  const storeyOf = (id, z) => {
    let nom = null; for (let p = parent.get(id), k = 0; p && k < 30; p = parent.get(p), k++) if (SBY.has(p)) { nom = SBY.get(p); break; }
    if (nom && (isNaN(z) || (z >= nom.z - 30 && z < topOf(nom) - 30))) return nom;
    return storeyAt(isNaN(z) ? 0 : z) || nom;
  };
  // birden çok katı geçen eleman: kesiştiği her kat için { s, z0 (parçanın tabanı), h }; tek katlıysa storeyOf
  const spanOf = (id, z0, z1, h) => {
    const sp = storeys.filter(s => Math.min(z1, topOf(s)) - Math.max(z0, s.z) > 30);
    if (sp.length < 2) return [{ s: storeyOf(id, z0), z0, h }];
    return sp.map((s, i) => { const b0 = i ? Math.max(z0, s.z) : z0, top = topOf(s), t1 = top < Infinity && z1 > top - 20 ? top - 20 : z1; return { s, z0: b0, h: Math.max(10, Math.min(5000, Math.round(t1 - b0))) }; });
  };
  const bucket = new Map(); // storey id (ya da 0) → { walls, ops, rooms, slabs, voids, furn }
  const fl = s => { const k = s ? s.id : 0; let b = bucket.get(k); if (!b) bucket.set(k, b = { s, walls: [], ops: [], rooms: [], slabs: [], voids: [], furn: [] }); return b; };
  const nameOf = id => { const a = A(id); return String(a[2] || a[7] || '').trim().replace(/:\d+$/, ''); }; // Revit: "Aile:Tip:123456" → kimliksiz
  const typeName = id => (typeOf.get(id) ? nameOf(typeOf.get(id)) : '');
  // Revit çoğu zaman korkulukları IfcBuildingElementProxy olarak verir: adı / tipi korkuluk diyorsa korkuluk say
  const RAIL_RX = /(^|[^a-z])(railing|handrail|guardrail|balustrade|korkuluk|kork_|fence|parmakl)/i;
  const under = (id, types) => { for (let p = parent.get(id), k = 0; p && k < 30; p = parent.get(p), k++) if (types.has(T(p))) return p; return 0; };
  const STAIRISH = new Set(['IFCSTAIR', 'IFCRAMP']), ROOFISH = new Set(['IFCROOF']);
  const railProxy = new Set((db.byType.get('IFCBUILDINGELEMENTPROXY') || []).filter(id => RAIL_RX.test(nameOf(id) + ' ' + typeName(id))));
  const r1 = v => Math.round(v * 10) / 10;
  const zr = pts => { let a = Infinity, b = -Infinity; for (const p of pts) { if (p[2] < a) a = p[2]; if (p[2] > b) b = p[2]; } return [a, b]; };
  const polyOf = g => {
    let best = null, ba = 0;
    for (const f of g.foot) { const ar = Math.abs(ifcArea(f)); if (ar > ba) { ba = ar; best = f; } }
    const pts = best || (g.body.length >= 3 ? ifcHull(g.body) : null);
    return pts ? ifcCleanPoly(pts.map(p => ({ x: r1(p[0]), y: r1(p[1]) }))) : null;
  };

  /* --- Duvarlar --- */
  const wallsOf = new Map(); // IFC duvar id → plan duvarları
  const railsOfStair = new Map(); // merdiven / rampa id → içindeki korkuluk id'leri (merdivenin kendi korkuluğu olur)
  for (const id of [...ids(new Set([...IFC_WALLS, ...IFC_RAILINGS])), ...railProxy]) {
    const t = T(id); let g = geom(id);
    if ((IFC_RAILINGS.has(t) || railProxy.has(id)) && under(id, STAIRISH)) { const st = under(id, STAIRISH); railsOfStair.set(st, (railsOfStair.get(st) || []).concat(id)); continue; }
    const rail = IFC_RAILINGS.has(t) || railProxy.has(id) ? (/fence|[çc]it\b|garden|bah[çc]e|parmakl/i.test(nameOf(id) + ' ' + typeName(id)) ? 'fence' : 'railing') : '';
    if (!g.body.length && !g.axis.length) {
      const ch = kids.get(id) || [];
      if (ch.some(c => IFC_WALLS.has(T(c)))) continue; // yığma duvar: parçaları ayrıca gelir
      const body = []; for (const c of ch) body.push(...geom(c).body);
      g = { body, axis: [], foot: [] };
    }
    if (!g.body.length && g.axis.length < 2) { stats.skipped++; continue; }
    const [z0, z1] = g.body.length ? zr(g.body) : [g.axis[0][2], g.axis[0][2] + 270];
    let h = Math.max(10, Math.min(5000, Math.round(z1 - z0) || 270));
    if (rail && h > 200) h = 100; // eğimli merdiven korkuluğu: düz korkuluk yüksekliği
    const curtain = t === 'IFCCURTAINWALL';
    let axis = g.axis.map(p => ({ x: p[0], y: p[1] }));
    if (axis.length >= 2 && axis.length > 2) { // düz mü? (sapma < 1 cm)
      const a0 = axis[0], b0 = axis[axis.length - 1], L = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1;
      if (axis.every(p => Math.abs((p.x - a0.x) * (b0.y - a0.y) - (p.y - a0.y) * (b0.x - a0.x)) / L < 1)) axis = [a0, b0];
    }
    if (axis.length < 2) axis = ifcPca(g.body);
    if (!axis || axis.length < 2) { stats.skipped++; continue; }
    let th = 0;
    if (axis.length === 2 && g.body.length) { // gövdeden kalınlık ve gerçek orta çizgi
      const a0 = axis[0], b0 = axis[1], L = Math.hypot(b0.x - a0.x, b0.y - a0.y);
      if (L > 0.5) {
        const nx = -(b0.y - a0.y) / L, ny = (b0.x - a0.x) / L; let mn = Infinity, mx = -Infinity;
        for (const p of g.body) { const s = (p[0] - a0.x) * nx + (p[1] - a0.y) * ny; if (s < mn) mn = s; if (s > mx) mx = s; }
        if (mx - mn >= 0.5 && mx - mn <= 500) { th = mx - mn; const c = (mn + mx) / 2; axis = axis.map(p => ({ x: p.x + nx * c, y: p.y + ny * c })); }
      }
    }
    if (!th) th = layerThick(id);
    if (!th) th = curtain ? 10 : rail ? 6 : 20;
    th = rail ? Math.max(2, Math.min(10, Math.round(th * 2) / 2)) : Math.max(curtain ? 2 : 5, Math.min(300, Math.round(th * 2) / 2));
    const segs = [], look = looksDeep(id);
    let pairs = axis.slice(1).map((b0, k) => [axis[k], b0]);
    let rstyle = null;
    if (rail) { // korkuluk: gerçek iz (L / kırık) ve stil
      const rsg = railSegs(id); if (rsg && rsg.segs.length) { pairs = rsg.segs.map(([p, q]) => [p, q]); th = Math.max(2, Math.min(10, Math.round(rsg.t * 2) / 2)); }
      if (rail === 'railing') rstyle = ifcPick(IFC_RAIL_STYLE, nameOf(id) + ' ' + typeName(id) + ' ' + look.names) || (look.glass ? 'glass' : null);
    }
    for (const pc of rail ? [{ s: storeyOf(id, z0), z0, h }] : spanOf(id, z0, z1, h)) {
      const b = fl(pc.s);
      for (const [a0, b0] of pairs) {
        if (Math.hypot(b0.x - a0.x, b0.y - a0.y) < 1) continue;
        const w = { id: uid(), a: { x: r1(a0.x), y: r1(a0.y) }, b: { x: r1(b0.x), y: r1(b0.y) }, t: th, h: pc.h, wt: rail || (curtain ? 'curtain' : 'solid') };
        if (rstyle && rstyle !== 'bars') w.rs = rstyle;
        if (look.col && (rail || (!curtain && !ifcNeutral(look.col)))) w.color = look.col; // boya: gri / beyaz duvar varsayılan kalır
        const we = Math.round(pc.z0 - (pc.s ? pc.s.z : 0)); if (Math.abs(we) >= 3) w.elev = Math.max(-500, Math.min(500, we)); // taban kotu (kata göre)
        Object.defineProperty(w, '_z0', { value: pc.z0, enumerable: false, writable: true });
        b.walls.push(w); segs.push(w);
      }
    }
    if (curtain && segs.length) { // kayıtlar (#71): düşey IfcMember'lar duvar boyunca sayılır → mulN (varsayılan 120 cm modülden farklıysa)
      const ms = [];
      for (const c of allKids(id)) {
        if (T(c) !== 'IFCMEMBER') continue; const mb = geom(c).body; if (!mb.length) continue;
        const [m0, m1] = zr(mb); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, cx = 0, cy = 0;
        for (const p of mb) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); cx += p[0]; cy += p[1]; }
        if (m1 - m0 > 1.5 * Math.max(x1 - x0, y1 - y0)) ms.push([cx / mb.length, cy / mb.length]); // düşey kayıt
      }
      if (ms.length) for (const w of segs) {
        const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1, ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L, pos = [];
        for (const c of ms) { const sp = (c[0] - w.a.x) * ux + (c[1] - w.a.y) * uy, off = Math.abs((c[0] - w.a.x) * uy - (c[1] - w.a.y) * ux); if (off < 40 && sp > 12 && sp < L - 12) pos.push(sp); }
        pos.sort((p, q) => p - q); let n = 0, last = -Infinity; for (const sp of pos) if (sp - last > 5) { n++; last = sp; }
        if (n !== Math.max(1, Math.round(L / 120)) - 1) w.mulN = n;
      }
    }
    if (segs.length) { wallsOf.set(id, segs); if (rail) stats.railings += segs.length; else stats.walls += segs.length; } else stats.skipped++;
  }
  for (const b of bucket.values()) ifcJoinWalls(b.walls);

  /* --- Kapı / pencere / açıklık --- */
  const nearestWall = (walls, cx, cy) => {
    let best = null, bd = Infinity;
    for (const w of walls) { const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L2 = dx * dx + dy * dy || 1; const u = Math.max(0, Math.min(1, ((cx - w.a.x) * dx + (cy - w.a.y) * dy) / L2)); const d = Math.hypot(w.a.x + dx * u - cx, w.a.y + dy * u - cy); if (d < bd) { bd = d; best = w; } }
    return { w: best, d: bd };
  };
  const doorOps = fid => { // OperationType: kapının kendisinde (IFC4) ve tipinde / stilinde
    const ops = []; const a = A(fid); if (a[11] && a[11].e) ops.push(a[11].e);
    const ty = typeOf.get(fid); if (ty) { const ta = A(ty); for (const v of [ta[8], ta[10]]) if (v && v.e) ops.push(v.e); }
    return ops.join(' ');
  };
  const opTypeOf = (fid, width) => {
    if (IFC_WINDOWS.has(T(fid))) return 'window';
    const s = doorOps(fid);
    if (/SLIDING/.test(s)) return 'slide';
    if (/DOUBLE/.test(s)) return 'double';
    return width >= 150 ? 'double' : 'door';
  };
  const filled = new Set(fillOf.values());
  // Revit pencere / kapı ailelerini çoğu zaman IfcBuildingElementProxy olarak, IfcRelFillsElement olmadan verir: gövde merkezi
  // dolgusuz bir açıklığın içinde kalan proxy o açıklığın penceresi / kapısı olur (ayrıca şekil olarak eklenmez)
  const proxyFill = new Map(), usedProxy = new Set();
  {
    const cen = b => { let x = 0, y = 0, z = 0; for (const p of b) { x += p[0]; y += p[1]; z += p[2]; } return [x / b.length, y / b.length, z / b.length]; };
    const prox = (db.byType.get('IFCBUILDINGELEMENTPROXY') || []).filter(id => !railProxy.has(id) && geom(id).body.length).map(id => ({ id, c: cen(geom(id).body) }));
    for (const oid of ids(IFC_OPENINGS)) {
      if (filled.has(oid) || !prox.length) continue; const b = geom(oid).body; if (!b.length) continue;
      const [z0, z1] = zr(b); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of b) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
      const oc = cen(b); let best = 0, bd = Infinity;
      for (const q of prox) {
        const c = q.c; if (usedProxy.has(q.id) || c[0] < x0 - 10 || c[0] > x1 + 10 || c[1] < y0 - 10 || c[1] > y1 + 10 || c[2] < z0 - 10 || c[2] > z1 + 10) continue;
        const dd = Math.hypot(c[0] - oc[0], c[1] - oc[1], c[2] - oc[2]); if (dd < bd) { bd = dd; best = q.id; }
      }
      if (best) { proxyFill.set(oid, best); usedProxy.add(best); }
    }
  }
  const jobs = [];
  for (const fid of ids(new Set([...IFC_DOORS, ...IFC_WINDOWS]))) jobs.push({ fid, oid: fillOf.get(fid) || 0 });
  for (const oid of ids(IFC_OPENINGS)) if (!filled.has(oid)) jobs.push({ fid: 0, oid, px: proxyFill.get(oid) || 0 });
  for (const { fid, oid, px = 0 } of jobs) {
    const host = oid ? voidHost.get(oid) : 0;
    if (oid && host && IFC_SLABS.has(T(host))) continue; // döşeme boşluğu: aşağıda
    let pts = oid ? geom(oid).body : []; if (!pts.length && fid) pts = geom(fid).body;
    if (!pts.length) { stats.skipped++; continue; }
    let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
    const [z0, z1] = zr(pts);
    let cand = wallsOf.get(host);
    if (cand && cand.length > 1) { const inZ = cand.filter(w => z0 >= w._z0 - 30 && z0 < w._z0 + w.h); if (inZ.length) cand = inZ; }
    if (!cand && fid) { const cw = under(fid, IFC_WALLS); if (cw) cand = wallsOf.get(cw); } // giydirme cephenin içindeki (açıklıksız) kapı / pencere
    if (!cand) { const st = storeyOf(fid || oid, z0); cand = fl(st).walls; }
    const { w, d: dd } = nearestWall(cand, cx, cy);
    if (!w || dd > w.t / 2 + 60) { stats.skipped++; continue; }
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y), ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
    let mn = Infinity, mx = -Infinity; for (const p of pts) { const s = (p[0] - w.a.x) * ux + (p[1] - w.a.y) * uy; if (s < mn) mn = s; if (s > mx) mx = s; }
    const fa = fid ? A(fid) : [];
    let ow = mx - mn, oh = z1 - z0;
    if (!(ow > 5) && num(fa[9]) > 0) ow = num(fa[9]) * cm;
    if (!(oh > 5) && num(fa[8]) > 0) oh = num(fa[8]) * cm;
    ow = Math.max(10, Math.min(L, Math.round(ow))); oh = Math.max(10, Math.min(w.h, Math.round(oh)));
    let sill = Math.round(z0 - (w._z0 == null ? z0 : w._z0)); if (sill < 5) sill = 0;
    sill = Math.max(0, Math.min(w.h - oh, sill));
    const pxName = px ? nameOf(px) + ' ' + typeName(px) : '', pxDoor = /door|kap[ıi]/i.test(pxName), pxWin = /window|pencere/i.test(pxName);
    const type = fid ? opTypeOf(fid, ow) : px ? (pxDoor || (!pxWin && sill <= 5) ? (ow >= 150 ? 'double' : 'door') : 'window') : sill > 5 ? 'window' : 'arch';
    const d = Math.max(ow / 2, Math.min(L - ow / 2, (mn + mx) / 2));
    const st = storeyOf(fid || oid, z0), bk = [...bucket.values()].find(b => b.walls.includes(w)) || fl(st);
    // açılış yönü (#88): kapının yerel +Y ekseni = açıldığı taraf; SOL / SAĞ = +Y yönüne bakınca menteşenin tarafı (sol = yerel −X)
    let side = 1, flip = 0;
    if (fid && type !== 'window') {
      const Md = geom(fid).M, sy = Md.y[0] * -uy - Md.y[1] * ux; // plan: (X, −Y); duvar normali (−uy, ux)
      if (Math.abs(sy) > 0.3) side = sy > 0 ? 1 : -1;
      const os = doorOps(fid), lr = /LEFT/.test(os) && !/RIGHT/.test(os) ? -1 : /RIGHT/.test(os) && !/LEFT/.test(os) ? 1 : 0;
      if (lr) { const hx = (Md.x[0] * ux - Md.x[1] * uy) * lr; if (Math.abs(hx) > 0.3) flip = hx > 0 ? 1 : 0; } // menteşe b ucundaysa çevrik
    }
    const op = { id: uid(), wall: w.id, d: r1(d), w: ow, h: oh, sill, type, flip, side, open: 0 };
    if (fid || px) { // kapı / pencere malzemesi ve renkleri (#41 alanları)
      const lk = looksOf(fid || px);
      if (type !== 'window' && type !== 'arch') { const m = ifcPick(IFC_DOOR_MAT, lk.names) || (lk.glass && !lk.col ? 'glass' : null); if (m) op.mat = m; if (lk.col && m !== 'glass') op.color = lk.col; }
      else if (lk.col) op.frameCol = lk.col;
    }
    bk.ops.push(op);
    stats.ops++;
  }

  /* --- Odalar, döşemeler, döşeme boşlukları --- */
  const isFlooring = c => T(c) === 'IFCCOVERING' && ((A(c)[8] || {}).e === 'FLOORING' || ((A(typeOf.get(c) || 0)[9] || {}).e === 'FLOORING'));
  const finishOfCover = c => { const lk = looksDeep(c); return ifcPick(IFC_FINISH, nameOf(c) + ' ' + typeName(c) + ' ' + lk.names) || (lk.glass ? 'glass' : null); };
  for (const c of db.byType.get('IFCCOVERING') || []) { const sp = parent.get(c); if (sp && T(sp) === 'IFCSPACE') { let l = coverOf.get(sp); if (!l) coverOf.set(sp, l = []); if (!l.includes(c)) l.push(c); } }
  const slabVoided = new Set(); for (const [oid, host] of voidHost) if (IFC_SLABS.has(T(host))) slabVoided.add(host);
  for (const id of db.byType.get('IFCSPACE') || []) {
    const g = geom(id), pts = polyOf(g);
    if (!pts || pts.length < 3 || Math.abs(ifcArea(pts.map(p => [p.x, p.y]))) < 1000) { stats.skipped++; continue; }
    const a = A(id), b = fl(storeyOf(id, g.body.length ? zr(g.body)[0] : 0));
    const nm = String(a[7] || a[2] || '').trim() || tr('Oda ', 'Room ') + (b.rooms.length + 1);
    // zemin kaplaması (#88): özellik kümesi (FloorFinish), sonra mekâna bağlı döşeme kaplaması (IfcCovering FLOORING)
    let fin = ifcPick(IFC_FINISH, propOf(id, IFC_FLOOR_PROP));
    if (!fin) for (const c of coverOf.get(id) || []) { if (!isFlooring(c)) continue; fin = finishOfCover(c); if (fin) break; }
    b.rooms.push({ id: uid(), name: nm.slice(0, 80), color: colors[b.rooms.length % colors.length], floor: fin || 'none', pts }); stats.rooms++;
  }
  // IfcSpace'siz dışa aktarım (Revit'te "Export rooms" kapalı): duvarların çevrelediği kapalı alanlar oda olur
  for (const b of bucket.values()) {
    if (b.rooms.length || b.walls.length < 3) continue;
    for (const pts of ifcRooms(b.walls.filter(w => w.wt === 'solid' || w.wt === 'curtain'))) {
      b.rooms.push({ id: uid(), name: tr('Oda ', 'Room ') + (b.rooms.length + 1), color: colors[b.rooms.length % colors.length], floor: 'none', pts }); stats.rooms++; stats.roomsDetected++;
    }
  }
  // ilişkisiz zemin kaplamaları: merkezi hangi odanın içindeyse o odanın kaplaması
  for (const c of db.byType.get('IFCCOVERING') || []) {
    if (!isFlooring(c)) continue; const g = geom(c); if (!g.body.length) continue;
    const fin = finishOfCover(c); if (!fin) continue;
    let cx = 0, cy = 0; for (const p of g.body) { cx += p[0]; cy += p[1]; } cx /= g.body.length; cy /= g.body.length;
    const rm = fl(storeyOf(c, zr(g.body)[1])).rooms.find(r => r.floor === 'none' && ifcInPoly([cx, cy], r.pts.map(p => [p.x, p.y])));
    if (rm) rm.floor = fin;
  }
  for (const id of ids(IFC_SLABS)) {
    const a = A(id); if ((a[8] && a[8].e === 'ROOF') || under(id, STAIRISH) || under(id, ROOFISH)) continue; // çatı / merdiven sahanlığı: aşağıda
    let g = geom(id);
    if (!g.body.length) { const body = [], foot = [], holes = []; for (const c of kids.get(id) || []) { const cg = geom(c); body.push(...cg.body); foot.push(...cg.foot); holes.push(...(cg.holes || [])); } g = { body, foot, holes, axis: [] }; }
    const pts = polyOf(g); if (!pts || pts.length < 3) { stats.skipped++; continue; }
    const [z0, z1] = zr(g.body), st = storeyOf(id, z1), b = fl(st);
    // profilin / tabanın iç halkaları (#88): IfcRelVoidsElement yoksa merdiven / şaft boşluğu buradan gelir
    if (!slabVoided.has(id)) for (const hp of g.holes || []) {
      const vp = ifcCleanPoly(hp.map(p => ({ x: r1(p[0]), y: r1(p[1]) }))); if (vp.length < 3 || Math.abs(ifcArea(vp.map(p => [p.x, p.y]))) < 400) continue;
      b.voids.push({ id: uid(), name: '', type: 'shaft', pts: vp }); stats.voids++;
    }
    let off = Math.round(z1 - (st ? st.z : 0)); if (Math.abs(off) < 3) off = 0;
    const lk = looksOf(id), fin = ifcPick(IFC_FINISH, lk.names) || (lk.glass ? 'glass' : 'concrete');
    b.slabs.push({ id: uid(), name: String(a[2] || '').slice(0, 80) || tr('Döşeme ', 'Slab ') + (b.slabs.length + 1), floor: fin, color: lk.col && !ifcNeutral(lk.col) ? lk.col : null, t: Math.max(1, Math.min(200, Math.round(z1 - z0) || 20)), off: Math.max(-1000, Math.min(1000, off)), pts });
    stats.slabs++;
  }
  for (const [oid, host] of voidHost) {
    if (!IFC_SLABS.has(T(host)) || !IFC_OPENINGS.has(T(oid))) continue;
    const g = geom(oid), pts = polyOf(g); if (!pts || pts.length < 3) continue;
    const fid = [...fillOf].find(([, o]) => o === oid);
    const b = fl(storeyOf(host, g.body.length ? zr(g.body)[1] : 0));
    b.voids.push({ id: uid(), name: '', type: fid && /STAIR/.test(T(fid[0])) ? 'stair' : 'shaft', pts }); stats.voids++;
  }

  /* --- Kolonlar (yapı iskeleti) ve özel bileşenler / mobilyalar --- */
  const footOf = g => { // ince kesit (2 mm cidarlı T profil) temizlikte çökerse gövdenin dış zarfı
    let pts = polyOf(g); if ((!pts || pts.length < 3 || Math.abs(ifcArea(pts.map(p => [p.x, p.y]))) < 0.5) && g.body.length >= 3) pts = ifcHull(g.body).map(p => ({ x: r1(p[0]), y: r1(p[1]) }));
    if (!pts || pts.length < 3) return null; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } return { pts, x0, y0, x1, y1, ar: Math.abs(ifcArea(pts.map(p => [p.x, p.y]))) }; };
  // çokgen öğe: en küçük dikdörtgenin doğrultusunda (döndürülmüş eleman doğru en / boy / açı alır); pts yerel, merkez 0,0
  const polyItem = (ft, base) => {
    const rc = ifcRect(ft.pts.map(p => [p.x, p.y]));
    if (!rc) { const cx = r1((ft.x0 + ft.x1) / 2), cy = r1((ft.y0 + ft.y1) / 2); return Object.assign(base, { k: 'poly', w: Math.max(1, r1(ft.x1 - ft.x0)), d: Math.max(1, r1(ft.y1 - ft.y0)), x: cx, y: cy, rot: 0, pts: ft.pts.map(p => ({ x: r1(p.x - cx), y: r1(p.y - cy) })) }); }
    const th = rc.rot * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
    return Object.assign(base, { k: 'poly', w: Math.max(1, r1(rc.w)), d: Math.max(1, r1(rc.d)), x: r1(rc.cx), y: r1(rc.cy), rot: r1(((rc.rot % 360) + 360) % 360),
      pts: ft.pts.map(p => { const dx = p.x - rc.cx, dy = p.y - rc.cy; return { x: r1(dx * c + dy * sn), y: r1(-dx * sn + dy * c) }; }) });
  };
  const elevOf = (o, z, st) => { const el = Math.round(z - (st ? st.z : 0)); if (Math.abs(el) >= 3) o.elev = Math.max(-500, Math.min(500, el)); return o; }; // ±500 = FURN_ELEV_MAX (#61); eksi = birleşen alt seviye
  for (const id of ids(IFC_COLUMNS)) {
    const g = geom(id), ft = g.body.length ? footOf(g) : null; if (!ft || ft.ar < 0.5) { stats.skipped++; continue; }
    const [z0, z1] = zr(g.body), h0 = Math.max(10, Math.min(5000, Math.round(z1 - z0)));
    const rc = ifcRect(ft.pts.map(p => [p.x, p.y])), nm = nameOf(id).slice(0, 80);
    const round = !!rc && ft.pts.length >= 8 && Math.abs(rc.w - rc.d) <= Math.max(1, rc.w * 0.04) && ft.ar / (Math.PI * rc.w * rc.d / 4) > 0.9;
    const rect = !round && !!rc && ft.ar / (rc.w * rc.d) > 0.95;
    for (const pc of spanOf(id, z0, z1, h0)) {
      const base = { id: uid(), type: round ? 'column' : 'colSq', name: nm || tr(round ? 'Kolon' : 'Kare Kolon', round ? 'Round Column' : 'Square Column'), icon: '', h: pc.h, color: looksOf(id).col || '#64748b', label: '' };
      const o = round || rect ? Object.assign(base, { k: round ? 'round' : 'rect', w: r1(rc.w), d: r1(rc.d), x: r1(rc.cx), y: r1(rc.cy), rot: round ? 0 : r1(rc.rot) }) : polyItem(ft, Object.assign(base, { type: 'shape', icon: '⬡' }));
      fl(pc.s).furn.push(elevOf(o, pc.z0, pc.s)); stats.columns++;
    }
  }
  // bileşenin ayrı katıları (eşlenen öğeler açılır; montajın parçaları dahil): her biri { pts (plan, cm), st (stil) }
  const leavesOf = pid => {
    const out = [];
    const one = id => {
      const a = A(id), M = place(R(a[5]));
      const go = (it, m, d, sty) => {
        if (!it || d > 5) return; const st0 = itemStyle.get(it) || sty;
        if (T(it) === 'IFCMAPPEDITEM') { const ia = A(it), src = A(R(ia[0])), mm = mul(mul(m, place(R(ia[1]))), place(R(src[0]))); for (const x of A(R(src[1]))[3] || []) go(R(x), mm, d + 1, st0); return; }
        const pts = []; solid(it, m, pts, null); if (pts.length >= 3) out.push({ pts: pts.map(toPlan), st: st0 || null });
      };
      for (const rv of R(a[6]) ? A(R(a[6]))[2] || [] : []) { const ra = A(R(rv)), ident = String(ra[1] || '').toLowerCase(); if (ident && ident !== 'body' && ident !== 'facetation' && ident !== 'mappedrepresentation') continue; for (const it of ra[3] || []) go(R(it), M, 0, null); }
      for (const c of kids.get(id) || []) one(c);
    };
    one(pid); return out;
  };
  // birden çok katı → tek öğe, katı başına bir parça (kutu; dikdörtgen olmayan taban → extrude): ayrı katlardaki bantlar tek dev blok olmaz
  const partsItem = (lv, base, st) => {
    const all = lv.flatMap(l => l.pts), rc = ifcRect(all.map(p => [p[0], p[1]])); if (!rc) return null;
    const [z0, z1] = zr(all), th = rc.rot * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
    const loc = (x, y) => { const dx = x - rc.cx, dy = y - rc.cy; return { x: dx * c + dy * sn, y: -dx * sn + dy * c }; };
    const parts = [];
    for (const l of lv) {
      const lr = ifcRect(l.pts.map(p => [p[0], p[1]])); if (!lr) continue;
      const [lz0, lz1] = zr(l.pts), hl = ifcHull(l.pts), ar = Math.abs(ifcArea(hl)), q = { type: 'box', z: r1(lz0 - z0), h: Math.max(0.5, r1(lz1 - lz0)) };
      if (lr.w * lr.d < 1e-6 || ar / (lr.w * lr.d) > 0.9) { const lc = loc(lr.cx, lr.cy); Object.assign(q, { x: r1(lc.x), y: r1(lc.y), w: Math.max(0.5, r1(lr.w)), d: Math.max(0.5, r1(lr.d)) }); const rr = r1((((lr.rot - rc.rot) % 360) + 360) % 360); if (rr) q.rot = rr; }
      else { // dikdörtgen olmayan: dış zarf yükseltilir
        const lp = hl.map(p => loc(p[0], p[1])); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of lp) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; Object.assign(q, { type: 'extrude', x: r1(cx), y: r1(cy), w: r1(x1 - x0), d: r1(y1 - y0), pts: lp.map(p => ({ x: r1(p.x - cx), y: r1(p.y - cy) })) });
      }
      if (l.st && l.st.col) q.color = l.st.col;
      if (l.st && l.st.tr >= 0.5) q.mat = 'glass';
      parts.push(q);
    }
    if (parts.length < 2) return null;
    const w = Math.max(1, r1(rc.w)), d = Math.max(1, r1(rc.d)), h = Math.max(1, Math.round(z1 - z0));
    return elevOf(Object.assign(base, { k: 'rect', w, d, h, x: r1(rc.cx), y: r1(rc.cy), rot: r1(((rc.rot % 360) + 360) % 360), parts, pbase: { w, d, h }, partsV: 1 }), z0, st); // partsV = PARTS_V
  };
  // katalog eşleme (#88): ad / tip / PredefinedType sözcükleri → katalog öğesi; sofa / bed / table boyuta göre çeşitlenir
  const catFor = (id, ft) => {
    if (!cat) return null;
    const en = [...A(id), ...A(typeOf.get(id) || 0)].filter(v => v && v.e && !/^(NOTDEFINED|USERDEFINED)$/.test(v.e)).map(v => v.e).join(' ');
    let key = ifcCatKey(nameOf(id) + ' ' + typeName(id) + ' ' + String(A(id)[4] || '') + ' ' + en); if (!key) return null;
    const rc = ifcRect(ft.pts.map(p => [p.x, p.y])) || { w: ft.x1 - ft.x0, d: ft.y1 - ft.y0 }, lg = Math.max(rc.w, rc.d), sh = Math.min(rc.w, rc.d);
    const round = ft.pts.length >= 8 && Math.abs(rc.w - rc.d) <= Math.max(2, rc.w * 0.06) && ft.ar / (Math.PI * rc.w * rc.d / 4) > 0.9;
    if (key === 'sofa') key = lg >= 190 ? 'sofa3' : lg >= 130 ? 'sofa2' : 'armchair';
    else if (key === 'bed') key = sh >= 170 && cat.bedK ? 'bedK' : sh >= 125 ? 'bed2' : 'bed1';
    else if (key === 'table') key = round ? 'tableR' : lg >= 170 ? 'table6' : 'table4';
    return cat[key] || null;
  };
  // katalog öğesi: yön ürünün yerleşim ekseninden (IFC +Y = arka = uygulamada yerel −y), ölçüler gövdenin o eksendeki uzanımı
  const catItem = (id, g, def, z0, z1, st) => {
    const th = Math.atan2(-g.M.x[1], g.M.x[0]), c = Math.cos(th), sn = Math.sin(th); let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of g.body) { const s1 = p[0] * c + p[1] * sn, s2 = -p[0] * sn + p[1] * c; a0 = Math.min(a0, s1); a1 = Math.max(a1, s1); b0 = Math.min(b0, s2); b1 = Math.max(b1, s2); }
    let w = a1 - a0, d = b1 - b0, sm = (a0 + a1) / 2, tm = (b0 + b1) / 2, x = sm * c - tm * sn, y = sm * sn + tm * c, rot = th * 180 / Math.PI;
    const rc = ifcRect(g.body.map(p => [p[0], p[1]]));
    if (rc && w * d > rc.w * rc.d * 1.15) { w = rc.w; d = rc.d; x = rc.cx; y = rc.cy; rot = rc.rot; } // yerleşim ekseni gövdeyle hizalı değil: en küçük dikdörtgen
    if ((w < d) !== (def.w < def.d) && Math.max(w, d) > Math.min(w, d) * 1.25 && Math.max(def.w, def.d) > Math.min(def.w, def.d) * 1.25) { [w, d] = [d, w]; rot += 90; } // uzun kenar katalogdaki uzun kenara
    const lk = looksDeep(id);
    return elevOf({ id: uid(), type: def.id, name: (nameOf(id) || tr(def.name, def.en || def.name)).slice(0, 80), icon: def.icon, k: def.k, w: Math.max(5, r1(w)), d: Math.max(5, r1(d)), h: Math.max(1, Math.min(5000, Math.round(z1 - z0))),
      color: lk.col && !ifcNeutral(lk.col) ? lk.col : def.color, x: r1(x), y: r1(y), rot: r1(((rot % 360) + 360) % 360), label: '' }, z0, st);
  };
  const compIds = ids(IFC_COMPONENTS), compSet = new Set(compIds);
  for (const id of compIds) {
    let up = false; for (let p = parent.get(id), k = 0; p && k < 30; p = parent.get(p), k++) if (compSet.has(p)) { up = true; break; }
    if (up || railProxy.has(id) || usedProxy.has(id) || under(id, STAIRISH) || under(id, ROOFISH)) continue; // usedProxy: açıklığın penceresi / kapısı oldu // montajın parçası (montaj tek şekil gelir) ya da korkuluk (duvar olarak geldi)
    let g = geom(id);
    if (!g.body.length) { const body = [], foot = []; for (const c of kids.get(id) || []) { const cg = geom(c); body.push(...cg.body); foot.push(...cg.foot); } g = { body, foot, axis: [] }; }
    const ft = g.body.length ? footOf(g) : null; if (!ft || ft.ar < 0.5 || ft.ar > 4e6) { stats.skipped++; continue; } // ince profiller (5 cm T) de gelir
    const [z0, z1] = zr(g.body), st = storeyOf(id, z0), t = T(id), furnish = t !== 'IFCBUILDINGELEMENTPROXY' && t !== 'IFCELEMENTASSEMBLY';
    const nm = nameOf(id);
    const def = furnish ? catFor(id, ft) : null; // özel mimari elemanlar (proxy / montaj) şekil olarak kalır
    if (def) { fl(st).furn.push(catItem(id, g, def, z0, z1, st)); stats.components++; stats.matched++; continue; }
    if (t === 'IFCFLOWTERMINAL') { stats.skipped++; continue; } // tanınmayan tesisat ucu (menfez, sprinkler …) plana eklenmez
    const base = { id: uid(), type: 'shape', name: (nm || tr('Bileşen', 'Component')).slice(0, 80), icon: '⬡', h: Math.max(1, Math.min(5000, Math.round(z1 - z0))), color: looksDeep(id).col || (furnish ? '#bcaaa4' : '#94a3b8'), label: '' };
    const lv = leavesOf(id), multi = lv.length >= 2 && lv.length <= 64 ? partsItem(lv, base, st) : null; // en çok PARTS_MAX parça
    fl(st).furn.push(multi || elevOf(polyItem(ft, base), z0, st)); stats.components++;
  }

  /* --- Çatılar: IfcRoof (+ parçaları) ve ROOF tipli döşemeler → yüzleriyle 'roof' öğesi --- */
  const roofIds = ids(new Set(['IFCROOF'])).filter(id => !under(id, ROOFISH));
  for (const id of ids(IFC_SLABS)) { const a = A(id); if (a[8] && a[8].e === 'ROOF' && !under(id, ROOFISH)) roofIds.push(id); }
  for (const id of roofIds) {
    let faces = facesOf(id); if (!faces.length) for (const c of allKids(id)) faces.push(...facesOf(c));
    let g = geom(id); if (!g.body.length) { const body = []; for (const c of allKids(id)) body.push(...geom(c).body); g = { body, foot: [], axis: [] }; }
    const pts = faces.length ? faces.flat() : g.body; if (pts.length < 3) { stats.skipped++; continue; }
    const [z0, z1] = zr(pts), st = storeyOf(id, z0);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    if (x1 - x0 < 1 || y1 - y0 < 1) { stats.skipped++; continue; }
    const cx = r1((x0 + x1) / 2), cy = r1((y0 + y1) / 2);
    if (faces.length > IFC_ROOF_MAX_FACES || !faces.length) { // çok karmaşık: taban izinin dışbükey zarfı, kalınlık = yükseklik
      const hl = ifcHull(pts), zt = z1 - z0; faces = [hl.map(p => [p[0], p[1], z0]).reverse(), hl.map(p => [p[0], p[1], z1])];
      for (let i = 0; i < hl.length; i++) { const j = (i + 1) % hl.length; faces.push([[hl[i][0], hl[i][1], z0], [hl[j][0], hl[j][1], z0], [hl[j][0], hl[j][1], z0 + zt], [hl[i][0], hl[i][1], z0 + zt]]); }
    }
    const h = Math.max(1, Math.round(z1 - z0)), w = r1(x1 - x0), d = r1(y1 - y0);
    const o = { id: uid(), type: 'roof', name: (nameOf(id) || tr('Çatı', 'Roof')).slice(0, 80), icon: '', k: 'roof', w, d, h, color: looksDeep(id).col || '#b45309', x: cx, y: cy, rot: 0, label: '',
      faces: faces.map(f => f.map(p => [r1(p[0] - cx), r1(p[1] - cy), r1(p[2] - z0)])), fbase: { w, d, h } };
    fl(st).furn.push(elevOf(o, z0, st)); stats.roofs++;
  }

  /* --- Merdivenler: IfcStair (kolları / sahanlıkları dahil) → parametrik merdiven (k: 'stairs') --- */
  // kolun çıkış yönü: alçak uçtan yükseğe (merdiven ve rampa). Revit kolda yön vermez (yerleşim ekseni yok, yürüme çizgisi yok),
  // yön gövdeden çıkar: noktalara z = a·x + b·y düzlemi oturtulur, eğim (a, b) en dik çıkan dikdörtgen kenarını seçer. Kısa kollar
  // (3 rıht: 55 cm koşu, 255 cm genişlik) böylece enine dönmez; eğim yoksa (tek basamak) eski kural: uzun eksen boyunca.
  const climb = pts => {
    const rc = ifcRect(pts.map(p => [p[0], p[1]])); if (!rc) return null;
    const th = rc.rot * Math.PI / 180; let ux = Math.cos(th), uy = Math.sin(th);
    let mx = 0, my = 0, mz = 0; for (const p of pts) { mx += p[0]; my += p[1]; mz += p[2]; } mx /= pts.length; my /= pts.length; mz /= pts.length;
    let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
    for (const p of pts) { const x = p[0] - mx, y = p[1] - my, z = p[2] - mz; sxx += x * x; sxy += x * y; syy += y * y; sxz += x * z; syz += y * z; }
    const det = sxx * syy - sxy * sxy, ga = det ? (sxz * syy - syz * sxy) / det : 0, gb = det ? (syz * sxx - sxz * sxy) / det : 0;
    const g1 = ga * ux + gb * uy, g2 = -ga * uy + gb * ux; // eğimin dikdörtgen eksenlerindeki bileşenleri
    if (Math.max(Math.abs(g1), Math.abs(g2)) >= 0.05) return Math.abs(g1) >= Math.abs(g2) ? (g1 > 0 ? { x: ux, y: uy } : { x: -ux, y: -uy }) : (g2 > 0 ? { x: -uy, y: ux } : { x: uy, y: -ux });
    if (rc.d > rc.w) [ux, uy] = [-uy, ux];
    let sa = 0, na = 0, sb = 0, nb = 0; for (const p of pts) { const t = (p[0] - rc.cx) * ux + (p[1] - rc.cy) * uy; if (t < 0) { sa += p[2]; na++; } else { sb += p[2]; nb++; } }
    return na && nb && sa / na > sb / nb ? { x: -ux, y: -uy } : { x: ux, y: uy };
  };
  // yerel çerçeve: −y = çıkış yönü u (furn rot: ekranda saat yönü); w / d / merkez bu çerçevedeki uzanımlar
  const frameOf = (body, u) => {
    const ex = { x: -u.y, y: u.x }, ey = { x: -u.x, y: -u.y }; let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of body) { const s1 = p[0] * ex.x + p[1] * ex.y, s2 = p[0] * ey.x + p[1] * ey.y; a0 = Math.min(a0, s1); a1 = Math.max(a1, s1); b0 = Math.min(b0, s2); b1 = Math.max(b1, s2); }
    const sm = (a0 + a1) / 2, tm = (b0 + b1) / 2, rot = Math.atan2(u.x, -u.y) * 180 / Math.PI;
    return { ex, ey, b0, b1, w: a1 - a0, d: b1 - b0, x: r1(sm * ex.x + tm * ey.x), y: r1(sm * ex.y + tm * ey.y), rot: r1(((rot % 360) + 360) % 360) };
  };
  // merdiven / rampa korkulukları: çıkış yönüne göre hangi yanda (sağ = yerel +x) ve stil (cam / halat / parapet)
  const railInfo = (sid, fr) => {
    const rails = railsOfStair.get(sid) || []; let L = false, Rr = false; const names = [];
    for (const rid of rails) {
      const b = geom(rid).body; if (!b.length) continue; let cx = 0, cy = 0; for (const p of b) { cx += p[0]; cy += p[1]; } cx /= b.length; cy /= b.length;
      const lx = (cx - fr.x) * fr.ex.x + (cy - fr.y) * fr.ex.y; if (lx >= 0) Rr = true; else L = true;
      names.push(nameOf(rid), typeName(rid), looksDeep(rid).names, looksDeep(rid).glass ? 'glass' : '');
    }
    const side = L && Rr ? 'both' : Rr ? 'right' : L ? 'left' : 'none', rs = rails.length ? ifcPick(IFC_RAIL_STYLE, names.join(' ')) : null;
    return { side, rs: rs && rs !== 'bars' ? rs : null };
  };
  const stairIds = ids(new Set(['IFCSTAIR'])).filter(id => !under(id, STAIRISH));
  for (const id of ids(new Set(['IFCSTAIRFLIGHT']))) if (!under(id, STAIRISH)) stairIds.push(id);
  for (const id of stairIds) {
    const parts = [id, ...allKids(id)], body = [];
    for (const c of parts) body.push(...geom(c).body);
    if (body.length < 3) { stats.skipped++; continue; }
    const [z0, z1] = zr(body), st = storeyOf(id, z0), H = Math.max(20, Math.round(z1 - z0));
    // kolların çıkış yönleri: uzun eksen boyunca alçak uçtan yükseğe
    const flights = parts.filter(c => T(c) === 'IFCSTAIRFLIGHT');
    const dirs = flights.map(c => ({ c, z: zr(geom(c).body.length ? geom(c).body : [[0, 0, Infinity]])[0], u: geom(c).body.length >= 3 ? climb(geom(c).body) : null })).filter(f => f.u).sort((p, q) => p.z - q.z);
    const u = (dirs[0] && dirs[0].u) || climb(body) || { x: 0, y: -1 };
    const shape = String(((A(id)[8] || {}).e) || '');
    let type = /SPIRAL|CURVED/.test(shape) ? 'spiral' : /HALF_TURN|U_SHAPED|TWO_QUARTER/.test(shape) ? 'u' : /QUARTER|L_SHAPED/.test(shape) ? 'l' : /STRAIGHT/.test(shape) ? 'straight' : '';
    if (!type && dirs.length >= 2) { const v = dirs[dirs.length - 1].u, dt = u.x * v.x + u.y * v.y; type = dt < -0.7 ? 'u' : dt < 0.7 ? 'l' : 'straight'; }
    if (!type) type = 'straight';
    const fr = frameOf(body, u); // −y = ilk kolun çıkış yönü
    let risers = 0; for (const c of flights) { const n = +A(c)[8]; if (n > 0) risers += n; }
    const o = { id: uid(), type: 'stairs', name: (nameOf(id) || tr('Merdiven', 'Stairs')).slice(0, 80), icon: '🪜', k: 'stairs', w: Math.max(40, r1(fr.w)), d: Math.max(40, r1(fr.d)), h: H, color: looksDeep(id).col || '#e2e8f0',
      x: fr.x, y: fr.y, rot: fr.rot, label: '',
      stepN: Math.max(2, Math.min(60, risers || Math.round(H / 17.5))), stairType: type, railing: 'none' };
    { const ri = railInfo(id, fr); o.railing = ri.side; if (ri.rs) o.rs = ri.rs; }
    if (type === 'spiral') { o.w = o.d = Math.max(o.w, o.d); }
    fl(st).furn.push(elevOf(o, z0, st)); stats.stairs++;
  }

  /* --- Rampalar: IfcRamp / IfcRampFlight → parametrik rampa (k: 'ramp'); her kol ayrı rampa (uygulama rampası düz) --- */
  const rampIds = ids(new Set(['IFCRAMP'])).filter(id => !under(id, STAIRISH));
  for (const id of ids(new Set(['IFCRAMPFLIGHT']))) if (!under(id, STAIRISH)) rampIds.push(id);
  for (const id of rampIds) {
    const fls = T(id) === 'IFCRAMP' ? allKids(id).filter(c => T(c) === 'IFCRAMPFLIGHT') : [];
    const runs = fls.length ? fls.map(c => ({ c, body: geom(c).body })) : [{ c: id, body: [id, ...allKids(id)].flatMap(c => geom(c).body) }];
    const nm = nameOf(id);
    for (const { c, body } of runs) {
      if (body.length < 3) { stats.skipped++; continue; }
      const fr = frameOf(body, climb(body) || { x: 0, y: -1 }), { ey, b0, b1 } = fr;
      // yükselme = üst yüzeyin iki uç arasındaki farkı (plaka kalınlığı sayılmaz); alt uç ey ekseninde büyük taraf
      const L = b1 - b0 || 1; let zLo = -Infinity, zHi = -Infinity;
      for (const p of body) { const s2 = p[0] * ey.x + p[1] * ey.y; if (s2 > b1 - L * 0.1) zLo = Math.max(zLo, p[2]); if (s2 < b0 + L * 0.1) zHi = Math.max(zHi, p[2]); }
      const [z0, z1] = zr(body); if (!isFinite(zLo)) zLo = z0; if (!isFinite(zHi)) zHi = z1;
      const st = storeyOf(c, zLo), w = Math.max(40, r1(fr.w));
      const label = nm + ' ' + (c !== id ? nameOf(c) : '') + ' ' + typeName(id);
      const o = { id: uid(), type: 'ramp', name: (nameOf(c) || nm || tr('Rampa', 'Ramp')).slice(0, 80), icon: '♿', k: 'ramp', w, d: Math.max(50, r1(L)), h: Math.max(1, Math.round(zHi - zLo)), color: looksDeep(c).col || looksDeep(id).col || '#d6d3d1',
        x: fr.x, y: fr.y, rot: fr.rot, label: '',
        rampType: ifcWords(label).some(x => /^(car|cars|vehicle|garage|garaj|parking|otopark|araç|arac)$/.test(x)) || w >= 250 ? 'vehicle' : 'accessible', railing: 'none' };
      { const ri = railInfo(id, fr); o.railing = ri.side; if (ri.rs) o.rs = ri.rs; }
      fl(st).furn.push(elevOf(o, zLo, st)); stats.ramps++;
    }
  }

  /* --- Kat listesi, ortak öteleme, kat yükseklikleri --- */
  let floors = [];
  const ordered = storeys.map(s => bucket.get(s.id)).filter(Boolean); if (bucket.has(0)) ordered.unshift(bucket.get(0));
  for (const b of ordered) {
    if (!b.walls.length && !b.rooms.length && !b.slabs.length && !b.furn.length) continue;
    floors.push({ b, f: { id: uid(), name: (b.s && b.s.name) || tr('Kat ', 'Floor ') + (floors.length + 1), walls: b.walls, ops: b.ops, furn: b.furn, rooms: b.rooms, slabs: b.slabs, voids: b.voids, sections: [], dims: [], texts: [], sketches: [], groups: [], slabFloor: 'none', slabColor: null } });
  }
  if (!floors.length) throw new Error('no walls, rooms or slabs found in the IFC file');
  let mnx = Infinity, mny = Infinity;
  const eachPt = fn => { for (const { f } of floors) { for (const w of f.walls) { fn(w.a); fn(w.b); } for (const k of ['rooms', 'slabs', 'voids']) for (const o of f[k]) o.pts.forEach(fn); for (const o of f.furn) fn(o); } };
  // döndürülmüş model (#88: ortak koordinat / gerçek kuzey): baskın duvar doğrultusu plan eksenlerine hizalanır
  if (opts.align !== false) {
    let sC = 0, sS = 0, sL = 0;
    for (const { f } of floors) for (const w of f.walls) { if (w.wt !== 'solid' && w.wt !== 'curtain') continue; const dx = w.b.x - w.a.x, dy = w.b.y - w.a.y, L = Math.hypot(dx, dy), th = Math.atan2(dy, dx) * 4; sC += L * Math.cos(th); sS += L * Math.sin(th); sL += L; }
    const ang = sL ? Math.atan2(sS, sC) / 4 : 0, deg = ang * 180 / Math.PI;
    if (sL && Math.hypot(sC, sS) / sL > 0.6 && Math.abs(deg) >= 0.5) {
      const c = Math.cos(-ang), sn = Math.sin(-ang);
      eachPt(p => { const x = p.x, y = p.y; p.x = x * c - y * sn; p.y = x * sn + y * c; });
      for (const { f } of floors) for (const o of f.furn) o.rot = r1((((o.rot || 0) - deg) % 360 + 360) % 360);
      stats.rotated = r1(deg);
    }
  }
  eachPt(p => { mnx = Math.min(mnx, p.x); mny = Math.min(mny, p.y); });
  const sx = Math.floor(mnx / 100) * 100, sy = Math.floor(mny / 100) * 100;
  eachPt(p => { p.x = r1(p.x - sx); p.y = r1(p.y - sy); });
  const hs = []; for (const { f } of floors) for (const w of f.walls) if (w.wt === 'solid') hs.push(w.h);
  hs.sort((p, q) => p - q);
  const wallH = Math.max(100, Math.min(800, hs.length ? hs[hs.length >> 1] : 270));
  const ts = new Map(); for (const { f } of floors) for (const w of f.walls) if (w.wt === 'solid') ts.set(w.t, (ts.get(w.t) || 0) + 1);
  const wallT = [...ts].sort((p, q) => q[1] - p[1])[0]?.[0] || 20;
  floors.forEach(({ b, f }, k) => {
    const nx = floors[k + 1]; if (!b.s || !nx || !nx.b.s) return;
    const fh = Math.round(nx.b.s.z - b.s.z - 20);
    if (fh >= 100 && fh <= 800 && fh !== wallH) f.wallH = fh;
  });
  stats.floors = floors.length; stats.levelsMerged = merged;
  const pa = proj ? A(proj) : [];
  const nm = String(pa[5] || pa[2] || '').trim();
  const name = (!nm || /^(project name|proje ad[ıi]|default)$/i.test(nm) ? String(opts.name || 'IFC') : nm).slice(0, 80);
  return { project: { v: 2, name, grid: 10, gridType: 'square', wallT, wallH, bg: null, lib: { shapes: [] }, textures: [], floors: floors.map(x => x.f) }, stats };
}
const ifcArea = pts => { let s = 0; for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
// Düzlem dışbükey zarf (Andrew), [x, y] dizisi döner
function ifcHull(pts) {
  const p = pts.map(q => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// Eksen bilgisi olmayan duvar: dışbükey zarfın en küçük alanlı dikdörtgeni, uzun kenarı boyunca orta çizgi
function ifcPca(pts) {
  const rc = ifcRect(pts); if (!rc) return null;
  const L = Math.max(rc.w, rc.d); if (L < 1) return null;
  const th = rc.rot * Math.PI / 180; let ux = Math.cos(th), uy = Math.sin(th); if (rc.d > rc.w) [ux, uy] = [-uy, ux]; // uzun kenar = duvar doğrultusu
  return [{ x: rc.cx - ux * L / 2, y: rc.cy - uy * L / 2 }, { x: rc.cx + ux * L / 2, y: rc.cy + uy * L / 2 }];
}
// En küçük alanlı dikdörtgen: { cx, cy, w, d, rot } (rot: derece, -45..45; w doğrultusu rot yönünde) — kolon kesitleri için
function ifcRect(pts) {
  const h = ifcHull(pts); if (h.length < 2) return null;
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const p = h[i], q = h[(i + 1) % h.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]); if (L < 1e-6) continue;
    const ux = (q[0] - p[0]) / L, uy = (q[1] - p[1]) / L; let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const r of h) { const s = r[0] * ux + r[1] * uy, t = -r[0] * uy + r[1] * ux; a0 = Math.min(a0, s); a1 = Math.max(a1, s); b0 = Math.min(b0, t); b1 = Math.max(b1, t); }
    const ar = (a1 - a0) * (b1 - b0); if (!best || ar < best.ar - 1e-9) best = { ar, ux, uy, a0, a1, b0, b1 };
  }
  if (!best) return null;
  let { ux, uy, a0, a1, b0, b1 } = best;
  const sc = (a0 + a1) / 2, tc = (b0 + b1) / 2, cx = ux * sc - uy * tc, cy = uy * sc + ux * tc;
  let w = a1 - a0, d = b1 - b0, rot = Math.atan2(uy, ux) * 180 / Math.PI;
  while (rot > 45) { rot -= 90; [w, d] = [d, w]; }
  while (rot <= -45) { rot += 90; [w, d] = [d, w]; }
  return { cx, cy, w, d, rot: Math.abs(rot) < 0.05 ? 0 : rot };
}
// Yinelenen ve aynı doğrultudaki köşeleri atar
function ifcCleanPoly(pts) {
  let out = [];
  for (const p of pts) { const l = out[out.length - 1]; if (!l || Math.hypot(l.x - p.x, l.y - p.y) > 0.5) out.push(p); }
  if (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 0.5) out.pop();
  for (let ch = true; ch && out.length > 3;) {
    ch = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
      const L = Math.hypot(c.x - a.x, c.y - a.y) || 1;
      if (Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / L < 0.5) { out.splice(i, 1); ch = true; break; }
    }
  }
  return out;
}
// Köşe ve T birleşimleri: yakın uçları iki duvarın orta çizgilerinin kesişimine taşır (wallJoints ≤ 1 cm uçları birleştirir)
function ifcJoinWalls(walls) {
  const ends = []; for (const w of walls) ends.push({ w, k: 'a' }, { w, k: 'b' });
  const dirOf = w => { const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1; return { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L, L }; };
  const meet = (w1, w2) => { // iki doğrunun kesişimi
    const d1 = dirOf(w1), d2 = dirOf(w2), den = d1.x * d2.y - d1.y * d2.x;
    if (Math.abs(den) < 0.1) return null;
    const t = ((w2.a.x - w1.a.x) * d2.y - (w2.a.y - w1.a.y) * d2.x) / den;
    return { x: w1.a.x + d1.x * t, y: w1.a.y + d1.y * t };
  };
  const done = new Set(), r1 = v => Math.round(v * 10) / 10;
  for (let i = 0; i < ends.length; i++) {
    const e1 = ends[i]; if (done.has(e1)) continue;
    const p1 = e1.w[e1.k]; let best = null, bd = Infinity;
    for (let j = 0; j < ends.length; j++) {
      const e2 = ends[j]; if (e2.w === e1.w || done.has(e2)) continue;
      const p2 = e2.w[e2.k], d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
      if (d < bd) { bd = d; best = e2; }
    }
    if (best && bd < Math.max(e1.w.t, best.w.t) * 0.75 + 1) {
      const X = meet(e1.w, best.w), tol = Math.max(e1.w.t, best.w.t) * 1.5 + 1;
      const p2 = best.w[best.k];
      if (X && Math.hypot(X.x - p1.x, X.y - p1.y) < tol && Math.hypot(X.x - p2.x, X.y - p2.y) < tol) { p1.x = p2.x = r1(X.x); p1.y = p2.y = r1(X.y); }
      else if (bd > 0) { p1.x = p2.x = r1((p1.x + p2.x) / 2); p1.y = p2.y = r1((p1.y + p2.y) / 2); }
      done.add(e1); done.add(best); continue;
    }
    // T birleşimi: uç başka bir duvarın gövdesine yakın ama ona ulaşmıyorsa orta çizgisine uzat
    for (const w of walls) {
      if (w === e1.w) continue;
      const d = dirOf(w), s = (p1.x - w.a.x) * d.x + (p1.y - w.a.y) * d.y;
      if (s < 0 || s > d.L) continue;
      const off = Math.abs((p1.x - w.a.x) * d.y - (p1.y - w.a.y) * d.x);
      if (off > w.t / 2 + 0.5 && off < w.t / 2 + Math.max(w.t, e1.w.t) * 0.75 + 1) {
        const X = meet(e1.w, w); if (X && Math.hypot(X.x - p1.x, X.y - p1.y) < w.t + e1.w.t) { p1.x = r1(X.x); p1.y = r1(X.y); done.add(e1); }
        break;
      }
    }
  }
  return walls;
}
// Nokta poligonun içinde mi ([x, y] dizileri)
function ifcInPoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
  return c;
}
// Aynı düzlemdeki yüzlerin birleşiminin sınır halkaları: yalnızca tek yüzde geçen kenarlar zincirlenir (q: koordinat → tam sayı çarpanı)
function ifcOutline(faces, q) {
  const K = p => Math.round(p[0] * q) + ',' + Math.round(p[1] * q), edges = new Map();
  for (const f of faces) for (let i = 0; i < f.length; i++) {
    const a = f[i], b = f[(i + 1) % f.length], ka = K(a), kb = K(b); if (ka === kb) continue;
    const k = ka < kb ? ka + '|' + kb : kb + '|' + ka, e = edges.get(k);
    if (e) e.n++; else edges.set(k, { a, b, ka, kb, n: 1 });
  }
  const adj = new Map(), link = (k, e) => { let l = adj.get(k); if (!l) adj.set(k, l = []); l.push(e); };
  for (const e of edges.values()) if (e.n === 1) { link(e.ka, e); link(e.kb, e); }
  const loops = [], used = new Set();
  for (const e0 of edges.values()) {
    if (e0.n !== 1 || used.has(e0)) continue;
    const loop = [e0.a]; let at = e0.kb, pt = e0.b; used.add(e0);
    for (let guard = 0; guard < 200000 && at !== e0.ka; guard++) {
      loop.push(pt);
      const nx = (adj.get(at) || []).find(x => !used.has(x)); if (!nx) break;
      used.add(nx); if (nx.ka === at) { at = nx.kb; pt = nx.b; } else { at = nx.ka; pt = nx.a; }
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}
// Üç noktadan geçen yayın ara noktaları (uçlar hariç); doğrusal noktalar → orta nokta
function ifcArc3(a, m, b, step) {
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1])); if (Math.abs(d) < 1e-12) return [m];
  const a2 = a[0] * a[0] + a[1] * a[1], m2 = m[0] * m[0] + m[1] * m[1], b2 = b[0] * b[0] + b[1] * b[1];
  const cx = (a2 * (m[1] - b[1]) + m2 * (b[1] - a[1]) + b2 * (a[1] - m[1])) / d, cy = (a2 * (b[0] - m[0]) + m2 * (a[0] - b[0]) + b2 * (m[0] - a[0])) / d;
  const r = Math.hypot(a[0] - cx, a[1] - cy), g1 = Math.atan2(a[1] - cy, a[0] - cx); let g2 = Math.atan2(b[1] - cy, b[0] - cx);
  if ((m[0] - a[0]) * (b[1] - m[1]) - (m[1] - a[1]) * (b[0] - m[0]) > 0) { while (g2 <= g1) g2 += 2 * Math.PI; } else { while (g2 >= g1) g2 -= 2 * Math.PI; }
  const n = Math.max(2, Math.ceil(Math.abs(g2 - g1) / step)), out = [];
  for (let k = 1; k < n; k++) { const g = g1 + (g2 - g1) * k / n; out.push([cx + r * Math.cos(g), cy + r * Math.sin(g), a[2] || 0]); }
  return out;
}
// Poligonu içe doğru d kadar öteler (köşeler gönye); sonuç bozulursa poligon olduğu gibi döner
function ifcInset(pts, d) {
  const n = pts.length, ar = ifcArea(pts.map(p => [p.x, p.y])), sg = ar > 0 ? 1 : -1, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1, l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const n1 = { x: -(p1.y - p0.y) / l1 * sg, y: (p1.x - p0.x) / l1 * sg }, n2 = { x: -(p2.y - p1.y) / l2 * sg, y: (p2.x - p1.x) / l2 * sg };
    const k = 1 + n1.x * n2.x + n1.y * n2.y; // gönye: (n1 + n2) / (1 + n1·n2)
    if (k < 0.2) out.push({ x: p1.x + (n1.x + n2.x) / 2 * d, y: p1.y + (n1.y + n2.y) / 2 * d });
    else out.push({ x: p1.x + (n1.x + n2.x) / k * d, y: p1.y + (n1.y + n2.y) / k * d });
  }
  const a2 = ifcArea(out.map(p => [p.x, p.y]));
  return a2 * sg > 0 && Math.abs(a2) < Math.abs(ar) && Math.abs(a2) > Math.abs(ar) * 0.3 ? out : pts;
}
// Duvar orta çizgilerinin çevrelediği kapalı alanlar (IfcSpace yoksa oda algılama): parçalar kesişimlerde bölünür,
// açıkta kalan uçlar budanır, düzlemsel grafın iç yüzleri izlenir; her yüz yarım duvar kalınlığı içe alınır → [{x, y}, …] listesi
function ifcRooms(walls) {
  const segs = walls.filter(w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) > 1);
  if (segs.length < 3 || segs.length > 1500) return [];
  const nodes = new Map();
  const node = (x, y) => { // 2 cm ızgara, komşu hücrelerde 1,5 cm içindeki düğüm aynı sayılır
    const gx = Math.round(x / 2), gy = Math.round(y / 2);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const o = nodes.get((gx + i) + ',' + (gy + j)); if (o && Math.hypot(o.x - x, o.y - y) < 1.5) return o; }
    const o = { x, y, out: [] }; nodes.set(gx + ',' + gy, o); return o;
  };
  const link = (p, q) => { if (p === q || p.out.some(e => e.to === q)) return; p.out.push({ to: q, ang: Math.atan2(q.y - p.y, q.x - p.x) }); q.out.push({ to: p, ang: Math.atan2(p.y - q.y, p.x - q.x) }); };
  for (const s of segs) {
    const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L = Math.hypot(dx, dy), ts = [0, 1];
    for (const o of segs) {
      if (o === s) continue;
      const ex = o.b.x - o.a.x, ey = o.b.y - o.a.y, Lo = Math.hypot(ex, ey), den = dx * ey - dy * ex;
      if (Math.abs(den) < 0.02 * L * Lo) continue; // paralel
      const t = ((o.a.x - s.a.x) * ey - (o.a.y - s.a.y) * ex) / den, u = ((o.a.x - s.a.x) * dy - (o.a.y - s.a.y) * dx) / den;
      const tt = (o.t / 2 + 3) / L, tu = (s.t / 2 + 3) / Lo; // uç, diğer duvarın gövdesine değiyorsa birleşmiş say
      if (t > -tt && t < 1 + tt && u > -tu && u < 1 + tu) ts.push(t);
    }
    ts.sort((p, q) => p - q);
    let prev = null;
    for (const t of ts) { const nd = node(s.a.x + dx * t, s.a.y + dy * t); if (prev) link(prev, nd); prev = nd; }
  }
  const all = [...nodes.values()];
  for (let ch = true; ch;) { ch = false; for (const nd of all) if (nd.out.length === 1) { const o = nd.out[0].to; o.out = o.out.filter(e => e.to !== nd); nd.out = []; ch = true; } } // açık uçlar
  for (const nd of all) nd.out.sort((p, q) => p.ang - q.ang);
  const seen = new Set(), rooms = [], ts2 = segs.map(w => w.t).sort((p, q) => p - q), half = (ts2[ts2.length >> 1] || 20) / 2;
  for (const nd of all) for (const e0 of nd.out) {
    if (seen.has(e0)) continue;
    const face = []; let from = nd, e = e0, ok = true;
    for (let guard = 0; guard < 5000; guard++) {
      seen.add(e); face.push(from);
      const v = e.to, i = v.out.findIndex(x => x.to === from); if (i < 0) { ok = false; break; }
      const nx = v.out[(i - 1 + v.out.length) % v.out.length]; // ters kenardan saat yönünde sonraki = yüz solda kalır
      from = v; e = nx;
      if (from === nd && e === e0) break;
      if (guard === 4999) ok = false;
    }
    if (!ok || face.length < 3) continue;
    const ar = ifcArea(face.map(p => [p.x, p.y])); if (ar < 10000) continue; // iç yüzler pozitif; dış sınır negatif; 1 m² altı atılır
    const pts = ifcCleanPoly(ifcInset(ifcCleanPoly(face.map(p => ({ x: p.x, y: p.y }))), half).map(p => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })));
    if (pts.length >= 3) rooms.push(pts);
  }
  return rooms;
}
/* IFC-IMPORT:END */
const CAT_PARTS = { billiard: billiardParts }; // mirror of CAT_PARTS in app.js

/* ---------- Project state ---------- */
let P = null; // working project (same schema the app saves/loads)

function newFloor(name) { return { id: uid(), name: name || 'Zemin Kat', walls: [], ops: [], furn: [], rooms: [], slabs: [], voids: [], sections: [], dims: [], texts: [], sketches: [], drafts: [], groups: [], slabFloor: 'none', slabColor: null }; }
function newProject(a) {
  a = a || {};
  return {
    v: 2,
    name: a.name || 'New Project',
    grid: num(a.grid, 10, 'grid'),
    gridType: 'square',
    wallT: num(a.wallT, 20, 'wallT'),
    wallH: num(a.wallH, 270, 'wallH'),
    bg: null,
    lib: { shapes: [], presets: [] },
    textures: [],
    floors: [newFloor(a.floorName)],
  };
}
/* Same defaults as loadProject() in app.js so old/agent-made JSON always loads. */
function normalizeProject(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.floors) || !obj.floors.length)
    throw new Error('Not a floor planner project: expected an object with a non-empty "floors" array (export JSON from the app, or start from new_project)');
  obj.v = obj.v || 2;
  obj.name = obj.name || 'New Project';
  obj.grid = +obj.grid || 10; obj.gridType = obj.gridType || 'square';
  obj.wallT = +obj.wallT || 20; obj.wallH = +obj.wallH || 270;
  obj.lib = Object.assign({ shapes: [] }, obj.lib || {}); obj.lib.shapes = obj.lib.shapes || [];
  // library presets (#42): saved doors / windows / furniture, kept as-is so get/set/load/save round-trip them
  obj.lib.presets = (Array.isArray(obj.lib.presets) ? obj.lib.presets : []).filter(p => p && p.id && (p.kind === 'op' || p.kind === 'furn') && +p.w > 0);
  if (obj.bg) obj.bg.id = 'bg';
  // custom texture metadata (#40); texData (exported image payload) is passed through untouched for the browser
  obj.textures = (Array.isArray(obj.textures) ? obj.textures : []).filter(t => t && /^[\w-]{1,32}$/.test(t.id))
    .map(t => ({ id: t.id, name: String(t.name || t.id), w: +t.w > 0 ? +t.w : 60, h: +t.h > 0 ? +t.h : (+t.w > 0 ? +t.w : 60) }));
  obj.floors.forEach((f, i) => {
    if (!f || typeof f !== 'object') throw new Error('floors[' + i + '] is not an object');
    f.id = f.id || uid();
    f.name = f.name || ('Floor ' + (i + 1));
    for (const k in KINDS) f[k] = Array.isArray(f[k]) ? f[k] : [];
    f.groups = Array.isArray(f.groups) ? f.groups : [];
    for (const o of f.ops) if (o.open == null) o.open = 0;
    for (const w of f.walls) if (!w.wt) w.wt = 'solid';
    for (const sl of f.slabs) { if (!(sl.t > 0)) sl.t = 20; sl.floor = sl.floor || 'concrete'; sl.off = +sl.off || 0; }
    for (const v of f.voids) if (!VOID_TYPES.includes(v.type)) v.type = 'stair';
    for (const o of f.furn) cleanParts(o); // multi-part furniture; items without "parts" are untouched
  });
  return obj;
}
function proj() { if (!P) P = newProject(); return P; }
function floorOf(args) {
  const p = proj();
  const i = args && args.floorIndex !== undefined && args.floorIndex !== null ? args.floorIndex : 0;
  if (!Number.isInteger(i) || i < 0 || i >= p.floors.length)
    throw new Error('floorIndex ' + JSON.stringify(i) + ' is out of range (0..' + (p.floors.length - 1) + ')');
  return p.floors[i];
}
function findWall(f, id) {
  const w = f.walls.find(w => w.id === id);
  if (!w) throw new Error('No wall with id "' + id + '" on this floor. Use summarize to list wall ids.');
  return w;
}
function findObj(f, id) {
  if (id === 'bg' && P.bg) return { kind: 'bg', arr: null, o: P.bg };
  for (const arr in KINDS) { const o = f[arr].find(x => x.id === id); if (o) return { kind: KINDS[arr], arr, o }; }
  throw new Error('No object with id "' + id + '" on this floor');
}

/* ---------- Object factories (mirror mkWall / mkOp / mkFurn / mkRoom in app.js) ---------- */
// wall types (mirror WALL_TYPES / LOW_WALL in app.js, issues #71 / #73)
const WALL_TYPES = ['solid', 'curtain', 'railing', 'fence'];
const LOW_WALL = { railing: { h: 100, t: 6 }, fence: { h: 110, t: 8 } };
// curtain-wall mullions (#71): mul = target module in cm (default 120), mulN = intermediate mullion count (overrides mul)
const RAIL_STYLES = ['bars', 'glass', 'cable', 'solid'];
function cleanMullions(w, a = w) {
  // railing style (mirror railStyle in app.js): absent = bars
  if (w.wt !== 'railing') delete w.rs;
  else if (a.rs != null) { if (!RAIL_STYLES.includes(a.rs)) throw new Error('rs must be one of ' + RAIL_STYLES.join(', ')); if (a.rs === 'bars') delete w.rs; else w.rs = a.rs; }
  if (w.wt !== 'curtain') { delete w.mul; delete w.mulN; return; }
  if (a.mulN != null) { const n = Math.round(+a.mulN); if (!(n >= 0 && n <= 200)) throw new Error('mulN must be an integer 0..200'); w.mulN = n; delete w.mul; }
  else if (a.mul != null) { const m = Math.round(+a.mul); if (!(m >= 20 && m <= 1000)) throw new Error('mul must be 20..1000 cm'); delete w.mulN; if (m === 120) delete w.mul; else w.mul = m; }
}
function mkWall(f, a) {
  const w = {
    id: uid(),
    a: { x: num(a.x1, undefined, 'x1'), y: num(a.y1, undefined, 'y1') },
    b: { x: num(a.x2, undefined, 'x2'), y: num(a.y2, undefined, 'y2') },
    t: num(a.t, P.wallT, 't'),
    h: num(a.h, +f.wallH > 0 ? +f.wallH : P.wallH, 'h'),
    wt: WALL_TYPES.includes(a.wt) ? a.wt : 'solid',
  };
  if (a.elev != null && +a.elev) { const e = num(a.elev, 0, 'elev'); if (e < -WALL_ELEV_MAX || e > WALL_ELEV_MAX) throw new Error('elev must be between -' + WALL_ELEV_MAX + ' and ' + WALL_ELEV_MAX + ' cm (got ' + e + ')'); w.elev = e; }
  if (a.color) w.color = String(a.color);
  if (LOW_WALL[w.wt]) { if (a.h == null) w.h = LOW_WALL[w.wt].h; if (a.t == null) w.t = LOW_WALL[w.wt].t; }
  cleanMullions(w, a);
  if (wLen(w) <= 0) throw new Error('Wall length must be > 0');
  f.walls.push(w);
  return w;
}
function mkOp(f, a) {
  const def = OPDEF[a.opening || 'door'];
  if (!def) throw new Error('Unknown opening "' + a.opening + '". Valid ids: ' + OPENINGS.map(o => o.id).join(', '));
  const wall = findWall(f, String(a.wallId));
  const w = num(a.w, def.w, 'w');
  const L = wLen(wall);
  const d0 = a.d === undefined || a.d === null ? L / 2 : num(a.d, undefined, 'd');
  const o = {
    id: uid(), wall: wall.id,
    d: L >= w ? clamp(d0, w / 2, L - w / 2) : L / 2,
    w, h: num(a.h, def.h, 'h'), sill: num(a.sill, def.sill, 'sill'),
    type: opType(def.id), flip: a.flip ? 1 : 0, side: num(a.side, 1, 'side') < 0 ? -1 : 1, open: a.open ? 1 : 0,
  };
  if (DOOR_MATS.includes(a.material)) o.mat = a.material;
  if (a.glass === 'frosted' || a.glass === 'clear') o.glass = a.glass;
  if (typeof a.color === 'string' && a.color) o.color = a.color;
  if (typeof a.frameColor === 'string' && a.frameColor) o.frameCol = a.frameColor;
  f.ops.push(o);
  return o;
}
function mkFurn(f, a) {
  const def = BYID[a.catalogId];
  if (!def) throw new Error('Unknown catalogId "' + a.catalogId + '". Use list_catalog to see valid ids.');
  const o = {
    id: uid(), type: def.id, name: a.name || def.en || def.name, icon: def.icon, k: def.k,
    w: num(a.w, def.w, 'w'), d: num(a.d, def.d, 'd'), h: num(a.h, def.h, 'h'),
    color: a.color || def.color,
    x: num(a.x, undefined, 'x'), y: num(a.y, undefined, 'y'), rot: num(a.rot, 0, 'rot'),
    label: a.label || '',
  };
  const e = a.elev != null ? num(a.elev, 0, 'elev') : CAT_ELEV[def.id];
  if (e != null) {
    if (e < -FURN_ELEV_MAX || e > FURN_ELEV_MAX) throw new Error('elev must be between -' + FURN_ELEV_MAX + ' and ' + FURN_ELEV_MAX + ' cm (got ' + e + ')');
    if (e !== 0 || a.elev != null) o.elev = e;
  }
  if (CAT_PARTS[def.id]) { o.parts = CAT_PARTS[def.id](def.w, def.d, def.h); o.pbase = { w: def.w, d: def.d, h: def.h }; o.partsV = PARTS_V; } // multi-part catalogue item
  f.furn.push(o);
  return o;
}
function mkRoom(f, a) {
  const pts = parsePts(a.pts, 3, 'pts');
  const n = f.rooms.length;
  const r = {
    id: uid(),
    name: a.name || ('Room ' + (n + 1)),
    color: a.color || ROOMCOL[n % ROOMCOL.length],
    floor: finishOk(a.floorPattern) ? a.floorPattern : 'none',
    pts,
  };
  if (a.slabThickness != null) {
    const t = num(a.slabThickness, undefined, 'slabThickness');
    if (t < 0 || t > 200) throw new Error('slabThickness must be between 0 and 200 cm (got ' + t + ')');
    r.slabT = t;
  }
  f.rooms.push(r);
  return r;
}
// mirrors mkSlab / mkVoid in app.js (issues #22 / #23)
const VOID_TYPES = ['stair', 'shaft', 'atrium'];
function mkSlab(f, a) {
  const pts = parsePts(a.pts, 3, 'pts');
  const s = {
    id: uid(),
    name: a.name || ('Slab ' + (f.slabs.length + 1)),
    floor: finishOk(a.floorPattern) ? a.floorPattern : 'concrete',
    color: a.color || null,
    t: Math.min(100, Math.max(5, +a.thickness || 20)),
    off: Math.min(200, Math.max(-200, +a.offset || 0)),
    pts,
  };
  f.slabs.push(s);
  return s;
}
function mkVoid(f, a) {
  const pts = parsePts(a.pts, 3, 'pts');
  const v = { id: uid(), name: a.name || '', type: VOID_TYPES.includes(a.type) ? a.type : 'stair', pts };
  f.voids.push(v);
  return v;
}

/* ---------- Text output helpers ---------- */
function summarize() {
  const p = proj();
  const out = [];
  out.push('Project "' + p.name + '" — schema v' + p.v + ', grid ' + p.grid + ' cm (' + p.gridType + '), default wall ' + p.wallT + ' cm × ' + p.wallH + ' cm high, ' + p.floors.length + ' floor(s)');
  if ((p.textures || []).length) out.push('Custom textures: ' + p.textures.map(t => 'tex:' + t.id + ' "' + t.name + '" ' + t.w + '×' + t.h + ' cm').join(', '));
  p.floors.forEach((f, i) => {
    out.push('');
    out.push('Floor ' + i + ' "' + f.name + '" (id ' + f.id + ', wall height ' + (+f.wallH > 0 ? +f.wallH : p.wallH) + ' cm' + (+f.wallH > 0 ? '' : ' default') + '): ' + f.walls.length + ' walls, ' + f.ops.length + ' openings, ' + f.rooms.length + ' rooms, ' + (f.slabs || []).length + ' slabs, ' + (f.voids || []).length + ' voids, ' + f.furn.length + ' furniture, ' + f.texts.length + ' texts, ' + (f.drafts || []).length + ' 2D drafting');
    for (const d of f.drafts || []) out.push('  draft ' + d.id + ' ' + (d.shape === 'pline' ? (d.closed ? 'closed polyline' : d.pts.length === 2 ? 'line' : 'polyline') : d.shape) + ' pts ' + d.pts.map(q => '(' + q.x + ',' + q.y + ')').join(' ') + (d.dash ? ' ' + d.dash : ''));
    for (const w of f.walls)
      out.push('  wall ' + w.id + ': (' + w.a.x + ',' + w.a.y + ') → (' + w.b.x + ',' + w.b.y + ')  length ' + Math.round(wLen(w)) + ' cm, t=' + w.t + ', h=' + w.h + (w.elev ? ', base ' + (w.elev > 0 ? '+' : '') + w.elev : '') + (w.wt !== 'solid' ? ', ' + w.wt : ''));
    for (const o of f.ops)
      out.push('  ' + o.type + ' ' + o.id + ': w=' + o.w + ' h=' + o.h + ' sill=' + o.sill + ', centre ' + Math.round(o.d) + ' cm from wall ' + o.wall + ' end A' + (o.open ? ' [open]' : ''));
    for (const r of f.rooms)
      out.push('  room ' + r.id + ': "' + r.name + '" ' + fmtArea(polyArea(r.pts)) + ', pattern=' + r.floor + ', ' + r.pts.length + ' corners');
    for (const sl of f.slabs || [])
      out.push('  slab ' + sl.id + ': "' + sl.name + '" ' + fmtArea(polyArea(sl.pts)) + ', t=' + sl.t + ' cm, offset=' + sl.off + ' cm, finish=' + sl.floor);
    for (const v of f.voids || [])
      out.push('  void ' + v.id + ': ' + v.type + (v.name ? ' "' + v.name + '"' : '') + ' ' + fmtArea(polyArea(v.pts)));
    for (const t of f.furn)
      out.push('  furn ' + t.id + ': ' + t.name + ' ' + t.w + '×' + t.d + ' cm at (' + t.x + ',' + t.y + ') rot=' + t.rot + '°' + (t.elev > 0 ? ', ' + t.elev + ' cm above floor' : '') + (Array.isArray(t.parts) ? ', ' + t.parts.length + ' parts' : ''));
    for (const t of f.texts)
      out.push('  text ' + t.id + ': "' + t.text + '" at (' + t.x + ',' + t.y + ')');
  });
  out.push('');
  out.push('Tip: save_project writes a .json you can open in the app (📂 Aç / File ▸ Open JSON).');
  return out.join('\n');
}
function listCatalog() {
  const out = ['Furniture catalogue (catalogId — name, w×d×h cm, shape):'];
  CATS.forEach((cat, ci) => {
    out.push('');
    out.push('[' + cat + ']');
    for (const c of CATALOG.filter(c => c.cat === ci))
      out.push('  ' + c.id + ' — ' + (c.en || c.name) + ', ' + c.w + '×' + c.d + '×' + c.h + ' cm, ' + c.k + (CAT_ELEV[c.id] ? ', wall-mounted at ' + CAT_ELEV[c.id] + ' cm' : ''));
  });
  out.push('');
  out.push('Opening presets (opening id — w×h cm, sill cm):');
  for (const o of OPENINGS) out.push('  ' + o.id + ' — ' + o.en + ', ' + o.w + '×' + o.h + ' cm, sill ' + o.sill + ' cm');
  out.push('');
  out.push('Room floor patterns: ' + FLOORPATS.join(', ') + ', or tex:<id> for a custom texture');
  return out.join('\n');
}

/* ---------- Live browser bridge (mcp/bridge.js) ---------- */
function bridgeUrl(a) {
  const raw = (a && a.url) || process.env.FP_BRIDGE_URL || 'http://127.0.0.1:8787';
  try { return new URL(raw); } catch (e) { throw new Error('Invalid bridge URL: ' + raw); }
}
function httpJson(method, url, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = typeof url === 'string' ? new URL(url) : url;
    const data = body === undefined ? null : JSON.stringify(body);
    const req = http.request({
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, res => {
      let b = '';
      res.setEncoding('utf8');
      res.on('data', d => { b += d; });
      res.on('end', () => {
        let j = null;
        try { j = b ? JSON.parse(b) : null; } catch (e) { }
        if (res.statusCode >= 400) return reject(new Error('Bridge returned HTTP ' + res.statusCode + ': ' + ((j && j.error) || b.slice(0, 200))));
        resolve(j);
      });
    });
    req.setTimeout(timeoutMs || 5000, () => req.destroy(new Error('Bridge request timed out')));
    req.on('error', e => reject(new Error('Cannot reach the browser bridge at ' + u.origin + ' (' + e.message + '). Start it with: node mcp/bridge.js — then open ' + u.origin + '/ in the browser.')));
    if (data) req.write(data);
    req.end();
  });
}

const bridgeArgs = {
  url: { type: 'string', description: 'Bridge base URL. Default http://127.0.0.1:8787 (or env FP_BRIDGE_URL).' },
};

/* ---------- Tool registry ---------- */
const TOOLS = [];
function tool(name, description, props, required, run) {
  TOOLS.push({ name, description, schema: { type: 'object', properties: props, required: required || [] }, run });
}
const floorArg = { type: 'integer', description: 'Floor index, 0-based. Default 0.' };

tool('new_project',
  'Start a new empty floor plan project (one floor). Replaces the working project in memory.',
  {
    name: { type: 'string', description: 'Project name. Default "New Project".' },
    floorName: { type: 'string', description: 'Name of the first floor. Default "Zemin Kat" (Ground Floor).' },
    grid: { type: 'number', description: 'Grid step in cm. Default 10.' },
    wallT: { type: 'number', description: 'Default wall thickness in cm. Default 20.' },
    wallH: { type: 'number', description: 'Default wall height in cm. Default 270.' },
  }, [],
  a => { P = newProject(a); return 'Created project "' + P.name + '" with floor 0 "' + P.floors[0].name + '" (id ' + P.floors[0].id + ').' + (a.grid || a.wallT || a.wallH ? '' : ' Tip: all units are cm, Y axis points down.') ; });

tool('load_project',
  'Load a floor plan .json file (exported from the app with ⬇ JSON) into the working state.',
  { path: { type: 'string', description: 'Path to the .json file, relative to the server working directory or absolute.' } },
  ['path'],
  a => {
    const p = path.resolve(String(a.path));
    P = normalizeProject(JSON.parse(fs.readFileSync(p, 'utf8')));
    return 'Loaded "' + P.name + '" from ' + p + '\n\n' + summarize();
  });

tool('import_ifc',
  'Import an IFC (ISO 10303-21 / STEP, IFC2x3 or IFC4) model exported from Revit, ArchiCAD or another BIM tool (Revit: File > Export > IFC) and make it the working project. Brings in storeys as floors, walls (curved walls as segments, curtain walls), doors / windows on their walls, rooms (IfcSpace), floor slabs, slab openings, columns (IfcColumn → round / square column or polygon), railings (IfcRailing and railing-named proxies → railing / fence walls) and custom components / furnishings (proxies, furniture, sanitary terminals, assemblies → polygon shapes with height and elevation). Elements are placed on the storey their geometry actually occupies; walls and columns spanning several storeys appear on each. Roofs (IfcRoof and ROOF slabs) come in as furniture items of type "roof" (k "roof") carrying their 3D faces; stairs (IfcStair / IfcStairFlight) as parametric stairs (k "stairs": straight, L, U or spiral, riser count, railing); ramps (IfcRamp / IfcRampFlight) as parametric ramps (k "ramp", one per flight, rise from the top surface, vehicle or accessible). Colours come from the IFC surface styles (wall paint unless grey / white, door leaf and window frame colours, item colours) and material names pick slab finishes (concrete, wood, tile, marble, stone, glass…) and door materials (wood, glass, metal). Coordinates are shifted near the origin; units are converted to cm.',
  {
    path: { type: 'string', description: 'Path to the .ifc file, relative to the server working directory or absolute.' },
    name: { type: 'string', description: 'Project name when the IFC has none. Default: the file name.' },
  },
  ['path'],
  a => {
    const p = path.resolve(String(a.path));
    const { project, stats } = ifcToProject(fs.readFileSync(p, 'utf8'), { uid, colors: ROOMCOL, catalog: BYID, name: a.name || path.basename(p).replace(/\.ifc$/i, '') });
    P = normalizeProject(project);
    return 'Imported ' + (stats.schema || 'IFC') + ' "' + P.name + '" from ' + p + ': ' + stats.floors + ' floor(s), ' + stats.walls + ' walls, ' + stats.ops + ' doors/windows, ' + stats.rooms + ' rooms, ' + stats.slabs + ' slabs, ' + stats.voids + ' slab openings, ' + stats.columns + ' column piece(s), ' + stats.railings + ' railing(s), ' + stats.components + ' component(s), ' + stats.roofs + ' roof(s), ' + stats.stairs + ' stair(s), ' + stats.ramps + ' ramp(s)' + (stats.skipped ? ', ' + stats.skipped + ' item(s) skipped' : '') + '.\n\n' + summarize();
  });

tool('save_project',
  'Write the working project to a .json file. Open it in the app with 📂 Aç (File ▸ Open JSON) to view/edit it in 2D/3D.',
  { path: { type: 'string', description: 'Destination .json path. Default "floorplan.json" in the working directory.' } },
  [],
  a => {
    const p = path.resolve(String(a.path || 'floorplan.json'));
    fs.writeFileSync(p, JSON.stringify(proj(), null, 2), 'utf8');
    return 'Saved "' + P.name + '" to ' + p + ' — open it in the app via 📂 Aç / File ▸ Open JSON.';
  });

tool('get_project',
  'Return the full working project JSON (same schema the app exports).',
  {}, [],
  () => JSON.stringify(proj(), null, 2));

tool('set_project',
  'Replace the working project with the given project JSON (normalized with the app defaults). Use for bulk/precise edits.',
  { project: { type: 'object', description: 'A full floor planner project object (schema v2), e.g. from get_project.' } },
  ['project'],
  a => { P = normalizeProject(a.project); return 'Working project replaced with "' + P.name + '".'; });

tool('summarize',
  'Human-readable summary of the working project: every floor with wall ids & lengths, openings, room areas, furniture. Use this to find ids before editing.',
  {}, [],
  () => summarize());

tool('list_catalog',
  'List the furniture catalogue (ids, sizes) and door/window presets usable with add_furniture / add_opening.',
  {}, [],
  () => listCatalog());

/* --- live browser bridge (mcp/bridge.js) --- */
tool('browser_status',
  'Check the live browser bridge: whether it is running, the live plan revision/name and how many app tabs are connected.',
  bridgeArgs, [],
  async a => {
    const u = bridgeUrl(a);
    const j = await httpJson('GET', new URL('/health', u));
    return 'Bridge ' + u.origin + ' is running.\n'
      + '  plan revision: ' + j.rev + '\n'
      + '  plan name: ' + (j.planName || '(empty)') + '\n'
      + '  connected app tabs: ' + j.clients + '\n'
      + '  pending user requests: ' + (j.pendingRequests || 0) + '\n'
      + '  saved plan versions: ' + (j.snapshots || 0) + '\n'
      + '  last update: ' + (j.updatedAt ? new Date(j.updatedAt).toISOString() : '-') + '\n'
      + '  open the app at ' + u.origin + '/ for live editing.';
  });

tool('push_to_browser',
  'Push the working project into the open app tab(s) through the browser bridge. Tabs update immediately, the app autosaves to IndexedDB, so a refresh keeps the change. Requires node mcp/bridge.js running and the app open at http://127.0.0.1:8787/. Every push is snapshotted in .fp-history/ so the user can undo an AI edit.',
  Object.assign({
    label: { type: 'string', description: 'Short description of this edit, shown in the app\'s history and snapshot files, e.g. "add a bathroom".' },
  }, bridgeArgs), [],
  async a => {
    const u = bridgeUrl(a);
    const j = await httpJson('PUT', new URL('/__plan.json', u), { plan: proj(), tab: 'mcp', label: a.label || '' }, 20000);
    return 'Pushed plan revision ' + j.rev + ' to ' + j.clients + ' connected tab(s).'
      + (j.snapshot ? ' Saved as snapshot ' + j.snapshot + ' (undo with restore_snapshot).' : '')
      + '\n'
      + (j.clients
        ? 'They now show "' + P.name + '" live; a refresh keeps it (autosaved to IndexedDB).'
        : 'No tab is connected yet - open ' + u.origin + '/ in the browser, then call push_to_browser again.');
  });

tool('pull_from_browser',
  'Replace the working project with the plan currently in the browser (the last pushed / last edited state). Use before editing so you build on the user\'s latest changes.',
  bridgeArgs, [],
  async a => {
    const u = bridgeUrl(a);
    const j = await httpJson('GET', new URL('/__plan.json', u));
    if (!j || !j.plan) throw new Error('The bridge has no plan yet. Open ' + u.origin + '/ (the tab pushes your current plan automatically) or call push_to_browser first.');
    // the app pushes plans without image data (it keeps images in IndexedDB); keep the images this server already has
    const keep = P && P.texData && typeof P.texData === 'object' ? P.texData : null;
    P = normalizeProject(j.plan);
    if (keep && !P.texData) { const td = {}; for (const t of P.textures) if (keep[t.id]) td[t.id] = keep[t.id]; if (Object.keys(td).length) P.texData = td; }
    return 'Pulled plan revision ' + j.rev + ' ("' + P.name + '") from the browser.\n\n' + summarize();
  });

tool('list_snapshots',
  'List the saved plan versions the bridge keeps — one JSON pair (before/after) around every AI push. Use it when the user says "go back", "undo that", "restore", or when an AI edit deleted more than intended.',
  bridgeArgs, [],
  async a => {
    const u = bridgeUrl(a);
    const j = await httpJson('GET', new URL('/__snapshots', u));
    const list = (j && j.snapshots) || [];
    if (!list.length) return 'No snapshots yet. The bridge saves one before and after every AI push (files in .fp-history/).';
    const rows = list.map((s, i) => (i + 1) + '. ' + new Date(s.at).toLocaleString()
      + ' · ' + s.reason + (s.label ? ' · ' + s.label : '')
      + ' · ' + s.walls + ' walls, ' + s.furn + ' furniture, ' + s.rooms + ' rooms'
      + '   (id ' + s.id + ')');
    return 'Saved versions, newest first (' + list.length + ' in ' + j.dir + '):\n\n' + rows.join('\n')
      + '\n\nRestore one with restore_snapshot { id }. If the user did not name a version, ask which one.';
  });

tool('restore_snapshot',
  'Put a saved plan version back — the undo for an AI edit. Applies to the open tab through the bridge and to this working project. Call list_snapshots first.',
  Object.assign({
    id: { type: 'string', description: 'Snapshot id from list_snapshots (e.g. "h3-m2x9k1").' },
  }, bridgeArgs), ['id'],
  async a => {
    const u = bridgeUrl(a);
    const j = await httpJson('POST', new URL('/__snapshots/restore', u), { id: a.id }, 20000);
    if (!j || !j.plan) throw new Error('Restore failed: ' + JSON.stringify(j));
    P = normalizeProject(j.plan);
    return 'Restored snapshot ' + a.id + ' (from ' + new Date(j.restored.at).toLocaleString() + ') as revision ' + j.rev
      + ' — ' + j.stats.walls + ' walls, ' + j.stats.furn + ' furniture, ' + j.stats.rooms + ' rooms are live in the tab.\n\n' + summarize();
  });

tool('get_user_requests',
  'Read instructions the user typed into the app\'s floating "AI" panel (Ask AI box). They are queued in the browser bridge. Call this when the user says "check the app" / "there is a request in the floor planner". Acknowledge handled ones with ack_user_requests so they do not repeat.',
  bridgeArgs, [],
  async a => {
    const u = bridgeUrl(a);
    const j = await httpJson('GET', new URL('/__requests', u));
    const list = (j && j.requests) || [];
    if (!list.length) return 'No pending requests from the app. (The user can queue one via the floating AI panel at ' + u.origin + '/.)';
    const lines = list.map((r, i) => (i + 1) + '. [' + new Date(r.at).toLocaleString() + '] ' + r.text + '   (id ' + r.id + ')');
    return 'Pending requests from the app (' + list.length + '):\n\n' + lines.join('\n\n')
      + '\n\nHandle them, then call ack_user_requests with these ids (or { all: true }).';
  });

tool('ack_user_requests',
  'Mark queued app requests as handled (after acting on get_user_requests results) so they stop showing as pending.',
  {
    ids: { type: 'array', items: { type: 'string' }, description: 'Request ids from get_user_requests.' },
    all: { type: 'boolean', description: 'Acknowledge every pending request.' },
    ...bridgeArgs,
  }, [],
  async a => {
    const u = bridgeUrl(a);
    if (!Array.isArray(a.ids) && !a.all) throw new Error('Pass ids (from get_user_requests) or all: true');
    const j = await httpJson('POST', new URL('/__requests/ack', u), { ids: a.ids || [], all: !!a.all });
    return 'Acknowledged ' + j.acked + ' request(s); ' + j.pending + ' still pending.';
  });

tool('add_floor',
  'Add a new empty floor on top of the existing ones and return its index.',
  { name: { type: 'string', description: 'Floor name, e.g. "1. Kat" / "First Floor".' },
    wallH: { type: 'number', description: 'Optional wall height of this floor in cm, 100–800 (default: project wallH). New walls on it get this height and the floors above stack on it in 3D.' } },
  [],
  a => {
    const f = newFloor(a.name || ('Floor ' + P.floors.length));
    if (a.wallH != null) {
      const h = num(a.wallH, undefined, 'wallH');
      if (h < 100 || h > 800) throw new Error('wallH must be between 100 and 800 cm (got ' + h + ')');
      f.wallH = h;
    }
    proj().floors.push(f);
    return 'Added floor ' + (P.floors.length - 1) + ' "' + f.name + '" (id ' + f.id + '). Pass floorIndex=' + (P.floors.length - 1) + ' to the other tools to draw on it.';
  });

tool('add_wall',
  'Add one wall from (x1,y1) to (x2,y2). Units cm, Y points down. Returns the wall id (needed for add_opening).',
  {
    x1: { type: 'number' }, y1: { type: 'number' },
    x2: { type: 'number' }, y2: { type: 'number' },
    t: { type: 'number', description: 'Thickness in cm. Default: project wallT.' },
    h: { type: 'number', description: 'Height in cm. Default: the floor wallH, else project wallH.' },
    wt: { type: 'string', enum: ['solid', 'curtain', 'railing', 'fence'], description: 'Wall type: "solid" (default), "curtain" (glass facade), "railing" (balustrade, default h 100 / t 6) or "fence" (garden fence, default h 110 / t 8).' },
    mul: { type: 'number', description: 'Curtain walls only: vertical mullion spacing in cm (20..1000, default 120).' },
    mulN: { type: 'integer', description: 'Curtain walls only: number of intermediate vertical mullions (0 = one uninterrupted pane; overrides mul).' },
    rs: { type: 'string', enum: ['bars', 'glass', 'cable', 'solid'], description: 'Railings only: style - "bars" (vertical balusters, default), "glass" (glass panel), "cable" (horizontal bars / cable) or "solid" (parapet).' },
    color: { type: 'string', description: 'Optional wall paint colour (#hex). Omit for the default wall colour.' },
    elev: { type: 'number', description: 'Optional base offset in cm relative to the floor level (-500..500, default 0): a wall that starts below or above its floor.' },
    floorIndex: floorArg,
  },
  ['x1', 'y1', 'x2', 'y2'],
  a => { const w = mkWall(floorOf(a), a); return 'Added wall ' + w.id + ' (' + w.a.x + ',' + w.a.y + ') → (' + w.b.x + ',' + w.b.y + '), length ' + Math.round(wLen(w)) + ' cm, t=' + w.t + '.'; });

tool('add_rect_walls',
  'Draw a rectangle of 4 connected walls around (x, y) to (x+w, y+h) — like the app\'s room-from-rectangle tool. Optionally also creates the room polygon inside.',
  {
    x: { type: 'number', description: 'Left edge, cm.' },
    y: { type: 'number', description: 'Top edge, cm.' },
    w: { type: 'number', description: 'Width in cm (outer rectangle).' },
    h: { type: 'number', description: 'Height in cm (outer rectangle).' },
    t: { type: 'number', description: 'Wall thickness in cm. Default: project wallT.' },
    h3: { type: 'number', description: 'Wall height in cm. Default: the floor wallH, else project wallH.' },
    roomName: { type: 'string', description: 'If set, also create a room polygon (inset by half the wall thickness) with this name.' },
    floorIndex: floorArg,
  },
  ['x', 'y', 'w', 'h'],
  a => {
    const f = floorOf(a);
    const t = num(a.t, P.wallT, 't');
    const xa = num(a.x, undefined, 'x'), ya = num(a.y, undefined, 'y');
    const xb = xa + num(a.w, undefined, 'w'), yb = ya + num(a.h, undefined, 'h');
    const mk = (x1, y1, x2, y2) => mkWall(f, { x1, y1, x2, y2, t, h: num(a.h3, +f.wallH > 0 ? +f.wallH : P.wallH, 'h3') });
    const ws = [mk(xa, ya, xb, ya), mk(xb, ya, xb, yb), mk(xb, yb, xa, yb), mk(xa, yb, xa, ya)];
    let extra = '';
    if (a.roomName) {
      const r = mkRoom(f, { name: a.roomName, pts: [
        { x: xa + t / 2, y: ya + t / 2 }, { x: xb - t / 2, y: ya + t / 2 },
        { x: xb - t / 2, y: yb - t / 2 }, { x: xa + t / 2, y: yb - t / 2 },
      ] });
      extra = ' Also created room ' + r.id + ' "' + r.name + '" (' + fmtArea(polyArea(r.pts)) + ').';
    }
    return 'Added 4 walls: ' + ws.map(w => w.id).join(', ') + '.' + extra;
  });

tool('add_opening',
  'Place a door/window on a wall. The opening is parametric: it moves with the wall. d = distance from the wall\'s "a" end to the opening CENTRE (cm), auto-clamped to fit.',
  {
    wallId: { type: 'string', description: 'Target wall id (see summarize).' },
    opening: { type: 'string', enum: OPENINGS.map(o => o.id), description: 'Preset id. Default "door".' },
    d: { type: 'number', description: 'Distance in cm from the wall\'s a-end to the opening centre. Default: wall centre.' },
    w: { type: 'number', description: 'Override width in cm.' },
    h: { type: 'number', description: 'Override height in cm.' },
    sill: { type: 'number', description: 'Override sill height in cm.' },
    side: { type: 'integer', enum: [1, -1], description: 'Door swing side (+1 default).' },
    flip: { type: 'integer', enum: [0, 1], description: 'Mirror hinge / sliding direction.' },
    open: { type: 'boolean', description: 'Start opened (doors swing 90°, sliding doors slide).' },
    material: { type: 'string', enum: DOOR_MATS, description: 'Door leaf material (doors only). Default wood; sliding doors default to glass.' },
    glass: { type: 'string', enum: ['clear', 'frosted'], description: 'Glass type for glass / paneled doors. Default clear.' },
    color: { type: 'string', description: 'Door leaf #hex colour (not used by full-glass doors).' },
    frameColor: { type: 'string', description: 'Frame / casing #hex colour.' },
    floorIndex: floorArg,
  },
  ['wallId'],
  a => {
    const o = mkOp(floorOf(a), a);
    return 'Added ' + o.type + ' ' + o.id + ' (w=' + o.w + ') on wall ' + o.wall + ', centre ' + Math.round(o.d) + ' cm from end A.';
  });

tool('add_furniture',
  'Place a catalogue item at (x, y). x,y is the item CENTRE. rot is degrees clockwise. The item\'s back (local -Y) is what magnets to walls in the app.',
  {
    catalogId: { type: 'string', description: 'Catalogue id (see list_catalog), e.g. "bed2", "sofa3", "wc".' },
    x: { type: 'number' }, y: { type: 'number' },
    rot: { type: 'number', description: 'Rotation in degrees, clockwise. Default 0.' },
    label: { type: 'string', description: 'Optional label shown under the item.' },
    name: { type: 'string', description: 'Override the display name.' },
    w: { type: 'number', description: 'Override width (cm).' },
    d: { type: 'number', description: 'Override depth (cm).' },
    h: { type: 'number', description: 'Override height (cm, 3D).' },
    color: { type: 'string', description: 'Override color (#hex).' },
    elev: { type: 'number', description: 'Height above the floor in cm (-500..500; negative = below the floor), for wall-mounted items (TV, cabinet, mirror, shelf). Wall items (tvw, art, shelfW, ac, cabU, wmirror) default to a typical height; everything else defaults to 0.' },
    floorIndex: floorArg,
  },
  ['catalogId', 'x', 'y'],
  a => {
    const o = mkFurn(floorOf(a), a);
    return 'Added ' + o.name + ' ' + o.id + ' (' + o.w + '×' + o.d + ' cm) at (' + o.x + ',' + o.y + ') rot=' + o.rot + '°' + (o.elev > 0 ? ', ' + o.elev + ' cm above the floor' : '') + '.';
  });

tool('add_room',
  'Add a room polygon (name, color, floor pattern, area). Points are corners in order (cm, Y down). Rooms are independent of walls — they do NOT follow wall moves.',
  {
    pts: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] }, description: '3+ corners in order (clockwise or counter-clockwise).' },
    name: { type: 'string', description: 'Room name, e.g. "Salon" / "Living room".' },
    color: { type: 'string', description: '#hex fill color. Default: next palette color.' },
    floorPattern: { type: 'string', description: FINISH_DOC + '. Default none.' },
    slabThickness: { type: 'number', description: 'Slab thickness under the room in 3D, cm 0..200 (0 = flat surface). Default 20 — useful for balconies / terraces drawn outside the walls.' },
    floorIndex: floorArg,
  },
  ['pts'],
  a => {
    const r = mkRoom(floorOf(a), a);
    return 'Added room ' + r.id + ' "' + r.name + '" — area ' + fmtArea(polyArea(r.pts)) + ', perimeter ' + fmtLen(polyPerim(r.pts)) + '.';
  });

tool('add_slab',
  'Add a free-standing floor slab (balcony, terrace, porch, deck) — no surrounding walls needed. In 3D it is a solid slab of the given thickness at floor level (+ offset); furniture on it sits on its top.',
  {
    pts: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] }, description: '3+ corners in order (cm, Y down).' },
    name: { type: 'string', description: 'e.g. "Balkon" / "Terrace".' },
    floorPattern: { type: 'string', description: 'Top finish: ' + FINISH_DOC + '. Default concrete.' },
    color: { type: 'string', description: '#hex tint. Default: neutral concrete.' },
    thickness: { type: 'number', description: 'cm, 5..100. Default 20.' },
    offset: { type: 'number', description: 'Level offset in cm (negative = lower than the floor, e.g. -3 for a balcony). Default 0.' },
    floorIndex: floorArg,
  },
  ['pts'],
  a => {
    const s = mkSlab(floorOf(a), a);
    return 'Added slab ' + s.id + ' "' + s.name + '" — area ' + fmtArea(polyArea(s.pts)) + ', ' + s.t + ' cm thick.';
  });

// Custom textures (#40): metadata in project.textures, the image in project.texData[id] (a data: URL). The app moves
// texData into its IndexedDB on push_to_browser / load / 📂 Open, exactly like a ⬇ JSON export, and strips it from the plan.
const TEX_FILE_MAX = 4 * 1024 * 1024;
const TEX_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' };
const TEX_URL_RX = /^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/;
const pngSize = b => b.length > 24 && b.readUInt32BE(0) === 0x89504e47 ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null;
const applyToArg = { type: 'array', items: { type: 'string' }, description: 'Optional: apply the texture right away. Room ids, slab ids, or "floorSlab:<floorIndex>" for a whole floor slab. Any floor.' };
// resolve applyTo refs (throws on an unknown one, before anything changes); with id, sets the finish
function texApply(id, refs) {
  const p = proj(), k = 'tex:' + id, done = [];
  for (const ref of refs || []) {
    let hit = null;
    p.floors.forEach((f, i) => {
      if (hit) return;
      if (ref === 'floorSlab:' + i || ref === 'floorSlab:' + f.id) { hit = 'floor slab of floor ' + i; if (id) f.slabFloor = k; return; }
      const o = f.rooms.find(x => x.id === ref) || f.slabs.find(x => x.id === ref);
      if (o) { hit = (f.rooms.includes(o) ? 'room ' : 'slab ') + o.id + (o.name ? ' "' + o.name + '"' : '') + ' (floor ' + i + ')'; if (id) o.floor = k; }
    });
    if (!hit) throw new Error('applyTo: "' + ref + '" is not a room id, slab id or "floorSlab:<floorIndex>" (see summarize)');
    done.push(hit);
  }
  return done;
}
function addTex(name, w, h, data, refs) {
  texApply(null, refs);
  const p = proj(), id = uid();
  p.textures.push({ id, name: String(name || 'Texture').slice(0, 60), w: clamp(+w || 60, 1, 5000), h: clamp(+h || +w || 60, 1, 5000) });
  p.texData = Object.assign({}, p.texData && typeof p.texData === 'object' ? p.texData : {}, { [id]: data });
  const t = p.textures[p.textures.length - 1], done = texApply(id, refs);
  return 'Added texture ' + id + ' "' + t.name + '" — one repeat = ' + t.w + ' × ' + t.h + ' cm. Use it as floorPattern / floor "tex:' + id + '".'
    + (done.length ? '\nApplied to: ' + done.join(', ') + '.' : '')
    + '\nCall push_to_browser to show it in the app (the image travels with the plan).';
}

tool('create_texture',
  'Create a seamless, tileable floor texture from a pattern generator (the same one as the app\'s 🎨 Create pattern dialog) and add it to the project. Works without any image tool. Pick the pattern and sizes that match the user\'s description: tile (square / rectangular tiles with grout), brick, plank (staggered floor boards / parquet), basket (basket-weave parquet, unitWidth ≈ n × unitHeight), hex (hexagon tiles, unitWidth = across the flats), checker, terrazzo, stripe. Then apply it with applyTo, or later with floorPattern "tex:<id>" on add_room / add_slab / update_object.',
  {
    pattern: { type: 'string', enum: Object.keys(TEXGEN_PATTERNS) },
    color: { type: 'string', description: '#hex main colour (tile / board / brick / base).' },
    color2: { type: 'string', description: '#hex grout / mortar / seam colour, second checker or stripe colour, or terrazzo chip colour.' },
    unitWidth: { type: 'number', description: 'cm, 1..500: one tile / brick / board length (terrazzo, stripe: the repeat width). Defaults per pattern (tile 60, brick 24, plank 120, basket 30, hex 20).' },
    unitHeight: { type: 'number', description: 'cm, 1..500: one tile / brick / board width (stripe: band width). Ignored for hex.' },
    joint: { type: 'number', description: 'Grout / seam width in cm (0 = none). Default per pattern (0.3–1).' },
    variation: { type: 'number', description: 'Shade variation between units, 0..0.6. Default 0.12 (0 = perfectly uniform).' },
    seed: { type: 'integer', description: 'Random seed for the shade layout / terrazzo chips. Same seed = same texture.' },
    name: { type: 'string', description: 'Texture name shown in the finish list. Default: pattern + size.' },
    applyTo: applyToArg,
  },
  ['pattern'],
  a => {
    const g = texGen({ pattern: a.pattern, color: a.color, color2: a.color2, w: a.unitWidth, h: a.unitHeight, joint: a.joint, vary: a.variation, seed: a.seed, name: a.name });
    return addTex(g.name, g.w, g.h, texGenUrl(g.svg), a.applyTo);
  });

tool('add_texture',
  'Add a texture from an image you already have — e.g. one you generated with an image tool or that the user gave you (PNG, JPEG, WebP, GIF or SVG, ≤ 4 MB; make it seamless / tileable). Give the real-world size one copy of the image covers.',
  {
    path: { type: 'string', description: 'Image file path, relative to the server working directory or absolute.' },
    dataUrl: { type: 'string', description: 'Alternative to path: a data:image/…;base64,… URL.' },
    name: { type: 'string', description: 'Texture name. Default: the file name.' },
    width: { type: 'number', description: 'Real-world repeat width in cm (what one copy of the image covers). Default 60.' },
    height: { type: 'number', description: 'Repeat height in cm. Default: from the PNG aspect ratio, else = width.' },
    applyTo: applyToArg,
  },
  [],
  a => {
    let data, name = a.name, aspect = null;
    if (a.path) {
      const p = path.resolve(String(a.path)), mime = TEX_MIME[path.extname(p).toLowerCase()];
      if (!mime) throw new Error('Unsupported image type "' + path.extname(p) + '" — use ' + Object.keys(TEX_MIME).join(' '));
      const buf = fs.readFileSync(p);
      if (buf.length > TEX_FILE_MAX) throw new Error('Image is ' + Math.round(buf.length / 1024) + ' KB; the limit is 4 MB. Downscale it (1024 px on the long side is plenty).');
      const sz = pngSize(buf); if (sz && sz.w) aspect = sz.h / sz.w;
      data = 'data:' + mime + ';base64,' + buf.toString('base64');
      name = name || path.basename(p).replace(/\.[^.]+$/, '');
    } else if (typeof a.dataUrl === 'string') {
      if (!TEX_URL_RX.test(a.dataUrl)) throw new Error('dataUrl must start with data:image/png|jpeg|webp|gif|svg+xml');
      if (a.dataUrl.length > TEX_FILE_MAX * 1.4) throw new Error('dataUrl is larger than 4 MB of image data');
      data = a.dataUrl;
      const m = a.dataUrl.match(/^data:image\/png;base64,(.{0,64})/); if (m) { const s = pngSize(Buffer.from(m[1], 'base64')); if (s && s.w) aspect = s.h / s.w; }
    } else throw new Error('Give path or dataUrl');
    const w = +a.width > 0 ? +a.width : 60, h = +a.height > 0 ? +a.height : aspect ? Math.round(w * aspect * 10) / 10 : w;
    return addTex(name || 'Texture', w, h, data, a.applyTo);
  });

tool('list_textures',
  'List the project\'s custom textures (id, name, repeat size, where they are used). Use "tex:<id>" as a room / slab / floor slab finish.',
  {}, [],
  () => {
    const p = proj(), ts = p.textures || [];
    if (!ts.length) return 'No custom textures yet. Make one with create_texture (pattern generator) or add_texture (an image).';
    return ts.map(t => {
      const k = 'tex:' + t.id, used = [];
      p.floors.forEach((f, i) => { if (f.slabFloor === k) used.push('floor slab ' + i); for (const o of [...f.rooms, ...f.slabs]) if (o.floor === k) used.push(o.id); });
      return t.id + ' "' + t.name + '" — ' + t.w + ' × ' + t.h + ' cm repeat' + ((p.texData || {})[t.id] ? '' : ' (image lives in the browser)') + (used.length ? ' — used by ' + used.join(', ') : ' — unused');
    }).join('\n');
  });

tool('add_void',
  'Cut a floor void (stairwell, elevator/MEP shaft, atrium) through this floor slab. Draw it on the UPPER floor above the stairs: in 3D it becomes a real hole in that floor (the ceiling of the floor below). 2D shows a dashed outline with an X.',
  {
    pts: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] }, description: '3+ corners in order (cm, Y down).' },
    type: { type: 'string', enum: VOID_TYPES, description: 'stair | shaft | atrium. Default stair.' },
    name: { type: 'string', description: 'Optional label; default is the type name.' },
    floorIndex: floorArg,
  },
  ['pts'],
  a => {
    const v = mkVoid(floorOf(a), a);
    return 'Added ' + v.type + ' void ' + v.id + ' — area ' + fmtArea(polyArea(v.pts)) + '.';
  });

// 2D drafting (#83): mirrors addDraft() in app.js; stored as pts so the app's move / mirror / scale work unchanged
const DRAFT_SHAPES = ['pline', 'circle', 'arc'], DRAFT_DASHES = ['solid', 'dashed', 'dotted', 'center'], DRAFT_FILLS = ['none', 'solid', 'hatch'];
tool('add_draft',
  'Add 2D-only drafting geometry (site / parcel boundaries, setback lines, parking stalls, symbols, reference lines). It is drawn in 2D and in exports but NEVER becomes a wall, slab or furniture in 3D. shape: line / polyline (2+ points), rect (2 opposite corners), circle (centre, then any point on the circle), arc (start, a point on the arc, end).',
  {
    shape: { type: 'string', enum: ['line', 'polyline', 'rect', 'circle', 'arc'] },
    pts: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] }, description: 'Points in cm (Y down); count depends on shape.' },
    closed: { type: 'boolean', description: 'Polyline only: join the last point to the first.' },
    w: { type: 'number', description: 'Line weight in cm (0.5-60). Default 2.' },
    dash: { type: 'string', enum: DRAFT_DASHES, description: 'Line type. Default solid.' },
    color: { type: 'string', description: '#hex stroke colour. Default dark ink (follows the theme).' },
    fill: { type: 'string', enum: DRAFT_FILLS, description: 'Closed shapes and circles only. Default none.' },
    fillColor: { type: 'string', description: '#hex fill / hatch colour. Default = stroke colour.' },
    floorIndex: floorArg,
  },
  ['shape', 'pts'],
  a => {
    if (!['line', 'polyline', 'rect', 'circle', 'arc'].includes(a.shape)) throw new Error('Unknown shape "' + a.shape + '"');
    const f = floorOf(a), pts = parsePts(a.pts, a.shape === 'arc' ? 3 : 2, 'pts');
    if ((a.shape === 'rect' || a.shape === 'circle') && pts.length !== 2) throw new Error(a.shape + ' needs exactly 2 points');
    if (a.shape === 'arc' && pts.length !== 3) throw new Error('arc needs exactly 3 points');
    const o = { id: uid(), shape: a.shape === 'circle' || a.shape === 'arc' ? a.shape : 'pline', pts, w: Math.max(0.5, Math.min(60, num(a.w, 2, 'w'))) };
    if (a.shape === 'rect') { const [p, q] = pts; o.pts = [{ x: p.x, y: p.y }, { x: q.x, y: p.y }, { x: q.x, y: q.y }, { x: p.x, y: q.y }]; o.closed = true; }
    else if (o.shape === 'pline' && a.closed && pts.length > 2) o.closed = true;
    if (a.dash && a.dash !== 'solid') { if (!DRAFT_DASHES.includes(a.dash)) throw new Error('Unknown dash "' + a.dash + '"'); o.dash = a.dash; }
    if (a.color) o.color = String(a.color);
    if (a.fill && a.fill !== 'none') { if (!DRAFT_FILLS.includes(a.fill)) throw new Error('Unknown fill "' + a.fill + '"'); if (o.closed || o.shape === 'circle') o.fill = a.fill; }
    if (a.fillColor) o.fillCol = String(a.fillColor);
    (f.drafts = f.drafts || []).push(o);
    return 'Added 2D ' + a.shape + ' ' + o.id + ' (' + o.pts.length + ' points). It is 2D only and does not appear in 3D.';
  });

tool('add_text',
  'Add a text label at (x, y).',
  {
    x: { type: 'number' }, y: { type: 'number' },
    text: { type: 'string' },
    size: { type: 'number', description: 'Font size (cm in world units). Default 24.' },
    color: { type: 'string', description: '#hex. Default #1e293b.' },
    rot: { type: 'number', description: 'Rotation degrees. Default 0.' },
    floorIndex: floorArg,
  },
  ['x', 'y', 'text'],
  a => {
    const f = floorOf(a);
    const t = { id: uid(), x: num(a.x, undefined, 'x'), y: num(a.y, undefined, 'y'), text: String(a.text), size: num(a.size, 24, 'size'), color: a.color || '#1e293b', rot: num(a.rot, 0, 'rot') };
    f.texts.push(t);
    return 'Added text ' + t.id + ' "' + t.text + '" at (' + t.x + ',' + t.y + ').';
  });

tool('update_object',
  'Change properties of an existing object (wall t/h/wt or endpoints, opening d/w/side..., furniture x/y/rot..., room name/pts/floor...). Ramps (type "ramp"): w = width, d = horizontal length, h = rise, rampType accessible|vehicle|landscape, railing none|left|right|both. Rooms/slabs may use floor "glass" with glass clear|frosted. The "id" property cannot be changed.',
  {
    id: { type: 'string', description: 'Object id (see summarize).' },
    props: { type: 'object', description: 'Properties to set, e.g. {"t":30} or {"name":"Mutfak"}.' },
    floorIndex: floorArg,
  },
  ['id', 'props'],
  a => {
    const f = floorOf(a);
    const found = findObj(f, String(a.id));
    if (found.kind === 'bg') throw new Error('Use set_project to edit the background image');
    const props = a.props && typeof a.props === 'object' ? a.props : null;
    if (!props) throw new Error('props must be an object');
    if ('id' in props) delete props.id;
    // convenience: rooms store the pattern under "floor" (app schema)
    if ((found.kind === 'room' || found.kind === 'slab') && 'floorPattern' in props) { props.floor = props.floorPattern; delete props.floorPattern; }
    Object.assign(found.o, props);
    // sanity checks after merge
    if (found.kind === 'op' && found.o.wall && !f.walls.some(w => w.id === found.o.wall))
      throw new Error('props.wall "' + found.o.wall + '" does not exist on this floor');
    if (found.kind === 'wall') { if (wLen(found.o) <= 0) throw new Error('Wall length must be > 0'); if (!WALL_TYPES.includes(found.o.wt)) found.o.wt = 'solid'; cleanMullions(found.o, props); if (found.o.elev != null) { const e = +found.o.elev || 0; if (e < -WALL_ELEV_MAX || e > WALL_ELEV_MAX) throw new Error('elev must be between -' + WALL_ELEV_MAX + ' and ' + WALL_ELEV_MAX + ' cm'); if (e) found.o.elev = e; else delete found.o.elev; } }
    if (found.kind === 'room' || found.kind === 'slab' || found.kind === 'void') parsePts(found.o.pts, 3, 'pts');
    if (found.kind === 'draft') { parsePts(found.o.pts, found.o.shape === 'arc' ? 3 : 2, 'pts'); if (!DRAFT_SHAPES.includes(found.o.shape)) found.o.shape = 'pline'; }
    if (found.kind === 'furn' && 'parts' in props) cleanParts(found.o);
    return 'Updated ' + found.kind + ' ' + found.o.id + ':\n' + JSON.stringify(found.o, null, 2);
  });

tool('delete_objects',
  'Delete objects by id. Deleting a wall also deletes its doors/windows (same as the app).',
  {
    ids: { type: 'array', items: { type: 'string' }, description: 'Object ids to delete.' },
    floorIndex: floorArg,
  },
  ['ids'],
  a => {
    const f = floorOf(a);
    if (!Array.isArray(a.ids) || !a.ids.length) throw new Error('ids must be a non-empty array');
    const s = new Set(a.ids.map(String));
    const opsBefore = f.ops.length;
    f.walls = f.walls.filter(w => !s.has(w.id));
    const wl = new Set(f.walls.map(w => w.id));
    f.ops = f.ops.filter(o => !s.has(o.id) && wl.has(o.wall));
    for (const k of ['furn', 'rooms', 'slabs', 'voids', 'dims', 'texts', 'sketches', 'drafts']) f[k] = (f[k] || []).filter(o => !s.has(o.id));
    const cascaded = opsBefore - f.ops.length;
    return 'Deleted ' + a.ids.length + ' object(s)' + (cascaded ? ' and ' + cascaded + ' opening(s) on deleted walls' : '') + '.';
  });

/* ---------- Multi-part furniture (programmable furniture, parts schema v1) ----------
   A controlled API instead of hand-written JSON: every component goes through partIssues()
   (positive sizes, known type / material, inside the item's box) before it is stored. */
const FURN_SCHEMA = {
  version: PARTS_V,
  units: 'cm; item-local coordinates with the item centre at (0, 0); y points down like the plan; z = bottom elevation above the floor',
  item: { w: 'width (local x)', d: 'depth (local y)', h: 'total height', parts: 'array of components (max ' + PARTS_MAX + ', keep under ' + PARTS_SOFT + ')', pbase: '{ w, d, h } the box the parts were designed in; resizing the item scales the parts' },
  part: {
    type: PART_TYPES.join(' | ') + ' (aliases: cube, cylinder, ball, prism)',
    name: 'optional label, e.g. "leg"', x: 'centre x', y: 'centre y', z: 'bottom elevation (0 = floor)',
    w: 'size along local x', d: 'size along local y', h: 'height', rot: 'degrees clockwise on the plan (yaw, about the upright z axis)', rx: 'optional tilt in degrees about the part x axis (forward / back)', ry: 'optional tilt in degrees about the part y axis (sideways); the part turns about its centre as Rz(rot)·Ry(ry)·Rx(rx), so z is the bottom only while it is upright',
    gid: 'optional group id (1–16 letters / digits / _ / -); parts with the same gid are grouped in the furniture studio (rendering ignores it)',
    color: '#rgb / #rrggbb (default: the item colour)', mat: PART_MATS.join(' | ') + ' (default matte)',
    axis: 'cyl only: z (upright, default) | x | y (lying along that axis; w × d × h is still the bounding box)',
    pts: 'extrude only: 3+ {x, y} points relative to the part centre; extruded h up from z',
  },
  rules: ['every part must fit inside the item box: |x| ≤ w/2, |y| ≤ d/2, 0 ≤ z, z + h ≤ item h (1 cm tolerance)',
    'stack parts: a table top sits at z = leg height; something lying on it starts at the top\'s z + h',
    'validate_furniture warns about parts that float with nothing under them'],
  example: { name: 'Side table', w: 50, d: 50, h: 55, parts: [
    { name: 'top', type: 'box', x: 0, y: 0, z: 52, w: 50, d: 50, h: 3, color: '#b08968' },
    { name: 'leg', type: 'cyl', x: -20, y: -20, z: 0, w: 4, d: 4, h: 52, color: '#3d2516' }] },
};
// needParts: the tool edits parts → the item must already have them (only add_component turns a plain item into a parts item)
function findFurnObj(f, id, needParts) {
  const o = f.furn.find(x => x.id === id);
  if (!o) throw new Error('No furniture with id "' + id + '" on this floor. create_furniture returns one; summarize lists them.');
  if (needParts && !Array.isArray(o.parts)) throw new Error('Furniture ' + id + ' has no parts. Use add_component first, or create_furniture for a new multi-part item.');
  return o;
}
const PART_KEYS = ['type', 'name', 'x', 'y', 'z', 'w', 'd', 'h', 'rot', 'rx', 'ry', 'color', 'axis', 'pts', 'mat', 'gid'];
function partArg(a) {
  if (!a || typeof a !== 'object' || Array.isArray(a)) return a;
  const p = {};
  for (const k of PART_KEYS) if (a[k] !== undefined && a[k] !== null) p[k] = a[k];
  if (a.material !== undefined && a.material !== null) p.mat = a.material;
  return p;
}
function strictPart(p, o, label) {
  const issues = partIssues(p, o.pbase);
  if (issues.length) throw new Error(label + ' rejected: ' + issues.join('; '));
  return cleanPart(p);
}
// part selector: index, or name (all: true → every part with that name)
function pickParts(o, a) {
  if (a.index !== undefined && a.index !== null) {
    if (!Number.isInteger(a.index) || a.index < 0 || a.index >= o.parts.length) throw new Error('index ' + JSON.stringify(a.index) + ' is out of range (0..' + (o.parts.length - 1) + ')');
    return [a.index];
  }
  if (a.name) {
    const hits = o.parts.map((p, i) => p.name === a.name ? i : -1).filter(i => i >= 0);
    if (!hits.length) throw new Error('No part named "' + a.name + '". Parts: ' + o.parts.map((p, i) => i + ':' + (p.name || p.type)).join(', '));
    if (hits.length > 1 && !a.all) throw new Error(hits.length + ' parts are named "' + a.name + '" (indices ' + hits.join(', ') + '). Pass index, or all: true to change every one.');
    return hits;
  }
  throw new Error('Pass index (0-based) or name to pick the part');
}
function describeFurn(o) {
  const v = validateParts(o), s = partsScale(o);
  const out = ['furniture ' + o.id + ' "' + o.name + '" ' + o.w + '×' + o.d + '×' + o.h + ' cm at (' + o.x + ',' + o.y + ') rot=' + o.rot + '°' + (o.rx || o.ry ? ' tilt x ' + (o.rx || 0) + '° y ' + (o.ry || 0) + '°' : '') + ', ' + v.count + ' parts (schema v' + (o.partsV || PARTS_V) + ')'];
  if (s.sx !== 1 || s.sy !== 1 || s.sz !== 1) out.push('  parts are drawn in ' + o.pbase.w + '×' + o.pbase.d + '×' + o.pbase.h + ' cm and scaled to the item size');
  (o.parts || []).forEach((p, i) => out.push('  ' + i + ': ' + (p.name ? '"' + p.name + '" ' : '') + p.type + (p.axis ? '(' + p.axis + ')' : '') + ' at (' + p.x + ',' + p.y + ') z ' + p.z + '…' + partR(p.z + p.h) + ', ' + p.w + '×' + p.d + '×' + p.h + (p.rot ? ' rot ' + p.rot + '°' : '') + (p.rx ? ' rx ' + p.rx + '°' : '') + (p.ry ? ' ry ' + p.ry + '°' : '') + (p.gid ? ' group ' + p.gid : '') + (p.color ? ' ' + p.color : '') + (p.mat ? ' ' + p.mat : '')));
  out.push(v.ok ? '✓ valid' : '✗ ' + v.errors.length + ' error(s):');
  for (const e of v.errors) out.push('  error: ' + e);
  for (const w of v.warnings) out.push('  warning: ' + w);
  return out.join('\n');
}
const partProps = {
  type: { type: 'string', enum: PART_TYPES, description: 'box (default) | cyl | sphere | extrude.' },
  name: { type: 'string', description: 'Label, e.g. "leg", "top", "pocket".' },
  x: { type: 'number', description: 'Centre x in item-local cm (item centre = 0).' },
  y: { type: 'number', description: 'Centre y in item-local cm (y points down like the plan).' },
  z: { type: 'number', description: 'BOTTOM elevation in cm above the floor (a top on 72 cm legs has z 72).' },
  w: { type: 'number', description: 'Size along local x, cm.' },
  d: { type: 'number', description: 'Size along local y, cm.' },
  h: { type: 'number', description: 'Height, cm.' },
  rot: { type: 'number', description: 'Yaw in degrees, clockwise on the plan (about the upright z axis).' },
  rx: { type: 'number', description: 'Tilt in degrees about the part x axis (forward / back). Applied first; the part turns about its centre.' },
  ry: { type: 'number', description: 'Tilt in degrees about the part y axis (sideways). Applied after rx, before rot.' },
  gid: { type: 'string', description: 'Optional group id (1-16 letters / digits / _ / -); parts sharing it are grouped in the furniture studio.' },
  color: { type: 'string', description: '#hex. Default: the item colour.' },
  material: { type: 'string', enum: PART_MATS, description: 'matte (default) | gloss | metal | glass.' },
  axis: { type: 'string', enum: ['z', 'x', 'y'], description: 'cyl only: z upright (default), x / y lying along that axis.' },
  pts: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] }, description: 'extrude only: 3+ outline points relative to the part centre.' },
};
const furnIdArg = { type: 'string', description: 'Furniture id (from create_furniture / summarize).' };
const pickArgs = {
  index: { type: 'integer', description: '0-based part index (see validate_furniture).' },
  name: { type: 'string', description: 'Part name instead of index.' },
  all: { type: 'boolean', description: 'With name: apply to every part with that name.' },
};

tool('get_furniture_schema',
  'Describe the multi-part furniture format (coordinates, part types, materials, rules) with a small example. Read this before create_furniture.',
  {}, [],
  () => JSON.stringify(FURN_SCHEMA, null, 2));

tool('create_furniture',
  'Create ONE furniture object made of components (parts) and place it at (x, y). Build tables, cabinets, billiards tables… as one item: create_furniture → add_component (or several at once with parts: […]) → validate_furniture. Do NOT fake one object with many separate add_furniture items: those all stand on the floor in 3D.',
  {
    name: { type: 'string', description: 'Display name, e.g. "Billiards table".' },
    w: { type: 'number', description: 'Overall width (local x), cm.' },
    d: { type: 'number', description: 'Overall depth (local y), cm.' },
    h: { type: 'number', description: 'Overall height, cm (the top of the highest part).' },
    x: { type: 'number', description: 'Centre x in the plan, cm.' },
    y: { type: 'number', description: 'Centre y in the plan, cm.' },
    rot: { type: 'number', description: 'Rotation, degrees clockwise. Default 0.' },
    color: { type: 'string', description: 'Default #hex for parts without a colour (also the 2D fallback).' },
    icon: { type: 'string', description: 'Emoji shown in 2D. Default ▭.' },
    template: { type: 'string', enum: ['empty', ...Object.keys(FURN_TEMPLATES)], description: 'Start from a ready-made piece fitted to w × d × h, then adjust it with update_component: ' + Object.entries(FURN_TEMPLATES).map(([k, t]) => k + ' (' + t.en + ', ' + t.w + '×' + t.d + '×' + t.h + ')').join(', ') + '. Default empty.' },
    parts: { type: 'array', items: { type: 'object' }, description: 'Optional components to add right away (same fields as add_component).' },
    floorIndex: floorArg,
  },
  ['name', 'w', 'd', 'h', 'x', 'y'],
  a => {
    const f = floorOf(a), T = FURN_TEMPLATES[a.template], tpl = !!T;
    const w = num(a.w, undefined, 'w'), d = num(a.d, undefined, 'd'), h = num(a.h, undefined, 'h');
    if (!(w > 0 && d > 0 && h > 0)) throw new Error('w, d and h must be > 0');
    const o = { id: uid(), type: 'custom', name: String(a.name).slice(0, 60), icon: a.icon || (tpl ? T.icon : '▭'), k: 'rect', w, d, h,
      color: partHex(a.color) ? a.color : (tpl ? T.color : '#b08968'), x: num(a.x, undefined, 'x'), y: num(a.y, undefined, 'y'), rot: num(a.rot, 0, 'rot'), label: '',
      parts: [], pbase: { w, d, h }, partsV: PARTS_V };
    if (tpl) o.parts = T.parts(w, d, h).map((p, i) => strictPart(p, o, a.template + ' template part ' + i + ' "' + p.name + '" (try about ' + T.w + ' × ' + T.d + ' × ' + T.h + ' cm)'));
    if (Array.isArray(a.parts)) o.parts.push(...a.parts.map((p, i) => strictPart(partArg(p), o, 'parts[' + i + ']')));
    if (o.parts.length > PARTS_MAX) throw new Error('at most ' + PARTS_MAX + ' parts');
    f.furn.push(o);
    return 'Created furniture ' + o.id + '. Add components with add_component (furnitureId "' + o.id + '").\n' + describeFurn(o);
  });

tool('add_component',
  'Add a component (part) to a multi-part furniture item. Coordinates are item-local cm: centre (0,0), z = bottom elevation. Pass the fields directly, or parts: [{…}, …] to add several at once (all-or-nothing). Rejected if a size is not positive or the part sticks out of the item box.',
  Object.assign({ furnitureId: furnIdArg, parts: { type: 'array', items: { type: 'object' }, description: 'Several parts at once, each with the fields below.' } }, partProps, { floorIndex: floorArg }),
  ['furnitureId'],
  a => {
    const o = findFurnObj(floorOf(a), String(a.furnitureId)), had = Array.isArray(o.parts) ? o.parts.length : 0;
    const box = { pbase: o.pbase || { w: o.w, d: o.d, h: o.h } }; // validate first, convert the item only on success
    const many = Array.isArray(a.parts), add = (many ? a.parts : [a]).map((p, i) => strictPart(partArg(p), box, many ? 'parts[' + i + ']' : 'part'));
    if (had + add.length > PARTS_MAX) throw new Error('at most ' + PARTS_MAX + ' parts per item (has ' + had + ')');
    if (!Array.isArray(o.parts)) { o.parts = []; o.partsV = PARTS_V; }
    o.pbase = box.pbase;
    const at = o.parts.length; o.parts.push(...add);
    return 'Added ' + add.length + ' part(s) at index ' + at + (add.length > 1 ? '…' + (at + add.length - 1) : '') + '.\n' + describeFurn(o);
  });

tool('update_component',
  'Change fields of a component (picked by index or name). The merged part is re-validated; nothing changes if it is invalid.',
  Object.assign({ furnitureId: furnIdArg }, pickArgs, { props: { type: 'object', description: 'Fields to set, e.g. {"z": 72, "h": 3, "material": "gloss"}.' }, floorIndex: floorArg }),
  ['furnitureId', 'props'],
  a => {
    const o = findFurnObj(floorOf(a), String(a.furnitureId), true);
    if (!a.props || typeof a.props !== 'object') throw new Error('props must be an object');
    const idx = pickParts(o, a), pr = partArg(a.props);
    const next = idx.map(i => strictPart(Object.assign({}, o.parts[i], pr), o, 'part ' + i));
    idx.forEach((i, k) => { o.parts[i] = next[k]; });
    return 'Updated part(s) ' + idx.join(', ') + '.\n' + describeFurn(o);
  });

tool('remove_component',
  'Remove a component (by index or name; all: true removes every part with that name).',
  Object.assign({ furnitureId: furnIdArg }, pickArgs, { floorIndex: floorArg }),
  ['furnitureId'],
  a => {
    const o = findFurnObj(floorOf(a), String(a.furnitureId), true), idx = new Set(pickParts(o, a));
    o.parts = o.parts.filter((p, i) => !idx.has(i));
    return 'Removed ' + idx.size + ' part(s).\n' + describeFurn(o);
  });

tool('set_material',
  'Set colour and/or material of one component, several (name + all), or every component (everything: true).',
  Object.assign({ furnitureId: furnIdArg }, pickArgs, {
    everything: { type: 'boolean', description: 'Apply to every part.' },
    color: { type: 'string', description: '#hex.' },
    material: { type: 'string', enum: PART_MATS, description: 'matte | gloss | metal | glass.' },
    floorIndex: floorArg,
  }),
  ['furnitureId'],
  a => {
    const o = findFurnObj(floorOf(a), String(a.furnitureId), true);
    if (a.color === undefined && a.material === undefined) throw new Error('Pass color and/or material');
    if (a.color !== undefined && !partHex(a.color)) throw new Error('color must be #rgb or #rrggbb');
    if (a.material !== undefined && !PART_MATS.includes(a.material)) throw new Error('material must be one of ' + PART_MATS.join(', '));
    const idx = a.everything ? o.parts.map((p, i) => i) : pickParts(o, a);
    for (const i of idx) { const p = o.parts[i]; if (a.color !== undefined) p.color = a.color; if (a.material !== undefined) { if (a.material === 'matte') delete p.mat; else p.mat = a.material; } }
    return 'Set ' + [a.color, a.material].filter(Boolean).join(' / ') + ' on ' + idx.length + ' part(s).';
  });

tool('set_transform',
  'Move, rotate (rot = yaw; rx / ry tilt the whole item about its x / y axis) or resize a furniture item. By default a resize keeps the parts at their current visible size (the box just grows/shrinks — run validate_furniture after shrinking); scaleParts: true stretches every part with the item instead.',
  {
    furnitureId: furnIdArg,
    x: { type: 'number' }, y: { type: 'number' },
    rot: { type: 'number', description: 'Degrees clockwise.' },
    rx: { type: 'number', description: 'Tilt the whole item about its x axis, degrees (0 = upright). In 3D the lowest point rests on the floor (or elev).' },
    ry: { type: 'number', description: 'Tilt the whole item about its y axis, degrees (0 = upright).' },
    w: { type: 'number' }, d: { type: 'number' }, h: { type: 'number' },
    scaleParts: { type: 'boolean', description: 'Stretch the parts with the new size. Default false.' },
    floorIndex: floorArg,
  },
  ['furnitureId'],
  a => {
    const o = findFurnObj(floorOf(a), String(a.furnitureId));
    for (const k of ['x', 'y', 'rot']) if (a[k] !== undefined) o[k] = num(a[k], undefined, k);
    for (const k of ['rx', 'ry']) if (a[k] !== undefined) { const v = partR(((num(a[k], undefined, k) % 360) + 360) % 360); if (v && v !== 360) o[k] = v; else delete o[k]; } // all-axis tilt
    for (const k of ['w', 'd', 'h']) if (a[k] !== undefined) { const v = num(a[k], undefined, k); if (!(v > 0)) throw new Error(k + ' must be > 0'); if (o.pbase && !a.scaleParts) o.pbase[k] = partR(o.pbase[k] * v / o[k]); o[k] = v; } // keep the parts' current visible size
    return describeFurn(o);
  });

tool('validate_furniture',
  'Check a multi-part furniture item: positive sizes, known types / materials, parts inside the item box, sane heights, floating parts. Lists every part with its index.',
  { furnitureId: furnIdArg, floorIndex: floorArg },
  ['furnitureId'],
  a => describeFurn(findFurnObj(floorOf(a), String(a.furnitureId))));

tool('save_furniture',
  'Save a multi-part furniture item to the project library (⬡ My Library in the app) so it can be placed again with place_furniture or from the library panel.',
  { furnitureId: furnIdArg, name: { type: 'string', description: 'Library name. Default: the item name.' }, floorIndex: floorArg },
  ['furnitureId'],
  a => {
    const o = findFurnObj(floorOf(a), String(a.furnitureId), true), v = validateParts(o);
    if (!v.ok) throw new Error('Fix the errors first:\n' + v.errors.join('\n'));
    const p = { id: uid(), name: String(a.name || o.name).slice(0, 60), kind: 'furn', type: o.type, k: o.k, icon: o.icon, w: o.w, d: o.d, h: o.h, color: o.color,
      extra: { parts: JSON.parse(JSON.stringify(o.parts)), pbase: Object.assign({}, o.pbase), partsV: PARTS_V } };
    const lib = proj().lib; lib.presets = lib.presets || []; lib.presets.push(p);
    return 'Saved "' + p.name + '" to the library as preset ' + p.id + ' (' + o.parts.length + ' parts).';
  });

tool('place_furniture',
  'Place a saved library item (save_furniture / the app\'s My Library) at (x, y) — by preset id or name.',
  {
    presetId: { type: 'string', description: 'Library preset id.' },
    name: { type: 'string', description: 'Library preset name (if no presetId).' },
    x: { type: 'number' }, y: { type: 'number' },
    rot: { type: 'number', description: 'Degrees clockwise. Default 0.' },
    floorIndex: floorArg,
  },
  ['x', 'y'],
  a => {
    const ps = (proj().lib.presets || []).filter(p => p.kind === 'furn');
    const p = ps.find(q => a.presetId ? q.id === a.presetId : q.name === a.name);
    if (!p) throw new Error('No furniture preset ' + JSON.stringify(a.presetId || a.name) + '. Saved: ' + (ps.map(q => q.id + ' "' + q.name + '"').join(', ') || 'none'));
    const o = { id: uid(), type: p.type || 'custom', name: p.name, icon: p.icon || '▭', k: p.k || 'rect', w: p.w, d: p.d, h: p.h, color: p.color,
      x: num(a.x, undefined, 'x'), y: num(a.y, undefined, 'y'), rot: num(a.rot, 0, 'rot'), label: '' };
    for (const k in p.extra || {}) o[k] = JSON.parse(JSON.stringify(p.extra[k]));
    cleanParts(o); floorOf(a).furn.push(o);
    return 'Placed "' + o.name + '" ' + o.id + ' at (' + o.x + ',' + o.y + ').';
  });

/* ---------- MCP / JSON-RPC 2.0 over stdio ---------- */
function send(obj) { process.stdout.write(JSON.stringify(obj) + '\n'); }
function ok(id, result) { send({ jsonrpc: '2.0', id, result }); }
function err(id, code, message) { send({ jsonrpc: '2.0', id, error: { code, message } }); }

const INSTRUCTIONS =
  'Kat Planı Çizici (floor planner) tools. All coordinates are centimetres and the Y axis points DOWN. ' +
  'Typical workflow: new_project → add_rect_walls / add_wall → add_opening (needs a wall id from summarize) → ' +
  'add_furniture (needs a catalogId from list_catalog) → add_room → save_project, then the user opens the saved ' +
  '.json in the app (File ▸ Open JSON). Call summarize after changes to verify. ' +
  'Room polygons do not follow walls. Doors/windows are parametric on their wall (d = distance from the wall a-end to the opening centre). ' +
  'LIVE EDITING: if the user runs "node mcp/bridge.js" and opens http://127.0.0.1:8787/, use push_to_browser to make edits appear ' +
  'instantly in their open tab (and persist to IndexedDB across refresh) and pull_from_browser to start from their latest changes. ' +
  'The user can queue natural-language instructions in the app\'s floating AI panel - read them with get_user_requests and mark them done with ack_user_requests. ' +
  'SAFETY: every push_to_browser is snapshotted (before + after) by the bridge; if the user says "go back" / "undo that" / "restore", call list_snapshots then restore_snapshot. ' +
  'Pass a short label to push_to_browser ("add a bathroom") so the history is readable. ' +
  'TEXTURES: for a floor finish that is not built in (a specific tile, parquet, brick, terrazzo…) call create_texture (seamless pattern generator, no image tool needed) ' +
  'or add_texture (an image file you generated / were given), with applyTo = room / slab ids; then push_to_browser. list_textures shows what exists. ' +
  'MULTI-PART FURNITURE: anything not in the catalogue (billiards table, bunk with desk, kitchen island…) is ONE item built from parts: ' +
  'get_furniture_schema → create_furniture → add_component (z = bottom elevation, item-local cm) → validate_furniture → save_furniture. ' +
  'Never fake one object with several add_furniture items: separate items all stand on the floor in 3D.';
const RESOURCES = [
  { uri: 'floorplanner://schema/furniture-parts', name: 'Multi-part furniture schema', mimeType: 'application/json', description: 'Coordinates, part types, materials and rules for create_furniture / add_component.', text: () => JSON.stringify(FURN_SCHEMA, null, 2) },
  { uri: 'floorplanner://example/billiards-table', name: 'Reference billiards table', mimeType: 'application/json', description: 'A 280 × 155 × 85 cm billiards table built from 30 parts.', text: () => JSON.stringify({ name: 'Billiards table', w: 280, d: 155, h: 85, parts: billiardParts(280, 155, 85) }, null, 2) },
];

async function handle(msg) {
  const m = msg.method, params = msg.params || {};
  switch (m) {
    case 'initialize':
      ok(msg.id, {
        protocolVersion: params.protocolVersion || '2024-11-05',
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions: INSTRUCTIONS,
      });
      break;
    case 'ping':
      ok(msg.id, {});
      break;
    case 'tools/list':
      ok(msg.id, { tools: TOOLS.map(t => ({ name: t.name, description: t.description, inputSchema: t.schema })) });
      break;
    case 'tools/call': {
      const t = TOOLS.find(t => t.name === params.name);
      if (!t) return err(msg.id, -32602, 'Unknown tool: ' + params.name);
      try {
        const text = await t.run(params.arguments || {});
        ok(msg.id, { content: [{ type: 'text', text: String(text) }], isError: false });
      } catch (e) {
        ok(msg.id, { content: [{ type: 'text', text: 'Error: ' + ((e && e.message) || e) }], isError: true });
      }
      break;
    }
    case 'resources/list': ok(msg.id, { resources: RESOURCES.map(r => ({ uri: r.uri, name: r.name, description: r.description, mimeType: r.mimeType })) }); break;
    case 'resources/read': {
      const r = RESOURCES.find(x => x.uri === params.uri);
      if (!r) return err(msg.id, -32002, 'Resource not found: ' + params.uri);
      ok(msg.id, { contents: [{ uri: r.uri, mimeType: r.mimeType, text: r.text() }] });
      break;
    }
    case 'resources/templates/list': ok(msg.id, { resourceTemplates: [] }); break;
    case 'prompts/list': ok(msg.id, { prompts: [] }); break;
    default:
      if (m && m.indexOf('notifications/') === 0) return;
      err(msg.id, -32601, 'Method not found: ' + m);
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', line => {
  const s = line.trim();
  if (!s) return;
  let msg;
  try { msg = JSON.parse(s); } catch (e) { return; } // ignore malformed lines
  if (!msg || msg.id === undefined || msg.id === null) return; // notification → no response
  handle(msg).catch(e => err(msg.id, -32603, 'Internal error: ' + ((e && e.message) || e)));
});
rl.on('close', () => process.exit(0));
process.on('uncaughtException', e => { process.stderr.write('Uncaught: ' + ((e && e.stack) || e) + '\n'); });

process.stderr.write(SERVER_NAME + ' MCP server v' + SERVER_VERSION + ' ready (' + TOOLS.length + ' tools)\n');
