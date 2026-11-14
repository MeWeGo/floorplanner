/* Detailed 3D furniture models, per-sub-part surface materials, and procedural textures (issue #93). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n');
const serverSrc = read('mcp/server.js').replace(/\r\n/g, '\n');

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

// multi-line top-level `const NAME = { ... };` or `[ ... ];`
const topBlock = (name, close) => {
  const m = src.match(new RegExp('^const ' + name + ' = ', 'm'));
  assert.ok(m, name + ' is gone from app.js');
  const end = src.indexOf(close, m.index);
  assert.ok(end >= 0, name + ' closing ' + close + ' not found');
  return src.slice(m.index, end + close.length);
};

const engineOf = text => {
  const a = text.indexOf('/* PARTS-ENGINE:BEGIN'), b = text.indexOf('/* PARTS-ENGINE:END */');
  assert.ok(a >= 0 && b > a, 'PARTS-ENGINE block missing');
  return text.slice(a, b);
};

// Sandbox for furn3D / furnModelParts / PARTS-ENGINE / CAT_DEFS
const modelApi = new Function(`
  const roof3D = () => {};
  const parts3D = () => {};
  const furnElev = () => 0;
  const stairSteps = () => ({ type: 'straight', steps: [] });
  const stairRails = () => [];
  const railStyle = () => 'bars';
  const rampType = () => 'accessible';
  const rampRailSides = () => [];

  ${lineSrc('clamp')}
  ${topBlock('CAT_DEFS', '];')}
  ${topLine('CATALOG')}
  ${topLine('BYID')}
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
  ${fnSrc('deskPCLayout')}
  ${fnSrc('deskPCPlan')}

  return {
    BYID, sf, surfOf,
    furn3D, furnModelParts, deskPCLayout, deskPCPlan,
    PART_MATS, partMatOk, cleanPart, partIssues, FURN_TEMPLATES,
  };
`)();

const {
  BYID, surfOf,
  furn3D, furnModelParts, deskPCLayout, deskPCPlan,
  PART_MATS, partMatOk, cleanPart, partIssues, FURN_TEMPLATES,
} = modelApi;

function itemFromCatalog(id, overrides) {
  const c = BYID[id];
  assert.ok(c, `catalogue item ${id} missing from CAT_DEFS`);
  return Object.assign({ type: c.id, k: c.k, w: c.w, d: c.d, h: c.h, color: c.color }, overrides);
}

function recordFurn3D(o, det) {
  const rec = [];
  const V = () => ({
    x: 0, y: 0, z: 0, order: 'XYZ',
    set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; },
    copy(v) { return this.set(v.x, v.y, v.z); },
  });
  const mk = (kind, extra) => {
    const m = Object.assign({ kind, position: V(), scale: V(), rotation: V() }, extra);
    rec.push(m);
    return m;
  };
  const g = { add() {} };
  const C = {
    det,
    box: (parent, w, h, d, color, x, y, z, ry = 0, op) => {
      const m = mk('box', { w, h, d, color, x, y, z, ry, op });
      m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.y = ry;
      return m;
    },
    cyl: (parent, r, hh, color, x, y, z, seg, op, rz) => {
      const m = mk('cyl', { r, hh, color, x, y, z, seg, op, rz });
      m.scale.set(r, hh, rz || r); m.position.set(x, y, z);
      return m;
    },
    sph: (parent, r, color, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const m = mk('sph', { r, color, x, y, z, sx, sy, sz });
      m.scale.set(r * sx, r * sy, r * sz); m.position.set(x, y, z);
      return m;
    },
  };
  furn3D(g, o, C);
  return rec;
}

// ---------- (1) Recording furn3D ----------

test('(1) furn3D mesh counts for detailed catalogue items (det=1 and det=0)', () => {
  const ids = [
    'sofa3', 'armchair', 'chair', 'ochair', 'bed2', 'bunk', 'crib',
    'deskL', 'desk', 'deskPC', 'vanity', 'counter', 'island', 'sinkK', 'stove',
    'fridge', 'dish', 'wm', 'wc', 'bidet', 'basin', 'basin2', 'tub',
    'shower', 'car', 'pool', 'fireplace', 'plant', 'tree', 'rug',
  ];
  for (const id of ids) {
    const o = itemFromCatalog(id);
    const hi = recordFurn3D(o, 1);
    const lo = recordFurn3D(o, 0);
    // rug has 3 meshes at det=1 (1 patterned rug + 2 fringes) and dish has 5 (body, door, control strip, handle, plinth)
    const minMeshes = id === 'rug' ? 3 : id === 'dish' ? 5 : 6;
    assert.ok(hi.length >= minMeshes && hi.length <= 64, `${id} det=1 produced ${hi.length} meshes (expected ${minMeshes}..64)`);
    assert.ok(lo.length <= hi.length, `${id} det=0 (${lo.length}) produced more meshes than det=1 (${hi.length})`);
  }
});

// ---------- (2) Scaling ----------

test('(2) doubling w, d, h roughly doubles recorded box bbox dimensions', () => {
  const boxBbox = rec => {
    const boxes = rec.filter(r => r.kind === 'box');
    assert.ok(boxes.length > 0, 'expected at least one recorded box');
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const b of boxes) {
      x0 = Math.min(x0, b.x - b.w / 2); x1 = Math.max(x1, b.x + b.w / 2);
      y0 = Math.min(y0, b.y - b.h / 2); y1 = Math.max(y1, b.y + b.h / 2);
      z0 = Math.min(z0, b.z - b.d / 2); z1 = Math.max(z1, b.z + b.d / 2);
    }
    return { w: x1 - x0, h: y1 - y0, d: z1 - z0 };
  };

  for (const id of ['deskL', 'bunk', 'crib', 'sinkK', 'tub', 'wc', 'car', 'pool']) {
    const o1 = itemFromCatalog(id);
    const o2 = itemFromCatalog(id, { w: o1.w * 2, d: o1.d * 2, h: o1.h * 2 });
    const b1 = boxBbox(recordFurn3D(o1, 1));
    const b2 = boxBbox(recordFurn3D(o2, 1));
    const rw = b2.w / b1.w;
    const rd = b2.d / b1.d;
    const rh = b2.h / b1.h;
    assert.ok(rw >= 1.6 && rw <= 2.4, `${id} width ratio=${rw.toFixed(3)}`);
    assert.ok(rd >= 1.6 && rd <= 2.4, `${id} depth ratio=${rd.toFixed(3)}`);
    // pool adds a fixed +4 cm coping rim above max(h, 4) (9 cm -> 14 cm, ratio ~1.556)
    const minH = id === 'pool' ? 1.5 : 1.6;
    assert.ok(rh >= minH && rh <= 2.4, `${id} height ratio=${rh.toFixed(3)}`);
  }
});

// ---------- (3) Sub-part kinds ----------

test('(3) furn3D tags sub-parts with expected sf() surface kinds', () => {
  const expected = {
    sofa3: ['fabric', 'wood'],
    bed2: ['wood', 'fabric'],
    sinkK: ['stone', 'metal', 'chrome'],
    wc: ['ceramic', 'chrome'],
    tub: ['ceramic', 'chrome'],
    car: ['paint', 'glass', 'rubber'],
    pool: ['stone', 'tile', 'water'],
    plant: ['foliage', 'ceramic'],
    tree: ['bark', 'foliage'],
    fireplace: ['stone', 'ember'],
    rug: ['rug'],
  };
  for (const [id, kinds] of Object.entries(expected)) {
    const rec = recordFurn3D(itemFromCatalog(id), 1);
    const got = new Set(rec.map(r => surfOf(r.color)).filter(Boolean).map(s => s.fk));
    for (const k of kinds) {
      assert.ok(got.has(k), `${id} missing fk="${k}" (got: ${[...got].join(', ')})`);
    }
  }
});

// ---------- (4) User colour tints ----------

test('(4) user colour tints affect fabric on sofa3 and stone worktop on counter', () => {
  const fkCols = (id, color, fk) => {
    const rec = recordFurn3D(itemFromCatalog(id, { color }), 1);
    return rec.map(r => surfOf(r.color)).filter(s => s && s.fk === fk).map(s => s.c);
  };

  const sRed = fkCols('sofa3', '#ff0000', 'fabric');
  const sBlue = fkCols('sofa3', '#0000ff', 'fabric');
  assert.ok(sRed.length > 0 && sBlue.length > 0);
  assert.notDeepStrictEqual(sRed, sBlue, 'sofa3 fabric colours should change with o.color');

  const cRed = fkCols('counter', '#ff0000', 'stone');
  const cBlue = fkCols('counter', '#0000ff', 'stone');
  assert.ok(cRed.length > 0 && cBlue.length > 0);
  assert.notDeepStrictEqual(cRed, cBlue, 'counter stone worktop colour should change with o.color');
});

// ---------- (5) furnModelParts kind -> part mat mapping ----------

test('(5) furnModelParts maps surface kinds to part mats and all parts pass partIssues', () => {
  const check = (id, reqMats) => {
    const res = furnModelParts(itemFromCatalog(id));
    assert.ok(res && res.parts.length > 0, `${id} returned no parts`);
    const box = { w: res.w, d: res.d, h: res.h };
    for (let i = 0; i < res.parts.length; i++) {
      assert.deepStrictEqual(partIssues(res.parts[i], box), [], `${id} part[${i}] failed partIssues`);
    }
    const mats = new Set(res.parts.map(p => p.mat).filter(Boolean));
    for (const m of reqMats) {
      assert.ok(mats.has(m), `${id} parts missing mat="${m}" (got: ${[...mats].join(', ')})`);
    }
  };

  check('sofa3', ['fabric', 'wood']);
  check('sinkK', ['stone', 'chrome']);
});

// ---------- (6) Engine: PART_MATS, partMatOk, cleanPart, FURN_TEMPLATES ----------

test('(6) PARTS-ENGINE material validation, sync with mcp/server.js, and template finishes', () => {
  for (const m of ['wood', 'fabric', 'leather', 'stone', 'marble', 'ceramic', 'chrome', 'plastic', 'rubber', 'foliage']) {
    assert.strictEqual(partMatOk(m), true, `partMatOk should accept ${m}`);
  }
  // project textures (#40 / #92): tex:<id> with the same id rule as P.textures
  assert.strictEqual(partMatOk('tex:abc_1'), true, 'tex:<id> must be accepted');
  assert.strictEqual(partMatOk('tex:a b'), false, 'tex ids have no spaces');
  assert.strictEqual(cleanPart({ type: 'box', w: 10, d: 10, h: 10, mat: 'tex:abc_1' }).mat, 'tex:abc_1');
  assert.strictEqual(partMatOk('velvet'), false);
  assert.strictEqual(partMatOk('tex:'), false);

  assert.strictEqual(cleanPart({ type: 'box', w: 10, d: 10, h: 10, mat: 'stone' }).mat, 'stone');
  assert.strictEqual(cleanPart({ type: 'box', w: 10, d: 10, h: 10, mat: 'velvet' }).mat, undefined);

  assert.strictEqual(engineOf(serverSrc), engineOf(src), 'PARTS-ENGINE blocks must be identical in app.js and mcp/server.js');
  const serverMats = new Function(engineOf(serverSrc) + '\nreturn PART_MATS;')();
  assert.deepStrictEqual(serverMats, PART_MATS);

  const chairParts = FURN_TEMPLATES.chair.parts(45, 45, 85);
  const chairMats = new Set(chairParts.map(p => p.mat));
  assert.ok(chairMats.has('wood') && chairMats.has('fabric'), `chair mats: ${[...chairMats].join(', ')}`);

  const sofaParts = FURN_TEMPLATES.sofa.parts(200, 90, 85);
  assert.ok(sofaParts.length > 0 && sofaParts.every(p => p.mat === 'fabric'), 'all sofa template parts should have mat=fabric');
});

// ---------- (7) surfMat caching & material types ----------

function makeSurfEnv() {
  const makeCtx = () => {
    const target = {
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    };
    return new Proxy(target, {
      get(obj, prop) {
        if (prop in obj) return (...args) => obj[prop](...args);
        return () => {};
      },
      set(obj, prop, val) { obj[prop] = val; return true; },
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

  class MatBase {
    constructor(params) {
      Object.assign(this, params || {});
      this.userData = {};
    }
  }
  class MeshLambertMaterial extends MatBase {}
  class MeshPhongMaterial extends MatBase {}
  class MeshBasicMaterial extends MatBase {}
  class CanvasTexture {
    constructor(canvas) {
      this.image = canvas;
      this.wrapS = null;
      this.wrapT = null;
      this.anisotropy = 1;
      this.encoding = null;
      this.repeat = { x: 1, y: 1, set(a, b) { this.x = a; this.y = b; } };
    }
  }

  class BoxGeometry {
    constructor() {
      // 6 faces * 4 verts = 24 verts with 0/1 UV corners
      const arr = new Float32Array(24 * 2);
      for (let f = 0; f < 6; f++) {
        const b = f * 8;
        arr[b + 0] = 0; arr[b + 1] = 1;
        arr[b + 2] = 1; arr[b + 3] = 1;
        arr[b + 4] = 0; arr[b + 5] = 0;
        arr[b + 6] = 1; arr[b + 7] = 0;
      }
      this.attributes = {
        uv: {
          count: 24,
          array: arr,
          getX: i => arr[i * 2],
          getY: i => arr[i * 2 + 1],
          setXY: (i, u, v) => { arr[i * 2] = u; arr[i * 2 + 1] = v; },
        },
      };
    }
  }
  const mkSimpleGeo = count => class {
    constructor() {
      const arr = new Float32Array(count * 2);
      this.attributes = {
        uv: {
          count,
          array: arr,
          getX: i => arr[i * 2],
          getY: i => arr[i * 2 + 1],
          setXY: (i, u, v) => { arr[i * 2] = u; arr[i * 2 + 1] = v; },
        },
      };
    }
  };

  const THREEStub = {
    MeshLambertMaterial,
    MeshPhongMaterial,
    MeshBasicMaterial,
    CanvasTexture,
    Texture: CanvasTexture,
    BoxGeometry,
    CylinderGeometry: mkSimpleGeo(100),
    SphereGeometry: mkSimpleGeo(221),
    DoubleSide: 2,
    RepeatWrapping: 1000,
    sRGBEncoding: 3001,
  };

  const fn = new Function('document', 'THREE', `
    const TEX = new Map();
    const P = { textures: [] };
    const FLOORS = {};
    ${topBlock('SURF', '};')}
    ${topLine('SURF_TILE')}
    ${topLine('sf')}
    ${topLine('surfOf')}
    ${topLine('texIdOf')}
    ${topLine('texMeta')}
    ${fnSrc('finishKind')}
    ${fnSrc('surfTile')}
    ${topLine('_surfCv')}
    ${fnSrc('surfCanvas')}
    ${fnSrc('surfTexture')}
    ${fnSrc('surfMat')}
    ${fnSrc('surfGeo')}
    ${fnSrc('partMat')}
    return {
      SURF, SURF_TILE, sf, surfOf, texIdOf, texMeta, finishKind,
      surfTile, surfCanvas, surfTexture, surfMat, surfGeo, partMat,
      THREE,
    };
  `);

  return fn(documentStub, THREEStub);
}

test('(7) surfMat caches materials, shares textures across tints, sets userData.fk, and skips textures at det=0', () => {
  const E = makeSurfEnv();
  const C = { cache: {}, texs: [], stex: {}, geo: {}, det: 1 };

  const w1 = E.surfMat('wood', '#b08968', 0, C);
  const w1Again = E.surfMat('wood', '#b08968', 0, C);
  assert.strictEqual(w1, w1Again, 'same kind+colour should return cached material');
  assert.strictEqual(w1.userData.fk, 'wood');

  const w2 = E.surfMat('wood', '#8a6a4f', 0, C);
  assert.notStrictEqual(w2, w1, 'different wood colour should return a distinct material');
  assert.strictEqual(w2.userData.fk, 'wood');
  assert.ok(C.stex.wood, 'wood texture should be cached in C.stex.wood');
  assert.strictEqual(w1.map, C.stex.wood);
  assert.strictEqual(w2.map, C.stex.wood);
  assert.strictEqual(C.texs.length, 1, 'two wood colours share one texture');

  const ch = E.surfMat('chrome', '#d6dbe1', 0, C);
  assert.ok(ch instanceof E.THREE.MeshPhongMaterial, 'chrome should be MeshPhongMaterial');
  assert.strictEqual(ch.userData.fk, 'chrome');

  const em = E.surfMat('ember', '#f97316', 0, C);
  assert.ok(em instanceof E.THREE.MeshBasicMaterial, 'ember should be MeshBasicMaterial');
  assert.strictEqual(em.userData.fk, 'ember');

  const gl = E.surfMat('glass', 0x9fd3ee, 0, C);
  assert.strictEqual(gl.transparent, true, 'glass should be transparent');
  assert.strictEqual(gl.userData.fk, 'glass');

  const C0 = { cache: {}, texs: [], stex: {}, geo: {}, det: 0 };
  const wDet0 = E.surfMat('wood', '#b08968', 0, C0);
  assert.strictEqual(wDet0.map, null, 'det=0 material must have no map');
  assert.strictEqual(C0.texs.length, 0, 'det=0 must not create textures');
});

// ---------- (8) surfGeo UV scaling & caching ----------

test('(8) surfGeo scales UVs by SURF_TILE, caches by proportions, and returns null when untextured/stretched/det=0', () => {
  const E = makeSurfEnv();
  const C = { cache: {}, texs: [], stex: {}, geo: {}, det: 1 };

  const g1 = E.surfGeo('box', 160, 40, 80, E.sf('wood', '#b08968'), C);
  assert.ok(g1, 'expected scaled BoxGeometry for wood 160x40x80');
  // +z face is face index 4 -> verts 16..19
  const uv = g1.attributes.uv;
  const us = [16, 17, 18, 19].map(i => uv.getX(i));
  const uRange = Math.max(...us) - Math.min(...us);
  assert.ok(Math.abs(uRange - 2) < 1e-6, `+z face u range should be 2 (160/80), got ${uRange}`);

  const g2 = E.surfGeo('box', 160, 40, 80, E.sf('wood', '#8a6a4f'), C);
  assert.strictEqual(g2, g1, 'identical proportions should reuse cached geometry from C.geo');

  assert.strictEqual(E.surfGeo('box', 160, 40, 80, '#b08968', C), null, 'untagged colour returns null');
  assert.strictEqual(E.surfGeo('box', 160, 40, 80, E.sf('chrome', '#d6dbe1'), C), null, 'chrome (no texture) returns null');
  assert.strictEqual(E.surfGeo('box', 160, 40, 80, E.sf('rug', '#fca5a5'), C), null, 'rug (stretched) returns null');

  const C0 = { cache: {}, texs: [], stex: {}, geo: {}, det: 0 };
  assert.strictEqual(E.surfGeo('box', 160, 40, 80, E.sf('wood', '#b08968'), C0), null, 'det=0 returns null');
});

// ---------- (9) Source guards ----------

test('(9) source guards for build3D, fs3DBuild, fs3DDispose, realLook, and doorLeaf3D', () => {
  const b3d = fnSrc('build3D');
  assert.match(b3d, /\bsctx\s*=/, 'build3D must create sctx');
  assert.match(b3d, /surfGeo\s*\(\s*['"]box['"]/, 'build3D box must call surfGeo');
  assert.match(b3d, /surfGeo\s*\(\s*['"]cyl['"]/, 'build3D cyl must call surfGeo');
  assert.match(b3d, /surfGeo\s*\(\s*['"]sphere['"]/, 'build3D sph must call surfGeo');
  assert.match(b3d, /T3\.texs\s*=\s*texs\b/, 'build3D must assign T3.texs = texs');
  assert.match(b3d, /sf\s*\(\s*['"]plastic['"]/, 'build3D window branch must tag sashes with sf("plastic", ...)');
  assert.match(b3d, /for\s*\([^)]*\[-1,\s*1\]\)\s*box\([^)]*GL/, 'build3D window branch must add double glass panes');

  const fsBuild = fnSrc('fs3DBuild');
  assert.match(fsBuild, /F3\.texs[\s\S]*dispose\s*\(\s*\)/, 'fs3DBuild must dispose F3.texs');
  const fsDispose = fnSrc('fs3DDispose');
  assert.match(fsDispose, /F3\.texs[\s\S]*dispose\s*\(\s*\)/, 'fs3DDispose must dispose F3.texs');

  // Slice realLook until applyLive3D because `opts = {}` has braces in the parameter list
  const rlStart = src.indexOf('function realLook(');
  const rlEnd = src.indexOf('function applyLive3D(');
  assert.ok(rlStart >= 0 && rlEnd > rlStart, 'realLook() body missing');
  const rl = src.slice(rlStart, rlEnd);
  assert.match(rl, /fk\s*===\s*['"]ember['"][\s\S]*return\s+m\b/, 'realLook std must return ember materials unchanged');
  assert.match(rl, /SURF\s*\[\s*fk\s*\]/, 'realLook std must read SURF[fk]');

  const dl = fnSrc('doorLeaf3D');
  assert.match(dl, /sf\s*\(\s*['"]wood['"]/, 'doorLeaf3D must use sf("wood", ...) tagging');
  assert.match(dl, /\bhinges\b/, 'doorLeaf3D must include hinges');
});

// ---------- (10) deskPC & wc ----------

test('(10) deskPC mesh count bounds (det=1 <= 40, det=0 <= 16) and stability across w/d/h', () => {
  const countsWithSide = [];
  for (const w of [140, 160, 200]) {
    for (const d of [60, 80, 100]) {
      for (const h of [70, 75, 85]) {
        const o = itemFromCatalog('deskPC', { w, d, h });
        const hi = recordFurn3D(o, 1);
        const lo = recordFurn3D(o, 0);
        assert.ok(hi.length <= 40, `deskPC ${w}x${d}x${h} det=1 produced ${hi.length} meshes (max 40)`);
        assert.ok(lo.length <= 16, `deskPC ${w}x${d}x${h} det=0 produced ${lo.length} meshes (max 16)`);
        countsWithSide.push([hi.length, lo.length]);
      }
    }
  }
  const [hi0, lo0] = countsWithSide[0];
  for (const [hi, lo] of countsWithSide) {
    assert.strictEqual(hi, hi0, 'deskPC det=1 mesh count must stay stable when w/d/h vary');
    assert.strictEqual(lo, lo0, 'deskPC det=0 mesh count must stay stable when w/d/h vary');
  }

  // Without side monitor (w < 140) also respects bounds and stays stable across d/h
  const countsNoSide = [];
  for (const d of [60, 80]) {
    for (const h of [70, 75]) {
      const o = itemFromCatalog('deskPC', { w: 120, d, h });
      const hi = recordFurn3D(o, 1);
      const lo = recordFurn3D(o, 0);
      assert.ok(hi.length <= 40, `deskPC 120x${d}x${h} det=1 produced ${hi.length} meshes (max 40)`);
      assert.ok(lo.length <= 16, `deskPC 120x${d}x${h} det=0 produced ${lo.length} meshes (max 16)`);
      countsNoSide.push([hi.length, lo.length]);
    }
  }
  for (const [hi, lo] of countsNoSide) {
    assert.strictEqual(hi, countsNoSide[0][0], 'deskPC (no side) det=1 mesh count must stay stable');
    assert.strictEqual(lo, countsNoSide[0][1], 'deskPC (no side) det=0 mesh count must stay stable');
  }
});

test('(11) deskPC uses wood, metal, plastic, fabric, ember, and glass surface kinds', () => {
  const rec = recordFurn3D(itemFromCatalog('deskPC'), 1);
  const got = new Set(rec.map(r => surfOf(r.color)).filter(Boolean).map(s => s.fk));
  for (const fk of ['wood', 'metal', 'plastic', 'fabric', 'ember', 'glass']) {
    assert.ok(got.has(fk), `deskPC missing fk="${fk}" (got: ${[...got].join(', ')})`);
  }
});

test('(12) deskPCLayout keeps tower, monitors, keyboard, and mouse inside footprint and adds side monitor only for w >= 140', () => {
  for (const w of [120, 160, 200]) {
    for (const d of [60, 80]) {
      const q = deskPCLayout({ w, d });
      assert.strictEqual(q.side, w >= 140, `w=${w} side should be ${w >= 140}`);
      const rects = [
        ['tower', q.tx - q.tw / 2, q.tz - q.td / 2, q.tw, q.td],
        ['mainMonitor', q.mx - q.mw / 2, q.mz - 1.5, q.mw, 3],
        ...(q.side ? [['sideMonitor', q.sx - 13, q.mz - 1.5, 26, 3]] : []),
        ['keyboard', q.kx - 16.5, q.kz - 5.75, 33, 11.5],
        ['mouse', q.kx + 22.7, q.kz - 4.5, 6.5, 11],
      ];
      for (const [name, rx, ry, rw, rd] of rects) {
        assert.ok(rx >= -w / 2 && rx + rw <= w / 2, `${name} x=[${rx}, ${rx + rw}] outside [-${w / 2}, ${w / 2}] for ${w}x${d}`);
        assert.ok(ry >= -d / 2 && ry + rd <= d / 2, `${name} y=[${ry}, ${ry + rd}] outside [-${d / 2}, ${d / 2}] for ${w}x${d}`);
      }
    }
  }
  assert.strictEqual(deskPCLayout({ w: 139, d: 80 }).side, false);
  assert.strictEqual(deskPCLayout({ w: 140, d: 80 }).side, true);
});

test('(13) deskPCPlan returns 5 rects with side monitor and 4 without', () => {
  const withSide = deskPCPlan({ w: 160, d: 80 });
  const atThreshold = deskPCPlan({ w: 140, d: 80 });
  const withoutSide = deskPCPlan({ w: 120, d: 80 });
  assert.strictEqual(withSide.length, 5);
  assert.strictEqual(atThreshold.length, 5);
  assert.strictEqual(withoutSide.length, 4);
  for (const r of [...withSide, ...withoutSide]) {
    assert.strictEqual(r.length, 4);
    assert.ok(r[2] > 0 && r[3] > 0, `rect ${JSON.stringify(r)} must have positive dimensions`);
  }
});

test('(14) wc (h=78) and legacy wc (h=40) reach ~76-78 cm top and bowl front reaches close to +d/2', () => {
  const meshTopY = rec => Math.max(...rec.map(r => {
    if (r.kind === 'box') return r.y + r.h / 2;
    if (r.kind === 'cyl') return r.y + r.hh / 2;
    return r.y + r.r * r.sy;
  }));
  const meshFrontZ = rec => Math.max(...rec.map(r => {
    if (r.kind === 'box') return r.z + r.d / 2;
    if (r.kind === 'cyl') return r.z + (r.rz || r.r);
    return r.z + r.r * r.sz;
  }));

  for (const h of [78, 40]) {
    for (const det of [0, 1]) {
      const o = itemFromCatalog('wc', { h });
      const rec = recordFurn3D(o, det);
      const top = meshTopY(rec);
      const front = meshFrontZ(rec);
      // det=1 adds a 0.6 cm flush button on top of the 78 cm tank (78.6 cm)
      assert.ok(top >= 76 && top <= 79, `wc h=${h} det=${det} max top=${top} (expected ~76-78.6)`);
      assert.ok(Math.abs(front - o.d / 2) <= 2, `wc h=${h} det=${det} bowl front=${front} should be close to +d/2=${o.d / 2}`);
    }
  }
});

test('(15) deskPC catalogue row in app.js matches mcp/server.js CATALOG', () => {
  const m = serverSrc.match(/^const CATALOG = \[[\s\S]*?\n\];/m);
  assert.ok(m, 'CATALOG missing from mcp/server.js');
  const serverCatalog = new Function(`${m[0]}\nreturn CATALOG;`)();
  const sRow = serverCatalog.find(c => c.id === 'deskPC');
  assert.ok(sRow, 'deskPC missing from mcp/server.js CATALOG');
  assert.deepStrictEqual(sRow, BYID.deskPC);
});
