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

  assert.deepStrictEqual(groundP(null), { kind: 'auto', color: null, scale: null, plinth: 20 });
  assert.deepStrictEqual(groundP({}), { kind: 'auto', color: null, scale: null, plinth: 20 });
  assert.deepStrictEqual(groundP({ ground: null }), { kind: 'auto', color: null, scale: null, plinth: 20 });

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

  const resetRes = await c.tool('set_ground', { kind: 'auto', color: null, scale: null, plinth: 20 });
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
  assert.match(b3d, /earthSides3D\s*\(\s*groundCuts\s*\(\s*false\s*\)/);
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
