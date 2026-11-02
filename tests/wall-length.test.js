/* Numeric wall length editing (issue #36).
   The real applyWallLength() is cut out of app.js and run against synthetic floors. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');

function sliceFunc(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found in app.js`);
  const end = src.indexOf('\n}', start) + 2;
  return src.slice(start, end);
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wLen = w => dist(w.a, w.b);
const wallFree = w => (w.pivot === 'b' ? 'a' : 'b');
const ui = { connWalls: true };
const F = () => null;

const applyWallLength = new Function(`
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wLen = w => dist(w.a, w.b);
  const wallFree = w => (w.pivot === 'b' ? 'a' : 'b');
  const ui = { connWalls: true };
  const F = () => null;
  ${sliceFunc('applyWallLength')}
  return applyWallLength;
`)();

test('(1) setting wall length moves free end along angle and preserves direction on diagonals', () => {
  const w1 = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 600, y: 0 } };
  const f1 = { walls: [w1], ops: [] };
  assert.strictEqual(applyWallLength(w1, 800, wallFree(w1), true, f1), true);
  assert.strictEqual(w1.a.x, 0);
  assert.strictEqual(w1.a.y, 0);
  assert.strictEqual(w1.b.x, 800);
  assert.strictEqual(w1.b.y, 0);

  const wDiag = { id: 'wd', a: { x: 50, y: 100 }, b: { x: 350, y: 500 } };
  const angBefore = Math.atan2(wDiag.b.y - wDiag.a.y, wDiag.b.x - wDiag.a.x);
  const fDiag = { walls: [wDiag], ops: [] };
  assert.strictEqual(applyWallLength(wDiag, 750, wallFree(wDiag), true, fDiag), true);
  const angAfter = Math.atan2(wDiag.b.y - wDiag.a.y, wDiag.b.x - wDiag.a.x);
  assert.ok(Math.abs(angAfter - angBefore) < 1e-6, 'direction kept exactly within 1e-6');
  const newLen = Math.hypot(wDiag.b.x - wDiag.a.x, wDiag.b.y - wDiag.a.y);
  assert.ok(Math.abs(newLen - 750) < 0.01, 'new length within 0.01');
  assert.strictEqual(wDiag.a.x, 50);
  assert.strictEqual(wDiag.a.y, 100);
});

test('(2) connected walls follow when conn is true, stay put when conn is false', () => {
  // with conn true (default or explicit), wall2 whose a end sat on moved b follows
  const w1 = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 600, y: 0 } };
  const w2 = { id: 'w2', a: { x: 600, y: 0 }, b: { x: 600, y: 300 } };
  const fConn = { walls: [w1, w2], ops: [] };
  assert.strictEqual(applyWallLength(w1, 800, wallFree(w1), true, fConn), true);
  assert.strictEqual(w1.b.x, 800);
  assert.strictEqual(w1.b.y, 0);
  assert.strictEqual(w2.a.x, 800);
  assert.strictEqual(w2.a.y, 0);
  assert.strictEqual(w2.b.x, 600);
  assert.strictEqual(w2.b.y, 300);

  // with conn false (4th argument false), wall2 stays at (600, 0)
  const w1b = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 600, y: 0 } };
  const w2b = { id: 'w2', a: { x: 600, y: 0 }, b: { x: 600, y: 300 } };
  const fNoConn = { walls: [w1b, w2b], ops: [] };
  assert.strictEqual(applyWallLength(w1b, 800, wallFree(w1b), false, fNoConn), true);
  assert.strictEqual(w1b.b.x, 800);
  assert.strictEqual(w1b.b.y, 0);
  assert.strictEqual(w2b.a.x, 600);
  assert.strictEqual(w2b.a.y, 0);
  assert.strictEqual(w2b.b.x, 600);
  assert.strictEqual(w2b.b.y, 300);
});

test('(3) a hinged wall with pivot "b" moves its a end instead (wallFree)', () => {
  const w = { id: 'w1', a: { x: 100, y: 0 }, b: { x: 600, y: 0 }, pivot: 'b' };
  const f = { walls: [w], ops: [] };
  assert.strictEqual(wallFree(w), 'a');
  assert.strictEqual(applyWallLength(w, 700, wallFree(w), true, f), true);
  assert.strictEqual(w.b.x, 600);
  assert.strictEqual(w.b.y, 0);
  assert.strictEqual(w.a.x, -100);
  assert.strictEqual(w.a.y, 0);
  assert.strictEqual(wLen(w), 700);
});

test('(4) openings: clamp on shorten, shift on moving "a" end, and shift on connected wall', () => {
  // window at d 450 (w 120) on wall shortened from 600 to 300 is clamped to 240 (= L - w/2)
  const wShort = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 600, y: 0 } };
  const opWindow = { id: 'op1', wall: 'w1', d: 450, w: 120 };
  const fShort = { walls: [wShort], ops: [opWindow] };
  assert.strictEqual(applyWallLength(wShort, 300, wallFree(wShort), true, fShort), true);
  assert.strictEqual(opWindow.d, 240);

  // when the moved end is "a" (pivot b) and wall grows by 200, opening d increases by 200 so it stays at the same place
  const wGrow = { id: 'w1', a: { x: 200, y: 0 }, b: { x: 600, y: 0 }, pivot: 'b' }; // length 400
  const opGrow = { id: 'op2', wall: 'w1', d: 150, w: 100 };
  const fGrow = { walls: [wGrow], ops: [opGrow] };
  assert.strictEqual(applyWallLength(wGrow, 600, wallFree(wGrow), true, fGrow), true);
  assert.strictEqual(wGrow.a.x, 0);
  assert.strictEqual(wGrow.b.x, 600);
  assert.strictEqual(opGrow.d, 350); // 150 + 200

  // opening on a connected wall whose a end moved is shifted the same way
  const wConn1 = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 600, y: 0 } };
  const wConn2 = { id: 'w2', a: { x: 600, y: 0 }, b: { x: 1000, y: 0 } }; // length 400
  const opConn = { id: 'op3', wall: 'w2', d: 100, w: 80 };
  const fConn = { walls: [wConn1, wConn2], ops: [opConn] };
  assert.strictEqual(applyWallLength(wConn1, 400, wallFree(wConn1), true, fConn), true);
  assert.strictEqual(wConn2.a.x, 400);
  assert.strictEqual(opConn.d, 300); // 100 + (600 - 400) = 300
});

test('(5) invalid input: len 0, negative, NaN or a zero-length wall returns false and changes nothing', () => {
  const w = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 600, y: 0 } };
  const op = { id: 'op1', wall: 'w1', d: 200, w: 80 };
  const f = { walls: [w], ops: [op] };

  assert.strictEqual(applyWallLength(w, 0, wallFree(w), true, f), false);
  assert.strictEqual(w.a.x, 0);
  assert.strictEqual(w.b.x, 600);
  assert.strictEqual(op.d, 200);

  assert.strictEqual(applyWallLength(w, -100, wallFree(w), true, f), false);
  assert.strictEqual(w.a.x, 0);
  assert.strictEqual(w.b.x, 600);
  assert.strictEqual(op.d, 200);

  assert.strictEqual(applyWallLength(w, NaN, wallFree(w), true, f), false);
  assert.strictEqual(w.a.x, 0);
  assert.strictEqual(w.b.x, 600);
  assert.strictEqual(op.d, 200);

  const zw = { id: 'zw', a: { x: 100, y: 100 }, b: { x: 100, y: 100 } };
  const fz = { walls: [zw], ops: [] };
  assert.strictEqual(applyWallLength(zw, 500, wallFree(zw), true, fz), false);
  assert.strictEqual(zw.a.x, 100);
  assert.strictEqual(zw.a.y, 100);
  assert.strictEqual(zw.b.x, 100);
  assert.strictEqual(zw.b.y, 100);
});

test('(6) wiring asserts on app.js source', () => {
  // wallDimSvg adds data-wdim only when not ui.exporting (pointer-events none in exports)
  const wallDimSvgSrc = sliceFunc('wallDimSvg');
  assert.ok(wallDimSvgSrc.includes('ui.exporting'));
  assert.ok(wallDimSvgSrc.includes('pointer-events="none"'));
  assert.ok(wallDimSvgSrc.includes('data-wdim='));

  // the select tool pointerdown opens openWallDimInput for [data-wdim]
  const selectIdx = src.indexOf("case 'select':");
  assert.ok(selectIdx >= 0, "case 'select' found");
  const selectCase = src.slice(selectIdx, selectIdx + 400);
  assert.ok(selectCase.includes("closest('[data-wdim]')"));
  assert.ok(selectCase.includes('openWallDimInput('));

  // openWallDimInput creates an input with id wdimInput, applies on Enter via applyWallLength then commit(), and cancels on Escape
  const openWallDimSrc = sliceFunc('openWallDimInput');
  assert.ok(openWallDimSrc.includes("id = 'wdimInput'"));
  assert.ok(openWallDimSrc.includes("ev.key === 'Enter'"));
  assert.ok(openWallDimSrc.includes('applyWallLength(w, v)'));
  assert.ok(openWallDimSrc.includes('commit()'));
  assert.ok(openWallDimSrc.includes("ev.key === 'Escape'"));
  assert.ok(openWallDimSrc.includes('closeWallDimInput()'));

  // applyProp for wall len calls applyWallLength only when final
  const applyPropSrc = sliceFunc('applyProp');
  assert.ok(applyPropSrc.includes("k === 'wall' && p === 'len'"));
  assert.ok(applyPropSrc.includes('if (final) applyWallLength('));

  // the keydown handler handles ui.lenTyped for a single selected wall (Enter applies, Backspace edits, Escape clears)
  assert.ok(src.includes("tool === 'select' && sel.length === 1 && find(sel[0])?.kind === 'wall'"));
  assert.ok(src.includes("if (e.key === 'Enter') { const v = parseFloat(ui.lenTyped); ui.lenTyped = ''; if (applyWallLength(sw, v)) { commit(); refresh();"));
  assert.ok(src.includes("ui.lenTyped = e.key === 'Escape' ? '' : e.key === 'Backspace' ? ui.lenTyped.slice(0, -1) : (ui.lenTyped || '') + (e.key === ',' ? '.' : e.key);"));

  // and the handle drag (ui.drag.h wa or wb) collects digits into typed
  assert.ok(src.includes("ui.drag.type === 'handle' && (ui.drag.h === 'wa' || ui.drag.h === 'wb')"));
  assert.ok(src.includes("hd.typed = e.key === 'Backspace' ? (hd.typed || '').slice(0, -1) : (hd.typed || '') + (e.key === ',' ? '.' : e.key);"));

  // doHandle uses parseFloat(d.typed) and still contains the exact text "snapPt(raw, other, e, ign); ui.cur = p;"
  const doHandleSrc = sliceFunc('doHandle');
  assert.ok(doHandleSrc.includes('parseFloat(d.typed)'));
  assert.ok(doHandleSrc.includes('snapPt(raw, other, e, ign); ui.cur = p;'));
});
