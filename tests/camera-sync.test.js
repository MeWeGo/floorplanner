/* 2D → 3D camera hand-off (issue #37).

   Opening 3D used to reset the camera to a generic view of the whole building,
   and every 2D ⇄ 3D round-trip threw the user's orbit away. These run the real
   view3DFocus() / orient3DFrom2D() / keepCam3D() cut out of app.js against a
   stub camera. Behaviour with a real camera is covered by browser-smoke.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js');
const SCREEN = { w: 1400, h: 900 };
const FIT = { cx: 1000, cz: 800, sz: 1400, x0: 300, x1: 1700, z0: 100, z1: 1500 };
const vec = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } });
const radius = Number(src.match(/const CAM_KEEP_RADIUS = (\d+)/)[1]);

/** The real functions in one sandbox; `elevOf(i)` stands in for v3dElev (tested in features-84-86). */
function sandbox({ selBBox = null, center = { x: 0, y: 0 }, z = 1, floorIndex = 0, elevOf = () => 0, fit = FIT } = {}) {
  const T3 = { fit, cam: { position: vec() }, ctl: { target: vec(), update() {} } };
  return new Function('T3', 'env', `
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const CAM_KEEP_RADIUS = ${radius};
    const fi = env.floorIndex, v3dElev = env.elevOf, fitOrtho = () => {};
    const view = { z: env.z }, cv = { clientWidth: ${SCREEN.w}, clientHeight: ${SCREEN.h} };
    const selObjs = () => (env.selBBox ? [{}] : []), selectionBounds = () => env.selBBox;
    const view2DCenter = () => env.center;
    ${fnSrcOf(src, 'view3DFocus')}
    ${fnSrcOf(src, 'orient3DFrom2D')}
    ${fnSrcOf(src, 'keepCam3D')}
    return { T3, view3DFocus, orient3DFrom2D, keepCam3D };`)(T3, { selBBox, center, z, floorIndex, elevOf });
}
/** Focus from the 2D state, then the camera orient3DFrom2D() places. */
function cam(opts) {
  const s = sandbox(opts);
  s.orient3DFrom2D();
  const p = s.T3.cam.position, t = s.T3.ctl.target;
  return { pos: [p.x, p.y, p.z], target: [t.x, t.y, t.z], focus: s.view3DFocus() };
}
function shouldKeep({ prevCam, center, prevCenter, selKey, prevSelKey, focusSel }) {
  return sandbox().keepCam3D({ lastCam: prevCam, center2d: prevCenter, selKey: prevSelKey }, center, { sel: focusSel }, selKey);
}

const camDistance = c => Math.hypot(c.pos[0] - c.target[0], c.pos[1] - c.target[1], c.pos[2] - c.target[2]);

test('the 3D target lands on the 2D screen centre', () => {
  const c = cam({ center: { x: 640, y: 360 }, z: 1 });
  assert.ok(Math.abs(c.target[0] - 640) < 1e-6, 'target x drifted from the 2D centre');
  assert.ok(Math.abs(c.target[2] - 360) < 1e-6, 'target z drifted from the 2D centre');
  assert.ok(c.target[1] > 40 && c.target[1] < 120, 'target height should be roughly waist height');
  // north stays "up": the camera sits on the +z side, as in the 2D plan
  assert.ok(c.pos[2] > c.target[2], 'camera must look from the bottom of the plan upwards');
  assert.ok(c.pos[1] > c.target[1], 'camera must look down at the target');
});

test('camera distance follows the 2D zoom level', () => {
  const near = cam({ center: { x: 640, y: 360 }, z: 4 });
  const mid = cam({ center: { x: 640, y: 360 }, z: 1 });
  const far = cam({ center: { x: 640, y: 360 }, z: 0.25 });
  assert.ok(camDistance(near) < camDistance(mid), 'zooming in 2D must bring the 3D camera closer');
  assert.ok(camDistance(mid) < camDistance(far), 'zooming out 2D must pull the 3D camera back');
  for (const c of [near, mid, far]) {
    const d = camDistance(c);
    assert.ok(d >= 300 && d <= 9000, 'camera distance out of range: ' + d.toFixed(0));
  }
});

test('a selected object is framed instead of the viewport centre', () => {
  const b = { x0: 1300, y0: 1100, x1: 1700, y1: 1400 };   // away from the viewport centre
  const c = cam({ selBBox: b, center: { x: 640, y: 360 }, z: 1 });
  assert.ok(Math.abs(c.target[0] - 1500) < 1e-6, 'target is not the selection centre (x)');
  assert.ok(Math.abs(c.target[2] - 1250) < 1e-6, 'target is not the selection centre (z)');
  // the camera has to be close enough that a 4 m room fills a useful part of the frame
  const d = camDistance(c);
  assert.ok(d > 300 && d < 2500, 'selection framing distance is off: ' + d.toFixed(0));
});

test('the target is clamped near the plan when the 2D view is far away', () => {
  const c = cam({ center: { x: 9000, y: -4000 }, z: 1 });
  assert.ok(c.target[0] < FIT.x1 + 500, 'target x escaped the plan bounds: ' + c.target[0]);
  assert.ok(c.target[2] > FIT.z0 - 500, 'target z escaped the plan bounds: ' + c.target[2]);
});

test('the target follows the floor being edited (at its 3D elevation)', () => {
  const elevOf = i => [0, 290, 600][i];
  const g = cam({ center: { x: 640, y: 360 }, floorIndex: 0, elevOf });
  const up = cam({ center: { x: 640, y: 360 }, floorIndex: 1, elevOf });
  assert.ok(Math.abs(up.target[1] - g.target[1] - 290) < 1e-6, 'floor 1 should be one storey higher');
  assert.ok(Math.abs(cam({ center: { x: 640, y: 360 }, floorIndex: 2, elevOf }).target[1] - 680) < 1e-6, 'uses v3dElev, not a fixed pitch');
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


test('the selection focus spans its bounding box; no selection spans the visible 2D area', () => {
  const sel = cam({ selBBox: { x0: 0, y0: 0, x1: 400, y1: 100 } }).focus;
  assert.deepStrictEqual(sel, { x: 200, y: 50, span: 400, sel: true });
  const view = cam({ center: { x: 10, y: 20 }, z: 2 }).focus;
  assert.deepStrictEqual(view, { x: 10, y: 20, span: Math.max(SCREEN.w, SCREEN.h) / 2 / 2, sel: false });
});
