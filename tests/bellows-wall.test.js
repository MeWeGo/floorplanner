/* Tests for bellows corridor walls (Körük koridor).
   Evaluates real functions extracted from app.js and verifies source wiring. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, constLineOf } = require('./helpers/repo');

const src = read('app.js');
const fnSrc = name => fnSrcOf(src, name);

const constLine = name => constLineOf(src, name);

const {
  BEL_PITCH,
  BEL_DEPTH,
  BEL_T,
  BEL_ROOF_T,
  isBelWall,
  belSides,
  belRibs,
  belPathZig,
  belFolds,
  belZigzag,
  belSegsCross,
  belRoofPts,
  belFloorPts,
  belRoofFolds,
  belStart,
  setBelWall,
  belReset,
  cleanBel,
  bellowsSvg,
} = new Function(`
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wLen = w => dist(w.a, w.b);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const view = { z: 1 };
  const pal = () => ({ wall: '#1e293b', sub: '#64748b', outline: false });
  ${fnSrc('polyArea')}
  ${constLine('wallPivot')}
  ${constLine('wallFree')}
  ${fnSrc('setWallDeg')}
  ${constLine('BEL_PITCH')}
  ${fnSrc('isBelWall')}
  ${fnSrc('belPose')}
  ${fnSrc('belRibs')}
  ${fnSrc('belSides')}
  ${fnSrc('belPathZig')}
  ${fnSrc('belFolds')}
  ${fnSrc('belZigzag')}
  ${fnSrc('belSegsCross')}
  ${fnSrc('belRoofPts')}
  ${fnSrc('belFloorPts')}
  ${fnSrc('belAreaPts')}
  ${fnSrc('belRoofFolds')}
  ${fnSrc('belStart')}
  ${fnSrc('setBelWall')}
  ${fnSrc('belReset')}
  ${fnSrc('cleanBel')}
  ${fnSrc('bellowsSvg')}
  return {
    BEL_PITCH, BEL_DEPTH, BEL_T, BEL_ROOF_T,
    isBelWall, belSides, belFolds, belZigzag, belSegsCross, belRibs, belPathZig,
    belRoofPts, belFloorPts, belRoofFolds, belStart, setBelWall, belReset, cleanBel, bellowsSvg,
  };
`)();

const polyAreaT = pts => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0) / 2;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

test('(1) belSides: none when unmoved, one side for fan, two sides for parallel move', () => {
  const plain = { id: 'w0', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
  assert.deepStrictEqual(belSides(plain), []);

  const unmoved = {
    id: 'w1',
    a: { x: 0, y: 0 }, b: { x: 100, y: 0 },
    bel: { a: { x: 0.4, y: 0.4 }, b: { x: 100, y: 0 } }, // < 1 cm move
  };
  assert.deepStrictEqual(belSides(unmoved), []);

  const fan = {
    id: 'w2',
    a: { x: 0, y: 0 }, b: { x: 0, y: 100 },
    bel: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
  };
  assert.deepStrictEqual(belSides(fan).map(s => s.e), ['b']);

  const parallel = {
    id: 'w3',
    a: { x: 0, y: 80 }, b: { x: 100, y: 80 },
    bel: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
  };
  assert.deepStrictEqual(belSides(parallel).map(s => s.e), ['a', 'b']);
});

test('(2) belZigzag: ends on axis, folds alternate +-depth/2, count matches belFolds', () => {
  const p = { x: 10, y: 20 }, q = { x: 110, y: 20 }; // L = 100 along +X
  const folds = belFolds(100);
  assert.strictEqual(folds, Math.max(2, Math.round(100 / BEL_PITCH)));
  assert.strictEqual(belFolds(5), 2);

  const pts = belZigzag(p, q, 10);
  assert.strictEqual(pts.length, folds + 1);
  near(pts[0].x, p.x, 'start x');
  near(pts[0].y, p.y, 'start y');
  near(pts[pts.length - 1].x, q.x, 'end x');
  near(pts[pts.length - 1].y, q.y, 'end y');

  for (let i = 1; i < pts.length - 1; i++) {
    const expectedY = p.y + (i % 2 ? 1 : -1) * 5;
    near(pts[i].y, expectedY, `fold ${i} offset`);
  }
});

test('(3) belRoofPts & belRoofFolds: quad, triangle, null cases, and fold count', () => {
  const parallel = {
    id: 'w1',
    a: { x: 0, y: 100 }, b: { x: 120, y: 100 },
    bel: { a: { x: 0, y: 0 }, b: { x: 120, y: 0 } },
  };
  const quad = belRoofPts(parallel);
  assert.ok(Array.isArray(quad) && quad.length === 4, 'parallel move gives quad');
  assert.strictEqual(belRoofFolds(parallel).length, belFolds(100) - 1);

  const fan = {
    id: 'w2',
    a: { x: 0, y: 0 }, b: { x: 0, y: 100 },
    bel: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
  };
  const tri = belRoofPts(fan);
  assert.ok(Array.isArray(tri) && tri.length > 3, 'fan move gives a fan with an arc');
  assert.ok(tri.slice(1).every(p => Math.abs(Math.hypot(p.x, p.y) - 100) < 1e-6), 'fan edge is an arc around the pivot');
  assert.strictEqual(belRoofFolds(fan).length, belFolds(Math.PI / 2 * 100) - 1);

  const noRoof = { ...parallel, bel: { ...parallel.bel, roof: 0 } };
  assert.strictEqual(belRoofPts(noRoof), null);

  const flipped = {
    id: 'w3',
    a: { x: 120, y: 100 }, b: { x: 0, y: 100 },
    bel: { a: { x: 0, y: 0 }, b: { x: 120, y: 0 } },
  };
  assert.strictEqual(belRoofPts(flipped), null, 'crossed sides return null');

  const unmoved = {
    id: 'w4',
    a: { x: 0, y: 0 }, b: { x: 120, y: 0 },
    bel: { a: { x: 0, y: 0 }, b: { x: 120, y: 0 } },
  };
  assert.strictEqual(belRoofPts(unmoved), null);
});

test('(4) belStart: prefers group layout, then room layout, then hinged angles, else current', () => {
  const w = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, angles: [0, 90] };

  const fGroup = {
    groups: [{ vars: [{ poses: { w1: { a: { x: 0, y: 50 }, b: { x: 100, y: 50 } } } }] }],
    rooms: [{ vars: [{ poses: { w1: { a: { x: 0, y: 99 }, b: { x: 100, y: 99 } } } }] }],
  };
  assert.deepStrictEqual(belStart(fGroup, w), { a: { x: 0, y: 50 }, b: { x: 100, y: 50 } });

  const fRoom = {
    groups: [],
    rooms: [{ vars: [{ poses: { w1: { a: { x: 0, y: 80 }, b: { x: 100, y: 80 } } } }] }],
  };
  assert.deepStrictEqual(belStart(fRoom, w), { a: { x: 0, y: 80 }, b: { x: 100, y: 80 } });

  const fHinge = { groups: [], rooms: [] };
  assert.deepStrictEqual(belStart(fHinge, w), { a: { x: 0, y: 0 }, b: { x: 0, y: 100 } });

  const wPlain = { id: 'w2', a: { x: 10, y: 20 }, b: { x: 110, y: 20 } };
  assert.deepStrictEqual(belStart(fHinge, wPlain), { a: { x: 10, y: 20 }, b: { x: 110, y: 20 } });
});

test('(5) setBelWall & belReset: toggles on/off, keeps first pose on repeat, preserves roof:0', () => {
  const f = { groups: [], rooms: [] };
  const w = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };

  setBelWall(f, w, true);
  assert.strictEqual(isBelWall(w), true);
  assert.deepStrictEqual(w.bel, { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } });

  w.a = { x: 0, y: 60 };
  w.b = { x: 100, y: 60 };
  setBelWall(f, w, true);
  assert.deepStrictEqual(w.bel, { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }, 'turning on twice keeps first position');

  w.bel.roof = 0;
  belReset(w);
  assert.deepStrictEqual(w.bel, { a: { x: 0, y: 60 }, b: { x: 100, y: 60 }, roof: 0 });

  setBelWall(f, w, false);
  assert.strictEqual(isBelWall(w), false);
  assert.strictEqual('bel' in w, false);
});

test('(6) cleanBel: drops invalid, keeps roof:0, coerces strings to numbers', () => {
  const plain = { id: 'w0', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
  cleanBel(plain);
  assert.strictEqual('bel' in plain, false);

  const invalid = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, bel: { a: { x: NaN, y: 0 }, b: { x: 100, y: 0 } } };
  cleanBel(invalid);
  assert.strictEqual('bel' in invalid, false);

  const valid = {
    id: 'w2',
    a: { x: 0, y: 0 }, b: { x: 100, y: 0 },
    bel: { a: { x: '10', y: '20' }, b: { x: '110', y: 20 }, roof: 0, extra: 1 },
  };
  cleanBel(valid);
  assert.deepStrictEqual(valid.bel, { a: { x: 10, y: 20 }, b: { x: 110, y: 20 }, roof: 0 });

  const nonZeroRoof = {
    id: 'w3',
    a: { x: 0, y: 0 }, b: { x: 100, y: 0 },
    bel: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, roof: 1 },
  };
  cleanBel(nonZeroRoof);
  assert.deepStrictEqual(nonZeroRoof.bel, { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } });
});

test('(7) bellowsSvg: empty for no bellows, data-id present only when live', () => {
  const fEmpty = { walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }] };
  assert.strictEqual(bellowsSvg(fEmpty, true), '');

  const fBel = {
    walls: [{
      id: 'w_bel',
      a: { x: 0, y: 80 }, b: { x: 100, y: 80 },
      bel: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
    }],
  };
  const liveSvg = bellowsSvg(fBel, true);
  assert.ok(liveSvg.includes('data-id="w_bel"'), 'live SVG must include hit path with data-id');

  const exportSvg = bellowsSvg(fBel, false);
  assert.ok(exportSvg.length > 0 && !exportSvg.includes('data-id='), 'non-live SVG must omit data-id');
});

test('(8) source wiring: 2D, 3D, walk, tag, normalize, paste, panel and actions', () => {
  assert.match(fnSrc('layerStrings'), /walls:[\s\S]*?bellowsSvg\(/);
  assert.match(fnSrc('build3D'), /bellows3D\(/);
  assert.match(fnSrc('walkSegs'), /belSides\(w\)/);
  assert.match(fnSrc('wallTag'), /belSides\(w\).*· ≋/);
  assert.match(fnSrc('normalizeProject'), /cleanBel\(/);
  assert.match(fnSrc('paste'), /n\.bel/);
  assert.match(fnSrc('applyProp'), /p === 'bel'[\s\S]*?p === 'belRoof'/);
  assert.match(src, /a === 'belhome'[\s\S]*?belReset\(/);
  assert.match(fnSrc('renderProps'), /data-p="bel"/);
});

test('(9) fan: every fold is an in-between wall position of the same length, from the pivot, evenly spaced', () => {
  const hinge = { id: 'h', a: { x: 0, y: 0 }, b: { x: 0, y: 300 }, bel: { a: { x: 0, y: 0 }, b: { x: 300, y: 0 } } };
  const folds = belRoofFolds(hinge);
  assert.strictEqual(folds.length, belFolds(Math.PI / 2 * 300) - 1);
  for (const [p, q] of folds) {
    near(Math.hypot(p.x, p.y), 0, 'rib starts at the pivot');
    near(Math.hypot(q.x - p.x, q.y - p.y), 300, 'rib has the wall length');
  }
  const ribs = belRibs(hinge), gaps = ribs.slice(1).map((r, i) => Math.hypot(r.b.x - ribs[i].b.x, r.b.y - ribs[i].b.y));
  for (const g of gaps) near(g, gaps[0], 'folds evenly spaced');
  const side = belSides(hinge)[0];
  assert.strictEqual(side.e, 'b');
  for (const p of side.path) near(Math.hypot(p.x, p.y), 300, 'side follows the arc');
  const zig = belPathZig(side.path, 10);
  const off = zig.slice(1, -1).map(p => Math.hypot(p.x, p.y) - 300);
  off.forEach((r, i) => { assert.ok(Math.abs(Math.abs(r) - 5) < 0.2, 'pleat ' + i + ' is half the depth off the arc: ' + r); if (i) assert.ok(Math.sign(r) === -Math.sign(off[i - 1]), 'pleats alternate'); });
});

test('(10) slide: parallel folds of the wall length, straight sides like before', () => {
  const slide = { id: 's', a: { x: 0, y: 250 }, b: { x: 300, y: 250 }, bel: { a: { x: 0, y: 0 }, b: { x: 300, y: 0 } } };
  for (const [p, q] of belRoofFolds(slide)) { near(q.x - p.x, 300, 'rib length'); near(q.y - p.y, 0, 'rib parallel'); }
  const side = belSides(slide)[0];
  assert.deepStrictEqual(belPathZig(side.path).map(p => [+p.x.toFixed(6), +p.y.toFixed(6)]), belZigzag(side.p, side.q).map(p => [+p.x.toFixed(6), +p.y.toFixed(6)]));
});

test('(11) belFloorPts (#154): floor under slide and fan corridors, on by default, independent of the roof', () => {
  const slide = { id: 's', a: { x: 0, y: 100 }, b: { x: 120, y: 100 }, bel: { a: { x: 0, y: 0 }, b: { x: 120, y: 0 } } };
  const fl = belFloorPts(slide);
  assert.ok(Array.isArray(fl) && fl.length === 4, 'slide gives a quad floor');
  near(Math.abs(polyAreaT(fl)), 120 * 100, 'floor covers the corridor');
  assert.deepStrictEqual(fl, belRoofPts(slide), 'floor = roof footprint');

  const fan = { id: 'f', a: { x: 0, y: 0 }, b: { x: 0, y: 100 }, bel: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } } };
  const ff = belFloorPts(fan);
  assert.ok(Array.isArray(ff) && ff.length > 3, 'fan gives a floor');
  assert.ok(Math.abs(polyAreaT(ff)) > 0.9 * Math.PI / 4 * 100 * 100, 'fan floor covers the quarter circle');

  const noRoof = { ...slide, bel: { ...slide.bel, roof: 0 } };
  assert.strictEqual(belRoofPts(noRoof), null);
  assert.ok(belFloorPts(noRoof), 'floor stays without a roof');
  const noFloor = { ...slide, bel: { ...slide.bel, floor: 0 } };
  assert.strictEqual(belFloorPts(noFloor), null, 'floor: 0 turns it off');
  assert.ok(belRoofPts(noFloor), 'roof stays without a floor');

  const unmoved = { id: 'u', a: { x: 0, y: 0 }, b: { x: 120, y: 0 }, bel: { a: { x: 0, y: 0 }, b: { x: 120, y: 0 } } };
  assert.strictEqual(belFloorPts(unmoved), null, 'no floor when the wall has not moved');
  const flipped = { id: 'x', a: { x: 120, y: 100 }, b: { x: 0, y: 100 }, bel: { a: { x: 0, y: 0 }, b: { x: 120, y: 0 } } };
  assert.strictEqual(belFloorPts(flipped), null, 'no floor when the sides cross');
});

test('(12) floor: 0 survives cleanBel and belReset; 3D builds the floor at the wall base; panel toggle', () => {
  const w = { id: 'w', a: { x: 0, y: 50 }, b: { x: 100, y: 50 }, bel: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, floor: 0, roof: 0 } };
  cleanBel(w);
  assert.deepStrictEqual(w.bel, { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, roof: 0, floor: 0 });
  belReset(w);
  assert.deepStrictEqual(w.bel, { a: { x: 0, y: 50 }, b: { x: 100, y: 50 }, roof: 0, floor: 0 });
  const on = { id: 'v', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, bel: { a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, floor: 1 } };
  cleanBel(on);
  assert.strictEqual('floor' in on.bel, false, 'default (on) is not stored');
  assert.match(fnSrc('bellows3D'), /belFloorPts\(w\)[\s\S]*?position\.y = y0 \+ 0\.3/);
  assert.match(fnSrc('applyProp'), /p === 'belFloor'[\s\S]*?o\.bel\.floor = 0/);
  assert.match(fnSrc('renderProps'), /data-p="belFloor"/);
});

/* #183: bellows material. Run the real belMat / cleanBel / belReset / bellows3D with a tiny THREE stub and check that a
   translucent membrane makes only the folded sides see-through while the roof and floor stay opaque. */
const B = new Function(`
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  ${fnSrc('hex2rgb')}
  ${fnSrc('shade')}
  ${fnSrc('polyArea')}
  ${constLine('BEL_PITCH')}
  ${constLine('BEL_MATS')}
  ${constLine('BEL_MAT_COL')}
  ${constLine('SURF_TILE')}
  const sf = (kind, c) => ({ fk: kind, c });
  const ACC_FAN_T = 3;
  ${fnSrc('accFanOutline')}
  ${fnSrc('isBelWall')}
  ${fnSrc('belPose')}
  ${fnSrc('belRibs')}
  ${fnSrc('belSides')}
  ${fnSrc('belPathZig')}
  ${fnSrc('belFolds')}
  ${fnSrc('belSegsCross')}
  ${fnSrc('belRoofPts')}
  ${fnSrc('belFloorPts')}
  ${fnSrc('belAreaPts')}
  ${fnSrc('belRoofFolds')}
  ${fnSrc('belReset')}
  ${fnSrc('cleanBel')}
  ${fnSrc('belMat')}
  const uvAttr = () => ({ count: 2, v: [10, 20, 30, 40], getX(i) { return this.v[2 * i]; }, getY(i) { return this.v[2 * i + 1]; }, setXY(i, x, y) { this.v[2 * i] = x; this.v[2 * i + 1] = y; } });
  const THREE = {
    DoubleSide: 2,
    Vector2: function (x, y) { this.x = x; this.y = y; },
    Shape: function (pts) { this.pts = pts; },
    ExtrudeGeometry: function () { this.attributes = { uv: uvAttr() }; this.rotateX = () => {}; },
    EdgesGeometry: function () {}, LineSegments: function () {},
    Mesh: function (geo, mat) { this.geometry = geo; this.material = mat; this.position = {}; this.add = () => {}; },
  };
  ${fnSrc('bellows3D')}
  return { BEL_MATS, belMat, cleanBel, belReset, bellows3D, BEL_MEM_OP: 0.42 };
`)();

const slideWall = extra => ({ id: 'w', a: { x: 0, y: 200 }, b: { x: 300, y: 200 }, bel: { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, ...extra } });
// mat() as in build3D: one opaque Lambert-like object per colour / tagged colour
const build = w => {
  const made = [], S = { kids: [], add(m) { this.kids.push(m); } };
  const mat = c => { const m = { c, transparent: false, opacity: 1 }; made.push(m); return m; };
  const memMat = c => ({ c, transparent: true, opacity: B.BEL_MEM_OP, depthWrite: false });
  B.bellows3D(S, w, 0, 250, mat, () => {}, false, {}, false, memMat);
  const by = part => S.kids.filter(m => m.userData.belPart === part);
  return { side: by('side'), roof: by('roof'), floor: by('floor') };
};

test('(13) #183 belMat: rubber default keeps the old colour, kinds and custom colours', () => {
  const w = slideWall();
  assert.deepStrictEqual(B.belMat(w, false), { kind: 'rubber', col: '#3f3f46', custom: false }, 'old dark look in dark theme');
  assert.strictEqual(B.belMat(w, true).col, '#57534e', 'old look in light theme');
  assert.strictEqual(B.belMat({ ...w, color: '#ffffff' }, false).col, '#a6a6a6', 'follows the wall paint like before');
  assert.strictEqual(B.belMat(slideWall({ mat: 'membrane' })).kind, 'membrane');
  assert.strictEqual(B.belMat(slideWall({ mat: 'bogus' })).kind, 'rubber', 'unknown kind = default');
  assert.deepStrictEqual(B.belMat(slideWall({ mat: 'fabric', col: '#112233' })), { kind: 'fabric', col: '#112233', custom: true });
  for (const k of Object.keys(B.BEL_MATS)) assert.strictEqual(B.BEL_MATS[k].length, 2, k + ' is bilingual');
});

test('(14) #183 cleanBel / belReset keep a valid material and colour, drop bad and default values', () => {
  const w = slideWall({ mat: 'membrane', col: '#AABBCC', roof: 0 });
  B.cleanBel(w);
  assert.deepStrictEqual(w.bel, { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, roof: 0, mat: 'membrane', col: '#aabbcc' });
  B.belReset(w);
  assert.strictEqual(w.bel.mat, 'membrane'); assert.strictEqual(w.bel.col, '#aabbcc'); assert.strictEqual(w.bel.roof, 0);
  const bad = slideWall({ mat: 'rubber', col: 'red' });
  B.cleanBel(bad);
  assert.deepStrictEqual(Object.keys(bad.bel).sort(), ['a', 'b'], 'default kind and bad colour are not stored');
  const old = slideWall(); B.cleanBel(old);
  assert.deepStrictEqual(Object.keys(old.bel).sort(), ['a', 'b'], 'old projects load unchanged');
});

test('(15) #183 bellows3D: membrane makes only the sides translucent; roof and floor stay opaque', () => {
  const mem = build(slideWall({ mat: 'membrane' }));
  assert.strictEqual(mem.side.length, 2); assert.strictEqual(mem.roof.length, 1); assert.strictEqual(mem.floor.length, 1);
  for (const m of mem.side) { assert.strictEqual(m.material.transparent, true); assert.ok(m.material.opacity < 1); assert.strictEqual(m.material.depthWrite, false); assert.strictEqual(m.castShadow, false); }
  for (const m of [...mem.roof, ...mem.floor]) { assert.strictEqual(m.material.transparent, false, 'opaque'); assert.strictEqual(m.material.opacity, 1); }

  const rub = build(slideWall());
  for (const m of [...rub.side, ...rub.roof, ...rub.floor]) assert.strictEqual(m.material.transparent, false);
  assert.strictEqual(rub.side[0].material.c, '#3f3f46', 'default = the old untagged colour');
  assert.strictEqual(rub.roof[0].material.c, '#3f3f46');

  const fab = build(slideWall({ mat: 'fabric' }));
  assert.deepStrictEqual(fab.side[0].material.c, { fk: 'fabric', c: '#c8b99c' }, 'fabric sides are tagged for the textured material');
  for (const m of [...fab.side, ...fab.roof, ...fab.floor]) assert.strictEqual(m.material.transparent, false);
  assert.ok(fab.side[0].geometry.attributes.uv.v[0] < 1, 'cm UVs scaled to the fabric tile');
  const met = build(slideWall({ mat: 'metal', col: '#445566' }));
  assert.deepStrictEqual(met.roof[0].material.c, { fk: 'metal', c: '#445566' });
});

test('(16) #183 wiring: panel select + colour, applyProp, reset, build3D passes the membrane material', () => {
  const rp = fnSrc('renderProps');
  assert.match(rp, /'wall', 'belMat'/); assert.match(rp, /'wall', 'belCol'/); assert.match(rp, /belcolreset/);
  const ap = fnSrc('applyProp');
  assert.match(ap, /p === 'belMat'[\s\S]*?delete o\.bel\.mat/); assert.match(ap, /p === 'belCol'/);
  assert.match(fnSrc('build3D'), /bellows3D\([^)]*belMem\)/);
  assert.match(fnSrc('build3D'), /belMem = [^;]*transparent: true[^;]*depthWrite: false/);
});
