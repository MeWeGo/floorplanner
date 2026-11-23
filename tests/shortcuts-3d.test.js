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

test('Escape in 3D exits walk / group-edit / clears selection and stays in 3D (#180)', () => {
  const branch = view3dBranch();
  assert.ok(!/show3D\(false\)/.test(branch), '3D Escape branch must never switch back to 2D');

  const escIdx = branch.indexOf("if (e.key === 'Escape') {");
  assert.ok(escIdx >= 0, '3D Escape handler block missing');
  const open = branch.indexOf('{', escIdx);
  const escBody = branch.slice(open, matchBracket(branch, open) + 1);

  const runEsc = (initState) => {
    const state = {
      view3d: true,
      sel: [],
      grpEdit: null,
      walk: false,
      exitWalkCalls: 0,
      stopGrpCalls: 0,
      refreshCalls: 0,
      refreshSel3DCalls: 0,
      show3DCalls: 0,
      ...initState,
    };
    const fn = new Function('ui', 'T3', 'exitWalk', 'stopGrpEdit', 'refresh', 'refreshSel3D', 'show3D', 'getSel', 'setSel', `
      const e = { key: 'Escape' };
      const sel = { get length() { return getSel().length; } };
      ${escBody.replace('sel = [];', 'setSel([]);')}
    `);
    fn(
      state,
      { walk: state.walk },
      () => { state.walk = false; state.exitWalkCalls++; },
      () => { state.grpEdit = null; state.stopGrpCalls++; },
      () => { state.refreshCalls++; },
      () => { state.refreshSel3DCalls++; },
      v => { state.view3d = v; state.show3DCalls++; },
      () => state.sel,
      v => { state.sel = v; },
    );
    return state;
  };

  const s1 = runEsc({ sel: ['w1', 'f1'] });
  assert.deepStrictEqual(s1.sel, [], 'Escape clears selection in 3D');
  assert.strictEqual(s1.refreshCalls, 1);
  assert.strictEqual(s1.refreshSel3DCalls, 1);
  assert.strictEqual(s1.view3d, true, 'stays in 3D');
  assert.strictEqual(s1.show3DCalls, 0);

  const s2 = runEsc({ walk: true, sel: ['w1'] });
  assert.strictEqual(s2.exitWalkCalls, 1, 'Escape exits walk first');
  assert.deepStrictEqual(s2.sel, ['w1'], 'walk Escape only exits walk mode');
  assert.strictEqual(s2.view3d, true);

  const s3 = runEsc({ grpEdit: 'g1', sel: ['w1'] });
  assert.strictEqual(s3.stopGrpCalls, 1, 'Escape exits group editing before clearing selection');
  assert.strictEqual(s3.refreshCalls, 1);
  assert.strictEqual(s3.refreshSel3DCalls, 1);
  assert.strictEqual(s3.view3d, true);

  assert.doesNotMatch(js, /'2d'[\s\S]{0,120}'Esc \(3B\)'/, '2D command should not claim Esc switches from 3D to 2D');
});


