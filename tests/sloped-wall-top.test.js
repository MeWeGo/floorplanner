/* Tests for sloped wall tops (#96): attaching walls to roofs / tilted surfaces,
   opening fitting, profile cleaning/rebasing, and source/MCP wiring guards. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, wallTopSrc, fnSrcOf, markerBlock } = require('./helpers/repo');

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
    ${fnSrcOf(src, 'pointInPoly')}
    ${markerBlock(src, 'ROOF-PARAM')}
    ${fnSrcOf(src, 'roofFaces')}
    ${fnSrcOf(src, 'partRotM')}
    ${fnSrcOf(src, 'fitOpsToWall')}
    ${wallTopSrc(src)}
    return {
      cleanWallTop, wallTopOn, wallTopAt, wallTopFaceAt, wallTopHasBevel, wallTopPts, wallTopMin,
      surfFaces, surfHits, wallSurfProfile, attachWallTop,
      wallTopSub, setWallTop, detachWallTop, fitOpsToWall
    };
  `)(floor);
  return { f: floor, ...api };
}

function makeGableRoof() {
  return {
    id: 'r1',
    k: 'roof',
    w: 640,
    d: 440,
    h: 150,
    x: 300,
    y: 200,
    rot: 0,
    elev: 270,
    fbase: { w: 640, d: 440, h: 150 },
    faces: [
      [[-320, -220, 0], [320, -220, 0], [320, 0, 150], [-320, 0, 150]],
      [[-320, 0, 150], [320, 0, 150], [320, 220, 0], [-320, 220, 0]],
    ],
  };
}

const mkW = (id, ax, ay, bx, by, extra = {}) => ({
  id, a: { x: ax, y: ay }, b: { x: bx, y: by }, t: 20, h: 270, wt: 'solid', ...extra,
});

const approx = (actual, expected, tol = 0.2, msg = '') => {
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}expected ${actual} ≈ ${expected} (±${tol})`);
};

test('(1) gable roof attaches sloped profile with ridge at center', () => {
  const w = mkW('w1', 0, 0, 0, 400);
  const { f, surfFaces, attachWallTop, wallTopAt } = load({ walls: [w], ops: [] });
  const faces = surfFaces(makeGableRoof());
  assert.strictEqual(attachWallTop(w, faces, f), true);
  assert.strictEqual(w.top.length, 3);
  assert.strictEqual(w.top[0][0], 0);
  approx(w.top[0][1], 283.6, 0.2, 'start h: ');
  assert.strictEqual(w.top[1][0], 0.5);
  assert.strictEqual(w.top[1][1], 420);
  assert.strictEqual(w.top[2][0], 1);
  approx(w.top[2][1], 283.6, 0.2, 'end h: ');
  assert.strictEqual(w.h, 420);
  assert.strictEqual(wallTopAt(w, 200), 420);
  approx(wallTopAt(w, 100), 351.8, 0.2, 'quarter-span h: ');
});

test('(2) flat roof attaches flat without w.top; sloped eave-parallel wall gets transverse bevel matching roof', () => {
  const flatRoof = {
    id: 'rflat', k: 'roof', w: 800, d: 600, h: 20, x: 300, y: 0, rot: 0, elev: 290,
    fbase: { w: 800, d: 600, h: 20 },
    faces: [[[-400, -300, 0], [400, -300, 0], [400, 300, 0], [-400, 300, 0]]],
  };
  const wFlat = mkW('w2f', 0, 0, 600, 0);
  const envFlat = load({ walls: [wFlat], ops: [] });
  assert.strictEqual(envFlat.attachWallTop(wFlat, envFlat.surfFaces(flatRoof), envFlat.f), true);
  assert.strictEqual(wFlat.top, undefined);
  assert.strictEqual(wFlat.h, 290);

  const w = mkW('w2', 0, 0, 600, 0);
  const { f, surfFaces, attachWallTop, wallTopFaceAt } = load({ walls: [w], ops: [] });
  const faces = surfFaces(makeGableRoof());
  assert.strictEqual(attachWallTop(w, faces, f), true);
  assert.strictEqual(w.top.length, 2, 'sloped eave-parallel wall keeps bevel profile across wall thickness');
  approx(w.top[0][1], 290.5, 0.2, '+n face h: ');
  approx(w.top[0][2], 276.8, 0.2, '-n face h: ');
  approx(w.h, 290.5, 0.2, 'max wall h: ');
  approx(wallTopFaceAt(w, 300, 1), 290.5, 0.2);
  approx(wallTopFaceAt(w, 300, -1), 276.8, 0.2);
});

test('(3) shed roof (single sloped face) gives a two-point profile', () => {
  const shed = {
    id: 'r2',
    k: 'roof',
    w: 640,
    d: 440,
    h: 150,
    x: 300,
    y: 200,
    rot: 0,
    elev: 270,
    fbase: { w: 640, d: 440, h: 150 },
    faces: [[[-320, -220, 0], [320, -220, 0], [320, 220, 150], [-320, 220, 150]]],
  };
  const w = mkW('w3', 0, 0, 0, 400);
  const { f, surfFaces, attachWallTop } = load({ walls: [w], ops: [] });
  assert.strictEqual(attachWallTop(w, surfFaces(shed), f), true);
  assert.strictEqual(w.top.length, 2);
  assert.strictEqual(w.top[0][0], 0);
  assert.strictEqual(w.top[1][0], 1);
  assert.ok(w.top[0][1] < w.top[1][1], 'shed profile should slope upward');
});

test('(4) tilted plain box produces sloped profile; stairs and ramps give no surfFaces', () => {
  const box = { id: 'b1', k: 'rect', w: 200, d: 200, h: 20, x: 100, y: 100, rot: 0, rx: 10, elev: 250 };
  const w = mkW('w4', 100, 0, 100, 200);
  const { f, surfFaces, attachWallTop } = load({ walls: [w], ops: [] });
  const boxFaces = surfFaces(box);
  assert.ok(boxFaces.length > 0);
  assert.strictEqual(attachWallTop(w, boxFaces, f), true);
  assert.ok(Array.isArray(w.top) && w.top.length >= 2, 'tilted box should produce w.top');
  assert.ok(Math.abs(w.top[0][1] - w.top[w.top.length - 1][1]) > 1, 'tilted box profile should be sloped');

  assert.deepStrictEqual(surfFaces({ k: 'stairs', w: 100, d: 200, h: 270, x: 100, y: 100, rot: 0 }), []);
  assert.deepStrictEqual(surfFaces({ k: 'ramp', w: 100, d: 200, h: 270, x: 100, y: 100, rot: 0 }), []);
});

test('(5) wall not under surface returns false and stays flat', () => {
  const w = mkW('w5', 1000, 1000, 1400, 1000);
  const { f, surfFaces, attachWallTop } = load({ walls: [w], ops: [] });
  assert.strictEqual(attachWallTop(w, surfFaces(makeGableRoof()), f), false);
  assert.strictEqual(w.top, undefined);
  assert.strictEqual(w.h, 270);
});

test('(6) window on attached wall is shrunk by fitOpsToWall to fit with 5 cm lintel', () => {
  const w = mkW('w6', 0, 0, 0, 400);
  const win = { id: 'op1', wall: 'w6', type: 'window', d: 50, w: 60, sill: 100, h: 200 };
  const { f, surfFaces, attachWallTop, wallTopMin, fitOpsToWall } = load({ walls: [w], ops: [win] });
  attachWallTop(w, surfFaces(makeGableRoof()), f);
  const localMin = wallTopMin(w, win.d - win.w / 2, win.d + win.w / 2);
  approx(win.sill + win.h, localMin - 5, 0.01, 'window top with 5 cm lintel: ');
  assert.ok(win.h < 200, 'window height should have shrunk');
  // calling fitOpsToWall again when already fitting changes nothing
  assert.strictEqual(fitOpsToWall(f, w), 0);
});

test('(7) detachWallTop removes top and keeps h', () => {
  const w = mkW('w7', 0, 0, 0, 400);
  const { f, surfFaces, attachWallTop, detachWallTop } = load({ walls: [w], ops: [] });
  attachWallTop(w, surfFaces(makeGableRoof()), f);
  assert.ok(Array.isArray(w.top));
  assert.strictEqual(detachWallTop(w), true);
  assert.strictEqual(w.top, undefined);
  assert.strictEqual(w.h, 420);
  assert.strictEqual(detachWallTop(w), false);
});

test('(8) cleanWallTop rejects invalid profiles and accepts valid ones', () => {
  const { cleanWallTop } = load();
  assert.strictEqual(cleanWallTop(null), null);
  assert.strictEqual(cleanWallTop([[0, 200]]), null);
  assert.strictEqual(cleanWallTop([[0.1, 200], [1, 300]]), null, 'first t not 0');
  assert.strictEqual(cleanWallTop([[0, 200], [0.9, 300]]), null, 'last t not 1');
  assert.strictEqual(cleanWallTop([[0, 200], [0.6, 300], [0.4, 250], [1, 200]]), null, 'decreasing t');
  assert.strictEqual(cleanWallTop([[0, 5], [1, 300]]), null, 'h < 10');
  assert.deepStrictEqual(
    cleanWallTop([[0, 283.64], [0.5, 420], [1, 283.64]]),
    [[0, 283.6], [0.5, 420], [1, 283.6]]
  );
});

test('(9) wallTopSub rebases [100, 300] on gable wall to 0..1 keeping ridge at 0.5', () => {
  const w = mkW('w9', 0, 0, 0, 400);
  const { f, surfFaces, attachWallTop, wallTopSub } = load({ walls: [w], ops: [] });
  attachWallTop(w, surfFaces(makeGableRoof()), f);
  const sub = wallTopSub(w, 100, 300);
  assert.strictEqual(sub.length, 3);
  assert.strictEqual(sub[0][0], 0);
  approx(sub[0][1], 351.8, 0.2, 'sub start h: ');
  assert.strictEqual(sub[1][0], 0.5);
  assert.strictEqual(sub[1][1], 420);
  assert.strictEqual(sub[2][0], 1);
  approx(sub[2][1], 351.8, 0.2, 'sub end h: ');
});

test('(10) source and MCP wiring guards', () => {
  // TOOLS has attach with key 'A'
  const toolsBlock = src.slice(src.indexOf('const TOOLS = ['), src.indexOf('];', src.indexOf('const TOOLS = [')) + 2);
  assert.match(toolsBlock, /\['attach',\s*'[^']*',\s*'[^']*',\s*'A',/);

  // HINTS and HINTS_EN have attach
  const hintsBlock = src.slice(src.indexOf('const HINTS = {'), src.indexOf('};', src.indexOf('const HINTS = {')) + 2);
  const hintsEnBlock = src.slice(src.indexOf('const HINTS_EN = {'), src.indexOf('};', src.indexOf('const HINTS_EN = {')) + 2);
  assert.match(hintsBlock, /\battach\s*:/);
  assert.match(hintsEnBlock, /\battach\s*:/);

  // keydown map has a: 'attach'
  assert.match(src, /const\s+map\s*=\s*\{[^}]*\ba\s*:\s*'attach'/);

  // build3D uses wallTopPts in wall seg and skips top cap when sloped
  const build3dSrc = fnSrcOf(src, 'build3D');
  assert.match(build3dSrc, /const\s+sloped\s*=\s*wallTopOn\(w\)/);
  assert.match(build3dSrc, /if\s*\(sloped\b[^)]*\)[\s\S]{0,120}wallTopPts\(/);
  assert.match(build3dSrc, /if\s*\(!sloped\)\s*box\(/);

  // archPrims passes top to face
  const archPrimsSrc = fnSrcOf(src, 'archPrims');
  assert.match(archPrimsSrc, /const\s+top\s*=\s*wallTopOn\(w\)\s*\?\s*wallTopPts\(/);
  assert.match(archPrimsSrc, /face\(corners,[\s\S]{0,120}\btop\s*\}/);

  // normalizeProject runs cleanWallTop
  const normSrc = fnSrcOf(src, 'normalizeProject');
  assert.match(normSrc, /cleanWallTop\(w\.top\)/);

  // mcp/server.js has identical cleanWallTop function
  assert.strictEqual(
    fnSrcOf(mcpSrc.replace(/\r\n/g, '\n'), 'cleanWallTop'),
    fnSrcOf(src.replace(/\r\n/g, '\n'), 'cleanWallTop'),
    'cleanWallTop in mcp/server.js must match app.js'
  );
});

test('(11) angled wall under sloped roof gets transverse [t, hP, hM] bevel with zero gap at both wall faces (#178)', () => {
  // 45° angled wall crossing ridge of makeGableRoof (y < 200 north slope, y > 200 south slope)
  const w = mkW('w_ang', 100, 100, 300, 300); // t = 20, L = 200*sqrt(2)
  const { f, surfFaces, surfHits, attachWallTop, wallTopFaceAt, wallTopHasBevel, wallTopSub, cleanWallTop } = load({ walls: [w], ops: [] });
  const faces = surfFaces(makeGableRoof());
  assert.strictEqual(attachWallTop(w, faces, f), true);
  assert.strictEqual(wallTopHasBevel(w), true, 'angled wall has transverse bevel');

  const L = Math.hypot(200, 200), ux = 200 / L, uy = 200 / L, nx = -uy * (w.t / 2), ny = ux * (w.t / 2);
  for (const d of [20, 70, 210, 260]) { // sample away from ridge kink
    const px = w.a.x + ux * d, py = w.a.y + uy * d;
    const zP = Math.min(...surfHits(faces, px + nx, py + ny));
    const zM = Math.min(...surfHits(faces, px - nx, py - ny));
    approx(wallTopFaceAt(w, d, 1), zP, 0.8, `+n face at d=${d}: `);
    approx(wallTopFaceAt(w, d, -1), zM, 0.8, `-n face at d=${d}: `);
  }

  // wallTopSub preserves transverse bevel on split segments
  const sub = wallTopSub(w, 20, 100);
  assert.ok(sub && sub.some(p => p.length === 3), 'split segment retains [t, hP, hM]');
  assert.ok(cleanWallTop(sub), 'split profile passes cleanWallTop');

  // mirrorObjs swaps +n / -n face heights on walls
  assert.match(fnSrcOf(src, 'mirrorObjs'), /\[p\[0\],\s*p\[2\],\s*p\[1\]\]/);
  assert.match(fnSrcOf(src, 'build3D'), /slopedWallPrismGeo/);
});

test('(12) curtain wall attach & mullions follow sloped roof (#176)', () => {
  const cw = mkW('cw1', 0, 0, 0, 400, { wt: 'curtain', mul: 100 });
  const rail = mkW('rl1', 0, 0, 0, 400, { wt: 'railing', h: 100 });
  const fence = mkW('fn1', 0, 0, 0, 400, { wt: 'fence', h: 110 });
  const { f, surfFaces, attachWallTop, detachWallTop, wallTopOn, wallTopAt, wallTopFaceAt } = load({ walls: [cw, rail, fence], ops: [] });
  const faces = surfFaces(makeGableRoof());

  assert.strictEqual(attachWallTop(cw, faces, f), true, 'curtain wall attaches to sloped roof');
  assert.strictEqual(wallTopOn(cw), true);
  assert.strictEqual(cw.h, 420);
  approx(wallTopAt(cw, 0), 283.6, 0.2, 'curtain start h: ');
  approx(wallTopFaceAt(cw, 200, 2), 420, 0.2, 'curtain peak at ridge mullion: ');
  approx(wallTopAt(cw, 100), 351.8, 0.2, 'curtain mullion at 100 cm: ');
  approx(wallTopAt(cw, 300), 351.8, 0.2, 'curtain mullion at 300 cm: ');

  assert.strictEqual(attachWallTop(rail, faces, f), false, 'railing cannot attach');
  assert.strictEqual(attachWallTop(fence, faces, f), false, 'fence cannot attach');
  assert.strictEqual(detachWallTop(cw), true, 'curtain wall can detach back to flat');
  assert.strictEqual(wallTopOn(cw), false);

  assert.match(fnSrcOf(src, 'build3D'), /curtainBays\(w\)[\s\S]{0,260}wallTopAt\(w,\s*x\)/);
  assert.match(fnSrcOf(src, 'archSvg'), /if\s*\(p\.curtain\s*&&\s*p\.mulN\s*>\s*1\)[\s\S]{0,800}topAt\(ms\)/);
});
