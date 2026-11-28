/* Sun position from location, date and time (#205): the SITE-SUN block (shared verbatim with mcp/server.js),
   the solar formula against known values, plan north, cleanup, and the MCP set_site tool. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, markerBlock, mcpClient } = require('./helpers/repo');

const src = read('app.js');
const api = new Function(markerBlock(src, 'SITE-SUN') + '\nreturn { SITE_CITIES, siteP, cleanSite, sunPosition, siteSun };')();
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);

test('SITE-SUN block is identical in app.js and mcp/server.js', () => {
  assert.strictEqual(markerBlock(read('mcp/server.js'), 'SITE-SUN'), markerBlock(src, 'SITE-SUN'));
});

test('sun position matches known values', () => {
  const ist = api.siteP({ site: { lat: 41.01, lon: 28.98, tz: 3 } });
  // midsummer in Istanbul: solar noon ≈ 13:06 local, altitude 90 − 41.01 + 23.44 ≈ 72.4°
  const noon = api.siteSun(ist, '2026-06-21', 13.1);
  near(noon.alt, 72.43, 0.5, 'Istanbul solstice noon altitude'); near(noon.az, 180, 2, 'due south at solar noon');
  // sunrise ≈ 05:30 in the north-east, sunset ≈ 20:40 in the north-west
  const am = api.siteSun(ist, '2026-06-21', 5.5), pm = api.siteSun(ist, '2026-06-21', 20.66);
  near(am.alt, 0, 1.5, 'sunrise'); assert.ok(am.az > 50 && am.az < 70, 'sunrise azimuth ' + am.az);
  near(pm.alt, 0, 1.5, 'sunset'); assert.ok(pm.az > 290 && pm.az < 310, 'sunset azimuth ' + pm.az);
  // midwinter noon is low: 90 − 41 − 23.4 ≈ 25.5°
  near(api.siteSun(ist, '2026-12-21', 13.05).alt, 25.5, 0.7, 'Istanbul winter noon');
  // southern hemisphere: the noon sun is in the north
  const syd = api.siteSun(api.siteP({ site: { lat: -33.87, lon: 151.21, tz: 10 } }), '2026-06-21', 11.95);
  assert.ok(syd.az > 355 || syd.az < 5, 'Sydney noon sun due north: ' + syd.az); near(syd.alt, 32.7, 0.7, 'Sydney winter noon');
  // equator at the March equinox: overhead at noon UTC
  assert.ok(api.siteSun(api.siteP({ site: { lat: 0, lon: 0, tz: 0 } }), '2026-03-20', 12.1).alt > 87);
  // at night the sun is below the horizon
  assert.ok(api.siteSun(ist, '2026-06-21', 1).alt < -15);
  assert.strictEqual(api.siteSun(ist, 'bad', 12), null);
});

test('plan north turns the sun with the drawing', () => {
  const s0 = api.siteP({ site: { lat: 41.01, lon: 28.98, tz: 3 } });
  const s90 = api.siteP({ site: { lat: 41.01, lon: 28.98, tz: 3, north: 90 } });
  const a = api.siteSun(s0, '2026-06-21', 9), b = api.siteSun(s90, '2026-06-21', 9);
  near(b.az, (a.az + 90) % 360, 1e-9, 'north 90° turns the plan azimuth'); assert.strictEqual(b.trueAz, a.trueAz); assert.strictEqual(b.alt, a.alt);
});

test('siteP defaults and cleanSite', () => {
  const d = api.siteP({});
  assert.strictEqual(d.has, false); assert.strictEqual(d.north, 0); assert.ok(Number.isFinite(d.lat) && Number.isFinite(d.tz));
  assert.strictEqual(api.siteP({ site: { lat: 51.5, lon: -0.1 } }).tz, 0, 'tz defaults from the longitude');
  const P = { site: { lat: 95, lon: '200', tz: 20, north: -30 } }; api.cleanSite(P);
  assert.deepStrictEqual(P.site, { lat: 90, lon: 180, tz: 14, north: 330 });
  const Q = { site: { north: 0, lat: 'x' } }; api.cleanSite(Q); assert.ok(!('site' in Q), 'empty / default site is removed');
  const R = { site: { lat: 41 } }; api.cleanSite(R); assert.ok(!('site' in R), 'lat without lon is dropped');
  const S = { site: null }; api.cleanSite(S); assert.ok(!('site' in S));
  for (const [, v] of Object.entries(api.SITE_CITIES)) assert.ok(v.length === 5 && Math.abs(v[2]) <= 90 && Math.abs(v[3]) <= 180);
});

test('MCP set_site: city, custom values, summarize, clear', async t => {
  const c = mcpClient();
  t.after(() => c.stop());
  await c.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'site-sun-test', version: '1' } });
  assert.ok(!(await c.tool('new_project', { name: 'Site' })).err);
  const r1 = await c.tool('set_site', { city: 'izmir', north: 15 });
  assert.ok(!r1.err, r1.text); assert.match(r1.text, /38\.42/);
  let p = JSON.parse((await c.tool('get_project', {})).text);
  assert.deepStrictEqual(p.site, { lat: 38.42, lon: 27.14, tz: 3, north: 15 });
  assert.match((await c.tool('summarize', {})).text, /true north 15°/);
  assert.ok((await c.tool('set_site', { city: 'atlantis' })).err);
  assert.ok(!(await c.tool('set_site', { clear: true })).err);
  p = JSON.parse((await c.tool('get_project', {})).text);
  assert.ok(!('site' in p));
  assert.ok((await c.tool('set_site', { lat: 10 })).err, 'lat without lon is refused');
});
