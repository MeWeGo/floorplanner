/* Mirror & scale operations (issue #28).
   Cuts real functions (reflectPoint, normDeg, mirrorObjs, scaleObjs, parseScale)
   out of app.js and tests them against geometric invariants, plus wiring checks. */
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
const normDegStart = src.indexOf('const normDeg');
assert.ok(normDegStart >= 0, 'const normDeg is gone from app.js');
const normDegSrc = src.slice(normDegStart, src.indexOf('\n', normDegStart)).trim();

function env(initialFloor = { walls: [], ops: [] }) {
  const f = initialFloor;
  const api = new Function('f', `
    const PTS_KINDS = new Set(['room', 'sketch', 'slab', 'void']);
    const AB_KINDS = new Set(['wall', 'dim', 'section']);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const wLen = w => dist(w.a, w.b);
    const F = () => f;
    ${fnSrc('reflectPoint')}
    ${normDegSrc}
    ${fnSrc('mirrorObjs')}
    ${fnSrc('scaleObjs')}
    ${fnSrc('parseScale')}
    return { reflectPoint, normDeg, mirrorObjs, scaleObjs, parseScale, wLen };
  `)(f);
  return { f, ...api };
}

test('(1) flipping horizontally maps wall a/b x to 2c-x, keeps y, and negates side of opening keeping d', () => {
  const c = { x: 250, y: 150 };
  const u = { x: 0, y: 1 };
  const wall = { id: 'w1', a: { x: 100, y: 50 }, b: { x: 200, y: 180 } };
  const op = { id: 'op1', wall: 'w1', d: 75, side: 1 };
  const { mirrorObjs } = env({ walls: [wall], ops: [op] });

  mirrorObjs([{ kind: 'wall', o: wall }], c, u);

  assert.strictEqual(wall.a.x, 2 * c.x - 100);
  assert.strictEqual(wall.a.y, 50);
  assert.strictEqual(wall.b.x, 2 * c.x - 200);
  assert.strictEqual(wall.b.y, 180);
  assert.strictEqual(op.side, -1);
  assert.strictEqual(op.d, 75);
});

test('(2) a dim gets off negated', () => {
  const c = { x: 200, y: 100 };
  const u = { x: 0, y: 1 };
  const dim = { id: 'd1', a: { x: 50, y: 50 }, b: { x: 150, y: 50 }, off: 30 };
  const { mirrorObjs } = env();

  mirrorObjs([{ kind: 'dim', o: dim }], c, u);

  assert.strictEqual(dim.off, -30);
  assert.strictEqual(dim.a.x, 2 * c.x - 50);
  assert.strictEqual(dim.b.x, 2 * c.x - 150);
});

test('(3) a room polygon is reflected and its vertex order reversed so polyArea sign is preserved', () => {
  const shoelaceSign = pts => Math.sign(pts.reduce((acc, p, i) => {
    const q = pts[(i + 1) % pts.length];
    return acc + (p.x * q.y - q.x * p.y);
  }, 0));

  const pts = [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 110 }];
  const origSign = shoelaceSign(pts);
  assert.notStrictEqual(origSign, 0);

  const room = { id: 'r1', pts: pts.map(p => ({ ...p })) };
  const c = { x: 150, y: 100 };
  const u = { x: 0, y: 1 };
  const { mirrorObjs } = env();

  mirrorObjs([{ kind: 'room', o: room }], c, u);

  assert.strictEqual(shoelaceSign(room.pts), origSign);
});

test('(4) furniture rot: a sofa at rot 0 against the top wall flipped vertically gets rot 180, flipped horizontally keeps rot 0', () => {
  const c = { x: 200, y: 200 };
  const { mirrorObjs } = env();

  const sofaV = { id: 's1', x: 200, y: 50, rot: 0 };
  mirrorObjs([{ kind: 'furn', o: sofaV }], c, { x: 1, y: 0 });
  assert.strictEqual(sofaV.rot, 180);

  const sofaH = { id: 's2', x: 200, y: 50, rot: 0 };
  mirrorObjs([{ kind: 'furn', o: sofaH }], c, { x: 0, y: 1 });
  assert.strictEqual(sofaH.rot, 0);
});

test('(5) mirroring twice across the same arbitrary diagonal axis returns walls, furniture x/y/rot, and a hinged wall angles array to the original within 0.05', () => {
  const theta = 0.65;
  const c = { x: 173.2, y: 289.4 };
  const u = { x: Math.cos(theta), y: Math.sin(theta) };

  const origWall = { id: 'w1', a: { x: 120, y: 80 }, b: { x: 310, y: 240 }, angles: [30, 75, 140] };
  const origFurn = { id: 'f1', x: 150, y: 220, rot: 35 };

  const wall = JSON.parse(JSON.stringify(origWall));
  const furn = JSON.parse(JSON.stringify(origFurn));
  const os = [{ kind: 'wall', o: wall }, { kind: 'furn', o: furn }];
  const { mirrorObjs } = env();

  mirrorObjs(os, c, u);
  mirrorObjs(os, c, u);

  assert.ok(Math.abs(wall.a.x - origWall.a.x) < 0.05, `wall.a.x diff: ${wall.a.x} vs ${origWall.a.x}`);
  assert.ok(Math.abs(wall.a.y - origWall.a.y) < 0.05, `wall.a.y diff: ${wall.a.y} vs ${origWall.a.y}`);
  assert.ok(Math.abs(wall.b.x - origWall.b.x) < 0.05, `wall.b.x diff: ${wall.b.x} vs ${origWall.b.x}`);
  assert.ok(Math.abs(wall.b.y - origWall.b.y) < 0.05, `wall.b.y diff: ${wall.b.y} vs ${origWall.b.y}`);
  for (let i = 0; i < origWall.angles.length; i++) {
    assert.ok(Math.abs(wall.angles[i] - origWall.angles[i]) < 0.05, `angles[${i}] diff: ${wall.angles[i]} vs ${origWall.angles[i]}`);
  }

  assert.ok(Math.abs(furn.x - origFurn.x) < 0.05, `furn.x diff: ${furn.x} vs ${origFurn.x}`);
  assert.ok(Math.abs(furn.y - origFurn.y) < 0.05, `furn.y diff: ${furn.y} vs ${origFurn.y}`);
  assert.ok(Math.abs(furn.rot - origFurn.rot) < 0.05, `furn.rot diff: ${furn.rot} vs ${origFurn.rot}`);
});

test('(6) text stays readable: rot 0 flipped horizontally stays 0', () => {
  const text = { id: 't1', x: 100, y: 100, rot: 0, text: 'Salon' };
  const c = { x: 200, y: 100 };
  const u = { x: 0, y: 1 };
  const { mirrorObjs } = env();

  mirrorObjs([{ kind: 'text', o: text }], c, u);
  assert.strictEqual(text.rot, 0);
});

test('(7) scaleObjs with factor 2 about a centre doubles wall length, keeps wall t when scaleT false, doubles it when true, and doubles opening d', () => {
  const c = { x: 200, y: 100 };
  const sc = 2;
  const tx = x => c.x + (x - c.x) * sc, ty = y => c.y + (y - c.y) * sc;

  // scaleT = false
  {
    const wall = { id: 'w1', a: { x: 100, y: 100 }, b: { x: 300, y: 100 }, t: 20 };
    const op = { id: 'o1', wall: 'w1', d: 50, w: 40 };
    const f = { walls: [wall], ops: [op] };
    const { scaleObjs, wLen } = env(f);
    const snap = new Map([['w1', JSON.parse(JSON.stringify(wall))], ['o1', JSON.parse(JSON.stringify(op))]]);

    scaleObjs([{ kind: 'wall', o: wall }], id => snap.get(id), tx, ty, sc, sc, false);

    assert.strictEqual(wLen(wall), 400);
    assert.strictEqual(wall.t, 20);
    assert.strictEqual(op.d, 100);
  }

  // scaleT = true
  {
    const wall = { id: 'w1', a: { x: 100, y: 100 }, b: { x: 300, y: 100 }, t: 20 };
    const op = { id: 'o1', wall: 'w1', d: 50, w: 40 };
    const f = { walls: [wall], ops: [op] };
    const { scaleObjs, wLen } = env(f);
    const snap = new Map([['w1', JSON.parse(JSON.stringify(wall))], ['o1', JSON.parse(JSON.stringify(op))]]);

    scaleObjs([{ kind: 'wall', o: wall }], id => snap.get(id), tx, ty, sc, sc, true);

    assert.strictEqual(wLen(wall), 400);
    assert.strictEqual(wall.t, 40);
    assert.strictEqual(op.d, 100);
  }
});

test('(8) parseScale parses factors, percentages, target widths, ratios, and commas', () => {
  const { parseScale } = env();
  assert.strictEqual(parseScale('1.5'), 1.5);
  assert.strictEqual(parseScale('150%'), 1.5);
  assert.strictEqual(parseScale('=450', 300), 1.5);
  assert.strictEqual(parseScale('300:450'), 1.5);
  assert.strictEqual(parseScale('1,5'), 1.5);
});

test('(9) wiring checks with assert.match on app.js source', () => {
  assert.match(src, /\['mirror',\s*'🪞',\s*'Aynala',\s*'I',\s*'Mirror'\]/);
  assert.match(src, /e\.shiftKey\s*&&\s*\(k === 'h' \|\| k === 'v'\)[^}]*flipSel\(k\)/);
  assert.match(src, /data-act="flipH"/);
  assert.match(src, /data-act="flipV"/);
  assert.match(src, /data-act="mirror"/);
  assert.match(src, /data-act="scale"/);
  assert.match(src.slice(src.indexOf('function openCtxMenu')), /data-cmxf/);
  assert.match(src, /scaleObjs\(selObjs\(\)/);
});
