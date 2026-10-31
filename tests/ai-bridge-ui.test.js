/* Guards for the "I sent a request and nothing happened" bug (Oct 2026).
   Two independent failures made the live-AI flow feel dead:

   1. Feedback vanished. After Send, the panel said "Sent ✓" for 5 seconds and
      then reverted to a neutral hint, and the pill showed nothing at all — so
      a queued request looked identical to a request that never arrived.
   2. A bridge restart was fatal. The client stops probing once connected, and
      SSE onerror closed the EventSource for good, so an already-open tab never
      reconnected until the user reloaded.

   These are source-level assertions because the behaviour lives in DOM code the
   unit tests cannot boot; browser-smoke.js still proves the page renders. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const js = read('app.js');
const sliceFn = name => {
  const start = js.indexOf('function ' + name);
  assert.ok(start > 0, name + '() is gone');
  const end = js.indexOf('\n}', start);
  return js.slice(start, end);
};

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
  assert.match(start, /setInterval/, 'brgStartProbe() no longer polls');
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
  // the bridge must actually persist snapshots, not just advertise them
  const bridge = read('mcp/bridge.js');
  assert.match(bridge, /function checkpoint\(/, 'the bridge has no checkpoint()');
  assert.match(bridge, /\.fp-history|HIST_DIR/, 'snapshots are not written to disk');
  assert.match(bridge, /p === '\/__snapshots'/, 'GET /__snapshots is gone');
  assert.match(bridge, /p === '\/__snapshots\/restore'/, 'POST /__snapshots/restore is gone');
});

test('the bridge keeps the endpoints this UI depends on', () => {
  const bridge = read('mcp/bridge.js');
  assert.match(bridge, /p === '\/__requests'/, 'GET/POST /__requests is gone');
  assert.match(bridge, /Access-Control-Allow-Private-Network/, 'the private-network header is gone');
  assert.match(bridge, /event: ' \+ name \+ '\\ndata: '/, 'SSE event framing changed');
});
