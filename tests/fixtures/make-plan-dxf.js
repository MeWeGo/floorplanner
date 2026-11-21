// Builds tests/fixtures/plan.dxf: a small AutoCAD-style plan (millimetres) that exercises the DXF importer.
// Run: node tests/fixtures/make-plan-dxf.js   (the .dxf is committed; rerun only when changing this script)
'use strict';
const fs = require('fs'), path = require('path');
const out = [];
const g = (...kv) => { for (let i = 0; i < kv.length; i += 2) out.push(String(kv[i]), String(kv[i + 1])); };
const line = (layer, x1, y1, x2, y2, extra = []) => g(0, 'LINE', 8, layer, ...extra, 10, x1, 20, y1, 30, 0, 11, x2, 21, y2, 31, 0);

g(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$INSUNITS', 70, 4, 9, '$MEASUREMENT', 70, 1, 0, 'ENDSEC');
g(0, 'SECTION', 2, 'TABLES');
g(0, 'TABLE', 2, 'LTYPE', 70, 2);
g(0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0);
g(0, 'LTYPE', 2, 'DASHED', 70, 0, 3, '__ __ __', 72, 65, 73, 2, 40, 19.05, 49, 12.7, 49, -6.35);
g(0, 'ENDTAB');
g(0, 'TABLE', 2, 'LAYER', 70, 9);
for (const [n, c, lt, fl] of [['0', 7, 'CONTINUOUS', 0], ['A-WALL', 1, 'CONTINUOUS', 0], ['A-DOOR', 3, 'CONTINUOUS', 0], ['A-GLAZ', 4, 'CONTINUOUS', 0],
  ['A-FURN', 2, 'CONTINUOUS', 0], ['TEXT', 7, 'CONTINUOUS', 0], ['DIM', 5, 'CONTINUOUS', 0], ['MISC', 6, 'DASHED', 0], ['HIDDENLAYER', -8, 'CONTINUOUS', 4]])
  g(0, 'LAYER', 2, n, 70, fl, 62, c, 6, lt);
g(0, 'ENDTAB', 0, 'ENDSEC');

// --- blocks
g(0, 'SECTION', 2, 'BLOCKS');
g(0, 'BLOCK', 8, '0', 2, 'BED_DOUBLE', 70, 0, 10, 0, 20, 0, 30, 0, 3, 'BED_DOUBLE');
g(0, 'LWPOLYLINE', 8, '0', 90, 4, 70, 1, 10, 0, 20, 0, 10, 1600, 20, 0, 10, 1600, 20, 2000, 10, 0, 20, 2000);
line('0', 0, 1700, 1600, 1700);
g(0, 'ENDBLK', 8, '0');
g(0, 'BLOCK', 8, '0', 2, 'CHAIR', 70, 0, 10, 225, 20, 225, 30, 0, 3, 'CHAIR');
g(0, 'LWPOLYLINE', 8, '0', 90, 4, 70, 1, 10, 0, 20, 0, 10, 450, 20, 0, 10, 450, 20, 450, 10, 0, 20, 450);
g(0, 'ENDBLK', 8, '0');
g(0, 'BLOCK', 8, '0', 2, 'DOOR90', 70, 0, 10, 0, 20, 0, 30, 0, 3, 'DOOR90');
line('0', 0, 0, 0, 900);
g(0, 'ARC', 8, '0', 10, 0, 20, 0, 30, 0, 40, 900, 50, 0, 51, 90);
g(0, 'ENDBLK', 8, '0');
g(0, 'BLOCK', 8, '0', 2, 'LOGO', 70, 0, 10, 0, 20, 0, 30, 0, 3, 'LOGO');
g(0, 'CIRCLE', 8, '0', 62, 0, 10, 0, 20, 0, 30, 0, 40, 100);
g(0, 'ENDBLK', 8, '0');
g(0, 'ENDSEC');

// --- entities
g(0, 'SECTION', 2, 'ENTITIES');
const W = 'A-WALL';
// bottom wall (y 0..200) with a 900 mm door gap at x 1000..1900
line(W, 0, 0, 1000, 0); line(W, 1900, 0, 6200, 0); line(W, 200, 200, 1000, 200); line(W, 1900, 200, 6000, 200);
line(W, 1000, 0, 1000, 200); line(W, 1900, 0, 1900, 200);
g(0, 'ARC', 8, 'A-DOOR', 10, 1000, 20, 200, 30, 0, 40, 900, 50, 0, 51, 90);
line('A-DOOR', 1000, 200, 1000, 1100);
// top wall (y 4000..4200) with a 1200 mm window at x 2500..3700
line(W, 0, 4200, 2500, 4200); line(W, 3700, 4200, 6200, 4200); line(W, 200, 4000, 2500, 4000); line(W, 3700, 4000, 6000, 4000);
for (const y of [4000, 4100, 4200]) line('A-GLAZ', 2500, y, 3700, y);
// left wall
line(W, 0, 0, 0, 4200); line(W, 200, 200, 200, 4000);
// right wall with a T junction (interior wall 100 mm at y 2000..2100)
line(W, 6200, 0, 6200, 4200); line(W, 6000, 200, 6000, 2000); line(W, 6000, 2100, 6000, 4000);
line(W, 3000, 2000, 6000, 2000); line(W, 3000, 2100, 6000, 2100); line(W, 3000, 2000, 3000, 2100);
// door block on the continuous left wall (block x along +Y)
g(0, 'INSERT', 8, 'A-DOOR', 2, 'DOOR90', 10, 100, 20, 2500, 30, 0, 50, 90);
// furniture blocks: a bed and an array of three chairs
g(0, 'INSERT', 8, 'A-FURN', 2, 'BED_DOUBLE', 10, 500, 20, 1800, 30, 0);
g(0, 'INSERT', 8, 'A-FURN', 2, 'CHAIR', 10, 7000, 20, -2000, 30, 0, 70, 3, 44, 600);
// an unmatched block is exploded into drafting (BYBLOCK colour → insert colour)
g(0, 'INSERT', 8, 'MISC', 62, 1, 2, 'LOGO', 10, 9000, 20, -2000, 30, 0, 41, 2, 42, 2);
// MLINE wall (200 mm) below the drawing: (0,6000) → (3000,6000)
g(0, 'MLINE', 8, W, 2, 'STANDARD', 40, 1, 70, 0, 71, 1, 72, 2, 73, 2, 10, 0, 20, 6000, 30, 0, 210, 0, 220, 0, 230, 1);
for (const x of [0, 3000]) g(11, x, 21, 6000, 31, 0, 12, 1, 22, 0, 32, 0, 13, 0, 23, 1, 33, 0, 74, 2, 41, 100, 41, 0, 75, 0, 74, 2, 41, -100, 41, 0, 75, 0);
// texts
g(0, 'TEXT', 8, 'TEXT', 10, 1500, 20, 1200, 30, 0, 40, 250, 1, 'SALON');
g(0, 'TEXT', 8, 'TEXT', 10, 4200, 20, 3000, 30, 0, 40, 120, 1, 'Mutfak');
g(0, 'TEXT', 8, 'TEXT', 10, 7000, 20, 1000, 30, 0, 40, 100, 50, 90, 1, '\\U+00C7ALI\\U+015EMA %%c50');
g(0, 'MTEXT', 8, 'TEXT', 10, 7000, 20, 3000, 30, 0, 40, 100, 71, 1, 1, '{\\fArial|b1;Yatak}\\POdas\\U+0131');
// dimensions: aligned along the bottom, rotated (vertical) on the right
g(0, 'DIMENSION', 8, 'DIM', 2, '*D1', 10, 6200, 20, -600, 30, 0, 70, 33, 13, 0, 23, 0, 33, 0, 14, 6200, 24, 0, 34, 0);
g(0, 'DIMENSION', 8, 'DIM', 2, '*D2', 10, 6800, 20, 0, 30, 0, 70, 32, 13, 6200, 23, 0, 33, 0, 14, 6200, 24, 4200, 34, 0, 50, 90);
// drafting geometry
g(0, 'CIRCLE', 8, 'MISC', 10, 8000, 20, 1000, 30, 0, 40, 300);
g(0, 'ARC', 8, 'MISC', 10, 8000, 20, 3000, 30, 0, 40, 500, 50, 0, 51, 180);
g(0, 'ELLIPSE', 8, 'MISC', 10, 9000, 20, 1000, 30, 0, 11, 600, 21, 0, 31, 0, 40, 0.5, 41, 0, 42, 6.283185307179586);
g(0, 'SPLINE', 8, 'MISC', 70, 8, 71, 3, 72, 8, 73, 4, 74, 0, 40, 0, 40, 0, 40, 0, 40, 0, 40, 1, 40, 1, 40, 1, 40, 1,
  10, 7000, 20, 5000, 30, 0, 10, 7500, 20, 5800, 30, 0, 10, 8500, 20, 4200, 30, 0, 10, 9000, 20, 5000, 30, 0);
g(0, 'LWPOLYLINE', 8, 'MISC', 370, 50, 90, 3, 70, 0, 10, 7000, 20, -1000, 42, 1, 10, 8000, 20, -1000, 10, 8000, 20, -1500);
g(0, 'HATCH', 8, 'MISC', 62, 2, 10, 0, 20, 0, 30, 0, 210, 0, 220, 0, 230, 1, 2, 'SOLID', 70, 1, 71, 0, 91, 1,
  92, 2, 72, 0, 73, 1, 93, 4, 10, 10000, 20, 4500, 10, 10500, 20, 4500, 10, 10500, 20, 5000, 10, 10000, 20, 5000, 97, 0, 75, 0, 76, 1, 98, 0);
g(0, 'HATCH', 8, 'MISC', 10, 0, 20, 0, 30, 0, 210, 0, 220, 0, 230, 1, 2, 'ANSI31', 70, 0, 71, 0, 91, 1,
  92, 1, 93, 2, 72, 1, 10, 11000, 20, 4500, 11, 12000, 21, 4500, 72, 2, 10, 11500, 20, 4500, 40, 500, 50, 0, 51, 180, 73, 1,
  97, 0, 75, 0, 76, 1, 52, 0, 41, 1, 77, 0, 78, 0, 98, 0);
g(0, 'SOLID', 8, 'MISC', 10, 12500, 20, 0, 30, 0, 11, 13000, 21, 0, 31, 0, 12, 12500, 22, 500, 32, 0, 13, 13000, 23, 500, 33, 0);
line('MISC', 12500, 1000, 13500, 1000); line('MISC', 13500, 1000, 13500, 2000); line('MISC', 13500, 2000, 12500, 2000);
line('HIDDENLAYER', 12500, 3000, 13500, 3000);
// paper-space entity: must be skipped
g(0, 'LINE', 67, 1, 8, 'MISC', 10, -50000, 20, -50000, 30, 0, 11, 50000, 21, 50000, 31, 0);
g(0, 'ENDSEC', 0, 'EOF');
fs.writeFileSync(path.join(__dirname, 'plan.dxf'), out.join('\r\n') + '\r\n');
console.log('wrote plan.dxf', out.length / 2, 'pairs');
