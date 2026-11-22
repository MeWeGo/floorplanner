/* Tests for site parcel boundary & outdoor ground zones (#150): ZONE-PARAM parity,
   cleanZone/zoneFinish/zoneSetback sandbox, app.js wiring, IFC4 IFCSITE export,
   and MCP add_zone/get_project/summarize roundtrip. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, markerBlock, mcpClient } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n');
const mcpSrc = read('mcp/server.js').replace(/\r\n/g, '\n');

function loadZoneParam() {
  return new Function(`
    ${markerBlock(src, 'ZONE-PARAM')}
    return { ZONE_TYPES, ZONE_CURB_MAX, ZONE_SB_MAX, zoneFinish, cleanZone, zoneSetback };
  `)();
}

test('(1) ZONE-PARAM block is byte-identical in app.js and mcp/server.js', () => {
  assert.strictEqual(
    markerBlock(mcpSrc, 'ZONE-PARAM'),
    markerBlock(src, 'ZONE-PARAM'),
    'ZONE-PARAM block in mcp/server.js must match app.js'
  );
});

test('(2) cleanZone validation, clamping, rounding and zoneFinish in sandbox', () => {
  const { ZONE_TYPES, ZONE_CURB_MAX, ZONE_SB_MAX, zoneFinish, cleanZone } = loadZoneParam();

  // Unknown zt defaults to lawn; non-finite points dropped; valid points rounded to 0.1
  const o1 = {
    zt: 'lava',
    pts: [
      { x: 12.34, y: -45.67 },
      { x: NaN, y: 0 },
      { x: 0, y: Infinity },
      null,
      { x: 100, y: 200 },
      { x: 0, y: 200 },
    ],
  };
  cleanZone(o1);
  assert.strictEqual(o1.zt, 'lawn');
  assert.deepStrictEqual(o1.pts, [
    { x: 12.3, y: -45.7 },
    { x: 100, y: 200 },
    { x: 0, y: 200 },
  ]);

  // floor dropped when equal to type default, kept when different
  const oRoadDef = { zt: 'road', floor: ZONE_TYPES.road[2], pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
  cleanZone(oRoadDef);
  assert.ok(!('floor' in oRoadDef), 'default floor for road (asphalt) is dropped');
  assert.strictEqual(zoneFinish(oRoadDef), 'asphalt');

  const oRoadCustom = { zt: 'road', floor: 'stone', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
  cleanZone(oRoadCustom);
  assert.strictEqual(oRoadCustom.floor, 'stone');
  assert.strictEqual(zoneFinish(oRoadCustom), 'stone');

  // color validation
  const oColGood = { zt: 'patio', color: '#a1B2c3', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
  cleanZone(oColGood);
  assert.strictEqual(oColGood.color, '#a1B2c3');
  for (const bad of ['red', '#fff', '#12345g', '123456', 123]) {
    const oBad = { zt: 'patio', color: bad, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
    cleanZone(oBad);
    assert.ok(!('color' in oBad), `invalid color ${bad} is dropped`);
  }

  // curb: 0 dropped, > max clamped, parcel never keeps curb
  const oCurbZero = { zt: 'road', curb: 0, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
  cleanZone(oCurbZero);
  assert.ok(!('curb' in oCurbZero), 'curb 0 is dropped');

  const oCurbMax = { zt: 'road', curb: ZONE_CURB_MAX + 100, pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
  cleanZone(oCurbMax);
  assert.strictEqual(oCurbMax.curb, ZONE_CURB_MAX);

  const oParcelCurb = { zt: 'parcel', curb: 20, setback: 150, pts: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }] };
  cleanZone(oParcelCurb);
  assert.ok(!('curb' in oParcelCurb), 'parcel never keeps curb');
  assert.strictEqual(oParcelCurb.setback, 150);

  // setback only for parcel, clamped to ZONE_SB_MAX
  const oLawnSb = { zt: 'lawn', setback: 300, sb: [100, 100, 100], pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] };
  cleanZone(oLawnSb);
  assert.ok(!('setback' in oLawnSb), 'non-parcel drops setback');
  assert.ok(!('sb' in oLawnSb), 'non-parcel drops sb');

  const oParcelSbMax = { zt: 'parcel', setback: ZONE_SB_MAX + 500, pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] };
  cleanZone(oParcelSbMax);
  assert.strictEqual(oParcelSbMax.setback, ZONE_SB_MAX);

  // sb kept only for parcel with one value per point and at least one > 0
  const pts4 = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }];
  const oSbOk = { zt: 'parcel', sb: [0, 200, 0, 50], pts: pts4 };
  cleanZone(oSbOk);
  assert.deepStrictEqual(oSbOk.sb, [0, 200, 0, 50]);

  const oSbZero = { zt: 'parcel', sb: [0, 0, 0, 0], pts: pts4 };
  cleanZone(oSbZero);
  assert.ok(!('sb' in oSbZero), 'all-zero sb is dropped');

  const oSbWrongLen = { zt: 'parcel', sb: [100, 200], pts: pts4 };
  cleanZone(oSbWrongLen);
  assert.ok(!('sb' in oSbWrongLen), 'wrong-length sb is dropped');
});

test('(3) zoneSetback inset rectangle (CW & CCW), per-edge sb, and null without setback', () => {
  const { zoneSetback } = loadZoneParam();

  const cw = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }];
  const ccw = [{ x: 0, y: 0 }, { x: 0, y: 600 }, { x: 1000, y: 600 }, { x: 1000, y: 0 }];

  const expected = [
    { x: 100, y: 100 },
    { x: 900, y: 100 },
    { x: 900, y: 500 },
    { x: 100, y: 500 },
  ];

  const sbCw = zoneSetback({ zt: 'parcel', pts: cw, setback: 100 });
  assert.deepStrictEqual(sbCw, expected);

  const sbCcw = zoneSetback({ zt: 'parcel', pts: ccw, setback: 100 });
  const key = p => `${p.x},${p.y}`;
  assert.deepStrictEqual(sbCcw.map(key).sort(), expected.map(key).sort(), 'CCW gives the same inset rectangle corners');

  const sbEdge = zoneSetback({ zt: 'parcel', pts: cw, sb: [0, 200, 0, 0] });
  assert.deepStrictEqual(sbEdge, [
    { x: 0, y: 0 },
    { x: 800, y: 0 },
    { x: 800, y: 600 },
    { x: 0, y: 600 },
  ]);

  assert.strictEqual(zoneSetback({ zt: 'parcel', pts: cw }), null);
  assert.strictEqual(zoneSetback({ zt: 'parcel', pts: cw, setback: 0 }), null);
  assert.strictEqual(zoneSetback({ zt: 'parcel', pts: cw.slice(0, 2), setback: 100 }), null);
});

test('(4) app.js and mcp/server.js wiring for site zones', () => {
  assert.match(src, /const KINDS\s*=\s*\{[^}]*\bzones:\s*'zone'/);
  assert.match(mcpSrc, /const KINDS\s*=\s*\{[^}]*\bzones:\s*'zone'/);

  assert.match(src, /const PTS_KINDS\s*=\s*new Set\(\[[^\]]*'zone'/);
  assert.match(src, /POLY_KINDS\s*=\s*new Set\(\[[^\]]*'zone'/);
  assert.match(src, /const XFORM_KINDS\s*=\s*new Set\(\[[^\]]*'zone'/);
  assert.match(src, /const LAYER_ARR\s*=\s*\{[^}]*\bzone:\s*'zones'/);
  assert.match(src, /const POLY_TOOLS\s*=\s*new Set\(\[[^\]]*'zone'/);

  assert.match(src, /newFloor\s*=[^;]*zones:\s*\[\]/);
  assert.match(mcpSrc, /function newFloor\([^)]*\)\s*\{[^}]*zones:\s*\[\]/);

  const addPolySrc = fnSrcOf(src, 'addPolyObj');
  assert.match(addPolySrc, /t\s*===\s*'zone'\s*\?\s*mkZone\(pts\)/);

  assert.match(fnSrcOf(src, 'layerStrings'), /siteZonesSvg\s*\(\s*f\s*,\s*live\s*\)/);
  assert.match(fnSrcOf(src, 'siteZonesSvg'), /zoneSvg\s*\(\s*z\s*,\s*false\s*,\s*true\s*\)/);

  const zoneSvgSrc = fnSrcOf(src, 'zoneSvg');
  assert.match(zoneSvgSrc, /zoneSetback\s*\(\s*o\s*\)/);
  assert.match(zoneSvgSrc, /fmtArea\s*\(\s*area\s*\)/);
  assert.ok(!/\.rooms\.push/.test(zoneSvgSrc) && !/\.rooms\.push/.test(fnSrcOf(src, 'siteZonesSvg')));

  assert.match(fnSrcOf(src, 'build3D'), /zones3D\s*\(/);
  assert.match(fnSrcOf(src, 'walkLevels'), /L\.zs\s*=/);
  assert.match(fnSrcOf(src, 'walkGroundAt'), /L\.zs[\s\S]*\+z\.curb/);

  assert.match(fnSrcOf(src, 'revitExport'), /out\.site\s*=/);
  assert.match(markerBlock(src, 'IFC-EXPORT'), /IFCGEOGRAPHICELEMENT\([^\n]*\.USERDEFINED\./);

  assert.match(src, /\['zone',\s*'[^']+',\s*'[^']+',\s*'',\s*'Site zone'\]/);
  assert.match(src, /\['terrain',\s*'[^']+',\s*'[^']+',\s*'',\s*'Terrain'\]/);
  assert.match(fnSrcOf(src, 'buildTools'), /t\[3\]\s*\?\s*`\s*\(\$\{t\[3\]\}\)`\s*:\s*''/);

  assert.match(fnSrcOf(src, 'setCursor'), /\[[^\]]*'zone'[^\]]*\]\.includes\(tool\)/);
  assert.match(fnSrcOf(src, 'cvDown'), /case\s*'zone'\s*:/);
  assert.match(fnSrcOf(src, 'paste'), /kind\s*===\s*'zone'/);

  const propsSrc = fnSrcOf(src, 'renderProps');
  const zoneBranch = propsSrc.slice(propsSrc.indexOf("k === 'zone'"), propsSrc.indexOf("k === 'slab'"));
  assert.ok(zoneBranch.includes('not counted'), 'renderProps zone branch clarifies zones are not counted in room areas');
});

test('(5) IFC writer writes IFCGEOGRAPHICELEMENT (.USERDEFINED.) for exchange.site contained in IFCSITE', () => {
  const { ifcFromExchange } = new Function(
    markerBlock(src, 'IFC-EXPORT') + '; return { ifcFromExchange };'
  )();

  const makeRng = (seed = 42) => {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const ex = {
    name: 'Site Zones IFC Test',
    levels: [{ id: 'L0', name: 'Zemin Kat', elev: 0 }],
    walls: [],
    openings: [],
    floors: [],
    rooms: [],
    items: [],
    site: [
      { id: 'z1', zt: 'road', name: '', loop: [[0, 0], [10, 0], [10, 5], [0, 5]], top: 0.1, t: 0.07, finish: 'asphalt', color: '' },
      { id: 'p1', zt: 'parcel', name: 'Lot', loop: [[-5, -5], [20, -5], [20, 15], [-5, 15]], top: 0, t: 0.07, finish: 'none', color: '' },
    ],
  };

  const step = ifcFromExchange(ex, { random: makeRng(7), date: '2026-01-15T10:30:00.000Z' });
  const siteMatch = step.match(/^(#\d+)=IFCSITE\(/m);
  assert.ok(siteMatch, 'IFCSITE entity present');
  const siteId = siteMatch[1];

  const geoLines = step.match(/^#\d+=IFCGEOGRAPHICELEMENT\(.*,\.USERDEFINED\.\);$/gm) || [];
  assert.strictEqual(geoLines.length, 2, 'two IFCGEOGRAPHICELEMENT lines with .USERDEFINED.');

  const parcelLine = geoLines.find(l => l.includes("'Parcel'"));
  const roadLine = geoLines.find(l => l.includes("'road'"));
  assert.ok(parcelLine, 'parcel line has ObjectType Parcel');
  assert.ok(roadLine, 'road line has ObjectType road');

  const shapeIdOf = line => line.match(/(#\d+),\$?,\.USERDEFINED\.\);$/)?.[1] || line.match(/,(#\d+),\$,\.USERDEFINED\.\);$/)?.[1];
  const parcelShape = step.match(new RegExp(`^${shapeIdOf(parcelLine)}=IFCPRODUCTDEFINITIONSHAPE\\(.*\\((#\\d+)\\)\\);$`, 'm'));
  const roadShape = step.match(new RegExp(`^${shapeIdOf(roadLine)}=IFCPRODUCTDEFINITIONSHAPE\\(.*\\((#\\d+)\\)\\);$`, 'm'));
  assert.ok(parcelShape && roadShape);

  const parcelRep = step.match(new RegExp(`^${parcelShape[1]}=IFCSHAPEREPRESENTATION\\([^)]*'FootPrint','Curve2D'`, 'm'));
  const roadRep = step.match(new RegExp(`^${roadShape[1]}=IFCSHAPEREPRESENTATION\\([^)]*'Body','SweptSolid'`, 'm'));
  assert.ok(parcelRep, 'parcel uses FootPrint Curve2D representation');
  assert.ok(roadRep, 'road uses SweptSolid representation');

  for (const line of geoLines) {
    const id = line.match(/^(#\d+)=/)[1];
    assert.match(step, new RegExp(`^#\\d+=IFCRELCONTAINEDINSPATIALSTRUCTURE\\(.*\\(${id}\\),${siteId}\\);$`, 'm'), `${id} contained in IFCSITE`);
  }
});

test('(6) MCP stdio: add_zone parcel & road, get_project, summarize, error cases', async t => {
  const c = mcpClient();
  t.after(() => c.stop());

  await c.call('initialize', {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'site-zones-test', version: '1' },
  });
  assert.ok(!(await c.tool('new_project', { name: 'Site Zones Test' })).err);

  const parcelPts = [{ x: -500, y: -500 }, { x: 2000, y: -500 }, { x: 2000, y: 1500 }, { x: -500, y: 1500 }];
  const rParcel = await c.tool('add_zone', { type: 'parcel', pts: parcelPts, setback: 300, name: 'Lot 7' });
  assert.ok(!rParcel.err, rParcel.text);

  const roadPts = [{ x: -500, y: -500 }, { x: 2000, y: -500 }, { x: 2000, y: -100 }, { x: -500, y: -100 }];
  const rRoad = await c.tool('add_zone', { type: 'road', pts: roadPts, curb: 15 });
  assert.ok(!rRoad.err, rRoad.text);

  const projRes = await c.tool('get_project', {});
  assert.ok(!projRes.err, projRes.text);
  const proj = JSON.parse(projRes.text);
  const zones = proj.floors[0].zones;
  assert.strictEqual(zones.length, 2);
  assert.strictEqual(zones[0].zt, 'parcel');
  assert.strictEqual(zones[0].setback, 300);
  assert.strictEqual(zones[0].name, 'Lot 7');
  assert.strictEqual(zones[1].zt, 'road');
  assert.strictEqual(zones[1].curb, 15);
  assert.ok(!('floor' in zones[1]), 'road with default asphalt finish has no floor field');

  const sumRes = await c.tool('summarize', {});
  assert.ok(!sumRes.err, sumRes.text);
  assert.ok(sumRes.text.includes('site parcel'), sumRes.text);
  assert.ok(sumRes.text.includes('outdoor zone (road)'), sumRes.text);
  assert.ok(sumRes.text.includes('not a room'), sumRes.text);

  const badType = await c.tool('add_zone', { type: 'lava', pts: roadPts });
  assert.ok(badType.err, 'unknown zone type should error');

  const badSb = await c.tool('add_zone', { type: 'parcel', pts: parcelPts, setbacks: [100, 200] });
  assert.ok(badSb.err, 'parcel with wrong setbacks length should error');
});
