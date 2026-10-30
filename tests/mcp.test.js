/* MCP server over stdio: tool surface, a real plan round-trip, and the
   catalogue mirror that has to stay in sync with app.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { ROOT, read } = require('./helpers/repo');

const SERVER = path.join(ROOT, 'mcp', 'server.js');

/** Minimal JSON-RPC client over the server's stdio. */
function client() {
  const proc = spawn(process.execPath, [SERVER], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let nextId = 1, buf = '';
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', chunk => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch (e) { continue; }
      if (msg.id != null && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    }
  });
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    const t = setTimeout(() => reject(new Error(`timeout on ${method}`)), 10000);
    pending.set(id, msg => { clearTimeout(t); resolve(msg); });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  return { proc, call, stop: () => proc.kill() };
}

const text = res => res.result.content[0].text;

test('MCP: initialize, tool surface and plan round-trip', async t => {
  const c = client();
  t.after(() => c.stop());

  const init = await c.call('initialize', {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ci', version: '1' },
  });
  assert.strictEqual(init.result.serverInfo.name, 'floorplanner');
  assert.ok(init.result.instructions.includes('push_to_browser'), 'instructions must mention live editing');

  const list = await c.call('tools/list');
  const names = list.result.tools.map(x => x.name);
  for (const required of [
    'new_project', 'add_wall', 'add_rect_walls', 'add_opening', 'add_furniture',
    'add_room', 'add_text', 'update_object', 'delete_objects', 'add_floor',
    'summarize', 'list_catalog', 'save_project', 'load_project', 'get_project', 'set_project',
    'browser_status', 'push_to_browser', 'pull_from_browser',
    'get_user_requests', 'ack_user_requests',
  ]) assert.ok(names.includes(required), `missing tool: ${required}`);

  // every tool needs a schema, or MCP clients cannot call it
  for (const tool of list.result.tools) {
    assert.strictEqual(tool.inputSchema.type, 'object', `${tool.name} has no object schema`);
  }

  await c.call('tools/call', { name: 'new_project', arguments: { name: 'CI Plan' } });
  const rect = await c.call('tools/call', { name: 'add_rect_walls', arguments: { x: 0, y: 0, w: 500, h: 400, roomName: 'Living' } });
  const wallId = /Added 4 walls: ([a-z0-9]{7})/.exec(text(rect))[1];
  await c.call('tools/call', { name: 'add_opening', arguments: { wallId, opening: 'window2', d: 200 } });
  await c.call('tools/call', { name: 'add_furniture', arguments: { catalogId: 'sofa3', x: 250, y: 120 } });

  const summary = text(await c.call('tools/call', { name: 'summarize', arguments: {} }));
  assert.match(summary, /CI Plan/);
  assert.match(summary, /4 walls/);
  assert.match(summary, /Living/);

  const proj = JSON.parse(text(await c.call('tools/call', { name: 'get_project', arguments: {} })));
  assert.strictEqual(proj.name, 'CI Plan');
  assert.strictEqual(proj.floors[0].walls.length, 4);
  assert.strictEqual(proj.floors[0].ops.length, 1);
  assert.strictEqual(proj.floors[0].furn.length, 1);
});

test('MCP: bad input is reported as a tool error, not a crash', async t => {
  const c = client();
  t.after(() => c.stop());
  await c.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ci', version: '1' } });

  const unknown = await c.call('tools/call', { name: 'nope', arguments: {} });
  assert.match(unknown.error.message, /Unknown tool/);

  const badOpening = await c.call('tools/call', { name: 'add_opening', arguments: { wallId: 'missing', opening: 'door', d: 10 } });
  assert.strictEqual(badOpening.result.isError, true);
  assert.match(text(badOpening), /Error:/);

  // the server must still answer after an error
  const after = await c.call('tools/list');
  assert.ok(after.result.tools.length > 0);
});

test('MCP catalogue mirror stays in sync with app.js', () => {
  const appJs = read('app.js');
  const serverJs = read('mcp/server.js');

  const block = (src, name) => {
    const start = src.indexOf(`const ${name} = [`);
    assert.ok(start >= 0, `${name} not found`);
    const end = src.indexOf('\n];', start);
    return src.slice(start, end);
  };

  // app.js: ['sofa3', 0, 'TR name', w, d, h, 'icon', 'shape', '#colour', 'EN name']
  const appIds = new Set([...block(appJs, 'CAT_DEFS').matchAll(/\n\s*\['([a-z0-9]+)',/g)].map(m => m[1]));
  const srvBlock = block(serverJs, 'CATALOG');
  const srvIds = new Set([...srvBlock.matchAll(/\n\s*\['([a-z0-9]+)',/g)].map(m => m[1]));

  assert.ok(appIds.size > 20, 'app catalogue looks empty');
  const extraInServer = [...srvIds].filter(id => !appIds.has(id));
  assert.deepStrictEqual(extraInServer, [], 'mcp/server.js offers furniture the app does not know');

  const openingIds = new Set([...block(serverJs, 'OPENINGS').matchAll(/id:\s*'([a-z0-9]+)'/g)].map(m => m[1]));
  const appOpeningIds = new Set([...block(appJs, 'OPENINGS').matchAll(/id:\s*'([a-z0-9]+)'/g)].map(m => m[1]));
  assert.deepStrictEqual([...openingIds].sort(), [...appOpeningIds].sort(), 'door/window presets drifted between app.js and mcp/server.js');
});
