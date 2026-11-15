/* 3D camera presets must actually look AT the plan.
   The "eye" preset shipped pointing outside the building: the plan spans
   cz ± d/2, but the camera sat at cz + 0.95·sz, so it stared at an exterior
   wall from outside. These run the real set3DCam() / eyeRoom() cut out of
   app.js against a stub camera — no browser needed. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js');
const vec = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }, clone() { return { ...this }; } });

/** Runs the real set3DCam(kind) with T3.fit = fit and the given rooms on floor 0; returns { pos, target, log }. */
function runPreset(kind, fit, rooms = []) {
  const log = [];
  const T3 = { fit, ortho: false, cam: { position: vec() }, ctl: { target: vec(), update: () => log.push('update') } };
  const fn = new Function('T3', 'P', 'log', `
    let fi = 0;
    const ELEV_DIRS = { north: { x: 0, y: -1 }, east: { x: 1, y: 0 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 } };
    const exitWalk = () => log.push('exitWalk'), enterWalk = () => log.push('enterWalk'), fitOrtho = () => log.push('fitOrtho');
    const setProjection = o => { log.push('ortho:' + o); T3.ortho = o; };
    const camAlong = (n, c, span, h) => log.push({ camAlong: n, c, span, h });
    ${fnSrcOf(src, 'eyeRoom')}
    ${fnSrcOf(src, 'set3DCam')}
    return { set3DCam, eyeRoom };`);
  const api = fn(T3, { wallH: 270, floors: [{ rooms }] }, log);
  if (kind) api.set3DCam(kind);
  const p = T3.cam.position, t = T3.ctl.target;
  return { pos: [p.x, p.y, p.z], target: [t.x, t.y, t.z], log, T3, api };
}
const presets = (f, rooms) => ({ top: runPreset('top', f, rooms), eye: runPreset('eye', f, rooms), fit: runPreset('fit', f, rooms) });
const eyeRoom = rooms => runPreset(null, {}, rooms).api.eyeRoom();

const cases = [
  { name: 'small flat  ', cx: 500, cz: 400, sz: 900, elev: 0, x0: 50, x1: 950, z0: 0, z1: 800 },
  { name: 'wide building', cx: 2000, cz: 700, sz: 3000, elev: 0, x0: 500, x1: 3500, z0: 100, z1: 1300 },
  { name: 'tiny plan   ', cx: 100, cz: 100, sz: 400, elev: 0, x0: 0, x1: 200, z0: 0, z1: 200 },
  { name: 'deep corridor', cx: 300, cz: 1500, sz: 2900, elev: 0, x0: 200, x1: 400, z0: 100, z1: 2900 },
  { name: 'upper floor ', cx: 800, cz: 900, sz: 1600, elev: 290, x0: 0, x1: 1600, z0: 100, z1: 1700 },
];

const insideXZ = (pt, f, margin = 0) =>
  pt[0] > f.x0 + margin && pt[0] < f.x1 - margin && pt[2] > f.z0 + margin && pt[2] < f.z1 - margin;

test('eye preset stands inside the plan footprint', () => {
  for (const f of cases) {
    const p = presets(f);
    assert.ok(insideXZ(p.eye.pos, f), `${f.name}: camera z=${p.eye.pos[2].toFixed(0)} is outside z0..z1 (${f.z0}..${f.z1})`);
  }
});

test('eye preset is at standing height, not on the floor or the roof', () => {
  for (const f of cases) {
    const p = presets(f);
    const h = p.eye.pos[1] - f.elev;
    assert.ok(h > 140 && h < 190, `${f.name}: eye height ${h.toFixed(0)} cm is not ~165 cm`);
  }
});

test('eye preset looks across the rooms, not into the nearest wall', () => {
  for (const f of cases) {
    const p = presets(f);
    assert.ok(insideXZ(p.eye.target, f), `${f.name}: the look-at point is outside the plan`);
    const reach = Math.hypot(p.eye.target[0] - p.eye.pos[0], p.eye.target[2] - p.eye.pos[2]);
    const depth = (f.z1 - f.z0);
    assert.ok(reach > depth * 0.3, `${f.name}: only ${reach.toFixed(0)} cm of view in a ${depth.toFixed(0)} cm deep plan`);
  }
});

test('fit preset frames the plan from outside and above', () => {
  for (const f of cases) {
    const p = presets(f);
    assert.ok(!insideXZ(p.fit.pos, f), `${f.name}: fit camera is inside the walls`);
    assert.ok(p.fit.pos[1] > f.elev + 200, `${f.name}: fit camera is too low (${p.fit.pos[1].toFixed(0)} cm)`);
    const off = Math.hypot(p.fit.target[0] - f.cx, p.fit.target[2] - f.cz);
    assert.ok(off < 1, `${f.name}: fit does not aim at the plan centre`);
  }
});

test('top preset is above the plan and looks straight down', () => {
  for (const f of cases) {
    const p = presets(f);
    assert.ok(p.top.pos[1] > f.elev + Math.max(f.z1 - f.z0, f.x1 - f.x0),
      `${f.name}: top camera is not above the plan`);
    assert.ok(Math.abs(p.top.target[1]) < 1, `${f.name}: top camera does not aim at the ground`);
  }
});

test('every preset keeps a usable near/far distance', () => {
  for (const f of cases) {
    const p = presets(f);
    for (const kind of ['top', 'eye', 'fit']) {
      const dist = Math.hypot(
        p[kind].target[0] - p[kind].pos[0],
        p[kind].target[1] - p[kind].pos[1],
        p[kind].target[2] - p[kind].pos[2],
      );
      assert.ok(dist > 60, `${f.name}/${kind}: camera target is on top of the camera (${dist.toFixed(0)} cm)`);
    }
  }
});

test('eyeRoom picks the largest room and ignores slivers', () => {
  const rooms = [
    { pts: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 400 }, { x: 0, y: 400 }] },       // 80 000
    { pts: [{ x: 300, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 600 }, { x: 300, y: 600 }] },   // 360 000 <- biggest
    { pts: [{ x: 950, y: 0 }, { x: 960, y: 0 }, { x: 960, y: 50 }, { x: 950, y: 50 }] },     // sliver, ignored
  ];
  const r = eyeRoom(rooms);
  assert.ok(r, 'expected a room');
  assert.strictEqual(r.x0, 300);
  assert.strictEqual(r.x1, 900);
  assert.strictEqual(eyeRoom([]), null);
  assert.strictEqual(eyeRoom([{ pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] }]), null, 'slivers must not be used');
});

test('the eye preset stands in the largest room, not the bounding box of the building', () => {
  const f = cases[1];
  const room = [{ pts: [{ x: 600, y: 200 }, { x: 1400, y: 200 }, { x: 1400, y: 700 }, { x: 600, y: 700 }] }];
  const p = runPreset('eye', f, room);
  assert.ok(p.pos[0] > 600 && p.pos[0] < 1400 && p.pos[2] > 200 && p.pos[2] < 700, 'camera is not inside the room: ' + p.pos);
  assert.ok(p.log.includes('enterWalk'), 'the eye preset starts walk mode (#46)');
  assert.ok(!p.log.includes('exitWalk'), 'the eye preset must not leave walk mode first');
});

test('iso switches to the parallel camera and looks from the south-east at 35° (#74)', () => {
  const f = cases[0];
  const p = runPreset('iso', f);
  assert.ok(p.log.includes('ortho:true'), 'iso must switch to the orthographic camera');
  const dx = p.pos[0] - p.target[0], dy = p.pos[1] - p.target[1], dz = p.pos[2] - p.target[2];
  assert.ok(dx > 0 && dz > 0 && Math.abs(dx - dz) < 1e-6, 'iso looks along the 45° diagonal from +x / +z');
  const alt = Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI;
  assert.ok(Math.abs(alt - 35.26) < 0.1, 'iso elevation is ' + alt.toFixed(2) + '°');
  assert.ok(p.log.includes('fitOrtho'));
});

test('facade presets hand off to camAlong with the facade width', () => {
  const f = cases[1];
  const north = runPreset('north', f).log.find(x => x.camAlong);
  const east = runPreset('east', f).log.find(x => x.camAlong);
  assert.ok(north && east, 'facade presets no longer use camAlong');
  assert.strictEqual(north.span, f.x1 - f.x0, 'a north facade spans the x extent');
  assert.strictEqual(east.span, f.z1 - f.z0, 'an east facade spans the z extent');
  assert.deepStrictEqual(north.c, { x: (f.x0 + f.x1) / 2, y: (f.z0 + f.z1) / 2 });
});

test('without T3.fit set3DCam does nothing', () => {
  assert.doesNotThrow(() => runPreset('fit', undefined));
});
