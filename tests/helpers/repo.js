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

/** Source of `function name(...) {...}` cut out of src; skips braces inside strings, comments and template literals. */
function fnSrcOf(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + '() missing');
  let i = src.indexOf('{', start);
  if (i < 0) throw new Error('no opening brace for ' + name);
  let depth = 0;
  const stack = ['code'];
  const exprDepths = [];
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    const top = stack[stack.length - 1];
    if (top === 'code' || top === 'template-expr') {
      if (c === '/' && next === '/') { stack.push('comment'); i++; }
      else if (c === '/' && next === '*') { stack.push('block-comment'); i++; }
      else if (c === "'") stack.push('single');
      else if (c === '"') stack.push('double');
      else if (c === '`') stack.push('template');
      else if (c === '{') {
        if (top === 'code') depth++;
        else exprDepths[exprDepths.length - 1]++;
      } else if (c === '}') {
        if (top === 'code') {
          depth--;
          if (depth === 0) return src.slice(start, i + 1);
        } else {
          exprDepths[exprDepths.length - 1]--;
          if (exprDepths[exprDepths.length - 1] === 0) {
            exprDepths.pop();
            stack.pop();
          }
        }
      }
    } else if (top === 'comment') {
      if (c === '\n') stack.pop();
    } else if (top === 'block-comment') {
      if (c === '*' && next === '/') { stack.pop(); i++; }
    } else if (top === 'single') {
      if (c === '\\') i++;
      else if (c === "'") stack.pop();
    } else if (top === 'double') {
      if (c === '\\') i++;
      else if (c === '"') stack.pop();
    } else if (top === 'template') {
      if (c === '\\') i++;
      else if (c === '$' && next === '{') {
        stack.push('template-expr');
        exprDepths.push(1);
        i++;
      } else if (c === '`') {
        stack.pop();
      }
    }
    i++;
  }
  throw new Error('Unterminated function ' + name);
}

/** The sloped wall top block of app.js (#96: cleanWallTop … detachWallTop) plus isSolidWall, for sandboxes that run wall code. */
function wallTopSrc(js) {
  js = js.replace(/\r\n/g, '\n');
  const a = js.indexOf('// eğimli duvar üstü (#96)'), b = js.indexOf('// yukarıdan görünen yüzler');
  if (a < 0 || b < a) throw new Error('sloped wall top block missing from app.js');
  const s = js.indexOf('function isSolidWall');
  return js.slice(s, js.indexOf('\n', s)) + '\n' + js.slice(a, b);
}

module.exports = {
  wallTopSrc,
  ROOT, read, exists, parseJsonc, fnSrcOf,
  htmlIds, runtimeIds, domLookups, domContractViolations, fatalBindings,
};
