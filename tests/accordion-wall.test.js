/* Tests for accordion walls (Akordiyon duvar).
   Evaluates real functions extracted from app.js and verifies source wiring. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, constLineOf } = require('./helpers/repo');

const src = read('app.js');

const fnSrc = name => fnSrcOf(src, name);

const constLine = name => constLineOf(src, name);

const {
  ACC_TOL,
  isAccWall,
  accCandidate,
  accLink,
  setAccWall,
  accFitOps,
  syncAccWalls,
  cleanAcc,
} = new Function(`
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wLen = w => dist(w.a, w.b);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  ${constLine('ACC_TOL')}
  ${fnSrc('isAccWall')}
  ${fnSrc('accCandidate')}
  ${fnSrc('accLink')}
  ${fnSrc('setAccWall')}
  ${fnSrc('accFitOps')}
  ${fnSrc('syncAccWalls')}
  ${fnSrc('cleanAcc')}
  return { ACC_TOL, isAccWall, accCandidate, accLink, setAccWall, accFitOps, syncAccWalls, cleanAcc };
`)();

const mkFloor = (walls = [], ops = []) => ({ id: 'f1', walls, ops });

test('(1) accLink links both ends to coincident wall ends, prefers normal walls, null outside 1 cm', () => {
  assert.strictEqual(ACC_TOL, 1, 'ACC_TOL must be 1 cm');

  const wNormA = { id: 'w1', a: { x: -100, y: 0 }, b: { x: 0.6, y: 0 } };
  const wOtherAcc = { id: 'w_other_acc', a: { x: 0, y: 0 }, b: { x: 0, y: 100 }, acc: { a: null, b: null } };
  const wNormB = { id: 'w2', a: { x: 200.5, y: 0 }, b: { x: 300, y: 0 } };
  const wAcc = { id: 'w_acc', a: { x: 0, y: 0 }, b: { x: 200, y: 0 } };

  const f = mkFloor([wNormA, wOtherAcc, wNormB, wAcc]);
  const links = accLink(f, wAcc);

  assert.deepStrictEqual(links.a, { w: 'w1', e: 'b', x: 0.6, y: 0 }, 'should prefer normal wall w1 over closer accordion wall');
  assert.deepStrictEqual(links.b, { w: 'w2', e: 'a', x: 200.5, y: 0 }, 'should link b to w2.a within 1 cm');
  assert.strictEqual(isAccWall(wAcc), true);

  // Outside 1 cm -> null
  const wFar = { id: 'w_far', a: { x: 500, y: 500 }, b: { x: 600, y: 500 } };
  const wFar2 = { id: 'w_far2', a: { x: 0, y: 1.01 }, b: { x: 0, y: 100 } };
  const f2 = mkFloor([wFar2, wFar]);
  accLink(f2, wFar);
  assert.strictEqual(wFar.acc.a, null);
  assert.strictEqual(wFar.acc.b, null);

  // setAccWall toggles w.acc
  setAccWall(f, wAcc, false);
  assert.strictEqual(isAccWall(wAcc), false);
  assert.strictEqual('acc' in wAcc, false);
  setAccWall(f, wAcc, true);
  assert.strictEqual(isAccWall(wAcc), true);
});

test('(2) room wall rotated about a pivot stretches accordion wall and keeps fixed end', () => {
  const wRoom = { id: 'w_room', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
  const wFixed = { id: 'w_fixed', a: { x: 300, y: 0 }, b: { x: 300, y: 100 } };
  const wAcc = { id: 'w_acc', a: { x: 100, y: 0 }, b: { x: 300, y: 0 } };
  const f = mkFloor([wRoom, wFixed, wAcc]);

  accLink(f, wAcc);
  assert.strictEqual(wAcc.acc.a.w, 'w_room');
  assert.strictEqual(wAcc.acc.b.w, 'w_fixed');

  // Rotate wRoom around pivot a=(0,0) so b moves to (60, 80)
  wRoom.b = { x: 60, y: 80 };
  const moved = syncAccWalls(f);

  assert.strictEqual(moved, true);
  assert.deepStrictEqual(wAcc.a, { x: 60, y: 80 }, 'accordion end a must follow rotated room wall');
  assert.strictEqual(wAcc.acc.a.x, 60);
  assert.strictEqual(wAcc.acc.a.y, 80);
  assert.deepStrictEqual(wAcc.b, { x: 300, y: 0 }, 'fixed end b must stay put');
});

test('(3) openings on accordion wall are clamped inside the new length (accFitOps)', () => {
  const wLeft = { id: 'w_left', a: { x: -100, y: 0 }, b: { x: 0, y: 0 } };
  const wRight = { id: 'w_right', a: { x: 200, y: 0 }, b: { x: 300, y: 0 } };
  const wAcc = { id: 'w_acc', a: { x: 0, y: 0 }, b: { x: 200, y: 0 } };
  const op = { id: 'op1', wall: 'w_acc', d: 180, w: 90 };
  const f = mkFloor([wLeft, wRight, wAcc], [op]);

  accLink(f, wAcc);

  // Shrink wall from 200 cm to 120 cm
  wRight.a = { x: 120, y: 0 };
  syncAccWalls(f);
  assert.strictEqual(op.d, 75, 'opening center must be clamped to L - op.w/2 = 75');

  // Shrink wall shorter than opening width (40 cm < 90 cm) -> centered at L/2 = 20
  wRight.a = { x: 40, y: 0 };
  syncAccWalls(f);
  assert.strictEqual(op.d, 20, 'opening center must be clamped to L/2 when L < op.w');
});

test('(4) relink: moving accordion end onto another wall relinks when relink=true, null in empty space, ignored when relink=false', () => {
  const w1 = { id: 'w1', a: { x: -100, y: 0 }, b: { x: 0, y: 0 } };
  const w2 = { id: 'w2', a: { x: 200, y: 0 }, b: { x: 300, y: 0 } };
  const w3 = { id: 'w3', a: { x: 250, y: 50 }, b: { x: 350, y: 50 } };
  const wAcc = { id: 'w_acc', a: { x: 0, y: 0 }, b: { x: 200, y: 0 } };
  const f = mkFloor([w1, w2, w3, wAcc]);

  accLink(f, wAcc);

  // User drags wAcc.b onto w3.a while w2 did not move
  wAcc.b = { x: 250, y: 50 };

  // With relink = false, it must NOT relink
  syncAccWalls(f, false);
  assert.strictEqual(wAcc.acc.b.w, 'w2', 'relink=false must keep existing link');
  assert.deepStrictEqual(wAcc.b, { x: 250, y: 50 });

  // With relink = true, it relinks to w3.a
  syncAccWalls(f, true);
  assert.deepStrictEqual(wAcc.acc.b, { w: 'w3', e: 'a', x: 250, y: 50 });

  // User drags wAcc.b into empty space -> link becomes null, end stays where user put it
  wAcc.b = { x: 500, y: 500 };
  syncAccWalls(f, true);
  assert.strictEqual(wAcc.acc.b, null);
  assert.deepStrictEqual(wAcc.b, { x: 500, y: 500 });
});

test('(5) chain: accordion linked to another accordion follows after one syncAccWalls call', () => {
  const wAnchor = { id: 'w_anchor', a: { x: -100, y: 0 }, b: { x: 0, y: 0 } };
  const wEnd = { id: 'w_end', a: { x: 300, y: 0 }, b: { x: 400, y: 0 } };
  const wAcc1 = { id: 'w_acc1', a: { x: 0, y: 0 }, b: { x: 150, y: 0 } };
  const wAcc2 = { id: 'w_acc2', a: { x: 150, y: 0 }, b: { x: 300, y: 0 } };
  // Put wAcc2 before wAcc1 to ensure multi-pass propagation works regardless of wall order
  const f = mkFloor([wAnchor, wEnd, wAcc2, wAcc1]);

  accLink(f, wAcc1);
  accLink(f, wAcc2);
  assert.strictEqual(wAcc1.acc.a.w, 'w_anchor');
  assert.strictEqual(wAcc2.acc.a.w, 'w_acc1');

  // wAcc1.b and wAcc2.a attached to each other above; point wAcc2.a at wAcc1.a to get a one-way chain
  wAcc2.a = { x: 0, y: 0 };
  wAcc2.acc.a = { w: 'w_acc1', e: 'a', x: 0, y: 0 };

  wAnchor.b = { x: 40, y: 25 };
  const moved = syncAccWalls(f);

  assert.strictEqual(moved, true);
  assert.deepStrictEqual(wAcc1.a, { x: 40, y: 25 });
  assert.deepStrictEqual(wAcc2.a, { x: 40, y: 25 }, 'chained accordion wall must follow in one syncAccWalls call');
  assert.deepStrictEqual(wAcc2.acc.a, { w: 'w_acc1', e: 'a', x: 40, y: 25 });
});

test('(6) cleanAcc drops bad links, keeps good ones, leaves walls without acc untouched', () => {
  const plain = { id: 'w0', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } };
  cleanAcc(plain);
  assert.strictEqual('acc' in plain, false, 'wall without acc must remain untouched');

  const withNull = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, acc: null };
  cleanAcc(withNull);
  assert.strictEqual(withNull.acc, null);

  const nonObj = { id: 'w2', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, acc: 'bad' };
  cleanAcc(nonObj);
  assert.deepStrictEqual(nonObj.acc, { a: null, b: null });

  const mixed = {
    id: 'w3',
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
    acc: {
      a: { w: 'w1', e: 'b', x: '10', y: 20 },
      b: { w: 'w2', e: 'c', x: 0, y: 0 }, // invalid end 'c'
    },
  };
  cleanAcc(mixed);
  assert.deepStrictEqual(mixed.acc, {
    a: { w: 'w1', e: 'b', x: 10, y: 20 },
    b: null,
  });

  const badCoords = {
    id: 'w4',
    a: { x: 0, y: 0 },
    b: { x: 100, y: 0 },
    acc: {
      a: { w: 123, e: 'a', x: 0, y: 0 }, // non-string w
      b: { w: 'w1', e: 'a', x: NaN, y: 5 }, // NaN coordinate
    },
  };
  cleanAcc(badCoords);
  assert.deepStrictEqual(badCoords.acc, { a: null, b: null });
});

test('(7) commit syncs accordion walls before the active layout captures its poses', () => {
  // the browser smoke check "accordion wall: …" drives render(), visFloor(), the panel and applyProp for real
  assert.match(fnSrc('commit'), /syncAccWalls\(fl, true\)[\s\S]*?syncActiveVars\(\)/);
});
