/* Bookcase / shelving unit in 3D (issue #54).
   The open branch used to draw one solid full-size box and then shelves that
   were smaller than it, so every shelf was buried and the bookcase read as a
   plain brown block. This runs the real furn3D branch with a recording bb()
   and checks the shelves are actually exposed. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');
const f3d = src.slice(src.indexOf('function furn3D('));
const start = f3d.indexOf("case 'dresser': case 'night': case 'shelf': case 'bookcase': {");
const end = f3d.indexOf("case 'fridge':", start);
assert.ok(start > 0 && end > start, "furn3D lost its dresser / shelf / bookcase branch");
const branch = f3d.slice(start, end);

/** Runs the branch for one item; returns the boxes as { w, h, d, x, y0, z }. */
function boxes(type, w, d, h, ed = true) {
  const out = [];
  const bb = (bw, bh, bd, c, x, y0, z) => out.push({ w: bw, h: bh, d: bd, x, y0, z });
  const run = new Function('o', 'w', 'd', 'h', 'ed', 'bb', 'sh', 'metal',
    `switch (o.type) { ${branch} }`);
  run({ type }, w, d, h, ed, bb, () => 0, 0);
  return out;
}

const solidCarcass = (bs, w, d, h) => bs.some(b => b.w >= 0.9 * w && b.d >= 0.9 * d && b.h >= 0.9 * h);

for (const type of ['bookcase', 'shelf']) {
  test(`${type}: open front, no solid carcass hiding the shelves`, () => {
    for (const [w, d, h] of [[100, 35, 200], [80, 30, 80], [120, 35, 240]]) {
      const bs = boxes(type, w, d, h);
      assert.ok(!solidCarcass(bs, w, d, h), `${type} ${w}x${d}x${h} is a solid box again`);
      // shelf boards: thin, wide, deep; none of them sits inside another box
      const shelves = bs.filter(b => b.h <= 2.5 && b.w >= 0.8 * w && b.d >= 0.8 * d && b.y0 > 0 && b.y0 < h - 3);
      assert.ok(shelves.length >= 1, `${type} ${w}x${d}x${h} has no shelf boards`);
      for (const s of shelves) {
        const inside = bs.some(b => b !== s && b.h > 5 && b.y0 <= s.y0 && b.y0 + b.h >= s.y0 + s.h &&
          b.z - b.d / 2 <= s.z - s.d / 2 && b.z + b.d / 2 >= s.z + s.d / 2 &&
          b.x - b.w / 2 <= s.x - s.w / 2 && b.x + b.w / 2 >= s.x + s.w / 2);
        assert.ok(!inside, `${type}: a shelf at y=${s.y0.toFixed(0)} is buried inside another box`);
      }
      // the front stays open: nothing thin spans the whole front face
      assert.ok(!bs.some(b => b.d <= 3 && b.w >= 0.8 * w && b.h >= 0.8 * h && b.z > 0), `${type} has a closed front`);
      assert.ok(bs.length <= 14, `${type} ${w}x${d}x${h} uses ${bs.length} meshes (budget ~12)`);
    }
  });
}

test('bookcase has books, the shelving unit stays empty, and books are skipped on low detail', () => {
  const narrow = bs => bs.filter(b => b.w < 0.8 * 100 && b.w > 20 && b.h > 10 && b.d < 35); // rows of books
  assert.ok(narrow(boxes('bookcase', 100, 35, 200)).length >= 2, 'bookcase shows no books');
  assert.strictEqual(narrow(boxes('shelf', 100, 35, 200)).length, 0, 'the shelving unit should stay empty');
  assert.ok(boxes('bookcase', 100, 35, 200, false).length < boxes('bookcase', 100, 35, 200, true).length,
    'books must be dropped when the detail flag is off');
});

test('dresser and nightstand keep their solid carcass with drawer fronts', () => {
  for (const [type, w, d, h] of [['dresser', 120, 50, 85], ['night', 50, 40, 55]]) {
    const bs = boxes(type, w, d, h);
    assert.ok(solidCarcass(bs, w, d, h), `${type} lost its carcass`);
    assert.ok(bs.filter(b => b.d === 2).length >= 2, `${type} lost its drawer fronts`);
  }
});
