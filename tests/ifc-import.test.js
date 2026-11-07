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
    walls: 5,
    ops: 2,
    rooms: 1,
    slabs: 2,
    voids: 1,
    skipped: 0,
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
