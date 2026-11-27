/* Guards for the "I sent a request and nothing happened" bug (Oct 2026).
   Two independent failures made the live-AI flow feel dead:

   1. Feedback vanished. After Send, the panel said "Sent ✓" for 5 seconds and
      then reverted to a neutral hint, and the pill showed nothing at all — so
      a queued request looked identical to a request that never arrived.
   2. A bridge restart was fatal. The client stops probing once connected, and
      SSE onerror closed the EventSource for good, so an already-open tab never
      reconnected until the user reloaded.

   These are source-level assertions because the behaviour lives in DOM code the
   unit tests cannot boot. The bridge side (requests, snapshots, CORS, SSE) is
   tested over HTTP in bridge.test.js, and ?bridge=off by the smoke check "the
   test tab stays off any running AI bridge". */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, constLineOf } = require('./helpers/repo');

const js = read('app.js');
const sliceFn = name => fnSrcOf(js, name);

test('the AI pill carries a pending-request counter', () => {
  assert.match(js, /id = AI_PILL_ID/, 'the AI pill was renamed');
  assert.match(js, /data-ai-pending/, 'the pill has no pending badge element');
  assert.ok(js.indexOf('[data-ai-pending]') < js.indexOf('function brgSetPending') + 4000,
    'the badge is never written to');
});

test('the send state does not disappear on a timer', () => {
  const send = sliceFn('aiSendRequest');
  // The regression: a 5 s timer reset the confirmation, hiding a queued request.
  assert.doesNotMatch(send, /setTimeout\([^)]*st\.textContent/, 'aiSendRequest() hides the sent state on a timer again');
  assert.match(send, /brgRefreshPending\(\)/, 'aiSendRequest() must re-read the queue after posting');
});

test('pending state stays visible until the agent drains the queue', () => {
  const sync = sliceFn('aiSyncSendState');
  assert.match(sync, /brgPending/, 'aiSyncSendState() ignores the pending count');
  assert.match(sync, /waiting/i, 'the waiting message is gone');
  assert.match(sync, /brgAckAt/, 'the "agent picked it up" confirmation is gone');
  // and the badge/count has to be refreshed from the bridge, not only in-panel
  assert.match(sliceFn('brgRefreshPending'), /\/__requests/, 'brgRefreshPending() does not read the queue');
  assert.match(sliceFn('brgConnect'), /addEventListener\('requests-changed'/, 'acknowledgements no longer refresh the badge');
  assert.match(sliceFn('brgConnect'), /addEventListener\('request'/, 'new requests no longer refresh the badge');
});

test('a dropped bridge connection resumes probing instead of dying', () => {
  const set = sliceFn('brgSetConnected');
  assert.match(set, /brgStartProbe\(\)/, 'brgSetConnected(false) must restart the probe');
  const start = sliceFn('brgStartProbe');
  assert.match(start, /setTimeout/, 'brgStartProbe() no longer polls');
  assert.match(start, /if \(brgProbeTimer \|\| brgEs\) return;/, 'brgStartProbe() must be idempotent');
  // brgProbe must schedule the poll when the first attempt fails
  assert.match(sliceFn('brgProbe'), /brgStartProbe\(\)/, 'brgProbe() drops the retry when the first attempt fails');
});

test('the panel changes its wording when the bridge can wake the agent', () => {
  assert.match(sliceFn('brgRefreshPending'), /brgWake\s*=/, 'brgRefreshPending() ignores the wake flag returned by the bridge');
  assert.match(sliceFn('aiSyncSendState'), /brgWake/, 'aiSyncSendState() never shows the waking state');
  assert.match(sliceFn('aiPendingTitle'), /brgWake/, 'the pill tooltip never mentions waking');
});

test('the panel offers a "go back" list backed by real snapshot files', () => {
  assert.match(js, /data-ai-snaps/, 'the panel has no saved-versions list');
  const refresh = sliceFn('aiRefreshSnapshots');
  assert.match(refresh, /\/__snapshots/, 'the list never reads /__snapshots');
  assert.match(refresh, /L\(/, 'the saved-versions list must be bilingual');
  const restore = sliceFn('aiRestoreSnapshot');
  assert.match(restore, /\/__snapshots\/restore/, 'restore does not call the restore endpoint');
  assert.match(restore, /confirm\(/, 'restoring must ask before replacing the plan');
});


// #192: a fresh browser never contacts 127.0.0.1 at boot; once wanted the probe backs off and skips hidden tabs
test('bridge probing is opt-in and backs off (#192)', async () => {
  const code = [
    "const BRIDGE_OFF = false, BRIDGE_SEEN = 'fp_bridge_rev';",
    'const localStorage = store, document = doc;',
    'let brgEs = null, brgProbeTimer = null, connects = 0, connectOk = false;',
    'const setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };',
    'const clearTimeout = () => {};',
    'const brgConnect = async () => { connects++; return connectOk; };',
    ...['BRIDGE_USED', 'BRIDGE_DELAYS', 'brgProbeDelay', 'brgUsedBefore'].map(n => constLineOf(js, n)),
    'let brgWanted = false, brgFails = 0;',
    ...['brgWant', 'brgStartProbe', 'brgProbe', 'brgStopProbe', 'aiBridgeBoot'].map(sliceFn),
    'return { aiBridgeBoot, brgWant, brgStartProbe, brgUsedBefore, get connects() { return connects; } };',
  ].join('\n');
  const env = (store, doc, timers) => new Function('store', 'doc', 'timers', code)(store, doc, timers);
  const mem = m => ({ getItem: k => (k in m ? m[k] : null) });
  const flush = () => new Promise(r => setImmediate(r));

  // fresh profile: boot makes no request and schedules nothing
  let timers = [];
  let b = env(mem({}), { hidden: false }, timers);
  b.aiBridgeBoot(); await flush();
  assert.strictEqual(b.connects, 0);
  assert.strictEqual(timers.length, 0);
  assert.strictEqual(b.brgUsedBefore(mem({ fp_bridge_used: '1' })), true);
  assert.strictEqual(b.brgUsedBefore(mem({ fp_bridge_rev: '7' })), true, 'browsers that synced before keep auto-connecting');

  // a browser that used the bridge probes at boot, then backs off 10 s → 1 min → 5 min (capped)
  timers = [];
  b = env(mem({ fp_bridge_used: '1' }), { hidden: false }, timers);
  b.aiBridgeBoot(); await flush();
  assert.strictEqual(b.connects, 1);
  const seen = [];
  for (let i = 0; i < 4; i++) { const t = timers.shift(); seen.push(t.ms); await t.fn(); await flush(); }
  assert.deepStrictEqual(seen, [10000, 60000, 300000, 300000]);
  assert.strictEqual(b.connects, 5);

  // hidden tab: the timer fires but does not contact the bridge
  timers = [];
  b = env(mem({}), { hidden: true }, timers);
  b.brgWant(); b.brgStartProbe();
  await timers.shift().fn(); await flush();
  assert.strictEqual(b.connects, 0, 'a hidden tab must not probe');
  assert.strictEqual(timers.length, 1, 'the probe stays scheduled while hidden');
});
