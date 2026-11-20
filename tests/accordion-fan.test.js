/* Accordion wall fill choice: acc.fill absent = straight wall (old behaviour), 'fan' = a pleated leaf that sweeps around the
   corner where the two attached walls meet, like an opened hand fan. Runs the real functions cut out of app.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n');
const line = start => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf('\n', i)); };

// eslint-disable-next-line no-new-func
const H = new Function(`
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wLen = w => dist(w.a, w.b);
  ${line('const BEL_PITCH')}
  ${fnSrcOf(src, 'belFolds')}
  ${fnSrcOf(src, 'belZigzag')}
  ${line('const ACC_FAN_T')}
  ${line('const accFanDepth')}
  ${line('const isAccFan')}
  ${fnSrcOf(src, 'accFanCenter')}
  ${fnSrcOf(src, 'accFan')}
  ${fnSrcOf(src, 'accFanOutline')}
  ${fnSrcOf(src, 'cleanAcc')}
  return { accFan, accFanCenter, accFanOutline, accFanDepth, cleanAcc, dist };
`)();

// two walls hinged at the origin, the second turned to 120°; the accordion joins their far ends
const hinge = (deg = 120) => {
  const r = deg * Math.PI / 180, w1 = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20 }, w2 = { id: 'w2', a: { x: 0, y: 0 }, b: { x: Math.round(400 * Math.cos(r) * 1e6) / 1e6, y: Math.round(400 * Math.sin(r) * 1e6) / 1e6 }, t: 20 };
  const acc = { id: 'ac', a: { ...w1.b }, b: { ...w2.b }, t: 20, acc: { a: { w: 'w1', e: 'b', ...w1.b }, b: { w: 'w2', e: 'b', ...w2.b }, fill: 'fan' } };
  return { f: { walls: [w1, w2, acc] }, acc };
};

test('without fill: fan the accordion stays a straight wall (old projects unchanged)', () => {
  const { f, acc } = hinge(); delete acc.acc.fill;
  assert.strictEqual(H.accFan(f, acc), null);
  assert.strictEqual(H.accFan(f, { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }), null, 'not an accordion');
});

test('the fan sweeps around the hinge corner from end to end, inside the wedge', () => {
  const { f, acc } = hinge(120), fan = H.accFan(f, acc), dep = H.accFanDepth(acc);
  assert.deepStrictEqual({ x: Math.round(fan.c.x), y: Math.round(fan.c.y) }, { x: 0, y: 0 });
  assert.deepStrictEqual(fan.pts[0], acc.a); assert.ok(H.dist(fan.pts[fan.pts.length - 1], acc.b) < 1e-6);
  for (const q of fan.pts) {
    assert.ok(Math.abs(Math.hypot(q.x, q.y) - 400) <= dep / 2 + 1e-6, 'every pleat stays on the 4 m arc ± half the pleat depth');
    const a = Math.atan2(q.y, q.x) * 180 / Math.PI; assert.ok(a > -1e-6 && a < 120 + 1e-6, 'between the two walls: ' + a);
  }
  assert.strictEqual((fan.pts.length - 1) % 2, 0, 'even number of pleats');
  assert.strictEqual(fan.folds.length, fan.pts.length - 2);
});

test('a wider opening gets more pleats; the leaf outline is closed and thin', () => {
  const n60 = H.accFan(...Object.values(hinge(60))).pts.length, n150 = H.accFan(...Object.values(hinge(150))).pts.length;
  assert.ok(n150 > n60, `${n150} > ${n60}`);
  const pts = H.accFan(...Object.values(hinge(90))).pts, o = H.accFanOutline(pts);
  assert.strictEqual(o.length, pts.length * 2);
  assert.ok(Math.abs(H.dist(o[0], o[o.length - 1]) - 3) < 1e-6, 'leaf thickness 3 cm at the end');
});

test('no usable corner (parallel walls, missing link, corner on an end) → pleats along the straight gap', () => {
  const w1 = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 } }, w2 = { id: 'w2', a: { x: 0, y: 300 }, b: { x: 400, y: 300 } };
  const acc = { id: 'ac', a: { x: 400, y: 0 }, b: { x: 400, y: 300 }, t: 20, acc: { a: { w: 'w1', e: 'b', x: 400, y: 0 }, b: { w: 'w2', e: 'b', x: 400, y: 300 }, fill: 'fan' } };
  const fan = H.accFan({ walls: [w1, w2, acc] }, acc);
  assert.strictEqual(fan.c, null);
  for (const q of fan.pts) assert.ok(Math.abs(q.x - 400) <= H.accFanDepth(acc) / 2 + 1e-6);
  acc.acc.b = null; assert.strictEqual(H.accFanCenter({ walls: [w1, w2, acc] }, acc), null);
  const { f, acc: a2 } = hinge(); a2.a = { x: 0, y: 0 }; assert.strictEqual(H.accFanCenter(f, a2), null, 'corner on the accordion end');
});

test('cleanAcc keeps a valid fill and drops anything else', () => {
  const w = { acc: { a: null, b: { w: 'x', e: 'a', x: 1, y: 2 }, fill: 'fan' } }; H.cleanAcc(w);
  assert.strictEqual(w.acc.fill, 'fan');
  const z = { acc: { a: null, b: null, fill: 'spiral' } }; H.cleanAcc(z); assert.ok(!('fill' in z.acc));
});

test('wiring: panel choice, 2D / 3D drawing, no corner fillers or openings on a fan', () => {
  assert.match(src, /fld\(L\('Boşluğu doldur', 'Fill the gap'\), 'wall', 'accFill'/);
  assert.match(src, /p === 'accFill'\) \{ if \(o\.acc\) \{ if \(v === 'fan'\) o\.acc\.fill = 'fan'; else delete o\.acc\.fill; \} \}/);
  assert.match(fnSrcOf(src, 'wallSvg'), /const fan = f && accFan\(f, w\); if \(fan\) return accFanSvg\(w, fan, live\);/);
  assert.match(fnSrcOf(src, 'build3D'), /const fan = accFan\(f, w\); if \(fan\) \{ accFan3D\(/);
  assert.match(fnSrcOf(src, 'wallJoints'), /isAccFan\(w\)\) continue/);
  assert.match(fnSrcOf(src, 'visFloor'), /filter\(w => !isAccFan\(w\)\)/);
});
