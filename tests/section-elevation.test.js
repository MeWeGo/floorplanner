/* Section cut (issue #30) and elevations (issue #31).
   Runs lineCutIntervals, subIntervals, sectionFrame, and archPrims cut out of
   app.js against synthetic floors, plus checks on the source. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');
const html = read('index.html');

const fnSrc = name => {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + '() is gone from app.js');
  return src.slice(start, src.indexOf('\n}', start) + 2);
};

const constLine = name => {
  const start = src.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is gone from app.js');
  const end = src.indexOf('\n', start);
  return src.slice(start, end).replace(/\r$/, '');
};

function makeEnv(floors = []) {
  return new Function('floors', `
    const P = { wallH: 270, floors };
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const visFloor = f => f; // katman süzgeci (#32): bu testlerde tüm katmanlar görünür
    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
    const wLen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const slabPolys = f => {
      if (!f.walls || !f.walls.length) return [];
      const xs = f.walls.flatMap(w => [w.a.x, w.b.x]);
      const ys = f.walls.flatMap(w => [w.a.y, w.b.y]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs);
      const y0 = Math.min(...ys), y1 = Math.max(...ys);
      return [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]];
    };
    ${constLine('floorH')}
    ${constLine('floorElev')}
    ${constLine('fmtLevel')}
    ${constLine('ELEV_DIRS')}
    ${constLine('LOW_WALL')}
    ${constLine('WALL_ELEV_MAX')}
    ${src.slice(src.indexOf('function isLowWall'), src.indexOf('\n', src.indexOf('function isLowWall')))}
    ${fnSrc('lineCutIntervals')}
    ${fnSrc('subIntervals')}
    ${fnSrc('sectionFrame')}
    ${fnSrc('archPrims')}
    return { P, dist, clamp, wLen, slabPolys, floorElev, fmtLevel, ELEV_DIRS, lineCutIntervals, subIntervals, sectionFrame, archPrims };
  `)(floors);
}

let n = 0;
const W = (ax, ay, bx, by, id = 'w' + n++) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, t: 20 });

test('(1) lineCutIntervals of rectangle and concave polygon', () => {
  const { lineCutIntervals } = makeEnv();
  const rect = [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 500 }, { x: 0, y: 500 }];
  const ivs = lineCutIntervals(rect, { x: -100, y: 200 }, { x: 1, y: 0 });
  assert.deepStrictEqual(ivs, [[100, 900]]);

  const uShape = [
    { x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 500, y: 300 },
    { x: 500, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 500 }, { x: 0, y: 500 },
  ];
  const uIvs = lineCutIntervals(uShape, { x: -100, y: 200 }, { x: 1, y: 0 });
  assert.strictEqual(uIvs.length, 2);
  assert.deepStrictEqual(uIvs, [[100, 400], [600, 900]]);
});

test('(2) subIntervals subtracts sub-ranges', () => {
  const { subIntervals } = makeEnv();
  assert.deepStrictEqual(subIntervals([[0, 100]], [[40, 60]]), [[0, 40], [60, 100]]);
});

test('(3) sectionFrame normal vector direction', () => {
  const { sectionFrame } = makeEnv();
  const f1 = sectionFrame({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, dir: 1 });
  assert.strictEqual(Math.abs(f1.n.x), 0);
  assert.strictEqual(f1.n.x + 0, 0);
  assert.strictEqual(f1.n.y, 1);

  const f2 = sectionFrame({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, dir: -1 });
  assert.strictEqual(Math.abs(f2.n.x), 0);
  assert.strictEqual(f2.n.x + 0, 0);
  assert.strictEqual(f2.n.y, -1);
});

test('(4) archPrims for section through 2-floor building', () => {
  const f0 = {
    id: 'f0', name: 'Zemin Kat',
    walls: [
      W(0, 0, 800, 0, 'w1'),
      W(800, 0, 800, 500, 'w2'),
      W(800, 500, 0, 500, 'w3'),
      W(0, 500, 0, 0, 'w4'),
      W(400, 0, 400, 500, 'wmid'),
    ],
    ops: [], furn: [], rooms: [], slabs: [], voids: []
  };
  const f1 = {
    id: 'f1', name: '1. Kat',
    walls: [
      W(0, 0, 800, 0, 'w5'),
      W(800, 0, 800, 500, 'w6'),
      W(800, 500, 0, 500, 'w7'),
      W(0, 500, 0, 0, 'w8'),
    ],
    ops: [], furn: [], rooms: [], slabs: [], voids: []
  };

  const env = makeEnv([f0, f1]);
  const sec = { a: { x: -100, y: 200 }, b: { x: 900, y: 200 }, dir: 1 };
  const frm = env.sectionFrame(sec);
  const u = { x: -frm.n.y, y: frm.n.x };
  const sb = (sec.b.x - frm.O.x) * u.x + (sec.b.y - frm.O.y) * u.y;
  const spec = {
    O: sec.a,
    n: frm.n,
    cut: true,
    crop: [Math.min(0, sb), Math.max(0, sb)]
  };
  const { prims, levels } = env.archPrims(spec);

  const wallCuts = prims.filter(p => p.t === 'cut' && p.z1 > p.z0 + 100);
  const f0WallCuts = wallCuts.filter(p => p.z0 < 200);
  const f1WallCuts = wallCuts.filter(p => p.z0 >= 200);
  assert.strictEqual(f0WallCuts.length, 3, '3 crossing walls cut on floor 0');
  assert.strictEqual(f1WallCuts.length, 2, '2 crossing walls cut on floor 1');

  const slabCuts = prims.filter(p => p.t === 'cut' && Math.round(p.z1 - p.z0) === 20);
  assert.strictEqual(slabCuts.length, 2, 'cut slab bands for both floors (height 20)');
  assert.ok(slabCuts.some(p => p.z0 === -20 && p.z1 === 0), 'floor 0 slab band');
  assert.ok(slabCuts.some(p => p.z0 === 270 && p.z1 === 290), 'floor 1 slab band');

  assert.deepStrictEqual(levels.map(l => env.fmtLevel(l.z)), ['±0.00', '+2.90']);

  const facePrims = prims.filter(p => p.t === 'face');
  assert.ok(facePrims.some(p => p.depth === 300), 'far wall (y=500) drawn as face prim');
  assert.ok(!facePrims.some(p => p.depth < 0), 'near wall (y=0, behind viewer) is NOT drawn');
});

test('(5) a void polygon crossing section line splits slab band', () => {
  const f0 = {
    id: 'f0', name: 'Zemin Kat',
    walls: [
      W(0, 0, 800, 0, 'w1'),
      W(800, 0, 800, 500, 'w2'),
      W(800, 500, 0, 500, 'w3'),
      W(0, 500, 0, 0, 'w4'),
    ],
    ops: [], furn: [], rooms: [], slabs: [],
    voids: [
      { id: 'v1', pts: [{ x: 300, y: 100 }, { x: 500, y: 100 }, { x: 500, y: 300 }, { x: 300, y: 300 }] }
    ]
  };
  const env = makeEnv([f0]);
  const sec = { a: { x: -100, y: 200 }, b: { x: 900, y: 200 }, dir: 1 };
  const frm = env.sectionFrame(sec);
  const u = { x: -frm.n.y, y: frm.n.x };
  const sb = (sec.b.x - frm.O.x) * u.x + (sec.b.y - frm.O.y) * u.y;
  const spec = {
    O: sec.a,
    n: frm.n,
    cut: true,
    crop: [Math.min(0, sb), Math.max(0, sb)]
  };
  const { prims } = env.archPrims(spec);
  const slabCuts = prims.filter(p => p.t === 'cut' && Math.round(p.z1 - p.z0) === 20);
  assert.strictEqual(slabCuts.length, 2, 'splits floor slab into two cut prims');
});

test('(6) window at section cut point turns wall cut into two bands', () => {
  const f0 = {
    id: 'f0', name: 'Zemin Kat',
    walls: [
      W(400, 0, 400, 500, 'wmid'),
    ],
    ops: [
      { id: 'op1', wall: 'wmid', d: 200, w: 120, h: 120, sill: 90, type: 'window' }
    ],
    furn: [], rooms: [], slabs: [], voids: []
  };
  const env = makeEnv([f0]);
  const sec = { a: { x: -100, y: 200 }, b: { x: 900, y: 200 }, dir: 1 };
  const frm = env.sectionFrame(sec);
  const u = { x: -frm.n.y, y: frm.n.x };
  const sb = (sec.b.x - frm.O.x) * u.x + (sec.b.y - frm.O.y) * u.y;
  const spec = {
    O: sec.a,
    n: frm.n,
    cut: true,
    crop: [Math.min(0, sb), Math.max(0, sb)]
  };
  const { prims } = env.archPrims(spec);
  const wallCuts = prims.filter(p => p.t === 'cut' && p.z1 > 20);
  assert.strictEqual(wallCuts.length, 2, 'wall cut split into two bands');
  assert.deepStrictEqual([wallCuts[0].z0, wallCuts[0].z1], [0, 90], 'below sill band');
  assert.deepStrictEqual([wallCuts[1].z0, wallCuts[1].z1], [210, 270], 'above head band');
});

test('(7) elevation spec draws walls as faces, no cut prims, window as hole', () => {
  const f0 = {
    id: 'f0', name: 'Zemin Kat',
    walls: [
      W(0, 0, 800, 0, 'w1'),
      W(800, 0, 800, 500, 'w2'),
      W(800, 500, 0, 500, 'w3'),
      W(0, 500, 0, 0, 'w4'),
    ],
    ops: [
      { id: 'win1', wall: 'w1', d: 400, w: 120, h: 120, sill: 90, type: 'window' }
    ],
    furn: [], rooms: [], slabs: [], voids: []
  };
  const env = makeEnv([f0]);
  const spec = {
    O: { x: 0, y: -1000 },
    n: env.ELEV_DIRS.north,
    cut: false,
    crop: null
  };
  const { prims } = env.archPrims(spec);
  const cutPrims = prims.filter(p => p.t === 'cut');
  assert.strictEqual(cutPrims.length, 0, 'no cut prims in elevation');
  const wallFaces = prims.filter(p => p.t === 'face' && !p.slab);
  assert.strictEqual(wallFaces.length, 4, 'every wall drawn as a face');
  const holes = wallFaces.flatMap(w => w.holes || []);
  assert.strictEqual(holes.length, 1, 'one window hole on north wall');
  assert.strictEqual(holes[0].z0, 90, 'window hole z0 equals sill');
  assert.strictEqual(holes[0].type, 'window');
});

test('(8) wiring asserts on app.js source and index.html', () => {
  // TOOLS has ['section', ..., 'Kesit', 'L', 'Section']
  assert.match(src, /\['section',\s*'[^']+',\s*'Kesit',\s*'L',\s*'Section'\]/);

  // KINDS has sections: 'section'
  assert.match(src, /KINDS\s*=\s*\{[\s\S]*?sections:\s*['"]section['"]/);

  // newFloor has sections: []
  assert.match(src, /newFloor[\s\S]*?sections:\s*\[\]/);

  // applySecClip sets T3.r.clippingPlanes
  const fnApplySecClip = fnSrc('applySecClip');
  assert.match(fnApplySecClip, /T3\.r\.clippingPlanes\s*=/);

  // build3D calls applySecClip()
  const fnBuild3D = fnSrc('build3D');
  assert.match(fnBuild3D, /applySecClip\(\)/);

  // set3DCam handles ELEV_DIRS[kind]
  const fnSet3DCam = fnSrc('set3DCam');
  assert.match(fnSet3DCam, /ELEV_DIRS\[kind\]/);

  // index.html has buttons b3dN b3dE b3dS b3dW
  for (const id of ['b3dN', 'b3dE', 'b3dS', 'b3dW']) {
    assert.ok(html.includes(`id="${id}"`) || html.includes(`id='${id}'`), `index.html must have #${id}`);
  }

  // archModal offers data-archdl svg and png
  const fnArchModal = fnSrc('archModal');
  assert.match(fnArchModal, /data-archdl=["']svg["']/);
  assert.match(fnArchModal, /data-archdl=["']png["']/);
});
