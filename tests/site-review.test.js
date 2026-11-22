/* Regression tests for review fixes in site terrain and outdoor zone code. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, markerBlock } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n');
const mcpSrc = read('mcp/server.js').replace(/\r\n/g, '\n');

test('(a) ZONE-PARAM parity, zoneSetback per-edge zero with setback, and cleanZone sb handling', () => {
  assert.strictEqual(
    markerBlock(mcpSrc, 'ZONE-PARAM'),
    markerBlock(src, 'ZONE-PARAM'),
    'ZONE-PARAM block in mcp/server.js must match app.js'
  );

  const { cleanZone, zoneSetback } = new Function(`
    ${markerBlock(src, 'ZONE-PARAM')}
    return { cleanZone, zoneSetback };
  `)();

  const pts = [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 800 },
    { x: 0, y: 800 },
  ];

  // Edge 0 has sb: 0 while uniform setback is 300 and other edges are 300:
  // edge 0 must remain on y = 0, others inset by 300.
  const inset = zoneSetback({ zt: 'parcel', pts, setback: 300, sb: [0, 300, 300, 300] });
  assert.deepStrictEqual(inset, [
    { x: 300, y: 0 },
    { x: 700, y: 0 },
    { x: 700, y: 500 },
    { x: 300, y: 500 },
  ]);
  assert.strictEqual(inset[0].y, 0, 'edge with sb 0 stays on boundary line y=0');
  assert.strictEqual(inset[1].y, 0, 'edge with sb 0 stays on boundary line y=0');

  // cleanZone keeps sb [0,0,0,0] when setback is 300 (differs from uniform setback)
  const keepZeroSb = { zt: 'parcel', pts, setback: 300, sb: [0, 0, 0, 0] };
  cleanZone(keepZeroSb);
  assert.deepStrictEqual(keepZeroSb.sb, [0, 0, 0, 0]);

  // cleanZone drops sb equal to [300,300,300,300] when setback is 300
  const dropSameSb = { zt: 'parcel', pts, setback: 300, sb: [300, 300, 300, 300] };
  cleanZone(dropSameSb);
  assert.ok(!('sb' in dropSameSb), 'sb matching uniform setback 300 is dropped');
});

test('(b) terrain shape stability across contentBounds growth and terrainObj cache/invalidation', () => {
  const api = new Function(`
    let P = { floors: [{}] };
    let hi = 0;
    let bounds = { x0: 0, y0: 0, x1: 2000, y1: 700 };
    const contentBounds = () => bounds;
    ${markerBlock(src, 'GROUND-PARAM')}
    ${markerBlock(src, 'SURF-SLOPE')}
    let _terr = { key: null, o: null }, terrRev = 0;
    ${fnSrcOf(src, 'terrainRing')}
    ${fnSrcOf(src, 'terrainBox')}
    ${fnSrcOf(src, 'terrainObj')}
    ${fnSrcOf(src, 'terrainZ')}
    return {
      setP: p => { P = p; },
      setBounds: b => { bounds = b; },
      bump: () => { terrRev++; },
      terrainBox, terrainObj, terrainZ,
    };
  `)();

  const proj = { floors: [{}], ground: { plinth: 20, tp: [{ x: 1000, y: 0, z: 280 }] } };
  api.setP(proj);

  const boxBefore = api.terrainBox();
  const zBefore = api.terrainZ(1800, 300);

  const o1 = api.terrainObj();
  assert.ok(o1, 'terrainObj returns cached object');
  assert.strictEqual(api.terrainObj(), o1, 'same P and same terrRev returns cached terrainObj');

  api.setBounds({ x0: 0, y0: 0, x1: 9000, y1: 700 });
  api.bump();

  const o2 = api.terrainObj();
  assert.ok(o2, 'terrainObj returns new object after bump');
  assert.notStrictEqual(o2, o1, 'after terrRev bump, terrainObj is a new object');

  const boxAfter = api.terrainBox();
  assert.ok(boxAfter.x1 > boxBefore.x1, `terrainBox().x1 grew (${boxBefore.x1} -> ${boxAfter.x1})`);

  const zAfter = api.terrainZ(1800, 300);
  assert.ok(
    Math.abs(zAfter - zBefore) <= 0.5,
    `terrainZ(1800, 300) stayed stable within 0.5 cm (${zBefore} vs ${zAfter})`
  );
});

test('(c) app.js source wiring for tp/zsb data-p, plinth tp shift, walkLevels zs, terrainDrop, commit terrRev', () => {
  const tpHtml = fnSrcOf(src, 'terrainPanelHtml');
  assert.match(tpHtml, /data-k="tp"[^>]*data-p=/, 'tp input in terrainPanelHtml has data-p');

  const propsSrc = fnSrcOf(src, 'renderProps');
  assert.match(propsSrc, /data-k="zsb"[^>]*data-p=/, 'zsb input in renderProps has data-p');

  const applySrc = fnSrcOf(src, 'applyProp');
  assert.match(applySrc, /p\s*===\s*'plinth'[\s\S]*?g\.tp\s*=[\s\S]*?\.z\b/, 'applyProp plinth branch shifts g.tp z values');

  const wlSrc = fnSrcOf(src, 'walkLevels');
  assert.match(wlSrc, /L\.zs\s*=[\s\S]*?layersVis\.site[\s\S]*?v3dShown/, 'walkLevels zs uses layersVis.site and v3dShown');

  const b3dSrc = fnSrcOf(src, 'build3D');
  assert.match(b3dSrc, /terrainDrop\s*=[\s\S]*?zoneLiftAt\s*\(/, 'build3D terrainDrop adds zoneLiftAt');

  const commitSrc = fnSrcOf(src, 'commit');
  assert.match(commitSrc, /terrRev\s*\+\+/, 'commit() increments terrRev');
});
