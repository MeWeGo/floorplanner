/* All-axis rotation: parts tilt (rx / ry) in the shared PARTS-ENGINE block, the 3D mapping to Three.js,
   whole-item tilt of furniture, and the panel / studio / MCP wiring. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const appJs = read('app.js').replace(/\r\n/g, '\n');
const serverJs = read('mcp/server.js').replace(/\r\n/g, '\n');
const a = appJs.indexOf('/* PARTS-ENGINE:BEGIN'), b = appJs.indexOf('/* PARTS-ENGINE:END */');
// eslint-disable-next-line no-new-func
const E = new Function(appJs.slice(a, b) + '\nreturn { cleanPart, partIssues, partBounds, partRotM, partCloud, partHull, partTilted, validateParts };')();
const near = (x, y, m) => assert.ok(Math.abs(x - y) < 0.05, (m || '') + ' ' + x + ' ≠ ' + y);

test('cleanPart keeps rx / ry as normalised degrees and drops zero tilts', () => {
  const q = E.cleanPart({ type: 'box', w: 10, d: 20, h: 30, rx: -90, ry: 450 });
  assert.strictEqual(q.rx, 270); assert.strictEqual(q.ry, 90);
  assert.ok(!('rx' in E.cleanPart({ rx: 0, ry: 360 })) && !('ry' in E.cleanPart({ rx: 0, ry: 360 })), 'upright parts stay byte-identical');
  assert.deepStrictEqual(E.partIssues({ type: 'box', w: 1, d: 1, h: 1, rx: 'tilt' }), ['rx must be a number']);
});

test('partRotM: identity, single axes and R = Rz · Ry · Rx', () => {
  const I = E.partRotM(0, 0, 0);
  I.forEach((r, i) => r.forEach((v, j) => near(v, i === j ? 1 : 0)));
  const ap = (M, v) => M.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
  // rx 90: the part's up (z) axis goes to −y (it falls toward the back of the plan)
  ap(E.partRotM(90, 0, 0), [0, 0, 1]).forEach((v, i) => near(v, [0, -1, 0][i], 'rx'));
  // ry 90: up goes to +x
  ap(E.partRotM(0, 90, 0), [0, 0, 1]).forEach((v, i) => near(v, [1, 0, 0][i], 'ry'));
  // rot 90 = clockwise on the plan (x → +y, y-down), same as furniture rot
  ap(E.partRotM(0, 0, 90), [1, 0, 0]).forEach((v, i) => near(v, [0, 1, 0][i], 'rot'));
  // composition order: first rx, then ry, then rot
  const v = [0.3, -0.7, 0.5], M = E.partRotM(30, 45, 60);
  const step = ap(E.partRotM(0, 0, 60), ap(E.partRotM(0, 45, 0), ap(E.partRotM(30, 0, 0), v)));
  ap(M, v).forEach((x, i) => near(x, step[i], 'order'));
});

test('the Three.js YZX Euler with negated angles equals the plan matrix (plan y ↔ Three z)', () => {
  // Three: Euler order 'YZX' → matrix = Ry(y) · Rz(z) · Rx(x); parts3D sets (x, y, z) = (−rx, −rot, −ry)
  const mul = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const Rx = t => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
  const Ry = t => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]];
  const Rz = t => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
  for (const [rx, ry, rot] of [[90, 0, 0], [0, 90, 0], [30, 45, 60], [200, -15, 310]]) {
    const r = Math.PI / 180, T = mul(mul(Ry(-rot * r), Rz(-ry * r)), Rx(-rx * r));
    const P = E.partRotM(rx, ry, rot), s = [0, 2, 1]; // plan (x, y, z) = Three (X, Z, Y)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) near(T[i][j], P[s[i]][s[j]], `[${i}][${j}] for ${rx}/${ry}/${rot}`);
  }
  assert.match(appJs, /mesh\.rotation\.set\(-\(p\.rx \|\| 0\) \* r, -\(p\.rot \|\| 0\) \* r, -\(p\.ry \|\| 0\) \* r, 'YZX'\)/);
  assert.match(appJs, /t\.rotation\.set\(-\(o\.rx \|\| 0\) \* r, 0, -\(o\.ry \|\| 0\) \* r, 'ZYX'\)/, 'item tilt uses the same mapping');
});

test('partBounds: a tilted box turns about its centre; upright parts are unchanged', () => {
  const box = E.cleanPart({ type: 'box', x: 0, y: 0, z: 0, w: 20, d: 10, h: 40 });
  assert.deepStrictEqual(E.partBounds(box), { x0: -10, x1: 10, y0: -5, y1: 5, z0: 0, z1: 40 });
  const b = E.partBounds(Object.assign({}, box, { rx: 90 })); // the 40 cm height now lies along y, centre stays at z 20
  near(b.x0, -10); near(b.x1, 10); near(b.y0, -20); near(b.y1, 20); near(b.z0, 15); near(b.z1, 25);
  const s = E.partBounds(E.cleanPart({ type: 'sphere', w: 10, d: 10, h: 40, ry: 90 }));
  near(s.x0, -20); near(s.x1, 20); near(s.z0, 15); near(s.z1, 25);
  const c = E.partBounds(E.cleanPart({ type: 'cyl', w: 10, d: 10, h: 60, ry: 90 })); // upright cylinder laid along x
  near(c.x0, -30, 'cyl'); near(c.x1, 30, 'cyl'); assert.ok(c.z1 - c.z0 > 9.8 && c.z1 - c.z0 <= 10.01);
  // validation sees the tilted size: a 40 cm-tall part tipped over sticks out of a 30 cm-deep box
  assert.ok(E.partIssues({ type: 'box', z: 0, w: 20, d: 10, h: 40, rx: 90 }, { w: 30, d: 30, h: 50 }).some(m => /sticks out/.test(m)));
});

test('partHull returns the convex outline', () => {
  const h = E.partHull([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5], [5, 0]]);
  assert.strictEqual(h.length, 4);
  assert.ok(E.partTilted({ rx: 15 }) && !E.partTilted({ rot: 15 }) && !E.partTilted(null));
});

test('app wiring: 2D / studio / panel / mirror / presets / 3D item tilt', () => {
  assert.match(appJs, /function partShapeSvg[\s\S]{0,80}partTilted\(p\)/, 'tilted parts draw their projected hull in 2D');
  assert.match(appJs, /data-pf="\$\{k\}"/); assert.match(appJs, /'rx', p\.rx/); assert.match(appJs, /'ry', p\.ry/);
  assert.match(appJs, /data-pbact="rx90"/); assert.match(appJs, /act === 'upright'/);
  assert.match(appJs, /'furn', 'rx', \+o\.rx/); assert.match(appJs, /data-act="tiltx"/);
  assert.match(appJs, /k === 'furn' && \(p === 'rx' \|\| p === 'ry'\)/, 'applyProp normalises item tilt');
  assert.match(appJs, /PRESET_FURN_EXTRA = \[[^\]]*'rx', 'ry'\]/);
  assert.match(appJs, /if \(m\.ry\) m\.ry = \(360 - m\.ry\) % 360/, 'mirror flips the sideways tilt');
  assert.match(appJs, /if \(furnTilted\(o\)\) ig = furnTiltGroup\(ig, o\)/);
  assert.match(appJs, /NO_TILT_K = new Set\(\['stairs', 'ramp', 'roof'\]\)/);
});

test('MCP: part fields and set_transform accept rx / ry', () => {
  assert.match(serverJs, /const PART_KEYS = \[[^\]]*'rx', 'ry'/);
  assert.match(serverJs, /rx: \{ type: 'number', description: 'Tilt in degrees about the part x axis/);
  assert.match(serverJs, /for \(const k of \['rx', 'ry'\]\) if \(a\[k\] !== undefined\)/);
});
