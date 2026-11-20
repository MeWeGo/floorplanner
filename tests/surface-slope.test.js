/* Sloped surfaces: rooms and free slabs carry height points hp = [{ x, y, z }]; the surface is the triangle mesh (TIN)
   through the polygon corners (±0 unless a point sits on them) and the points. Runs the real SURF-SLOPE block. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, markerBlock } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n');
const block = markerBlock(src, 'SURF-SLOPE');
// eslint-disable-next-line no-new-func
const E = new Function(`${block}; return { SURF_Z_MAX, SURF_HP_MAX, surfSloped, cleanSurfHp, surfTin, surfTinOf, surfZAt, surfTriSlope, surfMaxSlope };`)();

const sq = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }];
const L = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 500 }, { x: 0, y: 500 }];
const area = (V, T) => T.reduce((s, t) => { const [a, b, c] = t.map(i => V[i]); return s + ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2; }, 0);
const pip = (p, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i].y > p.y) !== (P[j].y > p.y) && p.x < (P[j].x - P[i].x) * (p.y - P[i].y) / (P[j].y - P[i].y) + P[i].x) c = !c; return c; };

test('the block is pure: no DOM, no THREE, no app globals', () => {
  assert.doesNotMatch(block, /document\.|THREE\.|\bP\.floors|\bF\(\)/);
});

test('a surface without points (or with only ±0 points) is flat', () => {
  assert.strictEqual(E.surfSloped({ pts: sq }), false);
  assert.strictEqual(E.surfSloped({ pts: sq, hp: [{ x: 10, y: 10, z: 0 }] }), false);
  assert.strictEqual(E.surfZAt({ pts: sq }, 200, 200), 0);
  assert.strictEqual(E.surfMaxSlope({ pts: sq }), 0);
});

test('a drain point in the middle dips the surface; corners stay at ±0', () => {
  const o = { pts: sq, hp: [{ x: 200, y: 200, z: -10 }] }; // exactly on the square's diagonal: both triangles split
  const tin = E.surfTin(o.pts, o.hp);
  assert.strictEqual(tin.t.length, 4);
  assert.strictEqual(E.surfZAt(o, 200, 200), -10);
  assert.strictEqual(E.surfZAt(o, 100, 200), -5);
  assert.strictEqual(E.surfZAt(o, 0, 0), 0);
  assert.strictEqual(Math.round(E.surfMaxSlope(o) * 100) / 100, 5); // 10 cm over 200 cm
});

test('points on two corners tilt the whole surface as one plane', () => {
  const o = { pts: sq, hp: [{ x: 400, y: 0, z: 40 }, { x: 400, y: 400, z: 40 }] };
  for (const [x, y] of [[0, 0], [100, 300], [200, 100], [300, 250], [400, 200]]) assert.strictEqual(E.surfZAt(o, x, y), x / 10, `${x},${y}`);
  assert.strictEqual(E.surfMaxSlope(o), 10);
});

test('a point on an edge is inserted into the boundary; the triangulation keeps the exact area of a concave room', () => {
  const o = { pts: L, hp: [{ x: 300, y: 0, z: 20 }, { x: 100, y: 300, z: 5 }, { x: 100, y: 100, z: 8 }] };
  const tin = E.surfTin(o.pts, o.hp);
  assert.strictEqual(tin.nb, 7, 'six corners + the edge point');
  assert.strictEqual(Math.abs(area(tin.v, tin.t)), 600 * 200 + 200 * 300);
  for (const t of tin.t) { const [a, b, c] = t.map(i => tin.v[i]); assert.ok(pip({ x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 }, L), 'every triangle lies inside the L'); }
  assert.strictEqual(E.surfZAt(o, 300, 0), 20);
  assert.strictEqual(E.surfZAt(o, 100, 100), 8);
});

test('winding of the polygon does not matter', () => {
  const hp = [{ x: 400, y: 0, z: 30 }, { x: 150, y: 250, z: -12 }];
  const a = { pts: sq, hp }, b = { pts: sq.slice().reverse(), hp };
  for (const [x, y] of [[50, 50], [300, 100], [150, 250], [390, 390]]) assert.strictEqual(E.surfZAt(a, x, y), E.surfZAt(b, x, y));
});

test('cleanSurfHp rounds, clamps, caps and drops invalid points; an empty list is removed', () => {
  const o = { hp: [{ x: 1.234, y: 2, z: 999 }, { x: 'a', y: 1 }, null, { x: 0, y: 0, z: -3.33 }] };
  E.cleanSurfHp(o);
  assert.deepStrictEqual(o.hp, [{ x: 1.2, y: 2, z: E.SURF_Z_MAX }, { x: 0, y: 0, z: -3.3 }]);
  const many = { hp: Array.from({ length: 100 }, (_, i) => ({ x: i, y: 0, z: 1 })) }; E.cleanSurfHp(many);
  assert.strictEqual(many.hp.length, E.SURF_HP_MAX);
  const none = { hp: [] }; E.cleanSurfHp(none); assert.ok(!('hp' in none));
  const old = { pts: sq }; E.cleanSurfHp(old); assert.ok(!('hp' in old), 'old surfaces stay untouched');
});

test('surfTriSlope points downhill', () => {
  const s = E.surfTriSlope({ x: 0, y: 0, z: 10 }, { x: 100, y: 0, z: 0 }, { x: 0, y: 100, z: 10 });
  assert.strictEqual(Math.round(s.pct), 10); assert.strictEqual(Math.round(s.dx), 1); assert.strictEqual(Math.abs(Math.round(s.dy)), 0);
});

test('points travel with the polygon (move, rotate, mirror, scale, nudge, paste, 3D drag, layouts)', () => {
  assert.match(fnSrcOf(src, 'rotateSelection'), /xfHp\(o, g, p => rotatePoint\(p, c, rad\)\)/);
  assert.match(fnSrcOf(src, 'mirrorObjs'), /xfHp\(m, m, R\)/);
  assert.match(fnSrcOf(src, 'scaleObjs'), /xfHp\(mo, g,/);
  assert.match(fnSrcOf(src, 'doMove'), /xfHp\(o, g, p => \(\{ x: p\.x \+ dx, y: p\.y \+ dy \}\)\)/);
  assert.match(src, /\(o\.hp \|\| \[\]\)\.forEach\(p => \{ p\.x \+= dx; p\.y \+= dy; \}\)/, 'arrow-key nudge');
  assert.match(fnSrcOf(src, 'paste'), /xfHp\(n, n, mv\)[\s\S]*xfHp\(n, n, mv\)/);
  assert.match(fnSrcOf(src, 'snapPose'), /hp: o\.hp \?/);
  assert.match(fnSrcOf(src, 'normalizeProject'), /cleanSurfHp\(s\)[\s\S]*cleanSurfHp\(r\)/);
});

test('3D, furniture, walk mode, 2D and panel use the slope', () => {
  const b3 = fnSrcOf(src, 'build3D');
  assert.match(b3, /surfGeo3D\(s, t, voidHoles\(f\.voids, s\.pts\)\)/, 'free slabs');
  assert.match(b3, /surfGeo3D\(r, 0, rHoles\)/, 'room finish');
  assert.match(b3, /surfGeo3D\(r, st, rHoles\)/, 'room slab block');
  assert.match(b3, /\(\+slabs\[i\]\.off \|\| 0\) \+ surfZAt\(slabs\[i\], o\.x, o\.y\)/, 'furniture sits on a sloped slab');
  assert.match(b3, /surfSloped\(r\) && pointInPoly\(o, r\.pts\)\) return surfZAt\(r, o\.x, o\.y\)/, 'furniture sits on a sloped room');
  assert.match(fnSrcOf(src, 'walkGroundAt'), /surfZAt\(s, p\.x, p\.y\)[\s\S]*surfZAt\(r, p\.x, p\.y\)/);
  assert.match(fnSrcOf(src, 'layerStrings'), /\.map\(slopeSvg\)/);
  assert.match(src, /if \(n === 1 && o\.floor !== 'glass'\) h \+= slopePanelHtml\(o\); \/\/ eğimli zemin/);
  assert.match(fnSrcOf(src, 'escTool'), /if \(ui\.hpAdd\)/);
});
