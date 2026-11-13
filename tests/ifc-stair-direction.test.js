/* IFC stair climb direction: Revit gives no walking line or oriented placement for a flight, so the
   direction comes from the body's slope. A short flight (run shorter than its width) must not turn 90°. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const appJs = read('app.js').replace(/\r\n/g, '\n');
const a = appJs.indexOf('/* IFC-IMPORT:BEGIN'), b = appJs.indexOf('/* IFC-IMPORT:END */');
// eslint-disable-next-line no-new-func
const { ifcToProject } = new Function(appJs.slice(a, b) + '; return { ifcToProject };')();

/** One storey, one IfcStairFlight built from step boxes (tread × width, heights rising along `dir` = +1 / −1 on X). */
function stairIfc({ n, tread = 25, width = 250, riser = 17, dir = 1 }) {
  let k = 100; const id = () => '#' + (k++);
  const L = [
    'ISO-10303-21;', 'HEADER;', "FILE_DESCRIPTION((''),'2;1');", "FILE_NAME('s.ifc','',(''),(''),'','','');", "FILE_SCHEMA(('IFC4'));", 'ENDSEC;', 'DATA;',
    "#1=IFCPROJECT('p',$,'StairDir',$,$,$,$,(#20),#10);", '#10=IFCUNITASSIGNMENT((#11));', '#11=IFCSIUNIT(*,.LENGTHUNIT.,.CENTI.,.METRE.);',
    "#20=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#21,$);", '#21=IFCAXIS2PLACEMENT3D(#30,$,$);', '#30=IFCCARTESIANPOINT((0.,0.,0.));',
    '#31=IFCDIRECTION((0.,0.,1.));', '#40=IFCLOCALPLACEMENT($,#21);',
    "#50=IFCBUILDINGSTOREY('st',$,'Ground',$,$,#40,$,$,.ELEMENT.,0.);",
  ];
  const items = [];
  for (let i = 0; i < n; i++) {
    const cx = dir * (tread / 2 + tread * i), p = id(), ax = id(), pr = id(), ex = id();
    L.push(`${p}=IFCCARTESIANPOINT((${cx},0.));`, `${ax}=IFCAXIS2PLACEMENT2D(${p},$);`,
      `${pr}=IFCRECTANGLEPROFILEDEF(.AREA.,$,${ax},${tread}.,${width}.);`, `${ex}=IFCEXTRUDEDAREASOLID(${pr},#21,#31,${riser * (i + 1)}.);`);
    items.push(ex);
  }
  const rep = id(), shp = id(), fl = id(), rel = id();
  L.push(`${rep}=IFCSHAPEREPRESENTATION(#20,'Body','SweptSolid',(${items.join(',')}));`, `${shp}=IFCPRODUCTDEFINITIONSHAPE($,$,(${rep}));`,
    `${fl}=IFCSTAIRFLIGHT('f',$,'Stair Run 1',$,$,#40,${shp},$,${n + 1},${n},$,$,.STRAIGHT.);`,
    `${rel}=IFCRELCONTAINEDINSPATIALSTRUCTURE('r',$,$,$,(${fl}),#50);`, 'ENDSEC;', 'END-ISO-10303-21;');
  return L.join('\n');
}
const stairOf = txt => ifcToProject(txt).project.floors.flatMap(f => f.furn).find(o => o.k === 'stairs');

test('a short flight (3 treads, 75 cm run, 250 cm wide) climbs along its run, not across its width', () => {
  const st = stairOf(stairIfc({ n: 3 }));
  assert.ok(st, 'stair imported');
  assert.ok(Math.abs(st.w - 250) < 2, `width along the treads (w=${st.w})`);
  assert.ok(Math.abs(st.d - 75) < 2, `run along the climb (d=${st.d})`);
  assert.strictEqual(st.rot, 90, 'climbs toward +X');
});

test('the same flight climbing toward −X turns the other way', () => {
  const st = stairOf(stairIfc({ n: 3, dir: -1 }));
  assert.ok(Math.abs(st.w - 250) < 2 && Math.abs(st.d - 75) < 2, `w=${st.w} d=${st.d}`);
  assert.strictEqual(st.rot, 270, 'climbs toward −X');
});

test('a long flight (12 treads, 300 cm run, 100 cm wide) keeps its direction', () => {
  const st = stairOf(stairIfc({ n: 12, width: 100 }));
  assert.ok(Math.abs(st.w - 100) < 2 && Math.abs(st.d - 300) < 2, `w=${st.w} d=${st.d}`);
  assert.strictEqual(st.rot, 90);
});
