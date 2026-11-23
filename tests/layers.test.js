/* Layering: overlapping objects must be reorderable, and 3D must follow the
   2D order with distinct heights — coplanar overlaps (rooms, pools laid end
   to end as a "river") z-fight and flicker otherwise. Runs the real
   functions cut out of app.js against synthetic floors. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, constLineOf } = require('./helpers/repo');

const src = read('app.js');
const fnSrc = name => fnSrcOf(src, name);

function env(f, selIds) {
  return new Function('f', 'selIds', `
    let sel = selIds, committed = 0;
    const F = () => f, ui = {}, T3 = null, toast = () => {}, L = (a, b) => b;
    const commit = () => { committed++; }, refresh = () => {}, schedBuild3D = () => {};
    ${constLineOf(src, 'NO_TILT_K')}
    ${constLineOf(src, 'AB_KINDS')}
    ${constLineOf(src, 'PTS_KINDS')}
    ${fnSrc('furnCorners')}
    ${fnSrc('bboxOf')}
    ${constLineOf(src, 'LAYER_ARR')}
    ${constLineOf(src, 'bbOverlap')}
    ${constLineOf(src, 'isLocked')}
    ${constLineOf(src, 'unlocked')}
    ${fnSrc('lockToast')}
    ${fnSrc('reorderSel')}
    ${fnSrc('stackLevels')}
    return { reorderSel, stackLevels, get sel() { return sel; }, get committed() { return committed; } };`)(f, selIds);
}
const fu = (id, x, y, w = 100, d = 100) => ({ id, x, y, w, d, rot: 0 });
const ids = a => a.map(o => o.id).join(',');

test('front / back move the selection to the end / start of its kind', () => {
  const f = { furn: [fu('a', 0, 0), fu('b', 50, 0), fu('c', 500, 0)], rooms: [] };
  env(f, ['a']).reorderSel('front'); assert.strictEqual(ids(f.furn), 'b,c,a');
  env(f, ['a']).reorderSel('back'); assert.strictEqual(ids(f.furn), 'a,b,c');
});

test('one step jumps past the next overlapping item, skipping unrelated ones', () => {
  // a overlaps c only; b is far away and must not "absorb" the step
  const f = { furn: [fu('a', 0, 0), fu('b', 900, 0), fu('c', 50, 0)], rooms: [] };
  env(f, ['a']).reorderSel('up'); assert.strictEqual(ids(f.furn), 'b,c,a');
  env(f, ['a']).reorderSel('down'); assert.strictEqual(ids(f.furn), 'b,a,c');
});

test('a step with nothing overlapping changes nothing and records no history', () => {
  const f = { furn: [fu('a', 0, 0), fu('b', 900, 0)], rooms: [] };
  const e = env(f, ['a']);
  assert.strictEqual(e.reorderSel('up'), false);
  assert.strictEqual(e.committed, 0);
});

test('3D stack levels: a chain of overlapping pools gets rising, distinct levels', () => {
  const pools = [fu('p1', 0, 0, 400, 200), fu('p2', 300, 0, 400, 200), fu('p3', 600, 0, 400, 200), fu('far', 5000, 0)];
  const lv = env({ furn: pools, rooms: [] }, []).stackLevels(pools, 'furn');
  assert.deepStrictEqual(lv, [0, 1, 2, 0]);
});

test('3D uses the levels for both rooms and furniture', () => {
  assert.ok(/elev \+ 0\.6 \+ roomLv\[ri\] \* 0\.5/.test(src), 'room floors are not lifted by layer');
  assert.ok(/ig\.position\.y = furnLv\[fi3\] \* 0\.5/.test(src), 'furniture is not lifted by layer');
});
