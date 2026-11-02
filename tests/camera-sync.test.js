/* 2D → 3D camera hand-off (issue #37).

   Opening 3D used to reset the camera to a generic view of the whole building,
   and every 2D ⇄ 3D round-trip threw the user's orbit away. These are the pure
   mirrors of view3DFocus() / orient3DFrom2D() plus the keep/re-orient decision
   in show3D(); the last tests fail on a silent revert of the source. Behaviour
   with a real camera is covered by browser-smoke.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const SCREEN = { w: 1400, h: 900 };
const FIT = { cx: 1000, cz: 800, sz: 1400, x0: 300, x1: 1700, z0: 100, z1: 1500 };

/** Mirror of view3DFocus(). */
function focus({ selBBox, center, screen = SCREEN, z }) {
  if (selBBox) {
    const b = selBBox;
    return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, span: Math.max(b.x1 - b.x0, b.y1 - b.y0), sel: true };
  }
  return { x: center.x, y: center.y, span: Math.max(screen.w, screen.h) / 2 / z, sel: false };
}

/** Mirror of orient3DFrom2D(). */
function orient(f, fit = FIT, { floorIndex = 0, wallH = 270, floorFilter = 'all' } = {}) {
  let tx = f.x, tz = f.y;
  if (fit.x0 != null) {
    const px = Math.max(200, (fit.x1 - fit.x0) * 0.35), pz = Math.max(200, (fit.z1 - fit.z0) * 0.35);
    tx = clamp(tx, fit.x0 - px, fit.x1 + px);
    tz = clamp(tz, fit.z0 - pz, fit.z1 + pz);
  }
  const span = f.sel ? Math.max(f.span, 240) : clamp(f.span * 0.85, 200, Math.max(300, (fit.sz || 2000) * 2.2));
  const d = clamp(span * 1.55, 300, 6000);
  const elev = floorFilter === 'all' ? floorIndex * (wallH + 20) : 0;
  return { target: [tx, elev + 80, tz], pos: [tx + d * 0.62, elev + 80 + d * 0.92, tz + d * 0.9], d };
}

/** Mirror of the keep/re-orient decision in show3D(). */
function shouldKeep({ prevCam, center, prevCenter, selKey, prevSelKey, focusSel, radius = 200 }) {
  const moved = !prevCenter || Math.hypot(center.x - prevCenter.x, center.y - prevCenter.y) > radius;
  return !!prevCam && !moved && !(focusSel && selKey !== (prevSelKey || ''));
}

const camDistance = c => Math.hypot(c.pos[0] - c.target[0], c.pos[1] - c.target[1], c.pos[2] - c.target[2]);

test('the 3D target lands on the 2D screen centre', () => {
  const c = orient(focus({ center: { x: 640, y: 360 }, z: 1 }));
  assert.ok(Math.abs(c.target[0] - 640) < 1e-6, 'target x drifted from the 2D centre');
  assert.ok(Math.abs(c.target[2] - 360) < 1e-6, 'target z drifted from the 2D centre');
  assert.ok(c.target[1] > 40 && c.target[1] < 120, 'target height should be roughly waist height');
  // north stays "up": the camera sits on the +z side, as in the 2D plan
  assert.ok(c.pos[2] > c.target[2], 'camera must look from the bottom of the plan upwards');
  assert.ok(c.pos[1] > c.target[1], 'camera must look down at the target');
});

test('camera distance follows the 2D zoom level', () => {
  const near = orient(focus({ center: { x: 640, y: 360 }, z: 4 }));
  const mid = orient(focus({ center: { x: 640, y: 360 }, z: 1 }));
  const far = orient(focus({ center: { x: 640, y: 360 }, z: 0.25 }));
  assert.ok(camDistance(near) < camDistance(mid), 'zooming in 2D must bring the 3D camera closer');
  assert.ok(camDistance(mid) < camDistance(far), 'zooming out 2D must pull the 3D camera back');
  for (const c of [near, mid, far]) {
    const d = camDistance(c);
    assert.ok(d >= 300 && d <= 9000, 'camera distance out of range: ' + d.toFixed(0));
  }
});

test('a selected object is framed instead of the viewport centre', () => {
  const b = { x0: 1300, y0: 1100, x1: 1700, y1: 1400 };   // away from the viewport centre
  const c = orient(focus({ selBBox: b, center: { x: 640, y: 360 }, z: 1 }));
  assert.ok(Math.abs(c.target[0] - 1500) < 1e-6, 'target is not the selection centre (x)');
  assert.ok(Math.abs(c.target[2] - 1250) < 1e-6, 'target is not the selection centre (z)');
  // the camera has to be close enough that a 4 m room fills a useful part of the frame
  const d = camDistance(c);
  assert.ok(d > 300 && d < 2500, 'selection framing distance is off: ' + d.toFixed(0));
});

test('the target is clamped near the plan when the 2D view is far away', () => {
  const c = orient(focus({ center: { x: 9000, y: -4000 }, z: 1 }));
  assert.ok(c.target[0] < FIT.x1 + 500, 'target x escaped the plan bounds: ' + c.target[0]);
  assert.ok(c.target[2] > FIT.z0 - 500, 'target z escaped the plan bounds: ' + c.target[2]);
});

test('the target follows the floor being edited', () => {
  const f = focus({ center: { x: 640, y: 360 }, z: 1 });
  const g = orient(f, FIT, { floorIndex: 0 });
  const up = orient(f, FIT, { floorIndex: 1 });
  assert.ok(Math.abs(up.target[1] - g.target[1] - 290) < 1e-6, 'floor 1 should be one storey higher');
  const isolated = orient(f, FIT, { floorIndex: 1, floorFilter: 'P-1' });
  assert.ok(Math.abs(isolated.target[1] - 80) < 1e-6, 'an isolated floor is drawn at ground level');
});

test('a previous 3D camera survives a plain 2D ⇄ 3D round-trip', () => {
  const prevCam = { pos: { x: 1, y: 2, z: 3 }, target: { x: 4, y: 5, z: 6 } };
  const center = { x: 640, y: 360 };
  assert.strictEqual(shouldKeep({ prevCam, center, prevCenter: { x: 640, y: 360 }, selKey: '', prevSelKey: '', focusSel: false }), true);
  // a 150 cm drift is not "a different room"
  assert.strictEqual(shouldKeep({ prevCam, center, prevCenter: { x: 490, y: 360 }, selKey: '', prevSelKey: '', focusSel: false }), true);
  // first ever entry has nothing to keep
  assert.strictEqual(shouldKeep({ prevCam: null, center, prevCenter: null, selKey: '', prevSelKey: '', focusSel: false }), false);
  // panning to another room re-orients
  assert.strictEqual(shouldKeep({ prevCam, center, prevCenter: { x: 0, y: 0 }, selKey: '', prevSelKey: '', focusSel: false }), false);
  // a NEW selection re-frames even from the same 2D spot
  assert.strictEqual(shouldKeep({ prevCam, center, prevCenter: center, selKey: 'a1', prevSelKey: '', focusSel: true }), false);
  // but the very same selection that was framed already must not steal the camera back
  assert.strictEqual(shouldKeep({ prevCam, center, prevCenter: center, selKey: 'a1', prevSelKey: 'a1', focusSel: true }), true);
});

test('the source keeps the hand-off (guards against a revert)', () => {
  const js = read('app.js');
  assert.match(js, /const CAM_KEEP_RADIUS = 200/, 'the 200 cm "same area" radius changed — update this test too');

  const start = js.indexOf('function show3D(on)');
  assert.ok(start > 0, 'show3D() is gone');
  let depth = 0, i = js.indexOf('{', start);
  for (; i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}') { depth--; if (depth === 0) break; }
  }
  const show3D = js.slice(start, i + 1);
  assert.match(show3D, /build3D\(keep\)/, 'show3D() no longer passes the keep flag — the camera resets again');
  assert.match(show3D, /orient3DFrom2D\(focus\)/, 'show3D() no longer orients the camera from the 2D view');
  assert.match(show3D, /T3\.lastCam = \{ pos: T3\.cam\.position\.clone\(\)/, 'leaving 3D no longer stores the camera');
  assert.match(show3D, /dist\(T3\.center2d, c\) > CAM_KEEP_RADIUS/, 'the same-area check disappeared');
  assert.match(show3D, /selKey !== \(T3\.selKey \|\| ''\)/, 'a new selection no longer re-frames the camera');

  const focus = js.indexOf('function view3DFocus()');
  assert.ok(focus > 0, 'view3DFocus() is gone');
  const focusBody = js.slice(focus, js.indexOf('\n}', focus));
  assert.match(focusBody, /selectionBounds\(os\)/, 'the selected object is no longer framed');
  assert.match(focusBody, /view2DCenter\(\)/, 'the 2D viewport centre is no longer used');

  const orientBody = js.slice(js.indexOf('function orient3DFrom2D'), js.indexOf('\n}\n', js.indexOf('function orient3DFrom2D')));
  assert.match(orientBody, /clamp\(span \* 1\.55, 300, 6000\)/, 'the zoom-proportional distance changed — update this test too');

  // "Fit" must still be able to reset the camera to the whole building
  assert.match(js, /T3\.fit = \{ cx, cz, sz, elev, x0:/, 'T3.fit bounds are missing');
  assert.match(js, /function set3DCam\(kind\)/, 'the camera presets are gone');
  // and a theme switch must not silently reset the orbit while in 3D
  assert.match(js, /if \(ui\.view3d && T3\) build3D\(true\); \/\/ tema/, 'theme switching resets the 3D camera again');
});
