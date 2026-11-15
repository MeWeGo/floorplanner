/* Tests for parametric roofs (#115): ROOF-PARAM parity, roofP defaults/clamping,
   roofParamFaces geometry/volume/planarity, off-centre ridge, hip/pyramid,
   wall attach (#96), cleanRoof, wiring guards, and MCP roundtrip. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, markerBlock, wallTopSrc, mcpClient } = require('./helpers/repo');

const src = read('app.js');
const mcpSrc = read('mcp/server.js');

function load(floor = { walls: [], ops: [] }) {
  const api = new Function('f', `
    const F = () => f;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const wLen = w => dist(w.a, w.b);
    const partR = v => Math.round(v * 100) / 100;
    const wallElev = w => +w.elev || 0;
    const furnElev = o => +o.elev || 0;
    const curFloorH = () => 270;
    const pickable = () => true;
    const FURN_ELEV_MAX = 5000;
    const roofTopCache = new WeakMap();
    const ROOF_COURSE = { tile: 32, shingle: 25, slate: 24, metal: 45, concrete: 60 };
    ${fnSrcOf(src, 'pointInPoly')}
    ${markerBlock(src, 'ROOF-PARAM')}
    ${fnSrcOf(src, 'roofFaces')}
    ${fnSrcOf(src, 'partRotM')}
    ${fnSrcOf(src, 'fitOpsToWall')}
    ${wallTopSrc(src)}
    ${fnSrcOf(src, 'roofTopFaces')}
    ${fnSrcOf(src, 'roofCourseSvg')}
    ${fnSrcOf(src, 'roofFitWalls')}
    ${fnSrcOf(src, 'roofDefaults')}
    return {
      ROOF_TYPES, ROOF_MATS, isParamRoof, roofP, cleanRoof, roofPlanes,
      roofRise, roofHeight, roofClip, roofParamFaces,
      roofFaces, surfFaces, surfHits, wallSurfProfile, attachWallTop,
      roofTopFaces, roofCourseSvg, roofFitWalls, roofDefaults,
      cleanWallTop, wallTopOn, wallTopAt, wallTopPts, wallTopMin,
      wallTopSub, setWallTop, detachWallTop, fitOpsToWall
    };
  `)(floor);
  return { f: floor, ...api };
}

function signedVolume(faces) {
  let V = 0;
  for (const f of faces) {
    for (let k = 1; k + 1 < f.length; k++) {
      const a = f[0], b = f[k], c = f[k + 1];
      const ay = -a[1], by = -b[1], cy = -c[1];
      V += a[0] * (by * c[2] - b[2] * cy)
        - ay * (b[0] * c[2] - b[2] * c[0])
        + a[2] * (b[0] * cy - by * c[0]);
    }
  }
  return V / 6;
}

function assertPlanar(face, tol = 1e-4) {
  assert.ok(face.length >= 3, 'face must have at least 3 vertices');
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < face.length; i++) {
    const a = face[i], b = face[(i + 1) % face.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  const len = Math.hypot(nx, ny, nz);
  assert.ok(len > 1e-6, 'face normal must be non-zero');
  nx /= len; ny /= len; nz /= len;
  const p0 = face[0];
  for (const p of face) {
    const d = Math.abs((p[0] - p0[0]) * nx + (p[1] - p0[1]) * ny + (p[2] - p0[2]) * nz);
    assert.ok(d <= tol, `non-planar vertex distance ${d} > ${tol}`);
  }
}

const approx = (actual, expected, tol = 0.2, msg = '') => {
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}expected ${actual} ≈ ${expected} (±${tol})`);
};

test('(1) ROOF-PARAM block is identical in app.js and mcp/server.js', () => {
  assert.strictEqual(
    markerBlock(mcpSrc, 'ROOF-PARAM'),
    markerBlock(src, 'ROOF-PARAM'),
    'ROOF-PARAM block in mcp/server.js must match app.js'
  );
});

test('(2) roofP defaults and clamping', () => {
  const { roofP } = load();
  assert.deepStrictEqual(roofP({}), {
    type: 'gable',
    flat: false,
    pitch: 30,
    ridge: 0,
    dir: 'w',
    hip: null,
    over: 50,
    th: 20,
    mat: 'tile',
  });

  assert.strictEqual(roofP({ roofType: 'gable', pitch: 90 }).pitch, 75);
  assert.strictEqual(roofP({ roofType: 'gable', pitch: -5 }).pitch, 1);
  assert.strictEqual(roofP({ roofType: 'gable', ridge: 0.9 }).ridge, 0.45);
  assert.strictEqual(roofP({ roofType: 'gable', ridge: -0.9 }).ridge, -0.45);

  const fl = roofP({ roofType: 'flat', pitch: 30, ridge: 0.2 });
  assert.strictEqual(fl.flat, true);
  assert.strictEqual(fl.pitch, 0);
  assert.strictEqual(fl.over, 0);
  assert.strictEqual(fl.mat, 'concrete');
  assert.strictEqual(fl.ridge, 0);
});

test('(3) roofParamFaces for flat/gable/hip/shed, ridgeDir w and d', () => {
  const { roofParamFaces, roofHeight, roofRise } = load();
  const expectedCounts = { flat: 6, gable: 10, hip: 16, shed: 6 };

  for (const roofType of Object.keys(expectedCounts)) {
    for (const ridgeDir of ['w', 'd']) {
      const o = { k: 'roof', roofType, ridgeDir, w: 1000, d: 800, th: 20 };
      const faces = roofParamFaces(o);
      assert.strictEqual(faces.length, expectedCounts[roofType], `${roofType} (${ridgeDir}) face count`);
      for (const f of faces) assertPlanar(f);

      const over = roofType === 'flat' ? 0 : 50;
      const expectedVol = (1000 + 2 * over) * (800 + 2 * over) * 20;
      const vol = signedVolume(faces);
      assert.ok(vol > 0, `${roofType} (${ridgeDir}) volume must be positive`);
      approx(vol, expectedVol, 1, `${roofType} (${ridgeDir}) volume: `);

      // with over: 50 explicitly
      const oOver = { k: 'roof', roofType, ridgeDir, w: 1000, d: 800, over: 50, th: 20 };
      approx(signedVolume(roofParamFaces(oOver)), 19.8e6, 1, `${roofType} (${ridgeDir}) over=50 volume: `);

      // max top z equals roofHeight(o) when over = 0
      const oZero = { k: 'roof', roofType, ridgeDir, w: 1000, d: 800, over: 0, th: 20 };
      const zMax = Math.max(...roofParamFaces(oZero).flatMap(f => f.map(p => p[2])));
      approx(zMax, roofHeight(oZero), 0.1, `${roofType} (${ridgeDir}) max z: `);
    }
  }

  // gable 30 deg ridge height = d/2 * tan(30)
  const g = { k: 'roof', roofType: 'gable', pitch: 30, w: 1000, d: 800, th: 20 };
  approx(roofRise(g), 400 * Math.tan(30 * Math.PI / 180), 1e-6, 'gable 30 deg rise: ');
});

test('(4) off-centre ridge puts highest top vertices at y = 0.25*d (dir w) and x = -0.25*w (dir d)', () => {
  const { roofParamFaces } = load();

  const gw = { k: 'roof', roofType: 'gable', pitch: 30, ridge: 0.25, ridgeDir: 'w', w: 1000, d: 800, over: 50, th: 20 };
  const fw = roofParamFaces(gw);
  const maxZw = Math.max(...fw.flatMap(f => f.map(p => p[2])));
  const topVertsW = fw.flat().filter(p => Math.abs(p[2] - maxZw) < 1e-4);
  assert.ok(topVertsW.length > 0);
  for (const p of topVertsW) approx(p[1], 0.25 * 800, 1e-4, 'dir w ridge y: ');

  const gd = { k: 'roof', roofType: 'gable', pitch: 30, ridge: 0.25, ridgeDir: 'd', w: 1000, d: 800, over: 50, th: 20 };
  const fd = roofParamFaces(gd);
  const maxZd = Math.max(...fd.flatMap(f => f.map(p => p[2])));
  const topVertsD = fd.flat().filter(p => Math.abs(p[2] - maxZd) < 1e-4);
  assert.ok(topVertsD.length > 0);
  for (const p of topVertsD) approx(p[0], -0.25 * 1000, 1e-4, 'dir d ridge x: ');
});

test('(5) hip=1 gives a pyramid (single apex), default hip has ridge length w-d for w>d', () => {
  const { roofParamFaces } = load();

  const pyr = { k: 'roof', roofType: 'hip', hip: 1, pitch: 30, w: 1000, d: 800, over: 50, th: 20 };
  const fp = roofParamFaces(pyr);
  const maxZp = Math.max(...fp.flatMap(f => f.map(p => p[2])));
  const apexes = fp.flat().filter(p => Math.abs(p[2] - maxZp) < 1e-4);
  assert.ok(apexes.length > 0);
  for (const p of apexes) {
    approx(p[0], 0, 1e-4, 'pyramid apex x: ');
    approx(p[1], 0, 1e-4, 'pyramid apex y: ');
  }

  const hip = { k: 'roof', roofType: 'hip', pitch: 30, w: 1000, d: 800, over: 50, th: 20 };
  const fh = roofParamFaces(hip);
  const maxZh = Math.max(...fh.flatMap(f => f.map(p => p[2])));
  const ridgeVerts = fh.flat().filter(p => Math.abs(p[2] - maxZh) < 1e-4);
  const xs = ridgeVerts.map(p => p[0]);
  const ys = ridgeVerts.map(p => p[1]);
  for (const y of ys) approx(y, 0, 1e-4, 'hip ridge y: ');
  approx(Math.max(...xs) - Math.min(...xs), 1000 - 800, 1e-4, 'hip ridge length: ');
});

test('(6) wall attach (#96) to parametric gable roof', () => {
  const roof = {
    id: 'r1', k: 'roof', roofType: 'gable', pitch: 30, over: 50, th: 20,
    w: 1000, d: 800, x: 0, y: 0, rot: 0, elev: 270,
  };
  const gableWall = { id: 'w1', a: { x: -500, y: -400 }, b: { x: -500, y: 400 }, t: 20, h: 270, wt: 'solid' };
  const eaveWall = { id: 'w2', a: { x: -500, y: -400 }, b: { x: 500, y: -400 }, t: 20, h: 270, wt: 'solid' };
  const { f, surfFaces, attachWallTop, wallTopAt } = load({ walls: [gableWall, eaveWall], ops: [] });
  const faces = surfFaces(roof);

  assert.strictEqual(attachWallTop(gableWall, faces, f), true);
  assert.ok(Array.isArray(gableWall.top) && gableWall.top.length >= 3, 'gable-end wall gets sloped top');
  const peakExpected = 270 + 400 * Math.tan(30 * Math.PI / 180);
  const peakActual = wallTopAt(gableWall, 400);
  approx(peakActual, peakExpected, 5, 'gable-end wall peak: ');

  assert.strictEqual(attachWallTop(eaveWall, faces, f), true);
  assert.strictEqual(eaveWall.top, undefined, 'eave wall stays flat');
});

test('(7) cleanRoof sets o.h = roofHeight and deletes invalid roofType / rmat', () => {
  const { cleanRoof, roofHeight } = load();

  const o = { k: 'roof', roofType: 'gable', pitch: 30, over: 50, th: 20, w: 1000, d: 800, rmat: 'straw' };
  cleanRoof(o);
  assert.strictEqual(o.rmat, undefined, 'invalid rmat deleted');
  assert.strictEqual(o.h, roofHeight(o), 'o.h updated to roofHeight');

  const bad = { k: 'roof', roofType: 'mansard', w: 1000, d: 800, h: 100 };
  cleanRoof(bad);
  assert.strictEqual(bad.roofType, undefined, 'invalid roofType deleted');
});

test('(8) wiring guards', () => {
  const catDefs = src.slice(src.indexOf('const CAT_DEFS = ['), src.indexOf('];', src.indexOf('const CAT_DEFS = [')) + 2);
  assert.match(catDefs, /\[\s*'roof'\s*,[\s\S]{0,80}'roof'\s*,/);

  const mcpCat = mcpSrc.slice(mcpSrc.indexOf('const CATALOG = ['), mcpSrc.indexOf('];', mcpSrc.indexOf('const CATALOG = [')) + 2);
  assert.match(mcpCat, /\{\s*id:\s*'roof'[\s\S]{0,120}k:\s*'roof'/);

  assert.match(src, /const\s+PRESET_FURN_EXTRA\s*=\s*\[[^\]]*'roofType'/);
  assert.match(fnSrcOf(src, 'roof3D'), /setAttribute\('uv'/);
  assert.match(fnSrcOf(src, 'mirrorObjs'), /isParamRoof\(m\)\s*&&\s*m\.ridgeDir\s*===\s*'d'[\s\S]{0,60}normDeg\(m\.rot\s*\+\s*180\)/);
});

test('(9) MCP over stdio: new_project, add_furniture roof hip pitch 35, summarize mentions "hip roof 35"', async () => {
  const c = mcpClient();
  try {
    const r1 = await c.tool('new_project', { name: 'Roof Test' });
    assert.ok(!r1.err, r1.text);
    const r2 = await c.tool('add_furniture', { catalogId: 'roof', x: 0, y: 0, roofType: 'hip', pitch: 35 });
    assert.ok(!r2.err, r2.text);
    const r3 = await c.tool('summarize');
    assert.ok(!r3.err, r3.text);
    assert.match(r3.text, /hip roof 35/);
  } finally {
    c.stop();
  }
});

test('(10) Fit to walls takes the outer wall line and height; 2D covering lines follow the covering', () => {
  const walls = [
    [0, 0, 1000, 0], [1000, 0, 1000, 800], [1000, 800, 0, 800], [0, 800, 0, 0],
  ].map(([x0, y0, x1, y1], i) => ({ id: 'w' + i, a: { x: x0, y: y0 }, b: { x: x1, y: y1 }, t: 20, h: 270, wt: 'solid' }));
  const { roofFitWalls, roofTopFaces, roofCourseSvg, roofHeight } = load({ walls, ops: [] });
  const o = { k: 'roof', roofType: 'gable', pitch: 30, w: 100, d: 100, x: 0, y: 0, rot: 0 };
  assert.strictEqual(roofFitWalls(o), true);
  assert.deepStrictEqual([o.x, o.y, o.w, o.d, o.elev], [500, 400, 1020, 820, 270]);
  assert.strictEqual(o.h, roofHeight(o));
  // tile courses run parallel to the eaves (horizontal lines for a ridge along w), plain colour draws none
  const svg = roofCourseSvg(o, roofTopFaces(o), '#000');
  const segs = [...svg.matchAll(/M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/g)];
  assert.ok(segs.length > 20, 'tile courses drawn');
  for (const m of segs) approx(+m[2], +m[4], 0.11, 'course parallel to the eaves: ');
  assert.strictEqual(roofCourseSvg(Object.assign({}, o, { rmat: 'none' }), roofTopFaces(o), '#000'), '');
});
