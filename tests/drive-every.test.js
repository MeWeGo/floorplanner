/* ☁ Sync dialog: "Save to Drive" after every change (default) or every 10 minutes.
   Runs the real gdEvery / gdAutoDue / syncNoteSave / gdEveryHtml cut out of app.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js');
const line = name => { const i = src.indexOf('const ' + name); assert.ok(i >= 0, name + ' is gone'); return src.slice(i, src.indexOf('\n', i)); };

function rig(cfg = {}, last = 0) {
  const calls = [];
  const api = new Function('cfg', 'calls', 'last', `
    const L = (tr, en) => en, gdCfg = () => cfg, gd = { last };
    const bcPost = () => calls.push('bc'), gdSyncSoon = () => calls.push('soon');
    ${line('GD_EVERY_OPTS')}
    ${line('gdEvery')}
    ${fnSrcOf(src, 'gdAutoDue')}
    ${fnSrcOf(src, 'syncNoteSave')}
    ${fnSrcOf(src, 'gdEveryHtml')}
    return { gdEvery, gdAutoDue, syncNoteSave, gdEveryHtml };
  `)(cfg, calls, last);
  return { ...api, calls };
}

test('default is "after every change"; only 10 is accepted as an interval', () => {
  assert.strictEqual(rig().gdEvery(), 0);
  assert.strictEqual(rig({ every: 10 }).gdEvery(), 10);
  assert.strictEqual(rig({ every: '10' }).gdEvery(), 10);
  assert.strictEqual(rig({ every: 7 }).gdEvery(), 0, 'unknown values fall back to the default');
});

test('after every change: each autosave schedules a Drive sync', () => {
  const r = rig(); r.syncNoteSave();
  assert.deepStrictEqual(r.calls, ['bc', 'soon']);
});

test('every 10 minutes: autosaves do not upload (other windows still hear about it)', () => {
  const r = rig({ every: 10 }); r.syncNoteSave();
  assert.deepStrictEqual(r.calls, ['bc']);
});

test('minute tick: default polls only while visible; 10-minute mode waits 10 minutes, even in a background tab', () => {
  const { gdAutoDue } = rig(), t0 = 1_000_000;
  assert.strictEqual(gdAutoDue(t0, 0, t0, false), true);
  assert.strictEqual(gdAutoDue(t0, 0, t0, true), false);
  assert.strictEqual(gdAutoDue(t0 + 9 * 60000, 10, t0, false), false);
  assert.strictEqual(gdAutoDue(t0 + 10 * 60000, 10, t0, true), true);
  assert.strictEqual(gdAutoDue(t0, 10, 0, false), true, 'never synced yet: due at once');
});

test('dialog: the select shows the current choice, and the 10-minute note tells when the next save is', () => {
  const def = rig().gdEveryHtml();
  assert.match(def, /data-gdevery/);
  assert.match(def, /<option value="0" selected>After every change/);
  assert.doesNotMatch(def, /next in/);
  const ten = rig({ every: 10 }, Date.now() - 3 * 60000).gdEveryHtml();
  assert.match(ten, /<option value="10" selected>Every 10 minutes/);
  assert.match(ten, /next in ≈ 7 min/);
});

test('wiring: connected section shows it, the change handler stores it, the boot timer and tab return respect it', () => {
  assert.match(fnSrcOf(src, 'gdSectionHtml'), /gdEveryHtml\(\)/);
  assert.match(src, /closest\('\[data-gdevery\]'\)[\s\S]{0,200}c\.every = v; else delete c\.every; gdSetCfg\(c\)/);
  const boot = fnSrcOf(src, 'syncBoot');
  assert.match(boot, /gdAutoDue\(Date\.now\(\), gdEvery\(\), gd\.last, document\.hidden\)/);
  assert.match(boot, /visibilitychange[^\n]*!gdEvery\(\)/);
});
