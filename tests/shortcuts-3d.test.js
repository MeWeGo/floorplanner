/* Keyboard shortcuts in the 3D view (Oct 2026).

   The 3D branch of the keydown handler used to return early for everything
   except Escape and the WASD walk keys, so Ctrl+Z — the most pressed key in
   the app — silently did nothing while the user was looking at the model.
   browser-smoke.js ("3D: Ctrl+Z / Ctrl+Y undo the plan…") proves undo, redo,
   the rebuild and the walk keys with real key events. This file only checks the
   other Ctrl shortcuts, which the smoke test does not press. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, matchBracket } = require('./helpers/repo');

const js = read('app.js');

/** The body of the `if (ui.view3d) { … }` branch, brace-matched. */
function view3dBranch() {
  const start = js.indexOf('if (ui.view3d) {', js.indexOf("addEventListener('keydown'"));
  assert.ok(start > 0, 'the 3D branch of the keydown handler is gone');
  const from = js.indexOf('{', start);
  return js.slice(from, matchBracket(js, from) + 1);
}

test('the other editing shortcuts survive 3D too', () => {
  const branch = view3dBranch();
  for (const [k, hint] of [['s', 'save'], ['a', 'select all'], ['g', 'group'], ['c', 'copy'], ['v', 'paste'], ['d', 'duplicate']]) {
    assert.ok(branch.includes(`k === '${k}'`), `Ctrl+${k.toUpperCase()} (${hint}) no longer works in 3D`);
  }
  assert.match(branch, /Delete[^\n]*deleteSel\(\)/, 'Delete must remove the 3D selection');
});

