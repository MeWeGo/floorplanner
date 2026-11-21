/* DXF importer tests: block parity, decoder, string/MTEXT/bulge/OCS helpers,
   unit guessing, wall pairing & merging, plan.dxf fixture and the MCP tool (app wiring: the smoke check). */
'use strict';
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { ROOT, read, markerBlock, mcpClient } = require('./helpers/repo');

const appJs = read('app.js').replace(/\r\n/g, '\n');
const serverJs = read('mcp/server.js').replace(/\r\n/g, '\n');

const api = new Function(
  markerBlock(appJs, 'IFC-IMPORT') + '\n' + markerBlock(appJs, 'DXF-IMPORT') +
  '\n;return { dxfToProject, dxfDecode, dxfRecords, dxfStr, dxfMtext, dxfBulgePts, dxfSpline, dxfOcs, dxfPairWalls, dxfMergeWalls, DXF_ACI, dxfInk };'
)();

const miniCatalog = {
  bed1: { id: 'bed1', name: 'Tek Yatak', en: 'Single Bed', w: 90, d: 200, h: 50, icon: '🛏', k: 'bed', color: '#a5b4fc' },
  bed2: { id: 'bed2', name: 'Çift Yatak', en: 'Double Bed', w: 160, d: 200, h: 50, icon: '🛏', k: 'bed', color: '#818cf8' },
  chair: { id: 'chair', name: 'Sandalye', en: 'Chair', w: 45, d: 45, h: 80, icon: '🪑', k: 'rect', color: '#fcd34d' },
};

function makeUid() {
  let n = 0;
  return () => 'id' + (++n);
}

/** Build ASCII DXF text from group-code pairs for synthetic test cases. */
function dxf(entities = [], { header = [], layers = [], blocks = [] } = {}) {
  const out = [];
  const g = (...kv) => {
    for (let i = 0; i < kv.length; i += 2) out.push(String(kv[i]), String(kv[i + 1]));
  };
  g(0, 'SECTION', 2, 'HEADER', ...header, 0, 'ENDSEC');
  if (layers.length) {
    g(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, layers.length);
    for (const l of layers) g(...l);
    g(0, 'ENDTAB', 0, 'ENDSEC');
  }
  if (blocks.length) {
    g(0, 'SECTION', 2, 'BLOCKS');
    for (const b of blocks) {
      g(0, 'BLOCK', 8, '0', 2, b.name, 70, 0, 10, b.bx || 0, 20, b.by || 0, 30, 0, 3, b.name);
      for (const e of b.entities || []) g(...e);
      g(0, 'ENDBLK', 8, '0');
    }
    g(0, 'ENDSEC');
  }
  g(0, 'SECTION', 2, 'ENTITIES');
  for (const e of entities) g(...e);
  g(0, 'ENDSEC', 0, 'EOF');
  return out.join('\n');
}

test('1: DXF-IMPORT block is identical in app.js and mcp/server.js', () => {
  assert.strictEqual(
    markerBlock(serverJs, 'DXF-IMPORT'),
    markerBlock(appJs, 'DXF-IMPORT'),
    'copy the DXF-IMPORT block from app.js to mcp/server.js'
  );
});

test('2: plan.dxf fixture: stats, walls, ops, room, furniture, texts, dims, drafts, layers, paper space', () => {
  const bytes = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'plan.dxf'));
  const text = api.dxfDecode(bytes);
  const { project, stats } = api.dxfToProject(text, { uid: makeUid(), catalog: miniCatalog });
  const f = project.floors[0];

  assert.strictEqual(stats.units, 'mm');
  assert.strictEqual(stats.unitsGuessed, false);
  assert.strictEqual(stats.version, 'AC1015');

  // 6 walls: one with t 10, MLINE wall length 300 t 20
  assert.strictEqual(f.walls.length, 6);
  assert.ok(f.walls.some(w => w.t === 10), 'wall with t 10');
  const wallLen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  assert.ok(
    f.walls.some(w => w.t === 20 && Math.abs(wallLen(w) - 300) < 0.5),
    'MLINE wall length 300, t 20'
  );

  // 3 ops: one window (w 120, sill 90), one arc door (w 90, type door) and one block door (w 90)
  assert.strictEqual(f.ops.length, 3);
  const win = f.ops.find(o => o.type === 'window');
  assert.ok(win, 'window op present');
  assert.strictEqual(win.w, 120);
  assert.strictEqual(win.sill, 90);
  const doors = f.ops.filter(o => o.type === 'door');
  assert.strictEqual(doors.length, 2, 'two door ops (arc door and block door)');
  assert.ok(doors.every(d => d.w === 90), 'both doors have w 90');

  // exactly 1 room named SALON and no text "SALON" left in texts
  assert.strictEqual(f.rooms.length, 1);
  assert.strictEqual(f.rooms[0].name, 'SALON');
  assert.ok(!f.texts.some(t => t.text === 'SALON'), 'SALON text consumed by room');

  // furniture: one bed2 (w 160, d 200) and three chairs spaced 60 cm apart in x
  const beds = f.furn.filter(o => o.type === 'bed2');
  assert.strictEqual(beds.length, 1);
  assert.strictEqual(beds[0].w, 160);
  assert.strictEqual(beds[0].d, 200);
  const chairs = f.furn.filter(o => o.type === 'chair').sort((a, b) => a.x - b.x);
  assert.strictEqual(chairs.length, 3);
  assert.ok(Math.abs((chairs[1].x - chairs[0].x) - 60) < 0.1, 'chair 2 spaced 60 cm from chair 1');
  assert.ok(Math.abs((chairs[2].x - chairs[1].x) - 60) < 0.1, 'chair 3 spaced 60 cm from chair 2');

  // texts include "Mutfak", "Yatak", "Odası" and a text starting with "ÇALIŞMA" containing "⌀50" with rot 270
  const txtVals = f.texts.map(t => t.text);
  assert.ok(txtVals.includes('Mutfak'), 'text Mutfak');
  assert.ok(txtVals.includes('Yatak'), 'text Yatak');
  assert.ok(txtVals.includes('Odası'), 'text Odası');
  const calisma = f.texts.find(t => t.text.startsWith('ÇALIŞMA'));
  assert.ok(calisma, 'text starting with ÇALIŞMA');
  assert.ok(calisma.text.includes('⌀50'), 'ÇALIŞMA text contains ⌀50');
  assert.strictEqual(calisma.rot, 270);

  // 2 dims whose |a-b| lengths are 620 and 420 and off 60
  assert.strictEqual(f.dims.length, 2);
  const dimLens = f.dims.map(d => Math.round(Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y))).sort((a, b) => a - b);
  assert.deepStrictEqual(dimLens, [420, 620]);
  assert.ok(f.dims.every(d => d.off === 60), 'both dims have off 60');

  // drafts include a circle, an arc, a closed pline ellipse, a pline with w 5, fills solid and hatch
  assert.ok(f.drafts.some(d => d.shape === 'circle'), 'draft circle');
  assert.ok(f.drafts.some(d => d.shape === 'arc'), 'draft arc');
  assert.ok(f.drafts.some(d => d.shape === 'pline' && d.closed && d.pts.length >= 16), 'closed pline ellipse');
  assert.ok(f.drafts.some(d => d.shape === 'pline' && d.w === 5), 'pline with w 5');
  assert.ok(f.drafts.some(d => d.fill === 'solid'), 'solid fill');
  assert.ok(f.drafts.some(d => d.fill === 'hatch'), 'hatch fill');

  // layer HIDDENLAYER has vis false
  const hiddenLayer = project.layers.find(l => l.name === 'HIDDENLAYER');
  assert.ok(hiddenLayer, 'HIDDENLAYER exists');
  assert.strictEqual(hiddenLayer.vis, false);

  // a MISC draft has dash "dashed"
  const miscLayer = project.layers.find(l => l.name === 'MISC');
  assert.ok(miscLayer, 'MISC layer exists');
  assert.ok(f.drafts.some(d => d.layer === miscLayer.id && d.dash === 'dashed'), 'MISC draft has dash "dashed"');

  // a circle draft with color "#ff0000" and radius 20 (block LOGO scaled x2, BYBLOCK colour)
  const logoCirc = f.drafts.find(d => d.shape === 'circle' && d.color === '#ff0000');
  assert.ok(logoCirc, 'red circle draft from LOGO block');
  const logoR = Math.hypot(logoCirc.pts[1].x - logoCirc.pts[0].x, logoCirc.pts[1].y - logoCirc.pts[0].y);
  assert.ok(Math.abs(logoR - 20) < 0.1, `LOGO radius expected 20, got ${logoR}`);

  // paper-space line (67=1) is skipped, so every wall/draft point lies within -100..2000 cm
  for (const w of f.walls) {
    for (const p of [w.a, w.b]) {
      assert.ok(p.x >= -100 && p.x <= 2000 && p.y >= -100 && p.y <= 2000, `wall pt out of bounds: (${p.x},${p.y})`);
    }
  }
  for (const d of f.drafts) {
    for (const p of d.pts) {
      assert.ok(p.x >= -100 && p.x <= 2000 && p.y >= -100 && p.y <= 2000, `draft pt out of bounds: (${p.x},${p.y})`);
    }
  }
});

test('3: units guessing without $INSUNITS and opts.units override', () => {
  const rect = (w, h) => dxf([
    [0, 'LINE', 8, '0', 10, 0, 20, 0, 11, w, 21, 0],
    [0, 'LINE', 8, '0', 10, w, 20, 0, 11, w, 21, h],
    [0, 'LINE', 8, '0', 10, w, 20, h, 11, 0, 21, h],
    [0, 'LINE', 8, '0', 10, 0, 20, h, 11, 0, 21, 0],
  ]);

  const mmRes = api.dxfToProject(rect(15000, 10000), { uid: makeUid() });
  assert.strictEqual(mmRes.stats.units, 'mm');
  assert.strictEqual(mmRes.stats.unitsGuessed, true);

  const mRes = api.dxfToProject(rect(15, 10), { uid: makeUid() });
  assert.strictEqual(mRes.stats.units, 'm');
  assert.strictEqual(mRes.stats.unitsGuessed, true);

  const cmRes = api.dxfToProject(rect(15000, 10000), { uid: makeUid(), units: 'cm' });
  assert.strictEqual(cmRes.stats.units, 'cm');
  assert.strictEqual(cmRes.stats.unitsGuessed, false);
});

test('4: error handling for DWG, binary DXF, and invalid text', () => {
  assert.throws(() => api.dxfToProject('AC1032\x00\x00'), /DWG/);
  assert.throws(() => api.dxfToProject('AutoCAD Binary DXF\r\n\x1a\x00'), /binary/i);
  assert.throws(() => api.dxfToProject('hello'));
  assert.throws(() => api.dxfDecode(Buffer.from('AC1027\x00\x00', 'latin1')), /DWG/);
});

test('5: dxfDecode: UTF-8, BOM stripping, and ANSI_1254 codepage (0xDE -> Ş)', () => {
  const utf8 = api.dxfDecode(Buffer.from('TÜRKÇE', 'utf8'));
  assert.strictEqual(utf8, 'TÜRKÇE');

  const bom = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('0\nSECTION\n', 'utf8')]);
  assert.strictEqual(api.dxfDecode(bom), '0\nSECTION\n');

  const pre = Buffer.from(
    '0\nSECTION\n2\nHEADER\n9\n$DWGCODEPAGE\n3\nANSI_1254\n0\nENDSEC\n' +
    '0\nSECTION\n2\nENTITIES\n0\nTEXT\n8\n0\n10\n0\n20\n0\n40\n10\n1\n',
    'latin1'
  );
  const post = Buffer.from('\n0\nENDSEC\n0\nEOF\n', 'latin1');
  const bytes = Buffer.concat([pre, Buffer.from([0xDE]), post]);
  const decoded = api.dxfDecode(bytes);
  assert.ok(decoded.includes('\nŞ\n'), 'byte 0xDE under ANSI_1254 decodes to Ş');
  const { project } = api.dxfToProject(decoded, { uid: makeUid(), units: 'cm' });
  assert.strictEqual(project.floors[0].texts[0].text, 'Ş');
});

test('6: dxfStr and dxfMtext formatting / control codes', () => {
  assert.strictEqual(api.dxfStr('\\U+00C7'), 'Ç');
  assert.strictEqual(api.dxfStr('%%d'), '°');
  assert.strictEqual(api.dxfStr('%%p'), '±');
  assert.strictEqual(api.dxfStr('%%c'), '⌀');

  assert.deepStrictEqual(api.dxfMtext('{\\fArial|b1;A}\\PB'), ['A', 'B']);
  assert.deepStrictEqual(api.dxfMtext('\\S1^2;'), ['1/2']);
});

test('7: dxfBulgePts open semicircle', () => {
  const pts = api.dxfBulgePts([[0, 0, 1], [2, 0, 0]], false);
  assert.ok(pts.length > 2, 'arc is sampled into intermediate points');
  assert.deepStrictEqual(pts[0], [0, 0]);
  const last = pts[pts.length - 1];
  assert.ok(Math.hypot(last[0] - 2, last[1] - 0) < 1e-9, `last point (${last[0]},${last[1]}) near (2,0)`);
  for (const [x, y] of pts) {
    assert.ok(Math.abs(Math.hypot(x - 1, y) - 1) < 1e-6, `point (${x},${y}) at distance 1 from (1,0)`);
  }
});

test('8: dxfPairWalls and dxfMergeWalls', () => {
  const p1 = api.dxfPairWalls([
    { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, src: 's1' },
    { a: { x: 0, y: 20 }, b: { x: 300, y: 20 }, src: 's2' },
  ]);
  assert.strictEqual(p1.walls.length, 1);
  assert.strictEqual(p1.walls[0].t, 20);
  assert.strictEqual(p1.walls[0].a.x, 0);
  assert.strictEqual(p1.walls[0].a.y, 10);
  assert.strictEqual(p1.walls[0].b.x, 300);
  assert.strictEqual(p1.walls[0].b.y, 10);

  const p2 = api.dxfPairWalls([
    { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, src: 's1' },
    { a: { x: 0, y: 100 }, b: { x: 300, y: 100 }, src: 's2' },
  ]);
  assert.strictEqual(p2.walls.length, 0);

  const m1 = api.dxfMergeWalls([
    { id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, t: 20 },
    { id: 'w2', a: { x: 120, y: 0 }, b: { x: 250, y: 0 }, t: 20 },
  ], { gap: 40 });
  assert.strictEqual(m1.walls.length, 1);
  assert.strictEqual(m1.walls[0].a.x, 0);
  assert.strictEqual(m1.walls[0].b.x, 250);

  const m2 = api.dxfMergeWalls([
    { id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, t: 20 },
    { id: 'w2', a: { x: 200, y: 0 }, b: { x: 350, y: 0 }, t: 20 },
  ], { gap: 40, open: [50, 320], evid: () => ({ kind: 'window' }) });
  assert.strictEqual(m2.walls.length, 1);
  assert.strictEqual(m2.gaps.length, 1);
  assert.strictEqual(m2.gaps[0].s0, 100);
  assert.strictEqual(m2.gaps[0].s1, 200);
  assert.strictEqual(m2.gaps[0].ev.kind, 'window');
});

test('9: opts.walls false on plan.dxf produces 0 walls, 0 ops, and more drafts', () => {
  const text = api.dxfDecode(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'plan.dxf')));
  const on = api.dxfToProject(text, { uid: makeUid(), catalog: miniCatalog });
  const off = api.dxfToProject(text, { uid: makeUid(), catalog: miniCatalog, walls: false });
  assert.strictEqual(off.project.floors[0].walls.length, 0);
  assert.strictEqual(off.project.floors[0].ops.length, 0);
  assert.ok(off.project.floors[0].drafts.length > on.project.floors[0].drafts.length);
});

test('10: mirrored ARC (extrusion 0,0,-1) and rotated/scaled block INSERT', () => {
  // Reference line at (0,0)-(10,0) reveals the exact world->plan shift (sx0, sy0)
  const r = 20;
  const arcText = dxf([
    [0, 'LINE', 8, '0', 10, 0, 20, 0, 11, 10, 21, 0],
    [0, 'ARC', 8, '0', 10, 100, 20, 0, 30, 0, 40, r, 50, 0, 51, 90, 210, 0, 220, 0, 230, -1],
  ]);
  const arcRes = api.dxfToProject(arcText, { uid: makeUid(), units: 'cm', walls: false });
  const refLine = arcRes.project.floors[0].drafts.find(d => d.shape === 'pline');
  const draftArc = arcRes.project.floors[0].drafts.find(d => d.shape === 'arc');
  assert.ok(refLine && draftArc, 'reference line and mirrored arc imported');
  const shiftX = -refLine.pts[0].x;
  const shiftY = -refLine.pts[0].y;
  const cx = -100 - shiftX, cy = 0 - shiftY;
  for (const pt of draftArc.pts) {
    assert.ok(
      Math.abs(Math.hypot(pt.x - cx, pt.y - cy) - r) < 0.2,
      `arc point (${pt.x},${pt.y}) at distance ${r} from (${cx},${cy})`
    );
  }

  const insText = dxf(
    [[0, 'INSERT', 8, '0', 2, 'SEG', 10, 0, 20, 0, 30, 0, 41, 2, 42, 2, 50, 90]],
    { blocks: [{ name: 'SEG', entities: [[0, 'LINE', 8, '0', 10, 0, 20, 0, 11, 10, 21, 0]] }] }
  );
  const insRes = api.dxfToProject(insText, { uid: makeUid(), units: 'cm', walls: false });
  const vDraft = insRes.project.floors[0].drafts[0];
  assert.strictEqual(vDraft.shape, 'pline');
  assert.strictEqual(vDraft.pts.length, 2);
  assert.ok(Math.abs(vDraft.pts[1].x - vDraft.pts[0].x) < 0.1, 'vertical line (dx ~ 0)');
  assert.ok(Math.abs(Math.abs(vDraft.pts[1].y - vDraft.pts[0].y) - 20) < 0.1, 'length 20 cm');
});

test('11: MCP import_dxf tool imports plan.dxf and updates working project', async () => {
  const c = mcpClient();
  try {
    await c.call('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'dxf-test', version: '1' },
    });

    const list = await c.call('tools/list');
    assert.ok(list.result.tools.some(t => t.name === 'import_dxf'), 'tools/list contains import_dxf');

    const res = await c.tool('import_dxf', { path: 'tests/fixtures/plan.dxf' });
    assert.ok(!res.err, 'import_dxf should succeed: ' + res.text);
    assert.match(res.text, /6 walls/);

    const projRes = await c.tool('get_project', {});
    assert.ok(!projRes.err);
    const proj = JSON.parse(projRes.text);
    assert.ok(proj.floors[0].drafts.length > 5, 'drafts length > 5');
    assert.ok(proj.layers.length > 1, 'layers length > 1');
  } finally {
    c.stop();
  }
});
