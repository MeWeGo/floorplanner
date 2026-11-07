/* Finishes, custom textures, and door materials/colors (issues #39, #40, #41).
   Tests outdoor finishes (grass, water, gravel, deck, asphalt) in 2D and 3D (#39),
   custom floor textures with metadata in P.textures, data outside P, and JSON
   bundling/absorbing (#40), and door material options (wood, glass, paneled, metal)
   with custom leaf and frame colors in 2D and 3D (#41). */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');
const mcpSrc = read('mcp/server.js');

const fnSrc = name => {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + '() is gone from app.js');
  const lineEnd = src.indexOf('\n', start);
  const blockEnd = src.indexOf('\n}', start);
  if (src.slice(start, lineEnd).includes('}') && (blockEnd === -1 || lineEnd < blockEnd)) {
    return src.slice(start, lineEnd);
  }
  return src.slice(start, blockEnd + 2);
};

const constSrc = name => {
  const start = src.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is gone from app.js');
  return src.slice(start, src.indexOf('\n', start));
};

const mcpConst = name => {
  const start = mcpSrc.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is gone from mcp/server.js');
  return mcpSrc.slice(start, mcpSrc.indexOf('\n', start));
};

test('(1) FLOORS and FLOORS_EN both have grass water gravel deck asphalt and stone, same key set', () => {
  const { FLOORS, FLOORS_EN } = new Function(`
    ${constSrc('FLOORS')}
    ${constSrc('FLOORS_EN')}
    return { FLOORS, FLOORS_EN };
  `)();

  const required = ['grass', 'water', 'gravel', 'deck', 'asphalt', 'stone'];
  for (const k of required) {
    assert.ok(k in FLOORS, 'FLOORS missing ' + k);
    assert.ok(k in FLOORS_EN, 'FLOORS_EN missing ' + k);
    assert.strictEqual(typeof FLOORS[k], 'string');
    assert.strictEqual(typeof FLOORS_EN[k], 'string');
    assert.ok(FLOORS[k].length > 0);
    assert.ok(FLOORS_EN[k].length > 0);
  }

  assert.deepStrictEqual(Object.keys(FLOORS).sort(), Object.keys(FLOORS_EN).sort());
});

test('(2) defsSvg defines p-grass p-water p-gravel p-deck p-asphalt and calls texPatterns()', () => {
  const defs = fnSrc('defsSvg');
  assert.match(defs, /<pattern\s+id="p-grass"/);
  assert.match(defs, /<pattern\s+id="p-water"/);
  assert.match(defs, /<pattern\s+id="p-gravel"/);
  assert.match(defs, /<pattern\s+id="p-deck"/);
  assert.match(defs, /<pattern\s+id="p-asphalt"/);
  assert.match(defs, /\$\{texPatterns\(\)\}/);
});

test('(3) pal() light and dark palettes both define grass water gravel deck asphalt colours', () => {
  const { light, dark } = new Function(`
    let ui = { exporting: false };
    let isLight = () => true;
    ${fnSrc('pal')}
    return {
      light: pal(true),
      dark: (() => { isLight = () => false; return pal(false); })()
    };
  `)();

  const outdoor = ['grass', 'water', 'gravel', 'deck', 'asphalt'];
  for (const k of outdoor) {
    assert.ok(k in light, 'light palette missing ' + k);
    assert.ok(k in dark, 'dark palette missing ' + k);
    assert.match(light[k], /^#[0-9a-fA-F]{6}$/, 'light ' + k + ' colour must be #hex');
    assert.match(dark[k], /^#[0-9a-fA-F]{6}$/, 'dark ' + k + ' colour must be #hex');
  }
});

test('(4) evaluate parseTexSize via new Function (needs clamp stub) and check "60" -> 60x60, "60x30", "60 × 30", "45,5*20" -> 45.5x20, "abc" -> null', () => {
  const parseTexSize = new Function(`
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    ${fnSrc('parseTexSize')}
    return parseTexSize;
  `)();

  assert.deepStrictEqual(parseTexSize('60'), { w: 60, h: 60 });
  assert.deepStrictEqual(parseTexSize('60x30'), { w: 60, h: 30 });
  assert.deepStrictEqual(parseTexSize('60 × 30'), { w: 60, h: 30 });
  assert.deepStrictEqual(parseTexSize('45,5*20'), { w: 45.5, h: 20 });
  assert.strictEqual(parseTexSize('abc'), null);
  assert.strictEqual(parseTexSize(''), null);
  assert.strictEqual(parseTexSize(null), null);
});

test('(5) evaluate texIdOf, finishKind, finishPat with stubs (FLOORS, a P with textures, a TEX Map with ready entries) and check builtin kinds pass, unknown kind -> null, tex:<id> ready -> itself, tex with missing meta or not-ready image -> null, finishPat gives p-tex-<id> and p-grass', () => {
  const { texIdOf, finishKind, finishPat, setP, TEX } = new Function(`
    ${constSrc('FLOORS')}
    let P = { textures: [] };
    const TEX = new Map();
    ${constSrc('texIdOf')}
    ${constSrc('texMeta')}
    ${fnSrc('finishKind')}
    ${constSrc('finishPat')}
    return { texIdOf, finishKind, finishPat, setP: p => { P = p; }, TEX };
  `)();

  assert.strictEqual(texIdOf('tex:abc-123'), 'abc-123');
  assert.strictEqual(texIdOf('wood'), null);

  assert.strictEqual(finishKind('wood'), 'wood');
  assert.strictEqual(finishKind('grass'), 'grass');
  assert.strictEqual(finishKind('water'), 'water');
  assert.strictEqual(finishKind('none'), null);
  assert.strictEqual(finishKind('unknown_floor'), null);
  assert.strictEqual(finishKind(''), null);
  assert.strictEqual(finishKind(null), null);

  setP({ textures: [{ id: 't1', name: 'Ceramic', w: 60, h: 60 }] });
  TEX.set('t1', { ready: true });
  assert.strictEqual(finishKind('tex:t1'), 'tex:t1');

  TEX.set('orphan_tex', { ready: true });
  assert.strictEqual(finishKind('tex:orphan_tex'), null);

  setP({ textures: [{ id: 't2', name: 'Parquet', w: 120, h: 20 }] });
  TEX.set('t2', { ready: false });
  assert.strictEqual(finishKind('tex:t2'), null);

  setP({ textures: [{ id: 't3', name: 'Marble', w: 80, h: 80 }] });
  assert.strictEqual(finishKind('tex:t3'), null);

  assert.strictEqual(finishPat('tex:t1'), 'p-tex-t1');
  assert.strictEqual(finishPat('grass'), 'p-grass');
  assert.strictEqual(finishPat('water'), 'p-water');

  assert.match(fnSrc('roomSvg'), /finishKind\(r\.floor\)/);
  assert.match(fnSrc('roomSvg'), /finishPat\(/);
  assert.match(fnSrc('slabSvg'), /finishKind\(s\.floor\)/);
  assert.match(fnSrc('slabSvg'), /finishPat\(/);
});

test('(6) evaluate bundleTextures and absorbTextures with stubbed TEX/cacheTex/dbPut: bundle adds texData only for known textures, absorb removes texData from the object, rejects non data:image values and bad ids', () => {
  const { bundleTextures, absorbTextures, TEX, cached, puts } = new Function(`
    const TEX = new Map();
    const cached = [];
    const puts = [];
    const cacheTex = (id, data) => cached.push({ id, data });
    const dbPut = (store, val) => { puts.push({ store, val }); return Promise.resolve(); };
    ${fnSrc('bundleTextures')}
    ${fnSrc('absorbTextures')}
    return { bundleTextures, absorbTextures, TEX, cached, puts };
  `)();

  const emptyProj = { name: 'Empty', textures: [] };
  assert.deepStrictEqual(bundleTextures(emptyProj), emptyProj);

  TEX.set('tex-1', { data: 'data:image/png;base64,aaa' });
  const proj = {
    name: 'Test Project',
    textures: [{ id: 'tex-1' }, { id: 'tex-missing' }]
  };
  const bundled = bundleTextures(proj);
  assert.deepStrictEqual(bundled.texData, { 'tex-1': 'data:image/png;base64,aaa' });
  assert.strictEqual(bundled.texData['tex-missing'], undefined);

  const importObj = {
    name: 'Imported',
    texData: {
      'valid_1': 'data:image/jpeg;base64,bbb',
      'invalid id with spaces': 'data:image/png;base64,ccc',
      '': 'data:image/png;base64,ddd',
      'id_too_long_012345678901234567890123456789': 'data:image/png;base64,eee',
      'http_data': 'http://example.com/tile.png',
      'num_data': 12345,
      'null_data': null
    }
  };

  const absorbed = absorbTextures(importObj);
  assert.strictEqual(absorbed.texData, undefined);
  assert.strictEqual(importObj.texData, undefined);

  assert.deepStrictEqual(cached, [{ id: 'valid_1', data: 'data:image/jpeg;base64,bbb' }]);
  assert.deepStrictEqual(puts, [{ store: 'textures', val: { id: 'valid_1', data: 'data:image/jpeg;base64,bbb' } }]);
});

test('(7) source checks that DB_VER is 2 and onupgradeneeded creates the textures store with keyPath id, downloadJson uses bundleTextures, loadProject calls absorbTextures before normalizeProject, normalizeProject defaults P.textures', () => {
  assert.match(src, /\bDB_VER\s*=\s*2\b/);
  assert.match(src, /createObjectStore\(\s*['"]textures['"]\s*,\s*\{\s*keyPath:\s*['"]id['"]\s*\}\s*\)/);
  assert.match(fnSrc('downloadJson'), /bundleTextures/);
  assert.match(fnSrc('loadProject'), /normalizeProject\(\s*absorbTextures\(/);
  assert.match(fnSrc('loadProject'), /ensureTextures\(/);

  const norm = fnSrc('normalizeProject');
  assert.match(norm, /P\.textures\s*=\s*\(Array\.isArray\(P\.textures\)\s*\?\s*P\.textures\s*:\s*\[\]\)/);
  assert.match(norm, /\/\^\[\\w-\]\{1,32\}\$\/\.test\(t\.id\)/);
});

test('(8) source checks water: floorMat returns a transparent MeshPhongMaterial for water with depthWrite false, and build3D adds a separate water surface above an opaque waterBed for slabs, free slabs and rooms', () => {
  const fm = fnSrc('floorMat');
  assert.match(fm, /kind\s*===\s*['"]water['"]\s*\)\s*return\s*new\s*THREE\.MeshPhongMaterial\(\{[^}]*transparent:\s*true[^}]*depthWrite:\s*false/);

  assert.match(src, /const\s+waterBed\s*=\s*c\s*=>\s*mixHex\(/);

  const b3d = fnSrc('build3D');
  assert.match(b3d, /const\s+addWater\s*=\s*\(shp,\s*y,\s*wm\)\s*=>/);

  assert.match(b3d, /if\s*\(sKind\s*===\s*['"]water['"]\)\s*\{\s*slabWater\s*=\s*fm;\s*top\s*=\s*mat\(waterBed\(sc\)\);/);
  assert.match(b3d, /if\s*\(slabWater\)\s*addWater\(shp,\s*elev\s*\+\s*0\.3,\s*slabWater\);/);

  assert.match(b3d, /if\s*\(kind\s*===\s*['"]water['"]\)\s*\{\s*water\s*=\s*fm;\s*top\s*=\s*mat\(waterBed\(sc\)\);/);
  assert.match(b3d, /if\s*\(water\)\s*addWater\(shp,\s*m\.position\.y\s*\+\s*0\.25,\s*water\);/);

  assert.match(b3d, /if\s*\(kind\s*===\s*['"]water['"]\)\s*\{[\s\S]*?waterBed\(r\.color/);
});

test('(9) evaluate doorMat/doorLeafCol/isDoorOp: legacy door -> wood with #b08968, legacy slide -> glass, explicit mat respected, invalid mat falls back, custom color wins; build3D uses doorLeaf3D for hinged leaves and o.frameCol for the frame, and the old hard-coded 0xb08968 leaf box line is gone from build3D', () => {
  const { isDoorOp, doorMat, doorLeafCol, DOOR_MATS, DOOR_LEAF } = new Function(`
    ${constSrc('DOOR_MATS')}
    ${constSrc('DOOR_LEAF')}
    ${constSrc('isDoorOp')}
    ${constSrc('doorMat')}
    ${constSrc('doorLeafCol')}
    return { isDoorOp, doorMat, doorLeafCol, DOOR_MATS, DOOR_LEAF };
  `)();

  assert.strictEqual(isDoorOp({ type: 'door' }), true);
  assert.strictEqual(isDoorOp({ type: 'double' }), true);
  assert.strictEqual(isDoorOp({ type: 'slide' }), true);
  assert.strictEqual(isDoorOp({ type: 'window' }), false);
  assert.strictEqual(isDoorOp({ type: 'arch' }), false);

  assert.strictEqual(doorMat({ type: 'door' }), 'wood');
  assert.strictEqual(doorLeafCol({ type: 'door' }), '#b08968');

  assert.strictEqual(doorMat({ type: 'slide' }), 'glass');

  assert.strictEqual(doorMat({ type: 'door', mat: 'metal' }), 'metal');
  assert.strictEqual(doorMat({ type: 'door', mat: 'paneled' }), 'paneled');
  assert.strictEqual(doorMat({ type: 'door', mat: 'glass' }), 'glass');
  assert.strictEqual(doorMat({ type: 'slide', mat: 'wood' }), 'wood');

  assert.strictEqual(doorMat({ type: 'door', mat: 'unknown_mat' }), 'wood');
  assert.strictEqual(doorMat({ type: 'slide', mat: 'unknown_mat' }), 'glass');

  assert.strictEqual(doorLeafCol({ type: 'door', color: '#ff0000' }), '#ff0000');
  assert.strictEqual(doorLeafCol({ type: 'slide', mat: 'metal', color: '#123456' }), '#123456');

  const b3d = fnSrc('build3D');
  assert.match(b3d, /doorLeaf3D\(lg,\s*o,\s*lw,\s*o\.h,\s*sgn\s*\*\s*lw\s*\/\s*2,\s*0,\s*0,\s*sgn,\s*furnCtx\)/);
  assert.match(b3d, /o\.frameCol/);
  assert.ok(!b3d.includes('0xb08968'), 'old 0xb08968 leaf box line must be gone from build3D');

  assert.match(fnSrc('opSvg'), /const\s+leafLn\s*=\s*\(/);
  const rp = fnSrc('renderProps');
  assert.match(rp, /(optL|biOpts)\(DOOR_MATS\)/);
  assert.match(rp, /(optL|biOpts)\(GLASS_KINDS\)/);
  assert.match(rp, /data-act="opcolreset"/);
});

test('(10) mcp/server.js FLOORPATS includes the five outdoor finishes, finishOk accepts tex:<id> only when listed in project textures (source regex is fine), add_opening exposes material/glass/color/frameColor', () => {
  const { FLOORPATS, finishOk, setMcpP } = new Function(`
    let P = { textures: [] };
    ${mcpConst('FLOORPATS')}
    ${mcpConst('finishOk')}
    return { FLOORPATS, finishOk, setMcpP: p => { P = p; } };
  `)();

  const outdoor = ['grass', 'water', 'gravel', 'deck', 'asphalt'];
  for (const f of outdoor) {
    assert.ok(FLOORPATS.includes(f), 'FLOORPATS missing ' + f);
  }

  assert.strictEqual(finishOk('grass'), true);
  assert.strictEqual(finishOk('water'), true);
  assert.strictEqual(finishOk('unsupported_floor'), false);

  assert.strictEqual(finishOk('tex:custom-1'), false);
  setMcpP({ textures: [{ id: 'custom-1' }] });
  assert.strictEqual(finishOk('tex:custom-1'), true);
  assert.strictEqual(finishOk('tex:other'), false);

  assert.match(mcpSrc, /const\s+finishOk\s*=\s*v\s*=>\s*FLOORPATS\.includes\(v\)\s*\|\|\s*\(typeof v === 'string'\s*&&\s*\/\^tex:\/\.test\(v\)\s*&&\s*\(\(P\s*&&\s*P\.textures\)\s*\|\|\s*\[\]\)\.some\(t\s*=>\s*'tex:'\s*\+\s*t\.id\s*===\s*v\)\);/);

  const addOpStart = mcpSrc.indexOf("tool('add_opening'");
  assert.ok(addOpStart >= 0, "tool('add_opening') missing from mcp/server.js");
  const addOpBlock = mcpSrc.slice(addOpStart, mcpSrc.indexOf("tool('add_furniture'", addOpStart));
  assert.match(addOpBlock, /material:\s*\{\s*type:\s*['"]string['"],\s*enum:\s*DOOR_MATS/);
  assert.match(addOpBlock, /glass:\s*\{\s*type:\s*['"]string['"],\s*enum:\s*\[['"]clear['"],\s*['"]frosted['"]\]/);
  assert.match(addOpBlock, /color:\s*\{\s*type:\s*['"]string['"]/);
  assert.match(addOpBlock, /frameColor:\s*\{\s*type:\s*['"]string['"]/);
});
