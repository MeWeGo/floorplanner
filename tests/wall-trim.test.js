/* Trim tool, split-at-intersection and join-corner (issue #15).
   The real functions are cut out of app.js and run against synthetic floors. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');
const start = src.indexOf('/* ---------- Duvar kırpma / bölme (issue #15) ---------- */');
const end = src.indexOf('/* ---------- Oda algılama');
assert.ok(start > 0 && end > start, 'trim section not found in app.js');

function load(walls, ops = []) {
  const f = { walls, ops };
  const api = new Function('f', `
    let n = 0; const uid = () => 'n' + (++n);
    const F = () => f, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y), wLen = w => dist(w.a, w.b);
    function segProj(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1e-9; const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1); const q = { x: a.x + dx * t, y: a.y + dy * t }; return { t, q, d: dist(p, q) }; }
    const mkWall = (a, b) => ({ id: uid(), a: { ...a }, b: { ...b }, t: 20, h: 270, wt: 'solid' });
    function deleteIds(ids) { const s = new Set(ids); f.ops = f.ops.filter(o => !s.has(o.id)); }
    ${src.slice(start, end)}
    return { wallCuts, trimWall, splitWallAt, joinCorner, trimPlan };`)(f);
  return { f, ...api };
}
const W = (id, ax, ay, bx, by) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, t: 20, h: 270, wt: 'solid' });
const near = (p, x, y) => Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6;

test('clicking an overhang trims the wall back to the crossing', () => {
  // vertical wall crosses the horizontal one and sticks out 60 cm above it
  const { f, trimWall } = load([W('h', 0, 0, 400, 0), W('v', 200, -60, 200, 300)]);
  assert.ok(trimWall(f.walls[1], { x: 200, y: -30 }));
  assert.ok(near(f.walls[1].a, 200, 0), JSON.stringify(f.walls[1]));
  assert.ok(near(f.walls[1].b, 200, 300));
});

test('openings follow the kept piece and the trimmed piece loses its own', () => {
  const ops = [{ id: 'o1', wall: 'v', d: 30, w: 40 }, { id: 'o2', wall: 'v', d: 260, w: 90 }];
  const { f, trimWall } = load([W('h', 0, 0, 400, 0), W('v', 200, -60, 200, 300)], ops);
  trimWall(f.walls[1], { x: 200, y: -30 });
  assert.deepStrictEqual(f.ops.map(o => o.id), ['o2']);
  assert.strictEqual(f.ops[0].d, 200, 'opening distance not re-based on the new a end');
});

test('a piece between two crossings is removed and the wall split in two', () => {
  const { f, trimWall } = load([W('h', 0, 0, 600, 0), W('v1', 200, -100, 200, 100), W('v2', 400, -100, 400, 100)]);
  trimWall(f.walls[0], { x: 300, y: 0 });
  const hs = f.walls.filter(w => w.a.y === 0 && w.b.y === 0);
  assert.strictEqual(hs.length, 2);
  assert.ok(hs.some(w => near(w.a, 0, 0) && near(w.b, 200, 0)));
  assert.ok(hs.some(w => near(w.a, 400, 0) && near(w.b, 600, 0)));
});

test('a wall nobody crosses is left alone', () => {
  const { f, trimWall } = load([W('h', 0, 0, 400, 0), W('v', 0, 100, 400, 100)]);
  assert.strictEqual(trimWall(f.walls[0], { x: 100, y: 0 }), false);
  assert.ok(near(f.walls[0].a, 0, 0) && near(f.walls[0].b, 400, 0));
});

test('split at intersection cuts exactly at the crossing', () => {
  const { f, wallCuts, splitWallAt } = load([W('h', 0, 0, 500, 0), W('v', 130, -50, 130, 50)]);
  assert.deepStrictEqual(wallCuts(f.walls[0]), [130]);
  splitWallAt(f.walls[0], 130);
  assert.ok(near(f.walls[0].b, 130, 0) && near(f.walls[2].a, 130, 0) && near(f.walls[2].b, 500, 0));
});

test('join corner trims a crossing overhang and extends a short wall', () => {
  const { f, joinCorner } = load([W('h', -40, 0, 400, 0), W('v', 0, 30, 0, 300)]);
  assert.ok(joinCorner(f.walls[0], f.walls[1]));
  assert.ok(near(f.walls[0].a, 0, 0), 'overhang not trimmed');
  assert.ok(near(f.walls[1].a, 0, 0), 'short wall not extended');
  assert.strictEqual(joinCorner(W('a', 0, 0, 1, 0), W('b', 0, 5, 1, 5)), false);
});
