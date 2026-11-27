/* Interactive 2D & CAD Elevation / Section Viewer and Editor tests.
   Extracts the real projection, SVG rendering, handle generation, placement,
   and drag-editing functions from app.js and verifies them against synthetic
   multi-floor projects. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, wallTopSrc, constLineOf } = require('./helpers/repo');

const src = read('app.js');
const css = read('style.css');
const html = read('index.html');
const fnSrc = name => fnSrcOf(src, name);

const constLine = name => constLineOf(src, name);

function makeEnv(floors = []) {
  return new Function('floors', `
    let lightMode = true;
    const ui = { exporting: false, outline: false, dims: true };
    const P = { name: 'Test Project', wallH: 270, grid: 10, floors };
    const L = (tr, en) => en;
    const esc = s => String(s || '');
    const isLight = () => lightMode;
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
    const wLen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const visFloor = f => f;
    const groundP = () => ({ plinth: 20 }), groundFloorIdx = () => 0;
    const terrainObj = () => null, terrainZ = () => -20, groundCuts = () => [];
    const isLowWall = w => w.wt === 'railing' || w.wt === 'fence';
    const railStyle = w => w.rs || 'bars';
    const curtainBays = w => Math.max(2, Math.round(wLen(w) / (w.mul || 120)));
    const furnElev = o => +o.elev || 0;
    const roofFaces = () => [];
    const slabPolys = f => {
      if (!f.walls || !f.walls.length) return [];
      const xs = f.walls.flatMap(w => [w.a.x, w.b.x]), ys = f.walls.flatMap(w => [w.a.y, w.b.y]);
      return [[
        { x: Math.min(...xs), y: Math.min(...ys) },
        { x: Math.max(...xs), y: Math.min(...ys) },
        { x: Math.max(...xs), y: Math.max(...ys) },
        { x: Math.min(...xs), y: Math.max(...ys) }
      ]];
    };
    ${constLine('floorH')}
    ${constLine('floorElev')}
    ${constLine('fmtLevel')}
    ${constLine('ELEV_DIRS')}
    ${constLine('LOW_WALL')}
    ${constLine('WALL_ELEV_MAX')}
    const FURN_ELEV_MAX = 500;
    ${wallTopSrc(src)}
    ${fnSrc('pal')}
    ${fnSrc('lineCutIntervals')}
    ${fnSrc('subIntervals')}
    ${fnSrc('sectionFrame')}
    ${fnSrc('archPrims')}
    ${fnSrc('railElevSvg')}
    const scaleBarSpec = () => ({ len: 200, mid: '1 m', end: '2 m' });
    ${fnSrc('archSvg')}
    ${fnSrc('archSnapVal')}
    ${fnSrc('archApplyDrag')}
    ${fnSrc('archPlaceOpAt')}
    ${fnSrc('archHandleSvg')}
    return {
      setLight(v) { lightMode = v; },
      P, pal, archPrims, archSvg, archApplyDrag, archPlaceOpAt, archHandleSvg, ELEV_DIRS
    };
  `)(floors);
}

const W = (id, ax, ay, bx, by, extra = {}) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, t: 20, h: 270, ...extra });

test('(1) archPrims attaches object identity, uProj, slabs, and furniture primitives', () => {
  const f0 = {
    id: 'f0', name: 'Zemin Kat',
    walls: [
      W('w1', 0, 0, 600, 0, { color: '#e7d8bf' }),
      W('w2', 0, 400, 600, 400),
    ],
    ops: [
      { id: 'win1', wall: 'w1', d: 200, w: 120, h: 120, sill: 90, type: 'window' }
    ],
    furn: [
      { id: 'fu1', k: 'rect', name: 'Cabinet', w: 100, d: 50, h: 180, x: 300, y: 350, rot: 0, elev: 20, color: '#94a3b8' }
    ],
    slabs: [
      { id: 'sl1', name: 'Terrace', color: '#cbd5e1', t: 20, off: 10, pts: [{ x: 0, y: 400 }, { x: 200, y: 400 }, { x: 200, y: 550 }, { x: 0, y: 550 }] }
    ],
    voids: [], rooms: []
  };
  const env = makeEnv([f0]);
  const spec = { O: { x: 300, y: 900 }, n: env.ELEV_DIRS.south, cut: false, crop: null };
  const { prims, levels } = env.archPrims(spec);

  assert.strictEqual(levels[0].floorIdx, 0);
  const wFace = prims.find(p => p.t === 'face' && p.id === 'w1');
  assert.ok(wFace, 'wall w1 projected as face with id');
  assert.strictEqual(wFace.kind, 'wall');
  assert.strictEqual(wFace.uProj, 1);
  assert.strictEqual(wFace.color, '#e7d8bf');
  assert.strictEqual(wFace.holes[0].id, 'win1');
  assert.strictEqual(wFace.holes[0].kind, 'op');
  assert.strictEqual(wFace.holes[0].wallId, 'w1');

  const slab = prims.find(p => p.id === 'sl1');
  assert.ok(slab && slab.kind === 'slab' && slab.z0 === -10 && slab.z1 === 10);

  const furn = prims.find(p => p.t === 'furn' && p.id === 'fu1');
  assert.ok(furn && furn.kind === 'furn');
  assert.strictEqual(furn.z0, 20);
  assert.strictEqual(furn.z1, 200);
});

test('(2) archSvg distinguishes 2D solid vs CAD outline and live vs export attributes', () => {
  const f0 = {
    id: 'f0', name: 'Zemin Kat',
    walls: [
      W('w1', 0, 0, 800, 0, { color: '#c8826b' }),
      W('w2', 400, 0, 400, 500),
    ],
    ops: [{ id: 'win1', wall: 'w1', d: 200, w: 120, h: 120, sill: 90, type: 'window' }],
    furn: [{ id: 'fu1', k: 'rect', name: 'Desk', w: 120, d: 60, h: 75, x: 200, y: 200, rot: 0, color: '#a16207' }],
    slabs: [], voids: [], rooms: []
  };
  const env = makeEnv([f0]);
  const secSpec = { O: { x: -100, y: 250 }, n: { x: 0, y: -1 }, cut: true, crop: [0, 1000] };

  const d2Live = env.archSvg(secSpec, 'Section A', { mode: '2d', live: true });
  assert.ok(d2Live.inner.includes('data-arch-id="w1"'), 'live 2D emits selectable data-arch-id');
  assert.ok(d2Live.inner.includes('data-arch-id="win1"'), 'live 2D emits opening data-arch-id');
  assert.ok(d2Live.inner.includes('fill="#c8826b"'), '2D mode preserves wall paint');
  assert.ok(!d2Live.inner.includes('url(#arch-cut-hatch)'), '2D mode uses solid poché instead of CAD hatch');

  const cadLive = env.archSvg(secSpec, 'Section A', { mode: 'cad', live: true });
  assert.ok(cadLive.inner.includes('data-arch-id="w1"'), 'live CAD emits data-arch-id');
  assert.ok(!cadLive.inner.includes('fill="#c8826b"'), 'CAD mode drops wall paint fills');
  assert.ok(cadLive.inner.includes('url(#arch-cut-hatch)'), 'CAD mode hatches section cuts');

  const cadExport = env.archSvg(secSpec, 'Section A', { mode: 'cad', live: false });
  assert.ok(!cadExport.svg.includes('data-arch-id'), 'export omits interactive attributes');
  assert.ok(cadExport.svg.includes('fill="#fff"'), 'export sits on white paper');
  assert.ok(cadExport.svg.includes('url(#arch-cut-hatch)'), 'CAD export keeps CAD hatch');
});

test('(3) archApplyDrag edits openings, walls, furniture, and slabs accurately', () => {
  const env = makeEnv([]);
  const spec = { O: { x: 0, y: 1000 }, n: env.ELEV_DIRS.south, cut: false, crop: null };

  // Opening drag & resize
  const w1 = W('w1', 0, 0, 800, 0);
  const op = { id: 'op1', wall: 'w1', d: 400, w: 120, h: 120, sill: 90, type: 'window' };
  const opOrig = JSON.parse(JSON.stringify(op));
  env.archApplyDrag(spec, { kind: 'op', o: op, wall: w1, floorH: 270, handle: null, uProj: 1, sCenter: 400, orig: opOrig }, 50, -30, 10);
  assert.strictEqual(op.d, 450);
  assert.strictEqual(op.sill, 60);

  env.archApplyDrag(spec, { kind: 'op', o: op, wall: w1, floorH: 270, handle: 'opR', uProj: 1, sCenter: 400, orig: opOrig }, 40, 0, 10);
  assert.strictEqual(op.w, 160);
  assert.strictEqual(op.d, 420, 'left edge stayed at 340 while right grew by 40 to 500');

  env.archApplyDrag(spec, { kind: 'op', o: op, wall: w1, floorH: 270, handle: 'opB', uProj: 1, sCenter: 400, orig: opOrig }, 0, -20, 10);
  assert.strictEqual(op.sill, 70);
  assert.strictEqual(op.h, 140, 'head stays fixed at 210 when sill drops by 20');

  // Wall height, base offset & endpoint resize with connected wall
  const wSide = W('w2', 800, 0, 800, 400);
  const wOrig = JSON.parse(JSON.stringify(w1));
  env.archApplyDrag(spec, { kind: 'wall', o: w1, floorH: 270, handle: 'wTop', orig: wOrig }, 0, 50, 10);
  assert.strictEqual(w1.h, 320);

  env.archApplyDrag(spec, { kind: 'wall', o: w1, floorH: 270, handle: 'wBot', orig: wOrig }, 0, 30, 10);
  assert.strictEqual(w1.elev, 30);
  assert.strictEqual(w1.h, 240, 'top stays at 270 when base rises to 30');

  env.archApplyDrag(spec, {
    kind: 'wall', o: w1, floorH: 270, handle: 'wR', orig: wOrig,
    conn: [{ w: wSide, k: 'a', end: 'b', orig: { x: 800, y: 0 } }],
    ops: [{ o: op, w: w1, d: 400, L0: 800 }]
  }, 100, 0, 10);
  assert.strictEqual(w1.b.x, 900);
  assert.strictEqual(wSide.a.x, 900, 'connected corner follows wall length resize');

  // Furniture move + mount clear + height resize
  const fu = { id: 'f1', k: 'rect', w: 60, d: 60, h: 40, x: 200, y: 200, elev: 200, mount: 'ceil' };
  const fuOrig = JSON.parse(JSON.stringify(fu));
  env.archApplyDrag(spec, { kind: 'furn', o: fu, handle: null, orig: fuOrig }, 40, -50, 10);
  assert.strictEqual(fu.x, 240);
  assert.strictEqual(fu.elev, 150);
  assert.strictEqual(fu.mount, undefined, 'vertical drag detaches ceiling mount');

  env.archApplyDrag(spec, { kind: 'furn', o: fu, handle: 'fTop', orig: fuOrig }, 0, 30, 10);
  assert.strictEqual(fu.h, 70);

  // Slab offset & thickness
  const sl = { id: 's1', t: 20, off: 0, pts: [] };
  const slOrig = JSON.parse(JSON.stringify(sl));
  env.archApplyDrag(spec, { kind: 'slab', o: sl, handle: 'sTop', orig: slOrig }, 0, 30, 10);
  assert.strictEqual(sl.off, 30);
  env.archApplyDrag(spec, { kind: 'slab', o: sl, handle: 'sBot', orig: slOrig }, 0, -15, 5);
  assert.strictEqual(sl.t, 35);
});

test('(4) archPlaceOpAt targets front-most wall face and computes clamped d and sill', () => {
  const f0 = {
    id: 'f0', name: 'Zemin Kat',
    walls: [
      W('wFront', 0, 400, 800, 400),
      W('wBack', 0, 0, 800, 0),
    ],
    ops: [], furn: [], slabs: [], voids: [], rooms: []
  };
  const env = makeEnv([f0]);
  const spec = { O: { x: 0, y: 900 }, n: env.ELEV_DIRS.south, cut: false, crop: null };
  const { prims } = env.archPrims(spec);

  const winHit = env.archPlaceOpAt(spec, prims, 300, 150, { id: 'window', w: 120, h: 120 }, 10);
  assert.ok(winHit);
  assert.strictEqual(winHit.wallId, 'wFront', 'front-most wall face wins over back wall');
  assert.strictEqual(winHit.d, 300);
  assert.strictEqual(winHit.sill, 90);

  const doorHit = env.archPlaceOpAt(spec, prims, 500, 80, { id: 'door', w: 90, h: 210 }, 10);
  assert.ok(doorHit);
  assert.strictEqual(doorHit.sill, 0, 'door near floor snaps sill to 0');
});

test('(5) archHandleSvg draws selection box and handles for openings and walls', () => {
  const f0 = {
    id: 'f0', name: 'Zemin Kat',
    walls: [W('w1', 0, 0, 600, 0)],
    ops: [{ id: 'win1', wall: 'w1', d: 300, w: 120, h: 120, sill: 90, type: 'window' }],
    furn: [], slabs: [], voids: [], rooms: []
  };
  const env = makeEnv([f0]);
  const spec = { O: { x: 300, y: 900 }, n: env.ELEV_DIRS.south, cut: false, crop: null };
  const meta = env.archSvg(spec, 'South', { mode: 'cad', live: true });

  const opHandles = env.archHandleSvg(meta, ['win1'], 0.5);
  for (const h of ['opL', 'opR', 'opT', 'opB']) assert.ok(opHandles.includes(`data-arch-h="${h}"`), `missing ${h}`);

  const wallHandles = env.archHandleSvg(meta, ['w1'], 0.5);
  for (const h of ['wTop', 'wBot', 'wL', 'wR']) assert.ok(wallHandles.includes(`data-arch-h="${h}"`), `missing ${h}`);
});

test('(6) wiring checks in app.js, index.html, and style.css', () => {
  assert.match(src, /if\s*\(ui\.modal\s*===\s*['"]arch['"]\)\s*\{\s*archKey\(e\);\s*return;\s*\}/);
  assert.match(src, /if\s*\(ui\.viewElev\s*&&\s*\$\('#modalbg'\)\.style\.display\s*!==\s*'flex'\)\s*\{\s*archKey\(e\);\s*return;\s*\}/);
  assert.match(src, /if\s*\(ui\.modal\s*===\s*['"]arch['"]\)\s*\{\s*archRedraw\(\);\s*archRenderProps\(\);\s*\}/);
  assert.match(src, /if\s*\(ui\.viewElev\)\s*archRedraw\(false\);/);
  assert.match(src, /classList\.remove\(['"]arch-modal['"]\)/);
  assert.match(fnSrc('archModal'), /data-archmode=["']2d["']/);
  assert.match(fnSrc('archModal'), /data-archmode=["']cad["']/);
  assert.match(fnSrc('archModal'), /data-archact=["']tomain["']/);
  assert.match(fnSrc('syncViewSwitch'), /#bElev/);
  assert.match(fnSrc('showElev'), /#vElev/);
  assert.match(fnSrc('exportSvg'), /if\s*\(ui\.viewElev\)/);
  for (const id of ['bElev', 'vElev', 'elevCv', 'elevTabs', 'elevPlaceSel', 'elevHud']) {
    assert.ok(html.includes(`id="${id}"`), `index.html missing #${id}`);
  }
  assert.ok(css.includes('#modal.arch-modal') && css.includes('#archCv') && css.includes('#archProps'));
  assert.ok(css.includes('#vElev') && css.includes('#elevCv') && css.includes('#elevHud'));
});
