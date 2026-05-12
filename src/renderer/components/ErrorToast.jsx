// Global IPC-failure toast — sits at the App root and listens for
// `mithnah:ipc-failed` window events dispatched by `lib/ipc.js::unwrap`.
// Replaces the silent `catch (_) {}` blocks in Dashboard hooks with a
// single visible signal so the operator knows the app is briefly out
// of sync rather than silently frozen. Auto-dismisses 6s after the
// most recent failure; coalesces a burst into one toast.
//
// Not used for user-initiated actions — those have their own inline
// status messages (Settings save, DuaPicker import, etc.). This is
// strictly for background-poll IPC failures the operator can't see
// anywhere else.

import { useEffect, useState, useRef } from 'react';
import { friendlyError } from '../lib/errors.js';

const HIDE_AFTER_MS = 6000;

export default function ErrorToast() {
  const [info, setInfo] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const onFail = (ev) => {
      const err = ev?.detail?.error || ev?.detail || null;
      const friendly = friendlyError(err);
      setInfo(friendly);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setInfo(null), HIDE_AFTER_MS);
    };
    const onOk = () => {
      // Any successful IPC clears a still-showing toast — the system
      // recovered, no need to keep reminding the operator.
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setInfo(null);
    };
    window.addEventListener('mithnah:ipc-failed', onFail);
    window.addEventListener('mithnah:ipc-recovered', onOk);
    return () => {
      window.removeEventListener('mithnah:ipc-failed', onFail);
      window.removeEventListener('mithnah:ipc-recovered', onOk);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!info) return null;
  return (
    <div className="error-toast" role="status" aria-live="polite" dir="rtl">
      <div className="error-toast__title">{info.title}</div>
      {info.hint && <div className="error-toast__hint">{info.hint}</div>}
      <button
        type="button"
        className="error-toast__close"
        aria-label="إخفاء"
        onClick={() => setInfo(null)}
      >×</button>
    </div>
  );
}
