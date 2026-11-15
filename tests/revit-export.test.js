/* Floor Planner → Revit export.
   The REVIT-MESH block of app.js (prisms, ellipsoids, part and item transforms) runs on its own here:
   every solid must keep its volume, face outward in Revit's right-handed frame (y up) and land where the
   plan puts it. The pyRevit add-in itself is tested with a mocked Revit API in tests/revit-addin/. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { read } = require('./helpers/repo');

const src = read('app.js');
const ROOT = path.join(__dirname, '..');

function sliceFunc(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found in app.js`);
  return src.slice(start, src.indexOf('\n}', start) + 2);
}
function block() {
  const a = src.indexOf('/* REVIT-MESH:BEGIN */'), b = src.indexOf('/* REVIT-MESH:END */');
  assert.ok(a > 0 && b > a, 'REVIT-MESH block not found');
  return src.slice(a, b);
}
const M = new Function(`
  const NO_TILT_K = new Set(['stairs', 'ramp', 'roof']), furnTilted = o => !!(o && !NO_TILT_K.has(o.k) && (+o.rx || +o.ry));
  ${sliceFunc('partRotM')}
  ${block()}
  return { REVIT_FT, rvPrism, rvSphere, rvPartFaces, rvPlace, rvCyc, rvEllipse };
`)();

// signed volume of a closed face set (divergence theorem, fan triangulation)
const vol = faces => {
  let v = 0;
  for (const f of faces) for (let i = 1; i + 1 < f.length; i++) {
    const a = f[0], b = f[i], c = f[i + 1];
    v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  return v / 6;
};
const ext = (faces, k) => { const v = faces.flat().map(p => p[k]); return [Math.min(...v), Math.max(...v)]; };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('prisms face outward whichever way the outline winds', () => {
  const sq = [[0, 0], [100, 0], [100, 50], [0, 50]];
  near(vol(M.rvPrism(sq.slice().reverse(), 0, 10)), 50000, 1e-6, 'CW outline');
  near(vol(M.rvPrism(sq, 0, 10)), 50000, 1e-6, 'volume');
  const L = [[0, 0], [100, 0], [100, 30], [30, 30], [30, 100], [0, 100]]; // concave L
  near(vol(M.rvPrism(L, 0, 10)), (100 * 30 + 30 * 70) * 10, 1e-6, 'concave L');
});

test('part shapes keep their volume and size', () => {
  const box = M.rvPartFaces({ type: 'box', x: 0, y: 0, z: 0, w: 40, d: 20, h: 10 });
  near(vol(box), 8000, 1e-6, 'box');
  assert.deepStrictEqual(ext(box, 2), [0, 10], 'z runs from the part bottom');
  const cyl = M.rvPartFaces({ type: 'cyl', x: 0, y: 0, z: 0, w: 20, d: 20, h: 50 });
  near(vol(cyl), Math.PI * 100 * 50, Math.PI * 100 * 50 * 0.03, 'upright cylinder (16-gon)');
  for (const axis of ['x', 'y']) {
    const c = M.rvPartFaces({ type: 'cyl', axis, x: 0, y: 0, z: 0, w: 60, d: 20, h: 20 });
    assert.ok(vol(c) > 0, `lying cylinder ${axis} faces outward`);
    near(ext(c, 2)[1] - ext(c, 2)[0], 20, 1e-6, `lying cylinder ${axis} height`);
    near(ext(c, 0)[1] - ext(c, 0)[0], axis === 'x' ? 60 : 60, 1e-6, `lying cylinder ${axis} bounding box x`);
  }
  const sph = M.rvPartFaces({ type: 'sphere', x: 0, y: 0, z: 0, w: 30, d: 30, h: 30 });
  near(vol(sph), 4 / 3 * Math.PI * 15 ** 3, 4 / 3 * Math.PI * 15 ** 3 * 0.15, 'sphere');
  const ex = M.rvPartFaces({ type: 'extrude', x: 0, y: 0, z: 0, w: 10, d: 10, h: 5, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }] });
  near(vol(ex), 250, 1e-6, 'extruded triangle');
});

test('part position, plan y flip and rotation', () => {
  const b = M.rvPartFaces({ type: 'box', x: 30, y: 20, z: 5, w: 10, d: 10, h: 10 });
  assert.deepStrictEqual(ext(b, 0), [25, 35]);
  assert.deepStrictEqual(ext(b, 1), [-25, -15], 'plan +y (down) is Revit −y');
  const r = M.rvPartFaces({ type: 'box', x: 0, y: 0, z: 0, w: 40, d: 10, h: 10, rot: 90 });
  near(vol(r), 4000, 1e-6, 'rotation keeps volume');
  near(ext(r, 1)[1] - ext(r, 1)[0], 40, 1e-6, 'a 90° part is long along y');
  const t = M.rvPartFaces({ type: 'box', x: 0, y: 0, z: 0, w: 40, d: 10, h: 10, rx: 37, ry: 12, rot: 50 });
  near(vol(t), 4000, 1e-6, 'tilted part keeps volume (proper rotation)');
});

test('items are placed in feet with the plan rotation and tilt', () => {
  const ft = M.REVIT_FT;
  const unit = M.rvPartFaces({ type: 'box', x: 50, y: 0, z: 0, w: 10, d: 10, h: 10 }); // 50 cm to the item's right
  const o = { x: 300, y: 200, rot: 90, w: 110, d: 10, h: 10 };
  const p = M.rvPlace(unit, o, 0);
  // plan: rot 90 turns local +x to plan +y (down on screen) → plan (300, 250) → Revit (300, −250) cm
  near((ext(p, 0)[0] + ext(p, 0)[1]) / 2 * ft, 300, 0.01, 'x');
  near((ext(p, 1)[0] + ext(p, 1)[1]) / 2 * ft, -250, 0.01, 'y');
  near(vol(p) * ft ** 3, 1000, 0.1, 'volume in feet');
  const lifted = M.rvPlace(unit, o, 100);
  near(ext(lifted, 2)[0] * ft, 100, 1e-3, 'level / elevation offset');
  const box = M.rvPartFaces({ type: 'box', x: 0, y: 0, z: 0, w: 200, d: 90, h: 80 });
  const lying = M.rvPlace(box, { x: 0, y: 0, rot: 0, w: 200, d: 90, h: 80, rx: 90 }, 0);
  near(ext(lying, 2)[0], 0, 1e-6, 'a tilted item rests on the floor');
  near(ext(lying, 2)[1] * ft, 90, 1e-3, 'laid on its back it is as tall as it was deep');
  assert.ok(vol(lying) > 0, 'still faces outward');
});

test('app wiring: button, command, export file name', () => {
  assert.match(read('index.html'), /id="bRevit"/);
  // the buttons and commands go through the IFC-or-Revit explainer (exportBim), which downloads directly once skipped
  assert.match(src, /\$\('#bRevit'\)\.onclick = \(\) => exportBim\('revit'\)/);
  assert.match(src, /\$\('#bIfc'\)\.onclick = \(\) => exportBim\('ifc'\)/);
  assert.match(src, /act\('revit',[^\n]*exportBim\('revit'\)/);
  assert.match(src, /act\('ifc',[^\n]*exportBim\('ifc'\)/);
  assert.match(src, /act\('bimhelp',[^\n]*exportBim\('ifc', true\)/);
  assert.match(src, /fname\('fp-revit\.json'\)/);
  assert.match(src, /format: 'floorplanner-revit', v: 1, units: 'ft'/);
});

test('IFC or Revit explainer: skip switch, both cards, bilingual', () => {
  const start = src.indexOf('function bimSkip('), end = src.indexOf('async function projectsModal(');
  assert.ok(start > 0 && end > start, 'explainer block not found');
  const blk = src.slice(start, end);
  // skipped => the clicked format downloads at once; force (command line) always shows the dialog
  assert.match(blk, /if \(!force && bimSkip\(\)\) \{ if \(kind === 'revit'\) downloadRevit\(\); else downloadIfc\(\); return; \}/);
  assert.match(blk, /localStorage\.setItem\('fp_bim_skip'/);
  assert.match(blk, /card\('ifc'/);
  assert.match(blk, /card\('revit'/);
  assert.match(blk, /data-bimdl/);
  assert.match(blk, /kind === k \? ' on' : ''/, 'the clicked format is highlighted');
  assert.match(blk, /github\.com\/MeWeGo\/floorplanner\/tree\/main\/revit/, 'Revit card links to the add-in');
  // every visible string goes through L(tr, en)
  assert.ok((blk.match(/\bL\(/g) || []).length >= 14, 'explainer text is not bilingual');
  assert.match(read('style.css'), /\.bimgrid\s*\{/);
});

test('add-in files exist, family map is valid JSON, Python stays IronPython 2.7 compatible', () => {
  const ext = path.join(ROOT, 'revit', 'FloorPlanner.extension');
  const map = JSON.parse(fs.readFileSync(path.join(ext, 'family-map.json'), 'utf8'));
  for (const k of ['door', 'double', 'slide', 'window']) assert.ok(map.openings[k], 'opening family for ' + k);
  const py = ['lib/fp_core.py', 'lib/fp_build.py', 'FloorPlanner.tab/Floor Planner.panel/Import Plan.pushbutton/script.py'];
  for (const f of py) {
    const s = fs.readFileSync(path.join(ext, f), 'utf8');
    assert.doesNotMatch(s, /\bf(['"])[^'"\n]*\{|^\s*nonlocal\b|:=|^\s*async\s+def/m, f + ' uses Python-3-only syntax');
  }
  const fx = JSON.parse(read('tests/fixtures/revit-sample.fp-revit.json'));
  assert.strictEqual(fx.format, 'floorplanner-revit');
  for (const it of fx.items) assert.ok(it.faces.length && it.mats.length, 'fixture item has geometry');
});

test('pyRevit add-in unit tests (mocked Revit API)', t => {
  const py = ['python3', 'python', 'py'].find(c => { try { return spawnSync(c, ['--version']).status === 0; } catch (e) { return false; } });
  if (!py) { t.skip('no Python found'); return; }
  const r = spawnSync(py, ['-m', 'unittest', 'discover', '-s', path.join(ROOT, 'tests', 'revit-addin'), '-t', path.join(ROOT, 'tests', 'revit-addin')], { cwd: ROOT, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, (r.stdout || '') + (r.stderr || ''));
});
