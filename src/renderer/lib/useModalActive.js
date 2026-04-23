// React hook: tells the main process that an overlay is "modally
// active" so it stops swallowing arrow keys for the slideshow.
// Without this, opening F5 PrayerTracker on top of an active dua
// slideshow leaves the operator unable to advance the tracker —
// arrows go to slideshow.dispatch in main and never reach the
// PrayerTracker keydown listener.
//
// Usage:
//   useModalActive(open);   // pass the overlay's `open` boolean
//
// Internal: increments / decrements a ref-counted flag in the main
// process via remote-control:publish-state. Multiple overlays can
// call this at once and the count stays correct.

import { useEffect } from 'react';

let _modalCount = 0;

function publish() {
  try {
    window.electron?.remoteControl?.publishState?.({ modalActive: _modalCount > 0 });
  } catch (_) {}
}

export function useModalActive(active) {
  useEffect(() => {
    if (!active) return;
    _modalCount++;
    publish();
    return () => {
      _modalCount = Math.max(0, _modalCount - 1);
      publish();
    };
  }, [active]);
}
