/* Structural axes (aks): Floor.axes = [{ id, name, a, b, bub? }], drawn as dash-dot lines with labelled bubbles, 2D only.
   Runs the real helpers cut out of app.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n'), mcp = read('mcp/server.js').replace(/\r\n/g, '\n');
const line = start => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf('\n', i)); };

// eslint-disable-next-line no-new-func
const H = new Function(`
  let n = 0; const uid = () => 'id' + (n++);
  let FL = { axes: [] }; const F = () => FL;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  ${line('const AXIS_BUBS')}
  ${line('const axisFamily')}
  ${line('const axisLetter')}
  ${fnSrcOf(src, 'nextAxisName')}
  ${fnSrcOf(src, 'axisSnapPts')}
  ${fnSrcOf(src, 'parseAxisSpacing')}
  ${fnSrcOf(src, 'axisGrid')}
  return { axisFamily, axisLetter, nextAxisName, axisSnapPts, parseAxisSpacing, axisGrid, setF: f => { FL = f; } };
`)();

test('vertical axes are numbered, horizontal ones lettered; the next free name is used', () => {
  assert.strictEqual(H.axisFamily({ x: 0, y: 0 }, { x: 0, y: 900 }), 'num');
  assert.strictEqual(H.axisFamily({ x: 0, y: 0 }, { x: 900, y: 50 }), 'let');
  const f = { axes: [{ name: '1' }, { name: '3' }, { name: 'A' }] };
  assert.strictEqual(H.nextAxisName({ x: 0, y: 0 }, { x: 0, y: 500 }, f), '2');
  assert.strictEqual(H.nextAxisName({ x: 0, y: 0 }, { x: 500, y: 0 }, f), 'B');
  assert.deepStrictEqual([0, 25, 26, 27, 51, 52].map(H.axisLetter), ['A', 'Z', 'AA', 'AB', 'AZ', 'BA']);
});

test('spacing lists: commas, spaces, semicolons and NxD repeats; bad input is refused', () => {
  assert.deepStrictEqual(H.parseAxisSpacing('500, 500 400'), [500, 500, 400]);
  assert.deepStrictEqual(H.parseAxisSpacing('3x500;250'), [500, 500, 500, 250]);
  assert.deepStrictEqual(H.parseAxisSpacing('2×450.5'), [450.5, 450.5]);
  for (const bad of ['', 'abc', '5', '500,-1', null]) assert.strictEqual(H.parseAxisSpacing(bad), null, String(bad));
});

test('an axis grid makes numbered verticals and lettered horizontals overhanging the grid by 150 cm', () => {
  const f = { axes: [] }, made = H.axisGrid(f, { x: 100, y: 200 }, [500, 400], [600]);
  assert.deepStrictEqual(made.map(a => a.name), ['1', '2', '3', 'A', 'B']);
  assert.deepStrictEqual(made[2].a, { x: 1000, y: 50 }); assert.deepStrictEqual(made[2].b, { x: 1000, y: 950 });
  assert.deepStrictEqual(made[4].a, { x: -50, y: 800 }); assert.strictEqual(f.axes.length, 5);
  const more = H.axisGrid(f, { x: 0, y: 0 }, [300], [300]);
  assert.deepStrictEqual(more.map(a => a.name), ['4', '5', 'C', 'D'], 'a second grid continues the names');
});

test('snap points: every crossing and every end, nothing for parallel axes', () => {
  const f = { axes: [] }; H.axisGrid(f, { x: 0, y: 0 }, [500, 500], [600]); // 3 vertical × 2 horizontal
  const pts = H.axisSnapPts(f);
  assert.strictEqual(pts.length, 5 * 2 + 3 * 2);
  assert.ok(pts.some(p => p.x === 500 && p.y === 600), 'crossing 2/B');
  const par = { axes: [{ a: { x: 0, y: 0 }, b: { x: 0, y: 100 } }, { a: { x: 50, y: 0 }, b: { x: 50, y: 100 } }] };
  assert.strictEqual(H.axisSnapPts(par).length, 4);
});

test('wiring: kind, tool, drawing, snapping, panel, commands, floors, MCP', () => {
  assert.match(src, /sections: 'section', axes: 'axis', dims: 'dim'/);
  assert.match(src, /const AB_KINDS = new Set\(\['wall', 'dim', 'section', 'axis'\]\)/);
  assert.match(src, /\['axis', '⊹', 'Aks', 'Z', 'Axis'\]/);
  assert.match(src, /z: 'axis'/);
  assert.match(fnSrcOf(src, 'layerStrings'), /\(f\.axes \|\| \[\]\)\.map\(x => axisSvg\(x, live\)\)/);
  assert.match(fnSrcOf(src, 'snapPt'), /for \(const q of axisSnapPts\(f\)\)/);
  assert.match(src, /data-act="axcopy"[\s\S]*data-act="axgrid"/);
  assert.match(src, /act\('axgrid', '⊞'/);
  assert.match(src, /P\.floors\[P\.floors\.length - 1\]\.axes = \(F\(\)\.axes \|\| \[\]\)/, 'a new floor inherits the axes');
  assert.doesNotMatch(fnSrcOf(src, 'build3D'), /\.axes\b/, '2D only');
  assert.match(mcp, /sections: 'section', axes: 'axis', dims: 'dim'/);
  assert.match(mcp, /sections: \[\], axes: \[\], dims: \[\]/);
});
