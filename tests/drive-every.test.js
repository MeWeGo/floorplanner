/* ☁ Sync dialog: "Save to Drive" after every change (default) or on a timer the user sets (any number of seconds,
   minutes or hours, 10 s – 7 days). Runs the real helpers cut out of app.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js');
const line = name => { const i = src.indexOf('const ' + name); assert.ok(i >= 0, name + ' is gone'); return src.slice(i, src.indexOf('\n', i)); };

function rig(cfg = {}, last = 0) {
  const calls = [];
  const api = new Function('cfg', 'calls', 'last', `
    const L = (tr, en) => en, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const gdCfg = () => ({ ...cfg }), gdSetCfg = c => { for (const k of Object.keys(cfg)) delete cfg[k]; Object.assign(cfg, c); }, gd = { last };
    const bcPost = () => calls.push('bc'), gdSyncSoon = () => calls.push('soon');
    ${line('GD_EVERY_MIN')}
    ${line('GD_UNITS')}
    ${['gdEvery', 'gdEveryUnit', 'gdFmtDur', 'gdAutoDue', 'gdSetEvery', 'syncNoteSave', 'gdEveryHtml'].map(n => fnSrcOf(src, n)).join('\n')}
    return { gdEvery, gdEveryUnit, gdFmtDur, gdAutoDue, gdSetEvery, syncNoteSave, gdEveryHtml };
  `)(cfg, calls, last);
  return { ...api, calls, cfg };
}

test('interval: any number of seconds, clamped to 10 s – 7 days; junk = after every change', () => {
  assert.strictEqual(rig().gdEvery(), 0);
  assert.strictEqual(rig({ every: 90 }).gdEvery(), 90);
  assert.strictEqual(rig({ every: '45' }).gdEvery(), 45);
  assert.strictEqual(rig({ every: 3 }).gdEvery(), 10, 'below the minimum');
  assert.strictEqual(rig({ every: 1e9 }).gdEvery(), 7 * 86400, 'above the maximum');
  assert.strictEqual(rig({ every: 'x' }).gdEvery(), 0);
  assert.strictEqual(rig({ every: -5 }).gdEvery(), 0);
});

test('unit: the one the user picked, else the largest that divides evenly', () => {
  assert.strictEqual(rig({ everyU: 'm' }).gdEveryUnit(7200), 'm');
  assert.strictEqual(rig().gdEveryUnit(7200), 'h');
  assert.strictEqual(rig().gdEveryUnit(600), 'm');
  assert.strictEqual(rig().gdEveryUnit(45), 's');
});

test('duration text', () => {
  const { gdFmtDur } = rig();
  assert.strictEqual(gdFmtDur(45), '45 s');
  assert.strictEqual(gdFmtDur(600), '10 min');
  assert.strictEqual(gdFmtDur(9000), '2 h 30 min');
  assert.strictEqual(gdFmtDur(3600), '1 h');
});

test('gdSetEvery stores seconds + unit, clamps, and 0 clears both', () => {
  const r = rig();
  assert.strictEqual(r.gdSetEvery(2 * 3600, 'h'), 7200);
  assert.deepStrictEqual(r.cfg, { every: 7200, everyU: 'h' });
  assert.strictEqual(r.gdSetEvery(2, 's'), 10, 'clamped to the minimum');
  assert.strictEqual(r.gdSetEvery(0), 0);
  assert.deepStrictEqual(r.cfg, {});
});

test('autosave: uploads after every change by default, never on a timer', () => {
  const a = rig(); a.syncNoteSave(); assert.deepStrictEqual(a.calls, ['bc', 'soon']);
  const b = rig({ every: 30 }); b.syncNoteSave(); assert.deepStrictEqual(b.calls, ['bc']);
});

test('tick: default polls each minute while visible; a timer waits its interval (also hidden); failures retry at most each minute', () => {
  const { gdAutoDue } = rig(), t = 10_000_000;
  assert.strictEqual(gdAutoDue(t + 59_000, 0, t, 0, false), false);
  assert.strictEqual(gdAutoDue(t + 60_000, 0, t, 0, false), true);
  assert.strictEqual(gdAutoDue(t + 60_000, 0, t, 0, true), false, 'hidden tab, default mode');
  assert.strictEqual(gdAutoDue(t + 25_000, 30, t, 0, true), false);
  assert.strictEqual(gdAutoDue(t + 30_000, 30, t, 0, true), true, 'timer runs in a background tab');
  assert.strictEqual(gdAutoDue(t + 2 * 3600e3, 3600, t, 0, false), true);
  // last sync failed (gd.last stays old): a 2 h timer retries a minute after the failed try, not every tick
  const tried = t + 7200e3;
  assert.strictEqual(gdAutoDue(tried + 5_000, 7200, t, tried, false), false);
  assert.strictEqual(gdAutoDue(tried + 60_000, 7200, t, tried, false), true);
  // a 10 s timer is not slowed by the retry rule
  assert.strictEqual(gdAutoDue(t + 10_000, 10, t, t, false), true);
});

test('dialog: mode select; on a timer a number + seconds / minutes / hours and when the next save is', () => {
  const def = rig().gdEveryHtml();
  assert.match(def, /data-gdmode/);
  assert.match(def, /<option value="0" selected>After every change/);
  assert.doesNotMatch(def, /data-gdeveryn/);
  const r = rig({ every: 5400, everyU: 'm' }, Date.now() - 10 * 60000).gdEveryHtml();
  assert.match(r, /<option value="1" selected>On a timer/);
  assert.match(r, /data-gdeveryn[^>]*value="90"/);
  assert.match(r, /<option value="m" selected>minutes/);
  assert.match(r, /every 1 h 30 min/);
  assert.match(r, /next in ≈ 1 h 20 min/);
});

test('wiring: connected section, 5 s boot tick with retry stamp, tab return only in default mode', () => {
  assert.match(fnSrcOf(src, 'gdSectionHtml'), /gdEveryHtml\(\)/);
  const boot = fnSrcOf(src, 'syncBoot');
  assert.match(boot, /gdAutoDue\(now, gdEvery\(\), gd\.last, gd\.tryAt \|\| 0, document\.hidden\)\) \{ gd\.tryAt = now; gdSync\(false\); \}[\s\S]*?\}, 5000\)/);
  assert.match(boot, /visibilitychange[^\n]*!gdEvery\(\)/);
});
