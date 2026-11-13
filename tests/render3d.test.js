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
  assert.match(fn, /setCamAspect\(cam, w \/ h\)|updateProjectionMatrix\(\)/, 'camera aspect must be updated for the capture size');
});

test('the 3D capture is reachable from both UIs, with a 3D-named file', () => {
  assert.ok(html.includes('id="b3dShot"'), 'index.html has no #b3dShot button');
  const cam = html.slice(html.indexOf('ctl3dCam'), html.indexOf('</div>', html.indexOf('ctl3dCam')));
  for (const id of ['b3dFit', 'b3dTop', 'b3dEye', 'b3dShot']) {
    assert.ok(cam.includes('id="' + id + '"'), `#${id} should sit in the camera overlay bar`);
  }
  assert.match(js, /\$\('#b3dShot'\)\.onclick = e => export3DRender\(e && e\.shiftKey\)/, 'the render button is not wired (Shift = quick capture)');

  const fn = sliceFn('export3DRender');
  assert.match(fn, /-3d-render\.png/, 'the exported file must be named "<project>-3d-render.png"');
  assert.match(fn, /-3d-view\.png/, 'the quick capture needs its own name so the two never overwrite each other');
  assert.match(fn, /fname\('png'\)/, 'the filename should reuse the existing sanitiser');
  assert.match(fn, /ui\.shot/, 'a double click would capture twice — keep the re-entrancy guard');
  assert.match(fn, /ui\.view3d/, 'export3DRender() must refuse to run outside 3D');
});

test('the default export is a rendered image, not a viewport screenshot', () => {
  const fn = sliceFn('export3DRender');
  // the regression this guards: "it just takes a photo of the scene"
  assert.match(fn, /render3DHQ\((opts)?\)/, 'the button no longer runs the high-quality render');
  assert.match(fn, /let url = quick \? fast\(\) : await render3DHQ\((opts)?\)/, 'Shift should keep the cheap capture');
  assert.match(fn, /render3DDataUrl\(\)/, 'the quick/fallback capture must still exist');

  const hq = sliceFn('render3DHQ');
  assert.match(hq, /drawImage/, 'the passes must be composited into an accumulation canvas');
  assert.match(hq, /globalAlpha = 1 \/ \(i \+ 1\)/, 'the passes are not averaged — that is what removes aliasing');
  assert.match(hq, /halton\(/, 'the jitter pattern is gone — edges will alias again');
  assert.match(hq, /projectionMatrix\.elements\[(8|JX)\]/, 'no sub-pixel jitter is applied to the camera');
  assert.match(hq, /mapSize\.set\(4096/, 'the render should use a sharper shadow map than the live view');
  assert.match(hq, /shadow\.camera/, 'the shadow frustum should be tightened for the render');
  assert.match(hq, /shadowMap\.autoUpdate = false/, 'the static shadow map is rebuilt on every pass — that is seconds wasted');
  assert.match(hq, /isLineSegments/, 'the CAD outline helpers must be hidden for a render (they read as a viewport)');
  assert.match(hq, /scene\.background = new THREE\.Color\(0xffffff\)/, 'a render uses a studio backdrop, not the dark viewport sky');
  assert.match(hq, /finally\s*{[\s\S]*mapSize\.copy/, 'the shadow map settings must be restored');
  assert.match(hq, /finally\s*{[\s\S]*e\.visible = true/, 'the outline helpers must be restored');
  assert.match(hq, /finally\s*{[\s\S]*scene\.background = oldBg/, 'the backdrop must be restored');
  assert.match(hq, /finally\s*{[\s\S]*T3\.run = oldRun/, 'the animation loop must be restored');
  assert.match(hq, /projectionMatrix\.elements\[(9|JX \+ 1)\] = (0|jy0)/, 'the camera jitter must be cleared after the render');
  assert.match(hq, /supersample|bufK/, 'the supersampled buffer is what makes the downscale produce smooth edges');
  assert.match(js, /function sharpenCanvas/, 'the downscale needs an unsharp pass to stay crisp');
});

test('the jitter pattern is a Halton sequence, not a random walk', () => {
  // mirror of halton() — deterministic offsets are what make averaging converge
  function halton(i, base) {
    let f = 1, r = 0, n = i;
    while (n > 0) { f /= base; r += f * (n % base); n = Math.floor(n / base); }
    return r;
  }
  const xs = [];
  for (let i = 1; i <= 8; i++) {
    const x = halton(i, 2), y = halton(i, 3);
    assert.ok(x > 0 && x < 1 && y > 0 && y < 1, 'jitter must stay inside one pixel');
    xs.push(x + '|' + y);
  }
  assert.strictEqual(new Set(xs).size, 8, 'every pass needs a distinct sub-pixel offset');
  // a sample-based estimate of the mean should be near 0.5 for a decent spread
  const meanX = Array.from({ length: 64 }, (_, i) => halton(i + 1, 2)).reduce((a, b) => a + b, 0) / 64;
  assert.ok(Math.abs(meanX - 0.5) < 0.02, 'the jitter does not average out around the pixel centre');
});

test('the top-bar PNG button follows the active view', () => {
  assert.match(js, /\$\('#bPng'\)\.onclick = e => \(ui\.view3d \? export3DRender\(e && e\.shiftKey\) : exportPng\(\)\)/,
    'the PNG button must render while in 3D and export the 2D plan otherwise');
  assert.match(js, /function syncExportTitles/, 'the PNG button has no context-aware tooltip');
  assert.match(sliceFn('syncExportTitles'), /L\(/, 'the tooltip must be bilingual');
  assert.match(sliceFn('show3D'), /syncExportTitles\(\)/, 'entering/leaving 3D must refresh the tooltip');
  // SVG / PDF stay 2D plan exports in both modes (they carry a title block + scale bar)
  assert.match(js, /\$\('#bSvg'\)\.onclick = \(\) => download\(fname\('svg'\)/, 'the SVG export changed');
  assert.match(js, /\$\('#bPrint'\)\.onclick = exportPrint/, 'the print export changed');
  assert.match(js, /if \(\$\('#b3dShot'\)\) \$\('#b3dShot'\)\.title = L\(/, 'the render button tooltip is not translated');
});

/* Sky backdrop + toon style (issue #45) */
test('sky backdrop: realistic defaults to Sky, other styles to Studio, the user choice wins', () => {
  const hq = sliceFn('render3DHQ');
  assert.match(hq, /opts\.backdrop === 'sky' \|\| opts\.backdrop === 'studio'\) \? opts\.backdrop : \(style === 'realistic' \? 'sky' : 'studio'\)/);
  assert.match(js, /const studioBackdrop = \(\) => ui\.studio\.backdrop \|\| \(ui\.studio\.style === 'realistic' \? 'sky' : 'studio'\)/);
  assert.match(sliceFn('studioHtml'), /data-rs-bg=/, 'the studio has no Studio / Sky choice');
  assert.match(sliceFn('studioHtml'), /RENDER_BACKDROPS/);
  assert.match(js, /const studioOpts = \(\) => \(\{[^\n]*backdrop: studioBackdrop\(\)/, 'preview and render must use the chosen backdrop');
});

test('the sky is an inline shader (no files, no add-ons) whose colours follow the sun', () => {
  const mk = sliceFn('makeSky');
  assert.match(mk, /new THREE\.ShaderMaterial\(/);
  assert.match(mk, /side: THREE\.BackSide/);
  assert.match(mk, /fog: false/);
  assert.match(mk, /new THREE\.Fog\(c\.hor/, 'fog must use the sky horizon colour so the ground edge disappears');
  assert.match(mk, /gl_FragCoord/, 'no dither: the gradient would band');
  assert.doesNotMatch(js, /EffectComposer|ShaderPass|examples\/js|Sky\.js/, 'no post-processing / example add-ons');
  assert.doesNotMatch(html, /EffectComposer|postprocessing/i);
  // colours: evaluate skyColors with a tiny THREE.Color stand-in
  const src = js.slice(js.indexOf('const lerpHex'), js.indexOf('// render seçeneklerinde güneş verilmediyse'));
  class C { constructor(h) { this.r = (h >> 16 & 255) / 255; this.g = (h >> 8 & 255) / 255; this.b = (h & 255) / 255; } lerp(o, t) { this.r += (o.r - this.r) * t; this.g += (o.g - this.g) * t; this.b += (o.b - this.b) * t; return this; } multiplyScalar(k) { this.r *= k; this.g *= k; this.b *= k; return this; } }
  const skyColors = new Function('THREE', 'clamp', src + '\nreturn skyColors;')({ Color: C }, (v, a, b) => Math.max(a, Math.min(b, v)));
  const noon = skyColors(68), golden = skyColors(12);
  assert.ok(noon.zen.b > noon.zen.r + 0.2, 'the noon zenith is not blue');
  assert.ok(golden.hor.r > golden.hor.b + 0.2, 'the golden-hour horizon is not warm');
  assert.ok(golden.glow.r / golden.glow.b > noon.glow.r / noon.glow.b, 'the low-sun glow must be warmer');
  assert.ok(golden.glow.r > noon.glow.r, 'the low-sun glow must be stronger');
});

test('toon style: banded MeshToonMaterial with inked edges, built from the objects\' own colours', () => {
  const hq = sliceFn('render3DHQ');
  assert.match(js, /toon: \['🖍 Çizgi film \(toon\)', '🖍 Toon \/ cel'\]/);
  assert.match(hq, /new THREE\.MeshToonMaterial\(\{ color: m\.color \? m\.color\.clone\(\)/);
  assert.match(hq, /gradientMap: grad/);
  assert.match(hq, /NearestFilter/, 'the gradient must be sampled with NearestFilter or the bands smear');
  assert.match(hq, /inkStyle = style === 'technical' \|\| style === 'sketch' \|\| style === 'toon'/, 'toon needs its outlines');
});

test('everything the sky / toon render changes is restored in finally', () => {
  const hq = sliceFn('render3DHQ');
  const fin = hq.slice(hq.indexOf('} finally {'));
  assert.match(hq, /const oldFog = scene\.fog;/);
  assert.match(fin, /scene\.fog = oldFog;/, 'fog is not restored');
  assert.match(fin, /scene\.remove\(sky\.mesh\); sky\.mesh\.geometry\.dispose\(\); sky\.mesh\.material\.dispose\(\);/, 'the sky mesh is left behind');
  assert.match(fin, /scene\.background = oldBg/);
  assert.match(fin, /swapped\[i\]\.m\.material = swapped\[i\]\.mat/, 'toon materials are not swapped back');
  assert.match(fin, /for \(const m of styleMats\) m\.dispose\(\)/, 'toon materials / gradient are not disposed');
  assert.match(fin, /T3\.ground\.material = oldGroundMat/);
});

test('auto-generated ground uses a grass texture in sky renders and live realistic mode', () => {
  const gm = sliceFn('grassGroundMat');
  assert.match(gm, /floorTexture\(\s*'grass'/, 'grassGroundMat must build a procedural grass texture');
  assert.match(gm, /repeat\.set\(\s*40000\s*\/\s*240\s*,\s*40000\s*\/\s*240\s*\)/, 'grass texture repeat must scale to the 40000 cm PlaneGeometry');
  assert.match(gm, /map:\s*_grassGroundTex[\s\S]*bumpMap:\s*_grassGroundTex/, 'grassGroundMat must attach both map and bumpMap');
  const hq = sliceFn('render3DHQ');
  assert.match(hq, /backdrop === 'sky'\s*\?\s*grassGroundMat\(\)\s*:/, 'sky backdrop renders must use grassGroundMat()');
});
