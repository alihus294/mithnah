// Floating action menu — the PRIMARY way an elderly caretaker reaches
// every overlay in the app. F-keys still work (and are shown next to
// each item as a hint), but no operator should ever need to know
// what F3 is to use Mithnah.
//
// Visible always, bottom-right corner of the screen, large enough to
// hit comfortably with a trembling hand. Clicking opens a pop-up menu
// with 5 big labelled buttons.

import { useEffect, useRef, useState } from 'react';
import { ImamiStar } from './Ornaments.jsx';
import { useIdleVisibility } from '../lib/useIdleVisibility.js';

// Menu items. Settings is first + visually separated (primary action
// for a technician setting up the wall). Then content, tracker, help.
// Icons are intentionally monochrome text glyphs (not color emoji) so
// they share a visual weight with the rest of the Mithnah typography.
const ITEMS = [
  { key: 'F3', label: 'الإعدادات',    icon: '⚙',  emit: 'F3', primary: true },
  { key: 'F4', label: 'مكتبة الأدعية', icon: '❋',  emit: 'F4' },
  { key: 'F5', label: 'متابعة الصلاة', icon: '☪',  emit: 'F5' },
  { key: 'F1', label: 'المساعدة',     icon: '?',  emit: 'F1' },
];

// Exit is separated visually from the main items (destructive action at
// the bottom of the menu). Dispatching `mithnah:request-exit` reuses
// Dashboard's kiosk-unlock modal so the confirm + PIN flow stays in one
// place regardless of whether the kiosk lock is configured.
function requestExit() {
  try { window.dispatchEvent(new CustomEvent('mithnah:request-exit')); } catch (_) {}
}

export default function FloatingMenu() {
  const [open, setOpen] = useState(false);
  const cardRef = useRef(null);
  const buttonRef = useRef(null);
  // Auto-hide the trigger when the operator hasn't touched mouse /
  // keyboard for 4 s, so the wall display stays visually clean during
  // the long idle stretches between settings changes. Move the mouse
  // (or hit any key) to bring it back. The OPEN menu stays visible
  // while the operator is interacting with it.
  const userActive = useIdleVisibility(4000);
  const showTrigger = userActive || open;

  // Close on click-outside / Escape so the menu doesn't sit open
  // forever after a misfire.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (cardRef.current?.contains(e.target)) return;
      if (buttonRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const trigger = (fkey) => {
    setOpen(false);
    // Dispatch the F-key keydown so existing overlay handlers fire.
    // Synthetic event needs `key` AND `code` so handlers checking
    // either property both match.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: fkey, code: fkey, bubbles: true }));
  };

  return (
    <>
      <button
        ref={buttonRef}
        className={`floating-menu__trigger ${open ? 'floating-menu__trigger--open' : ''} ${showTrigger ? '' : 'floating-menu__trigger--idle'}`}
        type="button"
        aria-label="القائمة الرئيسية"
        aria-expanded={open}
        title="القائمة (انقر لفتح خيارات التطبيق)"
        onClick={() => setOpen((v) => !v)}
        // Keep the button reachable for screen-readers / keyboard
        // even when faded out — only the visual chrome dims, not
        // the interactive target.
      >
        <ImamiStar size={26} opacity={0.95} />
        <span className="floating-menu__trigger-label">القائمة</span>
      </button>

      {open && (
        <div ref={cardRef} className="floating-menu__card" role="menu" dir="rtl">
          <div className="floating-menu__title">اختر ما تريد فتحه</div>
          {ITEMS.map((it) => (
            <button
              key={it.key}
              type="button"
              className={`floating-menu__item ${it.primary ? 'floating-menu__item--primary' : ''}`}
              role="menuitem"
              onClick={() => trigger(it.emit)}
            >
              <span className="floating-menu__item-icon" aria-hidden="true">{it.icon}</span>
              <span className="floating-menu__item-label">{it.label}</span>
              <span className="floating-menu__item-shortcut" aria-hidden="true">{it.key}</span>
            </button>
          ))}
          <div className="floating-menu__hint">لا حاجة لحفظ هذه الاختصارات — هذه القائمة دائماً متاحة في زاوية الشاشة</div>
          <button
            type="button"
            className="floating-menu__item floating-menu__item--danger"
            role="menuitem"
            onClick={() => { setOpen(false); requestExit(); }}
          >
            <span className="floating-menu__item-icon" aria-hidden="true">⏻</span>
            <span className="floating-menu__item-label">إغلاق التطبيق</span>
          </button>
        </div>
      )}
    </>
  );
}
