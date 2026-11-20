/* Line weights: P.lw = { wall?, op?, furn?, room?, anno? } multipliers (absent / 1 = unchanged), applied per layer by lwScale
   (halos and hit areas untouched) and to the CAD hollow-wall edge; 2D drafting lines get weight buttons in the toolbar. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n');
const line = start => { const i = src.indexOf(start); assert.ok(i >= 0, start); return src.slice(i, src.indexOf('\n', i)); };
// eslint-disable-next-line no-new-func
const H = new Function(`
  let P = {};
  ${line('const LW_CATS')}
  ${line('const LW_STEPS')}
  ${line('const lwK')}
  ${fnSrcOf(src, 'lwScale')}
  ${fnSrcOf(src, 'cleanLw')}
  return { lwK, lwScale, cleanLw, setP: p => { P = p; } };
`)();

test('defaults: no P.lw → every category is ×1 and the SVG string is returned untouched', () => {
  H.setP({}); for (const c of ['wall', 'op', 'furn', 'room', 'anno']) assert.strictEqual(H.lwK(c), 1);
  const svg = '<rect stroke-width="2"/>'; assert.strictEqual(H.lwScale(svg, 1), svg);
  H.setP({ lw: { furn: 7, op: 'x' } }); assert.strictEqual(H.lwK('furn'), 1, 'unknown steps are ignored');
});

test('lwScale multiplies stroke widths but keeps text halos, hit areas and handles', () => {
  const svg = '<g><rect x="1" stroke-width="2" stroke="#000"/><line stroke-width="1.5"/>'
    + '<text stroke-width="3" paint-order="stroke">A</text><rect data-id="x" stroke="transparent" stroke-width="12"/><rect data-h="v0" stroke-width="1.6"/></g>';
  const out = H.lwScale(svg, 2);
  assert.match(out, /<rect x="1" stroke-width="4" stroke="#000"\/>/);
  assert.match(out, /<line stroke-width="3"\/>/);
  assert.match(out, /<text stroke-width="3" paint-order="stroke">/);
  assert.match(out, /stroke="transparent" stroke-width="12"/);
  assert.match(out, /data-h="v0" stroke-width="1.6"/);
  assert.match(H.lwScale('<path stroke-width="0.3"/>', 0.5), /stroke-width="0.15"/);
});

test('cleanLw keeps valid non-default steps only and drops an empty object', () => {
  const p = { lw: { wall: 3, op: 1, furn: 0.5, room: 9, anno: '2', junk: 2 } }; H.cleanLw(p);
  assert.deepStrictEqual(p.lw, { wall: 3, furn: 0.5, anno: 2 });
  const q = { lw: { op: 1 } }; H.cleanLw(q); assert.ok(!('lw' in q));
  const r = {}; H.cleanLw(r); assert.ok(!('lw' in r), 'old projects untouched');
});

test('wiring: layers, CAD walls, panel, normalize, drafting toolbar', () => {
  const ls = fnSrcOf(src, 'layerStrings');
  for (const [k, c] of [['rooms', 'room'], ['ops', 'op'], ['furn', 'furn'], ['dims', 'anno']]) assert.match(ls, new RegExp(`${k}: [^\\n]*lwK\\('${c}'\\)`), k);
  assert.match(fnSrcOf(src, 'wallHollowSvg'), /const sw = 1\.8 \* lwK\('wall'\)/);
  assert.match(fnSrcOf(src, 'projectPanel'), /h \+= lwPanelHtml\(\);/);
  assert.match(fnSrcOf(src, 'normalizeProject'), /cleanLw\(P\)/);
  assert.match(fnSrcOf(src, 'buildDraftBar'), /DRAFT_WEIGHTS\.map\(w => `<button class="sbtn[^`]*data-dw=/);
  assert.match(src, /const dw = e\.target\.closest\('\[data-dw\]'\); if \(dw\) \{[^\n]*\n[^\n]*draftUi\(\)\.w = w;[^\n]*\n[^\n]*x\.o\.w = w; \}\); commit\(\);/);
});
