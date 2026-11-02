/* Render studio with styles, sun and resolution (issue #34).
   Zero-dependency tests covering sun vector calculation, style and resolution constants,
   render3DHQ pipeline wiring, export3DRender options passing, and studio modal DOM/events. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const js = read('app.js');
const html = read('index.html');

const sliceFn = name => {
  const start = js.indexOf('function ' + name);
  assert.ok(start > 0, name + '() is gone from app.js');
  const end = js.indexOf('\n}', start);
  return js.slice(start, end + 2);
};

const constSrc = name => {
  const start = js.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is gone from app.js');
  return js.slice(start, js.indexOf('\n', start));
};

test('(1) sunVector(az, alt) returns a unit vector with correct orientation and alt clamping', () => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sunVector = new Function('clamp', `
    ${sliceFn('sunVector')}
    return sunVector;
  `)(clamp);

  // Unit vector check across diverse angles
  for (const [az, alt] of [[0, 45], [90, 45], [180, 45], [270, 45], [215, 42], [100, 20], [180, 68], [255, 12], [45, 30]]) {
    const v = sunVector(az, alt);
    const len = Math.hypot(v.x, v.y, v.z);
    assert.ok(Math.abs(len - 1) < 1e-6, `vector for (${az}, ${alt}) must be a unit vector; got length ${len}`);
  }

  // az 0 points north (z negative)
  const vN = sunVector(0, 45);
  assert.ok(Math.abs(vN.x) < 1e-6, 'az 0 x must be ~0');
  assert.ok(vN.z < 0, 'az 0 must point north (z negative)');

  // az 90 east (x positive)
  const vE = sunVector(90, 45);
  assert.ok(vE.x > 0, 'az 90 must point east (x positive)');
  assert.ok(Math.abs(vE.z) < 1e-6, 'az 90 z must be ~0');

  // az 180 south (z positive)
  const vS = sunVector(180, 45);
  assert.ok(Math.abs(vS.x) < 1e-6, 'az 180 x must be ~0');
  assert.ok(vS.z > 0, 'az 180 must point south (z positive)');

  // alt 90-ish points almost straight up
  const vUp = sunVector(0, 89);
  assert.ok(vUp.y > 0.999, 'alt 89 must point almost straight up (y close to 1)');
  assert.ok(Math.abs(vUp.x) < 0.05 && Math.abs(vUp.z) < 0.05, 'horizontal components must be near 0');

  // alt is clamped to 1..89
  const vBelow = sunVector(0, -10);
  const vOne = sunVector(0, 1);
  assert.strictEqual(vBelow.y, vOne.y, 'alt < 1 must be clamped to 1');
  assert.strictEqual(vBelow.z, vOne.z, 'alt < 1 z component matches alt 1');

  const vAbove = sunVector(0, 120);
  assert.strictEqual(vAbove.y, vUp.y, 'alt > 89 must be clamped to 89');
  assert.strictEqual(vAbove.z, vUp.z, 'alt > 89 z component matches alt 89');
});

test('(2) RENDER_STYLES and RENDER_RES constants define styles and resolution long sides', () => {
  const { RENDER_STYLES, RENDER_RES } = new Function(`
    ${constSrc('RENDER_STYLES')}
    ${constSrc('RENDER_RES')}
    return { RENDER_STYLES, RENDER_RES };
  `)();

  // The four styles realistic/technical/sketch/clay exist
  for (const style of ['realistic', 'technical', 'sketch', 'clay']) {
    assert.ok(RENDER_STYLES[style], `style '${style}' must exist in RENDER_STYLES`);
    assert.ok(Array.isArray(RENDER_STYLES[style]) && RENDER_STYLES[style].length >= 2, `style '${style}' must have labels`);
  }

  // The resolutions give long sides 1920, 2560, 3840 (and 0 for the viewport option)
  assert.strictEqual(RENDER_RES.view[2], 0, 'viewport resolution must give long side 0');
  assert.strictEqual(RENDER_RES.hd[2], 1920, 'hd resolution must give long side 1920');
  assert.strictEqual(RENDER_RES.qhd[2], 2560, 'qhd resolution must give long side 2560');
  assert.strictEqual(RENDER_RES.uhd[2], 3840, 'uhd resolution must give long side 3840');
});

test('(3) render3DHQ source wiring: opts.longSide, styles, edge visibility, material swap & restore, sun, sketchFilter, format', () => {
  const fn = sliceFn('render3DHQ');

  // reads opts.longSide for the output size
  assert.match(fn, /opts\.longSide\s*\?\s*opts\.longSide\s*\/\s*Math\.max\(w,\s*h\)/, 'reads opts.longSide for the output size scale factor');

  // chooses a style from RENDER_STYLES
  assert.match(fn, /RENDER_STYLES\[opts\.style\]\s*\?\s*opts\.style\s*:\s*'realistic'/, 'chooses a style from RENDER_STYLES, defaulting to realistic');
  assert.match(fn, /inkStyle\s*=\s*style\s*===\s*'technical'\s*\|\|\s*style\s*===\s*'sketch'/, 'defines inkStyle for technical and sketch styles');

  // keeps LineSegments visible for technical/sketch (the hide loop is guarded by !inkStyle)
  assert.match(fn, /if\s*\([^)]*!inkStyle[^)]*\)\s*scene\.traverse\([^)]*isLineSegments/, 'hiding LineSegments must be guarded by !inkStyle');

  // swaps mesh materials when the style is not realistic and restores them in finally (swapped[i].m.material = swapped[i].mat) and disposes styleMats
  assert.match(fn, /if\s*\(style\s*!==\s*'realistic'\)\s*\{/, 'swaps materials when style !== realistic');
  assert.match(fn, /swapped\.push\(\{\s*m:\s*o,\s*mat:\s*o\.material\s*\}\)/, 'records original materials in swapped array');
  assert.match(fn, /finally\s*\{[\s\S]*for\s*\([^)]*swapped\.length[^)]*\)\s*swapped\[i\]\.m\.material\s*=\s*swapped\[i\]\.mat;/, 'restores mesh materials in finally');
  assert.match(fn, /finally\s*\{[\s\S]*for\s*\(\s*const\s+m\s+of\s+styleMats\s*\)\s*m\.dispose\(\);/, 'disposes styleMats in finally');

  // moves the shadow light for opts.sun via sunVector and restores position and colour in finally
  assert.match(fn, /const\s+tg\s*=\s*l\.target\.position[\s\S]*sunVector\(opts\.sun\.az,\s*opts\.sun\.alt\)/, 'moves shadow light using sunVector');
  assert.match(fn, /sunSaved\.push\(\{\s*l,\s*pos:\s*l\.position\.clone\(\),\s*col:\s*l\.color\.clone\(\)\s*\}\)/, 'saves sun light position and colour');
  assert.match(fn, /finally\s*\{[\s\S]*s\.l\.position\.copy\(s\.pos\);\s*s\.l\.color\.copy\(s\.col\);/, 'restores sun light position and colour in finally');

  // runs sketchFilter for the sketch style
  assert.match(fn, /if\s*\(style\s*===\s*'sketch'\)\s*sketchFilter\(fin\);/, 'runs sketchFilter for the sketch style');

  // encodes with toDataURL(mime, 0.92) where mime is image/jpeg for opts.format === 'jpeg'
  assert.match(fn, /mime\s*=\s*opts\.format\s*===\s*'jpeg'\s*\?\s*'image\/jpeg'\s*:\s*'image\/png'/, 'sets mime to image/jpeg when format is jpeg');
  assert.match(fn, /fin\.toDataURL\(mime,\s*0\.92\)/, 'encodes with toDataURL(mime, 0.92)');
});

test('(4) export3DRender(quick, opts) passes opts to render3DHQ and contains default -3d-render.png', () => {
  const fn = sliceFn('export3DRender');
  assert.match(fn, /function\s+export3DRender\(\s*quick\s*,\s*opts\s*\)/, 'export3DRender takes quick and opts arguments');
  assert.match(fn, /render3DHQ\(opts\)/, 'passes opts to render3DHQ');
  assert.match(fn, /'-3d-render\.png'/, 'contains the literal "-3d-render.png" default name');
});

test('(5) index.html #b3dStudio, openRenderStudio click binding, studioHtml controls, and render action', () => {
  // index.html has a button with id b3dStudio
  assert.match(html, /<button[^>]*id="b3dStudio"/, 'index.html has a button with id b3dStudio');

  // app.js binds .onclick to openRenderStudio()
  assert.match(js, /\$\('#b3dStudio'\)\.onclick\s*=\s*\(\)\s*=>\s*openRenderStudio\(\);/, 'binds #b3dStudio.onclick to openRenderStudio()');

  // studio modal (studioHtml) offers controls
  const fnHtml = sliceFn('studioHtml');
  assert.match(fnHtml, /data-rs-style="\$\{k\}"/, 'studioHtml offers data-rs-style buttons');
  assert.match(fnHtml, /<input\s+type="range"[^>]*data-rs="az"/, 'studioHtml offers az range input');
  assert.match(fnHtml, /<input\s+type="range"[^>]*data-rs="alt"/, 'studioHtml offers alt range input');
  assert.match(fnHtml, /data-rs-sun="\$\{k\}"/, 'studioHtml offers data-rs-sun preset buttons');
  assert.match(fnHtml, /<select\s+data-rs="res">/, 'studioHtml offers a res select');
  assert.match(fnHtml, /<select\s+data-rs="format">[\s\S]*<option\s+value="png"[\s\S]*<option\s+value="jpeg"/, 'studioHtml offers a png/jpeg format select');

  // render button calls export3DRender(false, studioOpts())
  assert.match(js, /if\s*\(g\.dataset\.rsGo\s*===\s*'render'\)\s*\{\s*closeModal\(\);\s*export3DRender\(false,\s*studioOpts\(\)\);/, 'render button calls export3DRender(false, studioOpts())');
});
