// Manual "check for updates" panel inside F3 → الإعدادات → متقدّم.
//
// The caretaker is typically a 70-year-old with no technical background,
// so the manual-update path must NOT involve opening a browser or
// downloading a file. One big button → the app talks to GitHub
// directly, downloads the update if any, and restarts itself when the
// caretaker asks.
//
// States:
//   idle        → "افحص الآن"
//   checking    → "... جاري الفحص"
//   downloading → "جاري التنزيل · N%"
//   ready       → "اضغط لإعادة التشغيل والتثبيت"
//   up-to-date  → "أنت على آخر إصدار (X.Y.Z)"
//   error       → red message + retry button

import { useEffect, useState } from 'react';
import { toArabicDigits } from '../lib/format.js';
import { friendlyErrorTitle } from '../lib/errors.js';

export default function UpdateSection() {
  const [state, setState] = useState('idle');
  const [info, setInfo] = useState(null);
  const [message, setMessage] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [manualStatus, setManualStatus] = useState('');

  // Pull the installed app version once — shown next to the button so
  // the caretaker can read it aloud if they ever need support.
  useEffect(() => {
    const api = window.electron?.app;
    if (api && typeof api.getVersion === 'function') {
      api.getVersion().then((v) => setAppVersion(v || '')).catch(() => {});
    }
  }, []);

  // Subscribe to updater state + seed with current value — same
  // contract as UpdateBadge in the corner. Consolidated here so the
  // Settings button mirrors what the badge shows.
  useEffect(() => {
    const api = window.electron?.updater;
    if (!api) return;
    let cancelled = false;
    api.getState().then((res) => {
      if (cancelled || !res?.ok) return;
      setState(res.data?.state || 'idle');
      setInfo(res.data?.info || null);
    }).catch(() => {});
    const off = api.onState((payload) => {
      if (cancelled || !payload) return;
      setState(payload.state || 'idle');
      setInfo(payload.info || null);
      if (['checking', 'downloading', 'ready', 'error'].includes(payload.state)) {
        setManualStatus('');
      }
      // Clear any stale "up-to-date" message once a new check starts.
      if (payload.state === 'checking' || payload.state === 'downloading') {
        setMessage('');
      }
    });
    return () => { cancelled = true; if (typeof off === 'function') off(); };
  }, []);

  async function onCheck() {
    setMessage('');
    setManualStatus('');
    setState('checking');
    try {
      const res = await window.electron.updater.checkNow();
      if (!res || res.ok !== true) {
        setState('error');
        setMessage(res?.error || 'تعذّر الفحص — تحقّق من الاتصال بالإنترنت ثم أعد المحاولة');
        return;
      }
      if (!res.updateAvailable) {
        setState('idle');
        setInfo(null);
        setManualStatus('upToDate');
        setMessage('');
      } else {
        setManualStatus('available');
      }
      // If an update IS available, the updater's event stream flips
      // the state to 'downloading' → 'ready' on its own; no need to
      // set a success message here.
    } catch (err) {
      setMessage(friendlyErrorTitle(err));
    }
  }

  async function onRestart() {
    setManualStatus('installing');
    setMessage('');
    try {
      const res = await window.electron.app.restartAndInstall?.();
      if (res && res.ok === false) {
        setManualStatus('');
        setMessage(res.error || 'تعذّرت إعادة التشغيل — حاول إغلاق التطبيق يدوياً');
      }
      // On success the process quits, no further UI work to do.
    } catch (err) {
      setManualStatus('');
      setMessage(friendlyErrorTitle(err));
    }
  }

  const percent = Number.isFinite(info?.percent) ? Math.round(info.percent) : null;
  const installing = manualStatus === 'installing';
  const busy = installing || state === 'checking' || state === 'downloading';
  const ready = state === 'ready';

  let statusText = 'اضغط للفحص';
  let statusKind = 'idle';
  if (installing) {
    statusText = 'جاري التثبيت';
    statusKind = 'busy';
  } else if (state === 'checking') {
    statusText = 'جاري الفحص';
    statusKind = 'busy';
  } else if (state === 'downloading') {
    statusText = percent !== null
      ? `جاري تحميل التحديث · ${toArabicDigits(percent)}٪`
      : 'جاري تحميل التحديث';
    statusKind = 'busy';
  } else if (ready || manualStatus === 'available') {
    statusText = 'يوجد تحديث';
    statusKind = 'ready';
  } else if (manualStatus === 'upToDate') {
    statusText = 'التطبيق محدث';
    statusKind = 'ok';
  } else if (state === 'error') {
    statusText = 'تعذّر الفحص';
    statusKind = 'err';
  }

  let label;
  if (installing)                 label = 'جاري التثبيت';
  else if (state === 'checking')  label = 'جاري الفحص';
  else if (state === 'downloading') label = statusText;
  else if (ready)                 label = `تثبيت التحديث ${info?.version || ''}`.trim();
  else if (manualStatus === 'upToDate') label = 'افحص مرة أخرى';
  else                             label = 'افحص الآن';

  return (
    <div className="settings__update-section">
      <div className="settings__update-header">
        <div className="settings__update-title">تحديث التطبيق</div>
        <div className="settings__update-version">
          الإصدار الحالي: <bdi>{appVersion || '—'}</bdi>
        </div>
      </div>

      <div className="settings__update-hint">
        يفحص التطبيق تلقائياً عند التشغيل، ثمّ كلّ يوم في منتصف الليل. إذا انقطع الاتصال يُعيد المحاولة كلّ دقيقتين
        ليلتقط عودة الشبكة فوراً. التنزيل يحدث في الخلفية بدون مقاطعة المصلّين. اضغط هنا للفحص يدوياً الآن.
      </div>

      <div className={`settings__update-status settings__update-status--${statusKind}`} role="status" aria-live="polite">
        {statusText}
      </div>

      <button
        type="button"
        className={`settings__btn settings__update-btn ${ready ? 'settings__update-btn--ready' : ''}`}
        onClick={ready ? onRestart : onCheck}
        disabled={busy}
      >
        {label}
      </button>

      {message && (
        <div className={`settings__update-msg ${message.includes('تعذّر') || message.includes('خطأ') ? 'settings__update-msg--err' : 'settings__update-msg--ok'}`}>
          {message}
        </div>
      )}

      {state === 'downloading' && percent !== null && (
        <div className="settings__update-progress" style={{ marginTop: 12 }}>
          <div className="settings__update-progress-track" style={{
            width: '100%',
            height: 8,
            background: '#e5e7eb',
            borderRadius: 4,
            overflow: 'hidden'
          }}>
            <div className="settings__update-progress-fill" style={{
              width: `${percent}%`,
              height: '100%',
              background: '#10b981',
              borderRadius: 4,
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div className="settings__update-progress-text" style={{
            textAlign: 'center',
            marginTop: 6,
            fontSize: 14,
            color: '#6b7280'
          }}>
            {toArabicDigits(percent)}٪ مكتمل
          </div>
        </div>
      )}
    </div>
  );
}
