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

export default function UpdateSection() {
  const [state, setState] = useState('idle');
  const [info, setInfo] = useState(null);
  const [message, setMessage] = useState('');
  const [appVersion, setAppVersion] = useState('');

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
      // Clear any stale "up-to-date" message once a new check starts.
      if (payload.state === 'checking' || payload.state === 'downloading') {
        setMessage('');
      }
    });
    return () => { cancelled = true; if (typeof off === 'function') off(); };
  }, []);

  async function onCheck() {
    setMessage('');
    try {
      const res = await window.electron.updater.checkNow();
      if (!res || res.ok !== true) {
        setMessage(res?.error || 'تعذّر الفحص — تحقّق من الاتصال بالإنترنت ثم أعد المحاولة');
        return;
      }
      if (!res.updateAvailable) {
        setMessage(`أنت على آخر إصدار${appVersion ? ` (${appVersion})` : ''} — لا يوجد تحديث جديد`);
      }
      // If an update IS available, the updater's event stream flips
      // the state to 'downloading' → 'ready' on its own; no need to
      // set a success message here.
    } catch (err) {
      setMessage(err?.message || 'خطأ غير متوقّع أثناء الفحص');
    }
  }

  async function onRestart() {
    try {
      const res = await window.electron.app.restartAndInstall?.();
      if (res && res.ok === false) {
        setMessage(res.error || 'تعذّرت إعادة التشغيل — حاول إغلاق التطبيق يدوياً');
      }
      // On success the process quits, no further UI work to do.
    } catch (err) {
      setMessage(err?.message || 'خطأ غير متوقّع أثناء إعادة التشغيل');
    }
  }

  const busy = state === 'checking' || state === 'downloading';
  const ready = state === 'ready';
  const percent = Number.isFinite(info?.percent) ? Math.round(info.percent) : null;

  let label;
  if (state === 'checking')       label = '... جاري الفحص';
  else if (state === 'downloading') label = percent !== null ? `جاري التنزيل · ${percent}%` : 'جاري التنزيل...';
  else if (ready)                  label = `إعادة تشغيل الآن وتثبيت ${info?.version || ''}`.trim();
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
    </div>
  );
}
