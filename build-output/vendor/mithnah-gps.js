// Mithnah GPS widget — token-only styling, shared component classes.
// Aligns with the unified `mithnah-design.css` v2 palette.

(() => {
  const TOKEN_KEY = 'mithnah-gps-token';
  const TOKEN_EXP_KEY = 'mithnah-gps-token-exp';

  const AR_DIGITS = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
  const toArabicDigits = (value) => String(value).replace(/\d/g, (d) => AR_DIGITS[Number(d)] || d);
  const formatLatLng = (n) => toArabicDigits(Number(n).toFixed(5));
  const formatAccuracy = (m) => toArabicDigits(Math.round(Number(m) || 0));

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
    #mithnahGpsBtn {
      position: fixed; bottom: 112px; left: 20px; z-index: 200;
      /* uses .m-fab base styles; overrides only positional/layout here */
    }
    #mithnahGpsBtn .ico {
      font-family: 'Material Symbols Outlined';
      font-size: 22px; font-variation-settings: 'FILL' 1;
    }

    /* Modal backdrop + card use shared .m-modal-* classes. This block only
     * adds GPS-specific internal structure. */
    #mithnahGpsModal .gps-prompt {
      text-align: center; margin-bottom: var(--m-space-4);
      color: var(--m-text-secondary);
    }
    #mithnahGpsModal h3 {
      margin: 0 0 var(--m-space-2); text-align: center;
      font-family: var(--m-font-display);
      font-size: 22px; font-weight: 700;
      color: var(--m-primary);
    }
    #mithnahGpsModal .field-label {
      display: block; font-family: var(--m-font-body);
      font-size: 13px; font-weight: 600; color: var(--m-text-muted);
      margin-bottom: var(--m-space-2); text-align: center;
    }
    #mithnahGpsModal .align-row {
      display: flex; align-items: flex-start; gap: var(--m-space-2);
      margin-top: var(--m-space-3);
      padding: var(--m-space-3);
      background: var(--m-accent-subtle);
      border: 1px solid var(--m-border-subtle);
      border-radius: var(--m-radius-sm);
      font-size: 13px; color: var(--m-text-secondary);
    }
    #mithnahGpsModal .align-row input {
      flex: 0; margin-top: 2px;
      accent-color: var(--m-primary);
    }
    #mithnahGpsModal .result {
      margin-top: var(--m-space-4); padding: var(--m-space-4);
      border-radius: var(--m-radius-sm);
      background: var(--m-primary-subtle);
      border: 1px solid var(--m-border-subtle);
      font-family: var(--m-font-body);
      font-size: 14px; color: var(--m-text-primary);
      line-height: 1.8; text-align: center;
      display: none; white-space: pre-line;
    }
    #mithnahGpsModal .result.show { display: block; }
    #mithnahGpsModal .btn-row {
      display: grid; grid-template-columns: 1fr 2fr; gap: var(--m-space-2);
      margin-top: var(--m-space-5);
    }
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'mithnahGpsBtn';
  btn.className = 'm-fab';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'تحديد موقع المسجد عبر GPS الجوال');
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.innerHTML = '<span class="ico" aria-hidden="true">my_location</span><span>GPS</span>';
  document.body.appendChild(btn);

  const modal = document.createElement('div');
  modal.id = 'mithnahGpsModal';
  modal.className = 'm-modal-backdrop';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'mithnahGpsTitle');
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `
    <div class="m-modal-card m-scroll">
      <h3 id="mithnahGpsTitle">تحديد الموقع عبر GPS</h3>
      <p class="gps-prompt">استخدم GPS الجوال لضبط موقع المسجد بدقة. لو المتصفح رفض GPS (HTTP غير آمن)، استعمل الإدخال اليدوي.</p>
      <label class="field-label" for="mithnahGpsPin">رمز الدخول</label>
      <input id="mithnahGpsPin" class="m-input m-input-pin" type="password"
             inputmode="numeric" maxlength="8" placeholder="••••••"
             aria-label="رمز الدخول (٤-٨ أرقام)" autocomplete="off" />
      <div class="align-row">
        <input type="checkbox" id="mithnahGpsAlign" />
        <label for="mithnahGpsAlign">استخدم طريقة الحساب الإقليمية بدلاً من الجعفرية</label>
      </div>
      <div class="m-status m-status-info" id="mithnahGpsStatus" role="status" aria-live="polite">اضغط "اكتشاف GPS" للبدء</div>
      <div class="result m-text-body" id="mithnahGpsResult" role="status" aria-live="polite"></div>
      <details id="mithnahGpsManual" style="margin-top:12px;">
        <summary style="cursor:pointer; color:var(--m-accent); font-size:13px;">إدخال الإحداثيات يدوياً</summary>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:10px;">
          <input id="mithnahGpsLat" class="m-input" type="text" inputmode="decimal" placeholder="خط العرض (lat)" />
          <input id="mithnahGpsLng" class="m-input" type="text" inputmode="decimal" placeholder="خط الطول (lng)" />
        </div>
        <button class="m-btn m-btn-ghost" type="button" id="mithnahGpsManualGo" style="width:100%; margin-top:8px;">حفظ الإحداثيات اليدوية</button>
        <p style="font-size:11px; color:var(--m-text-muted); margin-top:6px; line-height:1.5;">افتح Google Maps، اضغط طويلاً على موقع المسجد، ستظهر الإحداثيات أعلى الشاشة — انسخها والصقها هنا.</p>
      </details>
      <div class="btn-row">
        <button class="m-btn m-btn-ghost" type="button" id="mithnahGpsClose">إغلاق</button>
        <button class="m-btn m-btn-primary" type="button" id="mithnahGpsGo">اكتشاف GPS</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const $pin    = modal.querySelector('#mithnahGpsPin');
  const $align  = modal.querySelector('#mithnahGpsAlign');
  const $status = modal.querySelector('#mithnahGpsStatus');
  const $result = modal.querySelector('#mithnahGpsResult');
  const $go     = modal.querySelector('#mithnahGpsGo');
  const $close  = modal.querySelector('#mithnahGpsClose');

  const setStatus = (msg, kind = 'info') => {
    $status.textContent = msg;
    $status.className = 'm-status m-status-' + kind;
  };
  const showResult = (text) => { $result.textContent = text; $result.classList.add('show'); };
  const hideResult = () => { $result.classList.remove('show'); $result.textContent = ''; };

  const FOCUSABLE = 'input, button:not(:disabled), [tabindex]:not([tabindex="-1"])';
  let lastFocused = null;
  function trapFocus(event) {
    if (!modal.classList.contains('m-open')) return;
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); return; }
    if (event.key !== 'Tab') return;
    const focusable = modal.querySelectorAll(FOCUSABLE);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', trapFocus);

  function openModal() {
    hideResult();
    setStatus('اضغط "اكتشاف GPS" للبدء', 'info');
    lastFocused = document.activeElement;
    modal.classList.add('m-open');
    modal.setAttribute('aria-hidden', 'false');
    $pin.focus();
  }
  function closeModal() {
    modal.classList.remove('m-open');
    modal.setAttribute('aria-hidden', 'true');
    if (lastFocused && typeof lastFocused.focus === 'function') {
      try { lastFocused.focus(); } catch (_) {}
    }
  }
  btn.addEventListener('click', openModal);
  $close.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });

  async function getToken() {
    try {
      const cached = sessionStorage.getItem(TOKEN_KEY);
      const exp = Number(sessionStorage.getItem(TOKEN_EXP_KEY) || 0);
      if (cached && exp > Date.now() + 60_000) return cached;
    } catch (_) {}
    const pin = $pin.value.trim();
    if (!/^\d{4,8}$/.test(pin)) throw new Error('أدخل PIN مكوّن من ٤-٨ أرقام');
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
    if (!data.token) throw new Error('فشل الحصول على الصلاحية');
    try {
      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(TOKEN_EXP_KEY, String(Date.now() + Number(data.expiresInMs || 0)));
    } catch (_) {}
    return data.token;
  }

  function getGps() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject(new Error('المتصفح لا يدعم GPS')); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(pos),
        (err) => reject(new Error(
          err.code === err.PERMISSION_DENIED ? 'رُفض إذن الموقع. فعّله من إعدادات المتصفح وأعد المحاولة.'
          : err.code === err.POSITION_UNAVAILABLE ? 'الموقع غير متاح. تأكد من تفعيل GPS.'
          : err.code === err.TIMEOUT ? 'انتهت مهلة GPS. حاول في مكان مفتوح.'
          : 'تعذّر الحصول على GPS.'
        )),
        { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 }
      );
    });
  }

  $go.addEventListener('click', async () => {
    $go.disabled = true;
    $go.setAttribute('aria-busy', 'true');
    hideResult();
    try {
      setStatus('جاري التحقق من PIN...', 'info');
      const token = await getToken();
      setStatus('جاري الحصول على إحداثيات GPS... (قد يستغرق حتى ٢٥ ثانية)', 'info');
      const pos = await getGps();
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      if (accuracy > 10000) throw new Error(`دقة GPS ضعيفة جداً (${formatAccuracy(accuracy)} متر). حاول في مكان مكشوف.`);
      if (accuracy > 200) setStatus(`تنبيه: دقة GPS ${formatAccuracy(accuracy)} متر. جاري الإرسال...`, 'warning');
      else setStatus(`الموقع تم تحديده — الدقة ${formatAccuracy(accuracy)} متر ✓`, 'success');

      const resp = await fetch('/api/location/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Requested-With': 'Mithnah' },
        body: JSON.stringify({
          lat, lng, accuracy,
          name: '',
          source: 'gps',
          alignMethodToRegion: Boolean($align.checked)
        })
      });
      if (resp.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(TOKEN_EXP_KEY);
        throw new Error('انتهت صلاحية الجلسة. أعد إدخال PIN.');
      }
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.message || `خطأ من الخادم (${resp.status})`);
      }
      const data = await resp.json();
      setStatus('تم ضبط الموقع بنجاح ✓', 'success');
      const cfg = data.config || {};
      const loc = cfg.location || { lat, lng };
      const nearest = data.nearest || null;
      const acc = cfg.locationAccuracyMeters;
      const nameLine = nearest && nearest.distanceKm <= 200
        ? `المنطقة: ${loc.name || nearest.city.nameAr || nearest.city.name}`
        : `الإحداثيات: ${formatLatLng(loc.lat)}، ${formatLatLng(loc.lng)}`;
      const distLine = nearest ? `أقرب مدينة معروفة: ${nearest.city.nameAr || nearest.city.name} (${formatLatLng(nearest.distanceKm.toFixed(1))} كم)` : '';
      const accLine = Number.isFinite(acc) ? `الدقة: ${formatAccuracy(acc)} متر` : '';
      showResult(
        `${nameLine}\n${distLine}\n${accLine}\n` +
        `طريقة الحساب: ${cfg.method || 'Jafari'}\n` +
        `المذهب: ${cfg.fiqh === 'sunni' ? 'سنّي' : 'شيعي (إثنا عشري)'}`
      );
    } catch (err) {
      setStatus(err.message || 'فشل غير معروف', 'danger');
    } finally {
      $go.disabled = false;
      $go.setAttribute('aria-busy', 'false');
    }
  });

  // Manual-coords fallback for when browsers block navigator.geolocation
  // on non-HTTPS private IPs (common on iOS Safari). User pastes lat/lng
  // from Google Maps and we take the same path as GPS → /api/location/set.
  const $manualGo = modal.querySelector('#mithnahGpsManualGo');
  const $lat      = modal.querySelector('#mithnahGpsLat');
  const $lng      = modal.querySelector('#mithnahGpsLng');
  if ($manualGo && $lat && $lng) {
    $manualGo.addEventListener('click', async () => {
      $manualGo.disabled = true;
      hideResult();
      try {
        const la = Number(String($lat.value).trim());
        const ln = Number(String($lng.value).trim());
        if (!Number.isFinite(la) || la < -90 || la > 90) throw new Error('خط العرض غير صحيح');
        if (!Number.isFinite(ln) || ln < -180 || ln > 180) throw new Error('خط الطول غير صحيح');
        setStatus('جاري التحقق من PIN...', 'info');
        const token = await getToken();
        setStatus('جاري حفظ الإحداثيات...', 'info');
        const resp = await fetch('/api/location/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Requested-With': 'Mithnah' },
          body: JSON.stringify({ lat: la, lng: ln, name: '', source: 'manual', alignMethodToRegion: Boolean($align.checked) })
        });
        if (resp.status === 401) {
          sessionStorage.removeItem(TOKEN_KEY);
          sessionStorage.removeItem(TOKEN_EXP_KEY);
          throw new Error('انتهت الجلسة. أعد إدخال PIN.');
        }
        if (!resp.ok) throw new Error('فشل الحفظ (' + resp.status + ')');
        const data = await resp.json();
        setStatus('تم حفظ الموقع ✓', 'success');
        const cfg = data?.config || {};
        const loc = cfg.location || {};
        const nameLine = loc.name ? `الموقع: ${loc.name}` : `الإحداثيات: ${formatLatLng(la)}، ${formatLatLng(ln)}`;
        showResult(`${nameLine}\nطريقة الحساب: ${cfg.method || 'Jafari'}`);
      } catch (err) {
        setStatus(err.message || 'فشل الحفظ', 'danger');
      } finally {
        $manualGo.disabled = false;
      }
    });
  }
})();
