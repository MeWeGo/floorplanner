/* Parse-check every script the browser and the agent tooling load.
   This is the cheapest gate: it catches syntax errors before a deploy. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { ROOT, read, exists, parseJsonc } = require('./helpers/repo');

const FILES = ['app.js', 'mcp/server.js', 'mcp/bridge.js', 'presence/worker.mjs'];

for (const rel of FILES) {
  test(`node --check ${rel}`, () => {
    assert.ok(exists(rel), `${rel} is missing`);
    execFileSync(process.execPath, ['--check', path.join(ROOT, rel)], { stdio: 'pipe' });
  });
}

test('opencode.jsonc is valid JSONC and registers the MCP server', () => {
  const cfg = parseJsonc(read('opencode.jsonc'));
  assert.ok(cfg.mcp && cfg.mcp.servers && cfg.mcp.servers.floorplanner, 'floorplanner MCP server is not configured');
  assert.deepStrictEqual(cfg.mcp.servers.floorplanner.command, ['node', 'mcp/server.js']);
});

test('index.html loads the app exactly once and uses no inline script', () => {
  const html = read('index.html');
  const appTags = [...html.matchAll(/<script\b[^>]*>/gi)].map(m => m[0]);
  assert.strictEqual(appTags.filter(t => /src="app\.js"/.test(t)).length, 1, 'expected exactly one <script src="app.js">');  const inline = appTags.filter(t => !/\bsrc=/.test(t));
  assert.deepStrictEqual(inline, [], 'inline <script> blocks are not allowed');
});

test('.gitignore keeps build noise out of the repo', () => {
  const gi = read('.gitignore');
  for (const p of ['node_modules/', 'package-lock.json']) {
    assert.ok(gi.includes(p), `.gitignore is missing ${p}`);
  }
});

test('fnSrcOf cuts parameter defaults, regex literals and async functions correctly', () => {
  const { fnSrcOf } = require('./helpers/repo');
  const src = [
    'function a(opts = {}) { return opts.x; }',
    "function b(s) { return s.replace(/[\"'`{]/g, '').split(/}/); }",
    'async function c() { await 1; return `${ { k: 1 }.k }`; }',
    'function d(x) { return x / 2 / 3; }',
  ].join('\n');
  assert.strictEqual(fnSrcOf(src, 'a'), 'function a(opts = {}) { return opts.x; }');
  assert.deepStrictEqual(new Function('return ' + fnSrcOf(src, 'b'))()("{a'}b"), ['a', 'b']);
  assert.match(fnSrcOf(src, 'c'), /^async function c\(\)/);
  assert.strictEqual(new Function('return ' + fnSrcOf(src, 'd'))()(12), 2);
});

test('fnSrcOf extracts every named function in app.js and mcp/server.js as parseable source', () => {
  const { fnSrcOf } = require('./helpers/repo');
  for (const file of ['app.js', 'mcp/server.js']) {
    const src = read(file);
    const names = new Set([...src.matchAll(/(?:^|[^\w$.])function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
    const bad = [];
    for (const n of names) {
      try { new Function('return (' + fnSrcOf(src, n) + ')'); } catch (e) { bad.push(n + ': ' + e.message); }
    }
    assert.deepStrictEqual(bad, [], file + ': functions fnSrcOf cannot cut out cleanly');
  }
});
