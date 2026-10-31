/* 3D render export (issue #13).

   The 3D view is a live WebGL canvas created WITHOUT preserveDrawingBuffer, so
   the drawing buffer is discarded once the current task yields. A capture that
   render()s and then reads the canvas in a later task (await, toBlob callback,
   setTimeout) produces a blank PNG. The scale helper is pure geometry and is
   proven here; the capture contract is asserted at source level because the
   buffer behaviour only exists inside a real GPU context (browser-smoke.js
   runs the real capture and checks the PNG is not blank). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const js = read('app.js');
const html = read('index.html');

/** Mirror of shot3DScale() — keep in sync with app.js. */
function shot3DScale(w, h, maxSide = 3840, maxPixels = 12e6) {
  const side = Math.max(1, w, h);
  const ideal = Math.max(2, Math.min(3, maxSide / side));
  return Math.max(1, Math.min(ideal, maxSide / side, Math.sqrt(maxPixels / (w * h))));
}

const sliceFn = name => {
  const start = js.indexOf('function ' + name);
  assert.ok(start > 0, name + '() is gone');
  const end = js.indexOf('\n}', start);
  return js.slice(start, end);
};

test('the render is oversampled 2x-3x without exploding past 4K / 12 MP', () => {
  // a normal desktop window: a full 2x is always affordable
  assert.ok(shot3DScale(1500, 800) >= 2, 'a 1500x800 window should get at least 2x');
  assert.ok(shot3DScale(1500, 800) <= 3, 'more than 3x is wasted pixels');

  // a small window gets the full 3x
  assert.ok(Math.abs(shot3DScale(600, 400) - 3) < 1e-9, 'a small window should get the full 3x');

  for (const [w, h] of [[320, 200], [600, 400], [1280, 720], [1920, 1080], [2560, 1440], [3840, 2160], [5120, 2880]]) {
    const k = shot3DScale(w, h);
    assert.ok(k >= 1, `never upscale below 1x (${w}x${h} -> ${k})`);
    // the cap applies to the upscale: an already-huge viewport is never shrunk
    const sideCap = Math.max(3840, w, h);
    assert.ok(Math.max(w, h) * k <= sideCap + 1, `longest side exceeds the cap for ${w}x${h}: ${Math.round(Math.max(w, h) * k)}`);
    if (Math.max(w, h) <= 3840) {
      assert.ok(w * h * k * k <= 12e6 + 1, `more than 12 MP for ${w}x${h}: ${Math.round(w * h * k * k / 1e6 * 10) / 10} MP`);
    }
  }

  // a 4K viewport still produces something usable, not a 1x escape hatch
  assert.ok(shot3DScale(3840, 2160) >= 1);
  // degenerate sizes must not produce NaN/Infinity
  for (const k of [shot3DScale(0, 0), shot3DScale(1, 1), shot3DScale(10000, 1)]) assert.ok(Number.isFinite(k) && k > 0);
});

test('the capture happens in one synchronous task', () => {
  const fn = sliceFn('render3DDataUrl');
  const renderAt = fn.indexOf('r.render(scene, cam)');
  const grabAt = fn.indexOf('toDataURL');
  assert.ok(renderAt > 0, 'render3DDataUrl() must render the scene explicitly before capturing');
  assert.ok(grabAt > 0, 'render3DDataUrl() no longer captures the canvas');
  assert.ok(renderAt < grabAt, 'the scene must be rendered before toDataURL()');
  // the regression: any await/callback between render and capture gives a blank PNG
  const between = fn.slice(renderAt, grabAt);
  assert.doesNotMatch(between, /await|toBlob|setTimeout|requestAnimationFrame/, 'the buffer is not preserved — render() and toDataURL() cannot be split');
  assert.doesNotMatch(fn, /async function render3DDataUrl/, 'render3DDataUrl() must stay synchronous');
  assert.match(fn, /getPixelRatio\(\)/, 'the original pixel ratio must be saved');
  assert.match(fn, /setPixelRatio\(1\)/, 'accumulated devicePixelRatio would silently multiply the output size');
  assert.match(fn, /setSize\([^\n]*false\)/, 'setSize must not change the element CSS size');
  assert.match(fn, /finally\s*{[\s\S]*resize3D\(\)/, 'the viewport must be restored in a finally block');
  assert.match(fn, /updateProjectionMatrix\(\)/, 'camera aspect must be updated for the capture size');
});

test('the 3D capture is reachable from both UIs, with a 3D-named file', () => {
  assert.ok(html.includes('id="b3dShot"'), 'index.html has no #b3dShot button');
  const cam = html.slice(html.indexOf('ctl3dCam'), html.indexOf('</div>', html.indexOf('ctl3dCam')));
  for (const id of ['b3dFit', 'b3dTop', 'b3dEye', 'b3dShot']) {
    assert.ok(cam.includes('id="' + id + '"'), `#${id} should sit in the camera overlay bar`);
  }
  assert.match(js, /\$\('#b3dShot'\)\.onclick = export3DRender/, 'the 📸 button is not wired');

  const fn = sliceFn('export3DRender');
  assert.match(fn, /-3d-render\.png/, 'the exported file must be named "<project>-3d-render.png"');
  assert.match(fn, /fname\('png'\)/, 'the filename should reuse the existing sanitiser');
  assert.match(fn, /ui\.shot/, 'a double click would capture twice — keep the re-entrancy guard');
  assert.match(fn, /ui\.view3d/, 'export3DRender() must refuse to run outside 3D');
});

test('the top-bar PNG button follows the active view', () => {
  assert.match(js, /\$\('#bPng'\)\.onclick = \(\) => \(ui\.view3d \? export3DRender\(\) : exportPng\(\)\)/,
    'the PNG button must export the 3D render while in 3D and the 2D plan otherwise');
  assert.match(js, /function syncExportTitles/, 'the PNG button has no context-aware tooltip');
  assert.match(sliceFn('syncExportTitles'), /L\(/, 'the tooltip must be bilingual');
  assert.match(sliceFn('show3D'), /syncExportTitles\(\)/, 'entering/leaving 3D must refresh the tooltip');
  // SVG / PDF stay 2D plan exports in both modes (they carry a title block + scale bar)
  assert.match(js, /\$\('#bSvg'\)\.onclick = \(\) => download\(fname\('svg'\)/, 'the SVG export changed');
  assert.match(js, /\$\('#bPrint'\)\.onclick = exportPrint/, 'the print export changed');
  assert.match(js, /if \(\$\('#b3dShot'\)\) \$\('#b3dShot'\)\.title = L\(/, 'the 📸 button tooltip is not translated');
});
