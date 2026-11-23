/* 💾 Save + Google Drive: Save also syncs when Drive is connected, offers a reconnect when the sign-in expired,
   and offers Drive once per session when it was never connected (only where Drive works).
   Runs the real saveDriveStep() and toast() cut out of app.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js');

function rig({ token = null, usable = true, on = false, wanted = true } = {}) {
  const calls = [], el = { textContent: '', kids: [], cls: new Set(),
    classList: { add: c => el.cls.add(c), remove: c => el.cls.delete(c), toggle: (c, v) => (v ? el.cls.add(c) : el.cls.delete(c)) },
    append: (...k) => el.kids.push(...k) };
  const doc = { createElement: () => ({ className: '', textContent: '', onclick: null }) };
  const api = new Function('calls', 'el', 'document', 'state', `
    const $ = () => el, L = (tr, en) => en, ui = {}; let toastT;
    const gd = { get token() { return state.token; } };
    const gdUsable = () => state.usable, gdCfg = () => ({ on: state.on }), P = { id: 'p1' };
    const gdWanted = id => id === 'p1' && state.wanted, gdPick = (id, v) => calls.push(['pick', id, v]);
    const gdSync = m => calls.push(['sync', m]), gdConnect = () => calls.push(['connect']), syncModal = () => calls.push(['modal']);
    const setTimeout = () => 0, clearTimeout = () => {};
    ${fnSrcOf(src, 'toast')}
    ${fnSrcOf(src, 'saveDriveStep')}
    return { saveDriveStep, ui };
  `)(calls, el, doc, { token, usable, on, wanted });
  const btn = () => el.kids.find(k => k && typeof k === 'object');
  return { ...api, calls, el, btn };
}

test('connected: Save syncs right away and says so, no button', () => {
  const r = rig({ token: 'tok' });
  r.saveDriveStep('saved');
  assert.deepStrictEqual(r.calls, [['sync', true]]);
  assert.match(r.el.textContent, /^saved · syncing with Google Drive/);
  assert.strictEqual(r.btn(), undefined);
});

test('sign-in expired: the toast offers a reconnect that runs gdConnect', () => {
  const r = rig({ on: true });
  r.saveDriveStep('saved');
  assert.strictEqual(r.btn().textContent, '☁ Reconnect Google Drive');
  assert.ok(r.el.cls.has('act'), 'clickable toast');
  r.btn().onclick();
  assert.deepStrictEqual(r.calls, [['connect']]);
});

test('never connected: offered once per session, opening the sync dialog', () => {
  const r = rig();
  r.saveDriveStep('saved');
  assert.strictEqual(r.btn().textContent, '☁ Also save to Google Drive');
  r.btn().onclick();
  assert.deepStrictEqual(r.calls, [['modal']]);
  r.el.kids.length = 0;
  r.saveDriveStep('saved again');
  assert.strictEqual(r.btn(), undefined, 'no second offer in the same session');
  assert.ok(!r.el.cls.has('act'));
});

test('Drive not usable here (file://): plain toast, nothing offered', () => {
  const r = rig({ usable: false, on: true });
  r.saveDriveStep('saved');
  assert.strictEqual(r.btn(), undefined);
  assert.deepStrictEqual(r.calls, []);
});

test('Save calls saveDriveStep after writing the project', () => {
  assert.match(fnSrcOf(src, 'saveBrowser'), /dbPut\('projects'[\s\S]*saveDriveStep\(/);
});

test('connected but this project is not chosen for Drive: no sync, the toast offers to turn it on', () => {
  const r = rig({ token: 'tok', wanted: false });
  r.saveDriveStep('saved');
  assert.deepStrictEqual(r.calls, []);
  assert.strictEqual(r.btn().textContent, '☁ Sync this project with Drive');
  r.btn().onclick();
  assert.deepStrictEqual(r.calls, [['pick', 'p1', true], ['sync', true]]);
});
