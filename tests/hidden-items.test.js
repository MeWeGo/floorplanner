/* Hide individual elements and Hidden Items panel (#174).
   Extracts real visFloor, pickable, normalizeProject, hideIds, unhideId, unhideAll,
   hiddenItems, hiddenPanelHtml, snap functions and tests MCP update_object support. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, constLineOf, mcpClient } = require('./helpers/repo');

const src = read('app.js');

function loadEnv(initialP) {
  let P = initialP;
  let fi = 0;
  let sel = [];
  let commits = 0, refreshes = 0, builds3d = 0;
  const factory = new Function(
    'getP', 'setP', 'getFi', 'setFi', 'getSel', 'setSel', 'hooks',
    `
    const KINDS = { walls:'wall', ops:'op', furn:'furn', rooms:'room', slabs:'slab', voids:'void', sections:'section', axes:'axis', dims:'dim', texts:'text', sketches:'sketch', drafts:'draft' };
    const KIND_TR = { wall:'Duvar', op:'Kapi', furn:'Mobilya', room:'Oda', slab:'Doseme' };
    const KIND_EN = { wall:'Wall', op:'Opening', furn:'Furniture', room:'Room', slab:'Slab' };
    const BYID = {};
    const L = (tr, en) => en;
    const isEN = () => true;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
    const uid = () => 'u_' + Math.random().toString(36).slice(2, 7);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const wLen = w => dist(w.a, w.b);
    const fmtLen = v => Math.round(v) + ' cm';
    const itemName = o => o.name || '';
    const snapToGrid = p => ({ x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 });
    const polyCentroid = pts => {
      let x = 0, y = 0; for (const p of pts) { x += p.x; y += p.y; } return { x: x / pts.length, y: y / pts.length };
    };
    const bboxOf = () => ({ x0: 0, y0: 0, x1: 100, y1: 100 });
    const underlayPts = () => [];
    const LAYER_Z_MAX = 500, FLOOR_LVL_MAX = 50000, VOID_DEP_MAX = 1000, GROUP_MAX = 40;
    const VOID_TYPES = { stair: 1 };
    const cleanGroup = g => String(g || '').trim().slice(0, GROUP_MAX);
    const cleanLw = () => {}, cleanGround = () => {}, cleanSite = () => {}, cleanQty = () => {}, cleanAcc = () => {}, cleanBel = () => {}, cleanWallFaces = () => {}, cleanWallTop = v => v;
    const cleanSurfHp = () => {}, cleanZone = () => {}, cleanParts = () => {}, cleanRoof = () => {}, cleanLight = () => {};
    let ui = { snap: true, angle: false, view3d: false };
    let view = { x: 0, y: 0, z: 1 };
    const T3 = null;
    const newFloor = name => ({ id: uid(), name: name || 'Floor', walls: [], ops: [], furn: [], rooms: [], slabs: [], voids: [], sections: [], axes: [], dims: [], texts: [], sketches: [], drafts: [] });
    ${constLineOf(src, 'defaultLayer')}
    ${constLineOf(src, 'layerById')}
    ${constLineOf(src, 'layerZ')}
    const P_ref = () => getP();
    const F = () => getP().floors[getFi()];
    const find = (id, f = F()) => {
      if (id === 'bg' && getP().bg) return { kind: 'bg', arr: null, o: getP().bg };
      for (const arr in KINDS) { const o = (f[arr] || []).find(x => x.id === id); if (o) return { kind: KINDS[arr], arr, o }; }
      return null;
    };
    const findAnyFloor = id => {
      if (id === 'bg' && getP().bg) return { kind: 'bg', arr: null, o: getP().bg, floor: F(), floorIdx: getFi() };
      for (let i = 0; i < getP().floors.length; i++) {
        const fl = getP().floors[i];
        for (const arr in KINDS) { const o = (fl[arr] || []).find(x => x.id === id); if (o) return { kind: KINDS[arr], arr, o, floor: fl, floorIdx: i }; }
      }
      return null;
    };
    const commit = () => hooks.commit();
    const refresh = () => hooks.refresh();
    const schedBuild3D = () => hooks.build3d();
    const toast = msg => hooks.toast(msg);
    ${fnSrcOf(src, 'liftLayers')}
    ${fnSrcOf(src, 'visFloor')}
    ${fnSrcOf(src, 'pickable')}
    ${fnSrcOf(src, 'objLabel')}
    ${fnSrcOf(src, 'hiddenItems')}
    ${fnSrcOf(src, 'hideIds').replace(/sel\s*=\s*/g, 'setSel(').replace(/filter\(id => !hideSet\.has\(id\)\)/g, 'filter(id => !hideSet.has(id)))')}
    ${fnSrcOf(src, 'hideSel')}
    ${fnSrcOf(src, 'unhideId').replace('sel = [id];', 'setSel([id]);')}
    ${fnSrcOf(src, 'unhideAll')}
    ${fnSrcOf(src, 'hiddenPanelHtml')}
    ${fnSrcOf(src, 'snapMids')}
    ${fnSrcOf(src, 'snapCenters')}
    ${fnSrcOf(src, 'trackRefs')}
    ${fnSrcOf(src, 'axisSnapPts')}
    ${fnSrcOf(src, 'snapPt')}
    ${fnSrcOf(src, 'wallNear')}
    ${fnSrcOf(src, 'magnet')}
    ${fnSrcOf(src, 'normalizeProject')}
    return {
      visFloor, pickable, hiddenItems, hideIds, hideSel, unhideId, unhideAll, hiddenPanelHtml,
      snapMids, snapCenters, trackRefs, snapPt, wallNear, magnet,
      normalizeProject: pr => { const r = normalizeProject(pr); setP(r); return r; }
    };
  `
  );
  let lastToast = '';
  const hooks = {
    commit: () => { commits++; },
    refresh: () => { refreshes++; },
    build3d: () => { builds3d++; },
    toast: m => { lastToast = m; },
  };
  const api = new Function('srcFn', 'getP', 'setP', 'getFi', 'setFi', 'getSel', 'setSel', 'hooks', 'return (' + factory.toString().replace('const P_ref = () => getP();', '') + ')(getP, setP, getFi, setFi, getSel, setSel, hooks);')(
    null, () => P, v => { P = v; }, () => fi, v => { fi = v; }, () => sel, v => { sel = v; }, hooks
  );
  return {
    api,
    get P() { return P; },
    get sel() { return sel; },
    set sel(v) { sel = v; },
    get commits() { return commits; },
    get refreshes() { return refreshes; },
    get lastToast() { return lastToast; },
  };
}

// Wait: let's build the sandbox cleanly without string-replace tricks on sel!
function makeSandbox(initialP) {
  const toasts = [];
  let commits = 0, refreshes = 0;
  const env = new Function('initialP', 'toasts', 'onCommit', 'onRefresh', `
    let P = initialP, fi = 0, sel = [];
    let ui = { snap: true, angle: false, view3d: false };
    let view = { x: 0, y: 0, z: 1 };
    const T3 = null;
    const KINDS = { walls:'wall', ops:'op', furn:'furn', rooms:'room', slabs:'slab', voids:'void', sections:'section', axes:'axis', dims:'dim', texts:'text', sketches:'sketch', drafts:'draft' };
    const KIND_TR = { wall:'🧱 Duvar', op:'🚪 Kapı', furn:'🛋️ Mobilya', room:'🏠 Oda', slab:'🔲 Döşeme' };
    const KIND_EN = { wall:'🧱 Wall', op:'🚪 Door', furn:'🛋️ Furniture', room:'🏠 Room', slab:'🔲 Slab' };
    const BYID = {};
    const L = (tr, en) => en;
    const isEN = () => true;
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
    const uid = () => 'u_' + Math.random().toString(36).slice(2, 7);
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const wLen = w => dist(w.a, w.b);
    const fmtLen = v => Math.round(v) + ' cm';
    const itemName = o => o.name || '';
    const segProj = (p, a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
      const q = { x: a.x + dx * t, y: a.y + dy * t };
      return { t, q, d: dist(p, q) };
    };
    const wAng = w => Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x);
    const snapToGrid = p => ({ x: Math.round(p.x / 10) * 10, y: Math.round(p.y / 10) * 10 });
    const polyCentroid = pts => { let x = 0, y = 0; for (const p of pts) { x += p.x; y += p.y; } return { x: x / pts.length, y: y / pts.length }; };
    const bboxOf = () => ({ x0: 0, y0: 0, x1: 100, y1: 100 });
    const underlayPts = () => [];
    const LAYER_Z_MAX = 500, FLOOR_LVL_MAX = 50000, VOID_DEP_MAX = 1000, GROUP_MAX = 40, SURF_HP_MAX = 64;
    const VOID_TYPES = { stair: 1 };
    const cleanGroup = g => String(g || '').trim().slice(0, GROUP_MAX);
    const cleanLw = () => {}, cleanGround = () => {}, cleanSite = () => {}, cleanQty = () => {}, cleanAcc = () => {}, cleanBel = () => {}, cleanWallFaces = () => {}, cleanWallTop = v => v;
    const cleanSurfHp = () => {}, cleanZone = () => {}, cleanParts = () => {}, cleanRoof = () => {}, cleanLight = () => {};
    const newFloor = name => ({ id: uid(), name: name || 'Floor', walls: [], ops: [], furn: [], rooms: [], slabs: [], voids: [], sections: [], axes: [], dims: [], texts: [], sketches: [], drafts: [] });
    const F = () => P.floors[fi];
    const find = (id, f = F()) => {
      if (id === 'bg' && P && P.bg) return { kind: 'bg', arr: null, o: P.bg };
      for (const arr in KINDS) { const o = (f[arr] || []).find(x => x.id === id); if (o) return { kind: KINDS[arr], arr, o }; }
      return null;
    };
    const findAnyFloor = id => {
      if (id === 'bg' && P && P.bg) return { kind: 'bg', arr: null, o: P.bg, floor: F(), floorIdx: fi };
      for (let i = 0; i < P.floors.length; i++) {
        const fl = P.floors[i];
        for (const arr in KINDS) { const o = (fl[arr] || []).find(x => x.id === id); if (o) return { kind: KINDS[arr], arr, o, floor: fl, floorIdx: i }; }
      }
      return null;
    };
    const commit = () => onCommit();
    const refresh = () => onRefresh();
    const schedBuild3D = () => {};
    const toast = m => toasts.push(m);
    ${constLineOf(src, 'defaultLayer')}
    ${constLineOf(src, 'layerById')}
    ${constLineOf(src, 'layerZ')}
    ${fnSrcOf(src, 'liftLayers')}
    ${fnSrcOf(src, 'visFloor')}
    ${fnSrcOf(src, 'pickable')}
    ${fnSrcOf(src, 'objLabel')}
    ${fnSrcOf(src, 'hiddenItems')}
    ${fnSrcOf(src, 'hideIds')}
    ${fnSrcOf(src, 'hideSel')}
    ${fnSrcOf(src, 'unhideId')}
    ${fnSrcOf(src, 'unhideAll')}
    ${fnSrcOf(src, 'hiddenPanelHtml')}
    ${fnSrcOf(src, 'snapMids')}
    ${fnSrcOf(src, 'snapCenters')}
    ${fnSrcOf(src, 'trackRefs')}
    ${fnSrcOf(src, 'axisSnapPts')}
    ${fnSrcOf(src, 'snapPt')}
    ${fnSrcOf(src, 'wallNear')}
    ${fnSrcOf(src, 'magnet')}
    ${fnSrcOf(src, 'normalizeProject')}
    return {
      get P() { return P; },
      set P(v) { P = v; },
      get fi() { return fi; },
      set fi(v) { fi = v; },
      get sel() { return sel; },
      set sel(v) { sel = v; },
      visFloor, pickable, objLabel, hiddenItems, hideIds, hideSel, unhideId, unhideAll, hiddenPanelHtml,
      snapMids, snapCenters, trackRefs, snapPt, wallNear, magnet,
      normalizeProject: pr => { P = normalizeProject(pr); return P; },
    };
  `)(initialP, toasts, () => { commits++; }, () => { refreshes++; });
  return { env, toasts, counts: () => ({ commits, refreshes }) };
}

function sampleProject() {
  return {
    v: 2,
    id: 'testproj1',
    name: 'Test',
    layers: [{ id: '0', name: 'Default', vis: true, lock: false, print: true }],
    floors: [
      {
        id: 'f0',
        name: 'Ground',
        walls: [
          { id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20, h: 270, wt: 'solid' },
          { id: 'w2', a: { x: 400, y: 0 }, b: { x: 400, y: 300 }, t: 20, h: 270, wt: 'solid' },
        ],
        ops: [{ id: 'op1', wall: 'w1', d: 200, w: 90, h: 210, sill: 0, type: 'door' }],
        furn: [{ id: 'fn1', k: 'rect', name: 'Sofa', w: 200, d: 90, h: 80, x: 100, y: 40, rot: 0 }],
        rooms: [{ id: 'rm1', name: 'Living', pts: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] }],
        slabs: [], voids: [], sections: [], axes: [], dims: [], texts: [], sketches: [], drafts: [],
      },
      {
        id: 'f1',
        name: 'Upper',
        walls: [{ id: 'w3', a: { x: 0, y: 0 }, b: { x: 300, y: 0 }, t: 20, h: 270, wt: 'solid' }],
        ops: [],
        furn: [{ id: 'fn2', k: 'rect', name: 'Bed', w: 180, d: 200, h: 50, x: 150, y: 150, rot: 0 }],
        rooms: [], slabs: [], voids: [], sections: [], axes: [], dims: [], texts: [], sketches: [], drafts: [],
      },
    ],
  };
}

test('(1) visFloor & pickable hide single items and wall-hosted openings even with a single layer', () => {
  const { env } = makeSandbox(sampleProject());
  const f = env.P.floors[0];
  assert.strictEqual(env.visFloor(f), f, 'returns exact floor ref when nothing hidden');

  f.walls[0].hidden = true;
  f.furn[0].hidden = true;
  const vf = env.visFloor(f);
  assert.deepStrictEqual(vf.walls.map(w => w.id), ['w2']);
  assert.deepStrictEqual(vf.ops, [], 'opening on hidden host wall is also hidden');
  assert.deepStrictEqual(vf.furn, [], 'hidden furniture omitted');
  assert.strictEqual(env.pickable('w1'), false);
  assert.strictEqual(env.pickable('op1'), false, 'opening on hidden host wall is not pickable');
  assert.strictEqual(env.pickable('fn1'), false);
  assert.strictEqual(env.pickable('w2'), true);
});

test('(2) hideIds, unhideId, unhideAll, hiddenItems, and hiddenPanelHtml across floors', () => {
  const { env, counts } = makeSandbox(sampleProject());
  assert.strictEqual(env.hiddenPanelHtml(false), '', 'panel hidden when nothing hidden');

  env.sel = ['w1', 'op1', 'w2', 'bg'];
  assert.strictEqual(env.hideIds(['w1', 'bg']), 1, 'hides w1 and skips bg');
  assert.deepStrictEqual(env.sel, ['w2', 'bg'], 'removes w1 and hosted op1 from sel, keeps w2 and bg');

  env.fi = 1;
  env.sel = ['fn2'];
  assert.strictEqual(env.hideSel(), 1);
  assert.deepStrictEqual(env.sel, []);

  const items = env.hiddenItems();
  assert.strictEqual(items.length, 2);
  const panel = env.hiddenPanelHtml(false);
  assert.match(panel, /data-act="unhide" data-hid="w1"/);
  assert.match(panel, /data-act="unhide" data-hid="fn2"/);
  assert.match(panel, /data-act="unhideall"/);
  assert.match(panel, /Show hidden items/);
  assert.match(env.hiddenPanelHtml(true), /<details class="hidden-items">/);

  assert.strictEqual(env.unhideId('fn2', true), true);
  assert.deepStrictEqual(env.sel, ['fn2'], 'select=true selects restored item');
  assert.strictEqual(env.unhideAll(), 1, 'restores remaining hidden w1 across floors');
  assert.strictEqual(env.hiddenItems().length, 0);
  assert.strictEqual(env.hiddenPanelHtml(false), '');
  assert.ok(counts().commits >= 4 && counts().refreshes >= 4);
});

test('(3) snapping functions skip hidden walls, rooms and dims', () => {
  const { env } = makeSandbox(sampleProject());
  const f = env.P.floors[0];
  f.walls[0].hidden = true;
  f.rooms[0].hidden = true;
  assert.deepStrictEqual(env.snapMids(f), [{ x: 400, y: 150 }], 'snapMids skips hidden w1');
  assert.deepStrictEqual(env.snapCenters(f), [], 'snapCenters skips hidden rm1');
  assert.ok(!env.trackRefs().some(p => p.x === 0 && p.y === 0), 'trackRefs skips hidden endpoints/corners');
  const s = env.snapPt({ x: 2, y: 2 });
  assert.strictEqual(s.hit, null, 'snapPt does not snap to hidden corner (0,0)');
  assert.strictEqual(env.wallNear({ x: 200, y: 5 }), null, 'wallNear ignores hidden w1 right underneath cursor');
  assert.strictEqual(env.wallNear({ x: 390, y: 5 }).w.id, 'w2', 'wallNear picks visible w2 over closer hidden w1');
  const chair = { x: 200, y: 15, d: 30, rot: 0, k: 'rect' };
  env.magnet(chair);
  assert.strictEqual(chair.y, 15, 'magnet skips hidden nearby wall w1');
});

test('(4) normalizeProject cleans o.hidden and UI wiring + MCP update_object roundtrip work', async () => {
  const { env } = makeSandbox(sampleProject());
  const p = sampleProject();
  p.floors[0].walls[0].hidden = 1;
  p.floors[0].walls[1].hidden = false;
  env.normalizeProject(p);
  assert.strictEqual(p.floors[0].walls[0].hidden, true);
  assert.strictEqual('hidden' in p.floors[0].walls[1], false);

  assert.match(fnSrcOf(src, 'renderProps'), /data-act="hide"[\s\S]*hiddenPanelHtml\(true\)/);
  assert.match(fnSrcOf(src, 'projectPanel'), /hiddenPanelHtml\(false\)/);
  assert.match(fnSrcOf(src, 'openCtxMenu'), /data-cmed="hide"/);
  assert.match(fnSrcOf(src, 'cmdList'), /'hide'[\s\S]*'unhideall'/);

  const c = mcpClient();
  try {
    await c.tool('new_project', { name: 'Hide Test' });
    const wRes = await c.tool('add_wall', { x1: 0, y1: 0, x2: 300, y2: 0 });
    const wid = wRes.text.match(/\b([a-z0-9]{7})\b/)?.[1];
    assert.ok(wid, wRes.text);
    const hRes = await c.tool('update_object', { id: wid, props: { hidden: true } });
    assert.ok(!hRes.err, hRes.text);
    let pj = JSON.parse((await c.tool('get_project')).text);
    assert.strictEqual(pj.floors[0].walls[0].hidden, true);
    const uRes = await c.tool('update_object', { id: wid, props: { hidden: false } });
    assert.ok(!uRes.err, uRes.text);
    pj = JSON.parse((await c.tool('get_project')).text);
    assert.strictEqual('hidden' in pj.floors[0].walls[0], false);
  } finally {
    c.stop();
  }
});
