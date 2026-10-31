/* Keyboard shortcuts in the 3D view (Oct 2026).

   The 3D branch of the keydown handler used to return early for everything
   except Escape and the WASD walk keys, so Ctrl+Z — the most pressed key in
   the app — silently did nothing while the user was looking at the model.
   browser-smoke.js proves the behaviour with real key events; this file keeps
   the shape of the handler honest so a future refactor cannot reintroduce the
   early return by accident. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const js = read('app.js');

/** The body of the `if (ui.view3d) { … }` branch, brace-matched. */
function view3dBranch() {
  const start = js.indexOf('if (ui.view3d) {', js.indexOf("addEventListener('keydown'"));
  assert.ok(start > 0, 'the 3D branch of the keydown handler is gone');
  let depth = 0, i = js.indexOf('{', start);
  const from = i;
  for (; i < js.length; i++) {
    if (js[i] === '{') depth++;
    else if (js[i] === '}') { depth--; if (depth === 0) break; }
  }
  return js.slice(from, i + 1);
}

test('Ctrl+Z / Ctrl+Y reach undo() and redo() while in 3D', () => {
  const branch = view3dBranch();
  assert.match(branch, /if \(ctrl\) \{/, 'the 3D branch has no ctrl layer — undo/redo will be swallowed again');
  assert.match(branch, /k === 'z'\)[^\n]*redo\(\) : undo\(\)/, 'Ctrl+Z must still run undo() (Ctrl+Shift+Z = redo)');
  assert.match(branch, /k === 'y'\)[^\n]*redo\(\)/, 'Ctrl+Y must still run redo()');
  // the ctrl layer has to come BEFORE the WASD/walk block, or Ctrl+A adds "a" to
  // the walk set and the arrow keys move the camera while the user meant "select"
  const ctrlAt = branch.indexOf('if (ctrl) {');
  const walkAt = branch.indexOf('keys3D.add(k)');
  assert.ok(ctrlAt > 0 && walkAt > 0, 'the walk-key block is gone');
  assert.ok(ctrlAt < walkAt, 'the ctrl layer must be handled before walk keys are captured');
});

test('the other editing shortcuts survive 3D too', () => {
  const branch = view3dBranch();
  for (const [k, hint] of [['s', 'save'], ['a', 'select all'], ['g', 'group'], ['c', 'copy'], ['v', 'paste'], ['d', 'duplicate']]) {
    assert.ok(branch.includes(`k === '${k}'`), `Ctrl+${k.toUpperCase()} (${hint}) no longer works in 3D`);
  }
  assert.match(branch, /Delete[^\n]*deleteSel\(\)/, 'Delete must remove the 3D selection');
});

test('undo in 3D rebuilds the scene instead of leaving it stale', () => {
  // restore() is the single path undo/redo use; it must keep scheduling a rebuild
  const start = js.indexOf('function restore(');
  assert.ok(start > 0, 'restore() is gone');
  const restore = js.slice(start, js.indexOf('\n}', start));
  assert.match(restore, /schedBuild3D\(\)/, 'undo/redo no longer rebuilds the 3D scene — the model would show stale geometry');
  // and the app must not need a second rebuild path bolted onto undo itself
  const undo = js.slice(js.indexOf('function undo('), js.indexOf('function updateUndo('));
  assert.match(undo, /restore\(/, 'undo() no longer goes through restore()');
});
