/* Project groups (tab bar + normalizeProject), per-project Google Drive pick list, and Download menu wiring.
   Runs the real helpers cut out of app.js in a small sandbox. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read, fnSrcOf } = require('./helpers/repo');

const src = read('app.js');
const html = read('index.html');
const line = name => {
  const i = src.indexOf('const ' + name);
  assert.ok(i >= 0, name + ' is gone');
  return src.slice(i, src.indexOf('\n', i));
};

function groupRig() {
  return new Function(`
    ${fnSrcOf(src, 'cleanGroup')}
    ${line('projGroup')}
    ${fnSrcOf(src, 'groupColor')}
    return { cleanGroup, projGroup, groupColor };
  `)();
}

function tabsRig({ tabs = [], tabIdx = 0, P = null, off = [] } = {}) {
  const ptabs = { innerHTML: '' };
  const store = { fp_tabgrp_off: [...off] };
  const api = new Function('ptabs', 'store', 'tabs', 'tabIdx', 'P', `
    const $ = id => (id === '#ptabs' ? ptabs : null);
    const L = (tr, en) => en;
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const lsArr = k => (Array.isArray(store[k]) ? store[k] : []);
    const lsPut = (k, v) => { store[k] = v; };
    ${fnSrcOf(src, 'cleanGroup')}
    ${line('projGroup')}
    ${fnSrcOf(src, 'groupColor')}
    ${line('tabGrpOff')}
    ${fnSrcOf(src, 'toggleTabGroup')}
    ${fnSrcOf(src, 'tabHtml')}
    ${fnSrcOf(src, 'renderTabs')}
    return { renderTabs, tabHtml, tabGrpOff, toggleTabGroup };
  `)(ptabs, store, tabs, tabIdx, P);
  return { ...api, ptabs, store };
}

function gdRig(cfg = {}) {
  const store = {};
  const api = new Function('store', 'cfg', `
    const lsJson = k => (store[k] && typeof store[k] === 'object' ? store[k] : {});
    const lsSet = (k, v) => { store[k] = v; };
    const gdCfg = () => ({ ...cfg });
    ${line('gdPicks')}
    ${fnSrcOf(src, 'gdWanted')}
    ${fnSrcOf(src, 'gdPick')}
    return { gdWanted, gdPick };
  `)(store, cfg);
  return { ...api, store, cfg };
}

test('cleanGroup: trims, collapses whitespace, caps at 40 chars, non-strings give empty string; projGroup reads p.group', () => {
  const { cleanGroup, projGroup } = groupRig();
  assert.strictEqual(cleanGroup('  Alpha   Beta  '), 'Alpha Beta');
  assert.strictEqual(cleanGroup('a\t\nb\n  c'), 'a b c');
  assert.strictEqual(cleanGroup('x'.repeat(55)), 'x'.repeat(40));
  assert.strictEqual(cleanGroup('   '), '');
  assert.strictEqual(cleanGroup(null), '');
  assert.strictEqual(cleanGroup(undefined), '');
  assert.strictEqual(cleanGroup(123), '');
  assert.strictEqual(cleanGroup({}), '');

  assert.strictEqual(projGroup({ group: '  My   Group  ' }), 'My Group');
  assert.strictEqual(projGroup({ group: 42 }), '');
  assert.strictEqual(projGroup({}), '');
  assert.strictEqual(projGroup(null), '');
});

test('groupColor: deterministic hsl(), case-insensitive, different names usually differ', () => {
  const { groupColor } = groupRig();
  const c1 = groupColor('Kitchen');
  assert.match(c1, /^hsl\(\d+ 62% 55%\)$/);
  assert.strictEqual(groupColor('Kitchen'), c1);
  assert.strictEqual(groupColor('KITCHEN'), c1);
  assert.strictEqual(groupColor('kitchen'), c1);
  const c2 = groupColor('Bedroom');
  assert.match(c2, /^hsl\(\d+ 62% 55%\)$/);
  assert.notStrictEqual(c1, c2);
});

test('renderTabs: ungrouped first, grouped together with ptab-grp + ingrp, folded hides inactive, add button last', () => {
  const p0 = { name: 'Alpha', group: 'Work' };
  const p1 = { name: 'Solo' };
  const p2 = { name: 'Beta', group: 'Home' };
  const p3 = { name: 'Gamma', group: 'Work' };
  const tabs = [{ P: p0 }, { P: p1 }, { P: p2 }, { P: p3 }];
  const r = tabsRig({ tabs, tabIdx: 0, P: p0 });
  r.renderTabs();

  const out = r.ptabs.innerHTML;
  const iSolo = out.indexOf('data-tab="1"');
  const iWorkGrp = out.indexOf('data-tabgrp="Work"');
  const iAlpha = out.indexOf('data-tab="0"');
  const iGamma = out.indexOf('data-tab="3"');
  const iHomeGrp = out.indexOf('data-tabgrp="Home"');
  const iBeta = out.indexOf('data-tab="2"');
  const iAdd = out.indexOf('class="ptab-add"');

  assert.ok(iSolo >= 0 && iWorkGrp >= 0 && iAlpha >= 0 && iGamma >= 0 && iHomeGrp >= 0 && iBeta >= 0 && iAdd >= 0);
  // ungrouped first, then Work (with both non-adjacent Work tabs together), then Home, then add button
  assert.ok(iSolo < iWorkGrp, 'ungrouped tab comes before group headers');
  assert.ok(iWorkGrp < iAlpha && iAlpha < iGamma, 'Work group header precedes both Work tabs');
  assert.ok(iGamma < iHomeGrp && iHomeGrp < iBeta, 'Work tabs stay together before Home group');
  assert.ok(iBeta < iAdd && out.endsWith('</button>'), 'add button is last');

  // class checks
  assert.match(out, /<button class="ptab-grp" data-tabgrp="Work"/);
  assert.match(out, /<button class="ptab-grp" data-tabgrp="Home"/);
  assert.match(out, /<div class="ptab" data-tab="1"/, 'ungrouped tab has no ingrp class');
  assert.match(out, /<div class="ptab on ingrp" data-tab="0"/);
  assert.match(out, /<div class="ptab ingrp" data-tab="3"/);
  assert.match(out, /<div class="ptab ingrp" data-tab="2"/);

  // fold Work via toggleTabGroup: active tab (0) stays visible, inactive tab (3) is hidden
  r.toggleTabGroup('Work');
  assert.ok(r.tabGrpOff().has('Work'));
  assert.deepStrictEqual(r.store.fp_tabgrp_off, ['Work']);
  const folded = r.ptabs.innerHTML;
  assert.ok(folded.includes('data-tab="0"'), 'active tab in folded group remains visible');
  assert.ok(!folded.includes('data-tab="3"'), 'inactive tab in folded group is hidden');
  assert.ok(folded.includes('data-tab="2"'), 'unfolded group remains visible');

  // unfold Work via toggleTabGroup: inactive tab (3) reappears
  r.toggleTabGroup('Work');
  assert.ok(!r.tabGrpOff().has('Work'));
  assert.ok(r.ptabs.innerHTML.includes('data-tab="3"'), 'unfolded group shows all tabs again');
});

test('gdWanted / gdPick: default vs chosen mode, explicit pick overrides, empty id is false', () => {
  // Default mode (no pick: "chosen")
  const def = gdRig();
  assert.strictEqual(def.gdWanted('p1'), true, 'unknown id defaults to true');
  assert.strictEqual(def.gdWanted(''), false);
  assert.strictEqual(def.gdWanted(null), false);
  def.gdPick('', true);
  assert.deepStrictEqual(def.store, {}, 'gdPick ignores empty id');

  def.gdPick('p1', false);
  assert.strictEqual(def.gdWanted('p1'), false, 'explicit false wins in default mode');
  def.gdPick('p1', true);
  assert.strictEqual(def.gdWanted('p1'), true, 'explicit true wins in default mode');

  // Chosen-only mode (pick: "chosen")
  const ch = gdRig({ pick: 'chosen' });
  assert.strictEqual(ch.gdWanted('p2'), false, 'unknown id defaults to false in chosen mode');
  assert.strictEqual(ch.gdWanted(''), false);
  ch.gdPick('p2', true);
  assert.strictEqual(ch.gdWanted('p2'), true, 'explicit true wins in chosen mode');
  ch.gdPick('p2', false);
  assert.strictEqual(ch.gdWanted('p2'), false, 'explicit false wins in chosen mode');
});

test('normalizeProject source cleans up P.group via cleanGroup', () => {
  const norm = fnSrcOf(src, 'normalizeProject');
  assert.match(norm, /cleanGroup\(P\.group\)/);
  assert.match(norm, /delete P\.group/);
});

test('Download menu wiring in index.html and app.js', () => {
  assert.match(html, /id="bDl"/);
  const start = html.indexOf('id="dlMenu"');
  assert.ok(start >= 0, 'id="dlMenu" present in index.html');
  const tagStart = html.lastIndexOf('<div', start);
  assert.ok(tagStart >= 0);

  // Walk nested <div> / </div> from dlMenu start tag to find its matching closing </div>
  let depth = 0;
  let end = -1;
  const re = /<\/?div\b/g;
  re.lastIndex = tagStart;
  let m;
  while ((m = re.exec(html))) {
    if (m[0] === '<div') depth++;
    else {
      depth--;
      if (depth === 0) { end = m.index + '</div>'.length; break; }
    }
  }
  assert.ok(end > start, 'dlMenu closing </div> found');
  const dlMenuHtml = html.slice(tagStart, end);

  for (const id of ['bPng', 'bSvg', 'bPrint', 'bJson', 'bIfc', 'bRevit']) {
    assert.ok(dlMenuHtml.includes(`id="${id}"`), `${id} is inside #dlMenu`);
  }

  assert.doesNotThrow(() => fnSrcOf(src, 'dlMenuOpen'), 'app.js defines function dlMenuOpen');
});
