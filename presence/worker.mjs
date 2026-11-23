import { DurableObject } from 'cloudflare:workers';

/**
 * Parse comma-separated allowed origin strings from env.ALLOWED_ORIGINS.
 * @param {string|undefined} raw
 * @returns {string[]}
 */
function parseOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Check whether a request Origin header is permitted.
 * Empty or "*" ALLOWED_ORIGINS allows every origin; otherwise an exact match is required.
 * @param {string} origin
 * @param {Record<string, any>} env
 * @returns {boolean}
 */
function originAllowed(origin, env) {
  const list = parseOrigins(env && env.ALLOWED_ORIGINS);
  if (!list.length || list.includes('*')) return true;
  return !!origin && list.includes(origin);
}

/**
 * Build CORS response headers for an allowed request Origin.
 * @param {string} origin
 * @param {Record<string, any>} env
 * @returns {Record<string, string>}
 */
function corsHeaders(origin, env) {
  if (!origin || !originAllowed(origin, env)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  };
}

/**
 * Clean the anonymous per-browser id a tab sends as `?d=` (random, made by the app).
 * Anything that does not look like one is ignored, so the tab counts on its own.
 * @param {string|null} raw
 * @returns {string}
 */
function presenceDevId(raw) {
  const v = String(raw || '').trim();
  return /^[A-Za-z0-9_-]{8,40}$/.test(v) ? v : '';
}

/**
 * Singleton Durable Object tracking active WebSocket tabs using the Hibernation API.
 * Tabs of the same browser (same random `?d=` id) count once. The id lives only in the
 * socket's in-memory attachment while it is open; no cookies, logs or plan data are stored.
 */
export class PresenceRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // Absorb keepalive pings at Cloudflare's edge without waking the Durable Object.
    if (typeof this.ctx.setWebSocketAutoResponse === 'function' && typeof WebSocketRequestResponsePair === 'function') {
      this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }
  }

  /**
   * Return currently open WebSocket connections, optionally excluding one socket.
   * @param {WebSocket} [exclude]
   * @returns {WebSocket[]}
   */
  liveSockets(exclude) {
    return this.ctx.getWebSockets().filter(s => s !== exclude && (s.readyState === undefined || s.readyState === 1));
  }

  /**
   * Anonymous browser id of a socket ('' = none: an older app, counted on its own).
   * @param {WebSocket} s
   * @returns {string}
   */
  devOf(s) {
    try {
      const a = typeof s.deserializeAttachment === 'function' ? s.deserializeAttachment() : null;
      if (a && typeof a.d === 'string') return a.d;
    } catch (_) { }
    return typeof s.fpDev === 'string' ? s.fpDev : '';
  }

  /**
   * Number of people online: open sockets, with tabs of the same browser counted once.
   * @param {WebSocket[]} live
   * @returns {number}
   */
  countOf(live) {
    const devs = new Set();
    let solo = 0;
    for (const s of live) {
      const d = this.devOf(s);
      if (d) devs.add(d); else solo++;
    }
    return devs.size + solo;
  }

  /**
   * Broadcast the live connection count to every connected client.
   * Any dead sockets discovered during send are closed and excluded from a follow-up update.
   * @param {WebSocket} [exclude]
   */
  broadcast(exclude) {
    let live = this.liveSockets(exclude);
    const msg = JSON.stringify({ online: this.countOf(live) });
    const dead = [];
    for (const s of live) {
      try {
        s.send(msg);
      } catch (_) {
        dead.push(s);
        try { s.close(1011, 'send failed'); } catch (_) { }
      }
    }
    if (dead.length > 0) {
      live = live.filter(s => !dead.includes(s));
      const corrected = JSON.stringify({ online: this.countOf(live) });
      for (const s of live) {
        try { s.send(corrected); } catch (_) { }
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/count') {
      return new Response(JSON.stringify({ online: this.countOf(this.liveSockets()) }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }
    if (String(request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const dev = presenceDevId(url.searchParams.get('d'));
    if (dev) {
      // The attachment survives hibernation; the property is the fallback for runtimes without it.
      try { if (typeof server.serializeAttachment === 'function') server.serializeAttachment({ d: dev }); } catch (_) { }
      server.fpDev = dev;
    }
    this.broadcast();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (message === 'ping') {
      try { ws.send('pong'); } catch (_) { }
      return;
    }
    const len = typeof message === 'string' ? message.length : (message && message.byteLength) || 0;
    if (len > 64) {
      try { ws.close(1009, 'message too large'); } catch (_) { }
      this.broadcast(ws);
    }
  }

  async webSocketClose(ws, code, reason) {
    // Cloudflare rejects reserved close codes such as 1005/1006 in ws.close().
    const safeCode = code === 1000 || (code >= 3000 && code <= 4999) ? code : 1000;
    const safeReason = typeof reason === 'string' ? reason.slice(0, 120) : '';
    try { ws.close(safeCode, safeReason); } catch (_) { }
    this.broadcast(ws);
  }

  async webSocketError(ws) {
    try { ws.close(1011, 'socket error'); } catch (_) { }
    this.broadcast(ws);
  }
}

const COLLAB_COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#0d9488'];
const COLLAB_ARR_KEYS = ['walls', 'ops', 'furn', 'rooms', 'slabs', 'voids', 'sections', 'axes', 'dims', 'texts', 'sketches', 'drafts'];
const COLLAB_MAX_MSG = 2 * 1024 * 1024;
const COLLAB_MAX_ASSET = 400 * 1024;

function collabBlankFloor(id) {
  return {
    id, name: '', walls: [], ops: [], furn: [], rooms: [], slabs: [], voids: [],
    sections: [], axes: [], dims: [], texts: [], sketches: [], drafts: [], groups: [],
    slabFloor: 'none', slabColor: null,
  };
}

function applyCollabPatch(proj, patch) {
  if (!proj || typeof proj !== 'object' || !patch || typeof patch !== 'object') return proj;
  if (patch.meta && typeof patch.meta === 'object') {
    for (const [k, v] of Object.entries(patch.meta)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (v && typeof v === 'object' && v.__del) delete proj[k];
      else proj[k] = v;
    }
  }
  if (!Array.isArray(proj.floors)) proj.floors = [];
  if (patch.floors && typeof patch.floors === 'object') {
    for (const [fid, fp] of Object.entries(patch.floors)) {
      if (!fp || typeof fp !== 'object' || fid === '__proto__' || fid === 'constructor' || fid === 'prototype') continue;
      if (fp.remove) {
        proj.floors = proj.floors.filter(f => f.id !== fid);
        continue;
      }
      let fl = proj.floors.find(f => f.id === fid);
      if (!fl) { fl = collabBlankFloor(fid); proj.floors.push(fl); }
      if (fp.meta && typeof fp.meta === 'object') {
        for (const [mk, mv] of Object.entries(fp.meta)) {
          if (mk === '__proto__' || mk === 'constructor' || mk === 'prototype') continue;
          if (mv && typeof mv === 'object' && mv.__del) delete fl[mk];
          else fl[mk] = mv;
        }
      }
      if (fp.k && typeof fp.k === 'object') {
        for (const arr of COLLAB_ARR_KEYS) {
          const kd = fp.k[arr];
          if (!kd || typeof kd !== 'object') continue;
          let list = Array.isArray(fl[arr]) ? fl[arr].slice() : [];
          if (Array.isArray(kd.remove) && kd.remove.length) {
            const rem = new Set(kd.remove);
            list = list.filter(o => o && !rem.has(o.id));
          }
          if (Array.isArray(kd.upsert) && kd.upsert.length) {
            const idx = new Map(list.map((o, i) => [o && o.id, i]));
            for (const item of kd.upsert) {
              if (!item || typeof item !== 'object' || typeof item.id !== 'string') continue;
              if (idx.has(item.id)) list[idx.get(item.id)] = item;
              else { idx.set(item.id, list.length); list.push(item); }
            }
          }
          fl[arr] = list;
        }
      }
    }
  }
  if (Array.isArray(patch.floorOrder)) {
    const byId = new Map(proj.floors.map(f => [f.id, f]));
    const next = [];
    for (const fid of patch.floorOrder) {
      if (byId.has(fid)) { next.push(byId.get(fid)); byId.delete(fid); }
    }
    for (const f of byId.values()) next.push(f);
    proj.floors = next;
  }
  return proj;
}

/**
 * Per-room Durable Object relaying simultaneous floor plan edits and peer cursors.
 * Ephemeral by default: state stays in memory while participants are connected and
 * is cleared when the last socket leaves.
 */
export class CollabRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    if (typeof this.ctx.setWebSocketAutoResponse === 'function' && typeof WebSocketRequestResponsePair === 'function') {
      this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }
    this.state = null;
    this.rev = 0;
    this.peers = new Map();
    this.seq = 0;
    this.assets = { bg: null, tex: new Map() };
    this.viewToken = '';
    this.persist = false;
    this.loaded = false;
  }

  async ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    const st = this.ctx && this.ctx.storage;
    if (!st || typeof st.get !== 'function') return;
    try {
      const saved = await st.get('room');
      if (saved && typeof saved === 'object') {
        this.state = saved.state || null;
        this.rev = typeof saved.rev === 'number' ? saved.rev : 0;
        this.viewToken = typeof saved.viewToken === 'string' ? saved.viewToken : '';
        this.persist = !!saved.persist;
        this.assets = {
          bg: saved.bg || null,
          tex: new Map(Array.isArray(saved.tex) ? saved.tex : []),
        };
      }
    } catch (_) { }
  }

  ensureViewToken() {
    if (this.viewToken) return this.viewToken;
    const abc = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let out = '';
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const buf = new Uint8Array(12);
      crypto.getRandomValues(buf);
      for (let i = 0; i < buf.length; i++) out += abc[buf[i] % abc.length];
    } else {
      while (out.length < 12) out += abc[Math.floor(Math.random() * abc.length)];
    }
    this.viewToken = out;
    return out;
  }

  async saveRoom() {
    const st = this.ctx && this.ctx.storage;
    if (!st || typeof st.put !== 'function') return;
    try {
      await st.put('room', {
        state: this.state,
        rev: this.rev,
        viewToken: this.viewToken,
        persist: !!this.persist,
        bg: this.assets.bg,
        tex: [...this.assets.tex.entries()],
      });
    } catch (_) { }
  }

  liveSockets(exclude) {
    return this.ctx.getWebSockets().filter(s => s !== exclude && (s.readyState === undefined || s.readyState === 1));
  }

  peerOf(ws) {
    let p = this.peers.get(ws);
    if (!p && typeof ws.deserializeAttachment === 'function') {
      try { p = ws.deserializeAttachment(); if (p) this.peers.set(ws, p); } catch (_) { }
    }
    return p || null;
  }

  savePeer(ws, p) {
    this.peers.set(ws, p);
    if (typeof ws.serializeAttachment === 'function') {
      try { ws.serializeAttachment(p); } catch (_) { }
    }
  }

  publicPeer(p) {
    return {
      id: p.id,
      color: p.color,
      name: p.name || '',
      floorId: p.floorId || null,
      sel: Array.isArray(p.sel) ? p.sel : [],
      x: typeof p.x === 'number' ? p.x : null,
      y: typeof p.y === 'number' ? p.y : null,
      drag: p.drag || null,
      view: p.view || null,
      v3d: p.v3d || null,
      walk: p.walk || null,
      role: p.role || 'editor',
    };
  }

  publicPeers(exclude) {
    const out = [];
    for (const s of this.liveSockets(exclude)) {
      const p = this.peerOf(s);
      if (p) out.push(this.publicPeer(p));
    }
    return out;
  }

  sendTo(ws, obj) {
    try { ws.send(JSON.stringify(obj)); return true; } catch (_) { return false; }
  }

  broadcast(obj, exclude) {
    const raw = JSON.stringify(obj);
    for (const s of this.liveSockets(exclude)) {
      try {
        s.send(raw);
      } catch (_) {
        try { s.close(1011, 'send failed'); } catch (_) { }
        this.peers.delete(s);
      }
    }
  }

  async fetch(request) {
    if (String(request.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    await this.ensureLoaded();
    const hadToken = !!this.viewToken;
    this.ensureViewToken();
    if (!hadToken) await this.saveRoom();
    const url = new URL(request.url);
    const qv = url.searchParams.get('v') || '';
    const role = qv || url.searchParams.get('role') === 'viewer' ? 'viewer' : 'editor';
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    const n = ++this.seq;
    const peer = {
      id: 'p' + n + '_' + Math.random().toString(36).slice(2, 6),
      color: COLLAB_COLORS[(n - 1) % COLLAB_COLORS.length],
      name: '',
      floorId: null,
      sel: [],
      x: null,
      y: null,
      view: null,
      v3d: null,
      walk: null,
      role,
    };
    this.savePeer(server, peer);
    const welcome = {
      type: 'welcome',
      peerId: peer.id,
      color: peer.color,
      role: peer.role,
      persist: this.persist,
      rev: this.rev,
      state: this.state,
      hasBg: !!this.assets.bg,
      peers: this.publicPeers(server),
    };
    if (role === 'editor') welcome.viewToken = this.viewToken;
    this.sendTo(server, welcome);
    this.broadcast({ type: 'peer_join', peer: this.publicPeer(peer) }, server);
    if (!this.state) {
      const editorWs = this.liveSockets(server).find(s => {
        const p = this.peerOf(s);
        return p && p.role !== 'viewer';
      });
      if (editorWs) this.sendTo(editorWs, { type: 'seed_request' });
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (message === 'ping') {
      try { ws.send('pong'); } catch (_) { }
      return;
    }
    const len = typeof message === 'string' ? message.length : (message && message.byteLength) || 0;
    if (len > COLLAB_MAX_MSG) {
      try { ws.close(1009, 'message too large'); } catch (_) { }
      await this.cleanupSocket(ws);
      return;
    }
    if (typeof message !== 'string') return;
    await this.ensureLoaded();
    let msg;
    try { msg = JSON.parse(message); } catch (_) { return; }
    if (!msg || typeof msg !== 'object') return;
    const peer = this.peerOf(ws);
    if (!peer) return;

    const writeTypes = ['seed', 'patch', 'drag', 'asset', 'set_persist'];
    if (peer.role === 'viewer' && writeTypes.includes(msg.type)) {
      this.sendTo(ws, { type: 'error', code: 'readonly' });
      return;
    }

    if (msg.type === 'set_persist') {
      this.persist = !!msg.persist;
      await this.saveRoom();
      const note = { type: 'persist', persist: this.persist, from: peer.id };
      this.sendTo(ws, note);
      this.broadcast(note, ws);
      return;
    }

    if (msg.type === 'seed') {
      if (this.state) {
        this.sendTo(ws, { type: 'state', rev: this.rev, state: this.state, hasBg: !!this.assets.bg });
      } else if (msg.state && typeof msg.state === 'object' && Array.isArray(msg.state.floors)) {
        this.state = JSON.parse(JSON.stringify(msg.state));
        this.rev = 1;
        await this.saveRoom();
        this.sendTo(ws, { type: 'ack', rev: this.rev, clientSeq: msg.clientSeq });
        this.broadcast({ type: 'state', rev: this.rev, state: this.state, hasBg: !!this.assets.bg, from: peer.id }, ws);
      }
      return;
    }

    if (msg.type === 'patch') {
      if (!msg.patch || typeof msg.patch !== 'object') return;
      if (!this.state) {
        this.sendTo(ws, { type: 'resync_needed' });
        return;
      }
      this.rev += 1;
      this.state = applyCollabPatch(this.state, msg.patch);
      await this.saveRoom();
      this.sendTo(ws, { type: 'ack', rev: this.rev, clientSeq: msg.clientSeq });
      this.broadcast({ type: 'patch', rev: this.rev, patch: msg.patch, from: peer.id }, ws);
      return;
    }

    if (msg.type === 'presence') {
      if (typeof msg.name === 'string') peer.name = msg.name.trim().slice(0, 40);
      if (typeof msg.floorId === 'string' || msg.floorId === null) peer.floorId = msg.floorId;
      if (typeof msg.x === 'number' && Number.isFinite(msg.x)) peer.x = msg.x;
      if (typeof msg.y === 'number' && Number.isFinite(msg.y)) peer.y = msg.y;
      if (Array.isArray(msg.sel)) peer.sel = msg.sel.filter(s => typeof s === 'string').slice(0, 100);
      if (msg.view && typeof msg.view === 'object' && Number.isFinite(msg.view.x) && Number.isFinite(msg.view.y) && Number.isFinite(msg.view.z)) {
        peer.view = { x: msg.view.x, y: msg.view.y, z: msg.view.z, floorId: typeof msg.view.floorId === 'string' ? msg.view.floorId : null };
      }
      if (msg.v3d && typeof msg.v3d === 'object' && ['px', 'py', 'pz', 'tx', 'ty', 'tz'].every(k => Number.isFinite(msg.v3d[k]))) {
        peer.v3d = { px: msg.v3d.px, py: msg.v3d.py, pz: msg.v3d.pz, tx: msg.v3d.tx, ty: msg.v3d.ty, tz: msg.v3d.tz };
      } else if (msg.v3d === null) {
        peer.v3d = null;
      }
      // walk mode position (plan cm on a floor): other editors draw a person there in 3D
      const wk = msg.walk;
      if (wk && typeof wk === 'object' && typeof wk.floorId === 'string' && ['x', 'y', 'yaw'].every(k => Number.isFinite(wk[k]))) {
        const cl = (v, m) => Math.max(-m, Math.min(m, v));
        peer.walk = { floorId: wk.floorId.slice(0, 64), x: cl(wk.x, 1e7), y: cl(wk.y, 1e7), z: Number.isFinite(wk.z) ? cl(wk.z, 5000) : 0, yaw: cl(wk.yaw, 1e4) };
      } else peer.walk = null;
      this.savePeer(ws, peer);
      this.broadcast({ type: 'presence', peer: this.publicPeer(peer) }, ws);
      return;
    }

    if (msg.type === 'drag') {
      const ids = Array.isArray(msg.ids) ? msg.ids.filter(s => typeof s === 'string').slice(0, 100) : [];
      const dx = typeof msg.dx === 'number' && Number.isFinite(msg.dx) ? msg.dx : 0;
      const dy = typeof msg.dy === 'number' && Number.isFinite(msg.dy) ? msg.dy : 0;
      const floorId = typeof msg.floorId === 'string' ? msg.floorId : null;
      peer.drag = ids.length ? { floorId, ids, dx, dy } : null;
      this.savePeer(ws, peer);
      this.broadcast({
        type: 'drag',
        from: peer.id,
        color: peer.color,
        name: peer.name || '',
        floorId,
        ids,
        dx,
        dy,
      }, ws);
      return;
    }

    if (msg.type === 'resync') {
      this.sendTo(ws, {
        type: 'state',
        rev: this.rev,
        state: this.state,
        hasBg: !!this.assets.bg,
      });
      return;
    }

    if (msg.type === 'asset') {
      if (msg.kind === 'bg') {
        if (msg.data === null) {
          this.assets.bg = null;
          if (this.state) this.state.bg = null;
          await this.saveRoom();
          this.broadcast({ type: 'asset', kind: 'bg', data: null, from: peer.id }, ws);
          return;
        }
        if (msg.data && typeof msg.data === 'object') {
          const raw = JSON.stringify(msg.data);
          if (raw.length > COLLAB_MAX_ASSET) {
            this.sendTo(ws, { type: 'asset_rejected', kind: 'bg', reason: 'too_large' });
            return;
          }
          this.assets.bg = JSON.parse(raw);
          if (this.state) this.state.bg = JSON.parse(raw);
          await this.saveRoom();
          this.broadcast({ type: 'asset', kind: 'bg', data: this.assets.bg, from: peer.id }, ws);
        }
        return;
      }
      if (msg.kind === 'tex' && typeof msg.id === 'string' && /^[\w-]{1,32}$/.test(msg.id) && typeof msg.data === 'string' && msg.data.startsWith('data:image/')) {
        if (msg.data.length > COLLAB_MAX_ASSET) {
          this.sendTo(ws, { type: 'asset_rejected', kind: 'tex', id: msg.id, reason: 'too_large' });
          return;
        }
        this.assets.tex.set(msg.id, msg.data);
        await this.saveRoom();
        this.broadcast({ type: 'asset', kind: 'tex', id: msg.id, data: msg.data, from: peer.id }, ws);
      }
      return;
    }

    if (msg.type === 'asset_req') {
      if (msg.kind === 'bg' && this.assets.bg) {
        this.sendTo(ws, { type: 'asset', kind: 'bg', data: this.assets.bg });
      } else if (msg.kind === 'tex' && typeof msg.id === 'string' && this.assets.tex.has(msg.id)) {
        this.sendTo(ws, { type: 'asset', kind: 'tex', id: msg.id, data: this.assets.tex.get(msg.id) });
      }
    }
  }

  async cleanupSocket(ws) {
    const peer = this.peerOf(ws);
    this.peers.delete(ws);
    if (peer) this.broadcast({ type: 'peer_leave', peerId: peer.id }, ws);
    if (this.liveSockets(ws).length === 0 && !this.persist) {
      this.state = null;
      this.rev = 0;
      this.assets.bg = null;
      this.assets.tex.clear();
      this.viewToken = '';
      const st = this.ctx && this.ctx.storage;
      if (st && typeof st.delete === 'function') {
        try { await st.delete('room'); } catch (_) { }
      }
    }
  }

  async webSocketClose(ws, code, reason) {
    const safeCode = code === 1000 || (code >= 3000 && code <= 4999) ? code : 1000;
    const safeReason = typeof reason === 'string' ? reason.slice(0, 120) : '';
    try { ws.close(safeCode, safeReason); } catch (_) { }
    await this.cleanupSocket(ws);
  }

  async webSocketError(ws) {
    try { ws.close(1011, 'socket error'); } catch (_) { }
    await this.cleanupSocket(ws);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      if (!originAllowed(origin, env)) return new Response('Forbidden', { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin, env),
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const collabMatch = /^\/collab\/([A-Za-z0-9_-]{6,64})$/.exec(url.pathname);
    if (collabMatch) {
      if (!originAllowed(origin, env)) return new Response('Forbidden', { status: 403 });
      const upgrade = String(request.headers.get('Upgrade') || '').toLowerCase();
      if (upgrade !== 'websocket') return new Response('Expected WebSocket', { status: 426 });
      const stub = env.COLLAB.get(env.COLLAB.idFromName(collabMatch[1]));
      return stub.fetch(request);
    }

    const stub = env.PRESENCE.get(env.PRESENCE.idFromName('global'));

    if (request.method === 'GET' && url.pathname === '/count') {
      if (origin && !originAllowed(origin, env)) return new Response('Forbidden', { status: 403 });
      const res = await stub.fetch(new Request('https://presence/count'));
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(corsHeaders(origin, env))) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    }

    const upgrade = String(request.headers.get('Upgrade') || '').toLowerCase();
    if (upgrade === 'websocket' && (url.pathname === '/ws' || url.pathname === '/')) {
      if (!originAllowed(origin, env)) return new Response('Forbidden', { status: 403 });
      return stub.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};
