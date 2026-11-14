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
  let wsUrl = null, opened = false;
  // A cold runner sometimes starts Chromium without loading the URL from the command line (the tab stays
  // on about:blank, or no tab at all) — CI once failed here with no check run. After ~5 s with the
  // debugger up, open the page ourselves through CDP; give the whole start-up 60 s.
  for (let i = 0; i < 240 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find(t => t.type === 'page' && t.url.startsWith('http'));
      if (page && page.webSocketDebuggerUrl) wsUrl = page.webSocketDebuggerUrl;
      else if (!opened && i >= 20 && pageUrl) {
        opened = true;
        await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(pageUrl)}`, { method: 'PUT' }).catch(() => { });
      }
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

check('the test tab stays off any running AI bridge (?bridge=off)', async page => {
  const info = await page.evaluate(`(() => ({
    off: typeof BRIDGE_OFF !== 'undefined' && BRIDGE_OFF,
    connected: !!brgConnected, es: !!brgEs, probing: !!brgProbeTimer,
    hits: performance.getEntriesByType('resource').map(r => r.name).filter(n => n.includes(':8787')),
  }))()`);
  if (!info.off) throw new Error('smoke page was not opened with ?bridge=off');
  if (info.connected || info.es || info.probing) throw new Error('bridge client is active despite ?bridge=off: ' + JSON.stringify(info));
  if (info.hits.length) throw new Error('page contacted the bridge: ' + info.hits.join(', '));
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

check('adjustable group: edit members adds a new wall and places it per layout without cycling', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject());
    const f = F(), w1 = mkWall({ x: 0, y: 0 }, { x: 300, y: 0 }), w2 = mkWall({ x: 0, y: 200 }, { x: 300, y: 200 });
    f.walls.push(w1, w2); commit(); setTool('select');
    sel = [w1.id, w2.id]; groupSel(); varAction('varInit'); varAction('varNew');
    const rec = f.groups[0];
    // 1b: shift the group so the two layouts differ
    [w1, w2].forEach(w => { w.a.x += 100; w.b.x += 100; }); commit();
    sel = [w1.id]; refresh();
    document.querySelector('[data-act="grpEdit"]').click();
    const editing = !!ui.grpEdit;
    const w3 = mkWall({ x: 100, y: 400 }, { x: 400, y: 400 }); f.walls.push(w3); commit();
    const joined = w3.grp === rec.id && rec.vars.every(v => v.poses[w3.id]);
    // click the new wall: selects it alone, no layout change
    view.z = 1; view.x = 50; view.y = 50; render();
    const r = cv.getBoundingClientRect(), s = w2s({ x: 250, y: 400 });
    const ev = (type, dx = 0) => cv.dispatchEvent(new PointerEvent(type, { clientX: r.left + s.x + dx, clientY: r.top + s.y, bubbles: true, pointerId: 1, button: 0 }));
    const idx0 = rec.idx;
    ev('pointerdown'); ev('pointerup');
    const alone = sel.length === 1 && sel[0] === w3.id, noCycle = rec.idx === idx0;
    // drag it 60 cm right in 1b
    ev('pointerdown'); ev('pointermove', 30); ev('pointermove', 60); ev('pointerup', 60);
    const moved1b = w3.a.x;
    switchGroupVarTo(rec, 0);
    const in1a = w3.a.x, w1in1a = w1.a.x;
    switchGroupVarTo(rec, 1);
    const back1b = w3.a.x;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    return { editing, joined, alone, noCycle, moved1b, in1a, back1b, w1in1a, after: !!ui.grpEdit };
  })()`);
  if (!info.editing) throw new Error('Edit members button did not start editing: ' + JSON.stringify(info));
  if (!info.joined) throw new Error('a wall drawn while editing did not join the group: ' + JSON.stringify(info));
  if (!info.alone || !info.noCycle) throw new Error('clicking a member while editing cycled / selected the whole group: ' + JSON.stringify(info));
  if (!(info.moved1b > 140)) throw new Error('the new wall did not move on its own: ' + JSON.stringify(info));
  if (info.in1a !== 100 || info.w1in1a !== 0) throw new Error('layout 1a did not keep its own positions: ' + JSON.stringify(info));
  if (info.back1b !== info.moved1b) throw new Error('layout 1b lost the new wall position: ' + JSON.stringify(info));
  if (info.after) throw new Error('Esc did not leave group editing: ' + JSON.stringify(info));
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

check('slab tool draws a wall-less balcony, void tool cuts the slab in 3D (issues #22, #23)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject());
    addRectWalls(0, 0, 600, 400); commit(); view.z = 0.5; view.x = 100; view.y = 50; render();
    const r = cv.getBoundingClientRect();
    const at = (p, type, extra = {}) => { const s = w2s(p); cv.dispatchEvent(new PointerEvent(type, { clientX: r.left + s.x, clientY: r.top + s.y, bubbles: true, pointerId: 1, button: 0, ...extra })); };
    const out = {};
    // slab: drag a rectangle outside the walls
    setTool('slab');
    at({ x: 0, y: 400 }, 'pointerdown'); at({ x: 600, y: 550 }, 'pointermove'); at({ x: 600, y: 550 }, 'pointerup');
    out.slabs = F().slabs.length; out.slabSel = F().slabs[0] && sel[0] === F().slabs[0].id;
    // void: click corners, close on the first point
    setTool('void');
    for (const p of [{ x: 20, y: 20 }, { x: 200, y: 20 }, { x: 200, y: 160 }, { x: 20, y: 160 }, { x: 20, y: 20 }]) { at(p, 'pointerdown'); at(p, 'pointerup'); }
    out.voids = F().voids.length; out.voidPts = F().voids[0] ? F().voids[0].pts.length : 0;
    out.panel = document.querySelector('#props select[data-k="void"][data-p="type"]') ? 'void' : '';
    setTool('select'); sel = []; refresh();
    out.svgSlab = document.querySelectorAll('#gRooms [data-low="2"]').length;
    out.svgX = document.querySelectorAll('#gRooms g[clip-path] line').length;
    F().furn.push(mkFurn(BYID.sofa3, 300, 470)); F().slabs[0].off = -5; commit();
    document.getElementById('b3d').click();
    if (ui.view3d) {
      let plain = 0, holed = 0, balcony = null;
      T3.scene.traverse(o => {
        if (!o.isMesh || !o.geometry || o.geometry.type !== 'ExtrudeGeometry') return;
        const sh = o.geometry.parameters.shapes, s0 = Array.isArray(sh) ? sh[0] : sh;
        if (Math.abs(o.position.y + 4.8) < 0.01) balcony = o.geometry.parameters.options.depth;
        else if (s0 && s0.holes.length) holed++; else plain++;
      });
      const g = T3.scene.children.find(c => c.userData && c.userData.furnId === F().furn[0].id);
      Object.assign(out, { holed, balcony, sofaY: g && g.position.y });
      show3D(false);
    }
    sel = []; refresh();
    return out;
  })()`);
  if (info.slabs !== 1 || !info.slabSel) throw new Error('dragging with the slab tool did not create a selected slab: ' + JSON.stringify(info));
  if (info.voids !== 1 || info.voidPts !== 4) throw new Error('clicking corners with the void tool did not close a 4-corner void: ' + JSON.stringify(info));
  if (info.panel !== 'void') throw new Error('the void panel has no type selector');
  if (info.svgSlab !== 1 || info.svgX !== 2) throw new Error('2D slab / void X not drawn: ' + JSON.stringify(info));
  if (info.balcony !== undefined) {
    if (info.balcony !== 20) throw new Error('the balcony is not a 20 cm slab at its offset: ' + JSON.stringify(info));
    if (info.holed < 1) throw new Error('the void did not cut a hole in the floor slab');
    if (info.sofaY !== -5) throw new Error('furniture does not sit on the lowered balcony: ' + info.sofaY);
  }
  return info.balcony !== undefined ? 'slab + void drawn, 3D slab 20 cm, hole cut, sofa on balcony' : 'slab + void drawn (3D unavailable)';
});

check('3D: walls and windows are selectable, a window drags along its wall (issue #29)', async page => {
  const info = await page.evaluate(`(async () => {
    loadProject(newProject()); addRectWalls(0, 0, 600, 400);
    const f = F(); f.ops.push(mkOp(OPDEF.window, f.walls[0], 300)); commit(); sel = []; refresh();
    document.getElementById('b3d').click();
    if (!ui.view3d) return { skipped: true };
    set3DCam('fit'); await new Promise(r => setTimeout(r, 150));
    const cnv = T3.r.domElement, rect = cnv.getBoundingClientRect();
    const scr = obj => { const c = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3()).project(T3.cam); return { x: rect.left + (c.x + 1) / 2 * rect.width, y: rect.top + (1 - c.y) / 2 * rect.height }; };
    const opG = id => { let r = null; T3.scene.traverse(o => { if (o.userData && o.userData.opId === id) r = o; }); return r; };
    const ev = (el, t, p) => el.dispatchEvent(new PointerEvent(t, { clientX: p.x, clientY: p.y, bubbles: true, button: 0, pointerId: 1 }));
    const win = f.ops[0], out = { grouped: !!opG(win.id) };
    let p = scr(opG(win.id)); ev(cnv, 'pointerdown', p); ev(cnv, 'pointerup', p);
    out.winSel = sel.join() === win.id; out.hl = h3.length;
    const h0 = hi; p = scr(opG(win.id)); ev(cnv, 'pointerdown', p);
    for (let i = 1; i <= 5; i++) ev(window, 'pointermove', { x: p.x + i * 12, y: p.y });
    ev(window, 'pointerup', { x: p.x + 60, y: p.y });
    out.moved = win.d !== 300; out.committed = hi === h0 + 1;
    await new Promise(r => setTimeout(r, 150));
    const wg = T3.scene.children.find(c => c.userData && c.userData.wallId === f.walls[1].id && !c.isMesh);
    p = scr(wg); ev(cnv, 'pointerdown', p); ev(cnv, 'pointerup', p);
    out.wallSel = sel.join() === f.walls[1].id; out.panel = !!document.querySelector('#props [data-k="wall"][data-p="h"]');
    show3D(false); sel = []; refresh();
    return out;
  })()`);
  if (info.skipped) return '3D unavailable';
  if (!info.grouped) throw new Error('the window has no opId group in 3D');
  if (!info.winSel || !info.hl) throw new Error('clicking a window in 3D did not select + highlight it: ' + JSON.stringify(info));
  if (!info.moved || !info.committed) throw new Error('dragging a window in 3D did not move it along the wall (or did not commit): ' + JSON.stringify(info));
  if (!info.wallSel || !info.panel) throw new Error('clicking a plain wall in 3D did not select it: ' + JSON.stringify(info));
  return 'window select + highlight, wall-constrained drag committed, plain wall selected';
});

check('section tool, 2D section / elevation drawings and the 3D cutaway (issues #30, #31)', async page => {
  const info = await page.evaluate(`(async () => {
    const p = newProject(); p.floors.push(newFloor('1')); loadProject(p);
    fi = 0; addRectWalls(0, 0, 800, 500); F().ops.push(mkOp(OPDEF.window, F().walls[0], 200));
    fi = 1; addRectWalls(0, 0, 800, 500); fi = 0; commit(); view.z = 0.5; view.x = 100; view.y = 50; sel = []; refresh();
    const r = cv.getBoundingClientRect();
    const at = (q, type) => { const s = w2s(q); cv.dispatchEvent(new PointerEvent(type, { clientX: r.left + s.x, clientY: r.top + s.y, bubbles: true, pointerId: 1, button: 0 })); };
    setTool('section');
    for (const q of [{ x: -100, y: 250 }, { x: 900, y: 250 }]) { at(q, 'pointermove'); at(q, 'pointerdown'); at(q, 'pointerup'); }
    const sec = F().sections[0], out = { sec: !!sec, name: sec && sec.name, drawn2d: sec ? document.querySelectorAll('#gDims [data-id="' + sec.id + '"]').length : 0 };
    if (!sec) return out;
    document.querySelector('#props [data-act="secdraw"]').click();
    const svg = document.querySelector('#modal .archview svg');
    out.modal = ui.modal; out.sectionSvg = !!svg; out.cutRects = svg ? svg.querySelectorAll('rect').length : 0; out.levels = svg ? /±0\\.00/.test(svg.textContent) && /\\+2\\.90/.test(svg.textContent) : false;
    document.querySelector('#modal [data-arch="elev:north"]').click();
    out.elev = !!document.querySelector('#modal .archview svg') && ui.archDraw && /North|Kuzey/.test(ui.archDraw.title);
    closeModal(); sel = [sec.id]; refresh();
    document.querySelector('#props [data-act="sec3d"]').click(); await new Promise(r => setTimeout(r, 150));
    out.clip = ui.view3d ? T3.r.clippingPlanes.length : -1;
    if (ui.view3d) { set3DCam('south'); out.camSouth = T3.cam.position.z > T3.ctl.target.z; ui.secCut = null; applySecClip(); out.unclip = T3.r.clippingPlanes.length; show3D(false); }
    sel = []; refresh();
    return out;
  })()`);
  if (!info.sec || info.name !== 'A' || info.drawn2d !== 1) throw new Error('the section tool did not create section A on the plan: ' + JSON.stringify(info));
  if (info.modal !== 'arch' || !info.sectionSvg || info.cutRects < 6 || !info.levels) throw new Error('the 2D section drawing is missing parts: ' + JSON.stringify(info));
  if (!info.elev) throw new Error('the north elevation did not render');
  if (info.clip !== -1 && (info.clip !== 1 || info.unclip !== 0 || !info.camSouth)) throw new Error('3D cutaway / facade camera broken: ' + JSON.stringify(info));
  return info.clip === -1 ? 'section + drawings (3D unavailable)' : 'section A drawn, section + elevation sheets, 3D cutaway on/off, south facade camera';
});

check('drawing layers: active layer stamps, hide removes from 2D/3D/export, lock blocks selection (issue #32)', async page => {
  const info = await page.evaluate(`(async () => {
    loadProject(newProject()); addRectWalls(0, 0, 600, 400); commit(); sel = []; refresh();
    const out = { legacy: !JSON.stringify(P.floors).includes('"layer"') };
    document.querySelector('#props [data-act="lyradd"]').click();
    const L1 = P.layers[1] && P.layers[1].id; out.added = !!L1 && P.activeLayer === L1;
    F().furn.push(mkFurn(BYID.sofa3, 300, 200)); commit(); const sofa = F().furn[0];
    out.stamped = sofa.layer === L1 && F().walls.every(w => w.layer === '0');
    document.querySelector('#props [data-act="lyrvis"][data-lid="' + L1 + '"]').click();
    out.hidden2D = !document.querySelector('#gFurn [data-id="' + sofa.id + '"]');
    out.hiddenExport = !exportSvg().svg.includes('translate(300 200)');
    document.getElementById('b3d').click();
    if (ui.view3d) { out.hidden3D = !T3.scene.children.some(c => c.userData && c.userData.furnId === sofa.id); show3D(false); }
    document.querySelector('#props [data-act="lyrvis"][data-lid="' + L1 + '"]').click();
    document.querySelector('#props [data-act="lyrlock"][data-lid="' + L1 + '"]').click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }));
    out.lockSkipsCtrlA = sel.length === 4 && !sel.includes(sofa.id);
    sel = [sofa.id]; deleteSel(); out.lockSurvivesDelete = F().furn.length === 1;
    out.footer = document.getElementById('sLayer').options.length;
    sel = []; refresh();
    return out;
  })()`);
  for (const k of ['legacy', 'added', 'stamped', 'hidden2D', 'hiddenExport', 'lockSkipsCtrlA', 'lockSurvivesDelete']) if (!info[k]) throw new Error('layers: ' + k + ' failed: ' + JSON.stringify(info));
  if (info.hidden3D === false) throw new Error('a hidden layer still shows in 3D');
  if (info.footer !== 2) throw new Error('the footer layer selector is out of sync: ' + info.footer);
  return 'stamp, hide (2D/3D/export), lock (Ctrl+A, Delete), footer selector';
});

check('parametric stairs: 2D and 3D draw the same treads for every type (issue #33)', async page => {
  const info = await page.evaluate(`(async () => {
    loadProject(newProject());
    ['straight', 'l', 'u', 'spiral'].forEach((t, i) => { const s = mkFurn(BYID.stairs, 150 + i * 300, 200, 0); s.stairType = t; s.w = t === 'straight' ? 100 : t === 'spiral' ? 200 : 220; s.d = t === 'spiral' ? 200 : t === 'straight' ? 300 : 260; F().furn.push(s); });
    commit(); sel = []; refresh();
    const out = { types: F().furn.map(s => { const st = stairSteps(s), g = document.querySelector('#gFurn [data-id="' + s.id + '"]'); return { t: s.stairType, n: st.n, poly: g ? g.querySelectorAll('polygon').length : -1, top: Math.round(st.steps[st.steps.length - 1].z) }; }) };
    sel = [F().furn[0].id]; refresh();
    out.panel = !!document.querySelector('#props [data-p="stepN"]') && !!document.querySelector('#props [data-act="stairfit"]');
    document.getElementById('b3d').click();
    if (ui.view3d) { out.built = T3.scene.children.filter(c => c.userData && c.userData.furnId).length; show3D(false); }
    sel = []; refresh();
    return out;
  })()`);
  for (const t of info.types) if (t.poly !== t.n || t.top !== 270) throw new Error('stairs ' + t.t + ': 2D treads ' + t.poly + ' vs ' + t.n + ' risers, top ' + t.top);
  if (!info.panel) throw new Error('the stairs panel has no step count / storey-height controls');
  if (info.built !== undefined && info.built !== 4) throw new Error('not every stair type built in 3D: ' + info.built);
  return info.types.map(t => t.t + ' ' + t.n).join(', ') + (info.built ? ' · 3D built' : '');
});

check('ramp: slope badge, 2D arrow + label, 3D wedge with rails (issue #58)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject());
    const r = mkFurn(BYID.ramp, 300, 300, 0); r.d = 600; r.h = 40; F().furn.push(r); commit(); sel = [r.id]; refresh();
    const g = document.querySelector('#gFurn [data-id="' + r.id + '"]');
    const out = { pct: Math.round(rampSlope(r).pct * 10) / 10, cls: rampSlope(r).cls, label: g ? g.textContent.includes(pctTxt(6.7)) : false,
      badge: (document.querySelector('#props') || {}).textContent.includes('6.7'), type: !!document.querySelector('#props [data-p="rampType"]') };
    r.h = 70; commit(); refresh(); out.fit = !!document.querySelector('#props [data-act="rampfit"]');
    document.querySelector('#props [data-act="rampfit"]').click(); out.fitD = r.d;
    out.svg = exportSvg().svg.includes(pctTxt(8));
    document.getElementById('b3d').click();
    if (ui.view3d) {
      const grp = T3.scene.children.find(c => c.userData && c.userData.furnId === r.id), box = new THREE.Box3().setFromObject(grp);
      out.meshes = 0; grp.traverse(o => { if (o.isMesh) out.meshes++; });
      out.top = Math.round(box.max.y); show3D(false);
    }
    sel = []; refresh();
    return out;
  })()`);
  if (info.pct !== 6.7 || info.cls !== 'access') throw new Error('slope maths: ' + JSON.stringify(info));
  if (!info.label || !info.badge || !info.type) throw new Error('2D label / panel badge / type missing: ' + JSON.stringify(info));
  if (!info.fit || info.fitD !== 875) throw new Error('lengthen-to-8% did not work: ' + JSON.stringify(info));
  if (!info.svg) throw new Error('the slope label is not in the SVG export: ' + JSON.stringify(info));
  if (info.meshes !== undefined && (info.meshes < 8 || info.top < 150)) throw new Error('3D ramp wedge / rails missing: ' + JSON.stringify(info));
  return '6.7% accessible, lengthened to 875 cm' + (info.meshes ? ', 3D ' + info.meshes + ' meshes' : '');
});

check('height above floor: wall items hang, dashed + tagged in 2D, panel edit and undo, TV unit model (issue #61)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject());
    const f = F(); f.walls.push(mkWall({ x: 0, y: 0 }, { x: 400, y: 0 }));
    const tvw = mkFurn(BYID.tvw, 150, 10, 0), tv = mkFurn(BYID.tv, 150, 120, 0), sofa = mkFurn(BYID.sofa3, 150, 300, 0);
    f.furn.push(tvw, tv, sofa); magnet(tvw); commit(); sel = [tvw.id]; refresh();
    const g = document.querySelector('#gFurn [data-id="' + tvw.id + '"]');
    const out = { elev: tvw.elev, tvElev: tv.elev, sofaElev: sofa.elev, tag: g ? g.textContent.includes('▲ +80') : false, dashed: g ? !!g.querySelector('[stroke-dasharray]') : false };
    const inp = document.querySelector('#props [data-k="furn"][data-p="elev"]'); out.field = !!inp;
    if (inp) { inp.value = '900'; inp.dispatchEvent(new Event('change', { bubbles: true })); }
    out.clamped = F().furn.find(o => o.id === tvw.id).elev;
    undo(); out.undone = F().furn.find(o => o.id === tvw.id).elev;
    out.svg = exportSvg().svg.includes('▲ +80');
    document.getElementById('b3d').click();
    if (ui.view3d) {
      const bot = id => { const grp = T3.scene.children.find(c => c.userData && c.userData.furnId === id); return grp ? Math.round(new THREE.Box3().setFromObject(grp).min.y) : null; };
      out.tvwBottom = bot(tvw.id); out.sofaBottom = bot(sofa.id);
      const grp = T3.scene.children.find(c => c.userData && c.userData.furnId === tv.id), box = new THREE.Box3().setFromObject(grp);
      out.tvTop = Math.round(box.max.y); out.tvMeshes = 0; grp.traverse(o => { if (o.isMesh) out.tvMeshes++; });
      show3D(false);
    }
    sel = []; refresh();
    return out;
  })()`);
  if (info.elev !== 80 || info.tvElev !== undefined || info.sofaElev !== undefined) throw new Error('catalogue defaults: ' + JSON.stringify(info));
  if (!info.tag || !info.dashed || !info.svg) throw new Error('2D tag / dashed outline / export missing: ' + JSON.stringify(info));
  if (!info.field || info.clamped !== 500 || info.undone !== 80) throw new Error('panel field / clamp / undo: ' + JSON.stringify(info));
  if (info.tvwBottom !== undefined && (info.tvwBottom !== 80 || info.sofaBottom !== 0)) throw new Error('3D height above floor wrong: ' + JSON.stringify(info));
  if (info.tvTop !== undefined && (info.tvMeshes < 12 || info.tvTop < 120)) throw new Error('TV unit model (console + screen on a stand) missing: ' + JSON.stringify(info));
  return 'wall TV at 80 cm, clamp 500, undo' + (info.tvMeshes ? ', TV unit ' + info.tvMeshes + ' meshes' : '');
});

check('glass floor: 2D pattern, slab hole under it and transparent panel in 3D (issue #57)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject());
    addRectWalls(0, 0, 600, 400);
    P.floors.push(newFloor('1')); fi = 1; addRectWalls(0, 0, 600, 400);
    F().rooms.push({ id: uid(), name: 'Bridge', color: '#cbd5e1', floor: 'glass', pts: [{ x: 200, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 300 }, { x: 200, y: 300 }] });
    F().slabs.push({ id: uid(), name: 'Glass bridge', floor: 'glass', color: null, t: 20, off: 0, pts: [{ x: 450, y: 100 }, { x: 550, y: 100 }, { x: 550, y: 300 }, { x: 450, y: 300 }] });
    commit(); sel = [F().rooms[0].id]; refresh();
    const out = { pat: !!document.querySelector('#defs pattern#p-glass') || defsSvg().includes('id="p-glass"'), used: document.querySelector('#gRooms').innerHTML.includes('url(#p-glass)'),
      field: !!document.querySelector('#props [data-p="glass"]'), opt: !!document.querySelector('#props [data-p="floor"] option[value="glass"]') };
    v3dOnly('all');
    document.getElementById('b3d').click();
    if (ui.view3d) {
      const gl = []; T3.scene.traverse(o => { if (o.userData && o.userData.glassFloor) gl.push(o); });
      out.glass = gl.length; out.transparent = gl.length ? gl[0].material.transparent && gl[0].material.opacity < 0.5 : false;
      // the floor-1 slab under the glass room must have a hole
      const slabs = []; T3.scene.traverse(o => { if (o.isMesh && o.geometry && o.geometry.type === 'ExtrudeGeometry' && Math.abs(o.position.y - 290) < 1 && !o.userData.glassFloor) slabs.push(o); });
      out.holes = slabs.reduce((n, m) => n + ((m.geometry.parameters.shapes.holes || []).length || 0), 0);
      show3D(false);
    }
    fi = 0; sel = []; refresh();
    return out;
  })()`);
  if (!info.pat || !info.used) throw new Error('2D glass pattern missing: ' + JSON.stringify(info));
  if (!info.field || !info.opt) throw new Error('room panel lacks the glass options: ' + JSON.stringify(info));
  if (info.glass !== undefined && (info.glass !== 2 || !info.transparent || info.holes < 2)) throw new Error('3D glass floor wrong: ' + JSON.stringify(info));
  return 'pattern + panel' + (info.glass ? ', 3D glass panel over a slab hole' : '');
});

check('room slab thickness and room layouts: finish per layout, click body in 2D / floor in 3D cycles (issues #63, #66)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject()); setTool('select');
    const r = { id: uid(), name: 'Terrace', color: '#bfdbfe', floor: 'tile', pts: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] };
    F().rooms.push(r); commit(); sel = [r.id]; refresh();
    const out = { field: !!document.querySelector('#props [data-p="slabT"]') };
    varAction('varInit'); varAction('varNew');
    r.floor = 'wood'; r.color = '#fde68a'; r.pts[1].x = 500; r.pts[2].x = 500; commit();
    switchRoomVarTo(r, 0);
    out.a = { floor: r.floor, color: r.color, x: r.pts[1].x };
    sel = []; view.z = 1; view.x = 50; view.y = 50; render();
    // click the room body away from the label / badge (near a corner)
    const rc = cv.getBoundingClientRect(), s = w2s({ x: 40, y: 40 });
    const ev = type => cv.dispatchEvent(new PointerEvent(type, { clientX: rc.left + s.x, clientY: rc.top + s.y, bubbles: true, pointerId: 1, button: 0 }));
    ev('pointerdown'); ev('pointerup');
    out.b = { floor: r.floor, color: r.color, x: r.pts[1].x, idx: r.vIdx };
    r.slabT = 30; commit();
    document.getElementById('b3d').click();
    if (ui.view3d) {
      const ms = []; T3.scene.traverse(o => { if (o.isMesh && o.userData.roomId === r.id) ms.push(o); });
      out.meshes = ms.length; out.depth = (ms.find(m => m.geometry.type === 'ExtrudeGeometry') || { geometry: { parameters: { options: {} } } }).geometry.parameters.options.depth;
      // click the floor in 3D: project a point inside the room to the screen
      T3.ctl.target.set(250, 0, 150); T3.cam.position.set(250, 900, 400); T3.ctl.update(); T3.cam.updateMatrixWorld();
      const p = new THREE.Vector3(60, 0.6, 60).project(T3.cam), cr = T3.r.domElement.getBoundingClientRect();
      const cx = cr.left + (p.x + 1) / 2 * cr.width, cy = cr.top + (1 - p.y) / 2 * cr.height;
      const before = r.vIdx ?? 0;
      T3.r.domElement.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true, pointerId: 1, button: 0 }));
      T3.r.domElement.dispatchEvent(new PointerEvent('pointerup', { clientX: cx, clientY: cy, bubbles: true, pointerId: 1, button: 0 }));
      out.cycled3d = (r.vIdx ?? 0) !== before;
      show3D(false);
    }
    sel = []; refresh();
    return out;
  })()`);
  if (!info.field) throw new Error('room panel has no slab thickness field: ' + JSON.stringify(info));
  if (info.a.floor !== 'tile' || info.a.color !== '#bfdbfe' || info.a.x !== 400) throw new Error('layout 1a did not restore finish / colour / shape: ' + JSON.stringify(info));
  if (info.b.idx !== 1 || info.b.floor !== 'wood' || info.b.x !== 500) throw new Error('clicking the room body did not switch to 1b: ' + JSON.stringify(info));
  if (info.meshes !== undefined && (info.meshes < 2 || info.depth !== 30)) throw new Error('3D room slab block missing: ' + JSON.stringify(info));
  if (info.cycled3d === false) throw new Error('clicking the room floor in 3D did not cycle its layout: ' + JSON.stringify(info));
  return 'finish per layout, 2D body click' + (info.meshes ? ', 30 cm slab, 3D click cycles' : '');
});

check('per-floor wall heights: apply to all walls, floors stack on their own height (issue #59)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject());
    addRectWalls(0, 0, 400, 300); commit();
    const w = F().walls[0]; F().ops.push(mkOp(OPDEF.window, w, 200)); commit();
    const w2 = F().walls[1]; w2.h = 180; sel = [w2.id]; commit(); refresh();
    document.querySelector('#props [data-act="wallhfloor"]').click();
    const op = F().ops[0], fitted = op.sill + op.h <= 175;
    undo(); undo();
    const w1 = F().walls[0]; w1.h = 350; sel = [w1.id]; commit(); refresh();
    document.querySelector('#props [data-act="wallhfloor"]').click();
    const out = { fitted, all: F().walls.every(x => x.h === 350), floorH: F().wallH };
    undo(); out.undone = F().walls.filter(x => x.h === 350).length;
    redo();
    P.floors.push(newFloor('1')); fi = 1; addRectWalls(0, 0, 400, 300); commit();
    out.newWall = F().walls[0].h; out.e1 = floorElev(1); fi = 0;
    sel = []; refresh();
    document.querySelector('#props [data-act="wallhall"]').click();
    out.reset = P.floors.every(f => !f.wallH && f.walls.every(x => x.h === P.wallH));
    return out;
  })()`);
  if (!info.fitted) throw new Error('a window stuck out above the lowered walls: ' + JSON.stringify(info));
  if (!info.all || info.floorH !== 350) throw new Error('apply to floor failed: ' + JSON.stringify(info));
  if (info.undone !== 1) throw new Error('undo did not restore the other walls: ' + JSON.stringify(info));
  if (info.newWall !== 270 || info.e1 !== 370) throw new Error('floor stacking / new wall height wrong: ' + JSON.stringify(info));
  if (!info.reset) throw new Error('apply-to-all-existing did not reset heights: ' + JSON.stringify(info));
  return 'floor 350 → upper floor at 370, undo ok, project reset ok';
});

check('IFC import: a Revit-style model opens in a new tab and draws in 2D and 3D', async page => {
  const info = await page.evaluate(`(async () => {
    loadProject(newProject()); addRectWalls(0, 0, 300, 300); commit();
    const tabsBefore = tabs.length;
    const text = await (await fetch('tests/fixtures/two-storey.ifc')).text();
    const stats = importIfcText(text, 'two-storey.ifc');
    const out = { stats, tabs: tabs.length - tabsBefore, name: P.name, floors: P.floors.length,
      walls2d: document.querySelectorAll('#gWalls [data-id]').length, ops2d: document.querySelectorAll('#gOps [data-id]').length,
      rooms2d: document.querySelectorAll('#gRooms [data-id]').length, undo: hist.length };
    let bad = ''; try { ifcToProject('hello'); } catch (e) { bad = e.message; } out.bad = bad;
    show3D(true); await new Promise(r => setTimeout(r, 600));
    out.view3d = !!ui.view3d; out.meshes = 0;
    if (T3 && T3.scene) T3.scene.traverse(o => { if (o.isMesh) out.meshes++; });
    show3D(false);
    return out;
  })()`);
  const s = info.stats || {};
  if (s.floors !== 2 || s.walls !== 5 || s.ops !== 2 || s.rooms !== 1) throw new Error('IFC import counts wrong: ' + JSON.stringify(info));
  if (info.tabs !== 1) throw new Error('IFC import did not open in a new tab: ' + JSON.stringify(info));
  if (info.walls2d < 4 || info.ops2d < 2 || info.rooms2d < 1) throw new Error('imported plan not drawn in 2D: ' + JSON.stringify(info));
  if (!/not an IFC/.test(info.bad)) throw new Error('non-IFC text was not rejected: ' + info.bad);
  if (info.view3d && info.meshes < 10) throw new Error('imported plan has no 3D model: ' + JSON.stringify(info));
  return `${s.floors} floors, ${s.walls} walls, ${s.ops} openings, ${s.rooms} room; new tab; 3D ${info.view3d ? info.meshes + ' meshes' : 'skipped'}`;
});

check('multi-part furniture: the billiards table is one item, drawn from its parts in 2D and 3D', async page => {
  const info = await page.evaluate(`(() => {
    const old = { id: 'oldbox1', type: 'custom', name: 'Old box', icon: '▭', k: 'rect', w: 80, d: 40, h: 70, color: '#888888', x: 600, y: 200, rot: 0, label: '' };
    const p = newProject(); p.floors[0].furn.push(JSON.parse(JSON.stringify(old)));
    loadProject(p);
    const oldSame = JSON.stringify(F().furn[0]) === JSON.stringify(old);
    const t = mkFurn(BYID.billiard, 250, 200, 0); F().furn.push(t); commit(); sel = []; refresh();
    const g = document.querySelector('#gFurn [data-id="' + t.id + '"]');
    const out = { oldSame, parts: t.parts.length, shapes2d: g ? g.querySelectorAll('rect,ellipse,polygon').length : -1, valid: validateParts(t).ok };
    const svg = exportSvg().svg; out.exportHasFelt = svg.includes('#1f7a4a');
    document.getElementById('b3d').click();
    if (ui.view3d) {
      const grp = T3.scene.children.find(c => c.userData && c.userData.furnId === t.id);
      const meshes = []; grp.traverse(o => { if (o.isMesh) meshes.push(o); });
      grp.updateMatrixWorld(true);
      const top = m => new THREE.Box3().setFromObject(m).max.y, bot = m => new THREE.Box3().setFromObject(m).min.y;
      const felt = meshes[t.parts.findIndex(q => q.name === 'felt bed')], ball = meshes[t.parts.findIndex(q => q.name === 'cue ball')], leg = meshes[t.parts.findIndex(q => q.name === 'leg')];
      out.meshes = meshes.length; out.feltTop = Math.round(top(felt)); out.ballBottom = Math.round(bot(ball)); out.legBottom = Math.round(bot(leg));
      out.height = Math.round(new THREE.Box3().setFromObject(grp).max.y);
      const cueSize = () => { const g2 = T3.scene.children.find(c => c.userData && c.userData.furnId === t.id), ms = []; g2.updateMatrixWorld(true); g2.traverse(o => { if (o.isMesh) ms.push(o); }); return new THREE.Box3().setFromObject(ms[t.parts.findIndex(q => q.name === 'cue')]).getSize(new THREE.Vector3()); };
      const c0 = cueSize(); out.cueLying = c0.x > 100 && c0.y < 5 && c0.z < 15; // axis 'x' cylinder lies along the table
      show3D(false);
      // swap W/D turns the parts 90°: the cue now runs along the plan y (Three z) and everything stays inside the box
      sel = [t.id]; refresh(); document.querySelector('#props [data-act="swapwd"]').click();
      const t2 = F().furn.find(o => o.id === t.id); out.swapValid = validateParts(t2).ok && t2.w === 155 && t2.d === 280;
      document.getElementById('b3d').click(); const c1 = cueSize(); out.cueSwapped = c1.z > 100 && c1.x < 15 && c1.y < 5; show3D(false);
      undo();
    }
    // mirror keeps the parts inside the item box
    sel = [t.id]; flipSel('h'); out.mirrorValid = validateParts(F().furn.find(o => o.id === t.id)).ok;
    return out;
  })()`);
  if (!info.oldSame) throw new Error('an old furniture item without parts changed on load');
  if (info.parts < 25 || !info.valid) throw new Error('billiards table has ' + info.parts + ' parts, valid=' + info.valid);
  if (info.shapes2d < info.parts) throw new Error('2D footprint draws ' + info.shapes2d + ' shapes for ' + info.parts + ' parts');
  if (!info.exportHasFelt) throw new Error('the SVG export lost the felt');
  if (!info.mirrorValid) throw new Error('mirroring pushed parts out of the item box');
  if (info.meshes !== undefined) {
    if (info.meshes !== info.parts) throw new Error('3D built ' + info.meshes + ' meshes for ' + info.parts + ' parts');
    if (info.feltTop !== 79 || info.ballBottom !== 79 || info.legBottom !== 0 || info.height !== 85) throw new Error('3D heights wrong: ' + JSON.stringify(info));
    if (!info.cueLying || !info.cueSwapped || !info.swapValid) throw new Error('lying cue / swap W/D wrong: ' + JSON.stringify(info));
  }
  return info.parts + ' parts, ' + info.shapes2d + ' 2D shapes' + (info.meshes ? ', felt at ' + info.feltTop + ' cm in 3D' : '');
});

check('furniture studio: drop, drag, resize, keys, undo, templates, place in plan (2D + 3D)', async page => {
  const info = await page.evaluate(`(async () => {
    loadProject(newProject());
    const out = {}, D = () => ui.pb.d, last = () => D().parts[D().parts.length - 1];
    const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    // world (view cm) -> screen point of an SVG view
    const scr = (view, u, v) => { const svg = document.getElementById('fsv-' + view), m = svg.getScreenCTM(), p = svg.createSVGPoint(); p.x = u; p.y = v; const r = p.matrixTransform(m); return [r.x, r.y]; };
    const ptr = (type, el, x, y) => el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0, pointerId: 7 }));
    const drag = (view, el, u0, v0, u1, v1) => { const [x0, y0] = scr(view, u0, v0), [x1, y1] = scr(view, u1, v1); ptr('pointerdown', el, x0, y0); for (let k = 1; k <= 4; k++) ptr('pointermove', window, x0 + (x1 - x0) * k / 4, y0 + (y1 - y0) * k / 4); ptr('pointerup', window, x1, y1); };
    const key = (k, o) => window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true }, o || {})));

    // open from My Library: Create furniture
    ui.cat = LIBCATS.length - 1; buildLib(); document.querySelector('#items [data-fsnew]').click(); await frame();
    out.open = ui.modal === 'parts' && !!document.getElementById('fstudio') && D().parts.length === 0;
    out.has3d = !!document.querySelector('#fs3d canvas');
    // click a block: the Top lands at the top of the box
    document.querySelector('#fstudio [data-blk="top"]').click();
    out.topZ = last().z; out.boxH = D().h;
    // drag-and-drop a leg onto the top view at (35, -20)
    const dt = new DataTransfer(); dt.setData('text/plain', 'fsblk:leg');
    const [dx, dy] = scr('top', 35, -20), box = document.getElementById('fsv-top').parentElement;
    box.dispatchEvent(new DragEvent('dragover', { clientX: dx, clientY: dy, dataTransfer: dt, bubbles: true }));
    box.dispatchEvent(new DragEvent('drop', { clientX: dx, clientY: dy, dataTransfer: dt, bubbles: true }));
    const leg = last(); out.drop = [leg.x, leg.y, leg.z];
    await frame();
    // drag the leg 10 cm right in the front view (it is selected; grab its middle)
    const legEl = document.querySelector('#fsv-front [data-pi="1"] rect');
    drag('front', legEl, leg.x, -leg.h / 2, leg.x + 10, -leg.h / 2);
    out.moved = D().parts[1].x; out.hist = ui.pb.hist.length;
    // resize the top: select it, pull its +w handle 20 cm out
    ui.pb.sel = 0; pbRedraw(); await frame();
    const p0 = D().parts[0], hd = document.querySelector('#fsv-top [data-h="w+"]');
    drag('top', hd, p0.x + p0.w / 2, p0.y, p0.x + p0.w / 2 + 20, p0.y);
    out.resized = [D().parts[0].w, D().parts[0].x];
    out.issue = !!document.querySelector('#pbMsg .pb-msg.err'); // the top now sticks out of the box
    document.querySelector('#fstudio [data-pbact="fit"]').click(); out.fitW = D().w; out.fixed = !document.querySelector('#pbMsg .pb-msg.err');
    // keys: arrow nudges, Delete removes, Ctrl+Z / Ctrl+Y walk the studio history (never the plan)
    ui.pb.sel = 1; pbRedraw(); const x1 = D().parts[1].x; key('ArrowRight'); out.nudge = D().parts[1].x - x1;
    const n = D().parts.length; key('Delete'); out.deleted = D().parts.length === n - 1;
    key('z', { ctrlKey: true }); out.undone = D().parts.length === n; key('y', { ctrlKey: true }); out.redone = D().parts.length === n - 1; key('z', { ctrlKey: true });
    // mirror copy of the leg lands on the other side
    ui.pb.sel = 1; pbRedraw(); document.querySelector('#fstudio [data-pbact="mirror"]').click(); out.mirror = [D().parts[1].x, D().parts[2].x];
    out.planUntouched = F().furn.length === 0 && hist.length === 1;
    out.meshes = ui.pb.f3 && ui.pb.f3.root ? ui.pb.f3.root.children.length : null; out.parts = D().parts.length;
    // 3D: grab the top board (part 0) in the 3D view and drag it sideways
    if (ui.pb.f3) {
      const F3 = ui.pb.f3, cv3 = F3.r.domElement, rc = cv3.getBoundingClientRect(), q = D().parts[0], v = new THREE.Vector3(q.x, q.z + q.h / 2, q.y).project(F3.cam);
      const sx = rc.left + (v.x + 1) / 2 * rc.width, sy = rc.top + (1 - v.y) / 2 * rc.height, x0 = q.x;
      ui.pb.sel = 1; pbRedraw();
      ptr('pointerdown', cv3, sx, sy); for (let k = 1; k <= 4; k++) ptr('pointermove', window, sx + k * 10, sy); ptr('pointerup', window, sx + 40, sy);
      out.pick3d = ui.pb.sel === 0; out.drag3d = D().parts[0].x !== x0;
      key('z', { ctrlKey: true }); out.undo3d = D().parts[0].x === x0;
    }
    // grouping: Ctrl+click two legs in the list, Group, drag the group, keep the gid through Apply
    ui.pb.sel = 1; ui.pb.multi = []; ui.pb.gsel = null; pbRedraw(); await frame();
    document.querySelector('#pbList [data-pbsel="1"]').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    document.querySelector('#pbList [data-pbsel="2"]').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    out.multiSel = ui.pb.multi.slice();
    document.querySelector('#fstudio [data-pbact="group"]').click(); await frame();
    const gid = ui.pb.gsel, gLegs = D().parts.map(p => p.gid || '');
    out.grouped = !!gid && gLegs[1] === gid && gLegs[2] === gid && !gLegs[0];
    out.grpList = !!document.querySelector('#pbList [data-pbgrp]');
    out.hasGrot = !!document.querySelector('#fsv-top [data-h="grot"]');
    const gx1 = D().parts[1].x, gx2 = D().parts[2].x;
    drag('top', document.querySelector('#fsv-top [data-pi="1"] rect'), D().parts[1].x, D().parts[1].y, D().parts[1].x + 10, D().parts[1].y);
    out.groupDrag = D().parts[1].x !== gx1 && Math.abs((D().parts[1].x - gx1) - (D().parts[2].x - gx2)) < 0.01;
    // place in plan: one item, one undo step, also saved to My Library
    const nm = document.getElementById('fsName'); nm.value = 'Test table'; nm.dispatchEvent(new Event('input', { bubbles: true }));
    const h0 = hist.length; document.querySelector('#fstudio [data-fs="apply"]').click();
    const o = F().furn[0];
    out.placed = !!o && o.parts.length === out.parts && o.name === 'Test table' && hist.length === h0 + 1 && !document.getElementById('fstudio') && ui.modal !== 'parts';
    out.placedGroup = !!o && o.parts.filter(p => p.gid === gid).length === 2;
    out.lib = (P.lib.presets || []).some(p => p.name === 'Test table' && p.extra && p.extra.parts.length === out.parts);
    // reopen from the panel, switch to a template, Esc (confirm accepted) closes without touching the item
    sel = [o.id]; refresh(); document.querySelector('#props [data-act="parts"]').click(); await frame();
    const conf = window.confirm; window.confirm = () => true;
    const tplSel = document.getElementById('fsTpl'); tplSel.value = 'chair'; tplSel.dispatchEvent(new Event('change', { bubbles: true }));
    out.tpl = D().parts.length; out.tplName = D().parts.some(p => p.name === 'seat' || p.name === 'backrest');
    key('Escape'); window.confirm = conf; out.escClosed = ui.modal !== 'parts' && !document.getElementById('fstudio');
    out.itemKept = F().furn[0].parts.length === out.parts;
    sel = []; refresh();
    return out;
  })()`);
  const bad = m => { throw new Error(m + ': ' + JSON.stringify(info)); };
  if (!info.open) bad('studio did not open from My Library');
  if (info.topZ !== info.boxH - 3) bad('the Top block did not land at the top of the box');
  if (info.drop[0] !== 35 || info.drop[1] !== -20 || info.drop[2] !== 0) bad('drag-and-drop did not place the leg where it was dropped, on the floor');
  if (!(info.moved >= 44 && info.moved <= 47.5) || info.hist < 4) bad('dragging the leg in the front view did not move it ~10 cm (47.5 = snapped flush to the box edge)');
  if (!(info.resized[0] >= 118 && info.resized[0] <= 122) || !(info.resized[1] >= 9 && info.resized[1] <= 11)) bad('the w+ handle did not grow the top by ~20 cm on one side');
  if (!info.issue || !info.fixed || info.fitW < 120) bad('sticking-out top was not flagged / Fit box did not fix it');
  if (info.nudge !== 1 || !info.deleted || !info.undone || !info.redone) bad('keyboard nudge / delete / studio undo-redo failed');
  if (info.mirror[0] !== -info.mirror[1]) bad('Mirror copy did not land on the other side');
  if (!info.planUntouched) bad('studio edits leaked into the plan before Apply');
  if (info.meshes !== null && info.meshes !== info.parts) bad('3D view shows the wrong number of meshes');
  if (info.has3d && (!info.pick3d || !info.drag3d || !info.undo3d)) bad('3D click-to-select / drag / undo failed');
  if (!info.placed || !info.lib) bad('Place in plan did not add one item + library preset in one undo step');
  if (JSON.stringify(info.multiSel) !== '[1,2]' || !info.grouped || !info.grpList || !info.hasGrot || !info.groupDrag) bad('grouping (Ctrl+click, Group, group drag, grot handle) failed');
  if (!info.placedGroup) bad('the group id did not survive Place in plan');
  if (info.tpl < 4 || !info.tplName || !info.escClosed || !info.itemKept) bad('template / Esc flow failed');
  return 'drop, drag, resize, fit, keys, undo/redo, mirror, group, place + library, template, Esc' + (info.has3d ? ', 3D ' + info.meshes + ' meshes' : ' (no WebGL)');
});

check('render studio: every style renders and restores the scene (issue #34)', async page => {
  const info = await page.evaluate(`(async () => {
    loadProject(newProject()); addRectWalls(0, 0, 600, 400); F().ops.push(mkOp(OPDEF.window, F().walls[0], 300)); commit(); sel = []; refresh();
    document.getElementById('b3d').click();
    if (!ui.view3d) return { skipped: true };
    document.getElementById('b3dStudio').click();
    const out = { modal: ui.modal, styles: document.querySelectorAll('#modal [data-rs-style]').length, sizes: {} };
    closeModal();
    const dl = shadowLights(T3.scene)[0], pos0 = dl.position.clone();
    for (const st of ['realistic', 'technical', 'sketch', 'clay']) {
      const url = await render3DHQ({ style: st, sun: { az: 255, alt: 12 }, longSide: 480, supersample: 1, frames: 1, format: st === 'clay' ? 'jpeg' : 'png' });
      out.sizes[st] = url ? url.slice(0, 15) + ':' + url.length : '';
    }
    out.lightBack = dl.position.distanceTo(pos0) < 0.01 && dl.color.getHex() !== 0xffc58a;
    let left = 0; T3.scene.traverse(o => { if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0xefe9df) left++; });
    out.matsBack = left === 0;
    show3D(false);
    return out;
  })()`);
  if (info.skipped) return '3D unavailable';
  if (info.modal !== 'studio' || info.styles < 5) throw new Error('the render studio did not open with all 5 styles: ' + JSON.stringify(info));
  for (const [k, v] of Object.entries(info.sizes)) if (!v || +v.split(':')[1] < 1000) throw new Error('style ' + k + ' rendered nothing: ' + v);
  if (!/^data:image\/jpeg/.test(info.sizes.clay)) throw new Error('JPEG format ignored: ' + info.sizes.clay);
  if (!info.lightBack || !info.matsBack) throw new Error('the studio left the scene modified: ' + JSON.stringify(info));
  return '4 styles rendered, JPEG honoured, light + materials restored';
});

check('sky backdrop and toon style render and leave the 3D scene untouched (issue #45)', async page => {
  const info = await page.evaluate(`(async () => {
    loadProject(newProject()); addRectWalls(0, 0, 600, 400); F().ops.push(mkOp(OPDEF.window, F().walls[0], 300)); F().furn.push(mkFurn(BYID.sofa3, 300, 200)); commit(); sel = []; refresh();
    document.getElementById('b3d').click();
    if (!ui.view3d) return { skipped: true };
    const S = T3.scene, snap = () => { const m = []; S.traverse(o => { if (o.material) m.push(o.uuid + ':' + (Array.isArray(o.material) ? o.material.map(x => x.uuid).join('|') : o.material.uuid)); }); return { bg: S.background && S.background.getHex(), fog: S.fog, n: S.children.length, mats: m.join(',') }; };
    const tg = T3.ctl.target.clone(); T3.cam.position.set(tg.x - 900, 170, tg.z + 1400); T3.ctl.target.set(tg.x, 250, tg.z); T3.ctl.update(); // eye level: sky at the top
    const before = snap(), out = { sizes: {} };
    for (const [k, o] of Object.entries({ noonSky: { style: 'realistic', sun: { az: 180, alt: 68 } }, goldenSky: { style: 'realistic', sun: { az: 255, alt: 12 } }, toon: { style: 'toon', sun: { az: 215, alt: 42 } }, toonSky: { style: 'toon', backdrop: 'sky' } })) {
      const url = await render3DHQ({ ...o, longSide: 400, supersample: 1, frames: 1, format: 'png' });
      out.sizes[k] = url ? url.length : 0;
      if (k === 'noonSky' || k === 'goldenSky') {   // top-centre pixel = sky colour
        const im = new Image(); await new Promise(r => { im.onload = r; im.src = url; });
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        out[k] = Array.from(g.getImageData(im.width >> 1, 2, 1, 1).data.slice(0, 3));
      }
    }
    const after = snap();
    out.restored = before.bg === after.bg && before.fog === after.fog && before.n === after.n && before.mats === after.mats;
    show3D(false);
    return out;
  })()`);
  if (info.skipped) return '3D unavailable';
  for (const [k, v] of Object.entries(info.sizes)) if (v < 1000) throw new Error(k + ' rendered nothing');
  const [nr, , nb] = info.noonSky, [gr, , gb] = info.goldenSky;
  if (!(nb > nr + 30)) throw new Error('the noon sky is not blue: ' + info.noonSky);
  if (!(gr - gb > nr - nb + 20)) throw new Error('the golden-hour sky is not warmer than noon: ' + info.goldenSky + ' vs ' + info.noonSky);
  if (!info.restored) throw new Error('a sky / toon render left the 3D scene modified (background, fog, objects or materials)');
  return 'noon sky ' + info.noonSky + ', golden ' + info.goldenSky + ', toon rendered, scene restored';
});

check('print opens the plot dialog: paper, true scale, overflow warning, window area (issue #35)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject()); addRectWalls(0, 0, 1200, 800); commit(); view.z = 0.4; view.x = 80; view.y = 60; sel = []; refresh();
    Object.assign(ui.plot, { paper: 'a4', orient: 'landscape', scale: '100', area: 'all', center: true, margin: 10, win: null });
    document.getElementById('bPrint').click();
    const out = { modal: ui.modal, preview: !!document.querySelector('#modal svg') };
    const sh = plotSheetSvg(); out.k = sh.t.k; out.mm = /width="297mm" height="210mm"/.test(sh.svg); out.fits = !sh.t.overflow;
    const s = document.querySelector('#modal [data-plot="scale"]'); s.value = '50'; s.dispatchEvent(new Event('change', { bubbles: true }));
    out.warn = /does not fit|sığmıyor/.test(document.getElementById('modal').textContent);
    document.querySelector('#modal [data-plot-act="win"]').click(); out.tool = tool;
    const r = cv.getBoundingClientRect(), at = (q, t) => { const p = w2s(q); cv.dispatchEvent(new PointerEvent(t, { clientX: r.left + p.x, clientY: r.top + p.y, bubbles: true, pointerId: 1, button: 0 })); };
    at({ x: 0, y: 0 }, 'pointerdown'); at({ x: 600, y: 400 }, 'pointermove'); at({ x: 600, y: 400 }, 'pointerup');
    out.win = ui.plot.area === 'window' && ui.plot.win && ui.plot.win.x1 === 600; out.back = ui.modal;
    closeModal(); Object.assign(ui.plot, { scale: '100', area: 'all', win: null });
    return out;
  })()`);
  if (info.modal !== 'plot' || !info.preview) throw new Error('#bPrint did not open the plot dialog: ' + JSON.stringify(info));
  if (info.k !== 0.1 || !info.mm || !info.fits) throw new Error('1:100 on A4 is not 0.1 mm/cm on a 297×210 mm sheet: ' + JSON.stringify(info));
  if (!info.warn) throw new Error('no overflow warning at 1:50 on A4');
  if (info.tool !== 'plotwin' || !info.win || info.back !== 'plot') throw new Error('window picking broken: ' + JSON.stringify(info));
  return 'dialog, 1:100 = 0.1 mm/cm on A4, overflow warning, window picked';
});

check('numeric wall length: typed on a selected wall, inline label, typed during an end drag (issue #36)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject()); addRectWalls(0, 0, 600, 400); const f = F(); f.ops.push(mkOp(OPDEF.window, f.walls[0], 450)); commit();
    view.z = 0.6; view.x = 120; view.y = 120; sel = []; refresh();
    const key = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), out = {};
    sel = [f.walls[0].id]; refresh(); ['8', '0', '0', 'Enter'].forEach(key);
    out.typed = wLen(F().walls[0]) === 800 && F().walls[1].a.x === 800 && F().ops[0].d === 450;
    undo(); sel = []; refresh();
    const lw = F().walls[3], lbl = document.querySelector('[data-wdim="' + lw.id + '"]');
    if (lbl) { const r = lbl.getBoundingClientRect(); lbl.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, button: 0, pointerId: 1 })); }
    const inp = document.getElementById('wdimInput'); out.inline = !!inp;
    if (inp) { inp.value = '350'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
    out.inlineLen = Math.round(wLen(F().walls[3])); out.joined = F().walls[0].a.y === F().walls[3].b.y;
    undo(); const rw = F().walls[1]; sel = [rw.id]; refresh();
    const hb = document.querySelector('[data-h="wb"]'), hr = hb.getBoundingClientRect(), p = { x: hr.left + hr.width / 2, y: hr.top + hr.height / 2 };
    hb.dispatchEvent(new PointerEvent('pointerdown', { clientX: p.x, clientY: p.y, bubbles: true, button: 0, pointerId: 1 }));
    cv.dispatchEvent(new PointerEvent('pointermove', { clientX: p.x, clientY: p.y + 40, bubbles: true, pointerId: 1 }));
    ['2', '5', '0'].forEach(key);
    cv.dispatchEvent(new PointerEvent('pointerup', { clientX: p.x, clientY: p.y + 40, bubbles: true, button: 0, pointerId: 1 }));
    out.drag = Math.round(wLen(F().walls[1]));
    out.export = !exportSvg().svg.includes('data-wdim');
    sel = []; refresh();
    return out;
  })()`);
  if (!info.typed) throw new Error('typing 800 + Enter on a selected wall did not resize it with its corner / window: ' + JSON.stringify(info));
  if (!info.inline || info.inlineLen !== 350 || !info.joined) throw new Error('the clickable length label did not edit the wall: ' + JSON.stringify(info));
  if (info.drag !== 250) throw new Error('typing during an end drag did not lock the length: ' + info.drag);
  if (!info.export) throw new Error('exports carry the interactive length labels');
  return 'typed 800, inline 350 (corner joined), drag-typed 250, export clean';
});

check('outdoor finishes, custom textures and door materials (issues #39, #40, #41)', async page => {
  const info = await page.evaluate(`(async () => {
    loadProject(newProject()); addRectWalls(0, 0, 600, 400); const f = F();
    ['grass', 'water', 'gravel', 'deck', 'asphalt'].forEach((k, i) => f.rooms.push({ id: uid(), name: k, color: '#cbd5e1', floor: k, pts: [{ x: i * 120, y: 0 }, { x: i * 120 + 120, y: 0 }, { x: i * 120 + 120, y: 200 }, { x: i * 120, y: 200 }] }));
    f.slabs.push({ id: uid(), name: 'pond', floor: 'water', color: null, t: 20, off: 0, pts: [{ x: 700, y: 0 }, { x: 900, y: 0 }, { x: 900, y: 200 }, { x: 700, y: 200 }] });
    ['wood', 'glass', 'paneled', 'metal'].forEach((m, i) => { const o = mkOp(OPDEF.door, f.walls[2], 100 + i * 130); o.mat = m; f.ops.push(o); });
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#b91c1c'; g.fillRect(0, 0, 16, 16);
    const tid = addTexture('Check', 40, 40, c.toDataURL());
    f.rooms.push({ id: uid(), name: 'tex', color: '#cbd5e1', floor: 'tex:' + tid, pts: [{ x: 0, y: 220 }, { x: 300, y: 220 }, { x: 300, y: 400 }, { x: 0, y: 400 }] });
    commit(); await new Promise(r => setTimeout(r, 300)); refresh();
    const out = { fills: [...document.querySelectorAll('#gRooms polygon')].map(p => p.getAttribute('fill')).filter(x => x && x.startsWith('url')).length };
    out.histClean = !hist[hi].includes('data:image');
    out.bundle = JSON.stringify(bundleTextures(P)).includes('"texData"');
    out.idb = !!(await dbGet('textures', tid));
    out.export = exportSvg().svg.includes('data:image/png');
    return out;
  })()`);
  if (info.fills !== 7) throw new Error('finish patterns missing in 2D (want 5 outdoor + pond + texture): ' + JSON.stringify(info));
  if (!info.histClean) throw new Error('texture image data leaked into the undo history');
  if (!info.bundle || !info.idb || !info.export) throw new Error('texture data not stored / bundled / exported: ' + JSON.stringify(info));
  await page.evaluate('show3D(true)');
  await new Promise(r => setTimeout(r, 1500));
  const d3 = await page.evaluate(`(() => {
    let water = 0, glass = 0, metal = 0; T3.scene.traverse(o => { if (o.isMesh && o.material && o.material.type === 'MeshPhongMaterial' && o.material.transparent) water++; });
    T3.scene.traverse(o => { if (o.userData && o.userData.opId) o.traverse(m => { if (m.isMesh && m.material.color) { const h = m.material.color.getHexString(); if (h === '9fd3ee') glass++; if (h === '334155') metal++; } }); });
    show3D(false); return { water, glass, metal };
  })()`);
  if (d3.water < 2 || !d3.glass || !d3.metal) throw new Error('3D water / glass door / metal door missing: ' + JSON.stringify(d3));
  return `7 finish fills, texture in IndexedDB + JSON, ${d3.water} water surfaces, glass + metal doors in 3D`;
});

check('texture dialog: create a pattern, upload tab, AI tab, agent-made SVG texture in 2D + 3D', async page => {
  const info = await page.evaluate(`(async () => {
    loadProject(newProject()); addRectWalls(0, 0, 500, 400); const f = F();
    f.rooms.push({ id: uid(), name: 'R', color: '#cbd5e1', floor: 'none', pts: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 400 }, { x: 0, y: 400 }] });
    commit(); sel = [f.rooms[0].id]; refresh();
    const out = {};
    const btn = document.querySelector('#props [data-act="texadd"]'); out.btn = !!btn; btn.click();
    out.modal = ui.modal; out.prev = !!document.querySelector('#txPrev');
    document.querySelector('[data-tx-pat="brick"]').click();
    const c = document.querySelector('[data-tx="color"]'); c.value = '#7f1d1d'; c.dispatchEvent(new Event('input', { bubbles: true }));
    out.spec = ui.tx.spec.pattern + ' ' + ui.tx.spec.color;
    const n0 = P.textures.length; document.querySelector('[data-tx-go]').click();
    for (let i = 0; i < 40 && P.textures.length === n0; i++) await new Promise(r => setTimeout(r, 50));
    const t = P.textures[P.textures.length - 1]; out.added = P.textures.length - n0; out.size = t && t.w + 'x' + t.h;
    out.applied = F().rooms[0].floor === 'tex:' + (t && t.id); out.closed = ui.modal === null;
    await new Promise(r => setTimeout(r, 300));
    out.png = (TEX.get(t.id) || {}).data.startsWith('data:image/png'); out.ready = (TEX.get(t.id) || {}).ready;
    openTexDialog('up'); out.drop = !!document.querySelector('[data-tx-file]');
    openTexDialog('ai'); out.ai = !!document.querySelector('[data-tx-aisetup]') || !!document.querySelector('[data-tx-ai]'); closeModal();
    // an agent-made texture arrives as an SVG data URL inside texData (create_texture → push_to_browser)
    const g = texGen({ pattern: 'hex', color: '#0e7490' }), proj = JSON.parse(JSON.stringify(P));
    proj.textures.push({ id: 'agenthex', name: g.name, w: g.w, h: g.h }); proj.texData = { agenthex: texGenUrl(g.svg) };
    proj.floors[0].rooms[0].floor = 'tex:agenthex'; loadProject(proj);
    await new Promise(r => setTimeout(r, 400)); refresh();
    out.svgReady = !!(TEX.get('agenthex') || {}).ready; out.svgFill = !!document.querySelector('#gRooms polygon[fill="url(#p-tex-agenthex)"]');
    out.noTexData = !('texData' in P);
    return out;
  })()`);
  if (!info.btn || info.modal !== 'tex' || !info.prev) throw new Error('texture dialog did not open from the room panel: ' + JSON.stringify(info));
  if (info.spec !== 'brick #7f1d1d') throw new Error('pattern / colour controls did not update the spec: ' + JSON.stringify(info));
  if (info.added !== 1 || !info.applied || !info.closed || !info.png || !info.ready) throw new Error('generated texture not added / applied / rasterised: ' + JSON.stringify(info));
  if (!info.drop || !info.ai) throw new Error('upload or AI tab missing: ' + JSON.stringify(info));
  if (!info.svgReady || !info.svgFill || !info.noTexData) throw new Error('agent SVG texture not loaded into 2D: ' + JSON.stringify(info));
  await page.evaluate('show3D(true)');
  await new Promise(r => setTimeout(r, 1500));
  const d3 = await page.evaluate(`(() => { let n = 0; T3.scene.traverse(o => { if (o.isMesh && o.material && o.material.map && o.material.map.image && o.material.map.image.src && o.material.map.image.src.includes('svg')) n++; }); show3D(false); return n; })()`);
  if (!d3) throw new Error('agent SVG texture not used on the 3D room floor');
  return `brick ${info.size} cm added + applied as PNG, upload / AI tabs, agent hex SVG in 2D + ${d3} 3D mesh(es)`;
});

check('library presets: save a door, place it twice, delete + undo, JSON keeps them (issue #42)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject()); addRectWalls(0, 0, 800, 500); const f = F();
    const door = mkOp(OPDEF.door, f.walls[0], 200); door.w = 85; door.mat = 'glass'; f.ops.push(door); commit();
    const p0 = window.prompt, c0 = window.confirm; window.prompt = () => 'K1'; window.confirm = () => true;
    sel = [door.id]; refresh(); const btn = document.querySelector('#props [data-act="savepreset"]'); if (btn) btn.click();
    const out = { saved: (P.lib.presets || []).length, card: (document.querySelector('#items [data-type="pre"] .sz') || {}).textContent };
    const pr = P.lib.presets[0]; document.querySelector('#items [data-type="pre"][data-id="' + pr.id + '"]').click();
    const r = cv.getBoundingClientRect(), at = (q, type) => { const s = w2s(q); cv.dispatchEvent(new PointerEvent(type, { clientX: r.left + s.x, clientY: r.top + s.y, bubbles: true, pointerId: 1, button: 0 })); };
    for (const x of [450, 650]) { at({ x, y: 5 }, 'pointermove'); at({ x, y: 5 }, 'pointerdown'); at({ x, y: 5 }, 'pointerup'); }
    setTool('select');
    out.placed = F().ops.slice(1).map(o => o.w + ':' + o.mat).join(',');
    out.json = JSON.parse(JSON.stringify(P)).lib.presets.length;
    document.querySelector('#items [data-delpre="' + pr.id + '"]').click(); out.del = P.lib.presets.length;
    undo(); out.undo = P.lib.presets.length + '/' + document.querySelectorAll('#items [data-type="pre"]').length;
    window.prompt = p0; window.confirm = c0;
    return out;
  })()`);
  if (info.saved !== 1 || info.card !== '85×210') throw new Error('door preset not saved to the library: ' + JSON.stringify(info));
  if (info.placed !== '85:glass,85:glass') throw new Error('preset placement did not copy the saved values twice: ' + info.placed);
  if (info.json !== 1 || info.del !== 0 || info.undo !== '1/1') throw new Error('preset JSON / delete / undo broken: ' + JSON.stringify(info));
  return 'saved K1 85×210, placed twice (glass kept), delete undone';
});

check('command line: ":" finds tools in TR / EN, runs them, respects inputs and 3D (issue #43)', async page => {
  const info = await page.evaluate(`(async () => {
    loadProject(newProject()); addRectWalls(0, 0, 600, 400); commit(); setTool('select'); sel = []; refresh();
    const key = k => (document.activeElement && document.activeElement !== document.body ? document.activeElement : window).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    const type = s => { const i = document.getElementById('cmdIn'); i.value = s; i.dispatchEvent(new Event('input', { bubbles: true })); };
    const out = {};
    key(':'); out.open = !!document.getElementById('cmdPal'); out.rows = document.querySelectorAll('.cmditem').length;
    type('KESİT'); out.top = document.querySelector('.cmditem.on kbd').textContent; key('Enter'); out.tool = tool;
    out.closed = !document.getElementById('cmdPal'); setTool('select');
    const pn = document.getElementById('pname'); pn.focus(); pn.dispatchEvent(new KeyboardEvent('keydown', { key: ':', bubbles: true })); out.input = !!document.getElementById('cmdPal'); pn.blur();
    show3D(true); await new Promise(r => setTimeout(r, 800));
    key(':'); type('yinele'); key('Enter'); out.redo3d = ui.view3d;
    key(':'); type('duvar'); key('Enter'); out.wall2d = !ui.view3d && tool === 'wall';
    setTool('select'); return out;
  })()`);
  if (!info.open || info.rows < 30) throw new Error('":" did not open the command list: ' + JSON.stringify(info));
  if (info.top !== 'L' || info.tool !== 'section' || !info.closed) throw new Error('searching "KESİT" did not run the Section tool: ' + JSON.stringify(info));
  if (info.input) throw new Error('":" typed in a text field opened the command line');
  if (!info.redo3d || !info.wall2d) throw new Error('3D rules broken (redo should stay in 3D, wall should go to 2D): ' + JSON.stringify(info));
  return `${info.rows} commands, KESİT → Section (L), inputs ignored, 3D rules kept`;
});

check('midpoint / centre snap and the floor underlay (issues #25, #26)', async page => {
  const info = await page.evaluate(`(() => {
    const p = newProject(), g = p.floors[0], u = newFloor('1');
    p.floors.push(u); loadProject(p);
    fi = 0; addRectWalls(0, 0, 800, 600); F().walls.push(mkWall({ x: 430, y: 0 }, { x: 430, y: 600 })); F().furn.push(mkFurn(BYID.column, 300, 300));
    fi = 1; addRectWalls(0, 0, 800, 600); F().rooms.push({ id: uid(), name: 'R', color: '#fde68a', floor: 'none', pts: [{ x: 0, y: 0 }, { x: 800, y: 0 }, { x: 800, y: 600 }, { x: 0, y: 600 }] });
    commit(); view.z = 0.5; view.x = 100; view.y = 50; sel = []; refresh();
    const r = cv.getBoundingClientRect();
    const at = (q, type, extra = {}) => { const s = w2s(q); cv.dispatchEvent(new PointerEvent(type, { clientX: r.left + s.x, clientY: r.top + s.y, bubbles: true, pointerId: 1, button: 0, ...extra })); };
    const hit = q => { at(q, 'pointermove'); return ui.cur && [ui.cur.x, ui.cur.y, ui.cur.hit].join(','); };
    const out = { layer: !!document.querySelector('#gBg [data-underlay]'), panel: !!document.querySelector('#props [data-k="ul"][data-p="floor"]') };
    setTool('wall');
    out.mid = hit({ x: 406, y: 5 }); out.under = hit({ x: 427, y: 596 }); out.center = hit({ x: 394, y: 306 });
    out.glyph = document.querySelector('#gPv').textContent;
    startPlace('furn', BYID.tableR); at({ x: 392, y: 308 }, 'pointermove'); at({ x: 392, y: 308 }, 'pointerdown'); at({ x: 392, y: 308 }, 'pointerup');
    const t = F().furn.at(-1); out.table = t && t.type === 'tableR' ? t.x + ',' + t.y : '';
    setTool('select'); sel = []; refresh();
    const cb = document.querySelector('#props [data-k="layer"][data-p="underlay"]'); cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true }));
    out.off = document.querySelector('#gBg').innerHTML;
    setTool('wall'); out.offSnap = hit({ x: 427, y: 596 });
    layersVis.underlay = true; setTool('select'); refresh();
    return out;
  })()`);
  if (!info.layer || !info.panel) throw new Error('the underlay layer or its panel controls are missing: ' + JSON.stringify(info));
  if (info.mid !== '400,0,mid') throw new Error('no midpoint snap on the wall: ' + info.mid);
  if (info.under !== '430,600,under') throw new Error('no snap to the floor-below wall end: ' + info.under);
  if (info.center !== '400,300,center') throw new Error('no room-centre snap: ' + info.center);
  if (!/Center|Merkez/.test(info.glyph)) throw new Error('the centre glyph is not drawn: ' + info.glyph);
  if (info.table !== '400,300') throw new Error('furniture did not lock to the room centre: ' + info.table);
  if (info.off !== '' || /under/.test(info.offSnap)) throw new Error('turning the underlay off left lines or snapping behind: ' + JSON.stringify(info));
  return 'mid / centre / underlay snaps, centred table, underlay toggles off cleanly';
});

check('site-plan zoom: the grid steps up and never disappears (issue #38)', async page => {
  const info = await page.evaluate(`(() => {
    show3D(false); closeModal();
    P = newProject(); loadProject(P);
    addRectWalls(0, 0, 800, 500); commit(); refresh(); fit();
    const cvEl = document.getElementById('cv');
    const cx = cvEl.clientWidth / 2, cy = cvEl.clientHeight / 2;
    const gridEl = document.getElementById('gGrid');
    const steps = [];
    zoomAt(0.7, cx, cy); // start outside the fit zoom so the ladder is exercised
    for (let i = 0; i < 60; i++) {
      zoomAt(0.7, cx, cy);
      const g = gridScale();
      steps.push({
        z: +view.z.toFixed(5), minor: g.minor, major: g.major,
        majorPx: +g.majorPx.toFixed(1), gridLen: gridEl.innerHTML.length,
        label: document.getElementById('gridlbl').textContent,
        zoomText: document.getElementById('zoomlbl').textContent,
      });
      if (view.z <= 0.0021) break;
    }
    // snapping must still follow P.grid, never the drawn interval
    const snapped = snapToGrid({ x: 1234.6, y: 987.4 });

    // Fit must frame a two-kilometre site instead of clamping far above the content
    P = newProject(); loadProject(P);
    addRectWalls(0, 0, 200000, 100000); commit(); refresh(); fit();
    const fitted = { z: +view.z.toFixed(5), spanPx: +(200000 * view.z).toFixed(1), canvas: cvEl.clientWidth };

    // at 50 % (thumbnails, SVG/PNG export) the pattern must look exactly as before
    const z0 = view.z; view.z = 0.5;
    const exportGrid = gridScale(); view.z = z0;

    P = newProject(); loadProject(P);
    addRectWalls(0, 0, 800, 500); commit(); refresh(); fit();
    return { steps, snapped, grid: P.grid, fitted, exportGrid, minZoom: MIN_ZOOM };
  })()`);

  if (info.steps.length < 6) throw new Error('the zoom-out loop never ran: ' + info.steps.length);
  const last = info.steps[info.steps.length - 1];
  if (last.z > 0.0021) throw new Error('could not zoom out to the site-plan limit, stopped at z=' + last.z);
  for (const s of info.steps) {
    if (!s.gridLen) throw new Error('the grid disappeared at z=' + s.z + ' (blank canvas)');
    if (s.majorPx < 44) throw new Error('the grid became illegible at z=' + s.z + ' (' + s.majorPx + ' px)');
    if (!/\d/.test(s.label)) throw new Error('the footer has no grid interval at z=' + s.z + ': "' + s.label + '"');
  }
  // zooming out only ever coarsens the grid, never resets it
  for (let i = 1; i < info.steps.length; i++) {
    if (info.steps[i].major < info.steps[i - 1].major) throw new Error('grid interval went backwards at z=' + info.steps[i].z);
  }
  if (!/m\b/.test(last.label)) throw new Error('the far-out grid is not labelled in metres: "' + last.label + '"');
  if (last.zoomText === '0%') throw new Error('the zoom readout rounds the minimum zoom to 0 %');
  if (info.fitted.spanPx > info.fitted.canvas + 1 || info.fitted.z < info.minZoom) {
    throw new Error('Fit does not frame a 2 km site: ' + JSON.stringify(info.fitted));
  }
  if (info.snapped.x % info.grid !== 0 || info.snapped.y % info.grid !== 0) {
    throw new Error('snapping left P.grid: ' + JSON.stringify(info.snapped));
  }
  if (info.exportGrid.minor !== 0 || info.exportGrid.major !== 100) {
    throw new Error('the 50 % export grid changed: ' + JSON.stringify(info.exportGrid));
  }
  return 'zoomed to ' + last.z + ', grid ' + last.label + ', 2 km fit at ' + info.fitted.z;
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

check('3D: the camera starts on the 2D focus and remembers the orbit', async page => {
  const info = await page.evaluate(`(() => {
    show3D(false); closeModal();
    P = newProject(); loadProject(P);
    addRectWalls(0, 0, 800, 500); commit(); refresh();
    if (!window.THREE || !THREE.OrbitControls) {
      return { three: false, toast: document.getElementById('toast').textContent };
    }
    const cvEl = document.getElementById('cv');
    const place = (p) => { view.z = 1; view.x = cvEl.clientWidth / 2 - p.x; view.y = cvEl.clientHeight / 2 - p.y; applyView(); };
    // start from a clean slate: earlier checks left a 3D camera behind, and this
    // check is about the first entry after a fresh plan
    if (typeof T3 !== 'undefined' && T3) { T3.lastCam = null; T3.center2d = null; }
    sel = [];
    place({ x: 700, y: 400 });
    show3D(true);
    if (!ui.view3d) return { three: false, toast: document.getElementById('toast').textContent };
    const focusTarget = { x: T3.ctl.target.x, z: T3.ctl.target.z };

    // orbit somewhere distinctive, then leave
    T3.ctl.target.set(focusTarget.x, 120, focusTarget.z);
    T3.cam.position.set(focusTarget.x + 500, 700, focusTarget.z + 400);
    T3.ctl.update();
    const orbit = { x: T3.cam.position.x, y: T3.cam.position.y, z: T3.cam.position.z };
    show3D(false);

    // same 2D place -> the orbit must come back untouched
    show3D(true);
    const back = { x: T3.cam.position.x, y: T3.cam.position.y, z: T3.cam.position.z };
    show3D(false);

    // pan to another corner (> 200 cm) -> the camera follows the 2D view
    const far = { x: 200, y: 150 };
    place(far);
    show3D(true);
    const followed = { x: T3.ctl.target.x, z: T3.ctl.target.z };
    show3D(false);

    // a selected wall is framed instead of the viewport centre
    const w = F().walls[0];
    sel = [w.id]; render();
    show3D(true);
    const selTarget = { x: T3.ctl.target.x, z: T3.ctl.target.z };
    // and "Fit" still resets the camera to the whole building
    document.getElementById('b3dFit').click();
    const fitTarget = { x: T3.ctl.target.x, z: T3.ctl.target.z, cx: T3.fit.cx, cz: T3.fit.cz };
    show3D(false);
    sel = []; render();

    return {
      three: true, spot: { x: 700, y: 400 }, focusTarget, orbit, back, far, followed, selTarget,
      wallMid: { x: (w.a.x + w.b.x) / 2, z: (w.a.y + w.b.y) / 2 }, fitTarget,
    };
  })()`);
  if (!info.three) return 'skipped: WebGL/Three.js unavailable (' + String(info.toast || '').slice(0, 60) + ')';

  // 1. entering 3D focuses on what the 2D canvas was showing
  if (Math.abs(info.focusTarget.x - info.spot.x) > 2 || Math.abs(info.focusTarget.z - info.spot.y) > 2) {
    throw new Error('3D did not focus on the 2D viewport centre: ' + JSON.stringify(info.focusTarget) + ' vs ' + JSON.stringify(info.spot));
  }
  // 2. leaving and returning to the same 2D spot keeps the user's orbit
  const drift = Math.hypot(info.back.x - info.orbit.x, info.back.y - info.orbit.y, info.back.z - info.orbit.z);
  if (drift > 0.5) throw new Error('3D camera was reset on re-entry (moved ' + drift.toFixed(1) + ' cm)');
  // 3. panning in 2D to another area moves the camera with it
  if (Math.hypot(info.followed.x - info.far.x, info.followed.z - info.far.y) > 2) {
    throw new Error('3D camera did not follow the new 2D area: ' + JSON.stringify(info.followed));
  }
  // 4. a selection is framed
  if (Math.hypot(info.selTarget.x - info.wallMid.x, info.selTarget.z - info.wallMid.z) > 2) {
    throw new Error('the selected wall was not centred: ' + JSON.stringify({ got: info.selTarget, want: info.wallMid }));
  }
  // 5. Fit still frames the whole plan
  if (Math.hypot(info.fitTarget.x - info.fitTarget.cx, info.fitTarget.z - info.fitTarget.cz) > 1) {
    throw new Error('Fit no longer aims at the plan centre: ' + JSON.stringify(info.fitTarget));
  }
  return 'focus follows 2D, orbit kept across toggles';
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
  await page.send('Input.dispatchKeyEvent', Object.assign({ type: 'keyDown', text: k.ctrl || k.key.length > 1 ? undefined : k.key }, base)); // no text for Escape / arrows
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

check('3D walk mode: climb a stair to the upper floor and walk back down through its void', async page => {
  const ok = await page.evaluate(`(() => {
    show3D(false); closeModal();
    loadProject(newProject()); addRectWalls(0, 0, 800, 600);
    const pitch = floorH(F()) + 20;
    F().furn.push(Object.assign(mkFurn(BYID.stairs, 400, 300, 0), { w: 100, d: 450, h: pitch, stepN: 16 })); // climbs toward −y
    P.floors.push(newFloor('Ust')); fi = 1; addRectWalls(0, 0, 800, 600);
    F().voids.push(mkVoid([{ x: 345, y: 70 }, { x: 455, y: 70 }, { x: 455, y: 530 }, { x: 345, y: 530 }]));
    fi = 0; commit(); refresh();
    document.getElementById('b3d').click(); return true;
  })()`);
  await sleep(1200);
  const in3d = await page.evaluate(`!!(ui.view3d && T3 && T3.fit)`);
  if (!ok || !in3d) { await page.evaluate(`show3D(false)`); return 'skipped: WebGL/Three.js unavailable'; }
  const r = await page.evaluate(`(() => {
    document.getElementById('b3dEye').click();
    const w = T3.walk; if (!w) return { err: 'no walk mode' };
    const run = (yaw, secs) => { w.yaw = yaw; keys3D.add('w'); for (let i = 0; i < secs * 60; i++) walkStep(1 / 60); keys3D.delete('w'); for (let i = 0; i < 30; i++) walkStep(1 / 60); };
    w.x = 400; w.y = 570; w.yaw = -Math.PI / 2; applyWalkCam();
    const y0 = T3.cam.position.y;
    run(-Math.PI / 2, 2.2); const mid = { fi: w.fi, z: w.gz };           // ~300 cm: on the stair
    run(-Math.PI / 2, 4); const top = { fi: w.fi, z: w.gz, y: w.y, camY: T3.cam.position.y };
    run(Math.PI / 2, 6); const back = { fi: w.fi, z: w.gz, y: w.y, camY: T3.cam.position.y };
    exitWalk(true); show3D(false);
    return { y0, mid, top, back };
  })()`);
  if (r.err) throw new Error(r.err);
  if (!(r.mid.fi === 0 && r.mid.z > 60)) throw new Error('did not climb the stair: ' + JSON.stringify(r.mid));
  if (r.top.fi !== 1 || Math.abs(r.top.z) > 1) throw new Error('did not reach the upper floor: ' + JSON.stringify(r.top));
  if (r.top.camY < r.y0 + 250) throw new Error('eye did not rise with the floor change');
  if (r.back.fi !== 0 || Math.abs(r.back.z) > 1 || r.back.y < 540) throw new Error('could not walk back down: ' + JSON.stringify(r.back));
  return 'up to floor 1 (eye +' + (r.top.camY - r.y0).toFixed(0) + ' cm) and back down';
});

check('3D wheel zoom keeps moving toward the cursor instead of stalling at the orbit target', async page => {
  await page.evaluate(`(() => { show3D(false); closeModal(); loadProject(newProject()); addRectWalls(0, 0, 800, 600); commit(); refresh(); document.getElementById('b3d').click(); })()`);
  await sleep(1200);
  const r = await page.evaluate(`(() => {
    if (!(ui.view3d && T3 && T3.fit) || !T3.cam.isPerspectiveCamera) return null;
    const el = T3.r.domElement, b = el.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const tgt = T3.ctl.target.clone(), d0 = T3.cam.position.distanceTo(tgt), dir = new THREE.Vector3(); T3.cam.getWorldDirection(dir);
    for (let i = 0; i < 80; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
    const past = T3.cam.position.clone().sub(tgt).dot(dir);   // > 0: the camera went past the old orbit target
    const d1 = T3.ctl.target.distanceTo(T3.cam.position);
    for (let i = 0; i < 80; i++) el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, clientX: cx, clientY: cy, bubbles: true, cancelable: true }));
    const back = T3.cam.position.distanceTo(tgt);
    show3D(false);
    return { d0, past, d1, back };
  })()`);
  if (!r) { await page.evaluate(`show3D(false)`); return 'skipped: WebGL/Three.js unavailable or parallel camera'; }
  if (!(r.past > 0)) throw new Error('80 wheel notches did not pass the orbit target: ' + JSON.stringify(r));
  if (!(r.d1 >= 29)) throw new Error('orbit pivot collapsed onto the camera: ' + r.d1);
  if (!(r.back > r.d0 * 0.5)) throw new Error('zooming out did not come back: ' + JSON.stringify(r));
  return 'passed the old target by ' + r.past.toFixed(0) + ' cm, pivot ' + r.d1.toFixed(0) + ' cm ahead';
});

check('3D walk mode: W stops at a wall, passes an open door, Esc restores the orbit camera (issue #46)', async page => {
  // two rooms split by a partition at x = 400 with a closed door in the middle
  const setup = await page.evaluate(`(() => {
    show3D(false); closeModal();
    loadProject(newProject());
    const f = F();
    addRectWalls(0, 0, 800, 400);
    const part = mkWall({ x: 400, y: 0 }, { x: 400, y: 400 }); f.walls.push(part);
    const door = mkOp(OPDEF.door || OPENINGS.find(o => o.id === 'door'), part, 200); door.open = 0; f.ops.push(door);
    commit(); refresh();
    document.getElementById('b3d').click();
    return { door: door.id };
  })()`);
  await sleep(1200);
  const in3d = await page.evaluate(`!!(ui.view3d && T3 && T3.fit)`);
  if (!in3d) { await page.evaluate(`show3D(false)`); return 'skipped: WebGL/Three.js unavailable'; }

  const entered = await page.evaluate(`(() => {
    const orbit = T3.cam.position.clone();
    document.getElementById('b3dEye').click();
    const w = T3.walk; if (!w) return { err: 'eye button did not enter walk mode' };
    w.x = 200; w.y = 200; w.yaw = 0; w.pitch = 0; applyWalkCam();           // face the partition
    return { orbit: [orbit.x, orbit.y, orbit.z], on: document.getElementById('b3dEye').classList.contains('on'),
      hint: !!document.getElementById('walkHint') && document.getElementById('walkHint').style.display !== 'none' };
  })()`);
  if (entered.err) throw new Error(entered.err);
  if (!entered.on || !entered.hint) throw new Error('walk mode is not shown on the eye button / hint');

  const W = { key: 'w', code: 'KeyW', vk: 87 }, Q = { key: 'q', code: 'KeyQ', vk: 81 };
  const y0 = await page.evaluate(`T3.cam.position.y`);
  await keyDown(page, W); await keyDown(page, Q);
  await sleep(2500);                                       // 140 cm/s would end ~x = 550 without the wall
  await keyUp(page, Q); await keyUp(page, W);
  const blocked = await page.evaluate(`(() => ({ x: T3.walk.x, camX: T3.cam.position.x, y: T3.cam.position.y }))()`);
  if (blocked.x < 260) throw new Error('W did not walk forward: x = ' + blocked.x.toFixed(0));
  if (blocked.camX > 400 - 10) throw new Error('walked into / through a closed door: camera x = ' + blocked.camX.toFixed(0));
  if (Math.abs(blocked.y - y0) > 0.5) throw new Error('Q changed the eye height in walk mode');

  await page.evaluate(`(() => { const o = F().ops.find(o => o.id === '${setup.door}'); toggleDoor3D(o); T3.walk.y = 200; T3.walk.yaw = 0; return true; })()`);
  await keyDown(page, W); await sleep(2500); await keyUp(page, W);
  const passed = await page.evaluate(`T3.walk.x`);
  if (passed < 430) throw new Error('could not walk through the open door: x = ' + passed.toFixed(0));

  await pressKey(page, { key: 'Escape', code: 'Escape', vk: 27 });
  const after = await page.evaluate(`(() => ({ walk: !!T3.walk, view3d: !!ui.view3d, p: [T3.cam.position.x, T3.cam.position.y, T3.cam.position.z] }))()`);
  await page.evaluate(`show3D(false)`);
  if (after.walk) throw new Error('Esc did not leave walk mode');
  if (!after.view3d) throw new Error('Esc in walk mode must return to the orbit camera, not to 2D');
  if (Math.hypot(after.p[0] - entered.orbit[0], after.p[1] - entered.orbit[1], after.p[2] - entered.orbit[2]) > 1) {
    throw new Error('Esc did not restore the orbit camera');
  }
  return 'blocked at x=' + blocked.camX.toFixed(0) + ', through the open door to x=' + passed.toFixed(0);
});

check('2D drafting: line, rectangle, circle and arc; styled in the panel, undo / redo, exported, never in 3D (#83)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject());
    document.getElementById('b3d').click();
    let empty = 0; if (ui.view3d) T3.scene.traverse(o => { if (o.isMesh) empty++; });
    show3D(false);
    setTool('draft');
    const bar = document.querySelectorAll('#shapeBar [data-dm]').length;
    draftUi().mode = 'line'; draftClick({ x: 0, y: 0 }); draftClick({ x: 300, y: 0 }); finishDraft();
    draftUi().mode = 'rect'; draftClick({ x: 0, y: 100 }); draftClick({ x: 200, y: 250 });
    draftUi().mode = 'circle'; draftClick({ x: 500, y: 200 }); draftClick({ x: 600, y: 200 });
    draftUi().mode = 'arc'; draftClick({ x: -100, y: 400 }); draftClick({ x: 0, y: 300 }); draftClick({ x: 100, y: 400 });
    const f = F(), n = f.drafts.length, paths = document.querySelectorAll('#gSketch path[data-id]').length;
    const circ = f.drafts.find(d => d.shape === 'circle'); if (!circ) return { err: 'no circle was created' };
    setTool('select'); sel = [circ.id]; refresh();
    const handles = document.querySelectorAll('#gSel [data-h]').length;
    const sl = document.querySelector('#props select[data-k="draft"][data-p="dash"]'); if (!sl) return { err: 'no line type field in the panel' };
    sl.value = 'dashed'; sl.dispatchEvent(new Event('change', { bubbles: true }));
    const dashed = /stroke-dasharray/.test(document.getElementById('gSketch').innerHTML);
    undo(); const undone = (F().drafts.find(d => d.id === circ.id) || {}).dash || 'solid';
    redo(); const redone = (F().drafts.find(d => d.id === circ.id) || {}).dash || 'solid';
    const svg = exportSvg().svg, bb = bboxOf('draft', F().drafts.find(d => d.id === circ.id));
    document.getElementById('b3d').click();
    let meshes = 0; if (ui.view3d) T3.scene.traverse(o => { if (o.isMesh) meshes++; });
    const view3d = !!ui.view3d; show3D(false);
    return { bar, n, paths, handles, dashed, undone, redone, exp: /stroke-dasharray/.test(svg) && / A| a|A\\d|a\\d/.test(svg), bbw: bb.x1 - bb.x0, view3d, empty, meshes };
  })()`);
  if (info.err) throw new Error(info.err);
  if (info.bar !== 5) throw new Error('the draft tool bar should offer 5 shapes, got ' + info.bar);
  if (info.n !== 4 || info.paths !== 4) throw new Error('expected 4 drafting entities drawn, got ' + info.n + ' / ' + info.paths + ' paths');
  if (info.handles < 2) throw new Error('a selected circle has no handles');
  if (!info.dashed || info.redone !== 'dashed' || info.undone !== 'solid') throw new Error('line type edit / undo / redo failed: ' + JSON.stringify(info));
  if (!info.exp) throw new Error('drafting entities are missing from the SVG export');
  if (Math.abs(info.bbw - 200) > 0.5) throw new Error('circle bounding box is not its diameter: ' + info.bbw);
  if (!info.view3d) throw new Error('3D did not open');
  if (info.meshes !== info.empty) throw new Error('2D drafting leaked into 3D: ' + info.meshes + ' meshes vs ' + info.empty + ' in an empty plan');
  return '4 entities, panel edit undone / redone, 3D unchanged (' + info.meshes + ' meshes)';
});

check('3D selection on another floor fills the side panel; free slabs are pickable (#82)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject());
    addRectWalls(0, 0, 400, 300);
    P.floors.push(newFloor('Ust Kat')); fi = 1; addRectWalls(0, 0, 400, 300);
    const up = F(), w = up.walls[0], sl = mkSlab([{ x: 400, y: 0 }, { x: 650, y: 0 }, { x: 650, y: 300 }, { x: 400, y: 300 }]);
    up.slabs.push(sl); fi = 0; sel = []; commit(); refresh();
    document.getElementById('b3d').click();
    if (!ui.view3d) return { err: '3D did not open' };
    const g = T3.scene.children.find(c => c.userData && c.userData.wallId === w.id && !c.isMesh);
    if (!g) return { err: 'upper-floor wall is not in the scene' };
    walkClick(g, false);
    const r = { fi, sel: sel.slice(), h3: document.querySelector('#props h3') ? document.querySelector('#props h3').textContent : '', badge: (document.querySelector('#props .flbadge') || {}).textContent || '', hl: h3.length };
    const inp = document.querySelector('#props input[data-k="wall"][data-p="h"]'); if (!inp) return { err: 'wall height field missing for a wall on another floor: ' + r.h3 };
    inp.value = '200'; inp.dispatchEvent(new Event('change', { bubbles: true }));
    r.h = w.h;
    const sm = T3.scene.children.find(c => c.userData && c.userData.slabId === sl.id);
    if (!sm) return { err: 'free slab has no pick metadata in 3D' };
    walkClick(sm, false);
    r.slabSel = sel[0] === sl.id; r.slabPanel = !!document.querySelector('#props [data-k="slab"]'); r.slabHl = h3.length;
    r.inspect = !!document.getElementById('bInspect');
    show3D(false);
    return r;
  })()`);
  if (info.err) throw new Error(info.err);
  if (info.fi !== 1) throw new Error('the active floor did not follow the 3D selection');
  if (!/Duvar|Wall/.test(info.h3)) throw new Error('side panel does not show the wall: "' + info.h3 + '"');
  if (!/Ust Kat/.test(info.badge)) throw new Error('floor badge missing: "' + info.badge + '"');
  if (info.h !== 200) throw new Error('editing the height of a wall on another floor did not apply: ' + info.h);
  if (!info.hl) throw new Error('selected wall is not highlighted in 3D');
  if (!info.slabSel || !info.slabPanel || !info.slabHl) throw new Error('free slab was not selected / shown / highlighted: ' + JSON.stringify(info));
  if (!info.inspect) throw new Error('#bInspect is missing');
  return 'wall on floor 2 edited from 3D, slab selected';
});

check('live realistic 3D view: sky on, CAD edges hidden, walk mode works, CAD view restored (#81)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject());
    addRectWalls(0, 0, 500, 400); sel = []; commit(); refresh();
    if (ui.live3d) setLive3D(false);
    document.getElementById('b3d').click();
    if (!ui.view3d) return { err: '3D did not open' };
    const edges = () => { let n = 0; T3.scene.traverse(o => { if (o.isLineSegments && o.type !== 'BoxHelper' && o.visible) n++; }); return n; };
    const r = { e0: edges(), bg0: T3.scene.background.getHex(), g0: T3.ground.material.color.getHex(), gm0: !!T3.ground.material.map };
    document.getElementById('b3dLive').click();
    r.live = !!T3.live; r.e1 = edges(); r.fog = !!T3.scene.fog; r.sky = !!(T3.live && T3.scene.children.includes(T3.live.sky));
    r.gmLive = !!(T3.ground && T3.ground.material && T3.ground.material.map && T3.ground.material.bumpMap);
    if (r.gmLive && T3.ground.material.map.image) {
      const im = T3.ground.material.map.image, px = im.getContext('2d').getImageData(0, 0, im.width, im.height).data;
      let mn = 255, mx = 0; for (let i = 1; i < px.length; i += 4) { if (px[i] < mn) mn = px[i]; if (px[i] > mx) mx = px[i]; }
      r.grassContrast = mx - mn;
    }
    r.on = document.getElementById('b3dLive').classList.contains('on');
    document.getElementById('b3dEye').click();
    r.walk = !!T3.walk && !!T3.live;
    draw3D(performance.now());
    r.follow = !!T3.live && T3.live.sky.position.distanceTo(T3.cam.position) < 0.01;
    build3D(true);                                   // an edit while live: the look must survive the rebuild
    r.e2 = edges(); r.live2 = !!T3.live; r.gmRebuild = !!(T3.ground && T3.ground.material && T3.ground.material.map);
    exitWalk(true);
    document.getElementById('b3dLive').click();
    r.off = !T3.live && !T3.scene.fog; r.e3 = edges(); r.bg1 = T3.scene.background.getHex(); r.g1 = T3.ground.material.color.getHex(); r.gm1 = !!T3.ground.material.map;
    r.skyLeft = T3.scene.children.some(c => c.material && c.material.isShaderMaterial);
    show3D(false);
    return r;
  })()`);
  if (info.err) throw new Error(info.err);
  if (!info.e0) throw new Error('the CAD view has no edge lines to hide (test plan too simple?)');
  if (!info.live || !info.on || !info.fog || !info.sky) throw new Error('live realistic view did not turn on: ' + JSON.stringify(info));
  if (!info.gmLive || !info.gmRebuild || !(info.grassContrast > 40)) throw new Error('live realistic view did not apply textured grass to ground: ' + JSON.stringify(info));
  if (info.e1 !== 0 || info.e2 !== 0 || !info.live2) throw new Error('CAD edges are visible in the live view (' + info.e1 + ' / after rebuild ' + info.e2 + ')');
  if (!info.walk || !info.follow) throw new Error('walk mode + live view: walk=' + info.walk + ', sky follows camera=' + info.follow);
  if (!info.off || info.skyLeft) throw new Error('live view left sky / fog behind');
  if (info.e3 !== info.e0) throw new Error('edge lines not restored: ' + info.e3 + ' vs ' + info.e0);
  if (info.bg1 !== info.bg0 || info.g1 !== info.g0 || info.gm1 !== info.gm0) throw new Error('background / ground not restored');
  return info.e0 + ' edges hidden and restored, sky follows the walker';
});

check('furniture labels and icons toggle separately, without touching the plan (#84)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject());
    const f = F(), o = mkFurn(BYID.wc, 200, 200); o.label = 'Tuvalet-A'; f.furn.push(o); commit(); refresh();
    const g = () => document.getElementById('gFurn').innerHTML, has = () => ({ icon: g().includes(o.icon), label: g().includes('Tuvalet-A') });
    const r = { both: has(), hi0: hi, json0: JSON.stringify(P) };
    const cb = k => document.querySelector('#props input[data-k="layer"][data-p="' + k + '"]');
    if (!cb('furnLabel') || !cb('furnIcon')) return { err: 'label / icon toggles are missing from Project > Layers' };
    cb('furnLabel').click(); r.noLabel = has(); r.expNoLabel = exportSvg().svg.includes('Tuvalet-A');
    cb('furnIcon').click(); r.none = has(); r.body = g().includes('data-id="' + o.id + '"');
    r.same = JSON.stringify(P) === r.json0 && hi === r.hi0;
    cb('furnLabel').click(); r.iconOff = has();
    cb('furnIcon').click(); r.back = has();
    delete r.json0;
    return r;
  })()`);
  if (info.err) throw new Error(info.err);
  const ok = (v, i, l) => v && v.icon === i && v.label === l;
  if (!ok(info.both, true, true)) throw new Error('icon and label should both show by default');
  if (!ok(info.noLabel, true, false) || info.expNoLabel) throw new Error('label toggle did not hide only the label (canvas / export)');
  if (!ok(info.none, false, false) || !info.body) throw new Error('with both off the furniture body must stay, icon and label go');
  if (!ok(info.iconOff, false, true)) throw new Error('icon toggle is not independent of the label toggle');
  if (!ok(info.back, true, true)) throw new Error('turning the toggles back on did not restore icon and label');
  if (!info.same) throw new Error('toggling changed the plan or added undo history');
  return 'label only, icon only, neither, both; plan and history untouched';
});

check('3D: floors toggle individually and keep their relative heights (#85)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject());
    addRectWalls(0, 0, 400, 300);
    for (const n of ['Kat 1', 'Kat 2']) { P.floors.push(newFloor(n)); fi = P.floors.length - 1; addRectWalls(0, 0, 400, 300); }
    fi = 0; sel = []; commit(); refresh();
    const ids = P.floors.map(f => f.id), hi0 = hi, json0 = JSON.stringify(P);
    document.getElementById('b3d').click();
    if (!ui.view3d) return { err: '3D did not open' };
    const ys = () => ids.map(id => { const w = P.floors.find(f => f.id === id).walls[0], g = T3.scene.children.find(c => c.userData && c.userData.wallId === w.id && !c.isMesh); return g ? Math.round(g.position.y) : null; });
    const r = { all: ys(), pitch: floorElev(1) };
    document.getElementById('b3dFloors').click();
    const box = id => document.querySelector('#v3dFloorList input[data-vf="' + id + '"]');
    if (!box(ids[2])) return { err: 'the floor checklist did not open' };
    box(ids[2]).click(); r.noTop = ys(); r.sel1 = document.getElementById('s3dFloor').value;
    box(ids[0]).click(); r.mid = ys(); r.sel2 = document.getElementById('s3dFloor').value;
    r.lastLocked = box(ids[1]).disabled;
    document.querySelector('#v3dFloorList [data-vfall]').click(); r.back = ys();
    v3dOnly(ids[2]); v3dApply();
    document.getElementById('b3dEye').click(); r.walkFi = T3.walk ? T3.walk.fi : -1; exitWalk(true);
    P.floors.splice(2, 1); commit(); refresh(); sync3DFloors(); r.afterDelete = P.floors.every(v3dShown) && ui.v3dHide.size === 0;
    undo(); v3dOnly('all');
    r.same = JSON.stringify(P) === json0;
    show3D(false);
    return r;
  })()`);
  if (info.err) throw new Error(info.err);
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b), p = info.pitch;
  if (!eq(info.all, [0, p, 2 * p])) throw new Error('all floors should stack at their real heights: ' + info.all);
  if (!eq(info.noTop, [0, p, null]) || info.sel1 !== 'custom') throw new Error('hiding the top floor: ' + info.noTop + ' / selector ' + info.sel1);
  if (!eq(info.mid, [null, 0, null])) throw new Error('a single visible floor should sit on the ground: ' + info.mid);
  if (!info.lastLocked) throw new Error('the last visible floor could be switched off');
  if (!eq(info.back, [0, p, 2 * p])) throw new Error('Show all did not restore every floor: ' + info.back);
  if (info.walkFi !== 2) throw new Error('walk mode started on a hidden floor: ' + info.walkFi);
  if (!info.afterDelete) throw new Error('deleting the only visible floor left nothing visible');
  if (!info.same) throw new Error('floor visibility changed the plan');
  return 'subset ' + info.noTop + ', single floor grounded, walk on the visible floor';
});

check('adjustable group across two floors: link from the panel, layouts switch together, undo, unlink (#86)', async page => {
  const info = await page.evaluate(`(() => {
    loadProject(newProject());
    const f0 = F(), a = mkFurn(BYID.wc, 100, 100), b = mkFurn(BYID.wc, 300, 100); f0.furn.push(a, b);
    sel = [a.id, b.id]; groupSel(); varAction('varInit'); varAction('varNew');
    a.x = 500; commit();                                   // layout 2 on the ground floor: a moved
    const rec0 = f0.groups[0];
    P.floors.push(newFloor('Ust Kat')); fi = 1;
    const c = mkFurn(BYID.wc, 100, 400); F().furn.push(c); sel = [c.id]; commit(); refresh();
    const pick = document.querySelector('#props select[data-k="grplink"]'); if (!pick) return { err: 'no link field in the panel' };
    pick.value = rec0.id; pick.dispatchEvent(new Event('change', { bubbles: true }));
    const rec1 = F().groups.find(g => g.id === rec0.id); if (!rec1) return { err: 'linking did not create the group on the upper floor' };
    const r = { linked: c.grp === rec0.id, vars: rec1.vars.length, idx: rec1.idx, labels: rec1.vars.map(v => v.label).join() === rec0.vars.map(v => v.label).join() };
    c.x = 700; commit();                                   // upper floor, layout 2: c moved
    switchGroupVarTo(rec1, 0);
    r.first = [a.x, c.x, rec0.idx, rec1.idx];
    fi = 0; sel = []; refresh(); cycleGroupVars(rec0.id);
    r.second = [a.x, c.x, rec0.idx, rec1.idx];
    undo(); const fa = P.floors[0].furn.find(o => o.id === a.id), fc = P.floors[1].furn.find(o => o.id === c.id);
    r.undone = [fa.x, fc.x]; redo();
    fi = 1; sel = [c.id]; refresh();
    r.info = /Zemin|Ground/.test((document.getElementById('props').textContent));
    const ub = document.querySelector('#props [data-act="grpUnlink"]'); if (!ub) return { err: 'no unlink button' };
    ub.click(); r.unlinked = grpLinked(rec0.id).length === 1 && F().groups.length === 1 && F().groups[0].vars.length === 2;
    return r;
  })()`);
  if (info.err) throw new Error(info.err);
  const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  if (!info.linked || info.vars !== 2 || info.idx !== 1 || !info.labels) throw new Error('link did not align the layouts: ' + JSON.stringify(info));
  if (!eq(info.first, [100, 100, 0, 0])) throw new Error('switching to layout 1 did not move both floors: ' + info.first);
  if (!eq(info.second, [500, 700, 1, 1])) throw new Error('cycling on the ground floor did not move the upper floor: ' + info.second);
  if (!eq(info.undone, [100, 100])) throw new Error('undo did not restore both floors: ' + info.undone);
  if (!info.info || !info.unlinked) throw new Error('linked-floor info / unlink failed: ' + JSON.stringify(info));
  return 'two floors switch together, undo restores both, unlink keeps the layouts';
});

check('realistic look: physically based materials, same render in dark and light theme, nothing leaks (#87)', async page => {
  const info = await page.evaluate(`(async () => {
    const theme0 = document.documentElement.dataset.theme;
    loadProject(newProject());
    addRectWalls(0, 0, 600, 400);
    const f = F(), a = autoRoomAt({ x: 300, y: 200 }, true); if (a) a.floor = 'wood';
    f.furn.push(mkFurn(BYID.sofa3, 300, 120), mkFurn(BYID.wc, 480, 300)); sel = []; commit(); refresh();
    if (ui.live3d) setLive3D(false);
    const lum = url => new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 64, 48); const d = g.getImageData(0, 0, 64, 48).data; let t = 0; for (let i = 0; i < d.length; i += 4) t += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; res(t / (d.length / 4)); }; im.onerror = () => res(-1); im.src = url; });
    const shot = () => render3DHQ({ style: 'realistic', backdrop: 'sky', sun: { az: 215, alt: 42 }, longSide: 480, supersample: 1, frames: 1, format: 'jpeg' });
    const count = () => { let std = 0, dec = 0; T3.scene.traverse(o => { if (o.userData && o.userData.fpDecal) dec++; const ms = Array.isArray(o.material) ? o.material : [o.material]; if (o.isMesh && ms.some(m => m && m.isMeshStandardMaterial)) std++; }); return { std, dec, env: !!T3.scene.environment }; };
    const r = {};
    document.documentElement.dataset.theme = 'light'; show3D(true);
    if (!ui.view3d) return { err: '3D did not open' };
    r.light = await lum(await shot());
    const m0 = { ...T3.r.info.memory };
    await shot(); await shot();
    const m1 = { ...T3.r.info.memory };
    r.leak = [m1.textures - m0.textures, m1.geometries - m0.geometries];
    r.after = count();
    document.documentElement.dataset.theme = 'dark'; build3D(true);
    r.dark = await lum(await shot());
    document.getElementById('b3dLive').click();
    r.live = count(); r.rough = (() => { let wall = null, sofa = null, wc = null; T3.scene.traverse(o => { if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial) return; let p = o, u = {}; while (p && !(u = p.userData || {}).furnId && !u.wallId) p = p.parent; if (!p) return; if (u.wallId && wall == null && !o.material.transparent) wall = o.material.roughness; if (u.furnId) { const t = findAnyFloor(u.furnId).o.type; if (t === 'sofa3') sofa = o.material.roughness; if (t === 'wc') wc = o.material.roughness; } }); return { wall, sofa, wc }; })();
    r.floor = (() => { let ok = false; T3.scene.traverse(o => { const m = o.material; if (o.isMesh && m && m.isMeshStandardMaterial && m.map && m.map.fpKind === 'wood') ok = !!(m.bumpMap && m.roughnessMap && m.map.fpLt); }); return ok; })();
    document.getElementById('b3dLive').click();
    r.off = count();
    document.documentElement.dataset.theme = theme0; show3D(false);
    return r;
  })()`);
  if (info.err) throw new Error(info.err);
  if (!(info.light > 40) || !(info.dark > 40)) throw new Error('realistic render is dark or empty: light ' + info.light + ', dark ' + info.dark);
  if (Math.abs(info.light - info.dark) > 4) throw new Error('dark-theme render differs from light-theme render: ' + info.light.toFixed(1) + ' vs ' + info.dark.toFixed(1));
  if (info.leak[0] > 0 || info.leak[1] > 0) throw new Error('repeated renders leak GPU resources (textures, geometries): ' + info.leak);
  if (info.after.std || info.after.dec || info.after.env) throw new Error('a render left realistic materials / decals / environment in the CAD scene: ' + JSON.stringify(info.after));
  if (!info.live.std || !info.live.dec || !info.live.env) throw new Error('live realistic view has no physical materials / contact shading / reflections: ' + JSON.stringify(info.live));
  const q = info.rough;
  if (!(q.wc < 0.3 && q.sofa > 0.9 && q.wall > 0.85)) throw new Error('surfaces do not get distinct roughness (porcelain, fabric, plaster): ' + JSON.stringify(q));
  if (!info.floor) throw new Error('wood floor has no relief / roughness map or is not the light texture in dark theme');
  if (info.off.std || info.off.dec || info.off.env) throw new Error('turning the live view off left realistic materials behind: ' + JSON.stringify(info.off));
  return 'brightness ' + info.light.toFixed(0) + ' light / ' + info.dark.toFixed(0) + ' dark, ' + info.live.std + ' physical meshes, ' + info.live.dec + ' contact decals';
});

check('detailed models + sub-part surfaces: shared textures, user colour tints, stable GPU memory, live + render (#93)', async page => {
  const info = await page.evaluate(`(async () => {
    loadProject(newProject());
    addRectWalls(0, 0, 900, 600);
    const f = F();
    f.ops.push(mkOp(OPDEF.window2, f.walls[0], 450), mkOp(OPDEF.door, f.walls[2], 300));
    const sofa = mkFurn(BYID.sofa3, 200, 120);
    f.furn.push(sofa, mkFurn(BYID.bed2, 650, 180), mkFurn(BYID.sinkK, 200, 520), mkFurn(BYID.wc, 480, 520), mkFurn(BYID.plant, 60, 60), mkFurn(BYID.rug, 200, 260), mkFurn(BYID.car, 1300, 300, 90), mkFurn(BYID.pool, 1300, 900));
    sel = []; commit(); refresh();
    if (ui.live3d) setLive3D(false);
    show3D(true);
    if (!ui.view3d) return { err: '3D did not open' };
    const tagged = () => { const out = []; T3.scene.traverse(o => { const m = o.isMesh && o.material; if (m && m.userData && m.userData.fk) out.push({ o, m, fk: m.userData.fk }); }); return out; };
    const r = {}, t0 = tagged(), tex = new Map();
    for (const { m } of t0) if (m.map && m.map.fpSurf) { const s = tex.get(m.map.fpSurf) || new Set(); s.add(m.map.uuid); tex.set(m.map.fpSurf, s); }
    r.kinds = [...new Set(t0.map(x => x.fk))]; r.textured = [...tex.keys()]; r.perKind = Math.max(0, ...[...tex.values()].map(s => s.size));
    // user colour tints the textured fabric (material colour), the texture stays shared
    const sofaFabric = () => { let c = null; for (const x of tagged()) { if (c || x.fk !== 'fabric') continue; let p = x.o; while (p && !(p.userData && p.userData.furnId)) p = p.parent; if (p && p.userData.furnId === sofa.id) c = '#' + x.m.color.getHexString() + (x.m.map ? '+map' : ''); } return c; };
    r.c0 = sofaFabric(); sofa.color = '#1d4ed8'; build3D(true); r.c1 = sofaFabric();
    let win = 0; T3.scene.traverse(o => { if (o.userData && o.userData.opId && findAnyFloor(o.userData.opId).o.type === 'window') win = Math.max(win, o.children.length); });
    r.win = win;
    // rebuilds release what they made: GPU texture / geometry counts stay flat
    build3D(true); const m0 = { ...T3.r.info.memory }; build3D(true); build3D(true); const m1 = { ...T3.r.info.memory };
    r.mem = [m1.textures - m0.textures, m1.geometries - m0.geometries];
    // live realistic view: each sub-part gets its own physical values (chrome mirror, rough woven fabric with relief)
    const t1 = tagged();
    document.getElementById('b3dLive').click();
    const pick = k => t1.filter(x => x.fk === k).map(x => x.o.material).filter(m => m && m.isMeshStandardMaterial);
    const chrome = pick('chrome'), fabric = pick('fabric'), ceramic = pick('ceramic');
    r.chrome = chrome.length && chrome.every(m => m.metalness === 1 && m.roughness < 0.2);
    r.fabric = fabric.length && fabric.every(m => m.roughness > 0.9) && fabric.some(m => m.bumpMap);
    r.ceramic = ceramic.length && ceramic.every(m => m.roughness < 0.2 && m.metalness === 0);
    document.getElementById('b3dLive').click();
    r.cadBack = tagged().length > 0;
    const lum = url => new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 48; c.height = 36; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 48, 36); const d = g.getImageData(0, 0, 48, 36).data; let t = 0; for (let i = 0; i < d.length; i += 4) t += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; res(t / (d.length / 4)); }; im.onerror = () => res(-1); im.src = url; });
    r.render = await lum(await render3DHQ({ style: 'realistic', backdrop: 'sky', sun: { az: 215, alt: 42 }, longSide: 360, supersample: 1, frames: 1, format: 'jpeg' }));
    show3D(false);
    return r;
  })()`);
  if (info.err) throw new Error(info.err);
  for (const k of ['wood', 'fabric', 'stone', 'chrome', 'ceramic', 'glass', 'foliage', 'rubber', 'paint', 'water', 'rug']) if (!info.kinds.includes(k)) throw new Error('no sub-part tagged ' + k + ': ' + info.kinds.join(', '));
  for (const k of ['wood', 'fabric', 'stone', 'foliage']) if (!info.textured.includes(k)) throw new Error('no procedural ' + k + ' texture in CAD view: ' + info.textured.join(', '));
  if (info.perKind !== 1) throw new Error('a surface kind uses ' + info.perKind + ' textures instead of one shared texture');
  if (!info.c0 || !info.c1 || info.c0 === info.c1 || !/\+map$/.test(info.c1)) throw new Error('sofa colour does not tint its textured fabric: ' + info.c0 + ' → ' + info.c1);
  if (!(info.win >= 12)) throw new Error('window has no frame / sash / double glazing detail (' + info.win + ' parts)');
  if (info.mem[0] !== 0 || info.mem[1] !== 0) throw new Error('rebuilding the furnished scene leaks GPU resources (textures, geometries): ' + info.mem);
  if (!info.chrome || !info.fabric || !info.ceramic) throw new Error('live realistic view does not give sub-parts their own materials: ' + JSON.stringify({ chrome: info.chrome, fabric: info.fabric, ceramic: info.ceramic }));
  if (!info.cadBack) throw new Error('turning the live view off lost the tagged CAD materials');
  if (!(info.render > 40)) throw new Error('realistic render of the furnished scene is dark or empty: ' + info.render);
  return info.kinds.length + ' surface kinds, ' + info.textured.length + ' shared textures, window ' + info.win + ' parts, render brightness ' + info.render.toFixed(0);
});

check('IFC fidelity: Revit fixtures become catalogue items, rooms are detected, concave outlines survive (#88)', async page => {
  const info = await page.evaluate(`(async () => {
    loadProject(newProject());
    const text = await (await fetch('tests/fixtures/revit-fidelity.ifc')).text();
    const stats = importIfcText(text, 'revit-fidelity.ifc');
    const f = P.floors[0], types = f.furn.map(o => o.type).sort();
    const out = { stats, types, icons: f.furn.filter(o => o.type !== 'shape').every(o => o.icon && BYID[o.type]),
      rooms: f.rooms.length, lslab: (f.slabs.find(x => x.name === 'L Slab') || { pts: [] }).pts.length, voids: f.voids.length,
      mulN: (f.walls.find(w => w.wt === 'curtain') || {}).mulN, sides: f.ops.map(o => o.side + ':' + o.flip).sort().join(' '),
      fin: P.floors[1].rooms.map(r => r.floor).sort().join(','), furn2d: document.querySelectorAll('#gFurn [data-id]').length };
    show3D(true); await new Promise(r => setTimeout(r, 500));
    out.view3d = !!ui.view3d; out.meshes = 0; if (T3 && T3.scene) T3.scene.traverse(o => { if (o.isMesh) out.meshes++; });
    show3D(false);
    return out;
  })()`);
  for (const t of ['basin', 'bed2', 'fridge', 'sofa2', 'wc']) if (!info.types.includes(t)) throw new Error(t + ' was not matched to the catalogue: ' + info.types);
  if (!info.icons) throw new Error('matched items are not real catalogue items');
  if (info.rooms !== 1 || info.stats.roomsDetected !== 1) throw new Error('room not detected on the storey without IfcSpace');
  if (info.lslab !== 6 || info.voids !== 1) throw new Error('concave slab / profile void lost: ' + info.lslab + ' corners, ' + info.voids + ' voids');
  if (info.mulN !== 3 || info.sides !== '-1:0 -1:1 1:1') throw new Error('curtain mullions / door swing wrong: mulN ' + info.mulN + ', doors ' + info.sides);
  if (info.fin !== 'marble,tile,wood') throw new Error('room finishes not imported: ' + info.fin);
  if (!info.view3d || info.meshes < 30) throw new Error('imported model did not build in 3D');
  return info.stats.matched + ' catalogue items, 1 detected room, finishes ' + info.fin + ', 3D ' + info.meshes + ' meshes';
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
  // ?bridge=off: never reach a real mcp/bridge.js on 127.0.0.1:8787 — the checks load
  // test plans, and a connected tab would push them over the user's live AI plan
  const url = `http://127.0.0.1:${port}/?bridge=off`;
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
