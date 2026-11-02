/* Parametric stairs (issue #33).
   Runs the real stairSteps(), stepCorners(), stairRails(), stairN(), blondel()
   cut out of app.js. Tests legacy defaulting, riser counts, footprint bounds,
   handrails, Blondel formula, and source wiring. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');
const fnSrc = name => {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + '() is gone from app.js');
  return src.slice(start, src.indexOf('\n}', start) + 2);
};
const constSrc = name => {
  const start = src.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is gone from app.js');
  return src.slice(start, src.indexOf('\n', start));
};

const { STAIR_TYPES, stairN, blondel, stairSteps, stepCorners, stairRails } = new Function(`
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  ${constSrc('STAIR_TYPES')}
  ${constSrc('stairN')}
  ${fnSrc('stairSteps')}
  ${constSrc('blondel')}
  ${fnSrc('stepCorners')}
  ${fnSrc('stairRails')}
  return { STAIR_TYPES, stairN, blondel, stairSteps, stepCorners, stairRails };
`)();

test('(1) legacy stairs without stepN default to straight with 15 risers; stepN clamped to 2..60', () => {
  const legacy = { w: 100, d: 300, h: 270, k: 'stairs' };
  assert.strictEqual(stairN(legacy), 15);
  const st = stairSteps(legacy);
  assert.strictEqual(st.n, 15);
  assert.strictEqual(st.riser, 18);
  assert.strictEqual(st.type, 'straight');

  assert.strictEqual(stairN({ h: 270, stepN: 1 }), 2);
  assert.strictEqual(stairN({ h: 270, stepN: -10 }), 2);
  assert.strictEqual(stairN({ h: 270, stepN: 60 }), 60);
  assert.strictEqual(stairN({ h: 270, stepN: 100 }), 60);
  assert.strictEqual(stairN({ h: 270, stepN: 15 }), 15);
});

test('(2) step counts, elevations and landings for all stair types (straight, l, u, spiral)', () => {
  const types = ['straight', 'l', 'u', 'spiral'];
  for (const type of types) {
    const w = type === 'spiral' ? 200 : 220;
    const d = type === 'spiral' ? 200 : 260;
    const h = 270;
    const o = { w, d, h, k: 'stairs', stairType: type, stepN: 15 };
    const st = stairSteps(o);

    assert.strictEqual(st.steps.length, st.n, `${type}: steps.length equals n`);
    assert.strictEqual(st.n, 15);

    const last = st.steps[st.steps.length - 1];
    assert.ok(Math.abs(last.z - h) < 1e-9, `${type}: last step z (${last.z}) equals h (${h})`);

    st.steps.forEach((s, i) => {
      const expectedZ = st.riser * (i + 1);
      assert.ok(Math.abs(s.z - expectedZ) < 1e-9, `${type}: step ${i} z matches riser step`);
    });

    const landings = st.steps.filter(s => s.landing);
    if (type === 'l' || type === 'u') {
      assert.strictEqual(landings.length, 1, `${type} has exactly one landing`);
    } else {
      assert.strictEqual(landings.length, 0, `${type} has no landings`);
    }
  }
});

test('(3) straight stairs: treads tile the depth exactly and climb toward -y', () => {
  const o = { w: 100, d: 300, h: 270, k: 'stairs', stairType: 'straight', stepN: 15 };
  const st = stairSteps(o);
  const sumD = st.steps.reduce((sum, s) => sum + s.d, 0);
  assert.ok(Math.abs(sumD - o.d) < 1e-9, `sum of tread depths (${sumD}) equals stair depth (${o.d})`);
  assert.ok(st.steps[0].y > st.steps[st.steps.length - 1].y, 'climbs toward -y: first step y > last step y');
});

test('(4) step corners stay inside the footprint (straight/l/u in w x d, spiral within radius)', () => {
  const tol = 0.5;
  const types = ['straight', 'l', 'u', 'spiral'];
  for (const type of types) {
    const w = type === 'spiral' ? 200 : 220;
    const d = type === 'spiral' ? 200 : 260;
    const h = 270;
    const o = { w, d, h, k: 'stairs', stairType: type, stepN: 15 };
    const st = stairSteps(o);
    for (const s of st.steps) {
      const corners = stepCorners(s);
      if (type === 'spiral') {
        const maxR = Math.min(w, d) / 2 + tol;
        for (const p of corners) {
          const r = Math.hypot(p.x, p.y);
          assert.ok(r <= maxR, `spiral corner radius ${r} exceeds ${maxR}`);
        }
      } else {
        for (const p of corners) {
          assert.ok(p.x >= -w / 2 - tol && p.x <= w / 2 + tol, `${type} corner x ${p.x} outside [-${w / 2}, ${w / 2}]`);
          assert.ok(p.y >= -d / 2 - tol && p.y <= d / 2 + tol, `${type} corner y ${p.y} outside [-${d / 2}, ${d / 2}]`);
        }
      }
    }
  }
});

test('(5) blondel comfort formula', () => {
  const b1 = blondel(18, 27);
  assert.strictEqual(b1.v, 63);
  assert.strictEqual(b1.ok, true);

  const b2 = blondel(18, 20);
  assert.strictEqual(b2.ok, false);
  assert.strictEqual(b2.warn, false);

  const b3 = blondel(17, 25);
  // v = 59: within acceptable Blondel range (warn 57..67)
  assert.ok(b3.ok || b3.warn, 'blondel(17, 25) is ok / acceptable');
});

test('(6) stairRails side configurations, landing omission and rail coordinates', () => {
  const base = { w: 100, d: 300, h: 270, k: 'stairs', stairType: 'straight' };

  const railsNone = stairRails({ ...base, railing: 'none' });
  assert.strictEqual(railsNone.length, 0, "railing 'none' gives no rails");

  const railsLeft = stairRails({ ...base, railing: 'left' });
  const railsBoth = stairRails({ ...base, railing: 'both' });
  assert.strictEqual(railsBoth.length, railsLeft.length * 2, "'both' gives twice as many rails as 'left'");

  // Rails never include landing points
  const oL = { w: 220, d: 260, h: 270, k: 'stairs', stairType: 'l', railing: 'both' };
  const stL = stairSteps(oL);
  const landingZ = new Set(stL.steps.filter(s => s.landing).map(s => s.z));
  for (const r of stairRails(oL, stL)) {
    for (const p of r.pts) {
      assert.ok(!landingZ.has(p.z), 'rails must not include landing points');
    }
  }

  // Straight stair: 'right' rail x > 0, 'left' rail x < 0
  const railsRight = stairRails({ ...base, railing: 'right' });
  assert.ok(railsRight[0].pts.every(p => p.x > 0), "on straight stair 'right' rail x is positive");
  assert.ok(railsLeft[0].pts.every(p => p.x < 0), "on straight stair 'left' rail x is negative");
});

test('(7) wiring in app.js: furnBody, furn3D, renderProps, stairfit', () => {
  const fb = fnSrc('furnBody');
  const fbStairsStart = fb.indexOf("f.k === 'stairs'");
  assert.ok(fbStairsStart >= 0, "furnBody must handle f.k === 'stairs'");
  const fbStairs = fb.slice(fbStairsStart, fb.indexOf('} else {', fbStairsStart));
  assert.match(fbStairs, /stairSteps\(f\)/, "furnBody stairs branch must call stairSteps(f)");
  assert.ok(!fbStairs.includes('f.d / 25'), "furnBody stairs branch must no longer contain 'f.d / 25'");

  const f3d = fnSrc('furn3D');
  const f3dStairsStart = f3d.indexOf("case 'stairs':");
  assert.ok(f3dStairsStart >= 0, "furn3D must handle case 'stairs':");
  const f3dStairs = f3d.slice(f3dStairsStart, f3d.indexOf('break;', f3dStairsStart));
  assert.match(f3dStairs, /stairSteps\(o\)/, "furn3D case 'stairs' must call stairSteps(o)");
  assert.match(f3dStairs, /stairRails/, "furn3D case 'stairs' must call stairRails");
  assert.ok(!f3dStairs.includes('h / 18'), "furn3D case 'stairs' must no longer contain 'h / 18'");

  const rp = fnSrc('renderProps');
  assert.match(rp, /['"]stepN['"]/, 'renderProps must include stepN');
  assert.match(rp, /['"]stairType['"]/, 'renderProps must include stairType');
  assert.match(rp, /['"]railing['"]/, 'renderProps must include railing');
  assert.match(rp, /data-act="stairfit"/, 'renderProps must include stairfit button');

  assert.match(src, /if\s*\(a === 'stairfit'\)[\s\S]*?o\.h\s*=\s*P\.wallH\s*\+\s*20/, 'stairfit handler must set o.h = P.wallH + 20');
});
