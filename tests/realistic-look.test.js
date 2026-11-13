/* Tests for issue #87: realistic 3D materials, textures, lighting, and render moods. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js');

function constLine(name) {
  const start = src.indexOf(`const ${name} =`);
  assert.ok(start >= 0, `const ${name} not found in app.js`);
  const end = src.indexOf('\n', start);
  return src.slice(start, end >= 0 ? end : src.length).trim();
}

// ---------- (A) floorTexture() procedural colour, bump, and roughness maps ----------

function makeFloorTexEnv() {
  let ctxCalls = 0;
  const makeCtx = () => {
    const target = {
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    };
    return new Proxy(target, {
      get(obj, prop) {
        if (prop in obj) {
          return (...args) => {
            ctxCalls++;
            return obj[prop](...args);
          };
        }
        return () => { ctxCalls++; };
      },
      set(obj, prop, val) {
        obj[prop] = val;
        return true;
      },
    });
  };

  const documentStub = {
    createElement(tag) {
      assert.strictEqual(tag, 'canvas');
      return {
        width: 0,
        height: 0,
        getContext(kind) {
          assert.strictEqual(kind, '2d');
          return makeCtx();
        },
      };
    },
  };

  class CanvasTexture {
    constructor(canvas) {
      this.image = canvas;
      this.wrapS = null;
      this.wrapT = null;
      this.anisotropy = 1;
      this.encoding = null;
      this.repeat = {
        x: 1,
        y: 1,
        set(a, b) { this.x = a; this.y = b; },
        copy(o) { this.x = o.x; this.y = o.y; },
      };
    }
  }

  const THREEStub = {
    CanvasTexture,
    RepeatWrapping: 1000,
    sRGBEncoding: 3001,
  };

  const fn = new Function('document', 'THREE', `
    ${constLine('clamp')}
    ${fnSrcOf(src, 'hex2rgb')}
    ${fnSrcOf(src, 'shade')}
    ${fnSrcOf(src, 'mixHex')}
    ${fnSrcOf(src, 'floorTexture')}
    return { floorTexture };
  `);

  const { floorTexture } = fn(documentStub, THREEStub);
  return { floorTexture, CanvasTexture, getCtxCalls: () => ctxCalls };
}

test('(A1) floorTexture creates distinct fpBump and fpRough maps for relief kinds', () => {
  const { floorTexture, CanvasTexture, getCtxCalls } = makeFloorTexEnv();
  const C = { floorTex: {}, texs: [] };
  const reliefKinds = ['wood', 'tile', 'marble', 'carpet', 'stone', 'deck'];

  for (const kind of reliefKinds) {
    const before = C.texs.length;
    const t = floorTexture(kind, '#cbd5e1', true, C, true);
    assert.ok(t instanceof CanvasTexture, `${kind} should return CanvasTexture`);
    assert.strictEqual(t.fpKind, kind);
    assert.strictEqual(t.fpLt, true);
    assert.strictEqual(t.fpReal, true);
    assert.notStrictEqual(t.fpBump, t, `${kind} fpBump should be a separate texture`);
    assert.ok(t.fpBump instanceof CanvasTexture, `${kind} fpBump should be CanvasTexture`);
    assert.ok(t.fpRough instanceof CanvasTexture, `${kind} fpRough should be CanvasTexture`);
    assert.notStrictEqual(t.fpRough, t, `${kind} fpRough should be a separate texture`);
    assert.notStrictEqual(t.fpRough, t.fpBump, `${kind} fpRough and fpBump should be distinct`);
    assert.strictEqual(C.texs.length - before, 3, `${kind} should push colour, bump, rough into C.texs`);
    assert.ok(C.texs.includes(t) && C.texs.includes(t.fpBump) && C.texs.includes(t.fpRough));
    assert.strictEqual(t.fpBump.repeat.x, t.repeat.x, `${kind} bump repeat.x matches colour`);
    assert.strictEqual(t.fpBump.repeat.y, t.repeat.y, `${kind} bump repeat.y matches colour`);
    assert.strictEqual(t.fpRough.repeat.x, t.repeat.x, `${kind} rough repeat.x matches colour`);
    assert.strictEqual(t.fpRough.repeat.y, t.repeat.y, `${kind} rough repeat.y matches colour`);
  }
  assert.ok(getCtxCalls() > 0, '2D canvas context methods should be exercised');
});

test('(A2) floorTexture uses colour map as fpBump and null fpRough for concrete and grass', () => {
  const { floorTexture } = makeFloorTexEnv();
  const C = { floorTex: {}, texs: [] };

  for (const kind of ['concrete', 'grass']) {
    const before = C.texs.length;
    const t = floorTexture(kind, '#9ca3af', false, C, false);
    assert.strictEqual(t.fpKind, kind);
    assert.strictEqual(t.fpBump, t, `${kind} fpBump should be the colour texture itself`);
    assert.strictEqual(t.fpRough, null, `${kind} fpRough should be null`);
    assert.strictEqual(t.fpLt, false);
    assert.strictEqual(t.fpReal, false);
    assert.strictEqual(C.texs.length - before, 1, `${kind} should push only colour texture into C.texs`);
    assert.strictEqual(C.texs[C.texs.length - 1], t);
  }
});

test('(A3) floorTexture caches by (kind, color, lt, real) in C.floorTex', () => {
  const { floorTexture } = makeFloorTexEnv();
  const C = { floorTex: {}, texs: [] };

  const t1 = floorTexture('wood', '#d6c3a5', true, C, true);
  const countAfterFirst = C.texs.length;
  const t2 = floorTexture('wood', '#d6c3a5', true, C, true);
  assert.strictEqual(t1, t2, 'identical args should return cached texture');
  assert.strictEqual(C.texs.length, countAfterFirst, 'cache hit must not push new textures');

  const tNonReal = floorTexture('wood', '#d6c3a5', true, C, false);
  assert.notStrictEqual(tNonReal, t1, 'real=false must produce a different texture than real=true');
  assert.strictEqual(tNonReal.fpReal, false);
  assert.strictEqual(t1.fpReal, true);

  const tDark = floorTexture('wood', '#d6c3a5', false, C, true);
  assert.notStrictEqual(tDark, t1, 'lt=false must produce a different texture than lt=true');
  assert.strictEqual(tDark.fpLt, false);
});

// ---------- (B) Source-shape & constant checks for issue #87 ----------

test('(B1) realLook, realEnv, realClass, and contactTex functions exist', () => {
  for (const name of ['realLook', 'realEnv', 'realClass', 'contactTex']) {
    const fn = fnSrcOf(src, name);
    assert.ok(fn.includes(`function ${name}(`), `${name}() should be defined`);
  }
});

test('(B2) realLook upgrades materials, skips T3.ground, regenerates floor textures, and restores/disposes', () => {
  const start = src.indexOf('function realLook(');
  const end = src.indexOf('function applyLive3D(');
  assert.ok(start >= 0 && end > start, 'realLook() not found');
  const body = src.slice(start, end);
  assert.match(body, /new\s+THREE\.MeshStandardMaterial\s*\(/);
  assert.match(body, /\broughness\b/);
  assert.match(body, /\bmetalness\b/);
  assert.match(body, /\bbumpMap\b/);
  assert.match(body, /\broughnessMap\b/);
  assert.match(body, /T3\.ground/);
  assert.match(body, /floorTexture\([^)]*,\s*true\s*,\s*C\s*,\s*true\s*\)/);
  assert.match(body, /cls\s*===\s*['"]room['"][\s\S]*floorTexture\(\s*['"]concrete['"]/);
  assert.match(body, /S\.environment\s*=/);
  assert.match(body, /\brestore\s*\(\s*\)/);
  assert.match(body, /\bdispose\s*\(\s*\)/);
  // restore() puts materials, lights, S.environment back and removes decals
  assert.match(body, /swaps\[i\]\.o\.material\s*=\s*swaps\[i\]\.mat/);
  assert.match(body, /s\.l\.intensity\s*=\s*s\.i/);
  assert.match(body, /s\.l\.color\.copy\(\s*s\.c\s*\)/);
  assert.match(body, /S\.environment\s*=\s*oldEnv/);
  assert.match(body, /S\.remove\(\s*d\s*\)/);
  // dispose() disposes made materials and textures
  assert.match(body, /for\s*\(\s*const\s+m\s+of\s+made\s*\)\s*m\.dispose\(\)/);
  assert.match(body, /for\s*\(\s*const\s+t\s+of\s+texs\s*\)\s*t\.dispose\(\)/);
});

test('(B3) realEnv uses PMREMGenerator, caches on T3.env, and converts sky shader with linearToOutputTexel', () => {
  const body = fnSrcOf(src, 'realEnv');
  assert.match(body, /THREE\.PMREMGenerator/);
  assert.match(body, /T3\.env\b/);
  assert.match(body, /linearToOutputTexel/);
});

test('(B4) render3DHQ applies realLook for realistic and maquette styles and cleans up in finally', () => {
  const body = fnSrcOf(src, 'render3DHQ');
  assert.match(body, /style\s*===\s*['"]realistic['"]\s*\|\|\s*style\s*===\s*['"]maquette['"]/);
  assert.match(body, /realLook\s*\(/);
  assert.match(body, /finally\s*\{[\s\S]*real\.restore\(\s*\)[\s\S]*real\.dispose\(\s*\)/);
});

test('(B5) applyLive3D applies realLook, stores it on T3.live, and restores/disposes previous', () => {
  const body = fnSrcOf(src, 'applyLive3D');
  assert.match(body, /old\s*&&\s*old\.real[\s\S]*old\.real\.restore\(\s*\)[\s\S]*old\.real\.dispose\(\s*\)/);
  assert.match(body, /real\s*=\s*realLook\s*\(/);
  assert.match(body, /T3\.live\s*=\s*\{[^}]*\breal\b/);
});

test('(B6) RENDER_STYLES includes maquette and RENDER_MOODS has day & evening with two labels each', () => {
  const { RENDER_STYLES, RENDER_MOODS } = new Function(`
    ${constLine('RENDER_STYLES')}
    ${constLine('RENDER_MOODS')}
    return { RENDER_STYLES, RENDER_MOODS };
  `)();

  assert.ok('maquette' in RENDER_STYLES, 'RENDER_STYLES should have maquette');
  assert.strictEqual(RENDER_STYLES.maquette.length, 2);

  for (const k of ['day', 'evening']) {
    assert.ok(k in RENDER_MOODS, `RENDER_MOODS should have ${k}`);
    assert.ok(Array.isArray(RENDER_MOODS[k]) && RENDER_MOODS[k].length === 2, `${k} should have 2 labels`);
    assert.strictEqual(typeof RENDER_MOODS[k][0], 'string');
    assert.strictEqual(typeof RENDER_MOODS[k][1], 'string');
  }
});

test('(B7) studioHtml renders data-rs-mood buttons and studioOpts passes mood', () => {
  const htmlFn = fnSrcOf(src, 'studioHtml');
  assert.match(htmlFn, /data-rs-mood=/);

  const optsLine = constLine('studioOpts');
  assert.match(optsLine, /\bmood\s*:/);
});

test('(B8) REAL_FLOOR defines two-number entries and tile/marble are smoother than carpet/concrete', () => {
  const REAL_FLOOR = new Function(`
    ${constLine('REAL_FLOOR')}
    return REAL_FLOOR;
  `)();

  for (const k of ['wood', 'tile', 'marble', 'carpet', 'concrete', 'stone', 'deck']) {
    assert.ok(k in REAL_FLOOR, `REAL_FLOOR missing ${k}`);
    assert.ok(Array.isArray(REAL_FLOOR[k]) && REAL_FLOOR[k].length === 2, `${k} should have 2 numbers`);
    assert.strictEqual(typeof REAL_FLOOR[k][0], 'number');
    assert.strictEqual(typeof REAL_FLOOR[k][1], 'number');
  }

  assert.ok(REAL_FLOOR.tile[0] < REAL_FLOOR.carpet[0], 'tile should be smoother than carpet');
  assert.ok(REAL_FLOOR.tile[0] < REAL_FLOOR.concrete[0], 'tile should be smoother than concrete');
  assert.ok(REAL_FLOOR.marble[0] < REAL_FLOOR.carpet[0], 'marble should be smoother than carpet');
  assert.ok(REAL_FLOOR.marble[0] < REAL_FLOOR.concrete[0], 'marble should be smoother than concrete');
});
