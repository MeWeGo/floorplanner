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
const FLOORPATS = ['none', 'wood', 'tile', 'carpet', 'marble', 'concrete', 'stone', 'grass', 'water', 'gravel', 'deck', 'asphalt']; // + 'tex:<id>' custom textures (#40)
// a finish is a built-in pattern or "tex:<id>" of a texture listed in project.textures (image data lives in the browser)
const finishOk = v => FLOORPATS.includes(v) || (typeof v === 'string' && /^tex:/.test(v) && ((P && P.textures) || []).some(t => 'tex:' + t.id === v));
const FINISH_DOC = FLOORPATS.join(' | ') + ' | "tex:<id>" (a custom texture from project.textures)';
// door material / colours (#41), mirrors DOOR_MATS in app.js
const DOOR_MATS = ['wood', 'glass', 'paneled', 'metal'];
const KINDS = { walls: 'wall', ops: 'op', furn: 'furn', rooms: 'room', slabs: 'slab', voids: 'void', sections: 'section', dims: 'dim', texts: 'text', sketches: 'sketch' };

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
   A furniture item may carry   parts: [{ name?, type, x, y, z, w, d, h, rot?, color?, mat?, axis?, pts? }]
   plus pbase: { w, d, h } (the design box the parts were drawn in) and partsV (schema version).
   - Local cm, centre of the item = (0, 0), y points down like the plan, z = BOTTOM elevation above the floor.
   - type: box | cyl | sphere | extrude. cyl stands upright (axis z) unless axis is 'x' or 'y' (lying);
     its w × d × h is always the bounding box. extrude = pts polygon (cm, relative to x, y) lifted h from z.
   - rot = degrees clockwise on the plan, like furniture rot. mat: matte (default) | gloss | metal | glass.
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
  q.x = n(p.x, 0); q.y = n(p.y, 0); q.z = n(p.z, 0);
  if (pts) {
    const xs = pts.map(a => a.x), ys = pts.map(a => a.y);
    q.w = partR(Math.max(...xs) - Math.min(...xs)) || 0.1; q.d = partR(Math.max(...ys) - Math.min(...ys)) || 0.1; q.pts = pts;
  } else { q.w = Math.max(0.1, Math.abs(n(p.w, 10))); q.d = Math.max(0.1, Math.abs(n(p.d, 10))); }
  q.h = Math.max(0.1, Math.abs(n(p.h, 10)));
  const r = n(p.rot, 0); if (r) q.rot = partR(((r % 360) + 360) % 360);
  if (partHex(p.color)) q.color = p.color;
  if (PART_MATS.includes(p.mat) && p.mat !== 'matte') q.mat = p.mat;
  if (type === 'cyl' && (p.axis === 'x' || p.axis === 'y')) q.axis = p.axis;
  return q;
}
// footprint + height range of a CLEAN part in item-local cm: { x0, x1, y0, y1, z0, z1 }
function partBounds(q) {
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
  for (const k of ['x', 'y', 'z', 'rot']) if (p[k] !== undefined && p[k] !== null && !partFin(p[k])) e.push(k + ' must be a number');
  if (t === 'extrude') {
    if (!partPts(p.pts)) e.push('extrude needs pts: 3+ {x, y} points in cm, relative to the part centre');
    if (!(partFin(p.h) && +p.h > 0)) e.push('h must be a number > 0');
  } else for (const k of ['w', 'd', 'h']) if (!(partFin(p[k]) && +p[k] > 0)) e.push(k + ' must be a number > 0');
  if (p.color !== undefined && p.color !== null && !partHex(p.color)) e.push('color must be #rgb or #rrggbb');
  if (p.mat !== undefined && p.mat !== null && !PART_MATS.includes(p.mat)) e.push('mat must be one of ' + PART_MATS.join(', '));
  if (p.axis !== undefined && p.axis !== null && !['x', 'y', 'z'].includes(p.axis)) e.push('axis must be x, y or z');
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
/* PARTS-ENGINE:END */
const CAT_PARTS = { billiard: billiardParts }; // mirror of CAT_PARTS in app.js

/* ---------- Project state ---------- */
let P = null; // working project (same schema the app saves/loads)

function newFloor(name) { return { id: uid(), name: name || 'Zemin Kat', walls: [], ops: [], furn: [], rooms: [], slabs: [], voids: [], sections: [], dims: [], texts: [], sketches: [], groups: [], slabFloor: 'none', slabColor: null }; }
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
  p.floors.forEach((f, i) => {
    out.push('');
    out.push('Floor ' + i + ' "' + f.name + '" (id ' + f.id + '): ' + f.walls.length + ' walls, ' + f.ops.length + ' openings, ' + f.rooms.length + ' rooms, ' + (f.slabs || []).length + ' slabs, ' + (f.voids || []).length + ' voids, ' + f.furn.length + ' furniture, ' + f.texts.length + ' texts');
    for (const w of f.walls)
      out.push('  wall ' + w.id + ': (' + w.a.x + ',' + w.a.y + ') → (' + w.b.x + ',' + w.b.y + ')  length ' + Math.round(wLen(w)) + ' cm, t=' + w.t + ', h=' + w.h + (w.wt !== 'solid' ? ', ' + w.wt : ''));
    for (const o of f.ops)
      out.push('  ' + o.type + ' ' + o.id + ': w=' + o.w + ' h=' + o.h + ' sill=' + o.sill + ', centre ' + Math.round(o.d) + ' cm from wall ' + o.wall + ' end A' + (o.open ? ' [open]' : ''));
    for (const r of f.rooms)
      out.push('  room ' + r.id + ': "' + r.name + '" ' + fmtArea(polyArea(r.pts)) + ', pattern=' + r.floor + ', ' + r.pts.length + ' corners');
    for (const sl of f.slabs || [])
      out.push('  slab ' + sl.id + ': "' + sl.name + '" ' + fmtArea(polyArea(sl.pts)) + ', t=' + sl.t + ' cm, offset=' + sl.off + ' cm, finish=' + sl.floor);
    for (const v of f.voids || [])
      out.push('  void ' + v.id + ': ' + v.type + (v.name ? ' "' + v.name + '"' : '') + ' ' + fmtArea(polyArea(v.pts)));
    for (const t of f.furn)
      out.push('  furn ' + t.id + ': ' + t.name + ' ' + t.w + '×' + t.d + ' cm at (' + t.x + ',' + t.y + ') rot=' + t.rot + '°' + (Array.isArray(t.parts) ? ', ' + t.parts.length + ' parts' : ''));
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
    floorPattern: { type: 'string', description: FINISH_DOC + '. Default none.' },
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
    if ((found.kind === 'room' || found.kind === 'slab') && 'floorPattern' in props) { props.floor = props.floorPattern; delete props.floorPattern; }
    Object.assign(found.o, props);
    // sanity checks after merge
    if (found.kind === 'op' && found.o.wall && !f.walls.some(w => w.id === found.o.wall))
      throw new Error('props.wall "' + found.o.wall + '" does not exist on this floor');
    if (found.kind === 'wall') { if (wLen(found.o) <= 0) throw new Error('Wall length must be > 0'); if (!found.o.wt) found.o.wt = 'solid'; }
    if (found.kind === 'room' || found.kind === 'slab' || found.kind === 'void') parsePts(found.o.pts, 3, 'pts');
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
    for (const k of ['furn', 'rooms', 'slabs', 'voids', 'dims', 'texts', 'sketches']) f[k] = (f[k] || []).filter(o => !s.has(o.id));
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
    w: 'size along local x', d: 'size along local y', h: 'height', rot: 'degrees clockwise on the plan (yaw)',
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
const PART_KEYS = ['type', 'name', 'x', 'y', 'z', 'w', 'd', 'h', 'rot', 'color', 'axis', 'pts', 'mat'];
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
  const out = ['furniture ' + o.id + ' "' + o.name + '" ' + o.w + '×' + o.d + '×' + o.h + ' cm at (' + o.x + ',' + o.y + ') rot=' + o.rot + '°, ' + v.count + ' parts (schema v' + (o.partsV || PARTS_V) + ')'];
  if (s.sx !== 1 || s.sy !== 1 || s.sz !== 1) out.push('  parts are drawn in ' + o.pbase.w + '×' + o.pbase.d + '×' + o.pbase.h + ' cm and scaled to the item size');
  (o.parts || []).forEach((p, i) => out.push('  ' + i + ': ' + (p.name ? '"' + p.name + '" ' : '') + p.type + (p.axis ? '(' + p.axis + ')' : '') + ' at (' + p.x + ',' + p.y + ') z ' + p.z + '…' + partR(p.z + p.h) + ', ' + p.w + '×' + p.d + '×' + p.h + (p.rot ? ' rot ' + p.rot + '°' : '') + (p.color ? ' ' + p.color : '') + (p.mat ? ' ' + p.mat : '')));
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
  rot: { type: 'number', description: 'Yaw in degrees, clockwise on the plan.' },
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
    template: { type: 'string', enum: ['empty', 'billiards'], description: '"billiards" starts from the reference billiards table (rails, felt, pockets, legs, balls, cue) fitted to w × d × h. Default empty.' },
    parts: { type: 'array', items: { type: 'object' }, description: 'Optional components to add right away (same fields as add_component).' },
    floorIndex: floorArg,
  },
  ['name', 'w', 'd', 'h', 'x', 'y'],
  a => {
    const f = floorOf(a), tpl = a.template === 'billiards';
    const w = num(a.w, undefined, 'w'), d = num(a.d, undefined, 'd'), h = num(a.h, undefined, 'h');
    if (!(w > 0 && d > 0 && h > 0)) throw new Error('w, d and h must be > 0');
    const o = { id: uid(), type: 'custom', name: String(a.name).slice(0, 60), icon: a.icon || (tpl ? '🎱' : '▭'), k: 'rect', w, d, h,
      color: partHex(a.color) ? a.color : (tpl ? '#5b3a24' : '#b08968'), x: num(a.x, undefined, 'x'), y: num(a.y, undefined, 'y'), rot: num(a.rot, 0, 'rot'), label: '',
      parts: [], pbase: { w, d, h }, partsV: PARTS_V };
    if (tpl) o.parts = billiardParts(w, d, h).map((p, i) => strictPart(p, o, 'billiards template part ' + i + ' "' + p.name + '" (try about 280 × 155 × 85 cm)'));
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
  'Move, rotate or resize a multi-part furniture item. By default a resize keeps the parts at their current visible size (the box just grows/shrinks — run validate_furniture after shrinking); scaleParts: true stretches every part with the item instead.',
  {
    furnitureId: furnIdArg,
    x: { type: 'number' }, y: { type: 'number' },
    rot: { type: 'number', description: 'Degrees clockwise.' },
    w: { type: 'number' }, d: { type: 'number' }, h: { type: 'number' },
    scaleParts: { type: 'boolean', description: 'Stretch the parts with the new size. Default false.' },
    floorIndex: floorArg,
  },
  ['furnitureId'],
  a => {
    const o = findFurnObj(floorOf(a), String(a.furnitureId));
    for (const k of ['x', 'y', 'rot']) if (a[k] !== undefined) o[k] = num(a[k], undefined, k);
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
