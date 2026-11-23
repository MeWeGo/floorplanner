/* One-sided 2D resize keeping opposite corner fixed (#179).
   Runs the real furnResizeCorner & furnResizeSide extracted from app.js across
   rotations, all 4 corners, polygon/roof scaling, snap steps, and checks UI wiring. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, markerBlock } = require('./helpers/repo');

const src = read('app.js');

function load() {
  return new Function(`
    const rnd = (v, s) => Math.round(v / s) * s;
    ${markerBlock(src, 'ROOF-PARAM')}
    ${fnSrcOf(src, 'furnResizeCorner')}
    ${fnSrcOf(src, 'furnResizeSide')}
    return { furnResizeCorner, furnResizeSide, roofHeight };
  `)();
}

function cornerWorld(o, idx) {
  const sx = (idx === 1 || idx === 2) ? 1 : -1;
  const sy = (idx === 2 || idx === 3) ? 1 : -1;
  const r = (+o.rot || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
  const lx = sx * o.w / 2, ly = sy * o.d / 2;
  return { x: o.x + c * lx - s * ly, y: o.y + s * lx + c * ly };
}

const approxPt = (a, b, tol = 0.05, msg = '') => {
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  assert.ok(d <= tol, `${msg}dist((${a.x},${a.y}), (${b.x},${b.y})) = ${d} > ${tol}`);
};

test('(1) one-sided resize keeps the opposite corner fixed across rotations and all 4 corners', () => {
  const { furnResizeCorner } = load();
  for (const rot of [0, 45, 90, 135]) {
    for (let idx = 0; idx < 4; idx++) {
      const o0 = { k: 'rect', w: 120, d: 80, x: 300, y: 200, rot };
      const oppIdx = (idx + 2) % 4;
      const oppBefore = cornerWorld(o0, oppIdx);
      const dragOrig = cornerWorld(o0, idx);
      const r = rot * Math.PI / 180;
      const sx = (idx === 1 || idx === 2) ? 1 : -1, sy = (idx === 2 || idx === 3) ? 1 : -1;
      const raw = {
        x: dragOrig.x + Math.cos(r) * (40 * sx) - Math.sin(r) * (30 * sy),
        y: dragOrig.y + Math.sin(r) * (40 * sx) + Math.cos(r) * (30 * sy),
      };
      const o = { ...o0 };
      const anchor = furnResizeCorner(o, o0, idx, raw, 1, true);
      assert.strictEqual(o.w, 160, `rot=${rot} idx=${idx} width`);
      assert.strictEqual(o.d, 110, `rot=${rot} idx=${idx} depth`);
      approxPt(cornerWorld(o, oppIdx), oppBefore, 0.05, `rot=${rot} idx=${idx} opp corner: `);
      approxPt(anchor, oppBefore, 0.05, `rot=${rot} idx=${idx} returned anchor: `);
    }
  }
});

test('(2) snap step st=5 vs st=1 and centre-symmetric mode (oneSided=false)', () => {
  const { furnResizeCorner } = load();
  const o0 = { k: 'rect', w: 100, d: 60, x: 200, y: 150, rot: 0 };
  const oppBefore = cornerWorld(o0, 0); // c0 = (150, 120)

  const oSnap = { ...o0 };
  furnResizeCorner(oSnap, o0, 2, { x: 273, y: 194 }, 5, true);
  assert.strictEqual(oSnap.w, 125); // 273 - 150 = 123 -> 125
  assert.strictEqual(oSnap.d, 75);  // 194 - 120 = 74 -> 75
  approxPt(cornerWorld(oSnap, 0), oppBefore, 0.05, 'snapped opp corner: ');

  const oCtr = { ...o0 };
  const anchorCtr = furnResizeCorner(oCtr, o0, 2, { x: 280, y: 200 }, 1, false);
  assert.strictEqual(oCtr.w, 160);
  assert.strictEqual(oCtr.d, 100);
  approxPt({ x: oCtr.x, y: oCtr.y }, { x: 200, y: 150 }, 0.01, 'centre mode keeps centre: ');
  approxPt(anchorCtr, { x: 200, y: 150 }, 0.01, 'centre mode anchor: ');
});

test('(3) polygonal roof / custom furniture scales pts and updates roofHeight', () => {
  const { furnResizeCorner, roofHeight } = load();
  const o0 = {
    k: 'roof', roofType: 'hip', pitch: 30, over: 50, th: 20,
    w: 200, d: 100, h: 0, x: 0, y: 0, rot: 0,
    pts: [{ x: -100, y: 0 }, { x: 0, y: -50 }, { x: 100, y: 0 }, { x: 0, y: 50 }],
  };
  o0.h = roofHeight(o0);
  const o = JSON.parse(JSON.stringify(o0));
  const oppBefore = cornerWorld(o0, 0);
  furnResizeCorner(o, o0, 2, { x: 200, y: 100 }, 1, true); // c0=(-100,-50) -> new w=300, d=150
  assert.strictEqual(o.w, 300);
  assert.strictEqual(o.d, 150);
  approxPt(cornerWorld(o, 0), oppBefore, 0.05, 'poly roof opp corner: ');
  assert.deepStrictEqual(o.pts, [{ x: -150, y: 0 }, { x: 0, y: -75 }, { x: 150, y: 0 }, { x: 0, y: 75 }]);
  assert.strictEqual(o.h, roofHeight(o));
});

test('(4) wiring guards: Alt toggle, UI checkbox, preview anchor, and size tip cleanup', () => {
  assert.match(fnSrcOf(src, 'doHandle'), /e\s*&&\s*e\.altKey\s*\?\s*!ui\.oneSidedResize\s*:\s*!!ui\.oneSidedResize/);
  assert.match(fnSrcOf(src, 'doHandle'), /furnResizeCorner\(o,\s*d\.orig,\s*\+h\.slice\(1\),\s*pt,\s*st,\s*oneSided\)/);
  assert.match(fnSrcOf(src, 'drawPreview'), /d\.anchor/);
  assert.match(fnSrcOf(src, 'renderProps'), /data-k="ui" data-p="oneSidedResize"/);
  assert.match(fnSrcOf(src, 'applyProp'), /k === 'ui' && p === 'oneSidedResize'/);
  assert.match(fnSrcOf(src, 'cancelTouchSingle'), /showSizeTip\(null\)/);
  assert.match(fnSrcOf(src, 'cvUp'), /showSizeTip\(null\)/);
});
