// Mithnah slideshow widget — token-only, shared .m-* component classes.
// Phone panel for browsing Shia content + paging through slides on the wall.

(() => {
  const TOKEN_KEY = 'mithnah-gps-token';
  const AR_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  const toArabicDigits = (v) => String(v).replace(/\d/g, (d) => AR_DIGITS[Number(d)] || d);

  (function loadDesignCss() {
    if (document.querySelector('link[data-mithnah-design]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/vendor/mithnah-design.css';
    link.setAttribute('data-mithnah-design', '1');
    document.head.appendChild(link);
  })();

  const style = document.createElement('style');
  style.textContent = `
    #mithnahSlideBtn {
      position: fixed; bottom: 112px; right: 20px; z-index: 200;
    }
    #mithnahSlideBtn .ico {
      font-family: 'Material Symbols Outlined';
      font-size: 22px; font-variation-settings: 'FILL' 1;
    }

    /* Panel uses .m-modal-backdrop; the inner .m-modal-card is forced
     * larger here because this is a browsing panel not a focused dialog. */
    #mithnahSlidePanel .slide-card { max-width: 520px; height: 92vh; display: flex; flex-direction: column; padding: var(--m-space-5); }
    #mithnahSlidePanel header {
      display: flex; align-items: center; gap: var(--m-space-3);
      margin-bottom: var(--m-space-4);
      padding-bottom: var(--m-space-3);
      border-bottom: 1px solid var(--m-border-subtle);
    }
    #mithnahSlidePanel header h3 {
      flex: 1; margin: 0;
      font-family: var(--m-font-display);
      font-size: 20px; font-weight: 800;
      color: var(--m-text-primary);
    }

    #mithnahSlidePanel .tabs {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--m-space-1);
      padding: var(--m-space-1);
      background: var(--m-primary-subtle);
      border-radius: var(--m-radius-md);
      margin-bottom: var(--m-space-4);
    }
    #mithnahSlidePanel .tab-btn {
      padding: var(--m-space-2) var(--m-space-1);
      background: transparent;
      color: var(--m-text-secondary);
      border: none;
      border-radius: var(--m-radius-sm);
      font-family: var(--m-font-body);
      font-size: 13px; font-weight: 700;
      cursor: pointer;
      transition: all var(--m-dur-fast) var(--m-ease);
    }
    #mithnahSlidePanel .tab-btn.active {
      background: var(--m-primary);
      color: var(--m-on-primary);
      box-shadow: var(--m-shadow-1);
    }
    #mithnahSlidePanel .tab-btn:focus-visible {
      outline: 2px solid var(--m-primary); outline-offset: 2px;
    }

    #mithnahSlidePanel .list { flex: 1; overflow-y: auto; margin-bottom: var(--m-space-4); }
    #mithnahSlidePanel .item {
      display: block; width: 100%; text-align: right;
      padding: var(--m-space-3) var(--m-space-4);
      margin-bottom: var(--m-space-2);
      background: var(--m-bg-surface);
      border: 1.5px solid var(--m-border-subtle);
      border-radius: var(--m-radius-sm);
      color: var(--m-text-primary);
      font-family: var(--m-font-body);
      cursor: pointer;
      transition: all var(--m-dur-fast) var(--m-ease);
    }
    #mithnahSlidePanel .item:hover {
      border-color: var(--m-primary-ring);
      background: var(--m-primary-subtle);
    }
    #mithnahSlidePanel .item:focus-visible {
      outline: 2px solid var(--m-primary); outline-offset: 2px;
    }
    #mithnahSlidePanel .item.active {
      background: var(--m-primary-subtle);
      border-color: var(--m-primary);
    }
    #mithnahSlidePanel .item h4 {
      margin: 0; font-family: var(--m-font-display);
      font-size: 16px; font-weight: 700; color: var(--m-text-primary);
    }
    #mithnahSlidePanel .item p {
      margin: 4px 0 0; font-size: 13px; color: var(--m-text-muted); line-height: 1.5;
    }
    #mithnahSlidePanel .item small {
      display: block; margin-top: 4px;
      font-size: 11px; color: var(--m-text-subtle);
    }

    #mithnahSlidePanel .deck-info {
      padding: var(--m-space-3) var(--m-space-4);
      background: var(--m-primary-subtle);
      border: 1px solid var(--m-border-subtle);
      border-radius: var(--m-radius-sm);
      margin-bottom: var(--m-space-3);
    }
    #mithnahSlidePanel .deck-info .title { font-family: var(--m-font-display); font-size: 15px; font-weight: 800; color: var(--m-primary); margin-bottom: 2px; }
    #mithnahSlidePanel .deck-info .subtitle { font-size: 12px; color: var(--m-text-muted); margin-bottom: 4px; }
    #mithnahSlidePanel .deck-info .counter { text-align: center; font-size: 12px; color: var(--m-primary); font-weight: 700; font-feature-settings: 'tnum' 1; }

    #mithnahSlidePanel .controls {
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--m-space-2);
      margin-bottom: var(--m-space-2);
    }
    #mithnahSlidePanel .controls .m-btn { min-height: 56px; font-size: 15px; }
    #mithnahSlidePanel .close-row { display: grid; grid-template-columns: 1fr; gap: var(--m-space-2); }

    #mithnahSlidePanel .panel-status {
      margin-top: var(--m-space-2);
    }
    #mithnahSlidePanel .empty {
      text-align: center; padding: var(--m-space-6) 0;
      font-size: 13px; color: var(--m-text-muted);
    }
  `;
  document.head.appendChild(style);

  const openBtn = document.createElement('button');
  openBtn.id = 'mithnahSlideBtn';
  openBtn.className = 'm-fab';
  openBtn.type = 'button';
  openBtn.setAttribute('aria-label', 'فتح لوحة الأدعية والزيارات');
  openBtn.setAttribute('aria-haspopup', 'dialog');
  openBtn.innerHTML = '<span class="ico" aria-hidden="true">slideshow</span><span>الشرائح</span>';
  document.body.appendChild(openBtn);

  const panel = document.createElement('div');
  panel.id = 'mithnahSlidePanel';
  panel.className = 'm-modal-backdrop';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'mithnahSlideTitle');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <div class="m-modal-card slide-card m-scroll">
      <header>
        <h3 id="mithnahSlideTitle">الأدعية والزيارات</h3>
        <button class="m-btn m-btn-ghost" type="button" id="mithnahSlidePanelClose">إغلاق</button>
      </header>
      <div class="tabs" role="tablist">
        <button class="tab-btn active" data-kind="dua"     role="tab">الأدعية</button>
        <button class="tab-btn"        data-kind="ziyarah" role="tab">الزيارات</button>
        <button class="tab-btn"        data-kind="taqib"   role="tab">التعقيبات</button>
        <button class="tab-btn"        data-kind="tasbih"  role="tab">التسبيح</button>
      </div>
      <div class="list m-scroll" id="mithnahSlideList" role="region" aria-label="قائمة المحتوى"></div>
      <div class="deck-info" id="mithnahSlideDeckInfo" hidden>
        <div class="title" id="mithnahSlideDeckTitle"></div>
        <div class="subtitle" id="mithnahSlideDeckSubtitle"></div>
        <div class="counter" id="mithnahSlideDeckCounter"></div>
      </div>
      <div class="controls" role="group" aria-label="تحكم الشرائح">
        <button class="m-btn m-btn-ghost"  type="button" id="mithnahSlidePrev"  aria-label="السابق" disabled>السابق</button>
        <button class="m-btn m-btn-secondary" type="button" id="mithnahSlideBlank" aria-label="شاشة سوداء" aria-pressed="false" disabled>إعتام</button>
        <button class="m-btn m-btn-primary" type="button" id="mithnahSlideNext"  aria-label="التالي" disabled>التالي</button>
      </div>
      <div class="close-row">
        <button class="m-btn m-btn-ghost" type="button" id="mithnahSlideDeckClose" disabled>إنهاء العرض</button>
      </div>
      <div class="m-status m-status-info panel-status" id="mithnahSlideStatus" role="status" aria-live="polite">اختر دعاءً أو زيارةً للبدء</div>
    </div>
  `;
  document.body.appendChild(panel);

  const $close      = panel.querySelector('#mithnahSlidePanelClose');
  const $list       = panel.querySelector('#mithnahSlideList');
  const $deckInfo   = panel.querySelector('#mithnahSlideDeckInfo');
  const $deckTitle  = panel.querySelector('#mithnahSlideDeckTitle');
  const $deckSub    = panel.querySelector('#mithnahSlideDeckSubtitle');
  const $deckCount  = panel.querySelector('#mithnahSlideDeckCounter');
  const $prev       = panel.querySelector('#mithnahSlidePrev');
  const $next       = panel.querySelector('#mithnahSlideNext');
  const $blank      = panel.querySelector('#mithnahSlideBlank');
  const $end        = panel.querySelector('#mithnahSlideDeckClose');
  const $status     = panel.querySelector('#mithnahSlideStatus');

  let activeKind = 'dua';
  let catalog = { dua: [], ziyarah: [], taqib: [], tasbih: [] };
  let lastSlideshowState = { active: false, index: 0, slides: [], deck: null, blanked: false };
  let lastFocused = null;

  const setStatus = (msg, kind = 'info') => {
    $status.textContent = msg;
    $status.className = 'm-status m-status-' + kind + ' panel-status';
  };

  async function getToken() {
    const cached = sessionStorage.getItem(TOKEN_KEY);
    if (cached) return cached;
    throw new Error('انتهت الجلسة — افتح زر GPS أولاً وأدخل PIN.');
  }
  async function authedFetch(url, body) {
    const token = await getToken();
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Requested-With': 'Mithnah' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (resp.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      throw new Error('انتهت الجلسة — أعد إدخال PIN.');
    }
    return resp;
  }

  async function loadCatalog() {
    try {
      const resp = await authedFetch('/api/shia/catalog');
      if (!resp.ok) throw new Error('فشل تحميل المحتوى');
      const data = await resp.json();
      catalog = data.catalog || catalog;
      renderList();
    } catch (err) {
      setStatus(err.message || 'تعذّر تحميل المحتوى.', 'danger');
    }
  }

  function renderList() {
    const items = (catalog[activeKind] || []);
    if (items.length === 0) {
      $list.innerHTML = '<div class="empty">لا يوجد محتوى في هذه الفئة بعد.</div>';
      return;
    }
    $list.innerHTML = items.map((item) => {
      const id = String(item.id || '');
      const title = String(item.title || item.ar || 'بدون عنوان');
      const subtitle = String(item.subtitle || item.occasion || '');
      const source = String(item.source || '');
      const isActive = lastSlideshowState.active && lastSlideshowState.deck && lastSlideshowState.deck.id === item.id;
      return '<button class="item ' + (isActive ? 'active' : '') + '" data-id="' + escapeAttr(id) + '" data-kind="' + activeKind + '" type="button">' +
        '<h4>' + escapeHtml(title) + '</h4>' +
        (subtitle ? '<p>' + escapeHtml(subtitle) + '</p>' : '') +
        (source ? '<small>' + escapeHtml(source) + '</small>' : '') +
        '</button>';
    }).join('');
    $list.querySelectorAll('button.item').forEach((el) => {
      el.addEventListener('click', async () => {
        const id = el.getAttribute('data-id');
        const kind = el.getAttribute('data-kind');
        try {
          const resp = await authedFetch('/api/slideshow/open', { kind, id });
          if (!resp.ok) {
            const data = await resp.json().catch(() => ({}));
            throw new Error(data.message || 'فشل الفتح');
          }
          setStatus('تم فتح العرض على الشاشة الرئيسية.', 'success');
        } catch (err) {
          setStatus(err.message, 'danger');
        }
      });
    });
  }

  function applySlideshowState(state) {
    lastSlideshowState = state || lastSlideshowState;
    const active = Boolean(state && state.active);
    const slides = (state && state.slides) || [];
    const deck = (state && state.deck) || null;

    $prev.disabled  = !active;
    $next.disabled  = !active;
    $blank.disabled = !active;
    $end.disabled   = !active;

    if (active && deck) {
      $deckInfo.hidden = false;
      $deckTitle.textContent = deck.title || '';
      $deckSub.textContent = deck.subtitle || '';
      const current = toArabicDigits(state.index + 1);
      const total = toArabicDigits(slides.length);
      $deckCount.textContent = 'الشريحة ' + current + ' من ' + total;
      $blank.classList.toggle('active', Boolean(state.blanked));
      $blank.setAttribute('aria-pressed', state.blanked ? 'true' : 'false');
      $blank.textContent = state.blanked ? 'إلغاء الإعتام' : 'إعتام';
      setStatus('استخدم السابق/التالي للتنقل بين الشرائح.', 'info');
    } else {
      $deckInfo.hidden = true;
      $blank.classList.remove('active');
      $blank.setAttribute('aria-pressed', 'false');
      $blank.textContent = 'إعتام';
    }
    renderList();
  }

  async function pollState() {
    try {
      const resp = await authedFetch('/api/slideshow/state');
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.state) applySlideshowState(data.state);
      }
    } catch (_) {}
  }

  let pollTimer = null;
  function startSync() {
    if (window.io && typeof window.io === 'function') {
      try {
        const token = sessionStorage.getItem(TOKEN_KEY);
        if (token) {
          const s = window.io({ auth: { token }, forceNew: true });
          s.on('slideshow:state', applySlideshowState);
        }
      } catch (_) {}
    }
    if (!pollTimer) {
      pollTimer = setInterval(() => {
        if (panel.classList.contains('m-open')) pollState();
      }, 2000);
    }
    pollState();
  }

  panel.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      panel.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeKind = btn.getAttribute('data-kind');
      renderList();
    });
  });

  async function sendCommand(command, payload) {
    try {
      const resp = await authedFetch('/api/slideshow/command', { command, payload: payload || {} });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.message || 'فشل الأمر');
      }
    } catch (err) {
      setStatus(err.message, 'danger');
    }
  }
  $prev.addEventListener('click', () => sendCommand('PREV'));
  $next.addEventListener('click', () => sendCommand('NEXT'));
  $blank.addEventListener('click', () => sendCommand('BLANK'));
  $end.addEventListener('click', () => sendCommand('CLOSE'));

  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closePanel(); return; }
    if (!lastSlideshowState.active) return;
    if (e.key === 'ArrowLeft'  || e.key === 'PageUp')                               { e.preventDefault(); sendCommand('PREV'); }
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ')            { e.preventDefault(); sendCommand('NEXT'); }
    if (e.key === 'b' || e.key === 'B' || e.key === '.')                            { e.preventDefault(); sendCommand('BLANK'); }
    if (e.key === 'Home')                                                            { e.preventDefault(); sendCommand('FIRST'); }
    if (e.key === 'End')                                                             { e.preventDefault(); sendCommand('LAST'); }
  });

  function openPanel() {
    lastFocused = document.activeElement;
    panel.classList.add('m-open');
    panel.setAttribute('aria-hidden', 'false');
    startSync();
    loadCatalog();
    panel.querySelector('.tab-btn.active')?.focus();
  }
  function closePanel() {
    panel.classList.remove('m-open');
    panel.setAttribute('aria-hidden', 'true');
    if (lastFocused && typeof lastFocused.focus === 'function') {
      try { lastFocused.focus(); } catch (_) {}
    }
  }

  const PANEL_FOCUSABLE = 'button:not(:disabled), input, [tabindex]:not([tabindex="-1"])';
  document.addEventListener('keydown', (event) => {
    if (!panel.classList.contains('m-open')) return;
    if (event.key !== 'Tab') return;
    const focusable = Array.from(panel.querySelectorAll(PANEL_FOCUSABLE))
      .filter((el) => el.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  openBtn.addEventListener('click', openPanel);
  $close.addEventListener('click', closePanel);

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }
})();
