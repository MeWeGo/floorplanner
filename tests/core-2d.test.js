/* Core 2D subsystems: history (commit / undo / redo / restore), starter templates
   (TEMPLATES / tplCtx / mk* builders), and project tabs (syncTab / activateTab /
   tabsState / restoreTabs). Runs real functions cut out of app.js in sandboxes. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, constLineOf, markerBlock, matchBracket } = require('./helpers/repo');

const src = read('app.js');
const fnSrc = name => fnSrcOf(src, name);
const constSrc = name => constLineOf(src, name);

function arrayDecl(name) {
  const m = new RegExp(`(^|\\n)[ \\t]*const\\s+${name}\\s*=\\s*\\[`).exec(src);
  if (!m) throw new Error('const ' + name + ' missing');
  const open = m.index + m[0].length - 1;
  return src.slice(m.index + m[1].length, matchBracket(src, open) + 1) + ';';
}

/* ---------- (1) History: commit / undo / redo / restore ---------- */
function makeHistorySandbox(initialP) {
  const counts = { autosave: 0, updateUndo: 0, refresh: 0, syncGridUI: 0, buildLib: 0 };
  const pnameEl = { value: '' };
  const collab = { applying: false, room: null };
  let readOnly = false;
  let P = JSON.parse(JSON.stringify(initialP));
  let fi = 0;
  let sel = [];
  let hist = [JSON.stringify(P)];
  let hi = 0;
  const ui = { view3d: false, modal: null };

  const api = new Function(
    'getP', 'setP', 'getFi', 'setFi', 'getSel', 'setSel',
    'getHist', 'setHist', 'getHi', 'setHi',
    'ui', 'collab', 'isReadOnly', 'pnameEl', 'counts',
    `
    let P = getP(), fi = getFi(), sel = getSel(), hist = getHist(), hi = getHi();
    const syncState = () => { setP(P); setFi(fi); setSel(sel); setHist(hist); setHi(hi); };
    const pullState = () => { P = getP(); fi = getFi(); sel = getSel(); hist = getHist(); hi = getHi(); };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const $ = id => (id === '#pname' ? pnameEl : null);
    ${constSrc('F')}
    ${constSrc('KINDS')}
    ${fnSrc('find')}
    const collabReadOnly = () => isReadOnly();
    const syncAccWalls = () => false;
    const stampLayers = () => {};
    const isParamRoof = () => false;
    const roofHeight = () => 0;
    const syncStairVoids = () => {};
    const syncCeilMounts = () => {};
    const followRooms = () => {}, wallSigReset = () => {}; // #201: own smoke check
    const autosave = () => { counts.autosave++; };
    const updateUndo = () => { counts.updateUndo++; };
    const fp3DOn = () => false;
    const schedBuild3D = () => {};
    const syncGridUI = () => { counts.syncGridUI++; };
    const refresh = () => { counts.refresh++; };
    const buildLib = () => { counts.buildLib++; };
    const T3 = null;
    const archRedraw = () => {};
    const archRenderProps = () => {};

    let saveTimer = null;
    let terrRev = 0;
    ${fnSrc('commit')}
    ${fnSrc('restore')}
    ${fnSrc('undo')}
    ${fnSrc('redo')}

    return {
      commit() { pullState(); const r = commit(); syncState(); return r; },
      restore(s) { pullState(); const r = restore(s); syncState(); return r; },
      undo() { pullState(); const r = undo(); syncState(); return r; },
      redo() { pullState(); const r = redo(); syncState(); return r; },
      getTerrRev: () => terrRev,
    };
    `
  )(
    () => P, v => { P = v; },
    () => fi, v => { fi = v; },
    () => sel, v => { sel = v; },
    () => hist, v => { hist = v; },
    () => hi, v => { hi = v; },
    ui, collab, () => readOnly, pnameEl, counts
  );

  return {
    ...api,
    counts,
    pnameEl,
    collab,
    setReadOnly(v) { readOnly = v; },
    get P() { return P; },
    set P(v) { P = v; },
    get fi() { return fi; },
    set fi(v) { fi = v; },
    get sel() { return sel; },
    set sel(v) { sel = v; },
    get hist() { return hist; },
    get hi() { return hi; },
  };
}

test('history (1): commit pushes JSON snapshots, skips duplicates, and undo/redo round-trips', () => {
  const base = {
    v: 2, name: 'Plan', grid: 10, gridType: 'square', wallT: 20, wallH: 270,
    floors: [{ id: 'f0', name: 'Ground', walls: [], ops: [], furn: [], rooms: [], slabs: [], voids: [], zones: [], sections: [], axes: [], dims: [], texts: [], sketches: [], drafts: [] }],
  };
  const sb = makeHistorySandbox(base);
  assert.strictEqual(sb.hist.length, 1);
  assert.strictEqual(typeof sb.hist[0], 'string');

  // Duplicate commit with no change is ignored
  sb.commit();
  assert.strictEqual(sb.hist.length, 1);
  assert.strictEqual(sb.hi, 0);
  assert.strictEqual(sb.counts.autosave, 0);

  // Add a wall and commit
  sb.P.floors[0].walls.push({ id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20, h: 270 });
  sb.sel = ['w1'];
  sb.commit();
  assert.strictEqual(sb.hist.length, 2);
  assert.strictEqual(sb.hi, 1);
  assert.strictEqual(typeof sb.hist[1], 'string');
  assert.strictEqual(JSON.parse(sb.hist[1]).floors[0].walls.length, 1);
  assert.strictEqual(sb.counts.autosave, 1);
  assert.strictEqual(sb.counts.updateUndo, 1);

  // Add a second floor and switch to it
  sb.P.floors.push({ id: 'f1', name: 'Upper', walls: [], ops: [], furn: [], rooms: [], slabs: [], voids: [], zones: [], sections: [], axes: [], dims: [], texts: [], sketches: [], drafts: [] });
  sb.fi = 1;
  sb.commit();
  const stateBeforeUndo = JSON.stringify(sb.P);
  assert.strictEqual(sb.hist.length, 3);
  assert.strictEqual(sb.hi, 2);

  // Undo step 1: back to 1 floor, fi clamped to 0, sel still keeps 'w1'
  sb.undo();
  assert.strictEqual(sb.hi, 1);
  assert.strictEqual(sb.P.floors.length, 1);
  assert.strictEqual(sb.fi, 0);
  assert.deepStrictEqual(sb.sel, ['w1']);
  assert.strictEqual(sb.pnameEl.value, 'Plan');

  // Undo step 2: back to 0 walls, sel drops missing 'w1' via find()
  sb.undo();
  assert.strictEqual(sb.hi, 0);
  assert.strictEqual(sb.P.floors[0].walls.length, 0);
  assert.deepStrictEqual(sb.sel, []);

  // Undo at start is a no-op
  const autosaveAtZero = sb.counts.autosave;
  sb.undo();
  assert.strictEqual(sb.hi, 0);
  assert.strictEqual(sb.counts.autosave, autosaveAtZero);

  // Redo twice restores the exact state before undo
  sb.redo();
  sb.redo();
  assert.strictEqual(sb.hi, 2);
  assert.strictEqual(JSON.stringify(sb.P), stateBeforeUndo);

  // Redo at end is a no-op
  const autosaveAtEnd = sb.counts.autosave;
  sb.redo();
  assert.strictEqual(sb.hi, 2);
  assert.strictEqual(sb.counts.autosave, autosaveAtEnd);
});

test('history (2): new commit after undo drops the redo branch', () => {
  const base = {
    v: 2, name: 'Branch', grid: 10, gridType: 'square',
    floors: [{ id: 'f0', walls: [], ops: [], furn: [], rooms: [], slabs: [], voids: [], zones: [], sections: [], axes: [], dims: [], texts: [], sketches: [], drafts: [] }],
  };
  const sb = makeHistorySandbox(base);
  sb.P.name = 'Step 1'; sb.commit();
  sb.P.name = 'Step 2'; sb.commit();
  sb.P.name = 'Step 3'; sb.commit();
  assert.strictEqual(sb.hist.length, 4);

  sb.undo();
  sb.undo();
  assert.strictEqual(sb.hi, 1);
  assert.strictEqual(sb.P.name, 'Step 1');

  sb.P.name = 'Fork';
  sb.commit();
  assert.strictEqual(sb.hist.length, 3);
  assert.strictEqual(sb.hi, 2);
  assert.strictEqual(sb.P.name, 'Fork');

  // Redo cannot return to Step 2 / Step 3
  sb.redo();
  assert.strictEqual(sb.hi, 2);
  assert.strictEqual(sb.P.name, 'Fork');

  sb.undo();
  assert.strictEqual(sb.P.name, 'Step 1');
});

test('history (3): snapshot stack is capped at 150 entries', () => {
  const commitSrc = fnSrc('commit');
  const capMatch = /hist\.length\s*>\s*(\d+)/.exec(commitSrc);
  assert.ok(capMatch, 'commit() should declare a history cap');
  const cap = Number(capMatch[1]);
  assert.strictEqual(cap, 150);

  const base = {
    v: 2, name: 'S0', grid: 10, gridType: 'square',
    floors: [{ id: 'f0', walls: [], ops: [], furn: [], rooms: [], slabs: [], voids: [], zones: [], sections: [], axes: [], dims: [], texts: [], sketches: [], drafts: [] }],
  };
  const sb = makeHistorySandbox(base);

  for (let i = 1; i <= cap + 15; i++) {
    sb.P.name = 'S' + i;
    sb.commit();
  }

  assert.strictEqual(sb.hist.length, cap);
  assert.strictEqual(sb.hi, cap - 1);
  // Oldest 16 states (S0..S15) shifted off; S16 is now index 0, S165 is index 149
  assert.strictEqual(JSON.parse(sb.hist[0]).name, 'S16');
  assert.strictEqual(JSON.parse(sb.hist[cap - 1]).name, 'S' + (cap + 15));

  for (let i = 0; i < cap - 1; i++) sb.undo();
  assert.strictEqual(sb.hi, 0);
  assert.strictEqual(sb.P.name, 'S16');
});

test('history (4): commit skips pushing when collab.applying or collabReadOnly is active', () => {
  const base = {
    v: 2, name: 'Collab', grid: 10,
    floors: [{ id: 'f0', walls: [], ops: [], furn: [], rooms: [], slabs: [], voids: [], zones: [], sections: [], axes: [], dims: [], texts: [], sketches: [], drafts: [] }],
  };
  const sb = makeHistorySandbox(base);
  sb.collab.applying = true;
  sb.P.name = 'Remote';
  sb.commit();
  assert.strictEqual(sb.hist.length, 1);

  sb.collab.applying = false;
  sb.setReadOnly(true);
  sb.P.name = 'Viewer';
  sb.commit();
  assert.strictEqual(sb.hist.length, 1);
});

/* ---------- (2) Templates: TEMPLATES, tplCtx, newProject / newFloor / mk* ---------- */
function makeTemplateSandbox() {
  let nextId = 1;
  const toasts = [];
  const api = new Function('nextIdFn', 'toasts', `
    let lang = 'en';
    const uid = () => 'id' + String(nextIdFn()).padStart(5, '0');
    const pid = () => uid() + uid();
    const L = (tr, en) => (lang === 'en' ? en : tr);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const toast = m => { toasts.push(m); };

    ${constSrc('itemName')}
    ${arrayDecl('CAT_DEFS')}
    ${constSrc('CATALOG')}
    ${constSrc('BYID')}
    ${constSrc('CAT_ELEV')}
    ${markerBlock(src, 'LIGHT-PARAM')}
    ${markerBlock(src, 'PARTS-ENGINE')}
    ${fnSrc('billiardParts')}
    ${constSrc('CAT_PARTS')}
    ${arrayDecl('OPENINGS')}
    ${constSrc('OPDEF')}
    ${constSrc('ROOMCOL')}
    ${constSrc('newFloor')}
    ${constSrc('newProject')}

    let P = newProject();
    let fi = 0;
    ${constSrc('F')}
    ${constSrc('wLen')}
    ${constSrc('floorH')}
    ${constSrc('curFloorH')}
    const roofDefaults = o => o;

    // Minimal canvas-free stub: detectRoom relies on HTML5 <canvas> in the browser.
    // Returning a valid 4-point room around p lets the real autoRoomAt() and mkRoom() run.
    const detectRoom = p => [
      { x: p.x - 50, y: p.y - 50 },
      { x: p.x + 50, y: p.y - 50 },
      { x: p.x + 50, y: p.y + 50 },
      { x: p.x - 50, y: p.y + 50 },
    ];

    ${fnSrc('mkWall')}
    ${fnSrc('opType')}
    ${fnSrc('mkOp')}
    ${fnSrc('mkFurn')}
    ${fnSrc('mkRoom')}
    ${fnSrc('addRectWalls')}
    ${fnSrc('autoRoomAt')}
    ${fnSrc('tplCtx')}
    ${arrayDecl('TEMPLATES')}

    return {
      CAT_DEFS, CATALOG, BYID, CAT_ELEV, OPENINGS, OPDEF, TEMPLATES,
      newFloor, newProject,
      mkWall, mkOp, mkFurn, mkRoom, addRectWalls, autoRoomAt, tplCtx, wLen,
      get P() { return P; },
      set P(v) { P = v; },
      get fi() { return fi; },
      set fi(v) { fi = v; },
      toasts,
    };
  `)(() => nextId++, toasts);
  return api;
}

test('templates (1): every template builds cleanly against newProject/newFloor and real mk* helpers', () => {
  const sb = makeTemplateSandbox();
  assert.ok(sb.TEMPLATES.length >= 4, 'expected blank + starter templates');

  const catalogIds = new Set(sb.CAT_DEFS.map(d => d[0]));
  assert.strictEqual(catalogIds.size, sb.CATALOG.length);

  for (let i = 0; i < sb.TEMPLATES.length; i++) {
    const tpl = sb.TEMPLATES[i];
    sb.P = sb.newProject();
    sb.fi = 0;
    assert.strictEqual(sb.P.v, 2);
    assert.strictEqual(sb.P.floors.length, 1);

    tpl.build();
    const f = sb.P.floors[0];

    if (i === 0) {
      assert.strictEqual(f.walls.length, 0, 'blank template should have no walls');
      assert.strictEqual(f.rooms.length, 0, 'blank template should have no rooms');
      assert.strictEqual(f.ops.length, 0, 'blank template should have no openings');
      assert.strictEqual(f.furn.length, 0, 'blank template should have no furniture');
      continue;
    }

    assert.ok(f.walls.length > 0, `template ${i} (${tpl.en}) produced no walls`);
    const wallById = new Map(f.walls.map(w => [w.id, w]));
    for (const w of f.walls) {
      assert.ok(w.id, 'wall missing id');
      assert.ok(sb.wLen(w) > 0, `wall ${w.id} has zero length`);
      assert.ok(w.t > 0 && w.h > 0, `wall ${w.id} has invalid dimensions`);
    }

    assert.ok(f.rooms.length > 0, `template ${i} (${tpl.en}) produced no rooms`);
    for (const r of f.rooms) {
      assert.ok(Array.isArray(r.pts) && r.pts.length >= 3, `room ${r.name} needs >= 3 points`);
      assert.ok(r.name && r.name.length > 0, 'room missing name');
    }

    assert.ok(f.ops.length > 0, `template ${i} (${tpl.en}) produced no openings`);
    for (const op of f.ops) {
      const host = wallById.get(op.wall);
      assert.ok(host, `opening ${op.id} references missing wall ${op.wall}`);
      const L = sb.wLen(host);
      assert.ok(op.d >= 0 && op.d <= L, `opening ${op.id} d=${op.d} outside wall length ${L}`);
      if (L >= op.w) {
        assert.ok(op.d >= op.w / 2 - 1e-6 && op.d <= L - op.w / 2 + 1e-6, `opening ${op.id} extends past wall ends`);
      }
    }

    assert.ok(f.furn.length > 0, `template ${i} (${tpl.en}) produced no furniture`);
    for (const item of f.furn) {
      assert.ok(catalogIds.has(item.type), `furniture ${item.type} missing from CATALOG / CAT_DEFS`);
      assert.ok(Number.isFinite(item.x) && Number.isFinite(item.y), `furniture ${item.type} has non-finite coords`);
      assert.ok(item.w > 0 && item.d > 0 && item.h > 0, `furniture ${item.type} has non-positive size`);
    }
  }
});

test('templates (2): real mk* helpers enforce invariants (rect walls, opening clamping, item elevation)', () => {
  const sb = makeTemplateSandbox();
  sb.P = sb.newProject();
  sb.fi = 0;

  const ws = sb.addRectWalls(100, 200, 500, 450);
  assert.strictEqual(ws.length, 4);
  assert.strictEqual(sb.P.floors[0].walls.length, 4);

  // mkOp clamps d so the opening stays within [w/2, L - w/2]
  const opLow = sb.mkOp(sb.OPDEF.door, ws[0], 5);
  assert.strictEqual(opLow.d, sb.OPDEF.door.w / 2);
  const opHigh = sb.mkOp(sb.OPDEF.door, ws[0], 9999);
  assert.strictEqual(opHigh.d, sb.wLen(ws[0]) - sb.OPDEF.door.w / 2);

  // mkFurn applies CAT_ELEV and ceiling mounting automatically
  const tvWall = sb.mkFurn(sb.BYID.tvw, 200, 200, 90);
  assert.strictEqual(tvWall.elev, sb.CAT_ELEV.tvw);
  const ceilLamp = sb.mkFurn(sb.BYID.lampCeil, 250, 300, 0);
  assert.strictEqual(ceilLamp.mount, 'ceil');
  assert.strictEqual(ceilLamp.elev, 270 - sb.BYID.lampCeil.h);
});

/* ---------- (3) Tabs: tabsState / restoreTabs / syncTab / activateTab ---------- */
function makeTabsSandbox() {
  let nextId = 1;
  const counts = { renderTabs: 0, refresh: 0, updateUndo: 0, autosave: 0, buildLib: 0, fit: 0, syncGridUI: 0 };
  const pnameEl = { value: '' };

  const api = new Function('nextIdFn', 'pnameEl', 'counts', `
    const L = (tr, en) => en;
    const uid = () => 't' + nextIdFn();
    const pid = () => uid() + uid();
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const $ = id => (id === '#pname' ? pnameEl : null);
    ${constSrc('newFloor')}
    ${constSrc('newProject')}
    let P = newProject();
    let fi = 0;
    let hist = [JSON.stringify(P)];
    let hi = 0;
    const view = { x: 0, y: 0, z: 0.5 };
    let tool = 'select', sel = [], placing = null;
    const ui = { draw: null, typed: '', dimStart: null, polyPts: null, calib: null, drag: null, pen: null, viewElev: false, view3d: false };
    const T3 = null;
    let tabs = [], tabIdx = 0;

    ${constSrc('F')}
    ${constSrc('KINDS')}
    ${constSrc('floorH')}
    ${constSrc('curFloorH')}
    ${fnSrc('find')}
    ${fnSrc('mkWall')}
    ${fnSrc('addRectWalls')}

    const normalizeProject = p => p;
    const ensureTextures = () => {};
    const syncGridUI = () => { counts.syncGridUI++; };
    const fit = () => { counts.fit++; view.x = 12; view.y = 34; view.z = 0.75; };
    const setTool = t => { tool = t; };
    const refresh = () => { counts.refresh++; };
    const updateUndo = () => { counts.updateUndo++; };
    const wallSigReset = () => {}; // #201
    const renderTabs = () => { counts.renderTabs++; };
    const autosave = () => { counts.autosave++; };
    const buildLib = () => { counts.buildLib++; };

    ${constSrc('tabSnapshot')}
    ${fnSrc('syncTab')}
    ${fnSrc('isPristine')}
    ${fnSrc('newTabSlot')}
    ${fnSrc('activateTab')}
    ${fnSrc('switchTab')}
    ${fnSrc('tabsState')}
    ${fnSrc('restoreTabs')}

    return {
      newProject, newFloor, addRectWalls, mkWall,
      syncTab, isPristine, newTabSlot, activateTab, switchTab, tabsState, restoreTabs,
      get P() { return P; }, set P(v) { P = v; },
      get fi() { return fi; }, set fi(v) { fi = v; },
      get hist() { return hist; }, set hist(v) { hist = v; },
      get hi() { return hi; }, set hi(v) { hi = v; },
      get sel() { return sel; }, set sel(v) { sel = v; },
      get tool() { return tool; }, set tool(v) { tool = v; },
      get placing() { return placing; }, set placing(v) { placing = v; },
      get tabs() { return tabs; }, set tabs(v) { tabs = v; },
      get tabIdx() { return tabIdx; }, set tabIdx(v) { tabIdx = v; },
      view, ui, pnameEl, counts,
    };
  `)(() => nextId++, pnameEl, counts);

  return api;
}

test('tabs (1): syncTab, newTabSlot, switchTab, and activateTab isolate project state per tab', () => {
  const sb = makeTabsSandbox();

  // Pristine project: newTabSlot keeps the single empty slot
  assert.strictEqual(sb.isPristine(sb.P), true);
  sb.newTabSlot();
  assert.strictEqual(sb.tabs.length, 0);

  // Populate Tab 0
  sb.P.name = 'House A';
  const wsA = sb.addRectWalls(0, 0, 500, 400);
  sb.hist = [JSON.stringify(sb.P)];
  sb.hi = 0;
  sb.sel = [wsA[0].id, 'missing_id'];
  sb.view.x = 111; sb.view.y = 222; sb.view.z = 1.25;
  assert.strictEqual(sb.isPristine(sb.P), false);

  sb.syncTab();
  assert.strictEqual(sb.tabs.length, 1);
  assert.strictEqual(sb.tabs[0].P.name, 'House A');
  assert.deepStrictEqual(sb.tabs[0].view, { x: 111, y: 222, z: 1.25 });
  // Returned snapshot clones view and sel
  sb.view.x = 999;
  assert.strictEqual(sb.tabs[0].view.x, 111);
  sb.view.x = 111;

  // Open a new tab slot for Tab 1 (syncTab inside newTabSlot saves current view x=111)
  sb.newTabSlot();
  assert.strictEqual(sb.tabs.length, 2);
  assert.strictEqual(sb.tabIdx, 1);

  // Populate Tab 1 with its own plan, floor, and history
  const pB = sb.newProject();
  pB.name = 'Office B';
  pB.floors.push(sb.newFloor('Floor 2'));
  sb.P = pB;
  sb.fi = 1;
  sb.addRectWalls(0, 0, 800, 600);
  sb.hist = [JSON.stringify(sb.P), JSON.stringify({ ...sb.P, name: 'Office B v2' })];
  sb.hi = 1;
  sb.sel = [];
  sb.view.x = -50; sb.view.y = -60; sb.view.z = 0.4;
  sb.ui.draw = { start: { x: 0, y: 0 } };
  sb.tool = 'place';
  sb.placing = { id: 'sofa3' };
  sb.syncTab();

  // Switch back to Tab 0 -> transient ui cleared, tool reset, stale sel dropped, view & history restored
  sb.switchTab(0);
  assert.strictEqual(sb.tabIdx, 0);
  assert.strictEqual(sb.P.name, 'House A');
  assert.strictEqual(sb.fi, 0);
  assert.strictEqual(sb.hi, 0);
  assert.deepStrictEqual(sb.sel, [wsA[0].id]);
  assert.deepStrictEqual(sb.view, { x: 111, y: 222, z: 1.25 });
  assert.strictEqual(sb.pnameEl.value, 'House A');
  assert.strictEqual(sb.ui.draw, null);
  assert.strictEqual(sb.placing, null);
  assert.strictEqual(sb.tool, 'select');

  // Switch to Tab 1 -> restores Floor 2 and history index 1
  sb.switchTab(1);
  assert.strictEqual(sb.tabIdx, 1);
  assert.strictEqual(sb.P.name, 'Office B');
  assert.strictEqual(sb.fi, 1);
  assert.strictEqual(sb.hi, 1);
  assert.strictEqual(sb.P.floors[1].walls.length, 4);

  // Calling activateTab on an entry with null view invokes fit()
  sb.tabs[0].view = null;
  sb.activateTab(0);
  assert.strictEqual(sb.counts.fit, 1);
  assert.deepStrictEqual(sb.view, { x: 12, y: 34, z: 0.75 });
});

test('tabs (2): tabsState serializes multi-tab projects and restoreTabs recovers them', () => {
  const sb = makeTabsSandbox();

  // Single tab: tabsState omits tabs array
  sb.syncTab();
  assert.deepStrictEqual(sb.tabsState(), { active: 0, tabs: [] });

  // Multi-tab: tabsState clones each project and uses live P for tabIdx
  sb.P.name = 'Alpha';
  sb.addRectWalls(0, 0, 300, 200);
  sb.newTabSlot();
  const pBeta = sb.newProject();
  pBeta.name = 'Beta';
  sb.P = pBeta;
  sb.syncTab();
  sb.P.name = 'Beta Live'; // mutated after syncTab; tabsState must read live P for tabIdx=1

  const saved = sb.tabsState();
  assert.strictEqual(saved.active, 1);
  assert.strictEqual(saved.tabs.length, 2);
  assert.strictEqual(saved.tabs[0].P.name, 'Alpha');
  assert.strictEqual(saved.tabs[1].P.name, 'Beta Live');

  // Mutating saved output does not mutate live P
  saved.tabs[1].P.name = 'Mutated';
  assert.strictEqual(sb.P.name, 'Beta Live');

  // Restore into a fresh sandbox where active tab has live 'auto' state
  const sb2 = makeTabsSandbox();
  sb2.P.name = 'Live Auto';
  sb2.hist = [JSON.stringify(sb2.P), '{"v":2,"name":"Extra"}'];
  sb2.hi = 1;
  sb2.restoreTabs({
    active: 1,
    tabs: [
      { id: 'tabA', P: saved.tabs[0].P },
      { id: 'tabB', P: { ...pBeta, name: 'Stale Saved' } },
      { id: 'bad', P: null }, // malformed entry filtered out
    ],
  });
  assert.strictEqual(sb2.tabs.length, 2);
  assert.strictEqual(sb2.tabIdx, 1);
  assert.strictEqual(sb2.tabs[0].P.name, 'Alpha');
  // Active tab preserves live snapshot ('Live Auto' + 2-step hist)
  assert.strictEqual(sb2.tabs[1].P.name, 'Live Auto');
  assert.strictEqual(sb2.tabs[1].hi, 1);

  // Invalid / single-tab payloads are ignored
  const beforeLen = sb2.tabs.length;
  sb2.restoreTabs(null);
  sb2.restoreTabs({ active: 0, tabs: [{ id: 'only1', P: pBeta }] });
  assert.strictEqual(sb2.tabs.length, beforeLen);
});
