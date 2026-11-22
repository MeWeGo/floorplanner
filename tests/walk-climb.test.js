/* Walk mode: climbing stairs and ramps, changing floors.
   Runs the real walkSurfAt / walkGround / walkGroundAt cut out of app.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js');
const fnSrc = name => fnSrcOf(src, name);
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

/* #162: slabs at different heights on the same floor. Real walkGroundAt / walkGround / walkSpawnZ, flat slabs (surfZAt = 0). */
const slabApi = new Function(
  'const surfZAt = () => 0, surfSloped = () => false;\n' +
  'let LEVELS = null; const walkLevels = () => LEVELS, floorPitch = () => 290;\n' +
  line(/const WALK\s*=[^;\n]+;/) + '\n' +
  line(/function pointInPoly\([^\n]+/) + '\n' +
  'const furnElev = o => +o.elev || 0, walkSurfAt = () => null;\n' +
  fnSrc('walkGround') + fnSrc('walkGroundAt') + fnSrc('walkSpawnZ') +
  'return { walkGround, walkSpawnZ, setLevels: l => { LEVELS = l; } };'
)();
const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

test('#162 raised slab: blocks from the side, you stand on its top once there, and spawning on it starts on top', () => {
  const f = { furn: [], voids: [], rooms: [], slabs: [{ pts: sq(0, 0, 300, 300), off: 150, t: 20 }] };
  const lv = [{ f, base: 0, sp: () => [sq(-500, -500, 1000, 1000)] }];
  assert.ok(slabApi.walkGround(lv, { x: 150, y: 150 }, 0).block, 'a 150 cm platform is a wall from the floor');
  assert.strictEqual(slabApi.walkGround(lv, { x: 150, y: 150 }, 150).g, 150, 'on top of it you stay on it');
  slabApi.setLevels(lv);
  assert.strictEqual(slabApi.walkSpawnZ(0, { x: 150, y: 150 }), 150, 'spawn on the platform starts at its top');
  assert.strictEqual(slabApi.walkSpawnZ(0, { x: 600, y: 600 }), 0, 'spawn beside it starts on the floor');
  // a low step (≤ stepUp) is walked onto
  f.slabs[0].off = 30;
  assert.strictEqual(slabApi.walkGround(lv, { x: 150, y: 150 }, 0).g, 30, '30 cm platform: step up');
});

test('#162 sunken slab: stands on it where no floor slab covers it; the floor slab wins where it does; stays on this floor', () => {
  const f = { furn: [], voids: [], rooms: [], slabs: [{ pts: sq(0, 0, 300, 300), off: -40, t: 20 }] };
  const open = [{ f, base: 0, sp: () => [] }]; // floor slab off (noSlab) / outside the building
  const g = slabApi.walkGround(open, { x: 150, y: 150 }, 0);
  assert.strictEqual(g.g, -40, 'steps down onto the sunken slab');
  assert.strictEqual(g.lvl, 0, 'the surface belongs to this floor, so walkStep does not switch down');
  const covered = [{ f, base: 0, sp: () => [sq(-500, -500, 1000, 1000)] }];
  assert.strictEqual(slabApi.walkGround(covered, { x: 150, y: 150 }, 0).g, 0, 'under the automatic floor slab it is hidden: floor level');
  slabApi.setLevels(open);
  assert.strictEqual(slabApi.walkSpawnZ(0, { x: 150, y: 150 }), -40, 'spawn on the sunken slab');
});

test('#162 a flat slab (off 0) over a void is walkable; the void alone is not; a lower floor surface reports its level', () => {
  const v = { pts: sq(0, 0, 300, 300) };
  const lower = { furn: [], voids: [], rooms: [], slabs: [] };
  const withSlab = { furn: [], rooms: [], voids: [v], slabs: [{ pts: sq(0, 0, 300, 300), off: 0, t: 20 }] };
  const lv = [{ f: withSlab, base: 0, sp: () => [] }, { f: lower, base: -290, sp: () => [] }];
  assert.strictEqual(slabApi.walkGround(lv, { x: 150, y: 150 }, 0).g, 0, 'the slab fills the void');
  const hole = [{ f: Object.assign({}, withSlab, { slabs: [] }), base: 0, sp: () => [] }, { f: lower, base: -20, sp: () => [] }];
  const d = slabApi.walkGround(hole, { x: 150, y: 150 }, 0);
  assert.strictEqual(d.g, -20); assert.strictEqual(d.lvl, 1, 'surface from the floor below');
});

test('#162 wiring: spawn and floor selector use walkSpawnZ, a floor switch down needs a lower-floor surface', () => {
  assert.match(fnSrc('enterWalk'), /walkSpawnZ\(i, p\)[\s\S]*z: z0, gz: z0/);
  assert.match(fnSrc('walkToFloor'), /walkSpawnZ\(i, w\)/);
  assert.match(fnSrc('walkStep'), /w\.gz <= -0\.5 && lv\[gr\.lvl\] && lv\[gr\.lvl\]\.base < 0/);
  assert.match(fnSrc('walkLevels'), /sp: \(\) => walkSlabPolys\(f0, f\)/);
  assert.match(src, /T3\.walkCache = null; T3\.walkSp = null;/);
});
