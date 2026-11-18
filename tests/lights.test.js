/* Tests for light fixtures (#120): LIGHT-PARAM parity, lightP/kelvinHex/cleanLight/ceilElev,
   app.js/Revit/IFC wiring, lightSvg rendering, and MCP add_furniture/set_lights roundtrip. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, markerBlock, mcpClient } = require('./helpers/repo');

const src = read('app.js');
const mcpSrc = read('mcp/server.js');
const fpCorePy = read('revit/FloorPlanner.extension/lib/fp_core.py');

function loadLightParam() {
  return new Function(`
    ${markerBlock(src, 'LIGHT-PARAM')}
    return {
      LIGHT_DEFS, LIGHT_LM_MIN, LIGHT_LM_MAX, LIGHT_K_MIN, LIGHT_K_MAX,
      LIGHT_K_DEF, LIGHT_BEAM_MIN, LIGHT_BEAM_MAX, LIGHT_TONES, LIGHT_LEVELS,
      isLightFix, kelvinHex, lightP, cleanLight, ceilElev,
    };
  `)();
}

function loadLightSvg() {
  return new Function(`
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const pal = () => ({ furnStroke: '#111', furnOp: 0.3, outline: false });
    ${markerBlock(src, 'LIGHT-PARAM')}
    ${fnSrcOf(src, 'lightSvg')}
    return { LIGHT_DEFS, lightP, lightSvg };
  `)();
}

const hexRgb = hex => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

test('(1) LIGHT-PARAM block is identical in app.js and mcp/server.js', () => {
  assert.strictEqual(
    markerBlock(mcpSrc, 'LIGHT-PARAM'),
    markerBlock(src, 'LIGHT-PARAM'),
    'LIGHT-PARAM block in mcp/server.js must match app.js'
  );
});

test('(2) lightP, kelvinHex, cleanLight and ceilElev in sandbox', () => {
  const {
    LIGHT_DEFS, LIGHT_LM_MIN, LIGHT_LM_MAX, LIGHT_K_MIN, LIGHT_K_MAX,
    LIGHT_BEAM_MIN, LIGHT_BEAM_MAX,
    kelvinHex, lightP, cleanLight, ceilElev,
  } = loadLightParam();

  // lightP returns null for non-light items
  assert.strictEqual(lightP(null), null);
  assert.strictEqual(lightP({}), null);
  assert.strictEqual(lightP({ type: 'sofa3' }), null);

  // defaults per type from LIGHT_DEFS
  const ceil = lightP({ type: 'lampCeil' });
  assert.strictEqual(ceil.lm, 1200);
  assert.strictEqual(ceil.k, 2700);
  assert.strictEqual(ceil.on, true);
  assert.strictEqual(ceil.beam, null);

  for (const [id, def] of Object.entries(LIGHT_DEFS)) {
    const p = lightP({ type: id });
    assert.strictEqual(p.lm, def.lm, `${id} default lm`);
    assert.strictEqual(p.k, 2700, `${id} default kelvin`);
    assert.strictEqual(p.on, true, `${id} default on`);
    if (id === 'downlight' || id === 'trackSpot') {
      assert.strictEqual(p.beam, def.beam, `${id} default beam`);
    } else {
      assert.strictEqual(p.beam, null, `${id} should not have beam`);
    }
  }

  // lon: 0 means off and any other lon value means on
  assert.strictEqual(lightP({ type: 'lampCeil', lon: 0 }).on, false);
  for (const lon of [undefined, 1, -1, 2, true, null]) {
    assert.strictEqual(lightP({ type: 'lampCeil', lon }).on, true, `lon=${lon} should be on`);
  }

  // lm, lk and beam clamping
  assert.strictEqual(lightP({ type: 'lampCeil', lm: 1 }).lm, LIGHT_LM_MIN);
  assert.strictEqual(lightP({ type: 'lampCeil', lm: 999999 }).lm, LIGHT_LM_MAX);
  assert.strictEqual(lightP({ type: 'lampCeil', lk: 100 }).lk ?? lightP({ type: 'lampCeil', lk: 100 }).k, LIGHT_K_MIN);
  assert.strictEqual(lightP({ type: 'lampCeil', lk: 20000 }).k, LIGHT_K_MAX);
  assert.strictEqual(lightP({ type: 'downlight', beam: 1 }).beam, LIGHT_BEAM_MIN);
  assert.strictEqual(lightP({ type: 'downlight', beam: 500 }).beam, LIGHT_BEAM_MAX);

  // valid lcol (#rrggbb) wins over kelvin and is lower-cased; invalid one is ignored
  const custom = lightP({ type: 'lampCeil', lk: 6500, lcol: '#AA33Ff' });
  assert.strictEqual(custom.custom, true);
  assert.strictEqual(custom.col, '#aa33ff');

  for (const bad of ['red', '#fff', '#12345g', '123456', 123456]) {
    const p = lightP({ type: 'lampCeil', lk: 6500, lcol: bad });
    assert.strictEqual(p.custom, false, `lcol=${bad} should be ignored`);
    assert.strictEqual(p.col, kelvinHex(6500));
  }

  // kelvinHex colour temperature behaviour
  const [r27, , b27] = hexRgb(kelvinHex(2700));
  assert.strictEqual(r27, 255);
  assert.ok(b27 < r27 - 50, `2700K blue (${b27}) should be clearly lower than red (${r27})`);

  const [r65, g65, b65] = hexRgb(kelvinHex(6500));
  assert.ok(r65 >= 240 && g65 >= 240 && b65 >= 240, `6500K (${kelvinHex(6500)}) should be near white with blue >= 240`);

  const b2200 = hexRgb(kelvinHex(2200))[2];
  const b4000 = hexRgb(kelvinHex(4000))[2];
  const b6500 = hexRgb(kelvinHex(6500))[2];
  assert.ok(b2200 < b4000 && b4000 < b6500, `blue channel should increase with Kelvin: ${b2200} < ${b4000} < ${b6500}`);

  // cleanLight drops default/invalid fields and keeps changed ones; leaves non-light items untouched
  const nonLight = { type: 'sofa3', lm: 1200, lk: 2700, lcol: 'bad', beam: 40, lon: 1 };
  assert.strictEqual(cleanLight(nonLight), nonLight);
  assert.deepStrictEqual(nonLight, { type: 'sofa3', lm: 1200, lk: 2700, lcol: 'bad', beam: 40, lon: 1 });

  const defaultsDropped = cleanLight({ type: 'lampCeil', lm: 1200, lk: 2700, lcol: 'nope', beam: 30, lon: 1 });
  assert.deepStrictEqual(defaultsDropped, { type: 'lampCeil' });

  const changedKept = cleanLight({ type: 'downlight', lm: 50, lk: 8000, lcol: '#FF00AA', beam: 500, lon: 0 });
  assert.deepStrictEqual(changedKept, {
    type: 'downlight',
    lm: LIGHT_LM_MIN,
    lk: LIGHT_K_MAX,
    lcol: '#ff00aa',
    beam: LIGHT_BEAM_MAX,
    lon: 0,
  });

  // ceilElev(o, H) = max(0, round(H - o.h))
  assert.strictEqual(ceilElev({ h: 12 }, 270), 258);
  assert.strictEqual(ceilElev({ h: 12.4 }, 270), 258);
  assert.strictEqual(ceilElev({ h: 300 }, 270), 0);
});

test('(3) app.js, mcp/server.js and fp_core.py wiring', () => {
  const { LIGHT_DEFS } = loadLightParam();

  for (const id of Object.keys(LIGHT_DEFS)) {
    const re = new RegExp(`\\['${id}',\\s*6,`);
    assert.match(src, re, `CAT_DEFS must have category 6 row for ${id}`);
  }

  assert.match(src, /const CATS_EN = \[[^\]]*'Lighting'[^\]]*\]/, 'CATS_EN must contain Lighting');

  const furnBodySrc = fnSrcOf(src, 'furnBody');
  assert.match(furnBodySrc, /if\s*\(\s*isLightFix\s*\(\s*f\s*\)\s*\)\s*return\s+lightSvg\s*\(\s*f\s*\)/, 'furnBody must call lightSvg for isLightFix');

  const commitSrc = fnSrcOf(src, 'commit');
  assert.match(commitSrc, /\bsyncCeilMounts\s*\(\s*\)/, 'commit() must call syncCeilMounts()');

  const normSrc = fnSrcOf(src, 'normalizeProject');
  assert.match(normSrc, /\bcleanLight\s*\(\s*o\s*\)/, 'normalizeProject() must call cleanLight()');

  const presetMatch = /const PRESET_FURN_EXTRA = \[([^\]]+)\]/.exec(src);
  assert.ok(presetMatch, 'PRESET_FURN_EXTRA must exist');
  for (const k of ['lon', 'lm', 'lk', 'lcol', 'beam', 'mount']) {
    assert.ok(presetMatch[1].includes(`'${k}'`), `PRESET_FURN_EXTRA must contain ${k}`);
  }

  assert.match(src, /const RV_CAT = \{[^}]*Object\.keys\(LIGHT_DEFS\)\.map\(k => \[k, 'lighting'\]\)/, 'RV_CAT must map light ids to lighting');
  assert.match(src, /const IFC_EXP_ENT = \{[^}]*lighting:\s*'IFCLIGHTFIXTURE'/, 'IFC_EXP_ENT must map lighting to IFCLIGHTFIXTURE');
  assert.match(fpCorePy, /'lighting':\s*'OST_LightingFixtures'/, 'fp_core.py must map lighting to OST_LightingFixtures');

  assert.match(src, /const IFC_COMPONENTS = new Set\(\[[^\]]*'IFCLIGHTFIXTURE'/, 'app.js IFC_COMPONENTS must include IFCLIGHTFIXTURE');
  assert.match(mcpSrc, /const IFC_COMPONENTS = new Set\(\[[^\]]*'IFCLIGHTFIXTURE'/, 'mcp/server.js IFC_COMPONENTS must include IFCLIGHTFIXTURE');
});

test('(4) lightSvg sandbox: on ceiling light has no stroke-dasharray on its circle, all 12 types return non-empty SVG', () => {
  const { LIGHT_DEFS, lightSvg } = loadLightSvg();

  const onCeil = lightSvg({ type: 'lampCeil', w: 40, d: 40, color: '#f8fafc' });
  const firstCircle = /<circle\b[^>]*>/.exec(onCeil);
  assert.ok(firstCircle, 'on ceiling light must render a <circle>');
  assert.ok(!/stroke-dasharray/.test(firstCircle[0]), 'on ceiling light circle must not have stroke-dasharray');

  for (const id of Object.keys(LIGHT_DEFS)) {
    const svg = lightSvg({ type: id, w: 40, d: 40, color: '#f8fafc' });
    assert.ok(typeof svg === 'string' && svg.trim().length > 0, `${id} must return non-empty SVG`);
  }
});

test('(4b) an on light shows its light colour in the centre; an off light is drawn empty', () => {
  const { lightSvg } = loadLightSvg();
  const onCeil = lightSvg({ type: 'lampCeil', w: 40, d: 40, color: '#f8fafc' });
  const offCeil = lightSvg({ type: 'lampCeil', w: 40, d: 40, color: '#f8fafc', lon: 0 });
  const cool = lightSvg({ type: 'lampCeil', w: 40, d: 40, color: '#f8fafc', lk: 6000 });
  const dot = /fill="(#[0-9a-f]{6})"[^>]*\/>$/;
  const warm = dot.exec(onCeil);
  assert.ok(warm, 'the on light ends with a filled centre dot');
  assert.ok(!offCeil.includes(warm[1]), 'the off light has no light-colour fill');
  assert.match(offCeil, /fill-opacity="0"/, 'the off light body is empty');
  assert.notStrictEqual(dot.exec(cool)[1], warm[1], 'the centre follows the colour temperature');
});

test('(5) MCP stdio: add_furniture lights, clamping, add_room, set_lights, summarize, get_project', async t => {
  const c = mcpClient();
  t.after(() => c.stop());

  await c.call('initialize', {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'lights-test', version: '1' },
  });

  const np = await c.tool('new_project', { name: 'Lights Test' });
  assert.ok(!np.err, np.text);

  const addCeil = await c.tool('add_furniture', { catalogId: 'lampCeil', x: 100, y: 100 });
  assert.ok(!addCeil.err, addCeil.text);

  const addSpot = await c.tool('add_furniture', { catalogId: 'downlight', x: 500, y: 500, lumens: 50, beam: 500 });
  assert.ok(!addSpot.err, addSpot.text);

  const addRm = await c.tool('add_room', {
    name: 'Studio',
    pts: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }],
  });
  assert.ok(!addRm.err, addRm.text);
  const roomId = /Added room ([a-z0-9]{7})/.exec(addRm.text)[1];

  const offRes = await c.tool('set_lights', { roomId, on: false });
  assert.ok(!offRes.err, offRes.text);
  assert.match(offRes.text, /Turned off 1 light/);

  const sumRes = await c.tool('summarize', {});
  assert.ok(!sumRes.err, sumRes.text);
  assert.match(sumRes.text, /light off/);

  const projRes = await c.tool('get_project', {});
  assert.ok(!projRes.err, projRes.text);
  const proj = JSON.parse(projRes.text);
  const fl = proj.floors[0];
  const wallH = +fl.wallH > 0 ? +fl.wallH : proj.wallH;

  const ceilItem = fl.furn.find(f => f.type === 'lampCeil');
  const spotItem = fl.furn.find(f => f.type === 'downlight');
  assert.ok(ceilItem && spotItem);

  assert.strictEqual(ceilItem.mount, 'ceil');
  assert.strictEqual(ceilItem.elev, wallH - 12);
  assert.strictEqual(ceilItem.lon, 0);

  assert.strictEqual(spotItem.lm, 100);
  assert.strictEqual(spotItem.beam, 120);
  assert.strictEqual(spotItem.lon, undefined);
});

function loadLight3DSandbox() {
  return new Function(`
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const ui = { live3d: false, studio: { alt: 42 } };
    ${fnSrcOf(src, 'lmToThree')}
    ${fnSrcOf(src, 'fixAnchor')}
    ${fnSrcOf(src, 'fixDayFactor')}
    ${fnSrcOf(src, 'fixRank')}
    return { ui, lmToThree, fixAnchor, fixDayFactor, fixRank };
  `)();
}

test('(6a) lmToThree: monotonic i and d, clamping, and 800 lm baseline', () => {
  const { lmToThree } = loadLight3DSandbox();
  const levels = [100, 400, 800, 1600, 3000, 10000];
  const res = levels.map(lmToThree);
  for (let idx = 1; idx < res.length; idx++) {
    assert.ok(res[idx].i > res[idx - 1].i, `i should strictly increase from ${levels[idx - 1]} to ${levels[idx]}`);
    assert.ok(res[idx].d > res[idx - 1].d, `d should strictly increase from ${levels[idx - 1]} to ${levels[idx]}`);
  }
  assert.deepStrictEqual(lmToThree(50), lmToThree(100));
  assert.deepStrictEqual(lmToThree(20000), lmToThree(10000));
  assert.ok(Math.abs(lmToThree(800).i - 0.55) < 1e-6, `800 lm should give i ~ 0.55, got ${lmToThree(800).i}`);
});

test('(6b) fixRank: filtering, limit, distance, floor priority, and stability', () => {
  const { fixRank } = loadLight3DSandbox();
  const focus = { x: 0, y: 100, z: 0, fi: 0 };

  const offLight = { on: false, kind: 'point', lm: 5000, fidx: 0, x: 0, y: 100, z: 0 };
  const nearPt = { on: true, kind: 'point', lm: 800, fidx: 0, x: 50, y: 100, z: 0 };
  const farPt = { on: true, kind: 'point', lm: 800, fidx: 0, x: 500, y: 100, z: 0 };
  const otherFloorPt = { on: true, kind: 'point', lm: 800, fidx: 1, x: 50, y: 100, z: 0 };
  const spotA = { on: true, kind: 'spot', lm: 1000, fidx: 0, x: 100, y: 200, z: 0 };
  const spotB = { on: true, kind: 'spot', lm: 1000, fidx: 1, x: 100, y: 200, z: 0 };

  const list = [offLight, farPt, otherFloorPt, nearPt, spotB, spotA];

  // spot=false: only on=true, never spots, at most n
  const pts = fixRank(list, focus, 2, false);
  assert.strictEqual(pts.length, 2);
  assert.ok(pts.every(e => e.on && e.kind !== 'spot'));
  assert.strictEqual(pts[0], nearPt, 'nearer light on focus floor ranks first');
  assert.ok(pts.indexOf(farPt) === -1 || pts.indexOf(nearPt) < pts.indexOf(farPt));

  // focus floor outranks equally far light on another floor
  const allPts = fixRank([otherFloorPt, nearPt], focus, 10, false);
  assert.deepStrictEqual(allPts, [nearPt, otherFloorPt]);

  // nearer light outranks farther light of same lm
  const distPts = fixRank([farPt, nearPt], focus, 10, false);
  assert.deepStrictEqual(distPts, [nearPt, farPt]);

  // spot=true: only on=true and kind==='spot'
  const spots = fixRank(list, focus, 5, true);
  assert.strictEqual(spots.length, 2);
  assert.ok(spots.every(e => e.on && e.kind === 'spot'));
  assert.deepStrictEqual(spots, [spotA, spotB]);

  // 4x brighter at 2x distance: deterministic and stable when called twice
  const near = { on: true, kind: 'point', lm: 800, fidx: 0, x: 200, y: 100, z: 0 };
  const brightFar = { on: true, kind: 'point', lm: 3200, fidx: 0, x: 400, y: 100, z: 0 };
  const r1 = fixRank([near, brightFar], focus, 2, false);
  const r2 = fixRank([near, brightFar], focus, 2, false);
  assert.deepStrictEqual(r1, r2);
  assert.strictEqual(r1[0], brightFar);
});

test('(6c) fixAnchor: mounting offsets by fixture type', () => {
  const { fixAnchor } = loadLight3DSandbox();
  assert.strictEqual(fixAnchor({ type: 'pendant', h: 100 }), 12);
  assert.strictEqual(fixAnchor({ type: 'floorLamp', h: 160 }), 145);
  assert.strictEqual(fixAnchor({ type: 'lampCeil', h: 20 }), 0);
  assert.strictEqual(fixAnchor({ type: 'sconce', h: 30 }), 15);
  assert.strictEqual(fixAnchor({ type: 'unknownType', h: 100 }), 0);
});

test('(6d) fixDayFactor: CAD mode, live3d sun altitude, and 0.25..1 clamping', () => {
  const { ui, fixDayFactor } = loadLight3DSandbox();
  ui.live3d = false;
  assert.strictEqual(fixDayFactor(), 0.45);

  ui.live3d = true;
  ui.studio = { alt: 6 };
  const lowSun = fixDayFactor();
  ui.studio = { alt: 60 };
  const highSun = fixDayFactor();
  assert.ok(lowSun > highSun, `alt 6 (${lowSun}) should be higher than alt 60 (${highSun})`);

  for (const alt of [-10, 0, 6, 30, 45, 60, 90]) {
    ui.studio = { alt };
    const f = fixDayFactor();
    assert.ok(f >= 0.25 && f <= 1, `alt ${alt} gave ${f} outside 0.25..1`);
  }
});

test('(6e) 3D lighting wiring in app.js', () => {
  assert.match(src, /\bconst\s+FIX_PTS\s*=\s*8\s*,\s*FIX_SPOTS\s*=\s*4\b/, 'FIX_PTS is 8 and FIX_SPOTS is 4');
  assert.match(src, /\bconst\s+layersVis\s*=\s*\{[^}]*\blightArea\s*:\s*false\b/, 'layersVis has lightArea: false by default');

  const build3DSrc = fnSrcOf(src, 'build3D');
  assert.match(
    build3DSrc,
    /if\s*\(\s*T3\.fixList\.length\s*\)\s*\{[\s\S]*?fixPool\s*\(\s*\)[\s\S]*?assignFixLights\s*\(\s*\)/,
    'build3D adds the pool only when T3.fixList has entries and calls assignFixLights'
  );
  assert.match(
    build3DSrc,
    /if\s*\(\s*isLightFix\s*\(\s*o\s*\)\s*\)\s*\{[^}]*castShadow\s*=\s*false/,
    'isLightFix items get castShadow = false in build3D'
  );

  const draw3DSrc = fnSrcOf(src, 'draw3D');
  assert.match(draw3DSrc, /\bfixTick\s*\(/, 'draw3D calls fixTick');

  const walkClickSrc = fnSrcOf(src, 'walkClick');
  assert.match(walkClickSrc, /isLightFix\s*\([^)]*\)\s*\)\s*toggleLight3D\s*\(/, 'walkClick toggles lights via toggleLight3D');
});

