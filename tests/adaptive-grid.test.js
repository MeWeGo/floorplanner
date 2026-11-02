/* Site-plan zoom + adaptive grid (issue #38).

   Zooming out used to stop at ~25 m across the screen and the major grid simply
   vanished below 12 % zoom, leaving a blank canvas. The real gridScale() /
   gridFactor() / gridStepLabel() are cut out of app.js and run against synthetic
   projects here; the source guards at the end fail on a silent revert. The live
   behaviour (wheel zoom, drawn SVG, footer text) is covered by browser-smoke.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');

function sliceFunc(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} not found in app.js`);
  const end = src.indexOf('\n}', start) + 2;
  return src.slice(start, end);
}
const constNum = name => {
  const m = src.match(new RegExp(`\\b${name} = ([0-9.]+)`));
  assert.ok(m, `${name} not found in app.js`);
  return +m[1];
};
const GRID_MINOR_PX = constNum('GRID_MINOR_PX');
const GRID_MAJOR_PX = constNum('GRID_MAJOR_PX');
const MIN_ZOOM = constNum('MIN_ZOOM');
const MAX_ZOOM = constNum('MAX_ZOOM');

/** A live copy of the grid helpers bound to one project + zoom level. */
function gridApi(grid, z = 1) {
  return new Function('P', 'view', `
    const GRID_MINOR_PX = ${GRID_MINOR_PX}, GRID_MAJOR_PX = ${GRID_MAJOR_PX};
    ${sliceFunc('gridFactor')}
    ${sliceFunc('gridScale')}
    ${sliceFunc('gridStepLabel')}
    return { gridFactor, gridScale, gridStepLabel };
  `)({ grid }, { x: 0, y: 0, z });
}
const scaleAt = (grid, z) => gridApi(grid, z).gridScale(z);

test('the metric ladder steps up and never stalls', () => {
  const { gridFactor } = gridApi(10, 1);
  assert.deepStrictEqual([1, 2, 5, 10, 20, 50, 100, 500, 1000].map(gridFactor),
    [2, 5, 10, 20, 50, 100, 200, 1000, 2000]);
  // strictly increasing, so gridScale()'s loop always terminates
  let f = 1;
  for (let i = 0; i < 40; i++) {
    const n = gridFactor(f);
    assert.ok(n > f, `gridFactor(${f}) = ${n} does not grow`);
    f = n;
  }
});

test('the snapping grid is drawn while its lines are legible', () => {
  const g = scaleAt(10, 1);
  assert.strictEqual(g.minor, 10, 'a 10 cm grid at 100 % is 10 px apart and stays visible');
  assert.strictEqual(g.minorPx, 10);
  assert.ok(g.major >= GRID_MAJOR_PX, 'the major grid must be at least ' + GRID_MAJOR_PX + ' px apart');
  assert.ok(g.major > g.minor, 'the major grid must be coarser than the minor one');
  assert.strictEqual(g.major % g.minor, 0, 'major lines must sit on minor lines');
});

test('zooming out steps the grid through 1 m / 5 m / 10 m / 50 m / 100 m', () => {
  // a 10 cm base climbs the 1-2-5 ladder exactly as the issue describes
  assert.strictEqual(scaleAt(10, 1).major, 50);      //  50 cm
  assert.strictEqual(scaleAt(10, 0.5).major, 100);   //  1 m
  assert.strictEqual(scaleAt(10, 0.2).major, 500);   //  5 m
  assert.strictEqual(scaleAt(10, 0.05).major, 1000); // 10 m
  assert.strictEqual(scaleAt(10, 0.02).major, 5000); // 50 m
  assert.strictEqual(scaleAt(10, 0.005).major, 10000); // 100 m
  // and it keeps going for site plans: half a kilometre per major square
  assert.strictEqual(scaleAt(10, MIN_ZOOM).major, 50000);
});

test('the major grid never disappears and stays readable at every zoom', () => {
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z *= 0.85) {
    for (const grid of [5, 10, 25, 50, 100, 300, 500, 1234]) {
      const g = scaleAt(grid, z);
      assert.ok(g.major > 0, `no major grid at z=${z}, P.grid=${grid}`);
      assert.ok(g.majorPx >= GRID_MAJOR_PX - 1e-9, `major grid only ${g.majorPx.toFixed(1)} px apart at z=${z} (P.grid=${grid})`);
      assert.ok(g.minor === 0 || g.minorPx >= GRID_MINOR_PX, `minor grid too dense at z=${z} (P.grid=${grid})`);
      assert.strictEqual(g.major % grid, 0, `major ${g.major} is not a multiple of P.grid ${grid}`);
    }
  }
});

test('the minor grid hides when its lines would merge', () => {
  assert.ok(scaleAt(10, 1).minor > 0);
  assert.strictEqual(scaleAt(10, 0.5).minor, 0, '5 px spacing must hide the minor grid');
  assert.strictEqual(scaleAt(10, 0.2).minor, 0);
  assert.strictEqual(scaleAt(300, 0.01).minor, 0);
  assert.strictEqual(scaleAt(300, 1).minor, 300);
});

test('two kilometres fit across a normal screen at the minimum zoom', () => {
  const canvasW = 1400, canvasH = 900;
  assert.ok(200000 * MIN_ZOOM <= canvasW, '2 km must fit across the canvas at minimum zoom');
  assert.ok(200000 * MIN_ZOOM <= canvasH, '2 km must fit down the canvas at minimum zoom');
  // the old limit was 0.04 (≈ 35 m across a 1400 px canvas) — this is the regression
  assert.ok(MIN_ZOOM <= 0.005, 'the zoom-out range was not widened');
  assert.ok(MAX_ZOOM >= 8, 'zoom-in range must not shrink');
});

test('the footer prints the active grid interval', () => {
  const { gridStepLabel } = gridApi(10, 1);
  assert.strictEqual(gridStepLabel(10), '10 cm');
  assert.strictEqual(gridStepLabel(25), '25 cm');
  assert.strictEqual(gridStepLabel(100), '1 m');
  assert.strictEqual(gridStepLabel(250), '2.5 m');
  assert.strictEqual(gridStepLabel(50000), '500 m');
});

test('the source keeps the adaptive grid, the zoom range and P.grid snapping', () => {
  const zoomSrc = sliceFunc('zoomAt');
  assert.match(zoomSrc, /clamp\(view\.z \* f, MIN_ZOOM, MAX_ZOOM\)/, 'zoomAt must clamp to the widened range');
  assert.match(sliceFunc('fit'), /MIN_ZOOM/, 'fit() must be able to frame a site plan');

  const gridSrc = sliceFunc('gridSvg');
  assert.doesNotMatch(gridSrc, /view\.z > 0\.12/, 'the major grid must not vanish at low zoom');
  assert.match(gridSrc, /gridScale\(\)/, 'gridSvg must ask gridScale() for the drawn interval');
  assert.match(gridSrc, /\$\{majId\}/, 'gridSvg must draw the major grid');

  assert.match(sliceFunc('defsSvg'), /gridScale\(\)/, 'the pattern tiles must follow the adaptive interval');
  assert.match(sliceFunc('applyView'), /gridlbl/, 'the footer must show the active grid interval');

  // snapping is the contract from the issue: it follows P.grid, never the drawn step
  const snapSrc = sliceFunc('snapToGrid');
  assert.match(snapSrc, /P\.grid/);
  assert.doesNotMatch(snapSrc, /gridScale|GRID_MAJOR_PX/);
});
