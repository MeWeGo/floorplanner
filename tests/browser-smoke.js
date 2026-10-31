#!/usr/bin/env node
/* Browser smoke test: really boot the app in a headless Chromium and check it
   works. Static checks cannot see a runtime crash (the #b3dFit bug only threw
   once the page executed), so this closes that gap.

   Run: node tests/browser-smoke.js
   Env: CHROME_BIN=<chromium path>   (defaults to a local Chrome/Edge)

   Zero dependencies: the DevTools protocol is driven with Node's global
   WebSocket (Node >= 22) and a small static file server. */
'use strict';
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- browser discovery ---------- */
function findBrowser() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  return candidates.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}

/* ---------- tiny static server (same files Pages serves) ---------- */
function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/* ---------- CDP plumbing ---------- */
async function connect(port, pageUrl) {
  let wsUrl = null;
  for (let i = 0; i < 120 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find(t => t.type === 'page' && t.url.startsWith('http'));
      if (page && page.webSocketDebuggerUrl) wsUrl = page.webSocketDebuggerUrl;
    } catch (e) { }
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) throw new Error('Chromium did not expose a debuggable page');

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('CDP socket failed')); });
  let seq = 0;
  const pending = new Map();
  const problems = [];
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      problems.push(`uncaught: ${(d.exception && (d.exception.description || d.exception.value)) || d.text}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      problems.push('console.error: ' + msg.params.args.map(a => a.value || a.description || a.type).join(' '));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      const t = String(msg.params.entry.text || '');
      // CDN/WebGL noise is environmental, not a regression in our code
      if (!/three\.js|cdnjs|jsdelivr|WebGL|GPU|GroupMarkerNotSet|favicon/i.test(t)) problems.push('log: ' + t);
    }
  };
  const send = (method, params) => new Promise(res => {
    const id = ++seq;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', {
      expression: `(async () => { try { return { ok: true, value: await (${expression}) }; } catch (e) { return { ok: false, error: String(e && e.message || e) }; } })()`,
      awaitPromise: true, returnByValue: true,
    });
    if (r.result && r.result.exceptionDetails) {
      throw new Error('evaluate failed: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    }
    const out = r.result.result.value;
    if (!out || out.ok !== true) throw new Error(out && out.error ? out.error : 'evaluate returned nothing');
    return out.value;
  };
  return { ws, send, evaluate, problems, close: () => { try { ws.close(); } catch (e) { } } };
}

/* ---------- the checks ---------- */
const results = [];
function check(name, fn) { results.push({ name, fn }); }

check('the page boots with no uncaught errors', async (page, state) => {
  const info = await page.evaluate(`JSON.stringify({
    hasP: typeof P !== 'undefined' && !!P,
    name: (typeof P !== 'undefined' && P) ? P.name : null,
    floors: (typeof P !== 'undefined' && P) ? P.floors.length : 0,
    toolbar: !!document.getElementById('tools') && document.querySelectorAll('#tools [data-tool]').length,
    svgNodes: document.getElementById('gWalls') ? document.getElementById('gWalls').childElementCount : -1,
    hasBridgeClient: typeof BRIDGE_BASE === 'string' && BRIDGE_BASE.includes('127.0.0.1'),
  })`);
  const s = JSON.parse(info);
  if (!s.hasP) throw new Error('app did not boot (P is undefined)');
  if (!s.name) throw new Error('project has no name');
  if (s.toolbar < 8) throw new Error('toolbar did not render: ' + s.toolbar);
  if (!s.hasBridgeClient) throw new Error('bridge client missing from app.js');
  state.booted = s;
});

check('every starter template loads and draws walls', async page => {
  const report = await page.evaluate(`(() => {
    const out = [];
    for (const btn of [...document.querySelectorAll('[data-tpl]')]) {
      btn.click();
      const f = P.floors[0];
      const card = btn.closest('div') ? btn.closest('div').textContent : '';
      out.push({
        id: btn.dataset.tpl, label: card.replace(/\\s+/g, ' ').trim().slice(0, 40),
        walls: f.walls.length, rooms: f.rooms.length, furn: f.furn.length,
      });
    }
    return out;
  })()`);
  if (report.length < 3) throw new Error('expected the template picker to list templates, found ' + report.length);
  const blank = report.filter(r => /blank|boş/i.test(r.label));
  const empty = report.filter(r => !r.walls && !blank.includes(r));
  if (empty.length) throw new Error('templates without walls: ' + JSON.stringify(empty));
  const furnished = report.filter(r => r.walls > 0 && r.furn > 0);
  if (!furnished.length) throw new Error('no template came with furniture');
});

check('drawing, undo and redo keep the plan consistent', async page => {
  await page.evaluate(`(() => { P = newProject(); loadProject(P); return true; })()`);
  const after = await page.evaluate(`(() => {
    const n0 = P.floors[0].walls.length;
    addRectWalls(0, 0, 400, 300);
    commit();
    const n1 = P.floors[0].walls.length;
    undo();
    const n2 = P.floors[0].walls.length;
    redo();
    const n3 = P.floors[0].walls.length;
    return { n0, n1, n2, n3 };
  })()`);
  if (after.n1 !== after.n0 + 4) throw new Error('rect room did not add 4 walls: ' + JSON.stringify(after));
  if (after.n2 !== after.n0) throw new Error('undo did not remove the walls: ' + JSON.stringify(after));
  if (after.n3 !== after.n1) throw new Error('redo did not restore the walls: ' + JSON.stringify(after));
});

check('export produces a standalone SVG', async page => {
  const svg = await page.evaluate(`(() => {
    const r = exportSvg();
    return { len: r.svg.length, svg: r.svg.slice(0, 60), w: r.w, h: r.h };
  })()`);
  if (!/^<svg/i.test(svg.svg.trim())) throw new Error('exportSvg did not return an <svg>');
  if (svg.w < 100 || svg.h < 100) throw new Error('export has no size: ' + JSON.stringify(svg));
  if (svg.len < 500) throw new Error('export looks empty: ' + svg.len + ' bytes');
});

check('the AI modal opens and offers the agent prompt', async page => {
  const info = await page.evaluate(`(() => {
    document.getElementById('bAi').click();
    const modal = document.getElementById('modal');
    const buttons = [...modal.querySelectorAll('button')].map(b => b.textContent.trim());
    const state = document.getElementById('aiLiveState');
    const prompt = document.getElementById('aiLivePromptText');
    const hasPaste = !!(document.getElementById('aiReply') || document.getElementById('aiCopy'));
    return {
      open: document.getElementById('modalbg').style.display,
      kind: (typeof ui !== 'undefined' && ui.modal) || null,
      buttons, state: state ? state.textContent : null,
      prompt: prompt ? prompt.textContent.slice(0, 40) : null,
      hasPaste,
    };
  })()`);
  if (info.open !== 'flex') throw new Error('modal did not open');
  if (info.kind !== 'ai') throw new Error('wrong modal kind: ' + info.kind);
  if (!info.buttons.some(b => /Copy agent prompt/.test(b))) throw new Error('no copy-prompt button: ' + info.buttons.join('|'));
  if (info.hasPaste) throw new Error('the removed copy/paste flow is back');
  if (!info.state) throw new Error('no connection state line');
  await page.evaluate(`(() => { closeModal(); return true; })()`);
});

check('help modal opens with the shortcut table', async page => {
  const info = await page.evaluate(`(() => {
    document.getElementById('bHelp').click();
    return {
      open: document.getElementById('modalbg').style.display,
      rows: document.querySelectorAll('#modal table.kb tr').length,
      hasAI: /AI/i.test(document.getElementById('modal').textContent || ''),
    };
  })()`);
  if (info.open !== 'flex') throw new Error('help modal did not open');
  if (info.rows < 20) throw new Error('shortcut table is short: ' + info.rows);
  if (!info.hasAI) throw new Error('help does not mention AI editing');
  await page.evaluate(`(() => { closeModal(); return true; })()`);
});

check('light theme re-renders without errors', async page => {
  const info = await page.evaluate(`(() => {
    document.documentElement.dataset.theme = 'light';
    render();
    const bg = getComputedStyle(document.body).backgroundColor;
    document.documentElement.dataset.theme = '';
    render();
    return { bg };
  })()`);
  if (!info.bg) throw new Error('theme switch produced no background');
});

check('3D view builds, or degrades cleanly without WebGL', async page => {
  const info = await page.evaluate(`(() => {
    document.getElementById('b3d').click();
    const toast = document.getElementById('toast');
    return {
      canvas: !!document.querySelector('#v3d canvas'),
      view3d: !!(typeof ui !== 'undefined' && ui.view3d),
      toast: toast ? toast.textContent : '',
      meshes: (typeof T3 !== 'undefined' && T3 && T3.scene) ? T3.scene.children.length : 0,
    };
  })()`);
  if (!info.view3d && /3B|3D/i.test(info.toast)) return 'skipped: WebGL/Three.js unavailable (' + info.toast.slice(0, 60) + ')';
  if (info.view3d && !info.canvas) throw new Error('3D mode active but no canvas');
  if (info.view3d && info.meshes < 3) throw new Error('3D scene is empty: ' + info.meshes + ' nodes');
  await page.evaluate(`(() => { show3D(false); return true; })()`);
  return 'built ' + info.meshes + ' scene nodes';
});

check('3D: the camera view can be captured, and PNG follows the active view', async page => {
  const info = await page.evaluate(`(() => {
    document.getElementById('b3d').click();
    const toast = document.getElementById('toast');
    if (!(typeof ui !== 'undefined' && ui.view3d && typeof T3 !== 'undefined' && T3)) {
      return { view3d: false, toast: toast ? toast.textContent : '' };
    }
    const el = document.getElementById('v3d');
    const before = { w: T3.r.domElement.width, h: T3.r.domElement.height, ratio: T3.r.getPixelRatio() };
    const scale = 1.5;
    const url = render3DDataUrl(scale);
    const after = { w: T3.r.domElement.width, h: T3.r.domElement.height, ratio: T3.r.getPixelRatio() };
    const shot = document.getElementById('b3dShot');
    const camBtns = [...document.querySelectorAll('#c3dCam button')].map(b => b.id);

    // capture the download instead of writing a file, then hit both entry points
    const saved = [];
    const realDownload = window.download;
    window.download = (name, blob) => saved.push({ name, size: blob && blob.size || 0, type: blob && blob.type });
    let pngHandler = '';
    document.getElementById('bPng').click();
    const in3d = saved.length ? saved[saved.length - 1].name : '(no download)';
    show3D(false);
    window.exportPng = () => { pngHandler = '2d'; };
    document.getElementById('bPng').click();
    window.download = realDownload;

    return {
      view3d: true, urlHead: String(url).slice(0, 22), urlLen: url.length,
      before, after, shotBtn: !!shot, shotTitle: shot ? shot.title : '', camBtns,
      in3d, size: saved.length ? saved[0].size : 0, type: saved.length ? saved[0].type : '',
      pngHandler, tooltip2d: document.getElementById('bPng').title,
    };
  })()`);

  if (!info.view3d) return 'skipped: WebGL/Three.js unavailable (' + (info.toast || '').slice(0, 60) + ')';

  // a blank capture is the classic failure: the WebGL buffer was already gone
  if (info.urlHead !== 'data:image/png;base64,') throw new Error('capture is not a PNG data URL: ' + info.urlHead);
  if (info.urlLen < 5000) throw new Error('capture looks blank (' + info.urlLen + ' chars) — the drawing buffer was lost');

  // the viewport must come back exactly as it was
  if (info.after.w !== info.before.w || info.after.h !== info.before.h) {
    throw new Error('viewport not restored: ' + JSON.stringify({ before: info.before, after: info.after }));
  }
  if (Math.abs(info.after.ratio - info.before.ratio) > 1e-9) throw new Error('pixel ratio not restored: ' + info.after.ratio);

  if (!info.shotBtn) throw new Error('#b3dShot is missing from the camera overlay');
  for (const id of ['b3dFit', 'b3dTop', 'b3dEye', 'b3dShot']) {
    if (!info.camBtns.includes(id)) throw new Error('#' + id + ' is not in the camera bar: ' + info.camBtns.join(','));
  }
  if (!/-3d-render\.png$/.test(info.in3d)) throw new Error('3D PNG filename is wrong: ' + info.in3d);
  if (info.size < 3000) throw new Error('downloaded render is suspiciously small: ' + info.size + ' bytes');
  if (!/^image/.test(info.type || '')) throw new Error('render blob has no image type: ' + info.type);
  if (!info.shotTitle) throw new Error('the 📸 button has no tooltip');
  if (info.pngHandler !== '2d') throw new Error('leaving 3D must restore the 2D PNG export');
  if (!info.tooltip2d) throw new Error('the PNG tooltip does not follow the view');

  await page.evaluate(`(() => { show3D(false); return true; })()`);
  return 'captured ' + Math.round(info.size / 1024) + ' KB · ' + info.in3d;
});

/* ---------- main ---------- */
(async () => {
  const browserPath = findBrowser();
  if (!browserPath) {
    console.log('SKIP browser smoke test: no Chromium/Chrome/Edge found (set CHROME_BIN).');
    process.exit(0);
  }
  if (typeof WebSocket !== 'function') {
    console.log('SKIP browser smoke test: this Node has no global WebSocket (need Node >= 22).');
    process.exit(0);
  }

  const server = await serve();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-smoke-'));
  const debugPort = 9300 + Math.floor(Math.random() * 300);

  const browser = spawn(browserPath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu-sandbox',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
    '--window-size=1400,900',
    url,
  ], { stdio: 'ignore' });

  let page = null;
  let failed = 0;
  try {
    page = await connect(debugPort, url);
    await page.send('Runtime.enable');
    await page.send('Log.enable');
    await page.send('Page.enable');

    // wait for boot (loadProject runs async: IndexedDB → project → render)
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      try { ready = await page.evaluate(`typeof P !== 'undefined' && !!P && !!document.querySelector('#gWalls')`); } catch (e) { }
      if (!ready) await sleep(250);
    }
    if (!ready) throw new Error('the app never finished booting');
    await sleep(400);

    console.log(`\nBrowser smoke test — ${path.basename(browserPath)} on ${url}\n`);
    const state = {};
    for (const { name, fn } of results) {
      const before = page.problems.length;
      try {
        const note = await fn(page, state);
        await sleep(250);                       // let late render errors land
        const fresh = page.problems.slice(before);
        if (fresh.length) throw new Error('runtime problem:\n      ' + fresh.join('\n      '));
        console.log(`  ok    ${name}${note ? '  (' + note + ')' : ''}`);
      } catch (e) {
        failed += 1;
        console.log(`  FAIL  ${name}\n        ${String(e.message || e).split('\n').join('\n        ')}`);
      }
    }
  } catch (e) {
    failed += 1;
    console.log('  FAIL  harness: ' + (e.message || e));
  } finally {
    if (page) page.close();
    try { browser.kill(); } catch (e) { }
    server.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { }
  }

  console.log(failed ? `\n${failed} check(s) failed\n` : '\nall browser checks passed\n');
  process.exit(failed ? 1 : 0);
})();
