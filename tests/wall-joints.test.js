/* Wall corners must close (issue #14).
   Walls end flat (butt) at a junction; wallJoints() returns the filler polygon
   that covers the outer corner up to the miter point. These tests run the real
   functions, cut out of app.js, against synthetic walls — no browser needed. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');
const start = src.indexOf('function convexHull(');
const end = src.indexOf('function polyArea(');
assert.ok(start > 0 && end > start, 'convexHull/wallJoints must sit right before polyArea in app.js');
const { wallJoints } = new Function(`
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wLen = w => dist(w.a, w.b);
  function polyArea(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p.x * q.y - q.x * p.y; } return Math.abs(s) / 2; }
  ${src.slice(start, end)}
  return { wallJoints };`)();

const W = (ax, ay, bx, by, t = 20) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, t, h: 270 });
const inside = (p, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};

test('a 90° corner gets a filler covering the outer square', () => {
  const j = wallJoints({ walls: [W(0, 200, 0, 0), W(0, 0, 200, 0)] });
  assert.strictEqual(j.length, 1);
  // the outer corner square is (-10..0, -10..0); its middle must be filled
  assert.ok(inside({ x: -5, y: -5 }, j[0].poly), JSON.stringify(j[0].poly));
  assert.ok(j[0].poly.some(p => Math.abs(p.x + 10) < 1e-6 && Math.abs(p.y + 10) < 1e-6), 'miter point (-10,-10) missing');
});

test('a 45° corner fills its outer wedge out to the miter point', () => {
  const j = wallJoints({ walls: [W(0, 0, 300, 0), W(0, 0, 200, 200)] });
  assert.strictEqual(j.length, 1);
  // outer side of a 45° turn lies opposite the bisector: a point just behind O
  const far = j[0].poly.reduce((m, p) => Math.max(m, Math.hypot(p.x, p.y)), 0);
  assert.ok(far > 10 + 1e-6, 'outer corner not extended beyond the butt ends (max r=' + far + ')');
  assert.ok(far <= 20 * 2.5 + 1e-6, 'miter not limited');
});

test('very acute corners are bevelled, not spiked', () => {
  const j = wallJoints({ walls: [W(0, 0, 300, 0), W(0, 0, 300, 20)] });
  for (const p of j[0] ? j[0].poly : []) assert.ok(Math.hypot(p.x, p.y) <= 50 + 1e-6);
});

test('straight continuations and free ends need no filler', () => {
  assert.strictEqual(wallJoints({ walls: [W(0, 0, 100, 0), W(100, 0, 300, 0)] }).length, 0);
  assert.strictEqual(wallJoints({ walls: [W(0, 0, 100, 0)] }).length, 0);
});

test('a T junction and unequal thicknesses still produce one closed filler', () => {
  const j = wallJoints({ walls: [W(-200, 0, 0, 0, 20), W(0, 0, 200, 0, 20), W(0, 0, 0, 200, 10)] });
  assert.strictEqual(j.length, 1);
  assert.ok(j[0].poly.length >= 3);
  const l = wallJoints({ walls: [W(0, 200, 0, 0, 10), W(0, 0, 200, 0, 30)] });
  assert.ok(inside({ x: -3, y: -10 }, l[0].poly), 'unequal-thickness outer corner not covered');
});

test('2D walls end butt, and joints are drawn in both 2D and 3D', () => {
  assert.ok(!/stroke="\$\{C\.wall\}" stroke-width="\$\{w\.t\}" stroke-linecap="square"/.test(src), 'wall body still uses square caps');
  assert.ok(/jointsSvg\(f\)/.test(src), 'layerStrings does not draw the joint fillers');
  assert.ok(/for \(const j of wallJoints\(f\)\)/.test(src), 'build3D does not add joint fillers');
});
