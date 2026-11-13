/* IFC importer tests: block parity, parser units, geometric solvers,
   fixture imports (IFC4 mm and IFC2X3 feet+degrees), app wiring, and MCP tool. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { ROOT, read } = require('./helpers/repo');

const SERVER = path.join(ROOT, 'mcp', 'server.js');

const appJs = read('app.js').replace(/\r\n/g, '\n');
const serverJs = read('mcp/server.js').replace(/\r\n/g, '\n');

const blockOf = src => {
  const a = src.indexOf('/* IFC-IMPORT:BEGIN'), b = src.indexOf('/* IFC-IMPORT:END */');
  assert.ok(a >= 0 && b > a, 'IFC-IMPORT block missing');
  return src.slice(a, b);
};

const blockSource = blockOf(appJs);
// eslint-disable-next-line no-new-func
const { ifcToProject, ifcParse, ifcValues, ifcStr, ifcHull, ifcPca, ifcCleanPoly, ifcJoinWalls } = new Function(
  blockSource + '; return { ifcToProject, ifcParse, ifcValues, ifcStr, ifcHull, ifcPca, ifcCleanPoly, ifcJoinWalls };'
)();

/** Minimal JSON-RPC client over the MCP server's stdio. */
function client() {
  const proc = spawn(process.execPath, [SERVER], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let nextId = 1, buf = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', chunk => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (e) { continue; }
      if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
  });
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    const t = setTimeout(() => reject(new Error(`timeout on ${method}`)), 10000);
    pending.set(id, msg => { clearTimeout(t); resolve(msg); });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  return { proc, call, stop: () => proc.kill() };
}

test('1: block identical in app.js and mcp/server.js (normalise CRLF)', () => {
  assert.strictEqual(blockOf(serverJs), blockOf(appJs), 'copy the IFC-IMPORT block from app.js to mcp/server.js');
});

test('2: ifcValues parses $, *, refs, enums, strings with doubled quotes, nested lists, typed values, floats', () => {
  const str = `$, *, #12, .ENUM., 'hello ''world''', (1, (2, 3)), IFCLENGTHMEASURE(2.5), 1.E-05`;
  const vals = ifcValues(str, 0, str.length);
  assert.deepStrictEqual(vals, [
    null,
    null,
    { r: 12 },
    { e: 'ENUM' },
    "hello 'world'",
    [1, [2, 3]],
    { tv: 'IFCLENGTHMEASURE', v: 2.5 },
    1e-5,
  ]);
});

test('3: ifcStr decodes \\X2\\00C7\\X0\\ to the letter C-cedilla', () => {
  assert.strictEqual(ifcStr('\\X2\\00C7\\X0\\'), 'Ç');
});

test('4: ifcParse rejects non-STEP text, ifcXML and zip ("PK") with an Error', () => {
  assert.throws(() => ifcParse('non-step plain text file content'), /not an IFC/i);
  assert.throws(() => ifcParse('<?xml version="1.0"?>\n<ifcXML>'), /ifcXML/i);
  assert.throws(() => ifcParse('PK\x03\x04somezipdata'), /ifcZIP/i);
});

test('5: tests/fixtures/two-storey.ifc (IFC4, mm): stats, levels, walls rectangle, openings, room, slabs, void', () => {
  const ifcText = read('tests/fixtures/two-storey.ifc');
  const { project, stats } = ifcToProject(ifcText);

  // stats
  assert.deepStrictEqual(stats, {
    schema: 'IFC4',
    floors: 2,
    levelsMerged: 0,
    walls: 5,
    ops: 2,
    rooms: 1,
    slabs: 2,
    voids: 1,
    columns: 0,
    railings: 0,
    components: 0,
    roofs: 1, // the ROOF slab becomes a roof item
    stairs: 0,
    ramps: 0,
    skipped: 0,
    matched: 0, // no catalogue passed
    roomsDetected: 0,
    rotated: 0,
  });

  // project name contains "Test House"
  assert.ok(project.name.includes('Test House'), `project name "${project.name}" does not contain "Test House"`);

  // floor 0 name "Level 1" with wallH 280
  const f0 = project.floors[0];
  assert.strictEqual(f0.name, 'Level 1');
  assert.strictEqual(f0.wallH, 280);

  // floor 0 walls form a closed 600 x 400 cm rectangle with corners at (0,0),(600,0),(600,400),(0,400)
  // (match endpoints as unordered sets, tolerance 0.1), every wall t 20 and h 270
  assert.strictEqual(f0.walls.length, 4);
  for (const w of f0.walls) {
    assert.strictEqual(w.t, 20);
    assert.strictEqual(w.h, 270);
  }
  const expectedCorners = [
    { x: 0, y: 0 },
    { x: 600, y: 0 },
    { x: 600, y: 400 },
    { x: 0, y: 400 },
  ];
  const corners = [];
  for (const w of f0.walls) {
    for (const p of [w.a, w.b]) {
      if (!corners.some(c => Math.hypot(c.x - p.x, c.y - p.y) < 0.1)) {
        corners.push(p);
      }
    }
  }
  assert.strictEqual(corners.length, 4, 'floor 0 must have exactly 4 unique corners');
  for (const exp of expectedCorners) {
    assert.ok(
      corners.some(c => Math.hypot(c.x - exp.x, c.y - exp.y) < 0.1),
      `missing corner (${exp.x}, ${exp.y})`
    );
  }

  // one door: type door, w 90, h 210, sill 0, d 145 on the wall from (0,400) to (600,400)
  const door = f0.ops.find(o => o.type === 'door');
  assert.ok(door, 'door opening missing');
  assert.strictEqual(door.w, 90);
  assert.strictEqual(door.h, 210);
  assert.strictEqual(door.sill, 0);
  assert.strictEqual(door.d, 145);
  const doorWall = f0.walls.find(w => w.id === door.wall);
  assert.ok(doorWall, 'door wall missing');
  const dwEnds = [doorWall.a, doorWall.b];
  assert.ok(
    dwEnds.some(p => Math.hypot(p.x - 0, p.y - 400) < 0.1) &&
    dwEnds.some(p => Math.hypot(p.x - 600, p.y - 400) < 0.1),
    'door wall must connect (0,400) and (600,400)'
  );

  // one window: w 120, h 120, sill 90, d 210
  const win = f0.ops.find(o => o.type === 'window');
  assert.ok(win, 'window opening missing');
  assert.strictEqual(win.w, 120);
  assert.strictEqual(win.h, 120);
  assert.strictEqual(win.sill, 90);
  assert.strictEqual(win.d, 210);

  // room named "Living Room" with 6 points
  assert.strictEqual(f0.rooms.length, 1);
  assert.strictEqual(f0.rooms[0].name, 'Living Room');
  assert.strictEqual(f0.rooms[0].pts.length, 6);

  // roof slab skipped so floor 0 has exactly 1 slab with t 20 and off 0
  assert.strictEqual(f0.slabs.length, 1);
  assert.strictEqual(f0.slabs[0].t, 20);
  assert.strictEqual(f0.slabs[0].off, 0);

  // floor 1 "Level 2" has 1 wall, 1 slab, 1 void of type shaft spanning x 400..500 and y 125..375
  const f1 = project.floors[1];
  assert.strictEqual(f1.name, 'Level 2');
  assert.strictEqual(f1.walls.length, 1);
  assert.strictEqual(f1.slabs.length, 1);
  assert.strictEqual(f1.voids.length, 1);
  const shaft = f1.voids[0];
  assert.strictEqual(shaft.type, 'shaft');
  const xs = shaft.pts.map(p => p.x);
  const ys = shaft.pts.map(p => p.y);
  assert.strictEqual(Math.min(...xs), 400);
  assert.strictEqual(Math.max(...xs), 500);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  // Under SVG coordinate flip y = -Y within floor bounding box 0..400, IFC y 125..375 maps to 25..275
  assert.ok(
    (minY === 25 && maxY === 275) || (minY === 125 && maxY === 375),
    `shaft void y span: got ${minY}..${maxY}`
  );
});

test('6: tests/fixtures/feet-curved.ifc (IFC2X3, feet + degrees): segments, straight wall, curtain wall, door, room', () => {
  const ifcText = read('tests/fixtures/feet-curved.ifc');
  const { project } = ifcToProject(ifcText);

  // 1 floor
  assert.strictEqual(project.floors.length, 1);
  const f0 = project.floors[0];

  // the curved wall is split into 10 segments with t 30.5 and h 274 whose ends lie at radius 304.8 cm from (700,700) (tolerance 0.5)
  const curvedWalls = f0.walls.filter(w => {
    const ra = Math.hypot(w.a.x - 700, w.a.y - 700);
    const rb = Math.hypot(w.b.x - 700, w.b.y - 700);
    return Math.abs(ra - 304.8) <= 0.5 && Math.abs(rb - 304.8) <= 0.5;
  });
  assert.strictEqual(curvedWalls.length, 10, 'curved wall must be split into 10 segments');
  for (const w of curvedWalls) {
    assert.strictEqual(w.t, 30.5);
    assert.strictEqual(w.h, 274);
  }

  // a straight wall of length 609.6 and t 15
  const straightWall = f0.walls.find(w => {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    return Math.abs(len - 609.6) < 0.1 && w.t === 15;
  });
  assert.ok(straightWall, 'straight wall of length 609.6 and t 15 missing');

  // one curtain wall (wt curtain, t 6, length 457.2)
  const curtainWall = f0.walls.find(w => {
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    return w.wt === 'curtain' && w.t === 6 && Math.abs(len - 457.2) < 0.1;
  });
  assert.ok(curtainWall, 'curtain wall missing');

  // one door w 91 h 213 sill 0 d 304.8 on the straight wall
  const door = f0.ops.find(o => o.type === 'door');
  assert.ok(door, 'door missing');
  assert.strictEqual(door.w, 91);
  assert.strictEqual(door.h, 213);
  assert.strictEqual(door.sill, 0);
  assert.strictEqual(door.d, 304.8);
  assert.strictEqual(door.wall, straightWall.id, 'door must be on the straight wall');

  // room "Kitchen" with 6 points (L shape)
  const kitchen = f0.rooms.find(r => r.name === 'Kitchen');
  assert.ok(kitchen, 'room "Kitchen" missing');
  assert.strictEqual(kitchen.pts.length, 6, 'Kitchen must have 6 points');
});

test('7: ifcPca on the 8 corners of a 600 x 20 rectangle plus a repeated first corner returns endpoints at y = centre exactly (no skew)', () => {
  const corners = [
    [0, 0, 0], [600, 0, 0], [600, 20, 0], [0, 20, 0],
    [0, 0, 270], [600, 0, 270], [600, 20, 270], [0, 20, 270],
    [0, 0, 0],
  ];
  const pts = ifcPca(corners);
  assert.ok(pts && pts.length === 2, 'ifcPca should return 2 endpoints');
  assert.strictEqual(pts[0].y, 10, 'start y must equal centre y (10)');
  assert.strictEqual(pts[1].y, 10, 'end y must equal centre y (10)');
  assert.strictEqual(pts[0].x, 0, 'start x must be 0');
  assert.strictEqual(pts[1].x, 600, 'end x must be 600');
});

test('8: ifcJoinWalls moves two wall ends that stop 8 cm short of a corner to the exact intersection', () => {
  const w1 = { id: 'w1', a: { x: 8, y: 0 }, b: { x: 200, y: 0 }, t: 20, h: 270 };
  const w2 = { id: 'w2', a: { x: 0, y: 8 }, b: { x: 0, y: 200 }, t: 20, h: 270 };
  ifcJoinWalls([w1, w2]);
  assert.strictEqual(w1.a.x, 0);
  assert.strictEqual(w1.a.y, 0);
  assert.strictEqual(w2.a.x, 0);
  assert.strictEqual(w2.a.y, 0);
});

test('9: app wiring source checks: index.html #fileOpen accept contains .ifc; app.js openPlanFile, importIfcText, drop listener, cmdList alias', () => {
  const indexHtml = read('index.html');
  const m = /<input[^>]+id="fileOpen"[^>]*>/i.exec(indexHtml) || /<input[^>]+accept="[^"]*"[^>]+id="fileOpen"[^>]*>/i.exec(indexHtml);
  assert.ok(m, '#fileOpen input tag found in index.html');
  assert.ok(/accept="[^"]*\.ifc[^"]*"/i.test(m[0]), '#fileOpen accept attribute contains .ifc');

  assert.match(appJs, /function\s+openPlanFile\s*\(/);
  assert.match(appJs, /function\s+importIfcText\s*\(/);
  assert.match(appJs, /\$\('#stage'\)\.addEventListener\(\s*['"]drop['"]/);
  const openCmd = appJs.split('\n').find(l => /act\('open'/.test(l)) || '';
  assert.match(openCmd, /ifc/i, 'the command-line "open" entry should be findable by typing "ifc"');
});

test('10: MCP: tools/list includes import_ifc and calling it with path tests/fixtures/two-storey.ifc returns text mentioning 5 walls, then get_project has 2 floors', async t => {
  const c = client();
  t.after(() => c.stop());

  await c.call('initialize', {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ci', version: '1' },
  });

  const list = await c.call('tools/list');
  const toolNames = list.result.tools.map(x => x.name);
  assert.ok(toolNames.includes('import_ifc'), 'tools/list must include import_ifc');

  const res = await c.call('tools/call', {
    name: 'import_ifc',
    arguments: { path: 'tests/fixtures/two-storey.ifc' },
  });
  const txt = res.result.content[0].text;
  assert.match(txt, /5 walls/);

  const projRes = await c.call('tools/call', { name: 'get_project', arguments: {} });
  const proj = JSON.parse(projRes.result.content[0].text);
  assert.strictEqual(proj.floors.length, 2);
});

test('11: tests/fixtures/columns-offset.ifc (IFC4, mm): columns, negative offset wall, 2-storey wall, proxy and railings', () => {
  const ifcText = read('tests/fixtures/columns-offset.ifc');
  const { project, stats } = ifcToProject(ifcText);

  // stats assertions
  assert.strictEqual(stats.columns, 3, 'stats.columns must be 3');
  assert.strictEqual(stats.railings, 2, 'stats.railings must be 2');
  assert.strictEqual(stats.components, 1, 'stats.components must be 1');

  // 2 storeys
  assert.strictEqual(project.floors.length, 2, 'must import exactly 2 floors');
  const f0 = project.floors[0];
  const f1 = project.floors[1];
  assert.strictEqual(f0.name, 'Level 1');
  assert.strictEqual(f1.name, 'Level 2');

  const wallLen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);

  // negative-offset wall lands on Level 1
  const negWall = f0.walls.find(w => Math.abs(wallLen(w) - 500) < 0.1);
  assert.ok(negWall, 'negative-offset wall of length 500 must land on Level 1');
  assert.strictEqual(negWall.h, 280);
  assert.ok(!f1.walls.some(w => Math.abs(wallLen(w) - 500) < 0.1), 'negative-offset wall must not be on Level 2');

  // 2-storey wall appears on both floors with heights about 280 (300 minus 20) and 280/300 for the top piece
  const twoStoreyBottom = f0.walls.find(w => Math.abs(wallLen(w) - 700) < 0.1);
  assert.ok(twoStoreyBottom, '2-storey wall bottom piece must appear on Level 1');
  assert.ok(Math.abs(twoStoreyBottom.h - 280) <= 1, `2-storey wall bottom piece height expected about 280, got ${twoStoreyBottom.h}`);

  const twoStoreyTop = f1.walls.find(w => Math.abs(wallLen(w) - 700) < 0.1);
  assert.ok(twoStoreyTop, '2-storey wall top piece must appear on Level 2');
  assert.ok(
    twoStoreyTop.h === 300, // top storey: up to the wall top (600 - 300)
    `2-storey wall top piece height expected about 280 or 300, got ${twoStoreyTop.h}`
  );

  // rectangular column imports on BOTH floors as type "colSq", k "rect", w 30 d 50 (or swapped, allow either)
  const colSq0 = f0.furn.find(fn => fn.type === 'colSq' && fn.k === 'rect');
  assert.ok(colSq0, 'rectangular column must import on Level 1 as type colSq, k rect');
  assert.ok(
    (Math.abs(colSq0.w - 30) < 0.1 && Math.abs(colSq0.d - 50) < 0.1) ||
    (Math.abs(colSq0.w - 50) < 0.1 && Math.abs(colSq0.d - 30) < 0.1),
    `Level 1 rectangular column dimensions expected 30x50 or 50x30, got ${colSq0.w}x${colSq0.d}`
  );

  const colSq1 = f1.furn.find(fn => fn.type === 'colSq' && fn.k === 'rect');
  assert.ok(colSq1, 'rectangular column must import on Level 2 as type colSq, k rect');
  assert.ok(
    (Math.abs(colSq1.w - 30) < 0.1 && Math.abs(colSq1.d - 50) < 0.1) ||
    (Math.abs(colSq1.w - 50) < 0.1 && Math.abs(colSq1.d - 30) < 0.1),
    `Level 2 rectangular column dimensions expected 30x50 or 50x30, got ${colSq1.w}x${colSq1.d}`
  );

  // round column as type "column", k "round", w ~40
  const roundCol = f0.furn.find(fn => fn.type === 'column' && fn.k === 'round');
  assert.ok(roundCol, 'round column must import on Level 1 as type column, k round');
  assert.ok(Math.abs(roundCol.w - 40) <= 2, `round column width expected ~40, got ${roundCol.w}`);

  // proxy as type "shape", k "poly", h 90, elev 50, 4 pts, name "Generic Box"
  const proxyBox = f0.furn.find(fn => fn.name === 'Generic Box');
  assert.ok(proxyBox, 'Generic Box must be in Level 1 furn');
  assert.strictEqual(proxyBox.type, 'shape');
  assert.strictEqual(proxyBox.k, 'poly');
  assert.strictEqual(proxyBox.h, 90);
  assert.strictEqual(proxyBox.elev, 50);
  assert.ok(Array.isArray(proxyBox.pts) && proxyBox.pts.length === 4, `Generic Box pts expected 4, got ${proxyBox.pts?.length}`);

  // IfcRailing becomes a wall with wt "railing" and h 110 on Level 2
  const balconyRailing = f1.walls.find(w => w.wt === 'railing');
  assert.ok(balconyRailing, 'Balcony Railing must become a wall on Level 2');
  assert.strictEqual(balconyRailing.wt, 'railing');
  assert.strictEqual(balconyRailing.h, 110);

  // "Railing:Glass" becomes a railing wall (wt railing) on Level 1 and is NOT in furn
  const glassRailing = f0.walls.find(w => w.wt === 'railing');
  assert.ok(glassRailing, 'Railing:Glass must become a wall with wt railing on Level 1');
  assert.strictEqual(glassRailing.wt, 'railing');
  assert.strictEqual(glassRailing.h, 110);
  assert.ok(!f0.furn.some(fn => fn.name === 'Railing:Glass'), 'Railing:Glass must NOT be in Level 1 furn');
  assert.ok(!f1.furn.some(fn => fn.name === 'Railing:Glass'), 'Railing:Glass must NOT be in Level 2 furn');
});

test('12: tests/fixtures/roof-stairs.ifc (IFC4, mm): gable roof with faces, L stair as a parametric stair', () => {
  const { project, stats } = ifcToProject(read('tests/fixtures/roof-stairs.ifc'));
  assert.strictEqual(stats.roofs, 1);
  assert.strictEqual(stats.stairs, 1);
  const [ground, upper] = project.floors;
  assert.deepStrictEqual([ground.name, upper.name], ['Ground', 'Upper']);

  // roof: one item on Upper, both ROOF slabs merged into its faces, none left as floor slabs
  const roof = upper.furn.find(o => o.k === 'roof');
  assert.ok(roof, 'roof item on the Upper floor');
  assert.strictEqual(roof.type, 'roof');
  assert.strictEqual(roof.faces.length, 12, 'two 6-face roof slabs');
  assert.ok(Math.abs(roof.w - 600) < 1 && Math.abs(roof.d - 400) < 1, `roof ${roof.w} x ${roof.d}`);
  assert.ok(roof.h >= 150 && roof.h <= 175, `roof height ${roof.h}`);
  assert.ok(Math.abs(roof.elev - 300) <= 5, `roof elev ${roof.elev}`);
  assert.deepStrictEqual(roof.fbase, { w: roof.w, d: roof.d, h: roof.h });
  for (const f of roof.faces) for (const p of f) {
    assert.ok(Math.abs(p[0]) <= roof.w / 2 + 0.1 && Math.abs(p[1]) <= roof.d / 2 + 0.1, 'faces are local to the item centre');
    assert.ok(p[2] >= -0.1 && p[2] <= roof.h + 0.1, 'face z runs from the item base');
  }
  assert.strictEqual(upper.slabs.length + ground.slabs.length, 0, 'ROOF slabs and the stair landing are not floor slabs');

  // stair: L-shaped, first flight climbs toward plan +x, risers summed, railing kept on the stair (not a wall)
  const st = ground.furn.find(o => o.k === 'stairs');
  assert.ok(st, 'stair on the Ground floor');
  assert.strictEqual(st.type, 'stairs');
  assert.strictEqual(st.stairType, 'l');
  assert.strictEqual(st.stepN, 18);
  assert.ok(Math.abs(st.rot - 90) <= 5, `stair rot ${st.rot}`);
  assert.notStrictEqual(st.railing, 'none');
  assert.strictEqual(st.h, 300);
  assert.ok(!project.floors.some(f => f.walls.some(w => w.wt === 'railing')), 'a railing inside a stair is not a railing wall');
});

test('13: roof items are wired into 2D, 3D, mirror, Swap W/D, presets and sections', () => {
  assert.match(appJs, /else if \(f\.k === 'roof'\) s \+= roofSvg\(/);
  assert.match(appJs, /if \(o\.k === 'roof'\) \{ roof3D\(g, o, C\); return; \}/);
  assert.match(appJs, /m\.k === 'roof' && Array\.isArray\(m\.faces\)/, 'mirror reflects roof faces');
  assert.match(appJs, /o\.k === 'roof' && Array\.isArray\(o\.faces\)\) \{ o\.faces = o\.faces\.map/, 'Swap W/D turns roof faces');
  assert.match(appJs, /PRESET_FURN_EXTRA = \[[^\]]*'faces', 'fbase'/);
  assert.match(appJs, /prims\.push\(\{ t: 'rpoly'/);
  assert.match(appJs, /if \(p\.t === 'rpoly'\)/);
  // roofFaces scales with w / d / h against fbase (resize and group scale need nothing else)
  const src = appJs.slice(appJs.indexOf('function roofFaces'), appJs.indexOf('\n}', appJs.indexOf('function roofFaces')) + 2);
  const roofFaces = new Function(src + '\nreturn roofFaces;')();
  const out = roofFaces({ w: 200, d: 100, h: 60, fbase: { w: 100, d: 100, h: 30 }, faces: [[[50, 50, 30], [-50, 50, 0], [0, -50, 0]], [[1, 1, 1]]] });
  assert.deepStrictEqual(out, [[[100, 50, 60], [-100, 50, 0], [0, -50, 0]]], 'scaled, and degenerate faces dropped');
});

test('14: tests/fixtures/ramp-colours.ifc (IFC4, mm): colours, material finishes, glass door, car ramp', () => {
  const { project, stats } = ifcToProject(read('tests/fixtures/ramp-colours.ifc'));
  assert.strictEqual(stats.ramps, 1);
  assert.strictEqual(stats.skipped, 0);
  const f = project.floors[0];
  const lenOf = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const [brick, concrete] = f.walls.slice().sort((p, q) => q.a.y - p.a.y); // plan y = -IFC Y: the brick wall (IFC Y 0) is the lower one on screen
  assert.ok(Math.abs(lenOf(brick) - 500) < 1 && Math.abs(lenOf(concrete) - 500) < 1);
  assert.strictEqual(brick.color, '#b3331a', 'item style colour becomes wall paint');
  assert.strictEqual(concrete.color, undefined, 'a grey material colour keeps the default wall look');
  assert.deepStrictEqual(f.slabs.map(s => [s.floor, s.color]), [['wood', '#996633']], 'material name picks the finish, its style the tint');
  assert.strictEqual(f.ops.length, 1);
  assert.strictEqual(f.ops[0].mat, 'glass', 'door material from the material name / transparent style');
  assert.strictEqual(f.ops[0].color, undefined, 'a glass leaf keeps the default glass tint');
  const r = f.furn.find(o => o.k === 'ramp');
  assert.ok(r, 'ramp imported');
  assert.strictEqual(r.type, 'ramp');
  assert.deepStrictEqual([r.w, r.d, r.h, r.rot], [300, 600, 90, 90], 'width, length, rise of the top surface, climbing toward plan +x');
  assert.strictEqual(r.rampType, 'vehicle');
  assert.strictEqual(r.railing, 'none');
  assert.strictEqual(r.elev, undefined, 'low end on the floor');
});

test('15: material-name matching for finishes and door materials (English and Turkish)', () => {
  const env = new Function(blockOf(appJs) + '\nreturn { IFC_FINISH, IFC_DOOR_MAT, ifcPick, ifcNeutral };')();
  const fin = n => env.ifcPick(env.IFC_FINISH, n);
  assert.strictEqual(fin('BETONARME_KONSEPT_EMP'), 'concrete');
  assert.strictEqual(fin('GAZBETON_EMP_KONSEPT'), 'concrete');
  assert.strictEqual(fin('Oak Parquet'), 'wood');
  assert.strictEqual(fin('Seramik Kaplama'), 'tile');
  assert.strictEqual(fin('KP_CAM_EMP'), 'glass');
  assert.strictEqual(fin('taş duvar'), 'stone');
  assert.strictEqual(fin('Default Floor'), null);
  assert.strictEqual(env.ifcPick(env.IFC_DOOR_MAT, 'Door - Steel Frame'), 'metal');
  assert.strictEqual(env.ifcPick(env.IFC_DOOR_MAT, 'Ahşap Kapı'), 'wood');
  assert.ok(env.ifcNeutral('#c8c8c8') && env.ifcNeutral('#ffffff'));
  assert.ok(!env.ifcNeutral('#e8ecb0') && !env.ifcNeutral('#b3331a'));
});

test('16: proxy windows fill unfilled openings; rotated / slim components keep their true size', () => {
  // IFC4, cm: one wall with an unfilled opening holding a window proxy (Revit style, no IfcRelFillsElement),
  // a 45-degree rotated 200 x 40 proxy, and a T-section with 2 mm walls (5 x 5 cm)
  const ifc = [
    'ISO-10303-21;', 'HEADER;', "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;',
    "#1=IFCPROJECT('p1',$,'P',$,$,$,$,(#20),#10);", '#10=IFCUNITASSIGNMENT((#11));', '#11=IFCSIUNIT(*,.LENGTHUNIT.,.CENTI.,.METRE.);',
    "#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#21,$);", '#21=IFCAXIS2PLACEMENT3D(#30,$,$);', '#30=IFCCARTESIANPOINT((0.,0.,0.));', '#31=IFCDIRECTION((0.,0.,1.));',
    "#50=IFCBUILDINGSTOREY('s1',$,'Ground',$,$,#51,$,$,.ELEMENT.,0.);", '#51=IFCLOCALPLACEMENT($,#21);',
    "#60=IFCRELCONTAINEDINSPATIALSTRUCTURE('r1',$,$,$,(#100,#300,#400,#500),#50);",
    // wall 0..600 along X, 20 thick, 300 high
    "#100=IFCWALL('w1',$,'Wall',$,$,#51,#101,$,.STANDARD.);", '#101=IFCPRODUCTDEFINITIONSHAPE($,$,(#102));', "#102=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#103));",
    '#103=IFCEXTRUDEDAREASOLID(#104,#21,#31,300.);', '#104=IFCRECTANGLEPROFILEDEF(.AREA.,$,#105,600.,20.);', '#105=IFCAXIS2PLACEMENT2D(#106,$);', '#106=IFCCARTESIANPOINT((300.,0.));',
    // opening 120 wide at x 240..360, z 90..270
    "#200=IFCOPENINGELEMENT('o1',$,'Opening',$,$,#51,#201,$,.OPENING.);", '#201=IFCPRODUCTDEFINITIONSHAPE($,$,(#202));', "#202=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#203));",
    '#203=IFCEXTRUDEDAREASOLID(#204,#207,#31,180.);', '#204=IFCRECTANGLEPROFILEDEF(.AREA.,$,#205,120.,20.);', '#205=IFCAXIS2PLACEMENT2D(#106,$);', '#207=IFCAXIS2PLACEMENT3D(#208,$,$);', '#208=IFCCARTESIANPOINT((0.,0.,90.));',
    "#209=IFCRELVOIDSELEMENT('v1',$,$,$,#100,#200);",
    // window proxy inside the opening, coloured frame
    "#300=IFCBUILDINGELEMENTPROXY('x1',$,'P1_TEK KANAT:120X180:123',$,$,#51,#301,$,$);", '#301=IFCPRODUCTDEFINITIONSHAPE($,$,(#302));', "#302=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#303));",
    '#303=IFCEXTRUDEDAREASOLID(#304,#207,#31,180.);', '#304=IFCRECTANGLEPROFILEDEF(.AREA.,$,#205,118.,6.);',
    '#310=IFCSTYLEDITEM(#303,(#311),$);', "#311=IFCSURFACESTYLE('Frame',.BOTH.,(#312));", '#312=IFCSURFACESTYLERENDERING(#313,0.,$,$,$,$,$,$,.NOTDEFINED.);', '#313=IFCCOLOURRGB($,0.36,0.36,0.36);',
    // rotated proxy: 200 x 40 box turned 45 degrees around (1000, 500)
    "#400=IFCBUILDINGELEMENTPROXY('x2',$,'Bench',$,$,#401,#403,$,$);", '#401=IFCLOCALPLACEMENT(#51,#402);', '#402=IFCAXIS2PLACEMENT3D(#404,#31,#405);', '#404=IFCCARTESIANPOINT((1000.,500.,0.));', '#405=IFCDIRECTION((0.7071067811865476,0.7071067811865476,0.));',
    '#403=IFCPRODUCTDEFINITIONSHAPE($,$,(#406));', "#406=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#407));", '#407=IFCEXTRUDEDAREASOLID(#408,#21,#31,45.);', '#408=IFCRECTANGLEPROFILEDEF(.AREA.,$,#409,200.,40.);', '#409=IFCAXIS2PLACEMENT2D(#30,$);',
    // slim T section, 5 x 5 cm, 2 mm walls, 400 tall
    "#500=IFCBUILDINGELEMENTPROXY('x3',$,'T PROFIL8:T PROFIL:99',$,$,#501,#503,$,$);", '#501=IFCLOCALPLACEMENT(#51,#502);', '#502=IFCAXIS2PLACEMENT3D(#504,$,$);', '#504=IFCCARTESIANPOINT((1500.,0.,0.));',
    '#503=IFCPRODUCTDEFINITIONSHAPE($,$,(#506));', "#506=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#507));", '#507=IFCEXTRUDEDAREASOLID(#508,#21,#31,400.);',
    "#508=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'T',#509);", '#509=IFCPOLYLINE((#510,#511,#512,#513,#514,#515,#516,#517,#510));',
    '#510=IFCCARTESIANPOINT((-0.1,-3.65));', '#511=IFCCARTESIANPOINT((0.1,-3.65));', '#512=IFCCARTESIANPOINT((0.1,1.15));', '#513=IFCCARTESIANPOINT((2.5,1.15));',
    '#514=IFCCARTESIANPOINT((2.5,1.35));', '#515=IFCCARTESIANPOINT((-2.5,1.35));', '#516=IFCCARTESIANPOINT((-2.5,1.15));', '#517=IFCCARTESIANPOINT((-0.1,1.15));',
    'ENDSEC;', 'END-ISO-10303-21;'].join('\n');
  const { project, stats } = ifcToProject(ifc);
  const f = project.floors[0];
  assert.strictEqual(stats.skipped, 0, 'nothing dropped, the 2 mm T section included');
  assert.strictEqual(f.ops.length, 1);
  assert.strictEqual(f.ops[0].type, 'window', 'the proxy fills the opening as its window');
  assert.strictEqual(f.ops[0].frameCol, '#5c5c5c', 'with the proxy colour as frame');
  assert.ok(!f.furn.some(o => /TEK KANAT/.test(o.name)), 'and is not imported a second time as a shape');
  assert.strictEqual(stats.components, 2);
  const bench = f.furn.find(o => o.name === 'Bench');
  const dims = [bench.w, bench.d].sort((p, q) => p - q); // a 45-degree box is 200 x 40 at +45 or 40 x 200 at -45
  assert.ok(Math.abs(dims[0] - 40) < 0.5 && Math.abs(dims[1] - 200) < 0.5 && bench.h === 45, 'true size, not the 45-degree bounding box: ' + bench.w + ' x ' + bench.d);
  const bp = bench.pts.map(p => Math.max(Math.abs(p.x) - bench.w / 2, Math.abs(p.y) - bench.d / 2));
  assert.ok(bp.every(v => v <= 0.2), 'outline fits the item box');
  assert.ok(Math.abs(Math.abs(bench.rot) % 180 - 135) < 0.5 || Math.abs(Math.abs(bench.rot) % 180 - 45) < 0.5, `rotated 45 degrees, got ${bench.rot}`);
  const t = f.furn.find(o => o.name === 'T PROFIL8:T PROFIL');
  assert.ok(t && t.w >= 4.9 && t.d >= 4.7 && t.h === 400, 'slim T section kept at its outer size');
});

test('17: an L-shaped glass railing in one solid imports as two joined glass railing segments', () => {
  const ifc = [
    'ISO-10303-21;', 'HEADER;', "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;',
    "#1=IFCPROJECT('p1',$,'P',$,$,$,$,(#20),#10);", '#10=IFCUNITASSIGNMENT((#11));', '#11=IFCSIUNIT(*,.LENGTHUNIT.,.CENTI.,.METRE.);',
    "#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#21,$);", '#21=IFCAXIS2PLACEMENT3D(#30,$,$);', '#30=IFCCARTESIANPOINT((0.,0.,0.));', '#31=IFCDIRECTION((0.,0.,1.));',
    "#50=IFCBUILDINGSTOREY('s1',$,'Ground',$,$,#51,$,$,.ELEMENT.,0.);", '#51=IFCLOCALPLACEMENT($,#21);',
    "#60=IFCRELCONTAINEDINSPATIALSTRUCTURE('r1',$,$,$,(#100),#50);",
    // L footprint 2 cm thick: leg 1 along X (0..350), leg 2 along Y (0..150), outer corner at the origin
    "#100=IFCBUILDINGELEMENTPROXY('x1',$,'Railing:02_KORK_CAM',$,$,#51,#101,$,$);", '#101=IFCPRODUCTDEFINITIONSHAPE($,$,(#102));', "#102=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#103));",
    '#103=IFCEXTRUDEDAREASOLID(#104,#21,#31,110.);', "#104=IFCARBITRARYCLOSEDPROFILEDEF(.AREA.,'L',#105);", '#105=IFCPOLYLINE((#110,#111,#112,#113,#114,#115,#110));',
    '#110=IFCCARTESIANPOINT((0.,0.));', '#111=IFCCARTESIANPOINT((350.,0.));', '#112=IFCCARTESIANPOINT((350.,2.));', '#113=IFCCARTESIANPOINT((2.,2.));', '#114=IFCCARTESIANPOINT((2.,150.));', '#115=IFCCARTESIANPOINT((0.,150.));',
    'ENDSEC;', 'END-ISO-10303-21;'].join('\n');
  const { project, stats } = ifcToProject(ifc);
  const rails = project.floors[0].walls.filter(w => w.wt === 'railing');
  assert.strictEqual(stats.railings, 2, 'two legs, not one diagonal');
  assert.strictEqual(rails.length, 2);
  assert.ok(rails.every(w => w.rs === 'glass'), 'CAM in the name → glass style');
  assert.ok(rails.every(w => w.h === 110 && w.t >= 2 && w.t <= 3), 'height and thin glass thickness');
  const lens = rails.map(w => Math.round(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y))).sort((a, b) => a - b);
  assert.ok(Math.abs(lens[0] - 150) <= 2 && Math.abs(lens[1] - 350) <= 2, 'leg lengths ' + lens);
  const ends = rails.flatMap(w => [w.a, w.b]);
  assert.ok(ends.some((p, i) => ends.some((q, j) => i !== j && Math.hypot(p.x - q.x, p.y - q.y) < 2)), 'the two legs meet at the corner');
});

test('18: stair railings land on the right side and the railing tool / styles are wired', () => {
  const st = ifcToProject(read('tests/fixtures/roof-stairs.ifc')).project.floors[0].furn.find(o => o.k === 'stairs');
  assert.strictEqual(st.railing, 'right', 'the railing beside the first flight is on its right-hand side');
  assert.match(appJs, /\['railing', '🛡', 'Korkuluk', 'Q', 'Railing'\]/, 'toolbar entry with shortcut Q');
  assert.match(appJs, /q: 'railing'/, 'keyboard map');
  assert.match(appJs, /else if \(t === 'railing'\) tool = 'wall';/, 'the railing tool reuses the wall tool');
  assert.match(appJs, /function toolWall\(a, b\)[^\n]*setWallType\(w, 'railing'\)/, 'new pieces become railings');
  const env = new Function(appJs.match(/const RAIL_STYLES = [^\n]*/)[0] + '\n' + appJs.match(/function railStyle\(w\) [^\n]*/)[0] + '\nreturn railStyle;')();
  assert.strictEqual(env({ wt: 'railing' }), 'bars');
  assert.strictEqual(env({ wt: 'railing', rs: 'glass' }), 'glass');
  assert.strictEqual(env({ wt: 'solid', rs: 'glass' }), 'bars', 'only railings, stairs and ramps have a style');
  assert.strictEqual(env({ k: 'stairs', rs: 'cable' }), 'cable');
  assert.strictEqual(env({ k: 'ramp', rs: 'nope' }), 'bars');
});

test('19: a component made of separate solids imports as one multi-part item, not one tall block', () => {
  // Revit "kompozit": two 60 cm box-profile bands, one at z 0..60 (600 long), one at z 300..360 (200 long)
  const ifc = [
    'ISO-10303-21;', 'HEADER;', "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;',
    "#1=IFCPROJECT('p1',$,'P',$,$,$,$,(#20),#10);", '#10=IFCUNITASSIGNMENT((#11));', '#11=IFCSIUNIT(*,.LENGTHUNIT.,.CENTI.,.METRE.);',
    "#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#21,$);", '#21=IFCAXIS2PLACEMENT3D(#30,$,$);', '#30=IFCCARTESIANPOINT((0.,0.,0.));', '#31=IFCDIRECTION((0.,0.,1.));',
    "#50=IFCBUILDINGSTOREY('s1',$,'Ground',$,$,#51,$,$,.ELEMENT.,0.);", '#51=IFCLOCALPLACEMENT($,#21);',
    "#60=IFCRELCONTAINEDINSPATIALSTRUCTURE('r1',$,$,$,(#100),#50);",
    "#100=IFCBUILDINGELEMENTPROXY('x1',$,'kompozit:kompozit:1',$,$,#51,#101,$,$);", '#101=IFCPRODUCTDEFINITIONSHAPE($,$,(#102));', "#102=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(#103,#113));",
    '#103=IFCEXTRUDEDAREASOLID(#104,#21,#31,60.);', '#104=IFCRECTANGLEPROFILEDEF(.AREA.,$,#105,600.,50.);', '#105=IFCAXIS2PLACEMENT2D(#106,$);', '#106=IFCCARTESIANPOINT((300.,0.));',
    '#113=IFCEXTRUDEDAREASOLID(#114,#117,#31,60.);', '#114=IFCRECTANGLEPROFILEDEF(.AREA.,$,#115,200.,50.);', '#115=IFCAXIS2PLACEMENT2D(#116,$);', '#116=IFCCARTESIANPOINT((100.,0.));',
    '#117=IFCAXIS2PLACEMENT3D(#118,$,$);', '#118=IFCCARTESIANPOINT((0.,0.,300.));',
    'ENDSEC;', 'END-ISO-10303-21;'].join('\n');
  const o = ifcToProject(ifc).project.floors[0].furn.find(x => x.name === 'kompozit:kompozit');
  assert.ok(o, 'component imported');
  assert.strictEqual(o.parts.length, 2, 'one part per solid');
  assert.deepStrictEqual(o.pbase, { w: o.w, d: o.d, h: o.h }, 'parts drawn at their own scale');
  assert.strictEqual(o.partsV, 1);
  assert.deepStrictEqual([o.w, o.d, o.h], [600, 50, 360]);
  const byZ = o.parts.slice().sort((a, b) => a.z - b.z);
  assert.deepStrictEqual(byZ.map(p => [p.type, p.z, p.h, p.w, p.d]), [['box', 0, 60, 600, 50], ['box', 300, 60, 200, 50]], 'each band keeps its own height and length');
  assert.strictEqual(byZ[1].x, -200, 'the short band sits at its own place (x 0..200 of 0..600)');
});

/* ---------- Revit fidelity (issue #88): tests/fixtures/revit-fidelity.ifc ---------- */
// eslint-disable-next-line no-new-func
const fidelity = new Function(blockSource + '; return { ifcOutline, ifcArc3, ifcRooms, ifcCatKey };')();
const miniCat = Object.fromEntries([['wc', 40, 65, 'rect'], ['basin', 60, 45, 'rect'], ['sofa2', 150, 85, 'sofa'], ['sofa3', 210, 90, 'sofa'], ['armchair', 85, 85, 'sofa'],
  ['bed1', 100, 200, 'bed'], ['bed2', 160, 200, 'bed'], ['fridge', 70, 70, 'rect'], ['table4', 120, 80, 'rect']]
  .map(([id, w, d, k]) => [id, { id, name: id, en: id, w, d, h: 80, icon: '?', k, color: '#abcdef' }]));
const polyArea = pts => { let t = 0; for (let i = 0; i < pts.length; i++) { const q = pts[(i + 1) % pts.length]; t += pts[i].x * q.y - q.x * pts[i].y; } return Math.abs(t / 2); };
const near = (v, want, tol, msg) => assert.ok(Math.abs(v - want) <= tol, `${msg}: ${v} (want ${want} ± ${tol})`);
const fidelityIfc = () => read('tests/fixtures/revit-fidelity.ifc');

test('88-1: face sets keep concave outlines, profile inner loops become voids, arc segments are tessellated', () => {
  const { project, stats } = ifcToProject(fidelityIfc(), { catalog: miniCat });
  const [f1, f2] = project.floors;
  const slab = n => f1.slabs.find(x => x.name === n);
  assert.strictEqual(slab('L Slab').pts.length, 6, 'IfcPolygonalFaceSet L slab keeps its 6 corners');
  near(polyArea(slab('L Slab').pts), 180000, 1, 'L slab area (a convex hull would be 210000)');
  const hall = f2.rooms.find(r => r.name === 'Hall');
  assert.strictEqual(hall.pts.length, 6, 'IfcTriangulatedFaceSet L space: the triangulated bottom becomes one 6-corner outline');
  near(polyArea(hall.pts), 120000, 1, 'L space area');
  assert.strictEqual(f1.voids.length, 1, 'IfcArbitraryProfileDefWithVoids inner loop becomes a void');
  near(polyArea(f1.voids[0].pts), 10000, 1, 'void area');
  assert.strictEqual(stats.voids, 1);
  assert.ok(slab('Half Disc').pts.length > 8, 'IfcArcIndex segment is tessellated');
  near(polyArea(slab('Half Disc').pts), Math.PI * 100 * 100 / 2, 200, 'half-disc area');
});

test('88-2: door swing side and hinge follow the placement and OperationType; curtain wall gets mullions and its door', () => {
  const { project } = ifcToProject(fidelityIfc(), { catalog: miniCat });
  const f = project.floors[0], cw = f.walls.find(w => w.wt === 'curtain');
  assert.ok(cw, 'curtain wall imported');
  assert.strictEqual(cw.mulN, 3, 'three interior IfcMember mullions (end mullions excluded)');
  const on = wt => f.ops.filter(o => f.walls.find(w => w.id === o.wall).wt === wt).sort((p, q) => p.d - q.d);
  const [left, mirrored] = on('solid');
  assert.deepStrictEqual([left.type, left.side, left.flip], ['door', -1, 0], 'SINGLE_SWING_LEFT with local +Y on the −normal side of the wall');
  assert.deepStrictEqual([mirrored.side, mirrored.flip], [1, 1], 'mirrored placement swings to the other side with the hinge at the other end');
  const [cd] = on('curtain');
  assert.ok(cd, 'door aggregated in the curtain wall (no opening element) lands on the curtain wall');
  assert.deepStrictEqual([cd.side, cd.flip], [-1, 1], 'SINGLE_SWING_RIGHT hinge');
});

test('88-3: fixtures and furniture match the catalogue; unknown flow terminals are skipped; proxies stay shapes', () => {
  const { project, stats } = ifcToProject(fidelityIfc(), { catalog: miniCat });
  const by = Object.fromEntries(project.floors[0].furn.map(o => [o.type, o]));
  for (const t of ['wc', 'basin', 'sofa2', 'bed2', 'fridge']) assert.ok(by[t], t + ' matched from its Revit name / PredefinedType');
  assert.strictEqual(stats.matched, 5);
  assert.deepStrictEqual([by.sofa2.w, by.sofa2.d, by.sofa2.rot], [183, 90, 270], 'sofa: true size, rotation from the placement (back = IFC +Y)');
  assert.deepStrictEqual([by.bed2.w, by.bed2.d], [152.5, 203.2], 'queen bed: width picks bed2, real size kept');
  assert.strictEqual(by.wc.k, 'rect');
  assert.strictEqual(by.wc.icon, '?', 'shape kind and icon come from the catalogue');
  assert.ok(by.shape && /Custom Table/.test(by.shape.name), 'IfcBuildingElementProxy stays a custom shape even when its name says table');
  assert.ok(!project.floors[0].furn.some(o => /Diffuser/.test(o.name)), 'unrecognised IfcFlowTerminal is not imported');
  // without a catalogue nothing is matched and the same elements come in as shapes
  const plain = ifcToProject(fidelityIfc());
  assert.strictEqual(plain.stats.matched, 0);
  assert.ok(plain.project.floors[0].furn.every(o => o.type === 'shape'));
});

test('88-4: room finishes from Pset / IfcCovering; a storey without IfcSpace gets detected rooms', () => {
  const { project, stats } = ifcToProject(fidelityIfc(), { catalog: miniCat });
  const [f1, f2] = project.floors, fin = n => f2.rooms.find(r => r.name === n).floor;
  assert.strictEqual(fin('Bedroom'), 'wood', 'Pset_SpaceCommon.FloorFinish "Parke 12mm"');
  assert.strictEqual(fin('Bath'), 'tile', 'IfcRelCoversSpaces → IfcCovering FLOORING "Seramik Karo"');
  assert.strictEqual(fin('Hall'), 'marble', 'unrelated flooring covering found by position');
  assert.strictEqual(f1.rooms.length, 1, 'Level 1 has walls but no IfcSpace: one enclosed room is detected');
  assert.strictEqual(stats.roomsDetected, 1);
  near(polyArea(f1.rooms[0].pts), 580 * 380, 50, 'detected room = wall centrelines inset by half a wall');
  assert.strictEqual(f2.rooms.length, 3, 'storeys that have IfcSpace are left alone');
});

test('88-5: a rotated model is aligned with the plan axes', () => {
  const txt = fidelityIfc(), line = /#\d+=IFCDIRECTION\(\(1\.,0\.,0\.\)\);/.exec(txt);
  assert.ok(line, 'building x-direction line present in the fixture');
  const rot = txt.replace(line[0], line[0].replace('(1.,0.,0.)', '(0.8660254,0.5,0.)'));
  const a = ifcToProject(txt, { catalog: miniCat }), b = ifcToProject(rot, { catalog: miniCat });
  assert.strictEqual(a.stats.rotated, 0, 'axis-aligned model is not touched');
  assert.strictEqual(Math.abs(b.stats.rotated), 30, 'the 30° building rotation is detected');
  for (const w of b.project.floors[0].walls) assert.ok(Math.abs(w.a.x - w.b.x) < 0.5 || Math.abs(w.a.y - w.b.y) < 0.5, 'walls are horizontal or vertical after alignment');
  near(polyArea(b.project.floors[0].rooms[0].pts), polyArea(a.project.floors[0].rooms[0].pts), 200, 'same room after alignment');
  assert.deepStrictEqual({ ...b.stats, rotated: 0 }, a.stats, 'same content either way');
  const off = ifcToProject(rot, { catalog: miniCat, align: false });
  assert.strictEqual(off.stats.rotated, 0, 'align: false keeps the model as exported');
});

test('88-6: helpers — boundary of a triangulated region, 3-point arc, room detection, name matching', () => {
  const { ifcOutline, ifcArc3, ifcRooms, ifcCatKey } = fidelity;
  // two triangles of a square share the diagonal: one 4-point loop; a face plus an inner bound gives two loops
  const sq = ifcOutline([[[0, 0], [10, 0], [10, 10]], [[0, 0], [10, 10], [0, 10]]], 100);
  assert.strictEqual(sq.length, 1);
  assert.strictEqual(sq[0].length, 4);
  const ring = ifcOutline([[[0, 0], [30, 0], [30, 30], [0, 30]], [[10, 10], [20, 10], [20, 20], [10, 20]]], 100);
  assert.strictEqual(ring.length, 2, 'inner bound is a separate loop');
  const arc = ifcArc3([100, 0, 0], [0, 100, 0], [-100, 0, 0], Math.PI / 18);
  assert.ok(arc.length >= 15 && arc.every(q => Math.abs(Math.hypot(q[0], q[1]) - 100) < 1e-6), 'arc points lie on the circle');
  assert.ok(arc.every(q => q[1] > 0), 'arc runs on the side of the middle point');
  const W = (ax, ay, bx, by) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, t: 20, wt: 'solid' });
  const boxW = [W(0, 0, 800, 0), W(800, 0, 800, 400), W(800, 400, 0, 400), W(0, 400, 0, 0)];
  const two = ifcRooms([...boxW, W(400, 0, 400, 400)]);
  assert.strictEqual(two.length, 2, 'a partition (T junctions) splits the box into two rooms');
  near(polyArea(two[0]) + polyArea(two[1]), 2 * 380 * 380, 100, 'both rooms inset by half a wall');
  assert.strictEqual(ifcRooms([W(0, 0, 800, 0), W(800, 0, 800, 400), W(0, 400, 0, 0)]).length, 0, 'an open U encloses nothing');
  assert.strictEqual(ifcRooms([...boxW, W(400, 10, 400, 390)]).length, 2, 'a partition that stops at the face of the through walls still closes the rooms');
  assert.strictEqual(ifcRooms([...boxW, W(400, 0, 400, 200)]).length, 1, 'a stub wall that ends in the room does not split it');
  assert.strictEqual(ifcCatKey('Coffee Table'), 'coffee');
  assert.strictEqual(ifcCatKey('Dining Table'), 'table', 'last matching word wins');
  assert.strictEqual(ifcCatKey('Yatak Odası Dolabı'), 'wardrobe', 'Turkish head noun comes last');
  assert.strictEqual(ifcCatKey('Bulaşık Makinesi'), 'dish');
  assert.strictEqual(ifcCatKey('M_Sink Vanity-Round'), 'basin');
  assert.strictEqual(ifcCatKey('Kitchen Sink'), 'sinkK');
  assert.strictEqual(ifcCatKey('Generic Model 12'), null);
});

test('88-7: both importers pass the catalogue', () => {
  assert.match(appJs, /ifcToProject\(text,\s*\{[^}]*catalog:\s*BYID/, 'app passes BYID');
  assert.match(serverJs, /ifcToProject\(fs\.readFileSync\([^)]*\),\s*\{[^}]*catalog:\s*BYID/, 'MCP import_ifc passes BYID');
});
