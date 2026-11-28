/* Tests for #208 (history labels, cache, jump, menu, prune) and #207 (mergeAdjustable, adjSources).
   Runs the real functions cut out of app.js inside new Function sandboxes. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, constLineOf } = require('./helpers/repo');

const src = read('app.js').replace(/\r\n/g, '\n');
const fn = name => fnSrcOf(src, name);

/* ---------------- Part A: Issue #208 (History) ---------------- */

function makeHistSandbox() {
  const toasts = [];
  const restored = [];
  let autosaved = 0;
  let undoUpdated = 0;
  const histKindSrc = src.match(/const HIST_KIND = \{[\s\S]*?\};/)[0];

  // eslint-disable-next-line no-new-func
  const H = new Function('toasts', 'restored', 'hooks', `
    let lang = 'en';
    const setLang = v => { lang = v; };
    const L = (tr, en) => lang === 'tr' ? tr : en;
    const esc = s => String(s);
    const toast = m => toasts.push(m);
    const tabs = [];
    let hist = [];
    let hi = 0;
    const collab = { room: '' };
    const restore = s => restored.push(s);
    const autosave = () => { hooks.autosaved++; };
    const updateUndo = () => { hooks.undoUpdated++; };
    ${constLineOf(src, 'KINDS')}
    ${constLineOf(src, 'histNames')}
    ${histKindSrc}
    ${constLineOf(src, 'HIST_POS')}
    ${constLineOf(src, 'histCap')}
    ${fn('histNote')}
    ${fn('histPrune')}
    ${fn('histKindName')}
    ${fn('histDiffLabel')}
    ${fn('histLabel')}
    ${fn('histAgo')}
    ${fn('histJump')}
    ${fn('histMenuHtml')}
    return {
      setLang, tabs, collab, histNames, histDiffCache, KINDS,
      getHist: () => hist, setHist: v => { hist = v; },
      getHi: () => hi, setHi: v => { hi = v; },
      histNote, histPrune, histKindName, histDiffLabel, histLabel, histJump, histMenuHtml
    };
  `)(toasts, restored, {
    get autosaved() { return autosaved; },
    set autosaved(v) { autosaved = v; },
    get undoUpdated() { return undoUpdated; },
    set undoUpdated(v) { undoUpdated = v; },
  });

  return { H, toasts, restored, getCounts: () => ({ autosaved, undoUpdated }) };
}

function makeFloor(H, overrides = {}) {
  const f = { id: 'f1', name: 'Ground Floor' };
  for (const arr of Object.keys(H.KINDS)) f[arr] = [];
  return Object.assign(f, overrides);
}

function makeProj(H, floorOverrides = {}, projOverrides = {}) {
  return JSON.stringify({
    v: 2,
    name: 'My Plan',
    floors: [makeFloor(H, floorOverrides)],
    ...projOverrides,
  });
}

test('Part A (1): histDiffLabel describes diffs accurately', () => {
  const { H } = makeHistSandbox();

  const base = makeProj(H);
  assert.strictEqual(H.histDiffLabel(null, base), 'Initial state');

  const addWall = makeProj(H, {
    walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20, h: 270 }],
  });
  assert.strictEqual(H.histDiffLabel(base, addWall), 'Add wall');

  const add2Furn = makeProj(H, {
    furn: [
      { id: 'u1', x: 10, y: 10, rot: 0 },
      { id: 'u2', x: 50, y: 50, rot: 0 },
    ],
  });
  assert.strictEqual(H.histDiffLabel(base, add2Furn), 'Add 2 items');

  const withRoom = makeProj(H, {
    rooms: [{ id: 'r1', name: 'Living', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] }],
  });
  assert.strictEqual(H.histDiffLabel(withRoom, base), 'Delete room');

  const f1 = makeProj(H, { furn: [{ id: 'u1', x: 10, y: 20, rot: 0, w: 80 }] });
  const f1Moved = makeProj(H, { furn: [{ id: 'u1', x: 110, y: 120, rot: 0, w: 80 }] });
  assert.strictEqual(H.histDiffLabel(f1, f1Moved), 'Move item');

  const wallEdited = makeProj(H, {
    walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20, h: 300 }],
  });
  assert.strictEqual(H.histDiffLabel(addWall, wallEdited), 'Edit wall');

  const twoFloors = JSON.stringify({
    v: 2,
    name: 'My Plan',
    floors: [makeFloor(H), makeFloor(H, { id: 'f2', name: 'First Floor' })],
  });
  assert.strictEqual(H.histDiffLabel(base, twoFloors), 'Add floor');

  const renamed = makeProj(H, {}, { name: 'Villa' });
  assert.strictEqual(H.histDiffLabel(base, renamed), 'Rename project');

  const wallWithOp = makeProj(H, {
    walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20, h: 270, hasOp: true }],
    ops: [{ id: 'o1', wall: 'w1', d: 200, w: 90, h: 210, sill: 0, type: 'door' }],
  });
  assert.strictEqual(H.histDiffLabel(addWall, wallWithOp), 'Add opening');
});

test('Part A (2): histNote label wins and histLabel uses stored prev snapshot after 150-cap shift', () => {
  const { H } = makeHistSandbox();
  const s1 = makeProj(H);
  const s2 = makeProj(H, { walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, t: 20, h: 270 }] });
  const s3 = makeProj(H, {
    walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, t: 20, h: 270 }],
    furn: [{ id: 'u1', x: 50, y: 50, rot: 0 }],
  });

  // Simulate 150-cap shift: s1 shifted out of hist, leaving h = [s2, s3], while s2 was noted with prev s1
  H.histNote(s2, '', s1);
  const h = [s2, s3];
  assert.strictEqual(H.histLabel(0, h), 'Add wall');
  assert.strictEqual(H.histLabel(1, h), 'Add item');

  // Explicit histNote label overrides diff
  H.histNote(s3, 'Custom milestone');
  assert.strictEqual(H.histLabel(1, h), 'Custom milestone');
});

test('Part A (3): histLabel switches language when lang changes', () => {
  const { H } = makeHistSandbox();
  const s1 = makeProj(H);
  const s2 = makeProj(H, { walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, t: 20, h: 270 }] });
  const h = [s1, s2];

  assert.strictEqual(H.histLabel(1, h), 'Add wall');
  H.setLang('tr');
  assert.strictEqual(H.histLabel(1, h), 'Duvar ekle');
  H.setLang('en');
  assert.strictEqual(H.histLabel(1, h), 'Add wall');
});

test('Part A (4): histJump updates hi, restores snapshot, validates index, and blocks in collab room', () => {
  const { H, toasts, restored, getCounts } = makeHistSandbox();
  const snaps = ['s0', 's1', 's2', 's3'];
  H.setHist(snaps);
  H.setHi(3);

  assert.strictEqual(H.histJump(1), true);
  assert.strictEqual(H.getHi(), 1);
  assert.deepStrictEqual(restored, ['s1']);
  assert.deepStrictEqual(getCounts(), { autosaved: 1, undoUpdated: 1 });

  // Current index or out-of-range returns false without restoring
  assert.strictEqual(H.histJump(1), false);
  assert.strictEqual(H.histJump(-1), false);
  assert.strictEqual(H.histJump(4), false);
  assert.strictEqual(restored.length, 1);

  // Collab room blocks histJump and shows toast
  H.collab.room = 'room-abc';
  assert.strictEqual(H.histJump(2), false);
  assert.strictEqual(H.getHi(), 1);
  assert.strictEqual(toasts.length, 1);
});

test('Part A (5): histMenuHtml marks one cur + aria-current, fut after hi, newest first', () => {
  const { H } = makeHistSandbox();
  const s0 = makeProj(H);
  const s1 = makeProj(H, { walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, t: 20, h: 270 }] });
  const s2 = makeProj(H, {
    walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, t: 20, h: 270 }],
    furn: [{ id: 'u1', x: 10, y: 10, rot: 0 }],
  });
  const s3 = makeProj(H, {
    walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, t: 20, h: 270 }],
    furn: [{ id: 'u1', x: 10, y: 10, rot: 0 }, { id: 'u2', x: 20, y: 20, rot: 0 }],
  });

  H.setHist([s0, s1, s2, s3]);
  H.setHi(1);
  const html = H.histMenuHtml();

  const curMatches = html.match(/class="btn hist-row cur"/g) || [];
  const ariaMatches = html.match(/aria-current="step"/g) || [];
  assert.strictEqual(curMatches.length, 1);
  assert.strictEqual(ariaMatches.length, 1);

  const rowOrder = [...html.matchAll(/data-hist="(\d+)"/g)].map(m => Number(m[1]));
  assert.deepStrictEqual(rowOrder, [3, 2, 1, 0], 'newest first');

  const rowTags = [...html.matchAll(/<button class="([^"]+)" data-hist="(\d+)"([^>]*)>/g)];
  for (const [, cls, idxStr, rest] of rowTags) {
    const idx = Number(idxStr);
    if (idx === 1) {
      assert.ok(cls.includes('cur'));
      assert.ok(!cls.includes('fut'));
      assert.ok(rest.includes('aria-current="step"'));
    } else if (idx > 1) {
      assert.ok(cls.includes('fut'));
      assert.ok(!cls.includes('cur'));
    } else {
      assert.ok(!cls.includes('cur') && !cls.includes('fut'));
    }
  }
});

test('Part A (6): histPrune drops names/cache not in hist or any tab hist', () => {
  const { H } = makeHistSandbox();
  H.setHist(['s1', 's2']);
  H.tabs.push({ hist: ['t1'] });

  H.histNote('s1', 'Keep main');
  H.histNote('t1', 'Keep tab');
  H.histNote('dead', 'Drop me');
  H.histDiffCache.set('s2', { p: 's1', l: 'x', lang: 'en' });
  H.histDiffCache.set('dead', { p: null, l: 'y', lang: 'en' });

  H.histPrune();

  assert.strictEqual(H.histNames.has('s1'), true);
  assert.strictEqual(H.histNames.has('t1'), true);
  assert.strictEqual(H.histNames.has('dead'), false);
  assert.strictEqual(H.histDiffCache.has('s2'), true);
  assert.strictEqual(H.histDiffCache.has('dead'), false);
});

/* ---------------- Part B: Issue #207 (mergeAdjustable & adjSources) ---------------- */

function makeMergeSandbox(floor) {
  let uidCounter = 0;
  // eslint-disable-next-line no-new-func
  const M = new Function('floor', 'nextUid', `
    const P = { floors: [floor] };
    let fi = 0;
    const F = () => P.floors[fi];
    const uid = () => 'u' + (++nextUid.n);
    const L = (tr, en) => en;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const toast = () => {};
    const commit = () => {};
    const refresh = () => {};
    const ui = { view3d: false };
    const T3 = null;
    const schedBuild3D = () => {};
    const sel = [];
    const selObjs = () => [];
    const pointInPoly = () => false;
    const wallLen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const wallDeg = () => 0;
    ${constLineOf(src, 'KINDS')}
    ${constLineOf(src, 'GROUPABLE')}
    ${constLineOf(src, 'PTS_KINDS')}
    ${constLineOf(src, 'ROOM_SLAB_T')}
    ${constLineOf(src, 'grpHasVars')}
    ${fn('find')}
    ${fn('varLabel')}
    ${fn('nextVarPrefix')}
    ${fn('snapPose')}
    ${fn('clonePoses')}
    ${fn('groupMemberIds')}
    ${fn('dropPoseOrphans')}
    ${fn('pruneGroups')}
    ${fn('grpLinked')}
    ${fn('withFloor')}
    ${fn('grpAlignVars')}
    ${fn('joinGroup')}
    ${fn('groupSel')}
    ${fn('varContainer')}
    ${fn('mergeAdjustable')}
    ${fn('adjSources')}
    return { P, F, mergeAdjustable, adjSources, find, groupMemberIds, snapPose };
  `)(floor, { n: uidCounter });
  return M;
}

function emptyFloor(KINDS, overrides = {}) {
  const f = { id: 'f1', name: 'Ground', groups: [] };
  for (const arr of Object.keys(KINDS)) f[arr] = [];
  return Object.assign(f, overrides);
}

test('Part B (1): merging group A (2 furn, 2 layouts) with adjustable room R (containing furn C)', () => {
  const KINDS = { walls: 'wall', ops: 'op', furn: 'furn', rooms: 'room', slabs: 'slab', voids: 'void', zones: 'zone', sections: 'section', axes: 'axis', dims: 'dim', texts: 'text', sketches: 'sketch', drafts: 'draft' };

  const a1 = { id: 'a1', x: 100, y: 100, rot: 0, w: 60, d: 60, h: 75, grp: 'gA' };
  const a2 = { id: 'a2', x: 200, y: 100, rot: 0, w: 60, d: 60, h: 75, grp: 'gA' };
  const c1 = { id: 'c1', x: 500, y: 500, rot: 0, w: 80, d: 80, h: 75 };
  const r1 = {
    id: 'r1',
    name: 'Room R',
    color: '#e2e8f0',
    floor: 'wood',
    pts: [{ x: 400, y: 400 }, { x: 800, y: 400 }, { x: 800, y: 800 }, { x: 400, y: 800 }],
    vIdx: 0,
    vars: [
      {
        label: '2a',
        poses: {
          r1: { pts: [{ x: 400, y: 400 }, { x: 800, y: 400 }, { x: 800, y: 800 }, { x: 400, y: 800 }], hp: null, floor: 'wood', color: '#e2e8f0', glass: null, slabT: 20 },
          c1: { x: 500, y: 500, rot: 0, w: 80, d: 80, h: 75 },
        },
      },
      {
        label: '2b',
        poses: {
          r1: { pts: [{ x: 400, y: 400 }, { x: 900, y: 400 }, { x: 900, y: 800 }, { x: 400, y: 800 }], hp: null, floor: 'tile', color: '#cbd5e1', glass: null, slabT: 20 },
          c1: { x: 650, y: 550, rot: 90, w: 80, d: 80, h: 75 },
        },
      },
    ],
  };

  const gA = {
    id: 'gA',
    idx: 0,
    vars: [
      {
        label: '1a',
        poses: {
          a1: { x: 100, y: 100, rot: 0, w: 60, d: 60, h: 75 },
          a2: { x: 200, y: 100, rot: 0, w: 60, d: 60, h: 75 },
        },
      },
      {
        label: '1b',
        poses: {
          a1: { x: 140, y: 100, rot: 0, w: 60, d: 60, h: 75 },
          a2: { x: 260, y: 100, rot: 0, w: 60, d: 60, h: 75 },
        },
      },
    ],
  };

  const floor = emptyFloor(KINDS, { furn: [a1, a2, c1], rooms: [r1], groups: [gA] });
  const M = makeMergeSandbox(floor);

  const objs = [
    { kind: 'furn', o: a1 },
    { kind: 'furn', o: a2 },
    { kind: 'room', o: r1 },
  ];
  const res = M.mergeAdjustable(objs, floor);

  assert.ok(res);
  assert.strictEqual(res.rec.id, 'gA');
  assert.strictEqual(floor.groups.length, 1, 'exactly one group record');

  // Every member has grp === 'gA'
  assert.strictEqual(a1.grp, 'gA');
  assert.strictEqual(a2.grp, 'gA');
  assert.strictEqual(r1.grp, 'gA');
  assert.strictEqual(c1.grp, 'gA');

  // R.vars and R.vIdx deleted
  assert.strictEqual('vars' in r1, false);
  assert.strictEqual('vIdx' in r1, false);

  // 2 vars, each with poses for a1, a2, r1, c1
  assert.strictEqual(res.rec.vars.length, 2);
  for (const v of res.rec.vars) {
    assert.deepStrictEqual(Object.keys(v.poses).sort(), ['a1', 'a2', 'c1', 'r1']);
  }

  // Active layout 0 holds current poses
  assert.strictEqual(res.rec.vars[0].poses.a1.x, 100);
  assert.strictEqual(res.rec.vars[0].poses.a2.x, 200);
  assert.strictEqual(res.rec.vars[0].poses.c1.x, 500);
  assert.strictEqual(res.rec.vars[0].poses.r1.floor, 'wood');

  // Layout 1b keeps A members' 1b x and R/C 1b poses
  assert.strictEqual(res.rec.vars[1].poses.a1.x, 140);
  assert.strictEqual(res.rec.vars[1].poses.a2.x, 260);
  assert.strictEqual(res.rec.vars[1].poses.c1.x, 650);
  assert.strictEqual(res.rec.vars[1].poses.c1.rot, 90);
  assert.strictEqual(res.rec.vars[1].poses.r1.floor, 'tile');
  assert.strictEqual(res.rec.vars[1].poses.r1.pts[1].x, 900);
});

test('Part B (2): merging gA (2 layouts) and gB (3 layouts) merges into gB with 3 layouts', () => {
  const KINDS = { walls: 'wall', ops: 'op', furn: 'furn', rooms: 'room', slabs: 'slab', voids: 'void', zones: 'zone', sections: 'section', axes: 'axis', dims: 'dim', texts: 'text', sketches: 'sketch', drafts: 'draft' };

  const a1 = { id: 'a1', x: 50, y: 50, rot: 0, w: 40, d: 40, h: 70, grp: 'gA' };
  const b1 = { id: 'b1', x: 300, y: 300, rot: 0, w: 60, d: 60, h: 75, grp: 'gB' };

  const gA = {
    id: 'gA',
    idx: 0,
    vars: [
      { label: '1a', poses: { a1: { x: 50, y: 50, rot: 0, w: 40, d: 40, h: 70 } } },
      { label: '1b', poses: { a1: { x: 90, y: 50, rot: 0, w: 40, d: 40, h: 70 } } },
    ],
  };
  const gB = {
    id: 'gB',
    idx: 0,
    vars: [
      { label: '2a', poses: { b1: { x: 300, y: 300, rot: 0, w: 60, d: 60, h: 75 } } },
      { label: '2b', poses: { b1: { x: 340, y: 300, rot: 0, w: 60, d: 60, h: 75 } } },
      { label: '2c', poses: { b1: { x: 380, y: 300, rot: 0, w: 60, d: 60, h: 75 } } },
    ],
  };

  const floor = emptyFloor(KINDS, { furn: [a1, b1], groups: [gA, gB] });
  const M = makeMergeSandbox(floor);

  const res = M.mergeAdjustable([{ kind: 'furn', o: a1 }, { kind: 'furn', o: b1 }], floor);
  assert.strictEqual(res.rec.id, 'gB');
  assert.strictEqual(floor.groups.length, 1);
  assert.strictEqual(a1.grp, 'gB');
  assert.strictEqual(b1.grp, 'gB');
  assert.strictEqual(res.rec.vars.length, 3);

  // Layout index 2: gA member gets its current pose (x: 50), gB member keeps 2c pose (x: 380)
  assert.strictEqual(res.rec.vars[2].poses.a1.x, 50);
  assert.strictEqual(res.rec.vars[2].poses.b1.x, 380);
});

test('Part B (3): plain objects only produce one group with vars []', () => {
  const KINDS = { walls: 'wall', ops: 'op', furn: 'furn', rooms: 'room', slabs: 'slab', voids: 'void', zones: 'zone', sections: 'section', axes: 'axis', dims: 'dim', texts: 'text', sketches: 'sketch', drafts: 'draft' };

  const f1 = { id: 'f1', x: 10, y: 20, rot: 0, w: 50, d: 50, h: 75 };
  const f2 = { id: 'f2', x: 80, y: 20, rot: 0, w: 50, d: 50, h: 75 };
  const floor = emptyFloor(KINDS, { furn: [f1, f2] });
  const M = makeMergeSandbox(floor);

  const res = M.mergeAdjustable([{ kind: 'furn', o: f1 }, { kind: 'furn', o: f2 }], floor);
  assert.strictEqual(floor.groups.length, 1);
  assert.strictEqual(f1.grp, res.rec.id);
  assert.strictEqual(f2.grp, res.rec.id);
  assert.deepStrictEqual(res.rec.vars, []);
});

test('Part B (4): adjSources returns n >= 2 and hasVars true for group-with-layouts plus adjustable room', () => {
  const KINDS = { walls: 'wall', ops: 'op', furn: 'furn', rooms: 'room', slabs: 'slab', voids: 'void', zones: 'zone', sections: 'section', axes: 'axis', dims: 'dim', texts: 'text', sketches: 'sketch', drafts: 'draft' };

  const a1 = { id: 'a1', x: 10, y: 10, rot: 0, grp: 'gA' };
  const r1 = { id: 'r1', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], vars: [{ label: '1a', poses: {} }] };
  const gA = { id: 'gA', idx: 0, vars: [{ label: '2a', poses: {} }] };
  const floor = emptyFloor(KINDS, { furn: [a1], rooms: [r1], groups: [gA] });
  const M = makeMergeSandbox(floor);

  const as = M.adjSources([{ kind: 'furn', o: a1 }, { kind: 'room', o: r1 }]);
  assert.ok(as.n >= 2);
  assert.strictEqual(as.hasVars, true);
});
