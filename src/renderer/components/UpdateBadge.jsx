// Subtle update-status pill — lives in the bottom-right corner next to
// the FloatingMenu trigger so it's visible to the caretaker but doesn't
// compete with the clock or prayer times for attention.
//
// State → UI:
//   idle         → null (no visible chrome)
//   checking     → null (brief, not worth flashing)
//   downloading  → "جاري تحميل التحديث N%"
//   ready        → "تحديث جاهز — أعد التشغيل" (clickable → quitAndInstall via restart prompt)
//   error        → null (errors surface in devtools / are retried)
//
// The dialog prompt in main/updater/index.js still fires for the
// restart decision — this badge is just an ambient indicator so the
// caretaker knows *something* is happening during the download window
// before the dialog appears.

import { useEffect, useState } from 'react';

export default function UpdateBadge() {
  const [state, setState] = useState('idle');
  const [info, setInfo] = useState(null);

  useEffect(() => {
    const api = window.electron?.updater;
    if (!api) return;
    let cancelled = false;
    // Seed with current state — the updater may have already moved
    // past 'idle' by the time this component mounts (initial check
    // runs 10 s after app ready).
    api.getState().then((res) => {
      if (cancelled || !res?.ok) return;
      setState(res.data?.state || 'idle');
      setInfo(res.data?.info || null);
    }).catch(() => {});
    const off = api.onState((payload) => {
      if (cancelled || !payload) return;
      setState(payload.state || 'idle');
      setInfo(payload.info || null);
    });
    return () => { cancelled = true; if (typeof off === 'function') off(); };
  }, []);

  if (state === 'idle' || state === 'checking' || state === 'error') return null;

  if (state === 'downloading') {
    const pct = Number.isFinite(info?.percent) ? Math.round(info.percent) : null;
    return (
      <div className="update-badge update-badge--downloading" role="status" aria-live="polite" dir="rtl">
        <span className="update-badge__dot" aria-hidden="true" />
        <span className="update-badge__label">
          {pct !== null ? `جاري تحميل التحديث · ${pct}%` : 'جاري تحميل التحديث'}
        </span>
      </div>
    );
  }

  if (state === 'ready') {
    const version = info?.version ? ` ${info.version}` : '';
    return (
      <div className="update-badge update-badge--ready" role="status" aria-live="polite" dir="rtl">
        <span className="update-badge__dot update-badge__dot--pulse" aria-hidden="true" />
        <span className="update-badge__label">تحديث جاهز{version} — سيُثبَّت عند الإغلاق</span>
      </div>
    );
  }

  return null;
}
