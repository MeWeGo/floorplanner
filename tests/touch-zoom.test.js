/* Touch pinch-to-zoom and two-finger pan (issue #80).
   The real zoomAt(), cancelTouchSingle(), endTouch(), and cv pointer listeners are cut out of app.js and exercised. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');
const css = read('style.css');

function sliceFunc(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found in app.js`);
  const end = src.indexOf('\n}', start) + 2;
  return src.slice(start, end);
}

function makeHarness(initialTool = 'select') {
  const blockStart = src.indexOf('// Dokunmatik iki parmakla yakınlaştırma ve kaydırma (#80)');
  const blockEnd = src.indexOf('/* ---------- Taşıma ---------- */');
  assert.ok(blockStart >= 0 && blockEnd > blockStart, 'touch pointer block not found in app.js');
  const pointerBlock = src.slice(blockStart, blockEnd);

  const listeners = {};
  const cv = {
    style: { cursor: '' },
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }),
    addEventListener(type, fn) { listeners[type] = fn; }
  };
  const state = {
    P: { v: 2, wallT: 20, grid: 10, floors: [{ id: 'f1', walls: [{ id: 'w1', a: { x: 100, y: 100 }, b: { x: 400, y: 100 }, t: 20, h: 270 }], ops: [], furn: [{ id: 'fn1', x: 200, y: 200, rot: 0, w: 80, d: 80, h: 80 }], rooms: [], slabs: [], voids: [], dims: [], texts: [], sketches: [] }] },
    hist: [],
    hi: 0,
    view: { x: 100, y: 50, z: 1 },
    tool: initialTool,
    sel: ['fn1'],
    ui: { raw: { x: 200, y: 200 }, cur: { x: 200, y: 200 }, drag: null, pen: null, draw: null, polyPts: null, dimStart: null, secStart: null, mAxis: null, calib: null, btn: initialTool, space: false, snap: true }
  };
  state.hist.push(JSON.stringify(state.P));

  const fn = new Function('cv', 'state', `
    const MIN_ZOOM = 0.002, MAX_ZOOM = 8;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    let P = state.P, hist = state.hist, hi = state.hi, view = state.view, tool = state.tool, sel = state.sel, ui = state.ui;
    const F = () => P.floors[0];
    const selObjs = () => {
      const out = [];
      for (const id of sel) {
        const w = F().walls.find(x => x.id === id); if (w) out.push({ kind: 'wall', o: w });
        const fn = F().furn.find(x => x.id === id); if (fn) out.push({ kind: 'furn', o: fn });
      }
      return out;
    };
    const scheduleRender = () => {};
    const render = () => {};
    const refresh = () => {};
    const renderProps = () => {};
    const updateTools = () => {};
    const updateUndo = () => {};
    const autosave = () => {};
    const updateGhost = () => {};
    const drawPreview = () => {};
    const setCursor = e => { ui.raw = { x: (e.clientX - view.x) / view.z, y: (e.clientY - view.y) / view.z }; ui.cur = { ...ui.raw }; };
    const commit = () => { hist = hist.slice(0, hi + 1); hist.push(JSON.stringify(P)); hi = hist.length - 1; };
    const grpEditing = () => false;
    const find = id => selObjs().find(x => x.o.id === id);
    const toolWall = (a, b) => ({ id: 'w_new', a: { ...a }, b: { ...b }, t: 20, h: 270 });
    const pickDataId = e => e.target && e.target.dataset && e.target.dataset.id ? e.target : null;
    const startMove = raw => {
      const orig = new Map();
      for (const { o } of selObjs()) orig.set(o.id, JSON.parse(JSON.stringify(o)));
      ui.drag = { type: 'move', start: raw, orig, conn: [], roomInner: [], anchor: raw, moved: false };
    };
    const doMove = raw => {
      const d = ui.drag; d.moved = true;
      const dx = raw.x - d.start.x, dy = raw.y - d.start.y;
      for (const { o } of selObjs()) { const g = d.orig.get(o.id); o.x = g.x + dx; o.y = g.y + dy; }
    };
    ${sliceFunc('zoomAt')}
    ${pointerBlock}
    return {
      get P() { return P; },
      get hi() { return hi; },
      get view() { return view; },
      get sel() { return sel; },
      get ui() { return ui; },
      get tool() { return tool; },
      set tool(v) { tool = v; ui.btn = v; }
    };
  `);
  const runtime = fn(cv, state);
  return { runtime, listeners };
}

function touchEv(pointerId, clientX, clientY, targetId = null) {
  return {
    pointerId,
    pointerType: 'touch',
    button: 0,
    clientX,
    clientY,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    preventDefault() {},
    target: {
      dataset: targetId ? { id: targetId } : {},
      closest(sel) {
        if (sel === '[data-id]' && targetId) return this;
        return null;
      }
    }
  };
}

test('(1) two-finger pinch zooms around the midpoint and pans with two-finger movement', () => {
  const { runtime, listeners } = makeHarness('select');
  // Finger 1 at (300, 300), Finger 2 at (500, 300) -> midpoint (400, 300), distance = 200
  listeners.pointerdown(touchEv(1, 300, 300));
  listeners.pointerdown(touchEv(2, 500, 300));

  // World coordinate under midpoint (400, 300) before zoom:
  const wxBefore = (400 - runtime.view.x) / runtime.view.z;
  const wyBefore = (300 - runtime.view.y) / runtime.view.z;

  // Spread fingers to (200, 300) and (600, 300) -> midpoint still (400, 300), distance = 400 (2x zoom)
  listeners.pointermove(touchEv(1, 200, 300));
  listeners.pointermove(touchEv(2, 600, 300));

  assert.ok(Math.abs(runtime.view.z - 2) < 1e-6, `expected zoom 2, got ${runtime.view.z}`);
  const wxAfter = (400 - runtime.view.x) / runtime.view.z;
  const wyAfter = (300 - runtime.view.y) / runtime.view.z;
  assert.ok(Math.abs(wxAfter - wxBefore) < 1e-6, 'world X under pinch midpoint stays anchored');
  assert.ok(Math.abs(wyAfter - wyBefore) < 1e-6, 'world Y under pinch midpoint stays anchored');

  // Now pan both fingers +50 px in X and +30 px in Y without changing distance (400 px)
  const vxBeforePan = runtime.view.x, vyBeforePan = runtime.view.y;
  listeners.pointermove(touchEv(1, 250, 330));
  listeners.pointermove(touchEv(2, 650, 330));
  assert.ok(Math.abs(runtime.view.x - (vxBeforePan + 50)) < 1e-6, 'two-finger pan shifts view.x by midpoint delta');
  assert.ok(Math.abs(runtime.view.y - (vyBeforePan + 30)) < 1e-6, 'two-finger pan shifts view.y by midpoint delta');
});

test('(2) second finger cancels in-progress single-finger furniture drag or wall draw', () => {
  const { runtime, listeners } = makeHarness('select');
  // Finger 1 touches down on furniture fn1 and drags it
  listeners.pointerdown(touchEv(1, 300, 250, 'fn1'));
  listeners.pointermove(touchEv(1, 380, 320, 'fn1'));
  assert.strictEqual(runtime.ui.drag?.type, 'move');
  assert.notStrictEqual(runtime.P.floors[0].furn[0].x, 200, 'furniture moved during single-finger drag');

  // Finger 2 touches down -> cancels single-finger move and restores furniture to (200, 200)
  listeners.pointerdown(touchEv(2, 500, 320));
  assert.strictEqual(runtime.ui.drag, null, 'ui.drag cleared when second finger touches down');
  assert.strictEqual(runtime.P.floors[0].furn[0].x, 200, 'furniture X restored');
  assert.strictEqual(runtime.P.floors[0].furn[0].y, 200, 'furniture Y restored');

  listeners.pointerup(touchEv(1, 380, 320));
  listeners.pointerup(touchEv(2, 500, 320));

  // Switch to wall tool: Finger 1 starts a wall draw, Finger 2 cancels it
  runtime.tool = 'wall';
  listeners.pointerdown(touchEv(1, 200, 200));
  assert.ok(runtime.ui.draw, 'first finger started wall draw');
  listeners.pointerdown(touchEv(2, 400, 200));
  assert.strictEqual(runtime.ui.draw, null, 'second finger cancelled accidental wall draw start');
});

test('(3) lifting one finger after a pinch does not jump or trigger single-finger actions', () => {
  const { runtime, listeners } = makeHarness('select');
  listeners.pointerdown(touchEv(1, 300, 300));
  listeners.pointerdown(touchEv(2, 500, 300));
  listeners.pointermove(touchEv(1, 250, 300));
  listeners.pointermove(touchEv(2, 550, 300));

  const zAfterPinch = runtime.view.z;
  const vxAfterPinch = runtime.view.x;
  const vyAfterPinch = runtime.view.y;

  // Lift finger 2, move remaining finger 1, then lift finger 1
  listeners.pointerup(touchEv(2, 550, 300));
  listeners.pointermove(touchEv(1, 350, 360));
  assert.strictEqual(runtime.view.z, zAfterPinch, 'zoom unchanged when moving remaining finger after pinch');
  assert.strictEqual(runtime.view.x, vxAfterPinch, 'view.x unchanged when moving remaining finger after pinch');
  assert.strictEqual(runtime.view.y, vyAfterPinch, 'view.y unchanged when moving remaining finger after pinch');
  listeners.pointerup(touchEv(1, 350, 360));
});

test('(4) 3D viewport has touch-action: none and registers touch listeners', () => {
  assert.match(css, /#v3d\s*\{[^}]*touch-action:\s*none/s, '#v3d has touch-action: none');
  assert.match(css, /#v3d\s+canvas\s*\{[^}]*touch-action:\s*none/s, '#v3d canvas has touch-action: none');
  assert.match(src, /'touchstart',\s*'touchmove',\s*'touchend'/, 'init3D wakes req3D on touch events');
});
