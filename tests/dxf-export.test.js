/* DXF export tests (#157): file structure (R2000 sections, handles, units), Y flip and unit scaling,
   layer table, entities per kind, multi-floor layout, and a round trip through the real DXF importer.
   App wiring (button, commands) is checked here; the click → download path is the smoke check "DXF export". */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { read, markerBlock, fnSrcOf } = require('./helpers/repo');

const appJs = read('app.js').replace(/\r\n/g, '\n');
const html = read('index.html');

const api = new Function(
  markerBlock(appJs, 'IFC-IMPORT') + '\n' + markerBlock(appJs, 'DXF-IMPORT') + '\n' + markerBlock(appJs, 'DXF-EXPORT') + '\n' +
  fnSrcOf(appJs, 'draftArc') +
  '\nreturn { dxfFromPlan, dxfToProject, dxfHas, dxfExpStr, dxfExpColor, dxfExpLw, DXF_EXP_LAYERS, DXF_RX_WALL, DXF_RX_DOOR, DXF_RX_WIN, DXF_RX_ROOM, draftArc };'
)();

const geo = { arc: api.draftArc, foot: () => null, steps: null };
const cat = {
  bed1: { id: 'bed1', name: 'Tek Yatak', en: 'Single Bed', w: 90, d: 200, h: 50, k: 'bed' },
  bed2: { id: 'bed2', name: 'Çift Yatak', en: 'Double Bed', w: 160, d: 200, h: 50, k: 'bed' },
  chair: { id: 'chair', name: 'Sandalye', en: 'Chair', w: 45, d: 45, h: 80, k: 'rect' },
};
const W = (id, ax, ay, bx, by, t = 20) => ({ id, a: { x: ax, y: ay }, b: { x: bx, y: by }, t, h: 270 });
function floor(name = 'Zemin Kat') {
  return {
    id: 'f-' + name, name,
    walls: [W('w1', 0, 0, 500, 0), W('w2', 500, 0, 500, 400), W('w3', 500, 400, 0, 400), W('w4', 0, 400, 0, 0), W('w5', 250, 0, 250, 200)],
    ops: [
      { id: 'o1', wall: 'w1', d: 120, w: 90, h: 210, sill: 0, type: 'door', flip: 0, side: 1 },
      { id: 'o2', wall: 'w3', d: 250, w: 120, h: 120, sill: 90, type: 'window', flip: 0, side: 1 },
      { id: 'o3', wall: 'w2', d: 200, w: 90, h: 210, sill: 0, type: 'door', flip: 1, side: -1 },
    ],
    rooms: [{ id: 'r1', name: 'Salon Çalışma', pts: [{ x: 10, y: 10 }, { x: 490, y: 10 }, { x: 490, y: 390 }, { x: 10, y: 390 }] }],
    slabs: [{ id: 's1', name: 'Balkon', pts: [{ x: 0, y: 420 }, { x: 200, y: 420 }, { x: 200, y: 500 }, { x: 0, y: 500 }] }],
    voids: [{ id: 'v1', name: 'Boşluk', pts: [{ x: 300, y: 250 }, { x: 400, y: 250 }, { x: 400, y: 350 }, { x: 300, y: 350 }] }],
    furn: [
      { id: 'b1', type: 'bed2', name: 'Çift Yatak', k: 'bed', w: 160, d: 200, x: 380, y: 200, rot: 90 },
      { id: 'c1', type: 'chair', name: 'Sandalye', k: 'rect', w: 45, d: 45, x: 80, y: 300, rot: 0 },
      { id: 'c2', type: 'chair', name: 'Sandalye', k: 'rect', w: 45, d: 45, x: 140, y: 300, rot: 45 },
    ],
    dims: [{ id: 'd1', a: { x: 0, y: 0 }, b: { x: 500, y: 0 }, off: -60 }],
    texts: [{ id: 't1', x: 100, y: 100, text: 'Not: ğüşİ', size: 20, color: '#1e293b', rot: 30 }],
    drafts: [
      { id: 'x1', shape: 'circle', pts: [{ x: 700, y: 100 }, { x: 750, y: 100 }], w: 2, color: '#ff0000', fill: 'hatch' },
      { id: 'x2', shape: 'arc', pts: [{ x: 700, y: 300 }, { x: 750, y: 250 }, { x: 800, y: 300 }], w: 3, dash: 'dashed' },
      { id: 'x3', shape: 'pline', pts: [{ x: 600, y: 400 }, { x: 700, y: 400 }, { x: 700, y: 450 }], closed: true, w: 1, fill: 'solid' },
    ],
    sketches: [{ id: 'k1', pts: [{ x: 600, y: 0 }, { x: 620, y: 20 }, { x: 640, y: 0 }], w: 4 }],
    axes: [{ id: 'a1', name: '1', a: { x: 0, y: -150 }, b: { x: 0, y: 550 } }],
    sections: [{ id: 'q1', name: 'A', a: { x: -50, y: 200 }, b: { x: 550, y: 200 }, dir: 1 }],
  };
}
const exp = (floors, opts = {}) => api.dxfFromPlan({ name: 'T' }, floors, Object.assign({ geo, catName: o => cat[o.type] && cat[o.type].en }, opts));
/** Parse DXF text into [code, value] pairs. */
function pairs(text) {
  const l = text.split(/\r?\n/), out = [];
  for (let i = 0; i + 1 < l.length; i += 2) out.push([+l[i].trim(), l[i + 1]]);
  return out;
}
/** Entities of the ENTITIES section as { type, codes: Map(code → [values]) }. */
function entities(text) {
  const p = pairs(text), out = [];
  let i = p.findIndex((q, k) => q[0] === 2 && q[1] === 'ENTITIES' && p[k - 1][1] === 'SECTION');
  let cur = null;
  for (i++; i < p.length; i++) {
    const [c, v] = p[i];
    if (c === 0) { if (v === 'ENDSEC') break; cur = { type: v, codes: new Map() }; out.push(cur); continue; }
    if (!cur.codes.has(c)) cur.codes.set(c, []);
    cur.codes.get(c).push(v);
  }
  return out;
}
const v = (e, c, i = 0) => (e.codes.get(c) || [])[i];
const importBack = text => { let n = 0; return api.dxfToProject(text, { uid: () => 'u' + (++n), L: (a, b) => b, catalog: cat, colors: ['#eeeeee'] }); };

test('1: R2000 structure: section order, handles unique, $HANDSEED above every handle, ASCII only', () => {
  const { text } = exp([floor()]);
  assert.match(text, /^\s*0\r\nSECTION\r\n\s*2\r\nHEADER\r\n/);
  assert.match(text, /\r\n\s*0\r\nEOF\r\n$/);
  assert.ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(text), 'the file is pure ASCII');
  const p = pairs(text);
  const secs = p.filter((q, k) => q[0] === 2 && k > 0 && p[k - 1][1] === 'SECTION').map(q => q[1]);
  assert.deepEqual(secs, ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']);
  const hdr = name => { const k = p.findIndex(q => q[0] === 9 && q[1] === name); return k < 0 ? null : p[k + 1][1]; };
  assert.equal(hdr('$ACADVER'), 'AC1015');
  assert.equal(hdr('$INSUNITS'), '5');
  const handles = p.filter((q, k) => k > p.findIndex(r => r[1] === "CLASSES") && (q[0] === 5 || q[0] === 105)).map(q => parseInt(q[1], 16));
  assert.equal(new Set(handles).size, handles.length, 'handles are unique');
  assert.ok(parseInt(hdr('$HANDSEED'), 16) > Math.max(...handles));
  const tables = p.filter((q, k) => q[0] === 2 && k > 0 && p[k - 1][1] === 'TABLE').map(q => q[1]);
  assert.deepEqual(tables, ['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'VIEW', 'UCS', 'APPID', 'DIMSTYLE', 'BLOCK_RECORD']);
  // every block (furniture + *D dimension blocks + model / paper space) has a BLOCK_RECORD of the same name
  const recs = new Set(), blks = [];
  p.forEach((q, k) => { if (q[0] === 0 && q[1] === 'BLOCK_RECORD') recs.add(p.slice(k).find(r => r[0] === 2)[1]); if (q[0] === 0 && q[1] === 'BLOCK') blks.push(p.slice(k).find(r => r[0] === 2)[1]); });
  assert.ok(blks.includes('*Model_Space') && blks.includes('*Paper_Space') && blks.some(b => b.startsWith('*D')));
  for (const b of blks) assert.ok(recs.has(b), 'BLOCK_RECORD for ' + b);
});

test('2: Y axis flipped, units scaled (cm / mm / m) with the matching $INSUNITS', () => {
  const one = { id: 'f', name: 'F', walls: [W('w', 100, 200, 400, 200)], ops: [] };
  for (const [u, k, ins] of [['cm', 1, '5'], ['mm', 10, '4'], ['m', 0.01, '6']]) {
    const { text } = exp([one], { units: u });
    assert.ok(text.includes('$INSUNITS\r\n 70\r\n' + ins), u);
    const lines = entities(text).filter(e => e.type === 'LINE' && v(e, 8) === 'A-WALL' && Math.abs(+v(e, 20) - +v(e, 21)) < 1e-9);
    const ys = lines.map(e => +v(e, 20)).sort((a, b) => a - b);
    assert.deepEqual(ys.map(y => Math.round(y * 1e6) / 1e6), [-210 * k, -190 * k].map(y => Math.round(y * 1e6) / 1e6), u + ': faces at y = −(200 ± 10)');
    const xs = lines.flatMap(e => [+v(e, 10), +v(e, 11)]);
    assert.equal(Math.min(...xs), 100 * k); assert.equal(Math.max(...xs), 400 * k);
  }
});

test('3: layer table holds the semantic layers and their names match the importer word lists', () => {
  const { text } = exp([floor()]);
  const names = [];
  const p = pairs(text);
  p.forEach((q, k) => { if (q[0] === 0 && q[1] === 'LAYER') names.push(p.slice(k).find(r => r[0] === 2)[1]); });
  for (const l of api.DXF_EXP_LAYERS) assert.ok(names.includes(l[1]), l[1]);
  const L = Object.fromEntries(api.DXF_EXP_LAYERS.map(l => [l[0], l[1]]));
  assert.ok(api.dxfHas(L.wall, api.DXF_RX_WALL));
  assert.ok(api.dxfHas(L.door, api.DXF_RX_DOOR));
  assert.ok(api.dxfHas(L.glaz, api.DXF_RX_WIN));
  assert.ok(api.dxfHas(L.room, api.DXF_RX_ROOM) && api.dxfHas(L.iden, api.DXF_RX_ROOM));
  // only the wall layer may be read as walls (rails, slabs, furniture … must not turn into walls)
  for (const l of api.DXF_EXP_LAYERS) if (l[0] !== 'wall') assert.ok(!api.dxfHas(l[1], api.DXF_RX_WALL), l[1] + ' is not a wall layer');
});

test('4: entities per kind: wall faces, door arcs, window lines, rooms, furniture blocks, drafts, dims, texts', () => {
  const { text, stats } = exp([floor()]);
  const es = entities(text), on = (t, l) => es.filter(e => e.type === t && v(e, 8) === l);
  assert.deepEqual([stats.walls, stats.openings, stats.rooms, stats.furn, stats.drafts, stats.dims, stats.texts], [5, 3, 1, 3, 3, 1, 1]);
  assert.equal(on('ARC', 'A-DOOR').length, 2, 'one swing arc per door');
  assert.equal(on('LINE', 'A-GLAZ').length, 5, 'window: two faces + glass line + two jambs');
  assert.equal(on('LINE', 'A-DOOR').length, 6, 'doors: leaf + two jambs each');
  assert.equal(on('LWPOLYLINE', 'A-ROOM').length, 1);
  assert.equal(v(on('LWPOLYLINE', 'A-ROOM')[0], 70), '1', 'room outline is closed');
  assert.equal(on('LWPOLYLINE', 'A-SLAB').length, 1);
  assert.equal(on('LINE', 'A-VOID').length, 2, 'void cross');
  const ins = on('INSERT', 'A-FURN');
  assert.equal(ins.length, 3);
  assert.equal(new Set(ins.map(e => v(e, 2))).size, 2, 'two chairs of the same size share one block');
  const bed = ins.find(e => /Double_Bed/.test(v(e, 2)));
  assert.equal(+v(bed, 50), 270, 'rotation: clockwise plan 90° → CAD 270°');
  assert.deepEqual([+v(bed, 10), +v(bed, 20)], [380, -200]);
  const dim = es.find(e => e.type === 'DIMENSION');
  assert.equal(+v(dim, 70) & 7, 1, 'aligned dimension');
  assert.ok(v(dim, 2).startsWith('*D'));
  const txt = on('TEXT', 'A-ANNO-TEXT')[0];
  assert.equal(v(txt, 1), 'Not: \\U+011F\\U+00FC\\U+015F\\U+0130');
  assert.equal(+v(txt, 50), 330);
  assert.ok(Math.abs(+v(txt, 40) - 20 * 0.72) < 1e-9);
  const circ = on('CIRCLE', 'A-DRAFT')[0];
  assert.equal(v(circ, 62), '1'); assert.equal(v(circ, 420), String(0xff0000));
  assert.deepEqual(on('HATCH', 'A-DRAFT').map(e => v(e, 2)).sort(), ['ANSI31', 'SOLID']);
  assert.equal(v(on('ARC', 'A-DRAFT')[0], 6), 'DASHED');
  assert.equal(on('LWPOLYLINE', 'A-SKETCH').length, 1);
  assert.equal(on('LINE', 'A-GRID').length, 1); assert.equal(on('CIRCLE', 'A-GRID').length, 2, 'axis bubbles at both ends');
  assert.equal(on('LINE', 'A-SECT').length, 1);
});

test('5: draft arc keeps its direction (passes through its middle point)', () => {
  for (const pts of [[{ x: 0, y: 0 }, { x: 50, y: -50 }, { x: 100, y: 0 }], [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }]]) {
    const f = { id: 'f', name: 'F', walls: [], drafts: [{ id: 'a', shape: 'arc', pts, w: 2 }] };
    const a = entities(exp([f]).text).find(e => e.type === 'ARC');
    const c = [+v(a, 10), +v(a, 20)], r = +v(a, 40), a0 = +v(a, 50), a1 = +v(a, 51);
    const m = [pts[1].x, -pts[1].y], am = (Math.atan2(m[1] - c[1], m[0] - c[0]) * 180 / Math.PI + 360) % 360;
    assert.ok(Math.abs(Math.hypot(m[0] - c[0], m[1] - c[1]) - r) < 1e-6);
    assert.ok(((am - a0 + 360) % 360) <= ((a1 - a0 + 360) % 360), 'the CCW sweep from 50 to 51 contains the middle point');
  }
});

test('6: walls: openings cut the faces, T junction stops at the through wall, corners are mitered, jambs off the wall layer', () => {
  const es = entities(exp([floor()]).text).filter(e => e.type === 'LINE' && v(e, 8) === 'A-WALL');
  const seg = e => [+v(e, 10), +v(e, 20), +v(e, 11), +v(e, 21)];
  // branch wall w5 (x = 250, from y 0 to 200): faces from the through wall's face (y = −10) to its free end, capped
  const br = es.map(seg).filter(s => s[0] === s[2] && (s[0] === 240 || s[0] === 260));
  assert.equal(br.length, 2);
  for (const s of br) assert.deepEqual([Math.max(s[1], s[3]), Math.min(s[1], s[3])], [-10, -200]);
  assert.ok(es.map(seg).some(s => s[1] === -200 && s[3] === -200 && Math.abs(s[0] - s[2]) === 20), 'free end cap');
  // door o1 on w1 (d 120, w 90): no face line crosses the gap 75…165
  for (const s of es.map(seg)) if (s[1] === s[3] && Math.abs(s[1]) === 10) assert.ok(Math.max(s[0], s[2]) <= 75 + 1e-9 || Math.min(s[0], s[2]) >= 165 - 1e-9, 'gap kept: ' + s);
  // corner (0, 0): the outer faces meet at the miter (−10, +10 in CAD), the inner faces at (10, −10); no cap there
  const ends = es.map(seg).flatMap(s => [s[0] + ',' + s[1], s[2] + ',' + s[3]]);
  assert.equal(ends.filter(p => p === '-10,10').length, 2, 'outer faces meet at the miter');
  assert.equal(ends.filter(p => p === '10,-10').length, 2, 'inner faces meet');
  // jambs are on the opening layers, never on A-WALL (two jambs of a narrow door would read back as a wall)
  for (const s of es.map(seg)) assert.ok(!(s[0] === s[2] && Math.abs(s[1] - s[3]) === 20 && (s[0] === 75 || s[0] === 165)), 'no jamb on A-WALL');
});

test('7: round trip through the DXF importer keeps walls, openings, rooms, furniture, dims and texts', () => {
  const f = floor(), { text } = exp([f]);
  const r = importBack(text), g = r.project.floors[0];
  assert.equal(r.stats.units, 'cm'); assert.equal(r.stats.unitsGuessed, false);
  const len = w => Math.round(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y));
  // the T branch (250, 0 → 250, 200) comes back from the through wall's face: 190 cm
  assert.deepEqual(g.walls.map(w => len(w) + 'x' + w.t).sort(), ['190x20', '400x20', '400x20', '500x20', '500x20']);
  const sw = a => a.map(o => [o.type, o.w, o.type === 'window' ? '' : o.side + '/' + o.flip].join(' ')).sort();
  assert.deepEqual(sw(g.ops), sw(f.ops));
  assert.deepEqual(g.rooms.map(r => r.name), ['Salon Çalışma']);
  assert.deepEqual(g.furn.map(o => o.type + ' ' + Math.round(o.w) + 'x' + Math.round(o.d) + ' r' + o.rot).sort(), ['bed2 160x200 r90', 'chair 45x45 r0', 'chair 45x45 r45']);
  // the importer shifts the plan by whole metres; the same shift applies to every point
  const sh = { x: g.furn.find(o => o.type === 'bed2').x - 380, y: g.furn.find(o => o.type === 'bed2').y - 200 };
  const opAt = (ws, o) => { const w = ws.find(x => x.id === o.wall), L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y); return { x: w.a.x + (w.b.x - w.a.x) * o.d / L, y: w.a.y + (w.b.y - w.a.y) * o.d / L }; };
  for (const o of f.ops) { // each opening comes back where it was, on a wall of the same direction
    const p = opAt(f.walls, o), q = g.ops.map(x => opAt(g.walls, x)).find(x => Math.hypot(x.x - sh.x - p.x, x.y - sh.y - p.y) < 1);
    assert.ok(q, o.id + ' position');
  }
  for (const o of f.furn) assert.ok(g.furn.some(q => q.type === o.type && Math.hypot(q.x - sh.x - o.x, q.y - sh.y - o.y) < 0.5), o.id + ' position');
  assert.equal(g.dims.length, 1);
  assert.equal(Math.round(Math.hypot(g.dims[0].b.x - g.dims[0].a.x, g.dims[0].b.y - g.dims[0].a.y)), 500);
  assert.equal(g.dims[0].off, -60);
  const t = g.texts.find(x => x.text === 'Not: ğüşİ');
  assert.ok(t, 'unicode text back'); assert.equal(t.size, 20); assert.equal(t.rot, 30);
  assert.deepEqual(g.drafts.filter(d => d.shape === 'arc').map(d => d.dash), ['dashed']);
});

test('8: several floors are laid out side by side, each with its title; hidden kinds absent are fine', () => {
  const a = floor('Zemin'), b = floor('Kat 1');
  const { text, stats } = exp([a, b]);
  assert.equal(stats.floors, 2);
  const es = entities(text);
  const titles = es.filter(e => e.type === 'TEXT' && v(e, 8) === 'A-ANNO-TTLB').map(e => [v(e, 1), +v(e, 10)]);
  assert.deepEqual(titles.map(t => t[0]), ['Zemin', 'Kat 1']);
  assert.ok(titles[1][1] >= 800 + 500 - 1e-9, 'second floor starts right of the first (max x 800) + 5 m');
  const ins = es.filter(e => e.type === 'INSERT').map(e => +v(e, 10));
  assert.ok(ins.filter(x => x < 1000).length === 3 && ins.filter(x => x > 1000).length === 3);
  // an empty floor list still writes a valid file
  assert.match(exp([]).text, /EOF\r\n$/);
  assert.match(exp([{ id: 'e', name: 'E' }]).text, /EOF\r\n$/);
});

test('9: helpers: \\U+ encoding, colours, line weights', () => {
  assert.equal(api.dxfExpStr('Çatı\n'), '\\U+00C7at\\U+0131 ');
  assert.equal(api.dxfExpColor('#00ff00').aci, 3);
  assert.equal(api.dxfExpColor('nope'), null);
  assert.equal(api.dxfExpLw(2), 20); assert.equal(api.dxfExpLw(0.5), 5); assert.equal(api.dxfExpLw(4), 40);
});

test('10: app wiring: ⬇ menu button, commands, visible / printable layers only', () => {
  assert.match(html, /<div class="dl-menu" id="dlMenu"[\s\S]*id="bDxf"[\s\S]*<\/div>/);
  assert.match(appJs, /\$\('#bDxf'\)\.onclick = \(\) => downloadDxf\(\)/);
  for (const id of ['dxf', 'dxfall', 'dxfm', 'dxfmm']) assert.match(appJs, new RegExp(`act\\('${id}', `));
  const src = fnSrcOf(appJs, 'downloadDxf');
  assert.match(src, /visFloor\(f, true\)/);
  assert.match(src, /arc: draftArc/);
  assert.match(src, /toast\(msg, !all && P\.floors\.length > 1/);
});
