/* Tests for project-level 3D ground surface (#147): GROUND-PARAM parity, groundP/cleanGround
   sandbox, app.js wiring, and MCP set_ground/get_project/summarize roundtrip. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, markerBlock, mcpClient } = require('./helpers/repo');

const src = read('app.js');
const mcpSrc = read('mcp/server.js');

function loadGroundParam() {
  return new Function(`
    ${markerBlock(src, 'GROUND-PARAM')}
    return {
      GROUND_KINDS, GROUND_COL, GROUND_TILE, GROUND_SCALE_MIN, GROUND_SCALE_MAX,
      groundP, cleanGround,
    };
  `)();
}

test('(1) GROUND-PARAM block is byte-identical in app.js and mcp/server.js', () => {
  assert.strictEqual(
    markerBlock(mcpSrc, 'GROUND-PARAM'),
    markerBlock(src, 'GROUND-PARAM'),
    'GROUND-PARAM block in mcp/server.js must match app.js'
  );
});

test('(2) groundP defaults, validation, clamping and rounding in sandbox', () => {
  const { GROUND_SCALE_MIN, GROUND_SCALE_MAX, groundP } = loadGroundParam();

  assert.deepStrictEqual(groundP(null), { kind: 'auto', color: null, scale: null });
  assert.deepStrictEqual(groundP({}), { kind: 'auto', color: null, scale: null });
  assert.deepStrictEqual(groundP({ ground: null }), { kind: 'auto', color: null, scale: null });

  for (const bad of ['lava', 123, '', 'tex:', 'tex:bad id!']) {
    assert.strictEqual(groundP({ ground: { kind: bad } }).kind, 'auto', `invalid kind ${bad} -> auto`);
  }

  assert.strictEqual(groundP({ ground: { kind: 'tex:stone_1-a' } }).kind, 'tex:stone_1-a');
  assert.strictEqual(groundP({ ground: { kind: 'sand' } }).kind, 'sand');

  assert.strictEqual(groundP({ ground: { color: '#AABBCC' } }).color, '#aabbcc');
  for (const badCol of ['red', '#fff', '#12345g', '123456', 123456, null]) {
    assert.strictEqual(groundP({ ground: { color: badCol } }).color, null, `invalid color ${badCol} -> null`);
  }

  assert.strictEqual(groundP({ ground: { scale: 1 } }).scale, GROUND_SCALE_MIN);
  assert.strictEqual(groundP({ ground: { scale: 99999 } }).scale, GROUND_SCALE_MAX);
  assert.strictEqual(groundP({ ground: { scale: 250.6 } }).scale, 251);
  for (const badScale of [0, -10, 'abc', NaN, null]) {
    assert.strictEqual(groundP({ ground: { scale: badScale } }).scale, null, `invalid scale ${badScale} -> null`);
  }
});

test('(3) cleanGround drops defaults/invalid values, keeps valid ones, leaves missing ground untouched', () => {
  const { GROUND_TILE, cleanGround } = loadGroundParam();

  const untouched = { name: 'Old' };
  cleanGround(untouched);
  assert.ok(!('ground' in untouched), 'project without ground stays without ground key');

  const allDefault = { ground: { kind: 'auto', color: 'bad', scale: -5 } };
  cleanGround(allDefault);
  assert.ok(!('ground' in allDefault), 'all-default ground is deleted');

  const noneDrop = { ground: { kind: 'none', color: '#112233', scale: 300 } };
  cleanGround(noneDrop);
  assert.deepStrictEqual(noneDrop.ground, { kind: 'none' }, 'color and scale dropped for kind none');

  const tileDrop = { ground: { kind: 'sand', scale: GROUND_TILE.sand } };
  cleanGround(tileDrop);
  assert.deepStrictEqual(tileDrop.ground, { kind: 'sand' }, 'scale equal to GROUND_TILE[kind] is dropped');

  const valid = { ground: { kind: 'sand', color: '#AABBCC', scale: 300 } };
  cleanGround(valid);
  assert.deepStrictEqual(valid.ground, { kind: 'sand', color: '#aabbcc', scale: 300 });
});

test('(4) app.js wiring for 3D ground surface', () => {
  const build3DSrc = fnSrcOf(src, 'build3D');
  assert.match(build3DSrc, /groundMat\s*\(\s*'cad'\s*\)/);
  assert.match(build3DSrc, /ground\.visible\s*=\s*groundP\s*\(\s*P\s*\)\.kind\s*!==\s*'none'/);

  const liveSrc = fnSrcOf(src, 'applyLive3D');
  assert.match(liveSrc, /groundMat\s*\(\s*'real'\s*\)/);
  assert.match(liveSrc, /ground\.color\.multiplyScalar\s*\(/);

  const hqSrc = fnSrcOf(src, 'render3DHQ');
  assert.match(hqSrc, /groundMat\s*\([^)]*'real'\s*:\s*'paper'\s*\)/);
  assert.match(hqSrc, /T3\.ground\.material\s*=\s*oldGroundMat/);

  const antiTileSrc = fnSrcOf(src, 'groundAntiTile');
  assert.match(antiTileSrc, /#include <map_fragment>/);
  assert.match(antiTileSrc, /texelColor\.a\s*=\s*1\.0/);

  const skySrc = fnSrcOf(src, 'makeSky');
  assert.match(skySrc, /\bunder\s*:/);
  assert.match(skySrc, /uniform\s+float\s+under\b/);

  assert.match(fnSrcOf(src, 'normalizeProject'), /\bcleanGround\s*\(\s*P\s*\)/);
  assert.match(fnSrcOf(src, 'projectPanel'), /\bgroundPanelHtml\s*\(\s*\)/);
  assert.match(fnSrcOf(src, 'applyProp'), /if\s*\(\s*k\s*===\s*'ground'\s*\)[\s\S]*?if\s*\(\s*final\s*\)[^;]*commit\s*\(/);
});

test('(5) MCP stdio: set_ground, get_project, summarize, error handling, reset', async t => {
  const c = mcpClient();
  t.after(() => c.stop());

  await c.call('initialize', {
    protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ground-surface-test', version: '1' },
  });

  const np = await c.tool('new_project', { name: 'Ground Test' });
  assert.ok(!np.err, np.text);

  const setRes = await c.tool('set_ground', { kind: 'sand', color: '#AABBCC', scale: 300 });
  assert.ok(!setRes.err, setRes.text);

  const projRes = await c.tool('get_project', {});
  assert.ok(!projRes.err, projRes.text);
  const proj = JSON.parse(projRes.text);
  assert.deepStrictEqual(proj.ground, { kind: 'sand', color: '#aabbcc', scale: 300 });

  const sumRes = await c.tool('summarize', {});
  assert.ok(!sumRes.err, sumRes.text);
  assert.ok(sumRes.text.includes('3D ground: sand'), sumRes.text);

  const badRes = await c.tool('set_ground', { kind: 'lava' });
  assert.ok(badRes.err, 'unknown ground kind should return an error');

  const resetRes = await c.tool('set_ground', { kind: 'auto', color: null, scale: null });
  assert.ok(!resetRes.err, resetRes.text);

  const projAfter = JSON.parse((await c.tool('get_project', {})).text);
  assert.ok(!('ground' in projAfter), 'auto + null color/scale removes ground from project');
});
