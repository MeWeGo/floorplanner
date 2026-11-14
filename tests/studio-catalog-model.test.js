/* Furniture Studio: catalogue 3D model conversion (furnModelParts),
   asymmetric box growth & offset tracking (ui.pb.off), and pbStart/pbApply source guards. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n');

const fnSrc = name => fnSrcOf(src, name);

const lineSrc = name => {
  const start = src.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is gone from app.js');
  return src.slice(start, src.indexOf('\n', start));
};

// top-level one-line const (a local of the same name may appear earlier in app.js)
const topLine = name => {
  const m = src.match(new RegExp('^const ' + name + ' = .*$', 'm'));
  assert.ok(m, name + ' is gone from app.js');
  return m[0];
};

const engineOf = text => {
  const a = text.indexOf('/* PARTS-ENGINE:BEGIN'), b = text.indexOf('/* PARTS-ENGINE:END */');
  assert.ok(a >= 0 && b > a, 'PARTS-ENGINE block missing');
  return text.slice(a, b);
};

const api = new Function(`
  const roof3D = () => {};
  const parts3D = () => {};
  const furnElev = () => 0;
  const stairSteps = () => ({ type: 'straight', steps: [] });
  const stairRails = () => [];
  const railStyle = () => 'bars';
  const rampType = () => 'accessible';
  const rampRailSides = () => [];

  ${lineSrc('clamp')}
  ${topLine('sf')}
  ${topLine('surfOf')}
  ${topLine('SURF_PART')}
  ${topLine('FURN_SURF')}
  ${fnSrc('mixHex')}
  ${engineOf(src)}
  ${fnSrc('hex2rgb')}
  ${fnSrc('shade')}
  ${fnSrc('furn3D')}
  ${fnSrc('furnModelParts')}

  return { furnModelParts, partIssues, partBounds };
`)();

const { furnModelParts, partIssues } = api;

test('(1) catalogue items convert to >1 valid parts inside a box containing the original', () => {
  const items = [
    { type: 'sofa3', k: 'sofa', w: 220, d: 90, h: 85, color: '#64748b' },
    { type: 'chair', k: 'rect', w: 45, d: 45, h: 45, color: '#b08968' },
    { type: 'wm', k: 'rect', w: 60, d: 60, h: 85, color: '#f8fafc' },
    { type: 'fridge', k: 'rect', w: 70, d: 70, h: 180, color: '#e2e8f0' },
    { type: 'bed2', k: 'bed', w: 160, d: 200, h: 50, color: '#94a3b8' },
    { type: 'column', k: 'round', w: 40, d: 40, h: 270, color: '#cbd5e1' },
  ];

  for (const o of items) {
    const res = furnModelParts(o);
    assert.ok(res, `${o.type}: furnModelParts returned null`);
    assert.ok(res.parts.length > 1, `${o.type}: expected >1 parts, got ${res.parts.length}`);

    const box = { w: res.w, d: res.d, h: res.h };
    for (let i = 0; i < res.parts.length; i++) {
      const issues = partIssues(res.parts[i], box);
      assert.deepStrictEqual(issues, [], `${o.type} part[${i}] has issues: ${issues.join('; ')}`);
    }

    assert.ok(res.w >= o.w - 1e-6, `${o.type}: returned w ${res.w} < original ${o.w}`);
    assert.ok(res.d >= o.d - 1e-6, `${o.type}: returned d ${res.d} < original ${o.d}`);
    assert.ok(res.h >= o.h - 1e-6, `${o.type}: returned h ${res.h} < original ${o.h}`);
  }
});

test('(2) wm yields a cylinder lying along y (axis "y") for the door ring', () => {
  const res = furnModelParts({ type: 'wm', k: 'rect', w: 60, d: 60, h: 85, color: '#f8fafc' });
  assert.ok(res, 'wm returned null');
  const ring = res.parts.find(p => p.type === 'cyl' && p.axis === 'y');
  assert.ok(ring, 'expected a cyl part with axis "y" for wm door ring');
});

test('(3) fridge off is non-zero in y only and shifted original footprint corners stay inside returned box', () => {
  const o = { type: 'fridge', k: 'rect', w: 70, d: 70, h: 180, color: '#e2e8f0' };
  const res = furnModelParts(o);
  assert.ok(res, 'fridge returned null');
  assert.ok(res.off, 'expected fridge off to be non-null');
  assert.strictEqual(res.off.x, 0, 'fridge off.x should be 0');
  assert.strictEqual(res.off.z, 0, 'fridge off.z should be 0');
  assert.ok(res.off.y !== 0, 'fridge off.y should be non-zero');

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = sx * (o.w / 2) - res.off.x;
      const cy = sy * (o.d / 2) - res.off.y;
      assert.ok(
        Math.abs(cx) <= res.w / 2 + 0.05,
        `shifted corner x=${cx} outside [-${res.w / 2}, ${res.w / 2}]`
      );
      assert.ok(
        Math.abs(cy) <= res.d / 2 + 0.05,
        `shifted corner y=${cy} outside [-${res.d / 2}, ${res.d / 2}]`
      );
    }
  }
});

test('(4) stairs, ramp, roof, poly, and items with existing parts return null', () => {
  assert.strictEqual(furnModelParts({ type: 'stairs', k: 'stairs', w: 100, d: 280, h: 270 }), null);
  assert.strictEqual(furnModelParts({ type: 'ramp', k: 'ramp', w: 120, d: 300, h: 30 }), null);
  assert.strictEqual(furnModelParts({ type: 'roof', k: 'roof', w: 400, d: 300, h: 150 }), null);
  assert.strictEqual(
    furnModelParts({ type: 'poly', k: 'poly', w: 100, d: 100, h: 50, pts: [{ x: -50, y: -50 }, { x: 50, y: -50 }, { x: 0, y: 50 }] }),
    null
  );
  assert.strictEqual(
    furnModelParts({
      type: 'sofa3', k: 'sofa', w: 220, d: 90, h: 85, color: '#64748b',
      parts: [{ type: 'box', x: 0, y: 0, z: 0, w: 220, d: 90, h: 85 }],
    }),
    null
  );
});

test('(5) source guards: pbStart uses furnModelParts & ui.pb.off; pbApply reads ui.pb.off & rotates by o.rot', () => {
  const pbStartSrc = fnSrc('pbStart');
  assert.match(pbStartSrc, /\bfurnModelParts\s*\(\s*o\s*\)/, 'pbStart must call furnModelParts(o)');
  assert.match(pbStartSrc, /ui\.pb\.off\s*=\s*model\.off/, 'pbStart must set ui.pb.off = model.off');

  const pbApplySrc = fnSrc('pbApply');
  assert.match(pbApplySrc, /ui\.pb\.off/, 'pbApply must read ui.pb.off');
  assert.match(pbApplySrc, /o\.rot/, 'pbApply must rotate ui.pb.off by o.rot');
});
