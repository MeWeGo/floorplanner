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

/* ---------- Katalog ---------- */
// [id, kategori, ad, genişlik, derinlik, yükseklik(3B), ikon, şekil, renk]
const CATS = ['Oturma', 'Yatak Odası', 'Mutfak', 'Banyo', 'Ofis', 'Yapı & Dış'];
const CAT_DEFS = [
  ['sofa3', 0, '3 Kişilik Koltuk', 210, 90, 85, '🛋️', 'sofa', '#a5b4fc'],
  ['sofa2', 0, '2 Kişilik Koltuk', 160, 90, 85, '🛋️', 'sofa', '#a5b4fc'],
  ['armchair', 0, 'Berjer', 85, 85, 85, '💺', 'sofa', '#c4b5fd'],
  ['coffee', 0, 'Orta Sehpa', 100, 55, 40, '▭', 'rect', '#d6b88f'],
  ['tv', 0, 'TV Ünitesi', 180, 40, 50, '📺', 'rect', '#9ca3af'],
  ['table4', 0, '4 Kişilik Masa', 140, 80, 75, '🍽️', 'rect', '#d6b88f'],
  ['table6', 0, '6 Kişilik Masa', 180, 90, 75, '🍽️', 'rect', '#d6b88f'],
  ['tableR', 0, 'Yuvarlak Masa', 110, 110, 75, '⭕', 'round', '#d6b88f'],
  ['chair', 0, 'Sandalye', 45, 45, 45, '🪑', 'rect', '#e5c9a0'],
  ['bookcase', 0, 'Kitaplık', 100, 35, 200, '📚', 'rect', '#b08968'],
  ['rug', 0, 'Halı', 200, 140, 2, '▦', 'rect', '#fca5a5'],
  ['plant', 0, 'Bitki', 40, 40, 90, '🪴', 'round', '#86efac'],
  ['bed2', 1, 'Çift Kişilik Yatak', 160, 200, 50, '🛏️', 'bed', '#fde68a'],
  ['bed1', 1, 'Tek Kişilik Yatak', 100, 200, 50, '🛏️', 'bed', '#fde68a'],
  ['bedK', 1, 'King Yatak', 180, 200, 50, '🛏️', 'bed', '#fde68a'],
  ['bunk', 1, 'Ranza', 100, 200, 160, '🛏️', 'bed', '#fdba74'],
  ['crib', 1, 'Bebek Yatağı', 70, 130, 90, '🍼', 'rect', '#fbcfe8'],
  ['night', 1, 'Komodin', 45, 40, 50, '▫', 'rect', '#d6b88f'],
  ['wardrobe', 1, 'Gardrop', 200, 60, 220, '🚪', 'rect', '#b08968'],
  ['dresser', 1, 'Şifonyer', 120, 45, 90, '🗄️', 'rect', '#b08968'],
  ['vanity', 1, 'Makyaj Masası', 100, 45, 75, '🪞', 'rect', '#d6b88f'],
  ['fridge', 2, 'Buzdolabı', 70, 70, 180, '🧊', 'rect', '#cbd5e1'],
  ['stove', 2, 'Ocak / Fırın', 60, 60, 90, '🔥', 'rect', '#94a3b8'],
  ['sinkK', 2, 'Evye', 120, 60, 90, '🚰', 'rect', '#cbd5e1'],
  ['dish', 2, 'Bulaşık Mak.', 60, 60, 90, '🍽', 'rect', '#cbd5e1'],
  ['counter', 2, 'Tezgâh 120', 120, 60, 90, '▭', 'rect', '#e2e8f0'],
  ['counter2', 2, 'Tezgâh 60', 60, 60, 90, '▭', 'rect', '#e2e8f0'],
  ['island', 2, 'Ada Tezgâh', 180, 90, 90, '▭', 'rect', '#e2e8f0'],
  ['wm', 2, 'Çamaşır Mak.', 60, 60, 85, '🧺', 'rect', '#cbd5e1'],
  ['wc', 3, 'Klozet', 40, 70, 40, '🚽', 'rect', '#f1f5f9'],
  ['basin', 3, 'Lavabo', 60, 45, 85, '🚰', 'rect', '#f1f5f9'],
  ['basin2', 3, 'Çift Lavabo', 120, 50, 85, '🚰', 'rect', '#f1f5f9'],
  ['shower', 3, 'Duş Teknesi', 90, 90, 200, '🚿', 'rect', '#bae6fd'],
  ['tub', 3, 'Küvet', 170, 75, 55, '🛁', 'rect', '#bae6fd'],
  ['bidet', 3, 'Bide', 40, 55, 40, '🚽', 'rect', '#f1f5f9'],
  ['desk', 4, 'Çalışma Masası', 140, 70, 75, '🖥️', 'rect', '#d6b88f'],
  ['deskL', 4, 'L Masa', 180, 140, 75, '🖥️', 'rect', '#d6b88f'],
  ['ochair', 4, 'Ofis Koltuğu', 60, 60, 100, '💺', 'round', '#94a3b8'],
  ['meet', 4, 'Toplantı Masası', 300, 110, 75, '🗣️', 'rect', '#d6b88f'],
  ['shelf', 4, 'Raf Ünitesi', 120, 35, 180, '📚', 'rect', '#b08968'],
  ['printer', 4, 'Yazıcı', 50, 45, 40, '🖨️', 'rect', '#cbd5e1'],
  ['stairs', 5, 'Merdiven', 100, 300, 270, '🪜', 'stairs', '#e2e8f0'],
  ['column', 5, 'Kolon', 40, 40, 270, '', 'round', '#64748b'],
  ['colSq', 5, 'Kare Kolon', 40, 40, 270, '', 'rect', '#64748b'],
  ['car', 5, 'Araba', 180, 450, 150, '🚗', 'rect', '#fca5a5'],
  ['table_o', 5, 'Bahçe Masası', 120, 80, 75, '⛱️', 'rect', '#d6b88f'],
  ['tree', 5, 'Ağaç', 200, 200, 400, '🌳', 'round', '#86efac'],
  ['pool', 5, 'Havuz', 400, 800, 5, '🏊', 'rect', '#7dd3fc'],
  ['fireplace', 5, 'Şömine', 120, 40, 120, '🔥', 'rect', '#94a3b8'],
];
const CATALOG = CAT_DEFS.map(a => ({ id: a[0], cat: a[1], name: a[2], w: a[3], d: a[4], h: a[5], icon: a[6], k: a[7], color: a[8] }));
const BYID = Object.fromEntries(CATALOG.map(c => [c.id, c]));
const OPENINGS = [
  { id: 'door', name: 'Kapı', w: 90, h: 210, sill: 0, icon: '🚪' },
  { id: 'double', name: 'Çift Kanatlı Kapı', w: 160, h: 210, sill: 0, icon: '🚪' },
  { id: 'slide', name: 'Sürgülü Kapı', w: 180, h: 210, sill: 0, icon: '↔️' },
  { id: 'arch', name: 'Açıklık / Kemer', w: 120, h: 210, sill: 0, icon: '⛩️' },
  { id: 'window', name: 'Pencere', w: 120, h: 120, sill: 90, icon: '🪟' },
  { id: 'window2', name: 'Geniş Pencere', w: 200, h: 140, sill: 70, icon: '🪟' },
  { id: 'wsmall', name: 'Küçük Pencere', w: 60, h: 60, sill: 130, icon: '🪟' },
];
const OPDEF = Object.fromEntries(OPENINGS.map(o => [o.id, o]));
const FLOORS = { none: 'Düz renk', wood: 'Parke', tile: 'Fayans', carpet: 'Halı' };
const ROOMCOL = ['#bfdbfe', '#fde68a', '#bbf7d0', '#fecaca', '#e9d5ff', '#fed7aa', '#a5f3fc', '#fbcfe8'];

/* ---------- Proje durumu ---------- */
let P, fi = 0;
let hist = [], hi = -1;
const view = { x: 0, y: 0, z: 0.5 };
let tool = 'select', sel = [], placing = null;
const ui = { snap: true, angle: true, dims: true, cur: null, raw: null, draw: null, typed: '', drag: null, space: false, cat: 0, q: '', view3d: false, dimStart: null, polyPts: null, calib: null, clip: null };
const layersVis = { bg: true, rooms: true, walls: true, furn: true, dims: true };

const newFloor = name => ({ id: uid(), name, walls: [], ops: [], furn: [], rooms: [], dims: [], texts: [] });
const newProject = () => ({ v: 2, name: 'Yeni Proje', grid: 10, gridType: 'square', wallT: 20, wallH: 270, bg: null, floors: [newFloor('Zemin Kat')] });
const F = () => P.floors[fi];
const KINDS = { walls: 'wall', ops: 'op', furn: 'furn', rooms: 'room', dims: 'dim', texts: 'text' };
function find(id, f = F()) {
  for (const arr in KINDS) { const o = f[arr].find(x => x.id === id); if (o) return { kind: KINDS[arr], arr, o }; }
  return null;
}
const selObjs = () => sel.map(id => find(id)).filter(Boolean);

/* ---------- Geometri ---------- */
function segProj(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1e-9;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
  const q = { x: a.x + dx * t, y: a.y + dy * t };
  return { t, q, d: dist(p, q) };
}
const wLen = w => dist(w.a, w.b);
const wAng = w => Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
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
  else if (kind === 'room') pts = o.pts;
  else if (kind === 'op') { const p = opPos(o); pts = p ? [p] : []; }
  else pts = [{ x: o.x, y: o.y }];
  if (!pts.length) return null;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
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
      catch (e2) { toast('Otomatik kayıt başarısız'); }
    }
  }, 350);
}
function restore(s) {
  P = JSON.parse(s); P.gridType = P.gridType || 'square';
  fi = clamp(fi, 0, P.floors.length - 1);
  sel = sel.filter(id => find(id));
  $('#pname').value = P.name; $('#sGrid').value = P.grid; $('#sGridType').value = P.gridType;
  $('#lblAngle').textContent = P.gridType === 'triangle' ? 'Açı 30°' : 'Açı 15°';
  refresh();
}
function undo() { if (hi > 0) { hi--; restore(hist[hi]); autosave(); updateUndo(); } }
function redo() { if (hi < hist.length - 1) { hi++; restore(hist[hi]); autosave(); updateUndo(); } }
function updateUndo() { $('#bUndo').disabled = hi <= 0; $('#bRedo').disabled = hi >= hist.length - 1; }
function loadProject(obj, msg) {
  P = obj; if (!P.floors || !P.floors.length) P.floors = [newFloor('Zemin Kat')];
  P.grid = P.grid || 10; P.gridType = P.gridType || 'square'; P.wallT = P.wallT || 20; P.wallH = P.wallH || 270;
  P.floors.forEach(f => { for (const k in KINDS) f[k] = f[k] || []; });
  fi = 0; sel = []; ui.draw = null; ui.dimStart = null; ui.polyPts = null; placing = null;
  hist = [JSON.stringify(P)]; hi = 0;
  $('#pname').value = P.name; $('#sGrid').value = String(P.grid); $('#sGridType').value = P.gridType;
  $('#lblAngle').textContent = P.gridType === 'triangle' ? 'Açı 30°' : 'Açı 15°';
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
  if (!b) b = { x0: 0, y0: 0, x1: 1000, y1: 700 };
  const bw = Math.max(b.x1 - b.x0, 200), bh = Math.max(b.y1 - b.y0, 200);
  view.z = clamp(Math.min(s.w / bw, s.h / bh) * 0.8, 0.05, 3);
  view.x = s.w / 2 - (b.x0 + b.x1) / 2 * view.z; view.y = s.h / 2 - (b.y0 + b.y1) / 2 * view.z;
  render();
}

/* ---------- Çizim (SVG) ---------- */
const WALL_C = '#1f2937', STROKE = '#475569';
function defsSvg() {
  const s = P.grid, h = +(s * Math.sqrt(3) / 2).toFixed(4), h2 = +(2 * h).toFixed(4);
  const ms = s >= 25 ? s * 4 : 100, mh = +(ms * Math.sqrt(3) / 2).toFixed(4), mh2 = +(2 * mh).toFixed(4);
  const swMin = 0.65 / view.z, swMaj = 0.95 / view.z, rDot = Math.max(1.1, 1.5 / view.z), rDotM = Math.max(1.8, 2.3 / view.z);
  return `
  <pattern id="p-wood" width="120" height="24" patternUnits="userSpaceOnUse"><path d="M0 0H120M0 12H120M40 0V12M90 12V24" stroke="#92400e" stroke-opacity=".28" fill="none" stroke-width="1"/></pattern>
  <pattern id="p-tile" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M0 0H60V60" stroke="#475569" stroke-opacity=".3" fill="none" stroke-width="1"/></pattern>
  <pattern id="p-carpet" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.1" fill="#6b7280" fill-opacity=".35"/><circle cx="7.5" cy="7.5" r="1.1" fill="#6b7280" fill-opacity=".35"/></pattern>
  <pattern id="g-minor" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><path d="M${s} 0V${s}H0" fill="none" stroke="#cbd5e1" stroke-width="${swMin}" stroke-opacity=".7"/></pattern>
  <pattern id="g-major" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M100 0V100H0" fill="none" stroke="#94a3b8" stroke-width="${swMaj}" stroke-opacity=".8"/></pattern>
  <pattern id="g-tri-minor" width="${s}" height="${h2}" patternUnits="userSpaceOnUse"><path d="M0 0H${s}M0 ${h}H${s}M0 0L${s / 2} ${h}L0 ${h2}M${s / 2} 0L${s} ${h}L${s / 2} ${h2}M${s / 2} 0L0 ${h}L${s / 2} ${h2}M${s} 0L${s / 2} ${h}L${s} ${h2}" fill="none" stroke="#cbd5e1" stroke-width="${swMin}" stroke-opacity=".75"/></pattern>
  <pattern id="g-tri-major" width="${ms}" height="${mh2}" patternUnits="userSpaceOnUse"><path d="M0 0H${ms}M0 ${mh}H${ms}M0 0L${ms / 2} ${mh}L0 ${mh2}M${ms / 2} 0L${ms} ${mh}L${ms / 2} ${mh2}M${ms / 2} 0L0 ${mh}L${ms / 2} ${mh2}M${ms} 0L${ms / 2} ${mh}L${ms} ${mh2}" fill="none" stroke="#94a3b8" stroke-width="${swMaj}" stroke-opacity=".65"/></pattern>
  <pattern id="g-dots-minor" width="${s}" height="${s}" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="${rDot}" fill="#94a3b8" fill-opacity=".75"/></pattern>
  <pattern id="g-dots-major" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r="${rDotM}" fill="#64748b" fill-opacity=".9"/></pattern>`;
}
function gridSvg() {
  const gt = P.gridType || 'square';
  if (gt === 'none') return '';
  const s = svgSize(), x0 = -view.x / view.z, y0 = -view.y / view.z, w = s.w / view.z, h = s.h / view.z;
  let out = '';
  const minId = gt === 'triangle' ? 'g-tri-minor' : gt === 'dots' ? 'g-dots-minor' : 'g-minor';
  const majId = gt === 'triangle' ? 'g-tri-major' : gt === 'dots' ? 'g-dots-major' : 'g-major';
  if (P.grid * view.z >= 6) out += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#${minId})"/>`;
  if (view.z > 0.12) out += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#${majId})"/>`;
  return out;
}
function bgSvg() {
  const b = P.bg; if (!b) return '';
  return `<image href="${b.src}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" opacity="${b.op}" preserveAspectRatio="none" pointer-events="none"/>`;
}
function roomSvg(r, live) {
  const pts = r.pts.map(p => p.x + ',' + p.y).join(' ');
  const c = polyCentroid(r.pts), area = polyArea(r.pts);
  const fs = clamp(Math.sqrt(area) / 12, 16, 34);
  let s = `<polygon points="${pts}" fill="${r.color}" fill-opacity=".55" pointer-events="none"/>`;
  if (r.floor && r.floor !== 'none') s += `<polygon points="${pts}" fill="url(#p-${r.floor})" pointer-events="none"/>`;
  const t1 = esc(r.name), t2 = fmtArea(area);
  const bw = Math.max(t1.length, t2.length) * fs * 0.58 + 10;
  const lab = `<g ${live ? `data-id="${r.id}"` : ''} style="cursor:pointer"><rect x="${c.x - bw / 2}" y="${c.y - fs * 0.9}" width="${bw}" height="${fs * 2.1}" fill="#fff" fill-opacity="0" />
    <text x="${c.x}" y="${c.y}" text-anchor="middle" font-size="${fs}" font-weight="700" fill="#1e293b" font-family="Segoe UI,sans-serif">${t1}</text>
    <text x="${c.x}" y="${c.y + fs * 1.05}" text-anchor="middle" font-size="${fs * 0.8}" fill="#475569" font-family="Segoe UI,sans-serif">${t2}</text></g>`;
  return [s, lab];
}
function wallSvg(w, live) {
  let s = `<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${WALL_C}" stroke-width="${w.t}" stroke-linecap="square" pointer-events="none"/>`;
  if (live) s += `<line data-id="${w.id}" x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="transparent" stroke-width="${Math.max(w.t, 12 / view.z)}" pointer-events="stroke" style="cursor:pointer"/>`;
  return s;
}
function wallDimSvg(w) {
  const L = wLen(w); if (L < 30) return '';
  let ang = wAng(w) * 180 / Math.PI; const mx = (w.a.x + w.b.x) / 2, my = (w.a.y + w.b.y) / 2;
  let flip = 1; if (ang > 90 || ang <= -90) { ang += 180; flip = -1; }
  const fs = clamp(13 / view.z, 9, 40), off = w.t / 2 + fs * 0.9;
  return `<text transform="translate(${mx} ${my}) rotate(${ang}) translate(0 ${-off})" text-anchor="middle" font-size="${fs}" fill="#334155" stroke="#fff" stroke-width="${fs * 0.25}" paint-order="stroke" font-family="Segoe UI,sans-serif" pointer-events="none">${fmtLen(L)}</text>`;
}
function opSvg(op, live) {
  const p = opPos(op); if (!p) return '';
  const w = op.w, t = p.t, hw = w / 2, ht = t / 2, sd = op.side || 1, sw = sd > 0 ? 1 : 0;
  const stk = `stroke="${STROKE}" fill="none" stroke-width="2"`;
  let s = `<g transform="translate(${p.x} ${p.y}) rotate(${p.ang})">`;
  s += `<rect x="${-hw}" y="${-ht - 1}" width="${w}" height="${t + 2}" fill="#fff"/>`;
  s += `<g transform="scale(${op.flip ? -1 : 1} 1)">`;
  if (op.type === 'door') {
    s += `<line x1="${-hw}" y1="0" x2="${-hw}" y2="${sd * w}" ${stk}/><path d="M${hw} 0A${w} ${w} 0 0 ${sw} ${-hw} ${sd * w}" stroke="#94a3b8" fill="none" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  } else if (op.type === 'double') {
    const l = w / 2;
    s += `<line x1="${-hw}" y1="0" x2="${-hw}" y2="${sd * l}" ${stk}/><line x1="${hw}" y1="0" x2="${hw}" y2="${sd * l}" ${stk}/>
    <path d="M0 0A${l} ${l} 0 0 ${sw} ${-hw} ${sd * l}M0 0A${l} ${l} 0 0 ${1 - sw} ${hw} ${sd * l}" stroke="#94a3b8" fill="none" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  } else if (op.type === 'slide') {
    s += `<rect x="${-hw}" y="${-ht * 0.7}" width="${w * 0.55}" height="${ht * 0.7}" ${stk}/><rect x="${-hw + w * 0.45}" y="0" width="${w * 0.55}" height="${ht * 0.7}" ${stk}/>`;
  } else if (op.type === 'arch') {
    s += `<line x1="${-hw}" y1="${-ht}" x2="${hw}" y2="${-ht}" stroke="#94a3b8" stroke-dasharray="5 4" stroke-width="1.2"/><line x1="${-hw}" y1="${ht}" x2="${hw}" y2="${ht}" stroke="#94a3b8" stroke-dasharray="5 4" stroke-width="1.2"/>`;
  } else {
    s += `<rect x="${-hw}" y="${-ht}" width="${w}" height="${t}" fill="#e0f2fe" ${stk.replace('fill="none"', '')}/><line x1="${-hw}" y1="0" x2="${hw}" y2="0" stroke="${STROKE}" stroke-width="1.4"/>`;
  }
  s += `</g>`;
  s += `<line x1="${-hw}" y1="${-ht}" x2="${-hw}" y2="${ht}" stroke="${WALL_C}" stroke-width="2"/><line x1="${hw}" y1="${-ht}" x2="${hw}" y2="${ht}" stroke="${WALL_C}" stroke-width="2"/>`;
  if (live) s += `<rect data-id="${op.id}" x="${-hw}" y="${-Math.max(ht, 8 / view.z) - 4}" width="${w}" height="${2 * Math.max(ht, 8 / view.z) + 8}" fill="transparent" style="cursor:pointer"/>`;
  return s + '</g>';
}
function furnBody(f) {
  const hw = f.w / 2, hd = f.d / 2, col = f.color, sk = '#475569';
  let s = '';
  if (f.k === 'round') s += `<ellipse rx="${hw}" ry="${hd}" fill="${col}" stroke="${sk}" stroke-width="2"/>`;
  else if (f.k === 'stairs') {
    s += `<rect x="${-hw}" y="${-hd}" width="${f.w}" height="${f.d}" fill="${col}" stroke="${sk}" stroke-width="2"/>`;
    const n = Math.max(3, Math.round(f.d / 25)); let l = '';
    for (let i = 1; i < n; i++) l += `M${-hw} ${-hd + f.d / n * i}H${hw}`;
    s += `<path d="${l}" stroke="${sk}" stroke-width="1.2" fill="none"/><path d="M0 ${hd - 10}V${-hd + 14}M-8 ${-hd + 26}L0 ${-hd + 12}L8 ${-hd + 26}" stroke="${sk}" stroke-width="2" fill="none"/>`;
  } else {
    s += `<rect x="${-hw}" y="${-hd}" width="${f.w}" height="${f.d}" rx="${Math.min(6, hw / 3)}" fill="${col}" stroke="${sk}" stroke-width="2"/>`;
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
  const fs = Math.max(12, Math.min(f.w, f.d) * 0.42);
  let s = `<g transform="translate(${f.x} ${f.y}) rotate(${f.rot})" ${live ? `data-id="${f.id}" style="cursor:move"` : ''}>${furnBody(f)}`;
  if (f.icon) s += `<text transform="rotate(${-f.rot})" text-anchor="middle" dominant-baseline="central" font-size="${fs}" pointer-events="none">${f.icon}</text>`;
  if (f.label) s += `<text transform="rotate(${-f.rot})" y="${Math.min(f.d, f.w) * 0.42 + 6}" text-anchor="middle" font-size="${clamp(Math.min(f.w, f.d) * 0.18, 10, 18)}" fill="#1e293b" stroke="#fff" stroke-width="3" paint-order="stroke" pointer-events="none" font-family="Segoe UI,sans-serif">${esc(f.label)}</text>`;
  return s + '</g>';
}
function dimSvg(d, live) {
  const L = dist(d.a, d.b); if (L < 1) return '';
  const ux = (d.b.x - d.a.x) / L, uy = (d.b.y - d.a.y) / L, nx = -uy, ny = ux, o = d.off ?? 40;
  const A = { x: d.a.x + nx * o, y: d.a.y + ny * o }, B = { x: d.b.x + nx * o, y: d.b.y + ny * o };
  let ang = Math.atan2(uy, ux) * 180 / Math.PI; if (ang > 90 || ang <= -90) ang += 180;
  const fs = 14, tk = 7, c = '#0f766e', sg = o >= 0 ? 1 : -1;
  const ext = `M${d.a.x + nx * 5 * sg} ${d.a.y + ny * 5 * sg}L${A.x + nx * 6 * sg} ${A.y + ny * 6 * sg}M${d.b.x + nx * 5 * sg} ${d.b.y + ny * 5 * sg}L${B.x + nx * 6 * sg} ${B.y + ny * 6 * sg}`;
  let s = `<g ${live ? `data-id="${d.id}" style="cursor:pointer"` : ''}><path d="${ext}M${A.x} ${A.y}L${B.x} ${B.y}" stroke="${c}" stroke-width="1.3" fill="none"/>`;
  for (const P2 of [A, B]) s += `<path d="M${P2.x - (ux + nx) * tk * .7} ${P2.y - (uy + ny) * tk * .7}L${P2.x + (ux + nx) * tk * .7} ${P2.y + (uy + ny) * tk * .7}" stroke="${c}" stroke-width="2"/>`;
  s += `<text transform="translate(${(A.x + B.x) / 2} ${(A.y + B.y) / 2}) rotate(${ang}) translate(0 ${-5})" text-anchor="middle" font-size="${fs}" fill="${c}" stroke="#fff" stroke-width="3" paint-order="stroke" font-family="Segoe UI,sans-serif">${fmtLen(L)}</text>`;
  if (live) s += `<path d="M${A.x} ${A.y}L${B.x} ${B.y}" stroke="transparent" stroke-width="${Math.max(10, 10 / view.z)}"/>`;
  return s + '</g>';
}
function textSvg(t, live) {
  return `<text ${live ? `data-id="${t.id}" style="cursor:move"` : ''} transform="translate(${t.x} ${t.y}) rotate(${t.rot || 0})" font-size="${t.size}" fill="${t.color}" font-family="Segoe UI,sans-serif" font-weight="600">${esc(t.text)}</text>`;
}
function layerStrings(f, live) {
  return {
    rooms: f.rooms.map(r => roomSvg(r, live)[0]).join(''),
    roomLabels: f.rooms.map(r => roomSvg(r, live)[1]).join(''),
    walls: f.walls.map(w => wallSvg(w, live)).join('') + (ui.dims ? f.walls.map(wallDimSvg).join('') : ''),
    ops: f.ops.map(o => opSvg(o, live)).join(''),
    furn: f.furn.map(x => furnSvg(x, live)).join(''),
    dims: f.dims.map(d => dimSvg(d, live)).join(''),
    texts: f.texts.map(t => textSvg(t, live)).join(''),
  };
}
function handleSvg() {
  const z = view.z, hs = 6 / z, os = selObjs(); let s = '';
  const hnd = (x, y, id, cur = 'pointer', shape = 'rect') => shape === 'rect'
    ? `<rect data-h="${id}" x="${x - hs}" y="${y - hs}" width="${hs * 2}" height="${hs * 2}" fill="#fff" stroke="#f59e0b" stroke-width="${1.6 / z}" style="cursor:${cur}"/>`
    : `<circle data-h="${id}" cx="${x}" cy="${y}" r="${hs * 1.15}" fill="#f59e0b" stroke="#fff" stroke-width="${1.6 / z}" style="cursor:${cur}"/>`;
  for (const { kind, o } of os) {
    if (kind === 'wall') s += `<line x1="${o.a.x}" y1="${o.a.y}" x2="${o.b.x}" y2="${o.b.y}" stroke="#f59e0b" stroke-opacity=".45" stroke-width="${o.t + 6 / z}" stroke-linecap="square" pointer-events="none"/>`
      + `<text transform="translate(${(o.a.x + o.b.x) / 2} ${(o.a.y + o.b.y) / 2})" font-size="${14 / z}" text-anchor="middle" dy="${-o.t / 2 - 6 / z}" fill="#b45309" font-weight="700" stroke="#fff" stroke-width="${3 / z}" paint-order="stroke" pointer-events="none">${fmtLen(wLen(o))}</text>`;
    if (kind === 'furn') {
      s += `<g transform="translate(${o.x} ${o.y}) rotate(${o.rot})" pointer-events="none"><rect x="${-o.w / 2}" y="${-o.d / 2}" width="${o.w}" height="${o.d}" fill="none" stroke="#f59e0b" stroke-width="${2 / z}" stroke-dasharray="${6 / z} ${4 / z}"/></g>`;
    }
    if (kind === 'room') s += `<polygon points="${o.pts.map(p => p.x + ',' + p.y).join(' ')}" fill="#f59e0b" fill-opacity=".12" stroke="#f59e0b" stroke-width="${2 / z}" stroke-dasharray="${6 / z} ${4 / z}" pointer-events="none"/>`;
    if (kind === 'op') { const p = opPos(o); if (p) s += `<g transform="translate(${p.x} ${p.y}) rotate(${p.ang})" pointer-events="none"><rect x="${-o.w / 2 - 3}" y="${-p.t / 2 - 5}" width="${o.w + 6}" height="${p.t + 10}" fill="#f59e0b" fill-opacity=".2" stroke="#f59e0b" stroke-width="${1.6 / z}"/></g>`; }
    if (kind === 'dim') s += `<circle cx="${o.a.x}" cy="${o.a.y}" r="${hs}" fill="#f59e0b"/><circle cx="${o.b.x}" cy="${o.b.y}" r="${hs}" fill="#f59e0b"/>`;
    if (kind === 'text') s += `<circle cx="${o.x}" cy="${o.y}" r="${hs}" fill="#f59e0b"/>`;
  }
  if (os.length === 1) {
    const { kind, o } = os[0];
    if (kind === 'wall') s += hnd(o.a.x, o.a.y, 'wa', 'move') + hnd(o.b.x, o.b.y, 'wb', 'move');
    if (kind === 'room') o.pts.forEach((p, i) => s += hnd(p.x, p.y, 'v' + i, 'move'));
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
function mkWall(a, b) { return { id: uid(), a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, t: P.wallT, h: P.wallH }; }
function opType(id) { return id.startsWith('window') || id === 'wsmall' ? 'window' : id; }
function mkOp(def, wall, d) {
  const L = wLen(wall); const w = def.w;
  return { id: uid(), wall: wall.id, d: L >= w ? clamp(d, w / 2, L - w / 2) : L / 2, w, h: def.h, sill: def.sill, type: opType(def.id), flip: 0, side: 1 };
}
function mkFurn(def, x, y, rot = 0) { return { id: uid(), type: def.id, name: def.name, icon: def.icon, k: def.k, w: def.w, d: def.d, h: def.h, color: def.color, x, y, rot, label: '' }; }
function mkRoom(pts, name) {
  const n = F().rooms.length;
  return { id: uid(), name: name || 'Oda ' + (n + 1), color: ROOMCOL[n % ROOMCOL.length], floor: 'none', pts };
}
function addRectWalls(x0, y0, x1, y1) {
  const f = F(), xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
  const ws = [mkWall({ x: xa, y: ya }, { x: xb, y: ya }), mkWall({ x: xb, y: ya }, { x: xb, y: yb }), mkWall({ x: xb, y: yb }, { x: xa, y: yb }), mkWall({ x: xa, y: yb }, { x: xa, y: ya })];
  f.walls.push(...ws); return ws;
}
function deleteIds(ids) {
  const f = F(), s = new Set(ids);
  f.walls = f.walls.filter(w => !s.has(w.id));
  const wl = new Set(f.walls.map(w => w.id));
  f.ops = f.ops.filter(o => !s.has(o.id) && wl.has(o.wall));
  for (const k of ['furn', 'rooms', 'dims', 'texts']) f[k] = f[k].filter(o => !s.has(o.id));
  sel = sel.filter(id => !s.has(id));
}
function deleteSel() { if (!sel.length) return; deleteIds(sel); commit(); refresh(); }

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
function autoRoomAt(p, silent) {
  const r = detectRoom(p);
  if (r === 'open') { if (!silent) toast('Alan kapalı değil – duvarlar arasında boşluk var'); return null; }
  if (!r) { if (!silent) toast('Burada oda algılanamadı (duvarın üzerine tıkladınız mı?)'); return null; }
  const rm = mkRoom(r); F().rooms.push(rm); return rm;
}

/* ---------- Araçlar ---------- */
const TOOLS = [
  ['select', '↖', 'Seç', 'V'], ['pan', '✋', 'Kaydır', 'H'], null,
  ['wall', '🧱', 'Duvar', 'W'], ['rect', '⬜', 'Oda duvar', 'R'], ['room', '🏠', 'Oda algıla', 'O'], ['poly', '⬠', 'Oda çiz', 'P'], null,
  ['door', '🚪', 'Kapı', 'D'], ['window', '🪟', 'Pencere', 'N'], ['furn', '🛋️', 'Mobilya', 'F'], null,
  ['dim', '📏', 'Ölçü', 'M'], ['text', '🔤', 'Metin', 'T'], ['eraser', '🧽', 'Sil', 'E'], ['calib', '⚖️', 'Ölçek', 'C'],
];
const HINTS = {
  select: 'Seç: tıkla / kutu çiz • Shift: çoklu seçim • sürükle: taşı • Del: sil',
  pan: 'Kaydır: sürükle • Tekerlek: yakınlaştır',
  wall: 'Duvar: tıkla ile başla, devam ettikçe zincir • rakam yaz + Enter: tam uzunluk • çift tık / Esc: bitir • Shift: yakalamayı kapat',
  rect: 'Dikdörtgen oda: köşeden köşeye sürükle (4 duvar + oda oluşturur)',
  room: 'Kapalı bir alanın içine tıkla: oda otomatik algılanır (alan ve ölçüler hesaplanır)',
  poly: 'Oda çiz: köşelere tıkla • ilk noktaya tıkla / Enter: tamamla • Esc: iptal',
  place: 'Yerleştir: tıkla • R: döndür • Esc / sağ tık: bitir',
  dim: 'Ölçü: iki noktaya tıkla',
  text: 'Metin eklemek için tıkla',
  eraser: 'Silmek istediğin nesneye tıkla',
  calib: 'Ölçek: arka plan görselinde bilinen iki noktaya tıkla, gerçek mesafeyi gir',
};
function buildTools() {
  $('#tools').innerHTML = TOOLS.map(t => t ? `<button class="tool" data-tool="${t[0]}" title="${t[2]} (${t[3]})"><span>${t[1]}</span><small>${t[2]}</small></button>` : '<div class="tdiv"></div>').join('');
}
function updateTools() {
  document.querySelectorAll('.tool').forEach(b => b.classList.toggle('on', b.dataset.tool === ui.btn));
  $('#hud').textContent = HINTS[tool] || '';
  $('#hud').style.display = ui.view3d ? 'none' : '';
  cv.style.cursor = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  document.querySelectorAll('#items .item').forEach(el => el.classList.toggle('on', !!placing && el.dataset.id === placing.def.id));
}
function setTool(t) {
  ui.draw = null; ui.typed = ''; ui.dimStart = null; ui.polyPts = null; ui.calib = null; ui.drag = null;
  ui.btn = t; placing = null;
  if (t === 'door') { placing = { type: 'op', def: OPDEF.door, rot: 0 }; tool = 'place'; }
  else if (t === 'window') { placing = { type: 'op', def: OPDEF.window, rot: 0 }; tool = 'place'; }
  else if (t === 'furn') { ui.cat = ui.cat === 0 ? 1 : ui.cat; buildLib(); $('#search').focus(); tool = 'select'; ui.btn = 'select'; toast('Soldaki listeden bir mobilya seç'); }
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
  const g = $('#gPv'), z = view.z, cur = ui.cur; let s = '';
  const lbl = (x, y, t) => `<text x="${x}" y="${y}" font-size="${13 / z}" font-weight="700" fill="#0f172a" stroke="#fff" stroke-width="${3.5 / z}" paint-order="stroke" text-anchor="middle" pointer-events="none">${t}</text>`;
  if (cur && cur.hit === 'end') s += `<circle cx="${cur.x}" cy="${cur.y}" r="${8 / z}" fill="none" stroke="#10b981" stroke-width="${2 / z}"/>`;
  if (tool === 'wall' && cur) {
    if (ui.draw) {
      const a = ui.draw.start;
      s += `<line x1="${a.x}" y1="${a.y}" x2="${cur.x}" y2="${cur.y}" stroke="#6366f1" stroke-opacity=".6" stroke-width="${P.wallT}" stroke-linecap="square"/>`;
      const L = dist(a, cur), ang = (Math.atan2(cur.y - a.y, cur.x - a.x) * 180 / Math.PI + 360) % 360;
      s += lbl((a.x + cur.x) / 2, (a.y + cur.y) / 2 - P.wallT / 2 - 8 / z, ui.typed ? `[${ui.typed} cm]` : `${fmtLen(L)}  •  ${Math.round(ang)}°`);
      s += `<circle cx="${a.x}" cy="${a.y}" r="${4 / z}" fill="#6366f1"/>`;
    } else s += `<circle cx="${cur.x}" cy="${cur.y}" r="${4 / z}" fill="#6366f1"/>`;
  }
  const d = ui.drag;
  if (d && d.type === 'rect' && cur) {
    const x0 = Math.min(d.start.x, cur.x), y0 = Math.min(d.start.y, cur.y), w = Math.abs(cur.x - d.start.x), h = Math.abs(cur.y - d.start.y);
    s += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#6366f1" fill-opacity=".1" stroke="#6366f1" stroke-width="${P.wallT}" stroke-opacity=".5"/>`;
    s += lbl(x0 + w / 2, y0 - P.wallT / 2 - 8 / z, `${fmtLen(w)} × ${fmtLen(h)} = ${fmtArea(w * h)}`);
  }
  if (d && d.type === 'box') {
    s += `<rect x="${Math.min(d.start.x, d.cur.x)}" y="${Math.min(d.start.y, d.cur.y)}" width="${Math.abs(d.cur.x - d.start.x)}" height="${Math.abs(d.cur.y - d.start.y)}" fill="#6366f1" fill-opacity=".1" stroke="#6366f1" stroke-width="${1.5 / z}" stroke-dasharray="${5 / z}"/>`;
  }
  if (tool === 'poly' && ui.polyPts && cur) {
    const pts = [...ui.polyPts, cur];
    s += `<polygon points="${pts.map(p => p.x + ',' + p.y).join(' ')}" fill="#6366f1" fill-opacity=".12" stroke="#6366f1" stroke-width="${2 / z}"/>`;
    ui.polyPts.forEach(p => s += `<circle cx="${p.x}" cy="${p.y}" r="${4 / z}" fill="#6366f1"/>`);
    if (pts.length > 2) s += lbl(cur.x, cur.y - 14 / z, fmtArea(polyArea(pts)));
  }
  if (tool === 'dim' && ui.dimStart && cur) s += `<line x1="${ui.dimStart.x}" y1="${ui.dimStart.y}" x2="${cur.x}" y2="${cur.y}" stroke="#0f766e" stroke-width="${2 / z}" stroke-dasharray="${5 / z}"/>` + lbl((ui.dimStart.x + cur.x) / 2, (ui.dimStart.y + cur.y) / 2 - 8 / z, fmtLen(dist(ui.dimStart, cur)));
  if (tool === 'calib' && ui.calib && cur) s += `<line x1="${ui.calib.x}" y1="${ui.calib.y}" x2="${cur.x}" y2="${cur.y}" stroke="#e11d48" stroke-width="${2 / z}"/>`;
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
  ui.cur = ['wall', 'rect', 'poly', 'dim', 'calib'].includes(tool) ? snapPt(raw, from, e) : null;
  if (tool === 'wall' && ui.draw && ui.typed) {
    const a = ui.draw.start, l = parseFloat(ui.typed) || 0, dx = ui.cur.x - a.x, dy = ui.cur.y - a.y, m = Math.hypot(dx, dy) || 1;
    ui.cur = { x: a.x + dx / m * l, y: a.y + dy / m * l, hit: null };
  }
  $('#coords').textContent = `x: ${(raw.x / 100).toFixed(2)} m   y: ${(raw.y / 100).toFixed(2)} m`;
}
cv.addEventListener('contextmenu', e => { e.preventDefault(); if (tool === 'place' || tool === 'wall' || tool === 'poly') { setTool('select'); } });
cv.addEventListener('wheel', e => {
  e.preventDefault(); const r = cv.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });
cv.addEventListener('dblclick', e => {
  if (tool === 'wall') { ui.draw = null; ui.typed = ''; render(); }
  else if (tool === 'poly') finishPoly();
  else if (tool === 'select') {
    const t = e.target.closest('[data-id]'); const o = t && find(t.dataset.id);
    if (o && o.kind === 'room') { const n = prompt('Oda adı:', o.o.name); if (n) { o.o.name = n; commit(); refresh(); } }
    else if (o && o.kind === 'text') { const n = prompt('Metin:', o.o.text); if (n) { o.o.text = n; commit(); refresh(); } }
  }
});
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); setCursor(e);
  const raw = ui.raw, cur = ui.cur;
  if (e.button === 1 || tool === 'pan' || ui.space) { ui.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; cv.style.cursor = 'grabbing'; return; }
  if (e.button !== 0) return;
  const f = F();
  switch (tool) {
    case 'select': {
      const h = e.target.closest('[data-h]');
      if (h) { startHandle(h.dataset.h, raw); return; }
      const t = e.target.closest('[data-id]');
      if (t) {
        const id = t.dataset.id;
        if (e.shiftKey) { sel = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]; }
        else if (!sel.includes(id)) sel = [id];
        renderProps(); startMove(raw);
      } else { if (!e.shiftKey) sel = []; ui.drag = { type: 'box', start: raw, cur: raw, moved: false }; renderProps(); }
      render(); return;
    }
    case 'wall': {
      if (!ui.draw) { ui.draw = { start: { x: cur.x, y: cur.y } }; }
      else {
        const a = ui.draw.start;
        if (dist(a, cur) < 5) { ui.draw = null; ui.typed = ''; }
        else { f.walls.push(mkWall(a, cur)); commit(); ui.draw = { start: { x: cur.x, y: cur.y } }; ui.typed = ''; if (cur.hit === 'end' && closesLoop(cur)) { ui.draw = null; toast('Döngü kapandı – “Oda algıla” aracı ile oda ekleyebilirsin'); } }
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
    case 'dim': {
      if (!ui.dimStart) ui.dimStart = { x: cur.x, y: cur.y };
      else if (dist(ui.dimStart, cur) > 5) { const d = { id: uid(), a: ui.dimStart, b: { x: cur.x, y: cur.y }, off: 40 }; f.dims.push(d); sel = [d.id]; ui.dimStart = null; commit(); refresh(); }
      render(); return;
    }
    case 'text': { const sp = ui.snap ? snapToGrid(raw) : raw; const t = { id: uid(), x: sp.x, y: sp.y, text: 'Metin', size: 24, color: '#1e293b', rot: 0 }; f.texts.push(t); sel = [t.id]; commit(); setTool('select'); refresh(); return; }
    case 'eraser': {
      const t = e.target.closest('[data-id]'); if (t) { deleteIds([t.dataset.id]); commit(); refresh(); } return;
    }
    case 'calib': {
      if (!P.bg) { toast('Önce bir arka plan görseli ekle (sağ panel)'); return; }
      if (!ui.calib) ui.calib = { x: cur.x, y: cur.y };
      else {
        const px = dist(ui.calib, cur); if (px < 2) return;
        const real = parseFloat(String(prompt('Bu iki nokta arasındaki gerçek mesafe (metre):', '3') || '').replace(',', '.'));
        if (real > 0) {
          const k = real * 100 / px, a = ui.calib, b = P.bg;
          b.x = a.x + (b.x - a.x) * k; b.y = a.y + (b.y - a.y) * k; b.w *= k; b.h *= k;
          commit(); toast('Ölçek ayarlandı'); fit();
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
function placeAt(raw) {
  const f = F();
  if (!ui.ghost) { if (placing.type === 'op') toast('Kapı/pencere için bir duvarın yakınına tıkla'); return; }
  if (placing.type === 'furn') { const o = { ...ui.ghost, id: uid() }; f.furn.push(o); sel = [o.id]; }
  else {
    const g = ui.ghost, o = { ...g, id: uid() }; f.ops.push(o); sel = [o.id];
  }
  commit(); refresh();
}
cv.addEventListener('pointermove', e => {
  setCursor(e); const d = ui.drag;
  if (d) {
    if (d.type === 'pan') { view.x = d.vx + e.clientX - d.sx; view.y = d.vy + e.clientY - d.sy; render(); return; }
    if (d.type === 'box') { d.cur = ui.raw; d.moved = true; drawPreview(); return; }
    if (d.type === 'move') { doMove(ui.raw, e); return; }
    if (d.type === 'handle') { doHandle(ui.raw, e); return; }
  }
  updateGhost(); drawPreview();
});
cv.addEventListener('pointerup', e => {
  const d = ui.drag; if (!d) return; ui.drag = null; setCursor(e);
  if (d.type === 'pan') { updateTools(); return; }
  if (d.type === 'box') {
    if (d.moved && dist(d.start, d.cur) > 4 / view.z) {
      const x0 = Math.min(d.start.x, d.cur.x), x1 = Math.max(d.start.x, d.cur.x), y0 = Math.min(d.start.y, d.cur.y), y1 = Math.max(d.start.y, d.cur.y);
      const f = F(), ids = new Set(sel);
      for (const arr in KINDS) for (const o of f[arr]) {
        const bb = bboxOf(KINDS[arr], o); if (!bb) continue;
        const inside = bb.x0 >= x0 && bb.x1 <= x1 && bb.y0 >= y0 && bb.y1 <= y1;
        const inter = bb.x1 >= x0 && bb.x0 <= x1 && bb.y1 >= y0 && bb.y0 <= y1;
        const rm = KINDS[arr] === 'room' || KINDS[arr] === 'dim';
        if (rm ? inside : (KINDS[arr] === 'wall' ? inside : inter)) ids.add(o.id);
      }
      sel = [...ids];
    }
    refresh(); return;
  }
  if (d.type === 'rect') {
    const c = ui.cur;
    if (Math.abs(c.x - d.start.x) > 30 && Math.abs(c.y - d.start.y) > 30) {
      const ws = addRectWalls(d.start.x, d.start.y, c.x, c.y);
      const rm = mkRoom([{ x: Math.min(d.start.x, c.x) + P.wallT / 2, y: Math.min(d.start.y, c.y) + P.wallT / 2 }, { x: Math.max(d.start.x, c.x) - P.wallT / 2, y: Math.min(d.start.y, c.y) + P.wallT / 2 }, { x: Math.max(d.start.x, c.x) - P.wallT / 2, y: Math.max(d.start.y, c.y) - P.wallT / 2 }, { x: Math.min(d.start.x, c.x) + P.wallT / 2, y: Math.max(d.start.y, c.y) - P.wallT / 2 }]);
      F().rooms.push(rm); sel = [rm.id]; commit();
    }
    refresh(); return;
  }
  if (d.type === 'move' || d.type === 'handle') { if (d.moved) commit(); refresh(); }
});

/* ---------- Taşıma ---------- */
function startMove(raw) {
  const objs = selObjs(), orig = new Map(), conn = [];
  for (const { o } of objs) orig.set(o.id, JSON.parse(JSON.stringify(o)));
  const selWalls = objs.filter(x => x.kind === 'wall').map(x => x.o), sset = new Set(selWalls.map(w => w.id));
  if (selWalls.length) for (const w of F().walls) {
    if (sset.has(w.id)) continue;
    for (const e of ['a', 'b']) for (const sw of selWalls) for (const se of ['a', 'b']) if (dist(w[e], sw[se]) < 1) { conn.push({ w, e, o: { x: w[e].x, y: w[e].y } }); }
  }
  const first = objs[0]; let anchor = { x: raw.x, y: raw.y };
  if (first) { const o = orig.get(first.o.id); anchor = first.kind === 'wall' || first.kind === 'dim' ? o.a : first.kind === 'room' ? o.pts[0] : first.kind === 'op' ? anchor : { x: o.x, y: o.y }; }
  ui.drag = { type: 'move', start: raw, orig, conn, anchor, moved: false };
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
    else if (kind === 'room') o.pts = g.pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
    else if (kind === 'furn') {
      o.x = g.x + dx; o.y = g.y + dy;
      if (sel.length === 1) { o.rot = g.rot; const r0 = o.rot; magnet(o); if (e.shiftKey) { o.x = g.x + dx; o.y = g.y + dy; o.rot = g.rot; } }
    }
    else if (kind === 'text') { o.x = g.x + dx; o.y = g.y + dy; }
    else if (kind === 'op') {
      const n = wallNear(raw, 60);
      if (n) { const L = wLen(n.w); o.wall = n.w.id; o.d = clamp(ui.snap && !e.shiftKey ? rnd(n.pr.t * L, 5) : n.pr.t * L, Math.min(o.w / 2, L / 2), Math.max(L - o.w / 2, L / 2)); }
    }
  }
  for (const c of d.conn) { c.w[c.e] = { x: c.o.x + dx, y: c.o.y + dy }; }
  render();
}
function startHandle(h, raw) {
  const o = selObjs()[0].o, orig = JSON.parse(JSON.stringify(o)), conn = [];
  if (h === 'wa' || h === 'wb') {
    const e = h === 'wa' ? 'a' : 'b';
    for (const w of F().walls) if (w.id !== o.id) for (const k of ['a', 'b']) if (dist(w[k], orig[e]) < 1) conn.push({ w, k });
  }
  ui.drag = { type: 'handle', h, orig, conn, moved: false };
}
function doHandle(raw, e) {
  const d = ui.drag, h = d.h, o = selObjs()[0]?.o; if (!o) return; d.moved = true;
  const sh = e.shiftKey;
  if (h === 'wa' || h === 'wb') {
    const ek = h === 'wa' ? 'a' : 'b', other = h === 'wa' ? o.b : o.a;
    const ign = new Set([o.id, ...d.conn.map(c => c.w.id)]);
    const p = snapPt(raw, other, e, ign);
    o[ek] = { x: p.x, y: p.y }; for (const c of d.conn) c.w[c.k] = { x: p.x, y: p.y };
  } else if (h[0] === 'v') {
    const i = +h.slice(1), p = snapPt(raw, null, e); o.pts[i] = { x: p.x, y: p.y };
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
const KIND_TR = { wall: '🧱 Duvar', op: '🚪 Kapı / Pencere', furn: '🛋️ Mobilya', room: '🏠 Oda', dim: '📏 Ölçü', text: '🔤 Metin' };
function renderProps() {
  const el = $('#props'), os = selObjs();
  if (!os.length) { el.innerHTML = projectPanel(); return; }
  const kinds = [...new Set(os.map(x => x.kind))];
  const acts = (extra = '') => `<div class="row">${extra}<button class="btn sm" data-act="dup">⧉ Çoğalt</button><button class="btn sm" data-act="del" style="color:var(--danger)">🗑 Sil</button></div>`;
  if (kinds.length > 1) { el.innerHTML = `<h3>${os.length} nesne seçili</h3><p class="muted">Taşımak için sürükle, silmek için Del.</p>${acts()}`; return; }
  const k = kinds[0], o = os[0].o, n = os.length;
  let h = `<h3>${KIND_TR[k]}${n > 1 ? ` <span class="muted">(${n})</span>` : ''}</h3>`;
  if (k === 'wall') {
    if (n === 1) h += fld('Uzunluk (cm)', 'wall', 'len', wLen(o), { step: 1, min: 1 });
    h += fld('Kalınlık (cm)', 'wall', 't', o.t, { min: 3, max: 100 }) + fld('Yükseklik (cm)', 'wall', 'h', o.h, { min: 50, max: 800 });
    if (n === 1) h += `<div class="stat"><span>Üzerindeki açıklıklar</span><b>${F().ops.filter(p => p.wall === o.id).length}</b></div>`;
    h += acts(`<button class="btn sm" data-act="split">✂ Ortadan böl</button>`);
  } else if (k === 'op') {
    h += fld('Tür', 'op', 'type', o.type, { sel: { door: 'Kapı', double: 'Çift kapı', slide: 'Sürgülü', arch: 'Açıklık', window: 'Pencere' } });
    h += fld('Genişlik (cm)', 'op', 'w', o.w, { min: 20, max: 500 }) + fld('Yükseklik (cm)', 'op', 'h', o.h, { min: 20, max: 400 }) + fld('Denizlik (cm)', 'op', 'sill', o.sill, { min: 0, max: 300 });
    h += acts(`<button class="btn sm" data-act="opflip">↔ Menteşe</button><button class="btn sm" data-act="opside">↕ Açılış yönü</button>`);
  } else if (k === 'furn') {
    h += fld('Etiket', 'furn', 'label', o.label || '', { type: 'text' });
    h += fld('Genişlik (cm)', 'furn', 'w', o.w, { min: 5 }) + fld('Derinlik (cm)', 'furn', 'd', o.d, { min: 5 }) + fld('Yükseklik 3B (cm)', 'furn', 'h', o.h, { min: 1 }) + fld('Açı (°)', 'furn', 'rot', o.rot, { min: 0, max: 360 }) + fld('Renk', 'furn', 'color', o.color, { type: 'color' });
    h += acts(`<button class="btn sm" data-act="rot90">⟳ 90°</button><button class="btn sm" data-act="swapwd">⇄ En/Boy</button><button class="btn sm" data-act="front">⬆ Öne</button>`);
  } else if (k === 'room') {
    h += fld('Ad', 'room', 'name', o.name, { type: 'text' }) + fld('Renk', 'room', 'color', o.color, { type: 'color' }) + fld('Zemin', 'room', 'floor', o.floor || 'none', { sel: FLOORS });
    if (n === 1) h += `<div class="stat"><span>Alan</span><b>${fmtArea(polyArea(o.pts))}</b></div><div class="stat"><span>Çevre</span><b>${fmtLen(polyPerim(o.pts))}</b></div><div class="stat"><span>Köşe sayısı</span><b>${o.pts.length}</b></div>`;
    h += acts(`<button class="btn sm" data-act="redetect">↻ Yeniden algıla</button>`);
  } else if (k === 'dim') {
    h += `<div class="stat"><span>Ölçü</span><b>${fmtLen(dist(o.a, o.b))}</b></div>` + fld('Ofset (cm)', 'dim', 'off', o.off ?? 40) + acts();
  } else if (k === 'text') {
    h += fld('Metin', 'text', 'text', o.text, { type: 'text' }) + fld('Boyut', 'text', 'size', o.size, { min: 6, max: 200 }) + fld('Açı (°)', 'text', 'rot', o.rot || 0) + fld('Renk', 'text', 'color', o.color, { type: 'color' }) + acts();
  }
  el.innerHTML = h;
}
function projectPanel() {
  const f = F(); let h = `<h3>⚙️ Proje</h3>`;
  h += fld('Duvar kalınlığı (cm)', 'proj', 'wallT', P.wallT, { min: 3, max: 60 }) + fld('Duvar yüksekliği (cm)', 'proj', 'wallH', P.wallH, { min: 100, max: 600 });
  h += `<h4>Katmanlar</h4>` + [['bg', 'Arka plan görseli'], ['rooms', 'Odalar'], ['walls', 'Duvarlar & açıklıklar'], ['furn', 'Mobilya'], ['dims', 'Ölçüler']].map(([k, l]) => `<label class="f"><span>${l}</span><input type="checkbox" data-k="layer" data-p="${k}" ${layersVis[k] ? 'checked' : ''}></label>`).join('');
  h += `<h4>Arka plan görseli</h4>`;
  if (P.bg) h += fld('Opaklık', 'bg', 'op', P.bg.op, { type: 'range', min: 0.05, max: 1, step: 0.05 }) + `<div class="row"><button class="btn sm" data-act="calib">⚖️ Ölçeklendir</button><button class="btn sm" data-act="bgremove">Kaldır</button></div>`;
  else h += `<p class="muted" style="margin:0 0 6px">Kroki / mevcut plan görselini altlık olarak ekleyip üzerinden çizebilirsin.</p><div class="row"><button class="btn sm" data-act="bgadd">🖼 Görsel ekle</button></div>`;
  const rooms = f.rooms; let tot = 0;
  h += `<h4>Odalar – ${esc(f.name)}</h4>`;
  if (!rooms.length) h += `<p class="muted" style="margin:0">Henüz oda yok. “Oda algıla” aracı ile kapalı alanlara tıkla.</p>`;
  rooms.forEach(r => { const a = polyArea(r.pts); tot += a; h += `<div class="stat" style="cursor:pointer" data-sel="${r.id}"><span>${esc(r.name)}</span><b>${fmtArea(a)}</b></div>`; });
  if (rooms.length) h += `<div class="stat"><span><b>Toplam</b></span><b>${fmtArea(tot)}</b></div>`;
  const wl = f.walls.reduce((s, w) => s + wLen(w), 0);
  h += `<h4>Özet</h4><div class="stat"><span>Duvar sayısı / uzunluk</span><b>${f.walls.length} / ${fmtLen(wl)}</b></div><div class="stat"><span>Kapı</span><b>${f.ops.filter(o => o.type !== 'window').length}</b></div><div class="stat"><span>Pencere</span><b>${f.ops.filter(o => o.type === 'window').length}</b></div>`;
  const cnt = {}; f.furn.forEach(x => cnt[x.name] = (cnt[x.name] || 0) + 1);
  if (Object.keys(cnt).length) h += `<h4>Mobilya listesi</h4>` + Object.entries(cnt).map(([k, v]) => `<div class="stat"><span>${esc(k)}</span><b>× ${v}</b></div>`).join('');
  return h;
}
function applyProp(t, final) {
  const k = t.dataset.k, p = t.dataset.p; let v = t.type === 'checkbox' ? t.checked : t.value;
  if (t.type === 'number' || t.type === 'range') { v = parseFloat(v); if (isNaN(v)) return; }
  if (k === 'layer') { layersVis[p] = v; render(); return; }
  if (k === 'proj') { P[p] = v; if (final) { commit(); } return; }
  if (k === 'bg') { P.bg[p] = v; render(); if (final) commit(); return; }
  const os = selObjs().filter(x => x.kind === k); if (!os.length) return;
  for (const { o } of os) {
    if (k === 'wall' && p === 'len') { const L = wLen(o) || 1, ux = (o.b.x - o.a.x) / L, uy = (o.b.y - o.a.y) / L; o.b = { x: o.a.x + ux * v, y: o.a.y + uy * v }; }
    else if (k === 'op' && p === 'type') { o[p] = v; if (v === 'window' && o.sill === 0) { o.sill = 90; o.h = 120; } if (v !== 'window' && o.sill > 0) { o.sill = 0; o.h = 210; } }
    else o[p] = v;
  }
  render(); if (final) { commit(); if (['type', 'floor', 'len'].includes(p)) renderProps(); }
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
  if (a === 'bgremove') { P.bg = null; commit(); return refresh(); }
  if (a === 'calib') return setTool('calib');
  for (const { kind, o } of os) {
    if (a === 'rot90' && kind === 'furn') o.rot = (o.rot + 90) % 360;
    if (a === 'swapwd' && kind === 'furn') [o.w, o.d] = [o.d, o.w];
    if (a === 'front' && kind === 'furn') { f.furn = f.furn.filter(x => x !== o); f.furn.push(o); }
    if (a === 'opflip' && kind === 'op') o.flip = o.flip ? 0 : 1;
    if (a === 'opside' && kind === 'op') o.side = -(o.side || 1);
    if (a === 'redetect' && kind === 'room') { const c = polyCentroid(o.pts); const r = detectRoom(pointInPoly(c, o.pts) ? c : o.pts[0]); if (Array.isArray(r)) o.pts = r; else toast('Oda yeniden algılanamadı'); }
    if (a === 'split' && kind === 'wall') {
      const m = { x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 }, nw = mkWall(m, o.b); nw.t = o.t; nw.h = o.h; const L = wLen(o), old = o.b;
      o.b = m; f.walls.push(nw);
      f.ops.forEach(op => { if (op.wall === o.id && op.d > L / 2) { op.wall = nw.id; op.d -= L / 2; } });
    }
  }
  commit(); refresh();
});

/* ---------- Kütüphane ---------- */
const LIBCATS = ['Kapı & Pencere', ...CATS];
function buildLib() {
  $('#cats').innerHTML = LIBCATS.map((c, i) => `<button class="chip ${i === ui.cat && !ui.q ? 'on' : ''}" data-cat="${i}">${c}</button>`).join('');
  const q = ui.q.toLowerCase(); let items = '';
  const card = (type, d, sz) => `<button class="item" data-type="${type}" data-id="${d.id}"><div class="ic">${d.icon || '▭'}</div><div>${d.name}</div><div class="sz">${sz}</div></button>`;
  if (q) {
    items += OPENINGS.filter(o => o.name.toLowerCase().includes(q)).map(o => card('op', o, o.w + ' cm')).join('');
    items += CATALOG.filter(c => c.name.toLowerCase().includes(q)).map(c => card('furn', c, `${c.w}×${c.d}`)).join('');
  } else if (ui.cat === 0) items = OPENINGS.map(o => card('op', o, o.w + ' cm')).join('');
  else items = CATALOG.filter(c => c.cat === ui.cat - 1).map(c => card('furn', c, `${c.w}×${c.d}`)).join('');
  $('#items').innerHTML = items || '<p class="muted">Sonuç yok</p>';
  updateTools();
}
$('#cats').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { ui.cat = +b.dataset.cat; ui.q = ''; $('#search').value = ''; buildLib(); } });
$('#search').addEventListener('input', e => { ui.q = e.target.value; buildLib(); });
$('#items').addEventListener('click', e => {
  const b = e.target.closest('.item'); if (!b) return;
  startPlace(b.dataset.type, b.dataset.type === 'op' ? OPDEF[b.dataset.id] : BYID[b.dataset.id]);
});

/* ---------- Katlar ---------- */
function renderFloors() {
  $('#floors').innerHTML = P.floors.map((f, i) => `<button class="ftab ${i === fi ? 'on' : ''}" data-fl="${i}" title="Çift tıkla: yeniden adlandır">${esc(f.name)}</button>`).join('')
    + `<button class="btn sm" data-fa="add" title="Kat ekle">＋ Kat</button><button class="btn sm" data-fa="dup" title="Katı kopyala">⧉</button><button class="btn sm" data-fa="del" title="Katı sil">🗑</button>`;
}
$('#floors').addEventListener('click', e => {
  const t = e.target.closest('[data-fl]'); if (t) { fi = +t.dataset.fl; sel = []; refresh(); return; }
  const a = e.target.closest('[data-fa]'); if (!a) return;
  if (a.dataset.fa === 'add') { P.floors.push(newFloor('Kat ' + P.floors.length)); fi = P.floors.length - 1; sel = []; commit(); fit(); refresh(); }
  if (a.dataset.fa === 'dup') { const c = JSON.parse(JSON.stringify(F())); const m = {}; const idm = o => { const n = uid(); m[o.id] = n; o.id = n; }; for (const k in KINDS) c[k].forEach(idm); c.ops.forEach(o => o.wall = m[o.wall]); c.id = uid(); c.name = F().name + ' (kopya)'; P.floors.splice(fi + 1, 0, c); fi++; sel = []; commit(); refresh(); }
  if (a.dataset.fa === 'del') { if (P.floors.length < 2) return toast('En az bir kat olmalı'); if (confirm(`“${F().name}” katı silinsin mi?`)) { P.floors.splice(fi, 1); fi = Math.max(0, fi - 1); sel = []; commit(); refresh(); } }
});
$('#floors').addEventListener('dblclick', e => { const t = e.target.closest('[data-fl]'); if (t) { const f = P.floors[+t.dataset.fl], n = prompt('Kat adı:', f.name); if (n) { f.name = n; commit(); refresh(); } } });
function refresh() { render(); renderProps(); renderFloors(); updateTools(); }

/* ---------- Kopyala / yapıştır ---------- */
let pasteN = 0;
function copySel() { ui.clip = selObjs().map(({ kind, o }) => ({ kind, o: JSON.parse(JSON.stringify(o)) })); pasteN = 0; if (ui.clip.length) toast(ui.clip.length + ' nesne kopyalandı'); }
function paste(fromSel) {
  if (fromSel) copySel();
  const items = ui.clip; if (!items || !items.length) return;
  pasteN++; const off = 40 * pasteN, f = F(), idm = {}, ids = [];
  const mv = p => ({ x: p.x + off, y: p.y + off });
  for (const { kind, o } of items) {
    if (kind === 'op') continue;
    const n = JSON.parse(JSON.stringify(o)); idm[n.id] = uid(); n.id = idm[n.id]; ids.push(n.id);
    if (kind === 'wall') { n.a = mv(n.a); n.b = mv(n.b); f.walls.push(n); }
    else if (kind === 'dim') { n.a = mv(n.a); n.b = mv(n.b); f.dims.push(n); }
    else if (kind === 'room') { n.pts = n.pts.map(mv); f.rooms.push(n); }
    else if (kind === 'furn') { n.x += off; n.y += off; f.furn.push(n); }
    else if (kind === 'text') { n.x += off; n.y += off; f.texts.push(n); }
  }
  for (const { kind, o } of items) if (kind === 'op' && idm[o.wall]) { const n = JSON.parse(JSON.stringify(o)); n.id = uid(); n.wall = idm[o.wall]; f.ops.push(n); ids.push(n.id); }
  sel = ids; commit(); refresh();
}

/* ---------- Klavye ---------- */
window.addEventListener('keydown', e => {
  const tag = e.target.tagName, typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
  if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
  if (ui.view3d) { if (e.key === 'Escape') show3D(false); return; }
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (e.key === ' ') { ui.space = true; e.preventDefault(); return; }
  if (ctrl) {
    if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'c') copySel();
    else if (k === 'v') paste(false);
    else if (k === 'd') { e.preventDefault(); paste(true); }
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
    if (ui.draw || ui.polyPts || ui.dimStart || ui.calib) { ui.draw = null; ui.polyPts = null; ui.dimStart = null; ui.calib = null; ui.typed = ''; render(); }
    else if (tool !== 'select') setTool('select'); else { sel = []; refresh(); }
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') { deleteSel(); return; }
  if (tool === 'place' && placing) {
    if (k === 'r') { if (placing.type === 'furn') placing.rot = ((placing.rot || 0) + 90) % 360; else placing.flip = placing.flip ? 0 : 1; updateGhost(); drawPreview(); return; }
    if (k === 's' && placing.type === 'op') { placing.side = -(placing.side || 1); updateGhost(); drawPreview(); return; }
  }
  if (e.key === '[' || e.key === ']') { const d = e.key === ']' ? 15 : -15; let ch = false; selObjs().forEach(({ kind, o }) => { if (kind === 'furn' || kind === 'text') { o.rot = ((o.rot || 0) + d + 360) % 360; ch = true; } }); if (ch) { commit(); refresh(); } return; }
  if (e.key.startsWith('Arrow') && sel.length) {
    e.preventDefault(); const st = e.shiftKey ? 10 : 1; const dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
    selObjs().forEach(({ kind, o }) => { if (kind === 'wall' || kind === 'dim') { o.a.x += dx; o.a.y += dy; o.b.x += dx; o.b.y += dy; } else if (kind === 'room') o.pts.forEach(p => { p.x += dx; p.y += dy; }); else if (kind === 'furn' || kind === 'text') { o.x += dx; o.y += dy; } else if (kind === 'op') o.d += dx + dy; });
    commit(); render(); return;
  }
  const map = { v: 'select', h: 'pan', w: 'wall', r: 'rect', o: 'room', p: 'poly', d: 'door', n: 'window', f: 'furn', m: 'dim', t: 'text', e: 'eraser', c: 'calib' };
  if (map[k]) { setTool(map[k]); return; }
  if (k === 'g') { $('#cSnap').click(); return; }
  if (k === '0') fit(); else if (k === '+' || k === '=') zoomBtn(1.25); else if (k === '-') zoomBtn(0.8);
});
window.addEventListener('keyup', e => { if (e.key === ' ') { ui.space = false; } });
function zoomBtn(f) { const s = svgSize(); zoomAt(f, s.w / 2, s.h / 2); }
$('#zIn').onclick = () => zoomBtn(1.25); $('#zOut').onclick = () => zoomBtn(0.8); $('#zFit').onclick = fit;

/* ---------- Modal ---------- */
function openModal(html) { $('#modal').innerHTML = html; $('#modalbg').style.display = 'flex'; }
function closeModal() { $('#modalbg').style.display = 'none'; }
$('#modalbg').addEventListener('mousedown', e => { if (e.target.id === 'modalbg') closeModal(); });
$('#modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
function helpModal() {
  const rows = [['V / H', 'Seç / Kaydır (Boşluk basılı: geçici kaydır)'], ['W', 'Duvar çiz (rakam + Enter: tam uzunluk)'], ['R', 'Oda (dikdörtgen duvar)'], ['O', 'Kapalı alandan oda algıla'], ['P', 'Çokgen oda çiz'], ['D / N', 'Kapı / Pencere'], ['F', 'Mobilya kütüphanesi'], ['M', 'Ölçü ekle'], ['T', 'Metin'], ['E', 'Sil'], ['C', 'Arka plan ölçekle'], ['G', 'Yakalamayı aç/kapa'], ['Shift', 'Basılıyken yakalama kapalı • seçimde çoklu seçim'], ['[ ]', 'Seçili mobilyayı 15° döndür'], ['R (yerleştirirken)', 'Mobilyayı döndür / kapı menteşesini çevir'], ['S (yerleştirirken)', 'Kapı açılış yönünü çevir'], ['Ok tuşları', 'Seçileni 1 cm kaydır (Shift: 10 cm)'], ['Ctrl+C/V/D', 'Kopyala / Yapıştır / Çoğalt'], ['Ctrl+Z / Ctrl+Y', 'Geri al / Yinele'], ['Ctrl+A', 'Tümünü seç'], ['Ctrl+S', 'Tarayıcıya kaydet'], ['Del', 'Sil'], ['0 / + / −', 'Sığdır / Yakınlaştır / Uzaklaştır'], ['Çift tık', 'Oda / metin adını düzenle']];
  openModal(`<h2>Kısayollar & İpuçları <button class="btn sm" data-close>✕</button></h2><table class="kb">${rows.map(r => `<tr><td><kbd>${r[0]}</kbd></td><td>${r[1]}</td></tr>`).join('')}</table>
  <p class="muted">İpucu: Hızlı başlamak için <b>R</b> ile bir oda çiz, <b>D</b>/<b>N</b> ile kapı pencere ekle, <b>F</b> ile mobilyaları yerleştir. Mobilyalar duvara yaklaşınca otomatik yapışır ve döner. Üstteki <b>3B</b> düğmesi planı üç boyutlu gösterir.</p>`);
}
function projectThumbSvg(proj) {
  const sv = P, sf = fi, z = view.z, sd = ui.dims;
  P = proj; fi = 0; ui.dims = false; view.z = 0.5;
  try {
    const f = proj.floors[0]; if (!f) return '<svg viewBox="0 0 100 60"></svg>';
    const b = contentBounds(f) || { x0: 0, y0: 0, x1: 1000, y1: 700 };
    const L = layerStrings(f, false);
    return `<svg viewBox="${b.x0 - 30} ${b.y0 - 30} ${Math.max(100, b.x1 - b.x0 + 60)} ${Math.max(100, b.y1 - b.y0 + 60)}"><defs>${defsSvg()}</defs>${L.rooms}${L.walls}${L.ops}${L.furn}${L.roomLabels}</svg>`;
  } catch (e) { return '<svg viewBox="0 0 100 60"></svg>'; }
  finally { P = sv; fi = sf; view.z = z; ui.dims = sd; }
}
async function saveBrowser() {
  try {
    const name = (P.name || 'Yeni Proje').trim() || 'Yeni Proje';
    P.name = name; $('#pname').value = name;
    await dbPut('projects', { name, updatedAt: Date.now(), project: JSON.parse(JSON.stringify(P)) });
    toast(`“${name}” tarayıcıya (IndexedDB) kaydedildi`);
  } catch (e) { toast('Kaydedilemedi: ' + e.message); }
}
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const fname = ext => (P.name || 'plan').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_') + '.' + ext;
function downloadJson(proj = P) { download(fname('json'), new Blob([JSON.stringify(proj, null, 2)], { type: 'application/json' })); }
async function projectsModal() {
  let list = [];
  try { list = await dbGetAll('projects'); list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); } catch (e) { }
  openModal(`<h2>📁 Projelerim <span class="muted" style="font-size:12px;font-weight:400">(IndexedDB + JSON)</span> <button class="btn sm" data-close>✕</button></h2>
  <div class="row">
    <button class="btn primary" id="mSave">💾 Aktif projeyi kaydet (“${esc(P.name)}”)</button>
    <button class="btn" id="mJson">⬇ JSON indir</button>
    <button class="btn" id="mOpenF">📂 JSON dosyası aç</button>
  </div>
  <h4 class="muted" style="margin:12px 0 8px">Tarayıcıda kayıtlı projeler (${list.length})</h4>
  ${list.length ? `<div class="cards">${list.map((it, idx) => {
    const pr = it.project, dt = it.updatedAt ? new Date(it.updatedAt).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const area = (pr.floors || []).reduce((s, fl) => s + (fl.rooms || []).reduce((a, r) => a + polyArea(r.pts), 0), 0);
    return `<div class="card" style="cursor:default">
      <div data-open="${idx}" style="cursor:pointer" title="Açmak için tıkla">${projectThumbSvg(pr)}</div>
      <b>${esc(it.name)}</b>
      <div class="muted" style="font-size:11px;margin-bottom:6px">${pr.floors.length} kat • ${fmtArea(area)}${dt ? ' • ' + dt : ''}</div>
      <div class="row" style="margin:0">
        <button class="btn sm primary" data-open="${idx}">Aç</button>
        <button class="btn sm" data-dl="${idx}" title="JSON olarak indir">⬇ JSON</button>
        <button class="btn sm" data-rm="${idx}" style="color:var(--danger)">🗑 Sil</button>
      </div>
    </div>`;
  }).join('')}</div>` : '<p class="muted">Henüz kayıtlı proje yok. Üstteki <b>💾 Kaydet</b> düğmesiyle projelerinizi buraya ekleyebilirsiniz.</p>'}`);
  $('#mSave').onclick = async () => { await saveBrowser(); projectsModal(); };
  $('#mJson').onclick = () => downloadJson(P);
  $('#mOpenF').onclick = () => $('#fileOpen').click();
  $('#modal').querySelectorAll('[data-open]').forEach(b => b.onclick = () => {
    const it = list[+b.dataset.open];
    if (it) { loadProject(JSON.parse(JSON.stringify(it.project)), `“${it.name}” açıldı`); closeModal(); }
  });
  $('#modal').querySelectorAll('[data-dl]').forEach(b => b.onclick = () => {
    const it = list[+b.dataset.dl];
    if (it) { const n = (it.name || 'plan').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_') + '.json'; download(n, new Blob([JSON.stringify(it.project, null, 2)], { type: 'application/json' })); }
  });
  $('#modal').querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => {
    const it = list[+b.dataset.rm];
    if (it && confirm(`“${it.name}” silinsin mi?`)) { await dbDel('projects', it.name); projectsModal(); }
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
  { name: 'Boş proje', desc: 'Sıfırdan başla', build() { } },
  {
    name: 'Stüdyo 1+0 (≈ 33 m²)', desc: '7 × 5 m, banyo, mutfak köşesi', build() {
      const c = tplCtx(), [top, , bottom, left] = c.rect(0, 0, 700, 500);
      const wb = c.W(480, 200, 700, 200); c.W(480, 0, 480, 200);
      c.op(top, 200, 'window'); c.op(top, 590, 'wsmall'); c.op(bottom, 150, 'door'); c.op(left, 250, 'window'); c.op(wb, 60, 'door', { w: 80 });
      c.fu('bed2', 150, 110); c.fu('night', 40, 32); c.fu('night', 260, 32); c.fu('dresser', 33, 310, 270);
      c.fu('tv', 300, 470, 180); c.fu('sofa3', 300, 330); c.fu('coffee', 300, 400); c.fu('table4', 545, 290);
      c.fu('sinkK', 660, 270, 90); c.fu('stove', 660, 360, 90); c.fu('fridge', 655, 425, 90);
      c.fu('wc', 520, 45); c.fu('basin', 600, 33); c.fu('shower', 645, 145);
      c.room(240, 250, 'Yaşam & Yatak', '#bfdbfe', 'wood'); c.room(590, 100, 'Banyo', '#a5f3fc', 'tile');
    }
  },
  {
    name: 'Daire 2+1 (≈ 80 m²)', desc: '10 × 8 m, 2 yatak odası, salon, banyo', build() {
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
      c.room(190, 175, 'Yatak Odası 1', '#fde68a', 'wood'); c.room(540, 175, 'Yatak Odası 2', '#fbcfe8', 'wood'); c.room(850, 175, 'Banyo', '#a5f3fc', 'tile'); c.room(500, 575, 'Salon & Mutfak', '#bbf7d0', 'wood');
    }
  },
  {
    name: 'Ofis (≈ 60 m²)', desc: 'Açık ofis + toplantı odası', build() {
      const c = tplCtx(), [top, right, bottom, left] = c.rect(0, 0, 900, 700);
      const m1 = c.W(600, 0, 600, 300), m2 = c.W(600, 300, 900, 300);
      c.op(top, 150, 'window2'); c.op(top, 450, 'window2'); c.op(top, 750, 'window'); c.op(left, 350, 'window2'); c.op(bottom, 250, 'double'); c.op(m2, 150, 'door');
      for (let i = 0; i < 3; i++) { c.fu('desk', 120 + i * 190, 60); c.fu('ochair', 120 + i * 190, 130); c.fu('desk', 120 + i * 190, 340, 180); c.fu('ochair', 120 + i * 190, 270, 180); }
      c.fu('meet', 750, 150, 90); c.fu('shelf', 880, 150, 90); c.fu('printer', 500, 650); c.fu('plant', 40, 650);
      c.room(300, 300, 'Açık Ofis', '#bfdbfe', 'carpet'); c.room(750, 150, 'Toplantı', '#fde68a', 'carpet'); c.room(750, 500, 'Dinlenme', '#bbf7d0', 'wood');
    }
  },
];
function buildTemplate(i) { const f = F(); TEMPLATES[i].build(); }
function thumbSvg(i) {
  const sv = P, sf = fi, z = view.z, sd = ui.dims; P = newProject(); fi = 0; ui.dims = false; view.z = 0.5;
  try { TEMPLATES[i].build(); const b = contentBounds(); const L = layerStrings(F(), false); const bb = b || { x0: 0, y0: 0, x1: 1000, y1: 700 };
    return `<svg viewBox="${bb.x0 - 30} ${bb.y0 - 30} ${bb.x1 - bb.x0 + 60} ${bb.y1 - bb.y0 + 60}"><defs>${defsSvg()}</defs>${L.rooms}${L.walls}${L.ops}${L.furn}${L.roomLabels}</svg>`;
  } finally { P = sv; fi = sf; view.z = z; ui.dims = sd; }
}
function templatesModal() {
  openModal(`<h2>Yeni proje – şablon seç <button class="btn sm" data-close>✕</button></h2><div class="cards">${TEMPLATES.map((t, i) => `<div class="card" data-tpl="${i}">${i ? thumbSvg(i) : '<svg viewBox="0 0 10 5"><text x="5" y="3" text-anchor="middle" font-size="1.5">＋</text></svg>'}<b>${t.name}</b><span class="muted">${t.desc}</span></div>`).join('')}</div>`);
  $('#modal').querySelectorAll('[data-tpl]').forEach(c => c.onclick = () => {
    const i = +c.dataset.tpl; const np = newProject(); np.name = i ? TEMPLATES[i].name.replace(/ \(.*/, '') : 'Yeni Proje';
    P = np; fi = 0; TEMPLATES[i].build(); loadProject(P); closeModal();
  });
}

/* ---------- Dışa aktarma ---------- */
function exportSvg() {
  const f = F(), b = contentBounds(f) || { x0: 0, y0: 0, x1: 1000, y1: 700 }, pad = 120;
  const x0 = b.x0 - pad, y0 = b.y0 - pad, w = b.x1 - b.x0 + pad * 2, h = b.y1 - b.y0 + pad * 2 + 90;
  const z0 = view.z; view.z = 0.5; const L = layerStrings(f, false), defs = defsSvg(); view.z = z0;
  const date = new Date().toLocaleDateString('tr-TR');
  const sb = `<g transform="translate(${x0 + 30} ${y0 + h - 70})" font-family="Segoe UI,sans-serif"><rect width="${Math.min(w - 60, 560)}" height="56" fill="none" stroke="#334155" stroke-width="2"/>
    <text x="12" y="24" font-size="22" font-weight="700" fill="#0f172a">${esc(P.name)} – ${esc(f.name)}</text><text x="12" y="46" font-size="14" fill="#475569">${date}  •  Toplam oda alanı: ${fmtArea(f.rooms.reduce((s, r) => s + polyArea(r.pts), 0))}</text></g>
    <g transform="translate(${x0 + w - 230} ${y0 + h - 40})" font-family="Segoe UI,sans-serif"><path d="M0 0H200M0 -6V6M100 -6V6M200 -6V6" stroke="#0f172a" stroke-width="2" fill="none"/><text x="0" y="-12" font-size="13">0</text><text x="100" y="-12" font-size="13" text-anchor="middle">1 m</text><text x="200" y="-12" font-size="13" text-anchor="end">2 m</text></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${w}" height="${h}"><defs>${defs}</defs><rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="#fff"/>${P.bg && layersVis.bg ? bgSvg() : ''}${L.rooms}${L.walls}${L.ops}${L.furn}${L.roomLabels}${L.dims}${L.texts}${sb}</svg>`;
  return { svg, w, h };
}
function exportPng() {
  const { svg, w, h } = exportSvg(), sc = Math.min(3, 3200 / Math.max(w, h)) * (w < 1200 ? 1.5 : 1);
  const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(h * sc); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => download(fname('png'), b)); };
  img.onerror = () => toast('PNG oluşturulamadı');
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
function exportPrint() {
  const { svg } = exportSvg(), win = window.open('', '_blank');
  if (!win) return toast('Açılır pencere engellendi');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(P.name)}</title><style>@page{size:A4 landscape;margin:10mm}body{margin:0}svg{width:100%;height:auto;max-height:190mm}</style></head><body>${svg}<script>setTimeout(()=>print(),400)<\/script></body></html>`);
  win.document.close();
}

/* ---------- 3B Görünüm ---------- */
let T3 = null;
function show3D(on) {
  if (on && (!window.THREE || !THREE.OrbitControls)) { toast('3B için internet bağlantısı gerekli (Three.js yüklenemedi)'); return; }
  ui.view3d = on; $('#v3d').style.display = on ? 'block' : 'none'; $('#b2d').classList.toggle('on', !on); $('#b3d').classList.toggle('on', on);
  $('#hud').style.display = on ? 'none' : ''; $('#zoomctl').style.display = on ? 'none' : '';
  if (on) { init3D(); build3D(); T3.run = true; loop3D(); } else if (T3) T3.run = false;
}
function init3D() {
  if (T3) { resize3D(); return; }
  const el = $('#v3d'), r = new THREE.WebGLRenderer({ antialias: true });
  r.setPixelRatio(Math.min(2, devicePixelRatio)); el.appendChild(r.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0xdbe5f1);
  const cam = new THREE.PerspectiveCamera(50, 1, 10, 50000), ctl = new THREE.OrbitControls(cam, r.domElement); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI / 2.02;
  T3 = { r, scene, cam, ctl, run: false }; resize3D(); window.addEventListener('resize', () => { if (T3 && ui.view3d) resize3D(); });
}
function resize3D() { const el = $('#v3d'); T3.r.setSize(el.clientWidth, el.clientHeight); T3.cam.aspect = el.clientWidth / el.clientHeight; T3.cam.updateProjectionMatrix(); }
function loop3D() { if (!T3 || !T3.run) return; requestAnimationFrame(loop3D); T3.ctl.update(); T3.r.render(T3.scene, T3.cam); }
function build3D() {
  const S = T3.scene; while (S.children.length) S.remove(S.children[0]);
  S.add(new THREE.HemisphereLight(0xffffff, 0x667788, 0.55));
  const dl = new THREE.DirectionalLight(0xffffff, 0.45); dl.position.set(600, 1500, 400); S.add(dl);
  const matCache = {}, mat = (c, o) => { const k = c + (o || ''); return matCache[k] || (matCache[k] = new THREE.MeshLambertMaterial({ color: c, ...(o ? { transparent: true, opacity: o } : {}), side: THREE.DoubleSide })); };
  const lineMat = new THREE.LineBasicMaterial({ color: 0x334155, transparent: true, opacity: .35 });
  const box = (parent, w, h, d, color, x, y, z, ry = 0, op, edges = true) => {
    const g = new THREE.BoxGeometry(w, h, d), m = new THREE.Mesh(g, mat(color, op)); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m);
    if (edges && !op) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(g), lineMat); l.position.copy(m.position); l.rotation.y = ry; parent.add(l); } return m;
  };
  let elev = 0, all = null;
  P.floors.forEach(f => {
    const b = contentBounds(f); if (b) all = all ? { x0: Math.min(all.x0, b.x0), y0: Math.min(all.y0, b.y0), x1: Math.max(all.x1, b.x1), y1: Math.max(all.y1, b.y1) } : b;
    if (b) box(S, b.x1 - b.x0 + 200, 20, b.y1 - b.y0 + 200, 0xe2e8f0, (b.x0 + b.x1) / 2, elev - 10, (b.y0 + b.y1) / 2);
    f.rooms.forEach(r => { const sh = new THREE.Shape(r.pts.map(p => new THREE.Vector2(p.x, p.y))); const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), mat(r.color)); m.rotation.x = Math.PI / 2; m.position.y = elev + 0.6; S.add(m); });
    f.walls.forEach(w => {
      const L = wLen(w), H = w.h, g = new THREE.Group(); g.position.set((w.a.x + w.b.x) / 2, elev, (w.a.y + w.b.y) / 2); g.rotation.y = -wAng(w); S.add(g);
      const seg = (s, e, y0, y1) => { if (e - s < 0.5 || y1 - y0 < 0.5) return; box(g, e - s, y1 - y0, w.t, 0xf8fafc, (s + e) / 2 - L / 2, (y0 + y1) / 2, 0); };
      const ops = f.ops.filter(o => o.wall === w.id).sort((a, c) => a.d - c.d); let pos = 0;
      ops.forEach(o => {
        const s = Math.max(pos, o.d - o.w / 2), e = Math.min(L, o.d + o.w / 2); seg(pos, s, 0, H);
        if (o.sill > 0) seg(s, e, 0, o.sill); seg(s, e, Math.min(H, o.sill + o.h), H);
        if (o.type === 'window') box(g, e - s, o.h, w.t * 0.25, 0x7dd3fc, (s + e) / 2 - L / 2, o.sill + o.h / 2, 0, 0, 0.45, false);
        else if (o.type === 'door' || o.type === 'double') box(g, (e - s) * (o.type === 'double' ? 0.98 : 0.96), o.h * 0.98, 4, 0xb08968, (s + e) / 2 - L / 2, o.h / 2, 0, 0, 0.9, false);
        pos = Math.max(pos, e);
      });
      seg(pos, L, 0, H);
    });
    f.furn.forEach(o => {
      const ry = -o.rot * Math.PI / 180, g = new THREE.Group(); g.position.set(o.x, elev, o.y); g.rotation.y = ry; S.add(g);
      if (o.k === 'stairs') { const n = Math.max(6, Math.round(o.h / 18)); for (let i = 0; i < n; i++) { const sh = o.h / n * (i + 1); box(g, o.w, sh, o.d / n, o.color, 0, sh / 2, o.d / 2 - o.d / n * (i + .5)); } }
      else if (o.k === 'round') { const m = new THREE.Mesh(new THREE.CylinderGeometry(o.w / 2, o.w / 2, o.h, 28), mat(o.color)); m.scale.z = o.d / o.w; m.position.y = o.h / 2; g.add(m); }
      else {
        box(g, o.w, o.h, o.d, o.color, 0, o.h / 2, 0);
        if (o.k === 'sofa') box(g, o.w, o.h, o.d * .25, o.color, 0, o.h * 0.75, -o.d * .375);
        if (o.k === 'bed') box(g, o.w, o.h * 1.5, 10, 0xb08968, 0, o.h * 0.75, -o.d / 2 + 5);
      }
    });
    elev += P.wallH + 20;
  });
  if (!all) all = { x0: 0, y0: 0, x1: 1000, y1: 700 };
  const cx = (all.x0 + all.x1) / 2, cz = (all.y0 + all.y1) / 2, sz = Math.max(all.x1 - all.x0, all.y1 - all.y0, 400);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), mat(0xc7d2c0)); ground.rotation.x = -Math.PI / 2; ground.position.y = -21; S.add(ground);
  T3.cam.position.set(cx + sz * 0.7, sz * 0.9 + elev * .3, cz + sz * 1.0); T3.ctl.target.set(cx, 80, cz); T3.ctl.update();
}

/* ---------- Başlatma ---------- */
$('#bNew').onclick = templatesModal; $('#bProjects').onclick = projectsModal; $('#bSave').onclick = saveBrowser;
$('#bJson').onclick = () => downloadJson(P);
$('#bOpen').onclick = () => $('#fileOpen').click(); $('#bHelp').onclick = helpModal;
$('#bUndo').onclick = undo; $('#bRedo').onclick = redo;
$('#bPng').onclick = exportPng; $('#bPrint').onclick = exportPrint;
$('#bSvg').onclick = () => download(fname('svg'), new Blob([exportSvg().svg], { type: 'image/svg+xml' }));
$('#b2d').onclick = () => show3D(false); $('#b3d').onclick = () => show3D(true);
$('#bTheme').onclick = () => { const d = document.documentElement; d.dataset.theme = d.dataset.theme === 'light' ? '' : 'light'; localStorage.setItem('fp_theme', d.dataset.theme || ''); };
$('#pname').addEventListener('input', e => { P.name = e.target.value; autosave(); });
$('#pname').addEventListener('change', commit);
$('#cSnap').onchange = e => { ui.snap = e.target.checked; };
$('#cAngle').onchange = e => { ui.angle = e.target.checked; };
$('#cDims').onchange = e => { ui.dims = e.target.checked; render(); };
$('#sGrid').onchange = e => { P.grid = +e.target.value; commit(); render(); };
$('#sGridType').onchange = e => {
  P.gridType = e.target.value;
  $('#lblAngle').textContent = P.gridType === 'triangle' ? 'Açı 30°' : 'Açı 15°';
  commit(); render();
};
$('#fileOpen').onchange = e => {
  const file = e.target.files[0]; if (!file) return; const r = new FileReader();
  r.onload = () => { try { const o = JSON.parse(r.result); if (!o.floors) throw new Error('geçersiz dosya'); loadProject(o, 'Dosya açıldı'); closeModal(); } catch (er) { toast('Dosya açılamadı: ' + er.message); } };
  r.readAsText(file); e.target.value = '';
};
$('#fileBg').onchange = e => {
  const file = e.target.files[0]; if (!file) return; const r = new FileReader();
  r.onload = () => { const im = new Image(); im.onload = () => { const w = 1200; P.bg = { src: r.result, x: 0, y: 0, w, h: w * im.height / im.width, op: 0.5 }; commit(); fit(); refresh(); toast('Görsel eklendi. “Ölçek” aracı ile gerçek ölçüye getir'); }; im.src = r.result; };
  r.readAsDataURL(file); e.target.value = '';
};
$('#tools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
new ResizeObserver(() => { if (P && !ui.view3d) render(); if (T3 && ui.view3d) resize3D(); }).observe($('#stage'));
window.addEventListener('beforeunload', () => { if (P) dbPut('state', P, 'auto').catch(() => {}); });
if (localStorage.getItem('fp_theme') === 'light') document.documentElement.dataset.theme = 'light';

buildTools(); buildLib();
(async () => {
  await migrateLegacyStorage();
  let saved = null;
  try { saved = await dbGet('state', 'auto'); } catch (e) { }
  if (!saved) { try { saved = JSON.parse(localStorage.getItem('fp_auto') || 'null'); } catch (e) { } }
  if (saved && saved.floors) loadProject(saved);
  else { P = newProject(); loadProject(P); templatesModal(); }
  setTimeout(fit, 50);
})();
