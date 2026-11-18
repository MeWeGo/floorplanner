/* Tests for light-emitting parts on multi-part furniture:
   (1) PARTS-ENGINE cleanPart & partIssues for light/lm/lk/lcol/beam,
   (2) partLightP & partLightSpots in a sandbox with LIGHT-PARAM + PARTS-ENGINE,
   (3) app.js source wiring checks (FS_BLOCKS, build3D, toggleLight3D, roomLights, FURN_TEMPLATES),
   (4) MCP stdio round-trip with create_furniture + add_component (valid strip & rejected laser). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, markerBlock, mcpClient } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n');

function loadPartsEngine() {
  // eslint-disable-next-line no-new-func
  return new Function(`
    ${markerBlock(src, 'PARTS-ENGINE')}
    return { PART_LIGHTS, PART_LIGHT_DEF, cleanPart, partIssues, partsScale };
  `)();
}

function loadPartLights() {
  // eslint-disable-next-line no-new-func
  return new Function(`
    ${markerBlock(src, 'LIGHT-PARAM')}
    ${markerBlock(src, 'PARTS-ENGINE')}
    ${fnSrcOf(src, 'partLightP')}
    ${fnSrcOf(src, 'partLightSpots')}
    return { LIGHT_LM_MIN, LIGHT_LM_MAX, LIGHT_K_MIN, LIGHT_K_MAX, LIGHT_K_DEF, LIGHT_BEAM_MIN, LIGHT_BEAM_MAX, PART_LIGHTS, PART_LIGHT_DEF, kelvinHex, partLightP, partLightSpots };
  `)();
}

test('(1) PARTS-ENGINE cleanPart and partIssues for light parts', () => {
  const { cleanPart, partIssues } = loadPartsEngine();

  // keeps valid light kinds and drops defaults
  assert.strictEqual(cleanPart({ light: 'point', lm: 800, lk: 2700 }).light, 'point');
  assert.strictEqual(cleanPart({ light: 'point', lm: 800, lk: 2700 }).lm, undefined);
  assert.strictEqual(cleanPart({ light: 'point', lm: 800, lk: 2700 }).lk, undefined);

  const spotDef = cleanPart({ light: 'spot', lm: 500, beam: 40, lk: 2700 });
  assert.strictEqual(spotDef.light, 'spot');
  assert.strictEqual(spotDef.lm, undefined);
  assert.strictEqual(spotDef.beam, undefined);
  assert.strictEqual(spotDef.lk, undefined);

  const stripDef = cleanPart({ light: 'strip', lm: 600, lk: 2700 });
  assert.strictEqual(stripDef.light, 'strip');
  assert.strictEqual(stripDef.lm, undefined);
  assert.strictEqual(stripDef.lk, undefined);

  // clamps lm (100..10000), lk (2200..6500), beam (10..120, spot only)
  const spotClamped = cleanPart({ light: 'spot', lm: 50, lk: 1000, beam: 5 });
  assert.strictEqual(spotClamped.lm, 100);
  assert.strictEqual(spotClamped.lk, 2200);
  assert.strictEqual(spotClamped.beam, 10);

  const spotMax = cleanPart({ light: 'spot', lm: 99999, lk: 12000, beam: 200 });
  assert.strictEqual(spotMax.lm, 10000);
  assert.strictEqual(spotMax.lk, 6500);
  assert.strictEqual(spotMax.beam, 120);

  // beam is dropped on non-spot lights
  assert.strictEqual(cleanPart({ light: 'point', beam: 30 }).beam, undefined);
  assert.strictEqual(cleanPart({ light: 'strip', beam: 30 }).beam, undefined);

  // lcol kept lowercased only when #rrggbb
  assert.strictEqual(cleanPart({ light: 'point', lcol: '#FFAA33' }).lcol, '#ffaa33');
  assert.strictEqual(cleanPart({ light: 'point', lcol: 'red' }).lcol, undefined);
  assert.strictEqual(cleanPart({ light: 'point', lcol: '#fff' }).lcol, undefined);

  // unknown light values (including prototype keys) are dropped
  for (const bad of ['laser', 'constructor', 'toString']) {
    const p = cleanPart({ light: bad, lm: 900, lk: 4000, lcol: '#ff0000', beam: 30 });
    assert.strictEqual(p.light, undefined);
    assert.strictEqual(p.lm, undefined);
    assert.strictEqual(p.lk, undefined);
    assert.strictEqual(p.lcol, undefined);
    assert.strictEqual(p.beam, undefined);
  }

  // partIssues: errors for invalid light, lm, lk, beam, lcol; none for valid strip
  const base = { w: 120, d: 40, h: 80 };
  const badIssues = partIssues({ type: 'box', w: 10, d: 10, h: 10, light: 'laser', lm: 50, lk: 9000, beam: 200, lcol: 'red' }, base).join('\n');
  assert.match(badIssues, /light must be one of/);
  assert.match(badIssues, /lm must be a number 100–10000/);
  assert.match(badIssues, /lk must be a number 2200–6500/);
  assert.match(badIssues, /beam must be a number 10–120/);
  assert.match(badIssues, /lcol must be #rrggbb/);

  assert.deepStrictEqual(
    partIssues({ type: 'box', w: 100, d: 1.5, h: 0.8, light: 'strip', lm: 900, lk: 3000, lcol: '#fff7e0' }, base),
    []
  );
});

test('(2) partLightP and partLightSpots in sandbox', () => {
  const { partLightP, partLightSpots, kelvinHex } = loadPartLights();

  // returns null for a part without light
  assert.strictEqual(partLightP(null), null);
  assert.strictEqual(partLightP({ type: 'box', w: 10, d: 10, h: 10 }), null);
  assert.strictEqual(partLightP({ type: 'box', light: 'laser' }), null);

  // defaults per kind, kind spot vs point, strip flag
  const pt = partLightP({ light: 'point' });
  assert.strictEqual(pt.kind, 'point');
  assert.strictEqual(pt.strip, false);
  assert.strictEqual(pt.lm, 800);
  assert.strictEqual(pt.k, 2700);
  assert.strictEqual(pt.beam, null);
  assert.strictEqual(pt.on, true);
  assert.strictEqual(pt.custom, false);
  assert.strictEqual(pt.col, kelvinHex(2700));

  const sp = partLightP({ light: 'spot' });
  assert.strictEqual(sp.kind, 'spot');
  assert.strictEqual(sp.strip, false);
  assert.strictEqual(sp.lm, 500);
  assert.strictEqual(sp.k, 2700);
  assert.strictEqual(sp.beam, 40);

  const st = partLightP({ light: 'strip' });
  assert.strictEqual(st.kind, 'point');
  assert.strictEqual(st.strip, true);
  assert.strictEqual(st.lm, 600);
  assert.strictEqual(st.k, 2700);
  assert.strictEqual(st.beam, null);

  // custom colour wins over lk
  const cust = partLightP({ light: 'point', lk: 6500, lcol: '#12ABEF' });
  assert.strictEqual(cust.custom, true);
  assert.strictEqual(cust.col, '#12abef');

  // on follows item lon (lon: 0 = off, absent = on)
  assert.strictEqual(partLightP({ light: 'point' }, { lon: 0 }).on, false);
  assert.strictEqual(partLightP({ light: 'point' }, {}).on, true);

  // partLightSpots: bulb at (10, 0, 50) h 6 on item at (100, 200) rot 0 -> (110, 200, 53)
  const bulbPart = { type: 'sphere', x: 10, y: 0, z: 50, w: 6, d: 6, h: 6, light: 'point' };
  const item0 = { x: 100, y: 200, rot: 0, w: 100, d: 50, h: 80, parts: [bulbPart] };
  const s0 = partLightSpots(item0);
  assert.strictEqual(s0.length, 1);
  assert.ok(Math.abs(s0[0].x - 110) < 1e-6);
  assert.ok(Math.abs(s0[0].y - 200) < 1e-6);
  assert.ok(Math.abs(s0[0].z - 53) < 1e-6);

  // rot 90 -> (100, 210, 53)
  const item90 = Object.assign({}, item0, { rot: 90 });
  const s90 = partLightSpots(item90);
  assert.ok(Math.abs(s90[0].x - 100) < 1e-6);
  assert.ok(Math.abs(s90[0].y - 210) < 1e-6);
  assert.ok(Math.abs(s90[0].z - 53) < 1e-6);

  // spot part gives z = its bottom
  const spotPart = { type: 'cyl', x: 0, y: 0, z: 50, w: 6, d: 6, h: 6, light: 'spot' };
  const sSpot = partLightSpots({ x: 100, y: 200, rot: 0, w: 100, d: 50, h: 80, parts: [spotPart] });
  assert.strictEqual(sSpot[0].z, 50);

  // strip part w 100 d 1.5 gives len 100 and ang = item rot
  const stripPart = { type: 'box', x: 10, y: 0, z: 10, w: 100, d: 1.5, h: 0.8, light: 'strip' };
  const sStrip = partLightSpots({ x: 100, y: 200, rot: 35, w: 120, d: 30, h: 40, parts: [stripPart] });
  assert.strictEqual(sStrip[0].len, 100);
  assert.strictEqual(sStrip[0].ang, 35);

  // scaled item (w = 2 * pbase.w) doubles x offset and len
  const sScaled = partLightSpots({
    x: 100, y: 200, rot: 0,
    w: 240, d: 30, h: 40,
    pbase: { w: 120, d: 30, h: 40 },
    parts: [stripPart],
  });
  assert.ok(Math.abs(sScaled[0].x - 120) < 1e-6);
  assert.strictEqual(sScaled[0].len, 200);
});

test('(3) app.js source wiring for light parts', () => {
  const fsBlocksSrc = src.slice(src.indexOf('const FS_BLOCKS ='), src.indexOf('const fsBlock ='));
  assert.match(fsBlocksSrc, /'bulb'[\s\S]*?light:\s*['"]point['"]/);
  assert.match(fsBlocksSrc, /'spot'[\s\S]*?light:\s*['"]spot['"]/);
  assert.match(fsBlocksSrc, /'ledstrip'[\s\S]*?light:\s*['"]strip['"]/);

  const build3dSrc = fnSrcOf(src, 'build3D');
  assert.match(build3dSrc, /partLit\s*\(\s*o\s*\)[\s\S]*?partGlow3D\s*\(/);

  const toggleSrc = fnSrcOf(src, 'toggleLight3D');
  assert.match(toggleSrc, /\blitOn\s*\(/);

  const roomLightsSrc = fnSrcOf(src, 'roomLights');
  assert.match(roomLightsSrc, /\bisLit\s*\(/);

  const tplSrc = src.slice(src.indexOf('const FURN_TEMPLATES ='), src.indexOf('const TPL_FINISH ='));
  assert.match(tplSrc, /\blamp\s*:/);
  assert.match(tplSrc, /\bshelfLed\s*:/);
});

test('(4) MCP stdio: create_furniture + add_component with light strip and rejected laser', async t => {
  const c = mcpClient();
  t.after(() => c.stop());

  await c.call('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'part-lights-test', version: '1' },
  });

  const np = await c.tool('new_project', { name: 'Part Lights Test' });
  assert.ok(!np.err, np.text);

  const made = await c.tool('create_furniture', { name: 'LED Shelf', w: 120, d: 30, h: 40, x: 100, y: 100 });
  assert.ok(!made.err, made.text);
  const id = made.text.match(/Created furniture (\w+)/)[1];

  const bad = await c.tool('add_component', {
    furnitureId: id,
    name: 'bad',
    type: 'box',
    w: 10,
    d: 10,
    h: 5,
    light: 'laser',
  });
  assert.ok(bad.err, 'add_component with light "laser" must be rejected');

  const ok = await c.tool('add_component', {
    furnitureId: id,
    name: 'led',
    type: 'box',
    x: 0,
    y: 0,
    z: 0,
    w: 100,
    d: 1.5,
    h: 0.8,
    light: 'strip',
    lm: 900,
  });
  assert.ok(!ok.err, ok.text);

  const proj = JSON.parse((await c.tool('get_project')).text);
  const item = proj.floors[0].furn.find(f => f.id === id);
  assert.ok(item && Array.isArray(item.parts) && item.parts.length === 1);
  assert.strictEqual(item.parts[0].light, 'strip');
  assert.strictEqual(item.parts[0].lm, 900);

  const sum = await c.tool('summarize');
  assert.ok(!sum.err, sum.text);
  assert.match(sum.text, /LED Shelf/);
});
