/* Stair alignment, 3D resize arrows, and stairwell voids.
   Runs the real functions cut out of app.js inside a sandboxed Function. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js');
const fnSrc = name => {
  const s = fnSrcOf(src, name);
  if (s.endsWith('{}')) {
    const start = src.indexOf('function ' + name + '(');
    const body = src.indexOf(') {', start);
    const prefix = 'function ' + name + '()';
    const tail = fnSrcOf(prefix + src.slice(body + 2), name).slice(prefix.length);
    return src.slice(start, body + 2) + tail;
  }
  return s;
};
const constSrc = name => {
  const start = src.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is missing from app.js');
  return src.slice(start, src.indexOf('\n', start));
};

function makeSandbox() {
  const store = new Map();
  let nextUid = 1;
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  };
  const ui = { snap: true, stairW: 'fit' };
  const P = {
    grid: 10,
    wallH: 270,
    floors: [
      { id: 'f0', wallH: 270, walls: [], ops: [], furn: [], voids: [] },
      { id: 'f1', wallH: 270, walls: [], ops: [], furn: [], voids: [] },
    ],
  };
  let fi = 0;

  const factory = new Function(
    'ui', 'P', 'getFi', 'setFi', 'localStorage', 'nextUidFn',
    `
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const rnd = (v, s) => Math.round(v / s) * s;
    const uid = () => 'id' + nextUidFn();
    const L = (tr, en) => en;
    const F = () => P.floors[getFi()];
    const wLen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const isDoorOp = op => op.type === 'door' || op.type === 'double' || op.type === 'slide';
    const isLowWall = w => w.wt === 'railing';
    const mkVoid = (pts, type, name) => ({ id: uid(), name, type, pts });
    const floorH = f => f.wallH || 270;
    const curFloorH = () => floorH(F());
    const furnElev = o => o.elev || 0;
    const furnTilted = () => false;
    const findAnyFloor = id => {
      for (let i = 0; i < P.floors.length; i++) {
        const f = P.floors[i];
        const o = (f.furn || []).find(x => x.id === id);
        if (o) return { f, i, kind: 'furn', o };
      }
      return null;
    };
    const STAIR_TYPES = { straight: 1, l: 1, u: 1, spiral: 1 };
    ${constSrc('STAIR_TREAD')}
    ${fnSrc('furnCorners')}
    ${fnSrc('stairWidthMode')}
    ${fnSrc('setStairWidthMode')}
    ${constSrc('stairRotOf')}
    ${fnSrc('stairDirPick')}
    ${fnSrc('stairDefaults')}
    ${fnSrc('stairSnap')}
    ${constSrc('stairVoidPts')}
    ${fnSrc('stairReachesUp')}
    ${fnSrc('stairVoidOf')}
    ${fnSrc('linkStairVoid')}
    ${fnSrc('syncStairVoids')}
    ${fnSrc('furnResizeSide')}
    ${fnSrc('furnLocalAlong')}
    ${fnSrc('furnArrowSpots')}
    return {
      STAIR_TREAD, STAIR_GAP_MIN, STAIR_GAP_MAX,
      stairWidthMode, setStairWidthMode,
      stairRotOf, stairDirPick, stairDefaults, stairSnap,
      stairVoidPts, stairReachesUp, stairVoidOf, linkStairVoid, syncStairVoids,
      furnResizeSide, furnLocalAlong, furnArrowSpots,
    };
    `
  );

  const api = factory(ui, P, () => fi, v => { fi = v; }, localStorage, () => nextUid++);
  return { ...api, ui, P, store, getFi: () => fi, setFi: v => { fi = v; } };
}

test('(1) corridor between two parallel walls: fit mode vs free mode', () => {
  const sb = makeSandbox();
  const floor = {
    walls: [
      { id: 'w1', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, t: 20 },
      { id: 'w2', a: { x: 0, y: 200 }, b: { x: 1000, y: 200 }, t: 20 },
    ],
    ops: [],
  };

  // Fit mode: fills the 180 cm clear gap, centred at y=100, runs along x (rot 90 or 270)
  sb.setStairWidthMode('fit');
  const oFit = { k: 'stairs', w: 100, d: 280, h: 290, x: 0, y: 0, rot: 0 };
  const resFit = sb.stairSnap(oFit, { x: 500, y: 80 }, {}, floor);
  assert.strictEqual(resFit, 'gap');
  assert.strictEqual(oFit.w, 180);
  assert.strictEqual(oFit.y, 100);
  assert.ok(oFit.rot === 90 || oFit.rot === 270, `expected rot 90 or 270, got ${oFit.rot}`);

  // Free mode: keeps o.w = 100, sits against nearer wall (inner face y=10 -> centre y=60)
  sb.setStairWidthMode('free');
  assert.strictEqual(sb.stairWidthMode(), 'free');
  const oFree = { k: 'stairs', w: 100, d: 280, h: 290, x: 0, y: 0, rot: 0 };
  const resFree = sb.stairSnap(oFree, { x: 500, y: 80 }, {}, floor);
  assert.strictEqual(resFree, 'gap');
  assert.strictEqual(oFree.w, 100);
  assert.strictEqual(oFree.y, 60);
});

test('(2) corridor end stop: stair end sits flush with crossing wall face', () => {
  const sb = makeSandbox();
  const floor = {
    walls: [
      { id: 'w1', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, t: 20 },
      { id: 'w2', a: { x: 0, y: 200 }, b: { x: 1000, y: 200 }, t: 20 },
      { id: 'w3', a: { x: 800, y: 0 }, b: { x: 800, y: 200 }, t: 20 },
    ],
    ops: [],
  };
  const o = { k: 'stairs', w: 100, d: 300, h: 290, x: 0, y: 0, rot: 0 };
  const res = sb.stairSnap(o, { x: 700, y: 80 }, {}, floor);
  assert.strictEqual(res, 'gap');
  assert.strictEqual(o.x, 640);
  assert.strictEqual(o.x + o.d / 2, 790);
});

test('(3) door snap: swing clearance, opposite side, rev flip, and fit width', () => {
  const sb = makeSandbox();
  const wall = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 600, y: 0 }, t: 20 };
  const op = { id: 'op1', type: 'door', wall: 'w1', d: 300, w: 90, side: 1 };
  const floor = { walls: [wall], ops: [op] };

  // side 1 equals cursor side (+y): 90 cm swing clearance
  sb.setStairWidthMode('fit');
  const o1 = { k: 'stairs', w: 120, d: 280, h: 290, x: 0, y: 0, rot: 0 };
  const res1 = sb.stairSnap(o1, { x: 300, y: 60 }, {}, floor);
  assert.strictEqual(res1, 'door');
  assert.strictEqual(o1.x, 300);
  assert.strictEqual(o1.rot, 180);
  assert.strictEqual(o1.y, 10 + 90 + o1.d / 2);
  assert.strictEqual(o1.w, 90);

  // side -1 (opposite to cursor): no swing clearance
  op.side = -1;
  const o2 = { k: 'stairs', w: 120, d: 280, h: 290, x: 0, y: 0, rot: 0 };
  const res2 = sb.stairSnap(o2, { x: 300, y: 60 }, {}, floor);
  assert.strictEqual(res2, 'door');
  assert.strictEqual(o2.y, 10 + o2.d / 2);

  // rev: true flips rot by 180
  const o3 = { k: 'stairs', w: 120, d: 280, h: 290, x: 0, y: 0, rot: 0 };
  sb.stairSnap(o3, { x: 300, y: 60 }, { rev: true }, floor);
  assert.strictEqual(o3.rot, (180 + 180) % 360);
});

test('(4) nothing nearby returns null and leaves o unchanged', () => {
  const sb = makeSandbox();
  const floor = { walls: [], ops: [] };
  const o = { k: 'stairs', w: 100, d: 280, h: 290, x: 42, y: 84, rot: 45 };
  const snapshot = { ...o };
  const res = sb.stairSnap(o, { x: 500, y: 500 }, {}, floor);
  assert.strictEqual(res, null);
  assert.deepStrictEqual(o, snapshot);
});

test('(5) prefRot keeps the closer of the two directions', () => {
  const sb = makeSandbox();
  assert.strictEqual(sb.stairRotOf(1, 0), 90);
  assert.strictEqual(sb.stairRotOf(0, 1), 180);
  assert.strictEqual(sb.stairDirPick(1, 0, false, 100), 90);
  assert.strictEqual(sb.stairDirPick(1, 0, false, 260), 270);
  assert.strictEqual(sb.stairDirPick(0, 1, false, 350), 0);

  const floor = {
    walls: [
      { id: 'w1', a: { x: 0, y: 0 }, b: { x: 1000, y: 0 }, t: 20 },
      { id: 'w2', a: { x: 0, y: 200 }, b: { x: 1000, y: 200 }, t: 20 },
    ],
    ops: [],
  };
  const o = { k: 'stairs', w: 100, d: 280, h: 290, x: 0, y: 0, rot: 260 };
  sb.stairSnap(o, { x: 500, y: 80 }, { prefRot: 260 }, floor);
  assert.strictEqual(o.rot, 270);
});

test('(6) stairDefaults computes h, stepN, and straight d', () => {
  const sb = makeSandbox();
  const o = sb.stairDefaults({ k: 'stairs', stairType: 'straight', w: 100, d: 200, h: 200 });
  assert.strictEqual(o.h, 290);
  assert.strictEqual(o.stepN, Math.round(290 / 17.5));
  assert.strictEqual(o.d, Math.round(o.stepN * 28 / 10) * 10);

  // L-shaped stair preserves its d
  const oL = sb.stairDefaults({ k: 'stairs', stairType: 'l', w: 200, d: 250, h: 200 }, 320);
  assert.strictEqual(oL.h, 320);
  assert.strictEqual(oL.stepN, Math.round(320 / 17.5));
  assert.strictEqual(oL.d, 250);
});

test('(7) furnResizeSide on rot 0 and rot 90 items keeps opposite edge fixed and enforces min size 10', () => {
  const sb = makeSandbox();

  // rot 0: drag w+ to size 250 (v = 200 from centre) -> w- edge stays at x = 250
  const o0 = { w: 100, d: 200, x: 300, y: 400, rot: 0 };
  const o1 = { ...o0 };
  sb.furnResizeSide(o1, o0, 'w+', 200);
  assert.strictEqual(o1.w, 250);
  assert.strictEqual(o1.x - o1.w / 2, o0.x - o0.w / 2);
  assert.strictEqual(o1.y, o0.y);

  // rot 0: drag d- to size 250 (v = 150 from centre) -> d+ edge stays at y = 500
  const o2 = { ...o0 };
  sb.furnResizeSide(o2, o0, 'd-', 150);
  assert.strictEqual(o2.d, 250);
  assert.strictEqual(o2.y + o2.d / 2, o0.y + o0.d / 2);

  // rot 90: local +w is world +y; drag w+ to size 250 -> w- edge stays at y = 350
  const r0 = { w: 100, d: 200, x: 300, y: 400, rot: 90 };
  const r1 = { ...r0 };
  sb.furnResizeSide(r1, r0, 'w+', 200);
  assert.strictEqual(r1.w, 250);
  assert.ok(Math.abs(r1.x - r0.x) < 1e-9);
  assert.ok(Math.abs((r1.y - r1.w / 2) - (r0.y - r0.w / 2)) < 1e-9);

  // rot 90: local +d is world -x; drag d- to size 250 -> d+ edge stays at x = 200
  const r2 = { ...r0 };
  sb.furnResizeSide(r2, r0, 'd-', 150);
  assert.strictEqual(r2.d, 250);
  assert.ok(Math.abs((r2.x - r2.d / 2) - (r0.x - r0.d / 2)) < 1e-9);
  assert.ok(Math.abs(r2.y - r0.y) < 1e-9);

  // min size 10 and furnLocalAlong round-trip
  const oMin = { ...o0 };
  const vMin = sb.furnLocalAlong(o0, 'w+', 200, 400); // -100 -> clamped to 10
  sb.furnResizeSide(oMin, o0, 'w+', vMin);
  assert.strictEqual(oMin.w, 10);
  assert.strictEqual(oMin.x - oMin.w / 2, o0.x - o0.w / 2);
});

test('(8) furnArrowSpots returns 4 spots outside each side', () => {
  const sb = makeSandbox();
  const o = { w: 100, d: 200, x: 300, y: 400, rot: 0 };
  const spots = sb.furnArrowSpots(o, 20);
  assert.strictEqual(spots.length, 4);
  const byKey = Object.fromEntries(spots.map(s => [s.key, s]));
  assert.deepStrictEqual(byKey['w+'], { key: 'w+', x: 370, y: 400, ux: 1, uy: 0 });
  assert.deepStrictEqual(byKey['w-'], { key: 'w-', x: 230, y: 400, ux: -1, uy: 0 });
  assert.deepStrictEqual(byKey['d+'], { key: 'd+', x: 300, y: 520, ux: 0, uy: 1 });
  assert.deepStrictEqual(byKey['d-'], { key: 'd-', x: 300, y: 280, ux: 0, uy: -1 });

  // rot 90: w+ points +y, d+ points -x
  const spots90 = sb.furnArrowSpots({ ...o, rot: 90 }, 20);
  const byKey90 = Object.fromEntries(spots90.map(s => [s.key, s]));
  assert.ok(Math.abs(byKey90['w+'].x - 300) < 1e-9 && Math.abs(byKey90['w+'].y - 470) < 1e-9);
  assert.ok(Math.abs(byKey90['d+'].x - 180) < 1e-9 && Math.abs(byKey90['d+'].y - 400) < 1e-9);
});

test('(9) stair voids: link, move+sync, delete, and cross-floor preservation', () => {
  const sb = makeSandbox();
  const st = { id: 'st1', k: 'stairs', w: 100, d: 280, h: 290, x: 200, y: 300, rot: 0 };
  sb.P.floors[0].furn.push(st);

  assert.strictEqual(sb.stairReachesUp(st, sb.P.floors[0]), true);
  assert.strictEqual(sb.stairReachesUp({ ...st, h: 150 }, sb.P.floors[0]), false);

  const v = sb.linkStairVoid(st, 0);
  assert.ok(v);
  assert.strictEqual(v.stair, 'st1');
  assert.strictEqual(v.type, 'stair');
  assert.strictEqual(v.pts.length, 4);
  assert.deepStrictEqual(v.pts, sb.stairVoidPts(st));
  assert.strictEqual(sb.stairVoidOf(st, 0), v);

  // Move stair and sync -> void pts update
  st.x = 400;
  st.y = 500;
  st.rot = 90;
  sb.syncStairVoids();
  assert.deepStrictEqual(v.pts, sb.stairVoidPts(st));

  // Void whose stair exists on another floor is kept
  const stOther = { id: 'st2', k: 'stairs', w: 100, d: 200, h: 290, x: 50, y: 50, rot: 0 };
  sb.P.floors[1].furn.push(stOther);
  const vOther = { id: 'vOther', type: 'stair', stair: 'st2', pts: sb.stairVoidPts(stOther) };
  sb.P.floors[1].voids.push(vOther);

  // Delete st from floor 0 and sync -> v is removed, vOther is kept
  sb.P.floors[0].furn.length = 0;
  sb.syncStairVoids();
  assert.strictEqual(sb.P.floors[1].voids.length, 1);
  assert.strictEqual(sb.P.floors[1].voids[0].id, 'vOther');
});
