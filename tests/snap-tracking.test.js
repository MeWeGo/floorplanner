/* Object snap tracking (issue #16): closing an L into a U must land exactly on
   the first wall's open end, with and without the angle lock, and say which
   reference it aligned to so the dashed guide can be drawn. Runs the real
   trackRefs()/snapPt() cut out of app.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');
const start = src.indexOf('function underlayFloor('); // + underlay / mid / centre helpers (#25, #26)
const end = src.indexOf('function wallNear(');
assert.ok(start > 0 && end > start, 'trackRefs/snapPt not found in app.js');

function env(walls, opts = {}) {
  return new Function('walls', 'opts', `
    const ui = { snap: true, angle: opts.angle !== false, polyPts: null };
    const view = { z: 1 }, P = { grid: 10, gridType: 'square' };
    const F = () => ({ walls, rooms: [] }), layersVis = { underlay: false }, underlay = { floor: 'prev' }, KINDS = {};
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), rnd = (v, s) => Math.round(v / s) * s;
    const snapToGrid = p => ({ x: rnd(p.x, P.grid), y: rnd(p.y, P.grid) });
    ${src.slice(start, end)}
    return { snapPt };`)(walls, opts);
}
const W = (ax, ay, bx, by) => ({ id: Math.random().toString(36).slice(2), a: { x: ax, y: ay }, b: { x: bx, y: by }, t: 20 });

// L: (0,0)→(0,403)→(300,403). Third wall goes up from (300,403); the first wall's
// open end is at y=0 — off any 10 cm grid multiple of the 403 cm run.
const L = () => [W(0, 0, 0, 403), W(0, 403, 300, 403)];

test('angle lock: the vertical run stops exactly level with the first wall end', () => {
  const { snapPt } = env(L());
  const q = snapPt({ x: 301, y: 5 }, { x: 300, y: 403 }, null);
  assert.strictEqual(q.y, 0, 'length was rounded to the grid instead of tracking y=0: ' + JSON.stringify(q));
  assert.strictEqual(q.x, 300);
  assert.ok(q.guides.length === 1 && q.guides[0].from.x === 0 && q.guides[0].from.y === 0);
});

test('no angle lock: x and y lock independently, both together hit the intersection', () => {
  const { snapPt } = env([W(0, 0, 0, 403), W(0, 403, 307, 403)], { angle: false });
  const q = snapPt({ x: 305, y: 4 }, null, null);
  assert.strictEqual(q.x, 307); assert.strictEqual(q.y, 0);
  assert.strictEqual(q.guides.length, 2);
});

test('Shift or snap off disables tracking', () => {
  const { snapPt } = env(L());
  const q = snapPt({ x: 301, y: 5 }, { x: 300, y: 403 }, { shiftKey: true });
  assert.deepStrictEqual([q.x, q.y, q.guides], [301, 5, undefined]);
});

test('far from any alignment the grid still wins and no guide is shown', () => {
  const { snapPt } = env(L(), { angle: false });
  const q = snapPt({ x: 153, y: 207 }, null, null);
  assert.deepStrictEqual([q.x, q.y, q.guides.length], [150, 210, 0]);
});

test('guides are drawn in the preview and handle drags feed them', () => {
  assert.ok(/cur\.guides/.test(src.slice(src.indexOf('function drawPreview'))), 'drawPreview ignores guides');
  assert.ok(/snapPt\(raw, other, e, ign\); ui\.cur = p;/.test(src), 'wall-end handle drag does not expose guides');
});
