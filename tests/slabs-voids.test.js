/* Free slabs (issue #22) and floor voids (issue #23).
   A slab is a wall-less floor plate (balcony, terrace) that 3D extrudes to a
   real thickness; a void is a stairwell / shaft / atrium that 3D cuts out of
   the floor slab (and room floors) with Shape.holes. voidHoles() decides which
   voids become holes in which polygon — it runs here for real, cut out of
   app.js; the rest are wiring checks on the source. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js');
const fnSrc = name => fnSrcOf(src, name);
const pip = src.slice(src.indexOf('function pointInPoly('), src.indexOf('\n', src.indexOf('function pointInPoly(')));
const { voidHoles, pointInPoly } = new Function(`
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  ${fnSrc('segProj')}
  ${fnSrc('polyCentroid')}
  ${pip}
  ${fnSrc('polyInPoly')}
  ${fnSrc('voidHoles')}
  return { voidHoles, pointInPoly };`)();

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const room = rect(0, 0, 600, 400);

test('a void inside a slab becomes one hole, strictly inside it', () => {
  const h = voidHoles([{ pts: rect(100, 100, 250, 300) }], room);
  assert.strictEqual(h.length, 1);
  assert.ok(h[0].every(q => pointInPoly(q, room)), JSON.stringify(h[0]));
  // inset by at most half a centimetre — the hole keeps its real size
  assert.ok(Math.abs(h[0][0].x - 100) <= 0.5 && Math.abs(h[0][0].y - 100) <= 0.5);
});

test('a stairwell snapped into the room corner still cuts a hole', () => {
  // corners snap to room corners, so the void shares two edges with the room
  const h = voidHoles([{ pts: rect(0, 0, 200, 150) }], room);
  assert.strictEqual(h.length, 1, 'an edge-touching void was dropped — stairs would hit a closed ceiling');
  assert.ok(h[0].every(q => pointInPoly(q, room)), 'the hole must be pulled off the outer boundary (earcut)');
});

test('voids outside or straddling the polygon are left alone', () => {
  assert.strictEqual(voidHoles([{ pts: rect(700, 0, 800, 100) }], room).length, 0);
  assert.strictEqual(voidHoles([{ pts: rect(500, 300, 700, 500) }], room).length, 0);
  assert.strictEqual(voidHoles([{ pts: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }, { pts: null }], room).length, 0);
  assert.deepStrictEqual(voidHoles(undefined, room), []);
});

test('a slab or room drawn inside a void fills it and is not cut by it', () => {
  const v = [{ pts: rect(100, 100, 250, 300) }];
  assert.strictEqual(voidHoles(v, rect(100, 100, 250, 300)).length, 0, 'same outline');
  assert.strictEqual(voidHoles(v, rect(120, 120, 200, 250)).length, 0, 'smaller, inside');
  assert.strictEqual(voidHoles(v, room).length, 1, 'the surrounding slab is still cut');
});

test('the data model carries slabs and voids, with defaults for old saves', () => {
  assert.match(src, /const newFloor = [^\n]*slabs: \[\], voids: \[\]/, 'newFloor() has no slabs/voids arrays');
  assert.match(src, /const KINDS = \{[^}]*slabs: 'slab', voids: 'void'/, 'slabs/voids are not object kinds (find/select/delete skip them)');
  const norm = fnSrc('normalizeProject');
  assert.match(norm, /for \(const k in KINDS\) f\[k\] = f\[k\] \|\| \[\]/, 'old projects would load without slabs/voids');
  assert.match(norm, /s\.t = 20/, 'slab thickness has no default');
  assert.match(norm, /v\.type = 'stair'/, 'void type has no default');
  assert.match(fnSrc('deleteIds'), /'slabs', 'voids'/, 'Del does not remove slabs/voids');
});

test('2D: slabs sit under rooms, voids are drawn with the architectural X', () => {
  assert.match(fnSrc('layerStrings'), /slabSvg[\s\S]*roomSvg[\s\S]*voidSvg/, 'layer order must be slab → room → void');
  const v = fnSrc('voidSvg');
  assert.match(v, /clip-path/, 'the X must be clipped to the void outline');
  assert.match(v, /bb\.x0\}" y1="\$\{bb\.y0\}" x2="\$\{bb\.x1\}" y2="\$\{bb\.y1\}/, 'diagonal 1 missing');
  assert.match(v, /bb\.x1\}" y1="\$\{bb\.y0\}" x2="\$\{bb\.x0\}" y2="\$\{bb\.y1\}/, 'diagonal 2 missing');
  assert.doesNotMatch(v + fnSrc('slabSvg'), /#[0-9a-f]{6}/i, 'plan colours must come from pal()');
});

test('the MCP server mirrors the new arrays and tools', () => {
  const s = read('mcp/server.js');
  assert.match(s, /rooms: \[\], slabs: \[\], voids: \[\]/, 'mcp newFloor() drifted from app.js');
  assert.match(s, /tool\('add_slab'/);
  assert.match(s, /tool\('add_void'/);
});
