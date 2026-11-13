/* Procedural floor texture generator (TEXGEN), app wiring, and MCP texture tools. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { ROOT, read, fnSrcOf } = require('./helpers/repo');

const appJs = read('app.js').replace(/\r\n/g, '\n');
const serverJs = read('mcp/server.js').replace(/\r\n/g, '\n');

const texgenOf = src => {
  const a = src.indexOf('/* TEXGEN:BEGIN'), b = src.indexOf('/* TEXGEN:END */');
  assert.ok(a >= 0 && b > a, 'TEXGEN block missing');
  return src.slice(a, b);
};

// eslint-disable-next-line no-new-func
const T = new Function(texgenOf(appJs) + '\nreturn { texGenClean, texGen, texGenUrl, texgenRng, texgenMix, texgenShade, TEXGEN_PATTERNS, TEXGEN_DEF };')();

test('(a) TEXGEN block is byte-identical in app.js and mcp/server.js', () => {
  assert.strictEqual(texgenOf(serverJs), texgenOf(appJs), 'copy the TEXGEN block from app.js to mcp/server.js');
});

test('(b) TEXGEN block: patterns, determinism, clamping, hex height, and data URL', () => {
  for (const pattern of Object.keys(T.TEXGEN_PATTERNS)) {
    const g = T.texGen({ pattern });
    assert.ok(g.svg.startsWith('<svg'), `${pattern}: svg must start with <svg`);
    assert.ok(!/NaN|undefined/.test(g.svg), `${pattern}: svg contains NaN or undefined`);
    assert.ok(g.w > 0 && g.h > 0, `${pattern}: w and h must be positive`);
    assert.match(g.svg, new RegExp(`viewBox="0 0 ${g.w} ${g.h}"`), `${pattern}: viewBox must match w and h`);
  }

  const a1 = T.texGen({ pattern: 'tile', seed: 42 });
  const a2 = T.texGen({ pattern: 'tile', seed: 42 });
  const b1 = T.texGen({ pattern: 'tile', seed: 43 });
  assert.strictEqual(a1.svg, a2.svg, 'same seed produces identical svg');
  assert.notStrictEqual(a1.svg, b1.svg, 'different seed produces different svg for tile');

  assert.strictEqual(T.texGenClean({ pattern: 'tile', w: 0 }).w, 1);
  assert.strictEqual(T.texGenClean({ pattern: 'tile', w: 9999 }).w, 500);
  assert.strictEqual(T.texGenClean({ pattern: 'nonexistent' }).pattern, 'tile');
  assert.strictEqual(T.texGenClean({ pattern: 'brick', color: 'notacolor' }).color, T.TEXGEN_DEF.brick.color);
  assert.strictEqual(T.texGenClean({ pattern: 'tile', color: '#ABC' }).color, '#aabbcc');
  assert.strictEqual(T.texGenClean({ pattern: 'tile', w: 30, h: 12, joint: 100 }).joint, 4);

  const hex = T.texGen({ pattern: 'hex', w: 20 });
  assert.ok(Math.abs(hex.h - Math.sqrt(3) * 20) < 0.01, `expected hex height ≈ ${Math.sqrt(3) * 20}, got ${hex.h}`);

  const url = T.texGenUrl(a1.svg);
  assert.ok(url.startsWith('data:image/svg+xml'), 'texGenUrl must start with data:image/svg+xml');
  const comma = url.indexOf(',');
  assert.strictEqual(decodeURIComponent(url.slice(comma + 1)), a1.svg, 'decoded URL payload must equal svg');
});

test('(c) app.js source wiring: texadd, cmdList texture, dataUrlBlob non-base64, absorbTextures svg+xml', () => {
  assert.match(appJs, /data-act="texadd"/);
  assert.match(appJs, /if\s*\(\s*a\s*===\s*'texadd'\s*\)\s*return\s+openTexDialog\(\)/);

  const cmdList = fnSrcOf(appJs, 'cmdList');
  assert.match(cmdList, /act\(\s*'texture'[^;]*openTexDialog\(\)/);

  const dub = fnSrcOf(appJs, 'dataUrlBlob');
  assert.match(dub, /!\/;base64\/i\.test\(/);
  assert.match(dub, /decodeURIComponent\(/);

  // Evaluate dataUrlBlob with a stubbed Blob to verify non-base64 SVG data URLs work
  const dataUrlBlob = new Function(`
    class Blob { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } }
    ${dub}
    return dataUrlBlob;
  `)();
  const svg = T.texGen({ pattern: 'tile' }).svg;
  const blob = dataUrlBlob(T.texGenUrl(svg));
  assert.strictEqual(blob.type, 'image/svg+xml');
  assert.strictEqual(blob.parts[0], svg);

  // Evaluate absorbTextures with stubbed TEX/cacheTex/dbPut to verify data:image/svg+xml is accepted
  const { absorbTextures, cached, puts } = new Function(`
    const cached = [];
    const puts = [];
    const cacheTex = (id, data) => cached.push({ id, data });
    const dbPut = (store, val) => { puts.push({ store, val }); return Promise.resolve(); };
    ${fnSrcOf(appJs, 'absorbTextures')}
    return { absorbTextures, cached, puts };
  `)();
  const svgUrl = T.texGenUrl(T.texGen({ pattern: 'tile' }).svg);
  const obj = { texData: { svg1: svgUrl } };
  absorbTextures(obj);
  assert.strictEqual(obj.texData, undefined);
  assert.deepStrictEqual(cached, [{ id: 'svg1', data: svgUrl }]);
  assert.deepStrictEqual(puts, [{ store: 'textures', val: { id: 'svg1', data: svgUrl } }]);
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

test('(d) MCP round-trip: create_texture, add_texture, list_textures', async t => {
  const c = client(); t.after(() => c.stop());
  await c.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ci', version: '1' } });

  await c.tool('new_project', { name: 'Tex test' });
  await c.tool('add_rect_walls', { x: 0, y: 0, w: 400, h: 300 });
  const rm = await c.tool('add_room', { name: 'Hall', pts: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] });
  assert.ok(!rm.err, rm.text);
  const roomId = rm.text.match(/Added room (\w+)/)[1];

  const created = await c.tool('create_texture', { pattern: 'tile', name: 'Hall Tile', applyTo: [roomId, 'floorSlab:0'] });
  assert.ok(!created.err, created.text);
  const texId = created.text.match(/Added texture (\w+)/)[1];

  let proj = JSON.parse((await c.tool('get_project')).text);
  assert.ok(proj.texData && proj.texData[texId].startsWith('data:image/svg+xml'), 'texData[id] must start with data:image/svg+xml');
  const room = proj.floors[0].rooms.find(r => r.id === roomId);
  assert.strictEqual(room.floor, 'tex:' + texId);
  assert.strictEqual(proj.floors[0].slabFloor, 'tex:' + texId);

  const countBefore = proj.textures.length;
  const bad = await c.tool('create_texture', { pattern: 'brick', name: 'Bad Brick', applyTo: ['unknown_id_999'] });
  assert.ok(bad.err, 'unknown applyTo id must return an error');
  proj = JSON.parse((await c.tool('get_project')).text);
  assert.strictEqual(proj.textures.length, countBefore, 'failed create_texture must not add a texture');

  // Minimal 1x2 PNG header (>24 bytes) for pngSize()
  const png = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
  png.writeUInt32BE(13, 8);
  png.write('IHDR', 12, 'ascii');
  png.writeUInt32BE(1, 16);
  png.writeUInt32BE(2, 20);
  const pngUrl = 'data:image/png;base64,' + png.toString('base64');

  const added = await c.tool('add_texture', { name: 'Tall Strip', dataUrl: pngUrl, width: 50 });
  assert.ok(!added.err, added.text);
  proj = JSON.parse((await c.tool('get_project')).text);
  const strip = proj.textures.find(x => x.name === 'Tall Strip');
  assert.ok(strip, 'added texture must exist');
  assert.strictEqual(strip.w, 50);
  assert.strictEqual(strip.h, 100);

  const listed = await c.tool('list_textures');
  assert.ok(!listed.err, listed.text);
  assert.match(listed.text, /Hall Tile/);
  assert.match(listed.text, /Tall Strip/);
});
