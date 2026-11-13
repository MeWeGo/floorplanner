/* IFC importer level-merging and half-space clipping tests. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const appJs = read('app.js').replace(/\r\n/g, '\n');

const blockOf = src => {
  const a = src.indexOf('/* IFC-IMPORT:BEGIN'), b = src.indexOf('/* IFC-IMPORT:END */');
  assert.ok(a >= 0 && b > a, 'IFC-IMPORT block missing');
  return src.slice(a, b);
};

// eslint-disable-next-line no-new-func
const { ifcToProject } = new Function(blockOf(appJs) + '; return { ifcToProject };')();

const wallLen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);

/** Build a minimal IFC4 STEP document in centimetres from storeys and walls. */
function buildIfc({ storeys, walls }) {
  let nextId = 100;
  const id = () => '#' + (nextId++);
  const lines = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    "FILE_NAME('levels-test.ifc','2026-01-01T00:00:00',(''),(''),'','','');",
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    "#1=IFCPROJECT('p1',$,'LevelsTest',$,$,$,$,(#20),#10);",
    '#10=IFCUNITASSIGNMENT((#11));',
    '#11=IFCSIUNIT(*,.LENGTHUNIT.,.CENTI.,.METRE.);',
    "#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#21,$);",
    '#21=IFCAXIS2PLACEMENT3D(#30,$,$);',
    '#30=IFCCARTESIANPOINT((0.,0.,0.));',
    '#31=IFCDIRECTION((0.,0.,1.));',
    '#32=IFCDIRECTION((1.,0.,0.));',
    '#33=IFCSITE(\'site\',$,\'Site\',$,$,#40,$,$,.ELEMENT.,$,$,$,$,$);',
    '#34=IFCBUILDING(\'bldg\',$,\'Building\',$,$,#40,$,$,.ELEMENT.,$,$,$);',
    '#40=IFCLOCALPLACEMENT($,#21);',
    "#41=IFCRELAGGREGATES('agg0',$,$,$,#1,(#33));",
    "#42=IFCRELAGGREGATES('agg1',$,$,$,#33,(#34));",
  ];

  const storeyRefs = new Map();
  const storeyWallRefs = new Map();

  for (const s of storeys) {
    const ptId = id(), axId = id(), plId = id(), stId = id();
    lines.push(`${ptId}=IFCCARTESIANPOINT((0.,0.,${s.z}.));`);
    lines.push(`${axId}=IFCAXIS2PLACEMENT3D(${ptId},$,$);`);
    lines.push(`${plId}=IFCLOCALPLACEMENT(#40,${axId});`);
    lines.push(`${stId}=IFCBUILDINGSTOREY('${s.key}',$,'${s.name}',$,$,${plId},$,$,.ELEMENT.,${s.z}.);`);
    storeyRefs.set(s.key, stId);
    storeyWallRefs.set(s.key, []);
  }
  lines.push(`#43=IFCRELAGGREGATES('agg2',$,$,$,#34,(${[...storeyRefs.values()].join(',')}));`);

  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const x0 = w.x0 ?? 0;
    const x1 = x0 + w.len;
    const y = w.y ?? i * 200;
    const z0 = w.z0 ?? 0;
    const h = w.h ?? 270;
    const t = w.t ?? 20;

    const wPt = id(), wAx = id(), wPl = id();
    lines.push(`${wPt}=IFCCARTESIANPOINT((0.,${y}.,${z0}.));`);
    lines.push(`${wAx}=IFCAXIS2PLACEMENT3D(${wPt},$,$);`);
    lines.push(`${wPl}=IFCLOCALPLACEMENT($,${wAx});`);

    const axP0 = id(), axP1 = id(), axPoly = id(), axRep = id();
    lines.push(`${axP0}=IFCCARTESIANPOINT((${x0}.,0.));`);
    lines.push(`${axP1}=IFCCARTESIANPOINT((${x1}.,0.));`);
    lines.push(`${axPoly}=IFCPOLYLINE((${axP0},${axP1}));`);
    lines.push(`${axRep}=IFCSHAPEREPRESENTATION(#20,'Axis','Curve2D',(${axPoly}));`);

    const profPt = id(), profAx = id(), prof = id(), ext = id();
    lines.push(`${profPt}=IFCCARTESIANPOINT((${(x0 + x1) / 2}.,0.));`);
    lines.push(`${profAx}=IFCAXIS2PLACEMENT2D(${profPt},$);`);
    lines.push(`${prof}=IFCRECTANGLEPROFILEDEF(.AREA.,$,${profAx},${w.len}.,${t}.);`);
    lines.push(`${ext}=IFCEXTRUDEDAREASOLID(${prof},#21,#31,${h}.);`);

    let bodyItem = ext;
    if (w.clip) {
      const cPt = id(), cDir = id(), cAx = id(), cPlane = id(), cHalf = id(), cBool = id();
      const [ox, oy, oz] = w.clip.origin;
      const [nx, ny, nz] = w.clip.normal;
      lines.push(`${cPt}=IFCCARTESIANPOINT((${ox}.,${oy}.,${oz}.));`);
      lines.push(`${cDir}=IFCDIRECTION((${nx}.,${ny}.,${nz}.));`);
      lines.push(`${cAx}=IFCAXIS2PLACEMENT3D(${cPt},${cDir},$);`);
      lines.push(`${cPlane}=IFCPLANE(${cAx});`);
      lines.push(`${cHalf}=IFCHALFSPACESOLID(${cPlane},${w.clip.agree ? '.T.' : '.F.'});`);
      lines.push(`${cBool}=IFCBOOLEANCLIPPINGRESULT(.DIFFERENCE.,${ext},${cHalf});`);
      bodyItem = cBool;
    }

    const bodyRep = id(), shape = id(), wallId = id();
    const repType = w.clip ? 'Clipping' : 'SweptSolid';
    lines.push(`${bodyRep}=IFCSHAPEREPRESENTATION(#20,'Body','${repType}',(${bodyItem}));`);
    lines.push(`${shape}=IFCPRODUCTDEFINITIONSHAPE($,$,(${axRep},${bodyRep}));`);
    lines.push(`${wallId}=IFCWALLSTANDARDCASE('w${i}',$,'Wall ${i}',$,$,${wPl},${shape},$,$);`);

    storeyWallRefs.get(w.storey).push(wallId);
  }

  for (const [key, wIds] of storeyWallRefs) {
    if (!wIds.length) continue;
    const relId = id();
    lines.push(`${relId}=IFCRELCONTAINEDINSPATIALSTRUCTURE('rel_${key}',$,$,$,(${wIds.join(',')}),${storeyRefs.get(key)});`);
  }

  lines.push('ENDSEC;', 'END-ISO-10303-21;');
  return lines.join('\n');
}

function sevenStoreyIfc() {
  return buildIfc({
    storeys: [
      { key: 's_m50', name: 'Sub-Basement', z: -50 },
      { key: 's_0', name: 'Ground Floor', z: 0 },
      { key: 's_50', name: 'Raised Slab', z: 50 },
      { key: 's_270', name: 'Ceiling Datum', z: 270 },
      { key: 's_320', name: 'First Floor', z: 320 },
      { key: 's_350', name: 'Sill Datum', z: 350 },
      { key: 's_650', name: 'Roof Level', z: 650 },
    ],
    walls: [
      // Ground group (-50, 0, 50): s_0 has 3 elements (most), s_m50 has 1, s_50 has 0
      { storey: 's_m50', len: 310, z0: -50, h: 340 }, // -50..290 -> ground floor, elev -50, h 340
      { storey: 's_0', len: 420, z0: 220, h: 80 },    // 220..300 -> ground floor, elev 220
      { storey: 's_0', len: 530, z0: 0, h: 320 },     // 0..320 -> ONE wall on ground floor, no elev
      { storey: 's_0', len: 640, z0: 0, h: 650 },     // 0..650 -> split across 0 and 320
      // First-floor group (270, 320, 350): s_320 has 2 elements (most), s_350 has 1, s_270 has 0
      { storey: 's_320', len: 750, z0: 320, h: 280 },
      { storey: 's_320', len: 860, z0: 320, h: 280 },
      { storey: 's_350', len: 970, z0: 350, h: 100 },
      // Roof level (650): 1 element
      { storey: 's_650', len: 1080, z0: 650, h: 270 },
    ],
  });
}

test('1: storeys closer than IFC_LEVEL_MERGE (100 cm) merge into 3 floors named by most-populated member', () => {
  const { project, stats } = ifcToProject(sevenStoreyIfc());
  assert.strictEqual(stats.levelsMerged, 4);
  assert.strictEqual(project.floors.length, 3);
  assert.deepStrictEqual(
    project.floors.map(f => f.name),
    ['Ground Floor', 'First Floor', 'Roof Level']
  );
});

test('2: distances are kept via elev on merged ground floor and 0..320 wall is not split', () => {
  const { project } = ifcToProject(sevenStoreyIfc());
  const [f0, f1, f2] = project.floors;

  const wNeg = f0.walls.find(w => Math.abs(wallLen(w) - 310) < 0.5);
  assert.ok(wNeg, 'wall from -50 storey lands on merged ground floor');
  assert.strictEqual(wNeg.elev, -50);
  assert.strictEqual(wNeg.h, 340);

  const wHigh = f0.walls.find(w => Math.abs(wallLen(w) - 420) < 0.5);
  assert.ok(wHigh, 'wall starting at 220 lands on merged ground floor');
  assert.strictEqual(wHigh.elev, 220);

  const allSingleSpan = project.floors.flatMap(f => f.walls).filter(w => Math.abs(wallLen(w) - 530) < 0.5);
  assert.strictEqual(allSingleSpan.length, 1, '0..320 wall must remain ONE wall, not split');
  const wFull = f0.walls.find(w => Math.abs(wallLen(w) - 530) < 0.5);
  assert.ok(wFull, '0..320 wall must be on ground floor');
  assert.strictEqual(wFull.elev, undefined);
  assert.strictEqual('elev' in wFull, false);
  assert.strictEqual(f1.walls.some(w => Math.abs(wallLen(w) - 530) < 0.5), false);
  assert.strictEqual(f2.walls.some(w => Math.abs(wallLen(w) - 530) < 0.5), false);
});

test('3: a wall spanning two real storeys (0 to 650 across 0 and 320) is split into two with no elev on lower piece', () => {
  const { project } = ifcToProject(sevenStoreyIfc());
  const [f0, f1, f2] = project.floors;
  const pieces = project.floors.flatMap(f => f.walls).filter(w => Math.abs(wallLen(w) - 640) < 0.5);
  assert.strictEqual(pieces.length, 2, '0..650 wall must split into 2 walls');

  const lower = f0.walls.find(w => Math.abs(wallLen(w) - 640) < 0.5);
  const upper = f1.walls.find(w => Math.abs(wallLen(w) - 640) < 0.5);
  assert.ok(lower, 'lower piece on floor 0');
  assert.ok(upper, 'upper piece on floor 1');
  assert.strictEqual(lower.elev, undefined);
  assert.strictEqual('elev' in lower, false);
  assert.strictEqual(f2.walls.some(w => Math.abs(wallLen(w) - 640) < 0.5), false);
});

test('4: storeys 300 cm apart are not merged, and opts.mergeLevels === false keeps all storeys', () => {
  const spacedIfc = buildIfc({
    storeys: [
      { key: 'a', name: 'Level 0', z: 0 },
      { key: 'b', name: 'Level 300', z: 300 },
      { key: 'c', name: 'Level 600', z: 600 },
    ],
    walls: [
      { storey: 'a', len: 300, z0: 0, h: 270 },
      { storey: 'b', len: 400, z0: 300, h: 270 },
      { storey: 'c', len: 500, z0: 600, h: 270 },
    ],
  });
  const spaced = ifcToProject(spacedIfc);
  assert.strictEqual(spaced.stats.levelsMerged, 0);
  assert.strictEqual(spaced.project.floors.length, 3);
  assert.deepStrictEqual(spaced.project.floors.map(f => f.name), ['Level 0', 'Level 300', 'Level 600']);

  const closeIfc = buildIfc({
    storeys: [
      { key: 'c0', name: 'S0', z: 0 },
      { key: 'c1', name: 'S40', z: 40 },
      { key: 'c2', name: 'S80', z: 80 },
    ],
    walls: [
      { storey: 'c0', len: 300, z0: 0, h: 25 },
      { storey: 'c1', len: 400, z0: 40, h: 25 },
      { storey: 'c2', len: 500, z0: 80, h: 270 },
    ],
  });
  const merged = ifcToProject(closeIfc);
  assert.strictEqual(merged.stats.levelsMerged, 2);
  assert.strictEqual(merged.project.floors.length, 1);

  const unmerged = ifcToProject(closeIfc, { mergeLevels: false });
  assert.strictEqual(unmerged.stats.levelsMerged, 0);
  assert.strictEqual(unmerged.project.floors.length, 3);
  assert.deepStrictEqual(unmerged.project.floors.map(f => f.name), ['S0', 'S40', 'S80']);

  const sevenUnmerged = ifcToProject(sevenStoreyIfc(), { mergeLevels: false });
  assert.strictEqual(sevenUnmerged.stats.levelsMerged, 0);
});

test('5: IfcBooleanClippingResult DIFFERENCE with sloping IfcHalfSpaceSolid lowers top points without raising, vertical plane leaves h unchanged', () => {
  // Plane through (0, 0, 300) rising 1 cm per 10 cm along +x: z = 300 + 0.1*x -> upward normal (-1, 0, 10)
  const slopingIfc = buildIfc({
    storeys: [{ key: 'g', name: 'Ground', z: 0 }],
    walls: [
      // 1000 cm wall at x=0..1000 extruded 400 cm: at x=0 plane is 300, at x=1000 plane is 400 -> h <= 400
      {
        storey: 'g', x0: 0, len: 1000, y: 0, z0: 0, h: 400,
        clip: { origin: [0, 0, 300], normal: [-1, 0, 10], agree: false },
      },
      // 1000 cm wall at x=-500..500 extruded 400 cm: at x=-500 plane is 250, at x=500 plane is 350 -> lowered to h = 350
      {
        storey: 'g', x0: -500, len: 1000, y: 300, z0: 0, h: 400,
        clip: { origin: [0, 0, 300], normal: [-1, 0, 10], agree: false },
      },
      // 1000 cm wall at x=1000..2000 extruded 400 cm: plane is 400..500 -> clip must not raise h above 400
      {
        storey: 'g', x0: 1000, len: 1000, y: 600, z0: 0, h: 400,
        clip: { origin: [0, 0, 300], normal: [-1, 0, 10], agree: false },
      },
      // Vertical clipping plane (normal (1, 0, 0)): leaves h unchanged at 400
      {
        storey: 'g', x0: 0, len: 1000, y: 900, z0: 0, h: 400,
        clip: { origin: [500, 0, 0], normal: [1, 0, 0], agree: false },
      },
    ],
  });

  const { project } = ifcToProject(slopingIfc);
  assert.strictEqual(project.floors.length, 1);
  // Plan y = -IFC Y, so sorting by descending y puts IFC y=0, 300, 600, 900 in order
  const walls = project.floors[0].walls.slice().sort((p, q) => q.a.y - p.a.y);
  assert.strictEqual(walls.length, 4);

  const [w0to1000, wCentered, w1000to2000, wVertical] = walls;
  assert.ok(w0to1000.h <= 400 && w0to1000.h >= 300, `0..1000 clipped wall h=${w0to1000.h}`);
  assert.strictEqual(wCentered.h, 350, 'clipped top points lowered to plane at x=500 (z=350)');
  assert.strictEqual(w1000to2000.h, 400, 'clip must not raise points where plane is above 400');
  assert.strictEqual(wVertical.h, 400, 'vertical clipping plane leaves h unchanged');
});
