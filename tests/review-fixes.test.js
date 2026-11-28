/* Review fixes on the #187–#205 branch: curved-wall openings past the arc end, mullions / posts over the whole arc,
   piece offsets for section placement, content-based background ids, non-ASCII price keys, and rooms that stop
   following their walls once moved on their own. Runs the real code cut out of app.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, markerBlock, fnSrcOf } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n');
const fn = name => fnSrcOf(src, name);

// eslint-disable-next-line no-new-func
const CW = new Function(`
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pal = () => ({ sub: '#64748b', halo: '#ffffff' });
  const view = { z: 1 };
  const fmtLen = v => String(v);
  const wallTag = () => '';
  const MUL_DEF = 120;
  const LOW_WALL = { railing: { post: 120 }, fence: { post: 200 } };
  ${markerBlock(src, 'CURVED-WALL')}
  ${fn('curtainBays')}
  ${fn('lowWallSolid')}
  ${fn('arcPiecePos')}
  ${fn('mulPos')}
  ${fn('lowWallPosts')}
  ${fn('accFitOps')}
  return { wallArc, wallLen, expandCurved, curtainBays, mulPos, lowWallPosts, accFitOps };
`)();

const semi = extra => ({ id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20, h: 270, bulge: 200, ...extra });

test('an opening past the end of a shortened arc stays on one piece and no piece has zero length', () => {
  const w = semi({ bulge: 50 }); // arc ≈ 416 cm, door still at d = 550 from the 628 cm semicircle
  const f = { walls: [w], ops: [{ id: 'o1', wall: 'w1', d: 550, w: 90, h: 210, sill: 0, type: 'door' }] };
  const g = CW.expandCurved(f);
  for (const p of g.walls) assert.ok(Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) > 0.2, 'no zero-length piece');
  const os = g.ops.filter(o => o.id === 'o1');
  assert.strictEqual(os.length, 1, 'the door is placed once');
  assert.ok(os[0].w > 80, 'the door keeps its width');
});

test('accFitOps pulls openings back inside the arc length', () => {
  const w = semi({ bulge: 50 }), f = { walls: [w], ops: [{ id: 'o1', wall: 'w1', d: 550, w: 90 }] };
  CW.accFitOps(f, w);
  assert.ok(f.ops[0].d <= CW.wallLen(w) - 45 + 1e-6);
});

test('curtain mullions are spread over the whole arc, not per piece', () => {
  const w = semi({ wt: 'curtain', mulN: 2 }), g = CW.expandCurved({ walls: [w], ops: [] });
  let inner = 0, all = 0;
  for (const p of g.walls) { const L = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y); inner += CW.mulPos(p, L).length; all += CW.mulPos(p, L, true).length; }
  assert.strictEqual(inner, 2, 'two intermediate mullions');
  assert.strictEqual(all, 4, 'plus one at each end, none doubled at piece joints');
  assert.strictEqual(CW.curtainBays(semi({ wt: 'curtain' })), Math.round(CW.wallLen(semi()) / 120), 'bays from the arc length');
});

test('railing posts follow the post spacing along the arc', () => {
  const w = semi({ wt: 'railing', t: 6, h: 100 }), g = CW.expandCurved({ walls: [w], ops: [] });
  let n = 0;
  for (const p of g.walls) n += CW.lowWallPosts(p, Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y), []).length;
  assert.strictEqual(n, Math.ceil(CW.wallLen(w) / 120) + 1, 'about one post every 120 cm, ends included once');
});

test('pieces carry the real wall id and their start along the arc', () => {
  const g = CW.expandCurved({ walls: [semi()], ops: [] });
  let d = 0;
  for (const p of g.walls) { assert.strictEqual(p.pid, 'w1'); assert.ok(Math.abs(p.po - d) < 1e-6); d = p.arc.d1; }
  assert.ok(Math.abs(d - CW.wallLen(semi())) < 1e-6);
  assert.match(src, /const baseMeta = \{ id: w\.pid \|\| w\.id, po: w\.po \|\| 0,/);
  assert.match(src, /wallId: p\.id, d: d \+ \(p\.po \|\| 0\)/);
  assert.doesNotMatch(src, /userData = \{ wallId: w0\.id \}/);
});

test('the same background image absorbed twice keeps one id (live rooms)', () => {
  const puts = [];
  // eslint-disable-next-line no-new-func
  const B = new Function('puts', `
    const TEX = new Map(); const cacheTex = (id, data) => TEX.set(id, { data });
    const dbPut = (store, v) => { puts.push(v.id); return Promise.resolve(); };
    ${fn('strHash')}
    ${fn('bgAbsorb')}
    return { bgAbsorb, TEX };
  `)(puts);
  const data = 'data:image/png;base64,AAAA';
  const a = B.bgAbsorb({ src: data, x: 0 }), b = B.bgAbsorb({ src: data, x: 50 });
  assert.strictEqual(a.img, b.img);
  assert.strictEqual(B.TEX.size, 1);
  assert.strictEqual(puts.length, 1, 'stored once');
  assert.notStrictEqual(B.bgAbsorb({ src: data + 'B' }).img, a.img, 'a different image gets its own id');
});

test('unit prices keep keys with Turkish letters, drop unsafe ones', () => {
  // eslint-disable-next-line no-new-func
  const cleanQty = new Function(`${fn('cleanQty')}; return cleanQty;`)();
  const P = { qty: { prices: { 'furn:x:Şekil': 12.5, 'furn:x:Çay ocağı': 3, 'furn:x:a"b': 4, 'bad<': 5 } } };
  cleanQty(P);
  assert.deepStrictEqual(P.qty.prices, { 'furn:x:Şekil': 12.5, 'furn:x:Çay ocağı': 3 });
});

test('a followed room moved on its own stops following its walls; the warning shows once', () => {
  const toasts = [];
  // eslint-disable-next-line no-new-func
  const R = new Function('toasts', `
    const document = {}, L = (tr, en) => en, toast = m => toasts.push(m);
    let detect = true; const setDetect = v => { detect = v; };
    const fl = { id: 'f1', walls: [{ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, t: 20 }], rooms: [] };
    const F = () => fl, pointInPoly = () => true, rvInsidePt = p => p[0], polyCentroid = p => p[0];
    const detectRoom = () => detect ? [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] : 'open';
    ${fn('strHash')}
    ${src.match(/const wallSig = new Map\(\);/)[0]}
    ${src.match(/const wallSigOf = .*$/m)[0]}
    ${src.match(/const roomFollows = .*$/m)[0]}
    ${src.match(/const roomWbSig = .*$/m)[0]}
    ${fn('roomWbSet')}
    ${src.match(/const wbWarned = .*$/m)[0]}
    ${fn('roomRedetect')}
    ${fn('followRooms')}
    return { fl, followRooms, roomWbSet, setDetect };
  `)(toasts);
  const r = { id: 'r1', name: 'Kitchen', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] };
  R.fl.rooms.push(r); R.roomWbSet(r); R.followRooms();
  // the wall opens: one warning, not one per edit
  R.setDetect(false);
  R.fl.walls[0].b.x = 90; R.followRooms();
  R.fl.walls[0].b.x = 80; R.followRooms();
  assert.strictEqual(toasts.length, 1);
  assert.ok(r.wb, 'still linked while the gap is open');
  // moved on its own: the signature no longer matches, so it is free
  r.pts = r.pts.map(q => ({ x: q.x + 500, y: q.y }));
  R.fl.walls[0].b.x = 70; R.followRooms();
  assert.strictEqual(r.wb, undefined);
});
