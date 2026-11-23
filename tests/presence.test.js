/* Live online-users presence tests: Cloudflare Worker / Durable Object
   behaviour, wrangler.toml free-plan config, and the real client functions
   cut out of app.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const workerSrc = read('presence/worker.mjs');
const wranglerSrc = read('presence/wrangler.toml');
const appSrc = read('app.js');

/* ---------- Cloudflare Worker + Durable Object sandbox ---------- */
function makeWorkerEnv(allowedOrigins = 'https://mewego.github.io') {
  class MockSocket {
    constructor() {
      this.readyState = 1;
      this.sent = [];
      this.closed = null;
      this.throwOnSend = false;
    }
    send(msg) {
      if (this.throwOnSend) throw new Error('broken pipe');
      if (this.readyState !== 1) throw new Error('socket not open');
      this.sent.push(msg);
    }
    close(code, reason = '') {
      // Cloudflare Workers throw RangeError on reserved close codes 1005 / 1006.
      if (code !== undefined && code !== 1000 && code !== 1001 && code !== 1009 && code !== 1011 && !(code >= 3000 && code <= 4999)) {
        throw new RangeError('Invalid WebSocket close code: ' + code);
      }
      this.closed = { code: code ?? 1000, reason };
      this.readyState = 3;
    }
  }
  class MockWebSocketPair {
    constructor() {
      this[0] = new MockSocket();
      this[1] = new MockSocket();
    }
  }
  class MockWebSocketRequestResponsePair {
    constructor(request, response) {
      this.request = request;
      this.response = response;
    }
  }
  class MockDurableObject {
    constructor(ctx, env) {
      this.ctx = ctx;
      this.env = env;
    }
  }
  class MockResponse {
    constructor(body = null, init = {}) {
      this.body = body;
      this.status = init.status ?? 200;
      this.headers = new Headers(init.headers || {});
      if (init.webSocket) this.webSocket = init.webSocket;
    }
    async text() { return this.body == null ? '' : String(this.body); }
    async json() { return JSON.parse(await this.text()); }
  }

  const transformed = workerSrc
    .replace(/^\s*import\s+\{\s*DurableObject\s*\}\s+from\s+['"]cloudflare:workers['"];\s*/m, '')
    .replace(/\bexport\s+class\s+/g, 'class ')
    .replace(/\bexport\s+default\s+/, 'const worker = ');

  const { PresenceRoom, worker } = new Function(
    'DurableObject', 'WebSocketPair', 'WebSocketRequestResponsePair', 'Response',
    `${transformed}\nreturn { PresenceRoom, worker };`,
  )(MockDurableObject, MockWebSocketPair, MockWebSocketRequestResponsePair, MockResponse);

  const sockets = [];
  const ctx = {
    autoResponse: null,
    setWebSocketAutoResponse(pair) { this.autoResponse = pair; },
    acceptWebSocket(ws) { sockets.push(ws); },
    getWebSockets() { return sockets.slice(); },
  };
  let room = null;
  let idNames = [];
  const env = {
    ALLOWED_ORIGINS: allowedOrigins,
    PRESENCE: {
      idFromName(name) { idNames.push(name); return { name }; },
      get() {
        if (!room) room = new PresenceRoom(ctx, env);
        return room;
      },
    },
  };
  // Instantiate once if a test checks constructor behaviour directly.
  const ensureRoom = () => env.PRESENCE.get(env.PRESENCE.idFromName('global'));
  return { PresenceRoom, worker, ctx, env, sockets, idNames, ensureRoom };
}

test('presence/wrangler.toml targets worker.mjs with Free-plan SQLite DO migration', () => {
  assert.match(wranglerSrc, /^main\s*=\s*"worker\.mjs"/m);
  assert.match(wranglerSrc, /name\s*=\s*"PRESENCE"/);
  assert.match(wranglerSrc, /class_name\s*=\s*"PresenceRoom"/);
  assert.match(wranglerSrc, /new_sqlite_classes\s*=\s*\["PresenceRoom"\]/);
  assert.doesNotMatch(wranglerSrc, /\bnew_classes\b/);
  assert.match(wranglerSrc, /ALLOWED_ORIGINS\s*=\s*"https:\/\/mewego\.github\.io"/);
});

test('PresenceRoom constructor registers ping->pong auto-response for hibernation', () => {
  const { ctx, ensureRoom } = makeWorkerEnv();
  ensureRoom();
  assert.ok(ctx.autoResponse, 'expected setWebSocketAutoResponse call');
  assert.strictEqual(ctx.autoResponse.request, 'ping');
  assert.strictEqual(ctx.autoResponse.response, 'pong');
});

test('Worker OPTIONS preflight allows configured origin and rejects unknown origin', async () => {
  const { worker, env } = makeWorkerEnv();
  const ok = await worker.fetch(new Request('https://presence.example/count', {
    method: 'OPTIONS',
    headers: { Origin: 'https://mewego.github.io' },
  }), env);
  assert.strictEqual(ok.status, 204);
  assert.strictEqual(ok.headers.get('Access-Control-Allow-Origin'), 'https://mewego.github.io');
  assert.match(ok.headers.get('Access-Control-Allow-Methods') || '', /GET/);

  const bad = await worker.fetch(new Request('https://presence.example/count', {
    method: 'OPTIONS',
    headers: { Origin: 'https://evil.example' },
  }), env);
  assert.strictEqual(bad.status, 403);
});

test('Worker /ws validates Origin, broadcasts live counts, and handles close/error/zombie sockets', async () => {
  const { worker, env, sockets, ensureRoom } = makeWorkerEnv();

  // Missing or unknown Origin is rejected on WebSocket upgrade.
  const noOrigin = await worker.fetch(new Request('https://presence.example/ws', {
    headers: { Upgrade: 'websocket' },
  }), env);
  assert.strictEqual(noOrigin.status, 403);

  const badOrigin = await worker.fetch(new Request('https://presence.example/ws', {
    headers: { Upgrade: 'websocket', Origin: 'https://other.example' },
  }), env);
  assert.strictEqual(badOrigin.status, 403);

  // Unknown route returns 404.
  const notFound = await worker.fetch(new Request('https://presence.example/nope'), env);
  assert.strictEqual(notFound.status, 404);

  // First client connects -> receives {"online":1}.
  const r1 = await worker.fetch(new Request('https://presence.example/ws', {
    headers: { Upgrade: 'websocket', Origin: 'https://mewego.github.io' },
  }), env);
  assert.strictEqual(r1.status, 101);
  assert.ok(r1.webSocket, 'expected client WebSocket in 101 response');
  assert.strictEqual(sockets.length, 1);
  assert.deepStrictEqual(sockets[0].sent, ['{"online":1}']);

  // Second client connects on '/' -> both receive {"online":2}.
  const r2 = await worker.fetch(new Request('https://presence.example/', {
    headers: { Upgrade: 'websocket', Origin: 'https://mewego.github.io' },
  }), env);
  assert.strictEqual(r2.status, 101);
  assert.strictEqual(sockets.length, 2);
  assert.deepStrictEqual(sockets[0].sent.at(-1), '{"online":2}');
  assert.deepStrictEqual(sockets[1].sent.at(-1), '{"online":2}');

  // Third client connects -> all receive {"online":3}.
  const r3 = await worker.fetch(new Request('https://presence.example/ws', {
    headers: { Upgrade: 'websocket', Origin: 'https://mewego.github.io' },
  }), env);
  assert.strictEqual(r3.status, 101);
  assert.deepStrictEqual(sockets[0].sent.at(-1), '{"online":3}');

  // Reserved close codes (1005 / 1006) map safely to 1000 and broadcast decremented count.
  const room = ensureRoom();
  await room.webSocketClose(sockets[2], 1006, 'abnormal');
  assert.strictEqual(sockets[2].closed.code, 1000);
  assert.strictEqual(sockets[0].sent.at(-1), '{"online":2}');
  assert.strictEqual(sockets[1].sent.at(-1), '{"online":2}');

  // webSocketError closes the errored socket and broadcasts {"online":1}.
  await room.webSocketError(sockets[1]);
  assert.strictEqual(sockets[1].closed.code, 1011);
  assert.strictEqual(sockets[0].sent.at(-1), '{"online":1}');

  // Zombie socket whose send() throws during broadcast gets closed and remaining socket gets corrected count.
  const r4 = await worker.fetch(new Request('https://presence.example/ws', {
    headers: { Upgrade: 'websocket', Origin: 'https://mewego.github.io' },
  }), env);
  assert.strictEqual(r4.status, 101);
  const zombie = sockets[3];
  zombie.throwOnSend = true;
  const r5 = await worker.fetch(new Request('https://presence.example/ws', {
    headers: { Upgrade: 'websocket', Origin: 'https://mewego.github.io' },
  }), env);
  assert.strictEqual(r5.status, 101);
  assert.strictEqual(zombie.closed.code, 1011);
  assert.strictEqual(sockets[0].sent.at(-1), '{"online":2}');
  assert.strictEqual(sockets[4].sent.at(-1), '{"online":2}');
});

test('PresenceRoom webSocketMessage handles ping, ignores short payloads, and closes oversized messages', async () => {
  const { worker, env, sockets, ensureRoom } = makeWorkerEnv();
  await worker.fetch(new Request('https://presence.example/ws', {
    headers: { Upgrade: 'websocket', Origin: 'https://mewego.github.io' },
  }), env);
  await worker.fetch(new Request('https://presence.example/ws', {
    headers: { Upgrade: 'websocket', Origin: 'https://mewego.github.io' },
  }), env);

  const room = ensureRoom();
  const s0Before = sockets[0].sent.length;
  const s1Before = sockets[1].sent.length;

  await room.webSocketMessage(sockets[0], 'ping');
  assert.strictEqual(sockets[0].sent.at(-1), 'pong');
  assert.strictEqual(sockets[1].sent.length, s1Before);

  // Short arbitrary payload is never echoed or broadcast.
  await room.webSocketMessage(sockets[0], 'hello');
  assert.strictEqual(sockets[0].sent.length, s0Before + 1);
  assert.strictEqual(sockets[1].sent.length, s1Before);

  // Oversized message (> 64 chars) closes sender with 1009 and updates remaining client to 1.
  await room.webSocketMessage(sockets[0], 'x'.repeat(65));
  assert.strictEqual(sockets[0].closed.code, 1009);
  assert.strictEqual(sockets[1].sent.at(-1), '{"online":1}');
});

test('Worker GET /count returns live JSON without requiring Origin and enforces Origin when present', async () => {
  const { worker, env } = makeWorkerEnv();
  await worker.fetch(new Request('https://presence.example/ws', {
    headers: { Upgrade: 'websocket', Origin: 'https://mewego.github.io' },
  }), env);

  const direct = await worker.fetch(new Request('https://presence.example/count'), env);
  assert.strictEqual(direct.status, 200);
  assert.strictEqual(direct.headers.get('Cache-Control'), 'no-store');
  assert.deepStrictEqual(await direct.json(), { online: 1 });

  const cors = await worker.fetch(new Request('https://presence.example/count', {
    headers: { Origin: 'https://mewego.github.io' },
  }), env);
  assert.strictEqual(cors.status, 200);
  assert.strictEqual(cors.headers.get('Access-Control-Allow-Origin'), 'https://mewego.github.io');
  assert.deepStrictEqual(await cors.json(), { online: 1 });

  const denied = await worker.fetch(new Request('https://presence.example/count', {
    headers: { Origin: 'https://bad.example' },
  }), env);
  assert.strictEqual(denied.status, 403);
});

/* ---------- Client logic sandbox (cut directly from app.js) ---------- */
function makeClientEnv(initialLang = 'en', loc = { protocol: 'https:', hostname: 'mewego.github.io', search: '' }) {
  const listeners = { win: {}, doc: {} };
  const makeNode = () => ({
    hidden: true,
    textContent: '',
    title: '',
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    removeAttribute(k) { delete this.attrs[k]; },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
  });
  const nodes = { '#onlineWrap': makeNode(), '#onlineCnt': makeNode() };
  const mem = {};
  const store = {
    mem,
    getItem(k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem(k, v) { mem[k] = String(v); },
  };
  const openedSockets = [];
  const timers = [];
  const intervals = [];
  let nextId = 1;

  class StubWebSocket {
    constructor(url) {
      this.url = url;
      this.readyState = 1;
      this.sent = [];
      this.closedWith = null;
      openedSockets.push(this);
    }
    send(msg) { this.sent.push(msg); }
    close(code) {
      this.readyState = 3;
      this.closedWith = code;
      if (this.onclose) this.onclose();
    }
  }

  const presLine = /^const\s+pres\s*=\s*.*$/m.exec(appSrc);
  assert.ok(presLine, 'const pres missing from app.js');
  const presUrlLine = /^const\s+PRESENCE_URL\s*=\s*.*$/m.exec(appSrc);
  assert.ok(presUrlLine, 'const PRESENCE_URL missing from app.js');

  const api = new Function(
    'location', 'navigator', 'window', 'document', 'WebSocket', '$', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'initialLang', 'localStorage',
    `
    const uid = () => Math.random().toString(36).slice(2, 9);
    let lang = initialLang;
    const L = (tr, en) => (lang === 'en' ? en : tr);
    ${presUrlLine[0].replace(/\r$/, '')}
    ${presLine[0].replace(/\r$/, '')}
    ${fnSrcOf(appSrc, 'presenceEndpoint')}
    ${fnSrcOf(appSrc, 'presenceParseCount')}
    ${fnSrcOf(appSrc, 'presenceLabel')}
    ${fnSrcOf(appSrc, 'presenceRender')}
    ${fnSrcOf(appSrc, 'presenceDrop')}
    ${fnSrcOf(appSrc, 'presenceSchedule')}
    ${fnSrcOf(appSrc, 'presenceConnect')}
    ${fnSrcOf(appSrc, 'presenceDevId')}
    ${fnSrcOf(appSrc, 'presenceWithDev')}
    ${fnSrcOf(appSrc, 'presenceBoot')}
    return {
      presenceDevId,
      presenceWithDev,
      PRESENCE_URL,
      pres,
      setLang(v) { lang = v; },
      presenceEndpoint,
      presenceParseCount,
      presenceLabel,
      presenceRender,
      presenceDrop,
      presenceSchedule,
      presenceConnect,
      presenceBoot,
    };
    `,
  )(
    loc,
    { onLine: true },
    { addEventListener(ev, fn) { (listeners.win[ev] = listeners.win[ev] || []).push(fn); } },
    { hidden: false, addEventListener(ev, fn) { (listeners.doc[ev] = listeners.doc[ev] || []).push(fn); } },
    StubWebSocket,
    sel => nodes[sel] || null,
    (fn, ms) => { const id = nextId++; timers.push({ id, fn, ms, cleared: false }); return id; },
    id => { const t = timers.find(x => x.id === id); if (t) t.cleared = true; },
    (fn, ms) => { const id = nextId++; intervals.push({ id, fn, ms, cleared: false }); return id; },
    id => { const t = intervals.find(x => x.id === id); if (t) t.cleared = true; },
    initialLang,
    store,
  );

  return { api, nodes, openedSockets, timers, intervals, listeners, store };
}

test('presenceEndpoint resolves production URLs, local skips, and ?presence overrides', () => {
  const { api } = makeClientEnv();
  const prod = { protocol: 'https:', hostname: 'mewego.github.io', search: '' };
  assert.strictEqual(api.presenceEndpoint('https://floorplanner-presence.example.workers.dev', prod), 'wss://floorplanner-presence.example.workers.dev/ws');
  assert.strictEqual(api.presenceEndpoint('wss://floorplanner-presence.example.workers.dev/ws', prod), 'wss://floorplanner-presence.example.workers.dev/ws');
  assert.strictEqual(api.presenceEndpoint('', prod), '');
  assert.strictEqual(api.presenceEndpoint('https://floorplanner-presence.example.workers.dev', { protocol: 'https:', hostname: 'mewego.github.io', search: '?presence=off' }), '');
  assert.strictEqual(api.presenceEndpoint('https://floorplanner-presence.example.workers.dev', { protocol: 'file:', hostname: '', search: '' }), '');
  assert.strictEqual(api.presenceEndpoint('https://floorplanner-presence.example.workers.dev', { protocol: 'http:', hostname: '127.0.0.1', search: '' }), '');
  assert.strictEqual(api.presenceEndpoint('https://floorplanner-presence.example.workers.dev', { protocol: 'http:', hostname: 'localhost', search: '' }), '');
  assert.strictEqual(api.presenceEndpoint('', { protocol: 'http:', hostname: '127.0.0.1', search: '?presence=ws://127.0.0.1:8787' }), 'ws://127.0.0.1:8787/ws');
});

test('presenceParseCount and presenceRender validate counts and toggle bilingual badge', () => {
  const { api, nodes } = makeClientEnv('en');
  assert.strictEqual(api.presenceParseCount('{"online":4}'), 4);
  assert.strictEqual(api.presenceParseCount('{"online":3.9}'), 3);
  assert.strictEqual(api.presenceParseCount('pong'), null);
  assert.strictEqual(api.presenceParseCount('not-json'), null);
  assert.strictEqual(api.presenceParseCount('{"online":-1}'), null);

  api.pres.count = null;
  api.presenceRender();
  assert.strictEqual(nodes['#onlineWrap'].hidden, true);
  assert.strictEqual(nodes['#onlineCnt'].textContent, '');

  api.pres.count = 0;
  api.presenceRender();
  assert.strictEqual(nodes['#onlineWrap'].hidden, true);

  api.pres.count = 1;
  api.presenceRender();
  assert.strictEqual(nodes['#onlineWrap'].hidden, false);
  assert.strictEqual(nodes['#onlineCnt'].textContent, '1');
  assert.strictEqual(nodes['#onlineWrap'].title, '1 person online now');
  assert.strictEqual(nodes['#onlineWrap'].getAttribute('aria-label'), '1 person online now');

  api.pres.count = 5;
  api.presenceRender();
  assert.strictEqual(nodes['#onlineWrap'].title, '5 people online now');

  api.setLang('tr');
  api.presenceRender();
  assert.strictEqual(nodes['#onlineWrap'].title, '5 kişi şu an çevrimiçi');
  assert.strictEqual(nodes['#onlineWrap'].getAttribute('aria-label'), '5 kişi şu an çevrimiçi');
});

test('presenceBoot connects, handles keepalive/updates/reconnect, and stays off with ?presence=off', () => {
  // Disabled via ?presence=off -> zero sockets or event listeners registered.
  const offEnv = makeClientEnv('en', { protocol: 'https:', hostname: 'mewego.github.io', search: '?presence=off' });
  offEnv.api.presenceBoot();
  assert.strictEqual(offEnv.openedSockets.length, 0);
  assert.strictEqual(Object.keys(offEnv.listeners.win).length, 0);

  // Active via ?presence=ws://127.0.0.1:8787/ws -> connects, receives count, sends ping, reconnects on close.
  const onEnv = makeClientEnv('en', { protocol: 'http:', hostname: '127.0.0.1', search: '?presence=ws://127.0.0.1:8787/ws' });
  onEnv.api.presenceBoot();
  assert.strictEqual(onEnv.openedSockets.length, 1);
  const ws1 = onEnv.openedSockets[0];
  const dev = onEnv.store.mem.fp_dev;
  assert.match(dev, /^[A-Za-z0-9_-]{8,40}$/);
  assert.strictEqual(ws1.url, 'ws://127.0.0.1:8787/ws?d=' + dev);

  ws1.onopen();
  assert.strictEqual(onEnv.intervals.length, 1);
  onEnv.intervals[0].fn();
  assert.deepStrictEqual(ws1.sent, ['ping']);

  ws1.onmessage({ data: '{"online":6}' });
  assert.strictEqual(onEnv.nodes['#onlineWrap'].hidden, false);
  assert.strictEqual(onEnv.nodes['#onlineCnt'].textContent, '6');

  // Unexpected close clears badge and schedules reconnect timer.
  ws1.close(1000);
  assert.strictEqual(onEnv.nodes['#onlineWrap'].hidden, true);
  assert.strictEqual(onEnv.timers.length, 1);
  assert.ok(onEnv.timers[0].ms >= 2000 && onEnv.timers[0].ms <= 2500);

  // Firing reconnect timer opens a fresh WebSocket.
  onEnv.timers[0].fn();
  assert.strictEqual(onEnv.openedSockets.length, 2);

  // pagehide closes permanently without scheduling another retry.
  const beforeTimers = onEnv.timers.length;
  onEnv.listeners.win.pagehide.forEach(fn => fn());
  assert.strictEqual(onEnv.api.pres.closed, true);
  assert.strictEqual(onEnv.timers.length, beforeTimers);
});

test('presenceDevId keeps one anonymous id per browser and degrades without storage', () => {
  const { api, store } = makeClientEnv();
  const a = api.presenceDevId(store);
  assert.match(a, /^[A-Za-z0-9_-]{8,40}$/);
  assert.strictEqual(api.presenceDevId(store), a, 'a second tab reuses the stored id');
  store.setItem('fp_dev', 'bad id!');
  const b = api.presenceDevId(store);
  assert.notStrictEqual(b, 'bad id!');
  assert.match(b, /^[A-Za-z0-9_-]{8,40}$/);
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  assert.strictEqual(api.presenceDevId(broken), '');
  assert.strictEqual(api.presenceWithDev('wss://p.example/ws', ''), 'wss://p.example/ws');
  assert.strictEqual(api.presenceWithDev('wss://p.example/ws', 'abcdefgh12'), 'wss://p.example/ws?d=abcdefgh12');
  assert.strictEqual(api.presenceWithDev('', 'abcdefgh12'), '');
});

test('PresenceRoom counts tabs of the same browser once', async () => {
  const { worker, env, sockets, ensureRoom } = makeWorkerEnv();
  const open = d => worker.fetch(new Request('https://presence.example/ws' + (d ? '?d=' + d : ''), {
    headers: { Upgrade: 'websocket', Origin: 'https://mewego.github.io' },
  }), env);
  await open('browserAAAA1');
  assert.strictEqual(sockets[0].sent.at(-1), '{"online":1}');
  await open('browserAAAA1');
  assert.strictEqual(sockets[1].sent.at(-1), '{"online":1}', 'second tab, same browser');
  await open('browserBBBB2');
  assert.strictEqual(sockets[0].sent.at(-1), '{"online":2}');
  await open('');
  assert.strictEqual(sockets[0].sent.at(-1), '{"online":3}', 'older app without an id counts on its own');
  await open('<bad>');
  assert.strictEqual(sockets[0].sent.at(-1), '{"online":4}', 'an invalid id is ignored');

  const res = await worker.fetch(new Request('https://presence.example/count'), env);
  assert.deepStrictEqual(JSON.parse(await res.text()), { online: 4 });

  // Closing one of the two tabs of browser A keeps that person online.
  const room = ensureRoom();
  await room.webSocketClose(sockets[0], 1000, '');
  assert.strictEqual(sockets[1].sent.at(-1), '{"online":4}');
  await room.webSocketClose(sockets[1], 1000, '');
  assert.strictEqual(sockets[2].sent.at(-1), '{"online":3}');
});
