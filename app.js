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
  ['billiard', 0, 'Bilardo Masası', 280, 155, 85, '🎱', 'rect', '#5b3a24', 'Billiards Table'],
  ['tv', 0, 'TV Ünitesi', 180, 40, 50, '📺', 'rect', '#9ca3af', 'TV Unit'],
  ['table4', 0, '4 Kişilik Masa', 140, 80, 75, '🍽️', 'rect', '#d6b88f', '4-Seat Table'],
  ['table6', 0, '6 Kişilik Masa', 180, 90, 75, '🍽️', 'rect', '#d6b88f', '6-Seat Table'],
  ['tableR', 0, 'Yuvarlak Masa', 110, 110, 75, '⭕', 'round', '#d6b88f', 'Round Table'],
  ['chair', 0, 'Sandalye', 45, 45, 45, '🪑', 'rect', '#e5c9a0', 'Chair'],
  ['bookcase', 0, 'Kitaplık', 100, 35, 200, '📚', 'rect', '#b08968', 'Bookcase'],
  ['rug', 0, 'Halı', 200, 140, 2, '▦', 'rect', '#fca5a5', 'Rug'],
  ['plant', 0, 'Bitki', 40, 40, 90, '🪴', 'round', '#86efac', 'Plant'],
  ['tvw', 0, 'Duvar TV', 140, 6, 80, '📺', 'rect', '#111827', 'Wall TV'],
  ['art', 0, 'Tablo', 80, 3, 60, '🖼️', 'rect', '#8a6a4f', 'Wall Art'],
  ['shelfW', 0, 'Duvar Rafı', 100, 25, 4, '▭', 'rect', '#b08968', 'Wall Shelf'],
  ['ac', 0, 'Klima', 90, 25, 30, '❄️', 'rect', '#f8fafc', 'Air Conditioner'],
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
  ['cabU', 2, 'Üst Dolap', 80, 35, 70, '🗄️', 'rect', '#e2e8f0', 'Wall Cabinet'],
  ['wc', 3, 'Klozet', 40, 70, 40, '🚽', 'rect', '#f1f5f9', 'Toilet'],
  ['basin', 3, 'Lavabo', 60, 45, 85, '🚰', 'rect', '#f1f5f9', 'Washbasin'],
  ['basin2', 3, 'Çift Lavabo', 120, 50, 85, '🚰', 'rect', '#f1f5f9', 'Double Washbasin'],
  ['shower', 3, 'Duş Teknesi', 90, 90, 200, '🚿', 'rect', '#bae6fd', 'Shower'],
  ['tub', 3, 'Küvet', 170, 75, 55, '🛁', 'rect', '#bae6fd', 'Bathtub'],
  ['bidet', 3, 'Bide', 40, 55, 40, '🚽', 'rect', '#f1f5f9', 'Bidet'],
  ['wmirror', 3, 'Ayna', 60, 3, 90, '🪞', 'rect', '#cbd5e1', 'Mirror'],
  ['desk', 4, 'Çalışma Masası', 140, 70, 75, '🖥️', 'rect', '#d6b88f', 'Office Desk'],
  ['deskL', 4, 'L Masa', 180, 140, 75, '🖥️', 'rect', '#d6b88f', 'L-Shaped Desk'],
  ['ochair', 4, 'Ofis Koltuğu', 60, 60, 100, '💺', 'round', '#94a3b8', 'Office Chair'],
  ['meet', 4, 'Toplantı Masası', 300, 110, 75, '🗣️', 'rect', '#d6b88f', 'Meeting Table'],
  ['shelf', 4, 'Raf Ünitesi', 120, 35, 180, '📚', 'rect', '#b08968', 'Shelving Unit'],
  ['printer', 4, 'Yazıcı', 50, 45, 40, '🖨️', 'rect', '#cbd5e1', 'Printer'],
  ['stairs', 5, 'Merdiven', 100, 300, 270, '🪜', 'stairs', '#e2e8f0', 'Stairs'],
  ['ramp', 5, 'Rampa', 120, 500, 35, '♿', 'ramp', '#cbd5e1', 'Ramp'],
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
// yerden yükseklik (#61): duvara asılan eşyalar bu yükseklikte gelir; alan isteğe bağlı, yoksa 0 (yerde)
const CAT_ELEV = { tvw: 80, art: 120, shelfW: 150, ac: 220, cabU: 145, wmirror: 110 };
const FURN_ELEV_MAX = 500, furnElev = o => (o && +o.elev > 0 ? Math.min(FURN_ELEV_MAX, +o.elev) : 0);
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
const FLOORS = { none: 'Düz renk', wood: 'Parke', tile: 'Fayans', carpet: 'Halı', marble: 'Mermer', concrete: 'Beton şap', stone: 'Dış mekan taşı', grass: 'Çim', water: 'Su', gravel: 'Çakıl', deck: 'Ahşap deck', asphalt: 'Asfalt', glass: 'Cam döşeme' };
const FLOORS_EN = { none: 'Solid color', wood: 'Wood parquet', tile: 'Tile', carpet: 'Carpet', marble: 'Marble', concrete: 'Polished concrete', stone: 'Outdoor stone', grass: 'Grass', water: 'Water', gravel: 'Gravel', deck: 'Wood deck', asphalt: 'Asphalt', glass: 'Glass floor' };
// Duvar boyası paleti (issue #12): [hex, TR, EN]
const PAINTS = [['#ffffff', 'Beyaz', 'White'], ['#f5f1e8', 'Kırık beyaz', 'Off-white'], ['#d6d3d1', 'Açık gri', 'Light grey'], ['#e7d8bf', 'Bej', 'Beige'], ['#b7c4a8', 'Adaçayı', 'Sage'], ['#9fb7c9', 'Gök mavisi', 'Sky blue'], ['#2f4058', 'Gece mavisi', 'Midnight blue'], ['#c8826b', 'Kiremit', 'Terracotta']];
const getFloors = () => (lang === 'en' ? FLOORS_EN : FLOORS);
const ROOMCOL = ['#bfdbfe', '#fde68a', '#bbf7d0', '#fecaca', '#e9d5ff', '#fed7aa', '#a5f3fc', '#fbcfe8'];

/* ---------- Proje durumu ---------- */
let P, fi = 0;
let hist = [], hi = -1;
const view = { x: 0, y: 0, z: 0.5 };
/* Uzaklaştırma sınırı (issue #38): 0.002 · ~1000 px = ~5 km. Böylece vaziyet
   planları, parsel sınırları ve çok binalı yerleşimler bütünüyle görülebilir. */
const MIN_ZOOM = 0.002, MAX_ZOOM = 8;
let tool = 'select', sel = [], placing = null;
const ui = { snap: true, angle: true, dims: true, cur: null, raw: null, draw: null, typed: '', drag: null, space: false, cat: 0, q: '', view3d: false, v3dFloor: 'all', dimStart: null, polyPts: null, calib: null, clip: null, boxSel: 'all', connWalls: true, shape: { kind: 'tri', n: 6, mode: 'object' }, shot: false };
const layersVis = { bg: true, rooms: true, walls: true, furn: true, dims: true, sketch: true, underlay: true };
// Kat izdüşümü (issue #26): hangi kat altlık olarak gösterilir ('prev' = bir alt kat) ve opaklığı — görünüm ayarı, projeye kaydedilmez
const underlay = { floor: 'prev', op: 0.2 };

// kat bazlı duvar yüksekliği (#59): Floor.wallH yoksa proje varsayılanı; kat aralığı = yükseklik + 20 cm döşeme
const floorH = f => (f && +f.wallH > 0 ? +f.wallH : P.wallH);
const curFloorH = () => floorH(P && P.floors ? P.floors[fi] : null);
// oda döşeme kalınlığı (#63): alan isteğe bağlı, yoksa 20 cm; 0 = eski ince yüzey
const ROOM_SLAB_T = 20, roomSlabT = r => (r && r.slabT != null && +r.slabT >= 0 ? Math.min(200, +r.slabT) : ROOM_SLAB_T);
// odanın kendi düzenleri ya da içinde olduğu grubun düzenleri var mı (#66)
const grpHasVars = (gid, min = 1) => !!gid && ((P.floors[fi] && P.floors[fi].groups) || []).some(g => g.id === gid && (g.vars || []).length >= min);
const FLOOR_H_MIN = 100, FLOOR_H_MAX = 800; // kat yüksekliği alanı ve MCP add_floor ile aynı aralık
// { key: [tr, en] } → <select> seçenekleri (merdiven / rampa / cam alanları)
const biOpts = m => Object.fromEntries(Object.entries(m).map(([kk, v]) => [kk, L(...v)]));
const newFloor = name => ({ id: uid(), name, walls: [], ops: [], furn: [], rooms: [], slabs: [], voids: [], sections: [], dims: [], texts: [], sketches: [], groups: [], slabFloor: 'none', slabColor: null });
const newProject = () => ({ v: 2, name: L('Yeni Proje', 'New Project'), grid: 10, gridType: 'square', wallT: 20, wallH: 270, bg: null, lib: { shapes: [] }, textures: [], floors: [newFloor(L('Zemin Kat', 'Ground Floor'))] });
const F = () => P.floors[fi];
const KINDS = { walls: 'wall', ops: 'op', furn: 'furn', rooms: 'room', slabs: 'slab', voids: 'void', sections: 'section', dims: 'dim', texts: 'text', sketches: 'sketch' };
// Köşe listesiyle (pts) tanımlanan türler; POLY_KINDS kapalı poligonlar (köşe/kenar tutamaçları)
// a/b uçlu çizgi türleri: duvar, ölçü, kesit çizgisi (#30) — taşı/döndür/aynala/ölçekle bunları birlikte işler
const AB_KINDS = new Set(['wall', 'dim', 'section']);
const PTS_KINDS = new Set(['room', 'sketch', 'slab', 'void']), POLY_KINDS = new Set(['room', 'slab', 'void']);
// Döşeme boşluğu türleri (issue #23)
const VOID_TYPES = { stair: ['Merdiven boşluğu', 'Stairwell'], shaft: ['Şaft', 'Shaft'], atrium: ['Galeri boşluğu', 'Atrium / void'] };
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
// Duvar birleşimleri (issue #14): uçları çakışan duvarlar için köşe dolgusu poligonu.
// Duvar gövdeleri birleşim noktasında düz (butt) biter; bu poligon dış köşeyi miter
// noktasına kadar doldurur (çok dar açılarda pah kırar). 2B ve 3B aynı veriyi kullanır.
function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
// Duvar tipleri: dolu / cam cephe / korkuluk / bahçe çiti (#71, #73)
const WALL_TYPES = ['solid', 'curtain', 'railing', 'fence'];
const MUL_DEF = 120;                                   // cam cephe dikme modülü (cm), alan yoksa
const LOW_WALL = { railing: { h: 100, t: 6, post: 120, bar: 12 }, fence: { h: 110, t: 8, post: 200, bar: 15 } };
function isLowWall(w) { return !!LOW_WALL[w && w.wt]; }
function isSolidWall(w) { return !w.wt || w.wt === 'solid'; }
// cam cephe bölme sayısı: mulN (ara dikme adedi) varsa o + 1, yoksa uzunluk / modül (#71)
function curtainBays(w) {
  if (w.mulN != null && +w.mulN >= 0) return Math.max(1, Math.round(+w.mulN) + 1);
  const L = wLen(w) || 1, m = +w.mul > 0 ? +w.mul : MUL_DEF;
  return Math.max(1, Math.round(L / m));
}
// korkuluk / çit dikme konumları (a ucundan cm; uçlar dahil), açıklık aralıkları atlanır
function lowWallSolid(L, ops) {
  const out = []; let p = 0;
  for (const o of ops.slice().sort((a, b) => a.d - b.d)) { const s = Math.max(p, o.d - o.w / 2), e = Math.min(L, o.d + o.w / 2); if (s - p > 1) out.push([p, s]); p = Math.max(p, e); }
  if (L - p > 1) out.push([p, L]);
  return out;
}
function lowWallPosts(w, L, ops = []) {
  const spec = LOW_WALL[w.wt] || LOW_WALL.railing, out = [];
  for (const [s, e] of lowWallSolid(L, ops)) { const n = Math.max(1, Math.ceil((e - s) / spec.post - 1e-6)); for (let i = 0; i <= n; i++) out.push(s + (e - s) * i / n); }
  return out;
}
function wallJoints(f, tol = 1) {
  const ends = [];
  for (const w of f.walls) {
    const L = wLen(w); if (L < 0.5 || isLowWall(w)) continue;
    const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
    ends.push({ w, p: w.a, d: { x: ux, y: uy } }, { w, p: w.b, d: { x: -ux, y: -uy } }); // d: birleşimden duvarın içine
  }
  const used = new Set(), out = [];
  for (let i = 0; i < ends.length; i++) {
    if (used.has(i)) continue;
    const grp = [ends[i]]; used.add(i);
    for (let j = i + 1; j < ends.length; j++) if (!used.has(j) && dist(ends[i].p, ends[j].p) <= tol) { grp.push(ends[j]); used.add(j); }
    if (grp.length < 2) continue;
    const O = ends[i].p, maxT = Math.max(...grp.map(e => e.w.t));
    grp.forEach(e => e.ang = Math.atan2(e.d.y, e.d.x));
    grp.sort((a, b) => a.ang - b.ang);
    const pts = [];
    for (const e of grp) { const n = { x: -e.d.y, y: e.d.x }, h = e.w.t / 2; pts.push({ x: O.x + n.x * h, y: O.y + n.y * h }, { x: O.x - n.x * h, y: O.y - n.y * h }); }
    for (let k = 0; k < grp.length; k++) {
      const e1 = grp[k], e2 = grp[(k + 1) % grp.length]; if (e1 === e2) continue;
      // e1'in +n kenarı ile e2'nin -n kenarının kesişimi = aralarındaki köşe (miter) noktası
      const n1 = { x: -e1.d.y, y: e1.d.x }, n2 = { x: -e2.d.y, y: e2.d.x };
      const p1 = { x: O.x + n1.x * e1.w.t / 2, y: O.y + n1.y * e1.w.t / 2 }, p2 = { x: O.x - n2.x * e2.w.t / 2, y: O.y - n2.y * e2.w.t / 2 };
      const den = e1.d.x * e2.d.y - e1.d.y * e2.d.x; if (Math.abs(den) < 1e-6) continue; // aynı doğrultu
      const s = ((p2.x - p1.x) * e2.d.y - (p2.y - p1.y) * e2.d.x) / den;
      const M = { x: p1.x + e1.d.x * s, y: p1.y + e1.d.y * s };
      if (dist(M, O) > maxT * 2.5) continue;          // çok dar açı: miter yerine pah
      const s1 = (M.x - O.x) * e1.d.x + (M.y - O.y) * e1.d.y, s2 = (M.x - O.x) * e2.d.x + (M.y - O.y) * e2.d.y;
      if (s1 < -0.01 || s2 < -0.01) pts.push(M);      // yalnızca duvar ucunun DIŞINA taşan köşeler
    }
    const poly = convexHull(pts);
    if (poly.length >= 3 && polyArea(poly) > 0.5) out.push({ x: O.x, y: O.y, poly, walls: grp.map(e => e.w) });
  }
  return out;
}
function polyArea(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p.x * q.y - q.x * p.y; } return Math.abs(s) / 2; }
function polyCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length], c = p.x * q.y - q.x * p.y; a += c; cx += (p.x + q.x) * c; cy += (p.y + q.y) * c; }
  if (Math.abs(a) < 1e-6) return pts[0];
  return { x: cx / (3 * a), y: cy / (3 * a) };
}
function polyPerim(pts) { let s = 0; for (let i = 0; i < pts.length; i++) s += dist(pts[i], pts[(i + 1) % pts.length]); return s; }
// Döşeme boşlukları (issue #23): poligonun içinde kalan boşluklar delik olur. Kenara dayanan boşluk da sayılır
// (merdiven boşluğu çoğu zaman oda köşesine yakalanır); delik 0.5 cm içe çekilir ki dış sınıra değmesin (earcut).
function voidHoles(voids, pts) {
  const near = q => pts.some((a, i) => segProj(q, a, pts[(i + 1) % pts.length]).d < 1.5);
  const out = [];
  for (const v of voids || []) {
    if (!v.pts || v.pts.length < 3) continue;
    const c = polyCentroid(v.pts);
    if (!pointInPoly(c, pts) || !v.pts.every(q => pointInPoly(q, pts) || near(q))) continue;
    out.push(v.pts.map(q => { const d = dist(q, c) || 1, k = Math.min(0.5, d / 2) / d; return { x: q.x + (c.x - q.x) * k, y: q.y + (c.y - q.y) * k }; }));
  }
  return out;
}
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
  if (AB_KINDS.has(kind)) pts = [o.a, o.b];
  else if (kind === 'furn') pts = furnCorners(o);
  else if (PTS_KINDS.has(kind)) pts = o.pts;
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
    if (AB_KINDS.has(kind)) {
      o.a = rotatePoint(g.a, c, rad); o.b = rotatePoint(g.b, c, rad);
      if (kind === 'wall' && Array.isArray(g.angles) && g.angles.length) o.angles = g.angles.map(a => Math.round((((a + deg) % 360) + 360) % 360 * 10) / 10);
      changed = true;
    } else if (PTS_KINDS.has(kind)) {
      o.pts = g.pts.map(p => rotatePoint(p, c, rad)); changed = true;
    } else if (kind === 'furn' || kind === 'text') {
      const p = rotatePoint(g, c, rad);
      o.x = p.x; o.y = p.y; o.rot = ((g.rot || 0) + deg + 360) % 360; changed = true;
    }
  }
  return changed;
}
// Aynalama (issue #28): p'yi o noktasından geçen, u birim yönlü eksene göre yansıt
function reflectPoint(p, o, u) {
  const dx = p.x - o.x, dy = p.y - o.y, t = dx * u.x + dy * u.y;
  return { x: Math.round((o.x + 2 * t * u.x - dx) * 100) / 100, y: Math.round((o.y + 2 * t * u.y - dy) * 100) / 100 };
}
const normDeg = a => Math.round(((a % 360) + 360) % 360 * 10) / 10;
// Seçimi eksene göre yansıt. Duvar a/b yansır (d aynı kalır), kapı/pencere açılma yönü (side) ters döner;
// mobilyanın sırtı aynı duvara bakmaya devam eder; poligonların sarım yönü korunur; metin okunur kalır.
function mirrorObjs(os, o, u, opsOf = w => F().ops.filter(op => op.wall === w.id)) {
  const ax = Math.atan2(u.y, u.x) * 180 / Math.PI, R = p => reflectPoint(p, o, u);
  let changed = false;
  for (const { kind, o: m } of os) {
    if (AB_KINDS.has(kind)) {
      m.a = R(m.a); m.b = R(m.b);
      if (kind === 'dim') m.off = -(m.off || 0);
      else if (kind === 'section') m.dir = -(m.dir || 1); // yansıyan çizgi ters döner: bakış yönü de yansısın
      else {
        if (Array.isArray(m.angles) && m.angles.length) m.angles = m.angles.map(a => normDeg(2 * ax - a));
        for (const op of opsOf(m)) op.side = -(op.side || 1);
      }
    } else if (PTS_KINDS.has(kind)) m.pts = m.pts.map(R).reverse();
    else if (kind === 'furn') {
      const p = R(m); m.x = p.x; m.y = p.y; m.rot = normDeg(2 * ax - (m.rot || 0) + 180);
      if (m.k === 'poly' && Array.isArray(m.pts)) m.pts = m.pts.map(q => ({ x: -q.x, y: q.y })).reverse();
      if (m.k === 'roof' && Array.isArray(m.faces)) m.faces = m.faces.map(f => f.map(q => [-q[0], q[1], q[2]]).reverse());
      if (Array.isArray(m.parts)) m.parts = m.parts.map(q => { const r = Object.assign({}, q, { x: -q.x }); if (q.rot) r.rot = (360 - q.rot) % 360; if (q.pts) r.pts = q.pts.map(t => ({ x: -t.x, y: t.y })).reverse(); return r; });
    } else if (kind === 'text') {
      const p = R(m); m.x = p.x; m.y = p.y;
      let r = normDeg(2 * ax - (m.rot || 0)); if (r > 90 && r < 270) r = normDeg(r + 180); m.rot = r;
    } else continue;
    changed = true;
  }
  return changed;
}
// Ölçekleme (#28 ve çoklu seçim tutamaçları g0..g3): orig(id) = başlangıç kopyası, tx/ty = nokta dönüşümü
function scaleObjs(os, orig, tx, ty, sx, sy, scaleT = false) {
  for (const { kind, o: mo } of os) {
    const g = orig(mo.id); if (!g) continue;
    if (AB_KINDS.has(kind)) {
      mo.a = { x: tx(g.a.x), y: ty(g.a.y) }; mo.b = { x: tx(g.b.x), y: ty(g.b.y) };
      if (kind === 'wall') {
        if (scaleT && g.t) mo.t = clamp(Math.round(g.t * Math.sqrt(sx * sy)), 3, 200);
        // menteşeli duvar: açı ön ayarlarını yeni yönelime göre kaydır (eski preset'e sıçramasın)
        if (Array.isArray(g.angles) && g.angles.length) {
          const od = Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x) * 180 / Math.PI, nd = Math.atan2(mo.b.y - mo.a.y, mo.b.x - mo.a.x) * 180 / Math.PI;
          const diff = Math.round((nd - od) * 10) / 10;
          if (Math.abs(diff) > 0.05) mo.angles = g.angles.map(a => Math.round((((a + diff) % 360) + 360) % 360 * 10) / 10);
        }
        // duvara bağlı kapı/pencereler de ölçeklensin: merkez noktayı ölçekle, yeni duvara projekte et
        const L0 = dist(g.a, g.b) || 1, L1 = wLen(mo) || 1, ux = (mo.b.x - mo.a.x) / L1, uy = (mo.b.y - mo.a.y) / L1;
        for (const o2 of F().ops.filter(op => op.wall === mo.id)) {
          const og = orig(o2.id) || o2, t0 = clamp(og.d / L0, 0, 1), px = tx(g.a.x + (g.b.x - g.a.x) * t0), py = ty(g.a.y + (g.b.y - g.a.y) * t0);
          const pr = clamp(((px - mo.a.x) * ux + (py - mo.a.y) * uy) / L1, 0, 1);
          o2.d = clamp(pr * L1, Math.min(o2.w / 2, L1 / 2), Math.max(L1 - o2.w / 2, L1 / 2));
        }
      }
    }
    else if (PTS_KINDS.has(kind)) mo.pts = g.pts.map(q => ({ x: tx(q.x), y: ty(q.y) }));
    else if (kind === 'furn') {
      mo.x = tx(g.x); mo.y = ty(g.y);
      const rot = ((g.rot || 0) % 180 + 180) % 180, swap = rot >= 45 && rot < 135;
      mo.w = Math.max(10, Math.round(g.w * (swap ? sy : sx)));
      mo.d = Math.max(10, Math.round(g.d * (swap ? sx : sy)));
      if (g.k === 'poly' && g.pts) mo.pts = g.pts.map(p => ({ x: Math.round(p.x * (mo.w / g.w) * 10) / 10, y: Math.round(p.y * (mo.d / g.d) * 10) / 10 }));
    } else if (kind === 'text') { mo.x = tx(g.x); mo.y = ty(g.y); }
    else if (kind === 'bg') { mo.x = tx(g.x); mo.y = ty(g.y); mo.w = Math.max(20, Math.round(g.w * sx)); mo.h = Math.max(20, Math.round(g.h * sy)); }
  }
}
// Seçimi bbox merkezine göre s katı ölçekle; duvar kalınlığı varsayılan olarak korunur
function scaleSelection(sc, scaleT = false, os = selObjs()) {
  const bb = selectionBounds(os); if (!bb || !(sc > 0)) return false;
  const c = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 }, snap = new Map();
  for (const { o } of os) snap.set(o.id, JSON.parse(JSON.stringify(o)));
  for (const op of F().ops) if (!snap.has(op.id)) snap.set(op.id, { d: op.d });
  const tx = x => Math.round((c.x + (x - c.x) * sc) * 10) / 10, ty = y => Math.round((c.y + (y - c.y) * sc) * 10) / 10;
  scaleObjs(os, id => snap.get(id), tx, ty, sc, sc, scaleT);
  return true;
}
const XFORM_KINDS = new Set(['wall', 'dim', 'furn', 'text', 'room', 'slab', 'void', 'sketch']);
function afterXform() { commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); }
function flipSel(dir) {
  const os = selObjs().filter(x => XFORM_KINDS.has(x.kind)), bb = selectionBounds(os); if (!bb) return;
  const c = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 };
  if (mirrorObjs(os, c, dir === 'h' ? { x: 0, y: 1 } : { x: 1, y: 0 })) afterXform();
}
// "1.5", "150%", "=450" (seçim genişliği 450 cm olsun) veya "300:450" (referans uzunluk → hedef uzunluk)
function parseScale(str, width) {
  const t = String(str || '').trim().replace(',', '.'); let m;
  if ((m = t.match(/^=\s*([\d.]+)$/))) return width > 0 ? parseFloat(m[1]) / width : NaN;
  if ((m = t.match(/^([\d.]+)\s*:\s*([\d.]+)$/))) return parseFloat(m[2]) / parseFloat(m[1]);
  if ((m = t.match(/^([\d.]+)\s*%$/))) return parseFloat(m[1]) / 100;
  return parseFloat(t);
}
function scaleSelPrompt() {
  const os = selObjs().filter(x => XFORM_KINDS.has(x.kind) || x.kind === 'bg'), bb = selectionBounds(os); if (!bb) return;
  const v = prompt(L('Ölçek: çarpan (1.5 / 150%), hedef genişlik (=450 cm) veya referans:hedef (300:450)', 'Scale: factor (1.5 / 150%), target width (=450 cm) or reference:target (300:450)'), '1.5');
  if (v == null) return;
  const sc = parseScale(v, bb.x1 - bb.x0);
  if (!(sc > 0.01 && sc < 100) || Math.abs(sc - 1) < 1e-6) { if (!(sc > 0.01 && sc < 100)) toast(L('Geçersiz ölçek', 'Invalid scale')); return; }
  const scaleT = os.some(x => x.kind === 'wall') && confirm(L('Duvar kalınlıkları da ölçeklensin mi? (İptal = kalınlık korunur)', 'Scale wall thickness too? (Cancel = keep thickness)'));
  if (scaleSelection(sc, scaleT, os)) { afterXform(); toast(L('Ölçeklendi ×', 'Scaled ×') + Math.round(sc * 1000) / 1000); }
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
const DB_NAME = 'FloorPlannerDB', DB_VER = 2;   // 2: 'textures' deposu (#40)
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
      if (!db.objectStoreNames.contains('textures')) db.createObjectStore('textures', { keyPath: 'id' }); // özel doku görselleri, P dışında
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
  if (typeof grpEditAbsorb === 'function') grpEditAbsorb(); // grup düzenleme modunda yeni çizilenler gruba katılır
  if (typeof syncActiveVars === 'function') syncActiveVars();
  stampLayers(); // yeni nesneler etkin katmana (#32)
  const s = JSON.stringify(P);
  if (hist[hi] === s) return;
  hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 150) hist.shift();
  hi = hist.length - 1;
  autosave(); updateUndo();
}
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await dbPut('state', JSON.parse(JSON.stringify(P)), 'auto'); await dbPut('state', tabsState(), 'tabs'); }
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
  refresh(); buildLib(); // kütüphane ön ayarları / şekiller de geri alınır (#42)
  if (ui.view3d && T3) schedBuild3D(); // undo/redo sonrası 3B sahnesi tazelensin
}
function undo() { if (hi > 0) { hi--; restore(hist[hi]); autosave(); updateUndo(); } }
function redo() { if (hi < hist.length - 1) { hi++; restore(hist[hi]); autosave(); updateUndo(); } }
function updateUndo() { $('#bUndo').disabled = hi <= 0; $('#bRedo').disabled = hi >= hist.length - 1; }
/* ---------- Çizim katmanları (issue #32) ----------
   P.layers = [{ id, name, color, vis, lock, print }], P.activeLayer = id. '0' = Varsayılan katman, silinemez.
   Nesnede layer alanı yoksa '0' sayılır (eski projeler değişmeden açılır). commit() etkin katman '0' değilse
   katmansız (= yeni) nesneleri etkin katmana damgalar; ilk özel katman eklenirken mevcut nesneler önce '0'a yazılır. */
const LAYER_COLS = ['#64748b', '#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];
const defaultLayer = () => ({ id: '0', name: L('Varsayılan', 'Default'), color: '#64748b', vis: true, lock: false, print: true });
const layerById = id => (P.layers || []).find(l => l.id === (id || '0'));
// Gizli (veya baskıda çıkmayan) katmanlardaki nesneler olmadan katın sığ kopyası; hepsi görünürse kat aynen döner
function visFloor(f, print = false) {
  if (!P.layers || P.layers.length < 2) return f;
  const hide = new Set(P.layers.filter(l => !l.vis || (print && l.print === false)).map(l => l.id));
  if (!hide.size) return f;
  const ok = o => !hide.has(o.layer || '0'), g = Object.assign({}, f);
  for (const k in KINDS) g[k] = (f[k] || []).filter(ok);
  const wl = new Set(g.walls.map(w => w.id)); g.ops = g.ops.filter(o => wl.has(o.wall));
  return g;
}
// Seçilebilir mi: gizli ve kilitli katmanlardaki nesneler tıklanamaz, kutuyla seçilemez, silinemez
function pickable(id) {
  const fd = find(id); if (!fd) return true;
  const l = layerById(fd.o.layer); return !l || (l.vis && !l.lock);
}
function stampLayers(all = false) {
  const act = all ? '0' : (P.activeLayer || '0'); if (act === '0' && !all) return;
  for (const f of P.floors) for (const k in KINDS) for (const o of f[k] || []) if (!o.layer) o.layer = act;
}
function syncLayerUI() {
  const s = $('#sLayer'); if (!s || !P) return;
  s.innerHTML = (P.layers || [defaultLayer()]).map(l => `<option value="${esc(l.id)}">${l.vis ? '' : '🚫 '}${l.lock ? '🔒 ' : ''}${esc(l.name)}</option>`).join('');
  s.value = P.activeLayer || '0';
}
function layersPanelHtml() {
  let h = `<h4>${L('Çizim katmanları', 'Drawing layers')}</h4>`;
  for (const l of P.layers) {
    const lid = esc(l.id), on = (P.activeLayer || '0') === l.id;
    h += `<div class="row lyr" style="gap:4px;align-items:center;margin:2px 0;flex-wrap:nowrap">`
      + `<input type="radio" name="actlayer" data-k="lyr" data-p="active" data-lid="${lid}" ${on ? 'checked' : ''} title="${L('Etkin katman (yeni nesneler buraya)', 'Active layer (new objects go here)')}">`
      + `<input type="color" data-k="lyr" data-p="color" data-lid="${lid}" value="${esc(l.color || '#64748b')}" style="width:22px;height:22px;padding:0;border:0;flex:none">`
      + `<input type="text" data-k="lyr" data-p="name" data-lid="${lid}" value="${esc(l.name)}" style="flex:1;min-width:0">`
      + `<button class="btn sm" data-act="lyrvis" data-lid="${lid}" title="${L('Göster / gizle (2B, 3B, çıktı)', 'Show / hide (2D, 3D, export)')}">${l.vis ? '👁' : '🚫'}</button>`
      + `<button class="btn sm" data-act="lyrlock" data-lid="${lid}" title="${L('Kilitle (seçilemez, silinemez)', 'Lock (cannot be selected or deleted)')}">${l.lock ? '🔒' : '🔓'}</button>`
      + `<button class="btn sm" data-act="lyrprint" data-lid="${lid}" title="${L('Çıktıya dahil (PNG / SVG / PDF)', 'Include in exports (PNG / SVG / PDF)')}">${l.print === false ? '⛔' : '🖨'}</button>`
      + (l.id === '0' ? '' : `<button class="btn sm" data-act="lyrdel" data-lid="${lid}" style="color:var(--danger)" title="${L('Katmanı sil (nesneler Varsayılan katmana geçer)', 'Delete layer (objects move to Default)')}">🗑</button>`)
      + `</div>`;
  }
  return h + `<div class="row"><button class="btn sm" data-act="lyradd">${L('＋ Katman ekle', '＋ Add layer')}</button></div>`;
}
// Seçim panelinde "Katman" listesi (yalnızca birden fazla katman varken)
function selLayerHtml(os) {
  if (!P.layers || P.layers.length < 2 || !os.length) return '';
  const cur = new Set(os.map(x => x.o.layer || '0')), one = cur.size === 1 ? [...cur][0] : '';
  return `<label class="f"><span>${L('Katman', 'Layer')}</span><select data-k="sellayer" data-p="layer">${one ? '' : `<option value="" selected>${L('(karışık)', '(mixed)')}</option>`}${P.layers.map(l => `<option value="${esc(l.id)}" ${one === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>`;
}
function layerAct(a, lid) {
  const l = layerById(lid);
  if (a === 'lyradd') {
    stampLayers(true); // mevcut katmansız nesneler Varsayılan'da kalsın
    const id = uid(); P.layers.push({ id, name: L('Katman ', 'Layer ') + P.layers.length, color: LAYER_COLS[P.layers.length % LAYER_COLS.length], vis: true, lock: false, print: true });
    P.activeLayer = id;
  } else if (!l) return;
  else if (a === 'lyrvis') l.vis = !l.vis;
  else if (a === 'lyrlock') l.lock = !l.lock;
  else if (a === 'lyrprint') l.print = l.print === false;
  else if (a === 'lyrdel') {
    if (l.id === '0' || !confirm(L(`“${l.name}” katmanı silinsin mi? Nesneleri Varsayılan katmana geçer.`, `Delete layer “${l.name}”? Its objects move to Default.`))) return;
    for (const f of P.floors) for (const k in KINDS) for (const o of f[k] || []) if (o.layer === l.id) o.layer = '0';
    P.layers = P.layers.filter(x => x !== l); if (P.activeLayer === l.id) P.activeLayer = '0';
  }
  sel = sel.filter(pickable);
  commit(); refresh(); if (ui.view3d && T3) schedBuild3D();
}
/* ---------- Özel zemin dokuları (issue #40) ----------
   Proje yalnızca künyeyi taşır: P.textures = [{ id, name, w, h }] (w/h = gerçek tekrar ölçüsü, cm).
   Görsel verisi P'nin DIŞINDA durur — IndexedDB 'textures' deposu (id → dataURL) + bellekteki TEX önbelleği —
   böylece 150 geri-al anlık görüntüsü ve her otomatik kayıt resmi tekrar tekrar kopyalamaz.
   Kaplama alanında 'tex:<id>' olarak seçilir (oda, serbest döşeme, kat döşemesi). ⬇ JSON veriyi texData
   içinde paketler; içe aktarım onu yeniden IndexedDB'ye yazar ve P'den çıkarır. */
const TEX = new Map();            // id → { data, url, img, ready }
const TEX_MAX = 1024;             // yüklenen görselin en uzun kenarı (px)
const texIdOf = kind => typeof kind === 'string' && kind.startsWith('tex:') ? kind.slice(4) : null;
const texMeta = id => ((P && P.textures) || []).find(t => t.id === id) || null;
// kaplama gerçekten çizilebilir mi: yerleşik desen ya da künyesi + görseli hazır özel doku; değilse null (düz renk)
function finishKind(kind) {
  if (!kind || kind === 'none') return null;
  const id = texIdOf(kind);
  if (!id) return FLOORS[kind] ? kind : null;
  const e = TEX.get(id); return texMeta(id) && e && e.ready ? kind : null;
}
const finishPat = kind => { const id = texIdOf(kind); return id ? 'p-tex-' + id : 'p-' + kind; };
// kaplama seçicisi: yerleşik desenler + projenin özel dokuları
function floorOpts() {
  const o = { ...getFloors() };
  for (const t of (P.textures || [])) o['tex:' + t.id] = '🖼 ' + esc(t.name);
  return o;
}
function dataUrlBlob(d) {
  const i = d.indexOf(','), mime = (d.slice(0, i).match(/data:([^;,]+)/) || [])[1] || 'image/png', bin = atob(d.slice(i + 1)), a = new Uint8Array(bin.length);
  for (let j = 0; j < bin.length; j++) a[j] = bin.charCodeAt(j);
  return new Blob([a], { type: mime });
}
// tuvalde kısa blob: adresi kullanılır (her render'da yüz KB'lık dataURL'yi DOM'a yazmamak için); dışa aktarımda dataURL
function cacheTex(id, data) {
  let e = TEX.get(id);
  if (e && e.data === data) return e;
  if (e && e.url && e.url.startsWith('blob:')) URL.revokeObjectURL(e.url);
  e = { data, url: data, img: new Image(), ready: false };
  try { e.url = URL.createObjectURL(dataUrlBlob(data)); } catch (er) { }
  e.img.onload = () => { e.ready = true; if (P) render(); if (ui.view3d && T3) schedBuild3D(); };
  e.img.src = data;
  TEX.set(id, e); return e;
}
// projenin dokularını IndexedDB'den önbelleğe al (açılış, sekme geçişi, dosya açma)
async function ensureTextures(proj = P) {
  for (const t of (proj && proj.textures) || []) {
    if (TEX.has(t.id)) continue;
    try { const r = await dbGet('textures', t.id); if (r && r.data) cacheTex(t.id, r.data); } catch (e) { }
  }
}
// ⬇ JSON: görsel verisi dosyayla birlikte gider, böylece başka bilgisayarda da açılır
function bundleTextures(proj) {
  const texData = {};
  for (const t of proj.textures || []) { const e = TEX.get(t.id); if (e) texData[t.id] = e.data; }
  return Object.keys(texData).length ? { ...proj, texData } : proj;
}
// 📂 Aç: texData → önbellek + IndexedDB; P'ye (ve geri-al geçmişine) girmez
function absorbTextures(obj) {
  if (!obj || !obj.texData || typeof obj.texData !== 'object') return obj;
  for (const [id, data] of Object.entries(obj.texData)) {
    if (!/^[\w-]{1,32}$/.test(id) || typeof data !== 'string' || !data.startsWith('data:image/')) continue;
    cacheTex(id, data); dbPut('textures', { id, data }).catch(() => { });
  }
  delete obj.texData; return obj;
}
function downscaleImage(src, max = TEX_MAX, mime = 'image/jpeg') {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, max / Math.max(im.width, im.height)), w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, w, h);
      res({ data: c.toDataURL(mime, 0.9), w, h });
    };
    im.onerror = () => rej(new Error(L('görsel okunamadı', 'could not read the image')));
    im.src = src;
  });
}
// "60", "60x30", "60 × 30", "60*30" → { w, h } (cm)
function parseTexSize(s) {
  const m = String(s || '').replace(/,/g, '.').match(/(\d+(?:\.\d+)?)(?:\s*[x×*\/]\s*(\d+(?:\.\d+)?))?/i);
  if (!m || !(+m[1] > 0)) return null;
  return { w: clamp(+m[1], 1, 5000), h: clamp(+(m[2] || m[1]), 1, 5000) };
}
function addTextureFlow() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => {
    const file = inp.files && inp.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = async () => {
      try {
        const img = await downscaleImage(r.result, TEX_MAX, file.type === 'image/png' ? 'image/png' : 'image/jpeg');
        const name = (prompt(L('Doku adı', 'Texture name'), file.name.replace(/\.[^.]+$/, '')) || '').trim(); if (!name) return;
        const sz = parseTexSize(prompt(L('Gerçek tekrar ölçüsü (cm): genişlik × yükseklik', 'Real-world repeat size (cm): width × height'), '60 × ' + Math.round(60 * img.h / img.w)));
        if (!sz) return toast(L('Geçersiz ölçü', 'Invalid size'));
        addTexture(name, sz.w, sz.h, img.data);
      } catch (er) { toast(L('Doku eklenemedi: ', 'Could not add texture: ') + er.message); }
    };
    r.readAsDataURL(file);
  };
  inp.click();
}
function addTexture(name, w, h, data) {
  const id = uid(); cacheTex(id, data);
  dbPut('textures', { id, data }).catch(() => toast(L('Doku tarayıcıya kaydedilemedi', 'The texture could not be stored in the browser')));
  P.textures = P.textures || []; P.textures.push({ id, name: String(name).slice(0, 60), w, h });
  // seçili oda / döşeme varsa doku doğrudan ona uygulanır
  for (const { o } of selObjs().filter(x => x.kind === 'room' || x.kind === 'slab')) o.floor = 'tex:' + id;
  commit(); refresh(); if (ui.view3d && T3) schedBuild3D();
  toast(L(`“${name}” dokusu eklendi`, `Texture “${name}” added`));
  return id;
}
function deleteTexture(id) {
  const t = texMeta(id); if (!t) return;
  const k = 'tex:' + id; let n = 0;
  for (const f of P.floors) {
    for (const o of [...f.rooms, ...f.slabs]) if (o.floor === k) { o.floor = 'none'; n++; }
    if (f.slabFloor === k) { f.slabFloor = 'none'; n++; }
  }
  P.textures = P.textures.filter(x => x.id !== id);
  // görsel IndexedDB'de kalır: geri al künyeyi geri getirince doku da geri gelir
  commit(); refresh(); if (ui.view3d && T3) schedBuild3D();
  toast(L(`“${t.name}” silindi — ${n} yüzey düz renge döndü`, `“${t.name}” removed — ${n} surface(s) reset to solid colour`));
}
// 2B desenleri: patternUnits=userSpaceOnUse → bir tekrar tam w × h cm
function texPatterns() {
  let s = '';
  for (const t of (P.textures || [])) {
    const e = TEX.get(t.id); if (!e || !e.ready) continue;
    s += `<pattern id="p-tex-${t.id}" width="${t.w}" height="${t.h}" patternUnits="userSpaceOnUse"><image href="${ui.exporting ? e.data : e.url}" width="${t.w}" height="${t.h}" preserveAspectRatio="none"/></pattern>`;
  }
  return s;
}
function texturesPanelHtml() {
  const ts = P.textures || [];
  let h = `<h4>${L('Özel dokular', 'Custom textures')}</h4>`;
  if (!ts.length) h += `<p class="muted" style="margin:0 0 6px">${L('Kendi karo / parke / taş görselini yükle; oda, döşeme ve kat döşemesi kaplama listesinde çıkar.', 'Upload your own tile / parquet / stone image; it shows up in the finish list of rooms, slabs and the floor slab.')}</p>`;
  for (const t of ts) {
    const e = TEX.get(t.id), thumb = e ? `<img src="${e.url}" alt="" style="width:26px;height:26px;object-fit:cover;border-radius:4px;flex:none">` : `<span style="width:26px;flex:none;text-align:center" title="${L('Görsel bu tarayıcıda yok', 'Image not in this browser')}">⚠</span>`;
    h += `<div class="row tex-row">${thumb}<input type="text" data-k="tex" data-p="name" data-tid="${t.id}" value="${esc(t.name)}">`
      + `<input type="number" data-k="tex" data-p="w" data-tid="${t.id}" value="${t.w}" min="1" title="${L('Tekrar genişliği (cm)', 'Repeat width (cm)')}">×`
      + `<input type="number" data-k="tex" data-p="h" data-tid="${t.id}" value="${t.h}" min="1" title="${L('Tekrar yüksekliği (cm)', 'Repeat height (cm)')}">`
      + `<button class="btn sm" data-act="texdel" data-tid="${t.id}" title="${L('Dokuyu sil', 'Delete texture')}">✕</button></div>`;
  }
  return h + `<div class="row"><button class="btn sm" data-act="texadd">${L('🖼 Doku yükle…', '🖼 Upload texture…')}</button></div>`;
}
/* ---------- Kapı malzemesi ve rengi (issue #41) ----------
   op.mat: 'wood' | 'glass' | 'paneled' | 'metal'. Alan yoksa sürgülü kapı cam, diğer kapılar ahşap kalır,
   böylece eski projeler aynı görünür. op.color = kanat rengi (tam camda yok), op.frameCol = kasa / pervaz
   rengi (her açıklıkta), op.glass = 'clear' | 'frosted' (tam cam ve cam bölmelide). */
const DOOR_MATS = { wood: ['Ahşap / lake', 'Wood / lacquer'], glass: ['Tam cam', 'Full glass'], paneled: ['Cam bölmeli (Fransız)', 'Glass-paneled (French)'], metal: ['Metal / çelik', 'Metal / steel'] };
const GLASS_KINDS = { clear: ['Şeffaf', 'Clear'], frosted: ['Buzlu', 'Frosted'] };
const DOOR_LEAF = { wood: '#b08968', paneled: '#f5f5f4', metal: '#334155', glass: '#cbd5e1' };
const isDoorOp = o => o.type === 'door' || o.type === 'double' || o.type === 'slide';
const doorMat = o => DOOR_MATS[o.mat] ? o.mat : (o.type === 'slide' ? 'glass' : 'wood');
const doorLeafCol = o => o.color || DOOR_LEAF[doorMat(o)];
const doorGlass = o => o.glass === 'frosted' ? { c: 0xe6eef4, op: 0.72 } : { c: 0x9fd3ee, op: 0.38 };
/* Bir kapı kanadı (3B): merkez (cx, y0 + H/2, cz), genişlik lw; sgn = kolun olduğu yan (+1 sağ / −1 sol).
   flush: sürgülü panellerde çıkıntılı kol yok. Parça sayısı kanat başına ≤ 9. */
function doorLeaf3D(par, o, lw, H, cx, y0, cz, sgn, C, flush = false) {
  const { box, cyl, det } = C, m = doorMat(o), col = doorLeafCol(o), gl = doorGlass(o), steel = 0xc7cdd4, lh = H * 0.97;
  const hx = cx + sgn * (lw / 2 - 9);
  const lever = c => { if (!det || flush) return; const hd = cyl(par, 1.6, 8, c, hx, y0 + H * 0.47, cz + 5.5, 12); hd.rotation.x = Math.PI / 2; };
  if (m === 'glass') {
    box(par, lw, lh, 1.2, gl.c, cx, y0 + H / 2, cz, 0, gl.op, false);
    if (!det) return;
    // üst/alt pivot menteşe blokları + iki yüzde dikey paslanmaz boru kulp
    const px = cx - sgn * (lw / 2 - 6);
    box(par, 10, 5, 3, steel, px, y0 + 4, cz, 0, 0, false); box(par, 10, 5, 3, steel, px, y0 + lh - 3, cz, 0, 0, false);
    if (!flush) for (const zs of [-1, 1]) {
      cyl(par, 1.2, H * 0.45, steel, hx, y0 + H * 0.5, cz + zs * 4.6, 10);
      for (const dy of [-0.2, 0.2]) box(par, 1.4, 1.4, 3.6, steel, hx, y0 + H * (0.5 + dy), cz + zs * 2.6, 0, 0, false);
    }
  } else if (m === 'paneled') {
    // çerçeve (dikmeler + kayıtlar) kanat renginde, ortada cam; orta kayıt camın önünden geçer
    const fw = Math.min(10, lw * 0.14), T = 4, iw = lw - 2 * fw;
    box(par, fw, lh, T, col, cx - lw / 2 + fw / 2, y0 + lh / 2, cz, 0, 0, det);
    box(par, fw, lh, T, col, cx + lw / 2 - fw / 2, y0 + lh / 2, cz, 0, 0, det);
    box(par, iw, fw * 1.2, T, col, cx, y0 + lh - fw * 0.6, cz, 0, 0, det);
    box(par, iw, fw * 2.2, T, col, cx, y0 + fw * 1.1, cz, 0, 0, det);
    box(par, iw, fw * 0.8, T, col, cx, y0 + H * 0.5, cz, 0, 0, false);
    box(par, iw, lh - fw * 3.4, 1.2, gl.c, cx, y0 + (fw * 2.2 + lh - fw * 1.2) / 2, cz, 0, gl.op, false);
    lever(0x9aa6b2);
  } else if (m === 'metal') {
    box(par, lw, lh, 4.5, col, cx, y0 + H / 2, cz, 0, 0, det);
    if (det) for (const fy of [0.3, 0.7]) box(par, lw * 0.86, 1.2, 4.9, shade(col, 0.2), cx, y0 + H * fy, cz, 0, 0, false);
    lever(steel);
  } else {
    box(par, lw, lh, 4, col, cx, y0 + H / 2, cz, 0, 0, det);
    if (det) box(par, lw * 0.68, H * 0.62, 1.5, o.color ? shade(col, 0.22) : 0xd7b494, cx, y0 + H * 0.53, cz + 2.8, 0, 0, false);
    lever(0x9aa6b2);
  }
}
function normalizeProject(P) {
  if (!P.floors || !P.floors.length) P.floors = [newFloor(L('Zemin Kat', 'Ground Floor'))];
  P.grid = P.grid || 10; P.gridType = P.gridType || 'square'; P.wallT = P.wallT || 20; P.wallH = P.wallH || 270;
  P.lib = Object.assign({ shapes: [] }, P.lib || {}); P.lib.shapes = P.lib.shapes || [];
  P.lib.presets = (Array.isArray(P.lib.presets) ? P.lib.presets : []).filter(p => p && p.id && (p.kind === 'op' || p.kind === 'furn') && +p.w > 0); // #42
  if (P.bg) P.bg.id = 'bg';
  P.textures = (Array.isArray(P.textures) ? P.textures : []).filter(t => t && /^[\w-]{1,32}$/.test(t.id))
    .map(t => ({ id: t.id, name: String(t.name || t.id).slice(0, 60), w: clamp(+t.w || 60, 1, 5000), h: clamp(+t.h || +t.w || 60, 1, 5000) }));
  if (!Array.isArray(P.layers) || !P.layers.length) P.layers = [defaultLayer()];
  if (!P.layers.some(l => l.id === '0')) P.layers.unshift(defaultLayer());
  P.layers.forEach(l => { l.vis = l.vis !== false; l.lock = !!l.lock; l.print = l.print !== false; l.name = l.name || l.id; });
  if (!P.layers.some(l => l.id === P.activeLayer)) P.activeLayer = '0';
  if (P.layers.length > 1) { const ids = new Set(P.layers.map(l => l.id)); P.floors.forEach(f => { for (const k in KINDS) for (const o of f[k] || []) if (!ids.has(o.layer)) o.layer = '0'; }); }
  P.floors.forEach(f => { for (const k in KINDS) f[k] = f[k] || []; f.groups = f.groups || []; f.slabFloor = f.slabFloor || 'none'; if (f.slabColor === undefined) f.slabColor = null; for (const o of f.ops) if (o.open == null) o.open = 0; for (const w of f.walls) if (!w.wt) w.wt = 'solid';
    for (const s of f.slabs) { if (!(s.t > 0)) s.t = 20; s.floor = s.floor || 'concrete'; s.off = +s.off || 0; }
    for (const v of f.voids) if (!VOID_TYPES[v.type]) v.type = 'stair';
    for (const o of f.furn) cleanParts(o); }); // parçalı mobilya: alanı olmayan eski öğelere dokunulmaz
  return P;
}
function loadProject(obj, msg) {
  P = normalizeProject(absorbTextures(obj));
  ensureTextures(P);
  fi = 0; sel = []; ui.draw = null; ui.dimStart = null; ui.polyPts = null; placing = null;
  hist = [JSON.stringify(P)]; hi = 0;
  $('#pname').value = P.name; syncGridUI();
  setTool('select'); fit(); syncTab(); refresh(); updateUndo(); autosave(); buildLib();
  if (msg) toast(msg);
}
/* ---------- Proje sekmeleri (issue #17) ----------
   Açık projeler sekmelerde durur; her sekme kendi P / geri-al geçmişi / kat / görünüm
   / seçimini taşır. Etkin sekmenin durumu her zamanki gibi global değişkenlerdedir;
   geçişte stashTab() globalleri sekmeye yazar, sekmeden geri yükler. Pano (ui.clip)
   globaldir, bu yüzden projeler arası kopyala-yapıştır kendiliğinden çalışır. */
let tabs = [], tabIdx = 0;
const tabSnapshot = () => ({ P, hist, hi, fi, view: { ...view }, sel: sel.slice() });
function syncTab() {
  if (!tabs[tabIdx]) tabs[tabIdx] = { id: uid() };
  Object.assign(tabs[tabIdx], tabSnapshot());
  renderTabs();
}
function isPristine(p) {
  return !p || (!p.bg && (p.floors || []).every(f => ['walls', 'furn', 'rooms', 'dims', 'texts', 'sketches'].every(k => !(f[k] || []).length)));
}
// Bir proje açılmadan önce çağrılır: mevcut sekmede iş varsa yanına yeni boş sekme açar
function newTabSlot() {
  if (!P || isPristine(P)) return;
  syncTab(); tabs.splice(tabIdx + 1, 0, { id: uid() }); tabIdx++;
}
function activateTab(i) {
  const t = tabs[i]; if (!t || !t.P) return;
  tabIdx = i; P = normalizeProject(t.P); ensureTextures(P);
  hist = t.hist && t.hist.length ? t.hist : [JSON.stringify(P)]; hi = clamp(t.hi ?? hist.length - 1, 0, hist.length - 1);
  fi = clamp(t.fi || 0, 0, P.floors.length - 1);
  ui.draw = null; ui.typed = ''; ui.dimStart = null; ui.polyPts = null; ui.calib = null; ui.drag = null; ui.pen = null; placing = null;
  sel = (t.sel || []).filter(id => find(id));
  $('#pname').value = P.name; syncGridUI();
  if (t.view) Object.assign(view, t.view); else fit();
  if (tool === 'place') setTool('select');
  refresh(); updateUndo(); renderTabs(); autosave(); buildLib();
  if (ui.view3d && T3) schedBuild3D();
}
function switchTab(i) {
  if (i === tabIdx || !tabs[i]) return;
  syncTab(); activateTab(i);
}
async function savedCopyMatches(p) {
  try { const it = await dbGet('projects', p.name); return !!it && JSON.stringify(it.project) === JSON.stringify(p); } catch (e) { return false; }
}
async function closeTab(i) {
  if (!tabs[i]) return;
  if (i === tabIdx) syncTab();
  const p = tabs[i].P;
  if (!isPristine(p) && !(await savedCopyMatches(p))
    && !confirm(L(`“${p.name}” kaydedilmemiş. Sekme kapatılırsa değişiklikler kaybolur. Kapatılsın mı?`, `“${p.name}” is not saved. Closing the tab discards its changes. Close it?`))) return;
  if (tabs.length === 1) { tabs = []; tabIdx = 0; loadProject(newProject()); return; }
  tabs.splice(i, 1);
  if (i === tabIdx) activateTab(Math.min(i, tabs.length - 1));
  else { if (i < tabIdx) tabIdx--; renderTabs(); autosave(); }
}
// IndexedDB 'state'/'tabs': yalnızca projeler kalıcıdır (geçmiş değil); etkin proje 'auto' anahtarında
function tabsState() {
  return { active: tabIdx, tabs: tabs.length > 1 ? tabs.map((t, i) => ({ id: t.id, P: JSON.parse(JSON.stringify(i === tabIdx ? P : t.P)) })) : [] };
}
function restoreTabs(st) {
  if (!st || !Array.isArray(st.tabs) || st.tabs.length < 2) return;
  const act = clamp(st.active | 0, 0, st.tabs.length - 1), live = tabSnapshot();
  tabs = st.tabs.filter(t => t && t.P && t.P.floors).map(t => ({ id: t.id || uid(), P: normalizeProject(t.P), hist: [JSON.stringify(t.P)], hi: 0, fi: 0, view: null, sel: [] }));
  if (!tabs.length) { tabs = [{ id: uid(), ...live }]; tabIdx = 0; renderTabs(); return; }
  tabIdx = Math.min(act, tabs.length - 1);
  Object.assign(tabs[tabIdx], live);   // etkin sekmenin otoritesi 'auto' (ve AI köprüsü) kaydıdır
  renderTabs();
}
function renderTabs() {
  const el = $('#ptabs'); if (!el) return;
  el.innerHTML = tabs.map((t, i) => {
    const nm = (i === tabIdx ? P && P.name : t.P && t.P.name) || L('Yeni Proje', 'New Project');
    return `<div class="ptab${i === tabIdx ? ' on' : ''}" data-tab="${i}" title="${esc(nm)} — ${L('çift tık: yeniden adlandır', 'double-click: rename')}"><span class="ptn">📐 ${esc(nm)}</span><button class="ptx" data-tabclose="${i}" title="${L('Projeyi kapat', 'Close project')}">×</button></div>`;
  }).join('') + `<button class="ptab-add" data-tabnew title="${L('Yeni proje sekmesi', 'New project tab')}">＋</button>`;
}
$('#ptabs').addEventListener('click', e => {
  const c = e.target.closest('[data-tabclose]'); if (c) { e.stopPropagation(); closeTab(+c.dataset.tabclose); return; }
  if (e.target.closest('[data-tabnew]')) { templatesModal(); return; }
  const t = e.target.closest('[data-tab]'); if (t) switchTab(+t.dataset.tab);
});
$('#ptabs').addEventListener('dblclick', e => {
  const t = e.target.closest('[data-tab]'); if (!t || e.target.closest('[data-tabclose]')) return;
  if (+t.dataset.tab !== tabIdx) switchTab(+t.dataset.tab);
  const nm = prompt(L('Proje adı:', 'Project name:'), P.name);
  if (nm && nm.trim()) { P.name = nm.trim(); $('#pname').value = P.name; commit(); renderTabs(); }
});
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

/* ---------- Görünüm ---------- */
const cv = $('#cv');
function svgSize() { const r = cv.getBoundingClientRect(); return { w: r.width, h: r.height, l: r.left, t: r.top }; }
function w2s(p) { return { x: p.x * view.z + view.x, y: p.y * view.z + view.y }; }
function wpos(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.z, y: (e.clientY - r.top - view.y) / view.z }; }
function applyView() {
  $('#world').setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.z})`);
  const pct = view.z * 100;
  $('#zoomlbl').textContent = (pct >= 10 ? Math.round(pct) : +pct.toFixed(1)) + '%';
  const gl = $('#gridlbl');
  if (gl) {
    const G = gridScale();
    gl.textContent = (P.gridType || 'square') === 'none' ? '' : L('Izgara', 'Grid') + ' ' + gridStepLabel(G.minor || G.major);
  }
}
function zoomAt(f, sx, sy) {
  const nz = clamp(view.z * f, MIN_ZOOM, MAX_ZOOM), wx = (sx - view.x) / view.z, wy = (sy - view.y) / view.z;
  view.z = nz; view.x = sx - wx * nz; view.y = sy - wy * nz; render();
}
function fit() {
  const s = svgSize(); let b = contentBounds();
  if (!b && P.bg) b = { x0: P.bg.x, y0: P.bg.y, x1: P.bg.x + P.bg.w, y1: P.bg.y + P.bg.h };
  if (!b) b = { x0: 0, y0: 0, x1: 1000, y1: 700 };
  const bw = Math.max(b.x1 - b.x0, 200), bh = Math.max(b.y1 - b.y0, 200);
  view.z = clamp(Math.min(s.w / bw, s.h / bh) * 0.8, MIN_ZOOM, 3);
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
    roomOp: 0.55, furnOp: 1, wood: '#92400e', tile: '#475569', carpet: '#6b7280', marble: '#64748b', concrete: '#57534e', stone: '#78716c',
    grass: '#3f6212', water: '#0369a1', gravel: '#57534e', deck: '#7c4a1e', asphalt: '#1f2937'
  } : {
    lt: false, bg: '#0b0f14', wall: '#d5dee8', stroke: '#94a3b8', furnStroke: '#161e29',
    gMin: '#161f2c', gMaj: '#243244', dotMaj: '#475569',
    text: '#e6edf5', sub: '#b8c5d6', halo: '#0b0f14', accent: '#d99b26',
    dim: '#2dd4bf', glass: '#0369a1', swing: '#64748b',
    roomOp: 0.3, furnOp: 0.88, wood: '#d97706', tile: '#94a3b8', carpet: '#9ca3af', marble: '#cbd5e1', concrete: '#a8a29e', stone: '#a8a29e',
    grass: '#84cc16', water: '#38bdf8', gravel: '#d6d3d1', deck: '#f59e0b', asphalt: '#94a3b8'
  };
}
/* ---------- Uyarlanan ızgara (issue #38) ----------
   Yakalama daima P.grid'e bağlıdır; burada yalnızca ÇİZİLEN aralık büyür.
   Uzaklaştıkça ana ızgara kademelenir (1 m → 2 m → 5 m → 10 m → 20 m →
   50 m → 100 m → 500 m …), alt ızgara ise ekranda okunamayacak kadar sıklaşınca
   gizlenir. Böylece kilometrelerce genişlikteki vaziyet planlarında tuval
   boş kalmaz ve ölçek duygusu korunur. */
const GRID_MINOR_PX = 6;    // alt çizgiler bundan sık olursa lekeye döner
const GRID_MAJOR_PX = 46;   // ana çizgiler en az bu kadar aralıkla çizilir
/** Çarpan merdiveni: 1 → 2 → 5 → 10 → 20 → 50 … (ana ızgara hep P.grid'in katı olur). */
function gridFactor(k) {
  const e = Math.floor(Math.log10(Math.max(k, 1))), p = Math.pow(10, e), n = k / p;
  return (n < 1.5 ? 2 : n < 3.5 ? 5 : n < 7.5 ? 10 : 20) * p;
}
/** O an ekranda çizilecek ızgara aralıkları (cm); minor = 0 → alt ızgara gizli. */
function gridScale(z = view.z) {
  const base = Math.max(1, +P.grid || 1);
  const minor = base * z >= GRID_MINOR_PX ? base : 0;
  // merdiven eski sabit ana aralıktan başlar (≥25 cm → 4–5 hücre, yoksa 1 m), böylece
  // normal yakınlıkta ızgara eskisi gibi görünür ve 25 cm adımda 1.25 m gibi tuhaf
  // aralıklar çıkmaz; 1 m P.grid'in katı değilse en yakın üst kata yuvarlanır
  const ms = base >= 100 ? base * 5 : base >= 25 ? base * 4 : 100 % base ? base * Math.ceil(100 / base) : 100;
  let f = 1, guard = 0;
  // ana çizgiler ekranda en az GRID_MAJOR_PX aralıkla çizilir
  while (ms * f * z < GRID_MAJOR_PX && guard++ < 24) f = gridFactor(f);
  const major = ms * f;
  return { minor, major, minorPx: minor * z, majorPx: major * z };
}
/** Izgara aralığını okunur yazar: 25 cm · 1 m · 2.5 m · 500 m. */
function gridStepLabel(cm) {
  if (cm >= 100) { const m = cm / 100; return (Number.isInteger(m) ? m : +m.toFixed(2)) + ' m'; }
  return +(Math.round(cm * 10) / 10) + ' cm';
}
function defsSvg() {
  const C = pal(), G = gridScale(), s = G.minor || Math.max(1, +P.grid || 1), ms = G.major;
  const h = +(s * Math.sqrt(3) / 2).toFixed(4), h2 = +(2 * h).toFixed(4);
  const mh = +(ms * Math.sqrt(3) / 2).toFixed(4), mh2 = +(2 * mh).toFixed(4);
  const swMin = 0.65 / view.z, swMaj = 0.95 / view.z, rDot = Math.max(1.1, 1.5 / view.z), rDotM = Math.max(1.8, 2.3 / view.z);
  return `
  <pattern id="p-wood" width="120" height="24" patternUnits="userSpaceOnUse"><path d="M0 0H120M0 12H120M40 0V12M90 12V24" stroke="${C.wood}" stroke-opacity=".3" fill="none" stroke-width="1"/></pattern>
  <pattern id="p-tile" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M0 0H60V60" stroke="${C.tile}" stroke-opacity=".32" fill="none" stroke-width="1"/></pattern>
  <pattern id="p-carpet" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="2.5" cy="2.5" r="1.1" fill="${C.carpet}" fill-opacity=".38"/><circle cx="7.5" cy="7.5" r="1.1" fill="${C.carpet}" fill-opacity=".38"/></pattern>
  <pattern id="p-marble" width="120" height="120" patternUnits="userSpaceOnUse"><path d="M0 0H120V120" stroke="${C.marble}" stroke-opacity=".3" fill="none" stroke-width="1"/><path d="M8 30C30 22 38 52 64 44S96 70 116 62M20 96C40 84 58 104 84 92" stroke="${C.marble}" stroke-opacity=".28" fill="none" stroke-width="1.2"/></pattern>
  <pattern id="p-concrete" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="6" cy="9" r="1" fill="${C.concrete}" fill-opacity=".35"/><circle cx="27" cy="5" r=".8" fill="${C.concrete}" fill-opacity=".3"/><circle cx="18" cy="24" r="1.1" fill="${C.concrete}" fill-opacity=".3"/><circle cx="34" cy="31" r=".9" fill="${C.concrete}" fill-opacity=".35"/><circle cx="9" cy="35" r=".7" fill="${C.concrete}" fill-opacity=".3"/></pattern>
  <pattern id="p-stone" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M0 0H80M0 40H80M0 0V40M50 0V40M25 40V80M70 40V80" stroke="${C.stone}" stroke-opacity=".4" fill="none" stroke-width="2"/></pattern>
  <pattern id="p-grass" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="${C.grass}" fill-opacity=".1"/><path d="M5 15l2-7l2 7M21 33l2-7l2 7M29 12l2-6l2 6M11 37l1.6-5l1.6 5M35 27l1.6-5l1.6 5" stroke="${C.grass}" stroke-opacity=".6" fill="none" stroke-width="1"/></pattern>
  <pattern id="p-glass" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="100" height="100" fill="${C.glass}" fill-opacity="${C.lt ? 0.6 : 0.28}"/><path d="M0 0H100M0 0V100" stroke="${C.sub}" stroke-opacity=".6" stroke-width="1.6" fill="none"/><path d="M16 44L44 16M24 52L52 24M60 88L88 60" stroke="${C.sub}" stroke-opacity=".45" stroke-width=".9" fill="none"/></pattern>
  <pattern id="p-water" width="60" height="24" patternUnits="userSpaceOnUse"><rect width="60" height="24" fill="${C.water}" fill-opacity=".14"/><path d="M0 6q7.5-4 15 0t15 0t15 0t15 0M0 18q7.5-4 15 0t15 0t15 0t15 0" stroke="${C.water}" stroke-opacity=".55" fill="none" stroke-width="1.1"/></pattern>
  <pattern id="p-gravel" width="30" height="30" patternUnits="userSpaceOnUse"><g fill="none" stroke="${C.gravel}" stroke-opacity=".55" stroke-width=".8"><ellipse cx="5" cy="6" rx="2.6" ry="1.8"/><ellipse cx="17" cy="4" rx="1.8" ry="1.4"/><ellipse cx="25" cy="13" rx="2.4" ry="1.9"/><ellipse cx="11" cy="16" rx="2" ry="1.5"/><ellipse cx="4" cy="25" rx="1.7" ry="1.3"/><ellipse cx="19" cy="25" rx="2.8" ry="2"/></g></pattern>
  <pattern id="p-deck" width="120" height="15" patternUnits="userSpaceOnUse"><path d="M0 0.5H120M0 2H120M75 2V15" stroke="${C.deck}" stroke-opacity=".45" fill="none" stroke-width="1"/><circle cx="8" cy="8.5" r=".8" fill="${C.deck}" fill-opacity=".5"/><circle cx="68" cy="8.5" r=".8" fill="${C.deck}" fill-opacity=".5"/></pattern>
  <pattern id="p-asphalt" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="${C.asphalt}" fill-opacity=".16"/><g fill="${C.asphalt}" fill-opacity=".5"><circle cx="3" cy="4" r=".7"/><circle cx="11" cy="2" r=".5"/><circle cx="16" cy="9" r=".7"/><circle cx="7" cy="12" r=".5"/><circle cx="14" cy="17" r=".6"/><circle cx="2" cy="17" r=".5"/></g></pattern>
  ${texPatterns()}
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
  const G = gridScale();
  const s = svgSize(), x0 = -view.x / view.z, y0 = -view.y / view.z, w = s.w / view.z, h = s.h / view.z;
  let out = '';
  const minId = gt === 'triangle' ? 'g-tri-minor' : gt === 'dots' ? 'g-dots-minor' : 'g-minor';
  const majId = gt === 'triangle' ? 'g-tri-major' : gt === 'dots' ? 'g-dots-major' : 'g-major';
  if (G.minor) out += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#${minId})" pointer-events="none"/>`;
  // Ana ızgara hiçbir yakınlaştırmada kaybolmaz; aralığı gridScale() büyütür (issue #38)
  out += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="url(#${majId})" pointer-events="none"/>`;
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
  const canHitPoly = live && (sel.includes(r.id) || hasVars || grpHasVars(r.grp)); // düzeni olan oda / grup gövdesinden tıklanır (#66)
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
  const fk = finishKind(r.floor);
  if (fk) s += `<polygon points="${pts}" fill="url(#${finishPat(fk)})" pointer-events="none"/>`;
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
// Serbest döşeme / balkon (issue #22): odaların altında, kesikli sınır + malzeme deseni.
// data-low: yalnızca üstünde başka nesne yoksa seçilir (boşluk 1, döşeme 2 → boşluk önce)
function slabSvg(s, live) {
  if (!s.pts || s.pts.length < 3) return '';
  const C = pal(), z = view.z, pts = s.pts.map(p => p.x + ',' + p.y).join(' ');
  const hit = live ? `data-id="${s.id}" data-low="2" style="cursor:pointer"` : `pointer-events="none"`;
  let out = `<polygon points="${pts}" fill="${s.color || C.sub}" fill-opacity="${s.color ? 0.35 : 0.12}" ${hit}/>`;
  const fk = finishKind(s.floor);
  if (fk) out += `<polygon points="${pts}" fill="url(#${finishPat(fk)})" pointer-events="none"/>`;
  out += `<polygon points="${pts}" fill="none" stroke="${C.sub}" stroke-width="${Math.max(1.5, 1.5 / z)}" stroke-dasharray="${6 / z} ${3 / z}" pointer-events="none"/>`;
  if (s.name) {
    const c = polyCentroid(s.pts), fs = clamp(Math.sqrt(Math.abs(polyArea(s.pts))) / 16, 12, 26);
    out += `<text x="${c.x}" y="${c.y}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-style="italic" fill="${C.sub}" stroke="${C.halo}" stroke-width="${fs * 0.16}" paint-order="stroke" font-family="Segoe UI,sans-serif" pointer-events="none">${esc(s.name)}</text>`;
  }
  return out;
}
// Döşeme boşluğu / şaft (issue #23): mimari gösterim — kesikli sınır + köşeden köşeye "X"
function voidSvg(v, live) {
  if (!v.pts || v.pts.length < 3) return '';
  const C = pal(), z = view.z, pts = v.pts.map(p => p.x + ',' + p.y).join(' '), bb = bboxOf('void', v), cid = 'vclip-' + v.id;
  const sw = Math.max(1.5, 1.5 / z), hit = live ? `data-id="${v.id}" data-low="1" style="cursor:pointer"` : `pointer-events="none"`;
  let s = `<clipPath id="${cid}"><polygon points="${pts}"/></clipPath>`;
  s += `<polygon points="${pts}" fill="${C.bg}" fill-opacity=".6" ${hit}/>`;
  s += `<g clip-path="url(#${cid})" stroke="${C.sub}" stroke-width="${sw}" pointer-events="none"><line x1="${bb.x0}" y1="${bb.y0}" x2="${bb.x1}" y2="${bb.y1}"/><line x1="${bb.x1}" y1="${bb.y0}" x2="${bb.x0}" y2="${bb.y1}"/></g>`;
  s += `<polygon points="${pts}" fill="none" stroke="${C.text}" stroke-width="${sw}" stroke-dasharray="${5 / z} ${3 / z}" pointer-events="none"/>`;
  const t = v.name || L(...(VOID_TYPES[v.type] || VOID_TYPES.stair)), c = polyCentroid(v.pts);
  const fs = clamp(Math.min(bb.x1 - bb.x0, bb.y1 - bb.y0) / 7, 10, 22);
  s += `<text x="${c.x}" y="${c.y}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="700" fill="${C.text}" stroke="${C.halo}" stroke-width="${fs * 0.22}" paint-order="stroke" font-family="Segoe UI,sans-serif" pointer-events="none">${esc(t)}</text>`;
  return s;
}
function wallSvg(w, live, f) {
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
    // cam cephe: kenar çizgileri + cam dolgu + dikme işaretleri (modül / adet ayarlanabilir, #71)
    const Lc = wLen(w) || 1, ux = (w.b.x - w.a.x) / Lc, uy = (w.b.y - w.a.y) / Lc, nx = -uy, ny = ux;
    const sw = Math.max(1.1, w.t * 0.12);
    s += `<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${C.wall}" stroke-width="${w.t}" stroke-linecap="butt" pointer-events="none"/>`;
    s += `<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${C.glass}" stroke-width="${Math.max(1, w.t - 2 * sw)}" stroke-linecap="butt" pointer-events="none"/>`;
    const nTick = curtainBays(w);
    for (let i = 1; i < nTick; i++) {
      const px = w.a.x + ux * (Lc * i / nTick), py = w.a.y + uy * (Lc * i / nTick), hw2 = w.t / 2 - sw * 0.5;
      s += `<line x1="${px - nx * hw2}" y1="${py - ny * hw2}" x2="${px + nx * hw2}" y2="${py + ny * hw2}" stroke="${C.wall}" stroke-width="${sw}" pointer-events="none"/>`;
    }
  } else if (isLowWall(w)) {
    s += lowWallSvg(w, C, f);
  } else {
    s += `<line x1="${w.a.x}" y1="${w.a.y}" x2="${w.b.x}" y2="${w.b.y}" stroke="${C.wall}" stroke-width="${w.t}" stroke-linecap="butt" pointer-events="none"/>`;
    if (w.color) s += wallPaintSvg(w);
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
// Korkuluk / bahçe çiti 2B (#73): korkuluk = iki ince ray + kare dikmeler; çit = orta çizgi + dikmeler + çıta işaretleri
function lowWallSvg(w, C, f) {
  const L = wLen(w); if (L < 1) return '';
  const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L, nx = -uy, ny = ux, at = d => ({ x: w.a.x + ux * d, y: w.a.y + uy * d });
  const ops = f ? (f.ops || []).filter(o => o.wall === w.id) : [];
  const sw = clamp(w.t * 0.22, 1, 3), ps = Math.max(w.t, 5), col = w.color || C.wall;
  let s = '';
  const ln = (p, q, o, wd) => `<line x1="${p.x + nx * o}" y1="${p.y + ny * o}" x2="${q.x + nx * o}" y2="${q.y + ny * o}" stroke="${col}" stroke-width="${wd}" stroke-linecap="butt" pointer-events="none"/>`;
  for (const [s0, e0] of lowWallSolid(L, ops)) {
    const p = at(s0), q = at(e0);
    if (w.wt === 'fence') {
      s += ln(p, q, 0, sw);
      const step = Math.max(LOW_WALL.fence.bar, (e0 - s0) / 300);
      for (let d = s0 + step / 2; d < e0; d += step) { const c = at(d), k = w.t * 0.35; s += `<line x1="${c.x - nx * k}" y1="${c.y - ny * k}" x2="${c.x + nx * k}" y2="${c.y + ny * k}" stroke="${col}" stroke-width="${sw * 0.6}" pointer-events="none"/>`; }
    } else {
      s += `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="${C.bg}" stroke-opacity=".55" stroke-width="${w.t}" stroke-linecap="butt" pointer-events="none"/>`;
      s += ln(p, q, w.t / 2 - sw / 2, sw) + ln(p, q, -(w.t / 2 - sw / 2), sw);
    }
  }
  for (const d of lowWallPosts(w, L, ops)) { const c = at(d); s += `<rect x="${c.x - ps / 2}" y="${c.y - ps / 2}" width="${ps}" height="${ps}" fill="${col}" transform="rotate(${Math.atan2(uy, ux) * 180 / Math.PI} ${c.x} ${c.y})" pointer-events="none"/>`; }
  return s;
}
// Duvar boyası 2B: koyu duvar dolgusu korunur, iki yüzeyde ince boya şeridi (dışa aktarımda da okunur)
function wallPaintSvg(w) {
  const L = wLen(w); if (L < 1) return '';
  const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L, nx = -uy, ny = ux;
  const sw = clamp(w.t * 0.22, 1.5, 5), o = w.t / 2 - sw / 2;
  let s = '';
  for (const sg of [-1, 1]) s += `<line x1="${w.a.x + nx * o * sg}" y1="${w.a.y + ny * o * sg}" x2="${w.b.x + nx * o * sg}" y2="${w.b.y + ny * o * sg}" stroke="${w.color}" stroke-width="${sw}" pointer-events="none"/>`;
  return s;
}
// Köşe birleşim dolguları (issue #14): duvar gövdeleriyle aynı renk, boşluk/çentik kalmaz
function jointsSvg(f) {
  const C = pal();
  return wallJoints(f).map(j => `<polygon points="${j.poly.map(p => p.x + ',' + p.y).join(' ')}" fill="${C.wall}" pointer-events="none"/>`).join('');
}
function wallDimSvg(w) {
  const L = wLen(w); if (L < 30) return '';
  const hit = ui.exporting ? 'pointer-events="none"' : `data-wdim="${w.id}" style="cursor:text"`; // tıkla → uzunluğu yaz (#36)
  const C = pal();
  let ang = wAng(w) * 180 / Math.PI; const mx = (w.a.x + w.b.x) / 2, my = (w.a.y + w.b.y) / 2;
  let flip = 1; if (ang > 90 || ang <= -90) { ang += 180; flip = -1; }
  const fs = clamp(13 / view.z, 9, 40), off = w.t / 2 + fs * 0.9;
  return `<text transform="translate(${mx} ${my}) rotate(${ang}) translate(0 ${-off})" text-anchor="middle" font-size="${fs}" fill="${C.sub}" stroke="${C.halo}" stroke-width="${fs * 0.25}" paint-order="stroke" font-family="Segoe UI,sans-serif" ${hit}>${fmtLen(L)}</text>`;
}
function opSvg(op, live) {
  const p = opPos(op); if (!p) return '';
  const C = pal(), w = op.w, t = p.t, hw = w / 2, ht = t / 2, sd = op.side || 1, sw = sd > 0 ? 1 : 0;
  const stk = `stroke="${C.stroke}" fill="none" stroke-width="2"`;
  // kapı malzemesi (#41): cam kanat = cam dolgulu kalın çizgi + ince kenar, cam bölmeli = çerçeve içinde cam, metal = kalın
  const dm = isDoorOp(op) ? doorMat(op) : 'wood';
  const leafLn = (x1, y1, x2, y2) => {
    const xy = `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`;
    if (dm === 'glass') return `<line ${xy} stroke="${C.glass}" stroke-width="5" stroke-opacity="${C.lt ? 1 : 0.8}"/><line ${xy} stroke="${C.stroke}" stroke-width="1"/>`;
    if (dm === 'paneled') return `<line ${xy} stroke="${C.stroke}" stroke-width="3.6"/><line ${xy} stroke="${C.glass}" stroke-width="1.6"/>`;
    return `<line ${xy} ${stk}${dm === 'metal' ? ' stroke-width="3.2"' : ''}/>`;
  };
  let s = `<g transform="translate(${p.x} ${p.y}) rotate(${p.ang})">`;
  s += `<rect x="${-hw}" y="${-ht - 1}" width="${w}" height="${t + 2}" fill="${C.bg}"/>`;
  s += `<g transform="scale(${op.flip ? -1 : 1} 1)">`;
  if (op.type === 'door') {
    if (op.open) s += leafLn(-hw, 0, -hw, sd * w);
    else s += leafLn(-hw, 0, hw, 0);
    s += `<path d="M${hw} 0A${w} ${w} 0 0 ${sw} ${-hw} ${sd * w}" stroke="${C.swing}" fill="none" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  } else if (op.type === 'double') {
    const l = w / 2;
    if (op.open) s += leafLn(-hw, 0, -hw, sd * l) + leafLn(hw, 0, hw, sd * l);
    else s += leafLn(-hw, 0, 0, 0) + leafLn(0, 0, hw, 0);
    s += `<path d="M0 0A${l} ${l} 0 0 ${sw} ${-hw} ${sd * l}M0 0A${l} ${l} 0 0 ${1 - sw} ${hw} ${sd * l}" stroke="${C.swing}" fill="none" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  } else if (op.type === 'slide') {
    const sx = op.open ? -hw : -hw + w * 0.45;
    const sf = dm === 'glass' || dm === 'paneled' ? ` fill="${C.glass}" fill-opacity="${C.lt ? 1 : 0.6}"` : '';
    s += `<rect x="${-hw}" y="${-ht * 0.7}" width="${w * 0.55}" height="${ht * 0.7}" ${stk}${sf}/><rect x="${sx}" y="0" width="${w * 0.55}" height="${ht * 0.7}" ${stk}${sf}/>`;
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
/* ---------- Çatı öğesi (IFC çatıları): k: 'roof', faces = [[[x, y, z], …], …] yerel (merkez 0,0; z tabandan),
   fbase = yüzlerin tasarlandığı kutu; w / d / h değişince yüzler orantılı ölçeklenir (yeniden boyutlandır / grup ölçeği çalışır). */
function roofFaces(o) {
  const fb = o.fbase || { w: o.w, d: o.d, h: o.h }, sx = o.w / (fb.w || 1), sy = o.d / (fb.d || 1), sz = o.h / (fb.h || 1);
  return (Array.isArray(o.faces) ? o.faces : []).filter(f => Array.isArray(f) && f.length >= 3).map(f => f.map(p => [(+p[0] || 0) * sx, (+p[1] || 0) * sy, (+p[2] || 0) * sz]));
}
// yukarıdan görünen yüzler: düşey olmayan ve merkezinin üstünde daha yüksek bir yüz bulunmayanlar (alt / saçak altı yüzleri elenir)
const roofTopCache = new WeakMap();
function roofTopFaces(f) {
  const key = [f.w, f.d, f.h, f.fbase && f.fbase.w, f.fbase && f.fbase.d, f.fbase && f.fbase.h].join('|'), hit = Array.isArray(f.faces) && roofTopCache.get(f.faces);
  if (hit && hit.key === key) return hit.out;
  const fl = roofFaces(f).map(q => {
    let nx = 0, ny = 0, nz = 0, cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); cx += a[0]; cy += a[1]; cz += a[2]; }
    return { q, n: [nx, ny, nz], c: [cx / q.length, cy / q.length, cz / q.length], pts: q.map(p => ({ x: p[0], y: p[1] })) };
  }).filter(o => Math.abs(o.n[2]) > 1e-6 * (Math.abs(o.n[0]) + Math.abs(o.n[1]) + Math.abs(o.n[2]) + 1e-9) * 50);
  const zAt = (g, x, y) => g.c[2] - (g.n[0] * (x - g.c[0]) + g.n[1] * (y - g.c[1])) / g.n[2];
  const out = fl.filter(F => !fl.some(G => G !== F && pointInPoly({ x: F.c[0], y: F.c[1] }, G.pts) && zAt(G, F.c[0], F.c[1]) > F.c[2] + 0.5)).map(o => o.q);
  out.sort((a, b) => Math.max(...a.map(p => p[2])) - Math.max(...b.map(p => p[2])));
  if (Array.isArray(f.faces)) roofTopCache.set(f.faces, { key, out });
  return out;
}
function roofSvg(f, col, fop, sk) {
  // yukarıdan bakış: en alçaktan en yükseğe, yalnızca görünen (üst) yüzler; mahya / kırma çizgileri kenarlardan okunur
  const fs = roofTopFaces(f);
  // plan kuralı: çatı kesit düzleminin üstünde → çok hafif dolgu + kesikli kenarlar (mahya / kırma / saçak), alttaki plan okunur
  const dash = `stroke-dasharray="${Math.max(4, 8 / view.z)} ${Math.max(3, 5 / view.z)}"`;
  return fs.map(q => `<polygon points="${q.map(p => p[0] + ',' + p[1]).join(' ')}" fill="${col}" fill-opacity="0.07" stroke="${sk}" stroke-width="1.4" ${dash} stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`).join('')
    || `<rect x="${-f.w / 2}" y="${-f.d / 2}" width="${f.w}" height="${f.d}" fill="${col}" fill-opacity="0.07" stroke="${sk}" stroke-width="1.4" ${dash}/>`;
}
function furnBody(f) {
  if (Array.isArray(f.parts) && f.parts.length) return partsSvg(f); // çok parçalı mobilya (parts şeması v1)
  const C = pal(), hw = f.w / 2, hd = f.d / 2, col = f.color, sk = C.furnStroke, fop = `fill-opacity="${C.furnOp}"`;
  let s = '';
  if (f.k === 'round') s += `<ellipse rx="${hw}" ry="${hd}" fill="${col}" ${fop} stroke="${sk}" stroke-width="2"/>`;
  else if (f.k === 'poly') s += `<polygon points="${(f.pts || []).map(p => p.x + ',' + p.y).join(' ')}" fill="${col}" ${fop} stroke="${sk}" stroke-width="2"/>`;
  else if (f.k === 'roof') s += roofSvg(f, col, fop, sk);
  else if (f.k === 'stairs') {
    // parametrik merdiven (#33): 3B ile aynı basamak listesi; ok çıkış yönünü gösterir
    const st = stairSteps(f), R = Math.min(f.w, f.d) / 2;
    s += st.type === 'spiral' ? `<circle r="${R}" fill="${col}" ${fop} stroke="${sk}" stroke-width="2"/><circle r="${R * 0.14}" fill="none" stroke="${sk}" stroke-width="1.5"/>`
      : `<rect x="${-hw}" y="${-hd}" width="${f.w}" height="${f.d}" fill="${col}" ${fop} stroke="${sk}" stroke-width="2"/>`;
    s += st.steps.map(q => `<polygon points="${stepCorners(q).map(p => p.x + ',' + p.y).join(' ')}" fill="${q.landing ? sk : 'none'}" fill-opacity="${q.landing ? 0.08 : 0}" stroke="${sk}" stroke-width="1.1"/>`).join('');
    const e = st.steps[st.steps.length - 1], b0 = st.steps[0], ux = e.dx, uy = e.dy;
    s += `<polyline points="${st.steps.map(q => q.x + ',' + q.y).join(' ')}" fill="none" stroke="${sk}" stroke-width="1.8"/><circle cx="${b0.x}" cy="${b0.y}" r="3" fill="${sk}"/>`
      + `<path d="M${e.x - ux * 10 - uy * 7} ${e.y - uy * 10 + ux * 7}L${e.x + ux * 4} ${e.y + uy * 4}L${e.x - ux * 10 + uy * 7} ${e.y - uy * 10 - ux * 7}" stroke="${sk}" stroke-width="2" fill="none"/>`;
  } else if (f.k === 'ramp') {
    // rampa (#58): eğim oku (alt → üst, −y), eğim yüzdesi ve kot farkı, korkuluk çizgileri, engelli rampasında tekmelik
    const sl = rampSlope(f), fs = clamp(Math.min(f.w, f.d) * 0.12, 7, 18), tx = Math.max(hw * 0.62, Math.min(hw - fs, 30)), y0 = hd - Math.min(12, hd * 0.2), y1 = -hd + Math.min(12, hd * 0.2);
    s += `<rect x="${-hw}" y="${-hd}" width="${f.w}" height="${f.d}" fill="${col}" ${fop} stroke="${sk}" stroke-width="2"/>`;
    const nL = clamp(Math.round(f.d / 40), 2, 30); // kaymaz yüzey çizgileri (üste doğru sıklaşmaz: eşit aralık)
    for (let i = 1; i < nL; i++) { const y = -hd + i * f.d / nL; s += `<line x1="${-hw}" y1="${y}" x2="${hw}" y2="${y}" stroke="${sk}" stroke-opacity="0.25" stroke-width="0.8"/>`; }
    if (rampType(f) === 'accessible') s += [-1, 1].map(k => `<line x1="${k * (hw - 3)}" y1="${-hd}" x2="${k * (hw - 3)}" y2="${hd}" stroke="${sk}" stroke-width="1"/>`).join('');
    for (const k of rampRailSides(f)) s += `<line x1="${k * (hw - 6)}" y1="${-hd}" x2="${k * (hw - 6)}" y2="${hd}" stroke="${sk}" stroke-width="2.2"/>`;
    const aw = Math.min(10, hw * 0.4);
    s += `<line x1="0" y1="${y0}" x2="0" y2="${y1}" stroke="${sk}" stroke-width="1.8"/><circle cx="0" cy="${y0}" r="3" fill="${sk}"/>`
      + `<path d="M${-aw} ${y1 + aw * 1.4}L0 ${y1}L${aw} ${y1 + aw * 1.4}" stroke="${sk}" stroke-width="2" fill="none"/>`;
    if (f.w >= 40 && f.d >= 80) s += `<text x="${tx}" y="0" font-size="${fs}" text-anchor="middle" dominant-baseline="central" fill="${C.text}" stroke="${C.halo}" stroke-width="${fs * 0.25}" paint-order="stroke" font-family="Segoe UI,sans-serif" transform="rotate(-90 ${tx} 0)">${pctTxt(sl.pct)} · ↑${Math.round(f.h)}</text>`;
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
/* ---------- Parametrik merdiven (issue #33) ----------
   2B ve 3B aynı basamak listesini kullanır, böylece basamak sayısı her iki görünümde birebir aynıdır.
   Alanlar (hepsi isteğe bağlı, eski merdivenler varsayılanla açılır): stepN (rıht sayısı), stairType
   ('straight' | 'l' | 'u' | 'spiral'), railing ('none' | 'left' | 'right' | 'both', varsayılan 'right').
   Yerel düzlem koordinatları (merkez 0,0; y aşağı); çıkış yönü düz merdivende −y (2B ok ile aynı). */
const STAIR_TYPES = { straight: ['Düz', 'Straight'], l: ['L (sahanlıklı)', 'L-shaped (landing)'], u: ['U (sahanlıklı)', 'U-shaped (landing)'], spiral: ['Döner', 'Spiral'] };
const STAIR_RAILS = { none: ['Yok', 'None'], left: ['Sol', 'Left'], right: ['Sağ', 'Right'], both: ['İki yan', 'Both sides'] };
const stairN = o => clamp(Math.round(+o.stepN || o.h / 17.5) || 2, 2, 60);
// → { n, riser, tread, steps: [{ x, y, w, d, a, z, dx, dy, across, run, flight, landing }] }
function stairSteps(o) {
  const n = stairN(o), r = o.h / n, W = o.w, D = o.d, type = STAIR_TYPES[o.stairType] ? o.stairType : 'straight', steps = [];
  const push = (x, y, w, d, a, i, dx, dy, across, run, flight, landing = false) => steps.push({ x, y, w, d, a, z: r * (i + 1), dx, dy, across, run, flight, landing });
  if (type === 'straight') {
    const td = D / n;
    for (let i = 0; i < n; i++) push(0, D / 2 - (i + 0.5) * td, W, td, 0, i, 0, -1, W, td, 0);
  } else if (type === 'l') {
    const fw = Math.min(W, D) / 2, L1 = D - fw, L2 = W - fw;
    const n1 = clamp(Math.round((n - 1) * L1 / (L1 + L2)), 1, n - 2), n2 = n - 1 - n1, t1 = L1 / n1, t2 = L2 / n2;
    for (let i = 0; i < n1; i++) push(-W / 2 + fw / 2, D / 2 - (i + 0.5) * t1, fw, t1, 0, i, 0, -1, fw, t1, 0);
    push(-W / 2 + fw / 2, -D / 2 + fw / 2, fw, fw, 0, n1, 0, -1, fw, fw, 0, true);
    for (let j = 0; j < n2; j++) push(-W / 2 + fw + (j + 0.5) * t2, -D / 2 + fw / 2, t2, fw, 0, n1 + 1 + j, 1, 0, fw, t2, 1);
  } else if (type === 'u') {
    const fw = W / 2, ld = Math.min(fw, D / 3), Lf = D - ld;
    const n1 = Math.max(1, Math.floor((n - 1) / 2)), n2 = Math.max(1, n - 1 - n1), t1 = Lf / n1, t2 = Lf / n2;
    for (let i = 0; i < n1; i++) push(-fw / 2, D / 2 - (i + 0.5) * t1, fw, t1, 0, i, 0, -1, fw, t1, 0);
    push(0, -D / 2 + ld / 2, W, ld, 0, n1, 0, -1, W, ld, 0, true);
    for (let j = 0; j < n2; j++) push(fw / 2, -D / 2 + ld + (j + 0.5) * t2, fw, t2, 0, n1 + 1 + j, 0, 1, fw, t2, 1);
  } else {
    // döner merdiven: 270° süpürme, orta direk; basamak = radyal kutu (kama yaklaşığı)
    const R = Math.min(W, D) / 2, r0 = R * 0.14, rm = (R + r0) / 2, sweep = Math.PI * 1.5, da = sweep / n;
    for (let i = 0; i < n; i++) {
      const t = Math.PI / 2 - (i + 0.5) * da, cx = Math.cos(t) * rm, cy = Math.sin(t) * rm;
      push(cx, cy, R - r0, 2 * rm * Math.sin(da / 2) * 1.08, t, i, Math.sin(t), -Math.cos(t), R - r0, 2 * (R * 0.66) * Math.sin(da / 2), 0);
    }
  }
  const s0 = steps.find(s => !s.landing) || steps[0];
  return { n, riser: r, tread: s0 ? s0.run : 0, type, steps };
}
// Blondel konfor kuralı: 2·rıht + basamak ≈ 63 cm (60–64 iyi)
const blondel = (riser, tread) => { const v = 2 * riser + tread; return { v, ok: v >= 60 && v <= 64, warn: v >= 57 && v <= 67 }; };
/* ---------- Rampa (issue #58) ----------
   k: 'ramp'; w = genişlik, d = yatay uzunluk, h = kot farkı (yükselme). Yerel düzlemde merdiven gibi −y yönüne çıkar:
   alt uç y = +d/2 (kot 0), üst uç y = −d/2 (kot h). Alanlar isteğe bağlı: rampType ('accessible' | 'vehicle' | 'landscape'),
   railing ('none' | 'left' | 'right' | 'both'; varsayılan engelli rampasında 'both', araç rampasında 'none'). */
const RAMP_TYPES = { accessible: ['Engelli rampası', 'Accessible ramp'], vehicle: ['Araç / otopark rampası', 'Vehicle / garage ramp'], landscape: ['Yaya / peyzaj rampası', 'Pedestrian / landscape ramp'] };
const rampType = o => (RAMP_TYPES[o.rampType] ? o.rampType : 'accessible');
const rampRail = o => (STAIR_RAILS[o.railing] ? o.railing : rampType(o) === 'vehicle' ? 'none' : 'both');
const rampRailSides = o => { const r = rampRail(o); return r === 'none' ? [] : r === 'both' ? [-1, 1] : [r === 'left' ? -1 : 1]; };
// eğim: % = h / d × 100, oran 1:X; sınıf: ≤6 ideal, ≤8 standart erişilebilir, ≤15 araç, üstü çok dik
function rampSlope(o) {
  const d = Math.max(1, +o.d || 1), h = Math.max(0, +o.h || 0), pct = h / d * 100;
  const cls = pct <= 6 ? 'ideal' : pct <= 8 ? 'access' : pct <= 15 ? 'vehicle' : 'steep';
  return { pct, ratio: h > 0 ? d / h : Infinity, deg: Math.atan2(h, d) * 180 / Math.PI, cls };
}
const RAMP_CLS = {
  ideal: ['#16a34a', '✓ İdeal engelli rampası (≤ %6)', '✓ Ideal accessible ramp (≤ 6%)'],
  access: ['#d97706', '✓ Standart erişilebilir rampa (maks. %8)', '✓ Standard accessible ramp (max 8%)'],
  vehicle: ['#2563eb', '🚗 Araç / otopark rampası (%8–15)', '🚗 Vehicle / garage ramp (8–15%)'],
  steep: ['#dc2626', '⚠ Çok dik – yönetmelik dışı (> %15)', '⚠ Too steep – outside regulations (> 15%)'],
};
const fmtPct = v => (Math.round(v * 10) / 10).toFixed(1);
const pctTxt = v => L('%' + fmtPct(v), fmtPct(v) + '%'); // Türkçe %7,0 sırası; İngilizce 7.0%
// Bir basamağın yerel köşeleri (döndürülmüş dikdörtgen)
function stepCorners(s) {
  const c = Math.cos(s.a), sn = Math.sin(s.a), hw = s.w / 2, hd = s.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => ({ x: s.x + x * c - y * sn, y: s.y + x * sn + y * c }));
}
// Korkuluk noktaları: her kolun her iki yanında, basamak üst kotu + 90 cm (yerel düzlem + z)
function stairRails(o, st = stairSteps(o)) {
  const side = o.railing || 'right', sides = side === 'none' ? [] : side === 'both' ? [-1, 1] : [side === 'left' ? -1 : 1], out = [];
  for (const sg of sides) {
    let cur = null;
    for (const s of st.steps) {
      if (s.landing) { cur = null; continue; }
      const px = -s.dy * sg, py = s.dx * sg, off = s.across / 2 - 4; // yüzü çıkış yönüne dönük: sağ = (−dy, dx)
      if (!cur || cur.flight !== s.flight) { cur = { flight: s.flight, pts: [] }; out.push(cur); }
      cur.pts.push({ x: s.x + px * off, y: s.y + py * off, z: s.z });
    }
  }
  return out.filter(r => r.pts.length >= 1);
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
const IFC_ROOF_MAX_FACES = 600; // çatı yüzü sınırı: üstü taban izinden düz çatıya düşer (proje / geri al hafif kalsın)
const IFC_COMPONENTS = new Set(['IFCBUILDINGELEMENTPROXY', 'IFCFURNISHINGELEMENT', 'IFCFURNITURE', 'IFCSYSTEMFURNITUREELEMENT', 'IFCSANITARYTERMINAL', 'IFCELEMENTASSEMBLY']);
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
  const stats = { schema: db.schema, floors: 0, walls: 0, ops: 0, rooms: 0, slabs: 0, voids: 0, columns: 0, railings: 0, components: 0, roofs: 0, stairs: 0, ramps: 0, skipped: 0 };

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
      const out = []; for (const sg of a[1]) for (const k of (sg && sg.v) || []) { const p = P0[k - 1]; if (p && out[out.length - 1] !== p) out.push(p); }
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
    if (/PROFILEDEF$/.test(t) && a[2] && R(a[2])) { const m = M(); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(p => app(m, p)); } // I/L/T/U kesitleri: yalnızca konum
    return [];
  };
  const loopPts = id => { const a = A(id); return T(id) === 'IFCPOLYLOOP' ? (a[0] || []).map(pt) : []; };
  // Katı → dünya noktaları (out) ve, düşey çekilmişse, taban poligonları (foot)
  // fc (isteğe bağlı): yüz çokgenleri (dünya koordinatı) — yalnızca çatılar için toplanır
  const solid = (id, M, out, foot, depth = 0, fc = null) => {
    const t = T(id), a = A(id); if (!t || depth > 10) return;
    if (t === 'IFCEXTRUDEDAREASOLID' || t === 'IFCEXTRUDEDAREASOLIDTAPERED') {
      const m = R(a[1]) ? mul(M, place(R(a[1]))) : M, d = dir(a[2], [0, 0, 1]), h = +a[3] || 0;
      const pr = profile(R(a[0])); const base = [], top = [];
      for (const p of pr) { const b = app(m, p), tp = app(m, [p[0] + d[0] * h, p[1] + d[1] * h, (p[2] || 0) + d[2] * h]); base.push(b); top.push(tp); out.push(b, tp); }
      if (fc && base.length >= 3) { fc.push(base.slice().reverse(), top); for (let i = 0; i < base.length; i++) { const j = (i + 1) % base.length; fc.push([base[i], base[j], top[j], top[i]]); } }
      const wd = norm(rot(m, d)); if (foot && Math.abs(wd[2]) > 0.9 && base.length >= 3) foot.push(wd[2] > 0 ? base : base.map(p => [p[0], p[1], p[2] + rot(m, d)[2] * h]));
    } else if (t === 'IFCBOOLEANCLIPPINGRESULT' || t === 'IFCBOOLEANRESULT') {
      solid(R(a[1]), M, out, foot, depth + 1, fc);
      if (a[0] && a[0].e === 'UNION') solid(R(a[2]), M, out, foot, depth + 1, fc);
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
      if (foot && faces.length) { // tabandaki en geniş yatay yüz = taban poligonu
        let z0 = Infinity; for (const f of faces) for (const p of f) z0 = Math.min(z0, p[2]);
        let best = null, ba = 0; for (const f of faces) if (f.length >= 3 && f.every(p => Math.abs(p[2] - z0) < 0.5 / cm)) { const ar = Math.abs(ifcArea(f)); if (ar > ba) { ba = ar; best = f; } }
        if (best) foot.push(best);
      }
    } else if (t === 'IFCPOLYGONALFACESET' || t === 'IFCTRIANGULATEDFACESET') {
      const cs = (A(R(a[0]))[0] || []).map(c => app(M, [+c[0] || 0, +c[1] || 0, +c[2] || 0])); out.push(...cs);
      if (fc) {
        const idx = t === 'IFCTRIANGULATEDFACESET' ? a[3] || [] : (a[2] || []).map(f => A(R(f))[0] || []);
        for (const ix of idx) { const f = (ix || []).map(i => cs[(+i || 0) - 1]).filter(Boolean); if (f.length >= 3) fc.push(f); }
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

  /* --- İlişkiler --- */
  const parent = new Map(), kids = new Map(), voidHost = new Map(), fillOf = new Map(), matOf = new Map(), typeOf = new Map();
  for (const r of db.byType.get('IFCRELCONTAINEDINSPATIALSTRUCTURE') || []) { const a = A(r); for (const e of a[4] || []) parent.set(R(e), R(a[5])); }
  for (const r of db.byType.get('IFCRELAGGREGATES') || []) { const a = A(r); for (const e of a[5] || []) { parent.set(R(e), R(a[4])); let l = kids.get(R(a[4])); if (!l) kids.set(R(a[4]), l = []); l.push(R(e)); } }
  for (const r of db.byType.get('IFCRELVOIDSELEMENT') || []) { const a = A(r); voidHost.set(R(a[5]), R(a[4])); }
  for (const r of db.byType.get('IFCRELFILLSELEMENT') || []) { const a = A(r); fillOf.set(R(a[5]), R(a[4])); }
  for (const r of db.byType.get('IFCRELASSOCIATESMATERIAL') || []) { const a = A(r); for (const e of a[4] || []) matOf.set(R(e), R(a[5])); }
  for (const r of db.byType.get('IFCRELDEFINESBYTYPE') || []) { const a = A(r); for (const e of a[4] || []) typeOf.set(R(e), R(a[5])); }
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
  const storeys = (db.byType.get('IFCBUILDINGSTOREY') || []).map(id => {
    const a = A(id); return { id, name: String(a[2] || a[7] || ''), z: place(R(a[5])).o[2] * cm, elev: num(a[9]) * cm };
  });
  if (storeys.length > 1 && storeys.every(s => Math.abs(s.z - storeys[0].z) < 1) && storeys.some(s => !isNaN(s.elev) && Math.abs(s.elev - storeys[0].elev) > 1)) storeys.forEach(s => { s.z = isNaN(s.elev) ? 0 : s.elev; });
  storeys.sort((p, q) => p.z - q.z);
  const SBY = new Map(storeys.map(s => [s.id, s]));
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
    return sp.map(s => { const b0 = Math.max(z0, s.z), top = topOf(s), t1 = top < Infinity && z1 > top - 20 ? top - 20 : z1; return { s, z0: b0, h: Math.max(10, Math.min(5000, Math.round(t1 - b0))) }; });
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
  const railsOfStair = new Map(); // merdiven id → korkuluk sayısı (merdivenin kendi korkuluğu olur)
  for (const id of [...ids(new Set([...IFC_WALLS, ...IFC_RAILINGS])), ...railProxy]) {
    const t = T(id); let g = geom(id);
    if ((IFC_RAILINGS.has(t) || railProxy.has(id)) && under(id, STAIRISH)) { const st = under(id, STAIRISH); railsOfStair.set(st, (railsOfStair.get(st) || 0) + 1); continue; }
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
    for (const pc of rail ? [{ s: storeyOf(id, z0), z0, h }] : spanOf(id, z0, z1, h)) {
      const b = fl(pc.s);
      for (let k = 0; k + 1 < axis.length; k++) {
        const a0 = axis[k], b0 = axis[k + 1]; if (Math.hypot(b0.x - a0.x, b0.y - a0.y) < 1) continue;
        const w = { id: uid(), a: { x: r1(a0.x), y: r1(a0.y) }, b: { x: r1(b0.x), y: r1(b0.y) }, t: th, h: pc.h, wt: rail || (curtain ? 'curtain' : 'solid') };
        if (look.col && (rail || (!curtain && !ifcNeutral(look.col)))) w.color = look.col; // boya: gri / beyaz duvar varsayılan kalır
        Object.defineProperty(w, '_z0', { value: pc.z0, enumerable: false, writable: true });
        b.walls.push(w); segs.push(w);
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
  const opTypeOf = (fid, width) => {
    if (IFC_WINDOWS.has(T(fid))) return 'window';
    const ops = []; const a = A(fid); if (a[11] && a[11].e) ops.push(a[11].e);
    const ty = typeOf.get(fid); if (ty) { const ta = A(ty); for (const v of [ta[8], ta[10]]) if (v && v.e) ops.push(v.e); }
    const s = ops.join(' ');
    if (/SLIDING/.test(s)) return 'slide';
    if (/DOUBLE/.test(s)) return 'double';
    return width >= 150 ? 'double' : 'door';
  };
  const filled = new Set(fillOf.values());
  const jobs = [];
  for (const fid of ids(new Set([...IFC_DOORS, ...IFC_WINDOWS]))) jobs.push({ fid, oid: fillOf.get(fid) || 0 });
  for (const oid of ids(IFC_OPENINGS)) if (!filled.has(oid)) jobs.push({ fid: 0, oid });
  for (const { fid, oid } of jobs) {
    const host = oid ? voidHost.get(oid) : 0;
    if (oid && host && IFC_SLABS.has(T(host))) continue; // döşeme boşluğu: aşağıda
    let pts = oid ? geom(oid).body : []; if (!pts.length && fid) pts = geom(fid).body;
    if (!pts.length) { stats.skipped++; continue; }
    let cx = 0, cy = 0; for (const p of pts) { cx += p[0]; cy += p[1]; } cx /= pts.length; cy /= pts.length;
    const [z0, z1] = zr(pts);
    let cand = wallsOf.get(host);
    if (cand && cand.length > 1) { const inZ = cand.filter(w => z0 >= w._z0 - 30 && z0 < w._z0 + w.h); if (inZ.length) cand = inZ; }
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
    const type = fid ? opTypeOf(fid, ow) : sill > 5 ? 'window' : 'arch';
    const d = Math.max(ow / 2, Math.min(L - ow / 2, (mn + mx) / 2));
    const st = storeyOf(fid || oid, z0), bk = [...bucket.values()].find(b => b.walls.includes(w)) || fl(st);
    const op = { id: uid(), wall: w.id, d: r1(d), w: ow, h: oh, sill, type, flip: 0, side: 1, open: 0 };
    if (fid) { // kapı / pencere malzemesi ve renkleri (#41 alanları)
      const lk = looksOf(fid);
      if (type !== 'window' && type !== 'arch') { const m = ifcPick(IFC_DOOR_MAT, lk.names) || (lk.glass && !lk.col ? 'glass' : null); if (m) op.mat = m; if (lk.col && m !== 'glass') op.color = lk.col; }
      else if (lk.col) op.frameCol = lk.col;
    }
    bk.ops.push(op);
    stats.ops++;
  }

  /* --- Odalar, döşemeler, döşeme boşlukları --- */
  for (const id of db.byType.get('IFCSPACE') || []) {
    const g = geom(id), pts = polyOf(g);
    if (!pts || pts.length < 3 || Math.abs(ifcArea(pts.map(p => [p.x, p.y]))) < 1000) { stats.skipped++; continue; }
    const a = A(id), b = fl(storeyOf(id, g.body.length ? zr(g.body)[0] : 0));
    const nm = String(a[7] || a[2] || '').trim() || tr('Oda ', 'Room ') + (b.rooms.length + 1);
    b.rooms.push({ id: uid(), name: nm.slice(0, 80), color: colors[b.rooms.length % colors.length], floor: 'none', pts }); stats.rooms++;
  }
  for (const id of ids(IFC_SLABS)) {
    const a = A(id); if ((a[8] && a[8].e === 'ROOF') || under(id, STAIRISH) || under(id, ROOFISH)) continue; // çatı / merdiven sahanlığı: aşağıda
    let g = geom(id);
    if (!g.body.length) { const body = [], foot = []; for (const c of kids.get(id) || []) { const cg = geom(c); body.push(...cg.body); foot.push(...cg.foot); } g = { body, foot, axis: [] }; }
    const pts = polyOf(g); if (!pts || pts.length < 3) { stats.skipped++; continue; }
    const [z0, z1] = zr(g.body), st = storeyOf(id, z1), b = fl(st);
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
  const footOf = g => { const pts = polyOf(g); if (!pts || pts.length < 3) return null; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); } return { pts, x0, y0, x1, y1, ar: Math.abs(ifcArea(pts.map(p => [p.x, p.y]))) }; };
  const polyItem = (ft, base) => { const cx = r1((ft.x0 + ft.x1) / 2), cy = r1((ft.y0 + ft.y1) / 2); return Object.assign(base, { k: 'poly', w: Math.max(1, r1(ft.x1 - ft.x0)), d: Math.max(1, r1(ft.y1 - ft.y0)), x: cx, y: cy, rot: 0, pts: ft.pts.map(p => ({ x: r1(p.x - cx), y: r1(p.y - cy) })) }); };
  const elevOf = (o, z, st) => { const el = Math.round(z - (st ? st.z : 0)); if (el >= 3) o.elev = Math.min(500, el); return o; }; // 0..500 = FURN_ELEV_MAX (#61)
  for (const id of ids(IFC_COLUMNS)) {
    const g = geom(id), ft = g.body.length ? footOf(g) : null; if (!ft || ft.ar < 4) { stats.skipped++; continue; }
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
  const compIds = ids(IFC_COMPONENTS), compSet = new Set(compIds);
  for (const id of compIds) {
    let up = false; for (let p = parent.get(id), k = 0; p && k < 30; p = parent.get(p), k++) if (compSet.has(p)) { up = true; break; }
    if (up || railProxy.has(id) || under(id, STAIRISH) || under(id, ROOFISH)) continue; // montajın parçası (montaj tek şekil gelir) ya da korkuluk (duvar olarak geldi)
    let g = geom(id);
    if (!g.body.length) { const body = [], foot = []; for (const c of kids.get(id) || []) { const cg = geom(c); body.push(...cg.body); foot.push(...cg.foot); } g = { body, foot, axis: [] }; }
    const ft = g.body.length ? footOf(g) : null; if (!ft || ft.ar < 4 || ft.ar > 4e6) { stats.skipped++; continue; }
    const [z0, z1] = zr(g.body), st = storeyOf(id, z0), t = T(id), furnish = t !== 'IFCBUILDINGELEMENTPROXY' && t !== 'IFCELEMENTASSEMBLY';
    const nm = nameOf(id);
    const base = { id: uid(), type: 'shape', name: (nm || tr('Bileşen', 'Component')).slice(0, 80), icon: '⬡', h: Math.max(1, Math.min(5000, Math.round(z1 - z0))), color: looksDeep(id).col || (furnish ? '#bcaaa4' : '#94a3b8'), label: '' };
    fl(st).furn.push(elevOf(polyItem(ft, base), z0, st)); stats.components++;
  }

  /* --- Çatılar: IfcRoof (+ parçaları) ve ROOF tipli döşemeler → yüzleriyle 'roof' öğesi --- */
  const roofIds = ids(new Set(['IFCROOF'])).filter(id => !under(id, ROOFISH));
  for (const id of ids(IFC_SLABS)) { const a = A(id); if (a[8] && a[8].e === 'ROOF' && !under(id, ROOFISH)) roofIds.push(id); }
  const allKids = id => { const out = []; for (const c of kids.get(id) || []) out.push(c, ...allKids(c)); return out; };
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
  // kolun çıkış yönü: uzun eksen boyunca alçak uçtan yükseğe (merdiven ve rampa)
  const climb = pts => {
    const rc = ifcRect(pts.map(p => [p[0], p[1]])); if (!rc) return null;
    const th = rc.rot * Math.PI / 180; let ux = Math.cos(th), uy = Math.sin(th); if (rc.d > rc.w) [ux, uy] = [-uy, ux];
    let sa = 0, na = 0, sb = 0, nb = 0; for (const p of pts) { const t = (p[0] - rc.cx) * ux + (p[1] - rc.cy) * uy; if (t < 0) { sa += p[2]; na++; } else { sb += p[2]; nb++; } }
    return na && nb && sa / na > sb / nb ? { x: -ux, y: -uy } : { x: ux, y: uy };
  };
  // yerel çerçeve: −y = çıkış yönü u (furn rot: ekranda saat yönü); w / d / merkez bu çerçevedeki uzanımlar
  const frameOf = (body, u) => {
    const ex = { x: -u.y, y: u.x }, ey = { x: -u.x, y: -u.y }; let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of body) { const s1 = p[0] * ex.x + p[1] * ex.y, s2 = p[0] * ey.x + p[1] * ey.y; a0 = Math.min(a0, s1); a1 = Math.max(a1, s1); b0 = Math.min(b0, s2); b1 = Math.max(b1, s2); }
    const sm = (a0 + a1) / 2, tm = (b0 + b1) / 2, rot = Math.atan2(u.x, -u.y) * 180 / Math.PI;
    return { ey, b0, b1, w: a1 - a0, d: b1 - b0, x: r1(sm * ex.x + tm * ey.x), y: r1(sm * ex.y + tm * ey.y), rot: r1(((rot % 360) + 360) % 360) };
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
    const nr = railsOfStair.get(id) || 0;
    const o = { id: uid(), type: 'stairs', name: (nameOf(id) || tr('Merdiven', 'Stairs')).slice(0, 80), icon: '🪜', k: 'stairs', w: Math.max(40, r1(fr.w)), d: Math.max(40, r1(fr.d)), h: H, color: looksDeep(id).col || '#e2e8f0',
      x: fr.x, y: fr.y, rot: fr.rot, label: '',
      stepN: Math.max(2, Math.min(60, risers || Math.round(H / 17.5))), stairType: type, railing: nr >= 2 ? 'both' : nr === 1 ? 'right' : 'none' };
    if (type === 'spiral') { o.w = o.d = Math.max(o.w, o.d); }
    fl(st).furn.push(elevOf(o, z0, st)); stats.stairs++;
  }

  /* --- Rampalar: IfcRamp / IfcRampFlight → parametrik rampa (k: 'ramp'); her kol ayrı rampa (uygulama rampası düz) --- */
  const rampIds = ids(new Set(['IFCRAMP'])).filter(id => !under(id, STAIRISH));
  for (const id of ids(new Set(['IFCRAMPFLIGHT']))) if (!under(id, STAIRISH)) rampIds.push(id);
  for (const id of rampIds) {
    const fls = T(id) === 'IFCRAMP' ? allKids(id).filter(c => T(c) === 'IFCRAMPFLIGHT') : [];
    const runs = fls.length ? fls.map(c => ({ c, body: geom(c).body })) : [{ c: id, body: [id, ...allKids(id)].flatMap(c => geom(c).body) }];
    const nm = nameOf(id), nr = railsOfStair.get(id) || 0;
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
        rampType: ifcWords(label).some(x => /^(car|cars|vehicle|garage|garaj|parking|otopark|araç|arac)$/.test(x)) || w >= 250 ? 'vehicle' : 'accessible', railing: nr ? 'both' : 'none' };
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
  stats.floors = floors.length;
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
/* IFC-IMPORT:END */
// Çok parçalı mobilya 2B: parçaların üstten görünüşü — yüksekte olan üstte çizilir, grup tek katman olarak saydamlaşır
function partsSvg(f) {
  const C = pal(), s = partsScale(f), sk = C.furnStroke, hw = f.w / 2, hd = f.d / 2;
  const ns = 'stroke="' + sk + '" stroke-width="1" vector-effect="non-scaling-stroke"';
  const list = f.parts.map((p, i) => ({ p, i })).sort((a, b) => (a.p.z + a.p.h) - (b.p.z + b.p.h) || a.i - b.i);
  let out = `<rect x="${-hw}" y="${-hd}" width="${f.w}" height="${f.d}" fill="transparent"/><g opacity="${C.furnOp}" transform="scale(${s.sx} ${s.sy})">`;
  for (const { p } of list) out += partShapeSvg(p, p.color || f.color || '#cbd5e1', ns);
  return out + '</g>';
}
// bir parçanın üstten şekli (öğe yerel cm); plan çizimi ve parça düzenleyici önizlemesi ortak kullanır
function partShapeSvg(p, col, attrs) {
  const tr = `transform="translate(${p.x} ${p.y})${p.rot ? ' rotate(' + p.rot + ')' : ''}"`;
  if (p.type === 'extrude' && p.pts) return `<polygon points="${p.pts.map(q => q.x + ',' + q.y).join(' ')}" fill="${col}" ${attrs} ${tr}/>`;
  if (p.type === 'sphere' || (p.type === 'cyl' && !p.axis)) return `<ellipse rx="${p.w / 2}" ry="${p.d / 2}" fill="${col}" ${attrs} ${tr}/>`;
  const r = p.type === 'cyl' ? (p.axis === 'x' ? p.d / 2 : p.w / 2) : Math.min(2, p.w / 4, p.d / 4);
  return `<rect x="${-p.w / 2}" y="${-p.d / 2}" width="${p.w}" height="${p.d}" rx="${r}" fill="${col}" ${attrs} ${tr}/>`;
}
// Çok parçalı mobilya 3B: paylaşılan birim geometriler ölçeklenir (extrude hariç); ölçek grubu yeniden boyutlandırmayı izler
function parts3D(g, o, C) {
  const s = partsScale(o), root = new THREE.Group(); root.scale.set(s.sx, s.sz, s.sy); g.add(root);
  for (const p of o.parts) {
    const m = C.pmat(p.color || o.color || '#cbd5e1', p.mat);
    let mesh;
    if (p.type === 'extrude' && p.pts) {
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(p.pts.map(q => new THREE.Vector2(q.x, -q.y))), { depth: p.h, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2); mesh = new THREE.Mesh(geo, m); mesh.position.set(p.x, p.z, p.y);
    } else {
      mesh = new THREE.Mesh(p.type === 'sphere' ? C.unit.sph : p.type === 'cyl' ? C.unit.cyl : C.unit.box, m);
      mesh.position.set(p.x, p.z + p.h / 2, p.y);
      if (p.type === 'box') mesh.scale.set(p.w, p.h, p.d);
      else if (p.type === 'sphere') mesh.scale.set(p.w / 2, p.h / 2, p.d / 2);
      else if (p.axis === 'x') { mesh.scale.set(p.h / 2, p.w, p.d / 2); mesh.rotation.z = Math.PI / 2; } // yatık silindir: boyu x boyunca
      else if (p.axis === 'y') { mesh.scale.set(p.w / 2, p.d, p.h / 2); mesh.rotation.x = Math.PI / 2; }
      else mesh.scale.set(p.w / 2, p.h, p.d / 2);
    }
    mesh.rotation.order = 'YXZ'; mesh.rotation.y = -(p.rot || 0) * Math.PI / 180;
    mesh.receiveShadow = true; mesh.castShadow = p.mat !== 'glass' && p.w * p.d * p.h > 1500;
    root.add(mesh);
  }
}
// katalogdaki parçalı öğeler: kimlik → parça üreteci (mkFurn yerleştirirken kopyalar)
const CAT_PARTS = { billiard: billiardParts };
function furnSvg(f, live) {
  const C = pal(), fs = Math.max(12, Math.min(f.w, f.d) * 0.42);
  const fe = f.k === 'roof' ? 0 : furnElev(f); // yerden yükseklik (#61): asılı eşya kesikli çizilir + ▲ etiketi
  let s = `<g transform="translate(${f.x} ${f.y}) rotate(${f.rot})" ${live ? `data-id="${f.id}" style="cursor:move"` : ''}>${fe ? `<g stroke-dasharray="6 4">${furnBody(f)}</g>` : furnBody(f)}`;
  if (fe) s += `<text transform="translate(0 ${f.d / 2 + 9}) rotate(${-f.rot})" text-anchor="middle" dominant-baseline="central" font-size="11" fill="${C.sub}" stroke="${C.halo}" stroke-width="3" paint-order="stroke" pointer-events="none" font-family="Segoe UI,sans-serif">▲ +${Math.round(fe)}</text>`;
  if (f.icon && f.k !== 'roof' && !(Array.isArray(f.parts) && f.parts.length)) s += `<text transform="rotate(${-f.rot})" text-anchor="middle" dominant-baseline="central" font-size="${fs}" pointer-events="none">${f.icon}</text>`;
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
    const btxt = ui.grpEdit && ui.grpEdit.id === rec.id ? `✏️ ${cur.label} (${curIdx + 1}/${rec.vars.length}) • ${L('Düzenleniyor', 'Editing')}`
      : rec.vars.length >= 2
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
  f = visFloor(f, !live && ui.exporting); // gizli / baskıda çıkmayan katmanlar (#32)
  return {
    // döşemeler odaların altında, boşluklar oda dolgusunun üstünde (delik oda zeminini de keser)
    rooms: (f.slabs || []).map(s => slabSvg(s, live)).join('') + f.rooms.map(r => roomSvg(r, live)[0]).join('') + (f.voids || []).map(v => voidSvg(v, live)).join(''),
    roomLabels: f.rooms.map(r => roomSvg(r, live)[1]).join('') + groupVarsSvg(f, live),
    walls: f.walls.map(w => wallSvg(w, live, f)).join('') + jointsSvg(f) + (ui.dims ? f.walls.map(wallDimSvg).join('') : ''),
    ops: f.ops.map(o => opSvg(o, live)).join(''),
    furn: f.furn.map(x => furnSvg(x, live)).join(''),
    dims: f.dims.map(d => dimSvg(d, live)).join('') + (f.sections || []).map(x => sectionSvg(x, live)).join(''),
    texts: f.texts.map(t => textSvg(t, live)).join(''),
    sketches: (f.sketches || []).map(s => sketchSvg(s, live)).join(''),
  };
}
const GRESIZE = { wall: 1, dim: 1, room: 1, slab: 1, void: 1, furn: 1, text: 1, sketch: 1, bg: 1 };
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
    if (POLY_KINDS.has(kind)) s += `<polygon points="${o.pts.map(p => p.x + ',' + p.y).join(' ')}" fill="#f59e0b" fill-opacity=".12" stroke="#f59e0b" stroke-width="${2 / z}" stroke-dasharray="${6 / z} ${4 / z}" pointer-events="none"/>`;
    if (kind === 'op') { const p = opPos(o); if (p) s += `<g transform="translate(${p.x} ${p.y}) rotate(${p.ang})" pointer-events="none"><rect x="${-o.w / 2 - 3}" y="${-p.t / 2 - 5}" width="${o.w + 6}" height="${p.t + 10}" fill="#f59e0b" fill-opacity=".2" stroke="#f59e0b" stroke-width="${1.6 / z}"/></g>`; }
    if (kind === 'dim' || kind === 'section') s += `<circle cx="${o.a.x}" cy="${o.a.y}" r="${hs}" fill="#f59e0b"/><circle cx="${o.b.x}" cy="${o.b.y}" r="${hs}" fill="#f59e0b"/>`;
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
    if (POLY_KINDS.has(kind)) {
      o.pts.forEach((p, i) => {
        const q = o.pts[(i + 1) % o.pts.length], mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        const cur = Math.abs(q.x - p.x) > Math.abs(q.y - p.y) ? 'ns-resize' : 'ew-resize';
        s += hnd(mx, my, 're' + i, cur, 'circle');
      });
      o.pts.forEach((p, i) => s += hnd(p.x, p.y, 'v' + i, 'move'));
    }
    if (kind === 'section') s += hnd(o.a.x, o.a.y, 'da', 'move') + hnd(o.b.x, o.b.y, 'db', 'move');
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
  $('#gBg').innerHTML = (layersVis.bg ? bgSvg() : '') + underlaySvg();
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
// Kat izdüşümü (issue #26): seçilen referans kat (varsayılan bir alt kat); kapalıysa / tek katta null
function underlayFloor() {
  if (!layersVis.underlay || !P || P.floors.length < 2) return null;
  const f = underlay.floor !== 'prev' && P.floors.find(x => x.id === underlay.floor);
  if (f && f !== F()) return visFloor(f); // kendisi seçiliyse (başka katta seçilmiş) bir alt kata dön
  return fi > 0 ? visFloor(P.floors[fi - 1]) : null;
}
const isStructFurn = o => o.k === 'stairs' || o.k === 'ramp' || o.type === 'column' || o.type === 'colSq';
// İzdüşüm: duvarlar (köşe dolgularıyla), döşeme/balkon sınırları, boşluklar, kolon ve merdivenler — silik, tıklanmaz
function underlaySvg() {
  const uf = underlayFloor(); if (!uf) return '';
  const C = pal(), sw = Math.max(1.5, 1.5 / view.z);
  let s = (uf.slabs || []).filter(o => o.pts && o.pts.length > 2).map(o => `<polygon points="${o.pts.map(p => p.x + ',' + p.y).join(' ')}" fill="none" stroke="${C.text}" stroke-width="${sw * 1.5}" stroke-dasharray="${8 / view.z} ${4 / view.z}"/>`).join('');
  s += jointsSvg(uf) + uf.walls.map(w => wallSvg(w, false, uf)).join('');
  s += (uf.voids || []).map(v => voidSvg(v, false)).join('');
  s += uf.furn.filter(isStructFurn).map(o => furnSvg(o, false)).join('');
  return `<g opacity="${underlay.op}" pointer-events="none" data-underlay="${uf.id}">${s}</g>`;
}
// İzdüşüm yakalama noktaları: duvar uçları, döşeme/boşluk köşeleri, kolon/merdiven merkez ve köşeleri
function underlayPts() {
  const uf = underlayFloor(), out = []; if (!uf) return out;
  for (const w of uf.walls) out.push(w.a, w.b);
  for (const arr of ['slabs', 'voids']) for (const o of uf[arr] || []) out.push(...o.pts);
  for (const o of uf.furn) if (isStructFurn(o)) out.push({ x: o.x, y: o.y }, ...furnCorners(o));
  return out;
}
// Orta nokta yakalama (issue #25): duvar ve ölçü çizgisi orta noktaları; sürüklenen (ignore) nesneninki atlanır
function snapMids(f, ignore) {
  const out = [];
  for (const arr of ['walls', 'dims']) for (const o of f[arr] || []) {
    if (ignore && (ignore.has(o.id) || ignore.has(o.a) || ignore.has(o.b))) continue;
    out.push({ x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 });
  }
  return out;
}
// Merkez yakalama (issue #25): oda/döşeme/boşluk ağırlık merkezi + grupların ortak kutu merkezi
function snapCenters(f, ignore) {
  const out = [], bbs = new Map();
  for (const arr of ['rooms', 'slabs', 'voids']) for (const o of f[arr] || []) {
    if (!o.pts || o.pts.length < 3 || (ignore && o.pts.some(q => ignore.has(q)))) continue;
    const c = polyCentroid(o.pts); out.push({ x: c.x, y: c.y });
  }
  for (const k in KINDS) for (const o of f[k] || []) {
    if (!o.grp) continue;
    if (ignore && ignore.has(o.id)) { bbs.set(o.grp, null); continue; } // sürüklenen üyenin grubu kayar — atla
    const b = bboxOf(KINDS[k], o), g = bbs.get(o.grp);
    if (!b || g === null) continue;
    bbs.set(o.grp, g ? { x0: Math.min(g.x0, b.x0), y0: Math.min(g.y0, b.y0), x1: Math.max(g.x1, b.x1), y1: Math.max(g.y1, b.y1) } : { ...b });
  }
  for (const b of bbs.values()) if (b) out.push({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
  return out;
}
// p'ye r içindeki en yakın merkez (mobilya yerleştirme / taşıma için)
function nearCenter(p, r) {
  let best = null, bd = r;
  for (const q of snapCenters(F())) { const d = dist(p, q); if (d < bd) { bd = d; best = q; } }
  return best;
}
// Nokta takibi (issue #16) için referans noktaları: duvar uçları, oda köşeleri, çizilmekte olan oda köşeleri
function trackRefs(ignore, from) {
  const f = F(), out = [], skip = q => (ignore && ignore.has(q)) || (from && dist(q, from) < 0.5);
  for (const w of f.walls) { if (ignore && ignore.has(w.id)) continue; for (const q of [w.a, w.b]) if (!skip(q)) out.push(q); }
  for (const arr of ['rooms', 'slabs', 'voids']) for (const rm of f[arr] || []) for (const q of rm.pts) if (!skip(q)) out.push(q);
  if (ui.polyPts) for (const q of ui.polyPts) if (!skip(q)) out.push(q);
  for (const q of underlayPts()) if (!skip(q)) out.push(q);
  return out;
}
function snapPt(p, from, e, ignore) {
  if (!ui.snap || (e && e.shiftKey)) return { x: p.x, y: p.y, hit: null };
  const r = 14 / view.z, tol = 10 / view.z, f = F(); let best = null, bd = r;
  // ignore: duvar kimlikleri (string) ve/veya atlanacak nokta nesneleri; duvar kimliği varsa oda köşeleri uç yakalamaya girmez (eski davranış)
  const skipRooms = ignore && [...ignore].some(v => typeof v === 'string');
  for (const w of f.walls) {
    if (ignore && ignore.has(w.id)) continue;
    for (const q of [w.a, w.b]) { const d = dist(p, q); if (d < bd) { bd = d; best = q; } }
  }
  if (!skipRooms) for (const arr of ['rooms', 'slabs', 'voids']) for (const rm of f[arr] || []) for (const q of rm.pts) { if (ignore && ignore.has(q)) continue; const d = dist(p, q); if (d < bd) { bd = d; best = q; } }
  if (best) return { x: best.x, y: best.y, hit: 'end' };
  // alt kat izdüşümü (#26), orta nokta ve merkez (#25): uç noktadan sonra, aynı yarıçapta en yakını
  let hit = null;
  for (const [kind, list] of [['under', underlayPts()], ['mid', snapMids(f, ignore)], ['center', snapCenters(f, ignore)]])
    for (const q of list) { const d = dist(p, q); if (d < bd) { bd = d; best = q; hit = kind; } }
  if (best) return { x: best.x, y: best.y, hit };
  const g = P.grid, gt = P.gridType || 'square', refs = trackRefs(ignore, from);
  if (from && ui.angle) {
    const dx = p.x - from.x, dy = p.y - from.y, l = Math.hypot(dx, dy);
    if (l < 1) return { x: from.x, y: from.y, hit: null };
    const step = gt === 'triangle' ? Math.PI / 6 : Math.PI / 12;
    const a = Math.round(Math.atan2(dy, dx) / step) * step, ca = Math.cos(a), sa = Math.sin(a);
    let L = gt === 'none' ? l : Math.max(g, rnd(l, g)), guides = [];
    // açı ışını üzerinde bir referansın dikey/yatay hizasına denk gelen uzunluk varsa ona kilitlen
    let bt = null, bdt = tol;
    for (const o of refs) {
      if (Math.abs(ca) > 0.01) { const t = (o.x - from.x) / ca; if (t > 1 && Math.abs(t - l) < bdt) { bdt = Math.abs(t - l); bt = { t, o, axis: 'x' }; } }
      if (Math.abs(sa) > 0.01) { const t = (o.y - from.y) / sa; if (t > 1 && Math.abs(t - l) < bdt) { bdt = Math.abs(t - l); bt = { t, o, axis: 'y' }; } }
    }
    if (bt) { L = bt.t; guides = [{ from: bt.o, axis: bt.axis }]; }
    let q = { x: from.x + ca * L, y: from.y + sa * L };
    if (Math.abs(ca) < 1e-6) q.x = from.x; if (Math.abs(sa) < 1e-6) q.y = from.y;
    if (bt) q[bt.axis] = bt.o[bt.axis];
    else { q.x = Math.round(q.x * 10) / 10; q.y = Math.round(q.y * 10) / 10; }
    return { ...q, hit: null, guides };
  }
  // serbest / ızgara: x ve y ayrı ayrı en yakın referans hizasına kilitlenir (ikisi birden = iki köşenin kesişimi)
  const q = snapToGrid(p), guides = [];
  let bx = null, by = null, dxb = tol, dyb = tol;
  for (const o of refs) {
    const ddx = Math.abs(p.x - o.x), ddy = Math.abs(p.y - o.y);
    if (ddx < dxb || (bx && ddx === dxb && Math.abs(p.y - o.y) < Math.abs(p.y - bx.y))) { dxb = ddx; bx = o; }
    if (ddy < dyb || (by && ddy === dyb && Math.abs(p.x - o.x) < Math.abs(p.x - by.x))) { dyb = ddy; by = o; }
  }
  if (bx) { q.x = bx.x; guides.push({ from: bx, axis: 'x' }); }
  if (by) { q.y = by.y; guides.push({ from: by, axis: 'y' }); }
  return { ...q, hit: null, guides };
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
// duvar tipini değiştir (#73): korkuluk / çite geçerken tam kat yüksekliğindeki duvar korkuluk yüksekliğine iner; geri dönünce kat yüksekliği
function setWallType(w, v) {
  v = WALL_TYPES.includes(v) ? v : 'solid';
  const old = LOW_WALL[w.wt], was = !!old; w.wt = v;
  if (isLowWall(w)) { // korkuluk ↔ çit: hâlâ eski varsayılanlardaysa yenisine geçer
    const spec = LOW_WALL[v];
    if (was ? w.h === old.h : w.h > 150) w.h = spec.h;
    if (was ? w.t === old.t : w.t > 15) w.t = spec.t;
  }
  else if (was) { if (w.h < 150) w.h = curFloorH(); if (w.t < 10) w.t = v === 'curtain' ? 10 : P.wallT; }
  if (v !== 'curtain') { delete w.mul; delete w.mulN; }
}
function mkWall(a, b) { return { id: uid(), a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, t: P.wallT, h: curFloorH(), wt: 'solid' }; }
function opType(id) { return id.startsWith('window') || id === 'wsmall' ? 'window' : id; }
function mkOp(def, wall, d) {
  const L = wLen(wall); const w = def.w;
  const o = { id: uid(), wall: wall.id, d: L >= w ? clamp(d, w / 2, L - w / 2) : L / 2, w, h: def.h, sill: def.sill, type: opType(def.id), flip: 0, side: 1, open: 0 };
  if (def.extra) Object.assign(o, JSON.parse(JSON.stringify(def.extra))); // ön ayar alanları (#42)
  return o;
}
function mkFurn(def, x, y, rot = 0) { const o = { id: uid(), type: def.id, name: itemName(def), icon: def.icon, k: def.k, w: def.w, d: def.d, h: def.h, color: def.color, x, y, rot, label: '' }; if (def.k === 'poly' && def.pts) o.pts = JSON.parse(JSON.stringify(def.pts)); if (CAT_PARTS[def.id]) { o.parts = CAT_PARTS[def.id](def.w, def.d, def.h); o.pbase = { w: def.w, d: def.d, h: def.h }; o.partsV = PARTS_V; } if (def.extra) for (const k in def.extra) if (k !== 'pts') o[k] = JSON.parse(JSON.stringify(def.extra[k])); if (o.elev == null && CAT_ELEV[def.id]) o.elev = CAT_ELEV[def.id]; cleanParts(o); return o; }
function mkRoom(pts, name) {
  const n = F().rooms.length;
  return { id: uid(), name: name || L('Oda ', 'Room ') + (n + 1), color: ROOMCOL[n % ROOMCOL.length], floor: 'none', pts };
}
// Serbest döşeme (issue #22): t = kalınlık (cm), off = kot farkı (cm, eksi = daha alçak)
function mkSlab(pts, name) { return { id: uid(), name: name || L('Döşeme ', 'Slab ') + ((F().slabs || []).length + 1), floor: 'concrete', color: null, t: 20, off: 0, pts }; }
function mkVoid(pts, type = 'stair', name = '') { return { id: uid(), name, type, pts }; }
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
  for (const k of ['furn', 'rooms', 'slabs', 'voids', 'sections', 'dims', 'texts', 'sketches']) f[k] = (f[k] || []).filter(o => !s.has(o.id));
  dropPoseOrphans(ids, true); // silinen nesnelerin (grup + oda) düzen kayıtlarındaki eski pozları temizlensin
  pruneGroups();
  sel = sel.filter(id => !s.has(id));
}
function deleteSel() { if (!sel.length) return; deleteIds(sel.filter(pickable)); commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); }

/* ---------- Duvar uzunluğunu sayıyla değiştirme (issue #36) ----------
   Serbest uç (menteşeli duvarda pim sabit kalır) duvarın kendi açısı boyunca taşınır; bitişik duvar uçları
   (ui.connWalls) birlikte gelir, böylece köşeler açılmaz; kapı/pencereler yerinde kalır ve yeni boya sığdırılır. */
function applyWallLength(w, len, ek = wallFree(w), conn = ui.connWalls, f = F()) {
  const L0 = wLen(w); len = +len;
  if (!(len >= 1) || L0 < 0.01) return false;
  const fixed = ek === 'a' ? w.b : w.a, ux = (w[ek].x - fixed.x) / L0, uy = (w[ek].y - fixed.y) / L0;
  const old = { x: w[ek].x, y: w[ek].y }, np = { x: Math.round((fixed.x + ux * len) * 100) / 100, y: Math.round((fixed.y + uy * len) * 100) / 100 };
  const moved = [{ w, k: ek, L0 }];
  if (conn) for (const o of f.walls) if (o !== w) for (const k of ['a', 'b']) if (dist(o[k], old) < 1) moved.push({ w: o, k, L0: wLen(o) });
  for (const m of moved) m.w[m.k] = { x: np.x, y: np.y };
  // açıklıklar: d a ucundan ölçülür — a ucu taşındıysa aynı yerde kalmaları için kaydır, sonra duvara sığdır
  for (const m of moved) {
    const L1 = wLen(m.w);
    for (const op of f.ops) if (op.wall === m.w.id) {
      if (m.k === 'a') op.d += L1 - m.L0;
      op.d = clamp(op.d, Math.min(op.w / 2, L1 / 2), Math.max(L1 - op.w / 2, L1 / 2));
    }
  }
  return true;
}
// Tuvaldeki duvar ölçü yazısına tıklayınca yerinde sayı kutusu
function openWallDimInput(id, x, y) {
  closeWallDimInput();
  const fd = find(id); if (!fd || fd.kind !== 'wall' || !pickable(id)) return;
  const w = fd.o; sel = [id]; refresh();
  const inp = document.createElement('input');
  inp.id = 'wdimInput'; inp.type = 'number'; inp.min = '1'; inp.step = '1'; inp.className = 'wdim-input';
  inp.value = Math.round(wLen(w) * 10) / 10;
  inp.title = L('Yeni uzunluk (cm) — Enter: uygula, Esc: iptal', 'New length (cm) — Enter: apply, Esc: cancel');
  inp.style.left = Math.round(x - 48) + 'px'; inp.style.top = Math.round(y - 16) + 'px';
  document.body.appendChild(inp); inp.focus(); inp.select();
  inp.addEventListener('keydown', ev => {
    ev.stopPropagation();
    if (ev.key === 'Enter') {
      const v = parseFloat(String(inp.value).replace(',', '.')); closeWallDimInput();
      if (applyWallLength(w, v)) { commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); }
    } else if (ev.key === 'Escape') closeWallDimInput();
  });
  inp.addEventListener('blur', () => setTimeout(closeWallDimInput, 0));
}
function closeWallDimInput() { const el = document.getElementById('wdimInput'); if (el) el.remove(); }
/* ---------- Duvar kırpma / bölme (issue #15) ---------- */
// İki doğru parçasının kesişimi: t (p1→p2), u (p3→p4) parametreleriyle; paralelse null
function segIntersect(p1, p2, p3, p4, eps = 1e-6) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y), t, u };
}
// Duvarın diğer duvar eksenleriyle kesiştiği noktalar: a ucundan uzaklık (cm), uçlar hariç, sıralı
function wallCuts(w, f = F()) {
  const L = wLen(w), out = [];
  for (const o of f.walls) {
    if (o === w) continue;
    const x = segIntersect(w.a, w.b, o.a, o.b); if (!x) continue;
    const s = x.t * L; if (s > 1 && s < L - 1 && !out.some(v => Math.abs(v - s) < 1)) out.push(s);
  }
  return out.sort((p, q) => p - q);
}
const wallPt = (w, s) => { const L = wLen(w) || 1; return { x: w.a.x + (w.b.x - w.a.x) * s / L, y: w.a.y + (w.b.y - w.a.y) * s / L }; };
// Duvarı a ucundan s cm'de ikiye böler; s'nin ötesindeki açıklıklar yeni parçaya geçer
function splitWallAt(w, s, f = F()) {
  const m = wallPt(w, s), nw = mkWall(m, w.b);
  for (const k of ['t', 'h', 'wt', 'color', 'mul', 'mulN']) if (w[k] != null) nw[k] = w[k];
  w.b = m; f.walls.push(nw);
  f.ops.forEach(op => { if (op.wall === w.id && op.d > s) { op.wall = nw.id; op.d -= s; } });
  return nw;
}
// Tıklanan noktanın iki yanındaki en yakın kesişimler arasındaki parça (kırpılacak kısım)
function trimPlan(w, c, f = F()) {
  const L = wLen(w), sc = segProj(c, w.a, w.b).t * L, cuts = wallCuts(w, f);
  if (!cuts.length) return null;
  let lo = null, hi = null;
  for (const s of cuts) { if (s < sc) lo = s; else if (hi == null) hi = s; }
  return { lo: lo ?? 0, hi: hi ?? L, L };
}
function trimWall(w, c, f = F()) {
  const pl = trimPlan(w, c, f); if (!pl) return false;
  const { lo, hi, L } = pl, drop = [];
  const onW = () => f.ops.filter(op => op.wall === w.id);
  if (lo <= 0) {            // a tarafı kırpılır
    onW().forEach(op => { if (op.d < hi) drop.push(op.id); else op.d -= hi; });
    w.a = wallPt(w, hi);
  } else if (hi >= L) {     // b tarafı kırpılır
    onW().forEach(op => { if (op.d > lo) drop.push(op.id); });
    w.b = wallPt(w, lo);
  } else {                  // iki kesişim arası: orta parça çıkar, duvar ikiye ayrılır
    splitWallAt(w, hi, f);
    onW().forEach(op => { if (op.d > lo) drop.push(op.id); });
    w.b = wallPt(w, lo);
  }
  if (drop.length) deleteIds(drop);
  return true;
}
// İki duvarı eksenlerinin kesişiminde L köşe olarak birleştirir: her duvarın kesişime yakın ucu oraya taşınır (kırpar ya da uzatır)
function joinCorner(w1, w2, f = F()) {
  const d = (w1.b.x - w1.a.x) * (w2.b.y - w2.a.y) - (w1.b.y - w1.a.y) * (w2.b.x - w2.a.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((w2.a.x - w1.a.x) * (w2.b.y - w2.a.y) - (w2.a.y - w1.a.y) * (w2.b.x - w2.a.x)) / d;
  const X = { x: w1.a.x + t * (w1.b.x - w1.a.x), y: w1.a.y + t * (w1.b.y - w1.a.y) };
  for (const w of [w1, w2]) {
    const L = wLen(w) || 1, ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L, sX = (X.x - w.a.x) * ux + (X.y - w.a.y) * uy;
    const ops = f.ops.filter(op => op.wall === w.id), drop = [];
    if (dist(w.a, X) <= dist(w.b, X)) { w.a = { x: X.x, y: X.y }; ops.forEach(op => { op.d -= sX; }); }
    else w.b = { x: X.x, y: X.y };
    const nL = wLen(w); ops.forEach(op => { if (op.d - op.w / 2 < -1 || op.d + op.w / 2 > nL + 1) drop.push(op.id); });
    if (drop.length) deleteIds(drop);
  }
  return true;
}

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
  if (!f.walls.length) {
    // serbest döşeme / boşluk kendi başına plaka sayılmaz: yalnızca onlardan oluşan katta otomatik plaka yok
    const b = contentBounds(Object.assign({}, f, { slabs: [], voids: [] }));
    return b ? [rectPoly(b)] : [];
  }
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
// köşe tıklayarak poligon çizen araçlar: oda, serbest döşeme (#22), döşeme boşluğu (#23)
const POLY_TOOLS = new Set(['poly', 'slab', 'void']);
const TOOLS = [
  ['select', '↖', 'Seç', 'V', 'Select'], ['pan', '✋', 'Kaydır', 'H', 'Pan'], null,
  ['wall', '🧱', 'Duvar', 'W', 'Wall'], ['rect', '⬜', 'Oda duvar', 'R', 'Rect Room'], ['room', '🏠', 'Oda algıla', 'O', 'Auto Room'], ['poly', '⬠', 'Oda çiz', 'P', 'Draw Room'], ['slab', '🔲', 'Döşeme', 'K', 'Slab'], ['void', '🕳️', 'Boşluk', 'Y', 'Void'], ['shape', '⬡', 'Şekil', 'S', 'Shapes'], null,
  ['door', '🚪', 'Kapı', 'D', 'Door'], ['window', '🪟', 'Pencere', 'N', 'Window'], ['furn', '🛋️', 'Mobilya', 'F', 'Furniture'], null,
  ['pen', '✏️', 'Kalem', 'B', 'Pen'], ['dim', '📏', 'Ölçü', 'M', 'Dimension'], ['text', '🔤', 'Metin', 'T', 'Text'], ['eraser', '🧽', 'Sil', 'E', 'Eraser'], ['trim', '✂️', 'Kırp', 'X', 'Trim'], ['mirror', '🪞', 'Aynala', 'I', 'Mirror'], ['section', '🔪', 'Kesit', 'L', 'Section'], ['calib', '⚖️', 'Ölçek', 'C', 'Calibrate'],
];
const HINTS = {
  select: 'Seç: duvar seçiliyken rakam yaz + Enter: yeni uzunluk • ölçü yazısına tıkla: uzunluğu düzenle • tıkla / kutu çiz • Shift: çoklu seçim • Ctrl+tık: alttaki nesne • sağ tık: buradaki nesneler & katman • sürükle: taşı • Del: sil',
  pan: 'Kaydır: sürükle • Tekerlek: yakınlaştır',
  wall: 'Duvar: tıkla ile başla, devam ettikçe zincir • rakam yaz + Enter: tam uzunluk • çift tık / Esc: bitir • Shift: yakalamayı kapat',
  rect: 'Dikdörtgen oda: köşeden köşeye sürükle (4 duvar + oda oluşturur)',
  room: 'Kapalı bir alanın içine tıkla: oda otomatik algılanır (alan ve ölçüler hesaplanır)',
  poly: 'Oda çiz: köşelere tıkla • ilk noktaya tıkla / Enter: tamamla • Esc: iptal',
  slab: 'Döşeme: balkon / teras köşelerine tıkla (duvar gerekmez) • ilk noktaya tıkla / Enter: tamamla • sürükle: dikdörtgen • Esc: iptal',
  void: 'Boşluk: merdiven boşluğu / şaft köşelerine tıkla • ilk noktaya tıkla / Enter: tamamla • sürükle: dikdörtgen • 3B\'de döşemeyi deler',
  shape: 'Şekil: tür ve modu üstteki çubuktan seç • Üçgen/Dörtgen/Çokgen(N)/Elips: köşeden köşeye sürükle • Serbest: bas-sürükle-bırak • Nesne modu adlandırılabilir özel nesne, Duvar modu duvar silüesi çizer',
  place: 'Yerleştir: tıkla • R: döndür • Esc / sağ tık: bitir',
  pen: 'Kalem: serbest çiz (basılı tutup sürükle) • bırak → çizim tamamlanır • Shift: yakalamayı kapat',
  dim: 'Ölçü: iki noktaya tıkla',
  text: 'Metin eklemek için tıkla',
  eraser: 'Silmek istediğin nesneye tıkla',
  trim: 'Kırp: kesişen duvarın taşan ucuna tıkla → kesişime kadar kırpılır (iki kesişim arasındaki parça da çıkarılabilir) • kırmızı = silinecek kısım',
  plotwin: 'Çıktı penceresi: yazdırılacak alanı köşeden köşeye sürükle • Esc: iptal',
  section: 'Kesit: kesit çizgisinin iki ucuna tıkla • ok bakış yönünü gösterir • panelden yönü çevir, 3B kesit aç veya 2B kesit çizimini göster',
  mirror: 'Aynala: önce nesneleri seç, sonra ayna ekseninin iki noktasına tıkla • orijinali silmek isteyip istemediğin sorulur • Shift+H / Shift+V: yatay / dikey aynala',
  calib: 'Ölçek: arka plan görselinde bilinen iki noktaya tıkla, gerçek mesafeyi gir',
};
const HINTS_EN = {
  select: 'Select: with a wall selected type a number + Enter: new length • click a length label: edit it • click / drag box • Shift: multi-select • Ctrl+click: object underneath • right-click: objects here & layers • drag: move • Del: delete',
  pan: 'Pan: drag • Wheel: zoom in/out',
  wall: 'Wall: click to start & chain • type number + Enter: exact length (cm) • double-click / Esc: finish • Shift: disable snap',
  rect: 'Rect Room: drag corner to corner (creates 4 walls + room)',
  room: 'Click inside an enclosed area to auto-detect room & area',
  poly: 'Draw Room: click corners • click first point / Enter: finish • Esc: cancel',
  slab: 'Slab: click corners of a balcony / terrace (no walls needed) • click first point / Enter: finish • drag: rectangle • Esc: cancel',
  void: 'Void: click corners of a stairwell / shaft • click first point / Enter: finish • drag: rectangle • cuts the slab in 3D',
  shape: 'Shapes: pick type & mode in the top bar • Triangle/Quad/N-gon/Circle: drag corner to corner • Free: hold-drag-release • Object mode makes a nameable custom item, Walls mode draws wall outlines',
  place: 'Place: click • R: rotate / flip hinge • S: flip swing • Esc / right-click: finish',
  pen: 'Pen: freehand draw (hold & drag) • release to finish the stroke • Shift: disable snap',
  dim: 'Dimension: click two points',
  text: 'Click to place a text label',
  eraser: 'Click any object to delete it',
  trim: 'Trim: click the overhanging part of a crossing wall → it is cut back to the intersection (a piece between two crossings can be removed too) • red = part to remove',
  plotwin: 'Plot window: drag the area to print corner to corner • Esc: cancel',
  section: 'Section: click both ends of the cut line • the arrows show the viewing direction • the panel flips it, cuts the 3D view or opens the 2D section drawing',
  mirror: 'Mirror: select objects first, then click two points of the mirror axis • you are asked whether to erase the originals • Shift+H / Shift+V: flip horizontal / vertical',
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
    ? L('3B Gezinme: WASD / Oklar: Hareket • Q/E: Yükseklik • Shift: Hızlı • Fare: Döndür / Yakınlaştır • Ctrl+Z: Geri al • Del: Sil • Esc: 2B', '3D View: WASD / Arrows: Move • Q/E: Up/Down • Shift: Fast • Mouse: Orbit / Zoom • Ctrl+Z: Undo • Del: Delete • Esc: 2D')
    : ((isEN() ? HINTS_EN : HINTS)[tool] || '');
  $('#hud').style.display = '';
  cv.style.cursor = tool === 'pan' ? 'grab' : tool === 'select' ? 'default' : 'crosshair';
  document.querySelectorAll('#items .item').forEach(el => el.classList.toggle('on', !!placing && el.dataset.id === (el.dataset.type === 'pre' ? placing.def.preset : !placing.def.preset && placing.def.id)));
  const bar = $('#shapeBar'), showShape = tool === 'shape' && !ui.view3d, was = bar.dataset.on === '1';
  bar.style.display = showShape ? 'flex' : 'none';
  bar.dataset.on = showShape ? '1' : '0';
  if (showShape) buildShapeBar();
}
function setTool(t) {
  ui.draw = null; ui.typed = ''; ui.dimStart = null; ui.polyPts = null; ui.calib = null; ui.drag = null; ui.pen = null; ui.mAxis = null; ui.secStart = null;
  ui.btn = t; placing = null;
  if (t === 'mirror' && !selObjs().some(x => XFORM_KINDS.has(x.kind))) toast(L('Aynalamak için önce nesneleri seç', 'Select the objects to mirror first'));
  if (t === 'door') { placing = { type: 'op', def: OPDEF.door, rot: 0 }; tool = 'place'; }
  else if (t === 'window') { placing = { type: 'op', def: OPDEF.window, rot: 0 }; tool = 'place'; }
  else if (t === 'furn') { ui.cat = ui.cat === 0 ? 1 : ui.cat; buildLib(); $('#search').focus(); tool = 'select'; ui.btn = 'select'; toast(L('Soldaki listeden bir mobilya seç', 'Select a furniture item from the left panel')); }
  else tool = t;
  if (ui.view3d) show3D(false);
  updateTools(); render();
}
function startPlace(type, def) {
  ui.draw = null; placing = { type, def, rot: 0, flip: def.flip || 0 }; tool = 'place'; ui.btn = type === 'op' ? (def.id.startsWith('w') ? 'window' : 'door') : null;
  if (ui.view3d) show3D(false);
  updateTools(); render();
}

/* ---------- Önizleme ---------- */
// Yakalama işaretleri: ▲ orta nokta, ⨁ merkez, ◇ alt kat izdüşümü (#25, #26)
const SNAP_HINT_TOOLS = new Set(['wall', 'rect', 'poly', 'slab', 'void', 'dim', 'place']);
function snapGlyph(q, C, z, label, op = 1) {
  const { x, y } = q, sw = 1.6 / z, pe = 'pointer-events="none"';
  let s = '', col, txt;
  if (q.hit === 'mid') {
    col = C.lt ? '#0891b2' : '#22d3ee'; txt = L('Orta nokta', 'Midpoint');
    s = `<polygon points="${x},${y - 7 / z} ${x - 6 / z},${y + 4.5 / z} ${x + 6 / z},${y + 4.5 / z}" fill="${col}" fill-opacity=".35" stroke="${col}" stroke-width="${sw}" ${pe}/>`;
  } else if (q.hit === 'center') {
    col = '#10b981'; txt = L('Merkez', 'Center');
    s = `<g stroke="${col}" stroke-width="${sw}" fill="none" ${pe}><circle cx="${x}" cy="${y}" r="${6 / z}"/><line x1="${x - 10 / z}" y1="${y}" x2="${x + 10 / z}" y2="${y}"/><line x1="${x}" y1="${y - 10 / z}" x2="${x}" y2="${y + 10 / z}"/></g>`;
  } else if (q.hit === 'under') {
    col = C.lt ? '#9333ea' : '#c084fc'; txt = L('Alt kat', 'Underlay');
    s = `<rect x="${x - 6 / z}" y="${y - 6 / z}" width="${12 / z}" height="${12 / z}" transform="rotate(45 ${x} ${y})" fill="none" stroke="${col}" stroke-width="${sw}" ${pe}/>`;
  } else return '';
  if (label) s += `<text x="${x + 10 / z}" y="${y - 10 / z}" font-size="${11 / z}" font-weight="600" fill="${col}" stroke="${C.halo}" stroke-width="${3 / z}" paint-order="stroke" ${pe}>${txt}</text>`;
  return op < 1 ? `<g opacity="${op}">${s}</g>` : s;
}
function drawPreview() {
  const C = pal(), ac = C.accent, g = $('#gPv'), z = view.z, cur = ui.cur; let s = '';
  const lbl = (x, y, t) => `<text x="${x}" y="${y}" font-size="${13 / z}" font-weight="700" fill="${C.text}" stroke="${C.halo}" stroke-width="${3.5 / z}" paint-order="stroke" text-anchor="middle" pointer-events="none">${t}</text>`;
  if (tool === 'trim' && ui.raw) {
    const hit = wallNear(ui.raw, Math.max(10 / z, 4)), pl = hit && trimPlan(hit.w, ui.raw);
    if (pl) {
      const p0 = wallPt(hit.w, pl.lo), p1 = wallPt(hit.w, pl.hi);
      s += `<line x1="${p0.x}" y1="${p0.y}" x2="${p1.x}" y2="${p1.y}" stroke="#ef4444" stroke-opacity=".55" stroke-width="${hit.w.t + 4 / z}" pointer-events="none"/>`;
      for (const q of [p0, p1]) s += `<circle cx="${q.x}" cy="${q.y}" r="${5 / z}" fill="#ef4444" pointer-events="none"/>`;
    }
  }
  if (cur && cur.guides && cur.guides.length && (ui.drag || tool !== 'select')) {
    // nokta takibi kılavuzları: referans köşeden imlece kesikli çizgi + halka
    const gc = C.lt ? '#0891b2' : '#22d3ee';
    for (const gd of cur.guides) {
      s += `<line x1="${gd.from.x}" y1="${gd.from.y}" x2="${cur.x}" y2="${cur.y}" stroke="${gc}" stroke-width="${1.3 / z}" stroke-dasharray="${5 / z} ${4 / z}" pointer-events="none"/>`;
      s += `<circle cx="${gd.from.x}" cy="${gd.from.y}" r="${5 / z}" fill="none" stroke="${gc}" stroke-width="${1.6 / z}" pointer-events="none"/>`;
    }
  }
  if (cur && cur.hit === 'end') s += `<circle cx="${cur.x}" cy="${cur.y}" r="${8 / z}" fill="none" stroke="#10b981" stroke-width="${2 / z}"/>`;
  if (cur && cur.hit && cur.hit !== 'end') s += snapGlyph(cur, C, z, true);
  else if (ui.snap && !ui.shift && ui.raw && SNAP_HINT_TOOLS.has(tool)) {
    // çizim/yerleştirme sırasında imlecin altındaki odanın merkezini silik göster (#25)
    const rm = F().rooms.find(r => r.pts.length > 2 && pointInPoly(ui.raw, r.pts));
    if (rm) s += snapGlyph({ ...polyCentroid(rm.pts), hit: 'center' }, C, z, false, .45);
  }
  if (ui.lenTyped && tool === 'select' && sel.length === 1) {
    const fw = find(sel[0]);
    if (fw && fw.kind === 'wall') { const w = fw.o; s += lbl((w.a.x + w.b.x) / 2, (w.a.y + w.b.y) / 2 - w.t / 2 - 22 / z, `[${ui.lenTyped} cm] ↵`); }
  }
  if (cur && cur.typed) s += lbl(cur.x, cur.y - 18 / z, `[${cur.typed} cm]`);
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
  if (d && d.type === 'prect' && cur) {
    const x0 = Math.min(d.start.x, cur.x), y0 = Math.min(d.start.y, cur.y), w = Math.abs(cur.x - d.start.x), h = Math.abs(cur.y - d.start.y);
    s += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${ac}" fill-opacity=".12" stroke="${ac}" stroke-width="${2 / z}" stroke-dasharray="${6 / z} ${3 / z}"/>`;
    if (w > 10 && h > 10) s += lbl(x0 + w / 2, y0 - 10 / z, `${fmtLen(w)} × ${fmtLen(h)} = ${fmtArea(w * h)}`);
  }
  if (d && d.type === 'plotbox') {
    const x0 = Math.min(d.start.x, d.cur.x), y0 = Math.min(d.start.y, d.cur.y), w = Math.abs(d.cur.x - d.start.x), h = Math.abs(d.cur.y - d.start.y);
    s += `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="${ac}" fill-opacity=".06" stroke="${ac}" stroke-width="${2 / z}" stroke-dasharray="${10 / z} ${5 / z}"/>` + lbl(x0 + w / 2, y0 - 10 / z, L('Çıktı alanı', 'Plot area') + ` ${fmtLen(w)} × ${fmtLen(h)}`);
  }
  if (d && d.type === 'box') {
    s += `<rect x="${Math.min(d.start.x, d.cur.x)}" y="${Math.min(d.start.y, d.cur.y)}" width="${Math.abs(d.cur.x - d.start.x)}" height="${Math.abs(d.cur.y - d.start.y)}" fill="${ac}" fill-opacity=".1" stroke="${ac}" stroke-width="${1.5 / z}" stroke-dasharray="${5 / z}"/>`;
  }
  if (POLY_TOOLS.has(tool) && ui.polyPts && cur) {
    const pts = [...ui.polyPts, cur];
    s += `<polygon points="${pts.map(p => p.x + ',' + p.y).join(' ')}" fill="${ac}" fill-opacity=".12" stroke="${ac}" stroke-width="${2 / z}"/>`;
    ui.polyPts.forEach(p => s += `<circle cx="${p.x}" cy="${p.y}" r="${4 / z}" fill="${ac}"/>`);
    if (pts.length > 2) s += lbl(cur.x, cur.y - 14 / z, fmtArea(polyArea(pts)));
  }
  if (tool === 'dim' && ui.dimStart && cur) s += `<line x1="${ui.dimStart.x}" y1="${ui.dimStart.y}" x2="${cur.x}" y2="${cur.y}" stroke="#0f766e" stroke-width="${2 / z}" stroke-dasharray="${5 / z}"/>` + lbl((ui.dimStart.x + cur.x) / 2, (ui.dimStart.y + cur.y) / 2 - 8 / z, fmtLen(dist(ui.dimStart, cur)));
  if (tool === 'section' && ui.secStart && cur && dist(ui.secStart, cur) > 1) s += sectionSvg({ id: 'pv', name: nextSectionName(), a: ui.secStart, b: cur, dir: 1 }, false);
  if (tool === 'mirror' && ui.mAxis && cur && dist(ui.mAxis, cur) > 1) {
    // ayna ekseni + seçimin yansımış silüeti (#28)
    const a = ui.mAxis, l = dist(a, cur), u = { x: (cur.x - a.x) / l, y: (cur.y - a.y) / l }, ext = 5000;
    s += `<line x1="${a.x - u.x * ext}" y1="${a.y - u.y * ext}" x2="${a.x + u.x * ext}" y2="${a.y + u.y * ext}" stroke="${ac}" stroke-width="${1.5 / z}" stroke-dasharray="${10 / z} ${4 / z} ${2 / z} ${4 / z}" pointer-events="none"/>`;
    const ghost = selObjs().filter(x => XFORM_KINDS.has(x.kind)).map(({ kind, o }) => ({ kind, o: JSON.parse(JSON.stringify(o)) }));
    mirrorObjs(ghost, a, u, () => []);
    for (const { kind, o } of ghost) {
      const pts = AB_KINDS.has(kind) ? [o.a, o.b] : kind === 'furn' ? furnCorners(o) : PTS_KINDS.has(kind) ? o.pts : null;
      if (pts) s += `<poly${AB_KINDS.has(kind) || kind === 'sketch' ? 'line' : 'gon'} points="${pts.map(p => p.x + ',' + p.y).join(' ')}" fill="${ac}" fill-opacity=".08" stroke="${ac}" stroke-width="${kind === 'wall' ? o.t : 2 / z}" stroke-opacity=".45" pointer-events="none"/>`;
      else if (kind === 'text') s += `<circle cx="${o.x}" cy="${o.y}" r="${4 / z}" fill="${ac}" pointer-events="none"/>`;
    }
    s += `<circle cx="${a.x}" cy="${a.y}" r="${4 / z}" fill="${ac}" pointer-events="none"/>`;
  }
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
    const c = g && nearCenter(p, 18 / view.z); // oda / grup merkezine kilitlen (#25), yoksa duvara yapış
    if (c) { f.x = c.x; f.y = c.y; ui.cur = { x: c.x, y: c.y, hit: 'center' }; }
    else if (!ui.shift) magnet(f);
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
  else if (POLY_TOOLS.has(tool) && ui.polyPts && ui.polyPts.length) from = ui.polyPts[ui.polyPts.length - 1];
  else if (tool === 'calib' && ui.calib) from = null;
  else if (tool === 'mirror' && ui.mAxis) from = ui.mAxis;
  else if (tool === 'section' && ui.secStart) from = ui.secStart;
  ui.cur = ['wall', 'rect', 'poly', 'slab', 'void', 'dim', 'calib', 'shape', 'mirror', 'section'].includes(tool) ? snapPt(raw, from, e) : null;
  if (tool === 'wall' && ui.draw && ui.typed) {
    const a = ui.draw.start, l = parseFloat(ui.typed) || 0, dx = ui.cur.x - a.x, dy = ui.cur.y - a.y, m = Math.hypot(dx, dy) || 1;
    ui.cur = { x: a.x + dx / m * l, y: a.y + dy / m * l, hit: null };
  }
  $('#coords').textContent = `x: ${(raw.x / 100).toFixed(2)} m   y: ${(raw.y / 100).toFixed(2)} m`;
}
cv.addEventListener('contextmenu', e => { e.preventDefault(); if (tool === 'select') { openCtxMenu(e); return; } if (tool === 'place' || tool === 'wall' || POLY_TOOLS.has(tool) || tool === 'pen') { setTool('select'); } });
cv.addEventListener('wheel', e => {
  e.preventDefault(); const r = cv.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top);
}, { passive: false });
cv.addEventListener('dblclick', e => {
  if (tool === 'wall') { ui.draw = null; ui.typed = ''; render(); }
  else if (POLY_TOOLS.has(tool)) finishPoly();
  else if (tool === 'select') {
    const t = e.target.closest('[data-id]'); const o = t && find(t.dataset.id);
    if (o && o.kind === 'room') { const n = prompt(L('Oda adı:', 'Room name:'), o.o.name); if (n) { o.o.name = n; commit(); refresh(); } }
    else if (o && (o.kind === 'slab' || o.kind === 'void')) { const n = prompt(L('Ad:', 'Name:'), o.o.name || ''); if (n != null) { o.o.name = n; commit(); refresh(); } }
    else if (o && o.kind === 'text') { const n = prompt(L('Metin:', 'Text:'), o.o.text); if (n) { o.o.text = n; commit(); refresh(); } }
  }
});
function pickDataId(e) {
  // 1) "👆 Tıkla / Click me" rozeti her zaman en üst önceliklidir
  // 2) Mobilya/duvar/kapı gibi nesneler oda etiketinin altında kalmasın
  // 3) Altında nesne yoksa oda etiketi / oda çokgeni seçilir
  let first = null, roomHit = null, lowHit = null;
  for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
    const b = el.closest ? el.closest('[data-var-badge]') : null;
    if (b) return b;
    const t = el.closest ? el.closest('[data-id]') : null;
    if (!t || !pickable(t.dataset.id)) continue; // kilitli katman: tık alttakine geçer (#32)
    if (!first) first = t;
    if (t.hasAttribute('data-rlabel') || t.hasAttribute('data-rpoly')) {
      if (!roomHit) roomHit = t;
      continue;
    }
    // döşeme boşluğu (1) ve serbest döşeme (2) en geniş, en alttaki yüzeylerdir: yalnızca başka nesne yoksa
    if (t.hasAttribute('data-low')) {
      if (!lowHit || +t.dataset.low < +lowHit.dataset.low) lowHit = t;
      continue;
    }
    return t;
  }
  return roomHit || lowHit || first;
}
/* ---------- Katmanlar: üst üste binen nesneler ----------
   Aynı türdeki nesnelerin dizideki sırası çizim sırasıdır (sonraki = üstte).
   2B bu sırayla çizer; 3B aynı sırayı stackLevels() ile küçük yükseklik
   farklarına çevirir, böylece çakışan yüzeyler titremez (z-fighting) ve
   3B'de de üstteki nesne üstte görünür. */
const LAYER_ARR = { furn: 'furn', room: 'rooms', slab: 'slabs', void: 'voids', text: 'texts', sketch: 'sketches', dim: 'dims' };
// İmlecin altındaki tüm nesneler, en üstteki önce (rozetler hariç)
function idsAt(clientX, clientY) {
  const out = [];
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const t = el.closest ? el.closest('[data-id]') : null;
    if (!t || t.dataset.varBadge) continue;
    const id = t.dataset.id;
    if (!out.includes(id) && find(id) && pickable(id)) out.push(id);
  }
  return out;
}
function objLabel(id) {
  const fd = find(id); if (!fd) return id;
  const o = fd.o, k = (isEN() ? KIND_EN : KIND_TR)[fd.kind] || fd.kind;
  const nm = fd.kind === 'furn' ? (o.label || (BYID[o.type] ? itemName(BYID[o.type]) : o.name))
    : fd.kind === 'room' || fd.kind === 'slab' || fd.kind === 'void' || fd.kind === 'section' ? o.name : fd.kind === 'text' ? o.text
    : fd.kind === 'wall' ? fmtLen(wLen(o)) : fd.kind === 'op' ? o.type : '';
  return nm ? `${k} · ${nm}` : k;
}
// Ctrl+tık: aynı noktadaki bir alttaki nesneye geç (en alttan sonra tekrar en üste)
function cycleStackAt(e) {
  const ids = idsAt(e.clientX, e.clientY); if (!ids.length) return null;
  const cur = sel.length === 1 ? ids.indexOf(sel[0]) : -1, i = (cur + 1) % ids.length;
  sel = [ids[i]];
  if (ids.length > 1) toast(`${i + 1}/${ids.length}: ${objLabel(ids[i])}`);
  return ids[i];
}
const bbOverlap = (a, b) => a && b && a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
// Seçili nesneleri kendi türlerinin dizisinde yeniden sıralar: 'front' | 'back' | 'up' | 'down'
function reorderSel(dir) {
  const f = F(), ids = new Set(sel); let changed = false;
  for (const [kind, arr] of Object.entries(LAYER_ARR)) {
    const list = f[arr] || []; if (!list.some(o => ids.has(o.id))) continue;
    const before = list.map(o => o.id).join();
    let out;
    if (dir === 'front' || dir === 'back') {
      const a = list.filter(o => ids.has(o.id)), b = list.filter(o => !ids.has(o.id));
      out = dir === 'front' ? b.concat(a) : a.concat(b);
    } else {
      // bir adım: seçili nesneyi örttüğü/örtüldüğü sıradaki ilk çakışan nesnenin öbür yanına al
      out = list.slice();
      const order = dir === 'up' ? out.filter(o => ids.has(o.id)).reverse() : out.filter(o => ids.has(o.id));
      for (const o of order) {
        const i = out.indexOf(o), bb = bboxOf(kind, o);
        let j = -1;
        if (dir === 'up') { for (let k = i + 1; k < out.length; k++) if (!ids.has(out[k].id) && bbOverlap(bb, bboxOf(kind, out[k]))) { j = k; break; } }
        else { for (let k = i - 1; k >= 0; k--) if (!ids.has(out[k].id) && bbOverlap(bb, bboxOf(kind, out[k]))) { j = k; break; } }
        if (j < 0) continue;
        out.splice(i, 1); out.splice(j, 0, o);
      }
    }
    f[arr] = out;
    if (out.map(o => o.id).join() !== before) changed = true;
  }
  if (!changed) { toast(L('Sıra değişmedi (çakışan nesne yok)', 'Order unchanged (nothing overlaps)')); return false; }
  commit(); refresh(); if (ui.view3d && T3) schedBuild3D();
  return true;
}
// 3B: çakışan nesneler için yığın seviyesi (0 = altında çakışan yok); dizi sırası korunur
function stackLevels(list, kind) {
  const bbs = list.map(o => bboxOf(kind, o)), lv = new Array(list.length).fill(0);
  for (let i = 0; i < list.length; i++) for (let j = 0; j < i; j++) if (bbOverlap(bbs[i], bbs[j])) lv[i] = Math.max(lv[i], lv[j] + 1);
  return lv;
}
// Sağ tık (Seç aracı): imlecin altındaki nesnelerin listesi + katman komutları
function closeCtxMenu() { const m = document.getElementById('ctxMenu'); if (m) m.remove(); }
function openCtxMenu(e) {
  closeCtxMenu();
  const ids = idsAt(e.clientX, e.clientY);
  if (!ids.length && !sel.length) return;
  const m = document.createElement('div'); m.id = 'ctxMenu'; m.className = 'ctxmenu';
  let h = '';
  if (ids.length) {
    h += `<div class="cm-h">${L('Buradaki nesneler (üstten alta)', 'Objects here (top to bottom)')}</div>`;
    h += ids.map(id => `<button data-cmsel="${id}" class="${sel.includes(id) ? 'on' : ''}">${esc(objLabel(id))}</button>`).join('');
  }
  const canLayer = (ids.length || sel.length) && (sel.length ? selObjs() : [find(ids[0])]).some(x => x && LAYER_ARR[x.kind]);
  if (canLayer) {
    h += `<div class="cm-sep"></div>`
      + `<button data-cmlayer="front">⤒ ${L('En öne getir', 'Bring to front')} <kbd>Ctrl+Shift+]</kbd></button>`
      + `<button data-cmlayer="up">↑ ${L('Bir öne', 'Bring forward')} <kbd>Ctrl+]</kbd></button>`
      + `<button data-cmlayer="down">↓ ${L('Bir arkaya', 'Send backward')} <kbd>Ctrl+[</kbd></button>`
      + `<button data-cmlayer="back">⤓ ${L('En arkaya gönder', 'Send to back')} <kbd>Ctrl+Shift+[</kbd></button>`;
  }
  if (sel.length && selObjs().some(x => XFORM_KINDS.has(x.kind))) {
    h += `<div class="cm-sep"></div>`
      + `<button data-cmxf="flipH">⇋ ${L('Yatay aynala', 'Flip horizontal')} <kbd>Shift+H</kbd></button>`
      + `<button data-cmxf="flipV">⇵ ${L('Dikey aynala', 'Flip vertical')} <kbd>Shift+V</kbd></button>`
      + `<button data-cmxf="mirror">🪞 ${L('Eksene göre aynala…', 'Mirror about axis…')} <kbd>I</kbd></button>`
      + `<button data-cmxf="scale">⤢ ${L('Ölçekle…', 'Scale…')}</button>`;
  }
  m.innerHTML = h; document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(e.clientX, innerWidth - r.width - 6) + 'px';
  m.style.top = Math.min(e.clientY, innerHeight - r.height - 6) + 'px';
  m.addEventListener('pointerdown', ev => ev.stopPropagation());
  m.addEventListener('click', ev => {
    const s = ev.target.closest('[data-cmsel]');
    if (s) { sel = [s.dataset.cmsel]; closeCtxMenu(); refresh(); return; }
    const xf = ev.target.closest('[data-cmxf]');
    if (xf) { closeCtxMenu(); const v = xf.dataset.cmxf; if (v === 'mirror') setTool('mirror'); else if (v === 'scale') scaleSelPrompt(); else flipSel(v === 'flipH' ? 'h' : 'v'); return; }
    const l = ev.target.closest('[data-cmlayer]');
    if (l) { if (!sel.length && ids.length) sel = [ids[0]]; closeCtxMenu(); reorderSel(l.dataset.cmlayer); }
  });
}
window.addEventListener('pointerdown', closeCtxMenu);
window.addEventListener('blur', closeCtxMenu);
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); setCursor(e);
  const raw = ui.raw, cur = ui.cur;
  if (e.button === 1 || tool === 'pan' || ui.space) { ui.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; cv.style.cursor = 'grabbing'; return; }
  if (e.button !== 0) return;
  const f = F();
  switch (tool) {
    case 'select': {
      const wd = e.target.closest('[data-wdim]');
      if (wd && !e.shiftKey && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); openWallDimInput(wd.dataset.wdim, e.clientX, e.clientY); return; }
      const h = e.target.closest('[data-h]');
      if (h) { startHandle(h.dataset.h, raw, e); return; }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && cycleStackAt(e)) { // Ctrl+tık: alttaki nesneyi seç
        renderProps(); startMove(raw, e); if (ui.drag) ui.drag.clickedId = null; render(); return;
      }
      const t = pickDataId(e);
      if (t) {
        const id = t.dataset.id;
        const badgeType = t.dataset.varBadge || null, badgeGrp = t.dataset.grp || null;
        if (e.shiftKey) { sel = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]; }
        else if (e.altKey || (!badgeType && grpEditing(find(id)?.o))) { sel = [id]; } // Alt veya grup düzenleme: tek üye
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
    case 'slab': case 'void': {
      // ilk basış: sürüklenirse dikdörtgen, tıklanırsa köşe köşe çokgen (pointerup karar verir)
      if (!ui.polyPts) { ui.drag = { type: 'prect', start: { x: cur.x, y: cur.y } }; return; }
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
    case 'trim': {
      const hit = wallNear(raw, Math.max(10 / view.z, 4));
      if (!hit) return;
      if (trimWall(hit.w, raw)) { sel = sel.filter(id => find(id)); commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); }
      else toast(L('Bu duvarı kesen başka duvar yok', 'No other wall crosses this one'));
      return;
    }
    case 'eraser': {
      const t = pickDataId(e);
      if (t) {
        if (t.dataset.varBadge === 'group' && t.dataset.grp) deleteIds(groupMemberIds(t.dataset.grp)); // rozet = grubun tamamı
        else deleteIds([t.dataset.id]);
        commit(); refresh(); if (ui.view3d && T3) schedBuild3D();
      }
      return;
    }
    case 'section': {
      if (!ui.secStart) { ui.secStart = { x: cur.x, y: cur.y }; drawPreview(); return; }
      if (dist(ui.secStart, cur) < 20) return;
      const sc = { id: uid(), name: nextSectionName(), a: ui.secStart, b: { x: cur.x, y: cur.y }, dir: 1 };
      (f.sections = f.sections || []).push(sc); sel = [sc.id]; ui.secStart = null; commit(); setTool('select'); refresh();
      return;
    }
    case 'plotwin': ui.drag = { type: 'plotbox', start: { x: raw.x, y: raw.y }, cur: { x: raw.x, y: raw.y } }; return;
    case 'mirror': {
      const os = selObjs().filter(x => XFORM_KINDS.has(x.kind));
      if (!os.length) { setTool('select'); toast(L('Aynalamak için önce nesneleri seç', 'Select the objects to mirror first')); return; }
      if (!ui.mAxis) { ui.mAxis = { x: cur.x, y: cur.y }; drawPreview(); return; }
      const l = dist(ui.mAxis, cur); if (l < 1) return;
      const u = { x: (cur.x - ui.mAxis.x) / l, y: (cur.y - ui.mAxis.y) / l }, o = ui.mAxis;
      const erase = confirm(L('Orijinal nesneler silinsin mi?\n\nTamam = taşı (sil) • İptal = aynalı kopya oluştur', 'Erase the original objects?\n\nOK = move (erase) • Cancel = keep them and add a mirrored copy'));
      if (!erase) { sel = [...new Set([...sel, ...F().ops.filter(op => sel.includes(op.wall)).map(op => op.id)])]; paste(true, 0); } // duvarların kapı/pencereleriyle birlikte kopya; kopya seçili hale gelir ve aynalanır
      mirrorObjs(selObjs().filter(x => XFORM_KINDS.has(x.kind)), o, u);
      ui.mAxis = null; tool = 'select'; ui.btn = 'select'; updateTools(); afterXform();
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
  if (ui.polyPts && ui.polyPts.length >= 3) addPolyObj(tool, ui.polyPts);
  ui.polyPts = null; refresh();
}
// Çizilen poligonu aracın türüne göre ekler: oda / serbest döşeme / döşeme boşluğu
function addPolyObj(t, pts) {
  const f = F(), o = t === 'slab' ? mkSlab(pts) : t === 'void' ? mkVoid(pts) : mkRoom(pts);
  (t === 'slab' ? f.slabs : t === 'void' ? f.voids : f.rooms).push(o);
  sel = [o.id]; commit(); if (ui.view3d && T3) schedBuild3D();
  return o;
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
    if (!placing.def.preset) ui.opSrc[o.id] = placing.def.id; // son kullanılan ölçü için kaynak (#42)
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
    if (d.type === 'plotbox') { d.cur = ui.raw; drawPreview(); return; }
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
  if (d.type === 'plotbox') {
    const x0 = Math.min(d.start.x, d.cur.x), x1 = Math.max(d.start.x, d.cur.x), y0 = Math.min(d.start.y, d.cur.y), y1 = Math.max(d.start.y, d.cur.y);
    if (x1 - x0 < 20 || y1 - y0 < 20) { toast(L('Alan çok küçük — tekrar sürükle', 'Area too small — drag again')); return; }
    ui.plot.win = { x0, y0, x1, y1 }; ui.plot.area = 'window'; setTool('select'); openPlotDialog(); return;
  }
  if (d.type === 'box') {
    if (d.moved && dist(d.start, d.cur) > 4 / view.z) {
      const x0 = Math.min(d.start.x, d.cur.x), x1 = Math.max(d.start.x, d.cur.x), y0 = Math.min(d.start.y, d.cur.y), y1 = Math.max(d.start.y, d.cur.y);
      const f = F(), ids = new Set(sel), scope = ui.boxSel || 'all';
      for (const arr in KINDS) for (const o of f[arr]) {
        const kd = KINDS[arr];
        if (scope === 'wall' && kd !== 'wall') continue;
        if (scope === 'furn' && kd !== 'furn') continue;
        if (!pickable(o.id)) continue;
        const bb = bboxOf(kd, o); if (!bb) continue;
        const inside = bb.x0 >= x0 && bb.x1 <= x1 && bb.y0 >= y0 && bb.y1 <= y1;
        const inter = bb.x1 >= x0 && bb.x0 <= x1 && bb.y1 >= y0 && bb.y0 <= y1;
        const rm = POLY_KINDS.has(kd) || kd === 'dim';
        if (rm ? inside : (kd === 'wall' ? inside : inter)) ids.add(o.id);
      }
      sel = [...ids];
    }
    refresh(); return;
  }
  if (d.type === 'prect') {
    const c = ui.cur || d.start, x0 = Math.min(d.start.x, c.x), x1 = Math.max(d.start.x, c.x), y0 = Math.min(d.start.y, c.y), y1 = Math.max(d.start.y, c.y);
    if (x1 - x0 > 10 && y1 - y0 > 10) addPolyObj(tool, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]);
    else ui.polyPts = [{ x: d.start.x, y: d.start.y }]; // sürüklenmedi: köşe köşe çizim başlar
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
      if (fd && fd.o.grp && !grpEditing(fd.o) && cycleGroupVars(fd.o.grp)) return; // düzenleme modunda tık düzen değiştirmez
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
  if (first) { const o = orig.get(first.o.id); anchor = AB_KINDS.has(first.kind) ? o.a : PTS_KINDS.has(first.kind) ? o.pts[0] : first.kind === 'op' ? anchor : { x: o.x, y: o.y }; }
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
    if (AB_KINDS.has(kind)) { o.a = { x: g.a.x + dx, y: g.a.y + dy }; o.b = { x: g.b.x + dx, y: g.b.y + dy }; }
    else if (PTS_KINDS.has(kind)) o.pts = g.pts.map(p => ({ x: p.x + dx, y: p.y + dy }));
    else if (kind === 'furn') {
      o.x = g.x + dx; o.y = g.y + dy;
      if (sel.length === 1) {
        o.rot = g.rot; ui.cur = null;
        const c = ui.snap && !e.shiftKey && nearCenter({ x: g.x + raw.x - d.start.x, y: g.y + raw.y - d.start.y }, 18 / view.z);
        if (c) { o.x = c.x; o.y = c.y; ui.cur = { x: c.x, y: c.y, hit: 'center' }; } // oda / grup merkezi (#25)
        else { magnet(o); if (e.shiftKey) { o.x = g.x + dx; o.y = g.y + dy; o.rot = g.rot; } }
      }
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
    let p = snapPt(raw, other, e, ign); ui.cur = p;
    const tl = parseFloat(d.typed);
    if (tl > 0) { // yazılan uzunluk (#36): imleç yönünde, karşı uçtan tam bu uzaklıkta
      let dx = p.x - other.x, dy = p.y - other.y, m = Math.hypot(dx, dy);
      if (m < 1e-6) { dx = d.orig ? d.orig[ek].x - other.x : 1; dy = d.orig ? d.orig[ek].y - other.y : 0; m = Math.hypot(dx, dy) || 1; }
      p = { x: Math.round((other.x + dx / m * tl) * 100) / 100, y: Math.round((other.y + dy / m * tl) * 100) / 100, hit: null, typed: d.typed };
    }
    ui.cur = p;
    o[ek] = { x: p.x, y: p.y }; for (const c of d.conn) c.w[c.k] = { x: p.x, y: p.y };
    if (Array.isArray(o.angles) && o.angles.length) { const idx = clamp(o.posIdx ?? 0, 0, o.angles.length - 1); o.posIdx = idx; o.angles[idx] = wallDeg(o); }
  } else if (h === 'wrot') {
    const pv = o[wallPivot(o)];
    let a = Math.atan2(raw.y - pv.y, raw.x - pv.x) * 180 / Math.PI;
    const step = (P.gridType === 'triangle') ? 30 : 15;
    if (ui.snap && !sh) a = rnd(a, step);
    setWallDeg(o, a, true);
  } else if (h[0] === 'v') {
    const i = +h.slice(1), p = snapPt(raw, null, e, new Set([o.pts[i]])); o.pts[i] = { x: p.x, y: p.y }; ui.cur = p;
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
    scaleObjs(selObjs(), id => d.origAll.get(id), tx, ty, sx, sy);
  } else if (h === 'da' || h === 'db') { const p = snapPt(raw, null, e, new Set([o.a, o.b])); o[h === 'da' ? 'a' : 'b'] = { x: p.x, y: p.y }; ui.cur = p; }
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
const KIND_TR = { wall: '🧱 Duvar', op: '🚪 Kapı / Pencere', furn: '🛋️ Mobilya', room: '🏠 Oda', slab: '🔲 Döşeme', void: '🕳️ Döşeme Boşluğu', dim: '📏 Ölçü', section: '🔪 Kesit', text: '🔤 Metin', sketch: '✏️ Serbest Çizim', bg: '🖼 Arka Plan Görseli' };
const KIND_EN = { wall: '🧱 Wall', op: '🚪 Door / Window', furn: '🛋️ Furniture', room: '🏠 Room', slab: '🔲 Slab', void: '🕳️ Floor Void', dim: '📏 Dimension', section: '🔪 Section', text: '🔤 Text', sketch: '✏️ Freehand Sketch', bg: '🖼 Background Image' };
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
  const xf = os.some(x => XFORM_KINDS.has(x.kind)) ? `<div class="row"><button class="btn sm" data-act="flipH" title="Shift+H">${L('⇋ Yatay aynala', '⇋ Flip H')}</button><button class="btn sm" data-act="flipV" title="Shift+V">${L('⇵ Dikey aynala', '⇵ Flip V')}</button><button class="btn sm" data-act="mirror" title="I">${L('🪞 Eksene göre…', '🪞 Mirror…')}</button><button class="btn sm" data-act="scale">${L('⤢ Ölçekle…', '⤢ Scale…')}</button></div>` : '';
  const acts = (extra = '') => selLayerHtml(os) + xf + `<div class="row">${extra}<button class="btn sm" data-act="dup">${L('⧉ Çoğalt', '⧉ Duplicate')}</button><button class="btn sm" data-act="del" style="color:var(--danger)">${L('🗑 Sil', '🗑 Delete')}</button></div>`;
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
    if (F().walls.length > 1 && os.every(x => x.o.h === o.h)) h += `<div class="row"><button class="btn sm" data-act="wallhfloor" title="${L('Bu yüksekliği kattaki tüm duvarlara ve katın varsayılanına uygula', 'Apply this height to every wall on the floor and make it the floor default')}">⬆ ${L('Kattaki tüm duvarlara uygula', 'Apply to all walls on floor')}</button></div>`;
    h += fld(L('Duvar Tipi', 'Wall Type'), 'wall', 'wt', o.wt || 'solid', { sel: { solid: L('🧱 Dolu', '🧱 Solid'), curtain: L('🪟 Cam Cephe', '🪟 Curtain Wall'), railing: L('🛡 Korkuluk', '🛡 Railing / Balustrade'), fence: L('🌿 Bahçe çiti', '🌿 Garden Fence') } });
    if (os.every(x => x.o.wt === 'curtain')) {
      // dikme modülü + ara dikme adedi (#71): adet girilirse eşit bölmeler, modül girilirse adet yeniden hesaplanır
      const bays = curtainBays(o), fixed = o.mulN != null;
      h += fld(L('Dikme aralığı (cm)', 'Mullion spacing (cm)'), 'wall', 'mul', fixed ? Math.round(wLen(o) / bays) : (+o.mul || MUL_DEF), { min: 20, max: 1000, step: 10 });
      h += fld(L('Ara dikme adedi', 'Intermediate mullions'), 'wall', 'mulN', bays - 1, { min: 0, max: 200, step: 1 });
      h += `<p class="muted" style="margin:0 0 6px">${L(`${bays} eşit cam bölme · 0 = tek parça cam`, `${bays} equal glass bay(s) · 0 = one uninterrupted pane`)}</p>`;
    }
    h += fld(L('🎨 Duvar boyası', '🎨 Wall paint'), 'wall', 'color', o.color || '#f5f1e8', { type: 'color' });
    h += `<div class="row swatches">${PAINTS.map(([c, tr, en]) => `<button class="btn sm swatch${o.color === c ? ' on' : ''}" data-act="paint" data-c="${c}" title="${L(tr, en)}" style="background:${c}"></button>`).join('')}<button class="btn sm" data-act="paint" data-c="" title="${L('Varsayılan renk', 'Default colour')}">${L('↺ Varsayılan', '↺ Default')}</button></div>`;
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
    const xc = n === 1 ? wallCuts(o).length : 0;
    h += acts(`<button class="btn sm" data-act="split">${L('✂ Ortadan böl', '✂ Split in half')}</button>`
      + (xc ? `<button class="btn sm" data-act="splitx" title="${L('Duvarı başka duvarlarla kesiştiği noktalardan böl', 'Split the wall where other walls cross it')}">${L('✂ Kesişimden böl', '✂ Split at intersection')} (${xc})</button>` : '')
      + (n === 2 ? `<button class="btn sm" data-act="corner" title="${L('İki duvarı kesişimlerinde temiz bir L köşe yap (taşanı kırpar, kısayı uzatır)', 'Make a clean L corner where the two walls meet (trims overhangs, extends short walls)')}">${L('⌐ Köşe birleştir', '⌐ Join corner')}</button>` : ''));
  } else if (k === 'op') {
    h += fld(L('Tür', 'Type'), 'op', 'type', o.type, { sel: isEN() ? { door: 'Door', double: 'Double door', slide: 'Sliding', arch: 'Archway', window: 'Window' } : { door: 'Kapı', double: 'Çift kapı', slide: 'Sürgülü', arch: 'Açıklık', window: 'Pencere' } });
    h += fld(L('Genişlik (cm)', 'Width (cm)'), 'op', 'w', o.w, { min: 20, max: 500 }) + fld(L('Yükseklik (cm)', 'Height (cm)'), 'op', 'h', o.h, { min: 20, max: 400 }) + fld(L('Denizlik (cm)', 'Sill height (cm)'), 'op', 'sill', o.sill, { min: 0, max: 300 });
    if (o.type === 'door' || o.type === 'double') h += `<label class="f"><span>${L('Açık (90°)', 'Open (90°)')}</span><input type="checkbox" data-k="op" data-p="open" ${o.open ? 'checked' : ''}></label>`;
    else if (o.type === 'slide') h += `<label class="f"><span>${L('Açık', 'Open')}</span><input type="checkbox" data-k="op" data-p="open" ${o.open ? 'checked' : ''}></label>`;
    if (isDoorOp(o)) {
      const dm = doorMat(o);
      h += fld(L('Malzeme', 'Material'), 'op', 'mat', dm, { sel: biOpts(DOOR_MATS) });
      if (dm === 'glass' || dm === 'paneled') h += fld(L('Cam', 'Glass'), 'op', 'glass', o.glass === 'frosted' ? 'frosted' : 'clear', { sel: biOpts(GLASS_KINDS) });
      if (dm !== 'glass') h += fld(L('Kanat rengi', 'Leaf colour'), 'op', 'color', doorLeafCol(o), { type: 'color' });
    }
    if (o.type !== 'arch') h += fld(L('Kasa rengi', 'Frame colour'), 'op', 'frameCol', o.frameCol || '#c3c1bf', { type: 'color' });
    if (o.color || o.frameCol) h += `<div class="row"><button class="btn sm" data-act="opcolreset">${L('↺ Varsayılan renkler', '↺ Default colours')}</button></div>`;
    if (n === 1) h += `<div class="row"><button class="btn sm" data-act="savepreset" title="${L('Bu ölçüleri kütüphaneye kaydet, tekrar tekrar yerleştir', 'Save these sizes to the library and place them again')}">💾 ${L('Kütüphaneye kaydet', 'Save to library')}</button></div>`;
    if (o.type === 'slide') h += acts(`<button class="btn sm" data-act="opflip">${L('↔ Yön', '↔ Flip')}</button>`);
    else h += acts(`<button class="btn sm" data-act="opflip">${L('↔ Menteşe', '↔ Hinge')}</button><button class="btn sm" data-act="opside">${L('↕ Açılış yönü', '↕ Swing side')}</button>`);
  } else if (k === 'furn') {
    h += fld(L('Etiket', 'Label'), 'furn', 'label', o.label || '', { type: 'text' });
    h += fld(L('Genişlik (cm)', 'Width (cm)'), 'furn', 'w', o.w, { min: 5 }) + fld(L('Derinlik (cm)', 'Depth (cm)'), 'furn', 'd', o.d, { min: 5 }) + fld(L('Yükseklik 3B (cm)', '3D Height (cm)'), 'furn', 'h', o.h, { min: 1 }) + fld(L('Açı (°)', 'Angle (°)'), 'furn', 'rot', o.rot, { min: 0, max: 360 }) + fld(L('Renk', 'Color'), 'furn', 'color', o.color, { type: 'color' });
    if (o.k !== 'stairs' && o.k !== 'ramp') h += fld(L('Yerden yükseklik (cm)', 'Height above floor (cm)'), 'furn', 'elev', furnElev(o), { min: 0, max: FURN_ELEV_MAX, step: 5 }); // duvara asılan eşya (#61)
    h += acts(`<button class="btn sm" data-act="rot90">⟳ 90°</button><button class="btn sm" data-act="swapwd">${L('⇄ En/Boy', '⇄ Swap W/D')}</button>`);
    if (o.k === 'ramp' && n === 1) {
      // rampa ayarları (#58): tür, korkuluk; canlı eğim (% ve 1:X) + yönetmelik rozeti
      const sl = rampSlope(o), [cc, ctr, cen] = RAMP_CLS[sl.cls];
      h += `<h4>${L('Rampa', 'Ramp')}</h4>` + fld(L('Tür', 'Type'), 'furn', 'rampType', rampType(o), { sel: biOpts(RAMP_TYPES) })
        + fld(L('Korkuluk', 'Railing'), 'furn', 'railing', rampRail(o), { sel: biOpts(STAIR_RAILS) })
        + `<p class="muted" style="margin:0 0 6px">${L('Genişlik = G, uzunluk = D (yatay), kot farkı = Y alanları.', 'Width = W, length = D (horizontal), rise = H fields.')}</p>`
        + `<div class="stat"><span>${L('Eğim', 'Slope')}</span><b>${pctTxt(sl.pct)} · 1:${isFinite(sl.ratio) ? Math.round(sl.ratio * 10) / 10 : '∞'} · ${Math.round(sl.deg * 10) / 10}°</b></div>`
        + `<div class="stat"><span>${L('Uygunluk', 'Compliance')}</span><b style="color:${cc}">${L(ctr, cen)}</b></div>`
        + (sl.pct > 8 && rampType(o) === 'accessible' ? `<div class="row"><button class="btn sm" data-act="rampfit" title="${L('Kot farkını koruyup uzunluğu %8 eğime göre ayarla', 'Keep the rise and lengthen the ramp to an 8% slope')}">↔ ${L('%8 için uzat', 'Lengthen to 8%')} (${Math.ceil(o.h / 0.08)} cm)</button></div>` : '');
    }
    if (o.k === 'stairs' && n === 1) {
      // merdiven ayarları (#33): rıht sayısı, tür, korkuluk; rıht / basamak ve Blondel konfor kontrolü
      const st = stairSteps(o), bl = blondel(st.riser, st.tread), bc = bl.ok ? '#16a34a' : bl.warn ? '#d97706' : 'var(--danger)';
      h += `<h4>${L('Merdiven', 'Stairs')}</h4>` + fld(L('Tür', 'Type'), 'furn', 'stairType', st.type, { sel: biOpts(STAIR_TYPES) })
        + fld(L('Rıht sayısı', 'Number of risers'), 'furn', 'stepN', st.n, { min: 2, max: 60, step: 1 })
        + fld(L('Korkuluk', 'Railing'), 'furn', 'railing', o.railing || 'right', { sel: biOpts(STAIR_RAILS) })
        + `<div class="stat"><span>${L('Rıht yüksekliği', 'Riser height')}</span><b>${(Math.round(st.riser * 10) / 10)} cm</b></div>`
        + `<div class="stat"><span>${L('Basamak derinliği', 'Tread depth')}</span><b>${(Math.round(st.tread * 10) / 10)} cm</b></div>`
        + `<div class="stat" title="${L('Blondel kuralı: 2 × rıht + basamak ≈ 63 cm (60–64 rahat)', 'Blondel rule: 2 × riser + tread ≈ 63 cm (60–64 is comfortable)')}"><span>2r + t</span><b style="color:${bc}">${Math.round(bl.v * 10) / 10} cm ${bl.ok ? '✓' : bl.warn ? '≈' : '✗'}</b></div>`
        + `<div class="row"><button class="btn sm" data-act="stairfit">${L('⇕ Kat yüksekliğine eşitle', '⇕ Match storey height')} (${curFloorH() + 20} cm)</button></div>`;
    }
    if (Array.isArray(o.parts) && o.parts.length && n === 1) { // çok parçalı mobilya: parça sayısı + doğrulama (düzenleme şimdilik MCP / JSON ile)
      const v = validateParts(o);
      h += `<div class="stat" title="${L('Bu mobilya parçalardan oluşur; ölçüleri değiştirince parçalar birlikte ölçeklenir', 'This item is built from parts; resizing it scales the parts with it')}"><span>🧩 ${L('Parçalar', 'Parts')}</span><b style="color:${v.ok ? '#16a34a' : 'var(--danger)'}">${v.count}${v.ok ? '' : ' ⚠'}</b></div>`;
    }
    if (o.k !== 'stairs' && o.k !== 'roof' && n === 1) h += `<div class="row"><button class="btn sm" data-act="parts" title="${L('Mobilyayı kutu, silindir ve kürelerden kurun: ayaklar, tabla, raflar…', 'Build the item from boxes, cylinders and spheres: legs, top, shelves…')}">🧩 ${Array.isArray(o.parts) && o.parts.length ? L('Parçaları düzenle', 'Edit parts') : L('Parçalardan kur', 'Build from parts')} · ${L('stüdyo', 'studio')}</button></div>`;
    if (o.type !== 'shape' && n === 1) h += `<div class="row"><button class="btn sm" data-act="savepreset" title="${L('Bu ölçü ve rengi kütüphaneye kaydet, tekrar tekrar yerleştir', 'Save this size and colour to the library and place it again')}">💾 ${L('Kütüphaneye kaydet', 'Save to library')}</button></div>`;
    if (o.type === 'shape') h += `<div class="row"><button class="btn sm primary" data-act="saveshape">💾 ${L('Şekli kütüphaneye kaydet', 'Save shape to library')}</button></div>`;
  } else if (k === 'room') {
    h += fld(L('Ad', 'Name'), 'room', 'name', o.name, { type: 'text' }) + fld(L('Renk', 'Color'), 'room', 'color', o.color, { type: 'color' }) + fld(L('Zemin', 'Flooring'), 'room', 'floor', o.floor || 'none', { sel: floorOpts() }) + glassFld('room', o) + (o.floor === 'glass' ? '' : fld(L('Döşeme kalınlığı (cm)', 'Slab thickness (cm)'), 'room', 'slabT', roomSlabT(o), { min: 0, max: 200, step: 5 })) + `<div class="row"><button class="btn sm" data-act="texadd">${L('🖼 Doku yükle…', '🖼 Upload texture…')}</button></div>`;
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
  } else if (k === 'slab' || k === 'void') {
    // serbest döşeme (#22) / döşeme boşluğu (#23): ad, tür/malzeme, konum-boyut, alan
    h += fld(L('Ad', 'Name'), k, 'name', o.name || '', { type: 'text' });
    if (k === 'slab') {
      h += fld(L('Kaplama', 'Finish'), 'slab', 'floor', o.floor || 'none', { sel: floorOpts() }) + glassFld('slab', o)
        + fld(L('Renk', 'Color'), 'slab', 'color', o.color || '#cbd5e1', { type: 'color' })
        + fld(L('Kalınlık (cm)', 'Thickness (cm)'), 'slab', 't', o.t ?? 20, { min: 5, max: 100 })
        + fld(L('Kot farkı (cm)', 'Level offset (cm)'), 'slab', 'off', o.off || 0, { min: -200, max: 200 });
      if (o.color) h += `<div class="row"><button class="btn sm" data-act="slabcolreset">${L('↺ Varsayılan renk', '↺ Default colour')}</button></div>`;
    } else h += fld(L('Tür', 'Type'), 'void', 'type', o.type || 'stair', { sel: Object.fromEntries(Object.entries(VOID_TYPES).map(([id, [tr, en]]) => [id, L(tr, en)])) });
    if (n === 1) {
      const rb = bboxOf(k, o);
      if (rb) h += fld(L('Konum X (cm)', 'Position X (cm)'), k, 'rx', Math.round(rb.x0), { step: 10 })
        + fld(L('Konum Y (cm)', 'Position Y (cm)'), k, 'ry', Math.round(rb.y0), { step: 10 })
        + fld(L('Genişlik (cm)', 'Width (cm)'), k, 'rw', Math.round(rb.x1 - rb.x0), { min: 20, step: 10 })
        + fld(L('Derinlik (cm)', 'Depth (cm)'), k, 'rd', Math.round(rb.y1 - rb.y0), { min: 20, step: 10 });
      h += `<div class="stat"><span>${L('Alan', 'Area')}</span><b>${fmtArea(Math.abs(polyArea(o.pts)))}</b></div>`;
    }
    h += `<p class="muted" style="margin:6px 0">${k === 'slab'
      ? L('3B\'de duvar gerekmeden gerçek kalınlıkta döşeme olur; üstündeki mobilya döşemeye oturur.', 'In 3D this becomes a solid slab of real thickness, no walls needed; furniture on it sits on its top.')
      : L('3B\'de bu kattaki döşemede (alt katın tavanında) delik açar — merdiven üst kata çıkabilir.', 'In 3D this cuts a hole through this floor\'s slab (the ceiling below) so stairs can rise through it.')}</p>`;
    h += acts();
  } else if (k === 'dim') {
    h += `<div class="stat"><span>${L('Ölçü', 'Length')}</span><b>${fmtLen(dist(o.a, o.b))}</b></div>` + fld(L('Ofset (cm)', 'Offset (cm)'), 'dim', 'off', o.off ?? 40) + acts();
  } else if (k === 'section') {
    const on = ui.secCut === o.id;
    h += fld(L('Ad', 'Name'), 'section', 'name', o.name || '', { type: 'text' }) + `<div class="stat"><span>${L('Uzunluk', 'Length')}</span><b>${fmtLen(dist(o.a, o.b))}</b></div>`;
    h += `<div class="row"><button class="btn sm" data-act="secflip">${L('⇅ Yönü çevir', '⇅ Flip direction')}</button><button class="btn sm${on ? ' primary' : ''}" data-act="sec3d">${on ? L('✂ 3B kesiti kapat', '✂ Close 3D cut') : L('✂ 3B kesit', '✂ 3D cutaway')}</button><button class="btn sm" data-act="secdraw">${L('📐 Kesit çizimi', '📐 Section drawing')}</button></div>`;
    h += `<p class="muted" style="margin:0 0 6px">${L('Oklar bakış yönünü gösterir. Kesit tüm katları keser.', 'The arrows show the viewing direction. The section cuts through every floor.')}</p>` + acts();
  } else if (k === 'text') {
    h += fld(L('Metin', 'Text'), 'text', 'text', o.text, { type: 'text' }) + fld(L('Boyut', 'Size'), 'text', 'size', o.size, { min: 6, max: 200 }) + fld(L('Açı (°)', 'Angle (°)'), 'text', 'rot', o.rot || 0) + fld(L('Renk', 'Color'), 'text', 'color', o.color, { type: 'color' }) + acts();
  } else if (k === 'sketch') {
    h += fld(L('Kalem kalınlığı (cm)', 'Stroke width (cm)'), 'sketch', 'w', o.w || 4, { min: 0.5, max: 60, step: 0.5 }) + fld(L('Renk', 'Color'), 'sketch', 'color', o.color || '#1e293b', { type: 'color' });
    if (n === 1) h += `<div class="stat"><span>${L('Nokta sayısı', 'Points')}</span><b>${(o.pts || []).length}</b></div>`;
    h += acts();
  } else if (k === 'bg') {
    h += `<p class="muted" style="margin:0 0 8px">${L('Görseli tuvalde sürükleyerek taşıyabilir, köşelerinden boyutlandırabilirsiniz (Shift: serbest oran).', 'Drag the image on the canvas to reposition, or drag its corners to resize (Shift: free aspect ratio).')}</p>` + bgFields(true);
  }
  if (LAYER_ARR[k]) h += `<div class="row layer-row" title="${L('Çakışan nesnelerde çizim sırası (2B ve 3B)', 'Drawing order where objects overlap (2D and 3D)')}"><span class="muted">${L('Katman', 'Layer')}</span><button class="btn sm" data-act="layer" data-dir="front" title="${L('En öne getir', 'Bring to front')} (Ctrl+Shift+])">⤒</button><button class="btn sm" data-act="layer" data-dir="up" title="${L('Bir öne', 'Bring forward')} (Ctrl+])">↑</button><button class="btn sm" data-act="layer" data-dir="down" title="${L('Bir arkaya', 'Send backward')} (Ctrl+[)">↓</button><button class="btn sm" data-act="layer" data-dir="back" title="${L('En arkaya gönder', 'Send to back')} (Ctrl+Shift+[)">⤓</button></div>`;
  const gsAll = os.filter(x => GROUPABLE[x.kind]);
  if (gsAll.length >= 2) h += `<div class="row"><button class="btn sm primary" data-act="group">📦 ${L('Grupla', 'Group')}</button></div>`;
  if (gsAll.some(x => x.o.grp)) h += `<div class="row"><button class="btn sm" data-act="ungroup">📦✕ ${L('Grubu çöz', 'Ungroup')}</button></div>`;
  h += variantUIHtml();
  el.innerHTML = h;
}
// cam döşeme (#57): şeffaf / buzlu seçimi yalnızca zemin 'glass' iken görünür
// duvar alçalınca kapı / pencere duvarın üstünden taşmasın (#59): önce yükseklik, gerekirse denizlik düşer
function fitOpsToWall(f, w, top = 5) {
  let n = 0;
  for (const o of f.ops || []) {
    if (o.wall !== w.id || (+o.sill || 0) + o.h <= w.h - (o.type === 'window' ? top : 0)) continue;
    const room = w.h - (o.type === 'window' ? top : 0);
    o.h = Math.max(20, room - (+o.sill || 0));
    if ((+o.sill || 0) + o.h > room) o.sill = Math.max(0, room - o.h);
    n++;
  }
  return n;
}
function glassFld(k, o) {
  if (k !== 'floor' && o.floor !== 'glass') return '';
  return fld(L('Cam', 'Glass'), k, 'glass', o.glass === 'frosted' ? 'frosted' : 'clear', { sel: biOpts(GLASS_KINDS) });
}
function projectPanel() {
  const f = F(); let h = `<h3>⚙️ ${L('Proje', 'Project')}</h3>`;
  h += fld(L('Duvar kalınlığı (cm)', 'Wall thickness (cm)'), 'proj', 'wallT', P.wallT, { min: 3, max: 60 }) + fld(L('Duvar yüksekliği (cm)', 'Wall height (cm)'), 'proj', 'wallH', P.wallH, { min: 100, max: 600 });
  h += `<div class="row"><button class="btn sm" data-act="wallhall" title="${L('Tüm katlardaki mevcut duvarları bu yüksekliğe getirir; kat bazlı yükseklikler sıfırlanır', 'Sets every existing wall on every floor to this height; per-floor heights are cleared')}">⬆ ${L('Mevcut tüm duvarlara uygula', 'Apply to all existing walls')}</button></div>`;
  h += layersPanelHtml();
  h += `<h4>${L('Katmanlar', 'Layers')}</h4>` + [['bg', L('Arka plan görseli', 'Background image')], ['rooms', L('Odalar', 'Rooms')], ['walls', L('Duvarlar & açıklıklar', 'Walls & openings')], ['furn', L('Mobilya', 'Furniture')], ['dims', L('Ölçüler', 'Dimensions')], ['sketch', L('Serbest çizimler', 'Freehand sketches')]].map(([k, l]) => `<label class="f"><span>${l}</span><input type="checkbox" data-k="layer" data-p="${k}" ${layersVis[k] ? 'checked' : ''}></label>`).join('');
  if (P.floors.length > 1) {
    // Kat izdüşümü (issue #26): aç/kapa, referans kat, opaklık
    const opts = [['prev', L('Bir alt kat', 'Floor below')], ...P.floors.filter(x => x !== f).map(x => [x.id, x.name])];
    h += `<label class="f"><span>${L('Kat izdüşümü', 'Floor underlay')}</span><input type="checkbox" data-k="layer" data-p="underlay" ${layersVis.underlay ? 'checked' : ''}></label>`;
    if (layersVis.underlay) {
      h += `<label class="f"><span>${L('Referans kat', 'Reference floor')}</span><select data-k="ul" data-p="floor">${opts.map(([v, n]) => `<option value="${esc(v)}" ${underlay.floor === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
      h += `<label class="f"><span>${L('İzdüşüm opaklığı', 'Underlay opacity')} %</span><input type="range" min="10" max="50" step="1" data-k="ul" data-p="op" value="${Math.round(underlay.op * 100)}"></label>`;
      if (!underlayFloor()) h += `<p class="muted" style="margin:0 0 6px">${L('Zemin katın altında kat yok — başka bir referans kat seç.', 'There is no floor below the ground floor — pick another reference floor.')}</p>`;
    }
  }
  h += `<h4>${L('Arka plan görseli', 'Background image')}</h4>`;
  if (P.bg) h += bgFields(false);
  else h += `<p class="muted" style="margin:0 0 6px">${L('Kroki / mevcut plan görselini altlık olarak ekleyip üzerinden çizebilirsin.', 'Import a blueprint or floor plan image as an underlay to trace over.')}</p><div class="row"><button class="btn sm" data-act="bgadd">${L('🖼 Görsel ekle', '🖼 Add image')}</button></div>`;
  h += `<h4>${L('Kesit & görünüş', 'Sections & elevations')}</h4><div class="row"><button class="btn sm" data-act="archview">${L('📐 Görünüşler ve kesitler', '📐 Elevations & sections')}</button></div><p class="muted" style="margin:0 0 6px">${L('Dört cephe görünüşü kat kotlarıyla; kesit eklemek için 🔪 Kesit aracı (L).', 'Four facade elevations with floor levels; add a section with the 🔪 Section tool (L).')}</p>`;
  h += `<h4>${L('Kat yüksekliği', 'Floor height')} – ${esc(f.name)}</h4>` + fld(L('Duvar yüksekliği (cm)', 'Wall height (cm)'), 'floor', 'wallH', floorH(f), { min: FLOOR_H_MIN, max: FLOOR_H_MAX })
    + `<div class="row"><button class="btn sm" data-act="wallhfloor">⬆ ${L('Bu kattaki duvarlara uygula', 'Apply to walls on this floor')}</button>${f.wallH ? `<button class="btn sm" data-act="floorhreset" title="${L('Proje varsayılanına dön', 'Back to the project default')}">↺ ${P.wallH} cm</button>` : ''}</div>`
    + `<p class="muted" style="margin:0 0 6px">${L('Yeni duvarlar bu yüksekliği alır; 3B’de üst katlar bu yüksekliğe göre dizilir.', 'New walls get this height; in 3D the floors above stack on it.')}</p>`;
  h += `<h4>${L('Kat döşemesi', 'Floor slab')} – ${esc(f.name)}</h4>`;
  h += fld(L('Malzeme', 'Material'), 'floor', 'slabFloor', f.slabFloor || 'none', { sel: floorOpts() }) + (f.slabFloor === 'glass' ? glassFld('floor', f) : '')
    + fld(L('Döşeme rengi', 'Slab colour'), 'floor', 'slabColor', f.slabColor || '#cbd5e1', { type: 'color' });
  if (f.slabColor) h += `<div class="row"><button class="btn sm" data-act="slabreset">${L('↺ Varsayılan renk', '↺ Default colour')}</button></div>`;
  h += `<p class="muted" style="margin:0 0 6px">${L('3B görünümde odası olmayan alanlar (balkon, antre, teras) da bu malzemeyle kaplanır.', 'In 3D, areas without a room (balcony, hallway, terrace) are finished with this material too.')}</p>`;
  h += texturesPanelHtml();
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
  if (k === 'room') return p === 'color' || p === 'floor' || p === 'glass' || p === 'slabT';
  if (k === 'floor' || k === 'slab' || k === 'void') return p !== 'name';
  if (k === 'sketch') return p === 'w' || p === 'color';
  return false; // dim/text/bg/layer 3B'yi etkilemez
}
function applyProp(t, final) {
  const k = t.dataset.k, p = t.dataset.p; let v = t.type === 'checkbox' ? t.checked : t.value;
  if (t.type === 'number' || t.type === 'range') { v = parseFloat(v); if (isNaN(v)) return; }
  if (k === 'lyr') {
    const l = layerById(t.dataset.lid); if (!l) return;
    if (p === 'active') { if (t.checked) P.activeLayer = l.id; } else l[p] = v;
    if (final) { commit(); syncLayerUI(); } return;
  }
  if (k === 'sellayer') {
    if (!final || !v || !layerById(v)) return;
    for (const { o } of selObjs()) o.layer = v;
    sel = sel.filter(pickable); commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); return;
  }
  if (k === 'layer') { layersVis[p] = v; render(); if (p === 'underlay') renderProps(); return; }
  if (k === 'ul') { if (p === 'op') underlay.op = clamp(v / 100, 0.1, 0.5); else { underlay.floor = v; renderProps(); } render(); return; }
  if (k === 'tex') {
    const tm = texMeta(t.dataset.tid); if (!tm) return;
    if (p === 'name') { if (String(v).trim()) tm.name = String(v).trim().slice(0, 60); } else tm[p] = clamp(v, 1, 5000);
    render(); if (p !== 'name' && ui.view3d && T3) schedBuild3D(); if (final) { commit(); renderProps(); } return;
  }
  if (k === 'furn' && p === 'elev') v = clamp(+v || 0, 0, FURN_ELEV_MAX); // yerden yükseklik (#61)
  if (k === 'room' && p === 'slabT') v = clamp(v, 0, 200); // 0 = ince yüzey (eski görünüm) (#63)
  if (k === 'floor' && p === 'wallH') { const n = +v; if (!(n > 0)) return; const hv = clamp(n, FLOOR_H_MIN, FLOOR_H_MAX); if (hv === P.wallH) delete F().wallH; else F().wallH = hv; if (ui.view3d && T3) schedBuild3D(); if (final) { commit(); renderProps(); } return; }
  if (k === 'floor') { F()[p] = v; if (ui.view3d && T3) schedBuild3D(); if (final) { commit(); renderProps(); } return; }
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
      if (final) applyWallLength(o, v); // yazarken her tuşta değil: ara değerler kapıları sıkıştırmasın
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
    } else if (POLY_KINDS.has(k) && (p === 'rx' || p === 'ry' || p === 'rw' || p === 'rd')) {
      const rb = bboxOf(k, o); if (!rb) continue;
      // sürüklemeyle aynı davranış: X/Y kaydırınca odanın içeriği de kayar
      const inner = k === 'room' && (p === 'rx' || p === 'ry') ? { fn: furnInRoom(o), tx: F().texts.filter(q => pointInPoly(q, o.pts)) } : null;
      if (p === 'rx') { const dx = v - rb.x0; o.pts = o.pts.map(q => ({ x: Math.round(q.x + dx), y: q.y })); if (inner) { inner.fn.forEach(q => q.x += dx); inner.tx.forEach(q => q.x += dx); } }
      else if (p === 'ry') { const dy = v - rb.y0; o.pts = o.pts.map(q => ({ x: q.x, y: Math.round(q.y + dy) })); if (inner) { inner.fn.forEach(q => q.y += dy); inner.tx.forEach(q => q.y += dy); } }
      else if (p === 'rw') { const w0 = rb.x1 - rb.x0 || 1, sc = Math.max(20, v) / w0; o.pts = o.pts.map(q => ({ x: Math.round(rb.x0 + (q.x - rb.x0) * sc), y: q.y })); }
      else if (p === 'rd') { const h0 = rb.y1 - rb.y0 || 1, sc = Math.max(20, v) / h0; o.pts = o.pts.map(q => ({ x: q.x, y: Math.round(rb.y0 + (q.y - rb.y0) * sc) })); }
    } else if (k === 'slab' && p === 't') { o.t = clamp(v, 5, 100); }
    else if (k === 'slab' && p === 'off') { o.off = clamp(v, -200, 200); }
    else if (k === 'wall' && p === 'mul') { if (!final) continue; const m = clamp(Math.round(v), 20, 1000); delete o.mulN; if (m === MUL_DEF) delete o.mul; else o.mul = m; }
    else if (k === 'wall' && p === 'mulN') { if (!final) continue; o.mulN = clamp(Math.round(v), 0, 200); }
    else if (k === 'wall' && p === 'wt') { setWallType(o, v); }
    else if (k === 'op' && p === 'open') { o.open = v ? 90 : 0; }
    else if (k === 'op' && p === 'type') { o[p] = v; if (v === 'window' && o.sill === 0) { o.sill = 90; o.h = 120; } if (v !== 'window' && o.sill > 0) { o.sill = 0; o.h = 210; } }
    else o[p] = v;
  }
  render();
  if (ui.view3d && T3) {
    if (k === 'furn' && p === 'rot') os.forEach(x => moveFurn3D(x.o));
    else if (affects3D(k, p)) schedBuild3D();
  }
  if (final && k === 'op' && ['w', 'h', 'sill'].includes(p)) os.forEach(x => rememberOpSize(x.o));
  if (final) { commit(); if (['type', 'mat', 'floor', 'len', 'deg', 'pivot', 'wt', 'mul', 'mulN', 'stepN', 'stairType', 'railing', 'rampType'].includes(p) || (k === 'furn' && os.some(x => x.o.k === 'stairs' || x.o.k === 'ramp') && ['h', 'w', 'd'].includes(p)) || ((k === 'wall' || k === 'slab') && p === 'color')) renderProps(); }
}
$('#props').addEventListener('input', e => { if (e.target.dataset.p && e.target.type !== 'checkbox') applyProp(e.target, false); });
$('#props').addEventListener('change', e => { if (e.target.dataset.p) { applyProp(e.target, true); if (e.target.dataset.k === 'layer') renderProps(); } });
$('#props').addEventListener('click', e => {
  const s = e.target.closest('[data-sel]'); if (s) { sel = [s.dataset.sel]; refresh(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act, os = selObjs(), f = F();
  if (a === 'del') return deleteSel();
  if (a === 'savepreset') return savePresetSel();
  if (a === 'parts') { if (os.length === 1 && os[0].kind === 'furn') pbStart(os[0].o); return; }
  if (a === 'opcolreset') { os.forEach(x => { if (x.kind === 'op') { delete x.o.color; delete x.o.frameCol; } }); commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); return; }
  if (a === 'texadd') return addTextureFlow();
  if (a === 'texdel') { const t = texMeta(b.dataset.tid); if (t && confirm(L(`“${t.name}” dokusu silinsin mi? Bu dokuyu kullanan yüzeyler düz renge döner.`, `Delete texture “${t.name}”? Surfaces using it go back to a solid colour.`))) deleteTexture(t.id); return; }
  if (a === 'slabcolreset') { os.forEach(x => { if (x.kind === 'slab') x.o.color = null; }); commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); return; }
  if (a === 'dup') return paste(true);
  if (a === 'flipH' || a === 'flipV') return flipSel(a === 'flipH' ? 'h' : 'v');
  if (a === 'archview') return archModal('elev:south');
  if (a === 'wallhfloor' || a === 'wallhall' || a === 'floorhreset') {
    // duvar yüksekliğini topluca değiştir (#59)
    const fl = F(), w = os.find(x => x.kind === 'wall')?.o;
    if (a === 'floorhreset') { delete fl.wallH; commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); return; } // yalnızca varsayılan; duvarlar aynı kalır
    const H = a === 'wallhall' ? P.wallH : (w ? +w.h : floorH(fl)) || P.wallH;
    const floors = a === 'wallhall' ? P.floors : [fl];
    let n = 0;
    let nOp = 0;
    for (const x of floors) { for (const ww of x.walls) { if (ww.h !== H) n++; ww.h = H; nOp += fitOpsToWall(x, ww); } if (a === 'wallhall') delete x.wallH; }
    if (a === 'wallhfloor') { if (H === P.wallH) delete fl.wallH; else fl.wallH = H; }
    commit(); refresh(); if (ui.view3d && T3) schedBuild3D();
    toast(L(`${n} duvarın yüksekliği ${H} cm yapıldı`, `Updated the height of ${n} wall(s) to ${H} cm`) + (nOp ? L(` · ${nOp} açıklık sığdırıldı`, ` · ${nOp} opening(s) fitted`) : ''));
    return;
  }
  if (a === 'rampfit') { for (const { o } of os) if (o.k === 'ramp' && o.h > 0) o.d = Math.ceil(o.h / 0.08); commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); return; }
  if (a === 'stairfit') { for (const { o } of os) if (o.k === 'stairs') { o.h = curFloorH() + 20; o.stepN = Math.round(o.h / 17.5); } commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); return; }
  if (a.startsWith('lyr')) return layerAct(a, b.dataset.lid);
  const sco = os.length === 1 && os[0].kind === 'section' ? os[0].o : null;
  if (sco && a === 'secflip') { sco.dir = -(sco.dir || 1); commit(); refresh(); if (ui.secCut === sco.id) { applySecClip(); lookAtSection(sco); } return; }
  if (sco && a === 'secdraw') return archModal('sec:' + sco.id);
  if (sco && a === 'sec3d') {
    ui.secCut = ui.secCut === sco.id ? null : sco.id;
    if (ui.secCut && !ui.view3d) show3D(true); else applySecClip();
    if (ui.secCut && ui.view3d) lookAtSection(sco);
    renderProps(); return;
  }
  if (a === 'mirror') return setTool('mirror');
  if (a === 'scale') return scaleSelPrompt();
  if (a === 'bgadd') return $('#fileBg').click();
  if (a === 'bgsel') { if (P.bg) { P.bg.lock = false; sel = ['bg']; setTool('select'); refresh(); } return; }
  if (a === 'bgreset') { if (P.bg) { P.bg.x = 0; P.bg.y = 0; commit(); refresh(); } return; }
  if (a === 'bgremove') { P.bg = null; sel = sel.filter(x => x !== 'bg'); commit(); return refresh(); }
  if (a === 'calib') return setTool('calib');
  if (a === 'layer') { reorderSel(b.dataset.dir); return; }
  if (a === 'corner') {
    const ws = os.filter(x => x.kind === 'wall');
    if (ws.length !== 2 || !joinCorner(ws[0].o, ws[1].o)) { toast(L('Paralel duvarlar köşe yapamaz', 'Parallel walls cannot form a corner')); return; }
    commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); return;
  }
  if (a === 'splitx') {
    const w = os.find(x => x.kind === 'wall')?.o; if (!w) return;
    const cuts = wallCuts(w); let cur = w, base = 0;
    for (const c of cuts) { const nw = splitWallAt(cur, c - base); base = c; cur = nw; }
    commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); return;
  }
  if (a === 'slabreset') { f.slabColor = null; commit(); if (ui.view3d && T3) schedBuild3D(); return refresh(); }
  if (a === 'paint') {
    const ws = os.filter(x => x.kind === 'wall'); if (!ws.length) return;
    for (const { o } of ws) { if (b.dataset.c) o.color = b.dataset.c; else delete o.color; }
    commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); return;
  }
  if (a === 'group') return groupSel();
  if (a === 'ungroup') return ungroupSel();
  if (a === 'grpJoin') { const c = varContainer(); if (c && c.type === 'join') { joinGroup(c.rec, c.os); sel = groupMemberIds(c.rec.id); commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); toast(L('Gruba eklendi – düzenler korundu', 'Added to the group – layouts kept')); } return; }
  if (a === 'grpEdit') { const c = varContainer(); if (ui.grpEdit && (!c || c.type !== 'group' || c.rec.id === ui.grpEdit.id)) stopGrpEdit(); else if (c && c.type === 'group') startGrpEdit(c.rec); refresh(); return; }
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
    if (a === 'swapwd' && kind === 'furn') { [o.w, o.d] = [o.d, o.w]; if (o.k === 'poly' && o.pts) o.pts = o.pts.map(p => ({ x: p.y, y: p.x }));
      if (o.k === 'roof' && Array.isArray(o.faces)) { o.faces = o.faces.map(f => f.map(q => [q[1], q[0], q[2]]).reverse()); if (o.fbase) o.fbase = { w: o.fbase.d, d: o.fbase.w, h: o.fbase.h }; }
      if (Array.isArray(o.parts)) { o.parts = o.parts.map(q => Object.assign({}, q, { x: -q.y, y: q.x, rot: ((q.rot || 0) + 90) % 360 })); if (o.pbase) o.pbase = { w: o.pbase.d, d: o.pbase.w, h: o.pbase.h }; } }
    if (a === 'saveshape' && kind === 'furn') {
      const nm = prompt(L('Şekil adı:', 'Shape name:'), o.name || L('Şekil', 'Shape'));
      if (nm) {
        P.lib = P.lib || { shapes: [] }; P.lib.shapes = P.lib.shapes || [];
        P.lib.shapes.push({ id: uid(), name: nm, en: nm, k: o.k, pts: o.pts ? JSON.parse(JSON.stringify(o.pts)) : undefined, w: o.w, d: o.d, h: o.h, color: o.color, icon: o.k === 'round' ? '⬤' : '⬡', ...(Array.isArray(o.parts) && o.parts.length ? { parts: clonePlain(o.parts), pbase: clonePlain(o.pbase), partsV: PARTS_V } : {}) });
        commit(); buildLib(); toast(L(`“${nm}” kütüphaneye eklendi (⬡ Kütüphanem)`, `“${nm}” added to the library (⬡ My Library)`));
        return;
      }
    }
    if (a === 'opflip' && kind === 'op') o.flip = o.flip ? 0 : 1;
    if (a === 'opside' && kind === 'op') o.side = -(o.side || 1);
    if (a === 'redetect' && kind === 'room') { const c = polyCentroid(o.pts); const r = detectRoom(pointInPoly(c, o.pts) ? c : o.pts[0]); if (Array.isArray(r)) o.pts = r; else toast(L('Oda yeniden algılanamadı', 'Room could not be redetected')); }
    if (a === 'split' && kind === 'wall') {
      const m = { x: (o.a.x + o.b.x) / 2, y: (o.a.y + o.b.y) / 2 }, nw = mkWall(m, o.b); nw.t = o.t; nw.h = o.h; nw.wt = o.wt; if (o.color) nw.color = o.color; if (o.mul) nw.mul = o.mul; const L = wLen(o), old = o.b;
      o.b = m; f.walls.push(nw);
      f.ops.forEach(op => { if (op.wall === o.id && op.d > L / 2) { op.wall = nw.id; op.d -= L / 2; } });
    }
  }
  commit(); refresh();
});

/* ---------- Kütüphane ---------- */
/* ---------- Kütüphane ön ayarları (issue #42) ----------
   Seçili tek kapı/pencere ya da mobilya, adıyla P.lib.presets'e kopyalanır (kaydedilmiş şekillerle aynı
   proje kütüphanesi, "⬡ Kütüphanem" sekmesi). Ön ayar yalnızca yerleştirme anında değer kopyalar — bağlı
   tip değildir. Kapı açılış yönü (side) kaydedilir ama yerleştirirken imlecin tarafını izler (duvar yönü
   her duvarda farklıdır); S ile çevrilir. #41 alanları (mat, color, frameCol, glass) da taşınır. */
const PRESET_OP_EXTRA = ['mat', 'color', 'frameCol', 'glass'];
const PRESET_FURN_EXTRA = ['stepN', 'stairType', 'railing', 'rampType', 'pts', 'faces', 'fbase', 'parts', 'pbase', 'partsV', 'elev'];
const clonePlain = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
function presetFromObj(kind, o, name) {
  const p = { id: uid(), name: String(name).slice(0, 60), kind };
  if (kind === 'op') Object.assign(p, { type: o.type, w: o.w, h: o.h, sill: o.sill || 0, flip: o.flip ? 1 : 0, side: o.side < 0 ? -1 : 1 });
  else Object.assign(p, { type: o.type, k: o.k, icon: o.icon, w: o.w, d: o.d, h: o.h, color: o.color });
  const extra = {};
  for (const f of kind === 'op' ? PRESET_OP_EXTRA : PRESET_FURN_EXTRA) if (o[f] !== undefined && o[f] !== null) extra[f] = clonePlain(o[f]);
  if (Object.keys(extra).length) p.extra = extra;
  return p;
}
// ön ayar → startPlace() tanımı; mkOp / mkFurn def.extra'yı nesneye kopyalar
function presetDef(p) {
  if (p.kind === 'op') {
    const base = Object.values(OPDEF).find(d => opType(d.id) === p.type) || OPDEF.door;
    return { id: base.id, name: p.name, en: p.name, icon: base.icon, w: p.w, h: p.h, sill: p.sill || 0, flip: p.flip || 0, extra: p.extra, preset: p.id };
  }
  const cat = BYID[p.type];
  return { id: p.type, name: p.name, en: p.name, icon: p.icon || (cat && cat.icon) || '▭', k: p.k || (cat && cat.k) || 'rect', w: p.w, d: p.d, h: p.h, color: p.color, pts: p.extra && p.extra.pts, extra: p.extra, preset: p.id };
}
// kartta görünen ölçü: 85×210 · 100×70 · denizlik 110 · 200×90
function presetSize(p) {
  if (p.kind === 'op') return Math.round(p.w) + '×' + Math.round(p.h) + (p.sill > 0 ? ' · ' + L('denizlik', 'sill') + ' ' + Math.round(p.sill) : '');
  return Math.round(p.w) + '×' + Math.round(p.d);
}
function savePresetSel() {
  const os = selObjs(); if (os.length !== 1 || (os[0].kind !== 'op' && os[0].kind !== 'furn')) return;
  const { kind, o } = os[0];
  const def0 = kind === 'op' ? (OPENINGS.find(d => opType(d.id) === o.type) || OPDEF.door) : (BYID[o.type] || o);
  const sug = kind === 'op' ? itemName(def0) + ' ' + Math.round(o.w) + '×' + Math.round(o.h) : (o.label || o.name || itemName(def0));
  const nm = (prompt(L('Ön ayar adı:', 'Preset name:'), sug) || '').trim(); if (!nm) return;
  const p = presetFromObj(kind, o, nm);
  P.lib.presets = P.lib.presets || []; P.lib.presets.push(p);
  commit(); ui.cat = LIBCATS.length - 1; ui.q = ''; $('#search').value = ''; buildLib(); refresh();
  toast(L(`“${nm}” kütüphaneye eklendi (⬡ Kütüphanem)`, `“${nm}” added to the library (⬡ My Library)`));
}
// Son kullanılan ölçü (oturumluk): bir kapıyı 85 cm yapınca sonraki kapı da 85 cm gelir.
// Kaynak tanım, bu oturumda yerleştirilen açıklıklar için ui.opSrc'den; diğerlerinde tipten (pencerede üç
// farklı hazır ölçü olduğu için tipten tahmin edilmez).
ui.opLast = {}; ui.opSrc = {};
const opSrcOf = o => ui.opSrc[o.id] || (o.type !== 'window' && OPDEF[o.type] ? o.type : null);
function rememberOpSize(o) { const s = opSrcOf(o); if (s) { ui.opLast[s] = { w: o.w, h: o.h, sill: o.sill }; if (ui.cat === 0 || ui.q) buildLib(); } }
const opDefLast = def => ui.opLast[def.id] ? { ...def, ...ui.opLast[def.id] } : def;
const LIBCATS = ['Kapı & Pencere', ...CATS, '⬡ Kütüphanem'];
const LIBCATS_EN = ['Doors & Windows', ...CATS_EN, '⬡ My Library'];
function buildLib() {
  const cats = isEN() ? LIBCATS_EN : LIBCATS;
  $('#cats').innerHTML = cats.map((c, i) => `<button class="chip ${i === ui.cat && !ui.q ? 'on' : ''}" data-cat="${i}">${c}</button>`).join('');
  const q = ui.q.toLowerCase(); let items = '';
  const card = (type, d, sz) => `<button class="item" data-type="${type}" data-id="${d.id}"><div class="ic">${d.icon || '▭'}</div><div>${itemName(d)}</div><div class="sz">${sz}</div></button>`;
  const shapeCard = d => `<button class="item" data-type="def" data-id="${d.id}"><div class="ic">${d.icon || '⬡'}</div><div>${esc(itemName(d))}</div><div class="sz">${Math.round(d.w)}×${Math.round(d.d)} cm</div><span class="delsh" data-delsh="${d.id}" title="${L('Kütüphaneden sil', 'Remove from library')}">✕</span></button>`;
  const presetCard = p => { const d = presetDef(p); return `<button class="item" data-type="pre" data-id="${p.id}" title="${esc(p.name)}"><div class="ic">${d.icon || '▭'}</div><div>${esc(p.name)}</div><div class="sz">${presetSize(p)}</div><span class="renpre" data-renpre="${p.id}" title="${L('Yeniden adlandır', 'Rename')}">✎</span><span class="delsh" data-delpre="${p.id}" title="${L('Kütüphaneden sil', 'Remove from library')}">✕</span></button>`; };
  const matches = d => d.name.toLowerCase().includes(q) || (d.en && d.en.toLowerCase().includes(q));
  const shapes = P && P.lib && P.lib.shapes || [], presets = P && P.lib && P.lib.presets || [];
  const opCard = o => card('op', o, opDefLast(o).w + ' cm'); // son kullanılan ölçü kartta da görünür
  if (q) {
    items += presets.filter(p => p.name.toLowerCase().includes(q)).map(presetCard).join('');
    items += OPENINGS.filter(matches).map(opCard).join('');
    items += CATALOG.filter(matches).map(c => card('furn', c, `${c.w}×${c.d}`)).join('');
    items += shapes.filter(matches).map(shapeCard).join('');
  } else if (ui.cat === 0) items = OPENINGS.map(opCard).join('') + presets.filter(p => p.kind === 'op').map(presetCard).join('');
  else if (ui.cat === LIBCATS.length - 1) items = `<button class="item fs-new" data-fsnew="1" title="${L('Kendi mobilyanı parçalardan tasarla', 'Design your own furniture from parts')}"><div class="ic">🧩</div><div>${L('Mobilya oluştur', 'Create furniture')}</div><div class="sz">${L('stüdyo', 'studio')}</div></button>` + presets.map(presetCard).join('') + shapes.map(shapeCard).join('')
    + (presets.length || shapes.length ? '' : `<p class="muted">${L('Bir kapı, pencere ya da mobilyayı seçip “💾 Kütüphaneye kaydet” ile buraya ekle.', 'Select a door, window or furniture item and use “💾 Save to library” to add it here.')}</p>`);
  else items = CATALOG.filter(c => c.cat === ui.cat - 1).map(c => card('furn', c, `${c.w}×${c.d}`)).join('');
  $('#items').innerHTML = items || `<p class="muted">${L('Sonuç yok', 'No results')}</p>`;
  updateTools();
}
$('#cats').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { ui.cat = +b.dataset.cat; ui.q = ''; $('#search').value = ''; buildLib(); } });
$('#search').addEventListener('input', e => { ui.q = e.target.value; buildLib(); });
$('#items').addEventListener('click', e => {
  if (e.target.closest('[data-fsnew]')) { fsNew(); return; }
  const x = e.target.closest('[data-delsh]');
  if (x) {
    const i = (P.lib.shapes || []).findIndex(s => s.id === x.dataset.delsh);
    if (i >= 0 && confirm(L(`“${itemName(P.lib.shapes[i])}” kütüphaneden silinsin mi?`, `Delete “${itemName(P.lib.shapes[i])}” from the library?`))) { P.lib.shapes.splice(i, 1); commit(); buildLib(); toast(L('Şekil kütüphaneden silindi', 'Shape removed from library')); }
    return;
  }
  const dp = e.target.closest('[data-delpre]'), rp = e.target.closest('[data-renpre]');
  if (dp || rp) {
    const ps = P.lib.presets || [], i = ps.findIndex(p => p.id === (dp || rp).dataset[dp ? 'delpre' : 'renpre']); if (i < 0) return;
    if (dp) { if (confirm(L(`“${ps[i].name}” kütüphaneden silinsin mi?`, `Delete “${ps[i].name}” from the library?`))) { ps.splice(i, 1); if (placing && placing.def.preset === dp.dataset.delpre) setTool('select'); commit(); buildLib(); toast(L('Ön ayar silindi (Ctrl+Z ile geri al)', 'Preset removed (Ctrl+Z to undo)')); } }
    else { const nm = (prompt(L('Yeni ad:', 'New name:'), ps[i].name) || '').trim(); if (nm) { ps[i].name = nm.slice(0, 60); commit(); buildLib(); } }
    return;
  }
  const b = e.target.closest('.item'); if (!b) return;
  if (b.dataset.type === 'pre') { const p = (P.lib.presets || []).find(x => x.id === b.dataset.id); if (p) startPlace(p.kind, presetDef(p)); return; }
  let type = b.dataset.type, def = type === 'op' ? opDefLast(OPDEF[b.dataset.id]) : type === 'def' ? (P.lib.shapes || []).find(s => s.id === b.dataset.id) : BYID[b.dataset.id];
  if (type === 'def') { if (!def) return; type = 'furn'; def = { id: 'sh_' + def.id, name: def.name, en: def.en, k: def.k, pts: def.pts, w: def.w, d: def.d, h: def.h, color: def.color, icon: def.icon, extra: def.parts ? { parts: def.parts, pbase: def.pbase, partsV: def.partsV } : undefined }; }
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
function refresh() { if (ui.lenTyped && !(sel.length === 1 && find(sel[0])?.kind === 'wall')) ui.lenTyped = ''; render(); renderProps(); renderFloors(); updateTools(); syncLayerUI(); }

/* ---------- Kopyala / yapıştır ---------- */
let pasteN = 0;
const GROUPABLE = { wall: 1, room: 1, furn: 1, dim: 1, text: 1 };
function groupSel() {
  const gs = selObjs().filter(x => GROUPABLE[x.kind]);
  if (gs.length < 2) { toast(L('Gruplamak için en az 2 nesne seçin', 'Select at least 2 objects to group')); return; }
  const grps = [...new Set(gs.map(x => x.o.grp).filter(Boolean))];
  const g = grps.length === 1 ? grps[0] : uid(); // tek grup seçiliyse onu genişlet (düzenler korunur)
  const f = F(); f.groups = f.groups || [];
  const old = grps.length === 1 && f.groups.find(x => x.id === g);
  if (old) joinGroup(old, gs.filter(x => !x.o.grp)); // yeni üyeler diğer düzenlere de mevcut konumlarıyla girer
  gs.forEach(({ o }) => o.grp = g);
  if (!f.groups.some(x => x.id === g)) f.groups.push({ id: g, vars: [], idx: 0 });
  pruneGroups();
  commit(); refresh();
  toast(L('Seçili nesneler gruplandı – birlikte taşınırlar', 'Selected objects grouped – they move together'));
}
/* ---------- Grup üyelerini düzenleme (gruba duvar/nesne ekle, düzene göre tek tek konumla) ---------- */
function joinGroup(rec, objs) {
  // var olan gruba nesne ekle: her düzen yeni üyenin mevcut pozunu alır, sonra düzen başına ayrı konumlanabilir
  objs = objs.filter(x => GROUPABLE[x.kind]); if (!objs.length) return 0;
  dropPoseOrphans(objs.map(x => x.o.id)); // başka grubun kaydında kalmasın (ilk-gelen sahiplik)
  for (const { kind, o } of objs) {
    o.grp = rec.id;
    const p = snapPose(kind, o);
    for (const v of rec.vars || []) {
      if (v.poses && !v.poses[o.id]) v.poses[o.id] = clonePoses(p);
      if (v.base && !v.base[o.id]) v.base[o.id] = clonePoses(p);
    }
  }
  return objs.length;
}
function grpEditing(o) {
  const g = ui.grpEdit;
  return !!(o && o.grp && g && g.id === o.grp && F() && g.fl === F().id);
}
function floorIds() { const f = F(), s = new Set(); for (const arr in KINDS) for (const o of f[arr] || []) s.add(o.id); return s; }
function startGrpEdit(rec) {
  ui.grpEdit = { id: rec.id, fl: F().id, known: floorIds() };
  toast(L('Grup düzenleme: üyeye tıklayıp tek başına taşıyın; çizdiğiniz yeni duvar/nesneler bu gruba katılır. Bitirmek için ✓ veya Esc.', 'Editing group: click a member to move it on its own; new walls/objects you draw join this group. Press ✓ Done or Esc to finish.'));
}
function stopGrpEdit() {
  const g = ui.grpEdit; if (!g) return;
  ui.grpEdit = null;
  const mids = F() && F().id === g.fl ? groupMemberIds(g.id) : [];
  if (mids.length) sel = mids;
}
function grpEditAbsorb() {
  const g = ui.grpEdit; if (!g || _switchingVar || !P) return;
  const f = F(); if (!f || f.id !== g.fl) return;
  const rec = (f.groups || []).find(x => x.id === g.id);
  if (!rec || !groupMemberIds(g.id).length) { ui.grpEdit = null; return; }
  const fresh = [];
  for (const arr in KINDS) {
    const kind = KINDS[arr];
    for (const o of f[arr] || []) {
      if (g.known.has(o.id)) continue;
      g.known.add(o.id);
      if (GROUPABLE[kind] && !o.grp) fresh.push({ kind, o });
    }
  }
  if (joinGroup(rec, fresh)) toast(L(`${fresh.length} yeni nesne gruba eklendi`, `${fresh.length} new object(s) added to the group`));
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
  if (kind === 'room') return { pts: o.pts.map(p => ({ ...p })), floor: o.floor || 'none', color: o.color, glass: o.glass || null, slabT: roomSlabT(o) }; // kaplama + renk de düzene ait (#66)
  if (PTS_KINDS.has(kind)) return { pts: o.pts.map(p => ({ ...p })) };
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
      if (p.floor != null) o.floor = p.floor; // eski pozlarda yok: dokunulmaz (#66)
      if (p.color != null) o.color = p.color;
      if (p.glass !== undefined) { if (p.glass) o.glass = p.glass; else delete o.glass; }
      if (p.slabT != null) o.slabT = p.slabT;
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
  if (gs.length === 1 && groupable.every(x => !x.o.grp || x.o.grp === gs[0]) && groupable.some(x => !x.o.grp)) {
    const rec = (F().groups || []).find(g => g.id === gs[0]);
    if (rec) return { type: 'join', rec, os: groupable.filter(x => !x.o.grp) }; // grup + gruplanmamış nesneler: gruba ekle
  }
  if (groupable.length >= 1) return { type: 'potential', os: groupable };
  return null;
}
function varAction(a, targetIdx) {
  let c = varContainer(); if (!c || c.type === 'join') return;
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
function grpEditHtml(c) {
  if (!c || c.type !== 'group') return '';
  const on = ui.grpEdit && ui.grpEdit.id === c.rec.id && ui.grpEdit.fl === F().id;
  return on
    ? `<div class="row"><button class="btn sm primary" data-act="grpEdit">✓ ${L('Düzenlemeyi bitir', 'Done editing')}</button></div><p class="muted" style="margin:0 0 6px">✏️ ${L('Üyeye tıklayın: tek başına seçilir, taşınır, boyutlanır (aktif düzene kaydedilir). Yeni çizdiğiniz duvar ve nesneler bu gruba katılır. Düzen değiştirmek için aşağıdaki düğmeleri kullanın.', 'Click a member to select, move or resize it on its own (saved to the active layout). New walls and objects you draw join this group. Switch layouts with the buttons below.')}</p>`
    : `<div class="row"><button class="btn sm" data-act="grpEdit" title="${L('Gruba duvar/nesne ekleyin veya üyeleri düzen başına tek tek konumlayın', 'Add walls/objects to the group, or place members one by one per layout')}">✏️ ${L('Üyeleri düzenle', 'Edit members')}</button></div>`;
}
function variantUIHtml() {
  const c = varContainer(); if (!c) return '';
  if (c.type === 'join') return `<div class="row"><button class="btn sm primary" data-act="grpJoin">➕ ${L('Gruba ekle', 'Add to group')} (${c.os.length})</button></div><p class="muted" style="margin:0 0 6px">${L('Seçili nesneler mevcut gruba katılır; kayıtlı düzenler korunur.', 'The selected objects join the existing group; saved layouts are kept.')}</p>`;
  if (c.type === 'group' && !(c.rec.vars || []).length) return grpEditHtml(c) + `<div class="row"><button class="btn sm primary" data-act="varInit">🔄 ${L('Ayarlanabilir Yap', 'Make Adjustable')}</button></div><p class="muted" style="margin:0 0 6px">${L('Mevcut düzeni 1a olarak kaydeder; sonraki düzenleri ➕ ile ekleyin, kanvasta tıklayarak geçin.', 'Saves the current layout as 1a; add more with ➕, cycle by clicking on canvas.')}</p>`;
  const vars = c.type === 'room' ? (c.o.vars || []) : c.type === 'group' ? (c.rec.vars || []) : [];
  if (!vars.length) return `<div class="row"><button class="btn sm primary" data-act="varInit">🔄 ${L('Ayarlanabilir Yap', 'Make Adjustable')}</button></div><p class="muted" style="margin:0 0 6px">${L('Mevcut düzeni 1a olarak kaydeder; sonraki düzenleri ➕ ile ekleyin, kanvasta tıklayarak geçin.', 'Saves the current layout as 1a; add more with ➕, cycle by clicking on canvas.')}</p>`;
  const idx = clamp(c.type === 'room' ? (c.o.vIdx ?? 0) : (c.rec.idx ?? 0), 0, vars.length - 1);
  const cur = vars[idx];
  const chips = vars.map((v, i) => `<button class="btn sm ${i === idx ? 'primary' : ''}" data-act="varGo" data-idx="${i}" title="${L('Bu düzene geç', 'Switch to this layout')}">${i === idx ? '● ' : '○ '}${esc(v.label)}</button>`).join('');
  return grpEditHtml(c) + `<p style="margin:8px 0 4px"><b>🔄 ${L('Düzenler', 'Layouts')}</b> <span class="muted">— ${esc(cur.label)} (${idx + 1}/${vars.length})</span></p>
  <div class="row" style="flex-wrap:wrap;gap:4px;margin-bottom:6px">${chips}</div>
  <div class="row"><button class="btn sm" data-act="varSave" title="${L('Mevcut konumu/boyutu bu düzene kaydet', 'Save current position/size to this layout')}">💾 ${L('Kaydet', 'Save')}</button><button class="btn sm primary" data-act="varNew">➕ ${L('Yeni', 'New')}</button>${vars.length >= 2 ? `<button class="btn sm" data-act="varNext" title="${L('Sıradaki düzene geç', 'Cycle to next layout')}">↻</button>` : ''}<button class="btn sm" data-act="varDel" style="color:var(--danger)" title="${L('Bu düzeni sil', 'Delete this layout')}">🗑</button></div>
  <p class="muted" style="margin:4px 0 6px">${L('Aktif düzendeki konum ve boyut değişiklikleri otomatik kaydedilir. Tuvalde "👆 Tıkla" göstergesine tıklayarak düzenler arasında geçin.', 'Position & size changes in the active layout are auto-saved. Click the "👆 Click me" badge on canvas to cycle layouts.')}</p>`;
}
function copySel() { ui.clip = selObjs().map(({ kind, o }) => ({ kind, o: JSON.parse(JSON.stringify(o)) })); pasteN = 0; if (ui.clip.length) toast(ui.clip.length + L(' nesne kopyalandı', ' object(s) copied')); }
function paste(fromSel, at = null) {
  if (fromSel) copySel();
  const items = ui.clip; if (!items || !items.length) return;
  if (at == null) pasteN++;
  const off = at == null ? 40 * pasteN : at, f = F(), idm = {}, gmap = {}, ids = [];
  const mv = p => ({ x: p.x + off, y: p.y + off });
  for (const { kind, o } of items) {
    if (kind === 'op') continue;
    const n = JSON.parse(JSON.stringify(o)); idm[n.id] = uid(); n.id = idm[n.id]; ids.push(n.id);
    if (n.grp) n.grp = gmap[n.grp] || (gmap[n.grp] = uid()); // yapıştırılan kopya yeni grubuna girer
    if (kind === 'wall') { n.a = mv(n.a); n.b = mv(n.b); f.walls.push(n); }
    else if (kind === 'dim') { n.a = mv(n.a); n.b = mv(n.b); f.dims.push(n); }
    else if (kind === 'section') { n.a = mv(n.a); n.b = mv(n.b); n.name = nextSectionName(); (f.sections = f.sections || []).push(n); }
    else if (kind === 'room') { n.pts = n.pts.map(mv); delete n.vars; delete n.vIdx; f.rooms.push(n); }
    else if (kind === 'sketch') { n.pts = n.pts.map(mv); f.sketches.push(n); }
    else if (kind === 'slab' || kind === 'void') { n.pts = n.pts.map(mv); f[kind === 'slab' ? 'slabs' : 'voids'].push(n); }
    else if (kind === 'furn') { n.x += off; n.y += off; f.furn.push(n); }
    else if (kind === 'text') { n.x += off; n.y += off; f.texts.push(n); }
  }
  for (const { kind, o } of items) if (kind === 'op' && idm[o.wall]) { const n = JSON.parse(JSON.stringify(o)); n.id = uid(); n.wall = idm[o.wall]; f.ops.push(n); ids.push(n.id); }
  sel = ids; if (at != null) return; // yerinde kopya (aynalama): çağıran commit eder
  commit(); refresh();
  if (ui.view3d && T3) schedBuild3D();
}

/* ---------- Klavye ---------- */
const keys3D = new Set();
window.addEventListener('blur', () => keys3D.clear());
/* ---------- Komut satırı (issue #43) ----------
   ":" (iki nokta) açılır; araçları ve mevcut eylemleri Türkçe ya da İngilizce adıyla bulup çalıştırır.
   Liste yalnızca var olan eylemlerden oluşur ve her satırda kısayol tuşu görünür. Arama büyük/küçük harf
   ve aksan duyarsızdır (ı/İ/I → i, ş → s …). in3d: 3B görünümdeyken olduğu yerde çalışır; diğerleri önce
   2B'ye döner (araçlar setTool() ile zaten döner). Komut satırı bir girdi kutusu olduğundan, rakamla duvar
   uzunluğu ve tek tuş kısayolları hiç etkilenmez. */
const foldText = s => String(s || '').replace(/[İIı]/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function cmdList() {
  const act = (id, icon, tr, en, key, run, in3d = false, alias = '') => ({ id, icon, tr, en, key, run, in3d, alias });
  const tools = TOOLS.filter(Boolean).map(([id, icon, tr, key, en]) => act('tool:' + id, icon, tr, en, key, () => setTool(id), false, (HINTS_EN[id] || '').split(':')[0]));
  return tools.concat([
    act('undo', '↶', 'Geri al', 'Undo', 'Ctrl+Z', undo, true),
    act('redo', '↷', 'Yinele', 'Redo', 'Ctrl+Y', redo, true),
    act('2d', '▭', '2B görünüm', '2D view', 'Esc (3B)', () => show3D(false), true, 'plan'),
    act('3d', '🧊', '3B görünüm', '3D view', '', () => show3D(true), true, 'model'),
    act('fit', '⤢', 'Sığdır', 'Zoom to fit', '0', () => ui.view3d ? set3DCam('fit') : fit(), true, 'zoom extents yakınlaştır'),
    act('iso', '◇', 'İzometrik görünüş (3B)', 'Isometric view (3D)', '', () => { if (!ui.view3d) show3D(true); set3DCam('iso'); }, true, 'axonometric aksonometrik isometric parallel paralel'),
    act('proj', '▱', 'Perspektif / paralel izdüşüm (3B)', 'Perspective / parallel projection (3D)', '', () => { if (!ui.view3d) show3D(true); if (T3) setProjection(!(T3.ortho || T3.orthoAfterWalk)); }, true, 'orthographic ortografik perspective camera kamera'),
    act('save', '💾', 'Kaydet', 'Save project', 'Ctrl+S', saveBrowser, true),
    act('print', '🖨', 'Yazdır / çıktı', 'Print / plot', '', exportPrint, true, 'pdf paper kağıt'),
    act('png', '🖼', 'PNG dışa aktar', 'Export PNG', '', () => $('#bPng').click(), true, 'image görsel render'),
    act('svg', '⬇', 'SVG dışa aktar', 'Export SVG', '', () => $('#bSvg').click(), false),
    act('json', '⬇', 'JSON indir', 'Download JSON', '', () => downloadJson(P), true, 'export backup yedek'),
    act('open', '📂', 'Dosya aç (JSON / IFC)', 'Open file (JSON / IFC)', '', () => $('#fileOpen').click(), true, 'import ifc revit archicad bim içe aktar'),
    act('new', '＋', 'Yeni proje', 'New project', '', templatesModal, true, 'template şablon'),
    act('furnstudio', '🧩', 'Mobilya stüdyosu: yeni mobilya', 'Furniture studio: new furniture', '', () => fsNew(), false, 'create furniture builder editor parts mobilya oluştur parça'),
    act('flipH', '⇋', 'Yatay aynala', 'Flip horizontal', 'Shift+H', () => flipSel('h'), false, 'mirror ayna'),
    act('flipV', '⇵', 'Dikey aynala', 'Flip vertical', 'Shift+V', () => flipSel('v'), false, 'mirror ayna'),
    act('scale', '⤡', 'Ölçekle', 'Scale', '', scaleSelPrompt, false, 'resize boyutlandır'),
    act('selall', '⬚', 'Tümünü seç', 'Select all', 'Ctrl+A', () => { const f = F(); sel = []; for (const a in KINDS) f[a].forEach(o => { if (pickable(o.id)) sel.push(o.id); }); refresh(); }, false),
    act('del', '🗑', 'Seçileni sil', 'Delete selection', 'Del', deleteSel, true),
    act('dup', '⧉', 'Çoğalt', 'Duplicate', 'Ctrl+D', () => paste(true), false, 'copy kopyala'),
    act('group', '⛓', 'Grupla', 'Group', 'Ctrl+G', groupSel, false),
    act('ungroup', '⛓', 'Grubu çöz', 'Ungroup', 'Ctrl+Shift+G', ungroupSel, false),
    act('elev', '📐', 'Görünüşler ve kesitler', 'Elevations & sections', '', () => archModal('elev:south'), true, 'facade cephe drawing çizim'),
    act('layers', '🗂', 'Katmanlar', 'Layers', '', () => { sel = []; refresh(); const h = [...document.querySelectorAll('#props h4')].find(x => /Çizim katmanları|Drawing layers/.test(x.textContent)); if (h) h.scrollIntoView({ block: 'start' }); }, false, 'layer'),
    act('addlayer', '🗂', 'Katman ekle', 'Add layer', '', () => layerAct('lyradd'), false, 'new layer yeni'),
    act('studio', '🎨', 'Render stüdyosu', 'Render studio', '', () => openRenderStudio(), true, '3d image'),
    act('snap', '🧲', 'Yakalama aç/kapa', 'Toggle snap', 'G', () => $('#cSnap').click(), true, 'osnap'),
    act('theme', '🌓', 'Tema değiştir', 'Toggle theme', '', () => $('#bTheme').click(), true, 'dark light koyu açık'),
    act('lang', '🌐', 'Dil değiştir', 'Switch language', '', () => $('#bLang').click(), true, 'turkish english türkçe ingilizce'),
    act('help', '❓', 'Yardım', 'Help', '', helpModal, true, 'shortcuts kısayollar'),
  ]);
}
// sonuçlar: ad başı > kelime başı > içerir; her sorgu kelimesi bir yerde geçmeli
function cmdFilter(cmds, q) {
  const qs = foldText(q).trim().split(/\s+/).filter(Boolean);
  if (!qs.length) return cmds.slice();
  const out = [];
  cmds.forEach((c, i) => {
    const names = [foldText(c.en), foldText(c.tr)], hay = names.join(' ') + ' ' + foldText(c.alias) + ' ' + foldText(c.key);
    if (!qs.every(t => hay.includes(t))) return;
    const q0 = qs.join(' ');
    const sc = names.some(n => n.startsWith(q0)) ? 0 : names.some(n => (' ' + n).includes(' ' + qs[0])) ? 1 : foldText(c.key) === q0 ? 1 : 2;
    out.push({ c, sc, i });
  });
  return out.sort((a, b) => a.sc - b.sc || a.i - b.i).map(x => x.c);
}
function runCmd(c) {
  closeCmdPalette();
  if (!c) return;
  if (ui.view3d && !c.in3d) show3D(false);
  c.run();
}
function closeCmdPalette() { const el = document.getElementById('cmdPal'); if (el) el.remove(); }
function openCmdPalette() {
  closeCmdPalette();
  const cmds = cmdList(), box = document.createElement('div');
  box.id = 'cmdPal'; box.className = 'cmdpal';
  box.innerHTML = `<input id="cmdIn" type="text" autocomplete="off" spellcheck="false" placeholder="${L('Komut ara… (ör. duvar, aynala, yazdır)', 'Type a command… (e.g. wall, mirror, print)')}"><div class="cmdlist" role="listbox"></div><div class="cmdfoot">${L('↑↓ / Tab: seç • Enter: çalıştır • Esc: kapat', '↑↓ / Tab: move • Enter: run • Esc: close')}</div>`;
  document.body.appendChild(box);
  const inp = box.querySelector('input'), list = box.querySelector('.cmdlist');
  let hits = cmds, cur = 0;
  const paint = () => {
    list.innerHTML = hits.length ? hits.map((c, i) => `<div class="cmditem${i === cur ? ' on' : ''}" data-ci="${i}" role="option"><span class="ci">${c.icon}</span><span class="cn">${esc(L(c.tr, c.en))}<small>${esc(L(c.en, c.tr))}</small></span>${c.key ? `<kbd>${esc(c.key)}</kbd>` : ''}</div>`).join('')
      : `<div class="cmdnone">${L('Eşleşen komut yok', 'No matching command')}</div>`;
    const on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  };
  inp.addEventListener('input', () => { hits = cmdFilter(cmds, inp.value); cur = 0; paint(); });
  inp.addEventListener('keydown', ev => {
    ev.stopPropagation(); // tek tuş kısayolları ve 3B yürüyüş tuşları komut yazarken çalışmasın
    const n = hits.length;
    if (ev.key === 'Escape') { ev.preventDefault(); closeCmdPalette(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); runCmd(hits[cur]); }
    else if (ev.key === 'ArrowDown' || (ev.key === 'Tab' && !ev.shiftKey)) { ev.preventDefault(); if (n) { cur = (cur + 1) % n; paint(); } }
    else if (ev.key === 'ArrowUp' || (ev.key === 'Tab' && ev.shiftKey)) { ev.preventDefault(); if (n) { cur = (cur - 1 + n) % n; paint(); } }
  });
  list.addEventListener('mousedown', ev => { const it = ev.target.closest('[data-ci]'); if (it) { ev.preventDefault(); runCmd(hits[+it.dataset.ci]); } });
  inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp) closeCmdPalette(); }, 120));
  paint(); inp.focus();
}
window.addEventListener('keydown', e => {
  const tag = e.target.tagName, typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || e.target.isContentEditable;
  if (typing) { if (e.key === 'Escape') e.target.blur(); return; }
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (e.key === 'Escape' && document.getElementById('ctxMenu')) { closeCtxMenu(); return; }
  if (ui.modal === 'parts') { fsKey(e); return; } // mobilya stüdyosu açıkken tuşlar stüdyonun: Delete / Ctrl+Z arkadaki plana gitmez
  // komut satırı (#43): ":" — 2B'de de 3B'de de; açık bir pencere (modal) varken değil
  if (e.key === ':' && !ctrl && !e.altKey && $('#modalbg').style.display !== 'flex') { e.preventDefault(); keys3D.clear(); openCmdPalette(); return; }
  if (ui.view3d) {
    if (e.key === 'Escape') { if (T3 && T3.walk) exitWalk(true); else show3D(false); return; }
    // Editing shortcuts must keep working while the user is looking at the 3D
    // model: undo/redo used to fall through to the early return below, so the
    // most-pressed key in the app silently did nothing in 3D. restore() already
    // schedules a rebuild, so the model follows the undo.
    if (ctrl) {
      if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (k === 'y') { e.preventDefault(); redo(); return; }
      if (k === 's') { e.preventDefault(); saveBrowser(); return; }
      if (k === 'a') {
        e.preventDefault(); const f = F(); sel = [];
        for (const a in KINDS) f[a].forEach(o => sel.push(o.id));
        refresh(); refreshSel3D(); return;
      }
      if (k === 'g') { e.preventDefault(); e.shiftKey ? ungroupSel() : groupSel(); return; }
      if (k === 'c') { copySel(); return; }
      if (k === 'v') { paste(false); return; }
      if (k === 'd') { e.preventDefault(); paste(true); return; }
      return;                                   // never feed Ctrl+… to the walk keys
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); return; }
    if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) { keys3D.add(k); e.preventDefault(); }
    return;
  }
  if (e.key === ' ') { ui.space = true; e.preventDefault(); return; }
  if (ctrl) {
    if (e.code === 'BracketRight' || e.code === 'BracketLeft') { e.preventDefault(); if (sel.length) reorderSel(e.code === 'BracketRight' ? (e.shiftKey ? 'front' : 'up') : (e.shiftKey ? 'back' : 'down')); return; }
    if (k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (k === 'y') { e.preventDefault(); redo(); }
    else if (k === 'c') copySel();
    else if (k === 'v') paste(false);
    else if (k === 'd') { e.preventDefault(); paste(true); }
    else if (k === 'g') { e.preventDefault(); e.shiftKey ? ungroupSel() : groupSel(); }
    else if (k === 'a') { e.preventDefault(); const f = F(); sel = []; for (const a in KINDS) f[a].forEach(o => { if (pickable(o.id)) sel.push(o.id); }); refresh(); }
    else if (k === 's') { e.preventDefault(); saveBrowser(); }
    return;
  }
  // sayıyla uzunluk (#36): seçili tek duvar → rakam + Enter; duvar ucu sürüklenirken → rakam yazınca uç o uzaklığa kilitlenir
  const hd = ui.drag && ui.drag.type === 'handle' && (ui.drag.h === 'wa' || ui.drag.h === 'wb') ? ui.drag : null;
  const sw = !hd && tool === 'select' && sel.length === 1 && find(sel[0])?.kind === 'wall' ? find(sel[0]).o : null;
  if (hd && (/^[0-9.,]$/.test(e.key) || e.key === 'Backspace')) {
    hd.typed = e.key === 'Backspace' ? (hd.typed || '').slice(0, -1) : (hd.typed || '') + (e.key === ',' ? '.' : e.key);
    if (ui.raw) doHandle(ui.raw, ui.lastE || { shiftKey: false }); render(); e.preventDefault(); return;
  }
  if (sw && (/^[0-9.,]$/.test(e.key) || (ui.lenTyped && (e.key === 'Backspace' || e.key === 'Enter' || e.key === 'Escape')))) {
    e.preventDefault();
    if (e.key === 'Enter') { const v = parseFloat(ui.lenTyped); ui.lenTyped = ''; if (applyWallLength(sw, v)) { commit(); refresh(); if (ui.view3d && T3) schedBuild3D(); } else render(); return; }
    ui.lenTyped = e.key === 'Escape' ? '' : e.key === 'Backspace' ? ui.lenTyped.slice(0, -1) : (ui.lenTyped || '') + (e.key === ',' ? '.' : e.key);
    drawPreview(); return;
  }
  if (ui.lenTyped && !sw) ui.lenTyped = '';
  if (tool === 'wall' && ui.draw) {
    if (/^[0-9.]$/.test(e.key)) { ui.typed += e.key; if (ui.lastE) setCursor(ui.lastE); drawPreview(); e.preventDefault(); return; }
    if (e.key === 'Backspace') { ui.typed = ui.typed.slice(0, -1); if (ui.lastE) setCursor(ui.lastE); drawPreview(); e.preventDefault(); return; }
    if (e.key === 'Enter') {
      if (ui.typed && ui.cur && dist(ui.draw.start, ui.cur) > 1) { F().walls.push(mkWall(ui.draw.start, ui.cur)); ui.draw = { start: { x: ui.cur.x, y: ui.cur.y } }; ui.typed = ''; commit(); render(); renderProps(); }
      else { ui.draw = null; ui.typed = ''; render(); }
      return;
    }
  }
  if (POLY_TOOLS.has(tool) && e.key === 'Enter') { finishPoly(); return; }
  if (e.key === 'Escape') {
    if (ui.draw || ui.polyPts || ui.dimStart || ui.calib || ui.pen || ui.mAxis || ui.secStart) { ui.draw = null; ui.polyPts = null; ui.dimStart = null; ui.calib = null; ui.pen = null; ui.mAxis = null; ui.secStart = null; ui.typed = ''; render(); }
    else if (tool !== 'select') setTool('select'); else if (ui.grpEdit) { stopGrpEdit(); refresh(); } else { sel = []; refresh(); }
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
    selObjs().forEach(({ kind, o }) => { if (AB_KINDS.has(kind)) { o.a.x += dx; o.a.y += dy; o.b.x += dx; o.b.y += dy; } else if (PTS_KINDS.has(kind)) o.pts.forEach(p => { p.x += dx; p.y += dy; }); else if (kind === 'furn' || kind === 'text' || kind === 'bg') { o.x += dx; o.y += dy; } else if (kind === 'op') o.d += dx + dy; });
    commit(); render(); if (sel.includes('bg')) renderProps(); if (ui.view3d && T3) schedBuild3D(); return;
  }
  const map = { v: 'select', h: 'pan', w: 'wall', r: 'rect', o: 'room', p: 'poly', s: 'shape', d: 'door', n: 'window', f: 'furn', m: 'dim', t: 'text', e: 'eraser', x: 'trim', c: 'calib', b: 'pen', k: 'slab', y: 'void', i: 'mirror', l: 'section' };
  if (e.shiftKey && (k === 'h' || k === 'v') && sel.length) { flipSel(k); return; } // Shift+H / Shift+V: aynala (#28)
  if (map[k]) { setTool(map[k]); return; }
  if (k === 'g') { $('#cSnap').click(); return; }
  if (k === '0') fit(); else if (k === '+' || k === '=') zoomBtn(1.25); else if (k === '-') zoomBtn(0.8);
});
window.addEventListener('keyup', e => { if (e.key === ' ') ui.space = false; keys3D.delete(e.key.toLowerCase()); });
function zoomBtn(f) { const s = svgSize(); zoomAt(f, s.w / 2, s.h / 2); }
$('#zIn').onclick = () => zoomBtn(1.25); $('#zOut').onclick = () => zoomBtn(0.8); $('#zFit').onclick = fit;

/* ---------- Modal ---------- */
function openModal(html, kind = null) { ui.modal = kind; $('#modal').innerHTML = html; $('#modalbg').style.display = 'flex'; }
function closeModal() { if (ui.modal === 'parts') fsClose(); ui.modal = null; $('#modalbg').style.display = 'none'; }
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
    ? 'Set up live editing for my floor planner so you can change my plan directly:\n1. In the project folder, run the bridge in the background and keep it running — do not close it. If you are OpenCode, start it with wake enabled so requests I type in the app start a turn for you: "FP_WAKE=1 node mcp/bridge.js" (Windows PowerShell: "$env:FP_WAKE=\'1\'; node mcp/bridge.js"). Any other agent runs plain "node mcp/bridge.js" — then I will ask you to check the queue.\n2. Tell me when it is running; my floor planner page (https://mewego.github.io/floorplanner/ or the local copy) connects to it automatically.\n3. Then call pull_from_browser to read my current plan. Apply every change with push_to_browser — it appears in my open tab and is saved automatically. Read anything I type in the app panel with get_user_requests (ack them with ack_user_requests).'
    : 'Kat planımı doğrudan düzenleyebilmen için canlı köprüyü kur:\n1. Proje klasöründe köprüyü arka planda çalıştır ve açık bırak — kapatma. OpenCode kullanıyorsan uyandırma açık başlat, böylece uygulamaya yazdığım istekler senin için bir tur başlatır: "FP_WAKE=1 node mcp/bridge.js" (Windows PowerShell: "$env:FP_WAKE=\'1\'; node mcp/bridge.js"). Başka bir ajan kullanıyorsan "node mcp/bridge.js" yeterli — o zaman kuyruğu kontrol etmeni ben söylerim.\n2. Çalıştığını bana söyle; kat planı sayfam (https://mewego.github.io/floorplanner/ veya yerel kopya) ona kendiliğinden bağlanır.\n3. Sonra pull_from_browser ile güncel planımı oku. Her değişikliği push_to_browser ile uygula — açık sekmemde görünür ve otomatik kaydedilir. Uygulama panelinde yazdıklarımı get_user_requests ile oku (işleyince ack_user_requests ile kapat).';
}
function helpModal() {
  const rows = isEN() ? [
    [':', 'Command line: run any tool or action by name (English or Turkish), shortcut keys shown'],
    ['V / H', 'Select / Pan (hold Space for temporary pan)'],
    ['W', 'Draw wall (type number + Enter: exact length in cm)'],
    ['R', 'Rect room (draws 4 walls + room)'],
    ['O', 'Auto-detect room inside enclosed walls'],
    ['P', 'Draw custom polygon room'],
    ['K', 'Slab: draw a balcony / terrace floor without walls (click corners or drag a rectangle)'],
    ['Y', 'Void: cut a stairwell / shaft / atrium through the floor slab'],
    ['S', 'Shapes: triangle / quad / N-gon / ellipse / freeform — draw as wall outlines or name & save as custom library items'],
    ['D / N', 'Place Door / Window'],
    ['F', 'Open Furniture library'],
    ['M', 'Add Dimension line'],
    ['T', 'Add Text label'],
    ['B', 'Pen: freehand sketch on the plan (drag to draw, release to finish)'],
    ['E', 'Eraser (click object to delete)'],
    ['X', 'Trim (click the overhanging part of a crossing wall)'],
    ['I', 'Mirror the selection about an axis (click two points)'],
    ['L', 'Section line (click both ends) → 3D cutaway / 2D section drawing'],
    ['Shift+H / Shift+V', 'Flip the selection horizontally / vertically'],
    ['Ctrl+click', 'Select the object underneath (repeat to go deeper)'],
    ['Right-click', 'List the objects under the cursor + layer order'],
    ['Ctrl+] / Ctrl+[', 'Bring forward / send backward (+Shift: to front / to back)'],
    ['C', 'Calibrate background image scale'],
    ['G', 'Toggle grid & endpoint snap'],
    ['Shift', 'Hold to disable snap • multi-select in Select mode'],
    ['[ ]', 'Rotate selection by 15° (multi-selections turn as one rigid layout)'],
    ['R (while placing)', 'Rotate furniture 90° / flip door hinge'],
    ['S (while placing)', 'Flip door swing direction'],
    ['Arrow keys', 'Nudge selection / background image by 1 cm (Shift: 10 cm)'],
    ['WASD / Q / E (3D)', 'Walk around in 3D view (Q/E: down/up, Shift: faster)'],
    ['👁 (3D): walk mode', 'Walk through at eye level: WASD / arrows walk, Shift runs, drag to look around, walls block, open doors and arches let you through, click a door to open it • Esc: back to the orbit camera'],
    ['Ctrl+Z / Ctrl+Y (3D)', 'Undo / redo while staying in the 3D view (Del also works there; Ctrl+A / C / V / D / G / S too)'],
    ['3D: click / drag furniture', 'Select & highlight • drag to move on the floor (Shift: no grid snap) • resize via the side panel'],
    ['Wall type: Curtain Wall', 'Select a wall → Wall Type → 🪟 Curtain Wall: glass facade with aluminum frame in 2D & 3D'],
    ['3D: Floor selector', 'Menu at the top-left of the 3D view — show all floors stacked, or isolate one floor at ground level'],
    ['3D: 🎬 render', 'Render the current 3D view to a high-resolution PNG — studio backdrop, no CAD outlines, anti-aliased (Shift-click: quick capture of what is on screen). The top-bar 🖼 PNG does the same while in 3D'],
    ['Ctrl+C/V/D', 'Copy / Paste / Duplicate'],
    ['Ctrl+Z / Ctrl+Y', 'Undo / Redo'],
    ['Ctrl+A', 'Select all on current floor'],
    ['Ctrl+S', 'Save project to browser (IndexedDB)'],
    ['📂 Open: IFC', 'Import a Revit / ArchiCAD / BIM model: export it as IFC (Revit: File ▸ Export ▸ IFC) and open the .ifc or drop it on the canvas — floors, walls, doors & windows, rooms and slabs come in; furniture, roofs and stairs do not'],
    ['Del', 'Delete selected objects'],
    ['0 / + / −', 'Fit to screen / Zoom in / Zoom out'],
    ['Double-click', 'Rename room or edit text'],
    ['Click door', 'Open / close door (90°)'],
    ['Click room / group', 'Cycle saved layouts (1a → 1b → 1c)'],
    ['Alt + drag wall', 'Move wall without pulling connected walls'],
    ['Drag a room', 'Room + furniture & texts inside move together (single room)'],
    ['Ctrl+G / Ctrl+Shift+G', 'Group / ungroup selected objects'],
  ] : [
    [':', 'Komut satırı: araç ya da eylemi adıyla çalıştır (Türkçe veya İngilizce), kısayolları gösterir'],
    ['V / H', 'Seç / Kaydır (Boşluk basılı: geçici kaydır)'],
    ['W', 'Duvar çiz (rakam + Enter: tam uzunluk)'],
    ['R', 'Oda (dikdörtgen duvar)'],
    ['O', 'Kapalı alandan oda algıla'],
    ['P', 'Çokgen oda çiz'],
    ['K', 'Döşeme: duvarsız balkon / teras döşemesi çiz (köşelere tıkla ya da dikdörtgen sürükle)'],
    ['Y', 'Boşluk: döşemede merdiven boşluğu / şaft / galeri aç'],
    ['S', 'Şekiller: üçgen / dörtgen / N-gen / elips / serbest — duvar silüesi çizer ya da adlandırıp kütüphaneye kaydeder'],
    ['D / N', 'Kapı / Pencere'],
    ['F', 'Mobilya kütüphanesi'],
    ['M', 'Ölçü ekle'],
    ['T', 'Metin'],
    ['B', 'Kalem: plana serbest elle çizim (sürükle, bırak tamamlar)'],
    ['E', 'Sil'],
    ['X', 'Kırp (kesişen duvarın taşan ucuna tıkla)'],
    ['I', 'Seçimi bir eksene göre aynala (iki noktaya tıkla)'],
    ['L', 'Kesit çizgisi (iki uca tıkla) → 3B kesit / 2B kesit çizimi'],
    ['Shift+H / Shift+V', 'Seçimi yatay / dikey aynala'],
    ['Ctrl+tık', 'Alttaki nesneyi seç (tekrarla: daha alttaki)'],
    ['Sağ tık', 'İmlecin altındaki nesneler + katman sırası'],
    ['Ctrl+] / Ctrl+[', 'Bir öne / bir arkaya (+Shift: en öne / en arkaya)'],
    ['C', 'Arka plan ölçekle'],
    ['G', 'Yakalamayı aç/kapa'],
    ['Shift', 'Basılıyken yakalama kapalı • seçimde çoklu seçim'],
    ['[ ]', 'Seçimi 15° döndür (çoklu seçimler tek parça düzen olarak döner)'],
    ['R (yerleştirirken)', 'Mobilyayı döndür / kapı menteşesini çevir'],
    ['S (yerleştirirken)', 'Kapı açılış yönünü çevir'],
    ['Ok tuşları', 'Seçileni / arka plan görselini 1 cm kaydır (Shift: 10 cm)'],
    ['WASD / Q / E (3B)', '3B görünümde gezin (Q/E: alçal/yüksel, Shift: hızlı)'],
    ['👁 (3B): yürüme modu', 'Göz hizasında gezin: WASD / oklar yürür, Shift koşar, sürükleyerek etrafa bakın; duvarlar durdurur, açık kapı ve kemerlerden geçilir, kapıya tıklayınca açılır • Esc: yörünge kamerasına dön'],
    ['Ctrl+Z / Ctrl+Y (3B)', '3B görünümden çıkmadan geri al / yinele (Del de çalışır; Ctrl+A / C / V / D / G / S dahil)'],
    ['3B: mobilyaya tıkla / sürükle', 'Seç & vurgula • zeminde sürükle (Shift: ızgara yok) • boyutu sağ panelden değiştir'],
    ['Duvar tipi: Cam Cephe', 'Duvar seç → Duvar Tipi → 🪟 Cam Cephe: 2B ve 3B içinde alüminyum çerçeveli cam cephe'],
    ['3B: Kat seçici', '3B görünümün sol üstündeki menü — tüm katlar üst üste ya da tek kat yer seviyesinde'],
    ['3B: 🎬 render', '3B görünümü yüksek çözünürlüklü PNG olarak render eder — stüdyo fonu, CAD çizgileri yok, kenarlar yumuşatılmış (Shift: ekrandaki görünümü hızlıca kaydeder). 3B açıkken üstteki 🖼 PNG de aynısını yapar'],
    ['Ctrl+C/V/D', 'Kopyala / Yapıştır / Çoğalt'],
    ['Ctrl+Z / Ctrl+Y', 'Geri al / Yinele'],
    ['Ctrl+A', 'Tümünü seç'],
    ['Ctrl+S', 'Tarayıcıya kaydet'],
    ['📂 Aç: IFC', 'Revit / ArchiCAD / BIM modeli içe aktarın: IFC olarak dışa aktarın (Revit: Dosya ▸ Dışa aktar ▸ IFC) ve .ifc dosyasını açın ya da tuvale bırakın — katlar, duvarlar, kapı ve pencereler, odalar ve döşemeler gelir; mobilya, çatı ve merdivenler gelmez'],
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
  <p class="muted" style="margin:0 0 8px">${L(
    'İstekler bir kuyruğa girer. Köprü FP_WAKE=1 ile başlatıldıysa ajanınız kendiliğinden uyanır; AI düğmesindeki turuncu sayaç kalıcıysa ajanınıza “uygulamadaki istekleri kontrol et” deyin.',
    'Requests go into a queue. If the bridge was started with FP_WAKE=1 your agent is woken automatically; if the orange counter stays, tell your agent “check the app requests”.'
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
// ?bridge=off: bu sekme köprüye hiç bağlanmaz (test tarayıcısı canlı AI planını ezmesin; kullanıcı için de bir kaçış yolu)
const BRIDGE_OFF = (() => { try { return new URLSearchParams(location.search).get('bridge') === 'off'; } catch (e) { return false; } })();
const BRIDGE_SEEN = 'fp_bridge_rev';
const bridgeTab = Math.random().toString(36).slice(2) + Date.now().toString(36);
let brgRev = 0, brgConnected = false, brgHydrated = false, brgApplying = false;
let brgPushTimer = null, brgProbeTimer = null, brgEs = null;
let brgPending = 0;              // queued requests the agent has not picked up yet
let brgAckAt = 0;                // when the queue last went from >0 to 0 (agent picked it up)
let brgWake = false;             // bridge can start an agent turn by itself (FP_WAKE=1)

function brgUrl(p) { return BRIDGE_BASE + p; }

async function brgFetch(p, opt, ms) {
  if (BRIDGE_OFF) throw new Error('bridge disabled (?bridge=off)');
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

function brgApply(remotePlan, newRev, kind) {
  if (!remotePlan || !remotePlan.floors) return;
  brgApplying = true;
  try { loadProject(remotePlan); }
  catch (e) { console.warn('[ai-bridge] could not apply plan', e); }
  if (newRev) { brgRev = newRev; localStorage.setItem(BRIDGE_SEEN, String(brgRev)); }
  // the agent's plan replaces whatever the starter-screen offered
  try { if (ui.modal === 'templates' || ui.modal === 'help' || ui.modal === 'projects' || ui.modal === 'parts') closeModal(); } catch (e) { } // parça taslağı eski plana aitti
  if (ui.view3d && typeof schedBuild3D === 'function') schedBuild3D();
  setTimeout(() => { brgApplying = false; }, 700);
  toast(kind === 'restore'
    ? L('↩ Kayıtlı sürüm geri yüklendi', '↩ Saved version restored')
    : L('🤖 AI planı uygulandı', '🤖 AI plan applied'));
  if (brgPanelOpen() && typeof aiRefreshSnapshots === 'function') aiRefreshSnapshots();
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
  if (BRIDGE_OFF) return false;
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
        brgApply(msg.plan, msg.rev, msg.tab === 'restore' ? 'restore' : 'ai');
      } catch (e) { }
    });
    es.addEventListener('requests-changed', () => { brgRefreshPending(); });
    es.addEventListener('request', () => { brgRefreshPending(); });
    es.onopen = () => {
      brgSetConnected(true);
      if (!brgHydrated) brgInitialSync(); else brgSync();
      brgRefreshPending();
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

/* keep looking for the bridge while the app stays open: it can be started,
   restarted or stopped at any time, and a dropped SSE stream must not be final */
function brgStartProbe() {
  if (BRIDGE_OFF) return;
  if (brgProbeTimer || brgEs) return;
  brgProbeTimer = setInterval(async () => {
    if (brgEs) { brgStopProbe(); return; }
    if (await brgConnect()) brgStopProbe();
  }, 10000);
}
function brgProbe() {
  brgConnect().then(ok => { if (!ok) brgStartProbe(); });
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
  if (!brgConnected) brgStartProbe();        // the bridge may come back — keep looking
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
    <div style="font-weight:600;font-size:11px;margin:0 0 4px;display:flex;align-items:center;gap:6px">
      ${L('Son kayıtlar', 'Recent saves')}
      <span data-ai-snapinfo style="margin-left:auto;font-weight:400;font-size:10px;opacity:.55"></span>
    </div>
    <div data-ai-snaps style="max-height:96px;overflow:auto;margin-bottom:8px;font-size:11.5px"></div>
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
    + '<span data-ai-pending style="display:none;min-width:16px;height:16px;padding:0 5px;border-radius:999px;font-weight:700;font-size:10.5px;line-height:16px;text-align:center"></span>'
    + '<span data-ai-rev style="opacity:.6;font-variant-numeric:tabular-nums"></span>';
  host.appendChild(pill);
  document.body.appendChild(host);

  pill.onclick = () => {
    const open = panel.style.display === 'none';
    panel.style.display = open ? 'block' : 'none';
    if (open) { aiRefreshRequests(); aiRefreshDetail(); brgRefreshPending(); aiRefreshSnapshots(); }
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
  pill.title = aiPendingTitle();
  const badge = pill.querySelector('[data-ai-pending]');
  if (badge) {
    badge.style.background = aiIsLight() ? '#d97706' : '#fbbf24';
    badge.style.color = aiIsLight() ? '#fff' : '#1a1200';
  }
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
  if (ss) ss.style.color = brgPending ? (aiIsLight() ? '#b45309' : '#fbbf24') : c.sub;
  aiSyncStatusText();
  aiSyncSendState();
}

function brgTick() {
  const pill = aiBridgePill();
  if (!pill) return;
  const rv = pill.querySelector('[data-ai-rev]');
  if (rv) rv.textContent = brgRev ? ' · rev ' + brgRev : '';
  aiBridgePaint();
}

/* --- request feedback ------------------------------------------------------
   A queued request is passive: the bridge stores it, but nothing can wake the
   agent's model up. The app therefore has to be honest about the state —
   "waiting for your agent" stays visible until get_user_requests/ack runs,
   instead of a 5-second toast that makes it look like the request vanished. */
async function brgRefreshPending() {
  try {
    const res = await brgFetch('/__requests', null, 2500);
    if (!res.ok) return;
    const j = await res.json();
    brgWake = !!j.wake;
    brgSetPending((j.requests || []).length);
  } catch (e) { /* bridge offline — keep the last known count */ }
}

function aiPendingTitle() {
  if (!brgConnected) return L('AI köprüsü kapalı', 'AI bridge offline');
  if (!brgPending) return L('AI köprüsü bağlı — tıklayarak istek gönderin', 'AI bridge connected — click to send a request');
  return brgWake
    ? L('AI köprüsü bağlı — ' + brgPending + ' istek, ajan uyandırılıyor', 'AI bridge connected — waking your agent for ' + brgPending + ' request(s)')
    : L('AI köprüsü bağlı — ' + brgPending + ' istek ajanınızı bekliyor', 'AI bridge connected — ' + brgPending + ' request(s) waiting for your agent');
}

function brgSetPending(n) {
  const had = brgPending;
  brgPending = Math.max(0, n | 0);
  if (had > 0 && !brgPending) { brgAckAt = Date.now(); setTimeout(aiSyncSendState, 8000); }   // clear the "picked up" note
  const pill = aiBridgePill();
  const badge = pill && pill.querySelector('[data-ai-pending]');
  if (badge) {
    badge.textContent = brgPending ? String(brgPending) : '';
    badge.style.display = brgPending ? '' : 'none';
  }
  if (pill && brgConnected) pill.title = aiPendingTitle();
  aiSyncSendState();
  if (brgPanelOpen()) aiRefreshRequests();
}

function aiSyncSendState() {
  const panel = document.getElementById('aiBridgePanel');
  if (!panel) return;
  const st = panel.querySelector('[data-ai-sendstate]');
  if (!st) return;
  if (!brgConnected) {
    st.textContent = L('Köprü kapalı — ajanınız mcp/bridge.js çalıştırsın', 'Bridge offline — have your agent start mcp/bridge.js');
  } else if (brgPending) {
    st.textContent = brgWake
      ? L('⏳ ' + brgPending + ' istek — ajanınız uyandırılıyor…', '⏳ ' + brgPending + ' request(s) — waking your agent…')
      : L(
        '⏳ ' + brgPending + ' istek ajanınızı bekliyor — sohbette "uygulamadaki istekleri kontrol et" deyin',
        '⏳ ' + brgPending + ' request(s) waiting — tell your agent "check the app requests"'
      );
  } else if (brgAckAt && Date.now() - brgAckAt < 8000) {
    st.textContent = L('✓ Ajanınız isteği aldı — planda göreceksiniz', '✓ Your agent picked it up — watch the plan');
  } else {
    st.textContent = L('Aracı: get_user_requests', 'Agent tool: get_user_requests');
  }
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

/* --- saved versions --------------------------------------------------------
   The bridge writes a JSON snapshot around every AI edit (before + after), so
   "go back" works even when the agent deleted the whole plan by accident, and
   even without an agent: the list below restores through the same endpoint. */
async function aiRefreshSnapshots() {
  const panel = document.getElementById('aiBridgePanel');
  if (!panel) return;
  const box = panel.querySelector('[data-ai-snaps]');
  const info = panel.querySelector('[data-ai-snapinfo]');
  if (!box) return;
  let list = [];
  try { list = (await (await brgFetch('/__snapshots', null, 2500)).json()).snapshots || []; } catch (e) { }
  const c = aiPal();
  box.innerHTML = '';
  if (info) info.textContent = list.length ? list.length + L(' sürüm', ' saved') : '';
  if (!list.length) {
    box.innerHTML = '<div style="padding:6px 2px;opacity:.65">'
      + L('Kayıt yok — her AI düzenlemesinde otomatik alınır', 'No saves yet — one is taken on every AI edit') + '</div>';
    return;
  }
  for (const s of list.slice(0, 8)) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 2px;border-bottom:1px dashed ' + c.bd;
    const d = new Date(s.at);
    const when = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    const kind = s.reason === 'before-ai' ? L('AI öncesi', 'before AI')
      : s.reason === 'after-ai' ? L('AI sonrası', 'after AI')
        : s.reason === 'before-restore' ? L('geri alış öncesi', 'before restore') : s.reason;
    const txt = document.createElement('span');
    txt.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    txt.textContent = when + ' · ' + (s.label || kind) + ' · ' + s.walls + 'w ' + s.furn + 'f ' + s.rooms + 'r';
    txt.title = new Date(s.at).toLocaleString() + ' · ' + kind + (s.label ? ' · ' + s.label : '')
      + L('\n' + s.walls + ' duvar, ' + s.furn + ' eşya, ' + s.rooms + ' oda', '\n' + s.walls + ' walls, ' + s.furn + ' furniture, ' + s.rooms + ' rooms');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '↩';
    btn.title = L('Bu sürüme dön', 'Restore this version');
    btn.style.cssText = 'border:1px solid ' + c.bd + ';background:transparent;color:inherit;border-radius:6px;padding:1px 6px;cursor:pointer;font:inherit';
    btn.onclick = () => aiRestoreSnapshot(s.id);
    row.append(txt, btn);
    box.appendChild(row);
  }
}

async function aiRestoreSnapshot(id) {
  if (!confirm(L('Bu kayıtlı sürüme geri dönülsün mü?', 'Restore this saved version?'))) return;
  try {
    const res = await brgFetch('/__snapshots/restore', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
    }, 8000);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    // the SSE broadcast may already have applied it — only apply if it has not
    if (j && j.plan && j.rev > brgRev) brgApply(j.plan, j.rev, 'restore');
    aiRefreshSnapshots();
  } catch (e) {
    toast(L('Geri yüklenemedi', 'Could not restore'));
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
    await brgRefreshPending();
    if (!brgPending) st.textContent = L('Gönderildi ✓ — aracınıza "uygulamadaki istekleri kontrol et" deyin',
      'Sent ✓ — ask your agent to check the app requests');
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
function downloadJson(proj = P) { download(fname('json'), new Blob([JSON.stringify(bundleTextures(proj), null, 2)], { type: 'application/json' })); }
async function projectsModal() {
  let list = [];
  try { list = await dbGetAll('projects'); list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); } catch (e) { }
  const loc = isEN() ? 'en-US' : 'tr-TR';
  openModal(`<h2>📁 ${L('Projelerim', 'My Projects')} <span class="muted" style="font-size:12px;font-weight:400">(IndexedDB + JSON)</span> <button class="btn sm" data-close>✕</button></h2>
  <div class="row">
    <button class="btn primary" id="mSave">💾 ${L('Aktif projeyi kaydet', 'Save active project')} (“${esc(P.name)}”)</button>
    <button class="btn" id="mJson">⬇ ${L('JSON indir', 'Download JSON')}</button>
    <button class="btn" id="mOpenF">📂 ${L('Dosya aç (JSON / IFC)', 'Open file (JSON / IFC)')}</button>
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
    if (it) { newTabSlot(); loadProject(JSON.parse(JSON.stringify(it.project)), isEN() ? `Opened “${it.name}”` : `“${it.name}” açıldı`); closeModal(); }
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
    newTabSlot(); P = np; fi = 0; t.build(); loadProject(P); closeModal();
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
/* ---------- Kesit & görünüş çizimleri (issue #30, #31) ----------
   Tek bir izdüşüm motoru: bina, bakış yönü n olan düşey bir düzleme (O noktasından geçen) yansıtılır.
   Çizim koordinatları: s = düzlem boyunca (izleyicinin sağı, u = (-n.y, n.x)), z = yükseklik (cm, yukarı).
   Kesitte (cut) düzlemin önü (d ≤ 0) atılır, düzlemi kesen duvar ve döşemeler koyu (poché) çizilir;
   görünüşte her şey düzlemin arkasındadır. Uzaktan yakına (ressam algoritması) çizilir. */
const floorElev = i => { let e = 0; for (let k = 0; k < i && k < P.floors.length; k++) e += floorH(P.floors[k]) + 20; return e; }; // build3D ile aynı kat aralığı (her kat sayılır, kat bazlı yükseklik #59)
const fmtLevel = cm => (Math.abs(cm) < 0.5 ? '±' : cm > 0 ? '+' : '−') + (Math.abs(cm) / 100).toFixed(2);
// Doğru (O, u) ile poligonun kesiştiği aralıklar, doğru boyunca s cinsinden
function lineCutIntervals(pts, O, u) {
  const n = { x: -u.y, y: u.x }, xs = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const dp = (p.x - O.x) * n.x + (p.y - O.y) * n.y, dq = (q.x - O.x) * n.x + (q.y - O.y) * n.y;
    if ((dp > 0) === (dq > 0)) continue;
    const t = dp / (dp - dq), x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t;
    xs.push((x - O.x) * u.x + (y - O.y) * u.y);
  }
  xs.sort((a, b) => a - b);
  const out = []; for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > 0.1) out.push([xs[i], xs[i + 1]]);
  return out;
}
// aralık listesi a'dan b'dekileri çıkar
function subIntervals(a, b) {
  let out = a.map(x => x.slice());
  for (const [b0, b1] of b) out = out.flatMap(([a0, a1]) => (b1 <= a0 || b0 >= a1) ? [[a0, a1]] : [[a0, b0], [b1, a1]].filter(([x, y]) => y - x > 0.1));
  return out;
}
// Bir kesit çizgisinin bakış yönü: a→b'nin normali (dir ile çevrilir); 3B kırpma ve çizim aynı yönü kullanır
function sectionFrame(sec) {
  const L = dist(sec.a, sec.b) || 1, ux = (sec.b.x - sec.a.x) / L, uy = (sec.b.y - sec.a.y) / L, k = sec.dir === -1 ? -1 : 1;
  return { O: sec.a, n: { x: -uy * k, y: ux * k }, L };
}
const ELEV_DIRS = { north: { x: 0, y: 1 }, south: { x: 0, y: -1 }, east: { x: -1, y: 0 }, west: { x: 1, y: 0 } };
const ELEV_NAMES = { north: ['Kuzey görünüşü', 'North elevation'], south: ['Güney görünüşü', 'South elevation'], east: ['Doğu görünüşü', 'East elevation'], west: ['Batı görünüşü', 'West elevation'] };
// spec: { O, n, cut, crop:[s0,s1]|null } → { prims, levels } (saf veri; svg'ye archSvg çevirir)
function archPrims(spec) {
  const { O, n, cut } = spec, u = { x: -n.y, y: n.x }, prims = [], levels = [];
  const pr = p => ({ s: (p.x - O.x) * u.x + (p.y - O.y) * u.y, d: (p.x - O.x) * n.x + (p.y - O.y) * n.y });
  const crop = spec.crop, inCrop = (s0, s1) => crop ? [Math.max(s0, crop[0]), Math.min(s1, crop[1])] : [s0, s1];
  const face = (corners, z0, z1, extra) => {
    const ps = corners.map(pr), sv = ps.map(q => q.s);
    let [s0, s1] = inCrop(Math.min(...sv), Math.max(...sv)); if (s1 - s0 < 0.5) return;
    prims.push({ t: 'face', s0, s1, z0, z1, depth: ps.reduce((a, q) => a + q.d, 0) / ps.length, ...extra });
  };
  P.floors.forEach((f, i) => {
    const E = floorElev(i); levels.push({ z: E, name: f.name });
    f = visFloor(f, true);
    // döşemeler
    const plates = [...slabPolys(f).map(pts => ({ pts, z0: E - 20, z1: E })), ...(f.slabs || []).filter(s => s.pts && s.pts.length > 2).map(s => ({ pts: s.pts, z0: E + (+s.off || 0) - (+s.t || 20), z1: E + (+s.off || 0) }))];
    const voidIv = cut ? (f.voids || []).flatMap(v => lineCutIntervals(v.pts, O, u)) : [];
    for (const pl of plates) {
      if (cut) {
        for (const [s0, s1] of subIntervals(lineCutIntervals(pl.pts, O, u), voidIv)) { const c = inCrop(s0, s1); if (c[1] - c[0] > 0.5) prims.push({ t: 'cut', s0: c[0], s1: c[1], z0: pl.z0, z1: pl.z1, depth: 0 }); }
      } else face(pl.pts, pl.z0, pl.z1, { slab: true });
    }
    // duvarlar (+ kapı/pencereler)
    for (const w of f.walls) {
      const L = wLen(w); if (L < 1) continue;
      const wx = (w.b.x - w.a.x) / L, wy = (w.b.y - w.a.y) / L, nx = -wy * w.t / 2, ny = wx * w.t / 2, H = +w.h || floorH(f);
      const at = t => ({ x: w.a.x + (w.b.x - w.a.x) * t, y: w.a.y + (w.b.y - w.a.y) * t });
      const A = pr(w.a), B = pr(w.b), ops = f.ops.filter(o => o.wall === w.id);
      const curtain = w.wt === 'curtain', rail = isLowWall(w) ? w.wt : null;
      const faceOf = (t0, t1) => {
        const p0 = at(t0), p1 = at(t1);
        const corners = [{ x: p0.x + nx, y: p0.y + ny }, { x: p0.x - nx, y: p0.y - ny }, { x: p1.x + nx, y: p1.y + ny }, { x: p1.x - nx, y: p1.y - ny }];
        const holes = ops.filter(o => o.d / L >= t0 && o.d / L <= t1).map(o => {
          const q0 = pr(at(clamp((o.d - o.w / 2) / L, t0, t1))), q1 = pr(at(clamp((o.d + o.w / 2) / L, t0, t1)));
          return { s0: Math.min(q0.s, q1.s), s1: Math.max(q0.s, q1.s), z0: E + (+o.sill || 0), z1: E + (+o.sill || 0) + (+o.h || 0), type: o.type };
        }).filter(hh => hh.s1 - hh.s0 > 1);
        face(corners, E, E + H, rail ? { rail } : { holes, curtain });
      };
      if (cut && (A.d > 0) !== (B.d > 0)) {
        const t = A.d / (A.d - B.d), sc = A.s + (B.s - A.s) * t, sin = Math.abs(B.d - A.d) / L, cw = w.t / Math.max(sin, 0.2);
        const pos = t * L, op = ops.find(o => Math.abs(pos - o.d) < o.w / 2);
        const [c0, c1] = inCrop(sc - cw / 2, sc + cw / 2);
        if (c1 - c0 > 0.2) {
          const bands = op ? [[E, E + (+op.sill || 0)], [E + (+op.sill || 0) + (+op.h || 0), E + H]] : [[E, E + H]];
          for (const [z0, z1] of bands) if (z1 - z0 > 0.5) prims.push({ t: 'cut', s0: c0, s1: c1, z0, z1, depth: 0, curtain });
          if (op && op.type === 'window') prims.push({ t: 'glass', s0: c0, s1: c1, z0: E + (+op.sill || 0), z1: E + (+op.sill || 0) + (+op.h || 0), depth: 0 });
        }
        if (A.d > 0) faceOf(0, t); else faceOf(t, 1);
      } else if (!cut || (A.d > 0 && B.d > 0)) faceOf(0, 1);
    }
    // çatılar (IFC): her yüz düzleme izdüşürülür; kesitte yalnızca bakış yönündekiler (kesilmez, görünüş olarak)
    for (const o of f.furn || []) {
      if (o.k !== 'roof') continue;
      const th = (o.rot || 0) * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th), base = E + furnElev(o);
      for (const q of roofFaces(o)) {
        const ps = q.map(p => { const w = pr({ x: o.x + p[0] * c - p[1] * sn, y: o.y + p[0] * sn + p[1] * c }); return { s: w.s, d: w.d, z: base + p[2] }; });
        const depth = ps.reduce((a, p) => a + p.d, 0) / ps.length; if (cut && depth <= 0) continue;
        const sv = ps.map(p => p.s), zv = ps.map(p => p.z), s0 = Math.min(...sv), s1 = Math.max(...sv);
        if (s1 - s0 < 0.5 || (crop && (s1 < crop[0] || s0 > crop[1]))) continue;
        prims.push({ t: 'rpoly', pts: ps.map(p => ({ s: p.s, z: p.z })), s0, s1, z0: Math.min(...zv), z1: Math.max(...zv), depth });
      }
    }
    // kesilen odaların adları
    if (cut) for (const r of f.rooms) for (const [s0, s1] of lineCutIntervals(r.pts, O, u)) {
      const c = inCrop(s0, s1); if (c[1] - c[0] > 60) prims.push({ t: 'label', s: (c[0] + c[1]) / 2, z: E + floorH(f) * 0.45, text: r.name, depth: -1 });
    }
  });
  return { prims, levels };
}
// Görünüş / kesitte korkuluk ve çit (#73): üst ray, alt ray, dikmeler ve çubuk / çıtalar; arkası görünür kalır
function railElevSvg(p, X, Y, st) {
  const spec = LOW_WALL[p.rail] || LOW_WALL.railing, x0 = X(p.s0), x1 = X(p.s1), yt = Y(p.z1), yb = Y(p.z0), wd = x1 - x0;
  let s = `<path d="M${x0} ${yt}H${x1}M${x0} ${Y(p.z0 + 10)}H${x1}" stroke="${st}" stroke-width="${p.rail === 'fence' ? 2.2 : 2.6}" fill="none"/>`;
  if (p.rail === 'fence') s += `<path d="M${x0} ${Y(p.z0 + (p.z1 - p.z0) * 0.75)}H${x1}" stroke="${st}" stroke-width="2" fill="none"/>`;
  const nP = Math.max(1, Math.round(wd / spec.post)), step = Math.max(spec.bar, wd / 200);
  let d = '';
  for (let x = x0 + step; x < x1 - 1; x += step) d += `M${x} ${yt}V${yb}`;
  s += `<path d="${d}" stroke="${st}" stroke-width="0.7" fill="none"/>`;
  for (let i = 0; i <= nP; i++) { const x = x0 + wd * i / nP; s += `<line x1="${x}" y1="${yt}" x2="${x}" y2="${yb}" stroke="${st}" stroke-width="2.6"/>`; }
  return s;
}
// Çizimi kağıda bas (her zaman beyaz kağıt paleti). Döner: { svg, w, h }
function archSvg(spec, title) {
  const C = pal(true), { prims, levels } = archPrims(spec), st = C.text;
  const geo = prims.filter(p => p.t !== 'label');
  if (!geo.length) return null;
  let s0 = Math.min(...geo.map(p => p.s0)), s1 = Math.max(...geo.map(p => p.s1));
  const zTop = Math.max(...geo.map(p => p.z1)), zBot = -20;
  const M = 90, LM = 170, w = Math.round(s1 - s0 + LM + M), h = Math.round(zTop - zBot + M * 2 + 70);
  const X = s => s - s0 + LM, Y = z => zTop - z + M;
  let out = '';
  // kat kotları: kesikli seviye çizgisi + ▼ işareti + ±0.00
  for (const lv of levels) {
    if (lv.z > zTop + 1) continue;
    const y = Y(lv.z);
    out += `<line x1="${LM - 120}" y1="${y}" x2="${w - M / 2}" y2="${y}" stroke="${C.sub}" stroke-width="1" stroke-dasharray="14 6 3 6"/>`;
    out += `<path d="M${LM - 110} ${y - 14}L${LM - 96} ${y}L${LM - 82} ${y - 14}Z" fill="${C.sub}"/>`;
    out += `<text x="${LM - 118}" y="${y - 20}" font-size="17" font-weight="700" fill="${C.text}" font-family="Segoe UI,sans-serif">${fmtLevel(lv.z)}</text>`;
    out += `<text x="${LM - 118}" y="${y + 20}" font-size="13" fill="${C.sub}" font-family="Segoe UI,sans-serif">${esc(lv.name)}</text>`;
  }
  // uzaktan yakına: yüzler, sonra kesilenler, en son etiketler
  const faces = prims.filter(p => p.t === 'face' || p.t === 'rpoly').sort((a, b) => b.depth - a.depth);
  for (const p of faces) {
    if (p.t === 'rpoly') { out += `<polygon points="${p.pts.map(q => X(q.s) + ',' + Y(q.z)).join(' ')}" fill="${C.gMin}" stroke="${st}" stroke-width="1.3" stroke-linejoin="round"/>`; continue; } // çatı yüzü
    if (p.rail) { out += railElevSvg(p, X, Y, st); continue; } // korkuluk / çit: açık dikme + ray (#73)
    const fill = p.slab ? C.gMin : p.curtain ? C.glass : C.bg;
    out += `<rect x="${X(p.s0)}" y="${Y(p.z1)}" width="${p.s1 - p.s0}" height="${p.z1 - p.z0}" fill="${fill}" stroke="${st}" stroke-width="1.6"/>`;
    for (const hh of p.holes || []) {
      const win = hh.type === 'window', x = X(hh.s0), y = Y(hh.z1), ww = hh.s1 - hh.s0, hgt = hh.z1 - hh.z0;
      out += `<rect x="${x}" y="${y}" width="${ww}" height="${hgt}" fill="${win ? C.glass : C.bg}" stroke="${st}" stroke-width="1.3"/>`;
      if (win) out += `<path d="M${x + ww / 2} ${y}V${y + hgt}M${x} ${y + hgt * 0.35}H${x + ww}" stroke="${st}" stroke-width="0.9" fill="none"/>`;
      else if (hh.type !== 'arch') out += `<rect x="${x + ww * 0.12}" y="${y + hgt * 0.08}" width="${ww * 0.76}" height="${hgt * 0.84}" fill="none" stroke="${C.sub}" stroke-width="0.8"/><circle cx="${x + ww * 0.8}" cy="${y + hgt * 0.52}" r="2.5" fill="${st}"/>`;
    }
  }
  for (const p of prims.filter(p => p.t === 'cut')) out += `<rect x="${X(p.s0)}" y="${Y(p.z1)}" width="${p.s1 - p.s0}" height="${p.z1 - p.z0}" fill="${p.curtain ? C.glass : C.wall}" stroke="${C.wall}" stroke-width="1"/>`;
  for (const p of prims.filter(p => p.t === 'glass')) out += `<rect x="${X(p.s0) + (p.s1 - p.s0) * 0.4}" y="${Y(p.z1)}" width="${(p.s1 - p.s0) * 0.2}" height="${p.z1 - p.z0}" fill="${C.glass}" stroke="${st}" stroke-width="0.8"/>`;
  for (const p of prims.filter(p => p.t === 'label')) out += `<text x="${X(p.s)}" y="${Y(p.z)}" text-anchor="middle" font-size="20" font-weight="600" fill="${C.text}" stroke="${C.halo}" stroke-width="4" paint-order="stroke" font-family="Segoe UI,sans-serif">${esc(p.text)}</text>`;
  // zemin çizgisi + başlık + 2 m ölçek çubuğu
  out += `<line x1="${LM - 130}" y1="${Y(zBot)}" x2="${w - 20}" y2="${Y(zBot)}" stroke="${st}" stroke-width="5"/>`;
  const ty = h - 30;
  out += `<text x="${LM}" y="${ty}" font-size="24" font-weight="700" fill="${C.text}" font-family="Segoe UI,sans-serif">${esc(title)}</text>`;
  out += `<text x="${LM}" y="${ty + 22}" font-size="14" fill="${C.sub}" font-family="Segoe UI,sans-serif">${esc(P.name)} · ${new Date().toLocaleDateString()}</text>`;
  const bx = w - M / 2 - 200;
  out += `<g font-family="Segoe UI,sans-serif" font-size="13" fill="${C.text}"><rect x="${bx}" y="${ty - 10}" width="100" height="8" fill="${st}"/><rect x="${bx + 100}" y="${ty - 10}" width="100" height="8" fill="#fff" stroke="${st}"/><text x="${bx}" y="${ty + 12}">0</text><text x="${bx + 100}" y="${ty + 12}" text-anchor="middle">1 m</text><text x="${bx + 200}" y="${ty + 12}" text-anchor="end">2 m</text></g>`;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#fff"/>${out}</svg>`, w, h };
}
function elevationSpec(dir) {
  const n = ELEV_DIRS[dir]; let bb = null;
  for (const f of P.floors) { const b = contentBounds(f); if (b) bb = bb ? { x0: Math.min(bb.x0, b.x0), y0: Math.min(bb.y0, b.y0), x1: Math.max(bb.x1, b.x1), y1: Math.max(bb.y1, b.y1) } : b; }
  if (!bb) return null;
  const c = { x: (bb.x0 + bb.x1) / 2, y: (bb.y0 + bb.y1) / 2 }, R = Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0) + 500;
  return { O: { x: c.x - n.x * R, y: c.y - n.y * R }, n, cut: false, crop: null };
}
function sectionSpec(sec) {
  const fr = sectionFrame(sec), u = { x: -fr.n.y, y: fr.n.x }, sb = (sec.b.x - sec.a.x) * u.x + (sec.b.y - sec.a.y) * u.y;
  return { O: fr.O, n: fr.n, cut: true, crop: [Math.min(0, sb), Math.max(0, sb)] };
}
// Çizim penceresi: kesitler ve dört görünüş arasında sekme; SVG / PNG indir
function archModal(key) {
  const secs = []; P.floors.forEach(f => (f.sections || []).forEach(s => secs.push(s)));
  const tabs = [...secs.map(s => ['sec:' + s.id, L('Kesit ', 'Section ') + s.name + '–' + s.name + "'"]), ...Object.keys(ELEV_DIRS).map(d => ['elev:' + d, L(...ELEV_NAMES[d])])];
  if (!tabs.some(t => t[0] === key)) key = tabs[0][0];
  const [kind, id] = key.split(':'), sec = kind === 'sec' && secs.find(s => s.id === id);
  const title = sec ? L('Kesit ', 'Section ') + sec.name + '–' + sec.name + "'" : L(...ELEV_NAMES[id]);
  const spec = sec ? sectionSpec(sec) : elevationSpec(id), dr = spec && archSvg(spec, title);
  ui.archDraw = dr ? { ...dr, title } : null; ui.archKey = key;
  openModal(`<h2>📐 ${L('Kesit & görünüşler', 'Sections & elevations')} <button class="btn sm" data-close>✕</button></h2>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin:0 0 10px">${tabs.map(([k, n]) => `<button class="btn sm${k === key ? ' primary' : ''}" data-arch="${k}">${esc(n)}</button>`).join('')}</div>
    <div class="archview" style="background:#fff;border-radius:8px;overflow:auto;max-height:62vh;padding:8px">${dr ? dr.svg.replace('<svg ', '<svg style="width:100%;height:auto;max-height:60vh" ') : `<p class="muted" style="color:#475569">${L('Çizilecek bir şey yok — önce duvar ekle.', 'Nothing to draw yet — add some walls first.')}</p>`}</div>
    <div class="row" style="margin-top:10px;gap:8px"><button class="btn sm" data-archdl="svg" ${dr ? '' : 'disabled'}>⬇ SVG</button><button class="btn sm primary" data-archdl="png" ${dr ? '' : 'disabled'}>⬇ PNG</button></div>`, 'arch');
}
function svgToPng(svg, w, h, name) {
  const sc = Math.min(3, 3200 / Math.max(w, h)) * (w < 1200 ? 1.5 : 1), img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(h * sc); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => download(name, b)); };
  img.onerror = () => toast(L('PNG oluşturulamadı', 'Failed to generate PNG'));
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
$('#modal').addEventListener('click', e => {
  if (ui.modal !== 'arch') return;
  const t = e.target.closest('[data-arch]'); if (t) { archModal(t.dataset.arch); return; }
  const d = e.target.closest('[data-archdl]'); if (!d || !ui.archDraw) return;
  const base = fname('x').replace(/\.x$/, '') + '-' + ui.archDraw.title.toLowerCase().replace(/[^a-z0-9ğüşöçı]+/gi, '-');
  if (d.dataset.archdl === 'svg') download(base + '.svg', new Blob([ui.archDraw.svg], { type: 'image/svg+xml' }));
  else svgToPng(ui.archDraw.svg, ui.archDraw.w, ui.archDraw.h, base + '.png');
});
// 3B kesit (issue #30): seçili kesitin önünü kırp (renderer genel kırpma düzlemi)
function applySecClip() {
  if (!T3 || !T3.r) return;
  const fd = ui.secCut && findAnyFloor(ui.secCut);
  if (!fd || fd.kind !== 'section') { ui.secCut = null; T3.r.clippingPlanes = []; return; }
  const { O, n } = sectionFrame(fd.o);
  T3.r.clippingPlanes = [new THREE.Plane(new THREE.Vector3(n.x, 0, n.y), -(n.x * O.x + n.y * O.y))];
}
// kesite / cepheye dik bak (izleyici n'nin tersinde, n yönüne bakar)
function camAlong(n, c, span, hgt) {
  if (!T3) return;
  exitWalk(false);
  const D = Math.max(span, hgt) * 1.25 + 400, zc = hgt / 2;
  T3.cam.position.set(c.x - n.x * D, zc, c.y - n.y * D); T3.ctl.target.set(c.x, zc, c.y); T3.ctl.update(); fitOrtho();
}
function lookAtSection(sec) {
  const { n, L } = sectionFrame(sec);
  camAlong(n, { x: (sec.a.x + sec.b.x) / 2, y: (sec.a.y + sec.b.y) / 2 }, L, (T3 && T3.fit ? T3.fit.elev : P.wallH) || P.wallH);
}
// 2B kesit çizgisi sembolü: kalın kesik-noktalı çizgi, uçlarda harf balonu ve bakış oku
function sectionSvg(sec, live) {
  const L = dist(sec.a, sec.b); if (L < 1) return '';
  const C = pal(), z = live ? view.z : 0.5, { n } = sectionFrame(sec), ux = (sec.b.x - sec.a.x) / L, uy = (sec.b.y - sec.a.y) / L;
  const r = 16 / z, sw = 2.4 / z, col = C.accent;
  let s = `<g ${live ? `data-id="${sec.id}" style="cursor:pointer"` : ''}><line x1="${sec.a.x}" y1="${sec.a.y}" x2="${sec.b.x}" y2="${sec.b.y}" stroke="${col}" stroke-width="${sw}" stroke-dasharray="${18 / z} ${5 / z} ${4 / z} ${5 / z}"/>`;
  [[sec.a, -1, ''], [sec.b, 1, "'"]].forEach(([p, sg, mark]) => {
    const cx = p.x + ux * sg * r * 1.4, cy = p.y + uy * sg * r * 1.4, ax = p.x + n.x * r * 1.6, ay = p.y + n.y * r * 1.6;
    s += `<path d="M${p.x} ${p.y}L${ax} ${ay}" stroke="${col}" stroke-width="${sw}"/><path d="M${ax + n.x * r * 0.7} ${ay + n.y * r * 0.7}L${ax - n.y * r * 0.45} ${ay + n.x * r * 0.45}L${ax + n.y * r * 0.45} ${ay - n.x * r * 0.45}Z" fill="${col}"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.bg}" stroke="${col}" stroke-width="${sw}"/><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="${r * 1.05}" font-weight="700" fill="${col}" font-family="Segoe UI,sans-serif">${esc(sec.name || 'A')}${mark}</text>`;
  });
  if (live) s += `<line x1="${sec.a.x}" y1="${sec.a.y}" x2="${sec.b.x}" y2="${sec.b.y}" stroke="transparent" stroke-width="${Math.max(12, 12 / view.z)}"/>`;
  return s + '</g>';
}
function nextSectionName() {
  const used = new Set(); P.floors.forEach(f => (f.sections || []).forEach(s => used.add(s.name)));
  for (let i = 0; i < 26; i++) { const c = String.fromCharCode(65 + i); if (!used.has(c)) return c; }
  return 'S' + (used.size + 1);
}
function exportPng() {
  const { svg, w, h } = exportSvg(), sc = Math.min(3, 3200 / Math.max(w, h)) * (w < 1200 ? 1.5 : 1);
  const img = new Image();
  img.onload = () => { const c = document.createElement('canvas'); c.width = Math.round(w * sc); c.height = Math.round(h * sc); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => download(fname('png'), b)); };
  img.onerror = () => toast(L('PNG oluşturulamadı', 'Failed to generate PNG'));
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
// Yazdır düğmesi doğrudan yazdırmaz: önce çıktı ayarları (#35)
function exportPrint() { openPlotDialog(); }
/* ---------- Çıktı / plot iletişim kutusu (issue #35) ----------
   Kağıt (A4–A0, yatay/dikey), mimari ölçek (1:50 / 1:100 / 1:200 / 1:500 / sığdır), çıktı alanı (tüm plan /
   ekran / pencere), ortalama ve kenar boşluğu. Pafta milimetre cinsinden bir SVG'dir; 1:100'de 100 cm = 10 mm. */
const PAPERS = { a4: [297, 210], a3: [420, 297], a2: [594, 420], a1: [841, 594], a0: [1189, 841] };
const PLOT_TITLE_MM = 16;
ui.plot = { paper: 'a4', orient: 'landscape', scale: '100', area: 'all', center: true, margin: 10, win: null };
const paperMm = p => { const [a, b] = PAPERS[p.paper] || PAPERS.a4; return p.orient === 'portrait' ? { w: b, h: a } : { w: a, h: b }; };
// plan sınırları (cm) → kağıt (mm): k = mm / cm; taşma varsa overflow
function calcPlotTransform(paper, scale, b, margin, center, titleH = PLOT_TITLE_MM) {
  const areaW = paper.w - 2 * margin, areaH = paper.h - 2 * margin - titleH;
  const bw = Math.max(1, b.x1 - b.x0), bh = Math.max(1, b.y1 - b.y0);
  const k = scale === 'fit' ? Math.min(areaW / bw, areaH / bh) : 10 / +scale;
  const pw = bw * k, ph = bh * k;
  return { k, pw, ph, areaW, areaH, ox: margin + (center ? (areaW - pw) / 2 : 0), oy: margin + (center ? (areaH - ph) / 2 : 0), overflow: pw > areaW + 0.5 || ph > areaH + 0.5 };
}
function plotBounds(area) {
  if (area === 'window' && ui.plot.win) return ui.plot.win;
  if (area === 'view') { const r = cv.getBoundingClientRect(); return { x0: -view.x / view.z, y0: -view.y / view.z, x1: (r.width - view.x) / view.z, y1: (r.height - view.y) / view.z }; }
  const b = contentBounds(F()) || { x0: 0, y0: 0, x1: 1000, y1: 700 }, pad = 60;
  return { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad };
}
// ölçek çubuğu: kağıtta en az 25 mm tutan ilk yuvarlak uzunluk
const plotBarCm = k => [50, 100, 200, 500, 1000, 2000, 5000, 10000].find(c => c * k >= 25) || 10000;
function plotSheetSvg(p = ui.plot) {
  const f = F(), paper = paperMm(p), m = clamp(+p.margin || 0, 0, 40), b = plotBounds(p.area), t = calcPlotTransform(paper, p.scale, b, m, p.center);
  const z0 = view.z; view.z = 0.5; ui.exporting = true;
  let LS, defs;
  try { LS = layerStrings(f, false); defs = defsSvg(); } finally { view.z = z0; ui.exporting = false; }
  const plan = `<g clip-path="url(#plotclip)"><g transform="translate(${t.ox} ${t.oy}) scale(${t.k}) translate(${-b.x0} ${-b.y0})">${P.bg && layersVis.bg ? bgSvg(false) : ''}${LS.rooms}${LS.walls}${LS.ops}${LS.furn}${LS.roomLabels}${LS.dims}${LS.texts}${LS.sketches}</g></g>`;
  // yalnızca seçilen alan basılır: plan dikdörtgeni ∩ yazdırılabilir alan
  const cx0 = Math.max(m, t.ox), cy0 = Math.max(m, t.oy), cx1 = Math.min(m + t.areaW, t.ox + t.pw), cy1 = Math.min(m + t.areaH, t.oy + t.ph);
  const ty = paper.h - m - PLOT_TITLE_MM, scl = p.scale === 'fit' ? '1:' + Math.round(10 / t.k) + ' (' + L('sığdır', 'fit') + ')' : '1:' + p.scale;
  const bar = plotBarCm(t.k), bw = bar * t.k, bx = paper.w - m - 6 - bw, date = new Date().toLocaleDateString(isEN() ? 'en-US' : 'tr-TR');
  const frame = `<rect x="${m}" y="${m}" width="${paper.w - 2 * m}" height="${paper.h - 2 * m}" fill="none" stroke="#334155" stroke-width="0.5"/><path d="M${m} ${ty}H${paper.w - m}" stroke="#334155" stroke-width="0.35"/>`;
  const title = `<g font-family="Segoe UI,sans-serif" fill="#0f172a"><text x="${m + 4}" y="${ty + 7}" font-size="4.6" font-weight="700">${esc(P.name)} – ${esc(f.name)}</text><text x="${m + 4}" y="${ty + 12.5}" font-size="3" fill="#475569">${date}  •  ${L('Ölçek', 'Scale')} ${scl}  •  ${(p.paper || 'a4').toUpperCase()} ${p.orient === 'portrait' ? L('dikey', 'portrait') : L('yatay', 'landscape')}</text>`
    + `<path d="M${bx} ${ty + 10}H${bx + bw}M${bx} ${ty + 8.5}V${ty + 11.5}M${bx + bw / 2} ${ty + 8.5}V${ty + 11.5}M${bx + bw} ${ty + 8.5}V${ty + 11.5}" stroke="#0f172a" stroke-width="0.4" fill="none"/><text x="${bx}" y="${ty + 6.5}" font-size="2.8">0</text><text x="${bx + bw}" y="${ty + 6.5}" font-size="2.8" text-anchor="end">${fmtLen(bar)}</text></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${paper.w}mm" height="${paper.h}mm" viewBox="0 0 ${paper.w} ${paper.h}"><defs>${defs}<clipPath id="plotclip"><rect x="${cx0}" y="${cy0}" width="${Math.max(0, cx1 - cx0)}" height="${Math.max(0, cy1 - cy0)}"/></clipPath></defs><rect width="${paper.w}" height="${paper.h}" fill="#fff"/>${plan}${frame}${title}</svg>`;
  return { svg, t, paper, b };
}
function plotDialogHtml() {
  const p = ui.plot, sh = plotSheetSvg(p), t = sh.t, sel = (k, opts) => `<select data-plot="${k}">${opts.map(([v, n]) => `<option value="${v}" ${String(p[k]) === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  const lab = (t2, c) => `<label style="display:flex;flex-direction:column;gap:2px;font-size:12px">${t2}${c}</label>`;
  return `<h2>🖨 ${L('Çıktı ayarları', 'Plot setup')} <button class="btn sm" data-close>✕</button></h2>
    <div class="row plotctl" style="flex-wrap:wrap;gap:10px;margin-bottom:8px;align-items:flex-end">
      ${lab(L('Kağıt', 'Paper'), sel('paper', Object.keys(PAPERS).map(k => [k, k.toUpperCase() + ' (' + PAPERS[k].join('×') + ' mm)'])))}
      ${lab(L('Yön', 'Orientation'), sel('orient', [['landscape', L('Yatay', 'Landscape')], ['portrait', L('Dikey', 'Portrait')]]))}
      ${lab(L('Ölçek', 'Scale'), sel('scale', [['50', '1:50'], ['100', '1:100'], ['200', '1:200'], ['500', '1:500'], ['fit', L('Kağıda sığdır', 'Fit to paper')]]))}
      ${lab(L('Alan', 'Area'), sel('area', [['all', L('Tüm plan', 'Whole plan')], ['view', L('Ekrandaki görünüm', 'Current view')], ['window', L('Pencere (seçilen alan)', 'Window (picked area)')]]))}
      ${lab(L('Kenar boşluğu (mm)', 'Margin (mm)'), `<input type="number" min="0" max="40" step="1" data-plot="margin" value="${p.margin}" style="width:70px">`)}
      <label style="display:flex;gap:6px;align-items:center;font-size:12px"><input type="checkbox" data-plot="center" ${p.center ? 'checked' : ''}> ${L('Kağıda ortala', 'Center on paper')}</label>
      <button class="btn sm" data-plot-act="win">▭ ${L('Pencere seç…', 'Pick window…')}</button>
    </div>
    <div style="background:#94a3b8;border-radius:8px;padding:12px;display:flex;justify-content:center"><div style="box-shadow:0 4px 18px rgba(0,0,0,.35);width:${p.orient === 'portrait' ? 42 : 100}%;max-height:56vh">${sh.svg.replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'style="width:100%;height:auto;display:block"')}</div></div>
    <p style="margin:8px 0 0;font-size:12px;${t.overflow ? 'color:var(--danger);font-weight:700' : 'color:var(--muted, #64748b)'}">${t.overflow
      ? '⚠ ' + L(`Plan bu ölçekte kağıda sığmıyor (${Math.round(t.pw)}×${Math.round(t.ph)} mm, alan ${Math.round(t.areaW)}×${Math.round(t.areaH)} mm) — kenarlar kesilecek. Daha büyük kağıt, küçük ölçek ya da "Kağıda sığdır" seç.`, `The plan does not fit at this scale (${Math.round(t.pw)}×${Math.round(t.ph)} mm on a ${Math.round(t.areaW)}×${Math.round(t.areaH)} mm area) — it will be clipped. Pick a larger paper, a smaller scale or "Fit to paper".`)
      : L(`Plan kağıtta ${Math.round(t.pw)}×${Math.round(t.ph)} mm.`, `The plan measures ${Math.round(t.pw)}×${Math.round(t.ph)} mm on paper.`)}</p>
    <div class="row" style="gap:8px;margin-top:10px"><button class="btn sm primary" data-plot-act="print">🖨 ${L('Yazdır / PDF', 'Print / PDF')}</button><button class="btn sm" data-plot-act="svg">⬇ SVG</button></div>`;
}
function openPlotDialog() { openModal(plotDialogHtml(), 'plot'); }
function plotPrint() {
  const p = ui.plot, { svg, paper } = plotSheetSvg(p), win = window.open('', '_blank');
  if (!win) return toast(L('Açılır pencere engellendi', 'Pop-up window blocked'));
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(P.name)}</title><style>@page{size:${p.paper.toUpperCase()} ${p.orient};margin:0}html,body{margin:0}svg{display:block;width:${paper.w}mm;height:${paper.h}mm}</style></head><body>${svg}<script>setTimeout(()=>print(),400)<\/script></body></html>`);
  win.document.close();
}
$('#modal').addEventListener('change', e => {
  if (ui.modal !== 'plot') return;
  const t = e.target.closest('[data-plot]'); if (!t) return;
  const k = t.dataset.plot; ui.plot[k] = t.type === 'checkbox' ? t.checked : t.value;
  if (k === 'area' && t.value === 'window' && !ui.plot.win) { startPlotWindow(); return; }
  openPlotDialog();
});
$('#modal').addEventListener('click', e => {
  if (ui.modal !== 'plot') return;
  const a = e.target.closest('[data-plot-act]'); if (!a) return;
  if (a.dataset.plotAct === 'win') startPlotWindow();
  else if (a.dataset.plotAct === 'print') plotPrint();
  else download(fname('svg').replace(/\.svg$/, '-' + ui.plot.paper + '.svg'), new Blob([plotSheetSvg().svg], { type: 'image/svg+xml' }));
});
// pencere seçimi: iletişim kutusu kapanır, tuvalde bir dikdörtgen sürüklenir, sonra geri açılır
function startPlotWindow() { closeModal(); if (ui.view3d) show3D(false); setTool('plotwin'); toast(L('Çıktı alanını tuvalde sürükleyerek seç', 'Drag the plot area on the canvas')); }


/* ---------- 3B render (PNG) ----------
   The 3D view is a live WebGL canvas, so the only honest "export" is a capture
   of the current camera. The renderer is created without preserveDrawingBuffer,
   which means the drawing buffer is discarded once the task yields — therefore
   render() and toDataURL() must stay in ONE synchronous block. Do not make this
   async, and never split the two lines. */

/** How much to oversample a w×h viewport: 2×–3×, capped by side and by pixels.
    Never downscales below 1× — a viewport is never shrunk just to hit a cap. */
function shot3DScale(w, h, maxSide = 3840, maxPixels = 12e6) {
  const side = Math.max(1, w, h);
  const ideal = Math.max(2, Math.min(3, maxSide / side));
  return Math.max(1, Math.min(ideal, maxSide / side, Math.sqrt(maxPixels / (w * h))));
}

function dataUrlBlob(url) {
  const parts = String(url).split(','), head = parts[0] || '', b64 = parts[1] || '';
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'image/png';
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** PNG data URL of the current camera, oversampled. '' when 3D is not running. */
function render3DDataUrl(scale) {
  if (!ui.view3d || !T3 || !T3.r) return '';
  const { r, scene, cam, ctl } = T3, el = $('#v3d');
  const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
  const k = scale || shot3DScale(w, h);
  const oldRatio = r.getPixelRatio();
  let url = '';
  try {
    ctl.update();
    r.setPixelRatio(1);                                  // the ratio would multiply the target size
    r.setSize(Math.round(w * k), Math.round(h * k), false); // false: the canvas stays visually the same
    setCamAspect(cam, w / h);
    r.render(scene, cam);
    url = r.domElement.toDataURL('image/png');            // same task — the buffer is not preserved
  } finally {
    r.setPixelRatio(oldRatio);
    resize3D();                                           // back to the on-screen size + aspect
    if (ui.view3d && T3.run) r.render(scene, cam);
  }
  return url;
}

/* ---------- 3B yüksek kaliteli render ----------
   A viewport capture is still a screenshot: one sample, the live shadow map,
   whatever MSAA the browser gives. A render is built from many samples:

     1. a bigger drawing buffer (up to 4096 px / 9 MP),
     2. N sub-pixel jittered passes averaged together — this is real
        anti-aliasing, and it also smooths shadow edges,
     3. a temporary 4096² shadow map with a frustum tightened to the plan, so
        contact shadows stop looking mushy.

   The accumulation uses gl.readPixels(), not toDataURL(): pixels come back
   synchronously, so frames can be averaged and the UI can breathe between
   passes. Everything is restored in a finally block. */

/** Halton sequence (2,3) — a cheap low-discrepancy jitter pattern. */
function halton(i, base) {
  let f = 1, r = 0, n = i;
  while (n > 0) { f /= base; r += f * (n % base); n = Math.floor(n / base); }
  return r;
}

const nextFrame = () => new Promise(r => setTimeout(r, 0));

/** Shadow-casting directional lights of the scene. */
function shadowLights(scene) {
  const out = [];
  if (scene && scene.traverse) scene.traverse(o => { if (o.isDirectionalLight && o.castShadow) out.push(o); });
  return out;
}

/** High-quality render → PNG data URL. Falls back to '' when WebGL says no.
    Two stages: (1) many jittered passes are averaged into a 2× buffer,
    (2) that buffer is downscaled to the final size, which is where the extra
    samples turn into genuinely smooth edges instead of a soft upscale. */
async function render3DHQ(opts) {
  opts = opts || {};
  if (!ui.view3d || !T3 || !T3.r) return '';
  const { r, scene, cam, ctl } = T3, el = $('#v3d');
  const gl = r.getContext && r.getContext();
  if (!gl || typeof gl.readPixels !== 'function') return '';      // caller falls back to a capture
  const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);

  // 1. final image size (what the user gets) and the buffer we render into
  // render stüdyosu (#34): sabit uzun kenar (1080p / 2K / 4K) ya da ekranın 2–3 katı
  const outK = opts.longSide ? opts.longSide / Math.max(w, h) : (opts.scale || shot3DScale(w, h, 2600, 6e6));
  const style = RENDER_STYLES[opts.style] ? opts.style : 'realistic', inkStyle = style === 'technical' || style === 'sketch' || style === 'toon';
  // arka plan (#45): gerçekçi stil varsayılan olarak gökyüzü, diğerleri beyaz stüdyo — kullanıcı seçimi önceliklidir
  const backdrop = opts.preset === 'viewport' ? 'viewport' : (opts.backdrop === 'sky' || opts.backdrop === 'studio') ? opts.backdrop : (style === 'realistic' ? 'sky' : 'studio');
  const outW = Math.max(2, Math.round(w * outK)), outH = Math.max(2, Math.round(h * outK));
  const bufK = Math.max(1, Math.min(opts.supersample || 2, 4096 / Math.max(outW, outH)));
  const W = Math.max(2, Math.round(outW * bufK)), H = Math.max(2, Math.round(outH * bufK));
  // 2×2 supersampling already removes most stair-stepping, so a couple of
  // jittered passes on top are enough (measured: ramp quality within 0.5 px of
  // 4 passes); without supersampling, more passes are needed to compensate.
  const frames = Math.max(1, Math.min(24, opts.frames || (bufK >= 2 ? 2 : 8)));

  const oldRatio = r.getPixelRatio(), oldAspect = camAspectOf(cam), oldRun = T3.run;
  const lights = shadowLights(scene);
  const saved = lights.map(l => ({
    l, size: l.shadow.mapSize.clone(),
    left: l.shadow.camera.left, right: l.shadow.camera.right,
    top: l.shadow.camera.top, bottom: l.shadow.camera.bottom,
  }));
  // The thin dark outlines on every box are a modelling-viewer tell: they read as
  // CAD, not as a rendered image. A render shows shaded surfaces only, so the
  // edge helpers (LineSegments) are hidden for the passes and restored after.
  const edges = [];
  if (opts.outlines !== true && !inkStyle) scene.traverse(o => { if (o.isLineSegments && o.visible) { edges.push(o); o.visible = false; } });

  // Studio backdrop: a white sweep + a neutral ground, so the output reads as a
  // presentation render instead of a screenshot of the dark viewport. In dark
  // theme the floor slabs are near-black, which would look like a heavy drop
  // shadow on white paper, so those are swapped for the light slab colour too.
  let oldBg = null, studioGround = null, oldGroundMat = null, sky = null;
  const oldFog = scene.fog;
  const slabs = [], studioSlab = new THREE.MeshLambertMaterial({ color: 0xded8cc, side: THREE.DoubleSide });
  if (opts.preset !== 'viewport') {
    oldBg = scene.background;
    if (backdrop === 'sky') {
      // gökyüzü (#45): güneşe göre renk alan gradyan küre + ufka karışan sis; zemin kenarı çizgi olarak görünmez
      const sv = opts.sun ? sunVector(opts.sun.az, opts.sun.alt) : lightSunVector(lights);
      sky = makeSky(sv, cam, T3.fit);
      scene.add(sky.mesh); scene.fog = sky.fog; scene.background = sky.horizon;
    } else scene.background = new THREE.Color(0xffffff);
    if (T3.ground) {
      oldGroundMat = T3.ground.material;
      studioGround = new THREE.MeshLambertMaterial({ color: backdrop === 'sky' ? 0xa19f8b : 0xf3f1ec, side: THREE.DoubleSide });
      T3.ground.material = studioGround;
    }
    scene.traverse(o => {
      if (o.userData && o.userData.slab) { slabs.push({ m: o, mat: o.material }); o.material = studioSlab; }
    });
  }
  // stil (#34): kil / teknik / eskiz tüm yüzeyleri tek mat malzemeye çevirir; teknik ve eskiz kenarları mürekkep rengine
  const swapped = [], styleMats = [];
  if (style === 'toon') {
    // toon / cel (#45): nesnenin kendi rengi + dokusu, 3 kademeli düz gölge (MeshToonMaterial + gradientMap), mürekkep kenarlar
    const grad = new THREE.DataTexture(new Uint8Array([70, 150, 255]), 3, 1, THREE.LuminanceFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.generateMipmaps = false; grad.needsUpdate = true;
    styleMats.push(grad);
    const toonOf = new Map(), toon = m => {
      if (!m) return m;
      if (!toonOf.has(m)) {
        const t = new THREE.MeshToonMaterial({ color: m.color ? m.color.clone() : new THREE.Color(0xdddddd), map: m.map || null, gradientMap: grad, transparent: !!m.transparent, opacity: m.opacity == null ? 1 : m.opacity, side: THREE.DoubleSide, depthWrite: m.depthWrite !== false });
        toonOf.set(m, t); styleMats.push(t);
      }
      return toonOf.get(m);
    };
    scene.traverse(o => {
      if (!o.isMesh || o === T3.ground || (sky && o === sky.mesh)) return;
      swapped.push({ m: o, mat: o.material }); o.material = Array.isArray(o.material) ? o.material.map(toon) : toon(o.material);
    });
    const ink = new THREE.LineBasicMaterial({ color: 0x111827 }); styleMats.push(ink);
    scene.traverse(o => { if (o.isLineSegments) { swapped.push({ m: o, mat: o.material }); o.material = ink; } });
  } else if (style !== 'realistic') {
    const solid = new THREE.MeshLambertMaterial({ color: style === 'clay' ? 0xefe9df : 0xfbfbfb, side: THREE.DoubleSide });
    const glassM = new THREE.MeshLambertMaterial({ color: 0xdbe7ef, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
    styleMats.push(solid, glassM);
    scene.traverse(o => {
      if (!o.isMesh || o === T3.ground || (sky && o === sky.mesh)) return;
      const m0 = Array.isArray(o.material) ? o.material[0] : o.material;
      swapped.push({ m: o, mat: o.material }); o.material = m0 && m0.transparent ? glassM : solid;
    });
    if (inkStyle) { const ink = new THREE.LineBasicMaterial({ color: 0x1f2937 }); styleMats.push(ink); scene.traverse(o => { if (o.isLineSegments) { swapped.push({ m: o, mat: o.material }); o.material = ink; } }); }
  }
  // güneş (#34): ana ışığı azimut / yüksekliğe taşı (alçak güneşte sıcak renk)
  const sunSaved = [];
  if (opts.sun) for (const l of lights) {
    const tg = l.target.position, d0 = l.position.distanceTo(tg) || 1000, v = sunVector(opts.sun.az, opts.sun.alt);
    sunSaved.push({ l, pos: l.position.clone(), col: l.color.clone() });
    l.position.set(tg.x + v.x * d0, tg.y + v.y * d0, tg.z + v.z * d0);
    if (opts.sun.alt < 20) l.color.setHex(0xffc58a);
  }
  const fit = T3.fit, mime = opts.format === 'jpeg' ? 'image/jpeg' : 'image/png';
  let url = '';
  try {
    T3.run = false;                                   // the animation loop must not overwrite a sample
    ctl.update();
    r.setPixelRatio(1);                               // a device ratio would multiply the target size
    r.setSize(W, H, false);                           // false: the element keeps its CSS size
    setCamAspect(cam, w / h);
    if (sky) sky.mesh.position.copy(cam.position);    // gökyüzü küresi kamerayı ortalar (sonsuz uzaklık gibi)

    for (const s of saved) {                          // crisper shadows for this render only
      s.l.shadow.mapSize.set(4096, 4096);
      const sc = s.l.shadow.camera;
      if (fit) {
        const ext = Math.max((fit.sz || 400) * 0.75 + 150, 400);
        sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
        sc.updateProjectionMatrix();
      }
      if (s.l.shadow.map) { s.l.shadow.map.dispose(); s.l.shadow.map = null; }   // force a realloc
    }

    // The scene is static during a render, so the shadow maps only need to be
    // built once — otherwise every pass re-rasterises 4096² (seconds on a
    // software rasteriser).
    const oldShadowAuto = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.shadowMap.needsUpdate = true;

    // Accumulate on the GPU: each pass is drawn over the previous one with
    // alpha 1/(i+1), which is exactly a running mean. readPixels()+a JS sum loop
    // did the same thing but cost seconds per pass (and hundreds of MB for a
    // 4K buffer), so this is both faster and far lighter.
    const acc = document.createElement('canvas'); acc.width = W; acc.height = H;
    const ctx = acc.getContext('2d');
    const hud = $('#hud'), JX = cam.isOrthographicCamera ? 12 : 8, J0 = [cam.projectionMatrix.elements[JX], cam.projectionMatrix.elements[JX + 1]];
    const jx0 = J0[0], jy0 = J0[1];
    for (let i = 0; i < frames; i++) {
      // ±½ px jitter in clip space; averaging the passes removes the stair-stepping
      const jx = jx0 + (frames > 1 ? (halton(i + 1, 2) - 0.5) * 2 / W : 0);
      const jy = jy0 + (frames > 1 ? (halton(i + 1, 3) - 0.5) * 2 / H : 0);
      cam.projectionMatrix.elements[JX] = jx;           // perspektif: [8], [9]; ortografik: öteleme [12], [13] (#74)
      cam.projectionMatrix.elements[JX + 1] = jy;
      r.render(scene, cam);
      ctx.globalAlpha = 1 / (i + 1);                 // running mean, no intermediate storage
      ctx.drawImage(r.domElement, 0, 0);
      if (hud && frames > 2) { hud.textContent = '🎬 ' + (i + 1) + '/' + frames + ' …'; await nextFrame(); }
    }
    ctx.globalAlpha = 1;
    cam.projectionMatrix.elements[JX] = jx0;
    cam.projectionMatrix.elements[JX + 1] = jy0;
    r.shadowMap.autoUpdate = oldShadowAuto;

    // 2. downscale the supersampled buffer to the final image
    let fin = acc;
    if (W !== outW || H !== outH) {
      const out = document.createElement('canvas'); out.width = outW; out.height = outH;
      const octx = out.getContext('2d');
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = 'high';
      octx.drawImage(acc, 0, 0, W, H, 0, 0, outW, outH);
      sharpenCanvas(octx, outW, outH, bufK >= 2 ? 0.25 : 0.6);   // a supersampled downscale is already crisp
      fin = out;
    }
    if (style === 'sketch') sketchFilter(fin);         // kurşun kalem son işlemi (#34)
    url = fin.toDataURL(mime, 0.92);
  } catch (e) {
    url = '';
  } finally {
    if (r.shadowMap) { r.shadowMap.autoUpdate = true; r.shadowMap.needsUpdate = true; }
    for (const e of edges) e.visible = true;
    if (oldBg !== null) scene.background = oldBg;
    scene.fog = oldFog;
    if (sky) { scene.remove(sky.mesh); sky.mesh.geometry.dispose(); sky.mesh.material.dispose(); }
    for (let i = swapped.length - 1; i >= 0; i--) swapped[i].m.material = swapped[i].mat;
    for (const m of styleMats) m.dispose();
    for (const s of sunSaved) { s.l.position.copy(s.pos); s.l.color.copy(s.col); }
    for (const s of slabs) s.m.material = s.mat;
    studioSlab.dispose();
    if (T3.ground && oldGroundMat) { T3.ground.material = oldGroundMat; if (studioGround) studioGround.dispose(); }
    setCamAspect(cam, oldAspect);
    for (const s of saved) {
      s.l.shadow.mapSize.copy(s.size);
      const sc = s.l.shadow.camera;
      sc.left = s.left; sc.right = s.right; sc.top = s.top; sc.bottom = s.bottom;
      sc.updateProjectionMatrix();
      if (s.l.shadow.map) { s.l.shadow.map.dispose(); s.l.shadow.map = null; }
    }
    r.setPixelRatio(oldRatio);
    resize3D();
    T3.run = oldRun;
    if (ui.view3d && T3.run) r.render(scene, cam);
    updateTools();                                    // restores the HUD hint text
  }
  return url;
}

/** Mild unsharp mask: downscaling softens an architectural render, and the
    edges of walls are exactly what the eye judges sharpness by. amount 0..1. */
function sharpenCanvas(ctx, w, h, amount) {
  const a = amount === undefined ? 0.55 : amount;
  if (a <= 0 || w * h > 12e6) return;                 // never risk a long stall on huge images
  const src = ctx.getImageData(0, 0, w, h);
  const s = src.data, out = new Uint8ClampedArray(s);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const p = i + c;
        // 3×3 box blur of the neighbourhood (the "unsharp" reference)
        const blur = (
          s[p - w * 4 - 4] + s[p - w * 4] + s[p - w * 4 + 4] +
          s[p - 4] + s[p] + s[p + 4] +
          s[p + w * 4 - 4] + s[p + w * 4] + s[p + w * 4 + 4]
        ) / 9;
        out[p] = s[p] + a * (s[p] - blur);
      }
    }
  }
  ctx.putImageData(new ImageData(out, w, h), 0, 0);
}

function export3DRender(quick, opts) {
  if (!ui.view3d || !T3) return toast(L('Önce 3B görünüme geçin', 'Switch to the 3D view first'));
  if (ui.shot) return;                                    // guard against a double click
  ui.shot = true;
  const fast = () => render3DDataUrl();
  return (async () => {
    try {
      // the real render: many jittered samples + a high-res shadow map
      let url = quick ? fast() : await render3DHQ(opts);
      if (!url || url.length < 100) {
        toast(L('Yüksek kalite desteklenmiyor — hızlı görüntü alınıyor', 'High quality unavailable — saving a plain capture'));
        url = fast();
      }
      if (!url || url.length < 100) return toast(L('Render alınamadı', 'Could not capture the render'));
      const jpg = !quick && opts && opts.format === 'jpeg' && /^data:image\/jpeg/.test(url);
      const styled = opts && opts.style && opts.style !== 'realistic';
      const suffix = quick ? '-3d-view.png' : !styled && !jpg ? '-3d-render.png' : (styled ? '-3d-' + opts.style : '-3d-render') + (jpg ? '.jpg' : '.png');
      download(fname('png').replace(/\.png$/, suffix), dataUrlBlob(url));
      toast(quick
        ? L('📸 Görünüm kaydedildi', '📸 View saved')
        : L('🎬 Render kaydedildi (yüksek kalite)', '🎬 Render saved (high quality)'));
    } catch (e) {
      toast(L('Render alınamadı: ', 'Could not capture the render: ') + (e && e.message || e));
    } finally { ui.shot = false; }
  })();
}

/* ---------- Render stüdyosu (issue #34) ----------
   render3DHQ() üzerine stil, güneş ve çözünürlük seçenekleri: gerçekçi (mevcut stüdyo), teknik (beyaz yüzey +
   siyah kenar), eskiz (teknik + kurşun kalem son işlem), kil (tek renk mat malzeme). Hepsi tarayıcıda, ek kütüphane yok. */
const RENDER_STYLES = { realistic: ['🌅 Gerçekçi', '🌅 Realistic'], technical: ['📐 Gölgeli teknik', '📐 Shaded technical'], sketch: ['✏️ Kurşun kalem eskiz', '✏️ Pencil sketch'], clay: ['🏺 Beyaz kil', '🏺 White clay'], toon: ['🖍 Çizgi film (toon)', '🖍 Toon / cel'] };
const RENDER_BACKDROPS = { studio: ['⬜ Stüdyo', '⬜ Studio'], sky: ['🌤 Gökyüzü', '🌤 Sky'] };
/* ---------- Gökyüzü arka planı (issue #45) ----------
   Yalnızca render ve önizlemede: kamerayı ortalayan büyük bir küre + satır içi ShaderMaterial (resim dosyası,
   ek betik, Three.js eklentisi yok). Renkler güneş yüksekliğinden: öğlen mavi, alçak güneşte sıcak ufuk + parıltı.
   Sis rengi = ufuk rengi. r128'de sis, ton eşleme ve sRGB dönüşümünden SONRA karışır; bu yüzden gökyüzü de
   renkleri olduğu gibi (sRGB) yazar — ikisi aynı pikseli üretir ve zemin ufukta dikişsiz kaybolur. */
const lerpHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), clamp(t, 0, 1));
function skyColors(alt) {
  const t = clamp((alt - 6) / 50, 0, 1);              // 0 = alçak (altın saat), 1 = yüksek (öğle)
  return {
    zen: lerpHex(0x3d5a8f, 0x2f78c4, t),
    hor: lerpHex(0xf2b07a, 0xd6e8f5, Math.pow(t, 0.7)),
    gnd: lerpHex(0xb9a48c, 0xc7ccc9, t),
    glow: lerpHex(0xffb766, 0xfff4d6, t).multiplyScalar(0.35 + 0.65 * (1 - t)),
  };
}
// render seçeneklerinde güneş verilmediyse sahnedeki ana ışığın yönü
function lightSunVector(lights) {
  const l = lights && lights[0]; if (!l) return { x: 0.4, y: 0.7, z: -0.6 };
  const v = l.position.clone().sub(l.target.position).normalize(); return { x: v.x, y: v.y, z: v.z };
}
function makeSky(sv, cam, fit) {
  const alt = Math.asin(clamp(sv.y, -1, 1)) * 180 / Math.PI, c = skyColors(alt);
  const mat = new THREE.ShaderMaterial({
    uniforms: { zen: { value: c.zen }, hor: { value: c.hor }, gnd: { value: c.gnd }, glow: { value: c.glow }, sun: { value: new THREE.Vector3(sv.x, sv.y, sv.z).normalize() } },
    vertexShader: 'varying vec3 vDir;\nvoid main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform vec3 zen; uniform vec3 hor; uniform vec3 gnd; uniform vec3 glow; uniform vec3 sun; varying vec3 vDir;',
      'float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'void main() {',
      '  vec3 d = normalize(vDir); float h = d.y;',
      '  vec3 c = h > 0.0 ? mix(hor, zen, pow(h, 0.55)) : mix(hor, gnd, min(1.0, -h * 5.0));',
      '  float s = max(dot(d, sun), 0.0);',
      '  c += glow * (pow(s, 600.0) * 2.0 + pow(s, 24.0) * 0.45 + pow(s, 4.0) * 0.12);',
      '  gl_FragColor = vec4(c, 1.0);',
      '  gl_FragColor.rgb += (rnd(gl_FragCoord.xy) - 0.5) / 255.0;   // titreşim: geçişlerde bantlanma olmasın',
      '}',
    ].join('\n'),
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 24), mat);
  mesh.renderOrder = -1000; mesh.frustumCulled = false; mesh.position.copy(cam.position);
  // sis: binanın ötesinde başlar, 40 m'lik zeminin kenarından çok önce ufuk rengine ulaşır
  const sz = (fit && fit.sz) || 1000, d = cam.position.distanceTo(T3.ctl.target);
  const near = d + sz * 0.8, far = Math.min(17000, near + Math.max(5000, sz * 6));
  return { mesh, fog: new THREE.Fog(c.hor.clone(), near, Math.max(near + 1000, far)), horizon: c.hor.clone() };
}
const SUN_PRESETS = { morning: [['Sabah', 'Morning'], 100, 20], noon: [['Öğle', 'Noon'], 180, 68], golden: [['Altın saat', 'Golden hour'], 255, 12] };
const RENDER_RES = { view: ['Ekran ×2–3', 'Viewport ×2–3', 0], hd: ['1080p (1920 px)', '1080p (1920 px)', 1920], qhd: ['2K (2560 px)', '2K (2560 px)', 2560], uhd: ['4K (3840 px)', '4K (3840 px)', 3840] };
ui.studio = { style: 'realistic', az: 215, alt: 42, res: 'view', format: 'png', backdrop: null }; // backdrop null = stile göre (#45)
const studioBackdrop = () => ui.studio.backdrop || (ui.studio.style === 'realistic' ? 'sky' : 'studio');
// güneş yönü (az: kuzeyden saat yönünde, plan kuzeyi = −y = 3B −z; alt: ufuktan yükseklik)
function sunVector(az, alt) {
  const a = az * Math.PI / 180, e = clamp(alt, 1, 89) * Math.PI / 180;
  return { x: Math.sin(a) * Math.cos(e), y: Math.sin(e), z: -Math.cos(a) * Math.cos(e) };
}
// kurşun kalem son işlemi: gri ton + kontrast + kağıt dokusu + hafif tarama
function sketchFilter(cnv) {
  const w = cnv.width, h = cnv.height, t = document.createElement('canvas'); t.width = w; t.height = h;
  const c = t.getContext('2d'); c.filter = 'grayscale(1) contrast(1.35) brightness(1.06)'; c.drawImage(cnv, 0, 0); c.filter = 'none';
  c.globalAlpha = 0.05; c.strokeStyle = '#000'; c.lineWidth = Math.max(1, w / 1600);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) { const x = rnd() * w, y = rnd() * h, l = (8 + rnd() * 24) * w / 1600; c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y - l * 0.6); c.stroke(); }
  c.globalAlpha = 1;
  const g = cnv.getContext('2d'); g.clearRect(0, 0, w, h); g.drawImage(t, 0, 0);
}
function studioHtml(preview) {
  const st = ui.studio, opt = (m, v) => Object.entries(m).map(([k, x]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${L(x[0], x[1])}</option>`).join('');
  return `<h2>🎨 ${L('Render stüdyosu', 'Render studio')} <button class="btn sm" data-close>✕</button></h2>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin:0 0 10px">${Object.entries(RENDER_STYLES).map(([k, v]) => `<button class="btn sm${k === st.style ? ' primary' : ''}" data-rs-style="${k}">${L(...v)}</button>`).join('')}</div>
    <div class="row" style="flex-wrap:wrap;gap:6px;margin:0 0 10px;align-items:center"><span>${L('Arka plan', 'Backdrop')}</span>${Object.entries(RENDER_BACKDROPS).map(([k, v]) => `<button class="btn sm${k === studioBackdrop() ? ' primary' : ''}" data-rs-bg="${k}">${L(...v)}</button>`).join('')}</div>
    <div style="display:grid;grid-template-columns:auto 1fr auto;gap:6px 10px;align-items:center;margin-bottom:8px">
      <span>☀ ${L('Güneş yönü', 'Sun azimuth')}</span><input type="range" min="0" max="360" step="5" value="${st.az}" data-rs="az"><b>${st.az}°</b>
      <span>⛰ ${L('Güneş yüksekliği', 'Sun altitude')}</span><input type="range" min="10" max="85" step="1" value="${st.alt}" data-rs="alt"><b>${st.alt}°</b>
    </div>
    <div class="row" style="gap:6px;margin-bottom:8px">${Object.entries(SUN_PRESETS).map(([k, v]) => `<button class="btn sm" data-rs-sun="${k}">${L(...v[0])}</button>`).join('')}</div>
    <div class="row" style="gap:10px;margin-bottom:10px;flex-wrap:wrap"><label>${L('Çözünürlük', 'Resolution')} <select data-rs="res">${opt(RENDER_RES, st.res)}</select></label><label>${L('Biçim', 'Format')} <select data-rs="format"><option value="png" ${st.format === 'png' ? 'selected' : ''}>PNG</option><option value="jpeg" ${st.format === 'jpeg' ? 'selected' : ''}>JPEG</option></select></label></div>
    <div class="rs-prev" style="background:${studioBackdrop() === 'sky' ? '#d6e8f5' : '#fff'};border-radius:8px;min-height:120px;display:flex;align-items:center;justify-content:center;overflow:hidden">${preview ? `<img src="${preview}" style="max-width:100%;max-height:40vh;display:block">` : `<span class="muted" style="color:#64748b">${L('Önizleme için 👁 Önizle', 'Press 👁 Preview to see it')}</span>`}</div>
    <div class="row" style="gap:8px;margin-top:10px"><button class="btn sm" data-rs-go="preview">👁 ${L('Önizle', 'Preview')}</button><button class="btn sm primary" data-rs-go="render">🎬 ${L('Render al ve indir', 'Render & download')}</button></div>`;
}
const studioOpts = () => ({ style: ui.studio.style, backdrop: studioBackdrop(), sun: { az: ui.studio.az, alt: ui.studio.alt }, longSide: RENDER_RES[ui.studio.res][2] || 0, format: ui.studio.format });
function openRenderStudio(preview) {
  if (!ui.view3d) show3D(true);
  if (!ui.view3d) return;
  openModal(studioHtml(preview), 'studio');
}
$('#modal').addEventListener('input', e => {
  if (ui.modal !== 'studio') return;
  const t = e.target.closest('[data-rs]'); if (!t) return;
  const k = t.dataset.rs; ui.studio[k] = k === 'az' || k === 'alt' ? +t.value : t.value;
  if (t.nextElementSibling && (k === 'az' || k === 'alt')) t.nextElementSibling.textContent = t.value + '°';
});
$('#modal').addEventListener('click', async e => {
  if (ui.modal !== 'studio') return;
  const s = e.target.closest('[data-rs-style]'); if (s) { ui.studio.style = s.dataset.rsStyle; openRenderStudio(); return; }
  const bg = e.target.closest('[data-rs-bg]'); if (bg) { ui.studio.backdrop = bg.dataset.rsBg; openRenderStudio(); return; }
  const p = e.target.closest('[data-rs-sun]'); if (p) { const v = SUN_PRESETS[p.dataset.rsSun]; ui.studio.az = v[1]; ui.studio.alt = v[2]; openRenderStudio(); return; }
  const g = e.target.closest('[data-rs-go]'); if (!g || ui.shot) return;
  if (g.dataset.rsGo === 'render') { closeModal(); export3DRender(false, studioOpts()); return; }
  ui.shot = true; g.disabled = true;
  try { const url = await render3DHQ({ ...studioOpts(), longSide: 720, supersample: 1, frames: 1, format: 'jpeg' }); if (ui.modal === 'studio') openRenderStudio(url || null); }
  finally { ui.shot = false; }
});
/* ---------- Mobilya stüdyosu (çok parçalı mobilya oluşturucu / düzenleyici) ----------
   Tam ekran çalışma alanı: solda yapı taşları (sürükle-bırak), ortada 3B + üstten / önden / yandan görünüşler
   (parçayı sürükle = taşı, tutamaç = boyutlandır / döndür, mıknatıslı hizalama), sağda parça listesi ve alanlar.
   Her şey bir TASLAK (ui.pb.d) üzerinde olur; stüdyonun kendi geri-al yığını vardır (ui.pb.hist). ✓ Uygula / Plana
   yerleştir tek commit() ile yazar (planın tek geri-al adımı); İptal hiçbir şeyi değiştirmez.
   Taslak öğenin tasarım kutusu (pbase) ölçeğindedir; öğe yeniden boyutlandırılmışsa Uygula o ölçeği korur. */
const PB_TYPES = { box: ['Kutu', 'Box'], cyl: ['Silindir', 'Cylinder'], sphere: ['Küre', 'Sphere'], extrude: ['Profil', 'Outline'] };
const PB_MATS = { matte: ['Mat', 'Matte'], gloss: ['Parlak', 'Gloss'], metal: ['Metal', 'Metal'], glass: ['Cam', 'Glass'] };
const PB_AXES = { z: ['Dik', 'Upright'], x: ['Yatık (X)', 'Lying (X)'], y: ['Yatık (Y)', 'Lying (Y)'] };
const hex6 = c => { const s = String(c || '').replace('#', ''); return /^[0-9a-f]{6}$/i.test(s) ? '#' + s : /^[0-9a-f]{3}$/i.test(s) ? '#' + s.split('').map(x => x + x).join('') : '#b08968'; };
const pbItem = () => { const D = ui.pb.d; return { w: D.w, d: D.d, h: D.h, k: 'rect', color: D.color, parts: D.parts, pbase: { w: D.w, d: D.d, h: D.h } }; };
// yapı taşları: varsayılan ölçüler o anki kutudan türetilir; [anahtar, ikon, TR, EN, D => parça]
const FS_BLOCKS = [
  ['box', '▭', 'Kutu', 'Box', D => ({ type: 'box', w: Math.min(30, D.w), d: Math.min(30, D.d), h: Math.min(30, D.h) })],
  ['cyl', '◯', 'Silindir', 'Cylinder', D => ({ type: 'cyl', w: Math.min(20, D.w), d: Math.min(20, D.d), h: Math.min(30, D.h) })],
  ['sphere', '●', 'Küre', 'Sphere', D => { const s = Math.min(20, D.w, D.d, D.h); return { type: 'sphere', w: s, d: s, h: s }; }],
  ['rod', '━', 'Çubuk', 'Rod', D => ({ type: 'cyl', axis: 'x', w: Math.max(5, D.w * 0.8), d: 3, h: 3 })],
  ['leg', '▮', 'Ayak', 'Leg', D => ({ type: 'box', w: 5, d: 5, h: Math.max(5, D.h - 3), z: 0 })],
  ['rleg', '┃', 'Yuvarlak ayak', 'Round leg', D => ({ type: 'cyl', w: 5, d: 5, h: Math.max(5, D.h - 3), z: 0 })],
  ['top', '▬', 'Tabla', 'Top', D => ({ type: 'box', w: D.w, d: D.d, h: 3, z: Math.max(0, D.h - 3) })],
  ['shelf', '☰', 'Raf', 'Shelf', D => ({ type: 'box', w: Math.max(5, D.w - 4), d: Math.max(5, D.d - 2), h: 2 })],
  ['side', '▯', 'Yan panel', 'Side panel', D => ({ type: 'box', w: 2, d: D.d, h: D.h, x: -D.w / 2 + 1, z: 0 })],
  ['back', '▤', 'Arka panel', 'Back panel', D => ({ type: 'box', w: D.w, d: 1.5, h: D.h, y: -D.d / 2 + 0.75, z: 0 })],
  ['door', '🚪', 'Kapak', 'Door', D => ({ type: 'box', w: Math.max(5, D.w / 2 - 1), d: 2, h: Math.max(5, D.h * 0.8), y: D.d / 2 - 1, z: 0 })],
  ['drawer', '🗄', 'Çekmece önü', 'Drawer front', D => ({ type: 'box', w: Math.max(5, D.w - 4), d: 2, h: Math.min(15, D.h), y: D.d / 2 - 1 })],
  ['handle', '╍', 'Kulp', 'Handle', D => ({ type: 'cyl', axis: 'x', w: Math.min(12, D.w), d: 1.5, h: 1.5, mat: 'metal', color: '#9aa4b0' })],
  ['cushion', '🛋', 'Minder', 'Cushion', D => ({ type: 'box', w: Math.max(5, D.w * 0.9), d: Math.max(5, D.d * 0.8), h: Math.min(12, D.h), color: '#94a3b8' })],
  ['glass', '◇', 'Cam', 'Glass pane', D => ({ type: 'box', w: Math.max(5, D.w - 4), d: 1, h: Math.max(5, D.h * 0.6), mat: 'glass', color: '#a5d8f3' })],
];
const fsBlock = key => FS_BLOCKS.find(b => b[0] === key);
const fsDirty = () => ui.pb && (JSON.stringify(ui.pb.d) !== ui.pb.orig || (ui.pb.name || '') !== (ui.pb.name0 || ''));
const fsRound = v => ui.pb && ui.pb.snap ? Math.round(v) : partR(v);

// seçili mobilyadan taslak: parçası yoksa tek parçalık başlangıç (kutu / silindir / şeklin kendi profili)
function pbStart(o) {
  const has = Array.isArray(o.parts) && o.parts.length;
  let parts;
  if (has) parts = clonePlain(o.parts);
  else if (o.k === 'poly' && o.pts && o.pts.length >= 3) parts = [Object.assign(cleanPart({ type: 'extrude', pts: o.pts, h: o.h }), { name: L('gövde', 'body'), color: o.color })];
  else parts = [cleanPart({ name: L('gövde', 'body'), type: o.k === 'round' ? 'cyl' : 'box', w: o.w, d: o.d, h: o.h, color: partHex(o.color) ? o.color : undefined })];
  const b = has && o.pbase ? o.pbase : { w: o.w, d: o.d, h: o.h };
  fsInit(o.id, o.label || o.name || '', { w: partR(b.w), d: partR(b.d), h: partR(b.h), color: partHex(o.color) ? o.color : '#b08968', parts });
}
// yeni mobilya: boş kutu ya da hazır şablon (FURN_TEMPLATES)
function fsNew(tpl) {
  const t = FURN_TEMPLATES[tpl];
  const d = t ? { w: t.w, d: t.d, h: t.h, color: t.color, parts: t.parts(t.w, t.d, t.h).map(cleanPart) } : { w: 100, d: 60, h: 75, color: '#b08968', parts: [] };
  fsInit(null, t ? L(t.tr, t.en) : L('Yeni mobilya', 'New furniture'), d);
}
function fsInit(id, name, d) {
  const prevSnap = ui.pb ? ui.pb.snap : true;
  ui.pb = { id, name, name0: name, sel: d.parts.length ? 0 : -1, d, snap: prevSnap !== false, hist: [JSON.stringify(d)], hi: 0 };
  ui.pb.orig = ui.pb.hist[0];
  openStudio();
}
// stüdyo geçmişi: tamamlanmış her eylemden sonra (sürükleme bitti, alan değişti, düğme) bir anlık görüntü
function fsPush() {
  const P2 = ui.pb, j = JSON.stringify(P2.d);
  if (j === P2.hist[P2.hi]) return;
  P2.hist = P2.hist.slice(0, P2.hi + 1); P2.hist.push(j); if (P2.hist.length > 200) P2.hist.shift(); P2.hi = P2.hist.length - 1;
  fsSyncTop();
}
function fsUndo(dir) {
  const P2 = ui.pb, i = P2.hi + dir; if (i < 0 || i >= P2.hist.length) return;
  P2.hi = i; P2.d = JSON.parse(P2.hist[i]); P2.sel = Math.min(P2.sel, P2.d.parts.length - 1); pbRedraw();
}
// sorunlar, iki dilde: kutudan taşma, tabanın altı, öğe yüksekliğinin üstü, havada duran parça
function pbIssues() {
  const D = ui.pb.d, out = [], bs = D.parts.map(partBounds), tol = 1;
  const nm = (p, i) => `${i + 1}. ${esc(p.name || L(...PB_TYPES[p.type]))}`;
  D.parts.forEach((p, i) => {
    const b = bs[i];
    if (b.x0 < -D.w / 2 - tol || b.x1 > D.w / 2 + tol || b.y0 < -D.d / 2 - tol || b.y1 > D.d / 2 + tol) out.push({ i, err: true, t: L(`${nm(p, i)}: kutunun dışına taşıyor`, `${nm(p, i)}: sticks out of the item box`) });
    if (b.z0 < -tol) out.push({ i, err: true, t: L(`${nm(p, i)}: zeminin altında`, `${nm(p, i)}: below the floor`) });
    if (b.z1 > D.h + tol) out.push({ i, err: true, t: L(`${nm(p, i)}: üstü ${partR(b.z1)} cm, öğe yüksekliği ${D.h} cm`, `${nm(p, i)}: top at ${partR(b.z1)} cm, item height ${D.h} cm`) });
    if (b.z0 > 0.5 && !bs.some((c, j) => j !== i && c.z1 >= b.z0 - 1 && c.z0 < b.z0 && c.x0 < b.x1 && c.x1 > b.x0 && c.y0 < b.y1 && c.y1 > b.y0))
      out.push({ i, err: false, t: L(`${nm(p, i)}: havada duruyor (altında bir şey yok)`, `${nm(p, i)}: floats with nothing under it`) });
  });
  if (D.parts.length > PARTS_SOFT) out.push({ i: -1, err: false, t: L(`${D.parts.length} parça 3B için ağır; ${PARTS_SOFT} altında kalmaya çalışın`, `${D.parts.length} parts is heavy for 3D; try to stay under ${PARTS_SOFT}`) });
  return out;
}
function pbMsgs() {
  const is = pbIssues(), n = ui.pb.d.parts.length;
  if (!n) return `<div class="pb-msg warn">${L('Henüz parça yok: soldan bir yapı taşı sürükleyin ya da tıklayın', 'No parts yet: drag or click a building block on the left')}</div>`;
  if (!is.length) return `<div class="pb-msg ok">✓ ${L(`Her şey yerinde · ${n} parça`, `All parts fit · ${n} part${n > 1 ? 's' : ''}`)}</div>`;
  return is.map(x => `<div class="pb-msg ${x.err ? 'err' : 'warn'}"${x.i >= 0 ? ` data-pbsel="${x.i}"` : ''}>${x.err ? '⚠' : '•'} ${x.t}</div>`).join('');
}
function pbList() {
  const D = ui.pb.d;
  return D.parts.map((p, i) => `<button type="button" class="pb-item${i === ui.pb.sel ? ' on' : ''}" data-pbsel="${i}"><i style="background:${hex6(p.color || D.color)}"></i><span>${i + 1}. ${esc(p.name || L(...PB_TYPES[p.type]))}</span><small>${Math.round(p.w)}×${Math.round(p.d)}×${Math.round(p.h)}</small></button>`).join('')
    || `<p class="muted">${L('Henüz parça yok', 'No parts yet')}</p>`;
}
function pbFields() {
  const D = ui.pb.d, p = D.parts[ui.pb.sel];
  if (!p) return `<p class="muted">${L('Bir parça seçin ya da soldan ekleyin.', 'Select a part, or add one from the left.')}</p>`;
  const num = (lbl, k, v, o = {}) => `<label class="f"><span>${lbl}</span><input type="number" data-pf="${k}" value="${partR(v || 0)}" step="${o.step || 1}"${o.min !== undefined ? ` min="${o.min}"` : ''}></label>`;
  const pick = (lbl, k, v, map) => `<label class="f"><span>${lbl}</span><select data-pf="${k}">${Object.entries(map).map(([kk, x]) => `<option value="${kk}"${kk === v ? ' selected' : ''}>${L(...x)}</option>`).join('')}</select></label>`;
  const types = p.type === 'extrude' ? PB_TYPES : { box: PB_TYPES.box, cyl: PB_TYPES.cyl, sphere: PB_TYPES.sphere };
  return `<label class="f"><span>${L('Ad', 'Name')}</span><input type="text" data-pf="name" maxlength="40" value="${esc(p.name || '')}" placeholder="${L('ör. ayak', 'e.g. leg')}"></label>`
    + pick(L('Şekil', 'Shape'), 'type', p.type, types)
    + (p.type === 'cyl' ? pick(L('Duruş', 'Direction'), 'axis', p.axis || 'z', PB_AXES) : '')
    + `<label class="f"><span>${L('Renk', 'Colour')}</span><input type="color" data-pf="color" value="${hex6(p.color || D.color)}"></label>`
    + pick(L('Yüzey', 'Finish'), 'mat', p.mat || 'matte', PB_MATS)
    + `<h4>${L('Konum (cm)', 'Position (cm)')}</h4>` + num(L('Sağa / sola (X)', 'Left / right (X)'), 'x', p.x) + num(L('İleri / geri (Y)', 'Back / front (Y)'), 'y', p.y)
    + num(L('Yerden yükseklik', 'Height above floor'), 'z', p.z, { min: 0 })
    + `<div class="row"><button type="button" class="btn sm" data-pbact="ontop" title="${L('Altındaki en yüksek parçanın üstüne koyar', 'Puts it on the highest part under it')}">⬆ ${L('Üstüne oturt', 'Sit on top')}</button><button type="button" class="btn sm" data-pbact="floor">⤓ ${L('Yere indir', 'Put on floor')}</button></div>`
    + `<div class="row"><button type="button" class="btn sm" data-pbact="cx" title="${L('Sağ-sol ortaya al', 'Centre left / right')}">↔ ${L('Ortala', 'Centre')}</button><button type="button" class="btn sm" data-pbact="mirror" title="${L('Karşı tarafa aynalı bir kopya ekler (ör. ikinci ayak)', 'Adds a mirrored copy on the other side (e.g. the second leg)')}">⇋ ${L('Aynala kopyala', 'Mirror copy')}</button></div>`
    + `<h4>${L('Ölçü (cm)', 'Size (cm)')}</h4>`
    + (p.type === 'extrude' ? '' : num(L('Genişlik', 'Width'), 'w', p.w, { min: 0.1 }) + num(L('Derinlik', 'Depth'), 'd', p.d, { min: 0.1 }))
    + num(L('Yükseklik', 'Height'), 'h', p.h, { min: 0.1 }) + num(L('Döndür (°)', 'Rotate (°)'), 'rot', p.rot, { step: 15 })
    + `<div class="row"><button type="button" class="btn sm" data-pbact="dup">⧉ ${L('Çoğalt', 'Duplicate')}</button><button type="button" class="btn sm" data-pbact="del">🗑 ${L('Parçayı sil', 'Delete part')}</button></div>`;
}

/* --- 2B görünüşler: üstten (x, y), önden (x, −z), yandan (−y, −z); SVG birimi = cm --- */
const FS_VIEWS = ['top', 'front', 'side'];
const fsUV = (view, x, y, z) => view === 'top' ? [x, y] : view === 'front' ? [x, -z] : [-y, -z];
// görünüş düzleminde bir parçanın izdüşümü { a0, a1, b0, b1, round }
function fsProj(p, view, b = partBounds(p)) {
  if (view === 'front') return { a0: b.x0, a1: b.x1, b0: -b.z1, b1: -b.z0, round: p.type === 'sphere' || (p.type === 'cyl' && p.axis === 'y') };
  return { a0: -b.y1, a1: -b.y0, b0: -b.z1, b1: -b.z0, round: p.type === 'sphere' || (p.type === 'cyl' && p.axis === 'x') };
}
// görünüşün yatay ekseni parçanın hangi yerel ölçüsüne denk geliyor (döndürülmüşse w ↔ d)
const fsHorizKey = (p, view) => { const a = (p.rot || 0) * Math.PI / 180, wx = Math.abs(Math.cos(a)) >= Math.abs(Math.sin(a)); return view === 'front' ? (wx ? 'w' : 'd') : (wx ? 'd' : 'w'); };
function fsViewBox(view) {
  const D = ui.pb.d, m = Math.max(D.w, D.d, D.h) * 0.14 + 12;
  const [x, y, w, h] = view === 'top' ? [-D.w / 2, -D.d / 2, D.w, D.d] : view === 'front' ? [-D.w / 2, -D.h, D.w, D.h] : [-D.d / 2, -D.h, D.d, D.h];
  return [x - m, y - m, w + 2 * m, h + 2 * m];
}
function fsViewSvg(view, svg) {
  const D = ui.pb.d, C = pal(), s = ui.pb.sel, sp = D.parts[s], vb = fsViewBox(view);
  const k = svg && svg.clientWidth ? Math.min(svg.clientWidth / vb[2], svg.clientHeight / vb[3]) : 2; // px / cm
  const px = n => n / k, ns = 'vector-effect="non-scaling-stroke"';
  const line = `stroke="${C.furnStroke}" stroke-width="1" ${ns}`, hl = `fill="none" stroke="${C.accent}" stroke-width="2.5" ${ns}`;
  const bs = D.parts.map(p => partBounds(p));
  let o = `<defs><pattern id="fsg-${view}" width="10" height="10" patternUnits="userSpaceOnUse" x="0" y="0"><path d="M10 0H0V10" fill="none" stroke="${C.gMin}" stroke-width="1" ${ns}/></pattern></defs>`
    + `<rect x="${vb[0] - vb[2] * 5}" y="${vb[1] - vb[3] * 5}" width="${vb[2] * 11}" height="${vb[3] * 11}" fill="url(#fsg-${view})" data-bg="1"/>`; // ızgara, görünüşün tamamını doldurur
  const [bx, by, bw, bh] = view === 'top' ? [-D.w / 2, -D.d / 2, D.w, D.d] : view === 'front' ? [-D.w / 2, -D.h, D.w, D.h] : [-D.d / 2, -D.h, D.d, D.h];
  o += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="none" stroke="${C.sub}" stroke-dasharray="6 4" stroke-width="1" ${ns} pointer-events="none"/>`;
  if (view !== 'top') o += `<line x1="${vb[0]}" x2="${vb[0] + vb[2]}" y1="0" y2="0" stroke="${C.stroke}" stroke-width="2" ${ns} pointer-events="none"/>`;
  const shape = (p, i, col, attrs) => {
    if (view === 'top') return partShapeSvg(p, col, attrs);
    const q = fsProj(p, view, bs[i]);
    if (q.round) return `<ellipse cx="${(q.a0 + q.a1) / 2}" cy="${(q.b0 + q.b1) / 2}" rx="${(q.a1 - q.a0) / 2}" ry="${(q.b1 - q.b0) / 2}" fill="${col}" ${attrs}/>`;
    const r = p.type === 'cyl' && !p.axis ? 0 : p.type === 'cyl' ? Math.min(q.a1 - q.a0, q.b1 - q.b0) / 2 : 0;
    return `<rect x="${q.a0}" y="${q.b0}" width="${q.a1 - q.a0}" height="${q.b1 - q.b0}" rx="${r}" fill="${col}" ${attrs}/>`;
  };
  // uzaktan yakına: üstten = alçaktan yükseğe, önden = arkadan öne (y), yandan = soldan sağa (x)
  const key = view === 'top' ? i => bs[i].z1 : view === 'front' ? i => bs[i].y1 : i => bs[i].x1;
  D.parts.map((p, i) => i).sort((a, b) => key(a) - key(b) || a - b)
    .forEach(i => { o += `<g data-pi="${i}" style="cursor:move">${shape(D.parts[i], i, D.parts[i].color || D.color, line)}</g>`; });
  if (sp) {
    o += shape(sp, s, 'none', hl).replace(/fill="none" fill="none"/, 'fill="none"').replace('/>', ' pointer-events="none"/>');
    o += fsHandles(view, sp, bs[s], px(6), C);
  }
  if (ui.pb.guide && ui.pb.guide.views.includes(view)) {
    const g = ui.pb.guide, [u, v] = fsUV(view, g.axis === 'x' ? g.v : 0, g.axis === 'y' ? g.v : 0, g.axis === 'z' ? g.v : 0);
    const vert = (view === 'top' && g.axis === 'x') || (view === 'front' && g.axis === 'x') || (view === 'side' && g.axis === 'y');
    o += vert ? `<line x1="${u}" x2="${u}" y1="${vb[1]}" y2="${vb[1] + vb[3]}" stroke="${C.accent}" stroke-dasharray="5 4" stroke-width="1" ${ns} pointer-events="none"/>`
      : `<line x1="${vb[0]}" x2="${vb[0] + vb[2]}" y1="${v}" y2="${v}" stroke="${C.accent}" stroke-dasharray="5 4" stroke-width="1" ${ns} pointer-events="none"/>`;
  }
  return o;
}
// tutamaçlar: üstten = yerel eksenlerde 4 kenar + döndürme; önden / yandan = yatay iki kenar + üst / alt
function fsHandles(view, p, b, r, C) {
  const dot = (x, y, h, cur) => `<circle cx="${x}" cy="${y}" r="${r}" data-h="${h}" fill="${C.accent}" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke" style="cursor:${cur}"/>`;
  let o = '';
  if (view === 'top') {
    const a = (p.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), at = (lx, ly) => [p.x + lx * c - ly * s, p.y + lx * s + ly * c];
    if (p.type !== 'extrude') for (const [h, lx, ly] of [['w+', p.w / 2, 0], ['w-', -p.w / 2, 0], ['d+', 0, p.d / 2], ['d-', 0, -p.d / 2]]) { const [x, y] = at(lx, ly); o += dot(x, y, h, 'pointer'); }
    const [rx, ry] = at(0, -p.d / 2 - r * 5), [ex, ey] = at(0, -p.d / 2);
    o += `<line x1="${ex}" y1="${ey}" x2="${rx}" y2="${ry}" stroke="${C.accent}" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>` + dot(rx, ry, 'rot', 'grab');
    return o;
  }
  const q = fsProj(p, view, b), mid = (q.b0 + q.b1) / 2, am = (q.a0 + q.a1) / 2;
  if (p.type !== 'extrude') o += dot(q.a1, mid, 'a+', 'ew-resize') + dot(q.a0, mid, 'a-', 'ew-resize');
  return o + dot(am, q.b0, 'top', 'ns-resize') + dot(am, q.b1, 'bot', 'ns-resize');
}
function fsDrawViews() {
  for (const v of FS_VIEWS) {
    const svg = document.getElementById('fsv-' + v); if (!svg) continue;
    svg.setAttribute('viewBox', fsViewBox(v).join(' '));
    svg.innerHTML = fsViewSvg(v, svg);
  }
}
// ekran → görünüş (cm) koordinatı
function fsPt(svg, e) {
  const m = svg.getScreenCTM(); if (!m) return [0, 0];
  const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const r = pt.matrixTransform(m.inverse());
  return [r.x, r.y];
}
const fsCmPerPx = svg => { const m = svg.getScreenCTM(); return m && m.a ? 1 / m.a : 1; };
// mıknatıs: taşınan parçanın kenarlarını / ortasını diğer parçaların kenarlarına, kutuya ve zemine çeker
function fsMagnet(p, axis, tol, skip) {
  const D = ui.pb.d, b = partBounds(p), lo = axis === 'x' ? b.x0 : axis === 'y' ? b.y0 : b.z0, hi = axis === 'x' ? b.x1 : axis === 'y' ? b.y1 : b.z1;
  const half = axis === 'x' ? D.w / 2 : axis === 'y' ? D.d / 2 : 0, T = axis === 'z' ? [0, D.h] : [-half, 0, half];
  D.parts.forEach((q, i) => { if (i === skip) return; const c = partBounds(q); if (axis === 'z') T.push(c.z1, c.z0); else { const a0 = axis === 'x' ? c.x0 : c.y0, a1 = axis === 'x' ? c.x1 : c.y1; T.push(a0, a1, (a0 + a1) / 2); } });
  const edges = axis === 'z' ? [lo, hi] : [lo, hi, (lo + hi) / 2];
  let best = null;
  for (const t of T) for (const e of edges) { const dd = t - e; if (Math.abs(dd) <= tol && (!best || Math.abs(dd) < Math.abs(best.d))) best = { d: dd, v: t }; }
  return best;
}
// bir eksende taşı: önce mıknatıs, yoksa ızgara (1 cm); kılavuz çizgisi ui.pb.guide'a yazılır
function fsMoveAxis(p, axis, val, tol, skip, guides) {
  p[axis] = val;
  const m = ui.pb.snap ? fsMagnet(p, axis, tol, skip) : null;
  if (m) { p[axis] = partR(p[axis] + m.d); guides.push({ axis, v: m.v, views: axis === 'x' ? ['top', 'front'] : axis === 'y' ? ['top', 'side'] : ['front', 'side'] }); }
  else p[axis] = fsRound(p[axis]);
  if (axis === 'z' && p.z < 0) p.z = 0;
}
const FS_AX = { top: ['x', 'y', 1, 1], front: ['x', 'z', 1, -1], side: ['y', 'z', -1, -1] };
function fsStartDrag(e, svg, view) {
  const D = ui.pb.d, h = e.target.closest('[data-h]'), g = e.target.closest('[data-pi]');
  if (!h && !g) return;
  if (g && !h) { const i = +g.dataset.pi; if (i !== ui.pb.sel) { ui.pb.sel = i; pbRedraw(); } }
  const i = ui.pb.sel, p = D.parts[i]; if (!p) return;
  e.preventDefault(); try { svg.setPointerCapture(e.pointerId); } catch (er) { /* sentetik olay */ }
  const st = { view, svg, h: h && h.dataset.h, p0: clonePlain(p), pt0: fsPt(svg, e), tol: fsCmPerPx(svg) * 8, moved: false };
  const mv = ev => {
    const [u, v] = fsPt(svg, ev), du = u - st.pt0[0], dv = v - st.pt0[1];
    if (!st.moved && Math.hypot(du, dv) < fsCmPerPx(svg) * 2) return;
    st.moved = true;
    const q = D.parts[i]; if (!q) return;
    Object.assign(q, clonePlain(st.p0)); const guides = [];
    const [ax, bx, sa, sb] = FS_AX[view];
    if (!st.h) { fsMoveAxis(q, ax, st.p0[ax] + du * sa, st.tol, i, guides); fsMoveAxis(q, bx, st.p0[bx] + dv * sb, st.tol, i, guides); }
    else if (st.h === 'rot') { let a = Math.atan2(v - q.y, u - q.x) * 180 / Math.PI + 90; if (ui.pb.snap && !ev.shiftKey) a = Math.round(a / 15) * 15; a = ((a % 360) + 360) % 360; if (a) q.rot = partR(a); else delete q.rot; }
    else if (view === 'top') {
      // yerel eksen boyunca boyutlandır: karşı kenar yerinde kalır
      const lk = st.h[0], sg = st.h[1] === '+' ? 1 : -1, a = (q.rot || 0) * Math.PI / 180, ux = lk === 'w' ? Math.cos(a) : -Math.sin(a), uy = lk === 'w' ? Math.sin(a) : Math.cos(a);
      const proj = du * ux + dv * uy, size = Math.max(0.5, fsRound(st.p0[lk] + sg * proj)), dl = (size - st.p0[lk]) * sg;
      q[lk] = size; q.x = partR(st.p0.x + ux * dl / 2); q.y = partR(st.p0.y + uy * dl / 2);
    } else if (st.h === 'a+' || st.h === 'a-') {
      const lk = fsHorizKey(q, view), sg = st.h === 'a+' ? 1 : -1, size = Math.max(0.5, fsRound(st.p0[lk] + sg * du)), dl = (size - st.p0[lk]) * sg;
      q[lk] = size; q[ax] = partR(st.p0[ax] + sa * dl / 2);
    } else if (st.h === 'top') { q.h = Math.max(0.5, fsRound(st.p0.h - dv)); const m = ui.pb.snap ? fsMagnet(Object.assign({}, q, { z: q.z + q.h, h: 0 }), 'z', st.tol, i) : null; if (m) { q.h = partR(q.h + m.d); guides.push({ axis: 'z', v: m.v, views: ['front', 'side'] }); } }
    else if (st.h === 'bot') { const top = st.p0.z + st.p0.h; q.z = Math.max(0, Math.min(top - 0.5, fsRound(st.p0.z - dv))); q.h = partR(top - q.z); }
    ui.pb.guide = guides[guides.length - 1] || null;
    pbLive();
  };
  const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); ui.pb.guide = null; if (st.moved) { fsPush(); pbRedraw(); } else pbLive(); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
}
// yeni parça: bir yapı taşından, verilen noktaya (yoksa ortaya) — altındaki en yüksek parçanın üstüne oturur
function fsAddBlock(key, at) {
  const D = ui.pb.d, blk = fsBlock(key); if (!blk) return;
  if (D.parts.length >= PARTS_MAX) { toast(L(`En çok ${PARTS_MAX} parça`, `At most ${PARTS_MAX} parts`)); return; }
  const def = blk[4](D), q = cleanPart(Object.assign({ name: L(blk[2], blk[3]).toLowerCase(), color: D.color }, def));
  if (at) for (const k of ['x', 'y', 'z']) if (at[k] !== undefined) q[k] = fsRound(at[k]);
  if ((!at || at.z === undefined) && def.z === undefined) fsSitOnTop(q, D.parts); // ayak / panel zeminden, tabla kutunun üstünden başlar
  D.parts.push(q); ui.pb.sel = D.parts.length - 1; fsPush(); pbRedraw();
}
// yalnızca parçanın ALTINDA kalanlar sayılır (üstü parçanın tabanına kadar): ayak tablaya, isteka topa çıkmasın
function fsSitOnTop(p, parts, below = Infinity) {
  const b = partBounds(p); let z = 0;
  parts.forEach(q => { if (q === p) return; const c = partBounds(q); if (c.z1 <= below + 0.5 && c.x0 < b.x1 && c.x1 > b.x0 && c.y0 < b.y1 && c.y1 > b.y0) z = Math.max(z, c.z1); });
  p.z = partR(z);
}
function fsDrop(view, svg, e, key) {
  const [u, v] = fsPt(svg, e), [ax, bx, sa, sb] = FS_AX[view], at = {};
  at[ax] = u * sa; at[bx] = v * sb;
  if (at.z !== undefined) { const D = ui.pb.d, blk = fsBlock(key); const h = blk ? cleanPart(blk[4](D)).h : 10; at.z = Math.max(0, at.z - h / 2); }
  fsAddBlock(key, at);
}

/* --- 3B görünüş: yörünge, parçaya tıkla = seç, sürükle = yatay taşı (Shift = yukarı / aşağı) --- */
function fs3DInit() {
  const host = document.getElementById('fs3d'); if (!host) return;
  if (typeof THREE === 'undefined' || !THREE.OrbitControls) { host.innerHTML = `<p class="muted fs-no3d">${L('3B kitaplığı yüklenemedi; 2B görünüşleri kullanın.', '3D library unavailable; use the 2D views.')}</p>`; return; }
  const r = new THREE.WebGLRenderer({ antialias: true }); r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.outputEncoding = THREE.sRGBEncoding; host.appendChild(r.domElement);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(38, 1, 1, 20000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(300, 600, 400); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdbeafe, 0.25); fill.position.set(-400, 200, -300); scene.add(fill);
  const ctl = new THREE.OrbitControls(cam, r.domElement); ctl.enableDamping = false; ctl.maxPolarAngle = Math.PI * 0.495;
  const unit = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 32), sph: new THREE.SphereGeometry(1, 24, 16) };
  const F3 = ui.pb.f3 = { r, scene, cam, ctl, unit, sun, host, mats: [], root: null, help: null, ro: null, raf: 0 };
  const D = ui.pb.d, R = Math.max(D.w, D.d, D.h);
  cam.position.set(R * 1.25, R * 1.0 + D.h * 0.4, R * 1.6); ctl.target.set(0, D.h / 2, 0); ctl.update();
  ctl.addEventListener('change', fs3DRender);
  F3.ro = new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; r.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); fs3DRender(); });
  F3.ro.observe(host);
  // seç / sürükle
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), setNdc = e => { const b = r.domElement.getBoundingClientRect(); ndc.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1); ray.setFromCamera(ndc, cam); };
  r.domElement.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !F3.root) return;
    setNdc(e);
    const hit = ray.intersectObjects(F3.root.children, false)[0]; if (!hit) return;
    const i = F3.root.children.indexOf(hit.object); if (i < 0) return;
    if (i !== ui.pb.sel) { ui.pb.sel = i; pbRedraw(); }
    const p = ui.pb.d.parts[i], p0 = clonePlain(p); ctl.enabled = false;
    const vert = e.shiftKey, n = vert ? new THREE.Vector3(cam.position.x - p.x, 0, cam.position.z - p.y).normalize() : new THREE.Vector3(0, 1, 0);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, hit.point), start = hit.point.clone(), tmp = new THREE.Vector3();
    let moved = false;
    const mv = ev => {
      setNdc(ev); if (!ray.ray.intersectPlane(plane, tmp)) return;
      const q = ui.pb.d.parts[i]; if (!q) return;
      Object.assign(q, clonePlain(p0)); const guides = [], tol = Math.max(ui.pb.d.w, ui.pb.d.d) * 0.02 + 1;
      if (vert) fsMoveAxis(q, 'z', p0.z + tmp.y - start.y, tol, i, guides);
      else { fsMoveAxis(q, 'x', p0.x + tmp.x - start.x, tol, i, guides); fsMoveAxis(q, 'y', p0.y + tmp.z - start.z, tol, i, guides); }
      moved = true; ui.pb.guide = guides[guides.length - 1] || null; pbLive();
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); ctl.enabled = true; ui.pb.guide = null; if (moved) fsPush(); pbRedraw(); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
  fs3DBuild();
}
function fs3DBuild() {
  const F3 = ui.pb && ui.pb.f3; if (!F3) return;
  const { scene, unit } = F3;
  if (F3.holder) { scene.remove(F3.holder); F3.holder.traverse(o => { if (o.geometry && !Object.values(unit).includes(o.geometry)) o.geometry.dispose(); }); }
  for (const m of F3.mats) m.dispose(); F3.mats = [];
  if (F3.help) { scene.remove(F3.help); F3.help.geometry.dispose(); F3.help.material.dispose(); F3.help = null; }
  const D = ui.pb.d, lt = isLight(), cache = {};
  scene.background = new THREE.Color(lt ? 0xf3f1ec : 0x111821);
  const mat = (c, op) => { const k = c + '|' + (op || ''); if (!cache[k]) { cache[k] = new THREE.MeshLambertMaterial({ color: c, ...(op ? { transparent: true, opacity: op } : {}), side: THREE.DoubleSide }); F3.mats.push(cache[k]); } return cache[k]; };
  const pmat = (c, kind) => { if (!kind || kind === 'matte') return mat(c); if (kind === 'glass') return mat(c, 0.35); const k = c + '|' + kind; if (!cache[k]) { cache[k] = new THREE.MeshPhongMaterial({ color: c, shininess: kind === 'metal' ? 90 : 45, specular: kind === 'metal' ? 0x9aa4b0 : 0x2a2a2a, side: THREE.DoubleSide }); F3.mats.push(cache[k]); } return cache[k]; };
  const holder = new THREE.Group(); F3.holder = holder; scene.add(holder);
  // zemin + 10 cm ızgara + öğe kutusu
  const R = Math.max(D.w, D.d) * 1.6 + 40, gm = mat(lt ? '#e7e2d8' : '#1a2330');
  const ground = new THREE.Mesh(unit.box, gm); ground.scale.set(R * 2, 0.5, R * 2); ground.position.y = -0.26; holder.add(ground);
  const grid = new THREE.GridHelper(R * 2, Math.round(R * 2 / 10), lt ? 0xcfc8ba : 0x243244, lt ? 0xdcd6ca : 0x1b2635); grid.position.y = 0.02; holder.add(grid);
  F3.mats.push(grid.material);
  const bg0 = new THREE.BoxGeometry(D.w, D.h, D.d), boxE = new THREE.LineSegments(new THREE.EdgesGeometry(bg0), new THREE.LineBasicMaterial({ color: lt ? 0x94a3b8 : 0x475569 })); bg0.dispose();
  boxE.position.y = D.h / 2; holder.add(boxE); F3.mats.push(boxE.material);
  const g = new THREE.Group(); holder.add(g);
  if (D.parts.length) parts3D(g, { w: D.w, d: D.d, h: D.h, color: D.color, parts: D.parts, pbase: { w: D.w, d: D.d, h: D.h } }, { pmat, unit });
  F3.root = g.children[0] || null;
  const sel = F3.root && F3.root.children[ui.pb.sel];
  if (sel) { F3.help = new THREE.BoxHelper(sel, pal().accent); scene.add(F3.help); }
  fs3DRender();
}
function fs3DRender() { const F3 = ui.pb && ui.pb.f3; if (F3 && F3.r.domElement.width) F3.r.render(F3.scene, F3.cam); }
function fs3DDispose() {
  const F3 = ui.pb && ui.pb.f3; if (!F3) return;
  F3.ro && F3.ro.disconnect(); F3.ctl.dispose();
  if (F3.holder) F3.holder.traverse(o => { if (o.geometry && !Object.values(F3.unit).includes(o.geometry)) o.geometry.dispose(); });
  for (const m of F3.mats) m.dispose(); for (const gg of Object.values(F3.unit)) gg.dispose();
  if (F3.help) { F3.help.geometry.dispose(); F3.help.material.dispose(); }
  F3.r.dispose(); ui.pb.f3 = null;
}

/* --- yerleşim, yeniden çizim, olaylar --- */
function openStudio() {
  document.getElementById('fstudio')?.remove();
  ui.modal = 'parts'; document.body.classList.add('fs-open');
  const D = ui.pb.d, isNew = !ui.pb.id;
  const tplOpts = Object.entries(FURN_TEMPLATES).map(([k, t]) => `<option value="${k}">${t.icon} ${L(t.tr, t.en)}</option>`).join('');
  const blocks = FS_BLOCKS.map(([k, ic, tr, en]) => `<button type="button" class="fs-blk" draggable="true" data-blk="${k}" title="${L('Sürükleyip bir görünüşe bırakın ya da tıklayın', 'Drag onto a view, or click')}"><span>${ic}</span>${L(tr, en)}</button>`).join('');
  const bf = (lbl, k) => `<label class="f"><span>${lbl}</span><input type="number" data-pbox="${k}" value="${partR(D[k])}" min="1" step="1"></label>`;
  const view = (v, cap) => `<div class="fs-v" data-view="${v}"><div class="fs-cap">${cap}</div><svg id="fsv-${v}" preserveAspectRatio="xMidYMid meet"></svg></div>`;
  const root = document.createElement('div'); root.id = 'fstudio'; root.className = 'fs';
  root.innerHTML = `<header class="fs-top">
      <b class="fs-title">🧩 ${L('Mobilya stüdyosu', 'Furniture studio')}</b>
      <input id="fsName" maxlength="60" value="${esc(ui.pb.name)}" placeholder="${L('Mobilya adı', 'Furniture name')}">
      <button type="button" class="btn sm" data-fs="undo" title="${L('Geri al (Ctrl+Z)', 'Undo (Ctrl+Z)')}">↶</button><button type="button" class="btn sm" data-fs="redo" title="${L('Yinele (Ctrl+Y)', 'Redo (Ctrl+Y)')}">↷</button>
      <select id="fsTpl" title="${L('Hazır bir mobilyadan başla', 'Start from a ready-made piece')}"><option value="">📐 ${L('Şablondan başla…', 'Start from a template…')}</option><option value="__empty">▢ ${L('Boş', 'Empty')}</option>${tplOpts}</select>
      <label class="chk-pill"><input type="checkbox" id="fsSnap"${ui.pb.snap ? ' checked' : ''}> ${L('Yakala', 'Snap')}</label>
      <span class="spacer"></span>
      <button type="button" class="btn sm" data-fs="cancel">${L('İptal', 'Cancel')}</button>
      <button type="button" class="btn sm" data-fs="savelib" title="${L('Uygular ve ⬡ Kütüphanem’e ekler', 'Applies and adds it to ⬡ My Library')}">💾 ${L('Kütüphaneye kaydet', 'Save to library')}</button>
      <button type="button" class="btn sm primary" data-fs="apply">✓ ${isNew ? L('Plana yerleştir', 'Place in plan') : L('Uygula', 'Apply')}</button>
    </header>
    <aside class="fs-pal"><h4>${L('Yapı taşları', 'Building blocks')}</h4>${blocks}
      <p class="muted fs-tip">${L('Sürükle: parçayı taşı. Mavi noktalar: boyut / döndür. Kenarlar yakındaki parçalara yapışır. Ok tuşları: 1 cm (Shift 10). Del: sil. Ctrl+D: çoğalt.', 'Drag a part to move it. Blue dots resize / rotate. Edges stick to nearby parts. Arrow keys: 1 cm (Shift 10). Del: delete. Ctrl+D: duplicate.')}</p></aside>
    <main class="fs-views">
      <div class="fs-v fs-3dv" data-view="3d"><div class="fs-cap">3B · ${L('döndür: boşluğu sürükle · parçayı sürükle: taşı (Shift: yukarı)', 'orbit: drag empty space · drag a part to move it (Shift: up / down)')}</div><div id="fs3d"></div></div>
      ${view('top', L('Üstten', 'Top'))}${view('front', L('Önden', 'Front'))}${view('side', L('Yandan (ön ◀ ▶ arka)', 'Side (front ◀ ▶ back)'))}
    </main>
    <aside class="fs-side">
      <h4>📦 ${L('Öğe kutusu (cm)', 'Item box (cm)')}</h4>
      ${bf(L('Genişlik', 'Width'), 'w')}${bf(L('Derinlik', 'Depth'), 'd')}${bf(L('Yükseklik', 'Height'), 'h')}
      <div class="row"><button type="button" class="btn sm" data-pbact="fit" title="${L('Kutuyu tüm parçaları alacak kadar büyütür / küçültür', 'Grows or shrinks the box to hold every part')}">📦 ${L('Kutuyu parçalara uydur', 'Fit box to parts')}</button></div>
      <div id="pbMsg"></div>
      <h4>🧩 ${L('Parçalar', 'Parts')}</h4><div id="pbList" class="pb-list"></div>
      <div id="pbFields"></div>
    </aside>`;
  document.body.appendChild(root);
  fsWire(root);
  fs3DInit();
  pbRedraw();
  requestAnimationFrame(() => { if (ui.modal === 'parts') fsDrawViews(); }); // ilk düzenden sonra tutamaç boyları doğru olsun
}
function fsSyncTop() {
  const P2 = ui.pb, u = document.querySelector('#fstudio [data-fs="undo"]'), r = document.querySelector('#fstudio [data-fs="redo"]');
  if (u) u.disabled = P2.hi <= 0; if (r) r.disabled = P2.hi >= P2.hist.length - 1;
}
const pbLive = () => { if (ui.modal !== 'parts') return; fsDrawViews(); $('#pbList').innerHTML = pbList(); $('#pbMsg').innerHTML = pbMsgs(); fs3DBuild(); };
const pbRedraw = () => {
  if (ui.modal !== 'parts') return; pbLive(); $('#pbFields').innerHTML = pbFields(); fsSyncTop();
  for (const k of ['w', 'd', 'h']) { const el = document.querySelector(`#fstudio [data-pbox="${k}"]`); if (el && document.activeElement !== el) el.value = partR(ui.pb.d[k]); }
};
function fsClose() {
  fs3DDispose(); document.getElementById('fstudio')?.remove(); document.body.classList.remove('fs-open');
}
function fsCancel() {
  if (fsDirty() && !confirm(L('Uygulanmamış değişiklikler silinsin mi?', 'Discard the changes you have not applied?'))) return;
  closeModal();
}
// taslağı plana yazar: var olan öğe güncellenir, yeni mobilya görünümün ortasına yerleşir; toLib = kütüphaneye de ekle
function pbApply(toLib) {
  const D = ui.pb.d, name = (ui.pb.name || '').trim().slice(0, 60);
  if (pbIssues().some(x => x.err)) { toast(L('Önce ⚠ işaretli sorunları düzeltin (ya da 📦 Kutuyu parçalara uydur)', 'Fix the ⚠ problems first (or 📦 Fit box to parts)')); return; }
  let o;
  if (ui.pb.id) {
    const f = find(ui.pb.id); if (!f) { closeModal(); return; }
    o = f.o; const old = Array.isArray(o.parts) && o.parts.length && o.pbase ? o.pbase : { w: o.w, d: o.d, h: o.h };
    for (const k of ['w', 'd', 'h']) o[k] = partR(D[k] * (+o[k] > 0 && +old[k] > 0 ? o[k] / old[k] : 1)); // öğe büyütülmüşse aynı ölçek kalır
    if (name && name !== ui.pb.name0) { if (o.label) o.label = name; else o.name = name; }
  } else {
    if (!D.parts.length) { toast(L('Önce birkaç parça ekleyin', 'Add a few parts first')); return; }
    const c = view2DCenter();
    o = { id: uid(), type: 'custom', name: name || L('Mobilya', 'Furniture'), icon: '🧩', k: 'rect', w: D.w, d: D.d, h: D.h, color: D.color, x: Math.round(c.x), y: Math.round(c.y), rot: 0, label: '' };
    F().furn.push(o);
  }
  if (D.parts.length) { o.parts = D.parts.map(cleanPart); o.pbase = { w: D.w, d: D.d, h: D.h }; o.partsV = PARTS_V; }
  else { delete o.parts; delete o.pbase; delete o.partsV; }
  const isNew = !ui.pb.id;
  if (toLib || isNew) { P.lib.presets = P.lib.presets || []; P.lib.presets.push(presetFromObj('furn', o, name || o.name)); }
  closeModal(); sel = [o.id]; commit(); refresh(); buildLib(); if (ui.view3d && T3) schedBuild3D();
  toast(isNew ? L('Plana yerleştirildi ve ⬡ Kütüphanem’e eklendi', 'Placed in the plan and added to ⬡ My Library')
    : toLib ? L('Uygulandı ve ⬡ Kütüphanem’e eklendi', 'Applied and added to ⬡ My Library') : L('Parçalar uygulandı (Ctrl+Z geri alır)', 'Parts applied (Ctrl+Z undoes)'));
}
function fsAct(act) {
  const D = ui.pb.d, p = D.parts[ui.pb.sel];
  if (act === 'fit') {
    let w = 1, d = 1, h = 1;
    for (const q of D.parts) { const b = partBounds(q); w = Math.max(w, 2 * Math.abs(b.x0), 2 * Math.abs(b.x1)); d = Math.max(d, 2 * Math.abs(b.y0), 2 * Math.abs(b.y1)); h = Math.max(h, b.z1); }
    Object.assign(D, { w: Math.ceil(w), d: Math.ceil(d), h: Math.ceil(h) }); fsPush(); pbRedraw(); return;
  }
  if (!p) return;
  if (act === 'dup' || act === 'mirror') {
    if (D.parts.length >= PARTS_MAX) { toast(L(`En çok ${PARTS_MAX} parça`, `At most ${PARTS_MAX} parts`)); return; }
    const q = clonePlain(p);
    if (act === 'mirror') { q.x = partR(-p.x); if (q.rot) q.rot = partR((360 - q.rot) % 360); if (q.pts) q.pts = q.pts.map(t => ({ x: -t.x, y: t.y })).reverse(); if (Math.abs(q.x - p.x) < 0.5) q.y = partR(-p.y); }
    else q.x = partR(q.x + Math.min(10, p.w));
    D.parts.splice(ui.pb.sel + 1, 0, q); ui.pb.sel++;
  } else if (act === 'del') { D.parts.splice(ui.pb.sel, 1); ui.pb.sel = Math.min(ui.pb.sel, D.parts.length - 1); }
  else if (act === 'floor') p.z = 0;
  else if (act === 'cx') p.x = 0;
  else if (act === 'ontop') fsSitOnTop(p, D.parts, partBounds(p).z0);
  fsPush(); pbRedraw();
}
function fsWire(root) {
  root.addEventListener('input', e => {
    const t = e.target, D = ui.pb.d;
    if (t.id === 'fsName') { ui.pb.name = t.value; return; }
    if (t.dataset.pbox) { const v = +t.value; if (t.value !== '' && v > 0) { D[t.dataset.pbox] = partR(v); pbLive(); } return; }
    const k = t.dataset.pf, p = D.parts[ui.pb.sel]; if (!k || !p || t.tagName === 'SELECT') return;
    if (k === 'name') { if (t.value.trim()) p.name = t.value.slice(0, 40); else delete p.name; }
    else if (k === 'color') p.color = t.value;
    else {
      const v = +t.value; if (t.value === '' || !Number.isFinite(v)) return;
      if ((k === 'w' || k === 'd' || k === 'h') && !(v > 0)) return;
      if (k === 'rot') { if (v) p.rot = v; else delete p.rot; } else p[k] = v;
    }
    pbLive();
  });
  root.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'fsSnap') { ui.pb.snap = t.checked; return; }
    if (t.id === 'fsTpl') {
      const k = t.value; t.value = ''; if (!k) return;
      if (ui.pb.d.parts.length && !confirm(L('Şablon, şu anki parçaların yerini alsın mı? (Geri al ile dönebilirsiniz)', 'Replace the current parts with this template? (Undo brings them back)'))) return;
      const tp = FURN_TEMPLATES[k];
      ui.pb.d = tp ? { w: tp.w, d: tp.d, h: tp.h, color: tp.color, parts: tp.parts(tp.w, tp.d, tp.h).map(cleanPart) } : { w: ui.pb.d.w, d: ui.pb.d.d, h: ui.pb.d.h, color: ui.pb.d.color, parts: [] };
      if (tp && !ui.pb.id && (!ui.pb.name || ui.pb.name === ui.pb.name0)) { ui.pb.name = ui.pb.name0 = L(tp.tr, tp.en); const n = root.querySelector('#fsName'); if (n) n.value = ui.pb.name; }
      ui.pb.sel = ui.pb.d.parts.length ? 0 : -1; fsPush(); pbRedraw(); return;
    }
    const D = ui.pb.d, p = D.parts[ui.pb.sel];
    if (t.tagName === 'SELECT' && t.dataset.pf && p) {
      const k = t.dataset.pf, v = t.value;
      if (k === 'type') { p.type = v; if (v !== 'cyl') delete p.axis; if (v !== 'extrude') delete p.pts; }
      else if (k === 'axis') { if (v === 'z') delete p.axis; else p.axis = v; }
      else if (k === 'mat') { if (v === 'matte') delete p.mat; else p.mat = v; }
      fsPush(); pbRedraw(); return;
    }
    if (t.dataset.pf || t.dataset.pbox) { fsPush(); pbRedraw(); } // sayı / renk / ad alanı bitti → tek geçmiş adımı
  });
  root.addEventListener('click', e => {
    const fsb = e.target.closest('[data-fs]');
    if (fsb) { const a = fsb.dataset.fs; if (a === 'undo') fsUndo(-1); else if (a === 'redo') fsUndo(1); else if (a === 'cancel') fsCancel(); else if (a === 'apply') pbApply(false); else if (a === 'savelib') pbApply(true); return; }
    const blk = e.target.closest('[data-blk]'); if (blk) { fsAddBlock(blk.dataset.blk); return; }
    const pick = e.target.closest('#pbList [data-pbsel], #pbMsg [data-pbsel]'); if (pick) { ui.pb.sel = +pick.dataset.pbsel; pbRedraw(); return; }
    const a = e.target.closest('[data-pbact]'); if (a) fsAct(a.dataset.pbact);
  });
  root.addEventListener('dragstart', e => { const b = e.target.closest('[data-blk]'); if (b) { e.dataTransfer.setData('text/plain', 'fsblk:' + b.dataset.blk); e.dataTransfer.effectAllowed = 'copy'; } });
  for (const v of FS_VIEWS) {
    const svg = root.querySelector('#fsv-' + v), box = svg.parentElement;
    svg.addEventListener('pointerdown', e => { if (e.button === 0) fsStartDrag(e, svg, v); });
    box.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; box.classList.add('drop'); });
    box.addEventListener('dragleave', () => box.classList.remove('drop'));
    box.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('drop'); const s = e.dataTransfer.getData('text/plain'); if (s.startsWith('fsblk:')) fsDrop(v, svg, e, s.slice(6)); });
  }
  const b3 = root.querySelector('.fs-3dv');
  b3.addEventListener('dragover', e => { e.preventDefault(); b3.classList.add('drop'); });
  b3.addEventListener('dragleave', () => b3.classList.remove('drop'));
  b3.addEventListener('drop', e => { e.preventDefault(); b3.classList.remove('drop'); const s = e.dataTransfer.getData('text/plain'); if (s.startsWith('fsblk:')) fsAddBlock(s.slice(6)); });
}
// stüdyo açıkken klavye (yazı alanı dışında): Esc, Delete, Ctrl+Z / Y, Ctrl+D, oklar, PageUp / PageDown
function fsKey(e) {
  const D = ui.pb.d, p = D.parts[ui.pb.sel], ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (e.key === 'Escape') { fsCancel(); return; }
  if (ctrl && k === 'z') { e.preventDefault(); fsUndo(e.shiftKey ? 1 : -1); return; }
  if (ctrl && k === 'y') { e.preventDefault(); fsUndo(1); return; }
  if (ctrl && k === 'd') { e.preventDefault(); fsAct('dup'); return; }
  if (!p) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); fsAct('del'); return; }
  const st = e.shiftKey ? 10 : 1, mv = { ArrowLeft: ['x', -st], ArrowRight: ['x', st], ArrowUp: ['y', -st], ArrowDown: ['y', st], PageUp: ['z', st], PageDown: ['z', -st] }[e.key];
  if (mv) { e.preventDefault(); p[mv[0]] = partR(Math.max(mv[0] === 'z' ? 0 : -Infinity, p[mv[0]] + mv[1])); fsPush(); pbRedraw(); }
}
/** The top-bar PNG button is context-aware, so say what it will do. */
function syncExportTitles() {
  const b = $('#bPng');
  if (b) {
    b.title = ui.view3d
      ? L('3B render al (yüksek kalite) — Shift: hızlı görünüm', 'Render the 3D view (high quality) — Shift: quick capture')
      : L('2B planı PNG olarak kaydet', 'Save the 2D plan as a PNG');
  }
  const s = $('#b3dShot');
  if (s) s.title = L('🎬 Render al (PNG) — Shift: hızlı görünüm', '🎬 Render (PNG) — Shift: quick capture');
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
/* 2B ⇄ 3B kamera hafızası (issue #37). 2B'de aynı yere bakıyorsak kullanıcının
   bıraktığı 3B kamera korunur; belirgin biçimde başka bir yere kaydıysa ya da
   yeni bir nesne seçiliyse kamera 2B'de bakılan alana taşınır. */
const CAM_KEEP_RADIUS = 200; // cm — 2B merkezi bu kadar kayarsa kamera yeniden yönlenir

/** 2B tuvalin merkezindeki dünya koordinatı (cm). */
function view2DCenter() {
  const z = Math.max(view.z, 0.01);
  return { x: (cv.clientWidth / 2 - view.x) / z, y: (cv.clientHeight / 2 - view.y) / z };
}
/** 3B kameranın hedefleyeceği nokta: seçim varsa sınırlayıcı kutu, yoksa tuval merkezi. */
function view3DFocus() {
  const os = selObjs(), b = os.length ? selectionBounds(os) : null;
  if (b) return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, span: Math.max(b.x1 - b.x0, b.y1 - b.y0), sel: true };
  // span = 2B'de görünen dünyanın yarıçapı: yakınlaştıkça 3B kamera da yaklaşır
  const c = view2DCenter();
  return { x: c.x, y: c.y, span: Math.max(cv.clientWidth, cv.clientHeight) / 2 / Math.max(view.z, 0.01), sel: false };
}
/** Kamerayı 2B'de bakılan alana yerleştirir (varsayılan uzak tepe noktası yerine). */
function orient3DFrom2D(fo) {
  if (!T3 || !T3.cam || !T3.ctl) return;
  const f = fo || view3DFocus(), fit = T3.fit || {};
  let tx = f.x, tz = f.y;
  // 2B'de çok uzağa kaydırılmış olsa bile plan kadrajda kalsın
  if (fit.x0 != null) {
    const px = Math.max(200, (fit.x1 - fit.x0) * 0.35), pz = Math.max(200, (fit.z1 - fit.z0) * 0.35);
    tx = clamp(tx, fit.x0 - px, fit.x1 + px); tz = clamp(tz, fit.z0 - pz, fit.z1 + pz);
  }
  // seçili nesne çerçevelenir; seçim yoksa 2B görüş alanı kadar yaklaşılır
  const span = f.sel ? Math.max(f.span, 240) : clamp(f.span * 0.85, 200, Math.max(300, (fit.sz || 2000) * 2.2));
  const d = clamp(span * 1.55, 300, 6000);
  // 2B'de hangi kattaysak 3B'de de o seviyeye bak (kat seçici tek katı zemine indirir)
  const elev = ui.v3dFloor === 'all' ? floorElev(fi) : 0;
  T3.ctl.target.set(tx, elev + 80, tz);
  T3.cam.position.set(tx + d * 0.62, elev + 80 + d * 0.92, tz + d * 0.9);
  T3.ctl.update(); fitOrtho();
}
function show3D(on) {
  if (on && (!window.THREE || !THREE.OrbitControls)) { toast(L('3B için internet bağlantısı gerekli (Three.js yüklenemedi)', 'Internet connection required for 3D (Three.js failed to load)')); return; }
  ui.view3d = on; keys3D.clear(); $('#v3d').style.display = on ? 'block' : 'none'; $('#b2d').classList.toggle('on', !on); $('#b3d').classList.toggle('on', on);
  $('#zoomctl').style.display = on ? 'none' : ''; updateTools(); syncExportTitles();
  if (on) {
    init3D();
    const focus = view3DFocus(), c = view2DCenter(), selKey = sel.slice().sort().join(',');
    // aynı 2B noktası + aynı seçim => kullanıcının bıraktığı 3B kamera korunur
    const moved = !T3.center2d || dist(T3.center2d, c) > CAM_KEEP_RADIUS;
    const keep = !!T3.lastCam && !moved && !(focus.sel && selKey !== (T3.selKey || ''));
    T3.selKey = selKey;
    if (keep) { T3.cam.position.copy(T3.lastCam.pos); T3.ctl.target.copy(T3.lastCam.target); }
    build3D(keep);
    if (!keep) orient3DFrom2D(focus);
    T3.center2d = c;
    T3.lastT = 0; T3.run = true; loop3D();
  } else if (T3) {
    exitWalk(true); // yürüme modundan çıkılır: saklanan kamera yörünge kamerasıdır
    // 2B'ye dönerken bırakılan kamera: bir sonraki girişte aynen geri gelir
    T3.lastCam = { pos: T3.cam.position.clone(), target: T3.ctl.target.clone() };
    T3.run = false;
  }
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
  const cam = new THREE.PerspectiveCamera(CAM_FOV, 1, 10, 50000);
  // paralel izdüşüm (#74): görünüş / kesit / izometri; çerçeve fitOrtho() ile perspektifin hedefteki boyutuna eşlenir
  const ocam = new THREE.OrthographicCamera(-500, 500, 500, -500, -40000, 60000);
  // 3B mobilya etkileşimi: OrbitControls'ten ÖNCE kaydedilir ki sürüklerken yörünge devre dışı kalabilsin
  let d3 = null;
  const ray3 = e => {
    T3.cam.updateMatrixWorld(); scene.updateMatrixWorld(); // rAF durmuşsa da matrisler taze olsun (arka plan sekmesi/etkileşim)
    const rect = r.domElement.getBoundingClientRect();
    return camRay(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1));
  };
  const floorPlane = elev => new THREE.Plane(new THREE.Vector3(0, 1, 0), -elev);
  r.domElement.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !ui.view3d) return;
    if (T3 && T3.walk) { T3.walk.drag = { x: e.clientX, y: e.clientY }; return; } // yürüme (#46): sürükle = etrafa bak
    const rc = ray3(e);
    const hits = rc.intersectObjects(scene.children, true).filter(h => h.object.isMesh);
    if (!hits.length) return;
    // en yakın mesh kazanır: duvar/döşeme arkasındaki mobilya seçilmez (örtücüye saygı)
    let cur = hits[0].object;
    while (cur && !(cur.userData && (cur.userData.furnId || cur.userData.opId))) cur = cur.parent;
    if (!cur) return;
    if (!pickable(cur.userData.opId || cur.userData.furnId)) return; // kilitli katman (#32): yörünge serbest
    if (cur.userData.opId) {
      // kapı/pencere (#29): tık = seç (kapıda aç/kapa), sürükle = duvar boyunca kaydır
      const fo = findAnyFloor(cur.userData.opId), wd = fo && fo.kind === 'op' && fo.floor.walls.find(w => w.id === fo.o.wall);
      if (!wd) return;
      e.stopImmediatePropagation(); // orbit başlamasın
      sel = [fo.o.id];
      const p0 = opDragHit(rc.ray, wd, cur.userData.elev || 0);
      d3 = { op: true, id: fo.o.id, wallId: wd.id, elev: cur.userData.elev || 0, sx: e.clientX, sy: e.clientY, moved: false, alt: e.altKey, d0: fo.o.d, t0: p0 ? p0.t : null };
      refreshSel3D(); renderProps();
      return;
    }
    const fd = findAnyFloor(cur.userData.furnId);
    if (!fd || fd.kind !== 'furn') return;
    const o = fd.o, elev = cur.userData.elev || 0, p0 = new THREE.Vector3();
    if (!rc.ray.intersectPlane(floorPlane(elev), p0)) return;
    e.stopImmediatePropagation(); // orbit başlamasın
    sel = o.grp && !grpEditing(o) ? groupMemberIdsAny(o.grp) : [o.id];
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
    if (T3 && T3.walk && T3.walk.drag) { walkLook(e.clientX - T3.walk.drag.x, e.clientY - T3.walk.drag.y); T3.walk.drag = { x: e.clientX, y: e.clientY }; return; }
    if (!d3) return;
    if (!d3.moved && Math.hypot(e.clientX - d3.sx, e.clientY - d3.sy) < 4) return;
    d3.moved = true;
    if (d3.op) {
      const fo = findAnyFloor(d3.id), w = fo && fo.floor.walls.find(x => x.id === d3.wallId); if (!w || d3.t0 == null) return;
      const p = opDragHit(ray3(e).ray, w, d3.elev); if (!p) return;
      const L = wLen(w); let d = d3.d0 + p.t - d3.t0;
      if (ui.snap && !e.shiftKey) d = rnd(d, 5);
      fo.o.d = clamp(d, Math.min(fo.o.w / 2, L / 2), Math.max(L - fo.o.w / 2, L / 2));
      schedBuild3D(); return;
    }
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
      else if (AB_KINDS.has(fd.kind)) { fo.a = { x: g0.a.x + dx, y: g0.a.y + dy }; fo.b = { x: g0.b.x + dx, y: g0.b.y + dy }; }
      else if (PTS_KINDS.has(fd.kind)) fo.pts = g0.pts.map(q => ({ x: q.x + dx, y: q.y + dy })); // oda/poligon da grupsa birlikte
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
    if (T3 && T3.walk) T3.walk.drag = null;
    if (!d3 || e.button !== 0) return;
    if (d3.op) {
      const { id, moved, alt } = d3; d3 = null;
      const fd = findAnyFloor(id); if (!fd) return;
      if (moved) { commit(); refresh(); build3D(true); return; }
      const o = fd.o;
      if (!alt && isDoorOp(o)) toggleDoor3D(o); // Alt+tık: açmadan yalnızca seç
      else { refresh(); refreshSel3D(); }
      return;
    }
    const { id, moved } = d3; d3 = null;
    const fd = findAnyFloor(id); if (!fd || fd.kind !== 'furn') return;
    if (moved) {
      if (sel.length === 1 && fd.floorIdx === fi) magnet(fd.o); // 2B ile aynı: yakın duvara yapış (yalnızca kendi katında)
      commit(); refresh();
      schedBuild3D(); // tutkal/rotasyon/pin değişimi olabilir -> sahne tazelensin
    } else { if (fd.floorIdx === fi && fd.o.grp && !grpEditing(fd.o) && cycleGroupVars(fd.o.grp)) return; refresh(); refreshSel3D(); } // düz tık: pointerdown'daki seçim (grup/tek) korunur
  });
  const ctl = new THREE.OrbitControls(cam, r.domElement); ctl.enableDamping = true; ctl.maxPolarAngle = ORBIT_MAX_POLAR;
  let downPt = null;
  r.domElement.addEventListener('pointerdown', e => { if (e.button === 0) downPt = { x: e.clientX, y: e.clientY }; });
  r.domElement.addEventListener('pointerup', e => {
    const dp = downPt; downPt = null; // eski bir basış konumu sonraki tıkı tetiklemesin
    if (!dp || e.button !== 0 || Math.hypot(e.clientX - dp.x, e.clientY - dp.y) > 5) return;
    T3.cam.updateMatrixWorld(); scene.updateMatrixWorld();
    const rect = r.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const rc = camRay(mouse);
    const hits = rc.intersectObjects(scene.children, true).filter(h => h.object.isMesh); // kenar çizgileri (LineSegments) tık çalmasın
    if (T3.walk) { walkClick(hits.length ? hits[0].object : null, e.altKey); return; }
    if (!hits.length) return;
    // en yakın mesh kazanır: örtücünün arkasındaki kapı/duvar tıklanamaz
    let cur = hits[0].object;
    while (cur && !cur.userData?.wallId && !cur.userData?.opId && !cur.userData?.roomId) cur = cur.parent;
    let hit3 = false;
    if (cur && cur.userData?.opId) hit3 = true; // açıklıklar pointerdown/pointerup (d3) yolunda işlenir
    else if (cur && cur.userData?.roomId) {
      // oda zemini (#66): düzeni olan oda / grup tıkla → sıradaki düzen; Alt+tık → odayı seç; düzensiz oda boş zemin gibi davranır
      const fd = findAnyFloor(cur.userData.roomId);
      if (fd && fd.kind === 'room' && fd.floorIdx === fi && pickable(fd.o.id)) {
        if (e.altKey) { sel = [fd.o.id]; refresh(); refreshSel3D(); hit3 = true; }
        else if (fd.o.grp && !grpEditing(fd.o) && cycleGroupVars(fd.o.grp)) { sel = groupMemberIds(fd.o.grp); build3D(true); hit3 = true; }
        else if (cycleRoomVars(fd.o)) { sel = [fd.o.id]; build3D(true); hit3 = true; }
      }
    }
    else if (cur && cur.userData?.wallId && findAnyFloor(cur.userData.wallId) && (() => { const l = layerById(findAnyFloor(cur.userData.wallId).o.layer); return !l || !l.lock; })()) {
      const fd = findAnyFloor(cur.userData.wallId);
      if (fd && fd.kind === 'wall' && (e.altKey || grpEditing(fd.o) || (!fd.o.grp && !(Array.isArray(fd.o.angles) && fd.o.angles.length >= 2)))) {
        sel = [fd.o.id]; refresh(); refreshSel3D(); // düz duvar (veya Alt+tık): seç → yan panelde yükseklik/kalınlık/tür/boya (#29)
      } else if (fd && fd.kind === 'wall' && fd.o.grp) {
        if (fd.floorIdx === fi && cycleGroupVars(fd.o.grp)) { sel = groupMemberIds(fd.o.grp); build3D(true); }
      } else if (fd && fd.kind === 'wall' && Array.isArray(fd.o.angles) && fd.o.angles.length >= 2) {
        cycleWallPos(fd.o); sel = [fd.o.id]; commit(); refresh(); build3D(true);
        toast(L(`Duvar: Konum ${fd.o.posIdx + 1}/${fd.o.angles.length} (${fd.o.angles[fd.o.posIdx]}°)`, `Wall: Position ${fd.o.posIdx + 1}/${fd.o.angles.length} (${fd.o.angles[fd.o.posIdx]}°)`));
      }
      hit3 = true;
    }
    if (!hit3 && sel.length) { sel = []; render(); refreshSel3D(); renderProps(); } // boşluğa tıkla -> seçimi bırak
  });
  T3 = { r, scene, cam, ctl, pcam: cam, ocam, ortho: false, run: false }; resize3D(); window.addEventListener('resize', () => { if (T3 && ui.view3d) resize3D(); });
}
function resize3D() { const el = $('#v3d'); T3.r.setSize(el.clientWidth, el.clientHeight); setCamAspect(T3.cam, el.clientWidth / (el.clientHeight || 1)); }
/* ---------- Perspektif / paralel (ortografik) kamera (#74) ----------
   T3.pcam (perspektif) ve T3.ocam (ortografik) aynı yörünge kontrolünü paylaşır; T3.cam etkin olanı gösterir.
   Geçişte konum, hedef ve bakış yönü korunur; ortografik çerçeve = perspektifin hedef uzaklığındaki görüntü boyutu. */
const CAM_FOV = 50;
function camAspectOf(cam) { return cam.isOrthographicCamera ? (cam.right - cam.left) / ((cam.top - cam.bottom) || 1) : cam.aspect; }
function setCamAspect(cam, a) {
  if (!(a > 0)) a = 1;
  if (cam.isOrthographicCamera) { const h = (cam.top - cam.bottom) / 2 || 500; cam.left = -h * a; cam.right = h * a; cam.top = h; cam.bottom = -h; }
  else cam.aspect = a;
  cam.updateProjectionMatrix();
}
// hedefteki görüntü yarı yüksekliği (perspektif: uzaklık · tan(fov/2); ortografik: çerçeve / zoom)
function viewHalfH(cam, dist) { return cam.isOrthographicCamera ? (cam.top - cam.bottom) / 2 / (cam.zoom || 1) : dist * Math.tan(cam.fov * Math.PI / 360); }
// ortografik çerçeveyi kameranın hedef uzaklığına göre kur (kamera ön ayarlarından sonra çağrılır)
function fitOrtho() {
  if (!T3 || !T3.ortho) return;
  const o = T3.ocam, h = Math.max(50, o.position.distanceTo(T3.ctl.target) * Math.tan(CAM_FOV * Math.PI / 360)), a = camAspectOf(o);
  o.top = h; o.bottom = -h; o.zoom = 1; setCamAspect(o, a);
}
// ışın: ortografikte kaynak kameranın çok gerisine çekilir (negatif near ile çizilen her şey tıklanabilsin)
function camRay(ndc) {
  const rc = new THREE.Raycaster(); rc.setFromCamera(ndc, T3.cam);
  if (T3.cam.isOrthographicCamera) rc.ray.origin.addScaledVector(rc.ray.direction, -40000);
  return rc;
}
function setProjection(ortho) {
  if (!T3 || !T3.ocam) return;
  ortho = !!ortho;
  if (ortho && T3.walk) { T3.orthoAfterWalk = true; syncProjUI(); return; } // yürüme hep göz hizasında perspektif
  if (T3.ortho === ortho) { syncProjUI(); return; }
  const from = T3.cam, to = ortho ? T3.ocam : T3.pcam, t = T3.ctl.target, el = $('#v3d');
  const dist = from.position.distanceTo(t) || 1000, half = viewHalfH(from, dist), a = el && el.clientHeight ? el.clientWidth / el.clientHeight : camAspectOf(from);
  if (ortho) {
    to.position.copy(from.position); to.top = half; to.bottom = -half; to.zoom = 1;
  } else {
    // aynı görüntü boyutu: kamera hedeften fov'a göre uzaklaşır / yaklaşır, bakış yönü aynı kalır
    const dir = from.position.clone().sub(t); if (dir.lengthSq() < 1e-6) dir.set(0, 1, 1);
    to.position.copy(t).addScaledVector(dir.normalize(), clamp(half / Math.tan(to.fov * Math.PI / 360), 50, 45000));
  }
  to.up.copy(from.up); to.quaternion.copy(from.quaternion); setCamAspect(to, a);
  T3.cam = to; T3.ctl.object = to; T3.ortho = ortho; T3.ctl.update();
  syncProjUI();
}
function syncProjUI() {
  const b = $('#b3dProj'); if (!b || !T3) return;
  const o = T3.ortho || !!T3.orthoAfterWalk;
  b.classList.toggle('on', o); b.textContent = o ? '▱' : '△';
  b.title = o ? L('Paralel (ortografik) izdüşüm — perspektife geç', 'Parallel (orthographic) projection — switch to perspective') : L('Perspektif — paralel (ortografik) izdüşüme geç', 'Perspective — switch to parallel (orthographic) projection');
}
function set3DCam(kind) {
  if (!T3 || !T3.fit) return;
  if (kind !== 'eye') exitWalk(false);
  else if (!T3.walk) T3.walkSaved = { pos: T3.cam.position.clone(), target: T3.ctl.target.clone() }; // Esc buraya döner
  const f = T3.fit;
  const { cx, cz, sz, elev } = f;
  const x0 = f.x0 != null ? f.x0 : cx - sz / 2, x1 = f.x1 != null ? f.x1 : cx + sz / 2;
  const z0 = f.z0 != null ? f.z0 : cz - sz / 2, z1 = f.z1 != null ? f.z1 : cz + sz / 2;
  const w = Math.max(x1 - x0, 200), d = Math.max(z1 - z0, 200);

  if (ELEV_DIRS[kind]) { // cephe görünüşü (#31): cepheye dik, binayı çerçeveleyen kamera
    const n = ELEV_DIRS[kind]; camAlong(n, { x: (x0 + x1) / 2, y: (z0 + z1) / 2 }, n.x ? d : w, elev || P.wallH); return;
  }
  if (kind === 'iso') {
    // izometri (#74): 45° azimut (güneydoğudan), 35.26° yükseklik; paralel izdüşüme geçer (sonra perspektife de alınabilir)
    const dist = (Math.max(w, d, elev || 0) * 1.2 + 400), k = dist / Math.sqrt(3), ty = (elev || P.wallH) / 2;
    if (!T3.ortho) setProjection(true);
    T3.cam.position.set(cx + k, ty + k, cz + k);
    T3.ctl.target.set(cx, ty, cz);
  } else if (kind === 'top') {
    T3.cam.position.set(cx, elev + sz * 2.1, cz + 1);
    T3.ctl.target.set(cx, 0, cz);
  } else if (kind === 'eye') {
    // Stand in the LARGEST room and look across it — placing the camera along
    // the building axis just parks it against a partition wall.
    // (The old code sat at cz + 0.95·sz, i.e. outside the building entirely.)
    const r = eyeRoom();
    const px0 = r ? r.x0 : x0, px1 = r ? r.x1 : x1;
    const pz0 = r ? r.z0 : z0, pz1 = r ? r.z1 : z1;
    const eCx = (px0 + px1) / 2;
    const longZ = (pz1 - pz0) >= (px1 - px0);
    if (longZ) {
      T3.cam.position.set(eCx, elev + 165, pz1 - Math.min(60, (pz1 - pz0) / 4));
      T3.ctl.target.set(eCx, elev + 115, pz0 + (pz1 - pz0) * 0.35);
    } else {
      T3.cam.position.set(px1 - Math.min(60, (px1 - px0) / 4), elev + 165, (pz0 + pz1) / 2);
      T3.ctl.target.set(px0 + (px1 - px0) * 0.35, elev + 115, (pz0 + pz1) / 2);
    }
  } else {
    const dist = Math.max(w, d) * 1.15 + 300;
    T3.cam.position.set(cx + w * 0.35, elev + dist * 0.85, cz + dist);
    T3.ctl.target.set(cx, elev + 40, cz);
  }
  T3.ctl.update(); if (kind !== 'eye') fitOrtho();
  if (kind === 'eye') enterWalk(); // göz hizası = yürüme modu (#46): başlangıç noktası ve bakış yönü yukarıdan
}
/* Bounding box of the biggest room on the current floor — the best spot to stand. */
function eyeRoom() {
  const f = P && P.floors[fi];
  if (!f || !f.rooms || !f.rooms.length) return null;
  let best = null, bestArea = 0;
  for (const r of f.rooms) {
    if (!r.pts || r.pts.length < 3) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of r.pts) {
      if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
      if (p.y < z0) z0 = p.y; if (p.y > z1) z1 = p.y;
    }
    const a = (x1 - x0) * (z1 - z0);
    if (a > bestArea) { bestArea = a; best = { x0, x1, z0, z1, area: a }; }
  }
  // ignore slivers/degenerate polygons
  return best && best.area > 10000 ? best : null;
}
/* ---------- Yürüme modu (#46) ---------- */
const ORBIT_MAX_POLAR = Math.PI / 2.02;
// göz yüksekliği, gövde yarıçapı (cm), yürüme / koşma hızı (cm/s), bakış hassasiyeti (rad/px), bakış sınırı (rad)
const WALK = { eye: 165, r: 20, speed: 140, run: 320, look: 0.004, pitch: 1.35 };
/** Kemerler ve açık kapılar geçit verir; kapalı kapı ve pencere duvar sayılır. */
function walkPassable(o) { return o.type === 'arch' || (isDoorOp(o) && !!o.open); }
/** Bir katın yürürken geçilemeyen duvar parçaları: { a, b, h } (h = yarım kalınlık), geçit veren açıklıklar çıkarılmış. */
function walkSegs(f) {
  const out = [];
  for (const w of (f && f.walls) || []) {
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y); if (L < 1) continue;
    const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L, h = (w.t || 20) / 2;
    const at = t => ({ x: w.a.x + ux * t, y: w.a.y + uy * t });
    const gaps = ((f.ops) || []).filter(o => o.wall === w.id && walkPassable(o))
      .map(o => [o.d - o.w / 2, o.d + o.w / 2]).sort((p, q) => p[0] - q[0]);
    let t0 = 0;
    for (const [s, e] of gaps) { if (s - t0 > 0.5) out.push({ a: at(t0), b: at(s), h }); t0 = Math.max(t0, e); }
    if (L - t0 > 0.5) out.push({ a: at(t0), b: at(L), h });
  }
  return out;
}
/** Yarıçapı r olan bir daireyi (plan cm) mv kadar taşır; duvar kutularına girmez, açılı çarpınca boyunca kayar. */
function walkMove(p, mv, segs, r) {
  const len = Math.hypot(mv.x, mv.y), n = Math.max(1, Math.ceil(len / (r * 0.5))); // ince duvardan tünellemesin
  let x = p.x, y = p.y;
  for (let i = 0; i <= n; i++) {
    if (i) { x += mv.x / n; y += mv.y / n; }
    for (let it = 0; it < 4; it++) {
      let hit = false;
      for (const s of segs) {
        const L = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y); if (L < 1e-6) continue;
        const ux = (s.b.x - s.a.x) / L, uy = (s.b.y - s.a.y) / L, dx = x - s.a.x, dy = y - s.a.y;
        const u = dx * ux + dy * uy, v = -dx * uy + dy * ux;            // duvarın yerel ekseninde
        const eu = u - Math.min(L, Math.max(0, u)), ev = v - Math.min(s.h, Math.max(-s.h, v)), d = Math.hypot(eu, ev);
        if (d >= r) continue;
        let nu, nv, pen;
        if (d > 1e-6) { nu = eu / d; nv = ev / d; pen = r - d; }
        else { // merkez duvarın içinde: en yakın yüzden çık
          const c = [[L - u, 1, 0], [u, -1, 0], [s.h - v, 0, 1], [s.h + v, 0, -1]].sort((p2, q) => p2[0] - q[0])[0];
          pen = c[0] + r; nu = c[1]; nv = c[2];
        }
        x += (nu * ux - nv * uy) * pen; y += (nu * uy + nv * ux) * pen; hit = true;
      }
      if (!hit) break;
    }
  }
  return { x, y };
}
// yürüyenin katı: 3B'de tek kat seçiliyse o, yoksa 2B'deki kat; kotu build3D ile aynı
function walkFloorIdx() { const i = ui.v3dFloor === 'all' ? -1 : P.floors.findIndex(f => f.id === ui.v3dFloor); return i >= 0 ? i : fi; }
function walkElev(i) { return ui.v3dFloor === 'all' ? floorElev(i) : 0; }
function walkSegsAt(i) { const f = P.floors[i]; return f ? walkSegs(visFloor(f)) : []; }
function enterWalk() {
  if (!T3) return;
  const c = T3.cam.position.clone(), t = T3.ctl.target.clone(), i = walkFloorIdx(); // göz noktası: izdüşüm değişmeden önce
  if (T3.ortho) { T3.orthoAfterWalk = true; setProjection(false); } // yürüme hep perspektif (#74); çıkınca paralele döner
  const p = walkMove({ x: c.x, y: c.z }, { x: 0, y: 0 }, walkSegsAt(i), WALK.r); // duvarın içinde başlamasın
  T3.walk = { fi: i, x: p.x, y: p.y, yaw: Math.atan2(t.z - c.z, t.x - c.x), pitch: -0.15, drag: null };
  T3.ctl.enabled = false; T3.ctl.maxPolarAngle = Math.PI; // yukarı bakınca render'daki ctl.update() bakışı kırpmasın
  applyWalkCam(); syncWalkUI();
}
function exitWalk(restore) {
  if (!T3 || !T3.walk) return;
  T3.walk = null; T3.ctl.enabled = true; T3.ctl.maxPolarAngle = ORBIT_MAX_POLAR;
  if (restore && T3.walkSaved) { T3.cam.position.copy(T3.walkSaved.pos); T3.ctl.target.copy(T3.walkSaved.target); }
  T3.walkSaved = null; T3.ctl.update(); syncWalkUI();
  if (T3.orthoAfterWalk) { T3.orthoAfterWalk = false; setProjection(true); fitOrtho(); }
}
function walkToFloor(i) {
  const w = T3.walk; w.fi = i;
  const p = walkMove(w, { x: 0, y: 0 }, walkSegsAt(i), WALK.r); w.x = p.x; w.y = p.y;
}
// kamera + hedef (render ve 2B dönüşü hedefi okur): hedef 1 m ileride
function applyWalkCam() {
  const w = T3.walk, y = walkElev(w.fi) + WALK.eye, cp = Math.cos(w.pitch);
  T3.cam.position.set(w.x, y, w.y);
  T3.ctl.target.set(w.x + Math.cos(w.yaw) * cp * 100, y + Math.sin(w.pitch) * 100, w.y + Math.sin(w.yaw) * cp * 100);
  T3.cam.lookAt(T3.ctl.target);
}
function walkLook(dx, dy) {
  const w = T3.walk;
  w.yaw += dx * WALK.look; w.pitch = clamp(w.pitch - dy * WALK.look, -WALK.pitch, WALK.pitch);
  applyWalkCam();
}
function walkStep(dt) {
  const w = T3.walk, k = keys3D;
  const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
  const s = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
  if (f || s) { // Q / E (uçma) yürürken yok sayılır
    const sp = (k.has('shift') ? WALK.run : WALK.speed) * dt / Math.hypot(f, s), cy = Math.cos(w.yaw), sy = Math.sin(w.yaw);
    const p = walkMove(w, { x: (cy * f - sy * s) * sp, y: (sy * f + cy * s) * sp }, walkSegsAt(w.fi), WALK.r);
    w.x = p.x; w.y = p.y;
  }
  applyWalkCam();
}
function toggleDoor3D(o) {
  o.open = o.open ? 0 : 90; commit(); refresh(); build3D(true);
  toast(o.open ? (o.type === 'slide' ? L('Sürgülü kapı açıldı', 'Sliding door opened') : L('Kapı açıldı (90°)', 'Door opened (90°)')) : (o.type === 'slide' ? L('Sürgülü kapı kapandı', 'Sliding door closed') : L('Kapı kapandı', 'Door closed')));
}
// yürürken tık: kapı aç/kapa (Alt: yalnızca seç), mobilya / duvar / pencere seç, boşluk seçimi bırakır
function walkClick(obj, alt) {
  let cur = obj;
  while (cur && !(cur.userData && (cur.userData.opId || cur.userData.furnId || cur.userData.wallId))) cur = cur.parent;
  const id = cur && (cur.userData.opId || cur.userData.furnId || cur.userData.wallId), fd = id && findAnyFloor(id);
  if (!fd || !pickable(id)) { if (sel.length) { sel = []; render(); refreshSel3D(); renderProps(); } return; }
  sel = [id];
  if (fd.kind === 'op' && !alt && isDoorOp(fd.o)) toggleDoor3D(fd.o);
  else { refresh(); refreshSel3D(); }
}
// 👁 düğmesi etkin görünür; kısa iki dilli ipucu (#walkHint, ilk kullanımda oluşturulur)
function syncWalkUI() {
  const on = !!(T3 && T3.walk);
  if ($('#b3dEye')) $('#b3dEye').classList.toggle('on', on);
  if ($('#hud') && ui.view3d) $('#hud').style.display = on ? 'none' : ''; // yörünge ipucu (Q/E, Fare: Döndür) yürürken yanlış olur
  let h = document.getElementById('walkHint');
  if (!on) { if (h) h.style.display = 'none'; return; }
  if (!h) { h = document.createElement('div'); h.id = 'walkHint'; $('#v3d').appendChild(h); }
  h.textContent = L('🚶 Yürüme modu · WASD / oklar: yürü · Shift: koş · sürükle: etrafa bak · kapıya tıkla: aç / kapa · Esc: çık',
    '🚶 Walk mode · WASD / arrows: walk · Shift: run · drag: look around · click a door: open / close · Esc: exit');
  h.style.display = '';
}
function loop3D() {
  if (!T3 || !T3.run) return;
  requestAnimationFrame(loop3D);
  // kare süresi (s): hız her makinede aynı olsun; sekme arkadayken büyük sıçrama olmasın
  const now = performance.now(), dt = Math.min(0.1, T3.lastT ? (now - T3.lastT) / 1000 : 1 / 60); T3.lastT = now;
  if (T3.walk) { walkStep(dt); T3.r.render(T3.scene, T3.cam); return; } // OrbitControls.update() bakışı ezmesin
  if (keys3D.size) {
    const spd = (keys3D.has('shift') ? 1320 : 540) * dt; // eskiden 60 fps'de kare başına 22 / 9 cm
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
  const accent = { wood: '#b08968', tile: '#94a3b8', marble: '#e7e5e4', concrete: '#a8a29e', stone: '#a8a29e', grass: '#4d7c0f', water: '#0e7490', gravel: '#a8a29e', deck: '#9a6b3f', asphalt: '#3f3f46' }[kind] || '#9ca3af';
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
  } else if (kind === 'marble') {
    // damarlı mermer: deterministik (Math.random yok) ki her build aynı görünsün
    g.strokeStyle = line; g.globalAlpha = 0.45;
    for (let i = 0; i < 5; i++) {
      g.lineWidth = 0.8 + (i % 3) * 0.6; g.beginPath();
      let x = 0, y = (i * 53 + 20) % px; g.moveTo(x, y);
      while (x < px) { x += 18; y += Math.sin(x * 0.045 + i * 1.7) * 9 + (i % 2 ? 3 : -2); g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, px / 2); g.lineTo(px, px / 2); g.moveTo(px / 2, 0); g.lineTo(px / 2, px); g.stroke();
  } else if (kind === 'concrete') {
    // ince taneli şap: sabit tohumlu küçük benekler
    let sd = 7;
    const rnd01 = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 900; i++) { g.fillStyle = rnd01() > 0.5 ? line : shade(base, lt ? 0.12 : -0.12); g.globalAlpha = 0.25 + rnd01() * 0.3; g.fillRect(rnd01() * px, rnd01() * px, 1.5, 1.5); }
    g.globalAlpha = 1;
  } else if (kind === 'stone') {
    // dış mekan taşı: şaşırtmalı farklı ölçülü karolar
    g.strokeStyle = line; g.lineWidth = 4;
    const rows = [[0, 0.62], [0.3, 0.8], [0.15, 0.55, 0.85], [0.45]];
    rows.forEach((xs, i) => {
      const y = i * px / 4; g.beginPath(); g.moveTo(0, y); g.lineTo(px, y);
      for (const x of xs) { g.moveTo(x * px, y); g.lineTo(x * px, y + px / 4); }
      g.stroke();
    });
  } else if (kind === 'grass' || kind === 'asphalt' || kind === 'gravel') {
    // dış mekan (#39): sabit tohumlu prosedürel doku — çim sapları, asfalt tanesi, çakıl taneleri
    let sd = kind === 'grass' ? 11 : kind === 'gravel' ? 23 : 5;
    const rnd01 = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    if (kind === 'grass') {
      g.lineWidth = 1.4;
      for (let i = 0; i < 1400; i++) { const x = rnd01() * px, y = rnd01() * px, l = 3 + rnd01() * 5; g.strokeStyle = shade(base, (rnd01() - 0.5) * (lt ? 0.5 : 0.6)); g.globalAlpha = 0.5 + rnd01() * 0.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd01() - 0.5) * 3, y - l); g.stroke(); }
    } else if (kind === 'asphalt') {
      for (let i = 0; i < 2600; i++) { g.fillStyle = rnd01() > 0.5 ? shade(base, 0.35) : shade(base, -0.35); g.globalAlpha = 0.2 + rnd01() * 0.35; g.fillRect(rnd01() * px, rnd01() * px, 1.6, 1.6); }
    } else {
      for (let i = 0; i < 520; i++) { const r = 2 + rnd01() * 4.5; g.fillStyle = shade(base, (rnd01() - 0.5) * 0.7); g.globalAlpha = 0.9; g.beginPath(); g.ellipse(rnd01() * px, rnd01() * px, r, r * (0.6 + rnd01() * 0.4), rnd01() * 3.14, 0, 6.2832); g.fill(); }
    }
    g.globalAlpha = 1;
  } else if (kind === 'water') {
    // su: açık tonlu dalga çizgileri (malzeme yarı saydam ve parlak, bkz. floorMat)
    g.strokeStyle = shade(base, 0.45); g.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      g.globalAlpha = 0.25 + (i % 3) * 0.1; g.beginPath();
      for (let x = 0; x <= px; x += 8) { const y = i * px / 8 + 10 + Math.sin(x * 0.049 + i * 1.3) * 5; x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
  } else if (kind === 'deck') {
    // ahşap deck: aralıklı tahtalar + damar + şaşırtmalı ekler
    for (let i = 0; i < 8; i++) {
      const y = i * px / 8; g.fillStyle = shade(base, ((i * 37) % 7 - 3) * 0.025); g.fillRect(0, y + 2, px, px / 8 - 4);
      g.strokeStyle = line; g.globalAlpha = 0.25; g.lineWidth = 1;
      for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(0, y + 8 + k * 12); g.bezierCurveTo(px * 0.3, y + 6 + k * 12, px * 0.6, y + 11 + k * 12, px, y + 8 + k * 12); g.stroke(); }
      g.globalAlpha = 1; g.fillStyle = shade(base, -0.55); g.fillRect(0, y, px, 2.5); g.fillRect(0, y + px / 8 - 2, px, 2);
      g.fillRect((i % 2 ? 0.62 : 0.2) * px, y, 2.5, px / 8);
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 4;
  const rep = { wood: 160, tile: 120, marble: 240, concrete: 200, stone: 200, grass: 120, water: 320, gravel: 90, deck: 120, asphalt: 160 }[kind] || 80; // cm cinsinden karo boyu
  t.repeat.set(1 / rep, 1 / rep);
  C.floorTex[key] = t; C.texs.push(t);
  return t;
}
// Özel doku (#40): kendi görseli, P.textures'taki w × h cm'de tekrarlanır; 2B ile aynı yön (flipY yok)
function customTexture(id, C) {
  const key = 'tex|' + id; if (C.floorTex[key]) return C.floorTex[key];
  const m = texMeta(id), t = new THREE.Texture(TEX.get(id).img);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; t.flipY = false; t.needsUpdate = true;
  t.repeat.set(1 / m.w, 1 / m.h);
  C.floorTex[key] = t; C.texs.push(t); return t;
}
// Kaplama malzemesi: yerleşik desen oda rengiyle harmanlanır, özel doku kendi rengiyle, su (#39) yarı saydam + parlak.
// kind önce finishKind() ile doğrulanmış olmalı
function floorMat(kind, color, lt, C) {
  const id = texIdOf(kind);
  if (id) return new THREE.MeshLambertMaterial({ map: customTexture(id, C), side: THREE.DoubleSide });
  const map = floorTexture(kind, color, lt, C);
  if (kind === 'water') return new THREE.MeshPhongMaterial({ map, transparent: true, opacity: 0.78, shininess: 80, specular: 0x5f8fb0, depthWrite: false, side: THREE.DoubleSide });
  return new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide });
}
// su yatağı: yarı saydam yüzeyin altındaki koyu, opak taban (su, arkadaki döşeme kenarlarını göstermesin)
const waterBed = c => mixHex(c, '#0c4a6e', 0.7);
// Katalog kimliğine göre parametrik mobilya: ölçüler o.w/d/h'den türetilir
// çatı 3B: her yüz kendi düzleminde üçgenlenir (dışbükey olmayan yüzler de), tek bir BufferGeometry
function roof3D(g, o, C) {
  const pos = [];
  for (const f of roofFaces(o)) {
    // baskın normal eksenine izdüşür, ShapeUtils ile üçgenle
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]); }
    const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz), [i0, i1] = az >= ax && az >= ay ? [0, 1] : ax >= ay ? [1, 2] : [0, 2];
    let tris; try { tris = THREE.ShapeUtils.triangulateShape(f.map(p => new THREE.Vector2(p[i0], p[i1])), []); } catch (e) { tris = []; }
    if (!tris.length) for (let i = 1; i + 1 < f.length; i++) tris.push([0, i, i + 1]);
    for (const t of tris) for (const k of t) { const p = f[k]; pos.push(p[0], p[2], p[1]); } // plan (x, y) → Three (x, z); z → yukarı
  }
  if (!pos.length) return;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, C.mat(o.color || '#b45309')); m.castShadow = m.receiveShadow = true; g.add(m);
}
function furn3D(g, o, C) {
  if (Array.isArray(o.parts) && o.parts.length) return parts3D(g, o, C); // çok parçalı mobilya (parts şeması v1)
  const { box, cyl, sph } = C, ed = C.det;
  const w = o.w, d = o.d, h = o.h, col = o.color || '#cbd5e1';
  const sh = t => shade(col, t);
  const wood = '#b08968', woodD = '#8a6a4f', metal = '#a9b4c0', steel = '#8e9aa8';
  const white = '#f8fafc', dark = '#374151', glass = 0x9fd3ee;
  // b: merkez y; bb: taban y
  const b = (bw, bh, bd, c, x, y, z, ry = 0, op, e) => box(g, bw, bh, bd, c, x, y, z, ry, op, e === undefined ? 0 : e);
  const bb = (bw, bh, bd, c, x, y0, z, ry = 0, e) => b(bw, bh, bd, c, x, y0 + bh / 2, z, ry, 0, e);
  if (o.k === 'roof') { roof3D(g, o, C); return; }
  switch (o.k === 'ramp' ? 'ramp' : o.type) { // rampa 2B gibi k ile seçilir (#58)
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
      if (o.type === 'dresser' || o.type === 'night') {
        bb(w, h * 0.96, d, sh(-0.06), 0, h * 0.02, 0, 0, ed);
        const nd = Math.max(2, Math.round(h / 28));
        for (let i = 0; i < nd; i++) {
          const dh = (h * 0.9) / nd;
          bb(w * 0.9, dh * 0.84, 2, sh(0.05), 0, h * 0.05 + i * dh + dh * 0.08, d / 2 + 1);
          bb(w * 0.2, 2.5, 2.5, metal, 0, h * 0.05 + i * dh + dh * 0.5, d / 2 + 3);
        }
      } else {
        const t = Math.min(2.5, w * 0.05);
        const iw = w - 2 * t;
        const plH = Math.max(2, h * 0.04);
        for (const sx of [-1, 1]) bb(t, h, d, sh(-0.06), sx * (w / 2 - t / 2), 0, 0, 0, ed);
        bb(iw, t, d, sh(-0.06), 0, h - t, 0, 0, ed);
        bb(iw, plH, d, sh(-0.08), 0, 0, 0, 0, ed);
        bb(iw, h - plH - t, 1.2, sh(-0.12), 0, plH, -d / 2 + 0.6);
        const ns = Math.max(2, Math.round(h / 40));
        const ch = (h - plH - t) / ns;
        for (let i = 1; i < ns; i++) bb(iw, 2, d - 1.5, sh(-0.16), 0, plH + i * ch, 0.6);
        if (o.type === 'bookcase' && ed) {
          const nb = Math.min(ns, 4);
          const bookCols = [0x7f5539, 0x4a5d6e, 0x8c7a4f, 0x6b3f3f];
          for (let i = 0; i < nb; i++) {
            const rw = iw * [0.68, 0.58, 0.74, 0.62][i % 4];
            const rh = (ch - 2) * [0.78, 0.72, 0.84, 0.75][i % 4];
            const rd = d * 0.7;
            const rx = (i % 2 === 0 ? -1 : 1) * (iw / 2 - rw / 2 - 0.5);
            const shelfY = i === 0 ? plH : plH + i * ch + 2;
            const rz = -d / 2 + 1.2 + rd / 2;
            bb(rw, rh, rd, bookCols[i % 4], rx, shelfY, rz);
          }
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
      // TV ünitesi: ayaklı alçak konsol + kapaklar; üstünde ayaklı, ince 16:9 ekran (kapalı, koyu)
      const legH = Math.min(10, h * 0.16), top = Math.max(2, Math.min(3, h * 0.06)), bodyH = h - legH - top;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) bb(3, legH, 3, dark, sx * (w / 2 - 6), 0, sz * (d / 2 - 5));
      bb(w, bodyH, d, sh(-0.06), 0, legH, 0, 0, ed);
      bb(w + 1, top, d + 1, sh(-0.2), 0, h - top, 0, 0, ed);
      const nd = clamp(Math.round(w / 50), 2, 4), dw = w / nd;
      for (let i = 0; i < nd; i++) {
        const dx = (i + 0.5) * dw - w / 2;
        bb(dw - 1.5, bodyH - 3, 1.5, sh(0.06), dx, legH + 1.5, d / 2 + 0.75);
        bb(dw * 0.3, 1.2, 1.5, metal, dx, legH + bodyH - 6, d / 2 + 2);
      }
      const sw = Math.min(w * 0.8, 165), shh = sw * 9 / 16, gap = 9, sz = -d * 0.15;
      bb(sw * 0.3, 1.5, Math.min(22, d * 0.55), dark, 0, h, sz + 3);
      bb(Math.min(8, sw * 0.06), gap + shh * 0.3, 2.5, dark, 0, h, sz - 0.5);
      bb(sw, shh, 2.5, '#111827', 0, h + gap, sz + 1, 0, ed);
      bb(sw - 2.4, shh - 2.4, 0.4, '#1e293b', 0, h + gap + 1.2, sz + 2.4);
      break;
    }
    case 'tvw': { // duvar TV'si (#61): ince panel + arkada askı aparatı
      const t = Math.max(2, d * 0.5);
      bb(w * 0.3, h * 0.3, d - t, dark, 0, h * 0.35, -d / 2 + (d - t) / 2);
      bb(w, h, t, '#111827', 0, 0, d / 2 - t / 2, 0, ed);
      bb(w - 2.4, h - 2.4, 0.4, '#1e293b', 0, 1.2, d / 2 + 0.2);
      break;
    }
    case 'art': { // tablo: çerçeve + tuval + birkaç renk alanı
      bb(w, h, d, col, 0, 0, 0, 0, ed);
      bb(w * 0.86, h * 0.86, 0.6, '#f5efe6', 0, h * 0.07, d / 2 + 0.3);
      bb(w * 0.34, h * 0.42, 0.3, '#c2410c', -w * 0.16, h * 0.4, d / 2 + 0.7);
      bb(w * 0.3, h * 0.26, 0.3, '#1d4ed8', w * 0.18, h * 0.18, d / 2 + 0.7);
      bb(w * 0.22, h * 0.22, 0.3, '#ca8a04', w * 0.2, h * 0.56, d / 2 + 0.7);
      break;
    }
    case 'shelfW': { // duvar rafı: tabla + iki konsol (raf havadaysa)
      bb(w, h, d, col, 0, 0, 0, 0, ed);
      if (furnElev(o) >= 12) for (const sx of [-1, 1]) bb(2, 10, d * 0.8, metal, sx * w * 0.32, -10, -d * 0.1);
      break;
    }
    case 'ac': { // split klima iç ünitesi
      bb(w, h, d, col, 0, 0, 0, 0, ed);
      bb(w * 0.86, Math.max(1.5, h * 0.08), 1, '#94a3b8', 0, h * 0.12, d / 2 + 0.5);
      bb(w * 0.9, 0.6, 0.6, sh(-0.12), 0, h * 0.55, d / 2 + 0.3);
      bb(3, 1.2, 0.6, '#22c55e', w * 0.38, h * 0.35, d / 2 + 0.3);
      break;
    }
    case 'cabU': { // üst mutfak dolabı: gövde + kapaklar, kulplar altta
      bb(w, h, d, sh(-0.06), 0, 0, 0, 0, ed);
      const nd = w > 60 ? 2 : 1, dw = w / nd;
      for (let i = 0; i < nd; i++) {
        const dx = (i + 0.5) * dw - w / 2;
        bb(dw - 1, h - 1.5, 1.5, sh(0.05), dx, 0.75, d / 2 + 0.75);
        bb(Math.min(14, dw * 0.35), 1.2, 1.5, metal, dx, 5, d / 2 + 2);
      }
      break;
    }
    case 'wmirror': { // ayna: ince çerçeve + açık, hafif mavimsi cam
      bb(w, h, d, col, 0, 0, 0, 0, ed);
      bb(w - 4, h - 4, 0.4, '#dbeafe', 0, 2, d / 2 + 0.2);
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
    case 'ramp': {
      // rampa (#58): eğimli kama (alt uç +d/2, üst uç −d/2), engelli rampasında tekmelik, korkuluklar yüzeye paralel
      const H = Math.max(0.5, h), shp = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(d / 2, H)]);
      const geo = new THREE.ExtrudeGeometry(shp, { depth: w, bevelEnabled: false });
      geo.rotateY(Math.PI / 2); geo.translate(-w / 2, 0, 0); // şekil u → three z = −u (üst uç −y), ekstrüzyon → x
      const wedge = new THREE.Mesh(geo, C.mat(col)); wedge.castShadow = true; wedge.receiveShadow = true; g.add(wedge);
      const th = Math.atan2(H, d), Ls = Math.hypot(d, H);
      const slope = (bw, bh, x, lift, c) => { // yüzeye paralel çubuk: merkez rampa ortası, yüzeyden 'lift' yukarıda
        const m = box(g, bw, bh, Ls, c, x, H / 2 + lift, 0, 0, 0, false); m.rotation.x = th; return m;
      };
      const type = rampType(o);
      if (type === 'accessible') for (const k of [-1, 1]) slope(5, 5, k * (w / 2 - 2.5), 2.5, sh(-0.12)); // tekmelik
      if (type === 'vehicle' && ed) for (let i = 1; i < Math.min(12, Math.round(d / 60)); i++) { // kaymaz oluklar
        const y = -d / 2 + i * d / Math.min(12, Math.round(d / 60)), z = H * (d / 2 - y) / d;
        const m = box(g, w - 10, 0.6, 3, sh(-0.18), 0, z + 0.3, y, 0, 0, false); m.rotation.x = th;
      }
      const sides = rampRailSides(o);
      if (sides.length) {
        const heights = type === 'accessible' ? [90, 70] : [90], nP = clamp(Math.round(d / 150), 1, 12);
        for (const k of sides) {
          const x = k * (w / 2 - 6);
          for (let i = 0; i <= nP; i++) { const y = d / 2 - i * d / nP, z = H * (d / 2 - y) / d; bb(3, 92, 3, metal, x, z, y); }
          for (const hh of heights) slope(3.5, 4, x, hh, metal);
        }
      }
      break;
    }
    case 'stairs': {
      // parametrik merdiven (#33): stairSteps() 2B ile ortak; döner merdivende açık basamak + orta direk
      const st = stairSteps(o), spiral = st.type === 'spiral';
      st.steps.forEach((s, i) => {
        if (spiral) bb(s.w, 5, s.d, col, s.x, s.z - 5, s.y, -s.a, ed && i === 0);
        else bb(s.w, s.z, s.d, s.landing ? sh(-0.06) : col, s.x, 0, s.y, -s.a, ed && i === 0);
      });
      if (spiral) cyl(g, Math.max(3, Math.min(w, d) * 0.07), h + 90, metal, 0, (h + 90) / 2, 0, 16);
      if (ed) for (const rail of stairRails(o, st)) {
        // dikmeler her 3 basamakta bir (+ son), aralarında eğimli küpeşte
        const pts = rail.pts.filter((p, i, a) => i % 3 === 0 || i === a.length - 1);
        for (const p of pts) bb(3, 92, 3, metal, p.x, p.z, p.y);
        for (let i = 0; i + 1 < pts.length; i++) {
          const p = pts[i], q = pts[i + 1], dx = q.x - p.x, dz = q.y - p.y, dy = q.z - p.z, Lh = Math.hypot(dx, dz);
          const m = box(g, Math.hypot(Lh, dy) + 3, 4, 3.5, metal, (p.x + q.x) / 2, (p.z + q.z) / 2 + 90, (p.y + q.y) / 2, 0, 0, false);
          m.rotation.order = 'YZX'; m.rotation.y = -Math.atan2(dz, dx); m.rotation.z = Math.atan2(dy, Lh);
        }
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
// Korkuluk / bahçe çiti 3B (#73): açık dikme + ray geometrisi, süpürgelik / üst kapak yok. g = duvar grubu (orta noktada, duvar yönünde)
function lowWall3D(g, w, L, H, ops, box, det, lt) {
  const fence = w.wt === 'fence', spec = LOW_WALL[w.wt], X = x => x - L / 2;
  const col = w.color || (fence ? (lt ? '#a47148' : '#8b5e3c') : (lt ? '#6b7280' : '#9ca3af'));
  const t = Math.max(2, +w.t || spec.t), ps = fence ? Math.max(8, t) : Math.max(4, Math.min(t, 6));
  for (const x of lowWallPosts(w, L, ops)) box(g, ps, H, ps, col, X(x), H / 2, 0, 0, undefined, det, true);
  for (const [s0, e0] of lowWallSolid(L, ops)) {
    const len = e0 - s0, xm = X((s0 + e0) / 2);
    if (fence) {
      for (const y of [H * 0.25, H * 0.75]) box(g, len, 8, t * 0.5, col, xm, y, -t * 0.15, 0, undefined, det, true);
      const step = Math.max(spec.bar, len / 150);
      for (let x = s0 + step / 2; x < e0 - 1; x += step) box(g, step * 0.6, H - 8, 2, shade(col, 0.06), X(x), (H - 8) / 2 + 4, t * 0.2, 0, undefined, false, false);
    } else {
      box(g, len, 5, Math.max(t, 6), shade(col, -0.1), xm, H - 2.5, 0, 0, undefined, det, true);   // küpeşte
      box(g, len, 3, t * 0.6, col, xm, 10, 0, 0, undefined, det, false);                             // alt ray
      const step = Math.max(spec.bar, len / 120);
      for (let x = s0 + step; x < e0 - 2; x += step) box(g, 2, H - 15, 2, col, X(x), 11.5 + (H - 15) / 2 - 1.5, 0, 0, undefined, false, false);
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
  // parçalı mobilya malzemesi: mat (matte | gloss | metal | glass); matCache'te tutulur ki sonraki build'de dispose edilsin
  const pmat = (c, kind) => { if (!kind || kind === 'matte') return mat(c); if (kind === 'glass') return mat(c, 0.35); const k = c + '|' + kind; return matCache[k] || (matCache[k] = new THREE.MeshPhongMaterial({ color: c, shininess: kind === 'metal' ? 90 : 45, specular: kind === 'metal' ? 0x9aa4b0 : 0x2a2a2a, side: THREE.DoubleSide })); };
  const furnCtx = { box, cyl, sph, mat, det, pmat, unit: { box: unitBox, cyl: unitCyl, sph: unitSph } };
  let elev = 0;
  P.floors.forEach((f, fidx) => {
    if (ui.v3dFloor !== 'all' && f.id !== ui.v3dFloor) return;
    f = visFloor(f); // gizli katmanlar 3B'de de yok (#32) // kat seçici: yalnızca seçili kat çizilir
    // zemin plakası: duvarların dış konturunu izleyen poligon — açılı planlarda AABB gibi taşmaz
    const slabCol = lt ? 0xded8cc : (fidx === 0 ? 0x171e29 : 0x232b38);
    // kat döşemesi malzemesi (issue #12): kullanıcı seçtiyse üst yüze doku/renk, yan yüzler düz
    const sKind = finishKind(f.slabFloor), custom = !!(sKind || f.slabColor);
    let slabMat = mat(slabCol), slabWater = null;
    if (custom) {
      const sc = f.slabColor || '#cbd5e1';
      let top = mat(sc);
      if (sKind && det && sKind !== 'glass') {
        const fm = floorMat(sKind, sc, lt, { floorTex, texs }); extraMats.push(fm);
        if (sKind === 'water') { slabWater = fm; top = mat(waterBed(sc)); } else top = fm;
      }
      slabMat = [top, mat(shade(sc, -0.25))];          // ExtrudeGeometry: grup 0 = kapaklar, grup 1 = yanlar
    }
    // su (#39): kapak opak yatak, üstüne +0.3 cm'de ayrı yarı saydam yüzey (aynı düzlemde titremez; odalar +0.6'da)
    const addWater = (shp, y, wm) => { const m = new THREE.Mesh(new THREE.ShapeGeometry(shp), wm); m.rotation.x = Math.PI / 2; m.position.y = y; m.receiveShadow = true; m.renderOrder = 2; S.add(m); };
    // döşeme boşlukları (issue #23): tamamen içinde kaldıkları plakada / oda zemininde Shape.holes ile gerçek delik
    // cam döşeme (#57): cam odalar alttaki plakayı (ve onu içeren odaları) boşluk gibi deler; cam panel + çerçeve + 100 cm derzler
    const glassRooms = f.rooms.filter(r => r.pts && r.pts.length >= 3 && finishKind(r.floor) === 'glass');
    const glassCuts = [...glassRooms, ...(f.slabs || []).filter(s => s.pts && s.pts.length >= 3 && finishKind(s.floor) === 'glass')];
    const glassMat = fr => { const m = new THREE.MeshPhongMaterial({ color: fr ? 0xe8f2f7 : 0x9fd3ee, transparent: true, opacity: fr ? 0.65 : 0.35, shininess: 90, specular: 0xffffff, depthWrite: false, side: THREE.DoubleSide }); extraMats.push(m); return m; };
    const glassFloor = (pts, top, th, fr, holes) => {
      const shp = new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, p.y)));
      for (const hh of holes || []) shp.holes.push(new THREE.Path(hh.map(q => new THREE.Vector2(q.x, q.y))));
      const geo = new THREE.ExtrudeGeometry(shp, { depth: th, bevelEnabled: false }); geo.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(geo, glassMat(fr)); m.position.y = top; m.renderOrder = 3; m.userData.glassFloor = true; S.add(m);
      const fc = lt ? 0x8e9aa8 : 0x94a3b8, fw = 6;
      pts.forEach((p, i) => { // çevre çerçevesi (alüminyum / çelik)
        const q = pts[(i + 1) % pts.length], Ln = dist(p, q); if (Ln < 1) return;
        box(S, Ln + fw, fw, fw, fc, (p.x + q.x) / 2, top - fw / 2, (p.y + q.y) / 2, -Math.atan2(q.y - p.y, q.x - p.x), 0, false);
      });
      if (!det) return m;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
      let n = 0; const J = 100, MAXJ = 80;
      for (let x = Math.ceil((x0 + 1) / J) * J; x < x1 - 1 && n < MAXJ; x += J) for (const [a, b] of lineCutIntervals(pts, { x, y: 0 }, { x: 0, y: 1 })) { box(S, 3, 2, b - a, fc, x, top - 1, (a + b) / 2, 0, 0, false); n++; }
      for (let y = Math.ceil((y0 + 1) / J) * J; y < y1 - 1 && n < MAXJ; y += J) for (const [a, b] of lineCutIntervals(pts, { x: 0, y }, { x: 1, y: 0 })) { box(S, b - a, 2, 3, fc, (a + b) / 2, top - 1, y, 0, 0, false); n++; }
      return m;
    };
    const withHoles = (shp, pts, self) => {
      for (const h of voidHoles([...(f.voids || []), ...glassCuts.filter(r => r !== self)], pts)) shp.holes.push(new THREE.Path(h.map(q => new THREE.Vector2(q.x, q.y))));
      return shp;
    };
    for (const pts of slabPolys(f)) {
      if (sKind === 'glass') { glassFloor(pts, elev, 6, f.glass === 'frosted', voidHoles(f.voids, pts)); continue; } // tüm kat cam (#57)
      const shp = withHoles(new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, p.y))), pts);
      const geo = new THREE.ExtrudeGeometry(shp, { depth: 20, bevelEnabled: false });
      geo.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(geo, slabMat);
      m.position.y = elev; m.receiveShadow = true;
      if (!custom) m.userData.slab = true;            // the render may swap it for the light slab (user materials stay)
      S.add(m);
      if (slabWater) addWater(shp, elev + 0.3, slabWater);
    }
    // serbest döşemeler (issue #22): duvar gerektirmeyen balkon/teras plakası; üst yüz = kat kotu + kot farkı.
    // +0.2 cm (ve çakışmada katman başına +0.1) otomatik plakayla aynı düzlemde titremesin; odalar +0.6'da kalır
    const slabs = (f.slabs || []).filter(s => s.pts && s.pts.length >= 3), slabLv = stackLevels(slabs, 'slab');
    slabs.forEach((s, si) => {
      const t = clamp(+s.t || 20, 5, 100), sc = s.color || (lt ? '#c9c3b8' : '#3a4352'), kind = finishKind(s.floor);
      if (kind === 'glass') { glassFloor(s.pts, elev + (+s.off || 0) + 0.2 + Math.min(slabLv[si], 3) * 0.1, Math.min(t, 8), s.glass === 'frosted', voidHoles(f.voids, s.pts)); return; } // cam köprü / balkon (#57)
      let top = mat(sc), water = null;
      if (kind && det) {
        const fm = floorMat(kind, sc, lt, { floorTex, texs }); extraMats.push(fm);
        if (kind === 'water') { water = fm; top = mat(waterBed(sc)); } else top = fm;
      }
      const shp = withHoles(new THREE.Shape(s.pts.map(p => new THREE.Vector2(p.x, p.y))), s.pts);
      const geo = new THREE.ExtrudeGeometry(shp, { depth: t, bevelEnabled: false });
      geo.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(geo, [top, mat(shade(sc, -0.25))]);
      m.position.y = elev + (+s.off || 0) + 0.2 + Math.min(slabLv[si], 3) * 0.1;
      m.receiveShadow = true; m.castShadow = true; S.add(m);
      if (water) addWater(shp, m.position.y + 0.25, water);
    });
    // mobilya bir serbest döşemenin üstündeyse o döşemenin kotuna oturur (en üstteki döşeme kazanır)
    const furnOff = o => { for (let i = slabs.length - 1; i >= 0; i--) if (pointInPoly(o, slabs[i].pts)) return +slabs[i].off || 0; return 0; };
    const roomLv = stackLevels(f.rooms, 'room'), furnLv = stackLevels(f.furn, 'furn');
    f.rooms.forEach((r, ri) => {
      if (!r.pts || r.pts.length < 3) return;
      if (glassRooms.includes(r)) { glassFloor(r.pts, elev + 0.6 + roomLv[ri] * 0.5, 4, r.glass === 'frosted', voidHoles(f.voids, r.pts)).userData.roomId = r.id; return; } // cam döşeme (#57)
      const shp = withHoles(new THREE.Shape(r.pts.map(p => new THREE.Vector2(p.x, p.y))), r.pts, r);
      const geo = new THREE.ShapeGeometry(shp);
      let m;
      const kind = finishKind(r.floor);
      if (kind && det) {
        const mm = floorMat(kind, r.color || '#cbd5e1', lt, { floorTex, texs }); extraMats.push(mm);
        m = new THREE.Mesh(geo, mm);
        if (kind === 'water') { // su odası: altta opak yatak
          const bed = new THREE.Mesh(new THREE.ShapeGeometry(shp), mat(waterBed(r.color || '#cbd5e1')));
          bed.rotation.x = Math.PI / 2; bed.position.y = elev + 0.35 + roomLv[ri] * 0.5; bed.receiveShadow = true; S.add(bed); m.renderOrder = 2;
        }
      } else {
        m = new THREE.Mesh(geo, mat(r.color, lt ? undefined : 0.78));
      }
      // çakışan odalar: 2B'deki sıraya göre kademeli yükseklik → titreme yok, üstteki üstte
      m.rotation.x = Math.PI / 2; m.position.y = elev + 0.6 + roomLv[ri] * 0.5; m.receiveShadow = true; m.userData.roomId = r.id; S.add(m);
      // döşeme kalınlığı (#63): kaplamanın 0.3 cm altında, aşağı doğru dolu plaka; yanları kat döşemesi renginde (balkon / teras alnı)
      const st = roomSlabT(r);
      if (st > 0) {
        const sg = new THREE.ExtrudeGeometry(shp, { depth: st, bevelEnabled: false }); sg.rotateX(Math.PI / 2);
        const sm = new THREE.Mesh(sg, mat(f.slabColor ? shade(f.slabColor, -0.25) : slabCol));
        sm.position.y = m.position.y - 0.3; sm.receiveShadow = true; sm.castShadow = true; sm.userData.roomId = r.id; S.add(sm);
      }
    });
    f.walls.forEach(w => {
      const L = wLen(w), H = w.h, g = new THREE.Group(); g.userData = { wallId: w.id }; g.position.set((w.a.x + w.b.x) / 2, elev, (w.a.y + w.b.y) / 2); g.rotation.y = -wAng(w); S.add(g);
      const hasPos = Array.isArray(w.angles) && w.angles.length > 0;
      const wCol = w.color || (hasPos ? (lt ? 0xdbeafe : 0xfde68a) : (lt ? 0xfaf8f5 : 0xe2e8f0));
      const curt = w.wt === 'curtain', rail = 5, frameCol = lt ? 0x8fa3b8 : 0x7c8a9c;
      const pin3 = () => { if (!hasPos) return; const pv = w[wallPivot(w)], pin = new THREE.Mesh(new THREE.CylinderGeometry(w.t * 0.55, w.t * 0.55, H + 4, 20), mat(lt ? 0x1d4ed8 : 0xd99b26)); pin.position.set(pv.x, elev + H / 2, pv.y); pin.userData = { wallId: w.id }; S.add(pin); };
      if (isLowWall(w)) { lowWall3D(g, w, L, H, f.ops.filter(o => o.wall === w.id), box, det, lt); pin3(); return; } // korkuluk / çit (#73)
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
          // her açıklık kendi grubunda: opId taşır ki 3B'de tıklanıp seçilebilsin, vurgulansın ve duvar boyunca sürüklenebilsin (#29)
          const og = new THREE.Group(); og.userData = { opId: o.id, elev }; g.add(og);
          const fCol = o.frameCol || shade(wCol, -0.22), fr = Math.min(6, Math.max(2, span * 0.07)); // kasa rengi (#41)
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
              doorLeaf3D(lg, o, lw, o.h, sgn * lw / 2, 0, 0, sgn, furnCtx); // malzeme + renk (#41)
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
            if (doorMat(o) === 'glass') {
              const sc2 = o.glass === 'frosted' ? 0xe6eef4 : 0x7dd3fc, so2 = o.glass === 'frosted' ? 0.75 : 0.55;
              box(og, pw, o.h * 0.98, pt, sc2, pFixed, my, -sgn * pt * 0.65, 0, so2, false);
              box(og, pw, o.h * 0.98, pt, sc2, pSlide, my, sgn * pt * 0.65, 0, so2, false);
            } else { // ahşap / metal / cam bölmeli sürgü panelleri (#41): gömme kulp, çıkıntı yok
              doorLeaf3D(og, o, pw, o.h * 0.98 / 0.97, pFixed, o.sill, -sgn * 2.6, sgn, furnCtx, true);
              doorLeaf3D(og, o, pw, o.h * 0.98 / 0.97, pSlide, o.sill, sgn * 2.6, -sgn, furnCtx, true);
            }
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
        const nM = curtainBays(w); // modül / ara dikme adedi (#71)
        for (let i = 0; i <= nM; i++) {
          const x = (i * L) / nM;
          if (ops.some(o => o.d - o.w / 2 < x + 4 && o.d + o.w / 2 > x - 4)) continue;
          box(g, 6, H - 2 * rail, w.t * 0.55, frameCol, x - L / 2, rail + (H - 2 * rail) / 2, 0, 0, 0, false);
        }
      }
      pin3();
    });
    // köşe birleşim dolgusu (issue #14): duvar kutuları birleşimde düz biter, dış köşe yarığını bu prizma kapatır
    for (const j of wallJoints(f)) {
      const solid = j.walls.filter(isSolidWall); if (!solid.length) continue;
      const w0 = solid[0], H = Math.min(...solid.map(w => w.h)), hasPos = Array.isArray(w0.angles) && w0.angles.length > 0;
      const jCol = w0.color || (hasPos ? (lt ? 0xdbeafe : 0xfde68a) : (lt ? 0xfaf8f5 : 0xe2e8f0));
      const geo = new THREE.ExtrudeGeometry(new THREE.Shape(j.poly.map(p => new THREE.Vector2(p.x, p.y))), { depth: H, bevelEnabled: false });
      geo.rotateX(Math.PI / 2);
      const m = new THREE.Mesh(geo, mat(jCol));
      m.position.y = elev + H; m.castShadow = m.receiveShadow = true; m.userData = { wallId: w0.id };
      S.add(m);
    }
    f.furn.forEach((o, fi3) => {
      const fy = elev + furnOff(o) + furnElev(o), ry = -o.rot * Math.PI / 180, g = new THREE.Group(); g.position.set(o.x, fy, o.y); g.rotation.y = ry; g.userData = { furnId: o.id, elev: fy }; S.add(g);
      // çakışan mobilya (ör. üst üste havuzlar = nehir): katman sırasına göre hafif yükseltilir, aynı yükseklikteki yüzeyler titremez
      let ig = g; if (furnLv[fi3]) { ig = new THREE.Group(); ig.position.y = furnLv[fi3] * 0.5; g.add(ig); }
      furn3D(ig, o, furnCtx);
    });
    (f.sketches || []).forEach(sk => {
      if (!sk.pts || sk.pts.length < 2) return;
      let col = sk.color || '#1e293b';
      if (!lt && (col === '#1e293b' || col === '#0f172a' || col === '#000000')) col = '#e6edf5';
      const geo = new THREE.BufferGeometry().setFromPoints(sk.pts.map(p => new THREE.Vector3(p.x, elev + 1.5, p.y)));
      S.add(new THREE.Line(geo, mat(col))); // malzeme matCache ile T3.mats'te dispose edilir
    });
    elev += floorH(f) + 20; // kat bazlı yükseklik (#59)
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), mat(lt ? 0xd8d2c5 : 0x11161e));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -21; ground.receiveShadow = true; S.add(ground);
  T3.ground = ground;                                 // the render swaps its material for a studio backdrop
  T3.fit = { cx, cz, sz, elev, x0: all.x0, x1: all.x1, z0: all.y0, z1: all.y1 };
  if (!keepCam) { T3.cam.position.set(cx + sz * 0.7, sz * 0.9 + elev * .3, cz + sz * 1.0); T3.ctl.target.set(cx, 80, cz); fitOrtho(); }
  T3.mats = Object.values(matCache).concat(extraMats, [lineMat]); // sonraki build3D çağrısında dispose edilmek üzere
  T3.texs = texs;
  T3.ctl.update();
  if (T3.walk) applyWalkCam();
  refreshSel3D(); applySecClip();
}

/* ---------- 3B seçim vurgusu & canlı güncelleme ---------- */
let h3 = [], b3t = null;
// 3B'de kapı/pencere sürükleme (#29): ışını duvarın düşey düzlemiyle kes, duvar ekseni boyunca konum (cm, a ucundan)
function opDragHit(ray, w, elev) {
  const L = wLen(w); if (L < 1) return null;
  const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L, p = new THREE.Vector3();
  const vert = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(-uy, 0, ux), new THREE.Vector3(w.a.x, elev, w.a.y));
  if (Math.abs(ray.direction.dot(vert.normal)) < 0.05 || !ray.intersectPlane(vert, p)) { if (!ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -elev), p)) return null; }
  return { t: (p.x - w.a.x) * ux + (p.z - w.a.y) * uy };
}
function refreshSel3D() {
  if (!T3 || !T3.scene) return;
  for (const h of h3) { T3.scene.remove(h); h.geometry.dispose(); h.material.dispose(); }
  h3 = [];
  if (!ui.view3d || !sel.length) return;
  // tekil veya gruplu seçimde mobilya, duvar ve kapı/pencere üyeleri turuncu kutuyla vurgulanır (#29)
  const ids = new Set(sel), col = isLight() ? 0xd97706 : 0xfbbf24;
  for (const c of T3.scene.children) {
    const u = c.userData || {};
    if (ids.has(u.furnId) || (ids.has(u.wallId) && !c.isMesh)) h3.push(new THREE.BoxHelper(c, col));
    else if (!c.isMesh && u.wallId) for (const og of c.children) if (og.userData && ids.has(og.userData.opId)) h3.push(new THREE.BoxHelper(og, col));
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
  if (P) renderTabs();
  $('#bProjects').textContent = L('📁 Projelerim', '📁 My Projects');
  $('#bSave').textContent = L('💾 Kaydet', '💾 Save');
  $('#bSave').title = L('Tarayıcıya kaydet (Ctrl+S)', 'Save to browser (Ctrl+S)');
  $('#bJson').title = L('JSON dosyası olarak indir', 'Download as JSON file');
  $('#bOpen').textContent = L('📂 Aç', '📂 Open');
  $('#bOpen').title = L('Dosya aç: JSON ya da IFC (Revit, ArchiCAD…) — dosyayı tuvale sürükleyip de bırakabilirsiniz', 'Open file: JSON or IFC (Revit, ArchiCAD…) — you can also drag the file onto the canvas');
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
  if ($('#b3dIso')) $('#b3dIso').title = L('İzometrik görünüş (paralel)', 'Isometric view (parallel)');
  syncProjUI();
  if ($('#b3dTop')) $('#b3dTop').title = L('Üstten görünüm', 'Top view');
  if ($('#b3dEye')) $('#b3dEye').title = L('Yürüme modu: göz hizasında gez (Esc: çık)', 'Walk mode: walk through at eye level (Esc: exit)');
  syncWalkUI();
  if ($('#lblLayer')) $('#lblLayer').textContent = L('Katman', 'Layer');
  if ($('#b3dStudio')) $('#b3dStudio').title = L('🎨 Render stüdyosu: stil, güneş, çözünürlük', '🎨 Render studio: style, sun, resolution');
  for (const [id, k, tr, en] of [['b3dN', 'north', 'K', 'N'], ['b3dE', 'east', 'D', 'E'], ['b3dS', 'south', 'G', 'S'], ['b3dW', 'west', 'B', 'W']]) if ($('#' + id)) { $('#' + id).textContent = L(tr, en); $('#' + id).title = L(...ELEV_NAMES[k]); }
  if ($('#b3dShot')) $('#b3dShot').title = L('🎬 Render al (PNG) — Shift: hızlı görünüm', '🎬 Render (PNG) — Shift: quick capture');
  syncExportTitles();
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
$('#bPng').onclick = e => (ui.view3d ? export3DRender(e && e.shiftKey) : exportPng()); $('#bPrint').onclick = exportPrint;
$('#bSvg').onclick = () => download(fname('svg'), new Blob([exportSvg().svg], { type: 'image/svg+xml' }));
$('#b2d').onclick = () => show3D(false); $('#b3d').onclick = () => show3D(true);
$('#s3dFloor').onchange = () => { ui.v3dFloor = $('#s3dFloor').value; if (T3 && T3.walk) walkToFloor(walkFloorIdx()); if (T3 && ui.view3d) build3D(true); };
$('#b3dFit').onclick = () => set3DCam('fit');
$('#b3dIso').onclick = () => set3DCam('iso');
$('#b3dProj').onclick = () => { if (T3) setProjection(!(T3.ortho || T3.orthoAfterWalk)); };
$('#b3dTop').onclick = () => set3DCam('top');
$('#b3dEye').onclick = () => set3DCam('eye');
$('#sLayer').onchange = e => { if (layerById(e.target.value)) { P.activeLayer = e.target.value; commit(); refresh(); } };
for (const [id, k] of [['b3dN', 'north'], ['b3dE', 'east'], ['b3dS', 'south'], ['b3dW', 'west']]) $('#' + id).onclick = () => set3DCam(k);
$('#b3dShot').onclick = e => export3DRender(e && e.shiftKey);
$('#b3dStudio').onclick = () => openRenderStudio();
$('#bLang').onclick = () => setLang(isEN() ? 'tr' : 'en');
$('#bTheme').onclick = () => {
  const d = document.documentElement;
  d.dataset.theme = d.dataset.theme === 'light' ? '' : 'light';
  localStorage.setItem('fp_theme', d.dataset.theme || '');
  render();
  if (ui.view3d && T3) build3D(true); // tema değişimi kamerayı sıfırlamasın
};
$('#pname').addEventListener('input', e => { P.name = e.target.value; renderTabs(); autosave(); });
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
$('#fileOpen').onchange = e => { openPlanFile(e.target.files[0]); e.target.value = ''; };
/* Plan dosyası aç: .json (kendi biçimimiz) ya da .ifc (Revit / ArchiCAD / BIM dışa aktarımı, IFC-IMPORT bloğu).
   Her ikisi de yeni sekmeye açılır (newTabSlot), mevcut iş korunur. Dosyayı tuvale sürükleyip bırakmak da aynı yoldan geçer. */
function openPlanFile(file) {
  if (!file) return;
  const ifc = /\.ifc$/i.test(file.name);
  if (!ifc && !/\.json$/i.test(file.name) && file.type !== 'application/json') { toast(L('Desteklenen dosyalar: .json ve .ifc', 'Supported files: .json and .ifc')); return; }
  if (ifc) toast(L('IFC okunuyor…', 'Reading IFC…'));
  const r = new FileReader();
  r.onload = () => setTimeout(() => { // toast'un görünmesi için bir kare bekle
    try {
      if (ifc) { importIfcText(r.result, file.name); return; }
      const o = JSON.parse(r.result); if (!o.floors) throw new Error(L('geçersiz dosya', 'invalid file'));
      newTabSlot(); loadProject(o, L('Dosya açıldı', 'File opened')); closeModal();
    } catch (er) { toast(L('Dosya açılamadı: ', 'Could not open file: ') + er.message); }
  }, 30);
  r.readAsText(file);
}
function importIfcText(text, fileName = '') {
  const { project, stats } = ifcToProject(text, { uid, L, colors: ROOMCOL, name: String(fileName).replace(/\.ifc$/i, '') || 'IFC' });
  newTabSlot(); loadProject(project);
  closeModal();
  toast(L(`IFC içe aktarıldı: ${stats.floors} kat, ${stats.walls} duvar, ${stats.ops} kapı/pencere, ${stats.rooms} oda, ${stats.slabs} döşeme`,
    `IFC imported: ${stats.floors} floor(s), ${stats.walls} walls, ${stats.ops} doors/windows, ${stats.rooms} rooms, ${stats.slabs} slabs`)
    + (stats.columns ? L(`, ${stats.columns} kolon`, `, ${stats.columns} column(s)`) : '') + (stats.railings ? L(`, ${stats.railings} korkuluk`, `, ${stats.railings} railing(s)`) : '') + (stats.components ? L(`, ${stats.components} bileşen`, `, ${stats.components} component(s)`) : '') + (stats.roofs ? L(`, ${stats.roofs} çatı`, `, ${stats.roofs} roof(s)`) : '') + (stats.stairs ? L(`, ${stats.stairs} merdiven`, `, ${stats.stairs} stair(s)`) : '') + (stats.ramps ? L(`, ${stats.ramps} rampa`, `, ${stats.ramps} ramp(s)`) : '') + (stats.skipped ? L(` · ${stats.skipped} öğe atlandı`, ` · ${stats.skipped} item(s) skipped`) : ''));
  return stats;
}
// Dosya sürükle-bırak: tuvale .json / .ifc bırakmak onu açar (mobilya stüdyosunun blok sürüklemesi metin taşır, etkilenmez)
$('#stage').addEventListener('dragover', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
$('#stage').addEventListener('drop', e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (!f) return; e.preventDefault(); openPlanFile(f); });
$('#fileBg').onchange = e => {
  const file = e.target.files[0]; if (!file) return; const r = new FileReader();
  r.onload = () => { const im = new Image(); im.onload = () => { const w = 1200; P.bg = { id: 'bg', src: r.result, x: 0, y: 0, w, h: Math.round(w * im.height / im.width), op: 0.5, lock: false }; sel = ['bg']; setTool('select'); commit(); fit(); refresh(); toast(L('Görsel eklendi – sürükleyerek taşıyabilir, köşe ve kenarlarından boyutlandırabilir veya sağ panelden konumunu ayarlayabilirsiniz', 'Image added – drag on canvas to move, drag corners or edges to resize, or adjust position in the right panel')); }; im.src = r.result; };
  r.readAsDataURL(file); e.target.value = '';
};
$('#tools').addEventListener('click', e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool); });
new ResizeObserver(() => { if (P && !ui.view3d) render(); if (T3 && ui.view3d) resize3D(); }).observe($('#stage'));
window.addEventListener('beforeunload', () => { if (P) { dbPut('state', P, 'auto').catch(() => {}); dbPut('state', tabsState(), 'tabs').catch(() => {}); } });
if (localStorage.getItem('fp_theme') === 'light') document.documentElement.dataset.theme = 'light';

applyLangUI();
(async () => {
  await migrateLegacyStorage();
  let saved = null;
  try { saved = await dbGet('state', 'auto'); } catch (e) { }
  if (!saved) { try { saved = JSON.parse(localStorage.getItem('fp_auto') || 'null'); } catch (e) { } }
  if (saved && saved.floors) { loadProject(saved); translateDefaultNames(); refresh(); }
  else { P = newProject(); loadProject(P); templatesModal(); }
  try { restoreTabs(await dbGet('state', 'tabs')); } catch (e) { }
  setTimeout(fit, 50);
  aiBridgeBoot();          // connect to a running local bridge, if any
})();
