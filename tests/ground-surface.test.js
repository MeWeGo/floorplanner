/* Tests for project-level 3D ground surface (#147): GROUND-PARAM parity, groundP/cleanGround
   sandbox, app.js wiring, and MCP set_ground/get_project/summarize roundtrip. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, markerBlock, mcpClient } = require('./helpers/repo');

const src = read('app.js');
const mcpSrc = read('mcp/server.js');

function loadGroundParam() {
  return new Function(`
    ${markerBlock(src, 'GROUND-PARAM')}
    return {
      GROUND_KINDS, GROUND_COL, GROUND_TILE, GROUND_SCALE_MIN, GROUND_SCALE_MAX,
      groundP, cleanGround,
    };
  `)();
}

test('(1) GROUND-PARAM block is byte-identical in app.js and mcp/server.js', () => {
  assert.strictEqual(
    markerBlock(mcpSrc, 'GROUND-PARAM'),
    markerBlock(src, 'GROUND-PARAM'),
    'GROUND-PARAM block in mcp/server.js must match app.js'
  );
});

test('(2) groundP defaults, validation, clamping and rounding in sandbox', () => {
  const { GROUND_SCALE_MIN, GROUND_SCALE_MAX, groundP } = loadGroundParam();

  assert.deepStrictEqual(groundP(null), { kind: 'auto', color: null, scale: null, plinth: 20, tp: [], ci: 50, snap: false });
  assert.deepStrictEqual(groundP({}), { kind: 'auto', color: null, scale: null, plinth: 20, tp: [], ci: 50, snap: false });
  assert.deepStrictEqual(groundP({ ground: null }), { kind: 'auto', color: null, scale: null, plinth: 20, tp: [], ci: 50, snap: false });

  for (const bad of ['lava', 123, '', 'tex:', 'tex:bad id!']) {
    assert.strictEqual(groundP({ ground: { kind: bad } }).kind, 'auto', `invalid kind ${bad} -> auto`);
  }

  assert.strictEqual(groundP({ ground: { kind: 'tex:stone_1-a' } }).kind, 'tex:stone_1-a');
  assert.strictEqual(groundP({ ground: { kind: 'sand' } }).kind, 'sand');

  assert.strictEqual(groundP({ ground: { color: '#AABBCC' } }).color, '#aabbcc');
  for (const badCol of ['red', '#fff', '#12345g', '123456', 123456, null]) {
    assert.strictEqual(groundP({ ground: { color: badCol } }).color, null, `invalid color ${badCol} -> null`);
  }

  assert.strictEqual(groundP({ ground: { scale: 1 } }).scale, GROUND_SCALE_MIN);
  assert.strictEqual(groundP({ ground: { scale: 99999 } }).scale, GROUND_SCALE_MAX);
  assert.strictEqual(groundP({ ground: { scale: 250.6 } }).scale, 251);
  for (const badScale of [0, -10, 'abc', NaN, null]) {
    assert.strictEqual(groundP({ ground: { scale: badScale } }).scale, null, `invalid scale ${badScale} -> null`);
  }
});

test('(3) cleanGround drops defaults/invalid values, keeps valid ones, leaves missing ground untouched', () => {
  const { GROUND_TILE, cleanGround } = loadGroundParam();

  const untouched = { name: 'Old' };
  cleanGround(untouched);
  assert.ok(!('ground' in untouched), 'project without ground stays without ground key');

  const allDefault = { ground: { kind: 'auto', color: 'bad', scale: -5 } };
  cleanGround(allDefault);
  assert.ok(!('ground' in allDefault), 'all-default ground is deleted');

  const noneDrop = { ground: { kind: 'none', color: '#112233', scale: 300 } };
  cleanGround(noneDrop);
  assert.deepStrictEqual(noneDrop.ground, { kind: 'none' }, 'color and scale dropped for kind none');

  const tileDrop = { ground: { kind: 'sand', scale: GROUND_TILE.sand } };
  cleanGround(tileDrop);
  assert.deepStrictEqual(tileDrop.ground, { kind: 'sand' }, 'scale equal to GROUND_TILE[kind] is dropped');

  const valid = { ground: { kind: 'sand', color: '#AABBCC', scale: 300 } };
  cleanGround(valid);
  assert.deepStrictEqual(valid.ground, { kind: 'sand', color: '#aabbcc', scale: 300 });
});

test('(4) app.js wiring for 3D ground surface', () => {
  const build3DSrc = fnSrcOf(src, 'build3D');
  assert.match(build3DSrc, /groundMat\s*\(\s*'cad'\s*\)/);
  assert.match(build3DSrc, /ground\.visible\s*=\s*groundP\s*\(\s*P\s*\)\.kind\s*!==\s*'none'/);

  const liveSrc = fnSrcOf(src, 'applyLive3D');
  assert.match(liveSrc, /groundMat\s*\(\s*'real'\s*\)/);
  assert.match(liveSrc, /ground\.color\.multiplyScalar\s*\(/);

  const hqSrc = fnSrcOf(src, 'render3DHQ');
  assert.match(hqSrc, /groundMat\s*\([^)]*'real'\s*:\s*'paper'\s*\)/);
  assert.match(hqSrc, /T3\.ground\.material\s*=\s*oldGroundMat/);

  const antiTileSrc = fnSrcOf(src, 'groundAntiTile');
  assert.match(antiTileSrc, /#include <map_fragment>/);
  assert.match(antiTileSrc, /texelColor\.a\s*=\s*1\.0/);

  const skySrc = fnSrcOf(src, 'makeSky');
  assert.match(skySrc, /\bunder\s*:/);
  assert.match(skySrc, /uniform\s+float\s+under\b/);

  assert.match(fnSrcOf(src, 'normalizeProject'), /\bcleanGround\s*\(\s*P\s*\)/);
  assert.match(fnSrcOf(src, 'projectPanel'), /\bgroundPanelHtml\s*\(\s*\)/);
  assert.match(fnSrcOf(src, 'applyProp'), /if\s*\(\s*k\s*===\s*'ground'\s*\)[\s\S]*?if\s*\(\s*final\s*\)[^;]*commit\s*\(/);
});

test('(5) MCP stdio: set_ground, get_project, summarize, error handling, reset', async t => {
  const c = mcpClient();
  t.after(() => c.stop());

  await c.call('initialize', {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ground-surface-test', version: '1' },
  });

  const np = await c.tool('new_project', { name: 'Ground Test' });
  assert.ok(!np.err, np.text);

  const setRes = await c.tool('set_ground', { kind: 'sand', color: '#AABBCC', scale: 300 });
  assert.ok(!setRes.err, setRes.text);

  const projRes = await c.tool('get_project', {});
  assert.ok(!projRes.err, projRes.text);
  const proj = JSON.parse(projRes.text);
  assert.deepStrictEqual(proj.ground, { kind: 'sand', color: '#aabbcc', scale: 300 });

  const sumRes = await c.tool('summarize', {});
  assert.ok(!sumRes.err, sumRes.text);
  assert.ok(sumRes.text.includes('3D ground: sand'), sumRes.text);

  const badRes = await c.tool('set_ground', { kind: 'lava' });
  assert.ok(badRes.err, 'unknown ground kind should return an error');

  const resetRes = await c.tool('set_ground', { kind: 'auto', color: null, scale: null, plinth: 20, tp: [], ci: 50, snap: false });
  assert.ok(!resetRes.err, resetRes.text);

  const projAfter = JSON.parse((await c.tool('get_project', {})).text);
  assert.ok(!('ground' in projAfter), 'auto + null color/scale removes ground from project');
});

test('(6) groundP and cleanGround plinth validation, clamping, rounding and defaults', () => {
  const { GROUND_PLINTH_DEF, GROUND_PLINTH_MAX, groundP, cleanGround } = new Function(`
    ${markerBlock(src, 'GROUND-PARAM')}
    return { GROUND_PLINTH_DEF, GROUND_PLINTH_MAX, groundP, cleanGround };
  `)();

  assert.strictEqual(GROUND_PLINTH_DEF, 20);
  assert.strictEqual(groundP(null).plinth, 20);
  assert.strictEqual(groundP({}).plinth, 20);
  assert.strictEqual(groundP({ ground: { plinth: -15 } }).plinth, 0);
  assert.strictEqual(groundP({ ground: { plinth: 9999 } }).plinth, GROUND_PLINTH_MAX);
  assert.strictEqual(groundP({ ground: { plinth: 45.6 } }).plinth, 46);
  for (const bad of [null, '', 'abc', NaN, undefined]) {
    assert.strictEqual(groundP({ ground: { plinth: bad } }).plinth, 20, `invalid plinth ${bad} -> 20`);
  }

  const kept = { ground: { plinth: 90 } };
  cleanGround(kept);
  assert.deepStrictEqual(kept.ground, { plinth: 90 });

  const dropped = { ground: { plinth: 20 } };
  cleanGround(dropped);
  assert.ok(!('ground' in dropped), 'plinth == 20 is dropped');

  const zero = { ground: { plinth: 0 } };
  cleanGround(zero);
  assert.deepStrictEqual(zero.ground, { plinth: 0 }, 'plinth: 0 is valid and kept');
});

test('(7) segX segment intersection in sandbox', () => {
  const segX = new Function(fnSrcOf(src, 'segX') + '\nreturn segX;')();
  assert.strictEqual(segX({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }), true);
  assert.strictEqual(segX({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 }), false);
  assert.strictEqual(segX({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: -5 }, { x: 10, y: 5 }), false);
});

test('(8) groundCuts in sandbox: basement, pit void, overlapping basements, ground floor alone', () => {
  const ptLine = src.match(/function pointInPoly\([^\n]+/);
  assert.ok(ptLine, 'missing pointInPoly');

  const mkCutsApi = (floors, elevs) => new Function('floors', 'elevs', `
    const P = { floors };
    const floorElev = i => elevs[i];
    const visFloor = f => f;
    const v3dShown = () => true;
    const v3dElev = floorElev;
    const slabPolys = f => f.rect ? [f.rect] : [];
    const groundDatum3D = () => 0;
    const polyUnion = polys => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const ps of polys) for (const p of ps) {
        if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y;
        if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
      }
      return [[{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]];
    };
    ${ptLine[0]}
    ${fnSrcOf(src, 'segX')}
    ${fnSrcOf(src, 'groundCuts')}
    return groundCuts;
  `)(floors, elevs);

  const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

  // (1) basement floor at -290 -> bot -310
  const c1 = mkCutsApi([{ rect: rect(0, 0, 200, 200) }], [-290])(false);
  assert.strictEqual(c1.length, 1);
  assert.strictEqual(c1[0].bot, -310);

  // (2) ground-floor pit void with dep 150 at elevation 0 -> bot -170
  const c2 = mkCutsApi([{ voids: [{ dep: 150, pts: rect(20, 20, 120, 120) }] }], [0])(false);
  assert.strictEqual(c2.length, 1);
  assert.strictEqual(c2[0].bot, -170);

  // (3) two overlapping basement rectangles on different basement floors -> merged with deeper bot
  const c3 = mkCutsApi([
    { rect: rect(0, 0, 200, 200) },
    { rect: rect(100, 100, 300, 300) },
  ], [-580, -290])(false);
  assert.strictEqual(c3.length, 1);
  assert.strictEqual(c3[0].bot, -600);
  assert.deepStrictEqual(c3[0].pts, rect(0, 0, 300, 300));

  // (4) ground floor alone -> no cuts
  const c4 = mkCutsApi([{ rect: rect(0, 0, 200, 200), voids: [] }], [0])(false);
  assert.deepStrictEqual(c4, []);
});

test('(9) walkGroundAt outdoor ground, plinth step-up/blocking, and free slab override', () => {
  const walkLine = src.match(/const WALK\s*=[^;\n]+;/);
  const ptLine = src.match(/function pointInPoly\([^\n]+/);
  assert.ok(walkLine && ptLine, 'missing WALK or pointInPoly');

  const walkApi = new Function(`
    const surfZAt = () => 0, surfSloped = () => false;
    const furnElev = o => +o.elev || 0, walkSurfAt = () => null;
    ${walkLine[0]}
    ${ptLine[0]}
    ${fnSrcOf(src, 'walkGround')}
    ${fnSrcOf(src, 'walkGroundAt')}
    return { walkGround, walkGroundAt, WALK };
  `)();

  const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  const f = { furn: [], voids: [], rooms: [], slabs: [] };
  const lv = [{ f, base: 0, sp: () => [rect(0, 0, 400, 400)], gnd: -101 }];

  assert.strictEqual(walkApi.walkGroundAt(lv, { x: 600, y: 600 }, -101).g, -101, 'outside footprint -> gnd');
  assert.strictEqual(walkApi.walkGroundAt(lv, { x: 200, y: 200 }, -101).block, true, 'inside at -101 with base 0 > stepUp blocks');
  assert.strictEqual(walkApi.walkGroundAt(lv, { x: 200, y: 200 }, 0).g, 0, 'inside at z=0 -> g=0');

  const lvLow = [{ f, base: 0, sp: () => [rect(0, 0, 400, 400)], gnd: -21 }];
  assert.strictEqual(walkApi.walkGroundAt(lvLow, { x: 200, y: 200 }, -21).g, 0, 'plinth 20 (gnd -21): steps up to 0');

  const fSlab = { furn: [], voids: [], rooms: [], slabs: [{ pts: rect(500, 500, 700, 700), off: -80, t: 20 }] };
  const lvSlab = [{ f: fSlab, base: 0, sp: () => [rect(0, 0, 400, 400)], gnd: -101 }];
  assert.strictEqual(walkApi.walkGroundAt(lvSlab, { x: 600, y: 600 }, -101).g, -80, 'free slab outside footprint wins over ground');
});

test('(10) app.js wiring for plinth skirt, excavation sides, section earth and outdoor walk', () => {
  const b3d = fnSrcOf(src, 'build3D');
  assert.match(b3d, /userData\.plinth\s*=\s*true/);
  assert.match(b3d, /earthSides3D\s*\(\s*gCuts\b/);
  assert.match(b3d, /polygonOffset\s*:\s*true/);

  assert.match(fnSrcOf(src, 'earthSides3D'), /userData\.fpDecal\s*=\s*true/);
  assert.match(fnSrcOf(src, 'groundY3D'), /groundP\s*\(\s*P\s*\)\.plinth/);

  const ap = fnSrcOf(src, 'archPrims');
  assert.match(ap, /skirt/);
  assert.match(ap, /groundFloorIdx\s*\(\s*\)/);

  const asvg = fnSrcOf(src, 'archSvg');
  assert.match(asvg, /id="earthH"/);
  const earthIdx = asvg.indexOf('out += earth');
  const cutLoopIdx = asvg.indexOf("prims.filter(p => p.t === 'cut')");
  assert.ok(earthIdx > 0 && cutLoopIdx > earthIdx, 'out += earth must appear before cut prims loop');

  const wl = fnSrcOf(src, 'walkLevels');
  assert.match(wl, /groundFloorIdx\s*\(\s*\)/);
  assert.match(wl, /L\.gnd\s*=/);
});

test('(11) MCP stdio: set_ground plinth roundtrip and reset', async t => {
  const c = mcpClient();
  t.after(() => c.stop());

  await c.call('initialize', {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ground-plinth-test', version: '1' },
  });
  assert.ok(!(await c.tool('new_project', { name: 'Plinth Test' })).err);

  const setRes = await c.tool('set_ground', { plinth: 90 });
  assert.ok(!setRes.err, setRes.text);

  const proj = JSON.parse((await c.tool('get_project', {})).text);
  assert.strictEqual(proj.ground.plinth, 90);

  const sumRes = await c.tool('summarize', {});
  assert.ok(!sumRes.err, sumRes.text);
  assert.ok(sumRes.text.includes('plinth 90 cm'), sumRes.text);

  const clrRes = await c.tool('set_ground', { plinth: null });
  assert.ok(!clrRes.err, clrRes.text);

  const projAfter = JSON.parse((await c.tool('get_project', {})).text);
  assert.ok(!projAfter.ground || !('plinth' in projAfter.ground), 'plinth: null removes plinth');
});

test('(12) groundP and cleanGround terrain fields (tp, ci, snap)', () => {
  const {
    GROUND_TP_MAX, GROUND_TZ_MAX, GROUND_CI, GROUND_CI_DEF, groundP, cleanGround,
  } = new Function(`
    ${markerBlock(src, 'GROUND-PARAM')}
    return { GROUND_TP_MAX, GROUND_TZ_MAX, GROUND_CI, GROUND_CI_DEF, groundP, cleanGround };
  `)();

  assert.strictEqual(GROUND_CI_DEF, 50);

  // tp filtering, 0.1 rounding, ±GROUND_TZ_MAX clamping, GROUND_TP_MAX cap
  const rawTp = [
    null,
    { x: 1, y: 2 },
    { x: NaN, y: 0, z: 10 },
    { x: 0, y: Infinity, z: 0 },
    { x: 0, y: 0, z: 'abc' },
    { x: 12.34, y: -45.67, z: 89.14 },
    { x: 0, y: 0, z: 99999 },
    { x: 0, y: 0, z: -99999 },
  ];
  const g1 = groundP({ ground: { tp: rawTp } });
  assert.deepStrictEqual(g1.tp, [
    { x: 12.3, y: -45.7, z: 89.1 },
    { x: 0, y: 0, z: GROUND_TZ_MAX },
    { x: 0, y: 0, z: -GROUND_TZ_MAX },
  ]);

  const many = Array.from({ length: GROUND_TP_MAX + 15 }, (_, i) => ({ x: i, y: i, z: 10 }));
  assert.strictEqual(groundP({ ground: { tp: many } }).tp.length, GROUND_TP_MAX);

  // ci: only values from GROUND_CI, else 50
  for (const ci of GROUND_CI) {
    assert.strictEqual(groundP({ ground: { ci } }).ci, ci);
  }
  for (const badCi of [0, 33, 75, 'abc', null, NaN]) {
    assert.strictEqual(groundP({ ground: { ci: badCi } }).ci, 50, `invalid ci ${badCi} -> 50`);
  }

  // snap: only true when === true
  assert.strictEqual(groundP({ ground: { snap: true } }).snap, true);
  for (const badSnap of [false, 1, 'true', null, undefined]) {
    assert.strictEqual(groundP({ ground: { snap: badSnap } }).snap, false, `snap ${badSnap} -> false`);
  }

  // cleanGround
  const keptTp = { ground: { tp: [{ x: 10, y: 20, z: 30 }] } };
  cleanGround(keptTp);
  assert.deepStrictEqual(keptTp.ground, { tp: [{ x: 10, y: 20, z: 30 }] });

  const emptyTp = { ground: { tp: [] } };
  cleanGround(emptyTp);
  assert.ok(!('ground' in emptyTp), 'empty tp is dropped');

  const ciDef = { ground: { ci: 50 } };
  cleanGround(ciDef);
  assert.ok(!('ground' in ciDef), 'ci 50 is dropped');

  const ciKeep = { ground: { ci: 100 } };
  cleanGround(ciKeep);
  assert.deepStrictEqual(ciKeep.ground, { ci: 100 });

  const snapKeep = { ground: { snap: true } };
  cleanGround(snapKeep);
  assert.deepStrictEqual(snapKeep.ground, { snap: true });

  const snapDrop = { ground: { snap: false } };
  cleanGround(snapDrop);
  assert.ok(!('ground' in snapDrop), 'snap false is dropped');
});

test('(13) terrainBox, terrainObj, terrainZ in sandbox', () => {
  const api = new Function(`
    let P = { floors: [{}] };
    let hi = 0;
    const contentBounds = () => ({ x0: 0, y0: 0, x1: 1000, y1: 700 });
    ${markerBlock(src, 'GROUND-PARAM')}
    ${markerBlock(src, 'SURF-SLOPE')}
    let _terr = { key: null, o: null }, terrRev = 0;
    ${fnSrcOf(src, 'terrainRing')}
    ${fnSrcOf(src, 'terrainBox')}
    ${fnSrcOf(src, 'terrainObj')}
    ${fnSrcOf(src, 'terrainZ')}
    return {
      setP: p => { P = p; },
      terrainBox, terrainObj, terrainZ,
    };
  `)();

  api.setP({ floors: [{}], ground: { plinth: 20, tp: [{ x: 500, y: 350, z: 280 }] } });
  const box = api.terrainBox();
  assert.deepStrictEqual(box, { x0: -2000, y0: -2000, x1: 3000, y1: 2700 });

  const o1 = api.terrainObj();
  assert.ok(o1, 'terrainObj returns an object when tp is non-empty');
  assert.strictEqual(api.terrainObj(), o1, 'second call with same P returns cached object');

  assert.ok(Math.abs(api.terrainZ(500, 350) - 280) < 1e-3, `terrainZ(500,350) got ${api.terrainZ(500, 350)}`);
  assert.strictEqual(api.terrainZ(-5000, -5000), -20, 'far outside box -> -plinth');
  assert.strictEqual(api.terrainZ(5000, 5000), -20, 'far outside box -> -plinth');
  assert.strictEqual(api.terrainZ(-2000, -2000), -20, 'box corner -> -plinth');
  assert.strictEqual(api.terrainZ(3000, 2700), -20, 'box corner -> -plinth');

  api.setP({ floors: [{}], ground: { plinth: 20 } });
  assert.strictEqual(api.terrainObj(), null, 'no tp -> terrainObj() === null');
  assert.strictEqual(api.terrainZ(500, 350), -20, 'no tp -> terrainZ = -plinth');
});

test('(14) app.js wiring for sculptable terrain', () => {
  const gm = fnSrcOf(src, 'groundMesh3D');
  assert.match(gm, /terrainMesh3D\s*\(/);
  assert.match(gm, /Object\.defineProperty\s*\(\s*t\s*,\s*'material'\s*,\s*\{\s*get\s*:\s*\(\)\s*=>\s*m\.material/);
  assert.match(gm, /m\.add\s*\(\s*t\s*\)/);

  const tm = fnSrcOf(src, 'terrainMesh3D');
  assert.match(tm, /cuts\.some\s*\([^)]*pointInPoly\s*\(\s*m\b/);
  assert.match(tm, /\(\s*v\.x\s*\+\s*R\s*\)\s*\/\s*\(\s*2\s*\*\s*R\s*\)/);

  const b3d = fnSrcOf(src, 'build3D');
  assert.match(b3d, /groundMesh3D\s*\([^;\n]*\bgCuts\s*\)/);
  assert.match(b3d, /earthSides3D\s*\(\s*gCuts\b/);
  assert.match(b3d, /groundP\s*\(\s*P\s*\)\.snap[\s\S]*?terrainDrop\s*=/);

  const wl = fnSrcOf(src, 'walkLevels');
  assert.match(wl, /if\s*\(\s*terrainObj\s*\(\s*\)\s*\)\s*L\.tz\s*=/);

  const wg = fnSrcOf(src, 'walkGroundAt');
  assert.match(wg, /L\.gnd\s*\+\s*\(\s*L\.tz\s*\?\s*L\.tz\s*\(\s*p\s*\)\s*:\s*0\s*\)/);

  const wsz = fnSrcOf(src, 'walkSpawnZ');
  assert.match(wsz, /lv\[0\]\.tz\s*\?\s*walkGroundAt\s*\(\s*\[\s*lv\[0\]\s*\]\s*,\s*p\s*,\s*1e6\s*\)/);

  const asvg = fnSrcOf(src, 'archSvg');
  assert.match(asvg, /\bprof\s*\(\s*s\s*\)/);
  assert.match(asvg, /\bePath\s*=/);
  assert.match(asvg, /if\s*\(\s*!tObj\s*\)[\s\S]*?else\s*\{[\s\S]*?<path\s+d="\$\{d\}"/);

  assert.match(fnSrcOf(src, 'layerStrings'), /terrainLayerSvg\s*\(\s*f\s*,\s*live\s*\)/);
  assert.match(fnSrcOf(src, 'revitExport'), /out\.terrain\s*=\s*\{\s*faces\s*:/);

  const ifcBlk = markerBlock(src, 'IFC-EXPORT');
  assert.match(ifcBlk, /IFCGEOGRAPHICELEMENT\([^\n]*\.TERRAIN\./);
  assert.match(ifcBlk, /IFCRELCONTAINEDINSPATIALSTRUCTURE\([^\n]*\$\{site\}/);

  assert.match(src, /const FP3D_2D_ONLY\s*=\s*new Set\(\[[^\]]*'terrain'/);
  assert.match(src, /const HINTS\s*=\s*\{[\s\S]*?\bterrain\s*:/);
  assert.match(src, /const HINTS_EN\s*=\s*\{[\s\S]*?\bterrain\s*:/);
  assert.match(fnSrcOf(src, 'cvDown'), /case\s*'terrain'\s*:/);
  assert.match(fnSrcOf(src, 'deleteSel'), /tool\s*===\s*'terrain'\s*&&\s*ui\.tpSel\s*!=\s*null/);
});

test('(15) IFC writer writes IFCGEOGRAPHICELEMENT (.TERRAIN.) contained in IFCSITE when exchange.terrain is present', () => {
  const { ifcFromExchange } = new Function(
    markerBlock(src, 'IFC-EXPORT') + '; return { ifcFromExchange };'
  )();

  const makeRng = (seed = 123) => {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const baseExchange = () => ({
    name: 'Terrain IFC Test',
    levels: [{ id: 'L0', name: 'Zemin Kat', elev: 0 }],
    walls: [],
    openings: [],
    floors: [],
    rooms: [],
    items: [],
  });

  const opts = { random: makeRng(7), date: '2026-01-15T10:30:00.000Z' };

  const exWith = baseExchange();
  exWith.terrain = {
    faces: [
      [[0, 0, 0], [10, 0, 1], [0, 10, 2]],
      [[10, 0, 1], [10, 10, 0], [0, 10, 2]],
    ],
  };
  const stepWith = ifcFromExchange(exWith, opts);

  const siteMatch = stepWith.match(/^(#\d+)=IFCSITE\(/m);
  assert.ok(siteMatch, 'IFCSITE entity present');
  const siteId = siteMatch[1];

  const geoMatches = stepWith.match(/^#\d+=IFCGEOGRAPHICELEMENT\(.*,\.TERRAIN\.\);$/gm) || [];
  assert.strictEqual(geoMatches.length, 1, 'exactly one IFCGEOGRAPHICELEMENT ending in .TERRAIN.');
  const geoId = geoMatches[0].match(/^(#\d+)=/)[1];

  const relRe = new RegExp(`^#\\d+=IFCRELCONTAINEDINSPATIALSTRUCTURE\\(.*\\(${geoId}\\),${siteId}\\);$`, 'm');
  assert.match(stepWith, relRe, 'terrain contained in IFCSITE via IFCRELCONTAINEDINSPATIALSTRUCTURE');

  const stepWithout = ifcFromExchange(baseExchange(), opts);
  assert.ok(!/IFCGEOGRAPHICELEMENT/.test(stepWithout), 'without exchange.terrain no IFCGEOGRAPHICELEMENT is written');
});

test('(16) MCP stdio: set_terrain roundtrip, add, validation errors, clear', async t => {
  const c = mcpClient();
  t.after(() => c.stop());

  await c.call('initialize', {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'terrain-test', version: '1' },
  });
  assert.ok(!(await c.tool('new_project', { name: 'Terrain Test' })).err);

  const r1 = await c.tool('set_terrain', {
    points: [{ x: 0, y: 0, z: 100 }, { x: 500, y: 0, z: -50 }],
    interval: 100,
    snap: true,
  });
  assert.ok(!r1.err, r1.text);

  const p1 = JSON.parse((await c.tool('get_project', {})).text);
  assert.strictEqual(p1.ground.tp.length, 2);
  assert.strictEqual(p1.ground.ci, 100);
  assert.strictEqual(p1.ground.snap, true);

  const sum = await c.tool('summarize', {});
  assert.ok(!sum.err, sum.text);
  assert.ok(sum.text.includes('Terrain: 2 height point(s)'), sum.text);

  const r2 = await c.tool('set_terrain', { add: [{ x: 1, y: 1, z: 5 }] });
  assert.ok(!r2.err, r2.text);
  const p2 = JSON.parse((await c.tool('get_project', {})).text);
  assert.strictEqual(p2.ground.tp.length, 3);

  const badInt = await c.tool('set_terrain', { interval: 33 });
  assert.ok(badInt.err, 'invalid interval should error');

  const badPt = await c.tool('set_terrain', { points: [{ x: 1, y: 2 }] });
  assert.ok(badPt.err, 'point missing z should error');

  const clr = await c.tool('set_terrain', { clear: true });
  assert.ok(!clr.err, clr.text);
  const p3 = JSON.parse((await c.tool('get_project', {})).text);
  assert.ok(!p3.ground || !('tp' in p3.ground), 'clear: true removes tp from ground');
});
