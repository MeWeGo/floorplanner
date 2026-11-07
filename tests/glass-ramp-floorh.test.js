/* Tests for glass floor (#57), ramp furniture (#58), and per-floor wall height (#59).
   Evaluates real functions extracted from app.js and verifies source wiring
   and MCP mirror synchronization. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');
const mcpSrc = read('mcp/server.js');

const fnSrc = name => {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + '() is gone from app.js');
  return src.slice(start, src.indexOf('\n}', start) + 2);
};

const constLine = name => {
  const start = src.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is gone from app.js');
  return src.slice(start, src.indexOf('\n', start));
};

const constObj = name => {
  const start = src.indexOf('const ' + name + ' = {');
  assert.ok(start >= 0, name + ' is gone from app.js');
  return src.slice(start, src.indexOf('};', start) + 2);
};

const block = (s, name) => {
  const start = s.indexOf('const ' + name + ' = [');
  assert.ok(start >= 0, name + ' is gone');
  const end = s.indexOf('\n];', start);
  return s.slice(start, end + 3);
};

const {
  RAMP_TYPES,
  rampType,
  rampRail,
  rampRailSides,
  rampSlope,
  RAMP_CLS,
  floorH,
  curFloorH,
  floorElev,
  mkWall,
  FLOORS,
  FLOORS_EN,
  setP,
  setFi,
} = new Function(`
  let P = { wallT: 20, wallH: 270, floors: [] };
  let fi = 0;
  const uid = () => 'testuid';
  ${constObj('STAIR_RAILS')}
  ${constObj('RAMP_TYPES')}
  ${constLine('rampType')}
  ${constLine('rampRail')}
  ${constLine('rampRailSides')}
  ${fnSrc('rampSlope')}
  ${constObj('RAMP_CLS')}
  ${constLine('floorH')}
  ${constLine('curFloorH')}
  ${constLine('floorElev')}
  ${fnSrc('mkWall')}
  ${constObj('FLOORS')}
  ${constObj('FLOORS_EN')}
  return {
    RAMP_TYPES,
    rampType,
    rampRail,
    rampRailSides,
    rampSlope,
    RAMP_CLS,
    floorH,
    curFloorH,
    floorElev,
    mkWall,
    FLOORS,
    FLOORS_EN,
    setP: p => { P = p; },
    setFi: i => { fi = i; },
  };
`)();

test('(1) rampSlope maths and class thresholds', () => {
  // 500 long, 35 rise = 7% access
  const sAccess = rampSlope({ d: 500, h: 35 });
  assert.ok(Math.abs(sAccess.pct - 7) < 1e-6, `expected pct 7, got ${sAccess.pct}`);
  assert.strictEqual(sAccess.cls, 'access', '35 rise in 500 must be access class');
  assert.ok(Math.abs(sAccess.ratio - 500 / 35) < 1e-6);

  // 30 rise in 500 = 6% ideal
  const sIdeal = rampSlope({ d: 500, h: 30 });
  assert.ok(Math.abs(sIdeal.pct - 6) < 1e-6, `expected pct 6, got ${sIdeal.pct}`);
  assert.strictEqual(sIdeal.cls, 'ideal', '30 rise in 500 must be ideal class');

  // 60 in 500 = 12% vehicle
  const sVehicle = rampSlope({ d: 500, h: 60 });
  assert.ok(Math.abs(sVehicle.pct - 12) < 1e-6, `expected pct 12, got ${sVehicle.pct}`);
  assert.strictEqual(sVehicle.cls, 'vehicle', '60 rise in 500 must be vehicle class');

  // 100 in 500 = 20% steep
  const sSteep = rampSlope({ d: 500, h: 100 });
  assert.ok(Math.abs(sSteep.pct - 20) < 1e-6, `expected pct 20, got ${sSteep.pct}`);
  assert.strictEqual(sSteep.cls, 'steep', '100 rise in 500 must be steep class');

  // RAMP_CLS contains descriptors for all categories
  for (const cls of ['ideal', 'access', 'vehicle', 'steep']) {
    assert.ok(Array.isArray(RAMP_CLS[cls]), `RAMP_CLS.${cls} should be an array`);
    assert.strictEqual(RAMP_CLS[cls].length, 3);
  }
});

test('(2) rampRail defaults (accessible both, vehicle none, explicit left kept)', () => {
  // accessible defaults to both sides
  assert.strictEqual(rampRail({ rampType: 'accessible' }), 'both');
  assert.strictEqual(rampRail({}), 'both');
  assert.deepStrictEqual(rampRailSides({ rampType: 'accessible' }), [-1, 1]);

  // vehicle defaults to none
  assert.strictEqual(rampRail({ rampType: 'vehicle' }), 'none');
  assert.deepStrictEqual(rampRailSides({ rampType: 'vehicle' }), []);

  // explicit left kept
  assert.strictEqual(rampRail({ rampType: 'accessible', railing: 'left' }), 'left');
  assert.strictEqual(rampRail({ rampType: 'vehicle', railing: 'left' }), 'left');
  assert.strictEqual(rampRail({ railing: 'left' }), 'left');
  assert.deepStrictEqual(rampRailSides({ railing: 'left' }), [-1]);

  // explicit right kept
  assert.strictEqual(rampRail({ railing: 'right' }), 'right');
  assert.deepStrictEqual(rampRailSides({ railing: 'right' }), [1]);
});

test('(3) floorH fallback to P.wallH and floorElev with mixed floor heights', () => {
  setP({ wallT: 20, wallH: 270, floors: [] });

  // floorH fallback to P.wallH
  assert.strictEqual(floorH(null), 270);
  assert.strictEqual(floorH({}), 270);
  assert.strictEqual(floorH({ wallH: 0 }), 270);
  assert.strictEqual(floorH({ wallH: -50 }), 270);
  assert.strictEqual(floorH({ wallH: null }), 270);
  assert.strictEqual(floorH({ wallH: 350 }), 350);

  // floorElev with mixed floor heights (floors 350 and 270 with P.wallH 270: floorElev(0)=0, floorElev(1)=370, floorElev(2)=660)
  setP({
    wallT: 20,
    wallH: 270,
    floors: [
      { id: 'f0', name: 'Ground', wallH: 350 },
      { id: 'f1', name: 'First', wallH: 270 },
    ],
  });

  assert.strictEqual(floorElev(0), 0, 'floorElev(0) must be 0');
  assert.strictEqual(floorElev(1), 370, 'floorElev(1) must be 350 + 20 = 370');
  assert.strictEqual(floorElev(2), 660, 'floorElev(2) must be 370 + 270 + 20 = 660');
});

test('(4) FLOORS and FLOORS_EN have glass', () => {
  assert.ok('glass' in FLOORS, 'FLOORS must contain glass');
  assert.ok('glass' in FLOORS_EN, 'FLOORS_EN must contain glass');
  assert.strictEqual(typeof FLOORS.glass, 'string');
  assert.strictEqual(typeof FLOORS_EN.glass, 'string');
  assert.ok(FLOORS.glass.length > 0);
  assert.ok(FLOORS_EN.glass.length > 0);
});

test('(5) defsSvg, build3D, and mkWall wiring in app.js', () => {
  // defsSvg source contains p-glass
  assert.match(src, /pattern\s+id="p-glass"/);

  // build3D source uses glassRooms in withHoles and slabPolys loop handles glass
  const b3dStart = src.indexOf('function build3D(');
  assert.ok(b3dStart >= 0, 'build3D() is gone from app.js');
  const b3dEnd = src.indexOf('\nfunction ', b3dStart + 1);
  const b3d = src.slice(b3dStart, b3dEnd > 0 ? b3dEnd : undefined);

  assert.match(b3d, /glassRooms/, 'build3D must reference glassRooms');
  assert.match(b3d, /withHoles[\s\S]*?glassRooms/, 'build3D withHoles must incorporate glassRooms as holes');
  assert.match(b3d, /slabPolys[\s\S]*?glass/, 'build3D slabPolys loop must handle glass finish');
  assert.match(b3d, /elev\s*\+=\s*floorH\s*\(\s*f\s*\)\s*\+\s*20/, 'build3D must advance elev by floorH(f) + 20');

  // mkWall uses curFloorH
  const mkWallSrc = fnSrc('mkWall');
  assert.match(mkWallSrc, /curFloorH\s*\(\s*\)/, 'mkWall must use curFloorH()');

  // Evaluating mkWall with curFloorH
  setP({
    wallT: 20,
    wallH: 270,
    floors: [{ id: 'f0', wallH: 330 }],
  });
  setFi(0);
  assert.strictEqual(curFloorH(), 330);
  const wall = mkWall({ x: 0, y: 0 }, { x: 100, y: 0 });
  assert.strictEqual(wall.h, 330, 'mkWall created wall height must match floor wallH');
});

test('(6) MCP server CATALOG has ramp, FLOORPATS has glass, and CAT_DEFS matches MCP', () => {
  const mcpCatalogBlock = block(mcpSrc, 'CATALOG');
  const mcpFloorPatsMatch = mcpSrc.match(/const FLOORPATS = (\[[^\]]+\]);/);
  assert.ok(mcpFloorPatsMatch, 'mcp/server.js must define FLOORPATS');

  const { CATALOG: mcpCatalog, FLOORPATS: mcpFloorPats } = new Function(`
    ${mcpCatalogBlock}
    const FLOORPATS = ${mcpFloorPatsMatch[1]};
    return { CATALOG, FLOORPATS };
  `)();

  const appCatDefsBlock = block(src, 'CAT_DEFS');
  const { CAT_DEFS: appCatDefs } = new Function(`
    ${appCatDefsBlock}
    return { CAT_DEFS };
  `)();

  // mcp/server.js CATALOG has ramp and FLOORPATS has glass
  const mcpRamp = mcpCatalog.find(c => c.id === 'ramp');
  assert.ok(mcpRamp, 'mcp/server.js CATALOG must have ramp');
  assert.ok(mcpFloorPats.includes('glass'), 'mcp/server.js FLOORPATS must contain glass');

  // CAT_DEFS ramp row matches mcp row (w, d, h, k)
  const appRamp = appCatDefs.find(r => r[0] === 'ramp');
  assert.ok(appRamp, 'app.js CAT_DEFS must have ramp');

  assert.strictEqual(appRamp[3], mcpRamp.w, `ramp width must match (app: ${appRamp[3]}, mcp: ${mcpRamp.w})`);
  assert.strictEqual(appRamp[4], mcpRamp.d, `ramp depth must match (app: ${appRamp[4]}, mcp: ${mcpRamp.d})`);
  assert.strictEqual(appRamp[5], mcpRamp.h, `ramp rise/height must match (app: ${appRamp[5]}, mcp: ${mcpRamp.h})`);
  assert.strictEqual(appRamp[7], mcpRamp.k, `ramp shape kind must match (app: ${appRamp[7]}, mcp: ${mcpRamp.k})`);
});
