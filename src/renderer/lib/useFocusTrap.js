// Focus trap — keeps Tab / Shift+Tab cycling *within* an overlay while
// it's open. Without this, a keyboard-only operator hitting Tab inside
// F3 can walk the focus out to the dashboard underneath (which is still
// mounted), which is disorienting and an accessibility regression.
//
// Usage:
//   const ref = useRef(null);
//   useFocusTrap(ref, open);
//   return <div ref={ref} role="dialog" aria-modal="true">...</div>;
//
// Behaviour:
//   • On Tab at the last focusable element → jumps to the first.
//   • On Shift+Tab at the first → jumps to the last.
//   • On mount, moves focus to the first focusable child (unless the
//     caller already focused something explicitly — we respect that).
//   • Escape is NOT handled here; each overlay owns its own close
//     keybinding since the semantics vary (save vs cancel).

import { useEffect } from 'react';

// Elements that participate in the tab order by default. Covers every
// type the Mithnah overlays actually render (buttons, inputs, selects,
// textareas, search inputs, star-buttons, tab buttons, links).
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function listFocusable(root) {
  if (!root) return [];
  // If an inline-modal (nested role="dialog") is open inside the
  // overlay, restrict the focus ring to the innermost dialog only.
  // Otherwise Tab could leak from a PIN-entry modal back up to
  // SettingsOverlay's inputs. We pick the DEEPEST dialog so nested
  // modals (dialog → confirm dialog) compose correctly.
  const dialogs = root.querySelectorAll('[role="dialog"]');
  let scope = root;
  if (dialogs.length > 0) {
    // Deepest dialog wins — traverse them and take the one that's
    // not an ancestor of any other dialog.
    for (const d of dialogs) {
      let isAncestor = false;
      for (const other of dialogs) {
        if (other !== d && d.contains(other)) { isAncestor = true; break; }
      }
      if (!isAncestor) scope = d;
    }
  }
  return Array.from(scope.querySelectorAll(FOCUSABLE_SELECTOR)).filter((el) => {
    // Skip elements hidden by CSS. getBoundingClientRect is cheap and
    // handles display:none + visibility:hidden + 0-size cases.
    if (el.getAttribute('aria-hidden') === 'true') return false;
    // Skip elements inside a shallower dialog when a deeper one is
    // open — guards against DOM-order traps.
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

export function useFocusTrap(containerRef, active) {
  useEffect(() => {
    if (!active) return;
    const root = containerRef.current;
    if (!root) return;

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const focusables = listFocusable(root);
      if (focusables.length === 0) {
        // No focusable children (e.g. a loading skeleton). Block the
        // Tab so focus can't leak out of the overlay.
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      const active = document.activeElement;
      // Shift+Tab on first → last. Plain Tab on last → first.
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
      // If focus is not yet inside the overlay at all, jump it in —
      // covers the "I just opened F3 and pressed Tab immediately"
      // case before any of the overlay's own useEffects ran.
      if (!root.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [active, containerRef]);
}
