// Undo toast — appears for ~15s after every config save with a single
// big "↶ تراجع" button. Targeted at the elderly-caretaker scenario
// where the operator changes a setting by mistake (wrong city,
// accidentally toggled a feature) and needs an obvious way to roll
// back without hunting through the settings overlay.
//
// The toast piggybacks on the same `mithnah:config-changed` event the
// Dashboard already listens to. The first event after mount is
// suppressed (that's the initial config load, not a change).
//
// UX refinements (0.8.24):
//   • Countdown bar at the bottom visualises the remaining time so the
//     operator doesn't have to guess how long they have left to undo.
//   • Hovering the toast pauses the timer — the message waits as long
//     as the operator is reading it, and resumes when they move away.
//   • Duration extended from 10s to 15s; elderly readers need time.

import { useEffect, useRef, useState } from 'react';
import { onConfigChanged, undoLastConfig } from '../lib/ipc.js';
import { friendlyError } from '../lib/errors.js';

const VISIBLE_MS = 15_000;

export default function UndoToast() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Remaining milliseconds. Ticks down in 100ms intervals so the
  // countdown bar animation is smooth without hammering the event
  // loop. Paused while `paused` is true (operator hovering).
  const [remaining, setRemaining] = useState(VISIBLE_MS);
  const [paused, setPaused] = useState(false);
  const initRef = useRef(true);

  useEffect(() => {
    const off = onConfigChanged(() => {
      // Suppress the first event (initial load).
      if (initRef.current) { initRef.current = false; return; }
      setVisible(true);
      setError('');
      setRemaining(VISIBLE_MS);
      setPaused(false);
    });
    return () => { if (typeof off === 'function') off(); };
  }, []);

  useEffect(() => {
    if (!visible || paused) return;
    if (remaining <= 0) { setVisible(false); return; }
    const tick = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 100));
    }, 100);
    return () => clearInterval(tick);
  }, [visible, paused, remaining]);

  const onUndo = async () => {
    setBusy(true);
    try {
      await undoLastConfig();
      setVisible(false);
    } catch (err) {
      setError(friendlyError(err).title);
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  const progressPct = Math.max(0, Math.min(100, (remaining / VISIBLE_MS) * 100));

  return (
    <div
      className="undo-toast"
      role="status"
      aria-live="polite"
      dir="rtl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="undo-toast__label">تم حفظ التغيير</span>
      <button
        type="button"
        className="undo-toast__btn"
        onClick={onUndo}
        disabled={busy}
      >
        ↶ تراجع
      </button>
      <button
        type="button"
        className="undo-toast__close"
        onClick={() => setVisible(false)}
        aria-label="إخفاء"
      >×</button>
      {error && <div className="undo-toast__error">{error}</div>}
      {/* Remaining-time bar — shrinks from 100% → 0% as the timer
          counts down. Explicit transition so the bar moves smoothly
          between 100ms intervals. */}
      <div className="undo-toast__progress" aria-hidden="true">
        <div
          className="undo-toast__progress-bar"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}
