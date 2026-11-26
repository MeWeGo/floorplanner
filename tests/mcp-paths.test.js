/* Confined file path tests for mcp/server.js (fileArg + FP_MCP_ROOTS). */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { ROOT, mcpClient } = require('./helpers/repo');

async function initClient(c) {
  await c.call('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'mcp-paths-test', version: '1' },
  });
}

test('1: load_project refuses ../outside.json and an absolute path in os.tmpdir()', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-mcp-out-'));
  const outsideFile = path.join(tmpDir, 'outside.json');
  fs.writeFileSync(outsideFile, JSON.stringify({ v: 2, name: 'Out', floors: [] }), 'utf8');
  const c = mcpClient();
  try {
    await initClient(c);

    const relRes = await c.tool('load_project', { path: '../outside.json' });
    assert.strictEqual(relRes.err, true, 'relative ../outside.json should be refused');
    assert.match(relRes.text, /outside/i, 'refused as outside, before the file is even looked up');

    const absRes = await c.tool('load_project', { path: outsideFile });
    assert.strictEqual(absRes.err, true, 'absolute tmpdir path should be refused');
    assert.match(absRes.text, /outside/i);
  } finally {
    c.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('2: save_project refuses ../x.json and non-.json extensions like evil.sh', async () => {
  const c = mcpClient();
  try {
    await initClient(c);

    const relRes = await c.tool('save_project', { path: '../x.json' });
    assert.strictEqual(relRes.err, true, '../x.json should be refused');
    assert.match(relRes.text, /outside/i);

    const extRes = await c.tool('save_project', { path: 'evil.sh' });
    assert.strictEqual(extRes.err, true, 'evil.sh should be refused');
    assert.match(extRes.text, /Only \.json/i);
  } finally {
    c.stop();
  }
});

test('3: save_project and load_project work in a temp folder when FP_MCP_ROOTS is set', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-mcp-root-'));
  const target = path.join(tmpDir, 'saved-plan.json');
  const c = mcpClient({ FP_MCP_ROOTS: tmpDir });
  try {
    await initClient(c);

    const saveRes = await c.tool('save_project', { path: target });
    assert.ok(!saveRes.err, 'save_project should succeed: ' + saveRes.text);
    assert.ok(fs.existsSync(target), 'saved-plan.json should exist on disk');

    const loadRes = await c.tool('load_project', { path: target });
    assert.ok(!loadRes.err, 'load_project should succeed: ' + loadRes.text);
    assert.match(loadRes.text, /Loaded/i);
  } finally {
    c.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('4: load_project refuses a .txt file', async () => {
  const c = mcpClient();
  try {
    await initClient(c);

    const res = await c.tool('load_project', { path: 'notes.txt' });
    assert.strictEqual(res.err, true, '.txt file should be refused');
    assert.match(res.text, /Only \.json/i);
  } finally {
    c.stop();
  }
});

test('5: import_dxf "tests/fixtures/plan.dxf" still works with default roots', async () => {
  const c = mcpClient();
  try {
    await initClient(c);

    const res = await c.tool('import_dxf', { path: 'tests/fixtures/plan.dxf' });
    assert.ok(!res.err, 'import_dxf should succeed: ' + res.text);
    assert.match(res.text, /6 walls/);
  } finally {
    c.stop();
  }
});
