/* Tests for furniture elevation above floor (#61).
   Evaluates furnElev on the real source, verifies catalogue elevation defaults,
   MCP server mirror, UI/3D source wiring, 16:9 TV unit redesign, and MCP round-trip. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { ROOT, read } = require('./helpers/repo');

const src = read('app.js');
const mcpSrc = read('mcp/server.js');
const SERVER = path.join(ROOT, 'mcp', 'server.js');

const constLine = name => {
  const start = src.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is gone from app.js');
  return src.slice(start, src.indexOf('\n', start));
};

const fnSrc = name => {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + '() is gone from app.js');
  return src.slice(start, src.indexOf('\n}', start) + 2);
};

const {
  FURN_ELEV_MAX,
  furnElev,
} = new Function(`
  ${constLine('FURN_ELEV_MAX')}
  return { FURN_ELEV_MAX, furnElev };
`)();

test('(1) furnElev defaults and bounds clamping on real source', () => {
  assert.strictEqual(FURN_ELEV_MAX, 500, 'FURN_ELEV_MAX must be 500');

  // absent / undefined / null -> 0
  assert.strictEqual(furnElev(), 0);
  assert.strictEqual(furnElev(undefined), 0);
  assert.strictEqual(furnElev(null), 0);
  assert.strictEqual(furnElev({}), 0);
  assert.strictEqual(furnElev({ elev: undefined }), 0);
  assert.strictEqual(furnElev({ elev: null }), 0);

  // 0 -> 0
  assert.strictEqual(furnElev({ elev: 0 }), 0);
  assert.strictEqual(furnElev({ elev: '0' }), 0);

  // negative -> kept and clamped to -FURN_ELEV_MAX (-500)
  assert.strictEqual(furnElev({ elev: -1 }), -1);
  assert.strictEqual(furnElev({ elev: -50 }), -50);
  assert.strictEqual(furnElev({ elev: '-10' }), -10);
  assert.strictEqual(furnElev({ elev: -900 }), -FURN_ELEV_MAX);
  assert.strictEqual(furnElev({ elev: -900 }), -500);

  // NaN -> 0
  assert.strictEqual(furnElev({ elev: NaN }), 0);
  assert.strictEqual(furnElev({ elev: 'invalid' }), 0);
  assert.strictEqual(furnElev({ elev: {} }), 0);

  // 80 -> 80
  assert.strictEqual(furnElev({ elev: 80 }), 80);

  // 900 -> FURN_ELEV_MAX (500)
  assert.strictEqual(furnElev({ elev: 900 }), FURN_ELEV_MAX);
  assert.strictEqual(furnElev({ elev: 900 }), 500);

  // string "120" -> 120
  assert.strictEqual(furnElev({ elev: '120' }), 120);
});

test('(2) CAT_ELEV keys exist in CAT_DEFS, values in (0, 500], and tv is not present', () => {
  const catDefsStart = src.indexOf('const CAT_DEFS = [');
  assert.ok(catDefsStart >= 0, 'CAT_DEFS not found in app.js');
  const catDefsEnd = src.indexOf('\n];', catDefsStart);
  const CAT_DEFS = new Function(src.slice(catDefsStart, catDefsEnd + 3) + '\nreturn CAT_DEFS;')();
  const catDefIds = new Set(CAT_DEFS.map(x => x[0]));

  const CAT_ELEV = new Function(constLine('CAT_ELEV') + '\nreturn CAT_ELEV;')();
  const keys = Object.keys(CAT_ELEV);

  assert.ok(keys.length > 0, 'CAT_ELEV should not be empty');

  // CAT_ELEV keys exist in CAT_DEFS
  for (const key of keys) {
    assert.ok(catDefIds.has(key), `CAT_ELEV key "${key}" must exist in CAT_DEFS`);
    // every value is > 0 and <= 500
    const val = CAT_ELEV[key];
    assert.ok(typeof val === 'number', `CAT_ELEV["${key}"] must be a number`);
    assert.ok(val > 0 && val <= 500, `CAT_ELEV["${key}"] value ${val} must be > 0 and <= 500`);
  }

  // tv (floor TV unit) is NOT in CAT_ELEV
  assert.strictEqual(CAT_ELEV.tv, undefined, 'tv (floor TV unit) must not be in CAT_ELEV');
  assert.ok(!('tv' in CAT_ELEV), 'tv key must not exist in CAT_ELEV');
});

test('(3) mcp/server.js CAT_ELEV object text equals app.js CAT_ELEV and every key in server CATALOG', () => {
  const extractCatElev = fileSrc => {
    const m = fileSrc.match(/const\s+CAT_ELEV\s*=\s*(\{[^}]+\})/);
    assert.ok(m, 'CAT_ELEV definition not found');
    return m[1].trim();
  };

  const appCatElevText = extractCatElev(src);
  const mcpCatElevText = extractCatElev(mcpSrc);
  assert.strictEqual(mcpCatElevText, appCatElevText, 'CAT_ELEV object text in mcp/server.js must match app.js');

  const mcpCatStart = mcpSrc.indexOf('const CATALOG = [');
  assert.ok(mcpCatStart >= 0, 'CATALOG not found in mcp/server.js');
  const mcpCatEnd = mcpSrc.indexOf('\n];', mcpCatStart);
  const mcpCatalog = new Function(mcpSrc.slice(mcpCatStart, mcpCatEnd + 3) + '\nreturn CATALOG;')();
  const serverCatIds = new Set(mcpCatalog.map(x => x.id));

  const CAT_ELEV = new Function('return ' + appCatElevText)();
  for (const id of Object.keys(CAT_ELEV)) {
    assert.ok(serverCatIds.has(id), `CAT_ELEV item "${id}" must exist in mcp/server.js CATALOG`);
  }
});

test('(4) source wiring checks with loose regexes', () => {
  // mkFurn applies CAT_ELEV only when o.elev == null
  assert.match(
    src,
    /o\.elev\s*==\s*null\s*&&\s*CAT_ELEV\[def\.id\]/,
    'mkFurn must apply CAT_ELEV only when o.elev == null'
  );

  // furnSvg uses stroke-dasharray when raised and emits ▲ tag
  const furnSvgBody = fnSrc('furnSvg');
  assert.match(furnSvgBody, /stroke-dasharray/, 'furnSvg must use stroke-dasharray for raised items');
  assert.match(furnSvgBody, /▲/, 'furnSvg must emit ▲ tag for raised items');

  // panel field elev is hidden for stairs and ramp
  assert.match(
    src,
    /o\.k\s*!==\s*['"]stairs['"]\s*&&\s*o\.k\s*!==\s*['"]ramp['"][\s\S]*?['"]furn['"]\s*,\s*['"]elev['"]/,
    'panel field elev must be hidden for stairs and ramp'
  );

  // applyProp clamps elev to 0..FURN_ELEV_MAX
  assert.match(
    src,
    /k\s*===\s*['"]furn['"]\s*&&\s*p\s*===\s*['"]elev['"][\s\S]*?clamp\([^;]*FURN_ELEV_MAX\)/,
    'applyProp must clamp elev to 0..FURN_ELEV_MAX'
  );

  // PRESET_FURN_EXTRA includes elev
  assert.match(
    src,
    /PRESET_FURN_EXTRA\s*=\s*\[[^\]]*['"]elev['"][^\]]*\]/,
    'PRESET_FURN_EXTRA must include elev'
  );

  // build3D adds furnElev(o) to fy
  assert.match(
    src,
    /fy\s*=\s*elev\s*\+\s*furnOff\(o\)\s*\+\s*furnElev\(o\)/,
    'build3D must add furnElev(o) to fy'
  );
});

test('(5) furn3D tv case no longer uses bright #0ea5e9 screen colour and builds a 16:9 screen', () => {
  const tvStart = src.indexOf("case 'tv':");
  assert.ok(tvStart >= 0, "case 'tv': not found in app.js");
  const tvEnd = src.indexOf("case 'tvw':", tvStart);
  assert.ok(tvEnd >= 0, "case 'tvw': not found in app.js");
  const tvCase = src.slice(tvStart, tvEnd);

  // no longer uses the bright #0ea5e9 screen colour
  assert.ok(!tvCase.includes('#0ea5e9'), 'furn3D tv case must no longer use bright #0ea5e9 screen colour');

  // builds a 16:9 screen (9 / 16)
  assert.match(tvCase, /9\s*\/\s*16/, 'furn3D tv case must build a 16:9 screen using 9 / 16 ratio');
});

test('(6) MCP round trip: elevation defaults, overrides, and bounds check', async t => {
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
      const timeout = setTimeout(() => reject(new Error(`timeout on ${method}`)), 10000);
      pending.set(id, msg => { clearTimeout(timeout); resolve(msg); });
      proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
    return { proc, call, stop: () => proc.kill() };
  }

  const text = res => res.result.content[0].text;

  const c = client();
  t.after(() => c.stop());

  await c.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ci', version: '1' } });
  await c.call('tools/call', { name: 'new_project', arguments: { name: 'Elev Test' } });

  // add_furniture catalogId tvw (expect elev 80 in get_project JSON)
  await c.call('tools/call', { name: 'add_furniture', arguments: { catalogId: 'tvw', x: 100, y: 100 } });

  // add_furniture sofa3 (no elev field)
  await c.call('tools/call', { name: 'add_furniture', arguments: { catalogId: 'sofa3', x: 200, y: 200 } });

  // add_furniture art with elev 0 (elev 0 stored)
  await c.call('tools/call', { name: 'add_furniture', arguments: { catalogId: 'art', x: 300, y: 300, elev: 0 } });

  const projRes = await c.call('tools/call', { name: 'get_project', arguments: {} });
  const proj = JSON.parse(text(projRes));
  const furn = proj.floors[0].furn;

  const tvw = furn.find(x => x.type === 'tvw');
  assert.ok(tvw, 'tvw must be present in project furniture');
  assert.strictEqual(tvw.elev, 80, 'tvw should default to elev 80');

  const sofa = furn.find(x => x.type === 'sofa3');
  assert.ok(sofa, 'sofa3 must be present in project furniture');
  assert.strictEqual(sofa.elev, undefined, 'sofa3 should have no elev field');
  assert.ok(!('elev' in sofa), 'sofa3 should not have elev key');

  const art = furn.find(x => x.type === 'art');
  assert.ok(art, 'art must be present in project furniture');
  assert.strictEqual(art.elev, 0, 'art with elev: 0 must store elev: 0');

  // add_furniture with elev 900 -> isError
  const bad = await c.call('tools/call', { name: 'add_furniture', arguments: { catalogId: 'tvw', x: 400, y: 400, elev: 900 } });
  assert.strictEqual(bad.result.isError, true, 'add_furniture with elev 900 must return isError: true');
  assert.match(text(bad), /elev must be between -500 and 500 cm/, 'error message must explain valid elev bounds');
});
