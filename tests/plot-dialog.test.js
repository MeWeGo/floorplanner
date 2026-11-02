/* Print / PDF plot dialog tests (issue #35).
   Guards paper sizing, plot transforms, scale bar calculations, and plot dialog wiring. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const js = read('app.js');
const html = read('index.html');

const sliceConst = name => {
  const start = js.indexOf('const ' + name);
  assert.ok(start > 0, name + ' is gone');
  const end = js.indexOf('\n', start);
  return js.slice(start, end).replace(/\r$/, '');
};

const sliceFn = name => {
  const start = js.indexOf('function ' + name + '(');
  assert.ok(start > 0, name + '() is gone');
  const end = js.indexOf('\n}', start);
  assert.ok(end > start, name + '() closing brace not found');
  return js.slice(start, end + 2);
};

// Cut out and run for real
const { PAPERS, PLOT_TITLE_MM, paperMm, calcPlotTransform, plotBarCm } = new Function(`
  ${sliceConst('PAPERS')};
  ${sliceConst('PLOT_TITLE_MM')};
  ${sliceConst('paperMm')};
  ${sliceFn('calcPlotTransform')};
  ${sliceConst('plotBarCm')};
  return { PAPERS, PLOT_TITLE_MM, paperMm, calcPlotTransform, plotBarCm };
`)();

test('(1) PAPERS ISO sizes and paperMm orientation / fallback', () => {
  assert.deepStrictEqual(PAPERS.a4, [297, 210], 'A4 ISO dimensions 297x210 mm');
  assert.deepStrictEqual(PAPERS.a3, [420, 297], 'A3 ISO dimensions 420x297 mm');
  assert.deepStrictEqual(PAPERS.a2, [594, 420], 'A2 ISO dimensions 594x420 mm');
  assert.deepStrictEqual(PAPERS.a1, [841, 594], 'A1 ISO dimensions 841x594 mm');
  assert.deepStrictEqual(PAPERS.a0, [1189, 841], 'A0 ISO dimensions 1189x841 mm');

  // Portrait swaps width and height (e.g. A3 landscape 420x297 -> portrait 297x420)
  assert.deepStrictEqual(paperMm({ paper: 'a3', orient: 'portrait' }), { w: 297, h: 420 });
  assert.deepStrictEqual(paperMm({ paper: 'a3', orient: 'landscape' }), { w: 420, h: 297 });

  // Unknown paper falls back to a4
  assert.deepStrictEqual(paperMm({ paper: 'unknown', orient: 'landscape' }), { w: 297, h: 210 });
  assert.deepStrictEqual(paperMm({ paper: 'unknown', orient: 'portrait' }), { w: 210, h: 297 });
});

test('(2) calcPlotTransform scale factors and centered placement', () => {
  const paper = paperMm({ paper: 'a4', orient: 'landscape' }); // 297x210
  const bounds = { x0: 0, y0: 0, x1: 1000, y1: 500 }; // 1000x500 cm
  const margin = 10;
  const titleH = 16;

  // Scale '100' gives k = 0.1 mm per cm (so 100 cm real = 10 mm on paper)
  const t100 = calcPlotTransform(paper, '100', bounds, margin, true, titleH);
  assert.strictEqual(t100.k, 0.1);
  assert.strictEqual(t100.pw, 100, '1000 cm at 1:100 is 100 mm');
  assert.strictEqual(t100.ph, 50, '500 cm at 1:100 is 50 mm');
  assert.strictEqual(t100.overflow, false, 'plan fits within printable area');
  assert.strictEqual(t100.ox, 10 + (277 - 100) / 2, 'ox is centered: margin + (areaW - pw)/2');
  assert.strictEqual(t100.oy, 10 + (174 - 50) / 2, 'oy is centered: margin + (areaH - ph)/2');

  // Scale '50' gives k = 0.2
  const t50 = calcPlotTransform(paper, '50', bounds, margin, true, titleH);
  assert.strictEqual(t50.k, 0.2);

  // Scale '200' gives k = 0.05
  const t200 = calcPlotTransform(paper, '200', bounds, margin, true, titleH);
  assert.strictEqual(t200.k, 0.05);
});

test('(3) overflow detection, fit scaling, and uncentered placement', () => {
  const paper = paperMm({ paper: 'a4', orient: 'landscape' }); // 297x210, areaW = 277, areaH = 174
  const margin = 10;
  const titleH = 16;

  // Bounds 0..1000 x 0..500 at 1:50 is 200x100 mm -> fits in 277x174 -> no overflow
  const t50Normal = calcPlotTransform(paper, '50', { x0: 0, y0: 0, x1: 1000, y1: 500 }, margin, true, titleH);
  assert.strictEqual(t50Normal.overflow, false);

  // Bounds 0..3000 x 0..500 at 1:100 gives pw = 300 mm > 277 mm -> overflow true
  const t100Wide = calcPlotTransform(paper, '100', { x0: 0, y0: 0, x1: 3000, y1: 500 }, margin, true, titleH);
  assert.strictEqual(t100Wide.pw, 300);
  assert.strictEqual(t100Wide.overflow, true, '300 mm > 277 mm triggers overflow');

  // The same plan at 1:50 on A4 overflows when wider than printable area (600 mm > 277 mm)
  const t50Wide = calcPlotTransform(paper, '50', { x0: 0, y0: 0, x1: 3000, y1: 500 }, margin, true, titleH);
  assert.strictEqual(t50Wide.overflow, true);

  // 'fit' never overflows and fills either width or height exactly
  const tFitWide = calcPlotTransform(paper, 'fit', { x0: 0, y0: 0, x1: 3000, y1: 500 }, margin, true, titleH);
  assert.strictEqual(tFitWide.overflow, false);
  assert.ok(Math.abs(tFitWide.pw - tFitWide.areaW) < 1e-9, 'wide plan fills width exactly');
  assert.ok(tFitWide.ph <= tFitWide.areaH, 'height fits within areaH');

  const tFitTall = calcPlotTransform(paper, 'fit', { x0: 0, y0: 0, x1: 500, y1: 3000 }, margin, true, titleH);
  assert.strictEqual(tFitTall.overflow, false);
  assert.ok(Math.abs(tFitTall.ph - tFitTall.areaH) < 1e-9, 'tall plan fills height exactly');
  assert.ok(tFitTall.pw <= tFitWide.areaW, 'width fits within areaW');

  // center: false places the plan directly at the margin
  const tUncentered = calcPlotTransform(paper, '100', { x0: 0, y0: 0, x1: 1000, y1: 500 }, margin, false, titleH);
  assert.strictEqual(tUncentered.ox, margin, 'ox is placed at margin when uncentered');
  assert.strictEqual(tUncentered.oy, margin, 'oy is placed at margin when uncentered');
});

test('(4) plotBarCm picks first round length >= 25 mm on paper', () => {
  const rounds = [50, 100, 200, 500, 1000, 2000, 5000, 10000];

  assert.strictEqual(plotBarCm(0.1), 500, 'k 0.1 -> 500 cm (50 mm >= 25 mm)');
  assert.strictEqual(plotBarCm(0.2), 200, 'k 0.2 -> 200 cm (40 mm >= 25 mm)');
  assert.strictEqual(plotBarCm(0.05), 500, 'k 0.05 -> 500 cm (25 mm >= 25 mm)');

  // Verify behavior across various scales
  for (const k of [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2]) {
    const expected = rounds.find(c => c * k >= 25) || 10000;
    assert.strictEqual(plotBarCm(k), expected);
  }
});

test('(5) wiring asserts on app.js source and index.html', () => {
  // exportPrint() now just calls openPlotDialog()
  const fnExportPrint = sliceFn('exportPrint');
  assert.match(fnExportPrint, /openPlotDialog\(\)/, 'exportPrint() calls openPlotDialog()');
  assert.doesNotMatch(fnExportPrint, /window\.print/, 'exportPrint() should not call window.print directly');

  // index binding .onclick = exportPrint stays
  assert.ok(html.includes('id="bPrint"'), 'index.html has #bPrint');
  assert.match(js, /\$\('#bPrint'\)\.onclick\s*=\s*exportPrint/, 'exportPrint bound to #bPrint');

  // plotDialogHtml offers data-plot paper / orient / scale / area / margin / center
  const fnDialog = sliceFn('plotDialogHtml');
  for (const p of ['paper', 'orient', 'scale', 'area', 'margin', 'center']) {
    const offered = fnDialog.includes(`data-plot="${p}"`) ||
      (fnDialog.includes('data-plot="${k}"') && (fnDialog.includes(`'${p}'`) || fnDialog.includes(`"${p}"`)));
    assert.ok(offered, `plotDialogHtml offers data-plot ${p}`);
  }

  // data-plot-act win / print / svg buttons
  for (const act of ['win', 'print', 'svg']) {
    assert.ok(fnDialog.includes(`data-plot-act="${act}"`), `plotDialogHtml offers data-plot-act="${act}"`);
  }

  // shows an overflow warning
  assert.match(fnDialog, /t\.overflow/, 'plotDialogHtml checks t.overflow');
  assert.match(fnDialog, /⚠/, 'plotDialogHtml displays overflow warning symbol');

  // plotSheetSvg sizes in mm and clips with #plotclip
  const fnSheet = sliceFn('plotSheetSvg');
  assert.match(fnSheet, /width="\$\{paper\.w\}mm"/, 'svg width sized in mm');
  assert.match(fnSheet, /height="\$\{paper\.h\}mm"/, 'svg height sized in mm');
  assert.match(fnSheet, /<clipPath id="plotclip">/, 'clipPath named plotclip defined');
  assert.match(fnSheet, /clip-path="url\(#plotclip\)"/, 'plan clipped using url(#plotclip)');
  assert.match(fnSheet, /Math\.max\(m,\s*t\.ox\)/, 'clip box computed from plan and margin');
  assert.match(fnSheet, /Math\.min\(m\s*\+\s*t\.areaW,\s*t\.ox\s*\+\s*t\.pw\)/, 'clip box right edge clamped');

  // plotPrint writes @page size rule with margin:0
  const fnPrint = sliceFn('plotPrint');
  assert.match(fnPrint, /@page\s*\{\s*size:\s*\$\{p\.paper\.toUpperCase\(\)\}\s+\$\{p\.orient\};\s*margin:\s*0\s*\}/, 'plotPrint writes @page size rule with margin:0');

  // 'plotwin' tool starts 'plotbox' drag and pointerup stores ui.plot.win and reopens dialog
  assert.match(js, /case 'plotwin':\s*ui\.drag\s*=\s*\{\s*type:\s*'plotbox'/, 'plotwin tool starts plotbox drag');
  assert.match(js, /if\s*\(d\.type === 'plotbox'\)\s*\{[\s\S]*?ui\.plot\.win\s*=[\s\S]*?openPlotDialog\(\)/, 'pointerup stores ui.plot.win and reopens dialog');

  // HINTS and HINTS_EN have plotwin entry
  assert.match(js, /HINTS\s*=\s*\{[\s\S]*?\n\s*plotwin:/, 'HINTS has plotwin entry');
  assert.match(js, /HINTS_EN\s*=\s*\{[\s\S]*?\n\s*plotwin:/, 'HINTS_EN has plotwin entry');
});
