/* Tests for issues #81 (live realistic 3D), #82 (3D floor-following & props), and #83 (2D drafting). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js');
const mcp = read('mcp/server.js');
const css = read('style.css');

function constLine(name) {
  const start = src.indexOf(`const ${name} =`);
  assert.ok(start >= 0, `const ${name} not found in app.js`);
  const end = src.indexOf('\n', start);
  return src.slice(start, end >= 0 ? end : src.length).trim();
}

function makeDraftEnv() {
  const fn = new Function(`
    const AB_KINDS = new Set(['wall', 'dim', 'section']);
    const PTS_KINDS = new Set(['room', 'sketch', 'slab', 'void', 'draft']);
    ${fnSrcOf(src, 'reflectPoint')}
    ${constLine('normDeg')}
    ${fnSrcOf(src, 'xfHp')}
    ${fnSrcOf(src, 'mirrorObjs')}
    ${fnSrcOf(src, 'draftArc')}
    ${constLine('draftClosed')}
    ${fnSrcOf(src, 'draftOutline')}
    ${fnSrcOf(src, 'draftLen')}
    ${fnSrcOf(src, 'draftArea')}
    ${fnSrcOf(src, 'draftPathD')}
    ${fnSrcOf(src, 'draftDashArr')}
    ${constLine('draftRect')}
    ${fnSrcOf(src, 'draftTypedPt')}
    return {
      mirrorObjs, draftArc, draftClosed, draftOutline, draftLen,
      draftArea, draftPathD, draftDashArr, draftRect, draftTypedPt,
    };
  `);
  return fn();
}

const D = makeDraftEnv();

test('(A1) line length, closed rectangle perimeter & area', () => {
  const line = { shape: 'line', pts: [{ x: 0, y: 0 }, { x: 300, y: 400 }] };
  assert.strictEqual(D.draftLen(line), 500);
  assert.strictEqual(D.draftClosed(line), false);
  assert.strictEqual(D.draftArea(line), 0);

  const rect = { shape: 'pline', closed: true, pts: D.draftRect({ x: 10, y: 20 }, { x: 310, y: 220 }) };
  assert.strictEqual(D.draftClosed(rect), true);
  assert.strictEqual(D.draftLen(rect), 1000);
  assert.strictEqual(D.draftArea(rect), 60000);
});

test('(A2) circle circumference, area, and 4-point bbox outline', () => {
  const circ = { shape: 'circle', pts: [{ x: 100, y: 200 }, { x: 150, y: 200 }] }; // r = 50
  assert.strictEqual(D.draftClosed(circ), true);
  assert.ok(Math.abs(D.draftLen(circ) - 2 * Math.PI * 50) < 1e-6);
  assert.ok(Math.abs(D.draftArea(circ) - Math.PI * 2500) < 1e-6);
  assert.deepStrictEqual(D.draftOutline(circ), [
    { x: 50, y: 200 },
    { x: 100, y: 150 },
    { x: 150, y: 200 },
    { x: 100, y: 250 },
  ]);
});

test('(A3) 3-point arc geometry: semicircle, major arc (>180 deg), and collinear fallback', () => {
  const semi = { shape: 'arc', pts: [{ x: -100, y: 0 }, { x: 0, y: -100 }, { x: 100, y: 0 }] };
  const aSemi = D.draftArc(semi);
  assert.ok(aSemi, 'semicircle arc should resolve');
  assert.ok(Math.abs(aSemi.c.x) < 1e-6 && Math.abs(aSemi.c.y) < 1e-6);
  assert.ok(Math.abs(aSemi.r - 100) < 1e-6);
  assert.strictEqual(aSemi.sweep, 1);
  assert.strictEqual(aSemi.large, 0);
  assert.ok(Math.abs(D.draftLen(semi) - Math.PI * 100) < 1e-6);
  const outline = D.draftOutline(semi);
  assert.ok(outline.length > 2);
  for (const pt of outline) {
    assert.ok(Math.abs(Math.hypot(pt.x, pt.y) - 100) < 1e-6, 'outline point on radius 100');
  }

  // Major arc: points on circle r=100 centered at (0,0), middle point on opposite side of chord
  const major = { shape: 'arc', pts: [{ x: -60, y: 80 }, { x: 0, y: -100 }, { x: 60, y: 80 }] };
  const aMajor = D.draftArc(major);
  assert.ok(aMajor);
  assert.strictEqual(aMajor.large, 1);
  assert.ok(D.draftLen(major) > Math.PI * 100);

  // Collinear arc returns null and falls back to polyline path
  const collin = { shape: 'arc', pts: [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }] };
  assert.strictEqual(D.draftArc(collin), null);
  const path = D.draftPathD(collin);
  assert.match(path, /^M/);
  assert.ok(!path.includes('A'), 'collinear arc falls back to L segments without A');
});

test('(A4) draftPathD, draftDashArr, and draftTypedPt', () => {
  const arc = { shape: 'arc', pts: [{ x: -100, y: 0 }, { x: 0, y: -100 }, { x: 100, y: 0 }] };
  const arcD = D.draftPathD(arc);
  assert.match(arcD, /^M.*A/);

  const poly = { shape: 'pline', closed: true, pts: D.draftRect({ x: 0, y: 0 }, { x: 100, y: 50 }) };
  const polyD = D.draftPathD(poly);
  assert.match(polyD, /^M.*Z$/);

  assert.strictEqual(D.draftDashArr({ dash: 'solid', w: 2 }), '');
  // dash lengths scale with the line weight, so a heavy line keeps the same look
  const nums = o => D.draftDashArr(o).split(' ').map(Number);
  assert.deepStrictEqual(nums({ dash: 'dashed', w: 2 }), [12, 8]);
  assert.deepStrictEqual(nums({ dash: 'dashed', w: 4 }), [24, 16]);
  assert.deepStrictEqual(nums({ dash: 'center', w: 2 }), [24, 6, 4, 6], 'centre line = long dash, gap, short dash, gap');
  const dot = nums({ dash: 'dotted', w: 2 });
  assert.ok(dot[0] < 0.1 && dot[1] === 5, 'dotted = round-cap dots spaced 2.5 × w: ' + dot);
  assert.deepStrictEqual(nums({ dash: 'dashed', w: 0 }), [12, 8], 'a missing / zero weight uses the 2-unit default');
  assert.deepStrictEqual(nums({ dash: 'dashed', w: 0.5 }), [6, 4], 'hairlines are clamped to a 1-unit pattern');

  const pLine = D.draftTypedPt({ x: 100, y: 100 }, { x: 130, y: 140 }, '200', 'line');
  assert.ok(Math.abs(pLine.x - 220) < 1e-6 && Math.abs(pLine.y - 260) < 1e-6);

  const pRectPos = D.draftTypedPt({ x: 50, y: 60 }, { x: 100, y: 120 }, '300x200', 'rect');
  assert.strictEqual(pRectPos.x, 350);
  assert.strictEqual(pRectPos.y, 260);

  const pRectNeg = D.draftTypedPt({ x: 500, y: 400 }, { x: 450, y: 350 }, '300x200', 'rect');
  assert.strictEqual(pRectNeg.x, 200);
  assert.strictEqual(pRectNeg.y, 200);
});

test('(A5) mirrorObjs preserves circle point order [center, edge]', () => {
  const circ = { id: 'd1', shape: 'circle', pts: [{ x: 100, y: 50 }, { x: 150, y: 50 }] };
  const pline = { id: 'd2', shape: 'pline', pts: [{ x: 100, y: 50 }, { x: 150, y: 50 }] };
  D.mirrorObjs([{ kind: 'draft', o: circ }, { kind: 'draft', o: pline }], { x: 200, y: 0 }, { x: 0, y: 1 });
  // Reflected across x = 200: (100,50) -> (300,50), (150,50) -> (250,50)
  assert.deepStrictEqual(circ.pts, [{ x: 300, y: 50 }, { x: 250, y: 50 }]);
  // Non-circle pts are reversed
  assert.deepStrictEqual(pline.pts, [{ x: 250, y: 50 }, { x: 300, y: 50 }]);
});

// The smoke check "2D drafting: …" draws all shapes with the tool, selects one, edits / undoes it,
// exports it and proves 3D builds no meshes for it; this covers what it does not touch.
test('(A6) issue #83 source wiring in app.js and mcp/server.js', () => {
  assert.match(src, /const\s+PTS_KINDS\s*=\s*new\s+Set\([^)]*'draft'/);
  assert.match(src, /const\s+XFORM_KINDS\s*=\s*new\s+Set\([^)]*'draft'/);
  assert.match(src, /const\s+LAYER_ARR\s*=\s*\{[^}]*draft:\s*'drafts'/);
  assert.match(src, /const\s+GRESIZE\s*=\s*\{[^}]*draft:\s*1/);
  assert.match(src, /function\s+deleteIds[\s\S]*?\[[^\]]*'drafts'[^\]]*\]/);
  assert.match(src, /const\s+TOOLS\s*=\s*\[[\s\S]*?\['draft',[^,\]]+,[^,\]]+,\s*'U'/);
  assert.match(src, /const\s+HINTS\s*=\s*\{[\s\S]*?draft:/);
  assert.match(src, /const\s+HINTS_EN\s*=\s*\{[\s\S]*?draft:/);
  assert.match(src, /\bu:\s*'draft'/);

  // a wall-less floor gets its automatic slab from the content bounds: drafting lines must not count
  assert.match(fnSrcOf(src, 'slabPolys'), /contentBounds\([^;]*drafts:\s*\[\]/, 'slabPolys ignores drafts');

  assert.match(mcp, /const\s+KINDS\s*=\s*\{[^}]*drafts:\s*'draft'/);
  assert.match(mcp, /function\s+newFloor[\s\S]*?drafts:\s*\[\]/);
  assert.match(mcp, /add_draft/);
  assert.match(mcp, /'drafts'/);
});

// The smoke check "3D selection on another floor fills the side panel…" proves the floor follows a 3D
// pick, the floor badge, editing a wall on another floor, and slab picking + highlight; rooms and the
// narrow-screen drawer are what it does not reach.
test('(B) issue #82 room selection in 3D and the props drawer', () => {
  assert.match(fnSrcOf(src, 'walkClick'), /roomId/);
  assert.match(fnSrcOf(src, 'refreshSel3D'), /roomId/);
  assert.match(css, /body\.props-open\s+#props/);
});
