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
    const ui = { live3d: false, studio: { alt: 42 }, dayLights: false };
    ${fnSrcOf(src, 'lmToThree')}
    ${fnSrcOf(src, 'fixAnchor')}
    ${fnSrcOf(src, 'lightsActive3D')}
    ${fnSrcOf(src, 'fixDayFactor')}
    ${fnSrcOf(src, 'fixScore')}
    ${fnSrcOf(src, 'fixRank')}
    return { ui, lmToThree, fixAnchor, lightsActive3D, fixDayFactor, fixRank };
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
  assert.ok(Math.abs(lmToThree(800).i - 1) < 1e-6, `800 lm should give i = 1, got ${lmToThree(800).i}`);
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

test('(6d) lightsActive3D & fixDayFactor: off by default by day, on at night or with dayLights, 0.25..1 clamping', () => {
  const { ui, lightsActive3D, fixDayFactor } = loadLight3DSandbox();
  // By default (dayLights: false), CAD and daytime Live3D keep lights off (factor 0)
  ui.dayLights = false;
  ui.live3d = false;
  assert.strictEqual(lightsActive3D(), false);
  assert.strictEqual(fixDayFactor(), 0);

  ui.live3d = true;
  for (const alt of [6, 42, 60]) {
    ui.studio = { alt };
    assert.strictEqual(lightsActive3D(), false, `alt ${alt} should keep lights off by default`);
    assert.strictEqual(fixDayFactor(), 0, `alt ${alt} should give factor 0 by default`);
  }

  // Twilight / night turns lights on automatically
  ui.studio = { alt: 5 };
  assert.strictEqual(lightsActive3D(), true);
  assert.ok(fixDayFactor() > 0.9);
  ui.studio = { alt: -12 };
  assert.strictEqual(lightsActive3D(), true);
  assert.strictEqual(fixDayFactor(), 1);

  // Explicit altitude (e.g. render3DHQ) respects the same daytime rule
  assert.strictEqual(lightsActive3D(42), false);
  assert.strictEqual(fixDayFactor(42), 0);
  assert.strictEqual(lightsActive3D(-12), true);
  assert.strictEqual(fixDayFactor(-12), 1);

  // When daytime lights are toggled on (ui.dayLights = true), CAD = 0.45 and Live3D scales 0.25..1
  ui.dayLights = true;
  ui.live3d = false;
  assert.strictEqual(lightsActive3D(), true);
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
  assert.match(src, /\bconst\s+FIX_PTS\s*=\s*8\s*,\s*FIX_SPOTS\s*=\s*6\b/, 'FIX_PTS is 8 and FIX_SPOTS is 6 (#128: the first 4 spots cast shadows)');
  assert.match(src, /\bconst\s+layersVis\s*=\s*\{[^}]*\blightArea\s*:\s*false\b/, 'layersVis has lightArea: false by default');

  const build3DSrc = fnSrcOf(src, 'build3D');
  assert.match(
    build3DSrc,
    /syncFixVisuals\s*\(\s*lightsActive3D\s*\(\s*\)\s*\)[\s\S]*?syncFixPool\s*\(\s*\)[\s\S]*?assignFixLights\s*\(\s*\)/,
    'build3D syncs fixture visuals/pool for daytime default and assigns pool lights when active'
  );
  assert.match(read('index.html'), /id="b3dLights"/, 'index.html contains daytime lights toggle #b3dLights');
  assert.match(
    build3DSrc,
    /if\s*\(\s*isLightFix\s*\(\s*o\s*\)\s*\)\s*\{[^}]*castShadow\s*=\s*false/,
    'isLightFix items get castShadow = false in build3D'
  );

  const draw3DSrc = fnSrcOf(src, 'draw3D');
  assert.match(draw3DSrc, /\bfixTick\s*\(/, 'draw3D calls fixTick');

  const walkClickSrc = fnSrcOf(src, 'walkClick');
  assert.match(walkClickSrc, /isLit\s*\([^)]*\)\s*\)\s*toggleLight3D\s*\(/, 'walkClick toggles lights (catalogue fixtures and light parts) via toggleLight3D');
});

function loadNightSandbox() {
  const html = read('index.html');
  const sunAltMinLine = /^const SUN_ALT_MIN\s*=\s*[^;]+;/m.exec(src);
  assert.ok(sunAltMinLine, 'SUN_ALT_MIN const must exist in app.js');
  const lerpHexLine = /^const lerpHex\s*=\s*[^;]+;/m.exec(src);
  assert.ok(lerpHexLine, 'lerpHex const must exist in app.js');

  class C {
    constructor(h) {
      this.r = (h >> 16 & 255) / 255;
      this.g = (h >> 8 & 255) / 255;
      this.b = (h & 255) / 255;
    }
    lerp(o, t) {
      this.r += (o.r - this.r) * t;
      this.g += (o.g - this.g) * t;
      this.b += (o.b - this.b) * t;
      return this;
    }
    multiplyScalar(k) {
      this.r *= k;
      this.g *= k;
      this.b *= k;
      return this;
    }
    copy(o) {
      this.r = o.r;
      this.g = o.g;
      this.b = o.b;
      return this;
    }
  }

  const fns = new Function('THREE', 'clamp', `
    ${sunAltMinLine[0]}
    ${lerpHexLine[0]}
    ${fnSrcOf(src, 'nightOf')}
    ${fnSrcOf(src, 'sunVector')}
    ${fnSrcOf(src, 'litVector')}
    ${fnSrcOf(src, 'skyColors')}
    return { SUN_ALT_MIN, nightOf, sunVector, litVector, skyColors };
  `)({ Color: C }, (v, a, b) => Math.max(a, Math.min(b, v)));

  return { ...fns, html };
}

test('(7a) nightOf: day/night thresholds, twilight midpoint, and monotonic decrease', () => {
  const { nightOf } = loadNightSandbox();
  for (const alt of [6, 20, 90]) {
    assert.strictEqual(nightOf(alt), 0, `nightOf(${alt}) should be 0`);
  }
  for (const alt of [-6, -18]) {
    assert.strictEqual(nightOf(alt), 1, `nightOf(${alt}) should be 1`);
  }
  assert.strictEqual(nightOf(0), 0.5, 'nightOf(0) should be 0.5');

  let prev = nightOf(-10);
  for (let alt = -9; alt <= 10; alt++) {
    const cur = nightOf(alt);
    assert.ok(cur <= prev, `nightOf(${alt})=${cur} should be <= nightOf(${alt - 1})=${prev}`);
    prev = cur;
  }
});

test('(7b) sunVector below the horizon: negative y and -18 deg clamp', () => {
  const { SUN_ALT_MIN, sunVector } = loadNightSandbox();
  assert.strictEqual(SUN_ALT_MIN, -18);
  assert.ok(sunVector(215, -10).y < 0, 'sunVector at alt -10 should have y < 0');
  assert.deepStrictEqual(sunVector(215, -40), sunVector(215, -18), 'alt -40 should clamp to -18');
});

test('(7c) litVector: follows sun for alt >= 1 and flips to moon above horizon for alt < 1', () => {
  const { sunVector, litVector } = loadNightSandbox();
  for (const alt of [1, 15, 45]) {
    assert.deepStrictEqual(litVector(215, alt), sunVector(215, alt), `alt ${alt} should match sunVector`);
  }
  const dayHoriz = sunVector(215, 30);
  for (const alt of [0, -12, -18]) {
    const lv = litVector(215, alt);
    assert.ok(lv.y > 0.5, `litVector at alt ${alt} should point above horizon (y=${lv.y})`);
    const dotHoriz = lv.x * dayHoriz.x + lv.z * dayHoriz.z;
    assert.ok(dotHoriz < 0, `litVector at alt ${alt} should be opposite in azimuth (dot=${dotHoriz})`);
  }
});

test('(7d) skyColors at night (-12) vs golden hour (12) and deterministic day (30)', () => {
  const { nightOf, skyColors } = loadNightSandbox();
  const sumRgb = c => c.r + c.g + c.b;

  const night = skyColors(-12);
  const golden = skyColors(12);
  assert.ok(sumRgb(night.zen) < sumRgb(golden.zen), 'night zenith should be darker than golden hour zenith');
  assert.strictEqual(sumRgb(night.glow), 0, 'night glow should be zero');
  assert.ok(sumRgb(golden.glow) > 0, 'golden-hour glow should be non-zero');

  assert.strictEqual(nightOf(30), 0);
  assert.deepStrictEqual(skyColors(30), skyColors(30), 'skyColors(30) should be deterministic');
});

test('(7e) night mode (#122) wiring in app.js and index.html', () => {
  const { html } = loadNightSandbox();
  assert.match(src, /\bconst\s+RENDER_MOODS\s*=\s*\{[^}]*\bnight\s*:/, 'RENDER_MOODS has night key');
  assert.match(src, /<input[^>]*type="range"[^>]*min="\$\{SUN_ALT_MIN\}"[^>]*data-rs="alt"/, 'studio altitude range uses min="${SUN_ALT_MIN}"');

  const makeSkySrc = fnSrcOf(src, 'makeSky');
  assert.match(makeSkySrc, /\bnight\s*:\s*\{/, 'makeSky passes night uniform');
  assert.match(makeSkySrc, /fragmentShader\s*:[\s\S]*\bmoon\b/, 'makeSky fragment shader contains moon');

  const rlStart = src.indexOf('function realLook(');
  const rlEnd = src.indexOf('function applyLive3D(', rlStart);
  assert.ok(rlStart >= 0 && rlEnd > rlStart, 'realLook() body must exist before applyLive3D()');
  const realLookSrc = src.slice(rlStart, rlEnd);
  assert.match(realLookSrc, /restore\s*\(\s*\)\s*\{[\s\S]*\btoneMappingExposure\s*=\s*oldExp\b/, 'realLook restore() restores toneMappingExposure');

  assert.match(html, /id="b3dNight"/, 'index.html contains id="b3dNight"');
  assert.ok(fnSrcOf(src, 'setNight3D').length > 0, 'setNight3D exists in app.js');
  assert.match(src, /if\s*\(\s*k\s*===\s*'f'\s*&&\s*T3\s*&&\s*T3\.walk\s*\)\s*\{[^}]*toggleFlashlight\s*\(\s*\)/, 'keydown handler toggles flashlight with k === "f" while walking');
});


test('(8) fixShadowPick & fixShadowAssign: sticky slots with hysteresis prevent redundant shadow redraws (#128)', () => {
  const { fixShadowPick, fixShadowAssign } = new Function(`
    const FIX_SHADOW_MINH = 140, LIGHT_DEFS = { lampCeil: { mount: 'ceil' }, floorLamp: { mount: 'floor' }, tableLamp: { mount: 'floor' }, bollard: { mount: 'floor' } };
    ${fnSrcOf(src, 'fixShadowOk')}
    ${fnSrcOf(src, 'fixKey')}
    ${fnSrcOf(src, 'fixScore')}
    ${fnSrcOf(src, 'fixShadowPick')}
    ${fnSrcOf(src, 'fixShadowAssign')}
    return { fixShadowPick, fixShadowAssign };`)();
  const focus = { x: 0, y: 150, z: 0, fi: 0 };
  const e = (id, kind, x, on = true, fidx = 0) => ({ id, kind, on, lm: 800, fidx, x, y: 150, z: 0 });
  const list = [e('farPoint', 'point', 900), e('nearSpot', 'spot', 50), e('nearPoint', 'point', 100), e('off', 'point', 10, false), e('otherFloor', 'point', 120, true, 1), e('mid', 'strip', 300)];
  const ids = fixShadowPick(list, focus, 4).map(x => x.id);
  assert.deepStrictEqual(ids, ['nearSpot', 'nearPoint', 'mid', 'otherFloor'], 'nearest first, spots and points mixed, focus floor preferred, switched-off lights never');
  assert.strictEqual(fixShadowPick(list, focus, 2).length, 2);
  assert.match(fnSrcOf(src, 'fixShadowSlots'), /i < FIX_SHADOWS/, 'only the first FIX_SHADOWS spots cast shadows');
  assert.doesNotMatch(fnSrcOf(src, 'fixShadowSlots'), /pts\.forEach/, 'point lights never cast shadows (they black out the sun in r128)');

  // Sticky slots: moving focus slightly so top-4 scores re-order keeps each fixture in its exact previous slot
  const a = e('a', 'point', 0), b = e('b', 'point', 300), c = e('c', 'point', 600), d = e('d', 'point', 900), ch = e('challenger', 'point', 1050);
  const s0 = fixShadowAssign([a, b, c, d, ch], { x: 0, y: 150, z: 0, fi: 0 }, 4, []);
  assert.deepStrictEqual(s0.map(x => x.id), ['a', 'b', 'c', 'd']);

  // Focus moves toward d (at x=800): d now outscores a/b/c, and ch (1050) is within 1.35x hysteresis of a (0) -> slots keep exact order!
  const s1 = fixShadowAssign([a, b, c, d, ch], { x: 450, y: 150, z: 0, fi: 0 }, 4, s0);
  assert.deepStrictEqual(s1.map(x => x && x.id), ['a', 'b', 'c', 'd'], 'sticky slots preserve exact indices while top-4 / hysteresis hold');

  // Focus moves right next to challenger (x=1040): challenger overwhelmingly beats 'a' (>1.35x) and replaces ONLY 'a' in slot 0
  const s2 = fixShadowAssign([a, b, c, d, ch], { x: 1040, y: 150, z: 0, fi: 0 }, 4, s1);
  assert.deepStrictEqual(s2.map(x => x && x.id), ['challenger', 'b', 'c', 'd'], 'challenger replaces only the evicted slot');
});

test('(8b) lamp pool while walking: low lamps never take a downward shadow cone, slots stay put, swaps fade', () => {
  const { fixShadowPick, fixShadowAssign, fixRank, fixSlotKeep, fixKey } = new Function(`
    const FIX_SHADOW_MINH = 140, LIGHT_DEFS = { lampCeil: { mount: 'ceil' }, floorLamp: { mount: 'floor' }, tableLamp: { mount: 'floor' }, bollard: { mount: 'floor' } };
    ${fnSrcOf(src, 'fixShadowOk')}
    ${fnSrcOf(src, 'fixKey')}
    ${fnSrcOf(src, 'fixScore')}
    ${fnSrcOf(src, 'fixShadowPick')}
    ${fnSrcOf(src, 'fixShadowAssign')}
    ${fnSrcOf(src, 'fixRank')}
    ${fnSrcOf(src, 'fixSlotKeep')}
    return { fixShadowPick, fixShadowAssign, fixRank, fixSlotKeep, fixKey };`)();
  const focus = { x: 0, y: 150, z: 0, fi: 0 };
  // a ball lamp in a planter (light 25 cm above its floor) next to the walker, a ceiling lamp further away
  const ball = { o: { id: 'ball' }, kind: 'point', on: true, lm: 800, fidx: 0, x: 20, y: 25, z: 0, fy: 0 };
  const ceil = { o: { id: 'ceil' }, kind: 'point', on: true, lm: 800, fidx: 0, x: 400, y: 250, z: 0, fy: 0 };
  const spot = { o: { id: 'spot' }, kind: 'spot', on: true, lm: 800, fidx: 0, x: 30, y: 20, z: 0, fy: 0 };
  assert.deepStrictEqual(fixShadowPick([ball, ceil, spot], focus, 4).map(e => e.o.id), ['spot', 'ceil'], 'the ground-level ball lamp stays an all-round point light');
  assert.deepStrictEqual(fixShadowAssign([ball, ceil], focus, 4, []).map(e => e && e.o.id), ['ceil', null, null, null]);
  const fx = (type, h, extra = {}) => ({ o: { id: type, type }, kind: 'point', on: true, lm: 800, fidx: 0, x: 0, y: h, z: 0, fy: 0, ...extra });
  const ok = e => fixShadowPick([e], focus, 1).length === 1;
  assert.ok(ok(fx('floorLamp', 135)), 'a floor lamp keeps its shadow (a wall still blocks it)');
  assert.ok(ok(fx('tableLamp', 115)), 'a table lamp on a table keeps its shadow');
  assert.ok(!ok(fx('tableLamp', 40)), 'a lamp put on the floor does not');
  assert.ok(!ok(fx('bollard', 92)), 'a bollard does not');
  assert.ok(ok(fx('lampCeil', 60)), 'a ceiling fixture always does');
  assert.ok(!ok(fx('lampCeil', 120, { part: true })), 'a bulb part of a custom item low down does not');
  assert.ok(ok(fx('x', 0, { auto: true })), 'automatic room lights do');

  // build3D makes new entry objects: stickiness goes by key, so a rebuild does not reshuffle the shadow slots
  const a = { o: { id: 'a' }, kind: 'point', on: true, lm: 800, fidx: 0, x: 0, y: 250, z: 0, fy: 0 }, b = { ...a, o: { id: 'b' }, x: 300 };
  const s0 = fixShadowAssign([a, b], focus, 2, []);
  const a2 = { ...a }, b2 = { ...b };
  const s1 = fixShadowAssign([b2, a2], focus, 2, s0);
  assert.deepStrictEqual(s1.map(fixKey), s0.map(fixKey), 'same slots after a rebuild');
  assert.strictEqual(s1[0], a2, 'the slot holds the new entry object');

  // ranking hysteresis: a lit lamp keeps its place until a rival is clearly (1.35x) better
  const p = x => ({ o: { id: 'p' + x }, kind: 'point', on: true, lm: 800, fidx: 0, x, y: 150, z: 0 });
  const near = p(100), rival = p(-90);
  assert.deepStrictEqual(fixRank([near, rival], focus, 1, false).map(e => e.o.id), ['p-90']);
  assert.deepStrictEqual(fixRank([near, rival], focus, 1, false, new Set([fixKey(near)])).map(e => e.o.id), ['p100'], 'the lit lamp stays');
  assert.deepStrictEqual(fixRank([near, p(-10)], { ...focus, x: -200 }, 1, false, new Set([fixKey(near)])).map(e => e.o.id), ['p-10'], 'a clearly better lamp wins');

  // winners stay in the slot that already shows them (no needless fade), newcomers fill the empty ones
  const L = cur => ({ userData: { fx: { cur } } });
  const x1 = p(1), x2 = p(2), x3 = p(3);
  const out = fixSlotKeep([x1, x2, x3], [L(''), L(fixKey(x3)), L(fixKey(x1)), L('gone')]);
  assert.deepStrictEqual(out.map(e => e && e.o.id), ['p2', 'p3', 'p1', null]);

  // wiring: only re-ranks while moving fade, everything else (rebuilds, renders, switches) is instant
  assert.match(fnSrcOf(src, 'fixTick'), /fixFadeTick\(now\)[\s\S]*assignFixLights\(undefined, false\)/);
  assert.match(fnSrcOf(src, 'assignFixLights'), /function assignFixLights\(alt, instant = true\)/);
  assert.match(fnSrcOf(src, 'fixFadeTick'), /FIX_FADE \/ 2/);
});
