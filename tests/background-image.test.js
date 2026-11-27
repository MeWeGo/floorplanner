/* Issue #187: background image bytes live in TEX + IndexedDB instead of P.bg.src.
   Cuts the real functions out of app.js and runs them in an isolated sandbox. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf, constLineOf } = require('./helpers/repo');

const src = read('app.js');

function makeSandbox() {
  const TEX = new Map();
  const dbCalls = [];
  let uidCounter = 0;

  const box = new Function('TEX', 'dbCalls', 'nextUid', `
    let P = null;
    const ui = { exporting: false };
    const uid = () => 'u' + nextUid();
    const cacheTex = (id, data) => {
      const entry = { data, url: 'blob:' + id };
      TEX.set(id, entry);
      return entry;
    };
    const dbPut = (store, value) => {
      dbCalls.push({ store, value });
      return Promise.resolve();
    };

    ${constLineOf(src, 'bgData')}
    ${fnSrcOf(src, 'bgAbsorb')}
    ${fnSrcOf(src, 'bgInline')}
    ${constLineOf(src, 'texRefIds')}
    ${fnSrcOf(src, 'bundleTextures')}
    ${fnSrcOf(src, 'bgSvg')}

    return {
      get P() { return P; },
      set P(v) { P = v; },
      ui,
      TEX,
      dbCalls,
      cacheTex,
      bgData,
      bgAbsorb,
      bgInline,
      texRefIds,
      bundleTextures,
      bgSvg,
    };
  `)(TEX, dbCalls, () => ++uidCounter);

  return box;
}

test('1. bgAbsorb moves data:image src into TEX + dbPut and leaves non-data/missing bg untouched', () => {
  const sb = makeSandbox();
  const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
  const bg = { id: 'bg', src: dataUrl, x: 10, y: 20, w: 800, h: 600, op: 0.5 };

  const ret = sb.bgAbsorb(bg);
  assert.strictEqual(ret, bg);
  assert.ok(typeof bg.img === 'string' && bg.img.startsWith('bg'));
  assert.strictEqual('src' in bg, false);
  assert.deepStrictEqual(sb.TEX.get(bg.img), { data: dataUrl, url: 'blob:' + bg.img });
  assert.strictEqual(sb.dbCalls.length, 1);
  assert.deepStrictEqual(sb.dbCalls[0], {
    store: 'textures',
    value: { id: bg.img, data: dataUrl },
  });

  // Non-data src untouched
  const urlBg = { id: 'bg', src: 'https://example.com/plan.png', x: 0, y: 0, w: 100, h: 100, op: 0.5 };
  assert.strictEqual(sb.bgAbsorb(urlBg), urlBg);
  assert.strictEqual(urlBg.src, 'https://example.com/plan.png');
  assert.strictEqual('img' in urlBg, false);
  assert.strictEqual(sb.dbCalls.length, 1);

  // Missing / empty bg untouched
  assert.strictEqual(sb.bgAbsorb(null), null);
  assert.strictEqual(sb.bgAbsorb(undefined), undefined);
  const emptyBg = { id: 'bg', x: 0, y: 0 };
  assert.strictEqual(sb.bgAbsorb(emptyBg), emptyBg);
  assert.strictEqual(sb.dbCalls.length, 1);
});

test('2. undo snapshot size: JSON.stringify of project after absorbing 2 MB data URL is under 2 KB', () => {
  const sb = makeSandbox();
  const twoMbDataUrl = 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024);
  const proj = {
    v: 2,
    id: 'proj_undo_test',
    name: 'Big Bg Plan',
    floors: [{ id: 'f1', name: 'Ground', walls: [], ops: [], furn: [], rooms: [] }],
    bg: { id: 'bg', src: twoMbDataUrl, x: 0, y: 0, w: 1200, h: 800, op: 0.5, lock: false },
  };

  sb.bgAbsorb(proj.bg);
  const snapSize = JSON.stringify(proj).length;
  assert.ok(snapSize < 2048, `expected snapshot < 2048 bytes, got ${snapSize}`);
});

test('3. bgInline returns a copy with src and no img, null when unknown, without mutating original', () => {
  const sb = makeSandbox();
  const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const bg = { id: 'bg', src: dataUrl, x: 5, y: 15, w: 600, h: 400, op: 0.7 };
  sb.bgAbsorb(bg);
  const imgId = bg.img;

  const inlined = sb.bgInline(bg);
  assert.notStrictEqual(inlined, bg);
  assert.strictEqual(inlined.src, dataUrl);
  assert.strictEqual('img' in inlined, false);
  assert.strictEqual(inlined.x, 5);
  assert.strictEqual(inlined.y, 15);
  assert.strictEqual(inlined.w, 600);
  assert.strictEqual(inlined.h, 400);
  assert.strictEqual(inlined.op, 0.7);

  // Original not mutated
  assert.strictEqual(bg.img, imgId);
  assert.strictEqual('src' in bg, false);

  // Unknown image or null returns null
  assert.strictEqual(sb.bgInline(null), null);
  assert.strictEqual(sb.bgInline({ id: 'bg', img: 'missing_img', x: 0, y: 0, w: 100, h: 100, op: 0.5 }), null);
});

test('4. bundleTextures inlines bg.src, keeps texture data in texData, and preserves bg metadata when missing', () => {
  const sb = makeSandbox();
  const bgDataUrl = 'data:image/png;base64,BGDATA';
  const texDataUrl = 'data:image/png;base64,TEXDATA';
  sb.cacheTex('tex1', texDataUrl);

  const bg = { id: 'bg', src: bgDataUrl, x: 10, y: 20, w: 500, h: 400, op: 0.6 };
  sb.bgAbsorb(bg);

  const proj = {
    v: 2,
    textures: [{ id: 'tex1', name: 'Tile', w: 60, h: 60 }],
    bg,
  };

  const bundled = sb.bundleTextures(proj);
  assert.strictEqual(bundled.bg.src, bgDataUrl);
  assert.strictEqual('img' in bundled.bg, false);
  assert.deepStrictEqual(bundled.texData, { tex1: texDataUrl });
  // Original proj.bg still references img
  assert.ok(proj.bg.img);

  // Missing bg image keeps bg metadata
  const missingBgProj = {
    v: 2,
    textures: [],
    bg: { id: 'bg', img: 'unknown_id', x: 30, y: 40, w: 300, h: 200, op: 0.8 },
  };
  const bundledMissing = sb.bundleTextures(missingBgProj);
  assert.deepStrictEqual(bundledMissing.bg, missingBgProj.bg);
  assert.strictEqual('texData' in bundledMissing, false);
});

test('5. JSON round trip: bundleTextures -> JSON -> bgAbsorb preserves geometry and image data', () => {
  const sb1 = makeSandbox();
  const originalData = 'data:image/png;base64,ROUNDTRIPDATA123';
  const proj = {
    v: 2,
    textures: [],
    bg: { id: 'bg', src: originalData, x: 15, y: 25, w: 1000, h: 750, op: 0.45 },
  };
  sb1.bgAbsorb(proj.bg);

  const json = JSON.stringify(sb1.bundleTextures(proj));

  // Fresh sandbox (simulates opening JSON in a new session)
  const sb2 = makeSandbox();
  const loaded = JSON.parse(json);
  assert.strictEqual(loaded.bg.src, originalData);
  sb2.bgAbsorb(loaded.bg);

  assert.strictEqual(loaded.bg.x, 15);
  assert.strictEqual(loaded.bg.y, 25);
  assert.strictEqual(loaded.bg.w, 1000);
  assert.strictEqual(loaded.bg.h, 750);
  assert.strictEqual(loaded.bg.op, 0.45);
  assert.strictEqual('src' in loaded.bg, false);
  assert.ok(loaded.bg.img);
  assert.strictEqual(sb2.bgData(loaded.bg), originalData);
});

test('6. texRefIds lists texture ids plus bg.img', () => {
  const sb = makeSandbox();
  assert.deepStrictEqual(
    sb.texRefIds({ textures: [{ id: 't1' }, { id: 't2' }], bg: { id: 'bg', img: 'bg99' } }),
    ['t1', 't2', 'bg99']
  );
  assert.deepStrictEqual(
    sb.texRefIds({ textures: [{ id: 't1' }], bg: { id: 'bg', src: 'data:image/png;base64,X' } }),
    ['t1']
  );
  assert.deepStrictEqual(sb.texRefIds({ textures: [] }), []);
  assert.deepStrictEqual(sb.texRefIds(null), []);
});

test('7. bgSvg uses blob url when live, data URL when exporting or live=false, renders legacy src, and returns empty for unknown image', () => {
  const sb = makeSandbox();
  const dataUrl = 'data:image/png;base64,SVGDATA';
  const bg = { id: 'bg', src: dataUrl, x: 0, y: 0, w: 800, h: 600, op: 0.5 };
  sb.bgAbsorb(bg);
  sb.P = { bg };

  // Live uses blob URL
  sb.ui.exporting = false;
  const liveSvg = sb.bgSvg(true);
  assert.ok(liveSvg.includes(`href="blob:${bg.img}"`), `expected blob URL in: ${liveSvg}`);

  // ui.exporting = true uses data URL
  sb.ui.exporting = true;
  const exportingSvg = sb.bgSvg(true);
  assert.ok(exportingSvg.includes(`href="${dataUrl}"`), `expected data URL when exporting in: ${exportingSvg}`);

  // live = false uses data URL
  sb.ui.exporting = false;
  const nonLiveSvg = sb.bgSvg(false);
  assert.ok(nonLiveSvg.includes(`href="${dataUrl}"`), `expected data URL when live=false in: ${nonLiveSvg}`);

  // Legacy bg with src still renders
  const legacyData = 'data:image/png;base64,LEGACY';
  sb.P = { bg: { id: 'bg', src: legacyData, x: 1, y: 2, w: 300, h: 200, op: 0.4 } };
  assert.ok(sb.bgSvg(true).includes(`href="${legacyData}"`));
  assert.ok(sb.bgSvg(false).includes(`href="${legacyData}"`));

  // Unknown image or null bg renders empty string
  sb.P = { bg: { id: 'bg', img: 'missing_bg', x: 0, y: 0, w: 100, h: 100, op: 0.5 } };
  assert.strictEqual(sb.bgSvg(true), '');
  sb.P = { bg: null };
  assert.strictEqual(sb.bgSvg(true), '');
});

