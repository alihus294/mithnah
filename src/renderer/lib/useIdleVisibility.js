// React hook: track whether the user is "active" (mouse moved /
// touched / typed within the last `idleMs` ms). Used to auto-hide the
// floating menu and other operator-facing chrome on the Dashboard
// (which sits on the wall 24/7 — controls clutter the prayer times
// when no one is interacting).
//
// Returns `true` while active, `false` after idle. Re-arms on any
// mouse / touch / keyboard event anywhere in the document.

import { useEffect, useRef, useState } from 'react';

export function useIdleVisibility(idleMs = 4000) {
  const [active, setActive] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    const arm = () => {
      setActive(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setActive(false), idleMs);
    };
    arm();
    const events = ['mousemove', 'mousedown', 'touchstart', 'keydown', 'wheel'];
    events.forEach((e) => document.addEventListener(e, arm, { passive: true }));
    return () => {
      events.forEach((e) => document.removeEventListener(e, arm));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [idleMs]);

  return active;
}
