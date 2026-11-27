/* MCP server over stdio: tool surface, a real plan round-trip, and the
   catalogue mirror that has to stay in sync with app.js. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, mcpClient } = require('./helpers/repo');


const client = mcpClient;

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
    'add_room', 'add_slab', 'add_void', 'add_text', 'update_object', 'delete_objects', 'add_floor',
    'summarize', 'list_catalog', 'save_project', 'load_project', 'get_project', 'set_project',
    'browser_status', 'push_to_browser', 'pull_from_browser',
    'get_user_requests', 'ack_user_requests', 'list_snapshots', 'restore_snapshot',
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

  // issues #22 / #23: a wall-less balcony slab and a stairwell void round-trip through the model
  await c.call('tools/call', { name: 'add_slab', arguments: { name: 'Balcony', pts: [{ x: 0, y: 400 }, { x: 500, y: 400 }, { x: 500, y: 550 }, { x: 0, y: 550 }], offset: -3 } });
  await c.call('tools/call', { name: 'add_void', arguments: { type: 'shaft', pts: [{ x: 20, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 120 }, { x: 20, y: 120 }] } });
  const s2 = text(await c.call('tools/call', { name: 'summarize', arguments: {} }));
  assert.match(s2, /1 slabs, 1 voids/);
  assert.match(s2, /slab [a-z0-9]{7}: "Balcony" .*t=20 cm, offset=-3 cm/);
  assert.match(s2, /void [a-z0-9]{7}: shaft/);

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

  // Evaluate both literal arrays: a regex tuned to one format silently matched
  // nothing in the other (the server uses objects), so the check never failed.
  const literal = (src, name) => new Function('return ' + block(src, name).slice(`const ${name} = `.length) + '\n];')();
  // app.js: ['sofa3', 0, 'TR name', w, d, h, 'icon', 'shape', '#colour', 'EN name']
  const app = new Map(literal(appJs, 'CAT_DEFS').map(a => [a[0], { cat: a[1], w: a[3], d: a[4], h: a[5] }]));
  const srv = new Map(literal(serverJs, 'CATALOG').map(o => [o.id, { cat: o.cat, w: o.w, d: o.d, h: o.h }]));

  assert.ok(app.size > 20, 'app catalogue looks empty');
  assert.ok(srv.size > 20, 'server catalogue looks empty');
  const extraInServer = [...srv.keys()].filter(id => !app.has(id));
  assert.deepStrictEqual(extraInServer, [], 'mcp/server.js offers furniture the app does not know');
  const missingInServer = [...app.keys()].filter(id => !srv.has(id));
  assert.deepStrictEqual(missingInServer, [], 'app.js furniture missing from mcp/server.js');
  const drift = [...app].filter(([id, v]) => JSON.stringify(v) !== JSON.stringify(srv.get(id)))
    .map(([id, v]) => `${id}: app ${JSON.stringify(v)} server ${JSON.stringify(srv.get(id))}`);
  assert.deepStrictEqual(drift, [], 'catalogue sizes / categories drifted between app.js and mcp/server.js');

  const openingIds = new Set([...block(serverJs, 'OPENINGS').matchAll(/id:\s*'([a-z0-9]+)'/g)].map(m => m[1]));
  const appOpeningIds = new Set([...block(appJs, 'OPENINGS').matchAll(/id:\s*'([a-z0-9]+)'/g)].map(m => m[1]));
  assert.deepStrictEqual([...openingIds].sort(), [...appOpeningIds].sort(), 'door/window presets drifted between app.js and mcp/server.js');
});
