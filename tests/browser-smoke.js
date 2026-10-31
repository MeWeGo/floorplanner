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
      // CDN/WebGL noise is environmental, not a regression in our code. The
      // AI bridge probe also expects no server on 8787 during the smoke run.
      if (!/three\.js|cdnjs|jsdelivr|WebGL|GPU|GroupMarkerNotSet|favicon|ERR_CONNECTION_REFUSED/i.test(t)) problems.push('log: ' + t);
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

check('wall paint and slab / room materials render in 2D and 3D (issue #12)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject());
    const f = F();
    addRectWalls(0, 0, 400, 300);
    const rm = autoRoomAt({ x: 200, y: 150 }, true);
    sel = [f.walls[0].id]; renderProps();
    const btn = document.querySelector('#props [data-act="paint"][data-c="#b7c4a8"]');
    if (!btn) return { err: 'no paint swatch in the wall panel' };
    btn.click();
    f.slabFloor = 'marble'; f.slabColor = '#e7e5e4';
    if (rm) rm.floor = 'stone';
    sel = []; refresh();
    const painted = document.querySelectorAll('#gWalls line[stroke="#b7c4a8"]').length;
    document.getElementById('b3d').click();
    const r = { painted, color: f.walls[0].color, view3d: !!ui.view3d };
    if (ui.view3d) {
      let wallHit = false, slabTex = false;
      T3.scene.traverse(o => {
        if (o.isMesh && !Array.isArray(o.material) && o.material.color && o.material.color.getHexString() === 'b7c4a8') wallHit = true;
        if (o.isMesh && Array.isArray(o.material) && o.material[0].map) slabTex = true;
      });
      r.wallHit = wallHit; r.slabTex = slabTex;
      show3D(false);
    }
    return r;
  })()`);
  if (info.err) throw new Error(info.err);
  if (info.color !== '#b7c4a8') throw new Error('swatch did not paint the wall: ' + info.color);
  if (info.painted < 2) throw new Error('painted wall shows no paint strips in 2D');
  if (info.view3d && !info.wallHit) throw new Error('wall paint did not reach the 3D wall material');
  if (info.view3d && !info.slabTex) throw new Error('slab material has no texture in 3D');
  return info.view3d ? 'paint + marble slab in 2D and 3D' : 'paint in 2D (3D unavailable)';
});

check('project tabs keep separate plans and undo, and paste across (issue #17)', async page => {
  const info = await page.evaluate(`(async () => {
    tabs = []; tabIdx = 0; loadProject(Object.assign(newProject(), { name: 'Tab A' }));
    addRectWalls(0, 0, 400, 300); commit();
    const histA = hi;
    sel = [F().walls[0].id]; copySel();
    templatesModal();
    const card = document.querySelector('[data-tpl="2"]'); if (!card) return { err: 'no template card' };
    card.click();                                   // opens in a NEW tab: tab A has walls
    const r = { n1: tabs.length, idx1: tabIdx, bName: P.name, bWalls: F().walls.length };
    const before = F().walls.length; paste(false);  // cross-project paste
    r.pasted = F().walls.length - before;
    r.bar = document.querySelectorAll('#ptabs .ptab').length;
    document.querySelector('#ptabs [data-tab="0"]').click();
    r.aName = P.name; r.aWalls = F().walls.length; r.aHi = hi === histA;
    undo(); r.aAfterUndo = F().walls.length;
    document.querySelector('#ptabs [data-tab="1"]').click();
    r.bStill = F().walls.length;
    r.state = tabsState().tabs.length;
    window.confirm = () => true;
    await closeTab(1);
    r.n2 = tabs.length; r.after = P.name;
    return r;
  })()`);
  if (info.err) throw new Error(info.err);
  if (info.n1 !== 2 || info.idx1 !== 1) throw new Error('template did not open in a new tab: ' + JSON.stringify(info));
  if (info.bar !== 2) throw new Error('tab bar shows ' + info.bar + ' tabs');
  if (info.pasted !== 1) throw new Error('cross-tab paste added ' + info.pasted + ' walls');
  if (info.aName !== 'Tab A' || info.aWalls !== 4 || !info.aHi) throw new Error('tab A not restored: ' + JSON.stringify(info));
  if (info.aAfterUndo !== 0) throw new Error('tab A lost its own undo history');
  if (info.bStill !== info.bWalls + 1) throw new Error('undo in tab A leaked into tab B');
  if (info.state !== 2) throw new Error('open tabs are not persisted');
  if (info.n2 !== 1 || info.after !== 'Tab A') throw new Error('closing a tab went wrong: ' + JSON.stringify(info));
  return '2 tabs, separate undo, cross-tab paste, close';
});

check('overlapping objects: Ctrl+click cycles, right-click lists, layers reorder, 3D lifts', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject());
    const f = F(), p1 = mkFurn(BYID.pool, 200, 200), p2 = mkFurn(BYID.pool, 400, 200);
    f.furn.push(p1, p2); commit(); view.z = 0.5; view.x = 100; view.y = 50; setTool('select'); render();
    const r = cv.getBoundingClientRect(), s = w2s({ x: 300, y: 200 });
    const ev = (type, extra = {}) => cv.dispatchEvent(new PointerEvent(type, { clientX: r.left + s.x, clientY: r.top + s.y, bubbles: true, pointerId: 1, button: 0, ...extra }));
    const out = { under: idsAt(r.left + s.x, r.top + s.y) };
    ev('pointerdown'); ev('pointerup'); out.plain = sel.slice();
    ev('pointerdown', { ctrlKey: true }); ev('pointerup', { ctrlKey: true }); out.ctrl1 = sel.slice();
    ev('pointerdown', { ctrlKey: true }); ev('pointerup', { ctrlKey: true }); out.ctrl2 = sel.slice();
    cv.dispatchEvent(new MouseEvent('contextmenu', { clientX: r.left + s.x, clientY: r.top + s.y, bubbles: true, button: 2 }));
    const m = document.getElementById('ctxMenu');
    out.menuItems = m ? m.querySelectorAll('[data-cmsel]').length : 0;
    out.menuLayers = m ? m.querySelectorAll('[data-cmlayer]').length : 0;
    sel = [p2.id]; if (m) m.querySelector('[data-cmlayer="back"]').click();
    out.order = F().furn.map(o => o.id === p1.id ? 'p1' : 'p2').join(',');
    out.menuClosed = !document.getElementById('ctxMenu');
    document.getElementById('b3d').click();
    if (ui.view3d) {
      const ys = F().furn.map(o => { const g = T3.scene.children.find(c => c.userData && c.userData.furnId === o.id); const ig = g && g.children[0]; return ig && ig.isGroup ? ig.position.y : 0; });
      out.lift = ys; show3D(false);
    }
    out.ids = { p1: p1.id, p2: p2.id };
    sel = []; refresh();                                 // leave no selection for the next check
    return out;
  })()`);
  const { p1, p2 } = info.ids;
  if (info.under.length !== 2) throw new Error('expected 2 objects under the cursor, got ' + JSON.stringify(info.under));
  if (info.plain[0] !== p2) throw new Error('plain click should pick the top (later) pool');
  if (info.ctrl1[0] !== p1) throw new Error('Ctrl+click did not reach the pool underneath: ' + JSON.stringify(info));
  if (info.ctrl2[0] !== p2) throw new Error('Ctrl+click did not wrap back to the top');
  if (info.menuItems !== 2 || info.menuLayers !== 4) throw new Error('right-click menu incomplete: ' + JSON.stringify(info));
  if (info.order !== 'p2,p1' || !info.menuClosed) throw new Error('send-to-back did not reorder: ' + info.order);
  if (info.lift && !(info.lift[1] > info.lift[0])) throw new Error('3D does not lift the upper pool: ' + JSON.stringify(info.lift));
  return 'pick under, list, reorder' + (info.lift ? ', 3D lift ' + info.lift.join('/') : '');
});

check('3D: a real render is produced, and PNG follows the active view', async page => {
  const info = await page.evaluate(`(async () => {
    document.getElementById('b3d').click();
    const toast = document.getElementById('toast');
    if (!(typeof ui !== 'undefined' && ui.view3d && typeof T3 !== 'undefined' && T3)) {
      return { view3d: false, toast: toast ? toast.textContent : '' };
    }
    const el = document.getElementById('v3d');
    const before = { w: T3.r.domElement.width, h: T3.r.domElement.height, ratio: T3.r.getPixelRatio() };
    const shadowBefore = T3.scene.children.filter(o => o.isDirectionalLight && o.castShadow).map(l => l.shadow.mapSize.x);

    // 1. the quick capture (one synchronous pass)
    const quickUrl = render3DDataUrl(1.5);

    // 2. the real render: fewer passes and no upscale to keep the test quick
    const hqUrl = await render3DHQ({ frames: 2, scale: 1, supersample: 2 });
    const after = { w: T3.r.domElement.width, h: T3.r.domElement.height, ratio: T3.r.getPixelRatio() };
    const shadowAfter = T3.scene.children.filter(o => o.isDirectionalLight && o.castShadow).map(l => l.shadow.mapSize.x);

    const shot = document.getElementById('b3dShot');
    const camBtns = [...document.querySelectorAll('#c3dCam button')].map(b => b.id);

    // 3. capture the downloads instead of writing files, then hit both entry points
    const saved = [];
    const realDownload = window.download;
    window.download = (name, blob) => saved.push({ name, size: blob && blob.size || 0, type: blob && blob.type });
    await export3DRender();                 // default = high quality
    await export3DRender(true);             // Shift = quick view
    let pngHandler = '';
    show3D(false);
    window.exportPng = () => { pngHandler = '2d'; };
    document.getElementById('bPng').click();
    window.download = realDownload;

    return {
      view3d: true, quickHead: String(quickUrl).slice(0, 22), quickLen: quickUrl.length,
      hqHead: String(hqUrl).slice(0, 22), hqLen: hqUrl.length,
      before, after, shadowBefore, shadowAfter, shotBtn: !!shot, shotTitle: shot ? shot.title : '', camBtns,
      names: saved.map(x => x.name), sizes: saved.map(x => x.size), types: saved.map(x => x.type),
      pngHandler, tooltip2d: document.getElementById('bPng').title,
    };
  })()`);
  if (!info.view3d) return 'skipped: WebGL/Three.js unavailable (' + (info.toast || '').slice(0, 60) + ')';

  // a blank capture is the classic failure: the WebGL buffer was already gone
  if (info.quickHead !== 'data:image/png;base64,') throw new Error('quick capture is not a PNG: ' + info.quickHead);
  if (info.quickLen < 5000) throw new Error('quick capture looks blank (' + info.quickLen + ' chars)');

  // the render must come back as a real image, not an empty string (which would
  // silently fall back to a plain capture — exactly the bug this guards)
  if (info.hqHead !== 'data:image/png;base64,') throw new Error('render3DHQ() produced no PNG: ' + info.hqHead);
  if (info.hqLen < 5000) throw new Error('render looks blank (' + info.hqLen + ' chars)');

  // the render boosts the shadow map and must put it back
  if (info.shadowBefore.join() !== info.shadowAfter.join()) {
    throw new Error('shadow map not restored: ' + info.shadowBefore + ' -> ' + info.shadowAfter);
  }
  // the viewport must come back exactly as it was
  if (info.after.w !== info.before.w || info.after.h !== info.before.h) {
    throw new Error('viewport not restored: ' + JSON.stringify({ before: info.before, after: info.after }));
  }
  if (Math.abs(info.after.ratio - info.before.ratio) > 1e-9) throw new Error('pixel ratio not restored: ' + info.after.ratio);

  if (!info.shotBtn) throw new Error('#b3dShot is missing from the camera overlay');
  for (const id of ['b3dFit', 'b3dTop', 'b3dEye', 'b3dShot']) {
    if (!info.camBtns.includes(id)) throw new Error('#' + id + ' is not in the camera bar: ' + info.camBtns.join(','));
  }
  if (!/-3d-render\.png$/.test(info.names[0] || '')) throw new Error('3D render filename is wrong: ' + info.names[0]);
  if (!/-3d-view\.png$/.test(info.names[1] || '')) throw new Error('quick capture filename is wrong: ' + info.names[1]);
  if (info.sizes[0] < 3000) throw new Error('rendered PNG is suspiciously small: ' + info.sizes[0] + ' bytes');
  if (!/^image/.test(info.types[0] || '')) throw new Error('render blob has no image type: ' + info.types[0]);
  if (!info.shotTitle) throw new Error('the render button has no tooltip');
  if (info.pngHandler !== '2d') throw new Error('leaving 3D must restore the 2D PNG export');
  if (!info.tooltip2d) throw new Error('the PNG tooltip does not follow the view');

  await page.evaluate(`(() => { show3D(false); return true; })()`);
  return 'render ' + Math.round(info.sizes[0] / 1024) + ' KB · ' + info.names[0];
});

/* Dispatch a REAL key event, so the test covers the same path a user hits
   (window keydown handler + preventDefault), not a synthetic call to undo(). */
const keyBase = ({ key, code, vk, ctrl, shift }) => {
  let modifiers = 0;
  if (ctrl) modifiers |= 2;
  if (shift) modifiers |= 8;
  return { modifiers, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
};
async function keyDown(page, k) {
  const base = keyBase(k);
  await page.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown', text: k.ctrl ? undefined : k.key }, base));
  await sleep(80);
}
async function keyUp(page, k) {
  await page.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyUp' }, keyBase(k)));
  await sleep(80);
}
async function pressKey(page, k) { await keyDown(page, k); await keyUp(page, k); }

check('3D: Ctrl+Z / Ctrl+Y undo the plan without leaving the 3D view', async page => {
  // start from the 2D plan and add a wall so there is something to undo
  await page.evaluate(`(() => {
    show3D(false); closeModal();
    const f = F();
    f.walls.push(mkWall({ x: 0, y: 1200 }, { x: 300, y: 1200 }));
    commit(); refresh();
    return true;
  })()`);
  const before = await page.evaluate(`(() => ({ walls: F().walls.length, hi, hist: hist.length }))()`);

  await page.evaluate(`(() => { document.getElementById('b3d').click(); return true; })()`);
  await sleep(1200);
  const in3d = await page.evaluate(`!!ui.view3d`);

  await pressKey(page, { key: 'z', code: 'KeyZ', vk: 90, ctrl: true });
  await sleep(400);                                       // schedBuild3D is debounced
  const afterUndo = await page.evaluate(`(() => ({
    walls: F().walls.length, hi, view3d: !!ui.view3d,
    meshes: T3 && T3.scene ? T3.scene.children.length : 0,
  }))()`);

  await pressKey(page, { key: 'y', code: 'KeyY', vk: 89, ctrl: true });
  await sleep(400);
  const afterRedo = await page.evaluate(`(() => ({ walls: F().walls.length, hi }))()`);

  // a plain "a" must still strafe (walk) instead of selecting everything:
  // sample while the key is HELD DOWN, because keyup clears the walk set
  await keyDown(page, { key: 'a', code: 'KeyA', vk: 65 });
  const held = await page.evaluate(`(() => ({ walking: keys3D.has('a'), sel: sel.length }))()`);
  await keyUp(page, { key: 'a', code: 'KeyA', vk: 65 });
  const released = await page.evaluate(`keys3D.has('a')`);

  await page.evaluate(`(() => { show3D(false); return true; })()`);

  if (!in3d) return 'skipped: WebGL/Three.js unavailable';
  if (afterUndo.walls !== before.walls - 1) {
    throw new Error('Ctrl+Z did nothing in 3D: walls ' + before.walls + ' -> ' + afterUndo.walls);
  }
  if (afterUndo.hi !== before.hi - 1) throw new Error('history pointer did not move back');
  if (!afterUndo.view3d) throw new Error('undo must not kick the user out of the 3D view');
  if (afterUndo.meshes < 3) throw new Error('the 3D scene was not rebuilt after undo: ' + afterUndo.meshes + ' nodes');
  if (afterRedo.walls !== before.walls) {
    throw new Error('Ctrl+Y did not redo: walls ' + afterRedo.walls + ' (expected ' + before.walls + ')');
  }
  if (afterRedo.hi !== before.hi) throw new Error('redo did not return the history pointer');
  if (!held.walking) throw new Error('plain "a" no longer walks in 3D — the shortcut layer is swallowing it');
  if (released) throw new Error('keyup did not release the walk key');
  if (held.sel !== 0) throw new Error('a plain "a" must not select all in 3D (that is Ctrl+A)');

  return 'undo/redo work in 3D (' + before.walls + ' walls)';
});

/* ---------- main ---------- */(async () => {
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
