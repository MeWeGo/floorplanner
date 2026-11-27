/* Project sync tests: QR encoder, share links, plan sanitization, strHash, and Google Drive gdSyncOnce.
   Cuts the real functions and marker block out of app.js and runs them in isolated sandboxes. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { read, fnSrcOf, markerBlock, constLineOf } = require('./helpers/repo');

const src = read('app.js');

const fnSrc = name => fnSrcOf(src, name);

const constLine = name => constLineOf(src, name);

const qrMod = new Function(`
  ${markerBlock(src, 'QR-ENCODE')}
  return { qrEncode, qrSvg, QR_ECC, qrRawModules };
`)();

const shareMod = new Function(`
  const L = (tr, en) => en;
  ${fnSrc('b64url')}
  ${fnSrc('unb64url')}
  ${constLine('streamBytes')}
  ${fnSrc('shareEncode')}
  ${fnSrc('shareDecode')}
  ${fnSrc('sanitizePlan')}
  ${fnSrc('strHash')}
  return { b64url, unb64url, shareEncode, shareDecode, sanitizePlan, strHash };
`)();

function makeDriveEnv(initialP) {
  const storage = new Map();
  const localStorage = {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)); },
    removeItem: k => { storage.delete(k); },
    clear: () => { storage.clear(); },
  };
  const toasts = [];
  let syncModalCalls = 0;
  let uidCounter = 0;

  const env = new Function('initialP', 'localStorage', 'toasts', 'onSyncModal', 'nextUid', `
    let P = initialP;
    const ui = { modal: null };
    const TEX = new Map();
    const L = (tr, en) => en;
    const isEN = () => true;
    const uid = () => 'u' + nextUid();
    const pid = () => uid() + uid();
    const toast = m => { toasts.push(m); };
    const syncModal = () => { onSyncModal(); };
    const gdUI = () => {};
    const dataUrlBlob = d => new Blob([d]);
    const dbGet = async () => null;
    const dbPut = async () => {};
    const cacheTex = () => {};
    ${constLineOf(src, 'texRefIds')}
    const adoptActive = o => { P = o; return true; };
    const syncIdle = () => true;
    ${fnSrc('isPristine')}

    ${fnSrc('sanitizePlan')}
    ${constLine('GD_API')}
    ${constLine('GD_FOLDER')}
    ${constLine('gd')}
    ${constLine('lsJson')}
    ${constLine('lsSet')}
    ${constLine('gdCfg')}
    ${constLine('gdState')}
    ${fnSrc('gdSetState')}
    ${fnSrc('strHash')}
    ${constLine('gdName')}
    ${constLine('gdQ')}
    ${fnSrc('gdExpired')}
    ${fnSrc('gdFetch')}
    ${fnSrc('gdList')}
    ${fnSrc('gdFolder')}
    ${fnSrc('gdUpload')}
    ${constLine('gdTexFile')}
    ${fnSrc('gdPushTex')}
    ${fnSrc('gdPullTex')}
    ${fnSrc('gdSyncOnce')}

    return {
      get P() { return P; },
      set P(v) { P = v; },
      gd,
      ui,
      gdState,
      gdSetState,
      gdSyncOnce,
      gdFetch,
      gdList,
      gdUpload,
      strHash,
      localStorage,
      toasts,
    };
  `)(initialP, localStorage, toasts, () => { syncModalCalls++; }, () => ++uidCounter);

  return {
    env,
    storage,
    toasts,
    get syncModalCalls() { return syncModalCalls; },
    resetCounters() { syncModalCalls = 0; toasts.length = 0; },
  };
}

function createFakeDrive() {
  const files = new Map();
  const requests = [];
  let seq = 0;

  function makeResponse(status, body, isJson = true) {
    const textVal = typeof body === 'string' ? body : JSON.stringify(body);
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() { return isJson ? JSON.parse(textVal) : JSON.parse(textVal); },
      async text() { return textVal; },
      async blob() { return new Blob([textVal]); },
    };
  }

  function matchesQuery(file, q) {
    if (/\btrashed\s*=\s*false\b/.test(q) && file.trashed) return false;
    const fpIdM = /key='fpId'\s+and\s+value='([^']*)'/.exec(q);
    if (fpIdM && (!file.appProperties || file.appProperties.fpId !== fpIdM[1])) return false;
    const fpM = /key='fp'\s+and\s+value='([^']*)'/.exec(q);
    if (fpM && (!file.appProperties || file.appProperties.fp !== fpM[1])) return false;
    const fpTexM = /key='fpTex'\s+and\s+value='([^']*)'/.exec(q);
    if (fpTexM && (!file.appProperties || file.appProperties.fpTex !== fpTexM[1])) return false;
    const mimeM = /mimeType='([^']*)'/.exec(q);
    if (mimeM && file.mimeType !== mimeM[1]) return false;
    const nameM = /name='([^']*)'/.exec(q);
    if (nameM && file.name !== nameM[1]) return false;
    return true;
  }

  async function parseMultipart(contentType, bodyBlob) {
    const bm = /boundary=([^\s;]+)/.exec(contentType || '');
    assert.ok(bm, 'missing multipart boundary');
    const raw = await bodyBlob.text();
    const parts = raw.split('--' + bm[1]).slice(1, -1);
    assert.strictEqual(parts.length, 2, 'expected 2 multipart parts');
    const parsePart = part => {
      const idx = part.indexOf('\r\n\r\n');
      assert.ok(idx >= 0, 'malformed multipart part');
      let body = part.slice(idx + 4);
      if (body.endsWith('\r\n')) body = body.slice(0, -2);
      return body;
    };
    return {
      meta: JSON.parse(parsePart(parts[0])),
      content: parsePart(parts[1]),
    };
  }

  async function fetch(url, opt = {}) {
    const method = (opt.method || 'GET').toUpperCase();
    const u = new URL(url);
    requests.push({ method, pathname: u.pathname, search: u.search });

    // Upload multipart (POST create or PATCH update)
    if (u.pathname.startsWith('/upload/drive/v3/files')) {
      assert.strictEqual(u.searchParams.get('uploadType'), 'multipart');
      const ct = (opt.headers && (opt.headers['Content-Type'] || opt.headers['content-type'])) || '';
      const { meta, content } = await parseMultipart(ct, opt.body);
      if (method === 'POST') {
        const id = 'gdf_' + (++seq);
        const rec = {
          id,
          name: meta.name,
          mimeType: meta.mimeType || 'application/json',
          parents: meta.parents || [],
          appProperties: { ...(meta.appProperties || {}) },
          content,
          version: 1,
          trashed: false,
        };
        files.set(id, rec);
        return makeResponse(200, { id: rec.id, version: String(rec.version) });
      }
      if (method === 'PATCH') {
        const id = u.pathname.split('/').pop();
        const rec = files.get(id);
        if (!rec) return makeResponse(404, { error: { message: 'Not found' } });
        if (meta.name !== undefined) rec.name = meta.name;
        if (meta.appProperties) rec.appProperties = { ...rec.appProperties, ...meta.appProperties };
        rec.content = content;
        rec.version += 1;
        return makeResponse(200, { id: rec.id, version: String(rec.version) });
      }
    }

    // List files
    if (u.pathname === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q') || '';
      const matched = [];
      for (const f of files.values()) {
        if (matchesQuery(f, q)) {
          matched.push({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            appProperties: f.appProperties,
            version: String(f.version),
          });
        }
      }
      return makeResponse(200, { files: matched });
    }

    // Create folder (metadata-only POST)
    if (u.pathname === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(opt.body);
      const id = 'gddir_' + (++seq);
      const rec = {
        id,
        name: meta.name,
        mimeType: meta.mimeType,
        appProperties: meta.appProperties || {},
        version: 1,
        trashed: false,
      };
      files.set(id, rec);
      return makeResponse(200, { id });
    }

    // Get file metadata or alt=media
    if (u.pathname.startsWith('/drive/v3/files/') && method === 'GET') {
      const id = u.pathname.split('/').pop();
      const rec = files.get(id);
      if (!rec) return makeResponse(404, { error: { message: 'Not found' } });
      if (u.searchParams.get('alt') === 'media') {
        return makeResponse(200, rec.content, false);
      }
      return makeResponse(200, {
        id: rec.id,
        name: rec.name,
        version: String(rec.version),
        trashed: !!rec.trashed,
        appProperties: rec.appProperties,
      });
    }

    return makeResponse(404, { error: { message: 'Unhandled Drive endpoint: ' + method + ' ' + u.pathname } });
  }

  return { files, requests, fetch };
}

test('(1) QR block: dimensions, version 1, overflow, finder patterns, dark module, determinism, and qrSvg', () => {
  const { qrEncode, qrSvg } = qrMod;

  const qHi = qrEncode('hi');
  assert.ok(qHi);
  assert.strictEqual(qHi.version, 1);
  assert.strictEqual(qHi.size, qHi.version * 4 + 17);
  assert.strictEqual(qHi.mods.length, qHi.size * qHi.size);

  // Too long for version 40
  assert.strictEqual(qrEncode('a'.repeat(5000)), null);
  assert.strictEqual(qrEncode('a'.repeat(5000), 'L'), null);

  // Check finder patterns (7x7 dark outer border, 5x5 light ring, 3x3 dark center) and dark module
  for (const text of ['hi', 'https://mewego.github.io/floorplanner/#fp=1.abc', 'x'.repeat(120)]) {
    const q = qrEncode(text, 'M');
    assert.ok(q);
    assert.strictEqual(q.size, q.version * 4 + 17);

    const corners = [
      [0, 0],
      [q.size - 7, 0],
      [0, q.size - 7],
    ];
    for (const [ox, oy] of corners) {
      for (let dy = 0; dy < 7; dy++) {
        for (let dx = 0; dx < 7; dx++) {
          const val = q.mods[(oy + dy) * q.size + (ox + dx)];
          const isBorder = dx === 0 || dx === 6 || dy === 0 || dy === 6;
          const isCenter3x3 = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
          const expected = isBorder || isCenter3x3 ? 1 : 0;
          assert.strictEqual(val, expected, `finder mismatch at (${ox + dx}, ${oy + dy}) for v=${q.version}`);
        }
      }
    }

    // Dark module at (8, size - 8)
    assert.strictEqual(q.mods[(q.size - 8) * q.size + 8], 1);
  }

  // Determinism
  const q1 = qrEncode('Kat planı: Salon & Mutfak', 'M');
  const q2 = qrEncode('Kat planı: Salon & Mutfak', 'M');
  assert.strictEqual(q1.version, q2.version);
  assert.strictEqual(q1.size, q2.size);
  assert.deepStrictEqual(Array.from(q1.mods), Array.from(q2.mods));

  // qrSvg
  const svg = qrSvg('hi', 'M', 4);
  assert.ok(svg.startsWith('<svg '));
  assert.ok(svg.includes('fill="#fff"'));
  assert.ok(svg.includes('<rect '));
  assert.ok(svg.includes('<path '));
  assert.strictEqual(qrSvg('a'.repeat(5000)), '');
});

test('(2) Optional QR decode check with Python cv2.QRCodeDetector', t => {
  const probe = spawnSync('python', ['-I', '-c', 'import cv2'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    t.skip('python or cv2 not available');
    return;
  }

  const { qrEncode, QR_ECC, qrRawModules } = qrMod;
  const scale = 4;
  const qz = 4;

  function makePayload(v, ecl) {
    if (v === 1) return 'Kat planı!';
    const T = QR_ECC[ecl];
    const cap = Math.floor(qrRawModules(v) / 8) - T[0][v] * T[1][v];
    const targetBytes = Math.floor((cap * 8 - 4 - (v < 10 ? 8 : 16)) / 8) - 8;
    const prefix = 'Kat planı (şğüöçıİ): ';
    return prefix + 'b'.repeat(Math.max(0, targetBytes - Buffer.byteLength(prefix)));
  }

  const pyScript = [
    'import sys, cv2',
    'd = cv2.QRCodeDetector()',
    'img = cv2.imread(sys.argv[1], cv2.IMREAD_GRAYSCALE)',
    'val, _, _ = d.detectAndDecode(img)',
    'sys.stdout.buffer.write(val.encode("utf-8"))',
  ].join('\n');

  const tmpFiles = [];
  try {
    for (const ecl of ['L', 'M']) {
      for (const targetV of [1, 5, 25, 39]) {
        const text = makePayload(targetV, ecl);
        const q = qrEncode(text, ecl);
        assert.ok(q, `failed to encode v=${targetV} ecl=${ecl}`);
        assert.strictEqual(q.version, targetV, `expected version ${targetV} for ecl=${ecl}, got ${q.version}`);

        const total = q.size + qz * 2;
        const w = total * scale;
        const header = Buffer.from(`P5\n${w} ${w}\n255\n`, 'ascii');
        const pixels = Buffer.alloc(w * w, 255);
        for (let y = 0; y < q.size; y++) {
          for (let x = 0; x < q.size; x++) {
            if (q.mods[y * q.size + x]) {
              for (let dy = 0; dy < scale; dy++) {
                for (let dx = 0; dx < scale; dx++) {
                  pixels[((y + qz) * scale + dy) * w + (x + qz) * scale + dx] = 0;
                }
              }
            }
          }
        }

        const tmpPath = path.join(os.tmpdir(), `fp-qr-${process.pid}-${ecl}-v${targetV}.pgm`);
        tmpFiles.push(tmpPath);
        fs.writeFileSync(tmpPath, Buffer.concat([header, pixels]));

        const res = spawnSync('python', ['-I', '-c', pyScript, tmpPath]);
        assert.strictEqual(res.status, 0, res.stderr ? res.stderr.toString('utf8') : 'python failed');
        const decoded = res.stdout.toString('utf8');
        assert.strictEqual(decoded, text, `decoded mismatch for ecl=${ecl} v=${targetV}`);
      }
    }
  } finally {
    for (const f of tmpFiles) {
      try { fs.unlinkSync(f); } catch (e) { }
    }
  }
});

test('(3) shareEncode / shareDecode round trip, plain 0. payload, error handling, and sanitization', async () => {
  const { b64url, shareEncode, shareDecode } = shareMod;

  const plan = {
    v: 2,
    id: 'p123',
    name: 'Örnek Kat Planı',
    floors: [{ id: 'f1', name: 'Zemin Kat', walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, t: 20 }] }],
  };

  const encoded = await shareEncode(plan);
  assert.ok(encoded.startsWith('1.'), 'CompressionStream should produce 1. prefix');
  const decoded = await shareDecode(encoded);
  assert.deepStrictEqual(decoded, plan);

  // Plain 0. payload
  const plain = '0.' + b64url(new TextEncoder().encode(JSON.stringify(plan)));
  const decodedPlain = await shareDecode(plain);
  assert.deepStrictEqual(decodedPlain, plan);

  // Garbage throws
  await assert.rejects(() => shareDecode(''));
  await assert.rejects(() => shareDecode('not-a-link'));
  await assert.rejects(() => shareDecode('2.' + encoded.slice(2)));
  await assert.rejects(() => shareDecode('0.not_valid_json_at_all'));
  await assert.rejects(() => shareDecode('1.not_valid_deflate_bytes'));

  // Missing floors array throws
  const noFloors = '0.' + b64url(new TextEncoder().encode(JSON.stringify({ name: 'No floors' })));
  await assert.rejects(() => shareDecode(noFloors));
  const badFloors = '0.' + b64url(new TextEncoder().encode(JSON.stringify({ floors: 'nope' })));
  await assert.rejects(() => shareDecode(badFloors));

  // Passes through sanitizePlan
  const dirtyJson = '{"name":"Sal\\"on<script>`x`","bg":{"src":"https://evil.example/a.png"},"__proto__":{"polluted":true},"floors":[{"id":"f1","name":"Oda\'m ğüşöçı"}]}';
  const dirtyPayload = '0.' + b64url(new TextEncoder().encode(dirtyJson));
  const clean = await shareDecode(dirtyPayload);
  assert.strictEqual(clean.name, 'Salonscriptx');
  assert.strictEqual(clean.bg, null);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(clean, '__proto__'), false);
  assert.strictEqual(clean.floors[0].name, "Oda'm ğüşöçı");
});

test('(4) sanitizePlan strips unsafe chars, keeps apostrophes & Turkish letters, normalizes numbers, drops __proto__, validates bg and texData', () => {
  const { sanitizePlan } = shareMod;

  const raw = JSON.parse(
    '{"name":"Ev\\" <test> `1`","k\\"ey<1>":{"sub`a>":"değer\'i ğüşöçıİĞÜŞÖÇ \\"ok\\""},"__proto__":{"polluted":1},"constructor":{"x":1},"prototype":{"y":1},"floors":[{"arr":["<x>",123]}]}'
  );
  raw.badNum1 = NaN;
  raw.badNum2 = Infinity;
  raw.badNum3 = -Infinity;
  raw.goodNum = -42.5;
  raw.bg = { src: 'https://example.com/bg.png', x: 0, y: 0 };
  raw.texData = {
    okPng: 'data:image/png;base64,iVBORw0KGgo=',
    okSvg: 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E',
    badHttp: 'https://example.com/t.png',
    badText: 'data:text/html;base64,PHNjcmlwdD4=',
    badJs: 'javascript:alert(1)',
  };

  const out = sanitizePlan(raw);
  assert.strictEqual(out.name, 'Ev test 1');
  assert.strictEqual(out.key1['suba'], "değer'i ğüşöçıİĞÜŞÖÇ ok");
  assert.strictEqual(out.floors[0].arr[0], 'x');
  assert.strictEqual(out.floors[0].arr[1], 123);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(out, '__proto__'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(out, 'constructor'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(out, 'prototype'), false);
  assert.strictEqual(({}).polluted, undefined);
  assert.strictEqual(out.badNum1, 0);
  assert.strictEqual(out.badNum2, 0);
  assert.strictEqual(out.badNum3, 0);
  assert.strictEqual(out.goodNum, -42.5);
  assert.strictEqual(out.bg, null);
  assert.deepStrictEqual(out.texData, {
    okPng: 'data:image/png;base64,iVBORw0KGgo=',
    okSvg: 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E',
  });

  // Valid base64 data:image bg is kept, non-base64 data:image bg is rejected
  const validBgPlan = sanitizePlan({
    bg: { src: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', x: 10, y: 20, w: 500, h: 400, op: 0.5 },
    floors: [],
  });
  assert.deepStrictEqual(validBgPlan.bg, {
    src: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
    x: 10, y: 20, w: 500, h: 400, op: 0.5,
  });

  const svgBgPlan = sanitizePlan({
    bg: { src: 'data:image/svg+xml,<svg/>' },
    floors: [],
  });
  assert.strictEqual(svgBgPlan.bg, null);
});

test('(5) strHash produces equal hashes for equal strings, distinct for different strings, and includes length', () => {
  const { strHash } = shareMod;
  assert.strictEqual(strHash('hello'), strHash('hello'));
  assert.notStrictEqual(strHash('hello'), strHash('hellp'));
  assert.notStrictEqual(strHash(''), strHash('a'));
  assert.ok(strHash('hello').endsWith(':5'));
  assert.ok(strHash('').endsWith(':0'));
  assert.ok(strHash('Kat planı').endsWith(':' + 'Kat planı'.length));
});

test('(6) gdSyncOnce against a fake in-memory Drive', async t => {
  const origFetch = globalThis.fetch;
  const drive = createFakeDrive();
  globalThis.fetch = drive.fetch;
  t.after(() => { globalThis.fetch = origFetch; });

  const makePlan = (id, name, wallX = 400) => ({
    v: 2,
    id,
    name,
    floors: [{ id: 'f1', walls: [{ id: 'w1', a: { x: 0, y: 0 }, b: { x: wallX, y: 0 }, t: 20 }], furn: [], rooms: [], dims: [], texts: [], sketches: [], drafts: [] }],
  });

  const ctx = makeDriveEnv(makePlan('proj1', 'Villa'));
  const { env } = ctx;
  env.gd.token = 'fake-oauth-token';
  env.gd.exp = Date.now() + 3600_000;

  // (a) First sync of a non-empty project creates a folder + one file with appProperties.fpId and stores state {f, v, h}
  await env.gdSyncOnce(true);
  const folders = [...drive.files.values()].filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const uploadedFiles = [...drive.files.values()].filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
  assert.strictEqual(folders.length, 1);
  assert.strictEqual(folders[0].name, 'Floor Planner');
  assert.strictEqual(uploadedFiles.length, 1);
  assert.strictEqual(uploadedFiles[0].appProperties.fpId, 'proj1');
  assert.strictEqual(uploadedFiles[0].appProperties.fp, '1');
  const st1 = env.gdState().proj1;
  assert.deepStrictEqual(st1, {
    f: uploadedFiles[0].id,
    v: '1',
    h: env.strHash(JSON.stringify(env.P)),
  });

  // (b) Second sync with no change uploads nothing
  drive.requests.length = 0;
  await env.gdSyncOnce(false);
  assert.strictEqual(
    drive.requests.some(r => r.pathname.startsWith('/upload/')),
    false,
    'no upload should happen when unchanged'
  );
  assert.strictEqual(uploadedFiles[0].version, 1);

  // (c) Local change uploads with PATCH and version grows
  drive.requests.length = 0;
  env.P.floors[0].walls[0].b.x = 650;
  await env.gdSyncOnce(false);
  const patchReq = drive.requests.find(r => r.method === 'PATCH' && r.pathname.startsWith('/upload/'));
  assert.ok(patchReq, 'local change should trigger PATCH upload');
  assert.strictEqual(uploadedFiles[0].version, 2);
  assert.strictEqual(env.gdState().proj1.v, '2');
  assert.strictEqual(env.gdState().proj1.h, env.strHash(JSON.stringify(env.P)));

  // (d) Remote change with no local change adopts the remote plan
  const remotePlan = makePlan('proj1', 'Villa Remote Edit', 900);
  uploadedFiles[0].content = JSON.stringify(remotePlan);
  uploadedFiles[0].version = 3;
  drive.requests.length = 0;
  await env.gdSyncOnce(false);
  assert.strictEqual(drive.requests.some(r => r.pathname.startsWith('/upload/')), false);
  assert.strictEqual(env.P.name, 'Villa Remote Edit');
  assert.strictEqual(env.P.floors[0].walls[0].b.x, 900);
  assert.strictEqual(env.gdState().proj1.v, '3');
  assert.strictEqual(env.gdState().proj1.h, env.strHash(JSON.stringify(env.P)));

  // (d2) Drive bumped the version without changing the content (rename / star / move) while the plan changed here:
  //      not a conflict — the local plan is uploaded
  env.P.floors[0].walls[0].b.x = 920;
  uploadedFiles[0].version = 5;
  uploadedFiles[0].name = 'renamed in Drive.fp.json';
  ctx.resetCounters();
  drive.requests.length = 0;
  await env.gdSyncOnce(false);
  assert.strictEqual(env.gd.conflict, null, 'a metadata-only change must not raise a conflict');
  assert.strictEqual(ctx.syncModalCalls, 0);
  assert.ok(drive.requests.some(r => r.method === 'PATCH' && r.pathname.startsWith('/upload/')), 'the local change is uploaded');
  assert.strictEqual(JSON.parse(uploadedFiles[0].content).floors[0].walls[0].b.x, 920);
  assert.strictEqual(env.gdState().proj1.v, '6');

  // (e) Both changed -> gd.conflict is set and nothing is uploaded
  env.P.floors[0].walls[0].b.x = 950; // local change
  const remoteConflictPlan = makePlan('proj1', 'Villa Conflict Remote', 1100);
  uploadedFiles[0].content = JSON.stringify(remoteConflictPlan);
  uploadedFiles[0].version = 7; // remote change
  ctx.resetCounters();
  drive.requests.length = 0;
  await env.gdSyncOnce(false);
  assert.strictEqual(drive.requests.some(r => r.pathname.startsWith('/upload/')), false);
  assert.ok(env.gd.conflict, 'gd.conflict should be set');
  assert.strictEqual(env.gd.conflict.id, 'proj1');
  assert.strictEqual(env.gd.conflict.f, uploadedFiles[0].id);
  assert.strictEqual(env.gd.conflict.v, '7');
  assert.strictEqual(env.gd.conflict.remote.name, 'Villa Conflict Remote');
  assert.strictEqual(ctx.syncModalCalls, 1);
  env.gd.conflict = null;

  // (f) An empty (pristine) project is not uploaded
  const pristinePlan = {
    v: 2,
    id: 'proj_empty',
    name: 'Empty',
    floors: [{ id: 'f1', walls: [], furn: [], rooms: [], dims: [], texts: [], sketches: [], drafts: [] }],
  };
  env.P = pristinePlan;
  const countBefore = drive.files.size;
  drive.requests.length = 0;
  await env.gdSyncOnce(false);
  assert.strictEqual(drive.files.size, countBefore);
  assert.strictEqual(drive.requests.some(r => r.pathname.startsWith('/upload/')), false);
  assert.strictEqual(env.gdState().proj_empty, undefined);

  // (g) A trashed remote file is recreated
  env.P = makePlan('proj1', 'Villa Restored', 550);
  env.gdSetState('proj1', { f: uploadedFiles[0].id, v: '4', h: env.strHash(JSON.stringify(env.P)) });
  uploadedFiles[0].trashed = true;
  drive.requests.length = 0;
  await env.gdSyncOnce(false);
  const activeProj1Files = [...drive.files.values()].filter(
    f => !f.trashed && f.appProperties && f.appProperties.fpId === 'proj1'
  );
  assert.strictEqual(activeProj1Files.length, 1);
  assert.notStrictEqual(activeProj1Files[0].id, uploadedFiles[0].id);
  assert.strictEqual(env.gdState().proj1.f, activeProj1Files[0].id);
  assert.strictEqual(env.gdState().proj1.v, '1');
  assert.strictEqual(env.gdState().proj1.h, env.strHash(JSON.stringify(env.P)));
});
