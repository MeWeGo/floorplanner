/* Floor Planner service worker (#203): install as an app and work offline. Hand-written, no dependencies.
   - The app shell and the pinned CDN scripts (Three.js r128 + OrbitControls) are cached at install, so 2D and 3D
     open without a network. Fonts are cached the first time they load (the app falls back to system fonts).
   - The app files are served from the cache first; a new deploy changes BUILD (deploy.yml writes the commit id),
     the browser installs the new worker next to the old one and the page offers "Reload" (it posts 'skip-waiting').
   - Everything else (the AI bridge on 127.0.0.1, Google Drive, the live-room / store workers) goes to the network.
   Registered only over http(s) by app.js (never on file://), and not with ?sw=off. */
'use strict';
const BUILD = '__BUILD__';
const CACHE = 'fp-' + BUILD;
const SHELL = ['./', 'index.html', 'app.js', 'style.css', 'privacy.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
// not deployed (local copy, the AI bridge's own page): network first, so edits show at once; the cache is the offline fallback
const DEV = BUILD.startsWith('__');

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // bypass the HTTP cache (GitHub Pages: max-age=600), or a build could mix a new index.html with an old style.css
    await c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
    // CDN scripts: a failure (offline install, blocked CDN) must not stop the worker from installing
    await Promise.all(CDN.map(u => fetch(u, { mode: 'cors' }).then(r => (r.ok ? c.put(u, r) : null)).catch(() => null)));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('fp-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'skip-waiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (same) {
    // only the app's own files; anything else on this origin (e.g. the bridge's endpoints) stays on the network
    const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);
    const shell = path && SHELL.includes(path) ? path : req.mode === 'navigate' ? 'index.html' : null;
    if (!shell) return;
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      if (DEV) { try { const r = await fetch(req, { cache: 'no-store' }); if (r.ok) c.put(shell, r.clone()); return r; } catch (err) { return (await c.match(shell)) || Response.error(); } }
      const hit = await c.match(shell);
      if (hit) return hit;
      const r = await fetch(req); if (r.ok) c.put(shell, r.clone()); return r;
    })());
    return;
  }
  if (CDN.includes(req.url) || FONT_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req.url);
      if (hit) return hit;
      try { const r = await fetch(req); if (r.ok || r.type === 'opaque') c.put(req.url, r.clone()); return r; }
      catch (err) { return new Response('', { status: 504, statusText: 'offline' }); }
    })());
  }
});
