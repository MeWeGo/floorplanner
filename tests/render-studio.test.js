/* Render studio with styles, sun and resolution (issue #34).
   Zero-dependency tests covering sun vector calculation, style and resolution constants,
   render3DHQ pipeline wiring, export3DRender options passing, and studio modal DOM/events. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, constLineOf } = require('./helpers/repo');

const js = read('app.js');
const html = read('index.html');

const sliceFn = name => fnSrcOf(js, name);

const constSrc = name => constLineOf(js, name);

test('(1) sunVector(az, alt) returns a unit vector with correct orientation and alt clamping', () => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sunVector = new Function('clamp', `
    const SUN_ALT_MIN = -18;
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

  // alt is clamped to -18..89: the sky follows the sun below the horizon at night (#122)
  const vBelow = sunVector(0, -40);
  const vMin = sunVector(0, -18);
  assert.ok(sunVector(0, -10).y < 0, 'a sun below the horizon points down');
  assert.strictEqual(vBelow.y, vMin.y, 'alt < -18 must be clamped to -18');
  assert.strictEqual(vBelow.z, vMin.z, 'alt < -18 z component matches alt -18');

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

test('(3) index.html #b3dStudio, openRenderStudio click binding, studioHtml controls, and render action', () => {
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
