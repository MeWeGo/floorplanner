/* Curtain wall mullions (#71), low walls: railings and fences (#73),
   and parallel / isometric 3D camera projection (#74).
   Zero-dependency test cutting real functions out of app.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');
const html = read('index.html');
const mcpSrc = read('mcp/server.js');

const fnSrc = name => {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + '() is gone from app.js');
  const lineEnd = src.indexOf('\n', start);
  const firstLine = src.slice(start, lineEnd);
  if (firstLine.includes('}')) return firstLine;
  return src.slice(start, src.indexOf('\n}', start) + 2);
};

const constLine = name => {
  const start = src.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is gone from app.js');
  const end = src.indexOf('\n', start);
  return src.slice(start, end).replace(/\r$/, '');
};

/* ------------------------------------------------------------------
   (#71) Curtain wall mullions
   ------------------------------------------------------------------ */

test('(#71) curtainBays(w): bay count calculations and priority', () => {
  const { curtainBays } = new Function(`
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const wLen = w => dist(w.a, w.b);
    ${constLine('MUL_DEF')}
    ${fnSrc('curtainBays')}
    return { curtainBays };
  `)();

  const w = (len, mul, mulN) => ({
    a: { x: 0, y: 0 },
    b: { x: len, y: 0 },
    ...(mul !== undefined ? { mul } : {}),
    ...(mulN !== undefined ? { mulN } : {}),
  });

  // no fields -> round(L/120) (360 cm wall -> 3 bays)
  assert.strictEqual(curtainBays(w(360)), 3);
  assert.strictEqual(curtainBays(w(240)), 2);
  assert.strictEqual(curtainBays(w(100)), 1);

  // mul:90 -> 4 bays for 360 cm wall
  assert.strictEqual(curtainBays(w(360, 90)), 4);

  // mulN:0 -> 1 bay
  assert.strictEqual(curtainBays(w(360, undefined, 0)), 1);

  // mulN:3 -> 4 bays
  assert.strictEqual(curtainBays(w(360, undefined, 3)), 4);

  // mulN wins over mul
  assert.strictEqual(curtainBays(w(360, 90, 0)), 1);
  assert.strictEqual(curtainBays(w(360, 90, 3)), 4);
  assert.strictEqual(curtainBays(w(360, 360, 1)), 2);
});

test('(#71) source regex: wallSvg and build3D draw curtain bays', () => {
  assert.ok(/function wallSvg\b[\s\S]*?const nTick = curtainBays\(w\);/.test(src),
    'wallSvg must compute bays with curtainBays(w)');
  assert.ok(/for\s*\(\s*let\s+i\s*=\s*1;\s*i\s*<\s*nTick;\s*i\+\+\s*\)/.test(src),
    'wallSvg must draw (bays - 1) tick lines');
  assert.ok(/const nM = curtainBays\(w\);/.test(src),
    'build3D must compute mullion bays with curtainBays(w)');
});

test('(#71) source regex: applyProp and renderProps handle mul and mulN', () => {
  assert.ok(/k === 'wall' && p === 'mul'\) \{[^}]*delete o\.mulN;/.test(src),
    'applyProp handles p === "mul" and deletes mulN');
  assert.ok(/k === 'wall' && p === 'mulN'\) \{/.test(src),
    'applyProp handles p === "mulN"');
  assert.ok(/os\.every\(\s*x\s*=>\s*x\.o\.wt === 'curtain'\s*\)/.test(src),
    'renderProps gates mul/mulN behind os.every(x => x.o.wt === "curtain")');
});

/* ------------------------------------------------------------------
   (#73) Low walls: railing & fence
   ------------------------------------------------------------------ */

test('(#73) WALL_TYPES and LOW_WALL registries', () => {
  const { WALL_TYPES, LOW_WALL } = new Function(`
    ${constLine('WALL_TYPES')}
    ${constLine('LOW_WALL')}
    return { WALL_TYPES, LOW_WALL };
  `)();
  assert.ok(WALL_TYPES.includes('solid'), 'WALL_TYPES has solid');
  assert.ok(WALL_TYPES.includes('curtain'), 'WALL_TYPES has curtain');
  assert.ok(WALL_TYPES.includes('railing'), 'WALL_TYPES has railing');
  assert.ok(WALL_TYPES.includes('fence'), 'WALL_TYPES has fence');
  assert.ok(LOW_WALL.railing, 'LOW_WALL has railing');
  assert.ok(LOW_WALL.fence, 'LOW_WALL has fence');
});

test('(#73) setWallType transitions and property adjustments', () => {
  const { setWallType, isLowWall, LOW_WALL } = new Function(`
    ${constLine('WALL_TYPES')}
    ${constLine('LOW_WALL')}
    ${fnSrc('isLowWall')}
    const curFloorH = () => 270;
    const P = { wallT: 20 };
    ${fnSrc('setWallType')}
    return { setWallType, isLowWall, LOW_WALL };
  `)();

  // a 270/20 solid wall -> railing becomes h 100, t 6
  const wRail = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, h: 270, t: 20, wt: 'solid' };
  setWallType(wRail, 'railing');
  assert.strictEqual(wRail.wt, 'railing');
  assert.strictEqual(wRail.h, 100);
  assert.strictEqual(wRail.t, 6);

  // fence becomes h 110, t 8
  const wFence = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, h: 270, t: 20, wt: 'solid' };
  setWallType(wFence, 'fence');
  assert.strictEqual(wFence.wt, 'fence');
  assert.strictEqual(wFence.h, 110);
  assert.strictEqual(wFence.t, 8);

  // railing <-> fence: still on the old defaults -> takes the new ones; custom values stay
  const wSw = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, h: 100, t: 6, wt: 'railing' };
  setWallType(wSw, 'fence');
  assert.deepStrictEqual([wSw.h, wSw.t], [110, 8]);
  const wCustom = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, h: 95, t: 4, wt: 'railing' };
  setWallType(wCustom, 'fence');
  assert.deepStrictEqual([wCustom.h, wCustom.t], [95, 4]);

  // a wall already 90 high keeps 90
  const wLow = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, h: 90, t: 20, wt: 'solid' };
  setWallType(wLow, 'railing');
  assert.strictEqual(wLow.h, 90);
  assert.strictEqual(wLow.t, 6);

  // back to solid restores h 270 and t 20
  setWallType(wRail, 'solid');
  assert.strictEqual(wRail.wt, 'solid');
  assert.strictEqual(wRail.h, 270);
  assert.strictEqual(wRail.t, 20);

  // switching away from curtain deletes mul/mulN
  const wCurt = { a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, h: 270, t: 20, wt: 'curtain', mul: 90, mulN: 3 };
  setWallType(wCurt, 'solid');
  assert.strictEqual(wCurt.mul, undefined);
  assert.strictEqual(wCurt.mulN, undefined);
});

test('(#73) lowWallSolid splits around openings', () => {
  const { lowWallSolid } = new Function(`
    ${fnSrc('lowWallSolid')}
    return { lowWallSolid };
  `)();

  const intervals = lowWallSolid(300, [{ d: 150, w: 60 }]);
  assert.deepStrictEqual(intervals, [[0, 120], [180, 300]]);
});

test('(#73) lowWallPosts gives posts at both ends and within spacing limits', () => {
  const { lowWallPosts } = new Function(`
    ${constLine('LOW_WALL')}
    ${fnSrc('lowWallSolid')}
    ${fnSrc('lowWallPosts')}
    return { lowWallPosts };
  `)();

  // railing: <= 120 cm
  const pRail = lowWallPosts({ wt: 'railing' }, 240);
  assert.strictEqual(pRail[0], 0);
  assert.strictEqual(pRail[pRail.length - 1], 240);
  for (let i = 1; i < pRail.length; i++) {
    assert.ok(pRail[i] - pRail[i - 1] <= 120 + 1e-6);
  }

  // a run just over the spacing still gets an extra post (130 cm railing -> 2 bays)
  const p130 = lowWallPosts({ wt: 'railing' }, 130);
  assert.strictEqual(p130.length, 3);

  // fence: <= 200 cm
  const pFence = lowWallPosts({ wt: 'fence' }, 400);
  assert.strictEqual(pFence[0], 0);
  assert.strictEqual(pFence[pFence.length - 1], 400);
  for (let i = 1; i < pFence.length; i++) {
    assert.ok(pFence[i] - pFence[i - 1] <= 200 + 1e-6);
  }
});

test('(#73) wallJoints skips railing and fence walls', () => {
  const start = src.indexOf('function convexHull(');
  const end = src.indexOf('function polyArea(');
  const { wallJoints } = new Function(`
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const wLen = w => dist(w.a, w.b);
    function polyArea(pts) { return 1; }
    ${src.slice(start, end)}
    return { wallJoints };
  `)();

  const floorRail = {
    walls: [
      { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, t: 6, h: 100, wt: 'railing' },
      { a: { x: 0, y: 0 }, b: { x: 0, y: 200 }, t: 6, h: 100, wt: 'railing' },
    ],
  };
  assert.strictEqual(wallJoints(floorRail).length, 0, 'railing corner must have no joint filler');

  const floorFence = {
    walls: [
      { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, t: 8, h: 110, wt: 'fence' },
      { a: { x: 0, y: 0 }, b: { x: 0, y: 200 }, t: 8, h: 110, wt: 'fence' },
    ],
  };
  assert.strictEqual(wallJoints(floorFence).length, 0, 'fence corner must have no joint filler');
});

test('(#73) source regex: 3D, elevation and MCP server support for low walls', () => {
  assert.ok(/lowWall3D\(/.test(src), 'build3D calls lowWall3D');
  assert.ok(/railElevSvg\(/.test(src), 'archSvg draws railElevSvg');
  assert.ok(/tool\(\s*['"]add_wall['"][\s\S]*?enum:\s*\[[^\]]*'railing'[^\]]*'fence'[^\]]*\][\s\S]*?mul:[\s\S]*?mulN:/.test(mcpSrc),
    'mcp/server.js add_wall enum includes railing, fence, mul, and mulN');
  assert.ok(/function cleanMullions\(/.test(mcpSrc), 'mcp/server.js defines cleanMullions');
});

/* ------------------------------------------------------------------
   (#74) 3D Orthographic / Isometric camera & projection
   ------------------------------------------------------------------ */

test('(#74) source checks on 3D camera and projection wiring in app.js', () => {
  const init3DSrc = src.slice(src.indexOf('function init3D()'), src.indexOf('function resize3D()'));
  assert.ok(/new\s+THREE\.OrthographicCamera\(/.test(init3DSrc), 'init3D creates an OrthographicCamera');
  assert.ok(/T3\s*=\s*\{[^}]*pcam:\s*cam[^}]*ocam\b/.test(init3DSrc), 'T3 has pcam and ocam');

  const setProjSrc = src.slice(src.indexOf('function setProjection('), src.indexOf('function syncProjUI()'));
  assert.ok(/T3\.cam\s*=\s*to/.test(setProjSrc) && /T3\.ctl\.object\s*=\s*to/.test(setProjSrc),
    'setProjection swaps T3.cam and sets T3.ctl.object');

  assert.ok(/function fitOrtho\(\)/.test(src), 'fitOrtho exists');
  const camAlongSrc = src.slice(src.indexOf('function camAlong('), src.indexOf('function lookAtSection('));
  assert.ok(/fitOrtho\(\)/.test(camAlongSrc), 'fitOrtho is called in camAlong');

  const set3DCamSrc = src.slice(src.indexOf('function set3DCam('), src.indexOf('function eyeRoom('));
  assert.ok(/fitOrtho\(\)/.test(set3DCamSrc), 'fitOrtho is called in set3DCam');
  assert.ok(/if\s*\(\s*kind\s*===\s*['"]iso['"]\s*\)/.test(set3DCamSrc), 'set3DCam has an iso branch');

  const orient3DSrc = src.slice(src.indexOf('function orient3DFrom2D('), src.indexOf('function show3D('));
  assert.ok(/fitOrtho\(\)/.test(orient3DSrc), 'fitOrtho is called in orient3DFrom2D');

  const enterWalkSrc = src.slice(src.indexOf('function enterWalk('), src.indexOf('function exitWalk('));
  assert.ok(/setProjection\(false\)/.test(enterWalkSrc), 'enterWalk switches to perspective');
  assert.ok(/T3\.orthoAfterWalk\s*=\s*true/.test(enterWalkSrc), 'enterWalk marks orthoAfterWalk');

  const exitWalkSrc = src.slice(src.indexOf('function exitWalk('), src.indexOf('function walkToFloor('));
  assert.ok(/orthoAfterWalk/.test(exitWalkSrc) && /setProjection\(true\)/.test(exitWalkSrc), 'exitWalk restores projection');

  assert.ok(!/setFromCamera\([^,]+,\s*cam\)/.test(init3DSrc), 'every Raycaster in init3D goes through camRay (no bare cam)');
  assert.ok(/camRay\(/.test(init3DSrc), 'init3D calls camRay');

  assert.ok(/JX\s*=\s*cam\.isOrthographicCamera\s*\?\s*12\s*:\s*8/.test(src),
    'render3DHQ uses JX = cam.isOrthographicCamera ? 12 : 8');

  const resize3DSrc = src.slice(src.indexOf('function resize3D()'), src.indexOf('/* ---------- Perspektif'));
  assert.ok(/setCamAspect\(/.test(resize3DSrc), 'resize3D uses setCamAspect');
});

test('(#74) setCamAspect and viewHalfH execution on mock cameras', () => {
  const { setCamAspect, viewHalfH } = new Function(`
    ${fnSrc('setCamAspect')}
    ${fnSrc('viewHalfH')}
    return { setCamAspect, viewHalfH };
  `)();

  const o = {
    isOrthographicCamera: true,
    top: 100,
    bottom: -100,
    left: -1,
    right: 1,
    zoom: 2,
    updateProjectionMatrix() { this.updated = true; },
  };

  setCamAspect(o, 2);
  assert.strictEqual(o.left, -200, 'setCamAspect(o, 2) sets left to -200');
  assert.strictEqual(o.right, 200, 'setCamAspect(o, 2) sets right to 200');
  assert.strictEqual(viewHalfH(o), 50, 'viewHalfH(ortho) with zoom=2 is 50');

  const pCam = { fov: 90 };
  const vh = viewHalfH(pCam, 100);
  assert.ok(Math.abs(vh - 100) < 1e-6, `viewHalfH({fov:90}, 100) is ${vh}, expected ~100`);
});

test('(#74) index.html camera controls: #b3dIso and #b3dProj inside .ctl3dCam', () => {
  const ctlMatch = html.match(/<div[^>]*class="[^"]*\bctl3dCam\b[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(ctlMatch, '.ctl3dCam container exists in index.html');
  const ctlHtml = ctlMatch[1];
  assert.ok(/id="b3dIso"/.test(ctlHtml), '#b3dIso button exists inside .ctl3dCam');
  assert.ok(/id="b3dProj"/.test(ctlHtml), '#b3dProj button exists inside .ctl3dCam');
});
