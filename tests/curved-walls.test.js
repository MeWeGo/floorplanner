/* Curved walls (#202): optional w.bulge (cm) on walls, arc math, expandCurved,
   source wiring (visFloor / mirrorObjs), and MCP add_wall / update_object. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, markerBlock, fnSrcOf, mcpClient } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n');

// eslint-disable-next-line no-new-func
const CW = new Function(`
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pal = () => ({ sub: '#64748b', halo: '#ffffff' });
  const view = { z: 1 };
  const fmtLen = v => String(v);
  const wallTag = () => '';
  ${markerBlock(src, 'CURVED-WALL')}
  return { BULGE_MIN, isCurved, wallArc, arcAt, arcProject, wallLen, arcPts, expandCurved, curvedDimSvg, setBulge, cleanBulge };
`)();

const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ? msg + ': ' : ''}expected ${a} ≈ ${b} (±${eps})`);
const nearPt = (p, q, eps = 1e-6, msg) => {
  near(p.x, q.x, eps, `${msg || 'pt'}.x`);
  near(p.y, q.y, eps, `${msg || 'pt'}.y`);
};

test('straight wall when bulge is absent or < 0.5', () => {
  const base = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20, h: 270 };
  for (const bulge of [undefined, null, 0, 0.49, -0.49]) {
    const w = bulge === undefined ? { ...base } : { ...base, bulge };
    assert.strictEqual(CW.isCurved(w), false, `bulge=${bulge}`);
    assert.strictEqual(CW.wallArc(w), null, `wallArc for bulge=${bulge}`);
    assert.strictEqual(CW.wallLen(w), 400, `wallLen for bulge=${bulge}`);
  }
  assert.strictEqual(CW.isCurved({ ...base, bulge: 0.5 }), true);
  assert.strictEqual(CW.isCurved({ ...base, bulge: -0.5 }), true);
});

test('wallArc geometry: half circle (bulge 200) and sagitta radius (bulge 100) on 400 cm wall', () => {
  const half = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, bulge: 200 };
  const A1 = CW.wallArc(half);
  assert.ok(A1);
  near(A1.r, 200, 1e-6, 'half circle radius');
  near(A1.len, Math.PI * 200, 1e-6, 'half circle arc length');
  near(CW.wallLen(half), Math.PI * 200, 1e-6, 'wallLen');

  const w100 = { id: 'w2', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, bulge: 100 };
  const A2 = CW.wallArc(w100);
  assert.ok(A2);
  near(A2.r, (200 * 200 + 100 * 100) / (2 * 100), 1e-6, 'sagitta radius');
});

test('arcAt endpoints, apex, and arcProject at apex for positive and negative bulge', () => {
  for (const bulge of [100, -100]) {
    const w = { id: 'w1', a: { x: 100, y: 200 }, b: { x: 500, y: 200 }, bulge };
    const A = CW.wallArc(w);
    const L = 400, ux = 1, uy = 0, nx = -uy, ny = ux;
    const expectedApex = { x: 300 + nx * bulge, y: 200 + ny * bulge };

    nearPt(CW.arcAt(A, 0), w.a, 1e-6, `arcAt(0) bulge=${bulge}`);
    nearPt(CW.arcAt(A, A.len), w.b, 1e-6, `arcAt(len) bulge=${bulge}`);
    const apex = CW.arcAt(A, A.len / 2);
    nearPt(apex, expectedApex, 1e-6, `arcAt(len/2) bulge=${bulge}`);

    const proj = CW.arcProject(A, expectedApex);
    near(proj.t, 0.5, 1e-6, `arcProject.t bulge=${bulge}`);
    near(proj.dist, 0, 1e-6, `arcProject.dist bulge=${bulge}`);
  }
});

test('setBulge clamps to half the chord, rounds to 0.1, and deletes tiny values; cleanBulge deletes non-numbers', () => {
  const mk = () => ({ id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 } });

  let w = mk();
  CW.setBulge(w, 999);
  assert.strictEqual(w.bulge, 200);
  CW.setBulge(w, -999);
  assert.strictEqual(w.bulge, -200);

  CW.setBulge(w, 12.34);
  assert.strictEqual(w.bulge, 12.3);
  CW.setBulge(w, -12.36);
  assert.strictEqual(w.bulge, -12.4);

  for (const tiny of [0, 0.4, -0.4, 0.44, -0.44]) {
    w = mk();
    w.bulge = 50;
    CW.setBulge(w, tiny);
    assert.strictEqual('bulge' in w, false, `tiny=${tiny} should delete bulge`);
  }

  for (const bad of ['abc', NaN, Infinity, -Infinity, {}]) {
    w = mk();
    w.bulge = bad;
    CW.cleanBulge(w);
    assert.strictEqual('bulge' in w, false, `bad=${String(bad)} should delete bulge`);
  }
  w = mk();
  w.bulge = '12.34';
  CW.cleanBulge(w);
  assert.strictEqual(w.bulge, 12.3);
});

test('expandCurved: straight floor untouched, curved wall split into chained pieces with openings placed accurately', () => {
  const straightFloor = {
    id: 'f0',
    walls: [{ id: 's1', a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, t: 20, h: 270 }],
    ops: [{ id: 'op0', wall: 's1', d: 150, w: 90, h: 210, sill: 0, type: 'door' }],
  };
  assert.strictEqual(CW.expandCurved(straightFloor), straightFloor);

  const cw = { id: 'cw1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20, h: 270, bulge: 100 };
  const sw = { id: 'sw1', a: { x: 0, y: 300 }, b: { x: 400, y: 300 }, t: 20, h: 270 };
  const A = CW.wallArc(cw);
  const opCurved = { id: 'op1', wall: 'cw1', d: A.len * 0.4, w: 40, h: 210, sill: 0, type: 'door' };
  const opStraight = { id: 'op2', wall: 'sw1', d: 200, w: 100, h: 120, sill: 90, type: 'window' };

  const f = { id: 'f1', walls: [cw, sw], ops: [opCurved, opStraight] };
  const g = CW.expandCurved(f);
  assert.notStrictEqual(g, f);

  const pieces = g.walls.filter(w => w.pid === 'cw1');
  assert.ok(pieces.length >= 4, 'curved wall split into multiple pieces');
  for (let k = 0; k < pieces.length; k++) {
    assert.strictEqual(pieces[k].id, `cw1~${k}`);
    assert.strictEqual(pieces[k].pid, 'cw1');
    assert.strictEqual('bulge' in pieces[k], false);
  }

  nearPt(pieces[0].a, cw.a, 1e-6, 'first piece starts at a');
  nearPt(pieces[pieces.length - 1].b, cw.b, 1e-6, 'last piece ends at b');
  for (let k = 0; k + 1 < pieces.length; k++) {
    nearPt(pieces[k].b, pieces[k + 1].a, 1e-6, `chain ${k}->${k + 1}`);
  }

  const movedOps = g.ops.filter(o => o.id === 'op1');
  assert.strictEqual(movedOps.length, 1, 'opening lands on exactly one piece');
  const host = pieces.find(p => p.id === movedOps[0].wall);
  assert.ok(host, 'opening host is a piece of cw1');
  const hostMid = { x: (host.a.x + host.b.x) / 2, y: (host.a.y + host.b.y) / 2 };
  const expected = CW.arcAt(A, opCurved.d);
  assert.ok(Math.hypot(hostMid.x - expected.x, hostMid.y - expected.y) <= 1, 'host midpoint matches arcAt(A, d) within 1 cm');

  const untouched = g.ops.find(o => o.id === 'op2');
  assert.deepStrictEqual(untouched, opStraight, 'ops on straight walls are untouched');
});

test('source wiring: visFloor calls expandCurved and mirrorObjs negates bulge', () => {
  assert.match(fnSrcOf(src, 'visFloor'), /\bexpandCurved\s*\(/);
  assert.match(fnSrcOf(src, 'mirrorObjs'), /\.bulge\s*=\s*-[^;]*\.bulge/);
});

test('MCP: add_wall preserves/clamps bulge and update_object with bulge: null removes it', async t => {
  const c = mcpClient();
  t.after(() => c.stop());

  await c.call('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'curved-walls-test', version: '1' },
  });

  const np = await c.tool('new_project', { name: 'Curved Test' });
  assert.notStrictEqual(np.err, true);

  const w1Res = await c.tool('add_wall', { x1: 0, y1: 0, x2: 400, y2: 0, bulge: 150 });
  assert.notStrictEqual(w1Res.err, true);
  const w1Id = /Added wall ([a-z0-9]{7})/.exec(w1Res.text)[1];

  const w2Res = await c.tool('add_wall', { x1: 0, y1: 200, x2: 400, y2: 200, bulge: 9999 });
  assert.notStrictEqual(w2Res.err, true);
  const w2Id = /Added wall ([a-z0-9]{7})/.exec(w2Res.text)[1];

  let proj = JSON.parse((await c.tool('get_project', {})).text);
  let w1 = proj.floors[0].walls.find(w => w.id === w1Id);
  let w2 = proj.floors[0].walls.find(w => w.id === w2Id);
  assert.strictEqual(w1.bulge, 150);
  assert.strictEqual(w2.bulge, 200);

  const upd = await c.tool('update_object', { id: w1Id, props: { bulge: null } });
  assert.notStrictEqual(upd.err, true);

  proj = JSON.parse((await c.tool('get_project', {})).text);
  w1 = proj.floors[0].walls.find(w => w.id === w1Id);
  assert.strictEqual('bulge' in w1, false, 'update_object with bulge: null removes bulge');
});

test('expandCurved never loses an opening: slice points keep 1 cm clear of its edges', () => {
  let n = 0;
  for (let bulge = -200; bulge <= 200; bulge += 7) for (let d = 45; d < 700; d += 13) {
    const w = { id: 'w', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20, bulge };
    if (d + 45 > CW.wallLen(w)) continue;
    const g = CW.expandCurved({ walls: [w], ops: [{ id: 'o', wall: 'w', d, w: 90 }] });
    assert.strictEqual(g.ops.length, 1, `bulge ${bulge}, d ${d}: opening lost`);
    const pcs = g.walls; nearPt(pcs[pcs.length - 1].b, w.b, 1e-6, 'ends at b'); n++;
  }
  assert.ok(n > 1000);
});

test('splitArcAt: two halves stay on the same circle and openings move along the arc', () => {
  const E = new Function(`
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const wLen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    let n = 0; const uid = () => 'n' + (++n);
    const mkWall = (a, b) => ({ id: uid(), a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } });
    ${markerBlock(src, 'CURVED-WALL')}
    ${fnSrcOf(src, 'splitArcAt')}
    return { splitArcAt, wallArc };
  `)();
  for (const bulge of [120, -80]) {
    const w = { id: 'w', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20, bulge };
    const A0 = E.wallArc(w), f = { walls: [w], ops: [{ id: 'o', wall: 'w', d: A0.len * 0.75, w: 90 }] };
    const nw = E.splitArcAt(w, 200, f), A1 = E.wallArc(w), A2 = E.wallArc(nw);
    near(A1.r, A0.r, 1, 'first half radius'); near(A2.r, A0.r, 1, 'second half radius'); // bulge is rounded to 0.1 cm
    near(A1.len + A2.len, A0.len, 0.5, 'arc length kept');
    assert.strictEqual(Math.sign(w.bulge), Math.sign(bulge)); assert.strictEqual(Math.sign(nw.bulge), Math.sign(bulge));
    assert.strictEqual(f.ops[0].wall, nw.id); near(f.ops[0].d, A0.len * 0.75 - A1.len, 0.5, 'opening re-based');
  }
  assert.match(fnSrcOf(src, 'splitWallAt'), /isCurved\(w\)\) return splitArcAt/);
});
