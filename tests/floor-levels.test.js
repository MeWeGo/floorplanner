/* Tests for basement floors, explicit floor levels (Floor.lvl), and pit voids (v.dep).
   Evaluates real functions extracted from app.js, checks source wiring & MCP sync,
   and exercises the MCP server over stdio. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, markerBlock, mcpClient } = require('./helpers/repo');

const src = read('app.js');
const mcpSrc = read('mcp/server.js');
const fnSrc = name => fnSrcOf(src, name);

const constLine = prefix => {
  const start = src.indexOf(prefix);
  assert.ok(start >= 0, prefix + ' is missing from app.js');
  return src.slice(start, src.indexOf('\n', start));
};

const {
  floorLvl,
  floorH,
  floorElev,
  floorPitch,
  voidDrop,
  pointInPoly,
  setP,
} = new Function(`
  let P = { wallT: 20, wallH: 270, floors: [] };
  ${constLine('const floorH =')}
  ${constLine('const floorLvl =')}
  ${constLine('const floorElev =')}
  ${constLine('const floorPitch =')}
  ${fnSrc('pointInPoly')}
  ${fnSrc('voidDrop')}
  return {
    floorLvl,
    floorH,
    floorElev,
    floorPitch,
    voidDrop,
    pointInPoly,
    setP: p => { P = p; },
  };
`)();

const rect = (x0, y0, x1, y1) => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];

test('(1) floorElev stacking, basement levels, mid-stack reset, top + 1, and floorPitch', () => {
  // No lvl: default stacking (wallH 270 → 0, 290, 580)
  setP({
    wallH: 270,
    floors: [{ id: 'f0' }, { id: 'f1' }, { id: 'f2' }],
  });
  assert.strictEqual(floorElev(0), 0);
  assert.strictEqual(floorElev(1), 290);
  assert.strictEqual(floorElev(2), 580);
  assert.strictEqual(floorElev(3), 870);
  assert.strictEqual(floorPitch(0), 290);
  assert.strictEqual(floorPitch(1), 290);
  assert.strictEqual(floorPitch(2), 290);

  // Per-floor wallH respected
  setP({
    wallH: 270,
    floors: [{ id: 'f0', wallH: 350 }, { id: 'f1' }, { id: 'f2', wallH: 300 }],
  });
  assert.strictEqual(floorElev(0), 0);
  assert.strictEqual(floorElev(1), 370);
  assert.strictEqual(floorElev(2), 660);
  assert.strictEqual(floorElev(3), 980);
  assert.strictEqual(floorPitch(0), 370);
  assert.strictEqual(floorPitch(1), 290);
  assert.strictEqual(floorPitch(2), 320); // top floor = height + 20

  // Basement floor 0 at -290 and floor 1 at 0 → -290, 0, 290
  setP({
    wallH: 270,
    floors: [{ id: 'b1', lvl: -290 }, { id: 'g', lvl: 0 }, { id: 'f1' }],
  });
  assert.strictEqual(floorElev(0), -290);
  assert.strictEqual(floorElev(1), 0);
  assert.strictEqual(floorElev(2), 290);
  assert.strictEqual(floorElev(3), 580);
  assert.strictEqual(floorPitch(0), 290);
  assert.strictEqual(floorPitch(1), 290);
  assert.strictEqual(floorPitch(2), 290);

  // Explicit lvl in the middle restarts stacking above it
  setP({
    wallH: 270,
    floors: [{ id: 'f0' }, { id: 'f1', lvl: 500 }, { id: 'f2' }],
  });
  assert.strictEqual(floorElev(0), 0);
  assert.strictEqual(floorElev(1), 500);
  assert.strictEqual(floorElev(2), 790);
  assert.strictEqual(floorPitch(0), 500);
  assert.strictEqual(floorPitch(1), 290);
  assert.strictEqual(floorPitch(2), 290);

  // Non-number lvl ignored
  setP({
    wallH: 270,
    floors: [
      { id: 'f0', lvl: 'bad' },
      { id: 'f1', lvl: NaN },
      { id: 'f2', lvl: Infinity },
    ],
  });
  assert.strictEqual(floorLvl({ lvl: 'bad' }), null);
  assert.strictEqual(floorLvl({ lvl: NaN }), null);
  assert.strictEqual(floorLvl({ lvl: Infinity }), null);
  assert.strictEqual(floorLvl({ lvl: -290 }), -290);
  assert.strictEqual(floorElev(0), 0);
  assert.strictEqual(floorElev(1), 290);
  assert.strictEqual(floorElev(2), 580);
});

test('(2) voidDrop: pit depth, open void, exclusions (stairs/ramp/roof/ceil/v.stair/outside)', () => {
  setP({
    wallH: 270,
    floors: [
      {
        id: 'f0',
        wallH: 350, // pitch of floor 0 = 370
        voids: [
          { id: 'vPit', pts: rect(0, 0, 200, 200), dep: 120 },
          { id: 'vOpen', pts: rect(300, 0, 500, 200) },
          { id: 'vStair', pts: rect(600, 0, 800, 200), stair: 's1' },
        ],
      },
      {
        id: 'f1',
        voids: [
          { id: 'vPit1', pts: rect(0, 0, 200, 200), dep: 120 },
          { id: 'vOpen1', pts: rect(300, 0, 500, 200) },
          { id: 'vStair1', pts: rect(600, 0, 800, 200), stair: 's2' },
        ],
      },
    ],
  });

  const f0 = {
    voids: [
      { id: 'vPit', pts: rect(0, 0, 200, 200), dep: 120 },
      { id: 'vOpen', pts: rect(300, 0, 500, 200) },
      { id: 'vStair', pts: rect(600, 0, 800, 200), stair: 's1' },
    ],
  };
  const f1 = {
    voids: [
      { id: 'vPit1', pts: rect(0, 0, 200, 200), dep: 120 },
      { id: 'vOpen1', pts: rect(300, 0, 500, 200) },
      { id: 'vStair1', pts: rect(600, 0, 800, 200), stair: 's2' },
    ],
  };

  // Pit dep 120 → -120
  assert.strictEqual(voidDrop(f0, 0, { x: 100, y: 100, k: 'rect' }), -120);
  assert.strictEqual(voidDrop(f1, 1, { x: 100, y: 100, k: 'rect' }), -120);

  // Open void on floor index 1 → -(pitch of floor 0) = -370
  assert.strictEqual(voidDrop(f1, 1, { x: 400, y: 100, k: 'rect' }), -370);

  // Open void on floor index 0 → -20
  assert.strictEqual(voidDrop(f0, 0, { x: 400, y: 100, k: 'rect' }), -20);

  // Stairs / ramp / roof / mount:'ceil' items → 0
  assert.strictEqual(voidDrop(f0, 0, { x: 100, y: 100, k: 'stairs' }), 0);
  assert.strictEqual(voidDrop(f0, 0, { x: 100, y: 100, k: 'ramp' }), 0);
  assert.strictEqual(voidDrop(f0, 0, { x: 100, y: 100, k: 'roof' }), 0);
  assert.strictEqual(voidDrop(f1, 1, { x: 400, y: 100, k: 'rect', mount: 'ceil' }), 0);

  // Void with stair link (v.stair) → 0
  assert.strictEqual(voidDrop(f1, 1, { x: 700, y: 100, k: 'rect' }), 0);

  // Item outside every void → 0
  assert.strictEqual(voidDrop(f1, 1, { x: 950, y: 950, k: 'rect' }), 0);
});

test('(3) wiring in app.js and IFC-IMPORT parity with mcp/server.js', () => {
  // renderFloors has data-fa="addb" and #floors click handler calls addBasement
  assert.match(fnSrc('renderFloors'), /data-fa="addb"/);
  assert.match(src, /\$\('#floors'\)\.addEventListener\('click'[\s\S]*?addBasement\s*\(/);

  // floorLevelHtml emits the lvlB / lvlT fields
  const flHtml = fnSrc('floorLevelHtml');
  assert.match(flHtml, /'floor',\s*'lvlB'/);
  assert.match(flHtml, /'floor',\s*'lvlT'/);

  // build3D wiring: furnOff calls voidDrop, pit geometry for v.dep, groundMesh3D
  const b3d = fnSrc('build3D');
  assert.match(b3d, /furnOff\s*=[\s\S]*?voidDrop\s*\(/);
  assert.match(b3d, /for\s*\(const\s+v\s+of\s+f\.voids[\s\S]*?v\.dep[\s\S]*?ExtrudeGeometry/);
  assert.match(b3d, /groundMesh3D\s*\(/);

  // walkLevels uses floorPitch
  assert.match(fnSrc('walkLevels'), /floorPitch\s*\(/);

  // normalizeProject cleans f.lvl and v.dep
  const norm = fnSrc('normalizeProject');
  assert.match(norm, /f\.lvl\s*!=\s*null[\s\S]*?f\.lvl\s*=[\s\S]*?delete\s+f\.lvl/);
  assert.match(norm, /v\.dep\s*!=\s*null[\s\S]*?v\.dep\s*=[\s\S]*?delete\s+v\.dep/);

  // IFC-IMPORT block sets f.lvl and is identical in app.js and mcp/server.js
  const appIfc = markerBlock(src, 'IFC-IMPORT');
  const mcpIfc = markerBlock(mcpSrc, 'IFC-IMPORT');
  assert.strictEqual(appIfc, mcpIfc);
  assert.match(appIfc, /f\.lvl\s*=/);
});

test('(4) MCP over stdio: basement, explicit floor level, pit void depth & validation', async t => {
  const c = mcpClient();
  t.after(() => c.stop());

  await c.call('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'floor-levels-test', version: '1' },
  });

  const np = await c.tool('new_project', { name: 'Levels Test' });
  assert.ok(!np.err);

  // add_floor { basement: true } → summarize shows Floor 0 at level -290 and Floor 1 at level 0
  const ab = await c.tool('add_floor', { basement: true });
  assert.ok(!ab.err, ab.text);
  const sum1 = await c.tool('summarize');
  assert.ok(!sum1.err);
  assert.match(sum1.text, /Floor 0[^\n]*level -290 cm/);
  assert.match(sum1.text, /Floor 1[^\n]*level 0 cm/);

  // add_floor { level: 600 } → summarize shows level 600 cm
  const al = await c.tool('add_floor', { name: 'Penthouse', level: 600 });
  assert.ok(!al.err, al.text);
  const sum2 = await c.tool('summarize');
  assert.ok(!sum2.err);
  assert.match(sum2.text, /Floor 2 "Penthouse"[^\n]*level 600 cm/);

  // add_void with depth 150 on floor 0 → get_project has dep: 150
  const av = await c.tool('add_void', {
    floorIndex: 0,
    pts: rect(50, 50, 200, 200),
    depth: 150,
  });
  assert.ok(!av.err, av.text);
  const gp = await c.tool('get_project');
  assert.ok(!gp.err);
  const proj = JSON.parse(gp.text);
  assert.strictEqual(proj.floors[0].voids.length, 1);
  assert.strictEqual(proj.floors[0].voids[0].dep, 150);

  // add_void depth 2000 is rejected
  const badVoid = await c.tool('add_void', {
    floorIndex: 0,
    pts: rect(250, 50, 350, 150),
    depth: 2000,
  });
  assert.strictEqual(badVoid.err, true);
});
