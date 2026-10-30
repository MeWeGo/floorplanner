'use strict';
/* ===================== Kat Planı Çizici =====================
   Birimler: tüm koordinatlar santimetre (cm). Y ekseni aşağı doğru. */

const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rnd = (v, n = 1) => Math.round(v / n) * n;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const fmtLen = cm => (cm / 100).toFixed(2) + ' m';
const fmtArea = c2 => (c2 / 10000).toFixed(2) + ' m²';

/* ---------- Dil (i18n: TR / EN) ---------- */
let lang = (() => {
  try {
    const s = localStorage.getItem('fp_lang');
    if (s === 'tr' || s === 'en') return s;
  } catch (e) { }
  return /^tr\b/i.test((typeof navigator !== 'undefined' && navigator.language) || '') ? 'tr' : 'en';
})();
const isEN = () => lang === 'en';
const L = (tr, en) => (lang === 'en' ? en : tr);
const itemName = d => (lang === 'en' && d.en ? d.en : d.name);

/* ---------- Katalog ---------- */
// [id, kategori, ad, genişlik, derinlik, yükseklik(3B), ikon, şekil, renk, ad_en]
const CATS = ['Oturma', 'Yatak Odası', 'Mutfak', 'Banyo', 'Ofis', 'Yapı & Dış'];
const CATS_EN = ['Living', 'Bedroom', 'Kitchen', 'Bathroom', 'Office', 'Structure & Outdoor'];
const CAT_DEFS = [
  ['sofa3', 0, '3 Kişilik Koltuk', 210, 90, 85, '🛋️', 'sofa', '#a5b4fc', '3-Seat Sofa'],
  ['sofa2', 0, '2 Kişilik Koltuk', 160, 90, 85, '🛋️', 'sofa', '#a5b4fc', '2-Seat Sofa'],
  ['armchair', 0, 'Berjer', 85, 85, 85, '💺', 'sofa', '#c4b5fd', 'Armchair'],
  ['coffee', 0, 'Orta Sehpa', 100, 55, 40, '▭', 'rect', '#d6b88f', 'Coffee Table'],
  ['tv', 0, 'TV Ünitesi', 180, 40, 50, '📺', 'rect', '#9ca3af', 'TV Unit'],
  ['table4', 0, '4 Kişilik Masa', 140, 80, 75, '🍽️', 'rect', '#d6b88f', '4-Seat Table'],
  ['table6', 0, '6 Kişilik Masa', 180, 90, 75, '🍽️', 'rect', '#d6b88f', '6-Seat Table'],
  ['tableR', 0, 'Yuvarlak Masa', 110, 110, 75, '⭕', 'round', '#d6b88f', 'Round Table'],
  ['chair', 0, 'Sandalye', 45, 45, 45, '🪑', 'rect', '#e5c9a0', 'Chair'],
  ['bookcase', 0, 'Kitaplık', 100, 35, 200, '📚', 'rect', '#b08968', 'Bookcase'],
  ['rug', 0, 'Halı', 200, 140, 2, '▦', 'rect', '#fca5a5', 'Rug'],
  ['plant', 0, 'Bitki', 40, 40, 90, '🪴', 'round', '#86efac', 'Plant'],
  ['bed2', 1, 'Çift Kişilik Yatak', 160, 200, 50, '🛏️', 'bed', '#fde68a', 'Double Bed'],
  ['bed1', 1, 'Tek Kişilik Yatak', 100, 200, 50, '🛏️', 'bed', '#fde68a', 'Single Bed'],
  ['bedK', 1, 'King Yatak', 180, 200, 50, '🛏️', 'bed', '#fde68a', 'King Bed'],
  ['bunk', 1, 'Ranza', 100, 200, 160, '🛏️', 'bed', '#fdba74', 'Bunk Bed'],
  ['crib', 1, 'Bebek Yatağı', 70, 130, 90, '🍼', 'rect', '#fbcfe8', 'Crib'],
  ['night', 1, 'Komodin', 45, 40, 50, '▫', 'rect', '#d6b88f', 'Nightstand'],
  ['wardrobe', 1, 'Gardrop', 200, 60, 220, '🚪', 'rect', '#b08968', 'Wardrobe'],
  ['dresser', 1, 'Şifonyer', 120, 45, 90, '🗄️', 'rect', '#b08968', 'Dresser'],
  ['vanity', 1, 'Makyaj Masası', 100, 45, 75, '🪞', 'rect', '#d6b88f', 'Vanity Table'],
  ['fridge', 2, 'Buzdolabı', 70, 70, 180, '🧊', 'rect', '#cbd5e1', 'Refrigerator'],
  ['stove', 2, 'Ocak / Fırın', 60, 60, 90, '🔥', 'rect', '#94a3b8', 'Stove / Oven'],
  ['sinkK', 2, 'Evye', 120, 60, 90, '🚰', 'rect', '#cbd5e1', 'Kitchen Sink'],
  ['dish', 2, 'Bulaşık Mak.', 60, 60, 90, '🍽', 'rect', '#cbd5e1', 'Dishwasher'],
  ['counter', 2, 'Tezgâh 120', 120, 60, 90, '▭', 'rect', '#e2e8f0', 'Counter 120'],
  ['counter2', 2, 'Tezgâh 60', 60, 60, 90, '▭', 'rect', '#e2e8f0', 'Counter 60'],
  ['island', 2, 'Ada Tezgâh', 180, 90, 90, '▭', 'rect', '#e2e8f0', 'Kitchen Island'],
  ['wm', 2, 'Çamaşır Mak.', 60, 60, 85, '🧺', 'rect', '#cbd5e1', 'Washing Machine'],
  ['wc', 3, 'Klozet', 40, 70, 40, '🚽', 'rect', '#f1f5f9', 'Toilet'],
  ['basin', 3, 'Lavabo', 60, 45, 85, '🚰', 'rect', '#f1f5f9', 'Washbasin'],
  ['basin2', 3, 'Çift Lavabo', 120, 50, 85, '🚰', 'rect', '#f1f5f9', 'Double Washbasin'],
  ['shower', 3, 'Duş Teknesi', 90, 90, 200, '🚿', 'rect', '#bae6fd', 'Shower'],
  ['tub', 3, 'Küvet', 170, 75, 55, '🛁', 'rect', '#bae6fd', 'Bathtub'],
  ['bidet', 3, 'Bide', 40, 55, 40, '🚽', 'rect', '#f1f5f9', 'Bidet'],
  ['desk', 4, 'Çalışma Masası', 140, 70, 75, '🖥️', 'rect', '#d6b88f', 'Office Desk'],
  ['deskL', 4, 'L Masa', 180, 140, 75, '🖥️', 'rect', '#d6b88f', 'L-Shaped Desk'],
  ['ochair', 4, 'Ofis Koltuğu', 60, 60, 100, '💺', 'round', '#94a3b8', 'Office Chair'],
  ['meet', 4, 'Toplantı Masası', 300, 110, 75, '🗣️', 'rect', '#d6b88f', 'Meeting Table'],
  ['shelf', 4, 'Raf Ünitesi', 120, 35, 180, '📚', 'rect', '#b08968', 'Shelving Unit'],
  ['printer', 4, 'Yazıcı', 50, 45, 40, '🖨️', 'rect', '#cbd5e1', 'Printer'],
  ['stairs', 5, 'Merdiven', 100, 300, 270, '🪜', 'stairs', '#e2e8f0', 'Stairs'],
  ['column', 5, 'Kolon', 40, 40, 270, '', 'round', '#64748b', 'Round Column'],
  ['colSq', 5, 'Kare Kolon', 40, 40, 270, '', 'rect', '#64748b', 'Square Column'],
  ['car', 5, 'Araba', 180, 450, 150, '🚗', 'rect', '#fca5a5', 'Car'],
  ['table_o', 5, 'Bahçe Masası', 120, 80, 75, '⛱️', 'rect', '#d6b88f', 'Patio Table'],
  ['tree', 5, 'Ağaç', 200, 200, 400, '🌳', 'round', '#86efac', 'Tree'],
  ['pool', 5, 'Havuz', 400, 800, 5, '🏊', 'rect', '#7dd3fc', 'Swimming Pool'],
  ['fireplace', 5, 'Şömine', 120, 40, 120, '🔥', 'rect', '#94a3b8', 'Fireplace'],
];
const CATALOG = CAT_DEFS.map(a => ({ id: a[0], cat: a[1], name: a[2], w: a[3], d: a[4], h: a[5], icon: a[6], k: a[7], color: a[8], en: a[9] }));
const BYID = Object.fromEntries(CATALOG.map(c => [c.id, c]));
const OPENINGS = [
  { id: 'door', name: 'Kapı', en: 'Door', w: 90, h: 210, sill: 0, icon: '🚪' },
  { id: 'double', name: 'Çift Kanatlı Kapı', en: 'Double Door', w: 160, h: 210, sill: 0, icon: '🚪' },
  { id: 'slide', name: 'Sürgülü Kapı', en: 'Sliding Door', w: 180, h: 210, sill: 0, icon: '↔️' },
  { id: 'arch', name: 'Açıklık / Kemer', en: 'Archway / Opening', w: 120, h: 210, sill: 0, icon: '⛩️' },
  { id: 'window', name: 'Pencere', en: 'Window', w: 120, h: 120, sill: 90, icon: '🪟' },
  { id: 'window2', name: 'Geniş Pencere', en: 'Wide Window', w: 200, h: 140, sill: 70, icon: '🪟' },
  { id: 'wsmall', name: 'Küçük Pencere', en: 'Small Window', w: 60, h: 60, sill: 130, icon: '🪟' },
];
const OPDEF = Object.fromEntries(OPENINGS.map(o => [o.id, o]));
const FLOORS = { none: 'Düz renk', wood: 'Parke', tile: 'Fayans', carpet: 'Halı' };
const FLOORS_EN = { none: 'Solid color', wood: 'Wood parquet', tile: 'Tile', carpet: 'Carpet' };
const getFloors = () => (lang === 'en' ? FLOORS_EN : FLOORS);
const ROOMCOL = ['#bfdbfe', '#fde68a', '#bbf7d0', '#fecaca', '#e9d5ff', '#fed7aa', '#a5f3fc', '#fbcfe8'];

/* ---------- Proje durumu ---------- */
let P, fi = 0;
let hist = [], hi = -1;
const view = { x: 0, y: 0, z: 0.5 };
let tool = 'select', sel = [], placing = null;
const ui = { snap: true, angle: true, dims: true, cur: null, raw: null, draw: null, typed: '', drag: null, space: false, cat: 0, q: '', view3d: false, v3dFloor: 'all', dimStart: null, polyPts: null, calib: null, clip: null, boxSel: 'all', connWalls: true, shape: { kind: 'tri', n: 6, mode: 'object' } };
const layersVis = { bg: true, rooms: true, walls: true, furn: true, dims: true, sketch: true };

const newFloor = name => ({ id: uid(), name, walls: [], ops: [], furn: [], rooms: [], dims: [], texts: [], sketches: [], groups: [] });
const newProject = () => ({ v: 2, name: L('Yeni Proje', 'New Project'), grid: 10, gridType: 'square', wallT: 20, wallH: 270, bg: null, lib: { shapes: [] }, floors: [newFloor(L('Zemin Kat', 'Ground Floor'))] });
const F = () => P.floors[fi];
const KINDS = { walls: 'wall', ops: 'op', furn: 'furn', rooms: 'room', dims: 'dim', texts: 'text', sketches: 'sketch' };
function find(id, f = F()) {
  if (id === 'bg' && P && P.bg) { P.bg.id = 'bg'; return { kind: 'bg', arr: null, o: P.bg }; }
  for (const arr in KINDS) { const o = f[arr].find(x => x.id === id); if (o) return { kind: KINDS[arr], arr, o }; }
  return null;
}
const selObjs = () => sel.map(id => find(id)).filter(Boolean);
function findAnyFloor(id) {
  // 3B tüm katları çizer; kimlikler katlar arası zaten benzersizdir
  if (id === 'bg' && P && P.bg) { P.bg.id = 'bg'; return { kind: 'bg', arr: null, o: P.bg, floor: F(), floorIdx: fi }; }
  for (let i = 0; i < P.floors.length; i++) {
    const fl = P.floors[i];
    for (const arr in KINDS) { const o = fl[arr].find(x => x.id === id); if (o) return { kind: KINDS[arr], arr, o, floor: fl, floorIdx: i }; }
  }
  return null;
}
function groupMemberIdsAny(grp) {
  const ids = [];
  for (const fl of P.floors) for (const k in KINDS) for (const o of fl[k]) if (o.grp === grp) ids.push(o.id);
  return ids;
}

/* ---------- Geometri ---------- */
function segProj(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1e-9;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
  const q = { x: a.x + dx * t, y: a.y + dy * t };
  return { t, q, d: dist(p, q) };
}
const wLen = w => dist(w.a, w.b);
const wAng = w => Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
const wallPivot = w => w.pivot === 'b' ? 'b' : 'a';
const wallFree = w => w.pivot === 'b' ? 'a' : 'b';
function wallDeg(w) {
  const pv = w[wallPivot(w)], fr = w[wallFree(w)];
  const d = Math.atan2(fr.y - pv.y, fr.x - pv.x) * 180 / Math.PI;
  return Math.round(((d % 360) + 360) % 360 * 10) / 10;
}
function setWallDeg(w, deg, syncPos = false) {
  const L = wLen(w) || 100, pv = w[wallPivot(w)], fk = wallFree(w);
  const norm = Math.round((((+deg || 0) % 360) + 360) % 360 * 10) / 10;
  const rad = norm * Math.PI / 180;
  w[fk] = { x: Math.round((pv.x + Math.cos(rad) * L) * 100) / 100, y: Math.round((pv.y + Math.sin(rad) * L) * 100) / 100 };
  if (syncPos && Array.isArray(w.angles) && w.angles.length) {
    const idx = clamp(w.posIdx ?? 0, 0, w.angles.length - 1);
    w.posIdx = idx; w.angles[idx] = norm;
  }
}
function cycleWallPos(w) {
  if (!Array.isArray(w.angles) || w.angles.length < 2) return false;
  w.posIdx = ((w.posIdx ?? 0) + 1) % w.angles.length;
  setWallDeg(w, w.angles[w.posIdx], false);
  return true;
}
function polyArea(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p.x * q.y - q.x * p.y; } return Math.abs(s) / 2; }
function polyCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length], c = p.x * q.y - q.x * p.y; a += c; cx += (p.x + q.x) * c; cy += (p.y + q.y) * c; }
  if (Math.abs(a) < 1e-6) return pts[0];
  return { x: cx / (3 * a), y: cy / (3 * a) };
}
function polyPerim(pts) { let s = 0; for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length]); return s; }
function pointInPoly(p, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { if (((pts[i].y > p.y) !== (pts[j].y > p.y)) && (p.x < (pts[j].x - pts[i].x) * (p.y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x)) c = !c; } return c; }
function opPos(op) {
  const w = F().walls.find(x => x.id === op.wall); if (!w) return null;
  const L = wLen(w) || 1, ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
  return { x: w.a.x + ux * op.d, y: w.a.y + uy * op.d, ang: wAng(w) * 180 / Math.PI, t: w.t, w };
}
function furnCorners(f) {
  const r = f.rot * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), hw = f.w / 2, hd = f.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => ({ x: f.x + x * c - y * s, y: f.y + x * s + y * c }));
}
function bboxOf(kind, o) {
  let pts;
  if (kind === 'wall' || kind === 'dim') pts = [o.a, o.b];
  else if (kind === 'furn') pts = furnCorners(o);
  else if (kind === 'room' || kind === 'sketch') pts = o.pts;
  else if (kind === 'op') { const p = opPos(o); pts = p ? [p] : []; }
  else if (kind === 'bg') pts = [{ x: o.x, y: o.y }, { x: o.x + o.w, y: o.y }, { x: o.x + o.w, y: o.y + o.h }, { x: o.x, y: o.y + o.h }];
  else pts = [{ x: o.x, y: o.y }];
  if (!pts.length) return null;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
function selectionBounds(os = selObjs()) {
  let bb = null;
  for (const { kind, o } of os) {
    const b = bboxOf(kind, o); if (!b) continue;
    bb = bb ? { x0: Math.min(bb.x0, b.x0), y0: Math.min(bb.y0, b.y0), x1: Math.max(bb.x1, b.x1), y1: Math.max(bb.y1, b.y1) } : { ...b };
  }
  return bb;
}
function rotatePoint(p, c, rad) {
  const dx = p.x - c.x, dy = p.y - c.y, cs = Math.cos(rad), sn = Math.sin(rad);
  return { x: Math.round((c.x + dx * cs - dy * sn) * 100) / 100, y: Math.round((c.y + dx * sn + dy * cs) * 100) / 100 };
}
function rotateSelection(deg, os = selObjs(), bb = selectionBounds(os), origAll = null) {
  if (!bb) return false;
  const c = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 }, rad = deg * Math.PI / 180;
  let changed = false;
  for (const { kind, o } of os) {
    const g = origAll?.get(o.id) || o;
    if (kind === 'wall' || kind === 'dim') {
      o.a = rotatePoint(g.a, c, rad); o.b = rotatePoint(g.b, c, rad);
      if (kind === 'wall' && Array.isArray(g.angles) && g.angles.length) o.angles = g.angles.map(a => Math.round((((a + deg) % 360) + 360) % 360 * 10) / 10);
      changed = true;
    } else if (kind === 'room' || kind === 'sketch') {
      o.pts = g.pts.map(p => rotatePoint(p, c, rad)); changed = true;
    } else if (kind === 'furn' || kind === 'text') {
      const p = rotatePoint(g, c, rad);
      o.x = p.x; o.y = p.y; o.rot = ((g.rot || 0) + deg + 360) % 360; changed = true;
    }
  }
  return changed;
}
function contentBounds(f = F()) {
  let b = null;
  for (const arr in KINDS) for (const o of f[arr]) {
    const bb = bboxOf(KINDS[arr], o); if (!bb) continue;
    b = b ? { x0: Math.min(b.x0, bb.x0), y0: Math.min(b.y0, bb.y0), x1: Math.max(b.x1, bb.x1), y1: Math.max(b.y1, bb.y1) } : bb;
  }
  return b;
}

/* ---------- IndexedDB + Yerel Depolama ---------- */
const DB_NAME = 'FloorPlannerDB', DB_VER = 1;
let _dbProm = null;
function openDB() {
  if (_dbProm) return _dbProm;
  _dbProm = new Promise((res, rej) => {
    if (!window.indexedDB) return rej(new Error('IndexedDB desteklenmiyor'));
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'name' });
      if (!db.objectStoreNames.contains('state')) db.createObjectStore('state');
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return _dbProm;
}
async function dbPut(store, val, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const st = tx.objectStore(store);
    const r = key !== undefined ? st.put(val, key) : st.put(val);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbGet(store, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const r = tx.objectStore(store).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function dbGetAll(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readonly');
    const r = tx.objectStore(store).getAll();
    r.onsuccess = () => res(r.result || []);
    r.onerror = () => rej(r.error);
  });
}
async function dbDel(store, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, 'readwrite');
    const r = tx.objectStore(store).delete(key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
async function migrateLegacyStorage() {
  try {
    const raw = localStorage.getItem('fp_projects');
    if (raw) {
      const all = JSON.parse(raw);
      for (const [name, proj] of Object.entries(all)) {
        if (proj && proj.floors) await dbPut('projects', { name, updatedAt: Date.now(), project: proj });
      }
      localStorage.removeItem('fp_projects');
    }
    const auto = localStorage.getItem('fp_auto');
    if (auto) {
      const p = JSON.parse(auto);
      if (p && p.floors) await dbPut('state', p, 'auto');
      localStorage.removeItem('fp_auto');
    }
  } catch (e) { }
}

/* ---------- Geçmiş & kayıt ---------- */
let saveTimer = null;
function commit() {
  if (typeof syncActiveVars === 'function') syncActiveVars();
  const s = JSON.stringify(P);
  if (hist[hi] === s) return;
  hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 150) hist.shift();
  hi = hist.length - 1;
  autosave(); updateUndo();
}
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await dbPut('state', JSON.parse(JSON.stringify(P)), 'auto'); }
    catch (e) {
      try { localStorage.setItem('fp_auto', JSON.stringify(P)); }
      catch (e2) { toast(L('Otomatik kayıt başarısız', 'Autosave failed')); }
    }
  }, 350);
}
const GRID_PRESETS = ['5', '10', '25', '50', '100', '300', '500'];
function syncGridUI() {
  const g = String(P.grid);
  if (GRID_PRESETS.includes(g)) {
    $('#sGrid').value = g;
    $('#lblGridCustom').style.display = 'none';
  } else {
    $('#sGrid').value = 'custom';
    $('#lblGridCustom').style.display = 'inline-flex';
    $('#iGridCustom').value = P.grid;
  }
  $('#sGridType').value = P.gridType || 'square';
  $('#lblAngle').textContent = P.gridType === 'triangle' ? L('Açı 30°', 'Angle 30°') : L('Açı 15°', 'Angle 15°');
}
function restore(s) {
  P = JSON.parse(s); P.gridType = P.gridType || 'square';
  fi = clamp(fi, 0, P.floors.length - 1);
  sel = sel.filter(id => find(id));
  $('#pname').value = P.name; syncGridUI();
  refresh();
  if (ui.view3d && T3) schedBuild3D(); // undo/redo sonrası 3B sahnesi tazelensin
}
function undo() { if (hi > 0) { hi--; restore(hist[hi]); autosave(); updateUndo(); } }
function redo() { if (hi < hist.length - 1) { hi++; restore(hist[hi]); autosave(); updateUndo(); } }
function updateUndo() { $('#bUndo').disabled = hi <= 0; $('#bRedo').disabled = hi >= hist.length - 1; }
function loadProject(obj, msg) {
  P = obj; if (!P.floors || !P.floors.length) P.floors = [newFloor(L('Zemin Kat', 'Ground Floor'))];
  P.grid = P.grid || 10; P.gridType = P.gridType || 'square'; P.wallT = P.wallT || 20; P.wallH = P.wallH || 270;
  P.lib = Object.assign({ shapes: [] }, P.lib || {}); P.lib.shapes = P.lib.shapes || [];
  if (P.bg) P.bg.id = 'bg';
  P.floors.forEach(f => { for (const k in KINDS) f[k] = f[k] || []; f.groups = f.groups || []; for (const o of f.ops) if (o.open == null) o.open = 0; for (const w of f.walls) if (!w.wt) w.wt = 'solid'; });
  fi = 0; sel = []; ui.draw = null; ui.dimStart = null; ui.polyPts = null; placing = null;
  hist = [JSON.stringify(P)]; hi = 0;
  $('#pname').value = P.name; syncGridUI();
  setTool('select'); fit(); refresh(); updateUndo(); autosave();
  if (msg) toast(msg);
}
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

/* ---------- Görünüm ---------- */
const cv = $('#cv');
function svgSize() { const r = cv.getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, t: r.top }; }
function w2s(p) { return { x: p.x * view.z + view.x, y: p.y * view.z + view.y }; }
function wpos(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.z, y: (e.clientY - r.top - view.y) / view.z }; }
function applyView() {
  $('#world').setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.z})`);
  $('#zoomlbl').textContent = Math.round(view.z * 100) + '%';
}
function zoomAt(f, sx, sy) {
  const nz = clamp(view.z * f, 0.04, 8), wx = (sx - view.x) / view.z, wy = (sy - view.y) / view.z;
  view.z = nz; view.x = sx - wx * nz; view.y = sy - wy * nz; render();
}
function fit() {
  const s = svgSize(); let b = contentBounds();
  if (!b && P.bg) b = { x0: P.bg.x, y0: P.bg.y, x1: P.bg.x + P.bg.w, y1: P.bg.y + P.bg.h };
  if (!b) b = { x0: 0, y0: 0, x1: 1000, y1: 700 };
  const bw = Math.max(b.x1 - b.x0, 200), bh = Math.max(b.y1 - b.y0, 200);
  view.z = clamp(Math.min(s.w / bw, s.h / bh) * 0.8, 0.05, 3);
  view.x = s.w / 2 - (b.x0 + b.x1) / 2 * view.z; view.y = s.h / 2 - (b.y0 + b.y1) / 2 * view.z;
  render();
}

/* ---------- Çizim (SVG) ---------- */
const isLight = () => document.documentElement.dataset.theme === 'light';
function pal(forceLight = ui.exporting) {
  const lt = forceLight || isLight();
  const paper = forceLight ? '#ffffff' : '#faf8f5';
  return lt ? {
    lt: true, bg: paper, wall: '#181d24', stroke: '#475569', furnStroke: '#334155',
    gMin: forceLight ? '#cbd5e1' : '#dcd6ca', gMaj: forceLight ? '#94a3b8' : '#b8b0a0', dotMaj: '#64748b',
    text: '#151921', sub: '#475569', halo: paper, accent: '#1d4ed8',
    dim: '#0f766e', glass: '#e0f2fe', swing: '#8696ab',
    roomOp: 0.55, furnOp: 1, wood: '#92400e', tile: '#475569', carpet: '#6b7280'
  } : {
    lt: false, bg: '#0b0f14', wall: '#d5dee8', stroke: '#94a3b8', furnStroke: '#161e29',
    gMin: '#161f2c', gMaj: '#243244', dotMaj: '#475569',
    text: '#e6edf5', sub: '#b8c5d6', halo: '#0b0f14', accent: '#d99b26',
    dim: '#2dd4bf', glass: '#0369a1', swing: '#64748b',
    roomOp: 0.3, furnOp: 0.88, wood: '#d97706', tile: '#94a3b8', carpet: '#9ca3af'
  };
}
function defsSvg() {
  const C = pal(), s = P.grid, h = +(s * Math.sqrt(3) / 2).toFixed(4), h2 = +(2 * h).toFixed(4);
  const ms = s >= 100 ? s * 5 : s >= 25 ? s * 4 : 100, mh = +(ms * Math.sqrt(3) / 2).toFixed(4), mh2 = +(2 * mh).toFixed(4);
  const swMin = 0.65 / view.z, swMaj = 0.95 / view.z, rDot = Math.max(1.1, 1.5 / view.z), rDotM = Math.max(1.8, 2.3 / view.z);
  return `
  <pattern id="p-wood" width="120" height="24" patternUnits="userSpaceOnUse"><path d="M0 0H120M0 12H120M40 0V12M90 12V24" stroke="${C.wood}" stroke-opacity=".3" fill="none" stroke-width="1"/></pattern>
  <pattern id="p-tile" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M0 0H60V60" stroke="${C.tile}" stroke-opacity=".32" fill="none" stroke-width="1"/></pattern>
  <pattern id="p-carpet" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.1" fill="${C.carpet}" fill-opacity=".38"/><circle cx="7.5" cy="7.5" r="1.1" fill="${C.carpet}" fill-opacity=".38"/></pattern>
  <pattern id="g-minor" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><path d="M${s} 0V${s}H0" fill="none" stroke="${C.gMin}" stroke-width="${swMin}" stroke-opacity=".8"/></pattern>
  <pattern id="g-major" width="${ms}" height="${ms}" patternUnits="userSpaceOnUse"><path d="M${ms} 0V${ms}H0" fill="none" stroke="${C.gMaj}" stroke-width="${swMaj}" stroke-opacity=".85"/></pattern>
  <pattern id="g-tri-minor" width="${s}" height="${h2}" patternUnits="userSpaceOnUse"><path d="M0 0H${s}M0 ${h}H${s}M0 0L${s / 2} ${h}L0 ${h2}M${s / 2} 0L${s} ${h}L${s / 2} ${h2}M${s / 2} 0L0 ${h}L${s / 2} ${h2}M${s} 0L${s / 2} ${h}L${s} ${h2}" fill="none" stroke="${C.gMin}" stroke-width="${swMin}" stroke-opacity=".8"/></pattern>
  <pattern id="g-tri-major" width="${ms}" height="${mh2}" patternUnits="userSpaceOnUse"><path d="M0 0H${ms}M0 ${mh}H${ms}M0 0L${ms / 2} ${mh}L0 ${mh2}M${ms / 2} 0L${ms} ${mh}L${ms / 2} ${mh2}M${ms / 2} 0L0 ${mh}L${ms / 2} ${mh2}M${ms} 0L${ms / 2} ${mh}L${ms} ${mh2}" fill="none" stroke="${C.gMaj}" stroke-width="${swMaj}" stroke-opacity=".75"/></pattern>
  <pattern id="g-dots-minor" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="${rDot}" fill="${C.gMaj}" fill-opacity=".8"/></pattern>
  <pattern id="g-dots-major" width="${ms}" height="${ms}" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="${rDotM}" fill="${C.dotMaj}" fill-opacity=".95"/></pattern>`;
}
function gridSvg() {
  const gt = P.gridType || 'square';
  if (gt === 'none') return '';
  const s = svgSize(), x0 = -view.x / view.z, y0 = -view.y / view.z, w = s.w / view.z, h = s.h / view.z;
  let out = '';
  const minId = gt === 'triangle' ? 'g-tri-minor' : gt === 'dots' ? 'g-dots-minor' : 'g-minor';
  const majId = gt === 'triangle' ? 'g-tri-major' : gt === 'dots' ? 'g-dots-major' : 'g-major';
  if (P.grid * view.z >= 6) out += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#${minId})" pointer-events="none"/>`;
  if (view.z > 0.12) out += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#${majId})" pointer-events="none"/>`;
  return out;
}
function bgSvg(live = true) {
  const b = P.bg; if (!b) return '';
  const hit = live && !b.lock ? `data-id="bg" style="cursor:move"` : `pointer-events="none"`;
  return `<image href="${b.src}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" opacity="${b.op}" preserveAspectRatio="none" ${hit}/>`;
}
function roomSvg(r, live) {
  const C = pal(), pts = r.pts.map(p => p.x + ',' + p.y).join(' ');
  const c = polyCentroid(r.pts), area = polyArea(r.pts);
  const fs = clamp(Math.sqrt(area) / 12, 16, 34);
  const hasVars = Array.isArray(r.vars) && r.vars.length > 0;
  const canHitPoly = live && (sel.includes(r.id) || (hasVars && r.vars.length >= 2));
  const polyHit = canHitPoly ? `data-id="${r.id}" data-rpoly="1" style="cursor:${sel.includes(r.id) ? 'move' : 'pointer'}"` : `pointer-events="none"`;
  let s = '';
  if (live && hasVars && r.vars.length >= 2) {
    const curIdx = clamp(r.vIdx ?? 0, 0, r.vars.length - 1);
    r.vars.forEach((v, idx) => {
      if (idx === curIdx || !v.poses) return;
      const rp = v.poses[r.id];
      if (rp && rp.pts) {
        const gpts = rp.pts.map(p => p.x + ',' + p.y).join(' ');
        if (gpts !== pts) {
          const gc = polyCentroid(rp.pts);
          s += `<polygon points="${gpts}" fill="${r.color}" fill-opacity="0.1" stroke="${C.accent}" stroke-opacity="0.5" stroke-width="${Math.max(1.8, 2 / view.z)}" stroke-dasharray="${7 / view.z} ${5 / view.z}" pointer-events="none"/>`;
          s += `<text x="${gc.x}" y="${gc.y}" text-anchor="middle" dominant-baseline="central" font-size="${clamp(11 / view.z, 9, 20)}" font-weight="700" fill="${C.accent}" stroke="${C.halo}" stroke-width="${3 / view.z}" paint-order="stroke" pointer-events="none">${esc(v.label)}</text>`;
        }
      }
      const rotDiff = (a, b) => a != null && Math.abs((((a - (b || 0)) % 360) + 360) % 360) > 1;
      for (const id in v.poses) {
        if (id === r.id) continue;
        const fd = find(id), p = v.poses[id]; if (!fd || !p) continue;
        if (fd.kind === 'furn' && (Math.hypot(p.x - fd.o.x, p.y - fd.o.y) > 1 || (p.w && Math.abs(p.w - fd.o.w) > 1) || (p.d && Math.abs(p.d - fd.o.d) > 1) || rotDiff(p.rot, fd.o.rot))) {
          const gw = p.w ?? fd.o.w, gd = p.d ?? fd.o.d, grot = p.rot ?? fd.o.rot;
          s += `<g transform="translate(${p.x} ${p.y}) rotate(${grot})" pointer-events="none"><rect x="${-gw / 2}" y="${-gd / 2}" width="${gw}" height="${gd}" fill="none" stroke="${C.accent}" stroke-opacity="0.4" stroke-width="${1.5 / view.z}" stroke-dasharray="${5 / view.z} ${4 / view.z}"/></g>`;
        } else if (fd.kind === 'wall' && p.a && p.b && (dist(p.a, fd.o.a) > 1 || dist(p.b, fd.o.b) > 1)) {
          s += `<line x1="${p.a.x}" y1="${p.a.y}" x2="${p.b.x}" y2="${p.b.y}" stroke="${C.accent}" stroke-opacity="0.35" stroke-width="${Math.max(2, (p.t || fd.o.t) * 0.3)}" stroke-dasharray="${6 / view.z} ${4 / view.z}" pointer-events="none"/>`;
        } else if (fd.kind === 'text' && (Math.hypot(p.x - fd.o.x, p.y - fd.o.y) > 1 || rotDiff(p.rot, fd.o.rot))) {
          s += `<circle cx="${p.x}" cy="${p.y}" r="${clamp(12 / view.z, 8, 22)}" fill="none" stroke="${C.accent}" stroke-opacity="0.4" stroke-width="${1.5 / view.z}" stroke-dasharray="${4 / view.z} ${3 / view.z}" pointer-events="none"/>`;
        } else if (fd.kind === 'dim' && p.a && p.b && (dist(p.a, fd.o.a) > 1 || dist(p.b, fd.o.b) > 1)) {
          s += `<line x1="${p.a.x}" y1="${p.a.y}" x2="${p.b.x}" y2="${p.b.y}" stroke="${C.accent}" stroke-opacity="0.35" stroke-width="${1.5 / view.z}" stroke-dasharray="${6 / view.z} ${4 / view.z}" pointer-events="none"/>`;
        }
      }
    });
  }
  s += `<polygon points="${pts}" fill="${r.color}" fill-opacity="${C.roomOp}" ${polyHit}/>`;
  if (r.floor && r.floor !== 'none') s += `<polygon points="${pts}" fill="url(#p-${r.floor})" pointer-events="none"/>`;
  const t1 = esc(r.name), t2 = fmtArea(area);
  const bw = Math.max(t1.length, t2.length) * fs * 0.58 + 10;
  let badge = '';
  if (live && hasVars) {
    const curIdx = clamp(r.vIdx ?? 0, 0, r.vars.length - 1), cur = r.vars[curIdx];
    const bfs = clamp(11.5 / view.z, 9, 20);
    const btxt = r.vars.length >= 2
      ? `👆 ${cur.label} (${curIdx + 1}/${r.vars.length}) • ${L('Tıkla', 'Click me')}`
      : `🔄 ${cur.label} (1/1)`;
    const bbw = Math.max(btxt.length * bfs * 0.56 + bfs * 1.1, bfs * 4.5), bbh = bfs * 1.65;
    const by = c.y + fs * 1.95;
    badge = `<g data-id="${r.id}" data-var-badge="room" transform="translate(${c.x} ${by})" style="cursor:pointer">
      <rect x="${-bbw / 2}" y="${-bbh / 2}" width="${bbw}" height="${bbh}" rx="${bbh / 2}" fill="${C.bg}" stroke="${C.accent}" stroke-width="${Math.max(1.5, 1.8 / view.z)}"/>
      <text text-anchor="middle" dominant-baseline="central" font-size="${bfs}" font-weight="700" fill="${C.accent}" font-family="Segoe UI,sans-serif">${esc(btxt)}</text>
    </g>`;
  }
  const lab = `<g ${live ? `data-id="${r.id}" data-rlabel="1"` : ''} style="cursor:pointer"><rect x="${c.x - bw / 2}" y="${c.y - fs * 0.9}" width="${bw}" height="${fs * 2.1}" fill="#fff" fill-opacity="0" pointer-events="fill" />
    <text x="${c.x}" y="${c.y}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="${C.text}" stroke="${C.halo}" stroke-width="${fs * 0.18}" paint-order="stroke" font-family="Segoe UI,sans-serif">${t1}</text>
    <text x="${c.x}" y="${c.y + fs * 1.05}" text-anchor="middle" font-size="${fs * 0.8}" fill="${C.sub}" stroke="${C.halo}" stroke-width="${fs * 0.16}" paint-order="stroke" font-family="Segoe UI,sans-serif">${t2}</text></g>${badge}`;
  return [s, lab];
}
function wallSvg(w, live) {
  const C = pal(); let s = '';
  const hasPos = Array.isArray(w.angles) && w.angles.length > 0;
  if (hasPos) {
    const pv = w[wallPivot(w)], L = wLen(w), curIdx = clamp(w.posIdx ?? 0, 0, w.angles.length - 1), fs = clamp(11 / view.z, 8, 24);
    const rArc = Math.min(L * 0.4, 55);
    if (rArc > 12) s += `<circle cx="${pv.x}" cy="${pv.y}" r="${rArc}" fill="none" stroke="${C.accent}" stroke-opacity="0.28" stroke-width="1.4" stroke-dasharray="4 4" pointer-events="none"/>`;
    w.angles.forEach((ang, idx) => {
      const rad = ang * Math.PI / 180, gx = pv.x + Math.cos(rad) * L, gy = pv.y + Math.sin(rad) * L;
      if (idx !== curIdx) {
        s += `<line x1="${pv.x}" y1="${pv.y}" x2="${gx}" y2="${gy}" stroke="${C.accent}" stroke-opacity="0.32" stroke-width="${Math.max(2, w.t * 0.28)}" stroke-dasharray="7 5" stroke-linecap="round" pointer-events="none"/>`;
        s += `<circle cx="${gx}" cy="${gy}" r="${Math.max(4, 5 / view.z)}" fill="${C.bg}" stroke="${C.accent}" stroke-width="${1.5 / view.z}" stroke-opacity="0.7" pointer-events="none"/>`;
      }
      const lx = pv.x + Math.cos(rad) * (L + 14 / view.z), ly = pv.y + Math.sin(rad) * (L + 14 / view.z);
      s += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="700" fill="${idx === curIdx ? C.accent : C.sub}" stroke="${C.halo}" stroke-width="${fs * 0.25}" paint-order="stroke" pointer-events="none">${idx + 1}</text>`;
    });
  }
  if (w.wt === 'curtain') {
    // cam cephe: kenar çizgileri + cam dolgu + dikme işaretleri (~120 cm modül)
    const Lc = wLen(w) || 1, ux = (w.b.x - w.a.x) / Lc, uy = (w.b.y - w.a.y) / Lc, nx = -uy, ny = ux;
    const sw = Math.max(1.1, w.t * 0.12);
    s += `<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${C.wall}" stroke-width="${w.t}" stroke-linecap="square" pointer-events="none"/>`;
    s += `<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${C.glass}" stroke-width="${Math.max(1, w.t - 2 * sw)}" stroke-linecap="square" pointer-events="none"/>`;
    const nTick = Math.max(1, Math.round(Lc / 120));
    for (let i = 1; i < nTick; i++) {
      const px = w.a.x + ux * (Lc * i / nTick), py = w.a.y + uy * (Lc * i / nTick), hw2 = w.t / 2 - sw * 0.5;
      s += `<line x1="${px - nx * hw2}" y1="${py - ny * hw2}" x2="${px + nx * hw2}" y2="${py + ny * hw2}" stroke="${C.wall}" stroke-width="${sw}" pointer-events="none"/>`;
    }
  } else {
    s += `<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${C.wall}" stroke-width="${w.t}" stroke-linecap="square" pointer-events="none"/>`;
  }
  if (hasPos) {
    const pv = w[wallPivot(w)], curIdx = clamp(w.posIdx ?? 0, 0, w.angles.length - 1);
    const pr = Math.max(w.t * 0.46, 6 / view.z);
    s += `<circle cx="${pv.x}" cy="${pv.y}" r="${pr}" fill="${C.bg}" stroke="${C.accent}" stroke-width="${Math.max(2, 2.2 / view.z)}" pointer-events="none"/><circle cx="${pv.x}" cy="${pv.y}" r="${pr * 0.38}" fill="${C.accent}" pointer-events="none"/>`;
    if (live) {
      const mx = (w.a.x + w.b.x) / 2, my = (w.a.y + w.b.y) / 2, fs = clamp(11 / view.z, 8, 22), bw = fs * 3.1, bh = fs * 1.45;
      s += `<g data-id="${w.id}" transform="translate(${mx} ${my})" style="cursor:pointer"><rect x="${-bw / 2}" y="${-bh / 2}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${C.bg}" stroke="${C.accent}" stroke-width="${1.5 / view.z}"/><text text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="700" fill="${C.accent}">↻ ${curIdx + 1}/${w.angles.length}</text></g>`;
    }
  }
  if (live) s += `<line data-id="${w.id}" x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="transparent" stroke-width="${Math.max(w.t, 12 / view.z)}" pointer-events="stroke" style="cursor:pointer"/>`;
  return s;
}
function wallDimSvg(w) {
  const L = wLen(w); if (L < 30) return '';
  const C = pal();
  let ang = wAng(w) * 180 / Math.PI; const mx = (w.a.x + w.b.x) / 2, my = (w.a.y + w.b.y) / 2;
  let flip = 1; if (ang > 90 || ang <= -90) { ang += 180; flip = -1; }
  const fs = clamp(13 / view.z, 9, 40), off = w.t / 2 + fs * 0.9;
  return `<text transform="translate(${mx} ${my}) rotate(${ang}) translate(0 ${-off})" text-anchor="middle" font-size="${fs}" fill="${C.sub}" stroke="${C.halo}" stroke-width="${fs * 0.25}" paint-order="stroke" font-family="Segoe UI,sans-serif" pointer-events="none">${fmtLen(L)}</text>`;
}
function opSvg(op, live) {
  const p = opPos(op); if (!p) return '';
  const C = pal(), w = op.w, t = p.t, hw = w / 2, ht = t / 2, sd = op.side || 1, sw = sd > 0 ? 1 : 0;
  const stk = `stroke="${C.stroke}" fill="none" stroke-width="2"`;
  let s = `<g transform="translate(${p.x} ${p.y}) rotate(${p.ang})">`;
  s += `<rect x="${-hw}" y="${-ht - 1}" width="${w}" height="${t + 2}" fill="${C.bg}"/>`;
  s += `<g transform="scale(${op.flip ? -1 : 1} 1)">`;
  if (op.type === 'door') {
    if (op.open) s += `<line x1="${-hw}" y1="0" x2="${-hw}" y2="${sd * w}" ${stk}/>`;
    else s += `<line x1="${-hw}" y1="0" x2="${hw}" y2="0" ${stk}/>`;
    s += `<path d="M${hw} 0A${w} ${w} 0 0 ${sw} ${-hw} ${sd * w}" stroke="${C.swing}" fill="none" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  } else if (op.type === 'double') {
    const l = w / 2;
    if (op.open) s += `<line x1="${-hw}" y1="0" x2="${-hw}" y2="${sd * l}" ${stk}/><line x1="${hw}" y1="0" x2="${hw}" y2="${sd * l}" ${stk}/>`;
    else s += `<line x1="${-hw}" y1="0" x2="0" y2="0" ${stk}/><line x1="0" y1="0" x2="${hw}" y2="0" ${stk}/>`;
    s += `<path d="M0 0A${l} ${l} 0 0 ${sw} ${-hw} ${sd * l}M0 0A${l} ${l} 0 0 ${1 - sw} ${hw} ${sd * l}" stroke="${C.swing}" fill="none" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  } else if (op.type === 'slide') {
    const sx = op.open ? -hw : -hw + w * 0.45;
    s += `<rect x="${-hw}" y="${-ht * 0.7}" width="${w * 0.55}" height="${ht * 0.7}" ${stk}/><rect x="${sx}" y="0" width="${w * 0.55}" height="${ht * 0.7}" ${stk}/>`;
  } else if (op.type === 'arch') {
    s += `<line x1="${-hw}" y1="${-ht}" x2="${hw}" y2="${-ht}" stroke="${C.swing}" stroke-dasharray="5 4" stroke-width="1.2"/><line x1="${-hw}" y1="${ht}" x2="${hw}" y2="${ht}" stroke="${C.swing}" stroke-dasharray="5 4" stroke-width="1.2"/>`;
  } else {
    s += `<rect x="${-hw}" y="${-ht}" width="${w}" height="${t}" fill="${C.glass}" fill-opacity="${C.lt ? 1 : 0.45}" stroke="${C.stroke}" stroke-width="2"/><line x1="${-hw}" y1="0" x2="${hw}" y2="0" stroke="${C.stroke}" stroke-width="1.4"/>`;
  }
  s += `</g>`;
  s += `<line x1="${-hw}" y1="${-ht}" x2="${-hw}" y2="${ht}" stroke="${C.wall}" stroke-width="2"/><line x1="${hw}" y1="${-ht}" x2="${hw}" y2="${ht}" stroke="${C.wall}" stroke-width="2"/>`;
  if (live) s += `<rect data-id="${op.id}" x="${-hw}" y="${-Math.max(ht, 8 / view.z) - 4}" width="${w}" height="${2 * Math.max(ht, 8 / view.z) + 8}" fill="transparent" style="cursor:pointer"/>`;
  return s + '</g>';
}
function furnBody(f) {
  const C = pal(), hw = f.w / 2, hd = f.d / 2, col = f.color, sk = C.furnStroke, fop = `fill-opacity="${C.furnOp}"`;
  let s = '';
  if (f.k === 'round') s += `<ellipse rx="${hw}" ry="${hd}" fill="${col}" ${fop} stroke="${sk}" stroke-width="2"/>`;
  else if (f.k === 'poly') s += `<polygon points="${(f.pts || []).map(p => p.x + ',' + p.y).join(' ')}" fill="${col}" ${fop} stroke="${sk}" stroke-width="2"/>`;
  else if (f.k === 'stairs') {
    s += `<rect x="${-hw}" y="${-hd}" width="${f.w}" height="${f.d}" fill="${col}" ${fop} stroke="${sk}" stroke-width="2"/>`;
    const n = Math.max(3, Math.round(f.d / 25)); let l = '';
    for (let i = 1; i < n; i++) l += `M${-hw} ${-hd + f.d / n * i}H${hw}`;
    s += `<path d="${l}" stroke="${sk}" stroke-width="1.2" fill="none"/><path d="M0 ${hd - 10}V${-hd + 14}M-8 ${-hd + 26}L0 ${-hd + 12}L8 ${-hd + 26}" stroke="${sk}" stroke-width="2" fill="none"/>`;
  } else {
    s += `<rect x="${-hw}" y="${-hd}" width="${f.w}" height="${f.d}" rx="${Math.min(6, hw / 3)}" fill="${col}" ${fop} stroke="${sk}" stroke-width="2"/>`;
    if (f.k === 'bed') {
      const two = f.w > 130, pw = two ? f.w / 2 - 12 : f.w - 16;
      s += `<rect x="${-hw + 6}" y="${-hd + 6}" width="${pw}" height="${Math.min(40, f.d * 0.2)}" rx="6" fill="#fff" fill-opacity=".8" stroke="${sk}" stroke-width="1"/>`;
      if (two) s += `<rect x="${6}" y="${-hd + 6}" width="${pw}" height="${Math.min(40, f.d * 0.2)}" rx="6" fill="#fff" fill-opacity=".8" stroke="${sk}" stroke-width="1"/>`;
      s += `<path d="M${-hw} ${-hd + f.d * 0.35}H${hw}" stroke="${sk}" stroke-width="1" fill="none"/>`;
    } else if (f.k === 'sofa') {
      s += `<rect x="${-hw}" y="${-hd}" width="${f.w}" height="${Math.min(22, f.d * 0.25)}" rx="5" fill="#000" fill-opacity=".14" stroke="${sk}" stroke-width="1"/>`;
    }
  }
  return s;
}
function furnSvg(f, live) {
  const C = pal(), fs = Math.max(12, Math.min(f.w, f.d) * 0.42);
  let s = `<g transform="translate(${f.x} ${f.y}) rotate(${f.rot})" ${live ? `data-id="${f.id}" style="cursor:move"` : ''}>${furnBody(f)}`;
  if (f.icon) s += `<text transform="rotate(${-f.rot})" text-anchor="middle" dominant-baseline="central" font-size="${fs}" pointer-events="none">${f.icon}</text>`;
  if (f.label) s += `<text transform="rotate(${-f.rot})" y="${Math.min(f.d, f.w) * 0.42 + 6}" text-anchor="middle" font-size="${clamp(Math.min(f.w, f.d) * 0.18, 10, 18)}" fill="${C.text}" stroke="${C.halo}" stroke-width="3" paint-order="stroke" pointer-events="none" font-family="Segoe UI,sans-serif">${esc(f.label)}</text>`;
  return s + '</g>';
}
function dimSvg(d, live) {
  const L = dist(d.a, d.b); if (L < 1) return '';
  const C = pal(), ux = (d.b.x - d.a.x) / L, uy = (d.b.y - d.a.y) / L, nx = -uy, ny = ux, o = d.off ?? 40;
  const A = { x: d.a.x + nx * o, y: d.a.y + ny * o }, B = { x: d.b.x + nx * o, y: d.b.y + ny * o };
  let ang = Math.atan2(uy, ux) * 180 / Math.PI; if (ang > 90 || ang <= -90) ang += 180;
  const fs = 14, tk = 7, c = C.dim, sg = o >= 0 ? 1 : -1;
  const ext = `M${d.a.x + nx * 5 * sg} ${d.a.y + ny * 5 * sg}L${A.x + nx * 6 * sg} ${A.y + ny * 6 * sg}M${d.b.x + nx * 5 * sg} ${d.b.y + ny * 5 * sg}L${B.x + nx * 6 * sg} ${B.y + ny * 6 * sg}`;
  let s = `<g ${live ? `data-id="${d.id}" style="cursor:pointer"` : ''}><path d="${ext}M${A.x} ${A.y}L${B.x} ${B.y}" stroke="${c}" stroke-width="1.3" fill="none"/>`;
  for (const P2 of [A, B]) s += `<path d="M${P2.x - (ux + nx) * tk * .7} ${P2.y - (uy + ny) * tk * .7}L${P2.x + (ux + nx) * tk * .7} ${P2.y + (uy + ny) * tk * .7}" stroke="${c}" stroke-width="2"/>`;
  s += `<text transform="translate(${(A.x + B.x) / 2} ${(A.y + B.y) / 2}) rotate(${ang}) translate(0 ${-5})" text-anchor="middle" font-size="${fs}" fill="${c}" stroke="${C.halo}" stroke-width="3" paint-order="stroke" font-family="Segoe UI,sans-serif">${fmtLen(L)}</text>`;
  if (live) s += `<path d="M${A.x} ${A.y}L${B.x} ${B.y}" stroke="transparent" stroke-width="${Math.max(10, 10 / view.z)}"/>`;
  return s + '</g>';
}
function textSvg(t, live) {
  const C = pal();
  const col = !C.lt && (t.color === '#1e293b' || t.color === '#0f172a' || t.color === '#000000') ? C.text : t.color;
  return `<text ${live ? `data-id="${t.id}" style="cursor:move"` : ''} transform="translate(${t.x} ${t.y}) rotate(${t.rot || 0})" font-size="${t.size}" fill="${col}" stroke="${C.halo}" stroke-width="${t.size * 0.14}" paint-order="stroke" font-family="Segoe UI,sans-serif" font-weight="600">${esc(t.text)}</text>`;
}
function sketchSvg(sk, live) {
  const C = pal(); if (!sk.pts || sk.pts.length < 2) return '';
  let col = sk.color || '#1e293b';
  if (!C.lt && (col === '#1e293b' || col === '#0f172a' || col === '#000000')) col = C.text; // koyu mürekkep, koyu temada görünür olsun
  const ptsStr = sk.pts.map(p => Math.round(p.x * 100) / 100 + ',' + Math.round(p.y * 100) / 100).join(' '), wd = sk.w || 4;
  let s = `<polyline points="${ptsStr}" fill="none" stroke="${col}" stroke-width="${wd}" stroke-linecap="round" stroke-linejoin="round" pointer-events="none"/>`;
  if (live) s += `<polyline data-id="${sk.id}" points="${ptsStr}" fill="none" stroke="transparent" stroke-width="${Math.max(wd + 8 / view.z, 12 / view.z)}" stroke-linecap="round" stroke-linejoin="round" pointer-events="stroke" style="cursor:pointer"/>`;
  return s;
}
function groupVarsSvg(f, live) {
  if (!live || !f.groups || !f.groups.length) return '';
  const C = pal(); let s = '';
  for (const rec of f.groups) {
    if (!rec.vars || !rec.vars.length) continue;
    const mids = groupMemberIds(rec.id); if (!mids.length) continue;
    let bb = null;
    for (const id of mids) {
      const fd = find(id); if (!fd) continue;
      const b = bboxOf(fd.kind, fd.o); if (!b) continue;
      bb = bb ? { x0: Math.min(bb.x0, b.x0), y0: Math.min(bb.y0, b.y0), x1: Math.max(bb.x1, b.x1), y1: Math.max(bb.y1, b.y1) } : { ...b };
    }
    if (!bb) continue;
    const curIdx = clamp(rec.idx ?? 0, 0, rec.vars.length - 1), cur = rec.vars[curIdx];
    if (rec.vars.length >= 2) {
      rec.vars.forEach((v, idx) => {
        if (idx === curIdx || !v.poses) return;
        for (const id of mids) {
          const fd = find(id), p = v.poses[id]; if (!fd || !p) continue;
          const rotDiff = (a, b) => a != null && Math.abs((((a - (b || 0)) % 360) + 360) % 360) > 1;
          if (fd.kind === 'furn' && (Math.hypot(p.x - fd.o.x, p.y - fd.o.y) > 1 || (p.w && Math.abs(p.w - fd.o.w) > 1) || (p.d && Math.abs(p.d - fd.o.d) > 1) || rotDiff(p.rot, fd.o.rot))) {
            const gw = p.w ?? fd.o.w, gd = p.d ?? fd.o.d, grot = p.rot ?? fd.o.rot;
            s += `<g transform="translate(${p.x} ${p.y}) rotate(${grot})" pointer-events="none"><rect x="${-gw / 2}" y="${-gd / 2}" width="${gw}" height="${gd}" fill="none" stroke="${C.accent}" stroke-opacity="0.4" stroke-width="${1.5 / view.z}" stroke-dasharray="${5 / view.z} ${4 / view.z}"/></g>`;
          } else if (fd.kind === 'wall' && p.a && p.b && (dist(p.a, fd.o.a) > 1 || dist(p.b, fd.o.b) > 1)) {
            s += `<line x1="${p.a.x}" y1="${p.a.y}" x2="${p.b.x}" y2="${p.b.y}" stroke="${C.accent}" stroke-opacity="0.35" stroke-width="${Math.max(2, (p.t || fd.o.t) * 0.3)}" stroke-dasharray="${6 / view.z} ${4 / view.z}" pointer-events="none"/>`;
          } else if (fd.kind === 'room' && p.pts) {
            const gpts = p.pts.map(q => q.x + ',' + q.y).join(' ');
            s += `<polygon points="${gpts}" fill="none" stroke="${C.accent}" stroke-opacity="0.4" stroke-width="${1.8 / view.z}" stroke-dasharray="${6 / view.z} ${4 / view.z}" pointer-events="none"/>`;
          } else if (fd.kind === 'text' && (Math.hypot(p.x - fd.o.x, p.y - fd.o.y) > 1 || rotDiff(p.rot, fd.o.rot))) {
            s += `<circle cx="${p.x}" cy="${p.y}" r="${clamp(12 / view.z, 8, 22)}" fill="none" stroke="${C.accent}" stroke-opacity="0.4" stroke-width="${1.5 / view.z}" stroke-dasharray="${4 / view.z} ${3 / view.z}" pointer-events="none"/>`;
          } else if (fd.kind === 'dim' && p.a && p.b && (dist(p.a, fd.o.a) > 1 || dist(p.b, fd.o.b) > 1)) {
            s += `<line x1="${p.a.x}" y1="${p.a.y}" x2="${p.b.x}" y2="${p.b.y}" stroke="${C.accent}" stroke-opacity="0.35" stroke-width="${1.5 / view.z}" stroke-dasharray="${6 / view.z} ${4 / view.z}" pointer-events="none"/>`;
          }
        }
      });
    }
    const pad = 6 / view.z;
    s += `<rect x="${bb.x0 - pad}" y="${bb.y0 - pad}" width="${bb.x1 - bb.x0 + pad * 2}" height="${bb.y1 - bb.y0 + pad * 2}" rx="${4 / view.z}" fill="none" stroke="${C.accent}" stroke-opacity="0.45" stroke-width="${1.4 / view.z}" stroke-dasharray="${5 / view.z} ${4 / view.z}" pointer-events="none"/>`;
    const bfs = clamp(11.5 / view.z, 9, 20);
    const btxt = rec.vars.length >= 2
      ? `👆 ${cur.label} (${curIdx + 1}/${rec.vars.length}) • ${L('Tıkla', 'Click me')}`
      : `🔄 ${cur.label} (1/1)`;
    const bbw = Math.max(btxt.length * bfs * 0.56 + bfs * 1.1, bfs * 4.5), bbh = bfs * 1.65;
    const cx = (bb.x0 + bb.x1) / 2, cy = bb.y0 - bbh * 0.65 - pad;
    s += `<g data-id="${mids[0]}" data-var-badge="group" data-grp="${rec.id}" transform="translate(${cx} ${cy})" style="cursor:pointer">
      <rect x="${-bbw / 2}" y="${-bbh / 2}" width="${bbw}" height="${bbh}" rx="${bbh / 2}" fill="${C.bg}" stroke="${C.accent}" stroke-width="${Math.max(1.5, 1.8 / view.z)}"/>
      <text text-anchor="middle" dominant-baseline="central" font-size="${bfs}" font-weight="700" fill="${C.accent}" font-family="Segoe UI,sans-serif">${esc(btxt)}</text>
    </g>`;
  }
  return s;
}
function layerStrings(f, live) {
  return {
    rooms: f.rooms.map(r => roomSvg(r, live)[0]).join(''),
    roomLabels: f.rooms.map(r => roomSvg(r, live)[1]).join('') + groupVarsSvg(f, live),
    walls: f.walls.map(w => wallSvg(w, live)).join('') + (ui.dims ? f.walls.map(wallDimSvg).join('') : ''),
    ops: f.ops.map(o => opSvg(o, live)).join(''),
    furn: f.furn.map(x => furnSvg(x, live)).join(''),
    dims: f.dims.map(d => dimSvg(d, live)).join(''),
    texts: f.texts.map(t => textSvg(t, live)).join(''),
    sketches: (f.sketches || []).map(s => sketchSvg(s, live)).join(''),
  };
}
const GRESIZE = { wall: 1, dim: 1, room: 1, furn: 1, text: 1, sketch: 1, bg: 1 };
function handleSvg() {
  const C = pal(), z = view.z, hs = 6 / z, os = selObjs(); let s = '';
  const hnd = (x, y, id, cur = 'pointer', shape = 'rect') => shape === 'rect'
    ? `<rect data-h="${id}" x="${x - hs}" y="${y - hs}" width="${hs * 2}" height="${hs * 2}" fill="#fff" stroke="#f59e0b" stroke-width="${1.6 / z}" style="cursor:${cur}"/>`
    : `<circle data-h="${id}" cx="${x}" cy="${y}" r="${hs * 1.15}" fill="#f59e0b" stroke="#fff" stroke-width="${1.6 / z}" style="cursor:${cur}"/>`;
  for (const { kind, o } of os) {
    if (kind === 'wall') s += `<line x1="${o.a.x}" y1="${o.a.y}" x2="${o.b.x}" y2="${o.b.y}" stroke="#f59e0b" stroke-opacity=".45" stroke-width="${o.t + 6 / z}" stroke-linecap="square" pointer-events="none"/>`
      + `<text transform="translate(${(o.a.x + o.b.x) / 2} ${(o.a.y + o.b.y) / 2})" font-size="${14 / z}" text-anchor="middle" dy="${-o.t / 2 - 6 / z}" fill="${C.lt ? '#b45309' : '#fbbf24'}" font-weight="700" stroke="${C.halo}" stroke-width="${3 / z}" paint-order="stroke" pointer-events="none">${fmtLen(wLen(o))}</text>`;
    if (kind === 'furn') {
      s += `<g transform="translate(${o.x} ${o.y}) rotate(${o.rot})" pointer-events="none"><rect x="${-o.w / 2}" y="${-o.d / 2}" width="${o.w}" height="${o.d}" fill="none" stroke="#f59e0b" stroke-width="${2 / z}" stroke-dasharray="${6 / z} ${4 / z}"/></g>`;
    }
    if (kind === 'room') s += `<polygon points="${o.pts.map(p => p.x + ',' + p.y).join(' ')}" fill="#f59e0b" fill-opacity=".12" stroke="#f59e0b" stroke-width="${2 / z}" stroke-dasharray="${6 / z} ${4 / z}" pointer-events="none"/>`;
    if (kind === 'op') { const p = opPos(o); if (p) s += `<g transform="translate(${p.x} ${p.y}) rotate(${p.ang})" pointer-events="none"><rect x="${-o.w / 2 - 3}" y="${-p.t / 2 - 5}" width="${o.w + 6}" height="${p.t + 10}" fill="#f59e0b" fill-opacity=".2" stroke="#f59e0b" stroke-width="${1.6 / z}"/></g>`; }
    if (kind === 'dim') s += `<circle cx="${o.a.x}" cy="${o.a.y}" r="${hs}" fill="#f59e0b"/><circle cx="${o.b.x}" cy="${o.b.y}" r="${hs}" fill="#f59e0b"/>`;
    if (kind === 'text') s += `<circle cx="${o.x}" cy="${o.y}" r="${hs}" fill="#f59e0b"/>`;
    if (kind === 'sketch' && o.pts && o.pts.length > 1) s += `<polyline points="${o.pts.map(p => p.x + ',' + p.y).join(' ')}" fill="none" stroke="#f59e0b" stroke-width="${(o.w || 4) + 4 / z}" stroke-linecap="round" stroke-linejoin="round" opacity=".45" pointer-events="none"/>`;
    if (kind === 'bg') s += `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="none" stroke="#f59e0b" stroke-width="${2 / z}" stroke-dasharray="${6 / z} ${4 / z}" pointer-events="none"/>`;
  }
  if (os.length === 1) {
    const { kind, o } = os[0];
    if (kind === 'wall') {
      const pv = o[wallPivot(o)], fr = o[wallFree(o)], L = wLen(o) || 1, ux = (fr.x - pv.x) / L, uy = (fr.y - pv.y) / L;
      const rx = fr.x + ux * (28 / z), ry = fr.y + uy * (28 / z);
      s += `<line x1="${fr.x}" y1="${fr.y}" x2="${rx}" y2="${ry}" stroke="#f59e0b" stroke-width="${1.5 / z}" pointer-events="none"/>`
        + hnd(o.a.x, o.a.y, 'wa', 'move') + hnd(o.b.x, o.b.y, 'wb', 'move') + hnd(rx, ry, 'wrot', 'grab', 'circle');
    }
    if (kind === 'room') {
      o.pts.forEach((p, i) => {
        const q = o.pts[(i + 1) % o.pts.length], mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        const cur = Math.abs(q.x - p.x) > Math.abs(q.y - p.y) ? 'ns-resize' : 'ew-resize';
        s += hnd(mx, my, 're' + i, cur, 'circle');
      });
      o.pts.forEach((p, i) => s += hnd(p.x, p.y, 'v' + i, 'move'));
    }
    if (kind === 'dim') {
      const L = dist(o.a, o.b) || 1, nx = -(o.b.y - o.a.y) / L, ny = (o.b.x - o.a.x) / L, off = o.off ?? 40;
      s += hnd(o.a.x, o.a.y, 'da', 'move') + hnd(o.b.x, o.b.y, 'db', 'move') + hnd((o.a.x + o.b.x) / 2 + nx * off, (o.a.y + o.b.y) / 2 + ny * off, 'doff', 'move', 'circle');
    }
    if (kind === 'furn') {
      const c = furnCorners(o); c.forEach((p, i) => s += hnd(p.x, p.y, 'c' + i, 'nwse-resize'));
      const r = o.rot * Math.PI / 180, dd = o.d / 2 + 30 / z;
      const rx = o.x + Math.sin(r) * dd, ry = o.y - Math.cos(r) * dd, tx = o.x + Math.sin(r) * o.d / 2, ty = o.y - Math.cos(r) * o.d / 2;
      s += `<line x1="${tx}" y1="${ty}" x2="${rx}" y2="${ry}" stroke="#f59e0b" stroke-width="${1.5 / z}" pointer-events="none"/>` + hnd(rx, ry, 'rot', 'grab', 'circle');
    }
    if (kind === 'bg') {
      [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]].forEach(([x, y], i) => s += hnd(x, y, 'bg' + i, i % 2 ? 'nesw-resize' : 'nwse-resize'));
      s += hnd(o.x + o.w / 2, o.y, 'bgN', 'ns-resize') + hnd(o.x + o.w, o.y + o.h / 2, 'bgE', 'ew-resize')
        + hnd(o.x + o.w / 2, o.y + o.h, 'bgS', 'ns-resize') + hnd(o.x, o.y + o.h / 2, 'bgW', 'ew-resize');
    }
  } else if (os.length > 1 && os.some(x => GRESIZE[x.kind])) {
    const bb = selectionBounds(os);
    if (bb && bb.x1 - bb.x0 > 5 && bb.y1 - bb.y0 > 5) {
      s += `<rect x="${bb.x0}" y="${bb.y0}" width="${bb.x1 - bb.x0}" height="${bb.y1 - bb.y0}" fill="none" stroke="#f59e0b" stroke-width="${1.6 / z}" stroke-dasharray="${6 / z} ${4 / z}" pointer-events="none"/>`;
      [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x1, bb.y1], [bb.x0, bb.y1]].forEach(([x, y], i) => s += hnd(x, y, 'g' + i, i % 2 ? 'nesw-resize' : 'nwse-resize'));
      if (os.some(x => ['wall', 'dim', 'room', 'sketch', 'furn', 'text'].includes(x.kind))) {
        const cx = (bb.x0 + bb.x1) / 2, ty = bb.y0, ry = ty - 30 / z;
        s += `<line x1="${cx}" y1="${ty}" x2="${cx}" y2="${ry}" stroke="#f59e0b" stroke-width="${1.5 / z}" pointer-events="none"/>` + hnd(cx, ry, 'grot', 'grab', 'circle');
      }
    }
  }
  return s;
}
function render() {
  if (!P) return;
  const f = F();
  $('#defs').innerHTML = defsSvg();
  applyView();
  $('#gBg').innerHTML = (layersVis.bg ? bgSvg() : '') + (fi > 0 ? `<g opacity=".18" pointer-events="none">${P.floors[fi - 1].walls.map(w => wallSvg(w, false)).join('')}</g>` : '');
  $('#gGrid').innerHTML = gridSvg();
  const L = layerStrings(f, true);
  $('#gRooms').innerHTML = layersVis.rooms ? L.rooms : '';
  $('#gWalls').innerHTML = layersVis.walls ? L.walls : '';
  $('#gOps').innerHTML = layersVis.walls ? L.ops : '';
  $('#gFurn').innerHTML = layersVis.furn ? L.furn : '';
  $('#gDims').innerHTML = layersVis.dims ? L.dims : '';
  $('#gTexts').innerHTML = (layersVis.rooms ? L.roomLabels : '') + L.texts;
  $('#gSketch').innerHTML = layersVis.sketch ? L.sketches : '';
  $('#gSel').innerHTML = handleSvg();
  drawPreview();
}

/* ---------- Yakalama (snap) ---------- */
function snapToGrid(p) {
  const gt = P.gridType || 'square', g = P.grid;
  if (gt === 'none') return { x: p.x, y: p.y };
  if (gt === 'triangle') {
    const h = g * Math.sqrt(3) / 2, r0 = Math.round(p.y / h);
    let best = null, bd = Infinity;
    for (let dr = -1; dr <= 1; dr++) {
      const row = r0 + dr, y = row * h, off = (row & 1) ? g / 2 : 0;
      const x = Math.round((p.x - off) / g) * g + off;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }; }
    }
    return best;
  }
  return { x: rnd(p.x, g), y: rnd(p.y, g) };
}
function snapPt(p, from, e, ignore) {
  if (!ui.snap || (e && e.shiftKey)) return { x: p.x, y: p.y, hit: null };
  const r = 14 / view.z, f = F(); let best = null, bd = r;
  for (const w of f.walls) {
    if (ignore && ignore.has(w.id)) continue;
    for (const q of [w.a, w.b]) { const d = dist(p, q); if (d < bd) { bd = d; best = q; } }
  }
  if (!ignore) for (const rm of f.rooms) for (const q of rm.pts) { const d = dist(p, q); if (d < bd) { bd = d; best = q; } }
  if (best) return { x: best.x, y: best.y, hit: 'end' };
  const g = P.grid, gt = P.gridType || 'square';
  if (from && ui.angle) {
    const dx = p.x - from.x, dy = p.y - from.y, l = Math.hypot(dx, dy);
    if (l < 1) return { x: from.x, y: from.y, hit: null };
    const step = gt === 'triangle' ? Math.PI / 6 : Math.PI / 12;
    const a = Math.round(Math.atan2(dy, dx) / step) * step;
    const L = gt === 'none' ? l : Math.max(g, rnd(l, g));
    let q = { x: from.x + Math.cos(a) * L, y: from.y + Math.sin(a) * L };
    if (Math.abs(Math.cos(a)) < 1e-6) q.x = from.x; if (Math.abs(Math.sin(a)) < 1e-6) q.y = from.y;
    q.x = Math.round(q.x * 10) / 10; q.y = Math.round(q.y * 10) / 10;
    for (const w of f.walls) for (const o of [w.a, w.b]) {
      if (Math.abs(o.x - q.x) < r / 3 && Math.abs(Math.cos(a)) < 0.01) q.x = o.x;
    }
    return { ...q, hit: null };
  }
  return { ...snapToGrid(p), hit: null };
}
function wallNear(p, maxD = 40) {
  let best = null;
  for (const w of F().walls) { const pr = segProj(p, w.a, w.b); if (pr.d < maxD && (!best || pr.d < best.pr.d)) best = { w, pr }; }
  return best;
}
function magnet(f) {
  if (!ui.snap) return;
  let best = null;
  for (const w of F().walls) {
    const pr = segProj({ x: f.x, y: f.y }, w.a, w.b), lim = w.t / 2 + f.d / 2 + 18;
    if (pr.d < lim && (!best || pr.d < best.pr.d)) best = { w, pr };
  }
  if (!best) return;
  const { w, pr } = best; let nx = f.x - pr.q.x, ny = f.y - pr.q.y; const l = Math.hypot(nx, ny);
  if (l < 1e-6) { nx = -Math.sin(wAng(w)); ny = Math.cos(wAng(w)); } else { nx /= l; ny /= l; }
  f.rot = (Math.round(Math.atan2(-nx, ny) * 180 / Math.PI) + 360) % 360;
  f.x = pr.q.x + nx * (w.t / 2 + f.d / 2); f.y = pr.q.y + ny * (w.t / 2 + f.d / 2);
}

/* ---------- Oluşturma ---------- */
function mkWall(a, b) { return { id: uid(), a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, t: P.wallT, h: P.wallH, wt: 'solid' }; }
function opType(id) { return id.startsWith('window') || id === 'wsmall' ? 'window' : id; }
function mkOp(def, wall, d) {
  const L = wLen(wall); const w = def.w;
  return { id: uid(), wall: wall.id, d: L >= w ? clamp(d, w / 2, L - w / 2) : L / 2, w, h: def.h, sill: def.sill, type: opType(def.id), flip: 0, side: 1, open: 0 };
}
function mkFurn(def, x, y, rot = 0) { const o = { id: uid(), type: def.id, name: itemName(def), icon: def.icon, k: def.k, w: def.w, d: def.d, h: def.h, color: def.color, x, y, rot, label: '' }; if (def.k === 'poly' && def.pts) o.pts = JSON.parse(JSON.stringify(def.pts)); return o; }
function mkRoom(pts, name) {
  const n = F().rooms.length;
  return { id: uid(), name: name || L('Oda ', 'Room ') + (n + 1), color: ROOMCOL[n % ROOMCOL.length], floor: 'none', pts };
}
function addRectWalls(x0, y0, x1, y1) {
  const f = F(), xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  const ws = [mkWall({ x: xa, y: ya }, { x: xb, y: ya }), mkWall({ x: xb, y: ya }, { x: xb, y: yb }), mkWall({ x: xb, y: yb }, { x: xa, y: yb }), mkWall({ x: xa, y: yb }, { x: xa, y: ya })];
  f.walls.push(...ws); return ws;
}
function deleteIds(ids) {
  const f = F(), s = new Set(ids);
  if (s.has('bg')) P.bg = null;
  f.walls = f.walls.filter(w => !s.has(w.id));
  const wl = new Set(f.walls.map(w => w.id));
  f.ops = f.ops.filter(o => !s.has(o.id) && wl.has(o.wall));
  for (const k of ['furn', 'rooms', 'dims', 'texts', 'sketches']) f[k] = (f[k] || []).filter(o => !s.has(o.id));
  dropPoseOrphans(ids, true); // silinen nesnelerin (grup + oda) düzen kayıtlarındaki eski pozları temizlensin
  pruneGroups();
  sel = sel.filter(id => !s.has(id));
}
function deleteSel() { if (!sel.length) return; deleteIds(sel); commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); }

/* ---------- Oda algılama (raster flood-fill) ---------- */
function detectRoom(p) {
  const f = F(); if (!f.walls.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const w of f.walls) for (const q of [w.a, w.b]) { x0 = Math.min(x0, q.x - w.t); y0 = Math.min(y0, q.y - w.t); x1 = Math.max(x1, q.x + w.t); y1 = Math.max(y1, q.y + w.t); }
  x0 -= 60; y0 -= 60; x1 += 60; y1 += 60;
  if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) return 'open';
  const W = x1 - x0, H = y1 - y0, res = Math.max(2, Math.max(W, H) / 1800);
  const cw = Math.ceil(W / res), ch = Math.ceil(H / res);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch);
  ctx.strokeStyle = '#000'; ctx.lineCap = 'square';
  for (const w of f.walls) { ctx.lineWidth = w.t / res; ctx.beginPath(); ctx.moveTo((w.a.x - x0) / res, (w.a.y - y0) / res); ctx.lineTo((w.b.x - x0) / res, (w.b.y - y0) / res); ctx.stroke(); }
  const data = ctx.getImageData(0, 0, cw, ch).data;
  const free = i => data[i * 4] > 140;
  const sx = Math.floor((p.x - x0) / res), sy = Math.floor((p.y - y0) / res);
  if (!free(sy * cw + sx)) return null;
  const vis = new Uint8Array(cw * ch), stack = [sy * cw + sx]; vis[stack[0]] = 1;
  const cells = []; let open = false;
  while (stack.length) {
    const i = stack.pop(), x = i % cw, y = (i / cw) | 0; cells.push(i);
    if (x === 0 || y === 0 || x === cw - 1 || y === ch - 1) { open = true; break; }
    for (const j of [i - 1, i + 1, i - cw, i + cw]) if (!vis[j] && free(j)) { vis[j] = 1; stack.push(j); }
  }
  if (open) return 'open';
  const V = cw + 1, edges = new Map(), add = (a, b) => { if (!edges.has(a)) edges.set(a, []); edges.get(a).push(b); };
  const inR = (x, y) => x >= 0 && y >= 0 && x < cw && y < ch && vis[y * cw + x];
  for (const i of cells) {
    const x = i % cw, y = (i / cw) | 0;
    if (!inR(x, y - 1)) add(y * V + x, y * V + x + 1);
    if (!inR(x + 1, y)) add(y * V + x + 1, (y + 1) * V + x + 1);
    if (!inR(x, y + 1)) add((y + 1) * V + x + 1, (y + 1) * V + x);
    if (!inR(x - 1, y)) add((y + 1) * V + x, y * V + x);
  }
  let bestLoop = null, bestA = 0;
  while (edges.size) {
    const start = edges.keys().next().value; const loop = [start]; let cur = start;
    for (;;) {
      const arr = edges.get(cur); if (!arr) break;
      const nxt = arr.pop(); if (!arr.length) edges.delete(cur);
      if (nxt === start) break; loop.push(nxt); cur = nxt;
      if (loop.length > 400000) break;
    }
    const pts = loop.map(k => ({ x: x0 + (k % V) * res, y: y0 + Math.floor(k / V) * res }));
    const a = polyArea(pts); if (a > bestA) { bestA = a; bestLoop = pts; }
  }
  if (!bestLoop) return null;
  let pts = bestLoop;
  // doğrusal noktaları temizle
  const clean = a => a.filter((q, i) => { const pr = a[(i - 1 + a.length) % a.length], nx = a[(i + 1) % a.length]; return Math.abs((q.x - pr.x) * (nx.y - q.y) - (q.y - pr.y) * (nx.x - q.x)) > 1e-6; });
  pts = clean(pts);
  pts = simplifyLoop(pts, res * 1.1);
  pts = pts.map(q => ({ x: Math.round(q.x), y: Math.round(q.y) }));
  return pts.length >= 3 ? pts : null;
}
function simplifyLoop(pts, eps) {
  if (pts.length < 8) return pts;
  // ilk ve en uzak nokta ile iki parçaya böl, Douglas-Peucker uygula
  let far = 0, fd = 0; for (let i = 1; i < pts.length; i++) { const d = dist(pts[0], pts[i]); if (d > fd) { fd = d; far = i; } }
  const dp = (a) => {
    if (a.length < 3) return a;
    let m = 0, mi = 0; for (let i = 1; i < a.length - 1; i++) { const d = segProj(a[i], a[0], a[a.length - 1]).d; if (d > m) { m = d; mi = i; } }
    if (m > eps) { const l = dp(a.slice(0, mi + 1)), r = dp(a.slice(mi)); return l.slice(0, -1).concat(r); }
    return [a[0], a[a.length - 1]];
  };
  const A = dp(pts.slice(0, far + 1)), B = dp(pts.slice(far).concat([pts[0]]));
  return A.slice(0, -1).concat(B.slice(0, -1));
}
function simplifyStroke(pts, eps) {
  // açık (kapalı olmayan) serbest çizgi için Douglas-Peucker
  const dp = (a) => {
    if (a.length < 3) return a;
    let m = 0, mi = 0; for (let i = 1; i < a.length - 1; i++) { const d = segProj(a[i], a[0], a[a.length - 1]).d; if (d > m) { m = d; mi = i; } }
    if (m > eps) { const l = dp(a.slice(0, mi + 1)), r = dp(a.slice(mi)); return l.slice(0, -1).concat(r); }
    return [a[0], a[a.length - 1]];
  };
  return dp(pts);
}
function autoRoomAt(p, silent) {
  const r = detectRoom(p);
  if (r === 'open') { if (!silent) toast(L('Alan kapalı değil – duvarlar arasında boşluk var', 'Area is not enclosed – there is a gap between walls')); return null; }
  if (!r) { if (!silent) toast(L('Burada oda algılanamadı (duvarın üzerine tıkladınız mı?)', 'No room detected here (did you click on a wall?)')); return null; }
  const rm = mkRoom(r); F().rooms.push(rm); return rm;
}

/* ---------- 3B zemin plakası: duvarların dış konturunu izleyen poligon (taşma yok) ---------- */
function rectPoly(b) { return [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }]; }
// maskelenmiş piksellerin dış kenarlarını kapalı poligonlar olarak döndürür
function traceMaskLoops(mask, cw, ch, x0, y0, res) {
  const V = cw + 1, edges = new Map(), add = (a, b) => { if (!edges.has(a)) edges.set(a, []); edges.get(a).push(b); };
  const inM = (x, y) => x >= 0 && y >= 0 && x < cw && y < ch && mask[y * cw + x];
  for (let i = 0; i < cw * ch; i++) {
    if (!mask[i]) continue;
    const x = i % cw, y = (i / cw) | 0;
    if (!inM(x, y - 1)) add(y * V + x, y * V + x + 1);
    if (!inM(x + 1, y)) add(y * V + x + 1, (y + 1) * V + x + 1);
    if (!inM(x, y + 1)) add((y + 1) * V + x + 1, (y + 1) * V + x);
    if (!inM(x - 1, y)) add((y + 1) * V + x, y * V + x);
  }
  const loops = [];
  while (edges.size) {
    const start = edges.keys().next().value, loop = [start];
    let cur = start;
    for (;;) {
      const arr = edges.get(cur); if (!arr) break;
      const nxt = arr.pop(); if (!arr.length) edges.delete(cur);
      if (nxt === start) break;
      loop.push(nxt); cur = nxt;
      if (loop.length > 400000) break;
    }
    if (loop.length > 3) loops.push(loop.map(k => ({ x: x0 + (k % V) * res, y: y0 + Math.floor(k / V) * res })));
  }
  return loops;
}
function slabPolys(f) {
  if (!f.walls.length) { const b = contentBounds(f); return b ? [rectPoly(b)] : []; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const w of f.walls) for (const q of [w.a, w.b]) {
    x0 = Math.min(x0, q.x - w.t / 2); y0 = Math.min(y0, q.y - w.t / 2);
    x1 = Math.max(x1, q.x + w.t / 2); y1 = Math.max(y1, q.y + w.t / 2);
  }
  const W = x1 - x0, H = y1 - y0;
  if (W <= 0 || H <= 0) return [];
  const M = 40, res = Math.max(2, Math.min(6, Math.max(W, H) / 300));
  const cw = Math.ceil((W + 2 * M) / res), ch = Math.ceil((H + 2 * M) / res), N = cw * ch;
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff';
  for (const w of f.walls) {
    ctx.lineWidth = Math.max(1, w.t / res);
    ctx.beginPath();
    ctx.moveTo((w.a.x - x0 + M) / res, (w.a.y - y0 + M) / res);
    ctx.lineTo((w.b.x - x0 + M) / res, (w.b.y - y0 + M) / res);
    ctx.stroke();
  }
  const id = ctx.getImageData(0, 0, cw, ch).data;
  const free = i => id[i * 4] < 128; // siyah piksel = boş alan
  // dış sınır flood-fill
  const outside = new Uint8Array(N), st = [];
  for (let x = 0; x < cw; x++) { if (free(x)) { outside[x] = 1; st.push(x); } const b = (ch - 1) * cw + x; if (free(b)) { outside[b] = 1; st.push(b); } }
  for (let y = 0; y < ch; y++) { const l = y * cw; if (free(l)) { outside[l] = 1; st.push(l); } const r = y * cw + cw - 1; if (free(r)) { outside[r] = 1; st.push(r); } }
  while (st.length) {
    const i = st.pop(), x = i % cw, y = (i / cw) | 0;
    if (x > 0 && free(i - 1) && !outside[i - 1]) { outside[i - 1] = 1; st.push(i - 1); }
    if (x < cw - 1 && free(i + 1) && !outside[i + 1]) { outside[i + 1] = 1; st.push(i + 1); }
    if (y > 0 && free(i - cw) && !outside[i - cw]) { outside[i - cw] = 1; st.push(i - cw); }
    if (y < ch - 1 && free(i + cw) && !outside[i + cw]) { outside[i + cw] = 1; st.push(i + cw); }
  }
  // plaka = duvarlar + duvarların çevrelediği boş alanlar.
  // Açık planda yalnızca duvar izi kalır; böylece dikdörtgen bbox taşması olmaz.
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) mask[i] = (!free(i) || !outside[i]) ? 1 : 0;
  const loops = traceMaskLoops(mask, cw, ch, x0 - M, y0 - M, res), out = [];
  for (const loop of loops) {
    if (Math.abs(polyArea(loop)) < 100) continue; // raster gürültüsü
    let pts = loop.filter((q, i) => {
      const pr = loop[(i - 1 + loop.length) % loop.length], nx = loop[(i + 1) % loop.length];
      return Math.abs((q.x - pr.x) * (nx.y - q.y) - (q.y - pr.y) * (nx.x - q.x)) > 1e-6;
    });
    pts = simplifyLoop(pts, res * 2.2);
    if (pts.length < 3) continue;
    out.push(pts.map(q => ({ x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 })));
  }
  return out;
}

/* ---------- Araçlar ---------- */
const TOOLS = [
  ['select', '↖', 'Seç', 'V', 'Select'], ['pan', '✋', 'Kaydır', 'H', 'Pan'], null,
  ['wall', '🧱', 'Duvar', 'W', 'Wall'], ['rect', '⬜', 'Oda duvar', 'R', 'Rect Room'], ['room', '🏠', 'Oda algıla', 'O', 'Auto Room'], ['poly', '⬠', 'Oda çiz', 'P', 'Draw Room'], ['shape', '⬡', 'Şekil', 'S', 'Shapes'], null,
  ['door', '🚪', 'Kapı', 'D', 'Door'], ['window', '🪟', 'Pencere', 'N', 'Window'], ['furn', '🛋️', 'Mobilya', 'F', 'Furniture'], null,
  ['pen', '✏️', 'Kalem', 'B', 'Pen'], ['dim', '📏', 'Ölçü', 'M', 'Dimension'], ['text', '🔤', 'Metin', 'T', 'Text'], ['eraser', '🧽', 'Sil', 'E', 'Eraser'], ['calib', '⚖️', 'Ölçek', 'C', 'Calibrate'],
];
const HINTS = {
  select: 'Seç: tıkla / kutu çiz • Shift: çoklu seçim • sürükle: taşı • Del: sil',
  pan: 'Kaydır: sürükle • Tekerlek: yakınlaştır',
  wall: 'Duvar: tıkla ile başla, devam ettikçe zincir • rakam yaz + Enter: tam uzunluk • çift tık / Esc: bitir • Shift: yakalamayı kapat',
  rect: 'Dikdörtgen oda: köşeden köşeye sürükle (4 duvar + oda oluşturur)',
  room: 'Kapalı bir alanın içine tıkla: oda otomatik algılanır (alan ve ölçüler hesaplanır)',
  poly: 'Oda çiz: köşelere tıkla • ilk noktaya tıkla / Enter: tamamla • Esc: iptal',
  shape: 'Şekil: tür ve modu üstteki çubuktan seç • Üçgen/Dörtgen/Çokgen(N)/Elips: köşeden köşeye sürükle • Serbest: bas-sürükle-bırak • Nesne modu adlandırılabilir özel nesne, Duvar modu duvar silüesi çizer',
  place: 'Yerleştir: tıkla • R: döndür • Esc / sağ tık: bitir',
  pen: 'Kalem: serbest çiz (basılı tutup sürükle) • bırak → çizim tamamlanır • Shift: yakalamayı kapat',
  dim: 'Ölçü: iki noktaya tıkla',
  text: 'Metin eklemek için tıkla',
  eraser: 'Silmek istediğin nesneye tıkla',
  calib: 'Ölçek: arka plan görselinde bilinen iki noktaya tıkla, gerçek mesafeyi gir',
};
const HINTS_EN = {
  select: 'Select: click / drag box • Shift: multi-select • drag: move • Del: delete',
  pan: 'Pan: drag • Wheel: zoom in/out',
  wall: 'Wall: click to start & chain • type number + Enter: exact length (cm) • double-click / Esc: finish • Shift: disable snap',
  rect: 'Rect Room: drag corner to corner (creates 4 walls + room)',
  room: 'Click inside an enclosed area to auto-detect room & area',
  poly: 'Draw Room: click corners • click first point / Enter: finish • Esc: cancel',
  shape: 'Shapes: pick type & mode in the top bar • Triangle/Quad/N-gon/Circle: drag corner to corner • Free: hold-drag-release • Object mode makes a nameable custom item, Walls mode draws wall outlines',
  place: 'Place: click • R: rotate / flip hinge • S: flip swing • Esc / right-click: finish',
  pen: 'Pen: freehand draw (hold & drag) • release to finish the stroke • Shift: disable snap',
  dim: 'Dimension: click two points',
  text: 'Click to place a text label',
  eraser: 'Click any object to delete it',
  calib: 'Calibrate: click two points with a known distance on the background image, then enter real distance',
};
function buildShapeBar() {
  const sh = ui.shape, b = (k, ic, lbl) => `<button class="sbtn ${sh.kind === k ? 'on' : ''}" data-sh="${k}" title="${lbl}"><span>${ic}</span><small>${lbl}</small></button>`,
    m = (k, ic, lbl) => `<button class="sbtn ${sh.mode === k ? 'on' : ''}" data-shmode="${k}" title="${lbl}"><span>${ic}</span><small>${lbl}</small></button>`;
  $('#shapeBar').innerHTML = b('tri', '△', L('Üçgen', 'Triangle')) + b('quad', '▢', L('Dörtgen', 'Quad'))
    + b('ngon', '⬠', L('Çokgen', 'N-gon')) + `<input type="number" data-shn min="3" max="24" step="1" value="${sh.n}" title="${L('Çokgen kenar sayısı', 'N-gon sides')}">`
    + b('circle', '◯', L('Elips / Daire', 'Circle')) + b('free', '✏️', L('Serbest', 'Free'))
    + `<i class="sdiv"></i>` + m('object', '🛋️', L('Nesne', 'Object')) + m('walls', '🧱', L('Duvar', 'Walls'));
}
$('#shapeBar').addEventListener('click', e => {
  const sk = e.target.closest('[data-sh]'); if (sk) { ui.shape.kind = sk.dataset.sh; buildShapeBar(); return; }
  const sm = e.target.closest('[data-shmode]'); if (sm) { ui.shape.mode = sm.dataset.shmode; buildShapeBar(); }
});
$('#shapeBar').addEventListener('change', e => { const t = e.target; if (t.dataset.shn != null) { ui.shape.n = clamp(Math.round(+t.value) || 6, 3, 24); t.value = ui.shape.n; } });
function buildTools() {
  $('#tools').innerHTML = TOOLS.map(t => {
    if (!t) return '<div class="tdiv"></div>';
    const lbl = isEN() ? t[4] : t[2];
    return `<button class="tool" data-tool="${t[0]}" title="${lbl} (${t[3]})"><span>${t[1]}</span><small>${lbl}</small></button>`;
  }).join('');
}
function updateTools() {
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === ui.btn));
  $('#hud').textContent = ui.view3d
    ? L('3B Gezinme: WASD / Oklar: Hareket • Q/E: Yükseklik • Shift: Hızlı • Fare: Döndür / Yakınlaştır • Esc: 2B', '3D View: WASD / Arrows: Move • Q/E: Up/Down • Shift: Fast • Mouse: Orbit / Zoom • Esc: 2D')
    : ((isEN() ? HINTS_EN : HINTS)[tool] || '');
  $('#hud').style.display = '';
  cv.style.cursor = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  document.querySelectorAll('#items .item').forEach(el => el.classList.toggle('on', !!placing && el.dataset.id === placing.def.id));
  const bar = $('#shapeBar'), showShape = tool === 'shape' && !ui.view3d, was = bar.dataset.on === '1';
  bar.style.display = showShape ? 'flex' : 'none';
  bar.dataset.on = showShape ? '1' : '0';
  if (showShape) buildShapeBar();
}
function setTool(t) {
  ui.draw = null; ui.typed = ''; ui.dimStart = null; ui.polyPts = null; ui.calib = null; ui.drag = null; ui.pen = null;
  ui.btn = t; placing = null;
  if (t === 'door') { placing = { type: 'op', def: OPDEF.door, rot: 0 }; tool = 'place'; }
  else if (t === 'window') { placing = { type: 'op', def: OPDEF.window, rot: 0 }; tool = 'place'; }
  else if (t === 'furn') { ui.cat = ui.cat === 0 ? 1 : ui.cat; buildLib(); $('#search').focus(); tool = 'select'; ui.btn = 'select'; toast(L('Soldaki listeden bir mobilya seç', 'Select a furniture item from the left panel')); }
  else tool = t;
  if (ui.view3d) show3D(false);
  updateTools(); render();
}
function startPlace(type, def) {
  ui.draw = null; placing = { type, def, rot: 0 }; tool = 'place'; ui.btn = type === 'op' ? (def.id.startsWith('w') ? 'window' : 'door') : null;
  if (ui.view3d) show3D(false);
  updateTools(); render();
}

/* ---------- Önizleme ---------- */
function drawPreview() {
  const C = pal(), ac = C.accent, g = $('#gPv'), z = view.z, cur = ui.cur; let s = '';
  const lbl = (x, y, t) => `<text x="${x}" y="${y}" font-size="${13 / z}" font-weight="700" fill="${C.text}" stroke="${C.halo}" stroke-width="${3.5 / z}" paint-order="stroke" text-anchor="middle" pointer-events="none">${t}</text>`;
  if (cur && cur.hit === 'end') s += `<circle cx="${cur.x}" cy="${cur.y}" r="${8 / z}" fill="none" stroke="#10b981" stroke-width="${2 / z}"/>`;
  if (tool === 'wall' && cur) {
    if (ui.draw) {
      const a = ui.draw.start;
      s += `<line x1="${a.x}" y1="${a.y}" x2="${cur.x}" y2="${cur.y}" stroke="${ac}" stroke-opacity=".65" stroke-width="${P.wallT}" stroke-linecap="square"/>`;
      const L = dist(a, cur), ang = (Math.atan2(cur.y - a.y, cur.x - a.x) * 180 / Math.PI + 360) % 360;
      s += lbl((a.x + cur.x) / 2, (a.y + cur.y) / 2 - P.wallT / 2 - 8 / z, ui.typed ? `[${ui.typed} cm]` : `${fmtLen(L)}  •  ${Math.round(ang)}°`);
      s += `<circle cx="${a.x}" cy="${a.y}" r="${4 / z}" fill="${ac}"/>`;
    } else s += `<circle cx="${cur.x}" cy="${cur.y}" r="${4 / z}" fill="${ac}"/>`;
  }
  const d = ui.drag;
  if (d && d.type === 'rect' && cur) {
    const x0 = Math.min(d.start.x, cur.x), y0 = Math.min(d.start.y, cur.y), w = Math.abs(cur.x - d.start.x), h = Math.abs(cur.y - d.start.y);
    s += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${ac}" fill-opacity=".1" stroke="${ac}" stroke-width="${P.wallT}" stroke-opacity=".55"/>`;
    s += lbl(x0 + w / 2, y0 - P.wallT / 2 - 8 / z, `${fmtLen(w)} × ${fmtLen(h)} = ${fmtArea(w * h)}`);
  }
  if (d && d.type === 'box') {
    s += `<rect x="${Math.min(d.start.x, d.cur.x)}" y="${Math.min(d.start.y, d.cur.y)}" width="${Math.abs(d.cur.x - d.start.x)}" height="${Math.abs(d.cur.y - d.start.y)}" fill="${ac}" fill-opacity=".1" stroke="${ac}" stroke-width="${1.5 / z}" stroke-dasharray="${5 / z}"/>`;
  }
  if (tool === 'poly' && ui.polyPts && cur) {
    const pts = [...ui.polyPts, cur];
    s += `<polygon points="${pts.map(p => p.x + ',' + p.y).join(' ')}" fill="${ac}" fill-opacity=".12" stroke="${ac}" stroke-width="${2 / z}"/>`;
    ui.polyPts.forEach(p => s += `<circle cx="${p.x}" cy="${p.y}" r="${4 / z}" fill="${ac}"/>`);
    if (pts.length > 2) s += lbl(cur.x, cur.y - 14 / z, fmtArea(polyArea(pts)));
  }
  if (tool === 'dim' && ui.dimStart && cur) s += `<line x1="${ui.dimStart.x}" y1="${ui.dimStart.y}" x2="${cur.x}" y2="${cur.y}" stroke="#0f766e" stroke-width="${2 / z}" stroke-dasharray="${5 / z}"/>` + lbl((ui.dimStart.x + cur.x) / 2, (ui.dimStart.y + cur.y) / 2 - 8 / z, fmtLen(dist(ui.dimStart, cur)));
  if (tool === 'calib' && ui.calib && cur) s += `<line x1="${ui.calib.x}" y1="${ui.calib.y}" x2="${cur.x}" y2="${cur.y}" stroke="#e11d48" stroke-width="${2 / z}"/>`;
  if ((tool === 'pen' || tool === 'shape') && ui.pen) {
    const pts = ui.pen.pts.concat(ui.raw ? [{ x: ui.raw.x, y: ui.raw.y }] : []);
    if (pts.length > 1) s += `<polyline points="${pts.map(p => p.x + ',' + p.y).join(' ')}" fill="none" stroke="${ac}" stroke-opacity=".7" stroke-width="${Math.max(2 / z, 4)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  if (tool === 'shape' && d && d.type === 'shape' && d.cur) {
    const pts = shapePts(ui.shape.kind, ui.shape.n, d.start, d.cur), sw = Math.abs(d.cur.x - d.start.x), sh = Math.abs(d.cur.y - d.start.y);
    s += `<polygon points="${pts.map(p => p.x + ',' + p.y).join(' ')}" fill="${ac}" fill-opacity=".12" stroke="${ac}" stroke-width="${P.wallT / 2}" stroke-opacity=".65"/>`;
    s += lbl((d.start.x + d.cur.x) / 2, Math.min(d.start.y, d.cur.y) - P.wallT / 2 - 8 / z, `${fmtLen(sw)} × ${fmtLen(sh)}`);
  }
  if (tool === 'place' && placing && ui.raw) {
    if (placing.type === 'furn') {
      const f = ui.ghost; if (f) s += `<g opacity=".65" pointer-events="none">${furnSvg(f, false)}</g>`;
    } else if (ui.ghost) {
      s += `<g opacity=".7" pointer-events="none">${opSvg(ui.ghost, false)}</g>`;
    }
  }
  g.innerHTML = s;
}
function updateGhost() {
  ui.ghost = null; if (tool !== 'place' || !placing || !ui.raw) return;
  const p = ui.raw;
  if (placing.type === 'furn') {
    const f = mkFurn(placing.def, 0, 0, placing.rot);
    const g = ui.snap && !ui.shift, sp = g ? snapToGrid(p) : p;
    f.x = sp.x; f.y = sp.y;
    if (!ui.shift) magnet(f);
    ui.ghost = f;
  } else {
    const n = wallNear(p, 45); if (!n) return;
    const { w, pr } = n, L = wLen(w), u = { x: (w.b.x - w.a.x) / L, y: (w.b.y - w.a.y) / L };
    const op = mkOp(placing.def, w, pr.t * L); op.id = 'ghost';
    const side = ((p.x - pr.q.x) * -u.y + (p.y - pr.q.y) * u.x) >= 0 ? 1 : -1; op.side = placing.side || side;
    op.flip = placing.flip || 0;
    ui.ghost = op;
    if (ui.snap && !ui.shift) op.d = clamp(rnd(op.d, 5), Math.min(op.w / 2, L / 2), Math.max(L - op.w / 2, L / 2));
    // diğer açıklıklarla çakışma kontrolü sadece görsel olarak yapılmaz
  }
}

/* ---------- İşaretçi etkileşimi ---------- */
function setCursor(e) {
  const raw = wpos(e); ui.raw = raw; ui.shift = e.shiftKey; ui.lastE = { clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey };
  let from = null;
  if (tool === 'wall' && ui.draw) from = ui.draw.start;
  else if (tool === 'dim' && ui.dimStart) from = ui.dimStart;
  else if (tool === 'poly' && ui.polyPts && ui.polyPts.length) from = ui.polyPts[ui.polyPts.length - 1];
  else if (tool === 'calib' && ui.calib) from = null;
  ui.cur = ['wall', 'rect', 'poly', 'dim', 'calib', 'shape'].includes(tool) ? snapPt(raw, from, e) : null;
  if (tool === 'wall' && ui.draw && ui.typed) {
    const a = ui.draw.start, l = parseFloat(ui.typed) || 0, dx = ui.cur.x - a.x, dy = ui.cur.y - a.y, m = Math.hypot(dx, dy) || 1;
    ui.cur = { x: a.x + dx / m * l, y: a.y + dy / m * l, hit: null };
  }
  $('#coords').textContent = `x: ${(raw.x / 100).toFixed(2)} m   y: ${(raw.y / 100).toFixed(2)} m`;
}
cv.addEventListener('contextmenu', e => { e.preventDefault(); if (tool === 'place' || tool === 'wall' || tool === 'poly' || tool === 'pen') { setTool('select'); } });
cv.addEventListener('wheel', e => {
  e.preventDefault(); const r = cv.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });
cv.addEventListener('dblclick', e => {
  if (tool === 'wall') { ui.draw = null; ui.typed = ''; render(); }
  else if (tool === 'poly') finishPoly();
  else if (tool === 'select') {
    const t = e.target.closest('[data-id]'); const o = t && find(t.dataset.id);
    if (o && o.kind === 'room') { const n = prompt(L('Oda adı:', 'Room name:'), o.o.name); if (n) { o.o.name = n; commit(); refresh(); } }
    else if (o && o.kind === 'text') { const n = prompt(L('Metin:', 'Text:'), o.o.text); if (n) { o.o.text = n; commit(); refresh(); } }
  }
});
function pickDataId(e) {
  // 1) "👆 Tıkla / Click me" rozeti her zaman en üst önceliklidir
  // 2) Mobilya/duvar/kapı gibi nesneler oda etiketinin altında kalmasın
  // 3) Altında nesne yoksa oda etiketi / oda çokgeni seçilir
  let first = null, roomHit = null;
  for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
    const b = el.closest ? el.closest('[data-var-badge]') : null;
    if (b) return b;
    const t = el.closest ? el.closest('[data-id]') : null;
    if (!t) continue;
    if (!first) first = t;
    if (t.hasAttribute('data-rlabel') || t.hasAttribute('data-rpoly')) {
      if (!roomHit) roomHit = t;
      continue;
    }
    return t;
  }
  return roomHit || first;
}
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); setCursor(e);
  const raw = ui.raw, cur = ui.cur;
  if (e.button === 1 || tool === 'pan' || ui.space) { ui.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; cv.style.cursor = 'grabbing'; return; }
  if (e.button !== 0) return;
  const f = F();
  switch (tool) {
    case 'select': {
      const h = e.target.closest('[data-h]');
      if (h) { startHandle(h.dataset.h, raw, e); return; }
      const t = pickDataId(e);
      if (t) {
        const id = t.dataset.id;
        const badgeType = t.dataset.varBadge || null, badgeGrp = t.dataset.grp || null;
        if (e.shiftKey) { sel = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]; }
        else if (e.altKey) { sel = [id]; }
        else if (!sel.includes(id) || badgeType) {
          const fd = find(id);
          // gruplu nesneye tıklayınca tüm grup seçilir (duvar + mobilya karışık dahil)
          if (fd && fd.o.grp) {
            const f = F(); sel = [];
            for (const arr in KINDS) for (const o of f[arr]) if (o.grp === fd.o.grp) sel.push(o.id);
          } else sel = [id];
        }
        renderProps(); startMove(raw, e);
        if (ui.drag) {
          ui.drag.clickedId = id;
          if (badgeType) ui.drag.badgeClick = { type: badgeType, id, grp: badgeGrp };
        }
      } else { if (!e.shiftKey) sel = []; ui.drag = { type: 'box', start: raw, cur: raw, moved: false }; renderProps(); }
      render(); return;
    }
    case 'wall': {
      if (!ui.draw) { ui.draw = { start: { x: cur.x, y: cur.y } }; }
      else {
        const a = ui.draw.start;
        if (dist(a, cur) < 5) { ui.draw = null; ui.typed = ''; }
        else { f.walls.push(mkWall(a, cur)); commit(); ui.draw = { start: { x: cur.x, y: cur.y } }; ui.typed = ''; if (cur.hit === 'end' && closesLoop(cur)) { ui.draw = null; toast(L('Döngü kapandı – “Oda algıla” aracı ile oda ekleyebilirsin', 'Loop closed – use “Auto Room” tool to detect the room')); } }
      }
      render(); renderProps(); return;
    }
    case 'rect': ui.drag = { type: 'rect', start: { x: cur.x, y: cur.y } }; return;
    case 'room': {
      const rm = autoRoomAt(raw); if (rm) { sel = [rm.id]; commit(); toast(`${rm.name}: ${fmtArea(polyArea(rm.pts))}`); } refresh(); return;
    }
    case 'poly': {
      if (!ui.polyPts) ui.polyPts = [];
      if (ui.polyPts.length > 2 && dist(cur, ui.polyPts[0]) < 12 / view.z) { finishPoly(); return; }
      ui.polyPts.push({ x: cur.x, y: cur.y }); render(); return;
    }
    case 'place': placeAt(raw); return;
    case 'shape': {
      if (ui.shape.kind === 'free') { ui.pen = { pts: [ui.snap && !e.shiftKey ? snapPt(raw, null, e) : { x: raw.x, y: raw.y }] }; render(); }
      else ui.drag = { type: 'shape', start: { x: cur.x, y: cur.y }, cur: null };
      return;
    }
    case 'pen': ui.pen = { pts: [ui.snap && !e.shiftKey ? snapPt(raw, null, e) : { x: raw.x, y: raw.y }] }; render(); return;
    case 'dim': {
      if (!ui.dimStart) ui.dimStart = { x: cur.x, y: cur.y };
      else if (dist(ui.dimStart, cur) > 5) { const d = { id: uid(), a: ui.dimStart, b: { x: cur.x, y: cur.y }, off: 40 }; f.dims.push(d); sel = [d.id]; ui.dimStart = null; commit(); refresh(); }
      render(); return;
    }
    case 'text': { const sp = ui.snap ? snapToGrid(raw) : raw; const t = { id: uid(), x: sp.x, y: sp.y, text: L('Metin', 'Text'), size: 24, color: '#1e293b', rot: 0 }; f.texts.push(t); sel = [t.id]; commit(); setTool('select'); refresh(); return; }
    case 'eraser': {
      const t = pickDataId(e);
      if (t) {
        if (t.dataset.varBadge === 'group' && t.dataset.grp) deleteIds(groupMemberIds(t.dataset.grp)); // rozet = grubun tamamı
        else deleteIds([t.dataset.id]);
        commit(); refresh(); if (ui.view3d && T3) schedBuild3D();
      }
      return;
    }
    case 'calib': {
      if (!P.bg) { toast(L('Önce bir arka plan görseli ekle (sağ panel)', 'Add a background image first (right panel)')); return; }
      if (!ui.calib) ui.calib = { x: cur.x, y: cur.y };
      else {
        const px = dist(ui.calib, cur); if (px < 2) return;
        const real = parseFloat(String(prompt(L('Bu iki nokta arasındaki gerçek mesafe (metre):', 'Real distance between these two points (meters):'), '3') || '').replace(',', '.'));
        if (real > 0) {
          const k = real * 100 / px, a = ui.calib, b = P.bg;
          b.x = a.x + (b.x - a.x) * k; b.y = a.y + (b.y - a.y) * k; b.w *= k; b.h *= k;
          commit(); toast(L('Ölçek ayarlandı', 'Scale calibrated')); fit();
        }
        ui.calib = null;
      }
      render(); return;
    }
  }
});
function closesLoop(p) {
  // başlangıç noktasına dönüldü mü: zincirdeki ilk noktadan başka duvar ucu varsa
  const f = F(); let n = 0; for (const w of f.walls) { if (dist(w.a, p) < 1) n++; if (dist(w.b, p) < 1) n++; } return n >= 3;
}
function finishPoly() {
  if (ui.polyPts && ui.polyPts.length >= 3) { const rm = mkRoom(ui.polyPts); F().rooms.push(rm); sel = [rm.id]; commit(); }
  ui.polyPts = null; refresh();
}
function finishPen() {
  if (ui.pen && ui.pen.pts.length >= 2) {
    const pts = simplifyStroke(ui.pen.pts, Math.max(1.2, 2 / view.z)).map(q => ({ x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }));
    let len = 0; for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]);
    if (pts.length >= 2 && len * view.z > 8) {
      const sk = { id: uid(), pts, w: 4, color: '#1e293b' };
      const f = F(); f.sketches = f.sketches || []; f.sketches.push(sk); sel = [sk.id]; commit(); renderProps();
    }
  }
  ui.pen = null; render();
}

/* ---------- Şekiller (S) ---------- */
function shapePts(kind, n, a, b) {
  const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y), cx = x0 + w / 2, cy = y0 + h / 2;
  if (kind === 'circle') {
    const out = [], N = 24;
    for (let i = 0; i < N; i++) { const t = i / N * 2 * Math.PI; out.push({ x: Math.round((cx + Math.cos(t) * w / 2) * 100) / 100, y: Math.round((cy + Math.sin(t) * h / 2) * 100) / 100 }); }
    return out;
  }
  if (kind === 'tri') return [{ x: x0, y: y0 + h }, { x: x0 + w, y: y0 + h }, { x: cx, y: y0 }];
  if (kind === 'quad') return [{ x: x0, y: y0 }, { x: x0 + w, y: y0 }, { x: x0 + w, y: y0 + h }, { x: x0, y: y0 + h }];
  const N = clamp(Math.round(n) || 6, 3, 24), out = [];
  for (let i = 0; i < N; i++) { const t = -Math.PI / 2 + i / N * 2 * Math.PI; out.push({ x: Math.round((cx + Math.cos(t) * w / 2) * 100) / 100, y: Math.round((cy + Math.sin(t) * h / 2) * 100) / 100 }); }
  return out;
}
function mkShapeFurn(pts, round = false) {
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y), x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const o = { id: uid(), type: 'shape', name: L('Şekil', 'Shape'), icon: round ? '⬤' : '⬡', k: round ? 'round' : 'poly', w: Math.max(10, Math.round(x1 - x0)), d: Math.max(10, Math.round(y1 - y0)), h: 80, color: '#bcaaa4', x: Math.round(cx), y: Math.round(cy), rot: 0, label: '' };
  if (!round) o.pts = pts.map(p => ({ x: Math.round((p.x - cx) * 10) / 10, y: Math.round((p.y - cy) * 10) / 10 }));
  return o;
}
function wallsFromPts(pts, closed, e) {
  const g = e && ui.snap && !e.shiftKey, qs = pts.map(p => g ? snapToGrid(p) : { x: p.x, y: p.y });
  if (closed && qs.length > 2 && dist(qs[0], qs[qs.length - 1]) < 30) qs[qs.length - 1] = { ...qs[0] };
  const last = closed ? qs.length : qs.length - 1;
  for (let i = 0; i < last; i++) F().walls.push(mkWall(qs[i], qs[(i + 1) % qs.length]));
}
function finishShapeFree() {
  if (ui.pen && ui.pen.pts.length >= 2 && (ui.shape.mode === 'walls' || ui.pen.pts.length >= 3)) {
    const pts = simplifyStroke(ui.pen.pts, Math.max(1.2, 2 / view.z)).map(q => ({ x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 }));
    if (ui.shape.mode === 'walls') { wallsFromPts(pts, false); commit(); toast(L('Duvar zinciri eklendi – “Oda algıla” ile oda oluşturabilirsin', 'Wall chain added – use “Auto Room” to create a room')); }
    else { let len = 0; for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1], pts[i]); if (len * view.z > 8) { const o = mkShapeFurn(pts); F().furn.push(o); sel = [o.id]; commit(); toast(L('Şekil eklendi – sağ panelden etiket verin, 💾 ile kütüphaneye kaydedin', 'Shape added – set a label in the side panel, 💾 saves it to the library')); } else { toast(L('Çizim çok kısa', 'Drawing too short')); } }
  } else toast(L('Serbest şekil en az 3 nokta ister (Duvar modu çizgi için yeterli)', 'Free shape needs at least 3 points (Walls mode accepts a line)'));
  ui.pen = null; refresh();
}
function finishShapeDrag(d, e) {
  const end = ui.cur || d.cur || ui.raw, kk = ui.shape.kind;
  if (!end || dist(d.start, end) < 20 / view.z) return;
  const pts = shapePts(kk, ui.shape.n, d.start, end);
  if (ui.shape.mode === 'walls') { wallsFromPts(pts, true, e); commit(); toast(L('Duvarlar eklendi – “Oda algıla” ile oda oluşturabilirsin', 'Walls added – use “Auto Room” to create a room')); }
  else { const o = mkShapeFurn(pts, kk === 'circle'); F().furn.push(o); sel = [o.id]; commit(); toast(L('Şekil eklendi – sağ panelden etiket verin, 💾 ile kütüphaneye kaydedin', 'Shape added – set a label in the side panel, 💾 saves it to the library')); }
}
function placeAt(raw) {
  const f = F();
  if (!ui.ghost) { if (placing.type === 'op') toast(L('Kapı/pencere için bir duvarın yakınına tıkla', 'Click near a wall to place a door/window')); return; }
  if (placing.type === 'furn') { const o = { ...ui.ghost, id: uid() }; f.furn.push(o); sel = [o.id]; }
  else {
    const g = ui.ghost, o = { ...g, id: uid() }; f.ops.push(o); sel = [o.id];
  }
  commit(); refresh();
}
cv.addEventListener('pointermove', e => {
  setCursor(e); const d = ui.drag;
  if ((tool === 'pen' || tool === 'shape') && ui.pen) {
    const p = ui.raw, last = ui.pen.pts[ui.pen.pts.length - 1];
    if (p && dist(p, last) > 2.5 / view.z) { ui.pen.pts.push({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }); drawPreview(); }
    return;
  }
  if (d) {
    if (d.type === 'pan') { view.x = d.vx + e.clientX - d.sx; view.y = d.vy + e.clientY - d.sy; render(); return; }
    if (d.type === 'box') { d.cur = ui.raw; d.moved = true; drawPreview(); return; }
    if (d.type === 'shape') { d.cur = ui.cur || ui.raw; drawPreview(); return; }
    if (d.type === 'move') { doMove(ui.raw, e); return; }
    if (d.type === 'handle') { doHandle(ui.raw, e); return; }
  }
  updateGhost(); drawPreview();
});
cv.addEventListener('pointerup', e => {
  if ((tool === 'pen' || tool === 'shape') && ui.pen) { tool === 'shape' ? finishShapeFree() : finishPen(); return; }
  const d = ui.drag; if (!d) return; ui.drag = null; setCursor(e);
  if (d.type === 'pan') { updateTools(); return; }
  if (d.type === 'box') {
    if (d.moved && dist(d.start, d.cur) > 4 / view.z) {
      const x0 = Math.min(d.start.x, d.cur.x), x1 = Math.max(d.start.x, d.cur.x), y0 = Math.min(d.start.y, d.cur.y), y1 = Math.max(d.start.y, d.cur.y);
      const f = F(), ids = new Set(sel), scope = ui.boxSel || 'all';
      for (const arr in KINDS) for (const o of f[arr]) {
        const kd = KINDS[arr];
        if (scope === 'wall' && kd !== 'wall') continue;
        if (scope === 'furn' && kd !== 'furn') continue;
        const bb = bboxOf(kd, o); if (!bb) continue;
        const inside = bb.x0 >= x0 && bb.x1 <= x1 && bb.y0 >= y0 && bb.y1 <= y1;
        const inter = bb.x1 >= x0 && bb.x0 <= x1 && bb.y1 >= y0 && bb.y0 <= y1;
        const rm = kd === 'room' || kd === 'dim';
        if (rm ? inside : (kd === 'wall' ? inside : inter)) ids.add(o.id);
      }
      sel = [...ids];
    }
    refresh(); return;
  }
  if (d.type === 'shape') { if ((d.cur || ui.cur) && dist(d.start, d.cur || ui.cur) > 20 / view.z) finishShapeDrag(d, e); refresh(); return; }
  if (d.type === 'rect') {
    const c = ui.cur;
    if (Math.abs(c.x - d.start.x) > 30 && Math.abs(c.y - d.start.y) > 30) {
      const ws = addRectWalls(d.start.x, d.start.y, c.x, c.y);
      const rm = mkRoom([{ x: Math.min(d.start.x, c.x) + P.wallT / 2, y: Math.min(d.start.y, c.y) + P.wallT / 2 }, { x: Math.max(d.start.x, c.x) - P.wallT / 2, y: Math.min(d.start.y, c.y) + P.wallT / 2 }, { x: Math.max(d.start.x, c.x) - P.wallT / 2, y: Math.max(d.start.y, c.y) - P.wallT / 2 }, { x: Math.min(d.start.x, c.x) + P.wallT / 2, y: Math.max(d.start.y, c.y) - P.wallT / 2 }]);
      F().rooms.push(rm); sel = [rm.id]; commit();
    }
    refresh(); return;
  }
  if (d.type === 'move' || d.type === 'handle') {
    if (!d.moved && d.type === 'move' && d.clickedId && !e.shiftKey && !e.altKey) { // Alt: tek üye seçimi, düzen geçişi yapma
      const fd = find(d.clickedId);
      if (fd && fd.kind === 'wall' && !fd.o.grp && Array.isArray(fd.o.angles) && fd.o.angles.length >= 2) {
        cycleWallPos(fd.o);
        commit(); refresh();
        toast(L(`Duvar: Konum ${fd.o.posIdx + 1}/${fd.o.angles.length} (${fd.o.angles[fd.o.posIdx]}°)`, `Wall: Position ${fd.o.posIdx + 1}/${fd.o.angles.length} (${fd.o.angles[fd.o.posIdx]}°)`));
        return;
      }
      if (fd && fd.kind === 'op' && (fd.o.type === 'door' || fd.o.type === 'double' || fd.o.type === 'slide')) {
        fd.o.open = fd.o.open ? 0 : 90;
        commit(); refresh();
        toast(fd.o.open ? (fd.o.type === 'slide' ? L('Sürgülü kapı açıldı', 'Sliding door opened') : L('Kapı açıldı (90°)', 'Door opened (90°)')) : (fd.o.type === 'slide' ? L('Sürgülü kapı kapandı', 'Sliding door closed') : L('Kapı kapandı', 'Door closed')));
        return;
      }
      if (d.badgeClick) {
        if (d.badgeClick.type === 'group' && cycleGroupVars(d.badgeClick.grp)) return;
        if (d.badgeClick.type === 'room' && fd && fd.kind === 'room' && cycleRoomVars(fd.o)) return;
        toast(L('2. düzeni eklemek için sağ panelden ➕ Yeni düğmesine basın', 'Press ➕ New in the right panel to add a 2nd layout'));
        return;
      }
      if (fd && fd.o.grp && cycleGroupVars(fd.o.grp)) return;
      if (fd && fd.kind === 'room' && cycleRoomVars(fd.o)) return;
    }
    if (d.moved) commit();
    refresh();
  }
});

/* ---------- Taşıma ---------- */
function startMove(raw, e) {
  const join = e && e.altKey ? !ui.connWalls : ui.connWalls;
  const objs = selObjs(), orig = new Map(), conn = [];
  for (const { o } of objs) orig.set(o.id, JSON.parse(JSON.stringify(o)));
  const selWalls = objs.filter(x => x.kind === 'wall').map(x => x.o), sset = new Set(selWalls.map(w => w.id));
  if (selWalls.length && join) for (const w of F().walls) {
    if (sset.has(w.id)) continue;
    for (const e of ['a', 'b']) for (const sw of selWalls) {
      const ends = Array.isArray(sw.angles) && sw.angles.length ? [wallPivot(sw)] : ['a', 'b'];
      for (const se of ends) if (dist(w[e], sw[se]) < 1) { conn.push({ w, e, o: { x: w[e].x, y: w[e].y } }); }
    }
  }
  const roomInner = [];
  if (objs.length === 1 && objs[0].kind === 'room' && !(e && e.altKey)) {
    const r = objs[0].o;
    for (const fn of furnInRoom(r)) roomInner.push({ kind: 'furn', o: fn, g: JSON.parse(JSON.stringify(fn)) });
    for (const tx of F().texts.filter(t => pointInPoly(t, r.pts))) roomInner.push({ kind: 'text', o: tx, g: JSON.parse(JSON.stringify(tx)) });
  }
  const first = objs[0]; let anchor = { x: raw.x, y: raw.y };
  if (first) { const o = orig.get(first.o.id); anchor = first.kind === 'wall' || first.kind === 'dim' ? o.a : first.kind === 'room' ? o.pts[0] : first.kind === 'sketch' ? o.pts[0] : first.kind === 'op' ? anchor : { x: o.x, y: o.y }; }
  ui.drag = { type: 'move', start: raw, orig, conn, roomInner, anchor, moved: false };
}
function doMove(raw, e) {
  const d = ui.drag; let dx = raw.x - d.start.x, dy = raw.y - d.start.y;
  if (!d.moved && Math.hypot(dx, dy) * view.z < 3) return; d.moved = true;
  if (ui.snap && !e.shiftKey) {
    const sp = snapToGrid({ x: d.anchor.x + dx, y: d.anchor.y + dy });
    dx = sp.x - d.anchor.x; dy = sp.y - d.anchor.y;
  }
  for (const { kind, o } of selObjs()) {
    const g = d.orig.get(o.id);
    if (kind === 'wall' || kind === 'dim') { o.a = { x: g.a.x + dx, y: g.a.y + dy }; o.b = { x: g.b.x + dx, y: g.b.y + dy }; }
    else if (kind === 'room' || kind === 'sketch') o.pts = g.pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
    else if (kind === 'furn') {
      o.x = g.x + dx; o.y = g.y + dy;
      if (sel.length === 1) { o.rot = g.rot; const r0 = o.rot; magnet(o); if (e.shiftKey) { o.x = g.x + dx; o.y = g.y + dy; o.rot = g.rot; } }
    }
    else if (kind === 'text' || kind === 'bg') { o.x = g.x + dx; o.y = g.y + dy; }
    else if (kind === 'op') {
      const n = wallNear(raw, 60);
      if (n) { const L = wLen(n.w); o.wall = n.w.id; o.d = clamp(ui.snap && !e.shiftKey ? rnd(n.pr.t * L, 5) : n.pr.t * L, Math.min(o.w / 2, L / 2), Math.max(L - o.w / 2, L / 2)); }
    }
  }
  for (const c of d.conn) { c.w[c.e] = { x: c.o.x + dx, y: c.o.y + dy }; }
  if (d.roomInner) for (const it of d.roomInner) { it.o.x = it.g.x + dx; it.o.y = it.g.y + dy; }
  render();
}
function startHandle(h, raw, e) {
  const os = selObjs(); if (!os.length) return;
  const o = os[0].o, orig = JSON.parse(JSON.stringify(o)), conn = [];
  const join = e && e.altKey ? !ui.connWalls : ui.connWalls;
  if ((h === 'wa' || h === 'wb') && join) {
    const ek = h === 'wa' ? 'a' : 'b';
    const isHingedFree = Array.isArray(o.angles) && o.angles.length && ek === wallFree(o);
    if (!isHingedFree) for (const w of F().walls) if (w.id !== o.id) for (const k of ['a', 'b']) if (dist(w[k], orig[ek]) < 1) conn.push({ w, k });
  }
  let origAll = null, origBb = null;
  if (h[0] === 'g') {
    origAll = new Map();
    for (const { kind, o: mo } of os) {
      origAll.set(mo.id, JSON.parse(JSON.stringify(mo)));
    }
    origBb = selectionBounds(os);
  }
  const origCenter = origBb && { x: (origBb.x0 + origBb.x1) / 2, y: (origBb.y0 + origBb.y1) / 2 };
  const origAngle = h === 'grot' && origCenter ? Math.atan2(raw.y - origCenter.y, raw.x - origCenter.x) * 180 / Math.PI : 0;
  ui.drag = { type: 'handle', h, orig, conn, origAll, origBb, origCenter, origAngle, moved: false };
}
function doHandle(raw, e) {
  const d = ui.drag, h = d.h, o = selObjs()[0]?.o; if (!o) return; d.moved = true;
  const sh = e.shiftKey;
  if (h === 'wa' || h === 'wb') {
    const ek = h === 'wa' ? 'a' : 'b', other = h === 'wa' ? o.b : o.a;
    const ign = new Set([o.id, ...d.conn.map(c => c.w.id)]);
    const p = snapPt(raw, other, e, ign);
    o[ek] = { x: p.x, y: p.y }; for (const c of d.conn) c.w[c.k] = { x: p.x, y: p.y };
    if (Array.isArray(o.angles) && o.angles.length) { const idx = clamp(o.posIdx ?? 0, 0, o.angles.length - 1); o.posIdx = idx; o.angles[idx] = wallDeg(o); }
  } else if (h === 'wrot') {
    const pv = o[wallPivot(o)];
    let a = Math.atan2(raw.y - pv.y, raw.x - pv.x) * 180 / Math.PI;
    const step = (P.gridType === 'triangle') ? 30 : 15;
    if (ui.snap && !sh) a = rnd(a, step);
    setWallDeg(o, a, true);
  } else if (h[0] === 'v') {
    const i = +h.slice(1), p = snapPt(raw, null, e); o.pts[i] = { x: p.x, y: p.y };
  } else if (h.startsWith('re')) {
    const i = +h.slice(2), n = d.orig.pts.length, j = (i + 1) % n;
    const p1 = d.orig.pts[i], p2 = d.orig.pts[j], L = dist(p1, p2) || 1;
    const nx = -(p2.y - p1.y) / L, ny = (p2.x - p1.x) / L;
    const p = ui.snap && !sh ? snapToGrid(raw) : raw;
    const delta = (p.x - (p1.x + p2.x) / 2) * nx + (p.y - (p1.y + p2.y) / 2) * ny;
    o.pts[i] = { x: Math.round(p1.x + nx * delta), y: Math.round(p1.y + ny * delta) };
    o.pts[j] = { x: Math.round(p2.x + nx * delta), y: Math.round(p2.y + ny * delta) };
  } else if (h === 'grot' && d.origBb && d.origAll && d.origCenter) {
    let deg = Math.atan2(raw.y - d.origCenter.y, raw.x - d.origCenter.x) * 180 / Math.PI - d.origAngle;
    deg = ((deg + 540) % 360) - 180;
    if (ui.snap && !sh) deg = rnd(deg, P.gridType === 'triangle' ? 30 : 15);
    rotateSelection(deg, selObjs(), d.origBb, d.origAll);
  } else if (h[0] === 'g' && d.origBb && d.origAll) {
    const bb = d.origBb, p = ui.snap && !sh ? snapToGrid(raw) : raw;
    const w0 = Math.max(10, bb.x1 - bb.x0), h0 = Math.max(10, bb.y1 - bb.y0);
    const ax = (h === 'g1' || h === 'g2') ? bb.x0 : bb.x1;
    const ay = (h === 'g2' || h === 'g3') ? bb.y0 : bb.y1;
    const sx = Math.max(20, Math.abs(p.x - ax)) / w0, sy = Math.max(20, Math.abs(p.y - ay)) / h0;
    const tx = x => Math.round((ax + (x - ax) * sx) * 10) / 10;
    const ty = y => Math.round((ay + (y - ay) * sy) * 10) / 10;
    for (const { kind, o: mo } of selObjs()) {
      const g = d.origAll.get(mo.id); if (!g) continue;
      if (kind === 'wall' || kind === 'dim') {
        mo.a = { x: tx(g.a.x), y: ty(g.a.y) }; mo.b = { x: tx(g.b.x), y: ty(g.b.y) };
        if (kind === 'wall') {
          // menteşeli duvar: açı ön ayarlarını yeni yönelime göre kaydır (eski preset'e sıçramasın)
          if (Array.isArray(g.angles) && g.angles.length) {
            const od = Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x) * 180 / Math.PI, nd = Math.atan2(mo.b.y - mo.a.y, mo.b.x - mo.a.x) * 180 / Math.PI;
            const diff = Math.round((nd - od) * 10) / 10;
            if (Math.abs(diff) > 0.05) mo.angles = g.angles.map(a => Math.round((((a + diff) % 360) + 360) % 360 * 10) / 10);
          }
          // duvara bağlı kapı/pencereler de ölçeklensin: merkez noktayı ölçekle, yeni duvara projekte et
          const L0 = dist(g.a, g.b) || 1, L1 = wLen(mo) || 1, ux = (mo.b.x - mo.a.x) / L1, uy = (mo.b.y - mo.a.y) / L1;
          for (const o2 of F().ops.filter(op => op.wall === mo.id)) {
            const t0 = clamp(o2.d / L0, 0, 1), px = tx(g.a.x + (g.b.x - g.a.x) * t0), py = ty(g.a.y + (g.b.y - g.a.y) * t0);
            const pr = clamp(((px - mo.a.x) * ux + (py - mo.a.y) * uy) / L1, 0, 1);
            o2.d = clamp(pr * L1, Math.min(o2.w / 2, L1 / 2), Math.max(L1 - o2.w / 2, L1 / 2));
          }
        }
      }
      else if (kind === 'room') mo.pts = g.pts.map(q => ({ x: tx(q.x), y: ty(q.y) }));
      else if (kind === 'sketch') mo.pts = g.pts.map(q => ({ x: tx(q.x), y: ty(q.y) }));
      else if (kind === 'furn') {
        mo.x = tx(g.x); mo.y = ty(g.y);
        const rot = ((g.rot || 0) % 180 + 180) % 180, swap = rot >= 45 && rot < 135;
        mo.w = Math.max(10, Math.round(g.w * (swap ? sy : sx)));
        mo.d = Math.max(10, Math.round(g.d * (swap ? sx : sy)));
        if (g.k === 'poly' && g.pts) mo.pts = g.pts.map(p => ({ x: Math.round(p.x * (mo.w / g.w) * 10) / 10, y: Math.round(p.y * (mo.d / g.d) * 10) / 10 }));
      } else if (kind === 'text') { mo.x = tx(g.x); mo.y = ty(g.y); }
      else if (kind === 'bg') { mo.x = tx(g.x); mo.y = ty(g.y); mo.w = Math.max(20, Math.round(g.w * sx)); mo.h = Math.max(20, Math.round(g.h * sy)); }
    }
  } else if (h === 'da' || h === 'db') { const p = snapPt(raw, null, e); o[h === 'da' ? 'a' : 'b'] = { x: p.x, y: p.y }; }
  else if (h === 'doff') {
    const L = dist(o.a, o.b) || 1, nx = -(o.b.y - o.a.y) / L, ny = (o.b.x - o.a.x) / L, mx = (o.a.x + o.b.x) / 2, my = (o.a.y + o.b.y) / 2;
    o.off = rnd((raw.x - mx) * nx + (raw.y - my) * ny, ui.snap && !sh ? 5 : 1);
  } else if (h === 'rot') {
    let a = Math.atan2(raw.y - o.y, raw.x - o.x) * 180 / Math.PI + 90;
    if (ui.snap && !sh) a = rnd(a, 15); o.rot = (Math.round(a) + 360) % 360;
  } else if (h[0] === 'c') {
    const r = -o.rot * Math.PI / 180, dx = raw.x - o.x, dy = raw.y - o.y;
    const lx = dx * Math.cos(r) - dy * Math.sin(r), ly = dx * Math.sin(r) + dy * Math.cos(r), st = ui.snap && !sh ? 5 : 1;
    o.w = Math.max(10, rnd(Math.abs(lx) * 2, st)); o.d = Math.max(10, rnd(Math.abs(ly) * 2, st));
    if (o.k === 'poly' && d.orig && d.orig.pts && d.orig.w && d.orig.d) o.pts = d.orig.pts.map(p => ({ x: Math.round(p.x * (o.w / d.orig.w) * 10) / 10, y: Math.round(p.y * (o.d / d.orig.d) * 10) / 10 }));
  } else if (h.startsWith('bg')) {
    const g = d.orig, p = ui.snap && !sh ? snapToGrid(raw) : raw, asp = (g.h || 1) / (g.w || 1);
    const x0 = g.x, y0 = g.y, x1 = g.x + g.w, y1 = g.y + g.h;
    if (h === 'bg2') { o.w = Math.max(20, Math.round(p.x - x0)); o.h = sh ? Math.max(20, Math.round(p.y - y0)) : Math.round(o.w * asp); }
    else if (h === 'bg1') { o.w = Math.max(20, Math.round(p.x - x0)); o.h = sh ? Math.max(20, Math.round(y1 - p.y)) : Math.round(o.w * asp); o.y = y1 - o.h; }
    else if (h === 'bg3') { o.w = Math.max(20, Math.round(x1 - p.x)); o.h = sh ? Math.max(20, Math.round(p.y - y0)) : Math.round(o.w * asp); o.x = x1 - o.w; }
    else if (h === 'bg0') { o.w = Math.max(20, Math.round(x1 - p.x)); o.h = sh ? Math.max(20, Math.round(y1 - p.y)) : Math.round(o.w * asp); o.x = x1 - o.w; o.y = y1 - o.h; }
    else if (h === 'bgE') { o.w = Math.max(20, Math.round(p.x - x0)); }
    else if (h === 'bgW') { o.w = Math.max(20, Math.round(x1 - p.x)); o.x = x1 - o.w; }
    else if (h === 'bgS') { o.h = Math.max(20, Math.round(p.y - y0)); }
    else if (h === 'bgN') { o.h = Math.max(20, Math.round(y1 - p.y)); o.y = y1 - o.h; }
  }
  render();
}

/* ---------- Özellikler paneli ---------- */
const fld = (lbl, k, p, v, o = {}) => {
  if (o.sel) return `<label class="f"><span>${lbl}</span><select data-k="${k}" data-p="${p}">${Object.entries(o.sel).map(([a, b]) => `<option value="${a}" ${String(a) === String(v) ? 'selected' : ''}>${b}</option>`).join('')}</select></label>`;
  const type = o.type || 'number';
  const val = type === 'number' ? Math.round(v * 100) / 100 : v;
  return `<label class="f"><span>${lbl}</span><input type="${type}" data-k="${k}" data-p="${p}" value="${esc(val)}" ${o.step ? `step="${o.step}"` : ''} ${o.min != null ? `min="${o.min}"` : ''} ${o.max != null ? `max="${o.max}"` : ''}></label>`;
};
const KIND_TR = { wall: '🧱 Duvar', op: '🚪 Kapı / Pencere', furn: '🛋️ Mobilya', room: '🏠 Oda', dim: '📏 Ölçü', text: '🔤 Metin', sketch: '✏️ Serbest Çizim', bg: '🖼 Arka Plan Görseli' };
const KIND_EN = { wall: '🧱 Wall', op: '🚪 Door / Window', furn: '🛋️ Furniture', room: '🏠 Room', dim: '📏 Dimension', text: '🔤 Text', sketch: '✏️ Freehand Sketch', bg: '🖼 Background Image' };
function bgFields(inProps = false) {
  if (!P.bg) return '';
  return fld(L('Konum X (cm)', 'Position X (cm)'), 'bg', 'x', P.bg.x, { step: 10 })
    + fld(L('Konum Y (cm)', 'Position Y (cm)'), 'bg', 'y', P.bg.y, { step: 10 })
    + fld(L('Genişlik (cm)', 'Width (cm)'), 'bg', 'w', P.bg.w, { min: 10, step: 10 })
    + fld(L('Yükseklik (cm)', 'Height (cm)'), 'bg', 'h', P.bg.h, { min: 10, step: 10 })
    + fld(L('Opaklık', 'Opacity'), 'bg', 'op', P.bg.op, { type: 'range', min: 0.05, max: 1, step: 0.05 })
    + `<label class="f"><span>${L('Konumu kilitle', 'Lock position')}</span><input type="checkbox" data-k="bg" data-p="lock" ${P.bg.lock ? 'checked' : ''}></label>`
    + `<div class="row">${inProps ? '' : `<button class="btn sm" data-act="bgsel">${L('✥ Seç / Taşı', '✥ Select & Move')}</button>`}<button class="btn sm" data-act="bgreset">${L('⌖ Sıfırla (0,0)', '⌖ Reset (0,0)')}</button><button class="btn sm" data-act="calib">${L('⚖️ Ölçeklendir', '⚖️ Calibrate')}</button><button class="btn sm" data-act="bgremove" style="color:var(--danger)">${L('🗑 Kaldır', '🗑 Remove')}</button></div>`;
}
function renderProps() {
  const el = $('#props'), os = selObjs();
  if (!os.length) { el.innerHTML = projectPanel(); return; }
  const kinds = [...new Set(os.map(x => x.kind))];
  const acts = (extra = '') => `<div class="row">${extra}<button class="btn sm" data-act="dup">${L('⧉ Çoğalt', '⧉ Duplicate')}</button><button class="btn sm" data-act="del" style="color:var(--danger)">${L('🗑 Sil', '🗑 Delete')}</button></div>`;
  if (kinds.length > 1) {
    const gs = os.filter(x => GROUPABLE[x.kind]);
    const grp = gs.length >= 2 ? `<div class="row"><button class="btn sm primary" data-act="group">📦 ${L('Grupla', 'Group')}</button></div>` : '';
    const ungrp = gs.some(x => x.o.grp) ? `<div class="row"><button class="btn sm" data-act="ungroup">📦✕ ${L('Grubu çöz', 'Ungroup')}</button></div>` : '';
    el.innerHTML = `<h3>${os.length} ${L('nesne seçili', 'objects selected')}</h3><p class="muted">${L('Taşımak için sürükle, silmek için Del.', 'Drag to move, press Del to delete.')}</p>${grp}${ungrp}${variantUIHtml()}${acts()}`; return;
  }
  const k = kinds[0], o = os[0].o, n = os.length;
  let h = `<h3>${(isEN() ? KIND_EN : KIND_TR)[k]}${n > 1 ? ` <span class="muted">(${n})</span>` : ''}</h3>`;
  if (k === 'wall') {
    if (n === 1) h += fld(L('Uzunluk (cm)', 'Length (cm)'), 'wall', 'len', wLen(o), { step: 1, min: 1 });
    h += fld(L('Kalınlık (cm)', 'Thickness (cm)'), 'wall', 't', o.t, { min: 3, max: 100 }) + fld(L('Yükseklik (cm)', 'Height (cm)'), 'wall', 'h', o.h, { min: 50, max: 800 });
    h += fld(L('Duvar Tipi', 'Wall Type'), 'wall', 'wt', o.wt || 'solid', { sel: { solid: L('🧱 Dolu', '🧱 Solid'), curtain: L('🪟 Cam Cephe', '🪟 Curtain Wall') } });
    if (n === 1) {
      h += fld(L('Açı (°)', 'Angle (°)'), 'wall', 'deg', wallDeg(o), { step: 5, min: 0, max: 360 });
      h += fld(L('Sabit Nokta (Menteşe)', 'Fixed Point (Pivot)'), 'wall', 'pivot', wallPivot(o), {
        sel: {
          a: L(`A Ucu (${Math.round(o.a.x)}, ${Math.round(o.a.y)})`, `Point A (${Math.round(o.a.x)}, ${Math.round(o.a.y)})`),
          b: L(`B Ucu (${Math.round(o.b.x)}, ${Math.round(o.b.y)})`, `Point B (${Math.round(o.b.x)}, ${Math.round(o.b.y)})`)
        }
      });
      h += `<div class="stat"><span>${L('Üzerindeki açıklıklar', 'Openings on wall')}</span><b>${F().ops.filter(p => p.wall === o.id).length}</b></div>`;
      h += `<h4>📐 ${L('Açılı Konumlar (Tıkla & Değiştir)', 'Angle Positions (Click to Cycle)')}</h4>`;
      if (Array.isArray(o.angles) && o.angles.length) {
        const curIdx = clamp(o.posIdx ?? 0, 0, o.angles.length - 1);
        h += `<p class="muted" style="margin:0 0 6px">${L('Tuvalde duvara her tıkladığınızda sıradaki konuma geçer. Konum açılarını aşağıdan veya döndürme kolundan ayarlayın:', 'Clicking the wall on canvas cycles through positions. Adjust angles below or via the rotation handle:')}</p>`;
        o.angles.forEach((ang, idx) => {
          const isCur = idx === curIdx;
          h += `<div class="f" style="gap:4px">
            <button class="btn sm ${isCur ? 'primary' : ''}" data-act="wallposGo" data-idx="${idx}" style="flex:1;justify-content:flex-start" title="${L('Bu konuma geç', 'Switch to this position')}">${isCur ? '● ' : '○ '}${L('Konum', 'Pos')} ${idx + 1}</button>
            <input type="number" data-k="wallpos" data-p="${idx}" value="${Math.round(ang * 10) / 10}" step="5" min="0" max="360" style="width:68px" title="${L('Konum açısı (°)', 'Position angle (°)')}">
            <button class="btn sm" data-act="wallposSetCur" data-idx="${idx}" title="${L('Duvarın mevcut açısını bu konuma kaydet', 'Save current wall angle to this position')}">📍</button>
            <button class="btn sm" data-act="wallposDel" data-idx="${idx}" style="color:var(--danger)" title="${L('Bu konumu sil', 'Delete position')}">✕</button>
          </div>`;
        });
        h += `<div class="row" style="margin-top:6px">
          <button class="btn sm" data-act="wallposAdd">＋ ${L('Konum ekle', 'Add position')}</button>
          <button class="btn sm" data-act="wallposNext">↻ ${L('Sonraki konum', 'Next position')}</button>
          <button class="btn sm" data-act="wallposClear" style="color:var(--danger)">✕ ${L('Kaldır', 'Clear')}</button>
        </div>`;
      } else {
        h += `<p class="muted" style="margin:0 0 6px">${L('Duvarı sabit noktasından dönen 3 konumlu (veya istediğiniz sayıda) hareketli duvara dönüştürün; duvara tıkladıkça Konum 1 → 2 → 3 değişir.', 'Turn this wall into a hinged multi-position wall; clicking the wall cycles Position 1 → 2 → 3.')}</p>
        <div class="row"><button class="btn sm primary" data-act="wallposInit">📐 ${L('3 Konumlu Açılır Duvar Yap', 'Enable 3 Angle Positions')}</button></div>`;
      }
    }
    h += acts(`<button class="btn sm" data-act="split">${L('✂ Ortadan böl', '✂ Split in half')}</button>`);
  } else if (k === 'op') {
    h += fld(L('Tür', 'Type'), 'op', 'type', o.type, { sel: isEN() ? { door: 'Door', double: 'Double door', slide: 'Sliding', arch: 'Archway', window: 'Window' } : { door: 'Kapı', double: 'Çift kapı', slide: 'Sürgülü', arch: 'Açıklık', window: 'Pencere' } });
    h += fld(L('Genişlik (cm)', 'Width (cm)'), 'op', 'w', o.w, { min: 20, max: 500 }) + fld(L('Yükseklik (cm)', 'Height (cm)'), 'op', 'h', o.h, { min: 20, max: 400 }) + fld(L('Denizlik (cm)', 'Sill height (cm)'), 'op', 'sill', o.sill, { min: 0, max: 300 });
    if (o.type === 'door' || o.type === 'double') h += `<label class="f"><span>${L('Açık (90°)', 'Open (90°)')}</span><input type="checkbox" data-k="op" data-p="open" ${o.open ? 'checked' : ''}></label>`;
    else if (o.type === 'slide') h += `<label class="f"><span>${L('Açık', 'Open')}</span><input type="checkbox" data-k="op" data-p="open" ${o.open ? 'checked' : ''}></label>`;
    if (o.type === 'slide') h += acts(`<button class="btn sm" data-act="opflip">${L('↔ Yön', '↔ Flip')}</button>`);
    else h += acts(`<button class="btn sm" data-act="opflip">${L('↔ Menteşe', '↔ Hinge')}</button><button class="btn sm" data-act="opside">${L('↕ Açılış yönü', '↕ Swing side')}</button>`);
  } else if (k === 'furn') {
    h += fld(L('Etiket', 'Label'), 'furn', 'label', o.label || '', { type: 'text' });
    h += fld(L('Genişlik (cm)', 'Width (cm)'), 'furn', 'w', o.w, { min: 5 }) + fld(L('Derinlik (cm)', 'Depth (cm)'), 'furn', 'd', o.d, { min: 5 }) + fld(L('Yükseklik 3B (cm)', '3D Height (cm)'), 'furn', 'h', o.h, { min: 1 }) + fld(L('Açı (°)', 'Angle (°)'), 'furn', 'rot', o.rot, { min: 0, max: 360 }) + fld(L('Renk', 'Color'), 'furn', 'color', o.color, { type: 'color' });
    h += acts(`<button class="btn sm" data-act="rot90">⟳ 90°</button><button class="btn sm" data-act="swapwd">${L('⇄ En/Boy', '⇄ Swap W/D')}</button><button class="btn sm" data-act="front">${L('⬆ Öne', '⬆ Bring front')}</button>`);
    if (o.type === 'shape') h += `<div class="row"><button class="btn sm primary" data-act="saveshape">💾 ${L('Şekli kütüphaneye kaydet', 'Save shape to library')}</button></div>`;
  } else if (k === 'room') {
    h += fld(L('Ad', 'Name'), 'room', 'name', o.name, { type: 'text' }) + fld(L('Renk', 'Color'), 'room', 'color', o.color, { type: 'color' }) + fld(L('Zemin', 'Flooring'), 'room', 'floor', o.floor || 'none', { sel: getFloors() });
    if (n === 1) {
      const rb = bboxOf('room', o);
      if (rb) {
        h += fld(L('Konum X (cm)', 'Position X (cm)'), 'room', 'rx', Math.round(rb.x0), { step: 10 })
          + fld(L('Konum Y (cm)', 'Position Y (cm)'), 'room', 'ry', Math.round(rb.y0), { step: 10 })
          + fld(L('Genişlik (cm)', 'Width (cm)'), 'room', 'rw', Math.round(rb.x1 - rb.x0), { min: 20, step: 10 })
          + fld(L('Derinlik (cm)', 'Depth (cm)'), 'room', 'rd', Math.round(rb.y1 - rb.y0), { min: 20, step: 10 });
      }
      h += `<div class="stat"><span>${L('Alan', 'Area')}</span><b>${fmtArea(polyArea(o.pts))}</b></div><div class="stat"><span>${L('Çevre', 'Perimeter')}</span><b>${fmtLen(polyPerim(o.pts))}</b></div><div class="stat"><span>${L('Köşe sayısı', 'Vertices')}</span><b>${o.pts.length}</b></div>`;
    }
    h += acts(`<button class="btn sm" data-act="redetect">${L('↻ Yeniden algıla', '↻ Redetect')}</button>`);
  } else if (k === 'dim') {
    h += `<div class="stat"><span>${L('Ölçü', 'Length')}</span><b>${fmtLen(dist(o.a, o.b))}</b></div>` + fld(L('Ofset (cm)', 'Offset (cm)'), 'dim', 'off', o.off ?? 40) + acts();
  } else if (k === 'text') {
    h += fld(L('Metin', 'Text'), 'text', 'text', o.text, { type: 'text' }) + fld(L('Boyut', 'Size'), 'text', 'size', o.size, { min: 6, max: 200 }) + fld(L('Açı (°)', 'Angle (°)'), 'text', 'rot', o.rot || 0) + fld(L('Renk', 'Color'), 'text', 'color', o.color, { type: 'color' }) + acts();
  } else if (k === 'sketch') {
    h += fld(L('Kalem kalınlığı (cm)', 'Stroke width (cm)'), 'sketch', 'w', o.w || 4, { min: 0.5, max: 60, step: 0.5 }) + fld(L('Renk', 'Color'), 'sketch', 'color', o.color || '#1e293b', { type: 'color' });
    if (n === 1) h += `<div class="stat"><span>${L('Nokta sayısı', 'Points')}</span><b>${(o.pts || []).length}</b></div>`;
    h += acts();
  } else if (k === 'bg') {
    h += `<p class="muted" style="margin:0 0 8px">${L('Görseli tuvalde sürükleyerek taşıyabilir, köşelerinden boyutlandırabilirsiniz (Shift: serbest oran).', 'Drag the image on the canvas to reposition, or drag its corners to resize (Shift: free aspect ratio).')}</p>` + bgFields(true);
  }
  const gsAll = os.filter(x => GROUPABLE[x.kind]);
  if (gsAll.length >= 2) h += `<div class="row"><button class="btn sm primary" data-act="group">📦 ${L('Grupla', 'Group')}</button></div>`;
  if (gsAll.some(x => x.o.grp)) h += `<div class="row"><button class="btn sm" data-act="ungroup">📦✕ ${L('Grubu çöz', 'Ungroup')}</button></div>`;
  h += variantUIHtml();
  el.innerHTML = h;
}
function projectPanel() {
  const f = F(); let h = `<h3>⚙️ ${L('Proje', 'Project')}</h3>`;
  h += fld(L('Duvar kalınlığı (cm)', 'Wall thickness (cm)'), 'proj', 'wallT', P.wallT, { min: 3, max: 60 }) + fld(L('Duvar yüksekliği (cm)', 'Wall height (cm)'), 'proj', 'wallH', P.wallH, { min: 100, max: 600 });
  h += `<h4>${L('Katmanlar', 'Layers')}</h4>` + [['bg', L('Arka plan görseli', 'Background image')], ['rooms', L('Odalar', 'Rooms')], ['walls', L('Duvarlar & açıklıklar', 'Walls & openings')], ['furn', L('Mobilya', 'Furniture')], ['dims', L('Ölçüler', 'Dimensions')], ['sketch', L('Serbest çizimler', 'Freehand sketches')]].map(([k, l]) => `<label class="f"><span>${l}</span><input type="checkbox" data-k="layer" data-p="${k}" ${layersVis[k] ? 'checked' : ''}></label>`).join('');
  h += `<h4>${L('Arka plan görseli', 'Background image')}</h4>`;
  if (P.bg) h += bgFields(false);
  else h += `<p class="muted" style="margin:0 0 6px">${L('Kroki / mevcut plan görselini altlık olarak ekleyip üzerinden çizebilirsin.', 'Import a blueprint or floor plan image as an underlay to trace over.')}</p><div class="row"><button class="btn sm" data-act="bgadd">${L('🖼 Görsel ekle', '🖼 Add image')}</button></div>`;
  const rooms = f.rooms; let tot = 0;
  h += `<h4>${L('Odalar', 'Rooms')} – ${esc(f.name)}</h4>`;
  if (!rooms.length) h += `<p class="muted" style="margin:0">${L('Henüz oda yok. “Oda algıla” aracı ile kapalı alanlara tıkla.', 'No rooms yet. Click inside enclosed areas with the “Auto Room” tool.')}</p>`;
  rooms.forEach(r => { const a = polyArea(r.pts); tot += a; h += `<div class="stat" style="cursor:pointer" data-sel="${r.id}"><span>${esc(r.name)}</span><b>${fmtArea(a)}</b></div>`; });
  if (rooms.length) h += `<div class="stat"><span><b>${L('Toplam', 'Total')}</b></span><b>${fmtArea(tot)}</b></div>`;
  const wl = f.walls.reduce((s, w) => s + wLen(w), 0);
  h += `<h4>${L('Özet', 'Summary')}</h4><div class="stat"><span>${L('Duvar sayısı / uzunluk', 'Walls / total length')}</span><b>${f.walls.length} / ${fmtLen(wl)}</b></div><div class="stat"><span>${L('Kapı', 'Doors')}</span><b>${f.ops.filter(o => o.type !== 'window').length}</b></div><div class="stat"><span>${L('Pencere', 'Windows')}</span><b>${f.ops.filter(o => o.type === 'window').length}</b></div>`;
  const cnt = {}; f.furn.forEach(x => { const nm = BYID[x.type] ? itemName(BYID[x.type]) : x.name; cnt[nm] = (cnt[nm] || 0) + 1; });
  if (Object.keys(cnt).length) h += `<h4>${L('Mobilya listesi', 'Furniture list')}</h4>` + Object.entries(cnt).map(([k, v]) => `<div class="stat"><span>${esc(k)}</span><b>× ${v}</b></div>`).join('');
  return h;
}
function affects3D(k, p) {
  // yalnızca 3B sahneyi gerçekten etkileyen özellikler yeniden insin
  if (k === 'wall' || k === 'op') return true;
  if (k === 'furn') return p !== 'label';
  if (k === 'room') return p === 'color';
  if (k === 'sketch') return p === 'w' || p === 'color';
  return false; // dim/text/bg/layer 3B'yi etkilemez
}
function applyProp(t, final) {
  const k = t.dataset.k, p = t.dataset.p; let v = t.type === 'checkbox' ? t.checked : t.value;
  if (t.type === 'number' || t.type === 'range') { v = parseFloat(v); if (isNaN(v)) return; }
  if (k === 'layer') { layersVis[p] = v; render(); return; }
  if (k === 'proj') { P[p] = v; if (p === 'wallH' && ui.view3d && T3) schedBuild3D(); if (final) { commit(); } return; }
  if (k === 'bg' && P.bg) { P.bg[p] = v; if (p === 'lock' && v) sel = sel.filter(x => x !== 'bg'); render(); if (final) { commit(); if (p === 'lock') renderProps(); } return; }
  if (k === 'wallpos') {
    const w = selObjs().find(x => x.kind === 'wall')?.o, idx = +p;
    if (w && Array.isArray(w.angles) && idx >= 0 && idx < w.angles.length) {
      const norm = Math.round(((v % 360) + 360) % 360 * 10) / 10;
      w.angles[idx] = norm; w.posIdx = idx; setWallDeg(w, norm, false);
      render(); if (final) { commit(); renderProps(); }
    }
    return;
  }
  const os = selObjs().filter(x => x.kind === k); if (!os.length) return;
  for (const { o } of os) {
    if (k === 'wall' && p === 'len') {
      const pv = o[wallPivot(o)], fk = wallFree(o), L = wLen(o) || 1, ux = (o[fk].x - pv.x) / L, uy = (o[fk].y - pv.y) / L;
      o[fk] = { x: pv.x + ux * v, y: pv.y + uy * v };
    } else if (k === 'wall' && p === 'deg') {
      setWallDeg(o, v, true);
    } else if (k === 'wall' && p === 'pivot') {
      if (o.pivot !== v) {
        o.pivot = v === 'b' ? 'b' : 'a';
        if (Array.isArray(o.angles) && o.angles.length) {
          const curIdx = clamp(o.posIdx ?? 0, 0, o.angles.length - 1);
          const diff = wallDeg(o) - o.angles[curIdx];
          o.angles = o.angles.map(a => Math.round((((a + diff) % 360) + 360) % 360 * 10) / 10);
        }
      }
    } else if (k === 'room' && (p === 'rx' || p === 'ry' || p === 'rw' || p === 'rd')) {
      const rb = bboxOf('room', o); if (!rb) continue;
      // sürüklemeyle aynı davranış: X/Y kaydırınca odanın içeriği de kayar
      const inner = (p === 'rx' || p === 'ry') ? { fn: furnInRoom(o), tx: F().texts.filter(q => pointInPoly(q, o.pts)) } : null;
      if (p === 'rx') { const dx = v - rb.x0; o.pts = o.pts.map(q => ({ x: Math.round(q.x + dx), y: q.y })); if (inner) { inner.fn.forEach(q => q.x += dx); inner.tx.forEach(q => q.x += dx); } }
      else if (p === 'ry') { const dy = v - rb.y0; o.pts = o.pts.map(q => ({ x: q.x, y: Math.round(q.y + dy) })); if (inner) { inner.fn.forEach(q => q.y += dy); inner.tx.forEach(q => q.y += dy); } }
      else if (p === 'rw') { const w0 = rb.x1 - rb.x0 || 1, sc = Math.max(20, v) / w0; o.pts = o.pts.map(q => ({ x: Math.round(rb.x0 + (q.x - rb.x0) * sc), y: q.y })); }
      else if (p === 'rd') { const h0 = rb.y1 - rb.y0 || 1, sc = Math.max(20, v) / h0; o.pts = o.pts.map(q => ({ x: q.x, y: Math.round(rb.y0 + (q.y - rb.y0) * sc) })); }
    } else if (k === 'op' && p === 'open') { o.open = v ? 90 : 0; }
    else if (k === 'op' && p === 'type') { o[p] = v; if (v === 'window' && o.sill === 0) { o.sill = 90; o.h = 120; } if (v !== 'window' && o.sill > 0) { o.sill = 0; o.h = 210; } }
    else o[p] = v;
  }
  render();
  if (ui.view3d && T3) {
    if (k === 'furn' && p === 'rot') os.forEach(x => moveFurn3D(x.o));
    else if (affects3D(k, p)) schedBuild3D();
  }
  if (final) { commit(); if (['type', 'floor', 'len', 'deg', 'pivot'].includes(p)) renderProps(); }
}
$('#props').addEventListener('input', e => { if (e.target.dataset.p && e.target.type !== 'checkbox') applyProp(e.target, false); });
$('#props').addEventListener('change', e => { if (e.target.dataset.p) { applyProp(e.target, true); if (e.target.dataset.k === 'layer') renderProps(); } });
$('#props').addEventListener('click', e => {
  const s = e.target.closest('[data-sel]'); if (s) { sel = [s.dataset.sel]; refresh(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, os = selObjs(), f = F();
  if (a === 'del') return deleteSel();
  if (a === 'dup') return paste(true);
  if (a === 'bgadd') return $('#fileBg').click();
  if (a === 'bgsel') { if (P.bg) { P.bg.lock = false; sel = ['bg']; setTool('select'); refresh(); } return; }
  if (a === 'bgreset') { if (P.bg) { P.bg.x = 0; P.bg.y = 0; commit(); refresh(); } return; }
  if (a === 'bgremove') { P.bg = null; sel = sel.filter(x => x !== 'bg'); commit(); return refresh(); }
  if (a === 'calib') return setTool('calib');
  if (a === 'group') return groupSel();
  if (a === 'ungroup') return ungroupSel();
  if (a === 'varInit' || a === 'varSave' || a === 'varNew' || a === 'varDel' || a === 'varGo' || a === 'varNext') return varAction(a, b.dataset.idx != null ? +b.dataset.idx : null);
  for (const { kind, o } of os) {
    if (kind === 'wall') {
      if (a === 'wallposInit') {
        const a0 = Math.round(wallDeg(o));
        o.pivot = o.pivot || 'a';
        o.angles = [a0, (a0 + 45) % 360, (a0 + 90) % 360];
        o.posIdx = 0;
      } else if (a === 'wallposAdd') {
        if (!Array.isArray(o.angles)) o.angles = [Math.round(wallDeg(o))];
        const last = o.angles[o.angles.length - 1] ?? Math.round(wallDeg(o));
        const nextAng = Math.round((last + 45) % 360);
        o.angles.push(nextAng); o.posIdx = o.angles.length - 1; setWallDeg(o, nextAng, false);
      } else if (a === 'wallposGo') {
        const idx = +b.dataset.idx;
        if (Array.isArray(o.angles) && idx >= 0 && idx < o.angles.length) { o.posIdx = idx; setWallDeg(o, o.angles[idx], false); }
      } else if (a === 'wallposSetCur') {
        const idx = +b.dataset.idx;
        if (Array.isArray(o.angles) && idx >= 0 && idx < o.angles.length) { o.angles[idx] = wallDeg(o); o.posIdx = idx; }
      } else if (a === 'wallposDel') {
        const idx = +b.dataset.idx;
        if (Array.isArray(o.angles)) {
          o.angles.splice(idx, 1);
          if (!o.angles.length) { delete o.angles; delete o.posIdx; }
          else { o.posIdx = clamp(o.posIdx ?? 0, 0, o.angles.length - 1); setWallDeg(o, o.angles[o.posIdx], false); }
        }
      } else if (a === 'wallposNext') {
        cycleWallPos(o);
      } else if (a === 'wallposClear') {
        delete o.angles; delete o.posIdx;
      }
    }
    if (a === 'rot90' && kind === 'furn') o.rot = (o.rot + 90) % 360;
    if (a === 'swapwd' && kind === 'furn') { [o.w, o.d] = [o.d, o.w]; if (o.k === 'poly' && o.pts) o.pts = o.pts.map(p => ({ x: p.y, y: p.x })); }
    if (a === 'saveshape' && kind === 'furn') {
      const nm = prompt(L('Şekil adı:', 'Shape name:'), o.name || L('Şekil', 'Shape'));
      if (nm) {
        P.lib = P.lib || { shapes: [] }; P.lib.shapes = P.lib.shapes || [];
        P.lib.shapes.push({ id: uid(), name: nm, en: nm, k: o.k, pts: o.pts ? JSON.parse(JSON.stringify(o.pts)) : undefined, w: o.w, d: o.d, h: o.h, color: o.color, icon: o.k === 'round' ? '⬤' : '⬡' });
        commit(); buildLib(); toast(L(`“${nm}” kütüphaneye eklendi (⬡ Şekillerim)`, `“${nm}” added to the library (⬡ My Shapes)`));
        return;
      }
    }
    if (a === 'front' && kind === 'furn') { f.furn = f.furn.filter(x => x !== o); f.furn.push(o); }
    if (a === 'opflip' && kind === 'op') o.flip = o.flip ? 0 : 1;
    if (a === 'opside' && kind === 'op') o.side = -(o.side || 1);
    if (a === 'redetect' && kind === 'room') { const c = polyCentroid(o.pts); const r = detectRoom(pointInPoly(c, o.pts) ? c : o.pts[0]); if (Array.isArray(r)) o.pts = r; else toast(L('Oda yeniden algılanamadı', 'Room could not be redetected')); }
    if (a === 'split' && kind === 'wall') {
      const m = { x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 }, nw = mkWall(m, o.b); nw.t = o.t; nw.h = o.h; nw.wt = o.wt; const L = wLen(o), old = o.b;
      o.b = m; f.walls.push(nw);
      f.ops.forEach(op => { if (op.wall === o.id && op.d > L / 2) { op.wall = nw.id; op.d -= L / 2; } });
    }
  }
  commit(); refresh();
});

/* ---------- Kütüphane ---------- */
const LIBCATS = ['Kapı & Pencere', ...CATS, '⬡ Şekillerim'];
const LIBCATS_EN = ['Doors & Windows', ...CATS_EN, '⬡ My Shapes'];
function buildLib() {
  const cats = isEN() ? LIBCATS_EN : LIBCATS;
  $('#cats').innerHTML = cats.map((c, i) => `<button class="chip ${i === ui.cat && !ui.q ? 'on' : ''}" data-cat="${i}">${c}</button>`).join('');
  const q = ui.q.toLowerCase(); let items = '';
  const card = (type, d, sz) => `<button class="item" data-type="${type}" data-id="${d.id}"><div class="ic">${d.icon || '▭'}</div><div>${itemName(d)}</div><div class="sz">${sz}</div></button>`;
  const shapeCard = d => `<button class="item" data-type="def" data-id="${d.id}"><div class="ic">${d.icon || '⬡'}</div><div>${esc(itemName(d))}</div><div class="sz">${Math.round(d.w)}×${Math.round(d.d)} cm</div><span class="delsh" data-delsh="${d.id}" title="${L('Kütüphaneden sil', 'Remove from library')}">✕</span></button>`;
  const matches = d => d.name.toLowerCase().includes(q) || (d.en && d.en.toLowerCase().includes(q));
  const shapes = P && P.lib && P.lib.shapes || [];
  if (q) {
    items += OPENINGS.filter(matches).map(o => card('op', o, o.w + ' cm')).join('');
    items += CATALOG.filter(matches).map(c => card('furn', c, `${c.w}×${c.d}`)).join('');
    items += shapes.filter(matches).map(shapeCard).join('');
  } else if (ui.cat === 0) items = OPENINGS.map(o => card('op', o, o.w + ' cm')).join('');
  else if (ui.cat === LIBCATS.length - 1) items = shapes.map(shapeCard).join('');
  else items = CATALOG.filter(c => c.cat === ui.cat - 1).map(c => card('furn', c, `${c.w}×${c.d}`)).join('');
  $('#items').innerHTML = items || `<p class="muted">${L('Sonuç yok', 'No results')}</p>`;
  updateTools();
}
$('#cats').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { ui.cat = +b.dataset.cat; ui.q = ''; $('#search').value = ''; buildLib(); } });
$('#search').addEventListener('input', e => { ui.q = e.target.value; buildLib(); });
$('#items').addEventListener('click', e => {
  const x = e.target.closest('[data-delsh]');
  if (x) {
    const i = (P.lib.shapes || []).findIndex(s => s.id === x.dataset.delsh);
    if (i >= 0 && confirm(L(`“${itemName(P.lib.shapes[i])}” kütüphaneden silinsin mi?`, `Delete “${itemName(P.lib.shapes[i])}” from the library?`))) { P.lib.shapes.splice(i, 1); commit(); buildLib(); toast(L('Şekil kütüphaneden silindi', 'Shape removed from library')); }
    return;
  }
  const b = e.target.closest('.item'); if (!b) return;
  let type = b.dataset.type, def = type === 'op' ? OPDEF[b.dataset.id] : type === 'def' ? (P.lib.shapes || []).find(s => s.id === b.dataset.id) : BYID[b.dataset.id];
  if (type === 'def') { if (!def) return; type = 'furn'; def = { id: 'sh_' + def.id, name: def.name, en: def.en, k: def.k, pts: def.pts, w: def.w, d: def.d, h: def.h, color: def.color, icon: def.icon }; }
  startPlace(type, def);
});

/* ---------- Katlar ---------- */
function renderFloors() {
  $('#floors').innerHTML = P.floors.map((f, i) => `<button class="ftab ${i === fi ? 'on' : ''}" data-fl="${i}" title="${L('Çift tıkla: yeniden adlandır', 'Double-click to rename')}">${esc(f.name)}</button>`).join('')
    + `<button class="btn sm" data-fa="add" title="${L('Kat ekle', 'Add floor')}">${L('＋ Kat', '＋ Floor')}</button><button class="btn sm" data-fa="dup" title="${L('Katı kopyala', 'Duplicate floor')}">⧉</button><button class="btn sm" data-fa="del" title="${L('Katı sil', 'Delete floor')}">🗑</button>`;
}
$('#floors').addEventListener('click', e => {
  const t = e.target.closest('[data-fl]'); if (t) { fi = +t.dataset.fl; sel = []; refresh(); return; }
  const a = e.target.closest('[data-fa]'); if (!a) return;
  if (a.dataset.fa === 'add') { P.floors.push(newFloor(L('Kat ', 'Floor ') + P.floors.length)); fi = P.floors.length - 1; sel = []; commit(); fit(); refresh(); }
  if (a.dataset.fa === 'dup') { const c = JSON.parse(JSON.stringify(F())); const m = {}; const idm = o => { const n = uid(); m[o.id] = n; o.id = n; }; for (const k in KINDS) c[k].forEach(idm); c.ops.forEach(o => o.wall = m[o.wall]); c.id = uid(); c.groups = []; c.rooms.forEach(r => { delete r.vars; delete r.vIdx; }); c.name = F().name + L(' (kopya)', ' (copy)'); P.floors.splice(fi + 1, 0, c); fi++; sel = []; commit(); refresh(); }
  if (a.dataset.fa === 'del') { if (P.floors.length < 2) return toast(L('En az bir kat olmalı', 'At least one floor is required')); if (confirm(isEN() ? `Delete floor “${F().name}”?` : `“${F().name}” katı silinsin mi?`)) { P.floors.splice(fi, 1); fi = Math.max(0, fi - 1); sel = []; commit(); refresh(); } }
});
$('#floors').addEventListener('dblclick', e => { const t = e.target.closest('[data-fl]'); if (t) { const f = P.floors[+t.dataset.fl], n = prompt(L('Kat adı:', 'Floor name:'), f.name); if (n) { f.name = n; commit(); refresh(); } } });
function refresh() { render(); renderProps(); renderFloors(); updateTools(); }

/* ---------- Kopyala / yapıştır ---------- */
let pasteN = 0;
const GROUPABLE = { wall: 1, room: 1, furn: 1, dim: 1, text: 1 };
function groupSel() {
  const gs = selObjs().filter(x => GROUPABLE[x.kind]);
  if (gs.length < 2) { toast(L('Gruplamak için en az 2 nesne seçin', 'Select at least 2 objects to group')); return; }
  const grps = [...new Set(gs.map(x => x.o.grp).filter(Boolean))];
  const g = grps.length === 1 ? grps[0] : uid(); // tek grup seçiliyse onu genişlet (düzenler korunur)
  gs.forEach(({ o }) => o.grp = g);
  const f = F(); f.groups = f.groups || [];
  if (!f.groups.some(x => x.id === g)) f.groups.push({ id: g, vars: [], idx: 0 });
  pruneGroups();
  commit(); refresh();
  toast(L('Seçili nesneler gruplandı – birlikte taşınırlar', 'Selected objects grouped – they move together'));
}
function ungroupSel() {
  const gs = selObjs().filter(x => GROUPABLE[x.kind] && x.o.grp);
  if (!gs.length) return;
  gs.forEach(({ o }) => delete o.grp);
  dropPoseOrphans(gs.map(x => x.o.id)); // eski grup kayıtlarındaki artık pozlar temizlenir
  pruneGroups();
  commit(); refresh();
  if (ui.view3d && T3) schedBuild3D();
  toast(L('Grup çözüldü', 'Group dissolved'));
}
function dropPoseOrphans(ids, alsoRooms = false) {
  // grup çözme / yeniden gruplama / silme sonrası: kayıtlarda üyesi olmayan poz kalmasın
  const f = F(); if (!f) return;
  const s = new Set(ids);
  const clean = recs => { for (const g of recs) for (const v of g.vars || []) if (v.poses) for (const id in v.poses) if (s.has(id)) delete v.poses[id]; };
  clean(f.groups || []);
  if (alsoRooms) clean(f.rooms || []);
}
function pruneGroups() {
  const f = F(); if (!f.groups) return;
  const alive = gid => { for (const k in KINDS) if (f[k].some(o => o.grp === gid)) return true; return false; };
  f.groups = f.groups.filter(g => alive(g.id));
}

/* ---------- Ayarlanabilir düzenler (1a → 1b → 1c döngüsü) ---------- */
function varLabel(i, pfx = 1) { return pfx + String.fromCharCode(97 + i % 26); }
function nextVarPrefix() {
  const f = F(); if (!f) return 1;
  const used = new Set();
  for (const r of f.rooms || []) if (r.vars && r.vars.length) used.add(parseInt(r.vars[0].label) || 1);
  for (const g of f.groups || []) if (g.vars && g.vars.length) used.add(parseInt(g.vars[0].label) || 1);
  let p = 1; while (used.has(p)) p++; return p;
}
function snapPose(kind, o) {
  if (kind === 'wall') {
    const p = { a: { ...o.a }, b: { ...o.b }, t: o.t, h: o.h };
    if (Array.isArray(o.angles) && o.angles.length) { p.angles = o.angles.slice(); p.posIdx = o.posIdx ?? 0; } // menteşeli duvarın preset durumu da saklanır
    return p;
  }
  if (kind === 'room') return { pts: o.pts.map(p => ({ ...p })) };
  if (kind === 'dim') return { a: { ...o.a }, b: { ...o.b }, off: o.off };
  if (kind === 'furn') return { x: o.x, y: o.y, rot: o.rot, w: o.w, d: o.d, h: o.h };
  if (kind === 'text') return { x: o.x, y: o.y, rot: o.rot, size: o.size };
  return { x: o.x, y: o.y, rot: o.rot };
}
function clonePoses(poses) { return JSON.parse(JSON.stringify(poses || {})); }
function posesEqual(a, b) { return JSON.stringify(a || {}) === JSON.stringify(b || {}); }
function groupMemberIds(grp) {
  const f = F(), ids = [];
  for (const k in KINDS) for (const o of f[k]) if (o.grp === grp) ids.push(o.id);
  return ids;
}
function poseOwners() {
  // id -> sahip düzen kümesi ('room:<roomId>' / 'group:<recId>') — ilk gelen sahiplenir
  const f = F(), m = {};
  if (!f) return m;
  for (const r of f.rooms || []) for (const v of r.vars || []) if (v.poses) for (const id in v.poses) (m[id] = m[id] || new Set()).add('room:' + r.id);
  for (const g of f.groups || []) for (const v of g.vars || []) if (v.poses) for (const id in v.poses) (m[id] = m[id] || new Set()).add('group:' + g.id);
  return m;
}
const ownedElsewhere = (own, id, self) => [...(own[id] || [])].some(t => t !== self);
function groupPoses(ids, recId) {
  const own = poseOwners(), self = 'group:' + recId, m = {};
  for (const id of ids) {
    if (ownedElsewhere(own, id, self)) continue; // başka bir düzenin sahiplik payında
    const fd = find(id);
    if (fd && GROUPABLE[fd.kind]) m[id] = snapPose(fd.kind, fd.o);
  }
  return m;
}
function furnInRoom(r) { return F().furn.filter(o => pointInPoly(o, r.pts)); }
function ptNearPoly(p, pts, tol) {
  for (let i = 0; i < pts.length; i++) {
    if (segProj(p, pts[i], pts[(i + 1) % pts.length]).d <= tol) return true;
  }
  return pointInPoly(p, pts);
}
function wallsForRoom(r) {
  const own = poseOwners(), self = 'room:' + r.id;
  return F().walls.filter(w => {
    if (w.grp || ownedElsewhere(own, w.id, self)) return false;
    const t = w.t + 15; // tek köşe teması yetmez: duvar oda kenarı boyunca uzanmalı
    const ends = (ptNearPoly(w.a, r.pts, t) ? 1 : 0) + (ptNearPoly(w.b, r.pts, t) ? 1 : 0);
    return ends === 2 || ptNearPoly({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 }, r.pts, t);
  });
}
function roomPoses(r) {
  const own = poseOwners(), self = 'room:' + r.id, free = id => !ownedElsewhere(own, id, self);
  const m = { [r.id]: snapPose('room', r) };
  for (const o of furnInRoom(r)) if (free(o.id)) m[o.id] = snapPose('furn', o);
  for (const t of F().texts.filter(x => pointInPoly(x, r.pts))) if (free(t.id)) m[t.id] = snapPose('text', t);
  for (const w of wallsForRoom(r)) if (free(w.id)) m[w.id] = snapPose('wall', w);
  if (Array.isArray(r.vars)) {
    for (const v of r.vars) for (const id in (v.poses || {})) {
      if (!m[id] && free(id)) { const fd = find(id); if (fd && GROUPABLE[fd.kind]) m[id] = snapPose(fd.kind, fd.o); }
    }
  }
  return m;
}
function applyVarPoses(poses) {
  for (const id in poses) {
    const fd = find(id); if (!fd) continue;
    const p = poses[id], o = fd.o;
    if (fd.kind === 'wall') {
      const hadAngles = Array.isArray(o.angles) && o.angles.length > 0, od = hadAngles ? wallDeg(o) : 0;
      o.a = { ...p.a }; o.b = { ...p.b };
      if (p.t != null) o.t = p.t;
      if (p.h != null) o.h = p.h;
      if (Array.isArray(p.angles) && p.angles.length) {
        // preset durumu düzenele birlikte geri gelir (rozet/ hayaletler gövdeyle tutarlı)
        o.angles = p.angles.slice();
        o.posIdx = clamp(p.posIdx ?? 0, 0, o.angles.length - 1);
      } else if (hadAngles) {
        // eski kayıtlar (angles alanı yok): gövde dönerken presetleri de aynı farkla kaydır
        const diff = Math.round((wallDeg(o) - od) * 10) / 10;
        if (Math.abs(diff) > 0.05) o.angles = o.angles.map(a => Math.round((((a + diff) % 360) + 360) % 360 * 10) / 10);
      }
      const L = wLen(o);
      F().ops.forEach(op => { if (op.wall === o.id) op.d = clamp(op.d, Math.min(op.w / 2, L / 2), Math.max(L - op.w / 2, L / 2)); });
    } else if (fd.kind === 'room') {
      o.pts = p.pts.map(q => ({ ...q }));
    } else if (fd.kind === 'dim') {
      o.a = { ...p.a }; o.b = { ...p.b }; o.off = p.off;
    } else if (fd.kind === 'furn') {
      o.x = p.x; o.y = p.y; o.rot = p.rot;
      if (p.w != null) o.w = p.w;
      if (p.d != null) o.d = p.d;
      if (p.h != null) o.h = p.h;
    } else if (fd.kind === 'text') {
      o.x = p.x; o.y = p.y; o.rot = p.rot;
      if (p.size != null) o.size = p.size;
    } else {
      o.x = p.x; o.y = p.y; o.rot = p.rot;
    }
  }
}
let _switchingVar = false;
function syncActiveVars() {
  if (_switchingVar || !P) return;
  const f = F(); if (!f) return;
  for (const r of f.rooms || []) {
    if (!Array.isArray(r.vars) || !r.vars.length) continue;
    const i = clamp(r.vIdx ?? 0, 0, r.vars.length - 1), v = r.vars[i];
    if (r.vars.length >= 2 || v.draft) v.poses = roomPoses(r);
  }
  for (const rec of f.groups || []) {
    if (!Array.isArray(rec.vars) || !rec.vars.length) continue;
    const mids = groupMemberIds(rec.id); if (!mids.length) continue;
    const i = clamp(rec.idx ?? 0, 0, rec.vars.length - 1), v = rec.vars[i];
    if (rec.vars.length >= 2 || v.draft) v.poses = groupPoses(mids, rec.id);
  }
}
function switchGroupVarTo(rec, nextIdx) {
  if (!rec || !rec.vars || !rec.vars.length) return false;
  const mids = groupMemberIds(rec.id); if (!mids.length) return false;
  const curIdx = clamp(rec.idx ?? 0, 0, rec.vars.length - 1), curV = rec.vars[curIdx];
  const curSnap = groupPoses(mids, rec.id);
  if (rec.vars.length >= 2 || curV.draft) {
    curV.poses = clonePoses(curSnap);
    if (!curV.base || !posesEqual(curSnap, curV.base)) { curV.base = clonePoses(curSnap); delete curV.draft; }
  }
  rec.idx = clamp(nextIdx, 0, rec.vars.length - 1);
  const v = rec.vars[rec.idx];
  if (!v.base) v.base = clonePoses(v.poses);
  _switchingVar = true;
  try { applyVarPoses(v.poses); commit(); } finally { _switchingVar = false; }
  refresh(); if (ui.view3d && T3) build3D(true);
  toast(L(`Düzen ${v.label} (${rec.idx + 1}/${rec.vars.length})`, `Layout ${v.label} (${rec.idx + 1}/${rec.vars.length})`));
  return true;
}
function switchRoomVarTo(r, nextIdx) {
  if (!r || !r.vars || !r.vars.length) return false;
  const curIdx = clamp(r.vIdx ?? 0, 0, r.vars.length - 1), curV = r.vars[curIdx];
  const curSnap = roomPoses(r);
  if (r.vars.length >= 2 || curV.draft) {
    curV.poses = clonePoses(curSnap);
    if (!curV.base || !posesEqual(curSnap, curV.base)) { curV.base = clonePoses(curSnap); delete curV.draft; }
  }
  r.vIdx = clamp(nextIdx, 0, r.vars.length - 1);
  const v = r.vars[r.vIdx];
  if (!v.base) v.base = clonePoses(v.poses);
  _switchingVar = true;
  try { applyVarPoses(v.poses); commit(); } finally { _switchingVar = false; }
  refresh();
  if (ui.view3d && T3) build3D(true);
  toast(L(`Düzen ${v.label} (${r.vIdx + 1}/${r.vars.length})`, `Layout ${v.label} (${r.vIdx + 1}/${r.vars.length})`));
  return true;
}
function cycleGroupVars(grp) {
  const rec = (F().groups || []).find(g => g.id === grp);
  if (!rec || !rec.vars || rec.vars.length < 2) return false;
  return switchGroupVarTo(rec, ((rec.idx ?? 0) + 1) % rec.vars.length);
}
function cycleRoomVars(r) {
  if (!r || !r.vars || !r.vars.length || r.vars.length < 2) return false;
  return switchRoomVarTo(r, ((r.vIdx ?? 0) + 1) % r.vars.length);
}
function varContainer() {
  const os = selObjs(); if (!os.length) return null;
  const gs = [...new Set(os.map(x => x.o.grp).filter(Boolean))];
  if (gs.length === 1 && os.every(x => x.o.grp === gs[0])) {
    const rec = (F().groups || []).find(g => g.id === gs[0]);
    if (rec) return { type: 'group', rec };
  }
  if (os.length === 1 && os[0].kind === 'room') return { type: 'room', o: os[0].o };
  if (os.length === 1 && (os[0].kind === 'furn' || os[0].kind === 'text')) {
    const item = os[0].o;
    const adjRoom = (F().rooms || []).find(r => r.vars && r.vars.length && (pointInPoly(item, r.pts) || r.vars.some(v => v.poses && v.poses[item.id])));
    if (adjRoom) return { type: 'room', o: adjRoom };
  }
  const groupable = os.filter(x => GROUPABLE[x.kind]);
  if (groupable.length >= 1) return { type: 'potential', os: groupable };
  return null;
}
function varAction(a, targetIdx) {
  let c = varContainer(); if (!c) return;
  if (c.type === 'potential') {
    if (a !== 'varInit') return;
    const g = uid(), f = F(); f.groups = f.groups || [];
    dropPoseOrphans(c.os.map(x => x.o.id)); // eski grupların kayıtlarından çıkar (ilk-gelen sahiplik)
    c.os.forEach(({ o }) => o.grp = g);
    const rec = { id: g, vars: [], idx: 0 };
    f.groups.push(rec);
    c = { type: 'group', rec };
  }
  const isRoom = c.type === 'room';
  const vars = isRoom ? (c.o.vars = c.o.vars || []) : (c.rec.vars = c.rec.vars || []);
  const idx = () => isRoom ? (c.o.vIdx ?? 0) : (c.rec.idx ?? 0);
  const setIdx = i => { if (isRoom) c.o.vIdx = i; else c.rec.idx = i; };
  const snap = () => isRoom ? roomPoses(c.o) : groupPoses(groupMemberIds(c.rec.id), c.rec.id);
  const pfx = vars.length ? (parseInt(vars[0].label) || 1) : nextVarPrefix();
  if (a === 'varInit') {
    if (vars.length) return;
    const s0 = snap();
    vars.push({ label: varLabel(0, pfx), poses: clonePoses(s0), base: clonePoses(s0) }); setIdx(0);
    toast(L(`Düzen ${vars[0].label} kaydedildi – yeniden düzenleyip ➕ Yeni ile ikinci düzeni ekleyin`, `Layout ${vars[0].label} saved – rearrange and press ➕ New to add another`));
  } else if (a === 'varSave') {
    if (!vars.length) return;
    const i = clamp(idx(), 0, vars.length - 1), s = snap();
    vars[i] = { label: vars[i].label, poses: clonePoses(s), base: clonePoses(s) };
    toast(L(`Düzen ${vars[i].label} güncellendi`, `Layout ${vars[i].label} updated`));
  } else if (a === 'varNew') {
    const curSnap = snap();
    if (vars.length) {
      const i = clamp(idx(), 0, vars.length - 1), curV = vars[i];
      const base = curV.base || curV.poses;
      if (curV.draft) {
        curV.poses = clonePoses(curSnap); curV.base = clonePoses(curSnap); delete curV.draft;
        const lbl = varLabel(vars.length, pfx);
        vars.push({ label: lbl, poses: clonePoses(curSnap), base: clonePoses(curSnap), draft: true });
        setIdx(vars.length - 1);
        toast(L(`Düzen ${lbl} eklendi – yeni konum/boyutu ayarlayın (otomatik kaydedilir)`, `Layout ${lbl} added – adjust position/size (auto-saved)`));
      } else if (!posesEqual(curSnap, base)) {
        curV.poses = clonePoses(base); curV.base = clonePoses(base);
        const lbl = varLabel(vars.length, pfx);
        vars.push({ label: lbl, poses: clonePoses(curSnap), base: clonePoses(curSnap) });
        setIdx(vars.length - 1);
        toast(L(`Düzen ${lbl} eklendi`, `Layout ${lbl} added`));
      } else {
        const lbl = varLabel(vars.length, pfx);
        vars.push({ label: lbl, poses: clonePoses(curSnap), base: clonePoses(curSnap), draft: true });
        setIdx(vars.length - 1);
        toast(L(`Düzen ${lbl} eklendi – yeni konum/boyutu ayarlayın (otomatik kaydedilir)`, `Layout ${lbl} added – adjust position/size (auto-saved)`));
      }
    } else {
      const lbl = varLabel(0, pfx);
      vars.push({ label: lbl, poses: clonePoses(curSnap), base: clonePoses(curSnap) });
      setIdx(0);
    }
  } else if (a === 'varGo' && targetIdx != null) {
    if (isRoom) switchRoomVarTo(c.o, targetIdx); else switchGroupVarTo(c.rec, targetIdx);
    return;
  } else if (a === 'varNext') {
    if (isRoom) cycleRoomVars(c.o); else cycleGroupVars(c.rec.id);
    return;
  } else if (a === 'varDel') {
    if (!vars.length) return;
    const i = clamp(idx(), 0, vars.length - 1);
    vars.splice(i, 1);
    vars.forEach((v, k) => v.label = varLabel(k, pfx));
    if (!vars.length) { if (isRoom) { delete c.o.vIdx; delete c.o.vars; } else { delete c.rec.idx; c.rec.vars = []; } }
    else {
      const ni = clamp(i, 0, vars.length - 1); setIdx(ni);
      _switchingVar = true;
      try { applyVarPoses(vars[ni].poses); } finally { _switchingVar = false; }
    }
  }
  _switchingVar = true;
  try { commit(); } finally { _switchingVar = false; }
  refresh(); renderProps();
  if (ui.view3d && T3) schedBuild3D();
}
function variantUIHtml() {
  const c = varContainer(); if (!c) return '';
  const vars = c.type === 'room' ? (c.o.vars || []) : c.type === 'group' ? (c.rec.vars || []) : [];
  if (!vars.length) return `<div class="row"><button class="btn sm primary" data-act="varInit">🔄 ${L('Ayarlanabilir Yap', 'Make Adjustable')}</button></div><p class="muted" style="margin:0 0 6px">${L('Mevcut düzeni 1a olarak kaydeder; sonraki düzenleri ➕ ile ekleyin, kanvasta tıklayarak geçin.', 'Saves the current layout as 1a; add more with ➕, cycle by clicking on canvas.')}</p>`;
  const idx = clamp(c.type === 'room' ? (c.o.vIdx ?? 0) : (c.rec.idx ?? 0), 0, vars.length - 1);
  const cur = vars[idx];
  const chips = vars.map((v, i) => `<button class="btn sm ${i === idx ? 'primary' : ''}" data-act="varGo" data-idx="${i}" title="${L('Bu düzene geç', 'Switch to this layout')}">${i === idx ? '● ' : '○ '}${esc(v.label)}</button>`).join('');
  return `<p style="margin:8px 0 4px"><b>🔄 ${L('Düzenler', 'Layouts')}</b> <span class="muted">— ${esc(cur.label)} (${idx + 1}/${vars.length})</span></p>
  <div class="row" style="flex-wrap:wrap;gap:4px;margin-bottom:6px">${chips}</div>
  <div class="row"><button class="btn sm" data-act="varSave" title="${L('Mevcut konumu/boyutu bu düzene kaydet', 'Save current position/size to this layout')}">💾 ${L('Kaydet', 'Save')}</button><button class="btn sm primary" data-act="varNew">➕ ${L('Yeni', 'New')}</button>${vars.length >= 2 ? `<button class="btn sm" data-act="varNext" title="${L('Sıradaki düzene geç', 'Cycle to next layout')}">↻</button>` : ''}<button class="btn sm" data-act="varDel" style="color:var(--danger)" title="${L('Bu düzeni sil', 'Delete this layout')}">🗑</button></div>
  <p class="muted" style="margin:4px 0 6px">${L('Aktif düzendeki konum ve boyut değişiklikleri otomatik kaydedilir. Tuvalde "👆 Tıkla" göstergesine tıklayarak düzenler arasında geçin.', 'Position & size changes in the active layout are auto-saved. Click the "👆 Click me" badge on canvas to cycle layouts.')}</p>`;
}
function copySel() { ui.clip = selObjs().map(({ kind, o }) => ({ kind, o: JSON.parse(JSON.stringify(o)) })); pasteN = 0; if (ui.clip.length) toast(ui.clip.length + L(' nesne kopyalandı', ' object(s) copied')); }
function paste(fromSel) {
  if (fromSel) copySel();
  const items = ui.clip; if (!items || !items.length) return;
  pasteN++; const off = 40 * pasteN, f = F(), idm = {}, gmap = {}, ids = [];
  const mv = p => ({ x: p.x + off, y: p.y + off });
  for (const { kind, o } of items) {
    if (kind === 'op') continue;
    const n = JSON.parse(JSON.stringify(o)); idm[n.id] = uid(); n.id = idm[n.id]; ids.push(n.id);
    if (n.grp) n.grp = gmap[n.grp] || (gmap[n.grp] = uid()); // yapıştırılan kopya yeni grubuna girer
    if (kind === 'wall') { n.a = mv(n.a); n.b = mv(n.b); f.walls.push(n); }
    else if (kind === 'dim') { n.a = mv(n.a); n.b = mv(n.b); f.dims.push(n); }
    else if (kind === 'room') { n.pts = n.pts.map(mv); delete n.vars; delete n.vIdx; f.rooms.push(n); }
    else if (kind === 'sketch') { n.pts = n.pts.map(mv); f.sketches.push(n); }
    else if (kind === 'furn') { n.x += off; n.y += off; f.furn.push(n); }
    else if (kind === 'text') { n.x += off; n.y += off; f.texts.push(n); }
  }
  for (const { kind, o } of items) if (kind === 'op' && idm[o.wall]) { const n = JSON.parse(JSON.stringify(o)); n.id = uid(); n.wall = idm[o.wall]; f.ops.push(n); ids.push(n.id); }
  sel = ids; commit(); refresh();
  if (ui.view3d && T3) schedBuild3D();
}

/* ---------- Klavye ---------- */
const keys3D = new Set();
window.addEventListener('blur', () => keys3D.clear());
window.addEventListener('keydown', e => {
  const tag = e.target.tagName, typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (ui.view3d) {
    if (e.key === 'Escape') { show3D(false); return; }
    if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { keys3D.add(k); e.preventDefault(); }
    return;
  }
  if (e.key === ' ') { ui.space = true; e.preventDefault(); return; }
  if (ctrl) {
    if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'c') copySel();
    else if (k === 'v') paste(false);
    else if (k === 'd') { e.preventDefault(); paste(true); }
    else if (k === 'g') { e.preventDefault(); e.shiftKey ? ungroupSel() : groupSel(); }
    else if (k === 'a') { e.preventDefault(); const f = F(); sel = []; for (const a in KINDS) f[a].forEach(o => sel.push(o.id)); refresh(); }
    else if (k === 's') { e.preventDefault(); saveBrowser(); }
    return;
  }
  if (tool === 'wall' && ui.draw) {
    if (/^[0-9.]$/.test(e.key)) { ui.typed += e.key; if (ui.lastE) setCursor(ui.lastE); drawPreview(); e.preventDefault(); return; }
    if (e.key === 'Backspace') { ui.typed = ui.typed.slice(0, -1); if (ui.lastE) setCursor(ui.lastE); drawPreview(); e.preventDefault(); return; }
    if (e.key === 'Enter') {
      if (ui.typed && ui.cur && dist(ui.draw.start, ui.cur) > 1) { F().walls.push(mkWall(ui.draw.start, ui.cur)); ui.draw = { start: { x: ui.cur.x, y: ui.cur.y } }; ui.typed = ''; commit(); render(); renderProps(); }
      else { ui.draw = null; ui.typed = ''; render(); }
      return;
    }
  }
  if (tool === 'poly' && e.key === 'Enter') { finishPoly(); return; }
  if (e.key === 'Escape') {
    if (ui.draw || ui.polyPts || ui.dimStart || ui.calib || ui.pen) { ui.draw = null; ui.polyPts = null; ui.dimStart = null; ui.calib = null; ui.pen = null; ui.typed = ''; render(); }
    else if (tool !== 'select') setTool('select'); else { sel = []; refresh(); }
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSel(); return; }
  if (tool === 'place' && placing) {
    if (k === 'r') { if (placing.type === 'furn') placing.rot = ((placing.rot || 0) + 90) % 360; else placing.flip = placing.flip ? 0 : 1; updateGhost(); drawPreview(); return; }
    if (k === 's' && placing.type === 'op') { placing.side = -(placing.side || 1); updateGhost(); drawPreview(); return; }
  }
  if (e.key === '[' || e.key === ']') {
    const d = e.key === ']' ? 15 : -15, os = selObjs(); let ch = false;
    if (os.length > 1) ch = rotateSelection(d, os);
    else os.forEach(({ kind, o }) => {
      if (kind === 'furn' || kind === 'text') { o.rot = ((o.rot || 0) + d + 360) % 360; ch = true; }
      else if (kind === 'wall') { setWallDeg(o, wallDeg(o) + d, true); ch = true; }
    });
    if (ch) { commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); }
    return;
  }
  if (e.key.startsWith('Arrow') && sel.length) {
    e.preventDefault(); const st = e.shiftKey ? 10 : 1; const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
    selObjs().forEach(({ kind, o }) => { if (kind === 'wall' || kind === 'dim') { o.a.x += dx; o.a.y += dy; o.b.x += dx; o.b.y += dy; } else if (kind === 'room' || kind === 'sketch') o.pts.forEach(p => { p.x += dx; p.y += dy; }); else if (kind === 'furn' || kind === 'text' || kind === 'bg') { o.x += dx; o.y += dy; } else if (kind === 'op') o.d += dx + dy; });
    commit(); render(); if (sel.includes('bg')) renderProps(); if (ui.view3d && T3) schedBuild3D(); return;
  }
  const map = { v: 'select', h: 'pan', w: 'wall', r: 'rect', o: 'room', p: 'poly', s: 'shape', d: 'door', n: 'window', f: 'furn', m: 'dim', t: 'text', e: 'eraser', c: 'calib', b: 'pen' };
  if (map[k]) { setTool(map[k]); return; }
  if (k === 'g') { $('#cSnap').click(); return; }
  if (k === '0') fit(); else if (k === '+' || k === '=') zoomBtn(1.25); else if (k === '-') zoomBtn(0.8);
});
window.addEventListener('keyup', e => { if (e.key === ' ') ui.space = false; keys3D.delete(e.key.toLowerCase()); });
function zoomBtn(f) { const s = svgSize(); zoomAt(f, s.w / 2, s.h / 2); }
$('#zIn').onclick = () => zoomBtn(1.25); $('#zOut').onclick = () => zoomBtn(0.8); $('#zFit').onclick = fit;

/* ---------- Modal ---------- */
function openModal(html, kind = null) { ui.modal = kind; $('#modal').innerHTML = html; $('#modalbg').style.display = 'flex'; }
function closeModal() { ui.modal = null; $('#modalbg').style.display = 'none'; }
$('#modalbg').addEventListener('mousedown', e => { if (e.target.id === 'modalbg') closeModal(); });
$('#modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
/* ---------- AI (MCP) help: copy-ready prompt for the user's agent ---------- */
function copyText(text) {
  const fallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  };
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => true, fallback);
    }
  } catch (e) { }
  return Promise.resolve(fallback());
}
function aiSetupPrompt() {
  return isEN()
    ? 'Set up live editing for my floor planner so you can change my plan directly:\n1. In the project folder, run "node mcp/bridge.js" in the background and keep it running — do not close it.\n2. Tell me when it is running; my floor planner page (https://mewego.github.io/floorplanner/ or the local copy) connects to it automatically.\n3. Then call pull_from_browser to read my current plan. Apply every change with push_to_browser — it appears in my open tab and is saved automatically. Read anything I type in the app panel with get_user_requests (ack them with ack_user_requests).'
    : 'Kat planımı doğrudan düzenleyebilmen için canlı köprüyü kur:\n1. Proje klasöründe "node mcp/bridge.js" komutunu arka planda çalıştır ve açık bırak — kapatma.\n2. Çalıştığını bana söyle; kat planı sayfam (https://mewego.github.io/floorplanner/ veya yerel kopya) ona kendiliğinden bağlanır.\n3. Sonra pull_from_browser ile güncel planımı oku. Her değişikliği push_to_browser ile uygula — açık sekmemde görünür ve otomatik kaydedilir. Uygulama panelinde yazdıklarımı get_user_requests ile oku (işleyince ack_user_requests ile kapat).';
}
function helpModal() {
  const rows = isEN() ? [
    ['V / H', 'Select / Pan (hold Space for temporary pan)'],
    ['W', 'Draw wall (type number + Enter: exact length in cm)'],
    ['R', 'Rect room (draws 4 walls + room)'],
    ['O', 'Auto-detect room inside enclosed walls'],
    ['P', 'Draw custom polygon room'],
    ['S', 'Shapes: triangle / quad / N-gon / ellipse / freeform — draw as wall outlines or name & save as custom library items'],
    ['D / N', 'Place Door / Window'],
    ['F', 'Open Furniture library'],
    ['M', 'Add Dimension line'],
    ['T', 'Add Text label'],
    ['B', 'Pen: freehand sketch on the plan (drag to draw, release to finish)'],
    ['E', 'Eraser (click object to delete)'],
    ['C', 'Calibrate background image scale'],
    ['G', 'Toggle grid & endpoint snap'],
    ['Shift', 'Hold to disable snap • multi-select in Select mode'],
    ['[ ]', 'Rotate selection by 15° (multi-selections turn as one rigid layout)'],
    ['R (while placing)', 'Rotate furniture 90° / flip door hinge'],
    ['S (while placing)', 'Flip door swing direction'],
    ['Arrow keys', 'Nudge selection / background image by 1 cm (Shift: 10 cm)'],
    ['WASD / Q / E (3D)', 'Walk around in 3D view (Q/E: down/up, Shift: faster)'],
    ['3D: click / drag furniture', 'Select & highlight • drag to move on the floor (Shift: no grid snap) • resize via the side panel'],
    ['Wall type: Curtain Wall', 'Select a wall → Wall Type → 🪟 Curtain Wall: glass facade with aluminum frame in 2D & 3D'],
    ['3D: Floor selector', 'Menu at the top-left of the 3D view — show all floors stacked, or isolate one floor at ground level'],
    ['Ctrl+C/V/D', 'Copy / Paste / Duplicate'],
    ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'],
    ['Ctrl+A', 'Select all on current floor'],
    ['Ctrl+S', 'Save project to browser (IndexedDB)'],
    ['Del', 'Delete selected objects'],
    ['0 / + / −', 'Fit to screen / Zoom in / Zoom out'],
    ['Double-click', 'Rename room or edit text'],
    ['Click door', 'Open / close door (90°)'],
    ['Click room / group', 'Cycle saved layouts (1a → 1b → 1c)'],
    ['Alt + drag wall', 'Move wall without pulling connected walls'],
    ['Drag a room', 'Room + furniture & texts inside move together (single room)'],
    ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup selected objects'],
  ] : [
    ['V / H', 'Seç / Kaydır (Boşluk basılı: geçici kaydır)'],
    ['W', 'Duvar çiz (rakam + Enter: tam uzunluk)'],
    ['R', 'Oda (dikdörtgen duvar)'],
    ['O', 'Kapalı alandan oda algıla'],
    ['P', 'Çokgen oda çiz'],
    ['S', 'Şekiller: üçgen / dörtgen / N-gen / elips / serbest — duvar silüesi çizer ya da adlandırıp kütüphaneye kaydeder'],
    ['D / N', 'Kapı / Pencere'],
    ['F', 'Mobilya kütüphanesi'],
    ['M', 'Ölçü ekle'],
    ['T', 'Metin'],
    ['B', 'Kalem: plana serbest elle çizim (sürükle, bırak tamamlar)'],
    ['E', 'Sil'],
    ['C', 'Arka plan ölçekle'],
    ['G', 'Yakalamayı aç/kapa'],
    ['Shift', 'Basılıyken yakalama kapalı • seçimde çoklu seçim'],
    ['[ ]', 'Seçimi 15° döndür (çoklu seçimler tek parça düzen olarak döner)'],
    ['R (yerleştirirken)', 'Mobilyayı döndür / kapı menteşesini çevir'],
    ['S (yerleştirirken)', 'Kapı açılış yönünü çevir'],
    ['Ok tuşları', 'Seçileni / arka plan görselini 1 cm kaydır (Shift: 10 cm)'],
    ['WASD / Q / E (3B)', '3B görünümde gezin (Q/E: alçal/yüksel, Shift: hızlı)'],
    ['3B: mobilyaya tıkla / sürükle', 'Seç & vurgula • zeminde sürükle (Shift: ızgara yok) • boyutu sağ panelden değiştir'],
    ['Duvar tipi: Cam Cephe', 'Duvar seç → Duvar Tipi → 🪟 Cam Cephe: 2B ve 3B içinde alüminyum çerçeveli cam cephe'],
    ['3B: Kat seçici', '3B görünümün sol üstündeki menü — tüm katlar üst üste ya da tek kat yer seviyesinde'],
    ['Ctrl+C/V/D', 'Kopyala / Yapıştır / Çoğalt'],
    ['Ctrl+Z / Ctrl+Y', 'Geri al / Yinele'],
    ['Ctrl+A', 'Tümünü seç'],
    ['Ctrl+S', 'Tarayıcıya kaydet'],
    ['Del', 'Sil'],
    ['0 / + / −', 'Sığdır / Yakınlaştır / Uzaklaştır'],
    ['Çift tık', 'Oda / metin adını düzenle'],
    ['Kapıya tıkla', 'Kapıyı aç / kapat (90°)'],
    ['Oda / gruba tıkla', 'Kayıtlı düzenler arasında geç (1a → 1b → 1c)'],
    ['Alt + duvar sürükle', 'Bitişik duvarları çekmeden taşı'],
    ['Odayı sürükle', 'Oda + içindeki mobilya ve metinler birlikte taşınır (tek oda)'],
    ['Ctrl+G / Ctrl+Shift+G', 'Seçili nesneleri grupla / çöz'],
  ];
  const aiBlock = `<h3 style="margin:0 0 6px">${L('🤖 AI ile düzenleme', '🤖 Edit with AI')}</h3>
  <p class="muted" style="margin:0 0 8px">${L(
    'Yapay zekâ aracınız (OpenCode, Claude Desktop, Cursor…) planı doğrudan düzenleyebilir. Aşağıdaki istemi yapıştırın — köprüyü kendisi başlatır, bu sayfa da ona otomatik bağlanır. Sonra soldaki <b>AI</b> düğmesinden istek yazmanız yeterli.',
    'Your AI agent (OpenCode, Claude Desktop, Cursor…) can edit the plan directly. Paste the prompt below — it starts the bridge and this page connects to it automatically. After that, just type requests in the <b>AI</b> panel (bottom-left).'
  )}</p>
  <pre id="aiPromptText" style="margin:0 0 8px;padding:10px 12px;background:var(--panel2);border:1px solid var(--line);border-radius:4px;font:11.5px/1.55 var(--font-mono);white-space:pre-wrap;user-select:text">${esc(aiSetupPrompt())}</pre>
  <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 8px">
    <button class="btn sm" data-ai-prompt>${L('📋 Ajan istemini kopyala', '📋 Copy agent prompt')}</button>
    <span class="muted" id="aiPromptState"></span>
  </div>
  <p class="muted" style="margin:0 0 14px;opacity:.75">${L(
    'Bu yol ajan tarafında Node.js ve proje klasörünü gerektirir; planınız yine bu sekmede (kendi depolama alanınızda) kalır.',
    'This needs Node.js and the project folder on the agent side; your plan still stays in this tab (in your own storage).'
  )}</p>`;
  openModal(`<h2>${L('Kısayollar & İpuçları', 'Shortcuts & Tips')} <button class="btn sm" data-close>✕</button></h2>
  ${aiBlock}
  <h3 style="margin:22px 0 8px">${L('Klavye kısayolları', 'Keyboard shortcuts')}</h3>
  <table class="kb">${rows.map(r => `<tr><td><kbd>${r[0]}</kbd></td><td>${r[1]}</td></tr>`).join('')}</table>
  <p class="muted">${L(
    'İpucu: Hızlı başlamak için <b>R</b> ile bir oda çiz, <b>D</b>/<b>N</b> ile kapı pencere ekle, <b>F</b> ile mobilyaları yerleştir. Mobilyalar duvara yaklaşınca otomatik yapışır ve döner. Üstteki <b>3B</b> düğmesi planı üç boyutlu gösterir.',
    'Tip: Press <b>R</b> to draw a rectangular room, <b>D</b>/<b>N</b> to add doors and windows, and <b>F</b> to place furniture. Furniture automatically snaps and aligns to nearby walls. Click <b>3D</b> in the top bar for an interactive 3D preview.'
  )}</p>`, 'help');
  const aiBtn = document.querySelector('#modal [data-ai-prompt]');
  if (aiBtn) aiBtn.onclick = async () => {
    const ok = await copyText(aiSetupPrompt());
    const st = document.getElementById('aiPromptState');
    if (st) st.textContent = ok
      ? L('Kopyalandı — aracınıza yapıştırın ✓', 'Copied — paste it into your agent ✓')
      : L('Kopyalanamadı — metni seçip elle kopyalayın', 'Copy failed — select the text and copy it manually');
  };
}
/* ---------- AI: live editing (agent drives the plan through mcp/bridge.js) ---------- */
function aiModal() {
  openModal(`<h2>${L('🤖 AI ile düzenle', '🤖 Edit with AI')} <button class="btn sm" data-close>✕</button></h2>
  <p class="muted" id="aiLiveState" style="margin:0 0 10px"></p>
  <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 10px">
    <button class="btn" id="aiLivePrompt">${L('📋 Ajan istemini kopyala', '📋 Copy agent prompt')}</button>
    <button class="btn" id="aiLiveRetry">${L('🔌 Bağlanmayı dene', '🔌 Try to connect')}</button>
    <span class="muted" id="aiLiveState2"></span>
  </div>
  <pre id="aiLivePromptText" style="display:none;margin:0 0 12px;padding:10px 12px;background:var(--panel2);border:1px solid var(--line);border-radius:4px;font:11.5px/1.55 var(--font-mono);white-space:pre-wrap;max-height:160px;overflow:auto">${esc(aiSetupPrompt())}</pre>
  <p class="muted" style="margin:0 0 8px">${L(
    'İstemi yapay zekâ aracınıza yapıştırın; köprüyü kendisi başlatır ve bu sayfa ona otomatik bağlanır. Sonra soldaki AI düğmesinden istek yazabilir veya doğrudan sohbette söyleyebilirsiniz — değişiklikler bu planda anında görünür ve otomatik kaydedilir.',
    'Paste the prompt into your AI agent; it starts the bridge and this page connects automatically. After that, type requests in the AI panel (bottom-left) or just tell the agent in chat — changes appear in this plan immediately and are saved automatically.'
  )}</p>
  <p class="muted" style="margin:0">${L(
    'Canlı bağlantı Node.js ve proje klasörünü gerektirir (ajan tarafında). Planınız bu sekmede kalır; köprü yalnızca JSON alışverişi yapar.',
    'Live editing needs Node.js and the project folder on the agent side. Your plan stays in this tab; the bridge only exchanges JSON.'
  )}</p>`, 'ai');

  const setState = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };

  $('#aiLivePrompt').onclick = async () => {
    const ok = await copyText(aiSetupPrompt());
    const pre = $('#aiLivePromptText');
    if (pre) pre.style.display = ok ? 'none' : 'block';
    setState('aiLiveState2', ok
      ? L('Kopyalandı ✓ — ajanınıza yapıştırın', 'Copied ✓ — paste it into your agent')
      : L('Kopyalanamadı — metni seçip elle kopyalayın', 'Copy failed — select the text below'));
  };
  $('#aiLiveRetry').onclick = async () => {
    $('#aiLiveRetry').disabled = true;
    const ok = await brgConnect();
    $('#aiLiveRetry').disabled = false;
    if (!ok) setState('aiLiveState2', L('Bağlanamadı — köprü çalışmıyor ya da tarayıcı izin istedi.', 'Could not connect — bridge not running, or the browser needs permission.'));
    else { setState('aiLiveState2', ''); brgInitialSync(); }
    aiSyncLiveRow();
  };
  aiSyncLiveRow();
}
/* ---------- AI köprüsü istemcisi / AI bridge client ----------
   Makes the app itself talk to the local bridge (mcp/bridge.js), so the page on
   GitHub Pages (or file://) can be edited live by an agent — no localhost URL:
     - probes http://127.0.0.1:8787, connects over SSE when the agent started it
     - applies pushed plans via loadProject() → autosave stores them in this origin
     - mirrors local edits back, so the agent can pull the user's latest work
     - floating AI pill + request queue (get_user_requests)
   ------------------------------------------------------------------------- */
const BRIDGE_BASE = 'http://127.0.0.1:8787';
const BRIDGE_SEEN = 'fp_bridge_rev';
const bridgeTab = Math.random().toString(36).slice(2) + Date.now().toString(36);
let brgRev = 0, brgConnected = false, brgHydrated = false, brgApplying = false;
let brgPushTimer = null, brgProbeTimer = null, brgEs = null;

function brgUrl(p) { return BRIDGE_BASE + p; }

async function brgFetch(p, opt, ms) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const t = ctl ? setTimeout(() => ctl.abort(), ms || 2500) : null;
  try {
    return await fetch(brgUrl(p), Object.assign({ cache: 'no-store' }, opt || {}, ctl ? { signal: ctl.signal } : {}));
  } finally { if (t) clearTimeout(t); }
}

function brgSchedulePush() {
  clearTimeout(brgPushTimer);
  brgPushTimer = setTimeout(brgPush, 700);
}

async function brgPush() {
  if (brgApplying || !brgHydrated || typeof P === 'undefined' || !P) return;
  try {
    const res = await brgFetch('/__plan.json', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: P, tab: bridgeTab }),
    }, 8000);
    if (!res.ok) return;
    const j = await res.json();
    if (j && j.rev) { brgRev = j.rev; localStorage.setItem(BRIDGE_SEEN, String(brgRev)); brgTick(); }
  } catch (e) { /* offline — stay quiet */ }
}

function brgApply(remotePlan, newRev) {
  if (!remotePlan || !remotePlan.floors) return;
  brgApplying = true;
  try { loadProject(remotePlan); }
  catch (e) { console.warn('[ai-bridge] could not apply plan', e); }
  if (newRev) { brgRev = newRev; localStorage.setItem(BRIDGE_SEEN, String(brgRev)); }
  // the agent's plan replaces whatever the starter-screen offered
  try { if (ui.modal === 'templates' || ui.modal === 'help' || ui.modal === 'projects') closeModal(); } catch (e) { }
  if (ui.view3d && typeof schedBuild3D === 'function') schedBuild3D();
  setTimeout(() => { brgApplying = false; }, 700);
  toast(L('🤖 AI planı uygulandı', '🤖 AI plan applied'));
  brgTick();
}

async function brgInitialSync() {
  if (brgHydrated) return;
  let j = null;
  try {
    const res = await brgFetch('/__plan.json');
    if (res.ok) j = await res.json();
  } catch (e) { return; }                    // bridge not running
  const seenRaw = localStorage.getItem(BRIDGE_SEEN);
  const seen = seenRaw === null ? null : Number(seenRaw);
  brgRev = (j && j.rev) || 0;
  brgHydrated = true;

  const hasRemote = !!(j && j.plan && j.plan.floors);
  // A brand-new browser (no record of ever syncing) should adopt the agent's
  // plan, but never throw away real local work.
  const pristine = !P || !P.floors || !P.floors.some(f => (f.walls || []).length);
  if (hasRemote && (seen === null ? pristine : brgRev > seen)) {
    brgApply(j.plan, brgRev);                // came from the agent
  } else if (hasRemote && seen === brgRev) {
    localStorage.setItem(BRIDGE_SEEN, String(brgRev));   // already in sync, nothing to do
  } else {
    localStorage.setItem(BRIDGE_SEEN, String(brgRev));
    brgPush();                               // our plan is the newest — share it
  }
  brgTick();
}

async function brgSync() {
  let j = null;
  try {
    const res = await brgFetch('/__plan.json');
    if (!res.ok) return;
    j = await res.json();
  } catch (e) { return; }
  if (!j || !j.plan) { brgPush(); return; }
  if ((j.rev || 0) > brgRev) brgApply(j.plan, j.rev);
  else { brgRev = j.rev || brgRev; localStorage.setItem(BRIDGE_SEEN, String(brgRev)); brgTick(); }
}

/* --- connection lifecycle --- */
async function brgConnect() {
  if (brgEs) return true;
  try {
    const res = await brgFetch('/health');
    if (!res.ok) return false;
  } catch (e) { return false; }
  try {
    const es = new EventSource(brgUrl('/__events') + '?tab=' + encodeURIComponent(bridgeTab));
    brgEs = es;
    es.addEventListener('plan', ev => {
      try {
        const msg = JSON.parse(ev.data);
        if (!msg || msg.tab === bridgeTab) return;
        if (!brgHydrated) return;                 // initial sync catches up
        if (!msg.plan || !msg.plan.floors) return;
        if (msg.rev && msg.rev <= brgRev) return;
        brgApply(msg.plan, msg.rev);
      } catch (e) { }
    });
    es.addEventListener('requests-changed', () => { if (brgPanelOpen()) aiRefreshRequests(); });
    es.onopen = () => {
      brgSetConnected(true);
      if (!brgHydrated) brgInitialSync(); else brgSync();
    };
    es.onerror = () => { brgSetConnected(false); };
  } catch (e) { return false; }
  brgSetConnected(true);
  return true;
}

function brgDisconnect() {
  if (brgEs) { try { brgEs.close(); } catch (e) { } brgEs = null; }
  brgSetConnected(false);
}

/* probe once on boot and then keep looking while the app stays open */
function brgProbe() {
  brgConnect().then(ok => {
    if (ok) { brgStopProbe(); return; }
    if (!brgProbeTimer && !brgEs) brgProbeTimer = setInterval(async () => {
      if (await brgConnect()) brgStopProbe();
    }, 10000);
  });
}
function brgStopProbe() { clearInterval(brgProbeTimer); brgProbeTimer = null; }

/* mirror local edits to the bridge (debounced) — the agent's pull_from_browser sees them */
const aiOrigAutosave = autosave;
autosave = function () {
  const r = aiOrigAutosave.apply(this, arguments);
  if (!brgApplying && brgHydrated) brgSchedulePush();
  return r;
};

function brgSetConnected(ok) {
  brgConnected = !!ok;
  if (!ok && brgEs) { try { brgEs.close(); } catch (e) { } brgEs = null; }
  if (brgConnected && !aiBridgePill()) aiBridgeBuild();
  if (aiBridgePill()) aiBridgePaint();
  aiSyncLiveRow();
}

/* ---------- AI pill + request panel (DOM) ---------- */
const AI_PILL_ID = 'aiBridgePill';
const aiBridgePill = () => document.getElementById(AI_PILL_ID);
const brgPanelOpen = () => { const p = document.getElementById('aiBridgePanel'); return !!p && p.style.display !== 'none'; };

function aiIsLight() { return document.documentElement.dataset.theme === 'light'; }
function aiPal() {
  return aiIsLight()
    ? { bg: '#ffffff', fg: '#1e293b', sub: '#64748b', bd: '#d6dbe3', ok: '#16a34a', off: '#94a3b8' }
    : { bg: '#1b2027', fg: '#e5e9f0', sub: '#94a3b8', bd: '#333b47', ok: '#4ade80', off: '#64748b' };
}

function aiBridgeBuild() {
  if (aiBridgePill()) return;
  const host = document.createElement('div');
  host.id = 'aiBridgeHost';
  host.style.cssText = 'position:fixed;left:64px;bottom:64px;z-index:95;font:12px/1.45 "Plus Jakarta Sans",system-ui,sans-serif';

  const panel = document.createElement('div');
  panel.id = 'aiBridgePanel';
  panel.style.cssText = 'display:none;position:absolute;left:0;bottom:calc(100% + 8px);width:320px;max-height:min(70vh,520px);overflow:auto;border-radius:12px;padding:10px;box-shadow:0 12px 34px rgba(0,0,0,.34)';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <b>${L('AI köprüsü', 'AI bridge')}</b>
      <button type="button" data-ai-close style="margin-left:auto;border:0;background:transparent;color:inherit;cursor:pointer;font:inherit;opacity:.6">✕</button>
    </div>
    <div data-ai-status style="font-weight:600;margin-bottom:2px"></div>
    <div data-ai-detail style="font-size:11px;opacity:.75;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"></div>
    <div style="font-weight:600;font-size:11px;margin:0 0 4px">${L('Bekleyen istekler', 'Pending requests')}</div>
    <div data-ai-reqs style="max-height:110px;overflow:auto;margin-bottom:8px;font-size:11.5px"></div>
    <div style="display:flex;gap:6px">
      <input data-ai-input placeholder="${L('AI isteği yazın…', 'Ask the AI…')}" maxlength="2000"
        style="flex:1;min-width:0;border-radius:8px;padding:6px 8px;font:inherit;outline:none">
      <button type="button" data-ai-send style="border:0;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit;font-weight:700">${L('Gönder', 'Send')}</button>
    </div>
    <div data-ai-sendstate style="font-size:10.5px;opacity:.65;margin-top:6px">${L('Aracı: get_user_requests', 'Agent tool: get_user_requests')}</div>`;
  host.appendChild(panel);

  const pill = document.createElement('button');
  pill.type = 'button';
  pill.id = AI_PILL_ID;
  pill.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;cursor:pointer;font:inherit;box-shadow:0 4px 14px rgba(0,0,0,.28)';
  pill.innerHTML = '<span data-ai-dot style="width:8px;height:8px;border-radius:50%;flex:0 0 auto"></span>'
    + '<span style="font-weight:700;letter-spacing:.3px">AI</span>'
    + '<span data-ai-rev style="opacity:.6;font-variant-numeric:tabular-nums"></span>';
  host.appendChild(pill);
  document.body.appendChild(host);

  pill.onclick = () => {
    const open = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    if (open) { aiRefreshRequests(); aiRefreshDetail(); }
  };
  panel.querySelector('[data-ai-close]').onclick = () => { panel.style.display = 'none'; };
  panel.querySelector('[data-ai-send]').onclick = () => aiSendRequest();
  panel.querySelector('[data-ai-input]').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); aiSendRequest(); }
  });
  aiBridgePaint();
  brgTick();
  if (typeof MutationObserver === 'function') {
    new MutationObserver(aiBridgePaint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }
  placeAiPill();
  window.addEventListener('resize', placeAiPill);
}

function placeAiPill() {
  const host = document.getElementById('aiBridgeHost');
  if (!host) return;
  let h = 54;
  const f = document.querySelector('footer');
  if (f) {
    const r = f.getBoundingClientRect();
    if (r.height > 0 && r.height < innerHeight * 0.6) h = Math.round(r.height);
  }
  host.style.bottom = (h + 10) + 'px';
  const panel = document.getElementById('aiBridgePanel');
  if (panel) panel.style.maxHeight = Math.max(180, Math.round(host.getBoundingClientRect().top - 16)) + 'px';
}

function aiBridgePaint() {
  const host = document.getElementById('aiBridgeHost');
  if (!host) return;
  const c = aiPal();
  const pill = aiBridgePill();
  const panel = document.getElementById('aiBridgePanel');
  host.style.color = c.fg;
  pill.style.background = c.bg;
  pill.style.border = '1px solid ' + c.bd;
  pill.style.color = c.fg;
  pill.querySelector('[data-ai-dot]').style.background = brgConnected ? c.ok : c.off;
  pill.title = brgConnected
    ? L('AI köprüsü bağlı — tıklayarak istek gönderin', 'AI bridge connected — click to send a request')
    : L('AI köprüsü kapalı', 'AI bridge offline');
  panel.style.background = c.bg;
  panel.style.border = '1px solid ' + c.bd;
  panel.style.color = c.fg;
  const inp = panel.querySelector('[data-ai-input]');
  if (inp) { inp.style.background = aiIsLight() ? '#f8fafc' : '#232a33'; inp.style.border = '1px solid ' + c.bd; inp.style.color = c.fg; }
  const send = panel.querySelector('[data-ai-send]');
  if (send) { send.style.background = aiIsLight() ? '#2563eb' : '#7aa2ff'; send.style.color = aiIsLight() ? '#fff' : '#0b1220'; }
  const det = panel.querySelector('[data-ai-detail]');
  if (det) det.style.color = c.sub;
  const ss = panel.querySelector('[data-ai-sendstate]');
  if (ss) ss.style.color = c.sub;
  aiSyncStatusText();
}

function brgTick() {
  const pill = aiBridgePill();
  if (!pill) return;
  const rv = pill.querySelector('[data-ai-rev]');
  if (rv) rv.textContent = brgRev ? ' · rev ' + brgRev : '';
  aiBridgePaint();
}

function aiSyncStatusText() {
  const panel = document.getElementById('aiBridgePanel');
  if (!panel) return;
  const st = panel.querySelector('[data-ai-status]');
  if (!st) return;
  st.textContent = brgConnected
    ? L('Bağlı — AI planı canlı düzenleyebilir', 'Connected — the AI can edit live')
    : L('Bağlı değil — aracınız köprüyü başlatsın', 'Not connected — have your agent start the bridge');
}

async function aiRefreshDetail() {
  const panel = document.getElementById('aiBridgePanel');
  if (!panel) return;
  const det = panel.querySelector('[data-ai-detail]');
  if (!det) return;
  try {
    const j = await (await brgFetch('/health', null, 2000)).json();
    det.textContent = (j.planName ? '"' + j.planName + '" · ' : '')
      + L('rev', 'rev') + ' ' + j.rev + ' · ' + j.clients + L(' sekme', ' tab(s)');
  } catch (e) { det.textContent = BRIDGE_BASE; }
}

async function aiRefreshRequests() {
  const panel = document.getElementById('aiBridgePanel');
  if (!panel) return;
  const box = panel.querySelector('[data-ai-reqs]');
  if (!box) return;
  let list = [];
  try { list = (await (await brgFetch('/__requests', null, 2000)).json()).requests || []; } catch (e) { }
  const c = aiPal();
  box.innerHTML = '';
  if (!list.length) {
    box.innerHTML = '<div style="padding:6px 2px;opacity:.65">' + L('Bekleyen istek yok', 'No pending requests') + '</div>';
    return;
  }
  for (const r of list) {
    const row = document.createElement('div');
    row.style.cssText = 'padding:5px 2px;border-bottom:1px dashed ' + c.bd;
    const d = new Date(r.at);
    const when = document.createElement('span');
    when.textContent = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + '  ';
    when.style.cssText = 'opacity:.55';
    const txt = document.createElement('span');
    txt.textContent = r.text;
    row.append(when, txt);
    box.appendChild(row);
  }
}

async function aiSendRequest() {
  const panel = document.getElementById('aiBridgePanel');
  if (!panel) return;
  const inp = panel.querySelector('[data-ai-input]');
  const st = panel.querySelector('[data-ai-sendstate]');
  const text = (inp.value || '').trim();
  if (!text) return;
  try {
    const res = await brgFetch('/__requests', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    }, 5000);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    inp.value = '';
    st.textContent = L('Gönderildi ✓ — aracınıza "uygulamadaki istekleri kontrol et" deyin',
      'Sent ✓ — ask your agent to check the app requests');
    setTimeout(() => { st.textContent = L('Aracı: get_user_requests', 'Agent tool: get_user_requests'); }, 5000);
    aiRefreshRequests();
  } catch (e) {
    st.textContent = L('Gönderilemedi — köprü kapalı', 'Could not send — bridge offline');
  }
}

/* boot: try once now, then keep probing in the background while the app is open */
function aiBridgeBoot() { brgProbe(); }

/* status row inside the AI modal (updated live) */
function aiSyncLiveRow() {
  const el = document.getElementById('aiLiveState');
  if (!el) return;
  el.textContent = brgConnected
    ? L('Bağlı ✓ — ajanınız planı doğrudan düzenleyebilir (değişiklikler otomatik kaydedilir).',
      'Connected ✓ — your agent can edit the plan directly (changes save automatically).')
    : L('Bağlı değil. Ajanınıza aşağıdaki istemi verin; köprüyü başlattığında bu sayfa kendiliğinden bağlanır.',
      'Not connected. Give your agent the prompt below; once it starts the bridge this page connects by itself.');
  const btn = document.getElementById('aiLiveRetry');
  if (btn) btn.style.display = brgConnected ? 'none' : '';
}

function projectThumbSvg(proj) {
  const sv = P, sf = fi, z = view.z, sd = ui.dims;
  P = proj; fi = 0; ui.dims = false; view.z = 0.5;
  try {
    const f = proj.floors[0]; if (!f) return '<svg viewBox="0 0 100 60"></svg>';
    const b = contentBounds(f) || { x0: 0, y0: 0, x1: 1000, y1: 700 };
    const LS = layerStrings(f, false);
    return `<svg viewBox="${b.x0 - 30} ${b.y0 - 30} ${Math.max(100, b.x1 - b.x0 + 60)} ${Math.max(100, b.y1 - b.y0 + 60)}"><defs>${defsSvg()}</defs>${LS.rooms}${LS.walls}${LS.ops}${LS.furn}${LS.roomLabels}</svg>`;
  } catch (e) { return '<svg viewBox="0 0 100 60"></svg>'; }
  finally { P = sv; fi = sf; view.z = z; ui.dims = sd; }
}
async function saveBrowser() {
  try {
    const defName = L('Yeni Proje', 'New Project');
    const name = (P.name || defName).trim() || defName;
    P.name = name; $('#pname').value = name;
    await dbPut('projects', { name, updatedAt: Date.now(), project: JSON.parse(JSON.stringify(P)) });
    toast(isEN() ? `“${name}” saved to browser (IndexedDB)` : `“${name}” tarayıcıya (IndexedDB) kaydedildi`);
  } catch (e) { toast(L('Kaydedilemedi: ', 'Save failed: ') + e.message); }
}
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const fname = ext => (P.name || 'plan').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_') + '.' + ext;
function downloadJson(proj = P) { download(fname('json'), new Blob([JSON.stringify(proj, null, 2)], { type: 'application/json' })); }
async function projectsModal() {
  let list = [];
  try { list = await dbGetAll('projects'); list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); } catch (e) { }
  const loc = isEN() ? 'en-US' : 'tr-TR';
  openModal(`<h2>📁 ${L('Projelerim', 'My Projects')} <span class="muted" style="font-size:12px;font-weight:400">(IndexedDB + JSON)</span> <button class="btn sm" data-close>✕</button></h2>
  <div class="row">
    <button class="btn primary" id="mSave">💾 ${L('Aktif projeyi kaydet', 'Save active project')} (“${esc(P.name)}”)</button>
    <button class="btn" id="mJson">⬇ ${L('JSON indir', 'Download JSON')}</button>
    <button class="btn" id="mOpenF">📂 ${L('JSON dosyası aç', 'Open JSON file')}</button>
  </div>
  <h4 class="muted" style="margin:12px 0 8px">${L('Tarayıcıda kayıtlı projeler', 'Projects saved in browser')} (${list.length})</h4>
  ${list.length ? `<div class="cards">${list.map((it, idx) => {
    const pr = it.project, dt = it.updatedAt ? new Date(it.updatedAt).toLocaleString(loc, { dateStyle: 'short', timeStyle: 'short' }) : '';
    const area = (pr.floors || []).reduce((s, fl) => s + (fl.rooms || []).reduce((a, r) => a + polyArea(r.pts), 0), 0);
    return `<div class="card" style="cursor:default">
      <div data-open="${idx}" style="cursor:pointer" title="${L('Açmak için tıkla', 'Click to open')}">${projectThumbSvg(pr)}</div>
      <b>${esc(it.name)}</b>
      <div class="muted" style="font-size:11px;margin-bottom:6px">${pr.floors.length} ${L('kat', 'floor(s)')} • ${fmtArea(area)}${dt ? ' • ' + dt : ''}</div>
      <div class="row" style="margin:0">
        <button class="btn sm primary" data-open="${idx}">${L('Aç', 'Open')}</button>
        <button class="btn sm" data-dl="${idx}" title="${L('JSON olarak indir', 'Download as JSON')}">⬇ JSON</button>
        <button class="btn sm" data-rm="${idx}" style="color:var(--danger)">🗑 ${L('Sil', 'Delete')}</button>
      </div>
    </div>`;
  }).join('')}</div>` : `<p class="muted">${L('Henüz kayıtlı proje yok. Üstteki <b>💾 Kaydet</b> düğmesiyle projelerinizi buraya ekleyebilirsiniz.', 'No saved projects yet. Use the <b>💾 Save</b> button in the top bar to save projects here.')}</p>`}`, 'projects');
  $('#mSave').onclick = async () => { await saveBrowser(); projectsModal(); };
  $('#mJson').onclick = () => downloadJson(P);
  $('#mOpenF').onclick = () => $('#fileOpen').click();
  $('#modal').querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
    const it = list[+b.dataset.open];
    if (it) { loadProject(JSON.parse(JSON.stringify(it.project)), isEN() ? `Opened “${it.name}”` : `“${it.name}” açıldı`); closeModal(); }
  });
  $('#modal').querySelectorAll('[data-dl]').forEach(b => b.onclick = () => {
    const it = list[+b.dataset.dl];
    if (it) { const n = (it.name || 'plan').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_') + '.json'; download(n, new Blob([JSON.stringify(it.project, null, 2)], { type: 'application/json' })); }
  });
  $('#modal').querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
    const it = list[+b.dataset.rm];
    if (it && confirm(isEN() ? `Delete “${it.name}”?` : `“${it.name}” silinsin mi?`)) { await dbDel('projects', it.name); projectsModal(); }
  });
}

/* ---------- Şablonlar ---------- */
function tplCtx() {
  const f = F();
  return {
    W: (x1, y1, x2, y2) => { const w = mkWall({ x: x1, y: y1 }, { x: x2, y: y2 }); f.walls.push(w); return w; },
    rect: addRectWalls,
    op: (w, d, id, extra) => { const o = mkOp(OPDEF[id], w, d); Object.assign(o, extra || {}); f.ops.push(o); },
    fu: (id, x, y, rot = 0, label) => { const o = mkFurn(BYID[id], x, y, rot); if (label) o.label = label; f.furn.push(o); },
    room: (x, y, name, color, fl) => { const r = autoRoomAt({ x, y }, true); if (r) { r.name = name; if (color) r.color = color; r.floor = fl || 'none'; } },
  };
}
const TEMPLATES = [
  { name: 'Boş proje', en: 'Blank project', desc: 'Sıfırdan başla', descEn: 'Start from scratch', build() { } },
  {
    name: 'Stüdyo 1+0 (≈ 33 m²)', en: 'Studio 1+0 (≈ 33 m²)', desc: '7 × 5 m, banyo, mutfak köşesi', descEn: '7 × 5 m, bathroom, kitchenette', build() {
      const c = tplCtx(), [top, , bottom, left] = c.rect(0, 0, 700, 500);
      const wb = c.W(480, 200, 700, 200); c.W(480, 0, 480, 200);
      c.op(top, 200, 'window'); c.op(top, 590, 'wsmall'); c.op(bottom, 150, 'door'); c.op(left, 250, 'window'); c.op(wb, 60, 'door', { w: 80 });
      c.fu('bed2', 150, 110); c.fu('night', 40, 32); c.fu('night', 260, 32); c.fu('dresser', 33, 310, 270);
      c.fu('tv', 300, 470, 180); c.fu('sofa3', 300, 330); c.fu('coffee', 300, 400); c.fu('table4', 545, 290);
      c.fu('sinkK', 660, 270, 90); c.fu('stove', 660, 360, 90); c.fu('fridge', 655, 425, 90);
      c.fu('wc', 520, 45); c.fu('basin', 600, 33); c.fu('shower', 645, 145);
      c.room(240, 250, L('Yaşam & Yatak', 'Living & Bed'), '#bfdbfe', 'wood'); c.room(590, 100, L('Banyo', 'Bathroom'), '#a5f3fc', 'tile');
    }
  },
  {
    name: 'Daire 2+1 (≈ 80 m²)', en: 'Apartment 2+1 (≈ 80 m²)', desc: '10 × 8 m, 2 yatak odası, salon, banyo', descEn: '10 × 8 m, 2 bedrooms, living room, bathroom', build() {
      const c = tplCtx(), [top, , bottom, left] = c.rect(0, 0, 1000, 800);
      const mid = c.W(0, 350, 1000, 350); c.W(380, 0, 380, 350); c.W(700, 0, 700, 350);
      c.op(top, 190, 'window'); c.op(top, 540, 'window'); c.op(top, 850, 'wsmall'); c.op(left, 150, 'window2'); c.op(bottom, 550, 'window2'); c.op(bottom, 100, 'door');
      c.op(mid, 190, 'door', { side: -1 }); c.op(mid, 540, 'door', { side: -1 }); c.op(mid, 850, 'door', { side: -1, w: 80 });
      c.fu('bed2', 190, 110); c.fu('night', 85, 32); c.fu('night', 295, 32); c.fu('wardrobe', 40, 230, 270);
      c.fu('bed1', 440, 110); c.fu('desk', 610, 45); c.fu('ochair', 610, 110); c.fu('dresser', 668, 250, 90);
      c.fu('tub', 800, 50); c.fu('wc', 940, 45); c.fu('basin', 968, 150, 90); c.fu('shower', 940, 290);
      c.fu('tv', 30, 470, 270); c.fu('sofa3', 230, 470, 90); c.fu('coffee', 140, 470, 90); c.fu('plant', 60, 760);
      c.fu('fridge', 955, 395, 90); c.fu('counter', 960, 490, 90); c.fu('stove', 960, 580, 90); c.fu('sinkK', 960, 670, 90);
      c.fu('table6', 650, 520); [[600, 445], [700, 445], [600, 595], [700, 595]].forEach(p => c.fu('chair', p[0], p[1]));
      c.room(190, 175, L('Yatak Odası 1', 'Bedroom 1'), '#fde68a', 'wood'); c.room(540, 175, L('Yatak Odası 2', 'Bedroom 2'), '#fbcfe8', 'wood'); c.room(850, 175, L('Banyo', 'Bathroom'), '#a5f3fc', 'tile'); c.room(500, 575, L('Salon & Mutfak', 'Living & Kitchen'), '#bbf7d0', 'wood');
    }
  },
  {
    name: 'Ofis (≈ 60 m²)', en: 'Office (≈ 60 m²)', desc: 'Açık ofis + toplantı odası', descEn: 'Open office + meeting room', build() {
      const c = tplCtx(), [top, right, bottom, left] = c.rect(0, 0, 900, 700);
      const m1 = c.W(600, 0, 600, 300), m2 = c.W(600, 300, 900, 300);
      c.op(top, 150, 'window2'); c.op(top, 450, 'window2'); c.op(top, 750, 'window'); c.op(left, 350, 'window2'); c.op(bottom, 250, 'double'); c.op(m2, 150, 'door');
      for (let i = 0; i < 3; i++) { c.fu('desk', 120 + i * 190, 60); c.fu('ochair', 120 + i * 190, 130); c.fu('desk', 120 + i * 190, 340, 180); c.fu('ochair', 120 + i * 190, 270, 180); }
      c.fu('meet', 750, 150, 90); c.fu('shelf', 880, 150, 90); c.fu('printer', 500, 650); c.fu('plant', 40, 650);
      c.room(300, 300, L('Açık Ofis', 'Open Office'), '#bfdbfe', 'carpet'); c.room(750, 150, L('Toplantı', 'Meeting Room'), '#fde68a', 'carpet'); c.room(750, 500, L('Dinlenme', 'Lounge'), '#bbf7d0', 'wood');
    }
  },
];
function buildTemplate(i) { const f = F(); TEMPLATES[i].build(); }
function thumbSvg(i) {
  const sv = P, sf = fi, z = view.z, sd = ui.dims; P = newProject(); fi = 0; ui.dims = false; view.z = 0.5;
  try { TEMPLATES[i].build(); const b = contentBounds(); const LS = layerStrings(F(), false); const bb = b || { x0: 0, y0: 0, x1: 1000, y1: 700 };
    return `<svg viewBox="${bb.x0 - 30} ${bb.y0 - 30} ${bb.x1 - bb.x0 + 60} ${bb.y1 - bb.y0 + 60}"><defs>${defsSvg()}</defs>${LS.rooms}${LS.walls}${LS.ops}${LS.furn}${LS.roomLabels}</svg>`;
  } finally { P = sv; fi = sf; view.z = z; ui.dims = sd; }
}
function templatesModal() {
  openModal(`<h2>${L('Yeni proje – şablon seç', 'New project – choose a template')} <button class="btn sm" data-close>✕</button></h2><div class="cards">${TEMPLATES.map((t, i) => `<div class="card" data-tpl="${i}">${i ? thumbSvg(i) : `<svg viewBox="0 0 10 5"><text x="5" y="3" text-anchor="middle" font-size="1.5" fill="currentColor">＋</text></svg>`}<b>${isEN() ? t.en : t.name}</b><span class="muted">${isEN() ? t.descEn : t.desc}</span></div>`).join('')}</div>`, 'templates');
  $('#modal').querySelectorAll('[data-tpl]').forEach(c => c.onclick = () => {
    const i = +c.dataset.tpl, t = TEMPLATES[i]; const np = newProject(); np.name = i ? (isEN() ? t.en : t.name).replace(/ \(.*/, '') : L('Yeni Proje', 'New Project');
    P = np; fi = 0; t.build(); loadProject(P); closeModal();
  });
}

/* ---------- Dışa aktarma ---------- */
function exportSvg() {
  const f = F(), b = contentBounds(f) || { x0: 0, y0: 0, x1: 1000, y1: 700 }, pad = 120;
  const x0 = b.x0 - pad, y0 = b.y0 - pad, w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2 + 90;
  const z0 = view.z; view.z = 0.5; ui.exporting = true;
  let LS, defs;
  try { LS = layerStrings(f, false); defs = defsSvg(); }
  finally { view.z = z0; ui.exporting = false; }
  const date = new Date().toLocaleDateString(isEN() ? 'en-US' : 'tr-TR');
  const sb = `<g transform="translate(${x0 + 30} ${y0 + h - 70})" font-family="Segoe UI,sans-serif"><rect width="${Math.min(w - 60, 560)}" height="56" fill="none" stroke="#334155" stroke-width="2"/>
    <text x="12" y="24" font-size="22" font-weight="700" fill="#0f172a">${esc(P.name)} – ${esc(f.name)}</text><text x="12" y="46" font-size="14" fill="#475569">${date}  •  ${L('Toplam oda alanı', 'Total room area')}: ${fmtArea(f.rooms.reduce((s, r) => s + polyArea(r.pts), 0))}</text></g>
    <g transform="translate(${x0 + w - 230} ${y0 + h - 40})" font-family="Segoe UI,sans-serif"><path d="M0 0H200M0 -6V6M100 -6V6M200 -6V6" stroke="#0f172a" stroke-width="2" fill="none"/><text x="0" y="-12" font-size="13">0</text><text x="100" y="-12" font-size="13" text-anchor="middle">1 m</text><text x="200" y="-12" font-size="13" text-anchor="end">2 m</text></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fff"/>${P.bg && layersVis.bg ? bgSvg(false) : ''}${LS.rooms}${LS.walls}${LS.ops}${LS.furn}${LS.roomLabels}${LS.dims}${LS.texts}${LS.sketches}${sb}</svg>`;
  return { svg, w, h };
}
function exportPng() {
  const { svg, w, h } = exportSvg(), sc = Math.min(3, 3200 / Math.max(w, h)) * (w < 1200 ? 1.5 : 1);
  const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(h * sc); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => download(fname('png'), b)); };
  img.onerror = () => toast(L('PNG oluşturulamadı', 'Failed to generate PNG'));
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function exportPrint() {
  const { svg } = exportSvg(), win = window.open('', '_blank');
  if (!win) return toast(L('Açılır pencere engellendi', 'Pop-up window blocked'));
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(P.name)}</title><style>@page{size:A4 landscape;margin:10mm}body{margin:0}svg{width:100%;height:auto;max-height:190mm}</style></head><body>${svg}<script>setTimeout(()=>print(),400)<\/script></body></html>`);
  win.document.close();
}

/* ---------- 3B Görünüm ---------- */
let T3 = null;
function sync3DFloors() {
  const lbl = $('#lbl3dFloor'), selEl = $('#s3dFloor'); if (!lbl || !selEl) return;
  lbl.textContent = L('Kat', 'Floor');
  const fl = P && P.floors ? P.floors : [];
  const opts = `<option value="all">${L('🏢 Tüm katlar', '🏢 All floors')}</option>` + fl.map((f, i) => `<option value="${f.id}">${esc(f.name || L('Kat', 'Floor') + ' ' + (i + 1))}</option>`).join('');
  if (selEl.dataset.opts !== opts) { selEl.dataset.opts = opts; selEl.innerHTML = opts; }
  if (ui.v3dFloor !== 'all' && !fl.some(x => x.id === ui.v3dFloor)) ui.v3dFloor = 'all';
  selEl.value = ui.v3dFloor;
}
function show3D(on) {
  if (on && (!window.THREE || !THREE.OrbitControls)) { toast(L('3B için internet bağlantısı gerekli (Three.js yüklenemedi)', 'Internet connection required for 3D (Three.js failed to load)')); return; }
  ui.view3d = on; keys3D.clear(); $('#v3d').style.display = on ? 'block' : 'none'; $('#b2d').classList.toggle('on', !on); $('#b3d').classList.toggle('on', on);
  $('#zoomctl').style.display = on ? 'none' : ''; updateTools();
  if (on) { init3D(); build3D(); T3.run = true; loop3D(); } else if (T3) T3.run = false;
}
function init3D() {
  if (T3) { resize3D(); return; }
  const el = $('#v3d'), r = new THREE.WebGLRenderer({ antialias: true });
  r.setPixelRatio(Math.min(2, devicePixelRatio)); el.appendChild(r.domElement);
  // yumuşak gölgeler + sinematik ton eşleme (r128 API'si)
  if (THREE.PCFSoftShadowMap) { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; }
  if (THREE.sRGBEncoding) r.outputEncoding = THREE.sRGBEncoding;
  if (THREE.ACESFilmicToneMapping) { r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; }
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdbe5f1);
  const cam = new THREE.PerspectiveCamera(50, 1, 10, 50000);
  // 3B mobilya etkileşimi: OrbitControls'ten ÖNCE kaydedilir ki sürüklerken yörünge devre dışı kalabilsin
  let d3 = null;
  const ray3 = e => {
    cam.updateMatrixWorld(); scene.updateMatrixWorld(); // rAF durmuşsa da matrisler taze olsun (arka plan sekmesi/etkileşim)
    const rect = r.domElement.getBoundingClientRect();
    const rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), cam);
    return rc;
  };
  const floorPlane = elev => new THREE.Plane(new THREE.Vector3(0, 1, 0), -elev);
  r.domElement.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !ui.view3d) return;
    const rc = ray3(e);
    const hits = rc.intersectObjects(scene.children, true).filter(h => h.object.isMesh);
    if (!hits.length) return;
    // en yakın mesh kazanır: duvar/döşeme arkasındaki mobilya seçilmez (örtücüye saygı)
    let cur = hits[0].object;
    while (cur && !(cur.userData && cur.userData.furnId)) cur = cur.parent;
    if (!cur) return;
    const fd = findAnyFloor(cur.userData.furnId);
    if (!fd || fd.kind !== 'furn') return;
    const o = fd.o, elev = cur.userData.elev || 0, p0 = new THREE.Vector3();
    if (!rc.ray.intersectPlane(floorPlane(elev), p0)) return;
    e.stopImmediatePropagation(); // orbit başlamasın
    sel = o.grp ? groupMemberIdsAny(o.grp) : [o.id];
    d3 = { id: o.id, elev, sx: e.clientX, sy: e.clientY, moved: false, offX: p0.x - o.x, offZ: p0.z - o.y,
      orig: new Map(sel.map(sid => { const fo = findAnyFloor(sid)?.o; return [sid, fo ? JSON.parse(JSON.stringify(fo)) : null]; })),
      members: sel.slice(), conn: [], pins: [] };
    // 2B ile aynı davranış: seçili duvarların bitişik uçları da birlikte taşınır (kat başına)
    const sws = d3.members.map(sid => findAnyFloor(sid)).filter(x => x && x.kind === 'wall');
    for (const sw of sws) {
      const sset = new Set(sws.filter(s => s.floorIdx === sw.floorIdx).map(s => s.o.id));
      const ends = Array.isArray(sw.o.angles) && sw.o.angles.length ? [wallPivot(sw.o)] : ['a', 'b'];
      for (const w of sw.floor.walls) {
        if (sset.has(w.id)) continue;
        for (const e2 of ['a', 'b']) for (const se of ends) if (dist(w[e2], sw.o[se]) < 1) d3.conn.push({ w, e: e2, o: { x: w[e2].x, y: w[e2].y } });
      }
    }
    // menteşeli duvar pimleri de sürüklemeyi izlesin
    const dragWalls = new Set([...sws.map(s => s.o.id), ...d3.conn.map(c => c.w.id)]);
    for (const c of scene.children) if (c.isMesh && c.userData.wallId && dragWalls.has(c.userData.wallId)) d3.pins.push({ m: c, x: c.position.x, z: c.position.z });
    refreshSel3D(); renderProps();
  });
  window.addEventListener('pointermove', e => {
    if (!d3) return;
    if (!d3.moved && Math.hypot(e.clientX - d3.sx, e.clientY - d3.sy) < 4) return;
    d3.moved = true;
    const o = findAnyFloor(d3.id)?.o; if (!o) { d3 = null; return; }
    const p = new THREE.Vector3();
    if (!ray3(e).ray.intersectPlane(floorPlane(d3.elev), p)) return;
    let nx = p.x - d3.offX, ny = p.z - d3.offZ;
    if (ui.snap && !e.shiftKey) { const sp = snapToGrid({ x: nx, y: ny }); nx = sp.x; ny = sp.y; }
    const o0 = d3.orig.get(d3.id), dx = nx - o0.x, dy = ny - o0.y;
    for (const sid of d3.members) {
      const fd = findAnyFloor(sid); if (!fd) continue;
      const fo = fd.o, g0 = d3.orig.get(sid); if (!g0) continue;
      if (fd.kind === 'furn' || fd.kind === 'text') { fo.x = g0.x + dx; fo.y = g0.y + dy; }
      else if (fd.kind === 'wall' || fd.kind === 'dim') { fo.a = { x: g0.a.x + dx, y: g0.a.y + dy }; fo.b = { x: g0.b.x + dx, y: g0.b.y + dy }; }
      else if (fd.kind === 'room' || fd.kind === 'sketch') fo.pts = g0.pts.map(q => ({ x: q.x + dx, y: q.y + dy })); // oda/poligon da grupsa birlikte
    }
    for (const c of d3.conn) c.w[c.e] = { x: c.o.x + dx, y: c.o.y + dy }; // bitişik duvar uçları (2B davranışı)
    for (const sid of d3.members) {
      const fd = findAnyFloor(sid); if (!fd) continue;
      const g = T3.scene.children.find(c => c.userData && (c.userData.furnId === sid || c.userData.wallId === sid));
      if (!g) continue;
      const fo = fd.o;
      if (fd.kind === 'furn') g.position.set(fo.x, d3.elev, fo.y);
      else if (fd.kind === 'wall') g.position.set((fo.a.x + fo.b.x) / 2, d3.elev, (fo.a.y + fo.b.y) / 2);
    }
    for (const c of d3.conn) { const g2 = T3.scene.children.find(ch => ch.userData && ch.userData.wallId === c.w.id); if (g2 && !g2.isMesh) g2.position.set((c.w.a.x + c.w.b.x) / 2, g2.position.y, (c.w.a.y + c.w.b.y) / 2); }
    for (const pn of d3.pins) { pn.m.position.x = pn.x + dx; pn.m.position.z = pn.z + dy; }
    for (const h of h3) h.update();
  });
  window.addEventListener('pointerup', e => {
    if (!d3 || e.button !== 0) return;
    const { id, moved } = d3; d3 = null;
    const fd = findAnyFloor(id); if (!fd || fd.kind !== 'furn') return;
    if (moved) {
      if (sel.length === 1 && fd.floorIdx === fi) magnet(fd.o); // 2B ile aynı: yakın duvara yapış (yalnızca kendi katında)
      commit(); refresh();
      schedBuild3D(); // tutkal/rotasyon/pin değişimi olabilir -> sahne tazelensin
    } else { if (fd.floorIdx === fi && fd.o.grp && cycleGroupVars(fd.o.grp)) return; refresh(); refreshSel3D(); } // düz tık: pointerdown'daki seçim (grup/tek) korunur
  });
  const ctl = new THREE.OrbitControls(cam, r.domElement); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI / 2.02;
  let downPt = null;
  r.domElement.addEventListener('pointerdown', e => { if (e.button === 0) downPt = { x: e.clientX, y: e.clientY }; });
  r.domElement.addEventListener('pointerup', e => {
    if (!downPt || e.button !== 0 || Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y) > 5) return;
    downPt = null;
    cam.updateMatrixWorld(); scene.updateMatrixWorld();
    const rect = r.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(mouse, cam);
    const hits = rc.intersectObjects(scene.children, true).filter(h => h.object.isMesh); // kenar çizgileri (LineSegments) tık çalmasın
    if (!hits.length) return;
    // en yakın mesh kazanır: örtücünün arkasındaki kapı/duvar tıklanamaz
    let cur = hits[0].object;
    while (cur && !cur.userData?.wallId && !cur.userData?.opId) cur = cur.parent;
    let hit3 = false;
    if (cur && cur.userData?.opId) {
      const fd = findAnyFloor(cur.userData.opId);
      if (fd && fd.kind === 'op' && (fd.o.type === 'door' || fd.o.type === 'double' || fd.o.type === 'slide')) {
        fd.o.open = fd.o.open ? 0 : 90; sel = [fd.o.id]; commit(); refresh(); build3D(true);
        toast(fd.o.open ? (fd.o.type === 'slide' ? L('Sürgülü kapı açıldı', 'Sliding door opened') : L('Kapı açıldı (90°)', 'Door opened (90°)')) : (fd.o.type === 'slide' ? L('Sürgülü kapı kapandı', 'Sliding door closed') : L('Kapı kapandı', 'Door closed')));
      }
      hit3 = true;
    } else if (cur && cur.userData?.wallId) {
      const fd = findAnyFloor(cur.userData.wallId);
      if (fd && fd.kind === 'wall' && fd.o.grp) {
        if (fd.floorIdx === fi && cycleGroupVars(fd.o.grp)) { sel = groupMemberIds(fd.o.grp); build3D(true); }
      } else if (fd && fd.kind === 'wall' && Array.isArray(fd.o.angles) && fd.o.angles.length >= 2) {
        cycleWallPos(fd.o); sel = [fd.o.id]; commit(); refresh(); build3D(true);
        toast(L(`Duvar: Konum ${fd.o.posIdx + 1}/${fd.o.angles.length} (${fd.o.angles[fd.o.posIdx]}°)`, `Wall: Position ${fd.o.posIdx + 1}/${fd.o.angles.length} (${fd.o.angles[fd.o.posIdx]}°)`));
      }
      hit3 = true;
    }
    if (!hit3 && sel.length) { sel = []; render(); refreshSel3D(); renderProps(); } // boşluğa tıkla -> seçimi bırak
  });
  T3 = { r, scene, cam, ctl, run: false }; resize3D(); window.addEventListener('resize', () => { if (T3 && ui.view3d) resize3D(); });
}
function resize3D() { const el = $('#v3d'); T3.r.setSize(el.clientWidth, el.clientHeight); T3.cam.aspect = el.clientWidth / el.clientHeight; T3.cam.updateProjectionMatrix(); }
function set3DCam(kind) {
  if (!T3 || !T3.fit) return;
  const { cx, cz, sz, elev } = T3.fit;
  if (kind === 'top') { T3.cam.position.set(cx, sz * 2.1 + elev, cz + 1); T3.ctl.target.set(cx, elev * 0.4, cz); }
  else if (kind === 'eye') { T3.cam.position.set(cx + sz * 0.18, 160, cz + sz * 0.95); T3.ctl.target.set(cx, 140, cz); }
  else { T3.cam.position.set(cx + sz * 0.7, sz * 0.9 + elev * .3, cz + sz * 1.0); T3.ctl.target.set(cx, 80, cz); }
  T3.ctl.update();
}
function loop3D() {
  if (!T3 || !T3.run) return;
  requestAnimationFrame(loop3D);
  if (keys3D.size) {
    const spd = keys3D.has('shift') ? 22 : 9;
    const fwd = new THREE.Vector3(); T3.cam.getWorldDirection(fwd); fwd.y = 0;
    if (fwd.lengthSq() > 1e-6) fwd.normalize(); else fwd.set(0, 0, -1);
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const mv = new THREE.Vector3();
    if (keys3D.has('w') || keys3D.has('arrowup')) mv.addScaledVector(fwd, spd);
    if (keys3D.has('s') || keys3D.has('arrowdown')) mv.addScaledVector(fwd, -spd);
    if (keys3D.has('d') || keys3D.has('arrowright')) mv.addScaledVector(right, spd);
    if (keys3D.has('a') || keys3D.has('arrowleft')) mv.addScaledVector(right, -spd);
    if (keys3D.has('e')) mv.y += spd;
    if (keys3D.has('q')) mv.y -= spd;
    if (mv.lengthSq() > 0) { T3.cam.position.add(mv); T3.ctl.target.add(mv); }
  }
  T3.ctl.update(); T3.r.render(T3.scene, T3.cam);
}
/* ---------- 3B malzeme & mobilya detayı ---------- */
// Renk yardımcıları: katalog renginden açık/koyu tonlar türetilir (t: -1..1)
function hex2rgb(h) {
  if (typeof h === 'number') return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
  let s = String(h || '#cbd5e1').replace('#', '');
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  const n = parseInt(s.slice(0, 6), 16) || 0x888888;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(hex, t) {
  const [r, g, b] = hex2rgb(hex), f = v => clamp(Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)), 0, 255);
  return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
// Oda zemin dokusu: 2B'deki desenlerin 3B karşılığı, oda rengiyle harmanlanır
function mixHex(a, b, t) {
  const x = hex2rgb(a), y = hex2rgb(b), f = i => Math.round(x[i] + (y[i] - x[i]) * t);
  return '#' + [f(0), f(1), f(2)].map(v => v.toString(16).padStart(2, '0')).join('');
}
function floorTexture(kind, color, lt, C) {
  const key = kind + '|' + color + '|' + (lt ? 'l' : 'd');
  if (C.floorTex[key]) return C.floorTex[key];
  const accent = kind === 'wood' ? '#b08968' : kind === 'tile' ? '#94a3b8' : '#9ca3af';
  const px = 256, cv = document.createElement('canvas'); cv.width = cv.height = px;
  const g = cv.getContext('2d');
  // oda rengi korunur ama malzeme tonuna doğru harmanlanır (pastel renkler bembeyaz olmasın)
  const base = lt ? mixHex(color, accent, 0.5) : mixHex(mixHex(color, accent, 0.55), '#0b0f14', 0.45);
  const line = lt ? shade(base, -0.3) : shade(base, 0.16);
  g.fillStyle = base; g.fillRect(0, 0, px, px);
  if (kind === 'wood') {
    g.strokeStyle = line; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { const y = i * px / 4; g.beginPath(); g.moveTo(0, y); g.lineTo(px, y); g.stroke(); }
    for (let i = 0; i < 4; i++) {
      const y = i * px / 4, x = (i % 2 ? px * 0.5 : px * 0.18);
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + px / 4); g.stroke();
      g.beginPath(); g.moveTo(x + px * 0.5, y); g.lineTo(x + px * 0.5, y + px / 4); g.stroke();
    }
  } else if (kind === 'tile') {
    g.strokeStyle = line; g.lineWidth = 3;
    for (let i = 0; i <= 2; i++) { const p = i * px / 2; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, px); g.moveTo(0, p); g.lineTo(px, p); g.stroke(); }
  } else if (kind === 'carpet') {
    g.fillStyle = line;
    for (let y = 8; y < px; y += 16) for (let x = 8; x < px; x += 16) { g.beginPath(); g.arc(x + ((y / 16) % 2 ? 8 : 0), y, 2.4, 0, 6.2832); g.fill(); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  const rep = kind === 'wood' ? 160 : kind === 'tile' ? 120 : 80; // cm cinsinden karo boyu
  t.repeat.set(1 / rep, 1 / rep);
  C.floorTex[key] = t; C.texs.push(t);
  return t;
}
// Katalog kimliğine göre parametrik mobilya: ölçüler o.w/d/h'den türetilir
function furn3D(g, o, C) {
  const { box, cyl, sph } = C, ed = C.det;
  const w = o.w, d = o.d, h = o.h, col = o.color || '#cbd5e1';
  const sh = t => shade(col, t);
  const wood = '#b08968', woodD = '#8a6a4f', metal = '#a9b4c0', steel = '#8e9aa8';
  const white = '#f8fafc', dark = '#374151', glass = 0x9fd3ee;
  // b: merkez y; bb: taban y
  const b = (bw, bh, bd, c, x, y, z, ry = 0, op, e) => box(g, bw, bh, bd, c, x, y, z, ry, op, e === undefined ? 0 : e);
  const bb = (bw, bh, bd, c, x, y0, z, ry = 0, e) => b(bw, bh, bd, c, x, y0 + bh / 2, z, ry, 0, e);
  switch (o.type) {
    case 'sofa3': case 'sofa2': case 'armchair': {
      const n = Math.max(1, Math.round(w / 75));
      bb(w * 0.98, h * 0.1, d * 0.98, sh(-0.18), 0, 0, 0, 0, ed);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bb(w * 0.05, h * 0.09, w * 0.05, woodD, sx * (w / 2 - w * 0.06), 0, sz * (d / 2 - w * 0.06));
      bb(w * 0.94, h * 0.18, d * 0.62, sh(0.03), 0, h * 0.16, d * 0.08);
      const cw = (w * 0.9) / n;
      for (let i = 0; i < n; i++) bb(cw * 0.94, h * 0.15, d * 0.56, sh(0.11), (i + 0.5) * cw - w * 0.45, h * 0.34, d * 0.1, 0, ed && i === 0);
      bb(w * 0.96, h * 0.5, d * 0.2, sh(-0.06), 0, h * 0.26, -d * 0.4, 0, ed);
      for (const sx of [-1, 1]) bb(w * 0.07, h * 0.32, d * 0.86, sh(-0.03), sx * (w / 2 - w * 0.035), h * 0.2, d * 0.04, 0, ed);
      break;
    }
    case 'chair': {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bb(w * 0.07, h * 0.46, d * 0.07, woodD, sx * (w / 2 - w * 0.08), 0, sz * (d / 2 - d * 0.08));
      bb(w * 0.92, h * 0.1, d * 0.92, col, 0, h * 0.46, 0, 0, ed);
      bb(w * 0.92, h * 0.5, d * 0.08, col, 0, h * 0.56, -d / 2 + d * 0.06, 0, ed);
      break;
    }
    case 'ochair': {
      bb(w * 0.82, h * 0.08, d * 0.78, col, 0, h * 0.46, 0, 0, ed);
      bb(w * 0.78, h * 0.46, d * 0.12, sh(-0.1), 0, h * 0.56, -d * 0.34, 0, ed);
      for (const sx of [-1, 1]) bb(w * 0.07, h * 0.2, d * 0.6, sh(-0.04), sx * w * 0.4, h * 0.5, 0);
      cyl(g, w * 0.06, h * 0.36, steel, 0, h * 0.28, 0, 12);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; bb(w * 0.5, h * 0.05, w * 0.09, dark, Math.cos(a) * w * 0.2, h * 0.02, Math.sin(a) * w * 0.2, -a); }
      break;
    }
    case 'coffee': case 'table4': case 'table6': case 'table_o': case 'desk': case 'deskL': case 'meet': case 'vanity': {
      const top = Math.max(3, Math.min(5, h * 0.07));
      bb(w, top, d, col, 0, h - top, 0, 0, ed);
      if (o.type === 'meet' || o.type === 'deskL' || w > 220) {
        for (const sx of [-1, 1]) bb(w * 0.05, h - top, d * 0.78, sh(-0.12), sx * w * 0.3, 0, 0);
      } else {
        const t = Math.max(4, w * 0.05);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) bb(t, h - top, t, sh(-0.18), sx * (w / 2 - t * 1.6), 0, sz * (d / 2 - t * 1.6));
      }
      if (o.type === 'desk' || o.type === 'vanity') bb(w * 0.86, h * 0.24, d * 0.74, sh(0.05), 0, h * 0.44, 0);
      break;
    }
    case 'tableR': {
      cyl(g, w * 0.5, 4, col, 0, h - 2, 0, 32);
      cyl(g, w * 0.09, h - 8, sh(-0.15), 0, (h - 4) / 2, 0, 20);
      cyl(g, w * 0.28, 4, sh(-0.2), 0, 2, 0, 24);
      break;
    }
    case 'bed1': case 'bed2': case 'bedK': case 'bunk': case 'crib': {
      bb(w, h * 0.3, d, sh(-0.18), 0, 0, 0, 0, ed);
      bb(w * 0.95, h * 0.34, d * 0.95, white, 0, h * 0.3, 0);
      const np = w > 120 ? 2 : 1;
      for (let i = 0; i < np; i++) bb(w * 0.36, h * 0.16, d * 0.16, '#ffffff', (i - (np - 1) / 2) * w * 0.42, h * 0.6, -d * 0.36, 0, ed);
      bb(w * 0.97, h * 0.22, d * 0.6, sh(0.06), 0, h * 0.5, d * 0.17, 0, ed);
      bb(w, h * 1.3, Math.max(5, d * 0.045), woodD, 0, 0, -d / 2 + Math.max(3, d * 0.022), 0, ed);
      if (o.type === 'bunk') { bb(w, h * 0.08, d, sh(-0.18), 0, h * 0.52, 0); bb(w * 0.95, h * 0.18, d * 0.95, white, 0, h * 0.6, 0); }
      break;
    }
    case 'wardrobe': {
      bb(w, h * 0.96, d, sh(-0.06), 0, h * 0.02, 0, 0, ed);
      bb(w * 0.94, h * 0.06, d * 0.96, sh(-0.22), 0, 0, 0);
      const dw = w * 0.47;
      for (const sx of [-1, 1]) {
        bb(dw, h * 0.9, 2, sh(0.05), sx * dw * 0.52, h * 0.06, d / 2 + 1, 0, ed);
        bb(2.5, h * 0.18, 2.5, metal, sx * 5, h * 0.46, d / 2 + 3);
      }
      break;
    }
    case 'dresser': case 'night': case 'shelf': case 'bookcase': {
      const open = o.type === 'shelf' || o.type === 'bookcase';
      bb(w, h * 0.96, d, sh(-0.06), 0, h * 0.02, 0, 0, ed);
      if (open) {
        const ns = Math.max(2, Math.round(h / 40));
        for (let i = 1; i < ns; i++) bb(w * 0.96, 2.5, d * 0.9, sh(-0.16), 0, (i / ns) * h * 0.94, 0);
      } else {
        const nd = Math.max(2, Math.round(h / 28));
        for (let i = 0; i < nd; i++) {
          const dh = (h * 0.9) / nd;
          bb(w * 0.9, dh * 0.84, 2, sh(0.05), 0, h * 0.05 + i * dh + dh * 0.08, d / 2 + 1);
          bb(w * 0.2, 2.5, 2.5, metal, 0, h * 0.05 + i * dh + dh * 0.5, d / 2 + 3);
        }
      }
      break;
    }
    case 'fridge': {
      bb(w * 0.98, h * 0.97, d * 0.98, sh(0.02), 0, 0, 0, 0, ed);
      const cut = h > 140 ? h * 0.62 : h * 0.92;
      bb(w * 0.9, cut * 0.94, 2, sh(0.09), 0, h * 0.03, d / 2 + 1, 0, ed);
      if (cut < h * 0.85) bb(w * 0.9, (h - cut) * 0.9, 2, sh(0.09), 0, cut + h * 0.03, d / 2 + 1);
      bb(3, cut * 0.5, 3, steel, -w * 0.38, cut * 0.5, d / 2 + 3);
      if (cut < h * 0.85) bb(3, (h - cut) * 0.5, 3, steel, -w * 0.38, cut + (h - cut) * 0.5, d / 2 + 3);
      break;
    }
    case 'dish': case 'wm': {
      bb(w * 0.98, h * 0.97, d * 0.98, sh(0.02), 0, 0, 0, 0, ed);
      bb(w * 0.86, h * 0.8, 2, sh(0.09), 0, h * 0.08, d / 2 + 1, 0, ed);
      if (ed) { const ring = cyl(g, w * 0.27, 2, steel, 0, h * 0.44, d / 2 + 2, 24); ring.rotation.x = Math.PI / 2; }
      bb(w * 0.28, 4, 3, dark, 0, h * 0.84, d / 2 + 2);
      break;
    }
    case 'stove': {
      bb(w, h * 0.94, d, sh(-0.02), 0, 0, 0, 0, ed);
      bb(w, 4, d, dark, 0, h * 0.94, 0, 0, ed);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(g, w * 0.13, 1.5, '#4b5563', sx * w * 0.23, h * 0.94 + 4.5, sz * d * 0.23, 18);
      bb(w * 0.9, h * 0.5, 2, sh(0.1), 0, h * 0.12, d / 2 + 1, 0, ed);
      bb(w * 0.8, 3, 3, metal, 0, h * 0.54, d / 2 + 3);
      break;
    }
    case 'sinkK': case 'counter': case 'counter2': case 'island': {
      bb(w, h * 0.9, d, sh(-0.05), 0, 0, 0, 0, ed);
      bb(w * 1.01, 5, d * 1.02, sh(0.12), 0, h * 0.9, 0, 0, ed);
      if (o.type === 'sinkK') {
        bb(w * 0.5, 2, d * 0.45, steel, 0, h * 0.9 - 1, 0);
        cyl(g, 2, h * 0.16, steel, -w * 0.34, h * 0.9 + h * 0.08, -d * 0.3, 12);
        bb(2.5, 2.5, d * 0.3, steel, -w * 0.34, h * 0.9 + h * 0.14, -d * 0.22);
      }
      break;
    }
    case 'basin': case 'basin2': {
      bb(w, 6, d, white, 0, h * 0.88, 0, 0, ed);
      if (o.type === 'basin2') for (const sx of [-1, 1]) bb(w * 0.4, 2, d * 0.6, steel, sx * w * 0.24, h * 0.88 - 1, 0);
      else bb(w * 0.6, 2, d * 0.6, steel, 0, h * 0.88 - 1, 0);
      if (o.type === 'basin') bb(w * 0.35, h * 0.88, d * 0.7, sh(-0.02), 0, 0, 0, 0, ed);
      else bb(w, h * 0.82, d * 0.8, sh(-0.04), 0, 0, 0, 0, ed);
      cyl(g, 2, h * 0.14, steel, 0, h * 0.88 + h * 0.07, -d * 0.36, 12);
      break;
    }
    case 'wc': case 'bidet': {
      bb(w * 0.85, h * 0.52, d * 0.25, white, 0, 0, -d * 0.36, 0, ed);
      bb(w * 0.9, h * 0.34, d * 0.62, white, 0, 0, d * 0.06, 0, ed);
      const bowl = cyl(g, w * 0.44, h * 0.3, white, 0, h * 0.29, d * 0.14, 22, 0, d * 0.42);
      if (ed) bb(w * 0.9, 2.5, d * 0.5, sh(0.05), 0, h * 0.44, d * 0.14, 0, false);
      break;
    }
    case 'tub': {
      bb(w, h, d, sh(0.05), 0, 0, 0, 0, ed);
      bb(w * 0.86, h * 0.5, d * 0.76, sh(-0.16), 0, h * 0.42, 0);
      bb(w * 0.88, 1.5, d * 0.78, '#bae6fd', 0, h * 0.9, 0);
      break;
    }
    case 'shower': {
      bb(w, 6, d, white, 0, 0, 0, 0, ed);
      bb(w * 0.9, 1.5, d * 0.9, '#bae6fd', 0, 6, 0);
      b(2, h * 0.88, d, glass, -w / 2 + 2, 8 + h * 0.44, 0, 0, 0.34);
      b(w, h * 0.88, 2, glass, 0, 8 + h * 0.44, -d / 2 + 2, 0, 0.34);
      cyl(g, 1.5, h * 0.45, steel, -w * 0.3, h * 0.72, -d * 0.3, 10);
      break;
    }
    case 'plant': case 'tree': {
      const potH = o.type === 'tree' ? h * 0.12 : h * 0.3, potR = Math.min(w, d) * 0.26;
      cyl(g, potR, potH, '#c2410c', 0, potH / 2, 0, 18);
      cyl(g, Math.max(1.5, potR * 0.1), h * 0.46, woodD, 0, potH + h * 0.2, 0, 8);
      const fo = o.type === 'tree' ? h * 0.26 : Math.min(w, d) * 0.32;
      sph(g, fo, sh(-0.06), 0, potH + h * 0.56, 0, 1, 0.92, 1);
      if (ed) { sph(g, fo * 0.78, sh(0.1), fo * 0.45, potH + h * 0.72, fo * 0.2); sph(g, fo * 0.72, sh(0.2), -fo * 0.4, potH + h * 0.68, -fo * 0.2); }
      break;
    }
    case 'tv': {
      bb(w, h * 0.75, d, sh(-0.06), 0, 0, 0, 0, ed);
      bb(w * 0.98, 3, d * 0.98, sh(-0.2), 0, h * 0.75, 0);
      const sw = w * 0.72, shh = h * 1.1;
      b(sw, shh, 3, '#1f2937', 0, h * 0.78 + shh / 2, -d * 0.12, 0, 0, ed);
      b(sw * 0.94, shh * 0.9, 1, '#0ea5e9', 0, h * 0.78 + shh / 2, -d * 0.12 + 2, 0, 0.9);
      bb(w * 0.2, 2, d * 0.5, dark, 0, h * 0.75, 0);
      break;
    }
    case 'rug': {
      b(w, 2, d, sh(-0.1), 0, 1, 0);
      b(w * 0.9, 2.6, d * 0.86, col, 0, 1.2, 0);
      break;
    }
    case 'car': {
      bb(w, h * 0.42, d, col, 0, h * 0.15, 0, 0, ed);
      bb(w * 0.82, h * 0.36, d * 0.45, sh(0.14), 0, h * 0.55, -d * 0.02, 0, ed);
      b(w * 0.78, h * 0.28, 2, glass, 0, h * 0.7, d * 0.2, 0, 0.5);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const wh = cyl(g, h * 0.16, w * 0.08, '#1f2937', sx * w * 0.46, h * 0.16, sz * d * 0.32, 18); wh.rotation.z = Math.PI / 2; }
      break;
    }
    case 'pool': {
      b(w, 8, d, '#e2e8f0', 0, 4, 0, 0, 0, ed);
      b(w * 0.94, 2, d * 0.94, '#38bdf8', 0, 7, 0, 0, 0.75);
      break;
    }
    case 'column': case 'colSq': {
      if (o.type === 'colSq') {
        bb(w * 1.25, h * 0.05, d * 1.25, sh(-0.1), 0, 0, 0, 0, ed);
        bb(w, h * 0.9, d, col, 0, h * 0.05, 0, 0, ed);
        bb(w * 1.25, h * 0.05, d * 1.25, sh(-0.1), 0, h * 0.95, 0, 0, ed);
      } else {
        cyl(g, w * 0.62, h * 0.05, sh(-0.1), 0, h * 0.025, 0, 24);
        cyl(g, w * 0.45, h * 0.9, col, 0, h * 0.5, 0, 24);
        cyl(g, w * 0.62, h * 0.05, sh(-0.1), 0, h * 0.975, 0, 24);
      }
      break;
    }
    case 'fireplace': {
      bb(w, h * 0.95, d, col, 0, 0, 0, 0, ed);
      b(w * 0.45, h * 0.5, 4, '#111827', 0, h * 0.3, d / 2 + 0.5, 0, 0, false);
      bb(w * 1.08, h * 0.08, d * 1.08, sh(-0.14), 0, h * 0.95, 0, 0, ed);
      break;
    }
    case 'printer': {
      bb(w, h * 0.7, d, sh(0.06), 0, 0, 0, 0, ed);
      bb(w * 0.8, h * 0.15, d * 0.6, sh(-0.12), 0, h * 0.52, -d * 0.1);
      b(w * 0.5, 3, 2, dark, 0, h * 0.32, d / 2 + 1);
      break;
    }
    case 'stairs': {
      const n = Math.max(6, Math.round(h / 18));
      for (let i = 0; i < n; i++) { const shp = h / n * (i + 1); bb(w, shp, d / n, col, 0, 0, d / n * (n / 2 - i - .5), 0, ed && i === 0); }
      if (ed) {
        const rx = w / 2 - 3;
        for (let i = 0; i < n; i++) { const shp = h / n * (i + 1); bb(3, 92, 3, metal, rx, shp, d / n * (n / 2 - i - .5)); }
        bb(3.5, 4, d, metal, rx, h + 90, 0);
      }
      break;
    }
    default: {
      if (o.k === 'poly' && o.pts && o.pts.length >= 3) {
        const shp = new THREE.Shape(o.pts.map(p => new THREE.Vector2(p.x, -p.y)));
        const geo = new THREE.ExtrudeGeometry(shp, { depth: Math.max(2, h), bevelEnabled: false });
        geo.rotateX(-Math.PI / 2); g.add(new THREE.Mesh(geo, C.mat(col)));
      } else if (o.k === 'round') {
        cyl(g, w / 2, h, col, 0, h / 2, 0, 28, 0, d / 2);
      } else {
        b(w, h, d, col, 0, h / 2, 0, 0, 0, ed);
        if (o.k === 'sofa') b(w, h, d * .25, col, 0, h * .75, -d * .375);
        if (o.k === 'bed') b(w, h * 1.5, 10, 0xb08968, 0, h * .75, -d / 2 + 5);
      }
    }
  }
}
function build3D(keepCam = false) {
  sync3DFloors();
  const lt = isLight(), S = T3.scene;
  // önceki sahnenin GPU kaynaklarını serbest bırak (sık yeniden yapılanmalarda sızıntı olmasın)
  if (T3.mats) {
    const geos = new Set(); S.traverse(o => { if (o.geometry) geos.add(o.geometry); });
    for (const gg of geos) gg.dispose();
    for (const m of T3.mats) m.dispose();
    if (T3.texs) for (const t of T3.texs) t.dispose();
    // ışıkların gölge haritaları da GPU belleğinde: yeniden kurmadan önce bırakılmalı
    S.traverse(o => { if (o.isLight && o.shadow && o.shadow.map) { o.shadow.map.dispose(); o.shadow.map = null; } });
  }
  while (S.children.length) S.remove(S.children[0]);
  S.background = new THREE.Color(lt ? 0xe8e3d9 : 0x0b0f14);

  // sahne sınırları (ışık gölge kamerası ve kamera sığdırma için) — çizimden ÖNCE hesaplanır
  let all = null;
  P.floors.forEach(f => {
    if (ui.v3dFloor !== 'all' && f.id !== ui.v3dFloor) return;
    const b = contentBounds(f);
    if (b) all = all ? { x0: Math.min(all.x0, b.x0), y0: Math.min(all.y0, b.y0), x1: Math.max(all.x1, b.x1), y1: Math.max(all.y1, b.y1) } : b;
  });
  if (!all) all = { x0: 0, y0: 0, x1: 1000, y1: 700 };
  const cx = (all.x0 + all.x1) / 2, cz = (all.y0 + all.y1) / 2, sz = Math.max(all.x1 - all.x0, all.y1 - all.y0, 400);
  // detay seviyesi: çok yoğun planlarda parça kenarları/kasa/gölge detayı otomatik azaltılır
  let nObj = 0;
  P.floors.forEach(f => { if (ui.v3dFloor !== 'all' && f.id !== ui.v3dFloor) return; nObj += f.walls.length * 5 + f.ops.length * 6 + f.furn.length * 8 + f.rooms.length; });
  const det = nObj < 3000 ? 1 : 0;

  S.add(new THREE.HemisphereLight(0xffffff, lt ? 0x667788 : 0x1e293b, lt ? 0.32 : 0.5));
  const dl = new THREE.DirectionalLight(0xfff6e8, lt ? 0.5 : 0.45);
  dl.position.set(cx + sz * 0.75, sz * 1.7, cz + sz * 0.85);
  dl.target.position.set(cx, 0, cz); S.add(dl.target);
  dl.castShadow = true;
  const shadowRes = nObj < 700 ? 2048 : 1024;
  dl.shadow.mapSize.set(shadowRes, shadowRes);
  const ext = sz * 0.95 + 200, sc3 = dl.shadow.camera;
  sc3.left = -ext; sc3.right = ext; sc3.top = ext; sc3.bottom = -ext; sc3.near = 10; sc3.far = sz * 5 + 4000;
  sc3.updateProjectionMatrix();
  dl.shadow.bias = -0.0004; dl.shadow.normalBias = 1.2;
  S.add(dl);
  const fill = new THREE.DirectionalLight(0xdbeafe, lt ? 0.14 : 0.24);
  fill.position.set(cx - sz * 0.9, sz * 0.55, cz - sz * 0.7); S.add(fill);

  const matCache = {}, extraMats = [], texs = [], floorTex = {};
  const mat = (c, o) => { const k = c + '|' + (o || ''); return matCache[k] || (matCache[k] = new THREE.MeshLambertMaterial({ color: c, ...(o ? { transparent: true, opacity: o } : {}), side: THREE.DoubleSide })); };
  const lineMat = new THREE.LineBasicMaterial({ color: lt ? 0x334155 : 0x64748b, transparent: true, opacity: .35 });
  // paylaşılan birim geometriler: her parça için yeni tampon ayırmak yerine ölçeklenir
  const unitBox = new THREE.BoxGeometry(1, 1, 1), unitEdges = new THREE.EdgesGeometry(unitBox);
  const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 24), unitSph = new THREE.SphereGeometry(1, 16, 12);
  const box = (parent, w, h, d, color, x, y, z, ry = 0, op, edges = true, cast) => {
    const m = new THREE.Mesh(unitBox, mat(color, op));
    m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m);
    m.receiveShadow = true; m.castShadow = cast === undefined ? (!op && w * h * d > 6000) : cast;
    if (edges && !op) { const l = new THREE.LineSegments(unitEdges, lineMat); l.scale.copy(m.scale); l.position.copy(m.position); l.rotation.y = ry; parent.add(l); }
    return m;
  };
  const cyl = (parent, r, hh, color, x, y, z, seg = 20, op, rz) => {
    const m = new THREE.Mesh(unitCyl, mat(color, op)); m.scale.set(r, hh, rz || r); m.position.set(x, y, z);
    m.receiveShadow = true; m.castShadow = !op && r * r * hh > 1200; parent.add(m); return m;
  };
  const sph = (parent, r, color, x, y, z, sx = 1, sy = 1, sz = 1) => {
    const m = new THREE.Mesh(unitSph, mat(color)); m.scale.set(r * sx, r * sy, r * sz); m.position.set(x, y, z);
    m.receiveShadow = true; m.castShadow = r * r * r > 1200; parent.add(m); return m;
  };
  const furnCtx = { box, cyl, sph, mat, det };
  let elev = 0;
  P.floors.forEach((f, fidx) => {
    if (ui.v3dFloor !== 'all' && f.id !== ui.v3dFloor) return; // kat seçici: yalnızca seçili kat çizilir
    // zemin plakası: duvarların dış konturunu izleyen poligon — açılı planlarda AABB gibi taşmaz
    const slabCol = lt ? 0xded8cc : (fidx === 0 ? 0x171e29 : 0x232b38);
    for (const pts of slabPolys(f)) {
      const shp = new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, p.y)));
      const geo = new THREE.ExtrudeGeometry(shp, { depth: 20, bevelEnabled: false });
      geo.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(geo, mat(slabCol));
      m.position.y = elev; m.receiveShadow = true;
      S.add(m);
    }
    f.rooms.forEach(r => {
      if (!r.pts || r.pts.length < 3) return;
      const shp = new THREE.Shape(r.pts.map(p => new THREE.Vector2(p.x, p.y)));
      const geo = new THREE.ShapeGeometry(shp);
      let m;
      const kind = r.floor && r.floor !== 'none' ? r.floor : null;
      if (kind && det) {
        const tex = floorTexture(kind, r.color || '#cbd5e1', lt, { floorTex, texs });
        const mm = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }); extraMats.push(mm);
        m = new THREE.Mesh(geo, mm);
      } else {
        m = new THREE.Mesh(geo, mat(r.color, lt ? undefined : 0.78));
      }
      m.rotation.x = Math.PI / 2; m.position.y = elev + 0.6; m.receiveShadow = true; S.add(m);
    });
    f.walls.forEach(w => {
      const L = wLen(w), H = w.h, g = new THREE.Group(); g.userData = { wallId: w.id }; g.position.set((w.a.x + w.b.x) / 2, elev, (w.a.y + w.b.y) / 2); g.rotation.y = -wAng(w); S.add(g);
      const hasPos = Array.isArray(w.angles) && w.angles.length > 0;
      const wCol = hasPos ? (lt ? 0xdbeafe : 0xfde68a) : (lt ? 0xfaf8f5 : 0xe2e8f0);
      const curt = w.wt === 'curtain', rail = 5, frameCol = lt ? 0x8fa3b8 : 0x7c8a9c;
      if (curt) { box(g, L, rail, w.t, frameCol, 0, rail / 2, 0); box(g, L, rail, w.t, frameCol, 0, H - rail / 2, 0); } // alt & üst kuşak
      const seg = (s, e, y0, y1) => {
        if (curt) { y0 = Math.max(y0, rail); y1 = Math.min(y1, H - rail); if (e - s < 1 || y1 - y0 < 1) return; box(g, e - s, y1 - y0, w.t * 0.3, 0x9fd3ee, (s + e) / 2 - L / 2, (y0 + y1) / 2, 0, 0, lt ? 0.38 : 0.30, false); }
        else { if (e - s < 0.5 || y1 - y0 < 0.5) return; box(g, e - s, y1 - y0, w.t, wCol, (s + e) / 2 - L / 2, (y0 + y1) / 2, 0); }
      };
      const ops = f.ops.filter(o => o.wall === w.id).sort((a, c) => a.d - c.d); let pos = 0;
      ops.forEach(o => {
        const s = Math.max(pos, o.d - o.w / 2), e = Math.min(L, o.d + o.w / 2);
        seg(pos, s, 0, H);
        if (o.sill > 0) seg(s, e, 0, o.sill); seg(s, e, Math.min(H, o.sill + o.h), H);
        const span = e - s, xm = (s + e) / 2 - L / 2;
        if (span >= 1) {
          // kapı/sürgü grubu: opId taşır ki 3B tıklama çalışsın
          const isLeaf = o.type === 'door' || o.type === 'double' || o.type === 'slide';
          let og = g;
          if (isLeaf) { og = new THREE.Group(); og.userData = { opId: o.id }; g.add(og); }
          const fCol = shade(wCol, -0.22), fr = Math.min(6, Math.max(2, span * 0.07));
          if (det && !curt) {
            // kasa: söveler + üst lento (+ pencere denizliği)
            box(og, fr, o.h, w.t * 1.06, fCol, s + fr / 2 - L / 2, o.sill + o.h / 2, 0, 0, 0, false);
            box(og, fr, o.h, w.t * 1.06, fCol, e - fr / 2 - L / 2, o.sill + o.h / 2, 0, 0, 0, false);
            box(og, span, fr, w.t * 1.06, fCol, xm, o.sill + o.h - fr / 2, 0, 0, 0, false);
            if (o.type === 'window') box(og, span + fr * 1.6, 4, w.t * 1.5, fCol, xm, Math.max(2, o.sill - 2), 0, 0, 0, false);
          }
          if (o.type === 'window') {
            box(og, span, o.h, w.t * 0.25, 0x9fd3ee, xm, o.sill + o.h / 2, 0, 0, 0.45, false);
            if (det && span > 100) box(og, 4, o.h, w.t * 0.34, frameCol, xm, o.sill + o.h / 2, 0, 0, 0, false); // orta kayıt
          } else if (o.type === 'door' || o.type === 'double') {
            // closed: yapraklar boşluğu doldurur; open: menteşeden 90° açık döner
            const sd3 = o.side || 1, a90 = Math.PI / 2, lw = span * (o.type === 'double' ? 0.48 : 0.96);
            const leaf = (hx, ry, sgn) => {
              const lg = new THREE.Group(); lg.position.set(hx, 0, 0); lg.rotation.y = ry; og.add(lg);
              box(lg, lw, o.h * 0.97, 4, 0xb08968, sgn * lw / 2, o.h / 2, 0, 0, 0, det);
              if (det) {
                box(lg, lw * 0.68, o.h * 0.62, 1.5, 0xd7b494, sgn * lw / 2, o.h * 0.53, 2.8, 0, 0, false);
                const hd = cyl(lg, 1.6, 8, 0x9aa6b2, sgn * (lw - 9), o.h * 0.47, 5.5, 12); hd.rotation.x = Math.PI / 2;
              }
            };
            if (o.type === 'double') { leaf(s - L / 2, o.open ? -sd3 * a90 : 0, 1); leaf(e - L / 2, o.open ? sd3 * a90 : 0, -1); }
            else if (o.flip) leaf(e - L / 2, o.open ? sd3 * a90 : 0, -1);
            else leaf(s - L / 2, o.open ? -sd3 * a90 : 0, 1);
          } else if (o.type === 'slide') {
            // sürgülü kapı: 2B'deki gibi hafif ofsetli iki kayar panel + üst ray
            const pw = span * 0.55, pt = Math.max(2, Math.min(4, w.t * 0.25)), my = o.sill + o.h / 2;
            const sgn = o.flip ? -1 : 1;
            const pFixed = o.flip ? (e - pw / 2 - L / 2) : (s + pw / 2 - L / 2);
            const pSlide = o.open ? pFixed : (o.flip ? (s + pw / 2 - L / 2) : (e - pw / 2 - L / 2));
            box(og, pw, o.h * 0.98, pt, 0x7dd3fc, pFixed, my, -sgn * pt * 0.65, 0, 0.55, false);
            box(og, pw, o.h * 0.98, pt, 0x7dd3fc, pSlide, my, sgn * pt * 0.65, 0, 0.55, false);
            if (det) box(og, span, 6, w.t * 0.5, frameCol, xm, o.sill + o.h - 3, 0, 0, 0, false);
          }
        }
        pos = Math.max(pos, e);
      });
      seg(pos, L, 0, H);
      if (!curt && det) {
        // süpürgelik: kapı boşluklarını atlar, pencere altında devam eder
        const skirt = (s0, e0) => {
          if (e0 - s0 < 4) return;
          const sw2 = e0 - s0, sx2 = (s0 + e0) / 2 - L / 2, scf = shade(wCol, -0.16), sd = 1.6;
          for (const zs of [-1, 1]) box(g, sw2, 6, sd, scf, sx2, 3, zs * (w.t / 2 + sd / 2 - 0.2), 0, 0, false, false);
        };
        let p0 = 0;
        ops.filter(o => o.sill <= 2).forEach(o => { const s = Math.max(p0, o.d - o.w / 2), e = Math.min(L, o.d + o.w / 2); skirt(p0, s); p0 = Math.max(p0, e); });
        skirt(p0, L);
        box(g, L, 3.5, w.t * 1.02, shade(wCol, -0.08), 0, H - 1.75, 0, 0, 0, false, false); // üst kapak
      }
      if (curt) {
        // dikmeler: açıklıkların üstüne binmesin
        const nM = Math.max(1, Math.round(L / 120));
        for (let i = 0; i <= nM; i++) {
          const x = (i * L) / nM;
          if (ops.some(o => o.d - o.w / 2 < x + 4 && o.d + o.w / 2 > x - 4)) continue;
          box(g, 6, H - 2 * rail, w.t * 0.55, frameCol, x - L / 2, rail + (H - 2 * rail) / 2, 0, 0, 0, false);
        }
      }
      if (hasPos) {
        const pv = w[wallPivot(w)], pin = new THREE.Mesh(new THREE.CylinderGeometry(w.t * 0.55, w.t * 0.55, H + 4, 20), mat(lt ? 0x1d4ed8 : 0xd99b26));
        pin.position.set(pv.x, elev + H / 2, pv.y); pin.userData = { wallId: w.id }; S.add(pin);
      }
    });
    f.furn.forEach(o => {
      const ry = -o.rot * Math.PI / 180, g = new THREE.Group(); g.position.set(o.x, elev, o.y); g.rotation.y = ry; g.userData = { furnId: o.id, elev }; S.add(g);
      furn3D(g, o, furnCtx);
    });
    (f.sketches || []).forEach(sk => {
      if (!sk.pts || sk.pts.length < 2) return;
      let col = sk.color || '#1e293b';
      if (!lt && (col === '#1e293b' || col === '#0f172a' || col === '#000000')) col = '#e6edf5';
      const geo = new THREE.BufferGeometry().setFromPoints(sk.pts.map(p => new THREE.Vector3(p.x, elev + 1.5, p.y)));
      S.add(new THREE.Line(geo, mat(col))); // malzeme matCache ile T3.mats'te dispose edilir
    });
    elev += P.wallH + 20;
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), mat(lt ? 0xd8d2c5 : 0x11161e));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -21; ground.receiveShadow = true; S.add(ground);
  T3.fit = { cx, cz, sz, elev };
  if (!keepCam) { T3.cam.position.set(cx + sz * 0.7, sz * 0.9 + elev * .3, cz + sz * 1.0); T3.ctl.target.set(cx, 80, cz); }
  T3.mats = Object.values(matCache).concat(extraMats, [lineMat]); // sonraki build3D çağrısında dispose edilmek üzere
  T3.texs = texs;
  T3.ctl.update();
  refreshSel3D();
}

/* ---------- 3B seçim vurgusu & canlı güncelleme ---------- */
let h3 = [], b3t = null;
function refreshSel3D() {
  if (!T3 || !T3.scene) return;
  for (const h of h3) { T3.scene.remove(h); h.geometry.dispose(); h.material.dispose(); }
  h3 = [];
  if (!ui.view3d || !sel.length) return;
  // tekil veya gruplu seçimde tüm mobilya üyeleri turuncu kutuyla vurgulanır
  for (const id of sel) {
    const g = T3.scene.children.find(c => c.userData && c.userData.furnId === id);
    if (g) h3.push(new THREE.BoxHelper(g, isLight() ? 0xd97706 : 0xfbbf24));
  }
  for (const h of h3) T3.scene.add(h);
}
function moveFurn3D(o) {
  if (!T3 || !ui.view3d) return;
  const g = T3.scene.children.find(c => c.userData && c.userData.furnId === o.id);
  if (g) { g.position.set(o.x, g.userData.elev || 0, o.y); g.rotation.y = -(o.rot || 0) * Math.PI / 180; }
  for (const h of h3) h.update();
}
function schedBuild3D() {
  if (!T3 || !ui.view3d) return;
  clearTimeout(b3t); b3t = setTimeout(() => { if (T3 && ui.view3d) build3D(true); }, 90);
}

/* ---------- Dil arayüzü & Başlatma ---------- */
const DEFAULT_MAP_TR_EN = {
  'Yeni Proje': 'New Project', 'Stüdyo 1+0': 'Studio 1+0', 'Daire 2+1': 'Apartment 2+1', 'Ofis': 'Office',
  'Zemin Kat': 'Ground Floor', 'Yaşam & Yatak': 'Living & Bed', 'Banyo': 'Bathroom',
  'Yatak Odası 1': 'Bedroom 1', 'Yatak Odası 2': 'Bedroom 2', 'Salon & Mutfak': 'Living & Kitchen',
  'Açık Ofis': 'Open Office', 'Toplantı': 'Meeting Room', 'Dinlenme': 'Lounge'
};
const DEFAULT_MAP_EN_TR = Object.fromEntries(Object.entries(DEFAULT_MAP_TR_EN).map(([k, v]) => [v, k]));
function translateDefaultNames() {
  if (!P) return;
  const map = isEN() ? DEFAULT_MAP_TR_EN : DEFAULT_MAP_EN_TR;
  if (map[P.name]) { P.name = map[P.name]; $('#pname').value = P.name; }
  (P.floors || []).forEach(f => {
    if (map[f.name]) f.name = map[f.name];
    else if (isEN() && /^Kat (\d+)$/.test(f.name)) f.name = f.name.replace(/^Kat /, 'Floor ');
    else if (!isEN() && /^Floor (\d+)$/.test(f.name)) f.name = f.name.replace(/^Floor /, 'Kat ');
    (f.rooms || []).forEach(r => {
      if (map[r.name]) r.name = map[r.name];
      else if (isEN() && /^Oda (\d+)$/.test(r.name)) r.name = r.name.replace(/^Oda /, 'Room ');
      else if (!isEN() && /^Room (\d+)$/.test(r.name)) r.name = r.name.replace(/^Room /, 'Oda ');
    });
  });
}
function applyLangUI() {
  document.documentElement.lang = lang;
  document.title = L('Kat Planı Çizici', 'Floor Planner');
  $('#logoTxt').textContent = L('📐 Kat Planı', '📐 Floor Plan');
  $('#pname').title = L('Proje adı', 'Project name');
  $('#bNew').textContent = L('📄 Yeni', '📄 New');
  $('#bProjects').textContent = L('📁 Projelerim', '📁 My Projects');
  $('#bSave').textContent = L('💾 Kaydet', '💾 Save');
  $('#bSave').title = L('Tarayıcıya kaydet (Ctrl+S)', 'Save to browser (Ctrl+S)');
  $('#bJson').title = L('JSON dosyası olarak indir', 'Download as JSON file');
  $('#bOpen').textContent = L('📂 Aç', '📂 Open');
  $('#bOpen').title = L('JSON dosyası aç', 'Open JSON file');
  $('#bUndo').title = L('Geri al (Ctrl+Z)', 'Undo (Ctrl+Z)');
  $('#bRedo').title = L('Yinele (Ctrl+Y)', 'Redo (Ctrl+Y)');
  $('#bPrint').textContent = L('🖨 PDF / Yazdır', '🖨 PDF / Print');
  $('#b2d').textContent = L('2B', '2D');
  $('#b3d').textContent = L('3B', '3D');
  $('#bLang').textContent = isEN() ? '🌐 EN' : '🌐 TR';
  $('#bLang').title = L('Switch to English', 'Türkçe diline geç');
  $('#bTheme').title = L('Tema (Açık / Koyu)', 'Theme (Light / Dark)');
  $('#bHelp').textContent = L('❓ Yardım', '❓ Help');
  $('#bAi').title = L('AI ile düzenle (ajanınız planı canlı düzenler)', 'Edit with AI (your agent edits the plan live)');
  $('#search').placeholder = L('🔍 Mobilya ara...', '🔍 Search furniture...');
  $('#zFit').title = L('Sığdır (0)', 'Fit to view (0)');
  $('#lblSnap').textContent = L('Yakala (G)', 'Snap (G)');
  $('#lblDims').textContent = L('Duvar ölçüleri', 'Wall dimensions');
  $('#lblConn').textContent = L('Bitişik duvarlar', 'Connected walls');
  $('#cConn').title = L('Sürüklerken bitişik duvar uçları birlikte gelir (Alt basılıysa tersine döner)', 'Adjacent wall ends follow the drag (hold Alt to invert)');
  $('#lblBoxSel').textContent = L('Kutu Seçim', 'Box Select');
  const bsOpts = $('#sBoxSel') && $('#sBoxSel').options;
  if (bsOpts && bsOpts.length >= 3) {
    bsOpts[0].textContent = L('Tümü', 'All');
    bsOpts[1].textContent = L('Duvarlar', 'Walls');
    bsOpts[2].textContent = L('Mobilya', 'Furniture');
  }
  $('#lblGridType').textContent = L('Izgara Tipi', 'Grid Type');
  const gtOpts = $('#sGridType').options;
  if (gtOpts.length >= 4) {
    gtOpts[0].textContent = L('⊞ Kare', '⊞ Square');
    gtOpts[1].textContent = L('△ Üçgen (60°)', '△ Triangle (60°)');
    gtOpts[2].textContent = L('⁙ Noktalı', '⁙ Dots');
    gtOpts[3].textContent = L('∅ Kapalı (Serbest)', '∅ Off (Free)');
  }
  $('#lblGridStep').textContent = L('Adım', 'Step');
  const gsCustom = $('#sGrid').querySelector('option[value="custom"]');
  if (gsCustom) gsCustom.textContent = L('Özel...', 'Custom...');
  $('#iGridCustom').title = L('Özel ızgara adımı (cm)', 'Custom grid step (cm)');
  $('#lbl3dFloor').textContent = L('Kat', 'Floor');
  if ($('#b3dFit')) $('#b3dFit').title = L('Sığdır', 'Fit');
  if ($('#b3dTop')) $('#b3dTop').title = L('Üstten görünüm', 'Top view');
  if ($('#b3dEye')) $('#b3dEye').title = L('Göz hizası (1.6 m)', 'Eye level (1.6 m)');
  if ($('#s3dFloor')) $('#s3dFloor').dataset.opts = ''; // dil değişince seçenekleri yeniden yaz
  $('#lblAngle').textContent = (P && P.gridType === 'triangle') ? L('Açı 30°', 'Angle 30°') : L('Açı 15°', 'Angle 15°');
  if (!P && ($('#pname').value === 'Yeni Proje' || $('#pname').value === 'New Project')) $('#pname').value = L('Yeni Proje', 'New Project');
  translateDefaultNames();
  buildTools(); buildLib();
  if (P) { syncGridUI(); refresh(); sync3DFloors(); }
  if ($('#modalbg').style.display === 'flex') {
    if (ui.modal === 'help') helpModal();
    else if (ui.modal === 'ai') aiModal();
    else if (ui.modal === 'projects') projectsModal();
    else if (ui.modal === 'templates') templatesModal();
  }
}
function setLang(nl) {
  lang = nl === 'tr' ? 'tr' : 'en';
  try { localStorage.setItem('fp_lang', lang); } catch (e) { }
  applyLangUI();
}

$('#bNew').onclick = templatesModal; $('#bProjects').onclick = projectsModal; $('#bSave').onclick = saveBrowser;
$('#bJson').onclick = () => downloadJson(P);
$('#bOpen').onclick = () => $('#fileOpen').click(); $('#bHelp').onclick = helpModal; $('#bAi').onclick = () => aiModal();
$('#bUndo').onclick = undo; $('#bRedo').onclick = redo;
$('#bPng').onclick = exportPng; $('#bPrint').onclick = exportPrint;
$('#bSvg').onclick = () => download(fname('svg'), new Blob([exportSvg().svg], { type: 'image/svg+xml' }));
$('#b2d').onclick = () => show3D(false); $('#b3d').onclick = () => show3D(true);
$('#s3dFloor').onchange = () => { ui.v3dFloor = $('#s3dFloor').value; if (T3 && ui.view3d) build3D(true); };
$('#b3dFit').onclick = () => set3DCam('fit');
$('#b3dTop').onclick = () => set3DCam('top');
$('#b3dEye').onclick = () => set3DCam('eye');
$('#bLang').onclick = () => setLang(isEN() ? 'tr' : 'en');
$('#bTheme').onclick = () => {
  const d = document.documentElement;
  d.dataset.theme = d.dataset.theme === 'light' ? '' : 'light';
  localStorage.setItem('fp_theme', d.dataset.theme || '');
  render();
  if (ui.view3d && T3) build3D();
};
$('#pname').addEventListener('input', e => { P.name = e.target.value; autosave(); });
$('#pname').addEventListener('change', commit);
$('#cSnap').onchange = e => { ui.snap = e.target.checked; };
$('#cConn').onchange = e => { ui.connWalls = e.target.checked; };
$('#sBoxSel').onchange = e => { ui.boxSel = e.target.value; };
$('#cAngle').onchange = e => { ui.angle = e.target.checked; };
$('#cDims').onchange = e => { ui.dims = e.target.checked; render(); };
$('#sGrid').onchange = e => {
  if (e.target.value === 'custom') {
    $('#lblGridCustom').style.display = 'inline-flex';
    $('#iGridCustom').value = P.grid;
    $('#iGridCustom').focus();
    $('#iGridCustom').select();
  } else {
    $('#lblGridCustom').style.display = 'none';
    P.grid = +e.target.value;
    commit(); render();
  }
};
$('#iGridCustom').addEventListener('input', e => {
  const v = clamp(parseFloat(e.target.value) || 0, 1, 10000);
  if (v >= 1) { P.grid = v; render(); }
});
$('#iGridCustom').addEventListener('change', e => {
  const v = clamp(parseFloat(e.target.value) || 10, 1, 10000);
  P.grid = v; e.target.value = v; commit(); render();
});
$('#sGridType').onchange = e => {
  P.gridType = e.target.value;
  $('#lblAngle').textContent = P.gridType === 'triangle' ? L('Açı 30°', 'Angle 30°') : L('Açı 15°', 'Angle 15°');
  commit(); render();
};
$('#fileOpen').onchange = e => {
  const file = e.target.files[0]; if (!file) return; const r = new FileReader();
  r.onload = () => { try { const o = JSON.parse(r.result); if (!o.floors) throw new Error(L('geçersiz dosya', 'invalid file')); loadProject(o, L('Dosya açıldı', 'File opened')); closeModal(); } catch (er) { toast(L('Dosya açılamadı: ', 'Could not open file: ') + er.message); } };
  r.readAsText(file); e.target.value = '';
};
$('#fileBg').onchange = e => {
  const file = e.target.files[0]; if (!file) return; const r = new FileReader();
  r.onload = () => { const im = new Image(); im.onload = () => { const w = 1200; P.bg = { id: 'bg', src: r.result, x: 0, y: 0, w, h: Math.round(w * im.height / im.width), op: 0.5, lock: false }; sel = ['bg']; setTool('select'); commit(); fit(); refresh(); toast(L('Görsel eklendi – sürükleyerek taşıyabilir, köşe ve kenarlarından boyutlandırabilir veya sağ panelden konumunu ayarlayabilirsiniz', 'Image added – drag on canvas to move, drag corners or edges to resize, or adjust position in the right panel')); }; im.src = r.result; };
  r.readAsDataURL(file); e.target.value = '';
};
$('#tools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
new ResizeObserver(() => { if (P && !ui.view3d) render(); if (T3 && ui.view3d) resize3D(); }).observe($('#stage'));
window.addEventListener('beforeunload', () => { if (P) dbPut('state', P, 'auto').catch(() => {}); });
if (localStorage.getItem('fp_theme') === 'light') document.documentElement.dataset.theme = 'light';

applyLangUI();
(async () => {
  await migrateLegacyStorage();
  let saved = null;
  try { saved = await dbGet('state', 'auto'); } catch (e) { }
  if (!saved) { try { saved = JSON.parse(localStorage.getItem('fp_auto') || 'null'); } catch (e) { } }
  if (saved && saved.floors) { loadProject(saved); translateDefaultNames(); refresh(); }
  else { P = newProject(); loadProject(P); templatesModal(); }
  setTimeout(fit, 50);
  aiBridgeBoot();          // connect to a running local bridge, if any
})();
