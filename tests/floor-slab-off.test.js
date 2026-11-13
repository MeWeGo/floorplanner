/* Per-floor "Show floor slab" switch: Floor.noSlab (absent = slab on) empties slabPolys, so 3D, sections and the
   realistic look all drop the automatic slab together; the panel, undo and the MCP add_floor mirror carry it. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n'), mcp = read('mcp/server.js').replace(/\r\n/g, '\n');

test('slabPolys returns nothing for a floor with noSlab, before touching the canvas', () => {
  // eslint-disable-next-line no-new-func
  const slabPolys = new Function('document', 'contentBounds', 'rectPoly', fnSrcOf(src, 'slabPolys') + '; return slabPolys;')(
    { createElement() { throw new Error('canvas must not be used'); } }, () => ({ x0: 0, y0: 0, x1: 100, y1: 100 }), () => [{ x: 0, y: 0 }]);
  assert.deepStrictEqual(slabPolys({ noSlab: true, walls: [{ a: { x: 0, y: 0 }, b: { x: 500, y: 0 }, t: 20 }] }), []);
  assert.deepStrictEqual(slabPolys({ noSlab: true, walls: [], furn: [{}] }), []);
  assert.strictEqual(slabPolys({ walls: [] }).length, 1, 'a wall-less floor without the flag still gets its slab');
});

test('every automatic-slab consumer goes through slabPolys', () => {
  const b3 = fnSrcOf(src, 'build3D');
  assert.match(b3, /for \(const pts of slabPolys\(f\)\)/, 'build3D builds the floor slab from slabPolys');
  assert.match(fnSrcOf(src, 'archPrims'), /slabPolys\(f\)/, 'sections cut slabPolys');
});

test('panel checkbox toggles noSlab with one commit and hides the material fields', () => {
  assert.match(src, /data-k="floor" data-p="slabOn" \$\{f\.noSlab \? '' : 'checked'\}/);
  assert.match(src, /if \(f\.noSlab\) h \+=[^\n]*\n\s*else h \+= fld\(L\('Malzeme', 'Material'\), 'floor', 'slabFloor'/);
  assert.match(src, /p === 'slabOn'\) \{ if \(v\) delete F\(\)\.noSlab; else F\(\)\.noSlab = true;[^\n]*commit\(\)/);
});

test('MCP add_floor accepts noSlab and summarize reports it', () => {
  assert.match(mcp, /noSlab: \{ type: 'boolean'/);
  assert.match(mcp, /if \(a\.noSlab === true\) f\.noSlab = true;/);
  assert.match(mcp, /f\.noSlab \? ', no floor slab' : ''/);
});
