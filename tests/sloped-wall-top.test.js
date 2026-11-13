/* Tests for sloped wall tops (#96): attaching walls to roofs / tilted surfaces,
   opening fitting, profile cleaning/rebasing, and source/MCP wiring guards. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, wallTopSrc, fnSrcOf } = require('./helpers/repo');

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
    ${fnSrcOf(src, 'roofFaces')}
    ${fnSrcOf(src, 'partRotM')}
    ${fnSrcOf(src, 'fitOpsToWall')}
    ${wallTopSrc(src)}
    return {
      cleanWallTop, wallTopOn, wallTopAt, wallTopPts, wallTopMin,
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

test('(2) wall along eave direction attaches flat without w.top', () => {
  const w = mkW('w2', 0, 0, 600, 0);
  const { f, surfFaces, attachWallTop } = load({ walls: [w], ops: [] });
  const faces = surfFaces(makeGableRoof());
  assert.strictEqual(attachWallTop(w, faces, f), true);
  assert.strictEqual(w.top, undefined);
  approx(w.h, 277, 1, 'eave flat h: ');
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
