// Mithnah onboarding + settings wizard — token-only styling, shared
// component classes from mithnah-design.css v2.

(() => {
  const TOKEN_KEY = 'mithnah-gps-token';
  const TOKEN_EXP_KEY = 'mithnah-gps-token-exp';
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
    #mithnahSettingsBtn {
      position: fixed; bottom: 112px; left: 120px; z-index: 200;
    }
    #mithnahSettingsBtn .ico {
      font-family: 'Material Symbols Outlined';
      font-size: 22px; font-variation-settings: 'FILL' 1;
    }

    /* Wizard — uses .m-modal-backdrop + .m-modal-card; these classes just
     * add the onboarding-specific inner structure. */
    #mithnahOnboardModal .crown {
      display: flex; flex-direction: column; align-items: center; gap: var(--m-space-3);
      margin-bottom: var(--m-space-4);
    }
    #mithnahOnboardModal .crown-glyph {
      width: 48px; height: 48px;
      display: flex; align-items: center; justify-content: center;
      background: var(--m-primary-subtle);
      border-radius: var(--m-radius-md);
      color: var(--m-primary);
      font-family: var(--m-font-display);
      font-size: 26px; font-weight: 800;
    }
    #mithnahOnboardModal h2 {
      margin: 0; text-align: center;
      font-family: var(--m-font-display);
      font-size: 24px; font-weight: 800;
      color: var(--m-text-primary);
    }
    #mithnahOnboardModal .welcome-sub {
      margin: var(--m-space-2) 0 var(--m-space-5); text-align: center;
      font-family: var(--m-font-body);
      font-size: 14px; line-height: 1.7;
      color: var(--m-text-secondary);
    }

    #mithnahOnboardModal .step-dots {
      display: flex; gap: var(--m-space-3); justify-content: center;
      margin-bottom: var(--m-space-5);
    }
    #mithnahOnboardModal .step-dots span {
      width: 8px; height: 8px; border-radius: var(--m-radius-full);
      background: var(--m-border-medium);
      transition: all var(--m-dur-med) var(--m-ease);
    }
    #mithnahOnboardModal .step-dots span.active {
      background: var(--m-primary);
      width: 24px;
    }

    #mithnahOnboardModal .step { display: none; }
    #mithnahOnboardModal .step.active {
      display: block;
      animation: step-in var(--m-dur-med) var(--m-ease);
    }
    @keyframes step-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

    #mithnahOnboardModal h3 {
      margin: 0 0 var(--m-space-2);
      font-family: var(--m-font-body);
      font-size: 17px; font-weight: 800;
      color: var(--m-text-primary);
      text-align: center;
    }
    #mithnahOnboardModal p {
      margin: 0 0 var(--m-space-4); text-align: center;
      font-family: var(--m-font-body);
      font-size: 14px; line-height: 1.75;
      color: var(--m-text-secondary);
    }

    /* Marja list — card rows, clean selection feedback. */
    #mithnahOnboardModal .marja-list {
      display: flex; flex-direction: column; gap: var(--m-space-2);
      max-height: 50vh; overflow-y: auto;
      padding: 2px;
      margin-bottom: var(--m-space-3);
    }
    #mithnahOnboardModal .marja-item {
      text-align: right;
      padding: var(--m-space-3) var(--m-space-4);
      background: var(--m-bg-surface);
      border: 1.5px solid var(--m-border-subtle);
      border-radius: var(--m-radius-sm);
      color: var(--m-text-primary);
      font-family: var(--m-font-body);
      cursor: pointer;
      transition: all var(--m-dur-fast) var(--m-ease);
    }
    #mithnahOnboardModal .marja-item:hover {
      border-color: var(--m-primary-ring);
      background: var(--m-primary-subtle);
    }
    #mithnahOnboardModal .marja-item:focus-visible {
      outline: 2px solid var(--m-primary);
      outline-offset: 2px;
    }
    #mithnahOnboardModal .marja-item.selected {
      background: var(--m-primary-subtle);
      border-color: var(--m-primary);
    }
    #mithnahOnboardModal .marja-item .name-ar {
      display: block;
      font-family: var(--m-font-display);
      font-size: 16px; font-weight: 700;
      color: var(--m-text-primary);
    }
    #mithnahOnboardModal .marja-item.selected .name-ar { color: var(--m-primary); }
    #mithnahOnboardModal .marja-item .office {
      display: block; margin-top: 2px;
      font-size: 12px; color: var(--m-text-muted);
    }

    /* GPS reminder box. */
    #mithnahOnboardModal .gps-box {
      padding: var(--m-space-4);
      background: var(--m-primary-subtle);
      border: 1px solid var(--m-border-subtle);
      border-radius: var(--m-radius-md);
      text-align: center;
      margin-bottom: var(--m-space-3);
    }
    #mithnahOnboardModal .gps-box .gps-icon-wrap {
      display: inline-flex; align-items: center; justify-content: center;
      width: 48px; height: 48px;
      background: var(--m-bg-surface);
      border-radius: var(--m-radius-full);
      margin-bottom: var(--m-space-2);
    }
    #mithnahOnboardModal .gps-box .gps-icon {
      font-family: 'Material Symbols Outlined';
      font-size: 26px; font-variation-settings: 'FILL' 1;
      color: var(--m-primary);
    }
    #mithnahOnboardModal .gps-box strong {
      display: block;
      font-family: var(--m-font-body);
      font-size: 15px; font-weight: 800;
      color: var(--m-text-primary);
      margin-bottom: var(--m-space-2);
    }

    #mithnahOnboardModal .btn-row {
      display: grid; grid-template-columns: 1fr 2fr;
      gap: var(--m-space-2); margin-top: var(--m-space-5);
    }

    /* Label above PIN input. */
    #mithnahOnboardModal .pin-label {
      display: block; text-align: center;
      font-family: var(--m-font-body);
      font-size: 13px; font-weight: 600; color: var(--m-text-muted);
      margin-bottom: var(--m-space-2);
    }
  `;
  document.head.appendChild(style);

  // Floating settings button uses .m-fab class.
  const settingsBtn = document.createElement('button');
  settingsBtn.id = 'mithnahSettingsBtn';
  settingsBtn.className = 'm-fab';
  settingsBtn.type = 'button';
  settingsBtn.setAttribute('aria-label', 'فتح إعدادات المسجد والمرجع');
  settingsBtn.setAttribute('aria-haspopup', 'dialog');
  settingsBtn.innerHTML = '<span class="ico" style="font-family:\'Material Symbols Outlined\';font-size:22px;font-variation-settings:\'FILL\' 1" aria-hidden="true">tune</span><span>إعدادات</span>';
  document.body.appendChild(settingsBtn);

  const modal = document.createElement('div');
  modal.id = 'mithnahOnboardModal';
  modal.className = 'm-modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'mithnahOnboardTitle');
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="m-modal-card m-scroll">
      <div class="crown" aria-hidden="true">
        <div class="crown-glyph">م</div>
        <div class="m-divider"><span class="m-divider-dot"></span></div>
      </div>
      <h2 id="mithnahOnboardTitle">أهلاً بك في مئذنة</h2>
      <p class="welcome-sub">إعداد المسجد في ثلاث خطوات — PIN ثم المرجع ثم الموقع.</p>

      <div class="step-dots" aria-hidden="true">
        <span id="dot-1" class="active"></span>
        <span id="dot-2"></span>
        <span id="dot-3"></span>
      </div>

      <section class="step active" id="step-1" aria-labelledby="step-1-heading">
        <h3 id="step-1-heading">رمز الدخول</h3>
        <p>انظر لزاوية شاشة المسجد — ستجد رمز PIN بالأرقام العربية. أدخله هنا.</p>
        <label class="pin-label" for="onboardPin">رمز الدخول (٤-٨ أرقام)</label>
        <input id="onboardPin" class="m-input m-input-pin" type="password"
               inputmode="numeric" maxlength="8" placeholder="••••••"
               aria-label="رمز الدخول" autocomplete="off" />
        <div class="m-status m-status-info" id="onboardStatus1" role="status" aria-live="polite"></div>
        <div class="btn-row">
          <button class="m-btn m-btn-ghost" type="button" id="onboardSkip">لاحقاً</button>
          <button class="m-btn m-btn-primary" type="button" id="onboardStep1Next">متابعة</button>
        </div>
      </section>

      <section class="step" id="step-2" aria-labelledby="step-2-heading">
        <h3 id="step-2-heading">اختر مرجع التقليد</h3>
        <p>اختيارك يضبط طريقة الحساب ومقدار ذهاب الحمرة المشرقية والتقويم.</p>
        <div class="marja-list m-scroll" id="marjaList" role="radiogroup" aria-label="قائمة المراجع">
          <div class="m-text-caption" style="text-align:center;padding:var(--m-space-5)">جاري التحميل…</div>
        </div>
        <div class="m-status m-status-info" id="onboardStatus2" role="status" aria-live="polite"></div>
        <div class="btn-row">
          <button class="m-btn m-btn-ghost" type="button" id="onboardStep2Back">السابق</button>
          <button class="m-btn m-btn-primary" type="button" id="onboardStep2Next" disabled>متابعة</button>
        </div>
      </section>

      <section class="step" id="step-3" aria-labelledby="step-3-heading">
        <h3 id="step-3-heading">موقع المسجد</h3>
        <div class="gps-box">
          <div class="gps-icon-wrap"><span class="gps-icon" aria-hidden="true">my_location</span></div>
          <strong>اضغط زر GPS</strong>
          <p style="margin:0">بعد إنهاء هذا المعالج ستجد زر GPS في الزاوية. اضغطه واسمح بالوصول للموقع، وستأخذ مئذنة الإحداثيات مباشرة.</p>
        </div>
        <p class="m-text-caption" style="text-align:center">لست في المسجد الآن؟ يمكنك ضبط الموقع لاحقاً في أي وقت.</p>
        <div class="m-status m-status-info" id="onboardStatus3" role="status" aria-live="polite"></div>
        <div class="btn-row">
          <button class="m-btn m-btn-ghost" type="button" id="onboardStep3Back">السابق</button>
          <button class="m-btn m-btn-primary" type="button" id="onboardFinish">تم</button>
        </div>
      </section>
    </div>
  `;
  document.body.appendChild(modal);

  let currentStep = 1;
  let selectedMarja = null;
  let cachedMarjas = null;
  let lastFocused = null;

  const $dot = (n) => modal.querySelector('#dot-' + n);
  const $step = (n) => modal.querySelector('#step-' + n);
  function showStep(n) {
    [1, 2, 3].forEach((i) => {
      $dot(i).classList.toggle('active', i === n);
      $step(i).classList.toggle('active', i === n);
    });
    currentStep = n;
    const focusable = $step(n).querySelector('input, button:not(:disabled)');
    if (focusable) focusable.focus();
  }

  async function authWithPin(pin) {
    const resp = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Mithnah' },
      body: JSON.stringify({ pin })
    });
    if (resp.status === 429) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(`محاولات متكررة — حاول بعد ${toArabicDigits(data.retryAfterSec || 900)} ثانية`);
    }
    if (!resp.ok) throw new Error('رمز PIN غير صحيح');
    const data = await resp.json();
    sessionStorage.setItem(TOKEN_KEY, data.token);
    sessionStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + Number(data.expiresInMs || 0)));
    return data.token;
  }

  async function authedPost(url, body) {
    const token = sessionStorage.getItem(TOKEN_KEY);
    if (!token) throw new Error('الجلسة منتهية — أعد إدخال PIN');
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Requested-With': 'Mithnah' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (resp.status === 401) throw new Error('الجلسة منتهية — أعد إدخال PIN');
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.message || ('خطأ ' + resp.status));
    return data;
  }

  async function loadMarjas() {
    try {
      const data = await authedPost('/api/marja/list');
      cachedMarjas = data.marjas || [];
      const $list = modal.querySelector('#marjaList');
      $list.innerHTML = cachedMarjas.map((m) =>
        '<button class="marja-item" data-id="' + escapeAttr(m.id) + '" type="button" role="radio" aria-checked="false">' +
        '<span class="name-ar">' + escapeHtml(m.ar || m.en) + '</span>' +
        (m.office ? '<span class="office">' + escapeHtml(m.office) + '</span>' : '') +
        '</button>'
      ).join('');
      $list.querySelectorAll('.marja-item').forEach((el) => {
        el.addEventListener('click', () => {
          $list.querySelectorAll('.marja-item').forEach((x) => {
            x.classList.remove('selected');
            x.setAttribute('aria-checked', 'false');
          });
          el.classList.add('selected');
          el.setAttribute('aria-checked', 'true');
          selectedMarja = el.getAttribute('data-id');
          modal.querySelector('#onboardStep2Next').disabled = false;
        });
      });
    } catch (err) {
      const $s = modal.querySelector('#onboardStatus2');
      $s.textContent = err.message;
      $s.className = 'm-status m-status-danger';
    }
  }

  async function checkOnboardingNeeded() {
    try {
      const token = sessionStorage.getItem(TOKEN_KEY);
      if (!token) return;
      const resp = await fetch('/api/config', { headers: { 'Authorization': 'Bearer ' + token, 'X-Requested-With': 'Mithnah' } });
      if (!resp.ok) return;
      const data = await resp.json();
      if (data && data.config && data.config.onboardingCompleted === false) openWizard();
    } catch (_) {}
  }

  function openWizard() {
    lastFocused = document.activeElement;
    modal.classList.add('m-open');
    modal.setAttribute('aria-hidden', 'false');
    showStep(1);
  }
  function closeWizard() {
    modal.classList.remove('m-open');
    modal.setAttribute('aria-hidden', 'true');
    if (lastFocused && typeof lastFocused.focus === 'function') {
      try { lastFocused.focus(); } catch (_) {}
    }
  }

  settingsBtn.addEventListener('click', openWizard);
  modal.querySelector('#onboardSkip').addEventListener('click', closeWizard);
  modal.querySelector('#onboardStep2Back').addEventListener('click', () => showStep(1));
  modal.querySelector('#onboardStep3Back').addEventListener('click', () => showStep(2));

  modal.querySelector('#onboardStep1Next').addEventListener('click', async () => {
    const pinInput = modal.querySelector('#onboardPin');
    const $s = modal.querySelector('#onboardStatus1');
    const pin = pinInput.value.trim();
    if (!/^\d{4,8}$/.test(pin)) {
      $s.textContent = 'أدخل رمز PIN صحيح (٤-٨ أرقام)';
      $s.className = 'm-status m-status-danger';
      return;
    }
    $s.textContent = 'جاري التحقق...'; $s.className = 'm-status m-status-info';
    try {
      await authWithPin(pin);
      $s.textContent = '';
      if (!cachedMarjas) await loadMarjas();
      showStep(2);
    } catch (err) {
      $s.textContent = err.message; $s.className = 'm-status m-status-danger';
    }
  });

  modal.querySelector('#onboardStep2Next').addEventListener('click', async () => {
    const $s = modal.querySelector('#onboardStatus2');
    if (!selectedMarja) {
      $s.textContent = 'اختر مرجعاً للمتابعة'; $s.className = 'm-status m-status-danger';
      return;
    }
    $s.textContent = 'جاري الحفظ...'; $s.className = 'm-status m-status-info';
    try {
      await authedPost('/api/marja/set', { marjaId: selectedMarja });
      $s.textContent = 'تم الحفظ ✓'; $s.className = 'm-status m-status-success';
      showStep(3);
    } catch (err) {
      $s.textContent = err.message; $s.className = 'm-status m-status-danger';
    }
  });

  modal.querySelector('#onboardFinish').addEventListener('click', async () => {
    const $s = modal.querySelector('#onboardStatus3');
    try {
      await authedPost('/api/onboarding/complete');
      $s.textContent = 'جاهز — نوّر الله بكم'; $s.className = 'm-status m-status-success';
      setTimeout(closeWizard, 1200);
    } catch (err) {
      $s.textContent = err.message; $s.className = 'm-status m-status-danger';
    }
  });

  // Focus trap.
  const FOCUSABLE = 'input, button:not(:disabled), [role="radio"]';
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('m-open')) {
      event.preventDefault(); closeWizard(); return;
    }
    if (!modal.classList.contains('m-open') || event.key !== 'Tab') return;
    const visible = Array.from(modal.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (visible.length === 0) return;
    const first = visible[0];
    const last  = visible[visible.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  // Auto-open on first visit.
  let checks = 0;
  const checkTimer = setInterval(() => {
    checks++;
    if (checks > 10) { clearInterval(checkTimer); return; }
    checkOnboardingNeeded();
  }, 3000);

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }
})();
