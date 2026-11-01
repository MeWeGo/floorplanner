/* Midpoint / centre snap (issue #25) and the floor underlay (issue #26).
   Runs the real snapPt() + helpers cut out of app.js against synthetic floors:
   a partition wall must land on the exact wall midpoint, a lamp on the exact
   room centroid, and an upper-floor wall on the floor-below wall end. The rest
   are wiring checks on the source. */
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
const start = src.indexOf('function underlayFloor('), end = src.indexOf('function wallNear(');
assert.ok(start > 0 && end > start, 'snap helpers not found in app.js');

function env(floors, opts = {}) {
  return new Function('floors', 'opts', `
    const ui = { snap: true, angle: false, polyPts: null };
    const view = { z: 1 }, P = { grid: 10, gridType: 'square', floors };
    let fi = opts.fi || 0;
    const F = () => P.floors[fi];
    const layersVis = { underlay: opts.underlay !== false }, underlay = { floor: opts.ref || 'prev' };
    const KINDS = { walls: 'wall', furn: 'furn', rooms: 'room', slabs: 'slab', voids: 'void', dims: 'dim' };
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), rnd = (v, s) => Math.round(v / s) * s;
    const snapToGrid = p => ({ x: rnd(p.x, P.grid), y: rnd(p.y, P.grid) });
    const furnCorners = o => [{ x: o.x - o.w / 2, y: o.y - o.d / 2 }, { x: o.x + o.w / 2, y: o.y - o.d / 2 }, { x: o.x + o.w / 2, y: o.y + o.d / 2 }, { x: o.x - o.w / 2, y: o.y + o.d / 2 }];
    const bboxOf = (k, o) => { const pts = o.pts || (o.a ? [o.a, o.b] : furnCorners(o)); const xs = pts.map(p => p.x), ys = pts.map(p => p.y); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };
    ${fnSrc('polyCentroid')}
    ${src.slice(start, end)}
    return { snapPt, snapCenters, underlayFloor, nearCenter };`)(floors, opts);
}
let n = 0;
const W = (ax, ay, bx, by) => ({ id: 'w' + n++, a: { x: ax, y: ay }, b: { x: bx, y: by }, t: 20 });
const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const floor = (o = {}) => ({ id: 'f' + n++, walls: [], ops: [], furn: [], rooms: [], slabs: [], voids: [], dims: [], ...o });

test('a wall midpoint snaps exactly, off the grid', () => {
  const { snapPt } = env([floor({ walls: [W(0, 0, 437, 0)] })]);
  const q = snapPt({ x: 212, y: 6 }, null, null);
  assert.deepStrictEqual([q.x, q.y, q.hit], [218.5, 0, 'mid']);
});

test('wall ends still win over midpoints; Shift disables the midpoint snap', () => {
  const { snapPt } = env([floor({ walls: [W(0, 0, 20, 0)] })]); // ends and mid within 14 px
  assert.strictEqual(snapPt({ x: 9, y: 0 }, null, null).hit, 'end');
  const q = snapPt({ x: 212, y: 6 }, null, { shiftKey: true });
  assert.deepStrictEqual([q.x, q.y, q.hit], [212, 6, null]);
});

test('a wall dragged by its end does not snap to its own moving midpoint', () => {
  const w = W(0, 0, 400, 0), { snapPt } = env([floor({ walls: [w] })]);
  assert.notStrictEqual(snapPt({ x: 201, y: 3 }, null, null, new Set([w.id])).hit, 'mid');
});

test('room centroid and group centre snap; a dragged vertex ignores its own room', () => {
  const room = { id: 'r', pts: rect(0, 0, 500, 300) };
  const grp = [{ id: 'a', grp: 'g', x: 1000, y: 0, w: 40, d: 40 }, { id: 'b', grp: 'g', x: 1200, y: 100, w: 40, d: 40 }];
  const { snapPt, snapCenters, nearCenter } = env([floor({ rooms: [room], furn: grp })]);
  const q = snapPt({ x: 243, y: 157 }, null, null);
  assert.deepStrictEqual([q.x, q.y, q.hit], [250, 150, 'center']);
  const c = snapCenters({ rooms: [], furn: grp });
  assert.deepStrictEqual(c, [{ x: 1100, y: 50 }], 'group bbox centre');
  assert.deepStrictEqual(nearCenter({ x: 1090, y: 55 }, 18), { x: 1100, y: 50 }, 'furniture placement locks to the group centre');
  assert.strictEqual(snapCenters({ rooms: [room] }, new Set([room.pts[0]])).length, 0);
});

test('underlay: an upper-floor wall end snaps to the floor-below wall end', () => {
  const g = floor({ walls: [W(0, 0, 333, 0)], furn: [{ id: 'c', type: 'column', k: 'round', x: 600, y: 0, w: 40, d: 40 }] });
  const up = floor();
  const { snapPt } = env([g, up], { fi: 1 });
  assert.deepStrictEqual(snapPt({ x: 329, y: 4 }, null, null), { x: 333, y: 0, hit: 'under' });
  assert.deepStrictEqual(snapPt({ x: 597, y: 3 }, null, null), { x: 600, y: 0, hit: 'under' }, 'column centre');
  // switched off → no underlay snap, plain grid
  const off = env([g, up], { fi: 1, underlay: false }).snapPt({ x: 329, y: 4 }, null, null);
  assert.notStrictEqual(off.hit, 'under');
});

test('underlay floor: previous by default, any other floor when chosen, never itself', () => {
  const a = floor(), b = floor(), c = floor();
  assert.strictEqual(env([a, b, c], { fi: 2 }).underlayFloor(), b);
  assert.strictEqual(env([a, b, c], { fi: 2, ref: a.id }).underlayFloor(), a);
  assert.strictEqual(env([a, b, c], { fi: 0 }).underlayFloor(), null, 'ground floor has nothing below');
  assert.strictEqual(env([a, b, c], { fi: 0, ref: c.id }).underlayFloor(), c, 'a roof/upper floor can be the reference');
  assert.strictEqual(env([a, b, c], { fi: 1, ref: b.id }).underlayFloor(), a, 'a floor picked as its own reference falls back to the one below');
  assert.strictEqual(env([a], { fi: 0 }).underlayFloor(), null);
});

test('wiring: glyphs, placement, panel controls and the underlay layer', () => {
  const dp = fnSrc('drawPreview');
  assert.match(dp, /snapGlyph\(cur/, 'the preview never draws mid/centre/underlay glyphs');
  const gl = fnSrc('snapGlyph');
  for (const h of ['mid', 'center', 'under']) assert.match(gl, new RegExp(`q\\.hit === '${h}'`));
  assert.match(gl, /L\('Orta nokta', 'Midpoint'\)/); assert.match(gl, /L\('Merkez', 'Center'\)/);
  assert.match(fnSrc('updateGhost'), /nearCenter\(/, 'furniture placement does not lock to the room centre');
  assert.match(fnSrc('doMove'), /nearCenter\(/, 'moving furniture does not lock to the room centre');
  assert.match(src, /\$\('#gBg'\)\.innerHTML = [^\n]*underlaySvg\(\)/, 'the underlay is not rendered');
  assert.doesNotMatch(src, /fi > 0 \? `<g opacity="\.18"/, 'the old hard-coded underlay is back');
  const us = fnSrc('underlaySvg');
  assert.match(us, /pointer-events="none"/); assert.match(us, /isStructFurn/); assert.match(us, /uf\.slabs/); assert.match(us, /voidSvg/);
  const pp = fnSrc('projectPanel');
  assert.match(pp, /data-p="underlay"/, 'no underlay toggle in the layers panel');
  assert.match(pp, /data-k="ul" data-p="floor"/, 'no reference floor select');
  assert.match(pp, /data-k="ul" data-p="op"/, 'no opacity slider');
  assert.match(fnSrc('applyProp'), /k === 'ul'/);
});
