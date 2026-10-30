/* 3D camera presets must actually look AT the plan.
   The "eye" preset shipped pointing outside the building: the plan spans
   cz ± d/2, but the camera sat at cz + 0.95·sz, so it stared at an exterior
   wall from outside. This is a pure-geometry check — no browser needed. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

/** Mirror of eyeRoom(): bounding box of the biggest room, or null. */
function eyeRoom(rooms) {
  if (!rooms || !rooms.length) return null;
  let best = null, bestArea = 0;
  for (const r of rooms) {
    if (!r.pts || r.pts.length < 3) continue;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of r.pts) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < z0) z0 = p.y;
      if (p.y > z1) z1 = p.y;
    }
    const a = (x1 - x0) * (z1 - z0);
    if (a > bestArea) { bestArea = a; best = { x0, x1, z0, z1, area: a }; }
  }
  return best && best.area > 10000 ? best : null;
}

/**
 * Mirror of set3DCam() in app.js. Keep in sync with the source; the last test
 * asserts the constants it can read back, so a silent revert fails here.
 */
function presets(f, rooms) {
  const { cx, cz, sz, elev } = f;
  const x0 = f.x0 != null ? f.x0 : cx - sz / 2, x1 = f.x1 != null ? f.x1 : cx + sz / 2;
  const z0 = f.z0 != null ? f.z0 : cz - sz / 2, z1 = f.z1 != null ? f.z1 : cz + sz / 2;
  const w = Math.max(x1 - x0, 200), d = Math.max(z1 - z0, 200);
  const dist = Math.max(w, d) * 1.15 + 300;

  const r = eyeRoom(rooms);
  const px0 = r ? r.x0 : x0, px1 = r ? r.x1 : x1;
  const pz0 = r ? r.z0 : z0, pz1 = r ? r.z1 : z1;
  const eCx = (px0 + px1) / 2;
  const longZ = (pz1 - pz0) >= (px1 - px0);
  const eye = longZ
    ? { pos: [eCx, elev + 165, pz1 - Math.min(60, (pz1 - pz0) / 4)], target: [eCx, elev + 115, pz0 + (pz1 - pz0) * 0.35] }
    : { pos: [px1 - Math.min(60, (px1 - px0) / 4), elev + 165, (pz0 + pz1) / 2], target: [px0 + (px1 - px0) * 0.35, elev + 115, (pz0 + pz1) / 2] };

  return {
    top: { pos: [cx, elev + sz * 2.1, cz + 1], target: [cx, 0, cz] },
    eye,
    fit: { pos: [cx + w * 0.35, elev + dist * 0.85, cz + dist], target: [cx, elev + 40, cz] },
  };
}

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

test('the source keeps the fixed layout (guards against a revert)', () => {
  const js = read('app.js');
  const start = js.indexOf('function set3DCam');
  assert.ok(start > 0, 'set3DCam() is gone');
  const body = js.slice(start, js.indexOf('\n}\n', start));

  // The bug: standing beyond the far edge, cz + ~1.0 * sz.
  assert.doesNotMatch(body, /cz \+ sz \* 0\.9[05]/, 'the eye camera is outside the plan again');
  assert.match(body, /eyeRoom\(\)/, 'eye preset should stand in the largest room');
  assert.match(body, /elev \+ 165/, 'eye height changed — update presets() in this test too');
  assert.match(js, /function eyeRoom\(\)/, 'eyeRoom() helper is gone');
  // and the bounds must reach set3DCam at all
  assert.match(js, /T3\.fit = \{[^}]*\bz0:/, 'T3.fit must expose z0/z1 bounds for the presets');
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
