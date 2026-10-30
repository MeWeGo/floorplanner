/* Parse-check every script the browser and the agent tooling load.
   This is the cheapest gate: it catches syntax errors before a deploy. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { ROOT, read, exists, parseJsonc } = require('./helpers/repo');

const FILES = ['app.js', 'mcp/server.js', 'mcp/bridge.js'];

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
