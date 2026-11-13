/* Walk mode: climbing stairs and ramps, changing floors.
   Runs the real walkSurfAt / walkGround / walkGroundAt cut out of app.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');
const fnSrc = name => {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + '() is gone from app.js');
  return src.slice(start, src.indexOf('\n}', start) + 2);
};
const line = re => { const m = src.match(re); assert.ok(m, 'missing ' + re); return m[0]; };

const api = new Function(
  'const clamp = (v, a, b) => Math.max(a, Math.min(b, v));\n' +
  line(/const FURN_ELEV_MAX = [^\n]+/) + '\n' +
  line(/const STAIR_TYPES = [^\n]+/) + '\n' +
  line(/const stairN = [^\n]+/) + '\n' +
  line(/const WALK\s*=[^;\n]+;/) + '\n' +
  line(/function pointInPoly\([^\n]+/) + '\n' +
  fnSrc('stairSteps') + fnSrc('stepCorners') + fnSrc('walkSurfAt') + fnSrc('walkGround') + fnSrc('walkGroundAt') +
  'return { walkSurfAt, walkGround, stairSteps, WALK };'
)();

const stair = { k: 'stairs', x: 0, y: 0, w: 100, d: 450, h: 290, rot: 0, stepN: 16 };

test('a straight stair rises from its low end (+y) to its full height at the top (−y)', () => {
  const lo = api.walkSurfAt(stair, 0, 220), hi = api.walkSurfAt(stair, 0, -220);
  assert.ok(Math.abs(lo - 290 / 16) < 0.01, 'first tread ' + lo);
  assert.ok(Math.abs(hi - 290) < 0.01, 'top tread ' + hi);
  assert.strictEqual(api.walkSurfAt(stair, 80, 0), null, 'beside the stair');
});

test('rotation and height above floor are respected', () => {
  const o = Object.assign({}, stair, { x: 500, y: 100, rot: 90, elev: 10 }); // rot 90: low end toward −x
  assert.ok(Math.abs(api.walkSurfAt(o, 500 - 220, 100) - (10 + 290 / 16)) < 0.01);
  assert.ok(Math.abs(api.walkSurfAt(o, 500 + 220, 100) - 300) < 0.01);
});

test('a ramp is a linear slope from 0 to h', () => {
  const r = { k: 'ramp', x: 0, y: 0, w: 120, d: 600, h: 48, rot: 0 };
  assert.ok(Math.abs(api.walkSurfAt(r, 0, 300)) < 0.01);
  assert.ok(Math.abs(api.walkSurfAt(r, 0, 0) - 24) < 0.01);
  assert.ok(Math.abs(api.walkSurfAt(r, 0, -300) - 48) < 0.01);
});

test('ground: step up one tread, blocked by the side of the stair, floor plane cut by voids', () => {
  const cur = { furn: [stair], voids: [], slabs: [] };
  const lv = [{ f: cur, base: 0 }];
  assert.ok(api.walkGround(lv, { x: 0, y: 215 }, 0).g > 15, 'walks onto the first tread');
  const side = api.walkGround(lv, { x: 45, y: -100 }, 0);
  assert.ok(side.block, 'the high part of the stair blocks from the side');
  // upper floor: plane at 0 except over the void; the lower stair top is reachable there
  const up = { furn: [], slabs: [], voids: [{ pts: [{ x: -55, y: -230 }, { x: 55, y: -230 }, { x: 55, y: 230 }, { x: -55, y: 230 }] }] };
  const lv2 = [{ f: up, base: 0 }, { f: cur, base: -290 }];
  assert.strictEqual(api.walkGround(lv2, { x: 0, y: -300 }, 0).g, 0, 'upper floor outside the void');
  const down = api.walkGround(lv2, { x: 0, y: -150 }, -40).g;
  assert.ok(down < -20 && down > -80, 'inside the void you stand on the lower stair: ' + down);
});

test('walkStep changes floors and the hint mentions stairs', () => {
  const ws = fnSrc('walkStep');
  assert.match(ws, /walkGround\(lv, w, w\.gz\)/);
  assert.match(ws, /w\.gz >= pitch - 0\.5/);
  assert.match(ws, /w\.gz <= -0\.5/);
  assert.match(fnSrc('applyWalkCam'), /\+w\.z \|\| 0/);
  assert.match(src, /stairs \/ ramps: walk onto them/);
});

test('3D wheel zoom is handled before OrbitControls and never stalls', () => {
  const i = src.indexOf("r.domElement.addEventListener('wheel'"), j = src.indexOf('const ctl = new THREE.OrbitControls(cam, r.domElement); ctl.enableDamping = true');
  assert.ok(i > 0 && j > i, 'wheel handler must be registered before OrbitControls');
  const h = src.slice(i, j);
  assert.match(h, /stopImmediatePropagation/);
  assert.match(h, /8 \* -n/, 'a minimum step per notch');
  assert.match(h, /Math\.max\(30,/, 'orbit pivot kept ahead of the camera');
});
