/* Furniture Studio (multi-part furniture):
   draft initialization (pbStart, fsNew), studio history (fsPush, fsUndo),
   validation (pbIssues), 2D views & handles (fsViewSvg), magnetic snapping & axis move (fsMagnet, fsMoveAxis),
   building blocks & gravity (fsAddBlock, fsSitOnTop), studio actions (fsAct),
   commit wiring (pbApply), template integrity, and source guards. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n');

const fnSrc = name => fnSrcOf(src, name);

const lineSrc = name => {
  const start = src.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is gone from app.js');
  return src.slice(start, src.indexOf('\n', start));
};

const engineOf = text => {
  const a = text.indexOf('/* PARTS-ENGINE:BEGIN'), b = text.indexOf('/* PARTS-ENGINE:END */');
  assert.ok(a >= 0 && b > a, 'PARTS-ENGINE block missing');
  return text.slice(a, b);
};

const blocksSrc = src.slice(src.indexOf('const FS_BLOCKS = ['), src.indexOf('function pbStart('));
const viewsSrc = src.slice(src.indexOf('const FS_VIEWS = ['), src.indexOf('function fsProj('))
  + '\n'
  + src.slice(src.indexOf('const fsHorizKey ='), src.indexOf('function fsViewBox('));

const api = new Function(`
  const L = (tr, en) => en;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pal = () => ({ furnStroke: '#333', accent: '#00f', sub: '#888', stroke: '#000', gMin: '#ccc' });
  const clonePlain = v => JSON.parse(JSON.stringify(v));
  let toastMsg = null;
  const toast = msg => { toastMsg = msg; };
  let modalClosed = false;
  const closeModal = () => { modalClosed = true; };
  let committed = 0;
  const commit = () => { committed++; };
  let refreshed = 0;
  const refresh = () => { refreshed++; };
  let libBuilt = 0;
  const buildLib = () => { libBuilt++; };
  let currentFloor = { furn: [] };
  const F = () => currentFloor;
  let centerPt = { x: 500, y: 300 };
  const view2DCenter = () => centerPt;
  const presetFromObj = (kind, o, name) => ({ kind, name, o: clonePlain(o) });
  let openStudioCalled = 0;
  const openStudio = () => { openStudioCalled++; };
  let pbRedrawCalled = 0;
  const pbRedraw = () => { pbRedrawCalled++; };
  let fsSyncTopCalled = 0;
  const fsSyncTop = () => { fsSyncTopCalled++; };
  let uidCounter = 0;
  const uid = () => 'uid_' + (++uidCounter);
  let findTarget = null;
  const find = id => findTarget;
  let T3 = null;
  const schedBuild3D = () => {};
  let P = { lib: { presets: [] } };
  let sel = [];
  const ui = { pb: null, modal: null, view3d: false };
  const fsCancel = () => { closeModal(); };

  ${engineOf(src)}

  ${lineSrc('PB_TYPES')}
  ${lineSrc('PB_MATS')}
  ${lineSrc('PB_AXES')}
  ${lineSrc('hex6')}
  ${blocksSrc}
  ${fnSrc('partShapeSvg')}
  ${viewsSrc}

  ${fnSrc('pbStart')}
  ${fnSrc('fsNew')}
  ${fnSrc('fsInit')}
  ${fnSrc('fsPush')}
  ${fnSrc('fsUndo')}
  ${fnSrc('pbIssues')}
  ${fnSrc('pbMsgs')}
  ${fnSrc('pbList')}
  ${fnSrc('pbFields')}
  ${fnSrc('fsProj')}
  ${fnSrc('fsViewBox')}
  ${fnSrc('fsViewSvg')}
  ${fnSrc('fsHandles')}
  ${fnSrc('fsMagnet')}
  ${fnSrc('fsMoveAxis')}
  ${fnSrc('fsAddBlock')}
  ${fnSrc('fsSitOnTop')}
  ${fnSrc('pbApply')}
  ${fnSrc('fsAct')}
  ${fnSrc('fsKey')}

  return {
    ui, L, esc, pal, clonePlain,
    cleanPart, partBounds, validateParts, FURN_TEMPLATES, FS_BLOCKS, PARTS_MAX,
    pbStart, fsNew, fsInit, fsPush, fsUndo, pbIssues, pbMsgs, pbList, pbFields,
    fsUV, fsProj, fsHorizKey, fsViewBox, fsViewSvg, fsHandles, fsMagnet, fsMoveAxis,
    fsAddBlock, fsSitOnTop, pbApply, fsAct, fsKey,
    toast: () => toastMsg,
    setFind: f => { findTarget = f; },
    getCommitted: () => committed,
    resetCommitted: () => { committed = 0; },
    getModalClosed: () => modalClosed,
    resetModalClosed: () => { modalClosed = false; },
    getOpenStudioCalled: () => openStudioCalled,
    resetOpenStudioCalled: () => { openStudioCalled = 0; },
    getPbRedrawCalled: () => pbRedrawCalled,
    resetPbRedrawCalled: () => { pbRedrawCalled = 0; },
    getFsSyncTopCalled: () => fsSyncTopCalled,
    resetFsSyncTopCalled: () => { fsSyncTopCalled = 0; },
    getF: () => currentFloor,
    getP: () => P,
    resetP: () => { P = { lib: { presets: [] } }; currentFloor = { furn: [] }; },
  };
`)();

test('(1) pbStart drafts (with parts / plain rect / round / poly) and fsNew with a template key and with none', () => {
  // Item with existing parts and pbase
  const itemWithParts = {
    id: 'f1', k: 'rect', w: 200, d: 100, h: 80,
    pbase: { w: 100, d: 50, h: 40 },
    color: '#8b4513',
    parts: [{ type: 'box', x: 0, y: 0, z: 0, w: 100, d: 50, h: 10, color: '#8b4513' }]
  };
  api.resetOpenStudioCalled();
  api.pbStart(itemWithParts);
  assert.strictEqual(api.getOpenStudioCalled(), 1, 'openStudio must be invoked');
  assert.strictEqual(api.ui.pb.id, 'f1');
  assert.strictEqual(api.ui.pb.sel, 0);
  assert.deepStrictEqual({ w: api.ui.pb.d.w, d: api.ui.pb.d.d, h: api.ui.pb.d.h }, { w: 100, d: 50, h: 40 });
  assert.strictEqual(api.ui.pb.d.color, '#8b4513');
  assert.deepStrictEqual(api.ui.pb.d.parts, itemWithParts.parts);
  assert.notStrictEqual(api.ui.pb.d.parts, itemWithParts.parts, 'parts must be cloned, not shared');

  // Plain rect item -> one box part of item size
  const rectItem = { id: 'f2', k: 'rect', w: 120, d: 60, h: 75, color: '#123456' };
  api.pbStart(rectItem);
  assert.strictEqual(api.ui.pb.id, 'f2');
  assert.deepStrictEqual({ w: api.ui.pb.d.w, d: api.ui.pb.d.d, h: api.ui.pb.d.h }, { w: 120, d: 60, h: 75 });
  assert.strictEqual(api.ui.pb.d.parts.length, 1);
  const pBox = api.ui.pb.d.parts[0];
  assert.strictEqual(pBox.type, 'box');
  assert.deepStrictEqual({ w: pBox.w, d: pBox.d, h: pBox.h, x: pBox.x, y: pBox.y, z: pBox.z }, { w: 120, d: 60, h: 75, x: 0, y: 0, z: 0 });
  assert.strictEqual(pBox.name, 'body');
  assert.strictEqual(pBox.color, '#123456');

  // Round item -> one cyl part
  const roundItem = { id: 'f3', k: 'round', w: 90, d: 90, h: 45, color: '#abcdef' };
  api.pbStart(roundItem);
  assert.strictEqual(api.ui.pb.id, 'f3');
  assert.deepStrictEqual({ w: api.ui.pb.d.w, d: api.ui.pb.d.d, h: api.ui.pb.d.h }, { w: 90, d: 90, h: 45 });
  assert.strictEqual(api.ui.pb.d.parts.length, 1);
  const pCyl = api.ui.pb.d.parts[0];
  assert.strictEqual(pCyl.type, 'cyl');
  assert.deepStrictEqual({ w: pCyl.w, d: pCyl.d, h: pCyl.h, x: pCyl.x, y: pCyl.y, z: pCyl.z }, { w: 90, d: 90, h: 45, x: 0, y: 0, z: 0 });
  assert.strictEqual(pCyl.name, 'body');
  assert.strictEqual(pCyl.color, '#abcdef');

  // Poly item -> one extrude part with pts
  const polyPts = [{ x: -20, y: -20 }, { x: 20, y: -20 }, { x: 0, y: 20 }];
  const polyItem = { id: 'f4', k: 'poly', w: 40, d: 40, h: 50, color: '#333333', pts: polyPts };
  api.pbStart(polyItem);
  assert.strictEqual(api.ui.pb.id, 'f4');
  assert.deepStrictEqual({ w: api.ui.pb.d.w, d: api.ui.pb.d.d, h: api.ui.pb.d.h }, { w: 40, d: 40, h: 50 });
  assert.strictEqual(api.ui.pb.d.parts.length, 1);
  const pExt = api.ui.pb.d.parts[0];
  assert.strictEqual(pExt.type, 'extrude');
  assert.strictEqual(pExt.h, 50);
  assert.deepStrictEqual(pExt.pts, polyPts);
  assert.strictEqual(pExt.name, 'body');
  assert.strictEqual(pExt.color, '#333333');

  // fsNew with a template key
  api.fsNew('table');
  assert.strictEqual(api.ui.pb.id, null);
  assert.strictEqual(api.ui.pb.name, 'Dining Table');
  assert.strictEqual(api.ui.pb.sel, 0);
  assert.strictEqual(api.ui.pb.d.w, 140);
  assert.strictEqual(api.ui.pb.d.d, 80);
  assert.strictEqual(api.ui.pb.d.h, 75);
  assert.strictEqual(api.ui.pb.d.color, '#c9a87c');
  assert.ok(api.ui.pb.d.parts.length > 0);

  // fsNew with none
  api.fsNew();
  assert.strictEqual(api.ui.pb.id, null);
  assert.strictEqual(api.ui.pb.name, 'New furniture');
  assert.strictEqual(api.ui.pb.sel, -1);
  assert.strictEqual(api.ui.pb.d.w, 100);
  assert.strictEqual(api.ui.pb.d.d, 60);
  assert.strictEqual(api.ui.pb.d.h, 75);
  assert.strictEqual(api.ui.pb.d.color, '#b08968');
  assert.strictEqual(api.ui.pb.d.parts.length, 0);
});

test('(2) studio history: fsPush adds a step only when the draft changed, fsUndo(-1)/(1) walks it and clamps', () => {
  api.fsNew('table');
  assert.strictEqual(api.ui.pb.hist.length, 1);
  assert.strictEqual(api.ui.pb.hi, 0);

  // Calling fsPush without any change should not add a step
  api.fsPush();
  assert.strictEqual(api.ui.pb.hist.length, 1, 'unchanged draft must not add history step');
  assert.strictEqual(api.ui.pb.hi, 0);

  // Mutate draft and push
  api.ui.pb.d.w = 160;
  api.fsPush();
  assert.strictEqual(api.ui.pb.hist.length, 2);
  assert.strictEqual(api.ui.pb.hi, 1);

  // Mutate draft again and push
  api.ui.pb.d.h = 90;
  api.fsPush();
  assert.strictEqual(api.ui.pb.hist.length, 3);
  assert.strictEqual(api.ui.pb.hi, 2);

  // fsUndo(-1) walks back
  api.fsUndo(-1);
  assert.strictEqual(api.ui.pb.hi, 1);
  assert.strictEqual(api.ui.pb.d.h, 75, 'h restored');
  assert.strictEqual(api.ui.pb.d.w, 160);

  api.fsUndo(-1);
  assert.strictEqual(api.ui.pb.hi, 0);
  assert.strictEqual(api.ui.pb.d.w, 140, 'w restored to original');

  // Clamps at 0
  api.fsUndo(-1);
  assert.strictEqual(api.ui.pb.hi, 0, 'undo at 0 must clamp');

  // fsUndo(1) walks forward (redo)
  api.fsUndo(1);
  assert.strictEqual(api.ui.pb.hi, 1);
  assert.strictEqual(api.ui.pb.d.w, 160);

  api.fsUndo(1);
  assert.strictEqual(api.ui.pb.hi, 2);
  assert.strictEqual(api.ui.pb.d.h, 90);

  // Clamps at end
  api.fsUndo(1);
  assert.strictEqual(api.ui.pb.hi, 2, 'redo at end must clamp');
});

test('(3) pbIssues: valid table none, sticking out, above height, floating warning', () => {
  // Valid table: top supported by legs, legs on floor
  const validTable = {
    w: 100, d: 50, h: 75,
    parts: [
      { name: 'top', type: 'box', x: 0, y: 0, z: 72, w: 100, d: 50, h: 3 },
      { name: 'leg', type: 'cyl', x: -45, y: -20, z: 0, w: 4, d: 4, h: 72 }
    ]
  };
  api.ui.pb = { d: validTable, sel: 0 };
  assert.deepStrictEqual(api.pbIssues(), [], 'valid table should produce no issues');

  // Part sticking out of the box
  const stickingOut = {
    w: 100, d: 50, h: 75,
    parts: [{ name: 'top', type: 'box', x: 20, y: 0, z: 0, w: 100, d: 50, h: 10 }]
  };
  api.ui.pb = { d: stickingOut, sel: 0 };
  const issuesOut = api.pbIssues();
  assert.strictEqual(issuesOut.length, 1);
  assert.strictEqual(issuesOut[0].err, true);
  assert.match(issuesOut[0].t, /sticks out of the item box/);

  // Part above the item height
  const aboveHeight = {
    w: 100, d: 50, h: 75,
    parts: [{ name: 'tall', type: 'box', x: 0, y: 0, z: 0, w: 10, d: 10, h: 80 }]
  };
  api.ui.pb = { d: aboveHeight, sel: 0 };
  const issuesHigh = api.pbIssues();
  assert.strictEqual(issuesHigh.length, 1);
  assert.strictEqual(issuesHigh[0].err, true);
  assert.match(issuesHigh[0].t, /top at 80 cm, item height 75 cm/);

  // Floating part: warning with err: false
  const floating = {
    w: 100, d: 50, h: 75,
    parts: [{ name: 'float', type: 'box', x: 0, y: 0, z: 30, w: 20, d: 20, h: 10 }]
  };
  api.ui.pb = { d: floating, sel: 0 };
  const issuesFloat = api.pbIssues();
  assert.strictEqual(issuesFloat.length, 1);
  assert.strictEqual(issuesFloat[0].err, false, 'floating part must be a warning with err: false');
  assert.match(issuesFloat[0].t, /floats with nothing under it/);
});

test('(4) fsViewSvg for top/front/side: one data-pi group per part, the selected part gets handles (top: w+ w- d+ d- rot; front/side: a+ a- top bot), extrude parts get no width handles', () => {
  api.ui.pb = {
    d: {
      w: 100, d: 50, h: 75, color: '#b08968',
      parts: [
        { name: 'top', type: 'box', x: 0, y: 0, z: 72, w: 100, d: 50, h: 3 },
        { name: 'leg', type: 'cyl', x: -45, y: -20, z: 0, w: 4, d: 4, h: 72 }
      ]
    },
    sel: 0
  };

  for (const view of ['top', 'front', 'side']) {
    const svg = api.fsViewSvg(view);
    const piMatches = [...svg.matchAll(/<g\s+data-pi="(\d+)"/g)].map(m => m[1]);
    assert.strictEqual(piMatches.length, 2, `${view} must contain one data-pi group per part`);
    assert.ok(piMatches.includes('0') && piMatches.includes('1'), `${view} must include parts 0 and 1`);
  }

  // Selected box part handles
  const topSvg = api.fsViewSvg('top');
  assert.match(topSvg, /data-h="w\+"/, 'top has w+ handle');
  assert.match(topSvg, /data-h="w\-"/, 'top has w- handle');
  assert.match(topSvg, /data-h="d\+"/, 'top has d+ handle');
  assert.match(topSvg, /data-h="d\-"/, 'top has d- handle');
  assert.match(topSvg, /data-h="rot"/, 'top has rot handle');

  const frontSvg = api.fsViewSvg('front');
  assert.match(frontSvg, /data-h="a\+"/, 'front has a+ handle');
  assert.match(frontSvg, /data-h="a\-"/, 'front has a- handle');
  assert.match(frontSvg, /data-h="top"/, 'front has top handle');
  assert.match(frontSvg, /data-h="bot"/, 'front has bot handle');

  const sideSvg = api.fsViewSvg('side');
  assert.match(sideSvg, /data-h="a\+"/, 'side has a+ handle');
  assert.match(sideSvg, /data-h="a\-"/, 'side has a- handle');
  assert.match(sideSvg, /data-h="top"/, 'side has top handle');
  assert.match(sideSvg, /data-h="bot"/, 'side has bot handle');

  // Extrude part gets no width handles in top/front/side
  api.ui.pb = {
    d: {
      w: 100, d: 50, h: 75, color: '#b08968',
      parts: [
        { name: 'profile', type: 'extrude', x: 0, y: 0, z: 0, w: 40, d: 40, h: 30, pts: [{ x: -20, y: -20 }, { x: 20, y: -20 }, { x: 0, y: 20 }] }
      ]
    },
    sel: 0
  };

  const extTop = api.fsViewSvg('top');
  assert.ok(!extTop.includes('data-h="w+"') && !extTop.includes('data-h="w-"') && !extTop.includes('data-h="d+"') && !extTop.includes('data-h="d-"'), 'extrude part gets no w/d handles in top');
  assert.match(extTop, /data-h="rot"/, 'extrude part still gets rot handle');

  const extFront = api.fsViewSvg('front');
  assert.ok(!extFront.includes('data-h="a+"') && !extFront.includes('data-h="a-"'), 'extrude part gets no a+/a- handles in front');
  assert.match(extFront, /data-h="top"/, 'extrude part gets top handle in front');
  assert.match(extFront, /data-h="bot"/, 'extrude part gets bot handle in front');

  const extSide = api.fsViewSvg('side');
  assert.ok(!extSide.includes('data-h="a+"') && !extSide.includes('data-h="a-"'), 'extrude part gets no a+/a- handles in side');
  assert.match(extSide, /data-h="top"/, 'extrude part gets top handle in side');
  assert.match(extSide, /data-h="bot"/, 'extrude part gets bot handle in side');
});

test('(5) fsMagnet snaps an edge to another part edge and z to another part top within tolerance and returns null when far; fsMoveAxis rounds to 1 cm when nothing to snap and never lets z go below 0', () => {
  const p1 = { type: 'box', x: 0, y: 0, z: 0, w: 20, d: 20, h: 30 }; // x: -10..10, y: -10..10, z: 0..30
  const p2 = { type: 'box', x: 21, y: 0, z: 31, w: 20, d: 20, h: 20 }; // x: 11..31, z: 31..51
  api.ui.pb = {
    d: { w: 100, d: 60, h: 75, parts: [p1, p2] },
    snap: true
  };

  // Edge-to-edge snapping in X (p2.x0 = 11, p1.x1 = 10, diff = -1)
  const snapX = api.fsMagnet(p2, 'x', 2, 1);
  assert.ok(snapX, 'should snap edge to edge in X within tolerance');
  assert.strictEqual(snapX.v, 10);
  assert.strictEqual(snapX.d, -1);

  // Far away in X returns null
  p2.x = 25; // x0 = 15, diff = -5
  const farX = api.fsMagnet(p2, 'x', 2, 1);
  assert.strictEqual(farX, null, 'should return null when far');
  p2.x = 21;

  // Snapping z to another part top (p2.z0 = 31, p1.z1 = 30, diff = -1)
  const snapZ = api.fsMagnet(p2, 'z', 2, 1);
  assert.ok(snapZ, 'should snap z to another part top within tolerance');
  assert.strictEqual(snapZ.v, 30);
  assert.strictEqual(snapZ.d, -1);

  // Far away in Z returns null
  p2.z = 50;
  const farZ = api.fsMagnet(p2, 'z', 2, 1);
  assert.strictEqual(farZ, null, 'should return null when z is far');

  // fsMoveAxis: rounds to 1 cm when nothing to snap
  const guides = [];
  const pAlone = { type: 'box', x: 0, y: 0, z: 10, w: 10, d: 10, h: 10 };
  api.ui.pb = { d: { w: 100, d: 60, h: 75, parts: [pAlone] }, snap: true };

  api.fsMoveAxis(pAlone, 'x', 14.3, 0.5, 0, guides);
  assert.strictEqual(pAlone.x, 14, 'rounds 14.3 to 14 cm');

  api.fsMoveAxis(pAlone, 'x', 14.7, 0.5, 0, guides);
  assert.strictEqual(pAlone.x, 15, 'rounds 14.7 to 15 cm');

  // fsMoveAxis: never lets z go below 0
  api.fsMoveAxis(pAlone, 'z', -5, 0.5, 0, guides);
  assert.strictEqual(pAlone.z, 0, 'z clamped to 0 when negative');

  api.fsMoveAxis(pAlone, 'z', -0.2, 0.5, 0, guides);
  assert.strictEqual(pAlone.z, 0, 'z clamped to 0 when slightly negative');
});

test('(6) fsAddBlock: a leg lands at z 0, a top at h-3, a cushion sits on top of the highest part under it, and nothing is added past PARTS_MAX', () => {
  api.fsNew(); // blank 100 x 60 x 75
  assert.strictEqual(api.ui.pb.d.parts.length, 0);

  // Add leg -> z 0
  api.fsAddBlock('leg');
  assert.strictEqual(api.ui.pb.d.parts.length, 1);
  const leg = api.ui.pb.d.parts[0];
  assert.strictEqual(leg.type, 'box');
  assert.strictEqual(leg.z, 0, 'leg lands at z 0');

  // Add top -> z at h - 3
  api.fsAddBlock('top');
  assert.strictEqual(api.ui.pb.d.parts.length, 2);
  const top = api.ui.pb.d.parts[1];
  assert.strictEqual(top.type, 'box');
  assert.strictEqual(top.z, api.ui.pb.d.h - 3, 'top lands at h - 3');

  // Cushion sits on top of the highest part under it
  api.fsNew();
  const seatBase = api.cleanPart({ type: 'box', x: 0, y: 0, z: 0, w: 90, d: 50, h: 42 });
  api.ui.pb.d.parts.push(seatBase);
  api.fsAddBlock('cushion');
  const cushion = api.ui.pb.d.parts[api.ui.pb.d.parts.length - 1];
  assert.strictEqual(cushion.z, 42, 'cushion sits on top of seat base at z 42');

  // Nothing is added past PARTS_MAX
  while (api.ui.pb.d.parts.length < api.PARTS_MAX) {
    api.ui.pb.d.parts.push(api.cleanPart({ type: 'box', x: 0, y: 0, z: 0, w: 10, d: 10, h: 10 }));
  }
  assert.strictEqual(api.ui.pb.d.parts.length, api.PARTS_MAX);
  api.fsAddBlock('leg');
  assert.strictEqual(api.ui.pb.d.parts.length, api.PARTS_MAX, 'nothing added past PARTS_MAX');
  assert.match(api.toast(), new RegExp(String(api.PARTS_MAX)), 'toast warns about PARTS_MAX');
});

test('(7) fsAct mirror negates x, ontop only counts parts below, fit grows the box', () => {
  // Mirror negates x
  api.fsNew();
  const leg1 = api.cleanPart({ name: 'leg', type: 'box', x: 30, y: 20, z: 0, w: 5, d: 5, h: 40 });
  api.ui.pb.d.parts = [leg1];
  api.ui.pb.sel = 0;
  api.fsAct('mirror');
  assert.strictEqual(api.ui.pb.d.parts.length, 2);
  assert.strictEqual(api.ui.pb.sel, 1);
  const leg2 = api.ui.pb.d.parts[1];
  assert.strictEqual(leg2.x, -30, 'mirror negates x');
  assert.strictEqual(leg2.y, 20);

  // Ontop only counts parts below
  api.fsNew();
  const lower = api.cleanPart({ type: 'box', x: 0, y: 0, z: 0, w: 40, d: 40, h: 20 }); // z 0..20
  const middle = api.cleanPart({ type: 'box', x: 0, y: 0, z: 28, w: 40, d: 40, h: 10 }); // z 28..38
  const upper = api.cleanPart({ type: 'box', x: 0, y: 0, z: 50, w: 40, d: 40, h: 10 }); // z 50..60
  api.ui.pb.d.parts = [lower, middle, upper];
  api.ui.pb.sel = 1; // select middle part (z0 is 28)
  api.fsAct('ontop');
  assert.strictEqual(api.ui.pb.d.parts[1].z, 20, 'middle part lands on lower part top (20), upper part ignored');

  // Fit grows the box
  api.ui.pb.d.w = 40;
  api.ui.pb.d.d = 30;
  api.ui.pb.d.h = 25;
  api.ui.pb.d.parts = [
    api.cleanPart({ type: 'box', x: 0, y: 0, z: 0, w: 90, d: 60, h: 55 })
  ];
  api.fsAct('fit');
  assert.ok(api.ui.pb.d.w >= 90, 'box width grew to fit parts');
  assert.ok(api.ui.pb.d.d >= 60, 'box depth grew to fit parts');
  assert.ok(api.ui.pb.d.h >= 55, 'box height grew to fit parts');
});

test('(8) pbApply refuses with errors, updates an existing item keeping its scale, and for a new draft (ui.pb.id null) pushes one new furniture item into F().furn plus a library preset and commits once', () => {
  // pbApply refuses when pbIssues has errors
  const obj = { id: 'furn1', w: 100, d: 50, h: 75, k: 'rect' };
  api.setFind({ o: obj });
  api.ui.pb = {
    id: 'furn1',
    d: {
      w: 100, d: 50, h: 75,
      parts: [{ name: 'bad', type: 'box', x: 200, y: 0, z: 0, w: 10, d: 10, h: 10 }]
    },
    sel: 0
  };
  api.resetCommitted();
  api.pbApply();
  assert.strictEqual(api.getCommitted(), 0, 'pbApply must refuse to commit when issues have errors');
  assert.ok(!('parts' in obj), 'target object must not receive parts when pbIssues has errors');

  // Updates an existing item keeping its scale
  const big = {
    id: 'furn2', w: 200, d: 50, h: 75, k: 'rect',
    pbase: { w: 100, d: 50, h: 75 },
    parts: [{ type: 'box', x: 0, y: 0, z: 0, w: 100, d: 50, h: 75 }]
  };
  api.setFind({ o: big });
  api.ui.pb = {
    id: 'furn2', sel: 0,
    d: { w: 120, d: 50, h: 75, parts: [{ type: 'box', x: 0, y: 0, z: 0, w: 120, d: 50, h: 75 }] }
  };
  api.resetCommitted();
  api.pbApply();
  assert.strictEqual(api.getCommitted(), 1, 'pbApply must commit once on update');
  assert.strictEqual(big.w, 240, 'draft width 120 x item scale 2 = 240');
  assert.deepStrictEqual(big.pbase, { w: 120, d: 50, h: 75 });
  assert.strictEqual(big.parts.length, 1);

  // New draft (ui.pb.id null) pushes into F().furn plus library preset and commits once
  api.resetP();
  api.resetCommitted();
  api.resetModalClosed();
  api.ui.pb = {
    id: null,
    name: 'Custom Armchair',
    name0: 'Custom Armchair',
    sel: 0,
    d: {
      w: 80, d: 80, h: 90, color: '#2b3a4a',
      parts: [
        { name: 'seat', type: 'box', x: 0, y: 0, z: 40, w: 80, d: 80, h: 10 },
        { name: 'leg', type: 'cyl', x: -30, y: -30, z: 0, w: 5, d: 5, h: 40 }
      ]
    }
  };
  api.pbApply();
  assert.strictEqual(api.getCommitted(), 1, 'pbApply must commit once for new draft');
  assert.strictEqual(api.getModalClosed(), true, 'closeModal must be called');
  const furnList = api.getF().furn;
  assert.strictEqual(furnList.length, 1, 'one furniture item added to current floor');
  const created = furnList[0];
  assert.strictEqual(created.name, 'Custom Armchair');
  assert.strictEqual(created.w, 80);
  assert.strictEqual(created.d, 80);
  assert.strictEqual(created.h, 90);
  assert.strictEqual(created.parts.length, 2);
  assert.deepStrictEqual(created.pbase, { w: 80, d: 80, h: 90 });
  assert.strictEqual(created.partsV, 1);
  const presets = api.getP().lib.presets;
  assert.strictEqual(presets.length, 1, 'one preset pushed to library');
  assert.strictEqual(presets[0].name, 'Custom Armchair');
});

test('(9) every FURN_TEMPLATES entry has tr/en/icon/w/d/h/color and its parts validate with validateParts at default size', () => {
  const tpls = api.FURN_TEMPLATES;
  const keys = Object.keys(tpls);
  assert.ok(keys.length >= 4, 'should have multiple FURN_TEMPLATES entries');

  for (const [key, t] of Object.entries(tpls)) {
    assert.ok(typeof t.tr === 'string' && t.tr.length > 0, `${key} missing tr`);
    assert.ok(typeof t.en === 'string' && t.en.length > 0, `${key} missing en`);
    assert.ok(typeof t.icon === 'string' && t.icon.length > 0, `${key} missing icon`);
    assert.ok(typeof t.w === 'number' && t.w > 0, `${key} invalid w`);
    assert.ok(typeof t.d === 'number' && t.d > 0, `${key} invalid d`);
    assert.ok(typeof t.h === 'number' && t.h > 0, `${key} invalid h`);
    assert.ok(typeof t.color === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(t.color), `${key} invalid color: ${t.color}`);
    assert.strictEqual(typeof t.parts, 'function', `${key} parts must be a function`);

    const parts = t.parts(t.w, t.d, t.h).map(api.cleanPart);
    const obj = { w: t.w, d: t.d, h: t.h, color: t.color, parts, pbase: { w: t.w, d: t.d, h: t.h } };
    const res = api.validateParts(obj);
    assert.strictEqual(res.ok, true, `template ${key} failed validation: ${res.errors.join('; ')}`);
    assert.strictEqual(res.errors.length, 0);
  }
});

test('(10) source guards: the window keydown handler routes to fsKey when ui.modal is "parts", closeModal calls fsClose for the studio, My Library shows a data-fsnew card, cmdList has a furnstudio command', () => {
  // window keydown handler routes to fsKey when ui.modal is "parts"
  assert.match(src, /window\.addEventListener\('keydown'[\s\S]*?if\s*\(\s*ui\.modal\s*===\s*'parts'\s*\)\s*\{\s*fsKey\(e\);\s*return;\s*\}/, 'keydown handler must route to fsKey when ui.modal === "parts"');

  // closeModal calls fsClose for the studio
  assert.match(src, /function\s+closeModal\(\)\s*\{[\s\S]*?if\s*\(\s*ui\.modal\s*===\s*'parts'\s*\)\s*fsClose\(\);/, 'closeModal must call fsClose() when ui.modal === "parts"');

  // My Library shows a data-fsnew card
  assert.match(src, /data-fsnew=["']?1?["']?/, 'My Library must include data-fsnew card');

  // cmdList has a furnstudio command
  assert.match(src, /act\(\s*['"]furnstudio['"]/, 'command palette must include furnstudio command');
});
