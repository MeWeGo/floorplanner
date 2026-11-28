/* Install as an app / offline (#203): every file the service worker precaches and the manifest names exists and is
   published by deploy.yml, the worker keeps the pinned CDN scripts the page loads, and the build id is stamped on
   deploy. The worker itself is driven in the smoke check "install as an app and work offline". */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, exists } = require('./helpers/repo');

const sw = read('sw.js'), deploy = read('.github/workflows/deploy.yml'), html = read('index.html');
const shell = new Function(sw.match(/const SHELL = (\[[^\]]*\]);/)[0] + 'return SHELL;')();
const cdn = new Function(sw.match(/const CDN = (\[[\s\S]*?\]);/)[0] + 'return CDN;')();
const staged = (deploy.match(/cp (index\.html[^\n]*) _site\//) || [])[1] || '';

test('precached files and manifest icons exist and are deployed', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const files = [...shell.filter(f => f !== './'), ...manifest.icons.map(i => i.src)];
  for (const f of files) {
    assert.ok(exists(f), f + ' is missing from the repo');
    assert.ok(staged.split(/\s+/).includes(f), f + ' is not copied to _site in deploy.yml');
  }
  assert.ok(manifest.icons.some(i => i.sizes === '192x192') && manifest.icons.some(i => i.sizes === '512x512'), 'installable icon sizes');
  assert.match(deploy, /sed "s\/__BUILD__\/\$\{GITHUB_SHA::12\}\/" sw\.js > _site\/sw\.js/, 'deploy stamps the build id into sw.js');
});

test('the worker caches exactly the CDN scripts the page loads', () => {
  const scripts = [...html.matchAll(/<script src="(https:[^"]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual([...scripts].sort(), [...cdn].sort());
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
});
