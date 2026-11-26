/* Furniture store (community library): the FurnStore Durable Object and the /store/* routes
   of presence/worker.mjs run for real against an in-memory SQLite (node:sqlite) and Google
   ID tokens signed with a test RSA key; plus the shared STORE-THUMB block and the app wiring. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, markerBlock } = require('./helpers/repo');

const workerSrc = read('presence/worker.mjs');
const wranglerSrc = read('presence/wrangler.toml');
const appSrc = read('app.js');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (_) { /* older Node: DB tests skip */ }
const sqlSkip = DatabaseSync ? false : 'node:sqlite is not available in this Node version';

const ORIGIN = 'https://mewego.github.io';
const AUD = 'test-client.apps.googleusercontent.com';

/* ---------- sandbox ---------- */
function sqlStorage() {
  const db = new DatabaseSync(':memory:');
  return {
    exec(q, ...b) {
      const st = db.prepare(q);
      const rows = /^\s*(SELECT|WITH)\b/i.test(q) ? st.all(...b).map(r => ({ ...r })) : (st.run(...b), []);
      return { toArray: () => rows };
    },
  };
}

const SEED = JSON.parse(/export const STORE_SEED = (\[[\s\S]*\]);/.exec(read('presence/store-seed.mjs'))[1]);
function loadWorker(jwks, env0 = {}, seed = []) {
  class MockDurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }
  const fetchMock = async url => {
    assert.strictEqual(url, 'https://www.googleapis.com/oauth2/v3/certs');
    fetchMock.calls++;
    if (fetchMock.fail) return new Response('down', { status: 500 });
    return new Response(JSON.stringify({ keys: jwks }), { headers: { 'Cache-Control': 'public, max-age=600' } });
  };
  fetchMock.calls = 0;
  const transformed = workerSrc
    .replace(/^\s*import\s+\{\s*STORE_SEED\s*\}\s+from\s+['"]\.\/store-seed\.mjs['"];\s*/m, '')
    .replace(/^\s*import\s+\{\s*DurableObject\s*\}\s+from\s+['"]cloudflare:workers['"];\s*/m, '')
    .replace(/\bexport\s+class\s+/g, 'class ')
    .replace(/\bexport\s+default\s+/, 'const worker = ');
  const mod = new Function('DurableObject', 'fetch', 'STORE_SEED', `${transformed}\nreturn { FurnStore, worker, verifyGoogleToken, storeThumbClean, storePreset };`)(MockDurableObject, fetchMock, seed);
  let store = null;
  const env = {
    ALLOWED_ORIGINS: ORIGIN, GOOGLE_CLIENT_ID: AUD, ...env0,
    STORE: { idFromName: n => ({ n }), get() { if (!store) store = new mod.FurnStore({ storage: { sql: sqlStorage() } }, env); return store; } },
  };
  const call = async (method, path, { token, body, origin = ORIGIN, ip = '1.2.3.4' } = {}) => {
    const headers = { 'CF-Connecting-IP': ip };
    if (origin) headers.Origin = origin;
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await mod.worker.fetch(new Request('https://store.example' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch (_) { }
    return { status: res.status, json, headers: res.headers };
  };
  return { ...mod, env, call, fetchMock };
}

/* ---------- Google-style ID tokens ---------- */
const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
async function keyPair(kid) {
  const k = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', k.publicKey);
  return { priv: k.privateKey, jwk: { kty: 'RSA', n: jwk.n, e: jwk.e, kid, alg: 'RS256', use: 'sig' } };
}
async function idToken(kp, claims = {}, head = {}) {
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: kp.jwk.kid, typ: 'JWT', ...head }));
  const p = b64u(JSON.stringify({ iss: 'https://accounts.google.com', aud: AUD, sub: '1001', exp: Math.floor(Date.now() / 1000) + 3600, given_name: 'Ada', email: 'ada@example.com', ...claims }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.priv, new TextEncoder().encode(h + '.' + p));
  return h + '.' + p + '.' + b64u(new Uint8Array(sig));
}

const THUMB = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><g opacity="0.8"><rect x="0" y="0" width="100" height="60" fill="#b08968" stroke="#333" stroke-width="1"/><circle cx="50" cy="30" r="10" fill="#fff"/></g></svg>';
const PRESET = { kind: 'furn', type: 'shape', k: 'rect', icon: '🪑', w: 120, d: 60, h: 75, color: '#b08968',
  extra: { parts: [{ type: 'box', x: 0, y: 0, z: 0, w: 120, d: 60, h: 75, color: '#b08968' }], pbase: { w: 120, d: 60, h: 75 }, partsV: 1 } };
const ITEM = { name: 'Oak desk', desc: 'Simple desk', cat: 2, tags: ['desk', 'Office'], preset: PRESET, thumb: THUMB };

let KP = null, KP2 = null;
test.before(async () => { KP = await keyPair('k1'); KP2 = await keyPair('k2'); });

/* ---------- thumbnail sanitiser ---------- */
test('STORE-THUMB block is identical in presence/worker.mjs and app.js', () => {
  assert.strictEqual(markerBlock(appSrc, 'STORE-THUMB'), markerBlock(workerSrc, 'STORE-THUMB'));
});

test('storeThumbClean keeps shape SVG and rejects anything that could run or link', () => {
  const { storeThumbClean } = loadWorker([]);
  assert.strictEqual(storeThumbClean(THUMB), THUMB);
  for (const bad of [
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)" width="1"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(#x)" width="1"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><rect/></a></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect style="x" width="1"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><text>hi</text></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg">text<rect/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect/>',
    '<rect/>',
    '<svg xmlns="http://www.w3.org/2000/svg"></svg><svg xmlns="http://www.w3.org/2000/svg"></svg>',
    '<svg xmlns="http://evil"><rect/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill=\'red\' /></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><!-- x --><rect/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><g></svg><rect x="1"/></g>',
    '<svg xmlns="http://www.w3.org/2000/svg"><g><rect></g></rect></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="&#x6A;avascript"/></svg>',
    '<svg>' + '<rect/>'.repeat(3000) + '</svg>',
    '',
  ]) assert.strictEqual(storeThumbClean(bad), null, bad.slice(0, 80));
});

/* ---------- presets ---------- */
test('storePreset rebuilds the item from known, shape-checked fields only', () => {
  const { storePreset } = loadWorker([]);
  const p = storePreset({ ...PRESET, type: 'x"><img src=x onerror=1>', extra: { ...PRESET.extra, evil: 1, id: 'dup', x: 5, layer: '3', __proto__: { polluted: 1 } } });
  assert.strictEqual(p.type, 'custom', 'a type that is not a plain name becomes custom');
  assert.deepStrictEqual(Object.keys(p.extra).sort(), ['partsV', 'parts', 'pbase'].sort(), 'no ids, positions or unknown keys');
  assert.strictEqual(({}).polluted, undefined);
  for (const t of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) assert.strictEqual(storePreset({ ...PRESET, type: t }).type, 'custom', t);
  assert.strictEqual(storePreset({ ...PRESET, type: 'sofa3' }).type, 'sofa3');
  for (const k of ['stairs', 'ramp', 'roof', 'nope']) assert.strictEqual(storePreset({ ...PRESET, k }).k, 'rect', k);
  // malformed outlines never reach the plan: a poly without valid points is a box
  for (const pts of [[null, null, null], 5, 'x', [{ x: 1, y: 2 }, { x: 3 }], [{ x: 0, y: 0 }, { x: 1, y: 0 }], new Array(201).fill({ x: 1, y: 1 }), [{ x: '1', y: 2 }, { x: 1, y: 2 }, { x: 1, y: 3 }]]) {
    const q = storePreset({ ...PRESET, k: 'poly', extra: { pts } });
    assert.strictEqual(q.k, 'rect', JSON.stringify(pts).slice(0, 40)); assert.ok(!q.extra || !q.extra.pts);
  }
  const ok = storePreset({ ...PRESET, k: 'poly', extra: { pts: [{ x: 0, y: 0, z: 9 }, { x: 10, y: 0 }, { x: 0, y: 10 }] } });
  assert.deepStrictEqual(ok.extra.pts, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]);
  // parts: junk entries dropped, fields typed, strings cleaned, faces / roof fields gone
  const pp = storePreset({ ...PRESET, extra: { parts: [null, 7, [], { type: 'evil', x: 'a', w: -1, color: 'red', mat: 'tex:abc', name: '<b>"x"</b>', light: 'laser', onload: 1 }], pbase: { w: 'x' }, faces: [[1]], roofType: 'gable', lm: Infinity, lon: 0, mount: 'ceil', lcol: '#ff0000' } });
  assert.deepStrictEqual(pp.extra.parts, [{ type: 'box', w: 1, d: 1, h: 1, name: 'bx/b' }]);
  assert.deepStrictEqual(Object.keys(pp.extra).sort(), ['lcol', 'lon', 'mount', 'parts', 'partsV'].sort());
  assert.throws(() => storePreset({ ...PRESET, kind: 'op' }), /furniture/);
  assert.throws(() => storePreset({ ...PRESET, w: 0 }), /width/);
  assert.throws(() => storePreset({ ...PRESET, h: Infinity }), /height/);
  assert.throws(() => storePreset({ ...PRESET, extra: { parts: new Array(65).fill(PRESET.extra.parts[0]) } }), /64/);
  const big = new Array(64).fill(0).map((_, i) => ({ type: 'extrude', x: i, y: 0, z: 0, w: 1, d: 1, h: 1, pts: new Array(200).fill({ x: 1.123456789, y: 2.123456789 }) }));
  assert.throws(() => storePreset({ ...PRESET, extra: { parts: big } }), /large/);
});

test('STORE-PRESET block is identical in the worker, app.js and mcp/server.js', () => {
  const w = markerBlock(workerSrc, 'STORE-PRESET');
  assert.strictEqual(markerBlock(appSrc, 'STORE-PRESET'), w);
  assert.strictEqual(markerBlock(read('mcp/server.js'), 'STORE-PRESET'), w);
});

/* ---------- Google sign-in ---------- */
test('verifyGoogleToken accepts a valid token and rejects wrong audience, issuer, expiry, key or signature', { skip: false }, async () => {
  const w = loadWorker([KP.jwk]);
  assert.deepStrictEqual(await w.verifyGoogleToken(await idToken(KP), w.env), { sub: '1001', name: 'Ada' });
  assert.strictEqual(await w.verifyGoogleToken(await idToken(KP, { aud: 'other' }), w.env), null);
  assert.strictEqual(await w.verifyGoogleToken(await idToken(KP, { iss: 'https://evil.example' }), w.env), null);
  assert.strictEqual(await w.verifyGoogleToken(await idToken(KP, { exp: Math.floor(Date.now() / 1000) - 5 }), w.env), null);
  assert.strictEqual(await w.verifyGoogleToken(await idToken(KP2), w.env), null, 'unknown kid');
  assert.strictEqual(await w.verifyGoogleToken(await idToken(KP2, {}, { kid: 'k1' }), w.env), null, 'signed by another key');
  assert.strictEqual(await w.verifyGoogleToken(await idToken(KP, {}, { alg: 'none' }), w.env), null);
  const t = await idToken(KP); const [h, , s] = t.split('.');
  assert.strictEqual(await w.verifyGoogleToken(h + '.' + b64u(JSON.stringify({ iss: 'https://accounts.google.com', aud: AUD, sub: '9', exp: 9e9 })) + '.' + s, w.env), null, 'tampered payload');
  assert.strictEqual(w.fetchMock.calls, 1, 'JWKS fetched once and cached');
});

/* ---------- routes ---------- */
test('publish → list → get → use, without the email and with the preset only on get', { skip: sqlSkip }, async () => {
  const w = loadWorker([KP.jwk]);
  const tok = await idToken(KP);
  assert.strictEqual((await w.call('POST', '/store/items', { body: ITEM })).status, 401, 'publishing needs sign-in');
  const pub = await w.call('POST', '/store/items', { token: tok, body: { ...ITEM, author: 'Ada L.' } });
  assert.strictEqual(pub.status, 201, JSON.stringify(pub.json));
  const id = pub.json.item.id;
  assert.match(id, /^[a-z2-9]{10}$/);
  assert.deepStrictEqual(pub.json.item.tags, ['desk', 'office']);

  const list = await w.call('GET', '/store/items', { origin: '' });
  assert.strictEqual(list.status, 200, 'reads need no Origin (MCP server)');
  assert.strictEqual(list.json.items.length, 1);
  const it = list.json.items[0];
  assert.strictEqual(it.author, 'Ada L.');
  assert.strictEqual(it.preset, undefined);
  assert.strictEqual(it.own, undefined);
  assert.ok(!JSON.stringify(list.json).includes('ada@example.com'));
  assert.ok(!JSON.stringify(list.json).includes('1001'), 'Google account id is not public');
  assert.strictEqual(list.headers.get('Access-Control-Allow-Origin'), null);

  const mine = await w.call('GET', '/store/items', { token: tok });
  assert.strictEqual(mine.json.items[0].own, true);
  assert.strictEqual(mine.headers.get('Access-Control-Allow-Origin'), ORIGIN);

  const got = await w.call('GET', '/store/items/' + id);
  assert.deepStrictEqual(got.json.item.preset, PRESET);
  await w.call('POST', `/store/items/${id}/use`);
  await w.call('POST', `/store/items/${id}/use`);
  await w.call('POST', `/store/items/${id}/use`, { ip: '5.6.7.8' });
  assert.strictEqual((await w.call('GET', '/store/items/' + id)).json.item.uses, 2, 'one use per IP per hour');

  assert.strictEqual((await w.call('GET', '/store/items?q=OAK')).json.items.length, 1);
  assert.strictEqual((await w.call('GET', '/store/items?q=office')).json.items.length, 1, 'tags searched');
  assert.strictEqual((await w.call('GET', '/store/items?q=sofa')).json.items.length, 0);
  assert.strictEqual((await w.call('GET', '/store/items?cat=2')).json.items.length, 1);
  assert.strictEqual((await w.call('GET', '/store/items?cat=3')).json.items.length, 0);
  assert.strictEqual((await w.call('GET', '/store/items/abcdefghij')).status, 404);
});

test('writes from another origin and invalid tokens are refused; bad bodies give 400', { skip: sqlSkip }, async () => {
  const w = loadWorker([KP.jwk]);
  const tok = await idToken(KP);
  assert.strictEqual((await w.call('POST', '/store/items', { token: tok, body: ITEM, origin: 'https://evil.example' })).status, 403);
  assert.strictEqual((await w.call('POST', '/store/items', { token: tok, body: ITEM, origin: '' })).status, 403);
  assert.strictEqual((await w.call('GET', '/store/items', { token: 'x.y.z' })).status, 401);
  assert.strictEqual((await w.call('POST', '/store/items', { token: tok, body: { ...ITEM, thumb: '<svg><script/></svg>' } })).status, 400);
  assert.strictEqual((await w.call('POST', '/store/items', { token: tok, body: { ...ITEM, name: '  ' } })).status, 400);
  const opt = await w.call('OPTIONS', '/store/items');
  assert.strictEqual(opt.status, 204);
});

test('only the author edits or deletes; 5 reports hide an item until an admin restores it', { skip: sqlSkip }, async () => {
  const w = loadWorker([KP.jwk], { STORE_ADMINS: '9000' });
  const ada = await idToken(KP), bob = await idToken(KP, { sub: '2002', given_name: 'Bob' });
  const id = (await w.call('POST', '/store/items', { token: ada, body: ITEM })).json.item.id;

  assert.strictEqual((await w.call('PUT', '/store/items/' + id, { token: bob, body: { ...ITEM, name: 'Mine now' } })).status, 403);
  assert.strictEqual((await w.call('DELETE', '/store/items/' + id, { token: bob })).status, 403);
  const upd = await w.call('PUT', '/store/items/' + id, { token: ada, body: { ...ITEM, name: 'Oak desk v2' } });
  assert.strictEqual(upd.json.item.name, 'Oak desk v2');
  assert.strictEqual((await w.call('POST', `/store/items/${id}/report`, { token: ada })).status, 400, 'no self-report');

  for (const sub of ['2002', '2002', '3003', '4004', '5005']) assert.strictEqual((await w.call('POST', `/store/items/${id}/report`, { token: await idToken(KP, { sub }) })).status, 200);
  assert.strictEqual((await w.call('GET', '/store/items')).json.items.length, 1, 'four distinct reports: still listed');
  await w.call('POST', `/store/items/${id}/report`, { token: await idToken(KP, { sub: '6006' }) });
  assert.strictEqual((await w.call('GET', '/store/items')).json.items.length, 0, 'hidden after 5 reports');
  assert.strictEqual((await w.call('GET', '/store/items/' + id)).status, 404);
  const own = await w.call('GET', '/store/mine', { token: ada });
  assert.strictEqual(own.json.items[0].hidden, true, 'the author still sees it, marked hidden');

  const admin = await idToken(KP, { sub: '9000' });
  assert.strictEqual((await w.call('POST', `/store/items/${id}/unhide`, { token: bob })).status, 404, 'a hidden item is invisible to non-admins');
  assert.strictEqual((await w.call('POST', `/store/items/${id}/unhide`, { token: admin })).status, 200);
  assert.strictEqual((await w.call('GET', '/store/items')).json.items.length, 1);

  assert.strictEqual((await w.call('POST', '/store/users/1001/ban', { token: bob })).status, 403);
  assert.strictEqual((await w.call('POST', '/store/users/1001/ban', { token: admin })).status, 200);
  assert.strictEqual((await w.call('GET', '/store/items')).json.items.length, 0, 'banned author hidden');
  assert.strictEqual((await w.call('POST', '/store/items', { token: ada, body: ITEM })).status, 403);
  assert.strictEqual((await w.call('DELETE', '/store/items/' + id, { token: admin })).status, 200, 'admin deletes');
  assert.strictEqual((await w.call('GET', '/store/mine', { token: ada })).json.items.length, 0);
});

test('use counts resist pumping and reports cannot hide examples or popular items cheaply', { skip: sqlSkip }, async () => {
  const w = loadWorker([KP.jwk], {}, SEED.slice(0, 1));
  const ada = await idToken(KP);
  const id = (await w.call('POST', '/store/items', { token: ada, body: ITEM })).json.item.id;
  const uses = async () => (await w.call('GET', '/store/items/' + id)).json.item.uses;
  // the author's own placements never count; one IP counts once a day, also after a restart
  await w.call('POST', `/store/items/${id}/use`, { token: ada, ip: '9.9.9.9' });
  assert.strictEqual(await uses(), 0, 'own uses are not counted');
  for (let i = 0; i < 3; i++) await w.call('POST', `/store/items/${id}/use`, { ip: '7.7.7.7' });
  assert.strictEqual(await uses(), 1, 'one use per IP per day');
  const fresh = new w.FurnStore(w.env.STORE.get().ctx, w.env); // a new instance on the same storage (hibernation / restart)
  await fresh.fetch(new Request('https://store/store/items/' + id + '/use', { method: 'POST', headers: { 'x-fp-ip': '7.7.7.7' } }));
  assert.strictEqual(await uses(), 1, 'the dedupe survives a restart');
  await w.call('POST', `/store/items/${id}/use`, { ip: '' });
  assert.strictEqual(await uses(), 1, 'no IP and no account: not counted');

  // the built-in example is never hidden by reports
  const ex = (await w.call('GET', '/store/items')).json.items.find(it => it.id !== id);
  assert.ok(ex, 'the seeded example is listed');
  for (let i = 0; i < 8; i++) await w.call('POST', `/store/items/${ex.id}/report`, { token: await idToken(KP, { sub: 'r' + i }) });
  assert.strictEqual((await w.call('GET', '/store/items/' + ex.id)).status, 200, 'examples stay listed whatever the report count');
});

test('writes need sign-in before any body is read; oversized bodies are refused', { skip: sqlSkip }, async () => {
  const w = loadWorker([KP.jwk]);
  const tok = await idToken(KP);
  assert.strictEqual((await w.call('POST', '/store/items', { body: { junk: 'x'.repeat(200000) } })).status, 401);
  assert.strictEqual((await w.call('DELETE', '/store/items/abcdefghij')).status, 401);
  assert.strictEqual((await w.call('POST', '/store/items', { token: tok, body: { ...ITEM, desc: 'x'.repeat(200000) } })).status, 413);
  assert.strictEqual((await w.call('POST', '/store/items', { token: tok, body: ITEM })).status, 201);
});

test('search folds case, Turkish letters and accents', { skip: sqlSkip }, async () => {
  const w = loadWorker([KP.jwk]);
  const tok = await idToken(KP);
  await w.call('POST', '/store/items', { token: tok, body: { ...ITEM, name: 'Çay masası', tags: ['İskandinav'] } });
  await w.call('POST', '/store/items', { token: tok, body: { ...ITEM, name: 'ŞIK KOLTUK', tags: [] } });
  for (const [q, n] of [['çay', 1], ['CAY', 1], ['masasi', 1], ['iskandinav', 1], ['şık', 1], ['sik koltuk', 1], ['koltuk', 1], ['%', 2], ['dolap', 0]]) {
    assert.strictEqual((await w.call('GET', '/store/items?q=' + encodeURIComponent(q))).json.items.length, n, q);
  }
});

test('a banned author cannot edit or report; Google key rotation and outages are handled', { skip: sqlSkip }, async () => {
  const keys = [KP.jwk];
  const w = loadWorker(keys, { STORE_ADMINS: '9000' });
  const ada = await idToken(KP), admin = await idToken(KP, { sub: '9000' });
  const id = (await w.call('POST', '/store/items', { token: ada, body: ITEM })).json.item.id;
  const other = (await w.call('POST', '/store/items', { token: admin, body: ITEM })).json.item.id;
  await w.call('POST', '/store/users/1001/ban', { token: admin });
  assert.strictEqual((await w.call('PUT', '/store/items/' + id, { token: ada, body: ITEM })).status, 403);
  assert.strictEqual((await w.call('POST', `/store/items/${other}/report`, { token: ada })).status, 403);
  // a token signed with a key the worker has not seen yet: one refetch (after the 60 s throttle) finds it
  const t0 = Date.now();
  keys.push(KP2.jwk);
  assert.strictEqual(await w.verifyGoogleToken(await idToken(KP2), w.env, undefined, t0), null, 'throttled: no refetch within 60 s');
  const later = t0 + 61000, tok2 = await idToken(KP2, { exp: Math.floor(later / 1000) + 3600 });
  assert.deepStrictEqual(await w.verifyGoogleToken(tok2, w.env, undefined, later), { sub: '1001', name: 'Ada' });
  const down = loadWorker([KP.jwk]);
  down.fetchMock.fail = true;
  assert.strictEqual((await down.call('GET', '/store/items', { token: ada })).status, 503, 'key fetch failure is not "invalid sign-in"');
});

test('example furniture is seeded once, searchable in Turkish and English, and a deleted example stays deleted', { skip: sqlSkip }, async () => {
  assert.ok(SEED.length >= 14, 'examples present');
  const w = loadWorker([KP.jwk], { STORE_ADMINS: '9000' }, SEED);
  const list = (await w.call('GET', '/store/items')).json.items;
  assert.strictEqual(list.length, SEED.length, 'every example passes the publish rules');
  assert.strictEqual(list[0].id, SEED[0].id, 'first example is newest');
  assert.ok(list.every(it => it.author === 'Floor Planner' && it.thumb.startsWith('<svg')));
  for (const [q, id] of [['yemek masası', 'ex-table'], ['dining', 'ex-table'], ['bilardo', 'ex-billiards'], ['gardirop', 'ex-wardrobe'], ['ŞÖMİNE', 'ex-fireplace']]) {
    assert.ok((await w.call('GET', '/store/items?q=' + encodeURIComponent(q))).json.items.some(it => it.id === id), q);
  }
  const full = (await w.call('GET', '/store/items/ex-billiards')).json.item;
  assert.ok(full.preset.extra.parts.length >= 20);
  assert.strictEqual((await w.call('DELETE', '/store/items/ex-table', { token: await idToken(KP, { sub: '9000' }) })).status, 200);
  w.env.STORE.get().seed(SEED); // a restart runs the seed again
  assert.ok(!(await w.call('GET', '/store/items')).json.items.some(it => it.id === 'ex-table'), 'not re-added');
});

test('STORE_ADMINS accepts a verified e-mail; the e-mail is never forwarded or stored', { skip: sqlSkip }, async () => {
  const w = loadWorker([KP.jwk], { STORE_ADMINS: ' 9000 , Boss@Example.com ' });
  const ada = await idToken(KP);
  const id = (await w.call('POST', '/store/items', { token: ada, body: ITEM })).json.item.id;
  const boss = await idToken(KP, { sub: '5005', email: 'boss@example.com', email_verified: true });
  const fake = await idToken(KP, { sub: '6006', email: 'boss@example.com', email_verified: false });
  assert.strictEqual((await w.call('GET', '/store/items', { token: boss })).json.admin, true);
  assert.strictEqual((await w.call('GET', '/store/items', { token: fake })).json.admin, false, 'unverified e-mail is not an admin');
  assert.strictEqual((await w.call('GET', '/store/items', { token: ada })).json.admin, false);
  assert.strictEqual((await w.call('DELETE', '/store/items/' + id, { token: boss })).status, 200);
  const db = JSON.stringify(w.env.STORE.get().rows('SELECT * FROM users'));
  assert.ok(!/@/.test(db), 'no e-mail in the database: ' + db);
});

test('publish limits: 10 per day per account', { skip: sqlSkip }, async () => {
  const w = loadWorker([KP.jwk]);
  const tok = await idToken(KP);
  for (let i = 0; i < 10; i++) assert.strictEqual((await w.call('POST', '/store/items', { token: tok, body: { ...ITEM, name: 'Desk ' + i } })).status, 201);
  assert.strictEqual((await w.call('POST', '/store/items', { token: tok, body: ITEM })).status, 429);
  const page = await w.call('GET', '/store/items');
  assert.strictEqual(page.json.items[0].name, 'Desk 9', 'newest first');
});

test('wrangler.toml binds FurnStore with a SQLite migration and the Google audience', () => {
  assert.match(wranglerSrc, /\{\s*name\s*=\s*"STORE",\s*class_name\s*=\s*"FurnStore"\s*\}/);
  assert.match(wranglerSrc, /new_sqlite_classes\s*=\s*\["FurnStore"\]/);
  const cid = /GOOGLE_CLIENT_ID\s*=\s*"([^"]+)"/.exec(wranglerSrc);
  assert.ok(cid && appSrc.includes(`'${cid[1]}'`), 'worker audience = the app client id');
});

/* ---------- MCP: store_search / store_place against a local fake store ---------- */
test('MCP store_search lists items and store_place puts one in the plan with its parts, cleaned', async () => {
  const http = require('http');
  const item = { id: 'abcdefgh23', name: 'Oak "desk"', desc: 'Simple', cat: 4, tags: ['desk'], thumb: THUMB, w: 120, d: 60, author: 'Ada', uses: 2 };
  const seen = [];
  const srv = http.createServer((req, res) => {
    seen.push(req.url);
    res.setHeader('Content-Type', 'application/json');
    if (req.url.startsWith('/store/items/abcdefgh23')) res.end(JSON.stringify({ item: { ...item, preset: { ...PRESET, type: 'x<script>' } } }));
    else if (req.url.startsWith('/store/items?')) res.end(JSON.stringify({ items: [item], next: null }));
    else { res.statusCode = 404; res.end('{"error":"not found"}'); }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const prev = process.env.FP_STORE_URL;
  process.env.FP_STORE_URL = 'http://127.0.0.1:' + srv.address().port;
  const { mcpClient } = require('./helpers/repo');
  const c = mcpClient();
  try {
    await c.call('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    const s = await c.tool('store_search', { q: 'desk', category: 4, sort: 'popular' });
    assert.ok(!s.err, s.text);
    assert.match(s.text, /abcdefgh23 "Oak desk" — 120×60 cm, by Ada/);
    assert.ok(seen.some(u => /q=desk/.test(u) && /cat=4/.test(u) && /sort=popular/.test(u)), seen.join(' '));
    const pl = await c.tool('store_place', { id: 'abcdefgh23', x: 100, y: 50, rot: 90 });
    assert.ok(!pl.err, pl.text);
    assert.match(pl.text, /1 parts/);
    const proj = JSON.parse((await c.tool('get_project')).text);
    const o = proj.floors[0].furn.find(f => f.name === 'Oak desk');
    assert.ok(o, 'placed');
    assert.strictEqual(o.type, 'xscript');
    assert.deepStrictEqual([o.x, o.y, o.rot, o.w, o.d, o.h, o.parts.length], [100, 50, 90, 120, 60, 75, 1]);
    assert.ok((await c.tool('store_place', { id: '../etc', x: 0, y: 0 })).err);
  } finally {
    c.stop(); srv.close();
    if (prev === undefined) delete process.env.FP_STORE_URL; else process.env.FP_STORE_URL = prev;
  }
});

/* ---------- app wiring (real functions) ---------- */
test('app: Community tab sits before My Library, store endpoint honours ?store=, cards escape names', () => {
  assert.match(appSrc, /const LIBCATS = \['Kapı & Pencere', \.\.\.CATS, '🌐 Topluluk', '⬡ Kütüphanem'\]/);
  assert.match(appSrc, /const LIB_COMM = LIBCATS\.length - 2;/);
  const STORE_BASE = 'https://floorplanner-presence.alieferdinc.workers.dev';
  assert.ok(appSrc.includes(`const PRESENCE_URL = 'wss://${STORE_BASE.slice(8)}/ws'`), 'store and presence share the worker');
  const storeEndpoint = new Function('STORE_BASE', fnSrcOf(appSrc, 'storeEndpoint') + '\nreturn storeEndpoint;')(STORE_BASE);
  const loc = (protocol, search = '') => ({ protocol, search });
  assert.strictEqual(storeEndpoint(STORE_BASE, loc('https:')), STORE_BASE);
  assert.strictEqual(storeEndpoint(STORE_BASE, loc('file:')), '');
  assert.strictEqual(storeEndpoint(STORE_BASE, loc('https:', '?store=off')), '');
  assert.strictEqual(storeEndpoint(STORE_BASE, loc('http:', '?store=http://127.0.0.1:8787/')), 'http://127.0.0.1:8787');
  assert.strictEqual(storeEndpoint(STORE_BASE, loc('https:', '?store=javascript:alert(1)')), STORE_BASE);
  for (const evil of ['https://evil.example', 'http://127.0.0.1.evil.example', 'http://localhost@evil.example', 'https://evil.example/?x=http://127.0.0.1'])
    assert.strictEqual(storeEndpoint(STORE_BASE, loc('https:', '?store=' + encodeURIComponent(evil))), STORE_BASE, 'only loopback overrides: ' + evil);
  assert.strictEqual(storeEndpoint(STORE_BASE, loc('http:', '?store=http://localhost:8787')), 'http://localhost:8787');
  const api = fnSrcOf(appSrc, 'storeApi');
  assert.match(api, /auth === true \|\| auth === 'opt'/, 'the sign-in token is only sent when a call asks for it');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const card = new Function('esc', 'L', fnSrcOf(appSrc, 'storeCardHtml') + '\nreturn storeCardHtml;')(esc, (a, b) => b);
  const h = card({ id: 'abcdefgh23', name: '<img src=x onerror=1>', desc: '', w: 1, d: 1, author: 'a"b', thumb: '' });
  assert.ok(!h.includes('<img') && h.includes('&lt;img') && h.includes('a&quot;b'));
  for (const fn of ['storeItemPreset', 'storeLight']) assert.match(fnSrcOf(appSrc, fn), /sanitizePlan\(/, fn + ' sanitises store data');
  assert.match(fnSrcOf(appSrc, 'storeLight'), /storeThumbClean\(/);
});
