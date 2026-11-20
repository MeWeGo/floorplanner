/* Wall faces painted / covered separately: c1 / c2 (paint) and f1 / f2 (finish: built-in pattern or tex:<id>) on a wall,
   absent = the old single wall paint. Runs the real helpers cut out of app.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n');
const line = start => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf('\n', i)); };

// eslint-disable-next-line no-new-func
const H = new Function(`
  const L = (tr, en) => en;
  const FLOORS = { none: 1, wood: 1, tile: 1 };
  const texIdOf = k => typeof k === 'string' && k.startsWith('tex:') ? k.slice(4) : null;
  const wLen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  let ROOMS = [];
  const F = () => ({ rooms: ROOMS });
  ${fnSrcOf(src, 'pointInPoly')}
  ${line('const WALL_FACE_KEYS')}
  ${fnSrcOf(src, 'wallFace')}
  ${line('const wallFaced')}
  ${fnSrcOf(src, 'wallFaceName')}
  ${fnSrcOf(src, 'wallFaceSwap')}
  ${fnSrcOf(src, 'cleanWallFaces')}
  return { wallFace, wallFaced, wallFaceName, wallFaceSwap, cleanWallFaces, setRooms: r => { ROOMS = r; } };
`)();

const wall = (extra = {}) => ({ a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20, ...extra });

test('an old wall has no face overrides: both faces use the wall paint', () => {
  const w = wall({ color: '#ff0000' });
  assert.strictEqual(H.wallFaced(w), false);
  assert.deepStrictEqual(H.wallFace(w, 1), { col: '#ff0000', fin: null });
  assert.deepStrictEqual(H.wallFace(w, 2), { col: '#ff0000', fin: null });
  assert.deepStrictEqual(H.wallFace(wall(), 1), { col: null, fin: null });
});

test('each face has its own paint and finish', () => {
  const w = wall({ color: '#ff0000', c1: '#00ff00', f2: 'tex:abc' });
  assert.ok(H.wallFaced(w));
  assert.deepStrictEqual(H.wallFace(w, 1), { col: '#00ff00', fin: null });
  assert.deepStrictEqual(H.wallFace(w, 2), { col: '#ff0000', fin: 'tex:abc' });
  assert.strictEqual(H.wallFace(wall({ f1: 'none' }), 1).fin, null);
});

test('swap exchanges paint and finish; swapping twice is the identity', () => {
  const w = wall({ c1: '#111111', f2: 'tile' });
  H.wallFaceSwap(w);
  assert.deepStrictEqual([w.c1, w.c2, w.f1, w.f2], [undefined, '#111111', 'tile', undefined]);
  assert.ok(!('c1' in w) && !('f2' in w), 'no undefined keys left behind');
  H.wallFaceSwap(w);
  assert.deepStrictEqual([w.c1, w.f2], ['#111111', 'tile']);
});

test('faces are named after the room they face, else by compass (north = −y)', () => {
  H.setRooms([]);
  // wall along +x: face 1 normal = (0, 1) = south on screen, face 2 = north
  assert.strictEqual(H.wallFaceName(wall(), 1), 'South face');
  assert.strictEqual(H.wallFaceName(wall(), 2), 'North face');
  const v = { a: { x: 0, y: 0 }, b: { x: 0, y: 400 }, t: 20 }; // along +y: face 1 normal = (−1, 0) = west
  assert.strictEqual(H.wallFaceName(v, 1), 'West face');
  H.setRooms([{ name: 'Kitchen', pts: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] }]);
  assert.strictEqual(H.wallFaceName(wall(), 1), 'Kitchen side');
  assert.strictEqual(H.wallFaceName(wall(), 2), 'North face');
});

test('cleanWallFaces drops malformed values and keeps valid ones', () => {
  const w = wall({ c1: 'red', c2: '#AbCdEf', f1: 'lava', f2: 'tex:x1', });
  H.cleanWallFaces(w);
  assert.deepStrictEqual([w.c1, w.c2, w.f1, w.f2], [undefined, '#AbCdEf', undefined, 'tex:x1']);
  const n = wall({ f1: 'none', f2: 5 }); H.cleanWallFaces(n);
  assert.ok(!('f1' in n) && !('f2' in n));
});

test('wiring: panel, whole-wall paint clears face paints, mirror / split / texture delete, 2D and 3D', () => {
  assert.match(src, /if \(os\.every\(x => isSolidWall\(x\.o\)\)\) h \+= wallFacesHtml\(o, n, os\);/);
  assert.match(src, /k === 'wall' && p === 'color'\) \{ o\.color = v; delete o\.c1; delete o\.c2; \}/);
  assert.match(src, /else delete o\.color; delete o\.c1; delete o\.c2; \}/, 'paint swatches cover both faces');
  assert.match(fnSrcOf(src, 'mirrorObjs'), /if \(wallFaced\(m\)\) wallFaceSwap\(m\);/);
  assert.match(fnSrcOf(src, 'splitWallAt'), /'color', 'c1', 'c2', 'f1', 'f2'/);
  assert.match(fnSrcOf(src, 'deleteTexture'), /for \(const fk of \['f1', 'f2'\]\) if \(w\[fk\] === k\)/);
  assert.match(fnSrcOf(src, 'addTexture'), /else if \(ui\.txWall\)[^\n]*o\['f' \+ ui\.txWall\] = 'tex:' \+ id/);
  assert.match(fnSrcOf(src, 'normalizeProject'), /cleanWallFaces\(w\)/);
  assert.match(fnSrcOf(src, 'wallSvg'), /\(w\.color \|\| wallFaced\(w\)\) && !C\.outline/);
  const b3 = fnSrcOf(src, 'build3D');
  assert.match(b3, /const skins = curt \? \[\] :/);
  assert.match(b3, /skin\(shp\)/, 'sloped wall tops get skins too');
});
