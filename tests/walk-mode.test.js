/* Walk mode tests (GitHub issue #46).
   Pure geometry and source-shape guards for 3D first-person walking.
   Extracts real pure functions from app.js without browser or DOM dependencies. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');

const fnSrc = name => {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + '() is gone from app.js');
  const lineEnd = src.indexOf('\n', start);
  if (lineEnd > start && src.slice(start, lineEnd).includes('}')) {
    return src.slice(start, src.indexOf('}', start) + 1);
  }
  return src.slice(start, src.indexOf('\n}', start) + 2);
};

const isDoorOpSrc = src.match(/const isDoorOp\s*=[^;\n]+;/)[0];
const walkConstSrc = src.match(/const WALK\s*=[^;\n]+;/)[0];
const wallElevSrc = src.match(/const WALL_ELEV_MAX\s*=[^;\n]+;/)[0];

const { WALK } = new Function(walkConstSrc + '\nreturn { WALK };')();

const { walkPassable, walkSegs, walkMove } = new Function(
  isDoorOpSrc + '\n' +
  walkConstSrc + '\n' +
  wallElevSrc + '\n' +
  fnSrc('walkPassable') + '\n' +
  fnSrc('walkSegs') + '\n' +
  fnSrc('walkMove') + '\n' +
  'return { walkPassable, walkSegs, walkMove };'
)();

test('1. walkSegs: closed door yields 1 segment, open door / arch splits into 2 with opening width gap, window never splits, h = t/2', () => {
  const wall = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20 };

  // Closed door yields 1 segment
  const fClosed = { walls: [wall], ops: [{ id: 'op1', wall: 'w1', d: 200, w: 90, type: 'door', open: 0 }] };
  const segsClosed = walkSegs(fClosed);
  assert.strictEqual(segsClosed.length, 1);
  assert.strictEqual(segsClosed[0].h, 10, 'half-thickness h must equal t/2');
  assert.deepStrictEqual(segsClosed[0].a, { x: 0, y: 0 });
  assert.deepStrictEqual(segsClosed[0].b, { x: 400, y: 0 });

  // Open door splits into 2 segments with a gap equal to opening width
  const fOpen = { walls: [wall], ops: [{ id: 'op2', wall: 'w1', d: 200, w: 90, type: 'door', open: 90 }] };
  const segsOpen = walkSegs(fOpen);
  assert.strictEqual(segsOpen.length, 2);
  assert.strictEqual(segsOpen[0].h, 10);
  assert.strictEqual(segsOpen[1].h, 10);
  assert.strictEqual(segsOpen[0].b.x, 200 - 45); // 155
  assert.strictEqual(segsOpen[1].a.x, 200 + 45); // 245
  const doorGap = segsOpen[1].a.x - segsOpen[0].b.x;
  assert.strictEqual(doorGap, 90, 'gap must equal opening width');

  // Arch splits into 2 segments with gap equal to opening width
  const fArch = { walls: [wall], ops: [{ id: 'op3', wall: 'w1', d: 200, w: 100, type: 'arch' }] };
  const segsArch = walkSegs(fArch);
  assert.strictEqual(segsArch.length, 2);
  const archGap = segsArch[1].a.x - segsArch[0].b.x;
  assert.strictEqual(archGap, 100, 'gap must equal arch width');

  // Window never splits
  const fWin = { walls: [wall], ops: [{ id: 'op4', wall: 'w1', d: 200, w: 120, type: 'window', open: 90 }] };
  const segsWin = walkSegs(fWin);
  assert.strictEqual(segsWin.length, 1, 'window must never split wall');

  // Custom thickness: h = t/2
  const thickWall = { id: 'w2', a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, t: 36 };
  const segsThick = walkSegs({ walls: [thickWall] });
  assert.strictEqual(segsThick[0].h, 18, 'half-thickness h must equal t/2 (36/2=18)');
});

test('2. walkMove: head-on collision stops at y >= 10+20-0.01 and big single move does not tunnel through', () => {
  const segs = [{ a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, h: 10 }]; // wall from (0,0) to (400,0), t=20 => h=10
  const r = 20;

  // Walking head-on from (200,100) by (0,-300)
  const pHeadOn = walkMove({ x: 200, y: 100 }, { x: 0, y: -300 }, segs, r);
  assert.ok(pHeadOn.y >= 10 + 20 - 0.01, `expected y >= 30 - 0.01, got ${pHeadOn.y}`);
  assert.strictEqual(pHeadOn.x, 200);

  // Big single move (0,-1000) must not tunnel through
  const pBig = walkMove({ x: 200, y: 100 }, { x: 0, y: -1000 }, segs, r);
  assert.ok(pBig.y >= 10 + 20 - 0.01, `expected y >= 30 - 0.01, got ${pBig.y}`);
  assert.strictEqual(pBig.x, 200);
});

test('3. Sliding: moving diagonally (200,-200) from (100,100) ends with x ≈ 300 and y >= 30-0.01', () => {
  const segs = [{ a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, h: 10 }];
  const r = 20;

  const pSlide = walkMove({ x: 100, y: 100 }, { x: 200, y: -200 }, segs, r);
  assert.ok(Math.abs(pSlide.x - 300) < 0.01, `expected x ≈ 300, got ${pSlide.x}`);
  assert.ok(pSlide.y >= 30 - 0.01, `expected y >= 30 - 0.01, got ${pSlide.y}`);
});

test('4. Door gap: open door allows passage (y < -100), closed door blocks', () => {
  const wall = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20 };
  const r = 20;

  // Open door 90 wide centred at d=200
  const fOpen = { walls: [wall], ops: [{ id: 'op1', wall: 'w1', d: 200, w: 90, type: 'door', open: 90 }] };
  const segsOpen = walkSegs(fOpen);
  const pOpen = walkMove({ x: 200, y: 100 }, { x: 0, y: -300 }, segsOpen, r);
  assert.ok(pOpen.y < -100, `expected y < -100 after passing open door, got ${pOpen.y}`);

  // Closed door
  const fClosed = { walls: [wall], ops: [{ id: 'op1', wall: 'w1', d: 200, w: 90, type: 'door', open: 0 }] };
  const segsClosed = walkSegs(fClosed);
  const pClosed = walkMove({ x: 200, y: 100 }, { x: 0, y: -300 }, segsClosed, r);
  assert.ok(pClosed.y >= 30 - 0.01, `expected closed door to block (y >= 30 - 0.01), got ${pClosed.y}`);
});

test('5. Starting inside a wall (200,0) with zero move gets pushed out (|y| >= 30-0.01)', () => {
  const segs = [{ a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, h: 10 }];
  const r = 20;

  const pInside = walkMove({ x: 200, y: 0 }, { x: 0, y: 0 }, segs, r);
  assert.ok(Math.abs(pInside.y) >= 30 - 0.01, `expected |y| >= 30 - 0.01, got ${pInside.y}`);
});

test('6. Source-shape guards: loop3D, walkStep, keydown, set3DCam, show3D, s3dFloor, applyWalkCam', () => {
  // loop3D computes dt from performance.now and calls walkStep(dt) and returns before T3.ctl.update() when T3.walk
  const loopSrc = fnSrc('loop3D');
  assert.match(loopSrc, /performance\.now\(\)/, 'loop3D must compute dt using performance.now()');
  assert.match(loopSrc, /walkStep\(dt\)/, 'loop3D must call walkStep(dt)');
  assert.match(loopSrc, /if\s*\(T3\.walk\)\s*\{\s*walkStep\(dt\);[^}]*return;\s*\}/, 'loop3D must return when T3.walk');
  const walkRetIdx = loopSrc.indexOf('walkStep(dt)');
  const ctlUpdIdx = loopSrc.indexOf('T3.ctl.update()');
  assert.ok(walkRetIdx > 0 && ctlUpdIdx > walkRetIdx, 'loop3D must return before T3.ctl.update() when T3.walk');

  // walkStep ignores 'q'/'e' (its source does not contain "'q'" or "'e'")
  const stepSrc = fnSrc('walkStep');
  assert.strictEqual(stepSrc.includes("'q'"), false, "walkStep must not contain 'q'");
  assert.strictEqual(stepSrc.includes("'e'"), false, "walkStep must not contain 'e'");

  // speed uses dt (WALK.speed/WALK.run * dt)
  assert.match(stepSrc, /\(k\.has\('shift'\)\s*\?\s*WALK\.run\s*:\s*WALK\.speed\)\s*\*\s*dt/, 'speed must use dt with WALK.speed / WALK.run');

  // the 3D keydown branch calls exitWalk(true) on Escape before show3D(false)
  const kdStart = src.indexOf('if (ui.view3d) {');
  assert.ok(kdStart > 0, 'keydown ui.view3d branch must exist');
  const kdEnd = src.indexOf('if (e.key === \' \') {', kdStart);
  const kdBranch = src.slice(kdStart, kdEnd);
  assert.match(kdBranch, /if\s*\(e\.key === 'Escape'\)\s*\{\s*if\s*\(T3 && T3\.walk\)\s*exitWalk\(true\);\s*else\s*show3D\(false\);/,
    'keydown Escape must call exitWalk(true) before show3D(false)');

  // set3DCam calls enterWalk() for 'eye' and exitWalk(false) otherwise
  const setCamSrc = fnSrc('set3DCam');
  assert.match(setCamSrc, /if\s*\(kind !== 'eye'\)\s*exitWalk\(false\);/, "set3DCam must call exitWalk(false) when kind !== 'eye'");
  assert.match(setCamSrc, /if\s*\(kind === 'eye'\)\s*enterWalk\(\);/, "set3DCam must call enterWalk() when kind === 'eye'");

  // show3D(false) calls exitWalk(true)
  const show3dSrc = fnSrc('show3D');
  assert.match(show3dSrc, /exitWalk\(true\)/, 'show3D(false) must call exitWalk(true)');

  // the s3dFloor onchange calls walkToFloor
  const s3dIdx = src.indexOf("$('#s3dFloor').onchange");
  assert.ok(s3dIdx > 0, "$('#s3dFloor').onchange must exist");
  const s3dLine = src.slice(s3dIdx, src.indexOf('};', s3dIdx) + 2);
  assert.match(s3dLine, /walkToFloor/, 's3dFloor onchange must call walkToFloor');

  // applyWalkCam keeps the pitch clamp WALK.pitch < Math.PI/2
  assert.ok(WALK.pitch < Math.PI / 2, 'WALK.pitch must be strictly less than Math.PI / 2');
  const camSrc = fnSrc('applyWalkCam');
  assert.match(camSrc, /Math\.cos\(w\.pitch\)/, 'applyWalkCam must compute cos(pitch)');
  assert.match(camSrc, /Math\.sin\(w\.pitch\)/, 'applyWalkCam must compute sin(pitch)');
});

test('7. Speed is frame-rate independent: 30 steps @ 1/30 s vs 144 steps @ 1/144 s differ < 0.5 cm', () => {
  let p30 = { x: 0, y: 0 };
  const dt30 = 1 / 30;
  for (let i = 0; i < 30; i++) {
    p30 = walkMove(p30, { x: WALK.speed * dt30, y: 0 }, [], WALK.r);
  }

  let p144 = { x: 0, y: 0 };
  const dt144 = 1 / 144;
  for (let i = 0; i < 144; i++) {
    p144 = walkMove(p144, { x: WALK.speed * dt144, y: 0 }, [], WALK.r);
  }

  const diff = Math.hypot(p30.x - p144.x, p30.y - p144.y);
  assert.ok(diff < 0.5, `expected speed frame-rate independent within 0.5 cm, got diff ${diff}`);
  assert.ok(Math.abs(p30.x - WALK.speed) < 0.01, `expected 1 second distance ≈ WALK.speed (${WALK.speed}), got ${p30.x}`);
});
