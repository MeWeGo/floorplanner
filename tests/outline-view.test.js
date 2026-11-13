/* AutoCAD-style 2D Outline / Wireframe view mode (Çizgisel / CAD).
   Tests the real SVG builders and palette extracted from app.js against
   both normal (solid) and outline (ui.outline = true) modes, plus DOM and
   keyboard / command-palette wiring. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js');
const html = read('index.html');
const fnSrc = name => fnSrcOf(src, name);

const env = new Function(`
  let lightMode = true;
  const ui = { exporting: false, outline: false, dims: true, view3d: false };
  const view = { x: 0, y: 0, z: 0.5 };
  const sel = [];
  const L = (tr, en) => en;
  const esc = s => String(s || '');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const wLen = w => dist(w.a, w.b);
  const wAng = w => Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
  const fmtLen = v => Math.round(v) + ' cm';
  const fmtArea = a => (a / 10000).toFixed(1) + ' m2';
  const isLight = () => lightMode;
  const isLowWall = w => w.wt === 'railing' || w.wt === 'fence';
  const railStyle = w => w.rs || 'bars';
  const curtainBays = w => Math.max(2, Math.round(wLen(w) / (w.mul || 120)));
  const wallPivot = w => w.pivot || 'a';
  const grpHasVars = () => false;
  const furnElev = f => +f.elev || 0;
  const furnTilted = f => !!(f && (+f.rx || +f.ry));
  const stairSteps = () => ({ type: 'straight', steps: [{ x: 0, y: 50, w: 100, d: 25, a: 0, dx: 0, dy: -1, landing: false }, { x: 0, y: -50, w: 100, d: 25, a: 0, dx: 0, dy: -1, landing: false }] });
  const stepCorners = s => [{ x: s.x - s.w / 2, y: s.y - s.d / 2 }, { x: s.x + s.w / 2, y: s.y - s.d / 2 }, { x: s.x + s.w / 2, y: s.y + s.d / 2 }, { x: s.x - s.w / 2, y: s.y + s.d / 2 }];
  const rampSlope = f => ({ pct: (f.h / f.d) * 100, ratio: 10, deg: 5, cls: 'ideal' });
  const rampType = () => 'accessible';
  const rampRailSides = () => [-1, 1];
  const pctTxt = v => v.toFixed(1) + '%';
  const VOID_TYPES = { stair: ['Merdiven', 'Stairwell'] };
  const LOW_WALL = { fence: { bar: 20 }, railing: { bar: 120 } };
  const lowWallSolid = L => [[0, L]];
  const lowWallPosts = (w, L) => [0, L / 2, L];
  const finishKind = k => (k && k !== 'none' ? k : null);
  const finishPat = k => 'p-' + k;
  const visFloor = f => f;
  const bboxOf = (kind, o) => {
    if (kind === 'void') {
      const xs = o.pts.map(p => p.x), ys = o.pts.map(p => p.y);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    }
    return null;
  };
  const groupVarsSvg = () => '';
  const roofTopFaces = () => [];
  const wallPaintSvg = w => '<line data-paint="1" stroke="' + w.color + '"/>';
  const sectionSvg = () => '';
  const dimSvg = () => '';
  const textSvg = () => '';
  const sketchSvg = () => '';
  const draftSvg = () => '';
  const opPos = op => op.wall ? { x: op.d, y: 0, ang: 0, t: 20 } : null;
  const isDoorOp = op => op.type !== 'window';
  const doorMat = op => op.mat || 'wood';
  const partTilted = p => !!(p && (+p.rx || +p.ry));
  const partR = v => Math.round(v * 100) / 100;
  const partsScale = () => ({ sx: 1, sy: 1, sz: 1 });
  const segProj = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const x = a.x + dx * t, y = a.y + dy * t;
    return { t, d: Math.hypot(p.x - x, p.y - y) };
  };
  function polyArea(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; s += p.x * q.y - q.x * p.y; } return Math.abs(s) / 2; }
  function polyCentroid(pts) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length], c = p.x * q.y - q.x * p.y; a += c; cx += (p.x + q.x) * c; cy += (p.y + q.y) * c; }
    return a ? { x: cx / (3 * a), y: cy / (3 * a) } : pts[0] || { x: 0, y: 0 };
  }
  ${fnSrc('convexHull')}
  ${fnSrc('wallJoints')}
  ${fnSrc('pal')}
  ${fnSrc('roomSvg')}
  ${fnSrc('slabSvg')}
  ${fnSrc('voidSvg')}
  ${fnSrc('wallSvg')}
  ${fnSrc('lowWallSvg')}
  ${fnSrc('jointsSvg')}
  ${fnSrc('wallHollowSvg')}
  ${src.match(/const WALL_ELEV_MAX\s*=[^;\n]+;/)[0]}
  ${fnSrc('wallTag')}
  ${fnSrc('wallDimSvg')}
  ${fnSrc('opSvg')}
  ${fnSrc('roofSvg')}
  ${fnSrc('furnCadSvg')}
  ${fnSrc('furnBody')}
  ${fnSrc('partShapeSvg')}
  ${fnSrc('partsSvg')}
  ${fnSrc('furnTiltSvg')}
  const layersVis = { furnLabel: true, furnIcon: true }; // label / icon toggles (#84)
  ${fnSrc('furnSvg')}
  ${fnSrc('layerStrings')}
  return {
    setMode(o) { Object.assign(ui, o); },
    setLight(v) { lightMode = v; },
    pal, roomSvg, slabSvg, voidSvg, wallSvg, lowWallSvg,
    wallHollowSvg, opSvg, furnBody, furnCadSvg, partsSvg, furnSvg, layerStrings,
  };
`)();

test('pal() adapts outline flag, transparent rooms and dark-mode contrast in outline mode', () => {
  env.setMode({ exporting: false, outline: false });
  env.setLight(true);
  assert.strictEqual(env.pal().outline, false);
  assert.ok(env.pal().roomOp > 0);

  env.setMode({ exporting: false, outline: true });
  env.setLight(true);
  assert.strictEqual(env.pal().outline, true);
  assert.strictEqual(env.pal().roomOp, 0);

  env.setLight(false);
  const darkOl = env.pal();
  assert.strictEqual(darkOl.outline, true);
  assert.strictEqual(darkOl.roomOp, 0);
  assert.notStrictEqual(darkOl.furnStroke, '#161e29', 'dark outline mode needs bright CAD linework');
});

test('wallHollowSvg() returns empty normally and carves hollow double-line walls + L/T joints in outline mode', () => {
  const floor = {
    walls: [
      { id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20, h: 270, color: '#ff0000' },
      { id: 'w2', a: { x: 400, y: 0 }, b: { x: 400, y: 300 }, t: 20, h: 270 },
      { id: 'w3', a: { x: 200, y: 0 }, b: { x: 200, y: 200 }, t: 20, h: 270 }, // T-junction at w1
    ],
    ops: [], furn: [], rooms: [], slabs: [], voids: [], dims: [], texts: [], sketches: [],
  };
  env.setMode({ exporting: false, outline: false });
  env.setLight(true);
  assert.strictEqual(env.wallHollowSvg(floor), '');
  const normalLayers = env.layerStrings(floor, true);
  assert.ok(normalLayers.walls.includes('data-paint="1"'), 'normal mode keeps wall paint strips');

  env.setMode({ exporting: false, outline: true });
  const hollow = env.wallHollowSvg(floor);
  assert.ok(hollow.includes('<line '), 'outline mode draws hollow interior line cuts');
  assert.ok(hollow.includes('<polygon '), 'outline mode carves mitered interior corner joints');
  const olLayers = env.layerStrings(floor, true);
  assert.ok(!olLayers.walls.includes('data-paint="1"'), 'outline mode hides wall paint strips');
  // T-junction stem w3 starts at (200, 0) on w1 -> extends -sw into w1 (-1.8)
  assert.ok(hollow.includes('x1="200" y1="-1.8"'), 'T-junction throat opens into through-wall cavity');
});

test('rooms, slabs and voids drop solid fills and hatch patterns in outline mode while keeping labels', () => {
  const room = { id: 'r1', name: 'Salon', color: '#fde68a', floor: 'wood', pts: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }] };
  const slab = { id: 's1', name: 'Teras', color: '#cbd5e1', floor: 'stone', pts: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 120 }, { x: 0, y: 120 }] };
  const v = { id: 'v1', name: 'Galeri', type: 'stair', pts: [{ x: 20, y: 20 }, { x: 100, y: 20 }, { x: 100, y: 100 }, { x: 20, y: 100 }] };

  env.setMode({ exporting: false, outline: false });
  env.setLight(true);
  assert.ok(env.roomSvg(room, true)[0].includes('url(#p-wood)'));
  assert.ok(env.slabSvg(slab, true).includes('url(#p-stone)'));
  assert.ok(env.voidSvg(v, true).includes('fill-opacity="0.6"'));

  env.setMode({ exporting: false, outline: true });
  const [rBody, rLabel] = env.roomSvg(room, true);
  assert.ok(rBody.includes('fill-opacity="0"'), 'room polygon must be unfilled in outline mode');
  assert.ok(!rBody.includes('url(#p-wood)'), 'room hatch pattern must be hidden in outline mode');
  assert.ok(rLabel.includes('Salon'), 'room label stays visible');

  const sSvg = env.slabSvg(slab, true);
  assert.ok(sSvg.includes('fill-opacity="0"'), 'slab polygon must be unfilled in outline mode');
  assert.ok(!sSvg.includes('url(#p-stone)'), 'slab hatch pattern must be hidden in outline mode');
  assert.ok(env.voidSvg(v, true).includes('fill-opacity="0"'), 'void polygon omits opaque bg fill');
});

test('openings render without colored glass fills in outline mode', () => {
  const win = { id: 'op1', wall: 'w1', d: 100, w: 120, h: 120, sill: 90, type: 'window' };
  const slide = { id: 'op2', wall: 'w1', d: 240, w: 160, h: 210, sill: 0, type: 'slide', mat: 'glass' };

  env.setMode({ exporting: false, outline: false });
  env.setLight(true);
  const C = env.pal();
  assert.ok(env.opSvg(win, true).includes(`fill="${C.glass}"`));
  assert.ok(env.opSvg(slide, true).includes(`fill="${C.glass}"`));

  env.setMode({ exporting: false, outline: true });
  const C2 = env.pal();
  const winOl = env.opSvg(win, true);
  const slideOl = env.opSvg(slide, true);
  assert.ok(!winOl.includes(`fill="${C2.glass}"`), 'window must use hollow bg frame instead of glass fill');
  assert.ok(winOl.includes(`fill="${C2.bg}"`), 'window frame uses bg fill in outline mode');
  assert.ok(!slideOl.includes(`fill="${C2.glass}"`), 'sliding glass door must be hollow in outline mode');
});

test('furniture and parts render unfilled with CAD detail linework and no emoji icons in outline mode', () => {
  const wc = { id: 'f1', type: 'wc', name: 'Klozet', icon: '🚽', k: 'rect', w: 40, d: 70, h: 40, x: 0, y: 0, rot: 0, color: '#f1f5f9' };
  const stove = { id: 'f2', type: 'stove', name: 'Ocak', icon: '🔥', k: 'rect', w: 60, d: 60, h: 90, x: 0, y: 0, rot: 0, color: '#94a3b8' };
  const tableParts = {
    id: 'f3', type: 'table', name: 'Masa', k: 'rect', w: 120, d: 70, h: 75, x: 0, y: 0, rot: 0, color: '#c9a87c',
    parts: [{ type: 'box', x: 0, y: 0, z: 70, w: 120, d: 70, h: 5, color: '#d8b98d' }],
  };

  env.setMode({ exporting: false, outline: false });
  env.setLight(true);
  assert.ok(env.furnSvg(wc, true).includes('🚽'), 'normal mode keeps furniture emoji icon');
  assert.ok(env.partsSvg(tableParts).includes('fill="#d8b98d"'), 'normal mode fills multi-part components');

  env.setMode({ exporting: false, outline: true });
  const wcSvg = env.furnSvg(wc, true);
  assert.ok(wcSvg.includes('fill-opacity="0"'), 'outline mode omits solid furniture fill');
  assert.ok(!wcSvg.includes('🚽'), 'outline mode suppresses emoji icons');
  assert.ok(wcSvg.includes('<ellipse '), 'WC gets CAD bowl ellipse detail in outline mode');

  const stoveSvg = env.furnBody(stove);
  assert.ok((stoveSvg.match(/<circle /g) || []).length === 8, 'stove draws 4x2 burner rings in outline mode');

  const pSvg = env.partsSvg(tableParts);
  assert.ok(pSvg.includes('fill="none"'), 'multi-part furniture renders unfilled outlines in outline mode');
});

test('UI buttons, footer checkbox, command palette and U shortcut are wired', () => {
  assert.ok(html.includes('id="bCad"'), 'index.html must include #bCad button');
  assert.ok(html.includes('id="cOutline"'), 'index.html must include #cOutline checkbox');
  assert.ok(html.includes('id="lblOutline"'), 'index.html must include #lblOutline label');
  assert.match(src, /function syncViewSwitch\(/);
  assert.match(src, /function setOutline\(/);
  assert.match(src, /if \(k === 'j'\) \{ setOutline\(!ui\.outline\); return; \}/);
  assert.match(src, /act\('outline',[^\n]+setOutline\(!ui\.outline\)/);
});
