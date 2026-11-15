/* IFC4 exporter tests (IFC-EXPORT block in app.js):
   STEP header/DATA/GlobalId validation and round-trip through ifcToProject
   (2 storeys, solid/curtain/railing walls, 4 door orientations, window sill,
   slab with void, Turkish+apostrophe room with finish, matched sofa, level-1 item). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n');

const sliceFunc = name => fnSrcOf(src, name);

function block(begin, end) {
  const a = src.indexOf(begin), b = src.indexOf(end);
  assert.ok(a >= 0 && b > a, `${begin} .. ${end} block missing`);
  return src.slice(a, b);
}

const { ifcFromExchange } = new Function(
  block('/* IFC-EXPORT:BEGIN */', '/* IFC-EXPORT:END */') + '; return { ifcFromExchange };'
)();

const M = new Function(`
  const NO_TILT_K = new Set(['stairs', 'ramp', 'roof']), furnTilted = o => !!(o && !NO_TILT_K.has(o.k) && (+o.rx || +o.ry));
  ${sliceFunc('partRotM')}
  ${block('/* REVIT-MESH:BEGIN */', '/* REVIT-MESH:END */')}
  return { REVIT_FT, rvPartFaces, rvPlace };
`)();

const { ifcToProject, ifcParse } = new Function(
  block('/* IFC-IMPORT:BEGIN', '/* IFC-IMPORT:END */') + '; return { ifcToProject, ifcParse };'
)();

const FT = M.REVIT_FT;
const ft = cm => cm / FT;
const pt = (x, y) => [ft(x), ft(-y)];
const vec = (x, y) => [x, -y];
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, want ${b} ± ${tol}`);

function makeRng(seed = 123456789) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildExchange() {
  const pt2 = (x, y) => ({ x, y });
  const solidDefs = [
    { id: 'w1', a: pt2(0, 0), b: pt2(500, 0) },
    { id: 'w2', a: pt2(500, 0), b: pt2(500, 400) },
    { id: 'w3', a: pt2(500, 400), b: pt2(0, 400) },
    { id: 'w4', a: pt2(0, 400), b: pt2(0, 0) },
  ];
  const walls = [
    ...solidDefs.map(w => ({
      id: w.id, level: 'L0', a: pt(w.a.x, w.a.y), b: pt(w.b.x, w.b.y),
      t: ft(20), h: ft(270), base: 0, kind: 'solid',
    })),
    {
      id: 'wc', level: 'L0', a: pt(0, 520), b: pt(400, 520),
      t: ft(10), h: ft(270), base: 0, kind: 'curtain',
    },
    {
      id: 'wr', level: 'L0', a: pt(0, 620), b: pt(300, 620),
      t: ft(6), h: ft(100), base: 0, kind: 'railing',
    },
  ];

  const doorSpecs = [
    { id: 'd1', w: solidDefs[0], d: 130, side: 1, flip: 0 },
    { id: 'd2', w: solidDefs[0], d: 370, side: -1, flip: 1 },
    { id: 'd3', w: solidDefs[2], d: 130, side: 1, flip: 1 },
    { id: 'd4', w: solidDefs[2], d: 370, side: -1, flip: 0 },
  ];
  const openings = doorSpecs.map(({ id, w, d, side, flip }) => {
    const L = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
    const cx = w.a.x + ux * d, cy = w.a.y + uy * d;
    const hs = flip ? 1 : -1;
    return {
      id, wall: w.id, level: 'L0', kind: 'door',
      at: pt(cx, cy), w: ft(90), h: ft(210), sill: 0,
      hinge: vec(ux * hs, uy * hs),
      swing: vec(-uy * side, ux * side),
      _planCenter: { x: cx, y: cy }, _side: side, _flip: flip,
    };
  });

  openings.push({
    id: 'win1', wall: 'w2', level: 'L0', kind: 'window',
    at: pt(500, 200), w: ft(120), h: ft(120), sill: ft(90),
  });

  const outer = [[0, 0], [500, 0], [500, 400], [0, 400]].map(([x, y]) => pt(x, y));
  const hole = [[150, 150], [250, 150], [250, 250], [150, 250]].map(([x, y]) => pt(x, y));
  const floors = [{
    id: 'slab0', level: 'L0', kind: 'slab',
    loops: [outer, hole], top: 0, t: ft(20), finish: 'concrete',
  }];

  const rooms = [{
    id: 'r1', level: 'L0', name: "Çocuk Odası O'Neil",
    pt: pt(250, 200),
    loop: [[10, 10], [490, 10], [490, 390], [10, 390]].map(([x, y]) => pt(x, y)),
    finish: 'wood',
  }];

  const sofaFaces = M.rvPlace(
    M.rvPartFaces({ type: 'box', x: 0, y: 0, z: 0, w: 210, d: 90, h: 85 }),
    { x: 250, y: 200, rot: 30, w: 210, d: 90, h: 85 },
    0
  ).map(p => ({ p, m: 0, s: 0 }));

  const upperElevFt = 9.514;
  const upperFaces = M.rvPlace(
    M.rvPartFaces({ type: 'box', x: 0, y: 0, z: 0, w: 100, d: 60, h: 75 }),
    { x: 250, y: 200, rot: 0, w: 100, d: 60, h: 75 },
    upperElevFt * FT
  ).map(p => ({ p, m: 0, s: 0 }));

  const items = [
    {
      id: 'it0', level: 'L0', type: 'sofa3', cat: 'furniture',
      name: 'Koltuk', en: '3-Seat Sofa',
      at: [250 / 30.48, -200 / 30.48], rot: -30, elev: 0,
      w: ft(210), d: ft(90), h: ft(85),
      mats: [{ c: '#a5b4fc' }], faces: sofaFaces,
    },
    {
      id: 'it1', level: 'L1', type: 'sideTable', cat: 'furniture',
      name: 'Side Table', en: 'Side Table',
      at: pt(250, 200), rot: 0, elev: 0,
      w: ft(100), d: ft(60), h: ft(75),
      mats: [{ c: '#94a3b8' }], faces: upperFaces,
    },
  ];

  const exchange = {
    format: 'floorplanner-revit', v: 1, units: 'ft', name: 'Test Plan',
    levels: [
      { id: 'L0', name: 'Ground', elev: 0, height: 8.858 },
      { id: 'L1', name: 'Upper', elev: upperElevFt, height: 8.858 },
    ],
    walls,
    openings: openings.map(({ _planCenter, _side, _flip, ...o }) => o),
    floors,
    rooms,
    items,
  };

  return { exchange, doorSpecs, openings };
}

const CATALOG = {
  sofa3: { id: 'sofa3', name: 'Koltuk', en: '3-Seat Sofa', w: 210, d: 90, h: 85, k: 'sofa', color: '#a5b4fc', icon: '' },
};

test('1: STEP text structure, DATA entity syntax, GlobalIds and deterministic output', () => {
  const { exchange } = buildExchange();
  const date = '2026-01-15T10:30:00.000Z';
  const text = ifcFromExchange(exchange, { random: makeRng(42), date });
  const text2 = ifcFromExchange(exchange, { random: makeRng(42), date });
  assert.strictEqual(text, text2, 'seeded random + fixed date must produce identical output');

  assert.ok(text.startsWith('ISO-10303-21;'), 'must start with ISO-10303-21;');
  assert.ok(text.includes("FILE_SCHEMA(('IFC4'))"), "must contain FILE_SCHEMA(('IFC4'))");
  assert.ok(text.includes('2026-01-15T10:30:00'), 'must use opts.date in FILE_NAME');

  const lines = text.trimEnd().split('\n');
  const dataStart = lines.indexOf('DATA;');
  const dataEnd = lines.indexOf('ENDSEC;', dataStart);
  assert.ok(dataStart >= 0 && dataEnd > dataStart, 'DATA; ... ENDSEC; section present');

  const dataLines = lines.slice(dataStart + 1, dataEnd);
  assert.ok(dataLines.length > 0, 'DATA section is non-empty');
  for (const line of dataLines) {
    assert.match(line, /^#\d+=IFC[A-Z0-9]+\(.*\);$/, `invalid DATA line: ${line}`);
  }

  // Verify GlobalIds on all IfcRoot entities are 22 chars and unique
  const db = ifcParse(text);
  const rootTypes = new Set([
    'IFCPROJECT', 'IFCSITE', 'IFCBUILDING', 'IFCBUILDINGSTOREY',
    'IFCWALL', 'IFCCURTAINWALL', 'IFCRAILING', 'IFCOPENINGELEMENT',
    'IFCDOOR', 'IFCWINDOW', 'IFCSLAB', 'IFCSPACE', 'IFCFURNITURE',
    'IFCPROPERTYSET', 'IFCRELAGGREGATES', 'IFCRELCONTAINEDINSPATIALSTRUCTURE',
    'IFCRELVOIDSELEMENT', 'IFCRELFILLSELEMENT', 'IFCRELDEFINESBYPROPERTIES',
  ]);
  const guids = [];
  for (const line of dataLines) {
    const m = /^#\d+=([A-Z0-9]+)\('([^']*)'/.exec(line);
    if (m && rootTypes.has(m[1])) {
      guids.push(m[2]);
      assert.strictEqual(m[2].length, 22, `GlobalId for ${m[1]} must be 22 chars: ${m[2]}`);
      assert.match(m[2], /^[0-3][0-9A-Za-z_$]{21}$/, `invalid IFC GlobalId characters: ${m[2]}`);
    }
  }
  assert.ok(guids.length >= 20, 'expected at least 20 IfcRoot GlobalIds');
  assert.strictEqual(new Set(guids).size, guids.length, 'all GlobalIds must be unique');
  assert.strictEqual(db.schema, 'IFC4');
});

test('2: round-trip via ifcToProject preserves floors, walls, openings, slab+void, room, sofa and level-1 item', () => {
  const { exchange, openings } = buildExchange();
  const text = ifcFromExchange(exchange, { random: makeRng(42), date: '2026-01-15T10:30:00.000Z' });
  const { project } = ifcToProject(text, { catalog: CATALOG, align: false });

  // 2 floors
  assert.strictEqual(project.floors.length, 2, 'expected 2 floors');
  const [f0, f1] = project.floors;

  // Walls on floor 0: 4 solid + 1 curtain + 1 railing = 6
  assert.strictEqual(f0.walls.length, 6, 'floor 0 wall count (4 solid + 1 curtain + 1 railing)');
  const solidWalls = f0.walls.filter(w => w.wt === 'solid');
  const curtainWalls = f0.walls.filter(w => w.wt === 'curtain');
  const railingWalls = f0.walls.filter(w => w.wt === 'railing');
  assert.strictEqual(solidWalls.length, 4, '4 solid walls');
  assert.strictEqual(curtainWalls.length, 1, '1 curtain wall');
  assert.strictEqual(railingWalls.length, 1, '1 railing wall');

  const wallLen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  for (const w of solidWalls) {
    assert.strictEqual(w.t, 20, 'solid wall thickness 20');
    assert.strictEqual(w.h, 270, 'solid wall height 270');
  }
  const solidLens = solidWalls.map(wallLen).sort((a, b) => a - b);
  near(solidLens[0], 400, 1, 'solid short wall 1');
  near(solidLens[1], 400, 1, 'solid short wall 2');
  near(solidLens[2], 500, 1, 'solid long wall 1');
  near(solidLens[3], 500, 1, 'solid long wall 2');

  near(wallLen(curtainWalls[0]), 400, 1, 'curtain wall length');
  near(wallLen(railingWalls[0]), 300, 1, 'railing wall length');
  assert.strictEqual(railingWalls[0].t, 6, 'railing thickness 6');
  assert.strictEqual(railingWalls[0].h, 100, 'railing height 100');

  // Anchor offset from first rectangle corner (min x, min y of solid walls)
  const rectMinX = Math.min(...solidWalls.flatMap(w => [w.a.x, w.b.x]));
  const rectMinY = Math.min(...solidWalls.flatMap(w => [w.a.y, w.b.y]));

  // Doors: match by wall and position, assert side & flip
  const impDoors = f0.ops.filter(o => o.type === 'door');
  assert.strictEqual(impDoors.length, 4, 'expected 4 doors');
  const wallMap = new Map(f0.walls.map(w => [w.id, w]));
  const opWorld = op => {
    const w = wallMap.get(op.wall);
    const L = wallLen(w);
    return {
      x: w.a.x + (w.b.x - w.a.x) / L * op.d - rectMinX,
      y: w.a.y + (w.b.y - w.a.y) / L * op.d - rectMinY,
    };
  };

  for (const exp of openings.filter(o => o.kind === 'door')) {
    const match = impDoors.find(op => {
      const p = opWorld(op);
      const w = wallMap.get(op.wall);
      const isHorizontal = Math.abs(w.a.y - w.b.y) < 1;
      return isHorizontal && Math.hypot(p.x - exp._planCenter.x, p.y - exp._planCenter.y) < 5;
    });
    assert.ok(match, `door ${exp.id} at (${exp._planCenter.x}, ${exp._planCenter.y}) not found`);
    assert.strictEqual(match.side, exp._side, `door ${exp.id} side`);
    assert.strictEqual(match.flip, exp._flip, `door ${exp.id} flip`);
  }

  // Window with 90 cm sill
  const impWin = f0.ops.find(o => o.type === 'window');
  assert.ok(impWin, 'window missing');
  near(impWin.sill, 90, 1, 'window sill');

  // Slab with a void
  assert.strictEqual(f0.slabs.length, 1, '1 slab on floor 0');
  assert.strictEqual(f0.voids.length, 1, '1 void (hole) on floor 0');

  // Room name (Turkish + apostrophe) and finish
  assert.strictEqual(f0.rooms.length, 1, '1 room on floor 0');
  assert.strictEqual(f0.rooms[0].name, "Çocuk Odası O'Neil", 'room name preserves Turkish + apostrophe');
  assert.strictEqual(f0.rooms[0].floor, 'wood', 'room finish wood');

  // Sofa matched as type sofa3, rot 30 (mod 360, within 1 deg), relative position within 2 cm
  const sofa = f0.furn.find(o => o.type === 'sofa3');
  assert.ok(sofa, 'sofa3 matched in floor 0 furn');
  const rotMod = ((sofa.rot % 360) + 360) % 360;
  near(rotMod, 30, 1, 'sofa rot');
  near(sofa.x - rectMinX, 250, 2, 'sofa x relative to first wall corner');
  near(sofa.y - rectMinY, 200, 2, 'sofa y relative to first wall corner');

  // Level-1 item lands on floor 2
  assert.strictEqual(f1.furn.length, 1, 'level-1 item lands on floor 2');
});
