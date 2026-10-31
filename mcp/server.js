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
   - Wall { id, a:{x,y}, b:{x,y}, t, h, wt:'solid'|'curtain', color?:'#hex' }.
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
  { id: 'column', cat: 5, name: 'Kolon', en: 'Round Column', w: 40, d: 40, h: 270, icon: '', k: 'round', color: '#64748b' },
  { id: 'colSq', cat: 5, name: 'Kare Kolon', en: 'Square Column', w: 40, d: 40, h: 270, icon: '', k: 'rect', color: '#64748b' },
  { id: 'car', cat: 5, name: 'Araba', en: 'Car', w: 180, d: 450, h: 150, icon: '🚗', k: 'rect', color: '#fca5a5' },
  { id: 'table_o', cat: 5, name: 'Bahçe Masası', en: 'Patio Table', w: 120, d: 80, h: 75, icon: '⛱️', k: 'rect', color: '#d6b88f' },
  { id: 'tree', cat: 5, name: 'Ağaç', en: 'Tree', w: 200, d: 200, h: 400, icon: '🌳', k: 'round', color: '#86efac' },
  { id: 'pool', cat: 5, name: 'Havuz', en: 'Swimming Pool', w: 400, d: 800, h: 5, icon: '🏊', k: 'rect', color: '#7dd3fc' },
  { id: 'fireplace', cat: 5, name: 'Şömine', en: 'Fireplace', w: 120, d: 40, h: 120, icon: '🔥', k: 'rect', color: '#94a3b8' },
];
const BYID = Object.fromEntries(CATALOG.map(c => [c.id, c]));
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
const FLOORPATS = ['none', 'wood', 'tile', 'carpet', 'marble', 'concrete', 'stone'];
const KINDS = { walls: 'wall', ops: 'op', furn: 'furn', rooms: 'room', dims: 'dim', texts: 'text', sketches: 'sketch' };

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

/* ---------- Project state ---------- */
let P = null; // working project (same schema the app saves/loads)

function newFloor(name) { return { id: uid(), name: name || 'Zemin Kat', walls: [], ops: [], furn: [], rooms: [], dims: [], texts: [], sketches: [], groups: [], slabFloor: 'none', slabColor: null }; }
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
    lib: { shapes: [] },
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
  if (obj.bg) obj.bg.id = 'bg';
  obj.floors.forEach((f, i) => {
    if (!f || typeof f !== 'object') throw new Error('floors[' + i + '] is not an object');
    f.id = f.id || uid();
    f.name = f.name || ('Floor ' + (i + 1));
    for (const k in KINDS) f[k] = Array.isArray(f[k]) ? f[k] : [];
    f.groups = Array.isArray(f.groups) ? f.groups : [];
    for (const o of f.ops) if (o.open == null) o.open = 0;
    for (const w of f.walls) if (!w.wt) w.wt = 'solid';
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
function mkWall(f, a) {
  const w = {
    id: uid(),
    a: { x: num(a.x1, undefined, 'x1'), y: num(a.y1, undefined, 'y1') },
    b: { x: num(a.x2, undefined, 'x2'), y: num(a.y2, undefined, 'y2') },
    t: num(a.t, P.wallT, 't'),
    h: num(a.h, P.wallH, 'h'),
    wt: a.wt === 'curtain' ? 'curtain' : 'solid',
  };
  if (a.color) w.color = String(a.color);
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
    floor: FLOORPATS.includes(a.floorPattern) ? a.floorPattern : 'none',
    pts,
  };
  f.rooms.push(r);
  return r;
}

/* ---------- Text output helpers ---------- */
function summarize() {
  const p = proj();
  const out = [];
  out.push('Project "' + p.name + '" — schema v' + p.v + ', grid ' + p.grid + ' cm (' + p.gridType + '), default wall ' + p.wallT + ' cm × ' + p.wallH + ' cm high, ' + p.floors.length + ' floor(s)');
  p.floors.forEach((f, i) => {
    out.push('');
    out.push('Floor ' + i + ' "' + f.name + '" (id ' + f.id + '): ' + f.walls.length + ' walls, ' + f.ops.length + ' openings, ' + f.rooms.length + ' rooms, ' + f.furn.length + ' furniture, ' + f.texts.length + ' texts');
    for (const w of f.walls)
      out.push('  wall ' + w.id + ': (' + w.a.x + ',' + w.a.y + ') → (' + w.b.x + ',' + w.b.y + ')  length ' + Math.round(wLen(w)) + ' cm, t=' + w.t + ', h=' + w.h + (w.wt !== 'solid' ? ', ' + w.wt : ''));
    for (const o of f.ops)
      out.push('  ' + o.type + ' ' + o.id + ': w=' + o.w + ' h=' + o.h + ' sill=' + o.sill + ', centre ' + Math.round(o.d) + ' cm from wall ' + o.wall + ' end A' + (o.open ? ' [open]' : ''));
    for (const r of f.rooms)
      out.push('  room ' + r.id + ': "' + r.name + '" ' + fmtArea(polyArea(r.pts)) + ', pattern=' + r.floor + ', ' + r.pts.length + ' corners');
    for (const t of f.furn)
      out.push('  furn ' + t.id + ': ' + t.name + ' ' + t.w + '×' + t.d + ' cm at (' + t.x + ',' + t.y + ') rot=' + t.rot + '°');
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
      out.push('  ' + c.id + ' — ' + (c.en || c.name) + ', ' + c.w + '×' + c.d + '×' + c.h + ' cm, ' + c.k);
  });
  out.push('');
  out.push('Opening presets (opening id — w×h cm, sill cm):');
  for (const o of OPENINGS) out.push('  ' + o.id + ' — ' + o.en + ', ' + o.w + '×' + o.h + ' cm, sill ' + o.sill + ' cm');
  out.push('');
  out.push('Room floor patterns: ' + FLOORPATS.join(', '));
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
    P = normalizeProject(j.plan);
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
  { name: { type: 'string', description: 'Floor name, e.g. "1. Kat" / "First Floor".' } },
  [],
  a => {
    const f = newFloor(a.name || ('Floor ' + P.floors.length));
    proj().floors.push(f);
    return 'Added floor ' + (P.floors.length - 1) + ' "' + f.name + '" (id ' + f.id + '). Pass floorIndex=' + (P.floors.length - 1) + ' to the other tools to draw on it.';
  });

tool('add_wall',
  'Add one wall from (x1,y1) to (x2,y2). Units cm, Y points down. Returns the wall id (needed for add_opening).',
  {
    x1: { type: 'number' }, y1: { type: 'number' },
    x2: { type: 'number' }, y2: { type: 'number' },
    t: { type: 'number', description: 'Thickness in cm. Default: project wallT.' },
    h: { type: 'number', description: 'Height in cm. Default: project wallH.' },
    wt: { type: 'string', enum: ['solid', 'curtain'], description: 'Wall type: "solid" (default) or "curtain" (glass facade).' },
    color: { type: 'string', description: 'Optional wall paint colour (#hex). Omit for the default wall colour.' },
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
    h3: { type: 'number', description: 'Wall height in cm. Default: project wallH.' },
    roomName: { type: 'string', description: 'If set, also create a room polygon (inset by half the wall thickness) with this name.' },
    floorIndex: floorArg,
  },
  ['x', 'y', 'w', 'h'],
  a => {
    const f = floorOf(a);
    const t = num(a.t, P.wallT, 't');
    const xa = num(a.x, undefined, 'x'), ya = num(a.y, undefined, 'y');
    const xb = xa + num(a.w, undefined, 'w'), yb = ya + num(a.h, undefined, 'h');
    const mk = (x1, y1, x2, y2) => mkWall(f, { x1, y1, x2, y2, t, h: num(a.h3, P.wallH, 'h3') });
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
    floorIndex: floorArg,
  },
  ['catalogId', 'x', 'y'],
  a => {
    const o = mkFurn(floorOf(a), a);
    return 'Added ' + o.name + ' ' + o.id + ' (' + o.w + '×' + o.d + ' cm) at (' + o.x + ',' + o.y + ') rot=' + o.rot + '°.';
  });

tool('add_room',
  'Add a room polygon (name, color, floor pattern, area). Points are corners in order (cm, Y down). Rooms are independent of walls — they do NOT follow wall moves.',
  {
    pts: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'] }, description: '3+ corners in order (clockwise or counter-clockwise).' },
    name: { type: 'string', description: 'Room name, e.g. "Salon" / "Living room".' },
    color: { type: 'string', description: '#hex fill color. Default: next palette color.' },
    floorPattern: { type: 'string', enum: FLOORPATS, description: FLOORPATS.join(' | ') + '. Default none.' },
    floorIndex: floorArg,
  },
  ['pts'],
  a => {
    const r = mkRoom(floorOf(a), a);
    return 'Added room ' + r.id + ' "' + r.name + '" — area ' + fmtArea(polyArea(r.pts)) + ', perimeter ' + fmtLen(polyPerim(r.pts)) + '.';
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
  'Change properties of an existing object (wall t/h/wt or endpoints, opening d/w/side..., furniture x/y/rot..., room name/pts...). The "id" property cannot be changed.',
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
    if (found.kind === 'room' && 'floorPattern' in props) { props.floor = props.floorPattern; delete props.floorPattern; }
    Object.assign(found.o, props);
    // sanity checks after merge
    if (found.kind === 'op' && found.o.wall && !f.walls.some(w => w.id === found.o.wall))
      throw new Error('props.wall "' + found.o.wall + '" does not exist on this floor');
    if (found.kind === 'wall') { if (wLen(found.o) <= 0) throw new Error('Wall length must be > 0'); if (!found.o.wt) found.o.wt = 'solid'; }
    if (found.kind === 'room') parsePts(found.o.pts, 3, 'pts');
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
    for (const k of ['furn', 'rooms', 'dims', 'texts', 'sketches']) f[k] = f[k].filter(o => !s.has(o.id));
    const cascaded = opsBefore - f.ops.length;
    return 'Deleted ' + a.ids.length + ' object(s)' + (cascaded ? ' and ' + cascaded + ' opening(s) on deleted walls' : '') + '.';
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
  'Pass a short label to push_to_browser ("add a bathroom") so the history is readable.';

async function handle(msg) {
  const m = msg.method, params = msg.params || {};
  switch (m) {
    case 'initialize':
      ok(msg.id, {
        protocolVersion: params.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
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
    case 'resources/list': ok(msg.id, { resources: [] }); break;
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
