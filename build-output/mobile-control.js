// Mithnah mobile-control — phone UI for the wall server.
//
// Rebuilt from scratch in 0.8.30 after the stacked-card version
// collected enough friction to be unusable. The new shape is a
// four-tab SPA:
//
//   Home      — next prayer hero + today's Hijri + prayer-times list
//   Controls  — tracker + slideshow buttons, grouped and big
//   Library   — browse bundled Shia content, tap to push to the wall
//   Settings  — GPS handoff, announcement text editor, PIN + URL view
//
// Every server call flows through `authedPost`, which handles:
//   - token expiry (401)  → warning + auth screen
//   - rate limit (429)    → "retry after N sec" with Retry-After header
//   - network timeout     → AbortController, 8 s
//   - offline             → window.online/offline listeners reset state
//
// Refresh policy: Home tab polls every 30 s with exponential backoff
// on failure (max 5 min). Library is cached in-memory and refreshed
// only when the tab opens. Settings pulls a fresh snapshot each time.

(() => {
  const TOKEN_KEY     = 'mithnah-gps-token';
  const TOKEN_EXP_KEY = 'mithnah-gps-token-exp';

  const AR_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  const toArabicDigits = (v) => String(v).replace(/\d/g, (d) => AR_DIGITS[Number(d)] || d);

  const PRAYER_NAMES_AR = {
    fajr:    'الفجر',   sunrise: 'الشروق',
    dhuhr:   'الظهر',   asr:     'العصر',
    maghrib: 'المغرب',  isha:    'العشاء'
  };
  const EVENT_KIND_LABEL_AR = {
    shahadah:    'شهادة',
    wiladah:     'ولادة',
    eid:         'عيد',
    significant: 'مناسبة'
  };
  const HIJRI_MONTHS_AR = [
    'محرم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة',
    'رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'
  ];

  const $ = (id) => document.getElementById(id);

  // ─── Time formatting ─────────────────────────────────────────────
  const hhmmLocal = (iso, format = '24') => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    let h = d.getHours();
    const mm = String(d.getMinutes()).padStart(2, '0');
    if (format === '12') {
      const suffix = h < 12 ? 'ص' : 'م';
      h = h % 12 || 12;
      return `${String(h).padStart(2, '0')}:${mm} ${suffix}`;
    }
    return `${String(h).padStart(2, '0')}:${mm}`;
  };
  const countdown = (iso, now = Date.now()) => {
    if (!iso) return '—';
    const target = new Date(iso).getTime();
    const diffSec = Math.max(0, Math.floor((target - now) / 1000));
    const h = Math.floor(diffSec / 3600);
    const m = Math.floor((diffSec % 3600) / 60);
    const s = diffSec % 60;
    if (h > 0) return `بعد ${toArabicDigits(h)} ساعة و ${toArabicDigits(m)} دقيقة`;
    if (m > 0) return `بعد ${toArabicDigits(m)} دقيقة و ${toArabicDigits(s)} ثانية`;
    return `بعد ${toArabicDigits(s)} ثانية`;
  };
  const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  // ─── Auth + HTTP helpers ─────────────────────────────────────────
  function hasValidToken() {
    const t = sessionStorage.getItem(TOKEN_KEY);
    const exp = Number(sessionStorage.getItem(TOKEN_EXP_KEY) || 0);
    return Boolean(t && exp > Date.now() + 60_000);
  }

  async function fetchWithTimeout(url, init, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetch(url, { ...(init || {}), signal: ctrl.signal });
    } finally {
      clearTimeout(id);
    }
  }

  async function authWithPin(pin) {
    let resp;
    try {
      resp = await fetchWithTimeout('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Mithnah' },
        body: JSON.stringify({ pin })
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('لا يوجد اتصال — تحقق من الشبكة');
      throw new Error('خطأ في الاتصال: ' + err.message);
    }
    if (resp.status === 429) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(`محاولات متكرّرة — حاول بعد ${toArabicDigits(data.retryAfterSec || 900)} ثانية`);
    }
    if (!resp.ok) {
      // Surface remaining-attempts hint when the server provides it in
      // the body. Previously the phone only said "رمز PIN غير صحيح"
      // which left an elderly caretaker with arthritis staring at a
      // generic error — they didn't know whether their next tap would
      // lock them out for 15 minutes or not. UX audit 2026-04-24.
      const data = await resp.json().catch(() => ({}));
      const remaining = Number(data.attemptsLeft);
      if (Number.isFinite(remaining) && remaining >= 0) {
        throw new Error(`رمز PIN غير صحيح — تبقّى ${toArabicDigits(remaining)} محاولة`);
      }
      throw new Error('رمز PIN غير صحيح');
    }
    const data = await resp.json();
    if (!data.token) throw new Error('فشل الحصول على الصلاحية');
    sessionStorage.setItem(TOKEN_KEY, data.token);
    sessionStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + Number(data.expiresInMs || 0)));
    return data.token;
  }

  async function authedPost(url, body) {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) { showAuthScreen(); throw new Error('الجلسة منتهية — أعد إدخال PIN'); }
    let resp;
    try {
      resp = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token,
          'X-Requested-With': 'Mithnah'
        },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('انتهى وقت الانتظار — تحقق من الشبكة');
      throw new Error('خطأ في الاتصال: ' + err.message);
    }
    if (resp.status === 401) {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_EXP_KEY);
      stopRefreshLoop();
      // Wipe in-memory state — same rationale as the explicit
      // logout handler, so a re-auth against a different PIN
      // doesn't paint stale values from the expired session.
      catalog = null;
      catalogFetchedAt = 0;
      lastSnapshot = null;
      currentPin = '';
      // Same rationale as the logout handler — clear the deferred
      // auto-mask so it can't fire post-expiry onto a '—' placeholder.
      if (pinMaskTimer) { clearTimeout(pinMaskTimer); pinMaskTimer = null; }
      $('dash-status-line').textContent = 'انتهت الجلسة — جاري العودة لشاشة الدخول...';
      $('dash-status-line').className = 'dash__status err';
      setTimeout(() => showAuthScreen(), 1500);
      throw new Error('الجلسة منتهية — أعد إدخال PIN');
    }
    if (resp.status === 429) {
      const data = await resp.json().catch(() => ({}));
      const retrySec = Number(data.retryAfterSec) || Number(resp.headers.get('Retry-After')) || 5;
      throw new Error(`تم حظر المحاولات مؤقتاً — أعد بعد ${toArabicDigits(retrySec)} ثانية`);
    }
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.message || ('خطأ ' + resp.status));
    return data;
  }

  // ─── Screen switcher ─────────────────────────────────────────────
  function showAuthScreen() {
    $('auth-screen').classList.remove('hidden');
    $('dashboard').classList.add('hidden');
    setTimeout(() => { try { $('pin-input').focus(); } catch (_) {} }, 30);
  }
  function showDashboard() {
    $('auth-screen').classList.add('hidden');
    $('dashboard').classList.remove('hidden');
  }

  // ─── Tab nav ─────────────────────────────────────────────────────
  function switchTab(tab) {
    ['home', 'ctrl', 'lib', 'set'].forEach((t) => {
      const btn   = $('tab-' + t);
      const panel = $('panel-' + t);
      const active = (t === tab);
      if (btn)   { btn.classList.toggle('nav__btn--active', active); btn.setAttribute('aria-selected', String(active)); }
      if (panel) panel.classList.toggle('active', active);
    });
    // On-focus refreshes — library pulls the catalogue first time;
    // settings pulls config each visit so phone-edited values stay
    // in sync with the wall.
    if (tab === 'lib') ensureLibraryLoaded();
    if (tab === 'set') refreshSettings();
  }

  // ─── Toast helper ────────────────────────────────────────────────
  function toast(id, text, kind = 'ok') {
    const el = $(id);
    if (!el) return;
    el.textContent = text;
    el.classList.remove('err', 'ok');
    el.classList.add('show');
    if (kind === 'err') el.classList.add('err');
    if (kind === 'ok')  el.classList.add('ok');
    clearTimeout(el._fadeTimer);
    el._fadeTimer = setTimeout(() => { el.classList.remove('show'); }, 3500);
  }

  // ─── Home tab render ─────────────────────────────────────────────
  let lastSnapshot = null;
  let refreshTimer = null;
  let clockTimer   = null;
  const BASE_REFRESH_MS = 30_000;
  const MAX_REFRESH_MS  = 5 * 60_000;
  let currentRefreshMs  = BASE_REFRESH_MS;

  // PIN is stored internally; the Settings tab only reveals it when
  // the operator explicitly taps the button. Shoulder-surfing a large
  // bright number in a mosque hall is easy otherwise.
  let currentPin = '';

  async function refresh() {
    try {
      $('dash-status-line').textContent = 'جاري التحديث...';
      $('dash-status-line').className = 'dash__status';
      const resp = await authedPost('/api/phone-dashboard');
      // Token-expiry race guard: the await above yields control, and a
      // visibilitychange or 401 handler may have logged the operator
      // out in the meantime. Drop the response rather than painting
      // stale prayer times over the auth screen.
      if (!hasValidToken()) return;
      lastSnapshot = resp.data;
      if (lastSnapshot) lastSnapshot.__fetchedAt = Date.now();
      renderHome(resp.data);
      renderSettings(resp.data); // the settings tab also reads from this
      // Connection info (PIN + URL) — update the settings tab fields
      // opportunistically so the operator never sees stale pairing
      // details on their phone after the wall reboots on a new Wi-Fi.
      const conn = (resp.data && resp.data.connection) || {};
      if (conn.pin) {
        currentPin = String(conn.pin);
        // Only repaint the PIN cell if it's currently revealed; if
        // it's masked, leave the "اضغط للعرض" prompt in place.
        const pinBtn = $('set-pin');
        if (pinBtn && pinBtn.getAttribute('data-revealed') === 'true') {
          // PIN stays in Latin digits — operator asked for it:
          // Arabic-Indic digits are harder to read at a glance on a
          // phone ("٨٧٢٥" vs "8725"). The mosque name and prayer
          // times remain Arabic; only the login code stays Latin.
          pinBtn.textContent = currentPin;
        }
      }
      if (conn.url) $('set-url').textContent = conn.url;
      $('dash-status-line').textContent = '';
      if (currentRefreshMs !== BASE_REFRESH_MS) {
        currentRefreshMs = BASE_REFRESH_MS;
        restartRefreshTimer();
      }
    } catch (err) {
      $('dash-status-line').textContent = err.message;
      $('dash-status-line').className = 'dash__status err';
      currentRefreshMs = Math.min(currentRefreshMs * 2, MAX_REFRESH_MS);
      restartRefreshTimer();
    }
  }
  function restartRefreshTimer() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (hasValidToken()) refreshTimer = setInterval(refresh, currentRefreshMs);
  }

  function renderHome(data) {
    const { config, prayerTimes, hijri, events, upcoming } = data || {};
    if (!config) return;

    if (config.mosqueName) $('brand-mosque-name').textContent = config.mosqueName;

    const clockFmt = config.clockFormat === '12' ? '12' : '24';
    const next = prayerTimes && prayerTimes.next;
    if (next) {
      $('next-name').textContent = PRAYER_NAMES_AR[next.name] || next.name;
      $('next-time').textContent = toArabicDigits(hhmmLocal(next.at, clockFmt));
      $('next-countdown').textContent = countdown(next.at);
    }

    // Today event (if any) + upcoming hint
    if (events && events.length > 0) {
      const e = events[0];
      $('today-event').classList.remove('hidden');
      $('today-event-kind').textContent  = EVENT_KIND_LABEL_AR[e.kind] || 'مناسبة';
      $('today-event-title').textContent = e.title_ar;
      $('event-inline').textContent = '';
    } else {
      $('today-event').classList.add('hidden');
      if (upcoming && upcoming.length > 0) {
        const u = upcoming[0];
        const month = HIJRI_MONTHS_AR[u.hijriTarget.month - 1] || '';
        $('event-inline').textContent =
          `المناسبة القادمة: ${u.event.title_ar} — ${toArabicDigits(u.hijriTarget.day)} ${month} (بعد ${toArabicDigits(u.daysAway)} يوم)`;
      } else {
        $('event-inline').textContent = '';
      }
    }

    if (hijri) {
      $('hijri-date').textContent =
        `${toArabicDigits(hijri.day)} ${hijri.monthAr || ''} ${toArabicDigits(hijri.year)} هـ`;
    } else {
      $('hijri-date').textContent = '—';
    }

    // Prayer list
    const today = prayerTimes && prayerTimes.today;
    if (today && today.timesIso) {
      const allOrder = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
      const html = allOrder.map((k) => {
        const iso = today.timesIso[k];
        if (!iso) return '';
        const time = toArabicDigits(hhmmLocal(iso, clockFmt));
        const isNext = next && next.name === k;
        return `<div class="prayers__row ${isNext ? 'next' : ''}">
          <span class="prayers__name">${PRAYER_NAMES_AR[k] || k}</span>
          <span class="prayers__time">${time}</span>
        </div>`;
      }).join('');
      $('prayer-list').innerHTML = html;
    }
  }
  function tickCountdown() {
    if (!lastSnapshot || !lastSnapshot.prayerTimes || !lastSnapshot.prayerTimes.next) return;
    $('next-countdown').textContent = countdown(lastSnapshot.prayerTimes.next.at);
  }

  // Wrap an async click handler so the button disables itself for the
  // lifetime of the fetch AND a short trailing cooldown. Without this
  // a spam-tap on "التالي" can fire 10 overlapping /api/tracker/command
  // requests and advance the rakah 10 times instead of once.
  function guardedClick(btn, handler) {
    btn.addEventListener('click', async () => {
      if (btn._inflight) return;
      btn._inflight = true;
      btn.disabled = true;
      btn.style.opacity = '0.55';
      try {
        await handler();
      } finally {
        // 150ms cooldown — stops truly rapid taps (iOS double-tap-zoom
        // safety) from firing back-to-back requests the moment the
        // first completes.
        setTimeout(() => {
          btn._inflight = false;
          btn.disabled = false;
          btn.style.opacity = '';
        }, 150);
      }
    });
  }

  // ─── Controls tab ────────────────────────────────────────────────
  function wireControls() {
    document.querySelectorAll('[data-tracker]').forEach((btn) => {
      guardedClick(btn, async () => {
        const action = btn.getAttribute('data-tracker');
        try {
          await authedPost('/api/tracker/command', { action });
          toast('ctrl-toast', labelFor('tracker', action) + ' ✓', 'ok');
        } catch (err) {
          toast('ctrl-toast', err.message, 'err');
        }
      });
    });
    document.querySelectorAll('[data-rakahs]').forEach((btn) => {
      guardedClick(btn, async () => {
        const rakahs = Number(btn.getAttribute('data-rakahs'));
        try {
          await authedPost('/api/tracker/command', { action: 'set-rakahs', rakahs });
          await authedPost('/api/tracker/command', { action: 'open' });
          toast('ctrl-toast', `فتح التتبّع (${toArabicDigits(rakahs)} ركعات) ✓`, 'ok');
        } catch (err) {
          toast('ctrl-toast', err.message, 'err');
        }
      });
    });
    document.querySelectorAll('[data-slide]').forEach((btn) => {
      guardedClick(btn, async () => {
        const command = btn.getAttribute('data-slide');
        try {
          await authedPost('/api/slideshow/command', { command });
          toast('ctrl-toast', labelFor('slide', command) + ' ✓', 'ok');
        } catch (err) {
          toast('ctrl-toast', err.message, 'err');
        }
      });
    });
  }
  const CMD_LABELS = {
    tracker: { open:'فتح التتبّع', close:'إغلاق التتبّع', next:'ركعة تالية', prev:'ركعة سابقة', reset:'إعادة', 'set-rakahs':'ضبط الركعات' },
    slide:   { NEXT:'السلايد التالي', PREV:'السلايد السابق', BLANK:'إخفاء الشاشة', CLOSE:'إنهاء العرض' }
  };
  const labelFor = (k, a) => (CMD_LABELS[k] && CMD_LABELS[k][a]) || a;

  // ─── Library tab ─────────────────────────────────────────────────
  let catalog = null;   // { dua:[], ziyarah:[], taqib:[], tasbih:[] }
  let catalogFetchedAt = 0;
  let libTab = 'dua';
  let libQuery = '';
  // Page size + current page — we render incrementally instead of
  // dumping all 2700 taqibat into innerHTML at once. Low-end Android
  // devices visibly hitch on a 2700-element rebuild.
  const LIB_PAGE_SIZE = 60;
  let libVisible = LIB_PAGE_SIZE;
  // Stale-cache TTL: auto-refetch when the Library tab opens after
  // more than CATALOG_TTL ms. Without this the phone never sees a
  // dua the operator added on the wall's F4 picker since the last
  // login. 5 minutes balances freshness against server chatter.
  const CATALOG_TTL_MS = 5 * 60 * 1000;

  async function ensureLibraryLoaded(force = false) {
    const fresh = catalog && (Date.now() - catalogFetchedAt) < CATALOG_TTL_MS;
    if (fresh && !force) return;
    const list = $('lib-list');
    list.innerHTML = '<div class="lib__empty"><span class="spinner"></span>جاري التحميل...</div>';
    try {
      const resp = await authedPost('/api/shia/catalog');
      catalog = resp.catalog || { dua: [], ziyarah: [], taqib: [], tasbih: [] };
      catalogFetchedAt = Date.now();
      libVisible = LIB_PAGE_SIZE; // reset paging on fresh data
      renderLibrary();
    } catch (err) {
      list.innerHTML = `<div class="lib__empty">${escapeHtml(err.message)}</div>`;
    }
  }
  function renderLibrary() {
    if (!catalog) return;
    const allItems = (catalog[libTab] || []).filter((it) => {
      if (!libQuery) return true;
      const q = libQuery.toLowerCase();
      return (it.title_ar || '').toLowerCase().includes(q)
          || (it.title    || '').toLowerCase().includes(q)
          || (it.subtitle_ar || '').toLowerCase().includes(q)
          || (it.id       || '').toLowerCase().includes(q);
    });
    const list  = $('lib-list');
    const empty = $('lib-empty');
    if (allItems.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    // Incremental render: only first libVisible items, plus a "Load
    // more" button if there are extras. Stops innerHTML from
    // materialising 2700 taqibat at once (visible jank on low-end
    // Android). Reset libVisible on tab/search change.
    const shown = allItems.slice(0, libVisible);
    const itemsHtml = shown.map((it) => `
      <button class="lib__item" data-kind="${escapeHtml(libTab)}" data-id="${escapeHtml(it.id)}" type="button">
        <span class="lib__item-body">
          <span class="lib__item-title">${escapeHtml(it.title_ar || it.title || it.id)}</span>
          ${it.subtitle_ar ? `<span class="lib__item-sub">${escapeHtml(it.subtitle_ar)}</span>` : ''}
        </span>
        <span class="lib__item-arrow" aria-hidden="true">←</span>
      </button>
    `).join('');
    const moreHtml = allItems.length > libVisible
      ? `<button id="lib-load-more" class="ctrl-btn" type="button" style="margin-top: 10px;">
           عرض المزيد (${toArabicDigits(allItems.length - libVisible)} متبقّي)
         </button>`
      : '';
    list.innerHTML = itemsHtml + moreHtml;
    // Announce the total count to screen readers. aria-live on
    // #lib-count fires whenever the text content changes.
    const countEl = $('lib-count');
    if (countEl) {
      countEl.textContent = allItems.length === 0
        ? ''
        : `${toArabicDigits(allItems.length)} ${allItems.length === 1 ? 'عنصر' : 'عنصراً'}${libQuery ? ` مطابق للبحث` : ''}`;
    }
    // Attach listeners fresh each render.
    list.querySelectorAll('.lib__item').forEach((btn) => {
      btn.addEventListener('click', () => openOnWall(btn.getAttribute('data-kind'), btn.getAttribute('data-id'), btn.querySelector('.lib__item-title').textContent.trim()));
    });
    const more = $('lib-load-more');
    if (more) {
      more.addEventListener('click', () => {
        libVisible += LIB_PAGE_SIZE;
        renderLibrary();
      });
    }
  }
  async function openOnWall(kind, id, label) {
    try {
      await authedPost('/api/slideshow/open', { kind, id });
      toast('ctrl-toast', `فُتح على الشاشة: ${label || id}`, 'ok');
      // Nudge the operator to the controls tab so prev/next are at
      // their thumb — they just opened something and usually want to
      // drive it immediately.
      switchTab('ctrl');
    } catch (err) {
      toast('ctrl-toast', err.message, 'err');
    }
  }
  function wireLibrary() {
    document.querySelectorAll('[data-libtab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        libTab = btn.getAttribute('data-libtab');
        libVisible = LIB_PAGE_SIZE; // reset paging when category changes
        document.querySelectorAll('[data-libtab]').forEach((b) => {
          const active = b === btn;
          b.classList.toggle('lib__tab--active', active);
          b.setAttribute('aria-pressed', String(active));
        });
        renderLibrary();
      });
    });
    // Debounced search so typing 2700+ taqibat doesn't re-render on
    // every keystroke. 150ms is the same debounce used inside the
    // Electron F4 picker.
    let searchT = null;
    $('lib-search').addEventListener('input', (e) => {
      const val = e.target.value.trim();
      clearTimeout(searchT);
      searchT = setTimeout(() => {
        libQuery = val;
        libVisible = LIB_PAGE_SIZE; // reset paging on new search
        renderLibrary();
      }, 150);
    });
  }

  // ─── Settings tab ────────────────────────────────────────────────
  // Track whether the operator has unsaved edits in the announcement
  // textarea. Refreshes running in the background must not clobber
  // mid-edit text. Flipped true on any `input` event, flipped false
  // after a successful save or when the textarea's live value
  // matches what the server reports.
  let announcementDirty = false;

  // PIN auto-mask timer is module-scoped so logout can clear it — if
  // it stayed inside wireSettings's closure the operator could log
  // out with PIN revealed and the deferred setTimeout would still
  // fire 20 s later, pointlessly poking a button that no longer shows
  // anything sensitive. Harmless either way, but tidier this way.
  let pinMaskTimer = null;

  function renderSettings(data) {
    if (!data || !data.config) return;
    const cfg = data.config;
    const loc = cfg.location || {};
    $('set-mosque').textContent   = cfg.mosqueName || '—';
    $('set-imam').textContent     = cfg.imamName || '—';
    $('set-loc').textContent      = loc.name || '—';
    $('set-method').textContent   = cfg.method || '—';
    $('set-calendar').textContent = cfg.calendar || '—';
    // Only populate the announcement textarea if the operator has no
    // unsaved edits. document.activeElement alone isn't enough — the
    // focus can leave the field briefly (tap outside, keyboard close)
    // and a refresh in that gap would wipe the draft.
    const ta = $('set-announcement');
    if (!announcementDirty) ta.value = cfg.announcementText || '';
  }
  async function refreshSettings() {
    // Reuse the Home tab's snapshot if it's fresh (< 15 s old) so we
    // don't spam the server every tab switch. Falls back to a fresh
    // fetch if there's no snapshot or it's stale.
    const snapshotAge = lastSnapshot && Date.now() - (lastSnapshot.__fetchedAt || 0);
    let data;
    if (lastSnapshot && snapshotAge < 15_000) {
      data = lastSnapshot;
    } else {
      try {
        const resp = await authedPost('/api/phone-dashboard');
        if (!hasValidToken()) return;
        data = resp.data || {};
        data.__fetchedAt = Date.now();
        lastSnapshot = data;
      } catch (err) {
        toast('ctrl-toast-set', err.message, 'err');
        return;
      }
    }
    if (data.config) renderSettings({ config: data.config });
    const conn = data.connection || {};
    if (conn.pin) currentPin = String(conn.pin);
    const pinBtn = $('set-pin');
    if (pinBtn && pinBtn.getAttribute('data-revealed') !== 'true') {
      pinBtn.textContent = currentPin ? 'اضغط للعرض' : '—';
    } else if (pinBtn) {
      pinBtn.textContent = currentPin || '—';
    }
    $('set-url').textContent = conn.url || '—';
  }
  function wireSettings() {
    // PIN reveal / re-mask toggle — shoulder-surfer safety. Reveal
    // stays for 20s then auto-masks back, so an operator who walks
    // away with the phone on isn't leaking the PIN.
    const pinBtn = $('set-pin');
    pinBtn.addEventListener('click', () => {
      if (!currentPin) return;
      const revealed = pinBtn.getAttribute('data-revealed') === 'true';
      if (revealed) {
        pinBtn.setAttribute('data-revealed', 'false');
        pinBtn.textContent = 'اضغط للعرض';
        pinBtn.setAttribute('aria-label', 'اضغط لعرض رمز PIN');
        pinBtn.setAttribute('title', 'اضغط لعرض رمز PIN');
        if (pinMaskTimer) { clearTimeout(pinMaskTimer); pinMaskTimer = null; }
      } else {
        pinBtn.setAttribute('data-revealed', 'true');
        // Append a subtle hide hint next to the digits so the operator
        // doesn't think tapping again will delete the PIN (UX audit
        // 2026-04-24: "after reveal, tapping again looks scary").
        pinBtn.textContent = `${currentPin}  ⟲ إخفاء`;
        pinBtn.setAttribute('aria-label', 'رمز PIN مكشوف — اضغط لإخفائه');
        pinBtn.setAttribute('title', 'اضغط لإخفاء رمز PIN');
        if (pinMaskTimer) clearTimeout(pinMaskTimer);
        pinMaskTimer = setTimeout(() => {
          if (pinBtn.getAttribute('data-revealed') === 'true') {
            pinBtn.setAttribute('data-revealed', 'false');
            pinBtn.textContent = 'اضغط للعرض';
            pinBtn.setAttribute('aria-label', 'اضغط لعرض رمز PIN');
            pinBtn.setAttribute('title', 'اضغط لعرض رمز PIN');
          }
        }, 20_000);
      }
    });

    $('set-announcement').addEventListener('input', () => { announcementDirty = true; });
    $('btn-save-announce').addEventListener('click', async () => {
      const text = $('set-announcement').value.trim();
      try {
        await authedPost('/api/config', { announcementText: text });
        announcementDirty = false; // saved value now matches the server
        toast('ctrl-toast-set', 'تمّ حفظ نصّ الإعلان ✓', 'ok');
      } catch (err) {
        toast('ctrl-toast-set', err.message, 'err');
      }
    });

    $('btn-gps').addEventListener('click', async () => {
      const btn = $('btn-gps');
      if (!navigator.geolocation) {
        toast('ctrl-toast-set', 'المتصفّح لا يدعم تحديد الموقع', 'err');
        return;
      }
      if (btn._busy) return; // prevent duplicate geolocation requests
      btn._busy = true;
      const originalLabel = btn.textContent;
      btn.disabled = true;
      btn.style.opacity = '0.65';
      btn.innerHTML = '<span class="spinner"></span> 📡 جاري طلب إذن الموقع...';
      toast('ctrl-toast-set', '📡 جاري طلب إذن الموقع من المتصفّح...', 'ok');
      try {
        const pos = await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('انتهت مهلة GPS')), 15000);
          navigator.geolocation.getCurrentPosition(
            (p) => { clearTimeout(t); resolve(p); },
            (e) => { clearTimeout(t); reject(e); },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
          );
        });
        btn.innerHTML = '<span class="spinner"></span> جاري الإرسال...';
        await authedPost('/api/location/set', {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          source: 'phone-gps'
        });
        toast('ctrl-toast-set', `تمّ إرسال الموقع (دقّة ${toArabicDigits(Math.round(pos.coords.accuracy))} م) ✓`, 'ok');
        // Force a refresh so the Settings tab and the wall both
        // reflect the new location instantly.
        setTimeout(refresh, 600);
      } catch (err) {
        // Map the native GeolocationPositionError codes to readable
        // Arabic messages — the generic err.message on some Android
        // browsers is empty.
        const msg = err.code === 1 ? 'رفضت المتصفّح الإذن بالموقع'
                 : err.code === 2 ? 'تعذّر تحديد الموقع (GPS معطّل؟)'
                 : err.code === 3 ? 'انتهت مهلة تحديد الموقع'
                 : err.message || 'خطأ غير متوقّع';
        toast('ctrl-toast-set', 'فشل الحصول على الموقع: ' + msg, 'err');
      } finally {
        btn._busy = false;
        btn.disabled = false;
        btn.style.opacity = '';
        btn.textContent = originalLabel;
      }
    });
  }

  // ─── Lifecycle ───────────────────────────────────────────────────
  function startRefreshLoop() {
    if (refreshTimer) return;
    currentRefreshMs = BASE_REFRESH_MS;
    refresh();
    refreshTimer = setInterval(refresh, currentRefreshMs);
    if (!clockTimer) clockTimer = setInterval(tickCountdown, 1000);
  }
  function stopRefreshLoop() {
    if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
    if (clockTimer)   { clearInterval(clockTimer); clockTimer = null; }
  }

  function onVisibilityChange() {
    if (document.visibilityState !== 'visible') {
      // Tab is backgrounded — stop the refresh + clock timers so we
      // don't drain the phone battery polling the wall while the
      // operator is in another app.
      stopRefreshLoop();
      return;
    }
    if (!hasValidToken()) {
      showAuthScreen();
      $('auth-status').textContent = 'انتهت الجلسة — أعد إدخال PIN';
      $('auth-status').className = 'm-status m-status-danger';
      return;
    }
    // Tab is visible again — resume polling and refresh right away
    // so the operator doesn't wait 30s for the next cycle.
    startRefreshLoop();
  }
  function onNetworkChange() {
    if (!navigator.onLine) {
      $('dash-status-line').textContent = 'لا يوجد اتصال بالشبكة';
      $('dash-status-line').className = 'dash__status err';
      return;
    }
    currentRefreshMs = BASE_REFRESH_MS;
    restartRefreshTimer();
    refresh();
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Auth form
    $('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pin = $('pin-input').value.trim();
      const $status = $('auth-status');
      if (!/^\d{4,8}$/.test(pin)) {
        $status.textContent = 'أدخل رمز PIN صحيح (٤-٨ أرقام)';
        $status.className = 'm-status m-status-danger';
        return;
      }
      $status.innerHTML = '<span class="spinner"></span> جاري التحقق...';
      $status.className = 'm-status m-status-info';
      try {
        await authWithPin(pin);
        $status.textContent = '';
        showDashboard();
        startRefreshLoop();
      } catch (err) {
        $status.textContent = err.message;
        $status.className = 'm-status m-status-danger';
      }
    });

    // Dashboard actions
    $('btn-refresh').addEventListener('click', refresh);
    $('btn-logout').addEventListener('click', () => {
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_EXP_KEY);
      stopRefreshLoop();
      // Reset in-memory state so a subsequent login against a wall
      // with a different PIN / mosque name / catalog starts clean.
      // Without this, the Settings tab would briefly show the old
      // mosque's PIN after re-auth (until the first refresh landed).
      catalog = null;
      catalogFetchedAt = 0;
      lastSnapshot = null;
      currentPin = '';
      announcementDirty = false;
      // Cancel any pending auto-mask before resetting the button —
      // otherwise a timer queued up from a revealed PIN can fire
      // after logout and overwrite the '—' placeholder with
      // 'اضغط للعرض', which is confusing on the auth screen.
      if (pinMaskTimer) { clearTimeout(pinMaskTimer); pinMaskTimer = null; }
      // Reset the PIN reveal button to its default masked state so
      // the previous mosque's PIN doesn't linger if the operator
      // had it revealed on screen before logout.
      const pinBtn = $('set-pin');
      if (pinBtn) {
        pinBtn.setAttribute('data-revealed', 'false');
        pinBtn.textContent = '—';
      }
      showAuthScreen();
    });

    // Tab bar
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
    });

    wireControls();
    wireLibrary();
    wireSettings();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online',  onNetworkChange);
    window.addEventListener('offline', onNetworkChange);

    if (hasValidToken()) {
      showDashboard();
      startRefreshLoop();
    } else {
      showAuthScreen();
    }
  });
})();
