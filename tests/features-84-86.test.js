/* Tests for issues #84 (furniture label/icon toggles), #85 (per-floor 3D visibility), and #86 (cross-floor groups). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js');
const html = read('index.html');

function constLine(name) {
  const start = src.indexOf(`const ${name} =`);
  assert.ok(start >= 0, `const ${name} not found in app.js`);
  const end = src.indexOf('\n', start);
  return src.slice(start, end >= 0 ? end : src.length).trim();
}

// ---------- (A) Issue #84: furniture label / icon toggles ----------

function makeFurnEnv() {
  const fn = new Function(`
    const layersVis = { furnLabel: true, furnIcon: true };
    const pal = () => ({ text: '#111111', sub: '#555555', halo: '#ffffff', outline: false });
    const furnElev = () => 0;
    const furnTilted = () => false;
    const furnBody = () => '<rect x="-30" y="-30" width="60" height="60"/>';
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const esc = s => String(s);
    ${fnSrcOf(src, 'furnSvg')}
    return { furnSvg, layersVis };
  `);
  return fn();
}

test('(A1) layersVis declares furnLabel and furnIcon as true by default', () => {
  assert.match(src, /layersVis\s*=\s*\{[^}]*furnLabel:\s*true[^}]*furnIcon:\s*true/);
});

test('(A2) furnSvg toggles label and icon independently without mutating item', () => {
  const env = makeFurnEnv();
  const item = { id: 'f1', x: 100, y: 200, rot: 0, w: 60, d: 60, k: 'rect', icon: '🛋️', label: 'Koltuk' };
  const snapshot = JSON.parse(JSON.stringify(item));

  // Both shown by default
  env.layersVis.furnLabel = true;
  env.layersVis.furnIcon = true;
  const both = env.furnSvg(item, true);
  assert.ok(both.includes('🛋️'), 'icon should be shown by default');
  assert.ok(both.includes('Koltuk'), 'label should be shown by default');
  assert.ok(both.includes('<rect '), 'body should be present');

  // furnLabel false hides only the label
  env.layersVis.furnLabel = false;
  env.layersVis.furnIcon = true;
  const iconOnly = env.furnSvg(item, true);
  assert.ok(iconOnly.includes('🛋️'), 'icon should remain when furnLabel is false');
  assert.ok(!iconOnly.includes('Koltuk'), 'label should be hidden when furnLabel is false');

  // furnIcon false hides only the icon
  env.layersVis.furnLabel = true;
  env.layersVis.furnIcon = false;
  const labelOnly = env.furnSvg(item, true);
  assert.ok(!labelOnly.includes('🛋️'), 'icon should be hidden when furnIcon is false');
  assert.ok(labelOnly.includes('Koltuk'), 'label should remain when furnIcon is false');

  // Both false hides both while the body stays
  env.layersVis.furnLabel = false;
  env.layersVis.furnIcon = false;
  const neither = env.furnSvg(item, true);
  assert.ok(!neither.includes('🛋️'), 'icon should be hidden when both false');
  assert.ok(!neither.includes('Koltuk'), 'label should be hidden when both false');
  assert.ok(neither.includes('<rect '), 'body should stay when both are false');

  assert.deepStrictEqual(item, snapshot);
});

test('(A3) projectPanel lists furnLabel and furnIcon in the layer checkbox list', () => {
  const pp = fnSrcOf(src, 'projectPanel');
  assert.match(pp, /furnLabel/);
  assert.match(pp, /furnIcon/);
});

// ---------- (B) Issue #85: per-floor 3D visibility ----------

function makeV3dEnv() {
  const fn = new Function(`
    let P = { wallH: 270, floors: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
    let fi = 0;
    const ui = { v3dHide: new Set() };
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    ${constLine('floorH')}
    ${constLine('floorElev')}
    ${constLine('v3dShown')}
    ${fnSrcOf(src, 'v3dBase')}
    ${fnSrcOf(src, 'v3dElev')}
    ${fnSrcOf(src, 'v3dPrune')}
    ${fnSrcOf(src, 'v3dOnly')}
    ${fnSrcOf(src, 'v3dToggle')}
    ${fnSrcOf(src, 'walkFloorIdx')}
    return {
      v3dShown, v3dBase, v3dElev, v3dPrune, v3dOnly, v3dToggle, walkFloorIdx,
      setP: p => { P = p; },
      getP: () => P,
      setFi: i => { fi = i; },
      getUi: () => ui,
    };
  `);
  return fn();
}

test('(B1) v3dElev, v3dToggle, v3dOnly, v3dPrune, and walkFloorIdx behavior', () => {
  const env = makeV3dEnv();
  const floors = () => env.getP().floors;

  // All shown by default and v3dElev gives 0, 290, 580
  assert.deepStrictEqual(floors().map(env.v3dShown), [true, true, true]);
  assert.strictEqual(env.v3dElev(0), 0);
  assert.strictEqual(env.v3dElev(1), 290);
  assert.strictEqual(env.v3dElev(2), 580);

  // Hiding c keeps a at 0 and b at 290
  env.v3dToggle('c', false);
  assert.strictEqual(env.v3dShown(floors()[2]), false);
  assert.strictEqual(env.v3dElev(0), 0);
  assert.strictEqual(env.v3dElev(1), 290);

  // Hiding a as well leaves b at 0
  env.v3dToggle('a', false);
  assert.deepStrictEqual(floors().map(env.v3dShown), [false, true, false]);
  assert.strictEqual(env.v3dElev(1), 0);

  // v3dOnly('c') shows only c at elevation 0
  env.v3dOnly('c');
  assert.deepStrictEqual(floors().map(env.v3dShown), [false, false, true]);
  assert.strictEqual(env.v3dElev(2), 0);

  // v3dToggle cannot hide the last visible floor
  env.v3dToggle('c', false);
  assert.strictEqual(env.v3dShown(floors()[2]), true);

  // v3dOnly('all') shows all
  env.v3dOnly('all');
  assert.deepStrictEqual(floors().map(env.v3dShown), [true, true, true]);

  // walkFloorIdx returns fi when that floor is visible and otherwise the lowest visible floor index
  env.setFi(1);
  assert.strictEqual(env.walkFloorIdx(), 1);
  env.v3dToggle('a', false);
  env.v3dToggle('b', false); // only c (index 2) is visible
  assert.strictEqual(env.walkFloorIdx(), 2);
  env.v3dOnly('all');
  env.v3dToggle('a', false); // b (1) and c (2) visible, fi = 0 -> lowest visible is 1
  env.setFi(0);
  assert.strictEqual(env.walkFloorIdx(), 1);

  // After removing a floor from P.floors, v3dPrune drops its id
  env.v3dOnly('all');
  env.v3dToggle('c', false);
  assert.ok(env.getUi().v3dHide.has('c'));
  env.setP({ wallH: 270, floors: [{ id: 'a' }, { id: 'b' }] });
  env.v3dPrune();
  assert.strictEqual(env.getUi().v3dHide.has('c'), false);

  // If the only visible floor was removed, everything becomes visible again
  env.setP({ wallH: 270, floors: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
  env.v3dOnly('c');
  env.setP({ wallH: 270, floors: [{ id: 'a' }, { id: 'b' }] });
  env.v3dPrune();
  assert.strictEqual(env.getUi().v3dHide.size, 0);
  assert.deepStrictEqual(env.getP().floors.map(env.v3dShown), [true, true]);
});

test('(B2) issue #85 source wiring in app.js and index.html', () => {
  const build3DSrc = fnSrcOf(src, 'build3D');
  assert.match(build3DSrc, /\bv3dShown\b/);
  assert.match(build3DSrc, /\bv3dElev\b/);
  assert.doesNotMatch(src, /ui\.v3dFloor\b/);
  assert.match(html, /id=["']b3dFloors["']/);
  assert.match(fnSrcOf(src, 'sync3DFloors'), /custom/);
});

// ---------- (C) Issue #86: cross-floor groups ----------

test('(C1) issue #86 functions and wiring exist in app.js', () => {
  for (const name of ['grpLinked', 'withFloor', 'grpAlignVars', 'grpMirror', 'linkGroupTo', 'unlinkGroup', 'grpLinkHtml']) {
    assert.ok(fnSrcOf(src, name), `${name}() should exist in app.js`);
  }

  const sw = fnSrcOf(src, 'switchGroupVarTo');
  assert.match(sw, /grpLinked\s*\(\s*rec\.id\s*\)/);
  assert.match(sw, /withFloor\s*\(/);
  assert.match(sw, /applyVarPoses/);
  assert.match(sw, /commit\s*\(\s*\)/);

  assert.match(fnSrcOf(src, 'varAction'), /grpMirror\s*\(/);
  assert.match(fnSrcOf(src, 'variantUIHtml'), /grpLinkHtml\s*\(\s*\)/);

  const ap = fnSrcOf(src, 'applyProp');
  assert.match(ap, /k\s*===\s*['"]grplink['"][\s\S]*?linkGroupTo\s*\(/);

  // Props click handler handles grpUnlink
  assert.match(src, /a\s*===\s*['"]grpUnlink['"][\s\S]*?unlinkGroup\s*\(/);

  // Floor duplicate handler remaps o.grp to fresh ids via gm[o.grp]
  assert.match(src, /dataset\.fa\s*===\s*['"]dup['"][\s\S]*?gm\s*\[\s*o\.grp\s*\]/);
});

test('(C2) grpLinked and withFloor runtime behavior', () => {
  const fn = new Function(`
    let P = {
      floors: [
        { id: 'f0', groups: [{ id: 'g1' }] },
        { id: 'f1', groups: [{ id: 'g1' }] },
        { id: 'f2', groups: [] },
      ],
    };
    let fi = 0;
    ${fnSrcOf(src, 'grpLinked')}
    ${fnSrcOf(src, 'withFloor')}
    return {
      grpLinked,
      withFloor,
      getFi: () => fi,
      getP: () => P,
    };
  `);
  const env = fn();

  const linked = env.grpLinked('g1');
  assert.strictEqual(linked.length, 2);
  assert.strictEqual(linked[0].i, 0);
  assert.strictEqual(linked[0].rec, env.getP().floors[0].groups[0]);
  assert.strictEqual(linked[1].i, 1);
  assert.strictEqual(linked[1].rec, env.getP().floors[1].groups[0]);

  let seenFi = -1;
  const res = env.withFloor(1, () => {
    seenFi = env.getFi();
    return 'ok';
  });
  assert.strictEqual(res, 'ok');
  assert.strictEqual(seenFi, 1);
  assert.strictEqual(env.getFi(), 0);

  assert.throws(() => {
    env.withFloor(1, () => {
      assert.strictEqual(env.getFi(), 1);
      throw new Error('boom');
    });
  }, /boom/);
  assert.strictEqual(env.getFi(), 0);
});
