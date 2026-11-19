/* Tests for bellows corridor walls (Körük koridor).
   Evaluates real functions extracted from app.js and verifies source wiring. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js');
const fnSrc = name => fnSrcOf(src, name);

const constLine = name => {
  const start = src.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is gone from app.js');
  return src.slice(start, src.indexOf('\n', start));
};

const {
  BEL_PITCH,
  BEL_DEPTH,
  BEL_T,
  BEL_ROOF_T,
  isBelWall,
  belSides,
  belFolds,
  belZigzag,
  belSegsCross,
  belRoofPts,
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
  ${fnSrc('belSides')}
  ${fnSrc('belFolds')}
  ${fnSrc('belZigzag')}
  ${fnSrc('belSegsCross')}
  ${fnSrc('belRoofPts')}
  ${fnSrc('belRoofFolds')}
  ${fnSrc('belStart')}
  ${fnSrc('setBelWall')}
  ${fnSrc('belReset')}
  ${fnSrc('cleanBel')}
  ${fnSrc('bellowsSvg')}
  return {
    BEL_PITCH, BEL_DEPTH, BEL_T, BEL_ROOF_T,
    isBelWall, belSides, belFolds, belZigzag, belSegsCross,
    belRoofPts, belRoofFolds, belStart, setBelWall, belReset, cleanBel, bellowsSvg,
  };
`)();

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
  assert.ok(Array.isArray(tri) && tri.length === 3, 'fan move gives triangle');
  assert.strictEqual(belRoofFolds(fan).length, belFolds(Math.hypot(100, 100)) - 1);

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
