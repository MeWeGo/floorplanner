/* Shared helpers for the zero-dependency test suite. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(ROOT, rel));

/** Strip // and block comments from a JSONC file (opencode.jsonc). */
function parseJsonc(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (c === '"') {                       // copy strings verbatim
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === '"') break;
        j++;
      }
      out += text.slice(i, j + 1);
      i = j;
      continue;
    }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  return JSON.parse(out);
}

/** Ids declared in index.html (`id="x"`). */
function htmlIds(html) {
  return new Set([...html.matchAll(/\sid="([A-Za-z0-9_-]+)"/g)].map(m => m[1]));
}

/** Ids the app creates at runtime: `id = 'x'`, `id='x'`, `id: 'x'`, `id="x"`. */
function runtimeIds(js) {
  const out = new Set();
  const pats = [
    /\bid\s*=\s*['"]([A-Za-z0-9_-]+)['"]/g,
    /\bid:\s*['"]([A-Za-z0-9_-]+)['"]/g,
    /\bid="([A-Za-z0-9_-]+)"/g,
  ];
  for (const p of pats) for (const m of js.matchAll(p)) out.add(m[1]);
  return out;
}

/** `$('#x')` / `getElementById('x')` lookups: id -> Set of line numbers. */
function domLookups(js) {
  const out = new Map();
  const add = (id, idx) => {
    if (!out.has(id)) out.set(id, new Set());
    out.get(id).add(js.slice(0, idx).split('\n').length);
  };
  for (const m of js.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)) add(m[1], m.index);
  for (const m of js.matchAll(/getElementById\('([A-Za-z0-9_-]+)'\)/g)) add(m[1], m.index);
  return out;
}

/**
 * Ids that app.js looks up but nothing provides. Pure function so it can be
 * tested against synthetic (deliberately broken) input.
 */
function domContractViolations(js, html) {
  const declared = htmlIds(html);
  const runtime = runtimeIds(js);
  const lookups = domLookups(js);
  const missing = [];
  for (const [id, lines] of lookups) {
    if (declared.has(id) || runtime.has(id)) continue;
    missing.push({ id, lines: [...lines] });
  }
  return missing;
}

/** `$('#x').prop = ...` on an id nothing provides — throws at boot. */
function fatalBindings(js, html) {
  const declared = htmlIds(html);
  const runtime = runtimeIds(js);
  const out = [];
  const re = /\$\('#([A-Za-z0-9_-]+)'\)\.\s*([A-Za-z_$][\w$]*)\s*=/g;
  let m;
  while ((m = re.exec(js))) {
    if (declared.has(m[1]) || runtime.has(m[1])) continue;
    out.push({ id: m[1], prop: m[2], line: js.slice(0, m.index).split('\n').length });
  }
  return out;
}

/* Words after which a `/` starts a regex literal rather than a division. */
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);

/**
 * Index of the bracket that closes the one at `open` (`(`, `[` or `{`), skipping
 * strings, comments, template literals (with nested `${…}`) and regex literals.
 */
function matchBracket(src, open) {
  const stack = [{ m: 'code', d: 0 }];   // code frames count their own bracket depth
  let prev = '', word = '';               // last significant code char / identifier, for regex detection
  for (let i = open; i < src.length; i++) {
    const c = src[i], next = src[i + 1], top = stack[stack.length - 1];
    if (top.m === 'code') {
      if (c === '/' && next === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
      if (c === '/' && next === '*') { const e = src.indexOf('*/', i + 2); if (e < 0) break; i = e + 1; continue; }
      if (/\s/.test(c)) continue;
      if (c === "'" || c === '"') {
        for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
        prev = c; word = ''; continue;
      }
      if (c === '`') { stack.push({ m: 'tpl' }); continue; }
      if (c === '/' && (!/[\w$)\]]/.test(prev) || REGEX_AFTER_WORD.has(word))) {
        let cls = false;
        for (i++; i < src.length; i++) {
          const r = src[i];
          if (r === '\\') i++;
          else if (r === '[') cls = true;
          else if (r === ']') cls = false;
          else if (r === '/' && !cls) break;
          else if (r === '\n') throw new Error('unterminated regex literal at ' + i);
        }
        while (/[a-z]/i.test(src[i + 1] || '')) i++;
        prev = ')'; word = ''; continue;   // a regex is a value: a following `/` divides
      }
      if (c === '(' || c === '[' || c === '{') top.d++;
      else if (c === ')' || c === ']' || c === '}') {
        top.d--;
        if (top.d === 0) {
          if (stack.length === 1) return i;
          stack.pop();                       // end of a template `${…}`
          continue;
        }
      }
      word = /[\w$]/.test(c) ? (/[\w$]/.test(prev) ? word + c : c) : '';
      prev = c;
    } else {                                 // template literal text
      if (c === '\\') i++;
      else if (c === '`') { stack.pop(); prev = '`'; word = ''; }
      else if (c === '$' && next === '{') { stack.push({ m: 'code', d: 1 }); prev = '{'; word = ''; i++; }
    }
  }
  throw new Error('unbalanced bracket at ' + open);
}

/**
 * Source of `function name(...) {...}` (with a leading `async` when present) cut out of src.
 * Skips the parameter list first, so defaults such as `opts = {}` are not taken for the body,
 * and ignores brackets inside strings, comments, template literals and regex literals.
 */
function fnSrcOf(src, name) {
  const re = new RegExp('(^|[^\\w$.])((?:async\\s+)?function\\s*\\*?\\s*' + name.replace(/\$/g, '\\$') + '\\s*\\()', 'g');
  const m = re.exec(src);
  if (!m) throw new Error(name + '() missing');
  const start = m.index + m[1].length;
  const close = matchBracket(src, start + m[2].length - 1);
  const body = src.indexOf('{', close);
  if (body < 0) throw new Error('no opening brace for ' + name);
  return src.slice(start, matchBracket(src, body) + 1);
}

/** The sloped wall top block of app.js (#96: cleanWallTop … detachWallTop) plus isSolidWall, for sandboxes that run wall code. */
function wallTopSrc(js) {
  js = js.replace(/\r\n/g, '\n');
  const a = js.indexOf('// eğimli duvar üstü (#96)'), b = js.indexOf('// yukarıdan görünen yüzler');
  if (a < 0 || b < a) throw new Error('sloped wall top block missing from app.js');
  const s = js.indexOf('function isSolidWall');
  return js.slice(s, js.indexOf('\n', s)) + '\n' + js.slice(a, b);
}

/** Text between `/* TAG:BEGIN` and `/* TAG:END *\/` — the blocks pasted verbatim into app.js and mcp/server.js. */
function markerBlock(src, tag) {
  const a = src.indexOf('/* ' + tag + ':BEGIN'), b = src.indexOf('/* ' + tag + ':END */');
  if (a < 0 || b < a) throw new Error(tag + ' block missing');
  return src.slice(a, b).replace(/\r\n/g, '\n');
}

/**
 * Minimal JSON-RPC client over mcp/server.js stdio.
 * `call(method, params)` resolves with the raw message; `tool(name, args)` with `{ err, text }`.
 */
function mcpClient() {
  const { spawn } = require('child_process');
  const proc = spawn(process.execPath, [path.join(ROOT, 'mcp', 'server.js')], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
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
    const t = setTimeout(() => reject(new Error('timeout on ' + method)), 10000);
    pending.set(id, msg => { clearTimeout(t); resolve(msg); });
    proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const tool = async (name, args) => {
    const r = await call('tools/call', { name, arguments: args || {} });
    return { err: r.result.isError, text: r.result.content[0].text };
  };
  return { proc, call, tool, stop: () => proc.kill() };
}

module.exports = {
  wallTopSrc, markerBlock, mcpClient,
  ROOT, read, exists, parseJsonc, fnSrcOf,
  htmlIds, runtimeIds, domLookups, domContractViolations, fatalBindings,
};
