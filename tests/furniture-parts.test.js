/* Multi-part furniture (parts schema v1): the shared engine block, its defaults and validation,
   the app wiring, and building a billiards table through the MCP server as ONE furniture item. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { ROOT, read } = require('./helpers/repo');

const appJs = read('app.js').replace(/\r\n/g, '\n');
const serverJs = read('mcp/server.js').replace(/\r\n/g, '\n');
const engineOf = src => {
  const a = src.indexOf('/* PARTS-ENGINE:BEGIN'), b = src.indexOf('/* PARTS-ENGINE:END */');
  assert.ok(a >= 0 && b > a, 'PARTS-ENGINE block missing');
  return src.slice(a, b);
};
// eslint-disable-next-line no-new-func
const E = new Function(engineOf(appJs) + '\nreturn { PARTS_V, PARTS_MAX, cleanPart, cleanParts, partIssues, partBounds, partsScale, validateParts, billiardParts };')();

test('the parts engine is identical in app.js and mcp/server.js', () => {
  assert.strictEqual(engineOf(serverJs), engineOf(appJs), 'copy the PARTS-ENGINE block from app.js to mcp/server.js');
});

test('cleanPart: lenient defaults, aliases and rounding', () => {
  assert.deepStrictEqual(E.cleanPart({}), { type: 'box', x: 0, y: 0, z: 0, w: 10, d: 10, h: 10 });
  const c = E.cleanPart({ type: 'Cylinder', x: '5', w: -12, d: 12, h: 3.14159, rot: -90, color: 'red', mat: 'matte', axis: 'x', extra: 1 });
  assert.deepStrictEqual(c, { type: 'cyl', x: 5, y: 0, z: 0, w: 12, d: 12, h: 3.14, rot: 270, axis: 'x' });
  assert.strictEqual(E.cleanPart({ type: 'warp' }).type, 'box');
  assert.strictEqual(E.cleanPart({ type: 'extrude' }).type, 'box', 'an extrude without points falls back to a box');
  const x = E.cleanPart({ type: 'prism', pts: [{ x: -10, y: -5 }, { x: 10, y: -5 }, { x: 0, y: 5 }], h: 4, mat: 'glass' });
  assert.strictEqual(x.type, 'extrude'); assert.strictEqual(x.w, 20); assert.strictEqual(x.d, 10); assert.strictEqual(x.mat, 'glass');
});

test('cleanParts leaves old items alone and fills pbase / version on new ones', () => {
  const old = { id: 'a', w: 80, d: 40, h: 70, k: 'rect' };
  assert.deepStrictEqual(E.cleanParts(Object.assign({}, old)), old, 'no parts field → byte-identical');
  const broken = E.cleanParts(Object.assign({}, old, { parts: 'nope', pbase: 1, partsV: 9 }));
  assert.ok(!('parts' in broken) && !('pbase' in broken) && !('partsV' in broken));
  const o = E.cleanParts(Object.assign({}, old, { parts: [null, { type: 'box', w: 10, d: 10, h: 10 }] }));
  assert.strictEqual(o.parts.length, 1); assert.deepStrictEqual(o.pbase, { w: 80, d: 40, h: 70 }); assert.strictEqual(o.partsV, E.PARTS_V);
  const many = E.cleanParts({ w: 10, d: 10, h: 10, parts: Array.from({ length: 100 }, () => ({})) });
  assert.strictEqual(many.parts.length, E.PARTS_MAX);
});

test('partIssues / validateParts: sizes, box, heights and floating parts', () => {
  const base = { w: 100, d: 50, h: 80 };
  assert.deepStrictEqual(E.partIssues({ type: 'box', x: 0, y: 0, z: 0, w: 10, d: 10, h: 10 }, base), []);
  assert.match(E.partIssues({ w: 0, d: 10, h: 10 }, base).join(), /w must be a number > 0/);
  assert.match(E.partIssues({ type: 'torus', w: 1, d: 1, h: 1 }, base).join(), /not one of/);
  assert.match(E.partIssues({ x: 48, w: 10, d: 10, h: 10 }, base).join(), /sticks out/);
  assert.match(E.partIssues({ z: 75, w: 10, d: 10, h: 10 }, base).join(), /above the item height/);
  assert.match(E.partIssues({ z: -5, w: 10, d: 10, h: 10 }, base).join(), /below the floor/);
  assert.match(E.partIssues({ w: 1, d: 1, h: 1, color: 'green', mat: 'chrome' }, base).join(), /color.*mat/);
  // prototype keys are not part types
  assert.match(E.partIssues({ type: 'constructor', w: 1, d: 1, h: 1 }, base).join(), /not one of/);
  assert.strictEqual(E.cleanPart({ type: 'toString' }).type, 'box');
  // round parts: rotation does not grow the footprint; an ellipse uses its rotated extents
  assert.deepStrictEqual(E.partIssues({ type: 'cyl', x: 44, w: 12, d: 12, h: 1, rot: 45 }, base), []);
  assert.match(E.partIssues({ type: 'sphere', y: 18, w: 20, d: 4, h: 1, rot: 90 }, base).join(), /sticks out/);
  // a rotated part is checked by its rotated footprint
  assert.match(E.partIssues({ w: 100, d: 10, h: 1, rot: 90 }, base).join(), /sticks out/);

  const table = { w: 100, d: 50, h: 75, parts: [
    { name: 'top', type: 'box', z: 72, w: 100, d: 50, h: 3 },
    { name: 'leg', type: 'cyl', x: -45, y: -20, z: 0, w: 4, d: 4, h: 72 },
  ] };
  assert.deepStrictEqual(E.validateParts(table), { ok: true, errors: [], warnings: [], count: 2 });
  table.parts.push({ name: 'lamp', type: 'sphere', x: 30, y: 0, z: 70, w: 10, d: 10, h: 10 });
  assert.match(E.validateParts(table).errors.join(), /part 2 "lamp".*above the item height/);
  table.parts[2] = { name: 'lamp', type: 'sphere', x: 30, y: 0, z: 40, w: 10, d: 10, h: 10 };
  assert.match(E.validateParts(table).warnings.join(), /part 2 "lamp" floats at z 40/);
});

test('partsScale follows a resize; the billiards table is a sound reference', () => {
  assert.deepStrictEqual(E.partsScale({ w: 200, d: 50, h: 40, pbase: { w: 100, d: 50, h: 80 } }), { sx: 2, sy: 1, sz: 0.5 });
  assert.deepStrictEqual(E.partsScale({ w: 10, d: 10, h: 10 }), { sx: 1, sy: 1, sz: 1 });
  const parts = E.billiardParts(280, 155, 85), o = { w: 280, d: 155, h: 85, parts };
  assert.deepStrictEqual(E.validateParts(o), { ok: true, errors: [], warnings: [], count: parts.length });
  assert.ok(parts.length >= 25 && parts.length <= 40, parts.length + ' parts');
  const by = n => parts.filter(p => p.name === n);
  assert.strictEqual(by('pocket').length, 6); assert.strictEqual(by('leg').length, 4);
  const felt = by('felt bed')[0];
  assert.ok(felt.z + felt.h >= 76 && felt.z + felt.h <= 82, 'felt at a playing height');
  for (const b of [...by('ball'), ...by('cue ball')]) assert.strictEqual(b.z, felt.z + felt.h, 'balls lie on the felt');
  for (const l of by('leg')) assert.strictEqual(l.z, 0);
  // fits a smaller 7-ft table too
  assert.ok(E.validateParts({ w: 220, d: 125, h: 82, parts: E.billiardParts(220, 125, 82) }).ok);
});

test('app wiring: defaults on load, 2D / 3D renderers, catalogue, presets, mirror', () => {
  assert.match(appJs, /for \(const o of f\.furn\) cleanParts\(o\);/, 'normalizeProject must clean parts');
  assert.match(appJs, /function furnBody\(f\) \{\n\s*if \(Array\.isArray\(f\.parts\) && f\.parts\.length\) return partsSvg\(f\);/);
  assert.match(appJs, /function furn3D\(g, o, C\) \{\n\s*if \(Array\.isArray\(o\.parts\) && o\.parts\.length\) return parts3D\(g, o, C\);/);
  assert.match(appJs, /\['billiard', 0, 'Bilardo Masası', 280, 155, 85,/);
  assert.match(appJs, /const CAT_PARTS = \{ billiard: billiardParts \};/);
  assert.match(appJs, /PRESET_FURN_EXTRA = \[[^\]]*'parts', 'pbase', 'partsV'[^\]]*\]/);
  const p3 = appJs.slice(appJs.indexOf('function parts3D'), appJs.indexOf('const CAT_PARTS'));
  assert.ok(!/new THREE\.(Box|Cylinder|Sphere)Geometry/.test(p3), 'parts3D must reuse the shared unit geometries');
  const ps = appJs.slice(appJs.indexOf('function partsSvg'), appJs.indexOf('function parts3D'));
  assert.match(ps, /pal\(\)/); assert.match(ps, /furnStroke/);
  assert.match(appJs, /if \(Array\.isArray\(m\.parts\)\) m\.parts = m\.parts\.map/, 'mirror reflects parts');
  assert.match(appJs, /pmat = \(c, kind\)/);
});

/* ---------- MCP round-trip ---------- */
function client() {
  const proc = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.js')], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let nextId = 1, buf = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', chunk => {
    buf += chunk; let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let msg; try { msg = JSON.parse(line); } catch (e) { continue; }
      if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
  });
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++, t = setTimeout(() => reject(new Error('timeout on ' + method)), 10000);
    pending.set(id, msg => { clearTimeout(t); resolve(msg); });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const tool = async (name, args) => { const r = await call('tools/call', { name, arguments: args || {} }); return { err: r.result.isError, text: r.result.content[0].text }; };
  return { call, tool, stop: () => proc.kill() };
}

test('MCP: a billiards table is built as ONE furniture item from components', async t => {
  const c = client(); t.after(() => c.stop());
  await c.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ci', version: '1' } });
  const names = (await c.call('tools/list')).result.tools.map(x => x.name);
  for (const n of ['get_furniture_schema', 'create_furniture', 'add_component', 'update_component', 'remove_component', 'set_material', 'set_transform', 'validate_furniture', 'save_furniture', 'place_furniture'])
    assert.ok(names.includes(n), 'missing tool ' + n);

  const res = (await c.call('resources/list')).result.resources.map(r => r.uri);
  assert.ok(res.includes('floorplanner://schema/furniture-parts'));
  const ex = JSON.parse((await c.call('resources/read', { uri: 'floorplanner://example/billiards-table' })).result.contents[0].text);
  assert.ok(ex.parts.length >= 25);
  assert.match((await c.tool('get_furniture_schema')).text, /bottom elevation/);

  await c.tool('new_project', { name: 'Game room' });
  const made = await c.tool('create_furniture', { name: 'Billiards table', w: 280, d: 155, h: 85, x: 300, y: 200, color: '#5b3a24' });
  assert.ok(!made.err, made.text);
  const id = made.text.match(/Created furniture (\w+)/)[1];

  // controlled API: bad parts are rejected with a reason, nothing is stored
  let r = await c.tool('add_component', { furnitureId: id, type: 'box', w: -3, d: 10, h: 10 });
  assert.ok(r.err && /w must be a number > 0/.test(r.text), r.text);
  r = await c.tool('add_component', { furnitureId: id, type: 'box', x: 200, w: 10, d: 10, h: 10 });
  assert.ok(r.err && /sticks out/.test(r.text), r.text);
  r = await c.tool('add_component', { furnitureId: id, parts: [{ w: 10, d: 10, h: 10 }, { type: 'torus', w: 1, d: 1, h: 1 }] });
  assert.ok(r.err, 'one bad part rejects the whole batch');

  // single part + batch
  r = await c.tool('add_component', { furnitureId: id, name: 'leg', type: 'box', x: -110, y: -53, z: 0, w: 14, d: 14, h: 66, color: '#3d2516' });
  assert.ok(!r.err, r.text);
  r = await c.tool('add_component', { furnitureId: id, parts: ex.parts.filter(p => p.name !== 'leg') });
  assert.ok(!r.err, r.text);
  r = await c.tool('update_component', { furnitureId: id, name: 'felt bed', props: { color: '#1d4ed8' } });
  assert.ok(!r.err, r.text);
  // studio group ids round-trip through the MCP schema (rendering ignores them)
  r = await c.tool('update_component', { furnitureId: id, name: 'leg', props: { gid: 'leg_set-1' } });
  assert.ok(!r.err && /group leg_set-1/.test(r.text), r.text);
  r = await c.tool('update_component', { furnitureId: id, name: 'leg', props: { gid: 'bad id' } });
  assert.ok(r.err && /gid must be 1-16/.test(r.text), r.text);
  r = await c.tool('update_component', { furnitureId: id, name: 'pocket', props: { z: 300 } });
  assert.ok(r.err && /6 parts are named "pocket"/.test(r.text), 'ambiguous names need index or all');
  r = await c.tool('set_material', { furnitureId: id, name: 'pocket', all: true, material: 'metal' });
  assert.ok(!r.err && /6 part/.test(r.text), r.text);
  r = await c.tool('remove_component', { furnitureId: id, name: 'cue' });
  assert.ok(!r.err, r.text);

  const v = await c.tool('validate_furniture', { furnitureId: id });
  assert.match(v.text, /✓ valid/);

  r = await c.tool('set_transform', { furnitureId: id, rot: 90, x: 320 });
  assert.ok(!r.err, r.text);
  r = await c.tool('set_transform', { furnitureId: id, w: 100 });
  assert.match(r.text, /sticks out/, 'shrinking without scaleParts reports parts outside the box');
  r = await c.tool('set_transform', { furnitureId: id, w: 280 });
  r = await c.tool('set_transform', { furnitureId: id, w: 560, scaleParts: true });
  assert.match(r.text, /scaled to the item size/);
  // a later plain resize keeps the parts at their current (scaled) size
  r = await c.tool('set_transform', { furnitureId: id, w: 600 });
  assert.match(r.text, /drawn in 300×155×85/);
  r = await c.tool('set_transform', { furnitureId: id, w: 560 });
  assert.match(r.text, /drawn in 280×155×85/);

  const saved = await c.tool('save_furniture', { furnitureId: id, name: 'My billiards' });
  assert.ok(!saved.err, saved.text);
  const placed = await c.tool('place_furniture', { name: 'My billiards', x: 800, y: 200 });
  assert.ok(!placed.err, placed.text);

  const proj = JSON.parse((await c.tool('get_project')).text), furn = proj.floors[0].furn;
  assert.strictEqual(furn.length, 2, 'one item per table, not one per part');
  const [a, b] = furn;
  const want = ex.parts.length - 4 + 1 - 1; // 4 legs swapped for 1, cue removed
  assert.strictEqual(a.parts.length, want);
  assert.strictEqual(a.parts.find(p => p.name === 'felt bed').color, '#1d4ed8');
  assert.strictEqual(a.parts.find(p => p.name === 'leg').gid, 'leg_set-1', 'a studio group id survives the MCP round-trip');
  assert.ok(a.parts.filter(p => p.name === 'pocket').every(p => p.mat === 'metal'));
  assert.strictEqual(a.rot, 90); assert.strictEqual(a.w, 560); assert.deepStrictEqual(a.pbase, { w: 280, d: 155, h: 85 });
  assert.deepStrictEqual(b.parts, a.parts); assert.strictEqual(proj.lib.presets[0].extra.parts.length, a.parts.length);
  assert.ok((await c.tool('summarize')).text.includes(want + ' parts'));

  // the billiards template and the catalogue item give the same table in one call
  const tpl = await c.tool('create_furniture', { name: 'Quick table', w: 280, d: 155, h: 85, x: 0, y: 600, template: 'billiards' });
  assert.match(tpl.text, /30 parts[\s\S]*✓ valid/);
  const cat = await c.tool('add_furniture', { catalogId: 'billiard', x: 0, y: 900 });
  assert.ok(!cat.err, cat.text);
  for (const k of ['chair', 'bookcase', 'sofa']) {
    const r2 = await c.tool('create_furniture', { name: k, w: 100, d: 60, h: 90, x: 0, y: 0, template: k });
    assert.ok(!r2.err && /✓ valid/.test(r2.text), k + ' template: ' + r2.text.slice(0, 300));
  }
  const tiny = await c.tool('create_furniture', { name: 'Tiny', w: 120, d: 60, h: 25, x: 0, y: 0, template: 'billiards' });
  assert.ok(tiny.err && /billiards template part/.test(tiny.text), 'a template that does not fit is rejected up front');

  // plain catalogue items: checking them changes nothing; editing parts needs add_component first
  const sofa = (await c.tool('add_furniture', { catalogId: 'sofa3', x: 0, y: 1200 })).text.match(/ (\w{7}) \(/)[1];
  const before = JSON.stringify(JSON.parse((await c.tool('get_project')).text).floors[0].furn.find(o => o.id === sofa));
  assert.match((await c.tool('validate_furniture', { furnitureId: sofa })).text, /no parts/);
  assert.ok((await c.tool('remove_component', { furnitureId: sofa, index: 0 })).err);
  assert.ok((await c.tool('add_component', { furnitureId: sofa, w: -1, d: 1, h: 1 })).err);
  const after = JSON.stringify(JSON.parse((await c.tool('get_project')).text).floors[0].furn.find(o => o.id === sofa));
  assert.strictEqual(after, before, 'validate / failed edits must not convert the sofa');

  // set_project keeps old items untouched and cleans parts
  const old = { id: 'old0001', type: 'custom', name: 'Frame', icon: '▭', k: 'rect', w: 290, d: 160, h: 85, color: '#4b2e1f', x: 250, y: 220, rot: 0, label: false };
  const p2 = { v: 2, name: 'x', floors: [{ id: 'f', name: 'f', furn: [old, { id: 'new0001', w: 50, d: 50, h: 50, x: 0, y: 0, rot: 0, parts: [{ type: 'ball', w: 5, d: 5, h: 5, junk: 1 }] }] }] };
  await c.tool('set_project', { project: p2 });
  const back = JSON.parse((await c.tool('get_project')).text).floors[0].furn;
  assert.deepStrictEqual(back[0], old);
  assert.deepStrictEqual(back[1].parts, [{ type: 'sphere', x: 0, y: 0, z: 0, w: 5, d: 5, h: 5 }]);
  assert.strictEqual(back[1].partsV, 1);
});
