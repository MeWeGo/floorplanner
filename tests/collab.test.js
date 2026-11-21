/* Simultaneous editing tests: CollabRoom Durable Object + worker routing,
   pure COLLAB-DIFF delta/apply/invert engine cut from app.js, and client endpoint. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, markerBlock, fnSrcOf } = require('./helpers/repo');

const workerSrc = read('presence/worker.mjs');
const appSrc = read('app.js');

/* ---------- Collab worker sandbox ---------- */
function makeCollabWorkerEnv(allowedOrigins = 'https://mewego.github.io') {
  class MockSocket {
    constructor() {
      this.readyState = 1;
      this.sent = [];
      this.closed = null;
      this.attachment = null;
    }
    send(msg) {
      if (this.readyState !== 1) throw new Error('socket not open');
      this.sent.push(msg);
    }
    close(code, reason = '') {
      if (code !== undefined && code !== 1000 && code !== 1001 && code !== 1009 && code !== 1011 && !(code >= 3000 && code <= 4999)) {
        throw new RangeError('Invalid WebSocket close code: ' + code);
      }
      this.closed = { code: code ?? 1000, reason };
      this.readyState = 3;
    }
    serializeAttachment(v) { this.attachment = JSON.parse(JSON.stringify(v)); }
    deserializeAttachment() { return this.attachment; }
  }
  class MockWebSocketPair {
    constructor() { this[0] = new MockSocket(); this[1] = new MockSocket(); }
  }
  class MockWebSocketRequestResponsePair {
    constructor(request, response) { this.request = request; this.response = response; }
  }
  class MockDurableObject {
    constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  }
  class MockResponse {
    constructor(body = null, init = {}) {
      this.body = body;
      this.status = init.status ?? 200;
      this.headers = new Headers(init.headers || {});
      if (init.webSocket) this.webSocket = init.webSocket;
    }
    async text() { return this.body == null ? '' : String(this.body); }
  }

  const transformed = workerSrc
    .replace(/^\s*import\s+\{\s*DurableObject\s*\}\s+from\s+['"]cloudflare:workers['"];\s*/m, '')
    .replace(/\bexport\s+class\s+/g, 'class ')
    .replace(/\bexport\s+default\s+/, 'const worker = ');

  const { CollabRoom, worker } = new Function(
    'DurableObject', 'WebSocketPair', 'WebSocketRequestResponsePair', 'Response',
    `${transformed}\nreturn { CollabRoom, worker };`,
  )(MockDurableObject, MockWebSocketPair, MockWebSocketRequestResponsePair, MockResponse);

  const rooms = new Map();
  function roomFor(name) {
    if (!rooms.has(name)) {
      const sockets = [];
      const ctx = {
        autoResponse: null,
        setWebSocketAutoResponse(pair) { this.autoResponse = pair; },
        acceptWebSocket(ws) { sockets.push(ws); },
        getWebSockets() { return sockets.filter(s => s.readyState === 1); },
      };
      rooms.set(name, { room: new CollabRoom(ctx, env), sockets, ctx });
    }
    return rooms.get(name);
  }
  const env = {
    ALLOWED_ORIGINS: allowedOrigins,
    PRESENCE: { idFromName: name => ({ name }), get: () => ({ fetch: async () => new MockResponse('ok') }) },
    COLLAB: {
      idFromName: name => ({ name }),
      get: ({ name }) => roomFor(name).room,
    },
  };
  return { worker, env, roomFor };
}

function makeDiffEnv() {
  const block = markerBlock(appSrc, 'COLLAB-DIFF');
  return new Function(`${block}\nreturn { collabDiff, collabApply, collabInvert };`)();
}

function makeClientCollabEnv(loc = { protocol: 'https:', hostname: 'mewego.github.io', search: '' }) {
  const presUrlLine = /^const\s+PRESENCE_URL\s*=\s*.*$/m.exec(appSrc);
  const fn = fnSrcOf(appSrc, 'collabEndpoint');
  return new Function('location', `${presUrlLine[0]}\n${fn}\nreturn { collabEndpoint };`)(loc);
}

function baseProject() {
  return {
    v: 2,
    id: 'proj1234',
    name: 'Test Plan',
    grid: 10,
    gridType: 'square',
    wallT: 20,
    wallH: 270,
    activeLayer: '0',
    layers: [{ id: '0', name: 'Default', color: '#64748b', vis: true, lock: false, print: true }],
    textures: [],
    floors: [
      {
        id: 'f1', name: 'Ground Floor', slabFloor: 'none', slabColor: null,
        walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20, h: 270, wt: 'solid' }],
        ops: [], furn: [], rooms: [], slabs: [], voids: [], sections: [], axes: [], dims: [], texts: [], sketches: [], drafts: [], groups: [],
      },
    ],
  };
}

test('CollabRoom routing validates origin, upgrade, and roomId format', async () => {
  const { worker, env } = makeCollabWorkerEnv();
  const badRoom = await worker.fetch(new Request('https://x.example/collab/ab', {
    headers: { Upgrade: 'websocket', Origin: 'https://mewego.github.io' },
  }), env);
  assert.strictEqual(badRoom.status, 404);

  const badOrigin = await worker.fetch(new Request('https://x.example/collab/room123456', {
    headers: { Upgrade: 'websocket', Origin: 'https://evil.example' },
  }), env);
  assert.strictEqual(badOrigin.status, 403);

  const noUpgrade = await worker.fetch(new Request('https://x.example/collab/room123456', {
    headers: { Origin: 'https://mewego.github.io' },
  }), env);
  assert.strictEqual(noUpgrade.status, 426);
});

test('CollabRoom relays seed, object patches, presence, and clears ephemeral state on empty', async () => {
  const { worker, env, roomFor } = makeCollabWorkerEnv();
  const { collabDiff } = makeDiffEnv();

  const r1 = await worker.fetch(new Request('https://x.example/collab/room_alpha1', {
    headers: { Upgrade: 'websocket', Origin: 'https://mewego.github.io' },
  }), env);
  assert.strictEqual(r1.status, 101);
  const { room, sockets } = roomFor('room_alpha1');
  const w1 = JSON.parse(sockets[0].sent[0]);
  assert.strictEqual(w1.type, 'welcome');
  assert.strictEqual(w1.state, null);
  assert.strictEqual(w1.rev, 0);

  // Peer 1 seeds initial project.
  const p0 = baseProject();
  await room.webSocketMessage(sockets[0], JSON.stringify({ type: 'seed', state: p0, clientSeq: 1 }));
  assert.strictEqual(room.rev, 1);
  assert.strictEqual(JSON.parse(sockets[0].sent.at(-1)).type, 'ack');

  // Peer 2 joins and receives full seeded state immediately.
  const r2 = await worker.fetch(new Request('https://x.example/collab/room_alpha1', {
    headers: { Upgrade: 'websocket', Origin: 'https://mewego.github.io' },
  }), env);
  assert.strictEqual(r2.status, 101);
  const w2 = JSON.parse(sockets[1].sent[0]);
  assert.strictEqual(w2.type, 'welcome');
  assert.strictEqual(w2.rev, 1);
  assert.strictEqual(w2.state.floors[0].walls.length, 1);
  assert.strictEqual(w2.peers.length, 1);
  assert.strictEqual(JSON.parse(sockets[0].sent.at(-1)).type, 'peer_join');

  // Peer 2 attempting seed cannot overwrite existing authoritative state.
  const stale = baseProject();
  stale.name = 'Hijack';
  await room.webSocketMessage(sockets[1], JSON.stringify({ type: 'seed', state: stale }));
  assert.strictEqual(room.state.name, 'Test Plan');

  // Peer 1 sends a delta patch adding w2.
  const p1 = JSON.parse(JSON.stringify(p0));
  p1.floors[0].walls.push({ id: 'w2', a: { x: 400, y: 0 }, b: { x: 400, y: 300 }, t: 20, h: 270, wt: 'solid' });
  const patch = collabDiff(p0, p1);
  await room.webSocketMessage(sockets[0], JSON.stringify({ type: 'patch', patch, clientSeq: 2 }));
  assert.strictEqual(room.rev, 2);
  assert.strictEqual(room.state.floors[0].walls.length, 2);
  const relayed = JSON.parse(sockets[1].sent.at(-1));
  assert.strictEqual(relayed.type, 'patch');
  assert.strictEqual(relayed.rev, 2);

  // Presence updates relay to peer 1 with floorId & cursor coordinates.
  await room.webSocketMessage(sockets[1], JSON.stringify({ type: 'presence', name: 'Ada', floorId: 'f1', x: 120, y: 80, sel: ['w2'] }));
  const presMsg = JSON.parse(sockets[0].sent.at(-1));
  assert.strictEqual(presMsg.type, 'presence');
  assert.strictEqual(presMsg.peer.name, 'Ada');
  assert.deepStrictEqual(presMsg.peer.sel, ['w2']);

  // Oversized message (> 512 KB) closes socket with 1009.
  await room.webSocketMessage(sockets[1], 'x'.repeat(512 * 1024 + 10));
  assert.strictEqual(sockets[1].closed.code, 1009);
  assert.strictEqual(JSON.parse(sockets[0].sent.at(-1)).type, 'peer_leave');

  // Last socket closes -> ephemeral room state resets to null.
  await room.webSocketClose(sockets[0], 1005, '');
  assert.strictEqual(sockets[0].closed.code, 1000);
  assert.strictEqual(room.state, null);
  assert.strictEqual(room.rev, 0);
});

test('COLLAB-DIFF merges concurrent edits and isolates per-user undo', () => {
  const { collabDiff, collabApply, collabInvert } = makeDiffEnv();
  const p0 = baseProject();

  // User A modifies wall w1 and adds wall wA; User B adds furn fB on the same floor.
  const aNext = JSON.parse(JSON.stringify(p0));
  aNext.floors[0].walls[0].b.x = 500;
  aNext.floors[0].walls.push({ id: 'wA', a: { x: 500, y: 0 }, b: { x: 500, y: 300 }, t: 20, h: 270, wt: 'solid' });
  const patchA = collabDiff(p0, aNext);
  const invA = collabInvert(p0, patchA);

  const bNext = JSON.parse(JSON.stringify(p0));
  bNext.floors[0].furn.push({ id: 'fB', type: 'chair', x: 150, y: 150, w: 45, d: 45, h: 45, rot: 0 });
  const patchB = collabDiff(p0, bNext);

  // Apply both patches sequentially onto shared doc.
  const shared = JSON.parse(JSON.stringify(p0));
  collabApply(shared, patchA);
  collabApply(shared, patchB);
  assert.strictEqual(shared.floors[0].walls.length, 2);
  assert.strictEqual(shared.floors[0].walls[0].b.x, 500);
  assert.strictEqual(shared.floors[0].furn.length, 1);
  assert.strictEqual(shared.floors[0].furn[0].id, 'fB');

  // User A undoes their edit -> w1 reverts to 400 and wA disappears, while User B's chair stays!
  collabApply(shared, invA);
  assert.strictEqual(shared.floors[0].walls.length, 1);
  assert.strictEqual(shared.floors[0].walls[0].b.x, 400);
  assert.strictEqual(shared.floors[0].furn.length, 1);
  assert.strictEqual(shared.floors[0].furn[0].id, 'fB');

  // Redo A's patch -> wA returns, fB still intact.
  collabApply(shared, patchA);
  assert.strictEqual(shared.floors[0].walls.length, 2);
  assert.strictEqual(shared.floors[0].furn.length, 1);
});

test('COLLAB-DIFF handles floor creation, deletion, reordering, and inverse', () => {
  const { collabDiff, collabApply, collabInvert } = makeDiffEnv();
  const p0 = baseProject();

  // A adds floor f2, B concurrently adds floor f3.
  const a1 = JSON.parse(JSON.stringify(p0));
  a1.floors.push({ ...baseProject().floors[0], id: 'f2', name: 'Upper Floor', walls: [] });
  const patchAddA = collabDiff(p0, a1);
  const invAddA = collabInvert(p0, patchAddA);

  const b1 = JSON.parse(JSON.stringify(p0));
  b1.floors.push({ ...baseProject().floors[0], id: 'f3', name: 'Roof Floor', walls: [] });
  const patchAddB = collabDiff(p0, b1);

  const shared = JSON.parse(JSON.stringify(p0));
  collabApply(shared, patchAddA);
  collabApply(shared, patchAddB);
  assert.deepStrictEqual(shared.floors.map(f => f.id), ['f1', 'f3', 'f2']);

  // A undoes adding f2 -> f2 is removed without wiping f3.
  collabApply(shared, invAddA);
  assert.deepStrictEqual(shared.floors.map(f => f.id), ['f1', 'f3']);

  // Deleting f3 and inverting restores f3 cleanly.
  const beforeDel = JSON.parse(JSON.stringify(shared));
  const afterDel = JSON.parse(JSON.stringify(shared));
  afterDel.floors.pop();
  const delPatch = collabDiff(beforeDel, afterDel);
  const invDel = collabInvert(beforeDel, delPatch);
  collabApply(shared, delPatch);
  assert.deepStrictEqual(shared.floors.map(f => f.id), ['f1']);
  collabApply(shared, invDel);
  assert.deepStrictEqual(shared.floors.map(f => f.id), ['f1', 'f3']);
  assert.strictEqual(shared.floors[1].name, 'Roof Floor');
});

test('collabEndpoint resolves production /collab URLs, local skips, and ?collab overrides', () => {
  const prod = { protocol: 'https:', hostname: 'mewego.github.io', search: '' };
  const c1 = makeClientCollabEnv(prod);
  assert.strictEqual(c1.collabEndpoint('room1234', 'wss://h.workers.dev/ws', prod), 'wss://h.workers.dev/collab/room1234');
  assert.strictEqual(c1.collabEndpoint('room1234', 'https://h.workers.dev', prod, 'tok99'), 'wss://h.workers.dev/collab/room1234?v=tok99');
  assert.strictEqual(c1.collabEndpoint('bad', 'wss://h.workers.dev/ws', prod), '');

  const local = { protocol: 'http:', hostname: '127.0.0.1', search: '' };
  assert.strictEqual(makeClientCollabEnv(local).collabEndpoint('room1234', 'wss://h.workers.dev/ws', local), '');

  const localOverride = { protocol: 'http:', hostname: '127.0.0.1', search: '?collab=ws://127.0.0.1:8787' };
  assert.strictEqual(makeClientCollabEnv(localOverride).collabEndpoint('room1234', '', localOverride), 'ws://127.0.0.1:8787/collab/room1234');

  const disabled = { protocol: 'https:', hostname: 'mewego.github.io', search: '?collab=off' };
  assert.strictEqual(makeClientCollabEnv(disabled).collabEndpoint('room1234', 'wss://h.workers.dev/ws', disabled), '');
});

test('Phase 2: CollabRoom relays drag ghosts, resyncs reconnecting clients, and syncs bg/tex assets with 400 KB limit', async () => {
  const { worker, env, roomFor } = makeCollabWorkerEnv();
  await worker.fetch(new Request('https://x.example/collab/room_phase2', {
    headers: { Upgrade: 'websocket', Origin: 'https://mewego.github.io' },
  }), env);
  await worker.fetch(new Request('https://x.example/collab/room_phase2', {
    headers: { Upgrade: 'websocket', Origin: 'https://mewego.github.io' },
  }), env);
  const { room, sockets } = roomFor('room_phase2');
  const p0 = baseProject();
  await room.webSocketMessage(sockets[0], JSON.stringify({ type: 'seed', state: p0, clientSeq: 1 }));

  // Drag ghost message relays to peer 2 without bumping rev or touching state.
  await room.webSocketMessage(sockets[0], JSON.stringify({ type: 'drag', floorId: 'f1', ids: ['w1'], dx: 45, dy: -20 }));
  assert.strictEqual(room.rev, 1);
  const dragMsg = JSON.parse(sockets[1].sent.at(-1));
  assert.strictEqual(dragMsg.type, 'drag');
  assert.deepStrictEqual(dragMsg.ids, ['w1']);
  assert.strictEqual(dragMsg.dx, 45);
  assert.strictEqual(dragMsg.dy, -20);

  // Release clears peer drag.
  await room.webSocketMessage(sockets[0], JSON.stringify({ type: 'drag', ids: [] }));
  assert.deepStrictEqual(JSON.parse(sockets[1].sent.at(-1)).ids, []);

  // Asset sync: bg + tex under 400 KB relay and are served on asset_req; >400 KB is rejected.
  const bgObj = { id: 'bg', src: 'data:image/png;base64,AAA', x: 0, y: 0, w: 800, h: 600, op: 0.5, lock: false };
  await room.webSocketMessage(sockets[0], JSON.stringify({ type: 'asset', kind: 'bg', data: bgObj }));
  assert.strictEqual(JSON.parse(sockets[1].sent.at(-1)).kind, 'bg');

  const texData = 'data:image/png;base64,BBBB';
  await room.webSocketMessage(sockets[0], JSON.stringify({ type: 'asset', kind: 'tex', id: 'tx1', data: texData }));
  assert.strictEqual(JSON.parse(sockets[1].sent.at(-1)).id, 'tx1');

  await room.webSocketMessage(sockets[0], JSON.stringify({ type: 'asset', kind: 'tex', id: 'txbig', data: 'data:image/png;base64,' + 'A'.repeat(400 * 1024 + 5) }));
  const rej = JSON.parse(sockets[0].sent.at(-1));
  assert.strictEqual(rej.type, 'asset_rejected');
  assert.strictEqual(rej.reason, 'too_large');

  // Resync and asset_req return current state + stored assets.
  await room.webSocketMessage(sockets[1], JSON.stringify({ type: 'resync', sinceRev: 0 }));
  const stMsg = JSON.parse(sockets[1].sent.at(-1));
  assert.strictEqual(stMsg.type, 'state');
  assert.strictEqual(stMsg.hasBg, true);

  await room.webSocketMessage(sockets[1], JSON.stringify({ type: 'asset_req', kind: 'tex', id: 'tx1' }));
  assert.strictEqual(JSON.parse(sockets[1].sent.at(-1)).data, texData);
});

test('Phase 2: collabPeerEditing detects peers selecting or dragging matching object IDs', () => {
  const fn = fnSrcOf(appSrc, 'collabPeerEditing');
  const collabPeerEditing = new Function(`${fn}\nreturn collabPeerEditing;`)();
  const peers = new Map([
    ['p1', { id: 'p1', name: 'Mert', sel: ['w1'], drag: null }],
    ['p2', { id: 'p2', name: 'Ece', sel: [], drag: { ids: ['f9'] } }],
  ]);
  const hit1 = collabPeerEditing(['w1', 'w2'], peers);
  assert.strictEqual(hit1.peer.name, 'Mert');
  assert.strictEqual(hit1.id, 'w1');
  const hit2 = collabPeerEditing(['f9'], peers);
  assert.strictEqual(hit2.peer.name, 'Ece');
  assert.strictEqual(collabPeerEditing(['w99'], peers), null);
});
