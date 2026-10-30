/* ===================== Kat Planı Çizici — AI bridge client =====================
   Injected by mcp/bridge.js into index.html on the fly (never linked from the
   committed app). Keeps the open tab in sync with the MCP server:

   - receives plans pushed by the AI (SSE) and applies them through the app's
     own loadProject() → autosave persists them to IndexedDB → a refresh shows them
   - pushes local edits back to the bridge whenever the app autosaves, so the AI
     can call pull_from_browser / see what you changed
   - shows a floating status pill and an "Ask AI" box that queues instructions
     for the agent (MCP tool get_user_requests)

   UI is bilingual (uses the app's L()) and follows the dark/light theme.
   ===================================================================== */

(function () {
  'use strict';
  if (window.__fpBridge) return;
  if (typeof loadProject !== 'function' || typeof autosave !== 'function') return; // not the app
  window.__fpBridge = true;

  const SEEN = 'fp_bridge_rev';          // last bridge revision this tab applied/pushed
  const TAB = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const T = (tr, en) => { try { return typeof L === 'function' ? L(tr, en) : en; } catch (e) { return en; } };

  let rev = 0;
  let applying = false;                  // true while a remote plan is being applied
  let hydrated = false;                  // initial pull finished
  let booted = false;                    // the app has loaded/created a project
  let pullScheduled = false;
  let pushTimer = null;
  let connected = false;                 // SSE stream is open

  /* ---------------- app integration ---------------- */
  // The bridge origin starts with empty storage → skip the starter-template picker.
  try { templatesModal = function () { }; } catch (e) { }

  function schedulePull(delay) {
    if (pullScheduled || hydrated) return;
    pullScheduled = true;
    setTimeout(initialPull, delay);
  }

  /* wrap loadProject: the app booted (startup always calls it) */
  const origLoad = loadProject;
  loadProject = function () {
    const r = origLoad.apply(this, arguments);
    if (!applying && !booted) { booted = true; schedulePull(400); }
    return r;
  };

  /* wrap autosave: mirror local edits to the bridge (debounced) */
  const origAutosave = autosave;
  autosave = function () {
    const r = origAutosave.apply(this, arguments);
    if (!applying && hydrated) schedulePush();
    return r;
  };

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(push, 600);
  }

  async function push() {
    if (applying || !hydrated || typeof P === 'undefined' || !P) return;
    try {
      const res = await fetch('/__plan.json', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: P, tab: TAB }),
      });
      if (!res.ok) return;
      const j = await res.json();
      if (j && j.rev) { rev = j.rev; localStorage.setItem(SEEN, String(rev)); uiTick(); }
    } catch (e) { /* bridge not reachable — stay offline */ }
  }

  function apply(remotePlan, newRev) {
    if (!remotePlan || !remotePlan.floors) return;
    applying = true;
    try { origLoad(remotePlan); }
    catch (e) { console.warn('[ai-bridge] could not apply plan', e); }
    if (newRev) { rev = newRev; localStorage.setItem(SEEN, String(rev)); }
    if (typeof ui !== 'undefined' && ui.view3d && typeof schedBuild3D === 'function') schedBuild3D();
    setTimeout(function () { applying = false; }, 700); // let loadProject's autosave settle
    try { toast(T('🤖 AI planı uygulandı', '🤖 AI plan applied')); } catch (e) { }
    uiTick();
  }

  async function initialPull() {
    if (hydrated) return;
    let j = null;
    try {
      const res = await fetch('/__plan.json', { cache: 'no-store' });
      if (res.ok) j = await res.json();
    } catch (e) { }
    rev = (j && j.rev) || 0;
    const seen = Number(localStorage.getItem(SEEN) || 0);
    hydrated = true;
    if (j && j.plan && j.plan.floors) {
      if (rev > seen) apply(j.plan, rev);      // the AI changed something while we were closed
      else localStorage.setItem(SEEN, String(rev));
    } else {
      push();                                  // seed the bridge with the current local plan
    }
    uiTick();
  }

  /* catch up after an SSE reconnect (events sent while we were offline) */
  async function sync() {
    let j = null;
    try {
      const res = await fetch('/__plan.json', { cache: 'no-store' });
      if (!res.ok) return;
      j = await res.json();
    } catch (e) { return; }
    if (!j || !j.plan) return;
    if ((j.rev || 0) > rev) apply(j.plan, j.rev);
    else if (j.rev) { rev = j.rev; localStorage.setItem(SEEN, String(rev)); uiTick(); }
  }

  /* ---------------- floating status pill + "Ask AI" panel ---------------- */
  let host = null, pill = null, dot = null, label = null, revPill = null, panel = null;
  let statusLine = null, detailLine = null, reqList = null, input = null, sendBtn = null, sendState = null;
  let helpBox = null, helpToggle = null, helpOpen = true, helpTouched = false;
  const CMD = 'node mcp/bridge.js';
  const BRIDGE_URL = 'http://127.0.0.1:8787/';

  const isLight = () => { try { return document.documentElement.dataset.theme === 'light'; } catch (e) { return false; } };
  function palette() {
    return isLight()
      ? { bg: '#ffffff', fg: '#1e293b', sub: '#64748b', bd: '#d6dbe3', acc: '#2563eb', ok: '#16a34a', off: '#94a3b8', inp: '#f8fafc', hover: '#f1f5f9' }
      : { bg: '#1b2027', fg: '#e5e9f0', sub: '#94a3b8', bd: '#333b47', acc: '#7aa2ff', ok: '#4ade80', off: '#64748b', inp: '#232a33', hover: '#252c36' };
  }
  const hhmm = at => { const d = new Date(at); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };

  function paint() {
    if (!host) return;
    const c = palette();
    host.style.color = c.fg;
    pill.style.background = c.bg;
    pill.style.border = '1px solid ' + c.bd;
    pill.style.color = c.fg;
    dot.style.background = connected ? c.ok : c.off;
    panel.style.background = c.bg;
    panel.style.border = '1px solid ' + c.bd;
    panel.style.color = c.fg;
    if (input) { input.style.background = c.inp; input.style.border = '1px solid ' + c.bd; input.style.color = c.fg; }
    if (sendBtn) { sendBtn.style.background = c.acc; sendBtn.style.color = isLight() ? '#fff' : '#0b1220'; }
    if (reqList) for (const row of reqList.children) { row.style.borderBottom = '1px dashed ' + c.bd; row.style.color = c.fg; }
    if (detailLine) detailLine.style.color = c.sub;
    if (statusLine) statusLine.style.color = c.fg;
    if (sendState) sendState.style.color = c.sub;
    if (helpBox) {
      helpBox.style.color = c.fg;
      for (const el of helpBox.querySelectorAll('code')) {
        el.style.background = c.inp; el.style.border = '1px solid ' + c.bd; el.style.color = c.fg;
      }
      for (const el of helpBox.querySelectorAll('button')) {
        el.style.background = c.inp; el.style.border = '1px solid ' + c.bd; el.style.color = c.fg;
      }
      for (const el of helpBox.querySelectorAll('a')) el.style.color = c.acc;
    }
  }

  function setConnected(ok) {
    connected = !!ok;
    if (!label) return;
    label.textContent = 'AI';
    pill.title = connected
      ? T('AI köprüsü bağlı — tıklayarak istek gönderin', 'AI bridge connected — click to send a request')
      : T('AI köprüsü kapalı — bağlantı adımları için tıklayın', 'AI bridge offline — click for connection steps');
    paint();
    if (statusLine) statusLine.textContent = connected
      ? T('Bağlı — AI planı canlı düzenleyebilir', 'Connected — the AI can edit live')
      : T('Bağlı değil — köprü çalışmıyor', 'Not connected — the bridge is not running');
    if (detailLine && !connected) detailLine.textContent = location.origin;
    if (!helpTouched && helpOpen === connected) { helpOpen = !connected; applyHelp(); }
  }

  function uiTick() {
    if (!revPill) return;
    revPill.textContent = rev ? ' · rev ' + rev : '';
    paint();
  }

  async function refreshDetails() {
    try {
      const j = await (await fetch('/health', { cache: 'no-store' })).json();
      if (detailLine) detailLine.textContent = (j.planName ? '"' + j.planName + '" · ' : '')
        + T('rev', 'rev') + ' ' + j.rev + ' · ' + j.clients + T(' sekme', ' tab(s)')
        + (j.updatedAt ? ' · ' + hhmm(j.updatedAt) : '');
      if (j.pendingRequests != null && reqList && reqList.dataset.loaded !== '1') refreshRequests();
    } catch (e) { }
  }

  function renderRequests(list) {
    if (!reqList) return;
    const c = palette();
    reqList.innerHTML = '';
    reqList.dataset.loaded = '1';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.textContent = T('Bekleyen istek yok', 'No pending requests');
      empty.style.cssText = 'padding:6px 2px;opacity:.65;';
      reqList.appendChild(empty);
      return;
    }
    for (const r of list) {
      const row = document.createElement('div');
      row.style.cssText = 'padding:5px 2px;border-bottom:1px dashed ' + c.bd + ';';
      const when = document.createElement('span');
      when.textContent = hhmm(r.at) + '  ';
      when.style.cssText = 'opacity:.55;font-variant-numeric:tabular-nums;';
      const txt = document.createElement('span');
      txt.textContent = r.text;
      row.append(when, txt);
      reqList.appendChild(row);
    }
  }

  async function refreshRequests() {
    try {
      const j = await (await fetch('/__requests', { cache: 'no-store' })).json();
      renderRequests(j.requests || []);
    } catch (e) { }
  }

  async function sendRequest() {
    if (!input || !input.value.trim()) return;
    const text = input.value.trim();
    sendBtn.disabled = true;
    try {
      const res = await fetch('/__requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      input.value = '';
      if (sendState) { sendState.textContent = T('Gönderildi ✓ — aracıya "uygulamadaki istekleri kontrol et" deyin', 'Sent ✓ — ask your agent to check the app requests'); setTimeout(() => { if (sendState) sendState.textContent = T('Aracı: get_user_requests', 'Agent tool: get_user_requests'); }, 4000); }
      refreshRequests();
    } catch (e) {
      if (sendState) sendState.textContent = T('Gönderilemedi — köprü kapalı mı?', 'Could not send — is the bridge running?');
    } finally {
      sendBtn.disabled = false;
    }
  }

  /* ---------------- connection instructions ---------------- */
  function applyHelp() {
    if (!helpBox || !helpToggle) return;
    helpBox.style.display = helpOpen ? 'block' : 'none';
    helpToggle.textContent = helpOpen
      ? T('Bağlantı adımlarını gizle', 'Hide connection steps')
      : T('Nasıl bağlanır?', 'How do I connect?');
  }

  function buildHelp() {
    if (!helpBox || helpBox.dataset.built === '1') return;
    helpBox.dataset.built = '1';

    const line = (txt, extra) => {
      const d = document.createElement('div');
      d.textContent = txt;
      if (extra) d.style.cssText = extra;
      return d;
    };

    const s1 = line('1. ' + T('Proje klasöründe köprüyü başlat:', 'Start the bridge in the project folder:'), 'margin-top:2px;');

    const cmdRow = document.createElement('div');
    cmdRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin:4px 0 6px;';
    const code = document.createElement('code');
    code.textContent = CMD;
    code.style.cssText = 'flex:1;min-width:0;padding:4px 6px;border-radius:6px;font:11px/1.4 ui-monospace,Consolas,monospace;overflow-x:auto;white-space:nowrap;';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = T('Kopyala', 'Copy');
    copy.style.cssText = 'flex:0 0 auto;border-radius:6px;padding:3px 7px;cursor:pointer;font:inherit;font-size:10.5px;';
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(CMD); copy.textContent = T('Kopyalandı ✓', 'Copied ✓'); }
      catch (e) { copy.textContent = T('Kopyalanamadı', 'Copy failed'); }
      setTimeout(() => { copy.textContent = T('Kopyala', 'Copy'); }, 2000);
    };
    cmdRow.append(code, copy);

    const s2text = document.createElement('div');
    s2text.textContent = '2. ' + T('Bu adreste aç (veya sayfayı yenile):', 'Open the app here (or refresh):');
    const s2 = document.createElement('div');
    s2.append(s2text);
    const link = document.createElement('a');
    link.href = BRIDGE_URL;
    link.textContent = BRIDGE_URL;
    link.style.cssText = 'display:block;margin-top:2px;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;';
    s2.append(link);

    const s3 = line('3. ' + T('Aracına "uygulamadaki istekleri kontrol et" de — bekleyen istekleri get_user_requests ile okur.',
      'Tell your agent "check the app requests" — it reads them with get_user_requests.'), 'margin-top:6px;');

    const note = line(T('İstekler aracıya kendiliğinden gitmez; sohbette sorunca okunur. Planlar 127.0.0.1:8787 origin\'inde saklanır (file:// deposundan ayrıdır).',
      'Requests are queued, not pushed to the model — your agent reads them when you ask. Plans live in the 127.0.0.1:8787 origin (separate from file:// storage).'), 'margin-top:6px;opacity:.7;');

    helpBox.append(s1, cmdRow, s2, s3, note);
    applyHelp();
  }

  /* ---------------- "AI connection" section in the app's Help modal ---------------- */
  function aiHelpSection() {
    const wrap = document.createElement('div');
    wrap.id = 'fpAiHelpSection';

    const h = document.createElement('h3');
    h.textContent = T('🤖 AI bağlantısı (MCP)', '🤖 AI connection (MCP)');
    h.style.cssText = 'margin:18px 0 6px;';

    const table = document.createElement('table');
    table.className = 'kb';
    const rows = connected ? [
      ['AI', T('Bağlı. Sol alttaki düğme canlı revizyonu gösterir; tıklayıp aracıya istek yazabilirsiniz.',
        'Connected. The bottom-left pill shows the live revision; click it to queue a request for your agent.')],
      ['get_user_requests', T('Aracı bekleyen istekleri bununla okur, ack_user_requests ile kapatır.',
        'Your agent reads queued requests with this, and clears them with ack_user_requests.')],
    ] : [
      [CMD, T('Köprüyü başlat (proje klasöründe, ayrı bir terminalde)', 'Start the bridge (project folder, in a separate terminal)')],
      [BRIDGE_URL, T('Uygulamayı bu adreste açın veya sayfayı yenileyin', 'Open the app at this address, or refresh the page')],
      ['AI', T('Sol alttaki düğme: bağlantı durumu + canlı revizyon; tıklayınca istek kutusu açılır',
        'Bottom-left pill: connection status + live revision; click it for the request box')],
      ['get_user_requests', T('Aracınıza "uygulamadaki istekleri kontrol et" deyin — istekleri bununla okur',
        'Tell your agent "check the app requests" — it reads them with this tool')],
    ];
    for (const pair of rows) {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      const kbd = document.createElement('kbd');
      kbd.textContent = pair[0];
      td1.appendChild(kbd);
      const td2 = document.createElement('td');
      td2.textContent = pair[1];
      tr.append(td1, td2);
      table.appendChild(tr);
    }

    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = T('İstekler aracıya kendiliğinden iletilmez: sohbette sorunca okunur (get_user_requests). Planlar 127.0.0.1:8787 origin\'inde, file:// deposundan ayrı saklanır; taşımak için ⬇ JSON / 📂 Aç kullanın.',
      'Requests are not pushed to the model by themselves — your agent reads them when you ask (get_user_requests). Plans are stored in the 127.0.0.1:8787 origin, separate from file:// storage; use ⬇ JSON / 📂 Open JSON to move plans between them.');

    wrap.append(h, table, note);
    return wrap;
  }

  function installHelpHook() {
    if (typeof helpModal !== 'function' || helpModal.__fpWrapped) return;
    const orig = helpModal;
    helpModal = function () {
      const r = orig.apply(this, arguments);
      try {
        if (panel) panel.style.display = 'none';   // don't cover the modal
        const modal = document.getElementById('modal');
        if (modal && !document.getElementById('fpAiHelpSection')) modal.appendChild(aiHelpSection());
      } catch (e) { }
      return r;
    };
    helpModal.__fpWrapped = true;
    try { const b = document.getElementById('bHelp'); if (b) b.onclick = helpModal; } catch (e) { }
  }

  /* keep the pill just above the footer (its height changes with the window width) */
  function placePill() {
    if (!host) return;
    let h = 54;
    try {
      const f = document.querySelector('footer') || document.querySelector('.foot');
      if (f) {
        const r = f.getBoundingClientRect();
        if (r && r.height > 0 && r.height < innerHeight * 0.6) h = Math.round(r.height);
      }
    } catch (e) { }
    host.style.bottom = (h + 10) + 'px';
    if (panel) {
      const top = host.getBoundingClientRect().top;
      panel.style.maxHeight = Math.max(180, Math.round(top - 16)) + 'px';
    }
  }

  function uiInit() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'fpAiBridgeUi';
    host.style.cssText = 'position:fixed;left:64px;z-index:95;font:12px/1.45 "Plus Jakarta Sans",system-ui,sans-serif;';
    placePill();

    pill = document.createElement('button');
    pill.type = 'button';
    pill.setAttribute('aria-label', T('AI köprüsü', 'AI bridge'));
    pill.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 11px;border-radius:999px;cursor:pointer;font:inherit;box-shadow:0 4px 14px rgba(0,0,0,.28);';
    dot = document.createElement('span');
    dot.style.cssText = 'width:8px;height:8px;border-radius:50%;flex:0 0 auto;';
    label = document.createElement('span');
    label.style.cssText = 'font-weight:700;letter-spacing:.3px;';
    revPill = document.createElement('span');
    revPill.style.cssText = 'opacity:.6;font-variant-numeric:tabular-nums;';
    pill.append(dot, label, revPill);

    panel = document.createElement('div');
    panel.style.cssText = 'display:none;position:absolute;left:0;bottom:calc(100% + 8px);width:300px;max-height:min(72vh, 560px);overflow-y:auto;border-radius:12px;padding:10px;box-shadow:0 12px 34px rgba(0,0,0,.34);';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:4px;';
    const title = document.createElement('span');
    title.textContent = T('AI köprüsü', 'AI bridge');
    title.style.cssText = 'font-weight:700;';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.title = T('Kapat', 'Close');
    close.style.cssText = 'margin-left:auto;border:0;background:transparent;color:inherit;cursor:pointer;font:inherit;opacity:.6;';
    close.onclick = () => { panel.style.display = 'none'; };
    head.append(title, close);

    statusLine = document.createElement('div');
    statusLine.style.cssText = 'margin:2px 0 2px;font-weight:600;';

    detailLine = document.createElement('div');
    detailLine.style.cssText = 'font-size:11px;opacity:.75;margin-bottom:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

    helpToggle = document.createElement('button');
    helpToggle.type = 'button';
    helpToggle.style.cssText = 'border:0;background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:11px;opacity:.8;padding:0;margin:0 0 6px;text-decoration:underline;';
    helpToggle.onclick = () => { helpOpen = !helpOpen; helpTouched = true; applyHelp(); };

    helpBox = document.createElement('div');
    helpBox.style.cssText = 'display:none;font-size:11px;line-height:1.5;margin-bottom:8px;';
    helpBox.textContent = '';

    reqList = document.createElement('div');
    reqList.style.cssText = 'max-height:120px;overflow:auto;margin-bottom:8px;font-size:11.5px;';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;';

    input = document.createElement('input');
    input.type = 'text';
    input.placeholder = T('AI\'ya bir istek yazın…', 'Ask the AI…');
    input.setAttribute('aria-label', T('AI isteği', 'AI request'));
    input.maxLength = 2000;
    input.style.cssText = 'flex:1;min-width:0;border-radius:8px;padding:6px 8px;font:inherit;outline:none;';

    sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.textContent = T('Gönder', 'Send');
    sendBtn.style.cssText = 'border:0;border-radius:8px;padding:6px 10px;cursor:pointer;font:inherit;font-weight:700;';

    row.append(input, sendBtn);

    sendState = document.createElement('div');
    sendState.textContent = T('Aracı: get_user_requests', 'Agent tool: get_user_requests');
    sendState.style.cssText = 'font-size:10.5px;opacity:.65;margin-top:6px;';

    panel.append(head, statusLine, detailLine, helpToggle, helpBox, reqList, row, sendState);
    host.append(panel, pill);
    document.body.appendChild(host);
    buildHelp();
    applyHelp();
    placePill();
    setTimeout(placePill, 400);
    setTimeout(placePill, 1500);
    if (typeof ResizeObserver === 'function') {
      try {
        const f = document.querySelector('footer') || document.querySelector('.foot');
        if (f) new ResizeObserver(placePill).observe(f);
      } catch (e) { }
    }

    pill.onclick = () => {
      const open = panel.style.display === 'none' || !panel.style.display;
      panel.style.display = open ? 'block' : 'none';
      if (open) { refreshRequests(); refreshDetails(); }
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sendRequest(); } });
    sendBtn.onclick = sendRequest;
    document.addEventListener('keydown', e => { if (e.key === 'Escape') panel.style.display = 'none'; });

    setConnected(connected);
    uiTick();
    paint();
    if (typeof MutationObserver === 'function') {
      new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
  }

  /* ---------------- live updates ---------------- */
  try {
    const es = new EventSource('/__events?tab=' + encodeURIComponent(TAB));
    es.addEventListener('plan', function (ev) {
      try {
        const msg = JSON.parse(ev.data);
        if (!msg || msg.tab === TAB) return;
        if (!booted) return;               // startup not finished — initialPull catches up
        if (!msg.plan || !msg.plan.floors) return;
        if (msg.rev && msg.rev <= rev) return;
        apply(msg.plan, msg.rev);
      } catch (e) { }
    });
    es.addEventListener('requests-changed', function () {
      if (panel && panel.style.display !== 'none') refreshRequests();
    });
    es.onopen = function () {
      setConnected(true);
      if (booted && hydrated) sync();
    };
    es.onerror = function () { setConnected(false); };
  } catch (e) { }

  /* ---------------- boot ---------------- */
  function start() {
    try { installHelpHook(); } catch (e) { console.warn('[ai-bridge] help hook failed', e); }
    try { uiInit(); } catch (e) { console.warn('[ai-bridge] UI failed', e); }
    window.addEventListener('resize', placePill);
    setConnected(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  /* fallback: only if startup never calls loadProject (should not happen) */
  setTimeout(function () { if (!booted) { booted = true; schedulePull(0); } }, 8000);
})();
