#!/usr/bin/env node
'use strict';
/* ===================== Kat Planı Çizici — AI Bridge =====================
   A tiny local HTTP server (zero dependencies) that links the MCP server to
   the floor planner running in your browser:

       MCP server ──push──▶ bridge ──SSE──▶ open app tab ──▶ autosave ▶ IndexedDB
            ▲                 │                                            │
            └──── info ───────┘                         the change survives a refresh

   The app itself contains the client (the AI bridge section of app.js), so it
   connects to this server from ANY origin — the deployed GitHub Pages build,
   a local file:// copy, or the page this server hosts at 127.0.0.1:8787.
   Nothing is injected and no file has to be loaded from here.

   Usage:   node mcp/bridge.js            (your agent runs this; the app connects)
   Env:     FP_BRIDGE_PORT (default 8787), FP_BRIDGE_HOST (default 127.0.0.1)

   Endpoints:
     GET  /                 a local copy of the app (optional; Pages works too)
     GET  /__plan.json      { rev, plan, updatedAt } — latest plan
     PUT  /__plan.json      { plan, tab } — store + broadcast to other tabs
     GET  /__events?tab=ID  SSE stream (event: plan, request, requests-changed)
     GET  /__requests       pending instructions from the app's "Ask AI" box
     POST /__requests       { text } — queue an instruction for the agent
     POST /__requests/ack   { ids:[…] } or { all:true } — mark handled
     GET  /health           { ok, rev, clients, planName, updatedAt, pendingRequests }

   Bind address defaults to 127.0.0.1 (local only). The bridge is a dev tool:
   do not expose it on a public interface.
   ======================================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.FP_BRIDGE_PORT) || 8787;
const HOST = process.env.FP_BRIDGE_HOST || '127.0.0.1';
const BODY_LIMIT = 64 * 1024 * 1024; // background images are data URLs — allow big projects

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/* ---------- shared state ---------- */
let rev = 0;                 // monotonic version of the plan
let plan = null;             // latest project JSON (P schema v2)
let updatedAt = 0;
let updatedBy = null;
const clients = new Set();   // { res, tab }

/* ---------- user → agent request queue ---------- */
let requests = [];           // { id, text, at, status: 'pending' | 'done' }
let reqSeq = 0;
function addRequest(text) {
  const r = {
    id: 'r' + (++reqSeq).toString(36) + Date.now().toString(36),
    text: String(text).slice(0, 2000),
    at: Date.now(),
    status: 'pending',
  };
  requests.push(r);
  if (requests.length > 200) requests = requests.slice(-200);
  return r;
}
const pendingRequests = () => requests.filter(r => r.status === 'pending');

/* ---------- helpers ---------- */
// Shared CORS headers. `Allow-Private-Network` lets the GitHub Pages build
// (a public origin) reach this local server in Chrome/Edge.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Private-Network': 'true',
};
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  }, CORS));
  res.end(body);
}
function sendText(res, code, text, mime) {
  res.writeHead(code, Object.assign({ 'Content-Type': mime || 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }, CORS));
  res.end(text);
}
function serveFile(res, rel, mimeKey) {
  try {
    const buf = fs.readFileSync(path.join(ROOT, rel));
    res.writeHead(200, Object.assign({ 'Content-Type': MIME[mimeKey] || 'application/octet-stream', 'Cache-Control': 'no-store' }, CORS));
    res.end(buf);
  } catch (e) {
    sendText(res, 404, 'Not found: ' + rel);
  }
}
function serveIndex(res) {
  try {
    // app.js now contains the bridge client, so nothing needs injecting:
    // the page connects on its own (from Pages, file:// or this origin).
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    res.writeHead(200, Object.assign({ 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' }, CORS));
    res.end(html);
  } catch (e) {
    sendText(res, 500, 'Could not read index.html: ' + e.message);
  }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > BODY_LIMIT) { reject(new Error('Body too large (' + BODY_LIMIT + ' bytes max)')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function validPlan(p) {
  return !!p && typeof p === 'object' && Array.isArray(p.floors) && p.floors.length > 0 && p.floors.every(f => f && typeof f === 'object');
}

/* ---------- SSE ---------- */
function sse(req, res, tab) {
  res.writeHead(200, Object.assign({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  }, CORS));
  res.write('retry: 2000\n\n');
  const client = { res, tab };
  clients.add(client);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) { } }, 15000);
  res.on('close', () => { clearInterval(ping); clients.delete(client); });
}

function broadcast(payload, exceptTab) {
  broadcastEvent('plan', payload, exceptTab);
}
function broadcastEvent(name, data, exceptTab) {
  const line = 'event: ' + name + '\ndata: ' + JSON.stringify(data) + '\n\n';
  for (const c of clients) {
    if (c.tab === exceptTab) continue;
    try { c.res.write(line); } catch (e) { }
  }
}

/* ---------- HTTP server ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://bridge');
  const p = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      // Chrome's Private Network Access: a page on a public origin (GitHub
      // Pages) may only reach 127.0.0.1 when the server opts in explicitly.
      'Access-Control-Allow-Private-Network': 'true',
    });
    return res.end();
  }

  try {
    /* --- app + assets (injected) --- */
    if (p === '/' || p === '/index.html') return serveIndex(res);
    if (p === '/app.js') return serveFile(res, 'app.js', '.js');
    if (p === '/style.css') return serveFile(res, 'style.css', '.css');
    if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }

    /* --- health --- */
    if (p === '/health') {
      return sendJson(res, 200, { ok: true, rev, clients: clients.size, planName: plan && plan.name || null, updatedAt, updatedBy, pendingRequests: pendingRequests().length });
    }

    /* --- user → agent requests (the app's "Ask AI" box) --- */
    if (p === '/__requests') {
      if (req.method === 'GET') {
        return sendJson(res, 200, { requests: pendingRequests(), total: requests.length });
      }
      if (req.method === 'POST') {
        let body;
        try { body = JSON.parse(await readBody(req)); }
        catch (e) { return sendJson(res, 400, { error: 'Invalid JSON: ' + e.message }); }
        const text = body && String(body.text || '').trim();
        if (!text) return sendJson(res, 400, { error: 'Body must be { text: "instruction for the agent" }' });
        const r = addRequest(text);
        broadcastEvent('request', r);
        process.stdout.write('[bridge] user request: "' + text.slice(0, 120) + '"\n');
        return sendJson(res, 200, { ok: true, request: r });
      }
      res.writeHead(405, Object.assign({ Allow: 'GET, POST, OPTIONS' }, CORS));
      return res.end();
    }
    if (p === '/__requests/ack' && req.method === 'POST') {
      let body;
      try { body = JSON.parse(await readBody(req)); }
      catch (e) { return sendJson(res, 400, { error: 'Invalid JSON: ' + e.message }); }
      const ids = new Set((body && Array.isArray(body.ids) ? body.ids : []).map(String));
      let n = 0;
      for (const r of requests) {
        if (r.status !== 'pending') continue;
        if (body && body.all === true || ids.has(r.id)) { r.status = 'done'; n += 1; }
      }
      broadcastEvent('requests-changed', { pending: pendingRequests().length });
      return sendJson(res, 200, { ok: true, acked: n, pending: pendingRequests().length });
    }

    /* --- plan in / out --- */
    if (p === '/__plan.json') {
      if (req.method === 'GET') return sendJson(res, 200, { rev, plan, updatedAt, updatedBy });
      if (req.method === 'PUT' || req.method === 'POST') {
        let body;
        try { body = JSON.parse(await readBody(req)); }
        catch (e) { return sendJson(res, 400, { error: 'Invalid JSON: ' + e.message }); }
        if (!body || !validPlan(body.plan)) return sendJson(res, 400, { error: 'Body must be { plan: <project with non-empty floors[]>, tab?: string }' });
        plan = body.plan;
        rev += 1;
        updatedAt = Date.now();
        updatedBy = String(body.tab || 'unknown');
        broadcast({ rev, plan, tab: updatedBy }, updatedBy);
        process.stdout.write('[bridge] plan v' + rev + ' received from ' + updatedBy + ' → broadcast to ' + clients.size + ' tab(s)\n');
        return sendJson(res, 200, { ok: true, rev, clients: clients.size });
      }
      res.writeHead(405, Object.assign({ Allow: 'GET, PUT, POST, OPTIONS' }, CORS));
      return res.end();
    }

    /* --- live events --- */
    if (p === '/__events') return sse(req, res, url.searchParams.get('tab') || '');

    sendText(res, 404, 'Not found. The bridge serves only the app and its /__* endpoints.');
  } catch (e) {
    try { sendJson(res, 500, { error: String(e && e.message || e) }); } catch (e2) { }
  }
});

server.on('error', e => {
  if (e && e.code === 'EADDRINUSE') {
    console.error('[bridge] Port ' + PORT + ' is already in use. Close the other bridge or set FP_BRIDGE_PORT.');
    process.exit(1);
  }
  console.error('[bridge] ' + (e && e.stack || e));
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  🤖 Kat Planı Çizici — AI bridge');
  console.log('  ------------------------------------------------');
  console.log('  Open the app:   http://' + HOST + ':' + PORT + '/');
  console.log('  AI tools use:   ' + 'http://' + HOST + ':' + PORT);
  console.log('');
  console.log('  Keep this terminal open. Ctrl+C to stop.');
  console.log('');
});

process.on('SIGINT', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500); });
