/* Custom drawing layers (issue #32).
   Cuts real functions (visFloor, pickable, stampLayers, normalizeProject) and
   consts (defaultLayer, layerById) out of app.js and runs them against synthetic
   projects/floors, plus wiring checks on app.js and index.html. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, constLineOf } = require('./helpers/repo');

const src = read('app.js');
const html = read('index.html');

const fnSrc = name => fnSrcOf(src, name);

const constLine = name => constLineOf(src, name);

const KINDS = { walls: 'wall', ops: 'op', furn: 'furn', rooms: 'room', slabs: 'slab', voids: 'void', sections: 'section', dims: 'dim', texts: 'text', sketches: 'sketch' };

function makeEnv(initialP) {
  return new Function('initialP', `
    const KINDS = { walls:'wall', ops:'op', furn:'furn', rooms:'room', slabs:'slab', voids:'void', sections:'section', dims:'dim', texts:'text', sketches:'sketch' };
    const L = (tr, en) => en;
    let uidCounter = 0;
    const uid = () => 'u' + (++uidCounter);
    const newFloor = name => {
      const fl = { id: uid(), name: name || 'Floor' };
      for (const k in KINDS) fl[k] = [];
      return fl;
    };
    const VOID_TYPES = { stair: 1 };
    const cleanParts = o => o; // parts engine (furniture-parts.test.js covers it)
    const cleanRoof = o => o, cleanLight = o => o; // parametric roofs / light fixtures (their own tests cover them)
    let P = initialP || { floors: [newFloor()] };
    const find = id => {
      const f = P && P.floors && P.floors[0];
      if (!f) return null;
      for (const arr in KINDS) {
        const o = (f[arr] || []).find(x => x.id === id);
        if (o) return { kind: KINDS[arr], arr, o };
      }
      return null;
    };
    // 3D picks objects on any floor (#82): pickable falls back to this
    const findAnyFloor = id => {
      for (const f of (P && P.floors) || []) for (const arr in KINDS) { const o = (f[arr] || []).find(x => x.id === id); if (o) return { kind: KINDS[arr], arr, o }; }
      return null;
    };
    ${constLine('defaultLayer')}
    ${constLine('layerById')}
    ${constLine('LAYER_Z_MAX')}
    ${constLine('layerZ')}
    const SURF_HP_MAX = 64;
    ${fnSrc('liftLayers')}
    ${fnSrc('visFloor')}
    ${fnSrc('pickable')}
    ${fnSrc('stampLayers')}
    ${fnSrc('cleanAcc')}
    ${fnSrc('cleanBel')}
    const cleanWallFaces = () => {}; // wall faces: wall-faces.test.js
    const cleanLw = () => {}, cleanGround = () => {}, cleanSite = () => {}, cleanQty = () => {}; // line weights / ground: their own tests
    ${fnSrc('normalizeProject')}
    return {
      get P() { return P; },
      set P(val) { P = val; },
      normalizeProject: proj => { P = normalizeProject(proj); return P; },
      stampLayers,
      visFloor,
      liftLayers,
      pickable,
      defaultLayer,
      layerById,
      newFloor,
      find
    };
  `)(initialP);
}

test('(1) normalizeProject on an old project without layers adds exactly one Default layer with id 0, sets activeLayer 0, and does not add a layer field to any object', () => {
  const env = makeEnv();
  const oldProj = {
    v: 2,
    name: 'Old',
    grid: 10,
    gridType: 'square',
    wallT: 20,
    wallH: 270,
    lib: { shapes: [] },
    floors: [{
      id: 'f1',
      name: 'Floor 1',
      slabFloor: 'none',
      slabColor: null,
      walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, t: 20, wt: 'solid' }],
      ops: [{ id: 'op1', wall: 'w1', d: 50, open: 0 }],
      furn: [{ id: 'fu1', x: 10, y: 10, w: 50, d: 50 }],
      rooms: [], slabs: [], voids: [], sections: [], dims: [], texts: [], sketches: [], groups: []
    }]
  };
  const floorsBefore = JSON.stringify(oldProj.floors);
  const p = env.normalizeProject(oldProj);

  assert.strictEqual(p.layers.length, 1);
  assert.strictEqual(p.layers[0].id, '0');
  assert.strictEqual(p.layers[0].name, 'Default');
  assert.strictEqual(p.activeLayer, '0');
  assert.strictEqual(JSON.stringify(p.floors), floorsBefore);
  for (const f of p.floors) {
    for (const k in KINDS) {
      for (const o of f[k]) {
        assert.strictEqual('layer' in o, false, `object ${o.id} in ${k} should not have a layer property`);
      }
    }
  }
});

test('(2) with two layers it stamps objects lacking a valid layer with 0 and keeps valid ones, and an unknown activeLayer falls back to 0', () => {
  const env = makeEnv();
  const proj = {
    activeLayer: 'unknown_layer_id',
    layers: [
      { id: '0', name: 'Default', vis: true, lock: false, print: true },
      { id: 'L1', name: 'Layer 1', vis: true, lock: false, print: true }
    ],
    floors: [{
      id: 'f1',
      name: 'Floor 1',
      walls: [
        { id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 } },
        { id: 'w2', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, layer: 'non_existent' },
        { id: 'w3', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, layer: 'L1' }
      ],
      ops: [], furn: [], rooms: [], slabs: [], voids: [], sections: [], dims: [], texts: [], sketches: []
    }]
  };
  const p = env.normalizeProject(proj);

  assert.strictEqual(p.activeLayer, '0');
  assert.strictEqual(p.floors[0].walls[0].layer, '0');
  assert.strictEqual(p.floors[0].walls[1].layer, '0');
  assert.strictEqual(p.floors[0].walls[2].layer, 'L1');
});

test('(3) stampLayers(): with active 0 leaves new objects without a field; with active L1 stamps only objects lacking a layer; stampLayers(true) stamps missing ones with 0', () => {
  const env = makeEnv();

  // (3a) With active '0' leaves new objects without a layer field
  env.P = {
    activeLayer: '0',
    layers: [{ id: '0', name: 'Default' }, { id: 'L1', name: 'Layer 1' }],
    floors: [{
      walls: [{ id: 'w1' }],
      ops: [], furn: [], rooms: [], slabs: [], voids: [], sections: [], dims: [], texts: [], sketches: []
    }]
  };
  env.stampLayers();
  assert.strictEqual('layer' in env.P.floors[0].walls[0], false);

  // (3b) With active 'L1' stamps only objects lacking a layer
  env.P = {
    activeLayer: 'L1',
    layers: [{ id: '0', name: 'Default' }, { id: 'L1', name: 'Layer 1' }, { id: 'L2', name: 'Layer 2' }],
    floors: [{
      walls: [
        { id: 'w1' },
        { id: 'w2', layer: 'L2' }
      ],
      ops: [], furn: [], rooms: [], slabs: [], voids: [], sections: [], dims: [], texts: [], sketches: []
    }]
  };
  env.stampLayers();
  assert.strictEqual(env.P.floors[0].walls[0].layer, 'L1');
  assert.strictEqual(env.P.floors[0].walls[1].layer, 'L2');

  // (3c) stampLayers(true) stamps missing ones with '0'
  env.P = {
    activeLayer: 'L1',
    layers: [{ id: '0', name: 'Default' }, { id: 'L1', name: 'Layer 1' }],
    floors: [{
      walls: [
        { id: 'w1' },
        { id: 'w2', layer: 'L1' }
      ],
      ops: [], furn: [], rooms: [], slabs: [], voids: [], sections: [], dims: [], texts: [], sketches: []
    }]
  };
  env.stampLayers(true);
  assert.strictEqual(env.P.floors[0].walls[0].layer, '0');
  assert.strictEqual(env.P.floors[0].walls[1].layer, 'L1');
});

test('(4) visFloor hides objects of an invisible layer, drops openings whose wall is hidden, returns the same floor object when everything is visible, and with print=true also hides layers with print false', () => {
  const env = makeEnv();
  const f = {
    id: 'f1',
    walls: [
      { id: 'w1', layer: '0' },
      { id: 'w2', layer: 'hidden_layer' },
      { id: 'w3', layer: 'noprint_layer' }
    ],
    ops: [
      { id: 'op1', wall: 'w1', layer: '0' },
      { id: 'op2', wall: 'w2', layer: '0' },
      { id: 'op3', wall: 'w3', layer: '0' }
    ],
    furn: [
      { id: 'fu1', layer: '0' },
      { id: 'fu2', layer: 'hidden_layer' },
      { id: 'fu3', layer: 'noprint_layer' }
    ],
    rooms: [], slabs: [], voids: [], sections: [], dims: [], texts: [], sketches: []
  };

  // Everything visible: returns the exact same floor reference
  env.P = {
    layers: [
      { id: '0', vis: true, print: true },
      { id: 'other', vis: true, print: true }
    ],
    floors: [f]
  };
  assert.strictEqual(env.visFloor(f), f);

  // Invisible layer hides its objects, and drops openings whose wall is hidden
  env.P = {
    layers: [
      { id: '0', vis: true, print: true },
      { id: 'hidden_layer', vis: false, print: true },
      { id: 'noprint_layer', vis: true, print: false }
    ],
    floors: [f]
  };
  const filtered = env.visFloor(f, false);
  assert.notStrictEqual(filtered, f);
  assert.deepStrictEqual(filtered.walls.map(w => w.id), ['w1', 'w3']);
  assert.deepStrictEqual(filtered.ops.map(o => o.id), ['op1', 'op3']);
  assert.deepStrictEqual(filtered.furn.map(fu => fu.id), ['fu1', 'fu3']);

  // print=true also hides layers with print false
  const printFiltered = env.visFloor(f, true);
  assert.deepStrictEqual(printFiltered.walls.map(w => w.id), ['w1']);
  assert.deepStrictEqual(printFiltered.ops.map(o => o.id), ['op1']);
  assert.deepStrictEqual(printFiltered.furn.map(fu => fu.id), ['fu1']);
});

test('(5) pickable is false for objects on hidden or locked layers, true otherwise and for unknown ids', () => {
  const env = makeEnv();
  const f = {
    id: 'f1',
    walls: [
      { id: 'w_vis', layer: 'l_vis' },
      { id: 'w_hidden', layer: 'l_hidden' },
      { id: 'w_locked', layer: 'l_locked' },
      { id: 'w_default', layer: '0' },
      { id: 'w_nolayer' },
      { id: 'w_unknown_layer', layer: 'l_unknown' }
    ],
    ops: [], furn: [], rooms: [], slabs: [], voids: [], sections: [], dims: [], texts: [], sketches: []
  };
  env.P = {
    layers: [
      { id: '0', vis: true, lock: false },
      { id: 'l_vis', vis: true, lock: false },
      { id: 'l_hidden', vis: false, lock: false },
      { id: 'l_locked', vis: true, lock: true }
    ],
    floors: [f]
  };

  assert.strictEqual(env.pickable('unknown_id'), true);
  assert.strictEqual(env.pickable('w_unknown_layer'), true);
  assert.strictEqual(env.pickable('w_vis'), true);
  assert.strictEqual(env.pickable('w_default'), true);
  assert.strictEqual(env.pickable('w_nolayer'), true);
  assert.strictEqual(env.pickable('w_hidden'), false);
  assert.strictEqual(env.pickable('w_locked'), false);
});

test('(6) wiring asserts on app.js source and index.html', () => {
  // commit() calls stampLayers()
  assert.match(fnSrc('commit'), /stampLayers\(\)/);

  // layerStrings starts with f = visFloor(f,
  assert.match(fnSrc('layerStrings'), /f\s*=\s*visFloor\(f,/);

  // build3D's floor loop calls f = visFloor(f, false, true) (hidden layers out, layer heights applied)
  assert.match(fnSrc('build3D'), /f\s*=\s*visFloor\(f,\s*false,\s*true\)/);

  // archPrims calls visFloor(f, true, true)
  assert.match(fnSrc('archPrims'), /visFloor\(f,\s*true,\s*true\)/);

  // pickDataId and idsAt and the box-select loop use pickable
  assert.match(fnSrc('pickDataId'), /pickable\(/);
  assert.match(fnSrc('idsAt'), /pickable\(/);
  assert.match(src, /if\s*\(!pickable\(o\.id\)\)\s*continue;/);

  // deleteSel filters with pickable
  assert.match(fnSrc('deleteSel'), /sel\.filter\(pickable\)/);

  // Ctrl+A uses pickable
  assert.match(src, /k === 'a'[\s\S]*?pickable\(o\.id\)/);

  // projectPanel calls layersPanelHtml()
  assert.match(fnSrc('projectPanel'), /layersPanelHtml\(\)/);

  // renderProps acts() includes selLayerHtml(os)
  assert.match(fnSrc('renderProps'), /selLayerHtml\(os\)/);

  // applyProp handles k === 'lyr' and k === 'sellayer'
  const applyPropSrc = fnSrc('applyProp');
  assert.match(applyPropSrc, /k === 'lyr'/);
  assert.match(applyPropSrc, /k === 'sellayer'/);

  // index.html has a select with id sLayer
  assert.match(html, /<select[^>]*id="sLayer"/);
});

test('(7) layer height: liftLayers raises walls, items, free slabs and rooms of a lifted layer as copies; originals and 2D stay put', () => {
  const env = makeEnv();
  const f = env.newFloor();
  f.walls.push({ id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, t: 20, h: 270, layer: 'up' }, { id: 'w2', a: { x: 0, y: 0 }, b: { x: 0, y: 100 }, t: 20, h: 270 });
  f.furn.push({ id: 'f1', x: 50, y: 50, w: 50, d: 50, h: 80, elev: 20, layer: 'up' });
  f.slabs.push({ id: 's1', pts: [], t: 20, off: -10, layer: 'up' });
  f.rooms.push({ id: 'r1', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], hp: [{ x: 100, y: 0, z: 30 }], layer: 'up' });
  env.P = { floors: [f], layers: [{ id: '0', name: 'D', vis: true }, { id: 'up', name: 'Up', vis: true, z: 150 }] };
  assert.strictEqual(env.visFloor(f), f, 'no lift without the flag (2D)');
  const g = env.visFloor(f, false, true);
  assert.strictEqual(g.walls[0].elev, 150); assert.strictEqual(g.walls[1], f.walls[1]);
  assert.strictEqual(g.furn[0].elev, 170); assert.strictEqual(g.slabs[0].off, 140);
  assert.deepStrictEqual(g.rooms[0].hp.map(q => q.z).sort((a, b) => a - b), [150, 150, 180]);
  assert.strictEqual(f.walls[0].elev, undefined); assert.strictEqual(f.furn[0].elev, 20); assert.strictEqual(f.rooms[0].hp.length, 1);
  env.P.layers[1].z = 9999; assert.strictEqual(env.liftLayers(f).walls[0].elev, 500, 'clamped');
  env.P.layers[1].vis = false; assert.ok(!env.visFloor(f, false, true).walls.some(w => w.id === 'w1'), 'hidden layer still hidden');
});

test('(8) layer height: panel field, normalize clamps / drops it, 3D / sections / walk / export apply it', () => {
  assert.match(fnSrc('layersPanelHtml'), /data-p="z"/);
  assert.match(fnSrc('applyProp'), /p === 'z'[\s\S]{0,200}LAYER_Z_MAX/);
  const env = makeEnv();
  const p = env.normalizeProject({ floors: [env.newFloor()], layers: [{ id: '0', name: 'D', vis: true, z: 0 }, { id: 'a', name: 'A', vis: true, z: '-777.4' }] });
  assert.ok(!('z' in p.layers[0])); assert.strictEqual(p.layers[1].z, -500);
  assert.match(fnSrc('walkSegsAt'), /visFloor\(f, false, true\)/);
  assert.match(fnSrc('revitExport'), /visFloor\(f0, false, true\)/);
});
