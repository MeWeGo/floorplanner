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
            FP_WAKE=1              let an "Ask AI" request start an agent turn
            FP_WAKE_SESSION        pin the OpenCode session to prompt (default: newest
                                   session whose location is this repo)
            FP_WAKE_ORIGINS        extra browser origins allowed to wake (comma list)
            FP_WAKE_CMD            generic agent command instead of OpenCode (stdin = request)
            FP_OPENCODE_CLI        explicit path to opencode-cli(.exe)

   Endpoints:
     GET  /                 a local copy of the app (optional; Pages works too)
     GET  /__plan.json      { rev, plan, updatedAt } — latest plan
     PUT  /__plan.json      { plan, tab } — store + broadcast to other tabs
     GET  /__events?tab=ID  SSE stream (event: plan, request, requests-changed)
     GET  /__requests       pending instructions from the app's "Ask AI" box
     POST /__requests       { text } — queue an instruction (and wake the agent if enabled)
     POST /__requests/ack   { ids:[…] } or { all:true } — mark handled
     GET  /health           { ok, rev, clients, planName, updatedAt, pendingRequests,
                              wake, wakeAgent, wakeSession }

   Bind address defaults to 127.0.0.1 (local only). The bridge is a dev tool:
   do not expose it on a public interface.
   ======================================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

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

/* ---------- optional: wake the agent when a request arrives ----------
   A queued request is inert on its own: the bridge can store it, but only the
   agent's own runtime can start a turn. With FP_WAKE=1 the bridge sends the
   request into the agent session, so the AI pill works without the user
   repeating it in chat.

   This can start work on the user's machine, so it is opt-in twice over:
   FP_WAKE=1 must be set, and a request coming from a browser origin that is
   not allow-listed is still queued but never wakes anything — otherwise any
   website could drive the agent through 127.0.0.1. */
const WAKE = /^(1|true|yes)$/i.test(process.env.FP_WAKE || '');
const WAKE_CMD = process.env.FP_WAKE_CMD || '';          // alternative agent (stdin = request)
const WAKE_ORIGINS = new Set(
  (process.env.FP_WAKE_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
    .concat(['https://mewego.github.io', 'http://127.0.0.1:' + PORT, 'http://localhost:' + PORT])
);
const wake = { enabled: WAKE, cli: null, session: null, agent: WAKE ? 'resolving' : 'off' };
let wakeTimer = null;
let wakeExplicit = false;        // session pinned by env, so do not re-resolve

/** True when the bridge can actually start an agent turn right now. */
function wakeReady() { return !!(WAKE && (wake.agent === 'cmd' || wake.agent === 'opencode')); }

/** Where the OpenCode CLI lives (bare name first, then the desktop bundle). */
function findCli() {
  if (process.env.FP_OPENCODE_CLI) return process.env.FP_OPENCODE_CLI;
  const exe = process.platform === 'win32' ? 'opencode-cli.exe' : 'opencode';
  const dirs = [];
  if (process.env.APPDATA) dirs.push(path.join(process.env.APPDATA, 'ai.opencode.desktop', 'cli'));
  if (process.env.LOCALAPPDATA) dirs.push(path.join(process.env.LOCALAPPDATA, 'Programs', '@opencode-aidesktop', 'resources'));
  const found = [];
  for (const dir of dirs) {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch (e) { continue; }
    for (const name of entries) {
      for (const p of [path.join(dir, name, exe), path.join(dir, name)]) {
        try { if (fs.statSync(p).isFile() && p.endsWith(exe)) found.push(p); } catch (e) { }
      }
    }
  }
  found.sort();                                    // newest version dir last
  return found[found.length - 1] || null;
}

function runCli(cli, args, timeout = 5000) {
  return new Promise((resolve, reject) => {
    execFile(cli, args, { cwd: ROOT, timeout, windowsHide: true }, (err, stdout) => {
      if (err) return reject(err);
      resolve(String(stdout || ''));
    });
  });
}

/** Newest session for this project — the one the user is actually talking to. */
async function newestSession(cli) {
  const out = await runCli(cli, ['api', 'get', '/api/session']);
  const j = JSON.parse(out);
  // /api/session returns { data: [...] } (older shapes wrapped it in .sessions)
  const list = Array.isArray(j && j.data) ? j.data : ((j && j.data && j.data.sessions) || []);
  const norm = p => String(p || '').toLowerCase().replace(/\\/g, '/');
  const mine = list.filter(s => s && s.location && norm(s.location.directory) === norm(ROOT));
  const pick = (mine.length ? mine : list)
    .sort((a, b) => ((b.time && b.time.updated) || 0) - ((a.time && a.time.updated) || 0))[0];
  return pick && pick.id || null;
}

async function resolveWake() {
  if (!WAKE) return;
  if (WAKE_CMD) { wake.agent = 'cmd'; return; }
  const cli = findCli();
  if (!cli) { wake.agent = 'no-open-code-cli'; return; }
  wake.cli = cli;
  wakeExplicit = !!(process.env.FP_WAKE_SESSION || process.env.OPENCODE_SESSION_ID);
  const sid = (wakeExplicit ? (process.env.FP_WAKE_SESSION || process.env.OPENCODE_SESSION_ID) : null)
    || await newestSession(cli);
  if (!sid) { wake.agent = 'no-session'; return; }
  wake.session = sid;
  wake.agent = 'opencode';
}

/** Split a command line, honouring double quotes (avoids cmd.exe re-quoting). */
function parseCmd(s) {
  const out = [];
  let cur = '', quoted = false;
  for (const ch of s) {
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && /\s/.test(ch)) { if (cur) { out.push(cur); cur = ''; } continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** Hand the queued text to the agent. Fire-and-forget: the bridge must stay responsive. */
async function wakeAgent(text) {
  if (!WAKE || !text) return;
  const msg = 'The user sent this from the floor planner AI panel (bridge http://127.0.0.1:' + PORT + ').\n'
    + 'Call the floorplanner MCP tool get_user_requests, make the change with the MCP tools, '
    + 'push_to_browser so the open tab updates, then ack_user_requests.\n\n' + text;
  try {
    if (WAKE_CMD) {
      const parts = parseCmd(WAKE_CMD);
      if (!parts.length) return;
      const p = spawn(parts[0], parts.slice(1),
        { cwd: ROOT, detached: true, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
      p.on('error', e => process.stdout.write('[bridge] wake command failed: ' + e.message + '\n'));
      try { p.stdin.end(msg); } catch (e) { }
      p.unref();
      process.stdout.write('[bridge] request handed to FP_WAKE_CMD\n');
      return;
    }
    if (!wake.cli) return;
    // the user may have opened a newer session since the bridge started
    if (!wakeExplicit) {
      try { const s = await newestSession(wake.cli); if (s) wake.session = s; } catch (e) { }
    }
    if (!wake.session) return;
    const body = JSON.stringify({ text: msg, delivery: 'queue' });
    const p = spawn(wake.cli, ['api', 'post', '/api/session/' + wake.session + '/prompt', '--data', body],
      { cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true });
    p.unref();
    process.stdout.write('[bridge] woke agent session ' + wake.session + '\n');
  } catch (e) {
    process.stdout.write('[bridge] wake failed: ' + (e && e.message || e) + '\n');
  }
}

/** Only the app itself may start a turn; a random site may still queue a note. */
function originMayWake(req) {
  const o = req.headers.origin;
  if (!o) return true;                      // curl / local script, not a browser
  return WAKE_ORIGINS.has(o);
}

function scheduleWake(text) {
  if (!WAKE) return;
  clearTimeout(wakeTimer);
  wakeTimer = setTimeout(() => { wakeAgent(text).catch(() => { }); }, 900);   // batch a burst of quick requests
}

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
      return sendJson(res, 200, {
        ok: true, rev, clients: clients.size, planName: plan && plan.name || null, updatedAt, updatedBy,
        pendingRequests: pendingRequests().length,
        wake: wakeReady(), wakeAgent: wake.agent, wakeSession: wake.session,
      });
    }

    /* --- user → agent requests (the app's "Ask AI" box) --- */
    if (p === '/__requests') {
      if (req.method === 'GET') {
        return sendJson(res, 200, { requests: pendingRequests(), total: requests.length, wake: wakeReady() });
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
        if (WAKE) {
          if (originMayWake(req)) scheduleWake(pendingRequests().map(x => '- ' + x.text).join('\n'));
          else process.stdout.write('[bridge] origin "' + req.headers.origin + '" is not allowed to wake the agent\n');
        }
        return sendJson(res, 200, { ok: true, request: r, wake: wakeReady() });
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
  if (WAKE) {
    resolveWake().then(() => {
      console.log(wakeReady()
        ? '  Wake agent:     on (' + (wake.agent === 'cmd' ? 'FP_WAKE_CMD' : wake.session) + ')'
        : '  Wake agent:     requested but unavailable (' + wake.agent + ')');
      console.log('');
    });
  } else {
    console.log('  Wake agent:     off (set FP_WAKE=1 to let the AI pill start a turn)');
    console.log('');
  }
  console.log('  Keep this terminal open. Ctrl+C to stop.');
  console.log('');
});

process.on('SIGINT', () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 500); });
