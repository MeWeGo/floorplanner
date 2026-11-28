/* One-click dimensions (#200) on the real autoDims(): room width / depth inside the room, three exterior
   chains per side (openings, wall pieces, overall) placed outside the walls, hidden walls in front ignored. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, constLineOf } = require('./helpers/repo');

const src = read('app.js');
const api = new Function([
  'const isSolidWall = w => !w.wt || w.wt === "solid";',
  ...['ifcHull', 'ifcRect', 'autoDimUniq', 'autoDimAt', 'autoDims'].map(n => fnSrcOf(src, n)),
  constLineOf(src, 'AUTO_DIM_GAP'),
  src.slice(src.indexOf('const AUTO_SIDES = {'), src.indexOf('};', src.indexOf('const AUTO_SIDES = {')) + 2),
  'return { autoDims };',
].join('\n'))();

const W = (id, ax, ay, bx, by, t = 20) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, t, h: 270, wt: 'solid' });
// the dimension line of d: its two ends moved by off along the normal of a → b (as dimSvg draws it)
const line = d => { const L = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y), nx = -(d.b.y - d.a.y) / L, ny = (d.b.x - d.a.x) / L; return [{ x: d.a.x + nx * d.off, y: d.a.y + ny * d.off }, { x: d.b.x + nx * d.off, y: d.b.y + ny * d.off }]; };
const len = d => Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);

function box() {
  const walls = [W('t', 0, 0, 600, 0), W('r', 600, 0, 600, 400), W('b', 600, 400, 0, 400), W('l', 0, 400, 0, 0), W('m', 300, 0, 300, 400)];
  return {
    walls,
    ops: [{ id: 'o1', wall: 't', d: 150, w: 90, h: 210 }, { id: 'o2', wall: 'b', d: 450, w: 120, h: 120, sill: 90 }],
    rooms: [{ id: 'r1', pts: [{ x: 10, y: 10 }, { x: 290, y: 10 }, { x: 290, y: 390 }, { x: 10, y: 390 }] }],
    dims: [],
  };
}

test('rooms get their inner width and depth', () => {
  const ds = api.autoDims(box()).filter(d => d.off === 0);
  assert.strictEqual(ds.length, 2);
  assert.deepStrictEqual(ds.map(len).map(Math.round).sort((a, b) => a - b), [280, 380]);
  for (const d of ds) for (const p of [d.a, d.b]) assert.ok(p.x >= 9 && p.x <= 291 && p.y >= 9 && p.y <= 391, 'room dimension stays inside the room');
  assert.ok(ds.every(d => d.auto === 1));
});

test('each side gets opening, wall and overall chains outside the walls', () => {
  const ds = api.autoDims(box()).filter(d => d.off !== 0);
  const top = ds.filter(d => Math.abs(d.a.y - d.b.y) < 1e-6 && d.a.y < 0), bottom = ds.filter(d => Math.abs(d.a.y - d.b.y) < 1e-6 && d.a.y > 400);
  // overall = outer face to outer face (600 + one wall thickness)
  assert.ok(top.some(d => Math.round(len(d)) === 620), 'top overall 620');
  assert.ok(bottom.some(d => Math.round(len(d)) === 620), 'bottom overall 620');
  // top chain with the door: edges at 105 and 195 from the left centreline (−10 = outer corner)
  const xs = new Set(top.flatMap(d => [d.a.x, d.b.x]).map(Math.round));
  for (const x of [-10, 105, 195, 610]) assert.ok(xs.has(x), 'top chain has ' + x + ': ' + [...xs]);
  // every dimension line lies outside the outer face of its side, rows do not overlap
  for (const d of top) for (const p of line(d)) assert.ok(p.y < -10 - 40, 'top dimension line is outside');
  for (const d of bottom) for (const p of line(d)) assert.ok(p.y > 410 + 40, 'bottom dimension line is outside');
  const rows = new Set(top.map(d => Math.round(line(d)[0].y)));
  assert.ok(rows.size === 2, 'top: opening chain + overall (no inner wall break on the top face): ' + [...rows]);
  const left = ds.filter(d => Math.abs(d.a.x - d.b.x) < 1e-6 && d.a.x < 0), right = ds.filter(d => Math.abs(d.a.x - d.b.x) < 1e-6 && d.a.x > 600);
  assert.ok(left.length >= 1 && right.length >= 1);
  for (const d of right) for (const p of line(d)) assert.ok(p.x > 610 + 40, 'right dimension line is outside');
  for (const d of left) for (const p of line(d)) assert.ok(p.x < -10 - 40, 'left dimension line is outside');
});

test('a wall behind another one on the same side is not on that facade', () => {
  // L-shape: the top wall of the low wing is behind the top wall of the tall wing only where they overlap
  const f = { walls: [W('a', 0, 0, 300, 0), W('b', 300, 0, 300, 200), W('c', 300, 200, 600, 200), W('d', 600, 200, 600, 500), W('e', 600, 500, 0, 500), W('f', 0, 500, 0, 0)], ops: [], rooms: [], dims: [] };
  const top = api.autoDims(f).filter(d => d.off !== 0 && Math.abs(d.a.y - d.b.y) < 1e-6 && d.a.y < 250);
  const overall = top.find(d => Math.round(len(d)) === 620);
  assert.ok(overall, 'overall top length spans both wings');
  const pieces = top.filter(d => d !== overall).map(len).map(Math.round).sort((a, b) => a - b);
  assert.deepStrictEqual(pieces, [300, 320], 'two wall pieces seen from the top');
});

test('no walls: rooms only; nothing to dimension: empty', () => {
  assert.deepStrictEqual(api.autoDims({ walls: [], ops: [], rooms: [], dims: [] }), []);
  const f = box(); f.walls = []; assert.strictEqual(api.autoDims(f).length, 2);
});
