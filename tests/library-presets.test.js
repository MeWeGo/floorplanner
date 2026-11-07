/* Library presets (issue #42).
   Runs the real presetFromObj / presetDef / presetSize / last-used-size helpers and mkOp / mkFurn
   cut out of app.js, then checks the library, undo and MCP wiring in the source. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');
const mcp = read('mcp/server.js');
const fnSrc = name => {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + '() is gone from app.js');
  const line = src.slice(start, src.indexOf('\n', start));
  if (line.split('{').length === line.split('}').length) return line; // one-line function
  return src.slice(start, src.indexOf('\n}', start) + 2);
};
const lineSrc = name => {
  const start = src.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is gone from app.js');
  return src.slice(start, src.indexOf('\n', start));
};
const openings = src.slice(src.indexOf('const OPENINGS = ['), src.indexOf('];', src.indexOf('const OPENINGS = [')) + 2);

const api = new Function(`
  let n = 0; const uid = () => 'id' + (++n);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const L = (tr, en) => en;
  const itemName = d => d.en || d.name;
  const wLen = w => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
  const BYID = { sofa3: { id: 'sofa3', icon: 'S', k: 'sofa' }, stairs: { id: 'stairs', icon: 'T', k: 'stairs' } };
  const ui = {};
  const CAT_PARTS = {}, PARTS_V = 1, cleanParts = o => o; // multi-part catalogue items (furniture-parts.test.js covers them)
  ${openings}
  ${lineSrc('OPDEF')}
  ${fnSrc('opType')}
  ${fnSrc('mkOp')}
  ${fnSrc('mkFurn')}
  ${lineSrc('PRESET_OP_EXTRA')}
  ${lineSrc('PRESET_FURN_EXTRA')}
  ${lineSrc('clonePlain')}
  ${fnSrc('presetFromObj')}
  ${fnSrc('presetDef')}
  ${fnSrc('presetSize')}
  ui.opLast = {}; ui.opSrc = {};
  const buildLib = () => {};
  ${lineSrc('opSrcOf')}
  ${fnSrc('rememberOpSize')}
  ${lineSrc('opDefLast')}
  return { OPDEF, mkOp, mkFurn, presetFromObj, presetDef, presetSize, rememberOpSize, opDefLast, ui };
`)();

const wall = { id: 'w1', a: { x: 0, y: 0 }, b: { x: 500, y: 0 } };

test('a door preset keeps its placement fields and #41 extras as deep copies', () => {
  const door = { id: 'o', wall: 'w1', d: 100, w: 85, h: 210, sill: 0, type: 'door', flip: 1, side: -1, open: 90, mat: 'glass', frameCol: '#111111', color: undefined };
  const p = api.presetFromObj('op', door, 'K1');
  assert.deepStrictEqual({ kind: p.kind, type: p.type, w: p.w, h: p.h, sill: p.sill, flip: p.flip, side: p.side }, { kind: 'op', type: 'door', w: 85, h: 210, sill: 0, flip: 1, side: -1 });
  assert.deepStrictEqual(p.extra, { mat: 'glass', frameCol: '#111111' }, 'undefined fields must not be stored');
  assert.ok(!('open' in p) && !('wall' in p) && !('d' in p), 'position / state must not leak into a preset');
});

test('a furniture preset keeps size, colour and stair fields without sharing references', () => {
  const st = { id: 'f', type: 'stairs', k: 'stairs', icon: 'T', w: 100, d: 300, h: 290, color: '#abcdef', x: 1, y: 2, rot: 90, stepN: 16, stairType: 'l', railing: 'both' };
  const p = api.presetFromObj('furn', st, 'Main stair');
  assert.deepStrictEqual([p.type, p.k, p.w, p.d, p.h, p.color], ['stairs', 'stairs', 100, 300, 290, '#abcdef']);
  assert.deepStrictEqual(p.extra, { stepN: 16, stairType: 'l', railing: 'both' });
  const shape = { type: 'shape', k: 'poly', w: 10, d: 10, h: 10, color: '#000', pts: [{ x: 1, y: 1 }] };
  const ps = api.presetFromObj('furn', shape, 'S');
  shape.pts[0].x = 99;
  assert.strictEqual(ps.extra.pts[0].x, 1, 'preset shares the source pts array');
});

test('presetDef + mkOp place exactly the saved values (any opening type)', () => {
  for (const type of ['door', 'double', 'slide', 'arch', 'window']) {
    const p = { id: 'p' + type, kind: 'op', name: 'X', type, w: 77, h: 111, sill: type === 'window' ? 110 : 0, flip: 1, extra: { mat: 'metal' } };
    const def = api.presetDef(p);
    assert.ok(api.OPDEF[def.id], type + ': def id must be a built-in opening id');
    assert.strictEqual(def.preset, p.id);
    const o = api.mkOp(def, wall, 250);
    assert.deepStrictEqual([o.type, o.w, o.h, o.sill, o.mat], [type, 77, 111, p.sill, 'metal']);
    o.mat = 'wood';
    assert.strictEqual(p.extra.mat, 'metal', 'placed object shares the preset extra');
  }
  const o = api.mkOp(api.presetDef({ id: 'q', kind: 'op', name: 'Q', type: 'door', w: 200, h: 210, sill: 0 }), wall, 20);
  assert.strictEqual(o.d, 100, 'd is still clamped onto the wall');
});

test('presetDef + mkFurn copy catalog id, size, colour and extras', () => {
  const p = { id: 'f1', kind: 'furn', name: 'Red sofa', type: 'sofa3', k: 'sofa', w: 240, d: 90, h: 80, color: '#ff0000', extra: { stepN: 3 } };
  const o = api.mkFurn(api.presetDef(p), 10, 20, 90);
  assert.deepStrictEqual([o.type, o.k, o.w, o.d, o.h, o.color, o.x, o.y, o.rot, o.stepN], ['sofa3', 'sofa', 240, 90, 80, '#ff0000', 10, 20, 90, 3]);
});

test('cards show the key sizes', () => {
  assert.strictEqual(api.presetSize({ kind: 'op', w: 85, h: 210, sill: 0 }), '85×210');
  assert.strictEqual(api.presetSize({ kind: 'op', w: 100, h: 70, sill: 110 }), '100×70 · sill 110');
  assert.strictEqual(api.presetSize({ kind: 'furn', w: 240, d: 90 }), '240×90');
});

test('the last-used opening size is remembered per built-in card', () => {
  const { ui, rememberOpSize, opDefLast, OPDEF } = api;
  rememberOpSize({ id: 'a', type: 'door', w: 80, h: 205, sill: 0 });
  assert.strictEqual(opDefLast(OPDEF.door).w, 80);
  assert.strictEqual(OPDEF.door.w, 90, 'the built-in definition itself must not change');
  rememberOpSize({ id: 'b', type: 'window', w: 70, h: 70, sill: 150 });
  assert.strictEqual(opDefLast(OPDEF.window).w, 120, 'a window of unknown origin must not be guessed from its type');
  ui.opSrc.c = 'window2';
  rememberOpSize({ id: 'c', type: 'window', w: 210, h: 150, sill: 60 });
  assert.strictEqual(opDefLast(OPDEF.window2).w, 210);
});

test('old projects load with an empty preset list; invalid presets are dropped', () => {
  const norm = fnSrc('normalizeProject');
  assert.match(norm, /P\.lib\.presets = \(Array\.isArray\(P\.lib\.presets\)/);
  const filt = norm.match(/\.filter\((p => [^\n]*?\+p\.w > 0)\)/);
  assert.ok(filt, 'preset filter not found');
  const keep = new Function('return ' + filt[1])();
  assert.ok(keep({ id: 'a', kind: 'op', w: 85 }));
  assert.ok(!keep({ id: 'b', kind: 'wall', w: 85 }));
  assert.ok(!keep({ kind: 'furn', w: 10 }));
  assert.ok(!keep(null));
  assert.match(mcp, /obj\.lib\.presets = \(Array\.isArray\(obj\.lib\.presets\)/, 'MCP normalizeProject must keep presets');
  assert.match(mcp, /lib: \{ shapes: \[\], presets: \[\] \}/, 'MCP newProject must start with presets: []');
});

test('save / place / rename / delete / undo are wired', () => {
  const props = fnSrc('renderProps');
  assert.strictEqual((props.match(/data-act="savepreset"/g) || []).length, 2, 'ops and non-shape furniture need a Save to library button');
  assert.match(src, /if \(a === 'savepreset'\) return savePresetSel\(\);/);
  const lib = fnSrc('buildLib');
  assert.match(lib, /data-type="pre"/);
  assert.match(lib, /data-renpre=/);
  assert.match(lib, /data-delpre=/);
  assert.match(src, /ps\.splice\(i, 1\);[^\n]*commit\(\)/, 'deleting a preset must commit (undoable)');
  assert.match(fnSrc('restore'), /buildLib\(\)/, 'undo must refresh the library');
  assert.match(fnSrc('loadProject'), /buildLib\(\)/);
  assert.match(fnSrc('activateTab'), /buildLib\(\)/);
  assert.match(fnSrc('placeAt'), /ui\.opSrc\[o\.id\] = placing\.def\.id/);
  assert.match(fnSrc('applyProp'), /rememberOpSize/);
  assert.match(lineSrc('LIBCATS ='), /'⬡ Kütüphanem'\]/);
  assert.match(lineSrc('LIBCATS_EN'), /'⬡ My Library'\]/);
});
