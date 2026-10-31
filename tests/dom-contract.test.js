/* DOM contract: every element the app looks up must exist.
   app.js talks to index.html purely through ids, so a missing id is a startup
   crash like `Cannot set properties of null (setting 'onclick')` — exactly what
   shipped to main once with #b3dFit. Ids the app builds itself (modals, the AI
   pill) count as existing. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const {
  read, htmlIds, domContractViolations, fatalBindings,
} = require('./helpers/repo');

const js = read('app.js');
const html = read('index.html');

test('the id contract is readable (guards against a broken parser)', () => {
  assert.ok(htmlIds(html).size > 40, 'expected many ids in index.html');
  assert.ok(js.includes("$('#"), 'expected $(#id) lookups in app.js');
});

test('every element app.js looks up exists in index.html or is created at runtime', () => {
  const missing = domContractViolations(js, html)
    .map(v => `#${v.id} (app.js:${v.lines.join(',')})`);
  assert.deepStrictEqual(missing, [], `unknown DOM ids:\n  ${missing.join('\n  ')}`);
});

test('boot-time bindings are not null-dereferenced', () => {
  // `$('#x').onclick = ...` throws immediately when #x is missing;
  // `if ($('#x')) ...` degrades quietly. Only the former is fatal.
  const fatal = fatalBindings(js, html).map(v => `#${v.id}.${v.prop} (app.js:${v.line})`);
  assert.deepStrictEqual(fatal, [], `unguarded bindings on missing elements:\n  ${fatal.join('\n  ')}`);
});

test('regression: the #b3dFit crash that reached main is detected', () => {
  // Reproduce the shipped state: app.js binds camera buttons that the
  // deployed index.html does not contain.
  const brokenJs = "function boot(){ $('#b3dFit').onclick = () => set3DCam('fit'); }\n";
  const brokenHtml = '<button id="b3d">3D</button>\n';
  const fatal = fatalBindings(brokenJs, brokenHtml);
  assert.strictEqual(fatal.length, 1, 'the guard must flag the #b3dFit binding');
  assert.strictEqual(fatal[0].id, 'b3dFit');
  assert.strictEqual(fatal[0].prop, 'onclick');
  assert.deepStrictEqual(domContractViolations(brokenJs, brokenHtml).map(v => v.id), ['b3dFit']);
});

test('regression: runtime-created ids are not false positives', () => {
  const js2 = "panel.innerHTML = '<input id=\"aiLivePrompt\">';\n$('#aiLivePrompt').onclick = go();\n";
  assert.deepStrictEqual(domContractViolations(js2, '<div id="app"></div>'), []);
  assert.deepStrictEqual(fatalBindings(js2, '<div id="app"></div>'), []);
});

test('the AI and 3D toolbars are wired end to end', () => {
  for (const id of ['bAi', 'bHelp', 'b3d', 'b2d', 'bPng', 'b3dFit', 'b3dTop', 'b3dEye', 'b3dShot', 'ptabs']) {
    assert.ok(html.includes(`id="${id}"`), `index.html is missing #${id}`);
  }
  for (const fn of ['aiModal', 'helpModal', 'show3D', 'export3DRender', 'render3DDataUrl']) {
    assert.ok(js.includes(`function ${fn}`), `app.js is missing ${fn}()`);
  }
});

test('every id inside index.html is unique', () => {
  const all = [...html.matchAll(/\sid="([A-Za-z0-9_-]+)"/g)].map(m => m[1]);
  const dupes = all.filter((id, i) => all.indexOf(id) !== i);
  assert.deepStrictEqual([...new Set(dupes)], [], 'duplicate ids in index.html');
});
