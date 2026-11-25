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

/* ---------- Furniture store (community library) ----------
   Anyone can browse and use published furniture; publishing needs a Google ID token.
   Items are library presets (plain JSON) plus a small top-view SVG thumbnail. Only the
   Google account id (`sub`) and a display name are stored, never the email. */

/* STORE-THUMB:BEGIN — pasted verbatim into app.js; tests/furniture-store.test.js compares the copies */
const STORE_THUMB_MAX = 16384;
const STORE_THUMB_TAGS = new Set(['svg', 'g', 'rect', 'circle', 'ellipse', 'path', 'polygon', 'polyline', 'line']);
const STORE_THUMB_ATTRS = new Set(['viewBox', 'xmlns', 'x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'x1', 'y1', 'x2', 'y2',
  'fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform', 'stroke-linejoin', 'stroke-linecap', 'vector-effect']);
/* Rebuilds a thumbnail SVG from an allow-list: shape elements only, no text, no script, no
   event handlers, no links, no url() / style. Returns the clean SVG, or null when anything
   else is in it. */
function storeThumbClean(svg) {
  const s = String(svg || '');
  if (!s || s.length > STORE_THUMB_MAX) return null;
  const re = /<(\/?)([a-zA-Z]+)((?:\s+[a-zA-Z:-]+\s*=\s*"[^"<>]*")*)\s*(\/?)>/g;
  const stack = [];
  let out = '', pos = 0, m, root = 0;
  while ((m = re.exec(s))) {
    if (s.slice(pos, m.index).trim()) return null;
    pos = re.lastIndex;
    const [, close, tag, attrs, self] = m;
    if (!STORE_THUMB_TAGS.has(tag)) return null;
    if (close) { if (attrs.trim() || self || stack.pop() !== tag) return null; out += `</${tag}>`; continue; }
    if (tag === 'svg' ? stack.length || root++ : !stack.length) return null;
    let a = '';
    const ar = /([a-zA-Z:-]+)\s*=\s*"([^"<>]*)"/g; let x;
    while ((x = ar.exec(attrs))) {
      const k = x[1], v = x[2];
      if (!STORE_THUMB_ATTRS.has(k)) return null;
      if (k === 'xmlns' ? v !== 'http://www.w3.org/2000/svg' : !/^[-#0-9a-zA-Z.,\s()%]*$/.test(v) || /url|expression|script/i.test(v)) return null;
      a += ` ${k}="${v}"`;
    }
    out += `<${tag}${a}${self ? '/' : ''}>`;
    if (!self) stack.push(tag);
  }
  if (s.slice(pos).trim() || stack.length || root !== 1) return null;
  return out;
}
/* STORE-THUMB:END */

/* STORE-PRESET:BEGIN — pasted verbatim into app.js, mcp/server.js and presence/worker.mjs; tests/furniture-store.test.js compares the copies.
   A shared store item is rebuilt from known fields with checked shapes: a box (furniture kinds only, no stairs / ramps / roofs),
   an optional outline, parts, height, light and tilt — never ids, positions, layers or anything else the sender adds. */
const STORE_KINDS = ['rect', 'round', 'bed', 'sofa', 'poly'];
const storeTxt = (v, max) => String(v == null ? '' : v).replace(/["<>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const storeFin = v => typeof v === 'number' && Number.isFinite(v);
const storeClampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// catalogue-style type names only; "constructor", "toString"… would hit Object.prototype in lookups
function storeType(t) { const s = String(t == null ? '' : t); return /^[A-Za-z0-9_-]{1,40}$/.test(s) && !(s in Object.prototype) ? s : 'custom'; }
function storePts(a, min) {
  if (!Array.isArray(a) || a.length < min || a.length > 200) return null;
  return a.every(q => q && storeFin(q.x) && storeFin(q.y) && Math.abs(q.x) < 1e5 && Math.abs(q.y) < 1e5) ? a.map(q => ({ x: q.x, y: q.y })) : null;
}
function storePart(p) {
  const o = { type: /^(box|cyl|sphere|extrude)$/.test(p.type) ? p.type : 'box' };
  for (const k of ['x', 'y', 'z', 'rot', 'rx', 'ry']) if (storeFin(p[k])) o[k] = storeClampN(p[k], -1e5, 1e5);
  for (const k of ['w', 'd', 'h']) o[k] = storeFin(p[k]) && p[k] > 0 ? Math.min(p[k], 1e5) : 1;
  if (typeof p.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(p.color)) o.color = p.color;
  if (typeof p.mat === 'string' && /^[a-z]{1,12}$/.test(p.mat)) o.mat = p.mat;
  if (p.axis === 'x' || p.axis === 'y') o.axis = p.axis;
  const pts = storePts(p.pts, 3); if (pts) o.pts = pts;
  if (p.name != null) { const n = storeTxt(p.name, 40); if (n) o.name = n; }
  if (typeof p.gid === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(p.gid)) o.gid = p.gid;
  if (/^(point|spot|strip)$/.test(p.light)) o.light = p.light;
  for (const k of ['lm', 'lk', 'beam']) if (storeFin(p[k])) o[k] = storeClampN(p[k], 0, 1e5);
  if (typeof p.lcol === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.lcol)) o.lcol = p.lcol;
  return o;
}
// the extra fields of a shared item; throws only for a hard limit (too many parts)
function storeExtra(e) {
  const out = {};
  if (!e || typeof e !== 'object' || Array.isArray(e)) return out;
  const pts = storePts(e.pts, 3); if (pts) out.pts = pts;
  if (Array.isArray(e.parts) && e.parts.length) {
    if (e.parts.length > 64) throw new Error('too many parts (max 64)');
    out.parts = e.parts.filter(p => p && typeof p === 'object' && !Array.isArray(p)).map(storePart);
    const b = e.pbase;
    if (b && typeof b === 'object' && [b.w, b.d, b.h].every(v => storeFin(v) && v > 0 && v < 1e5)) out.pbase = { w: b.w, d: b.d, h: b.h };
    out.partsV = 1;
  }
  for (const [k, lo, hi] of [['elev', -3000, 3000], ['lm', 0, 1e5], ['lk', 1000, 20000], ['beam', 1, 180], ['rx', -360, 360], ['ry', -360, 360]]) if (storeFin(e[k])) out[k] = storeClampN(e[k], lo, hi);
  if (e.lon === 0) out.lon = 0;
  if (typeof e.lcol === 'string' && /^#[0-9a-fA-F]{6}$/.test(e.lcol)) out.lcol = e.lcol;
  if (e.mount === 'ceil') out.mount = 'ceil';
  return out;
}
/* A whole shared preset → { kind, type, k, w, d, h, icon?, color?, extra? }. Throws with a reason when the box is unusable. */
function storeCleanPreset(p) {
  if (!p || typeof p !== 'object' || p.kind !== 'furn') throw new Error('preset must be a furniture preset');
  const num = (v, lo, hi, what) => { const n = +v; if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(what + ' out of range'); return Math.round(n * 10) / 10; };
  const out = { kind: 'furn', type: storeType(p.type), k: STORE_KINDS.includes(p.k) ? p.k : 'rect', w: num(p.w, 1, 5000, 'width'), d: num(p.d, 1, 5000, 'depth'), h: num(p.h, 0, 3000, 'height') };
  const icon = storeTxt(p.icon, 8); if (icon) out.icon = icon;
  if (typeof p.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(p.color)) out.color = p.color;
  const extra = storeExtra(p.extra);
  if (out.k === 'poly' && !extra.pts) out.k = 'rect';
  if (Object.keys(extra).length) out.extra = extra;
  return out;
}
// search folding: case, Turkish dotted / dotless i and accents (ç → c, ş → s …), so "cay" finds "Çay masası"
function storeFold(s) { return String(s == null ? '' : s).toLowerCase().replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, ''); }
/* STORE-PRESET:END */

const STORE = { page: 40, preset: 65536, name: 60, desc: 300, tags: 5, tag: 24, author: 40, perDay: 10, perUser: 200, hideAt: 3, cats: 12 };

/** Strip characters that could break out of an HTML attribute (the app interpolates values unescaped). */
const storeStr = (v, max) => String(v == null ? '' : v).replace(/["<>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Validate a published furniture preset (shared STORE-PRESET rules + size limit); returns the clean preset or throws with a reason. */
function storePreset(p) {
  const out = storeCleanPreset(p);
  if (JSON.stringify(out).length > STORE.preset) throw new Error('item too large');
  return out;
}

/** Folded text the list search matches (name, tags, description). */
const storeSearch = m => storeFold([m.name, m.tags.join(' '), m.desc].join(' '));

/** Name, description, category, tags and thumbnail of a publish / update request. */
function storeMeta(b) {
  const name = storeStr(b.name, STORE.name);
  if (!name) throw new Error('name required');
  const thumb = storeThumbClean(b.thumb);
  if (!thumb) throw new Error('invalid thumbnail');
  const cat = Math.round(+b.cat);
  const tags = (Array.isArray(b.tags) ? b.tags : []).map(t => storeStr(t, STORE.tag).toLowerCase()).filter(Boolean).slice(0, STORE.tags);
  return { name, desc: storeStr(b.desc, STORE.desc), cat: Number.isFinite(cat) && cat >= 0 && cat < STORE.cats ? cat : 0, tags, thumb };
}

/* Google ID tokens (RS256 JWT). The JWKS is cached for its Cache-Control max-age. */
const storeJwks = { keys: null, exp: 0, at: 0 };
const b64uBytes = s => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)), c => c.charCodeAt(0));
async function storeJwksKeys(fetchImpl, now, force = false) {
  if (!force && storeJwks.keys && now < storeJwks.exp) return storeJwks.keys;
  storeJwks.at = now;
  const res = await fetchImpl('https://www.googleapis.com/oauth2/v3/certs');
  if (!res.ok) throw new Error('jwks ' + res.status);
  const age = /max-age=(\d+)/.exec(res.headers.get('Cache-Control') || '');
  storeJwks.keys = (await res.json()).keys || [];
  storeJwks.exp = now + Math.min(86400, age ? +age[1] : 3600) * 1000;
  return storeJwks.keys;
}
/**
 * Verify a Google ID token. Returns { sub, name } or null; throws only when Google's keys cannot be fetched.
 * @param {string} token
 * @param {Record<string, any>} env  GOOGLE_CLIENT_ID = the expected audience
 */
async function verifyGoogleToken(token, env, fetchImpl = fetch, now = Date.now()) {
  let parts, head, body;
  try {
    parts = String(token || '').split('.');
    if (parts.length !== 3 || !env.GOOGLE_CLIENT_ID) return null;
    head = JSON.parse(new TextDecoder().decode(b64uBytes(parts[0])));
    body = JSON.parse(new TextDecoder().decode(b64uBytes(parts[1])));
    if (!head || head.alg !== 'RS256' || typeof head.kid !== 'string') return null;
  } catch (_) {
    return null;
  }
  let jwk = (await storeJwksKeys(fetchImpl, now)).find(k => k.kid === head.kid);
  if (!jwk && now - storeJwks.at > 60000) jwk = (await storeJwksKeys(fetchImpl, now, true)).find(k => k.kid === head.kid);
  if (!jwk) return null;
  try {
    const key = await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uBytes(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
    if (!ok) return null;
    if (body.iss !== 'https://accounts.google.com' && body.iss !== 'accounts.google.com') return null;
    if (body.aud !== env.GOOGLE_CLIENT_ID) return null;
    if (!(body.exp * 1000 > now) || !/^[0-9A-Za-z_-]{1,64}$/.test(String(body.sub || ''))) return null;
    return { sub: String(body.sub), name: storeStr(body.given_name || body.name || '', STORE.author) };
  } catch (_) {
    return null;
  }
}
const storeAdmins = env => parseOrigins(env && env.STORE_ADMINS);

/**
 * Singleton SQLite Durable Object holding the published furniture. The worker verifies the
 * caller and forwards a fresh internal request with `x-fp-user` / `x-fp-admin` / `x-fp-ip`.
 */
export class FurnStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.uses = new Map(); // ip|id → last use time (memory only)
    this.sql.exec(`CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, sub TEXT NOT NULL, name TEXT NOT NULL, descr TEXT, cat INTEGER, tags TEXT, preset TEXT NOT NULL,
      thumb TEXT NOT NULL, w REAL, d REAL, created INTEGER, updated INTEGER, uses INTEGER DEFAULT 0, reports INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0, search TEXT)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS items_upd ON items (hidden, updated)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS reports (item TEXT, sub TEXT, PRIMARY KEY (item, sub))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS users (sub TEXT PRIMARY KEY, name TEXT, banned INTEGER DEFAULT 0)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS pubs (sub TEXT, t INTEGER)');
  }

  rows(q, ...b) { return this.sql.exec(q, ...b).toArray(); }
  banned(user) { const u = this.row('SELECT banned FROM users WHERE sub = ?', user.sub); return !!(u && u.banned); }
  row(q, ...b) { return this.rows(q, ...b)[0] || null; }

  json(v, status = 200) { return new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } }); }

  light(r, user, admin) {
    const u = this.row('SELECT name FROM users WHERE sub = ?', r.sub);
    const o = { id: r.id, name: r.name, desc: r.descr || '', cat: r.cat, tags: JSON.parse(r.tags || '[]'), thumb: r.thumb, w: r.w, d: r.d,
      author: (u && u.name) || 'Anonymous', uses: r.uses, created: r.created, updated: r.updated };
    if (user && user.sub === r.sub) o.own = true;
    if (o.own || admin) { o.hidden = !!r.hidden; o.reports = r.reports; }
    if (admin) o.sub = r.sub;
    return o;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const user = JSON.parse(request.headers.get('x-fp-user') || 'null');
    const admin = request.headers.get('x-fp-admin') === '1';
    const ip = request.headers.get('x-fp-ip') || '';
    const now = Date.now();
    const m = /^\/store\/items(?:\/([A-Za-z0-9_-]{6,24}))?(?:\/(use|report|unhide))?$/.exec(url.pathname);
    const meth = request.method;
    try {
      if (meth === 'GET' && url.pathname === '/store/mine') {
        if (!user) return this.json({ error: 'sign in' }, 401);
        return this.json({ items: this.rows('SELECT * FROM items WHERE sub = ? ORDER BY updated DESC', user.sub).map(r => this.light(r, user, admin)), admin });
      }
      const banMatch = /^\/store\/users\/([0-9A-Za-z_-]{1,64})\/ban$/.exec(url.pathname);
      if (banMatch && meth === 'POST') {
        if (!admin) return this.json({ error: 'forbidden' }, 403);
        this.sql.exec('INSERT INTO users (sub, name, banned) VALUES (?, ?, 1) ON CONFLICT(sub) DO UPDATE SET banned = 1', banMatch[1], '');
        this.sql.exec('UPDATE items SET hidden = 1 WHERE sub = ?', banMatch[1]);
        return this.json({ ok: true });
      }
      if (!m) return this.json({ error: 'not found' }, 404);
      const [, id, act] = m;

      if (!id && meth === 'GET') {
        const q = storeFold(storeStr(url.searchParams.get('q'), 60));
        const cat = url.searchParams.get('cat');
        const off = Math.max(0, Math.min(10000, Math.round(+url.searchParams.get('cursor') || 0)));
        const where = ['(hidden = 0' + (user ? ' OR sub = ?' : '') + (admin ? ' OR 1' : '') + ')'], bind = user ? [user.sub] : [];
        if (cat !== null && cat !== '' && Number.isFinite(+cat)) { where.push('cat = ?'); bind.push(Math.round(+cat)); }
        if (q) { where.push('search LIKE ?'); bind.push('%' + q.replace(/[%_]/g, '') + '%'); }
        const order = url.searchParams.get('sort') === 'popular' ? 'uses DESC, updated DESC' : 'updated DESC';
        const rs = this.rows(`SELECT * FROM items WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, ...bind, STORE.page + 1, off);
        return this.json({ items: rs.slice(0, STORE.page).map(r => this.light(r, user, admin)), next: rs.length > STORE.page ? off + STORE.page : null, admin });
      }

      if (!id && meth === 'POST') {
        if (!user) return this.json({ error: 'sign in' }, 401);
        const b = await request.json();
        if (this.banned(user)) return this.json({ error: 'banned' }, 403);
        const day = this.row('SELECT COUNT(*) AS n FROM pubs WHERE sub = ? AND t > ?', user.sub, now - 86400000).n;
        if (day >= STORE.perDay) return this.json({ error: 'daily publish limit reached' }, 429);
        const total = this.row('SELECT COUNT(*) AS n FROM items WHERE sub = ?', user.sub).n;
        if (total >= STORE.perUser) return this.json({ error: 'item limit reached' }, 429);
        const meta = storeMeta(b), preset = storePreset(b.preset);
        const author = storeStr(b.author, STORE.author) || user.name || 'Anonymous';
        const nid = Array.from(crypto.getRandomValues(new Uint8Array(10)), x => 'abcdefghijkmnopqrstuvwxyz23456789'[x % 33]).join('');
        this.sql.exec('INSERT INTO users (sub, name) VALUES (?, ?) ON CONFLICT(sub) DO UPDATE SET name = excluded.name', user.sub, author);
        this.sql.exec('INSERT INTO items (id, sub, name, descr, cat, tags, preset, thumb, w, d, created, updated, search) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          nid, user.sub, meta.name, meta.desc, meta.cat, JSON.stringify(meta.tags), JSON.stringify(preset), meta.thumb, preset.w, preset.d, now, now, storeSearch(meta));
        this.sql.exec('INSERT INTO pubs (sub, t) VALUES (?, ?)', user.sub, now);
        this.sql.exec('DELETE FROM pubs WHERE t < ?', now - 86400000);
        return this.json({ item: this.light(this.row('SELECT * FROM items WHERE id = ?', nid), user, admin) }, 201);
      }

      const r = id && this.row('SELECT * FROM items WHERE id = ?', id);
      const mine = !!(r && user && user.sub === r.sub);
      if (!r || (r.hidden && !mine && !admin)) return this.json({ error: 'not found' }, 404);

      if (!act && meth === 'GET') return this.json({ item: { ...this.light(r, user, admin), preset: JSON.parse(r.preset) } });

      if (act === 'use' && meth === 'POST') {
        const key = ip + '|' + id;
        if (now - (this.uses.get(key) || 0) > 3600000) {
          this.uses.set(key, now);
          if (this.uses.size > 5000) this.uses.clear();
          this.sql.exec('UPDATE items SET uses = uses + 1 WHERE id = ?', id);
        }
        return this.json({ ok: true });
      }

      if (act === 'report' && meth === 'POST') {
        if (!user) return this.json({ error: 'sign in' }, 401);
        if (mine) return this.json({ error: 'cannot report your own item' }, 400);
        if (this.banned(user)) return this.json({ error: 'banned' }, 403);
        this.sql.exec('INSERT OR IGNORE INTO reports (item, sub) VALUES (?, ?)', id, user.sub);
        const n = this.row('SELECT COUNT(*) AS n FROM reports WHERE item = ?', id).n;
        this.sql.exec('UPDATE items SET reports = ?, hidden = CASE WHEN ? >= ? THEN 1 ELSE hidden END WHERE id = ?', n, n, STORE.hideAt, id);
        return this.json({ ok: true });
      }

      if (act === 'unhide' && meth === 'POST') {
        if (!admin) return this.json({ error: 'forbidden' }, 403);
        this.sql.exec('DELETE FROM reports WHERE item = ?', id);
        this.sql.exec('UPDATE items SET hidden = 0, reports = 0 WHERE id = ?', id);
        return this.json({ ok: true });
      }

      if (!act && meth === 'PUT') {
        if (!mine) return this.json({ error: 'forbidden' }, 403);
        const b = await request.json();
        if (this.banned(user)) return this.json({ error: 'banned' }, 403);
        const meta = storeMeta(b), preset = b.preset ? storePreset(b.preset) : JSON.parse(r.preset);
        this.sql.exec('UPDATE items SET name = ?, descr = ?, cat = ?, tags = ?, preset = ?, thumb = ?, w = ?, d = ?, updated = ?, search = ? WHERE id = ?',
          meta.name, meta.desc, meta.cat, JSON.stringify(meta.tags), JSON.stringify(preset), meta.thumb, preset.w, preset.d, now, storeSearch(meta), id);
        if (b.author) this.sql.exec('UPDATE users SET name = ? WHERE sub = ?', storeStr(b.author, STORE.author), user.sub);
        return this.json({ item: this.light(this.row('SELECT * FROM items WHERE id = ?', id), user, admin) });
      }

      if (!act && meth === 'DELETE') {
        if (!mine && !admin) return this.json({ error: 'forbidden' }, 403);
        this.sql.exec('DELETE FROM items WHERE id = ?', id);
        this.sql.exec('DELETE FROM reports WHERE item = ?', id);
        return this.json({ ok: true });
      }
      return this.json({ error: 'not found' }, 404);
    } catch (e) {
      return this.json({ error: String((e && e.message) || e).slice(0, 120) }, 400);
    }
  }
}

/** Read a request body as text, refusing anything over max bytes (Content-Length first, then while streaming). */
async function storeBody(request, max) {
  if (+request.headers.get('Content-Length') > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader(), chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { try { await reader.cancel(); } catch (_) { } return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.byteLength; }
  return new TextDecoder().decode(all);
}

/**
 * Route a /store/* request: CORS, optional / required sign-in, then a fresh internal request
 * to the FurnStore object (client headers are never forwarded, so `x-fp-user` cannot be forged).
 */
async function storeRoute(request, env, url, origin, fetchImpl = fetch) {
  const cors = corsHeaders(origin, env);
  const out = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors } });
  // Reads without an Origin (the MCP server, curl) are fine; writes must come from the app.
  if (origin ? !originAllowed(origin, env) : request.method !== 'GET') return new Response('Forbidden', { status: 403 });
  if (!env.STORE) return out({ error: 'store not configured' }, 503);
  const auth = /^Bearer\s+(\S+)$/.exec(request.headers.get('Authorization') || '');
  let user = null;
  try { user = auth ? await verifyGoogleToken(auth[1], env, fetchImpl) : null; } catch (_) { return out({ error: 'sign-in check unavailable, try again' }, 503); }
  if (auth && !user) return out({ error: 'invalid sign-in' }, 401);
  const write = request.method !== 'GET' && request.method !== 'HEAD';
  if (write && !user && !url.pathname.endsWith('/use')) return out({ error: 'sign in' }, 401);
  let body;
  if (request.method === 'POST' || request.method === 'PUT') {
    body = await storeBody(request, STORE.preset + STORE_THUMB_MAX + 4096);
    if (body === null) return out({ error: 'request too large' }, 413);
  }
  const headers = { 'Content-Type': 'application/json', 'x-fp-ip': request.headers.get('CF-Connecting-IP') || '' };
  if (user) {
    headers['x-fp-user'] = JSON.stringify(user);
    if (storeAdmins(env).includes(user.sub)) headers['x-fp-admin'] = '1';
  }
  const stub = env.STORE.get(env.STORE.idFromName('global'));
  const res = await stub.fetch(new Request('https://store' + url.pathname + url.search, { method: request.method, headers, body }));
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) h.set(k, v);
  h.set('Cache-Control', 'no-store');
  return new Response(res.body, { status: res.status, headers: h });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      if (!originAllowed(origin, env)) return new Response('Forbidden', { status: 403 });
      const store = url.pathname.startsWith('/store/');
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin, env),
          'Access-Control-Allow-Methods': store ? 'GET, POST, PUT, DELETE, OPTIONS' : 'GET, OPTIONS',
          ...(store ? { 'Access-Control-Allow-Headers': 'Authorization, Content-Type' } : {}),
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (url.pathname.startsWith('/store/')) return storeRoute(request, env, url, origin);

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
