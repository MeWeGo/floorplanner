/* Command line (issue #43).
   Runs the real foldText / cmdList / cmdFilter / runCmd cut out of app.js with stubbed actions,
   then checks where the ":" trigger sits in the keydown handler. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { read } = require('./helpers/repo');

const src = read('app.js');
const fnSrc = name => {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + '() is gone from app.js');
  const line = src.slice(start, src.indexOf('\n', start));
  if (line.split('{').length === line.split('}').length) return line; // one-line function
  return src.slice(start, src.indexOf('\n}', start) + 2);
};
const lineSrc = name => {
  const start = src.indexOf('const ' + name);
  assert.ok(start >= 0, name + ' is gone from app.js');
  return src.slice(start, src.indexOf('\n', start));
};
const block = (from, to) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)) + to.length);

const api = new Function(`
  const calls = [], ui = { view3d: false };
  const log = n => (...a) => calls.push(n);
  const L = (tr, en) => en, esc = s => s;
  const setTool = t => calls.push('tool:' + t);
  const show3D = on => { calls.push('3d:' + on); ui.view3d = on; };
  const [undo, redo, fit, saveBrowser, exportPrint, downloadJson, templatesModal, flipSel, scaleSelPrompt, deleteSel, paste, groupSel, ungroupSel, archModal, layerAct, openRenderStudio, helpModal, set3DCam, refresh] =
    ['undo', 'redo', 'fit', 'save', 'print', 'json', 'new', 'flip', 'scale', 'del', 'paste', 'group', 'ungroup', 'arch', 'layer', 'studio', 'help', 'cam', 'refresh'].map(log);
  const $ = () => ({ click: () => calls.push('click') });
  let closed = 0; const closeCmdPalette = () => closed++;
  ${block('const TOOLS = [', '];')}
  ${block('const HINTS_EN = {', '\n};')}
  ${lineSrc('foldText')}
  ${fnSrc('cmdList')}
  ${fnSrc('cmdFilter')}
  ${fnSrc('runCmd')}
  return { TOOLS, foldText, cmdList, cmdFilter, runCmd, calls, ui, get closed() { return closed; } };
`)();

const names = list => list.map(c => c.en);

test('folding ignores case, Turkish dotted/dotless i and accents', () => {
  const f = api.foldText;
  assert.strictEqual(f('IŞIK'), 'isik');
  assert.strictEqual(f('İnce ölçü'), 'ince olcu');
  assert.strictEqual(f('Çoğalt'), 'cogalt');
  assert.strictEqual(f('ÜĞŞÇÖ'), 'ugsco');
  assert.strictEqual(f(undefined), '');
});

test('every TOOLS entry is listed with its shortcut key', () => {
  const cmds = api.cmdList();
  for (const t of api.TOOLS.filter(Boolean)) {
    const c = cmds.find(x => x.id === 'tool:' + t[0]);
    assert.ok(c, t[0] + ' missing from the command line');
    assert.strictEqual(c.key, t[3]);
    assert.strictEqual(c.tr, t[2]);
    assert.strictEqual(c.en, t[4]);
  }
  for (const id of ['undo', 'redo', '2d', '3d', 'fit', 'print', 'save', 'flipH', 'flipV', 'scale', 'layers', 'addlayer', 'elev'])
    assert.ok(cmds.some(c => c.id === id), id + ' missing from the command line');
  assert.strictEqual(new Set(cmds.map(c => c.id)).size, cmds.length, 'duplicate command ids');
});

test('English and Turkish names match, accent-insensitively, best match first', () => {
  const cmds = api.cmdList(), first = q => api.cmdFilter(cmds, q)[0].id;
  assert.strictEqual(first('wall'), 'tool:wall');
  assert.strictEqual(first('duvar'), 'tool:wall');
  assert.strictEqual(first('DUVAR'), 'tool:wall');
  assert.strictEqual(first('kesit'), 'tool:section');
  assert.strictEqual(first('KESİT'), 'tool:section');
  assert.strictEqual(first('olcekle'), 'scale');
  assert.strictEqual(first('yazdir'), 'print');
  assert.strictEqual(first('geri al'), 'undo');
  assert.strictEqual(first('cogalt'), 'dup');
  assert.ok(names(api.cmdFilter(cmds, 'aynala')).includes('Mirror'));
  assert.deepStrictEqual(api.cmdFilter(cmds, 'zzzz'), []);
  assert.strictEqual(api.cmdFilter(cmds, '').length, cmds.length, 'an empty query lists everything');
});

test('in 3D: view / history / save run in place, editing and drawing commands return to 2D', () => {
  const cmds = api.cmdList(), by = id => cmds.find(c => c.id === id);
  for (const id of ['undo', 'redo', 'fit', 'save', '3d', '2d', 'print'])
    assert.strictEqual(by(id).in3d, true, id + ' should run in 3D');
  for (const id of ['tool:wall', 'tool:door', 'flipH', 'scale', 'selall'])
    assert.strictEqual(by(id).in3d, false, id + ' should switch to 2D');
  api.ui.view3d = true; api.calls.length = 0;
  api.runCmd(by('undo'));
  assert.deepStrictEqual(api.calls, ['undo'], 'undo must not leave 3D');
  api.calls.length = 0;
  api.runCmd(by('tool:wall'));
  assert.deepStrictEqual(api.calls, ['3d:false', 'tool:wall']);
  api.ui.view3d = true; api.calls.length = 0;
  api.runCmd(by('fit'));
  assert.deepStrictEqual(api.calls, ['cam'], 'fit in 3D uses the 3D camera');
  assert.ok(api.closed >= 3, 'running a command closes the palette');
});

test('":" opens it after the input guard and before the 3D branch; the palette owns its keys', () => {
  const h = src.slice(src.indexOf("window.addEventListener('keydown', e => {"));
  const guard = h.indexOf('if (typing)'), colon = h.indexOf("e.key === ':'"), branch3d = h.indexOf('if (ui.view3d) {'), wallLen = h.indexOf('ui.lenTyped');
  assert.ok(guard >= 0 && colon > guard, 'the trigger must come after the text-field guard');
  assert.ok(colon < branch3d, 'the trigger must come before the 3D branch so it works in 3D');
  assert.ok(colon < wallLen, 'the trigger must not sit inside the wall-length typing');
  assert.match(h.slice(colon, colon + 200), /openCmdPalette\(\)/);
  const pal = fnSrc('openCmdPalette');
  assert.match(pal, /ev\.stopPropagation\(\)/, 'palette keys would leak to tools / walk keys');
  for (const k of ['Escape', 'Enter', 'ArrowDown', 'ArrowUp', 'Tab']) assert.ok(pal.includes(`'${k}'`), k + ' not handled');
});
