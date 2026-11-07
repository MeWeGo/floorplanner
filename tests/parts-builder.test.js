/* Parts editor modal (multi-part furniture):
   draft initialization (pbStart), validation (pbIssues),
   SVG preview generation (pbPreview), commit wiring (pbApply),
   and DOM/event source guards. */
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

const api = new Function(`
  const L = (tr, en) => en;
  const esc = s => String(s);
  const pal = () => ({ furnStroke: '#333', accent: '#00f', sub: '#888', stroke: '#000' });
  const clonePlain = v => JSON.parse(JSON.stringify(v));
  let toastMsg = null;
  const toast = msg => { toastMsg = msg; };
  let modalClosed = false;
  const closeModal = () => { modalClosed = true; };
  let committed = 0;
  const commit = () => { committed++; };
  let refreshed = 0;
  const refresh = () => { refreshed++; };
  let findTarget = null;
  const find = id => findTarget;
  let openPartsBuilderCalled = 0;
  const openPartsBuilder = () => { openPartsBuilderCalled++; };
  let T3 = null;
  const schedBuild3D = () => {};

  ${engineOf(src)}

  ${lineSrc('PB_TYPES')}
  ${lineSrc('PB_MATS')}
  ${lineSrc('PB_AXES')}
  ${lineSrc('hex6')}
  ${fnSrc('partShapeSvg')}

  const ui = { pb: null, view3d: false };

  ${fnSrc('pbStart')}
  ${fnSrc('pbIssues')}
  ${fnSrc('pbMsgs')}
  ${fnSrc('pbPreview')}
  ${fnSrc('pbList')}
  ${fnSrc('pbFields')}
  ${fnSrc('pbApply')}

  return {
    ui, L, esc, pal, clonePlain,
    cleanPart, partBounds, validateParts,
    pbStart, pbIssues, pbMsgs, pbPreview, pbList, pbFields, pbApply,
    toast: () => toastMsg,
    setFind: f => { findTarget = f; },
    getCommitted: () => committed,
    resetCommitted: () => { committed = 0; },
    getModalClosed: () => modalClosed,
    resetModalClosed: () => { modalClosed = false; },
    getOpenPartsBuilderCalled: () => openPartsBuilderCalled,
    resetOpenPartsBuilderCalled: () => { openPartsBuilderCalled = 0; }
  };
`)();

test('(1) pbStart builds the right draft for items with parts, plain rect, round, and poly', () => {
  // Item with existing parts and pbase
  const itemWithParts = {
    id: 'f1', k: 'rect', w: 200, d: 100, h: 80,
    pbase: { w: 100, d: 50, h: 40 },
    color: '#8b4513',
    parts: [{ type: 'box', x: 0, y: 0, z: 0, w: 100, d: 50, h: 10, color: '#8b4513' }]
  };
  api.resetOpenPartsBuilderCalled();
  api.pbStart(itemWithParts);
  assert.strictEqual(api.getOpenPartsBuilderCalled(), 1, 'openPartsBuilder must be invoked');
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
});

test('(2) pbIssues flags a part sticking out of the box, above item height, floating parts, and passes valid table', () => {
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

test('(3) pbPreview returns two svg figures, has one data-pi group per part in each view and draws the selected part highlight with accent colour', () => {
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
  const prev = api.pbPreview();
  const figures = [...prev.matchAll(/<figure>[\s\S]*?<\/figure>/g)];
  assert.strictEqual(figures.length, 2, 'pbPreview must return two figures');
  assert.match(figures[0][0], /<figcaption>Top/);
  assert.match(figures[1][0], /<figcaption>Front/);

  for (const [idx, fig] of figures.entries()) {
    const piMatches = [...fig[0].matchAll(/<g\s+data-pi="(\d+)">/g)].map(m => m[1]);
    assert.strictEqual(piMatches.length, 2, `figure ${idx} must contain one data-pi group per part`);
    assert.ok(piMatches.includes('0') && piMatches.includes('1'), `figure ${idx} must include part 0 and part 1`);
    assert.match(fig[0], /stroke="#00f"/, `figure ${idx} must draw the selected part highlight with accent color`);
  }
});

test('(4) source guards: furniture panel button, #props click handler, keydown early return, and pbApply commit check', () => {
  // Furniture panel has data-act="parts" button with both bilingual labels
  assert.match(src, /data-act="parts"/, 'furniture panel must include data-act="parts" button');
  assert.match(src, /data-act="parts"[\s\S]*?'Edit parts'[\s\S]*?'Build from parts'/, 'button must have both Edit parts and Build from parts labels');

  // #props click handler delegates 'parts' action to pbStart
  assert.match(src, /\$\('#props'\)\.addEventListener\('click'[\s\S]*?if\s*\(\s*a\s*===\s*'parts'\s*\)[\s\S]*?pbStart\(/, '#props click handler must call pbStart');

  // window keydown handler returns early when ui.modal === 'parts'
  assert.match(src, /window\.addEventListener\('keydown'[\s\S]*?if\s*\(\s*ui\.modal\s*===\s*'parts'\s*\)[\s\S]*?return;/, 'keydown handler must return early when ui.modal === "parts"');

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

  // pbApply commits once when valid
  api.ui.pb = {
    id: 'furn1',
    d: {
      w: 100, d: 50, h: 75,
      parts: [
        { name: 'top', type: 'box', x: 0, y: 0, z: 72, w: 100, d: 50, h: 3 },
        { name: 'leg', type: 'cyl', x: -45, y: -20, z: 0, w: 4, d: 4, h: 72 }
      ]
    },
    sel: 0
  };
  api.resetCommitted();
  api.pbApply();
  assert.strictEqual(api.getCommitted(), 1, 'pbApply must call commit() exactly once');
  assert.strictEqual(obj.parts.length, 2);
  assert.deepStrictEqual(obj.pbase, { w: 100, d: 50, h: 75 });
  assert.strictEqual(obj.partsV, 1);

  // an item that was resized to 2x its design box keeps that scale after Apply
  const big = { id: 'furn2', w: 200, d: 50, h: 75, k: 'rect', pbase: { w: 100, d: 50, h: 75 }, parts: [{ type: 'box', x: 0, y: 0, z: 0, w: 100, d: 50, h: 75 }] };
  api.setFind({ o: big });
  api.ui.pb = { id: 'furn2', sel: 0, d: { w: 120, d: 50, h: 75, parts: [{ type: 'box', x: 0, y: 0, z: 0, w: 120, d: 50, h: 75 }] } };
  api.pbApply();
  assert.strictEqual(big.w, 240, 'draft width 120 × item scale 2');
  assert.deepStrictEqual(big.pbase, { w: 120, d: 50, h: 75 });
});
