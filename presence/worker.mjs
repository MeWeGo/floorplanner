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
 * Singleton Durable Object tracking active WebSocket tabs using the Hibernation API.
 * Stores no user identifiers, cookies, logs, or plan data.
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
   * Broadcast the live connection count to every connected client.
   * Any dead sockets discovered during send are closed and excluded from a follow-up update.
   * @param {WebSocket} [exclude]
   */
  broadcast(exclude) {
    let live = this.liveSockets(exclude);
    const msg = JSON.stringify({ online: live.length });
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
      const corrected = JSON.stringify({ online: live.length });
      for (const s of live) {
        try { s.send(corrected); } catch (_) { }
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/count') {
      return new Response(JSON.stringify({ online: this.liveSockets().length }), {
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
