// DuaPicker — F4 opens it on the wall PC. Lists every Shia dua, ziyarah,
// taqib, and tasbih from the bundled content. Clicking one opens the
// slideshow overlay on the wall — same overlay the phone picker opens —
// so the caretaker can drive the whole dhikr from the keyboard + Logitech
// R400 without touching a phone.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ImamiStar, BrandMark, SalawatLine } from './Ornaments.jsx';
import { friendlyErrorTitle } from '../lib/errors.js';
import { useModalActive } from '../lib/useModalActive.js';
import { useFocusTrap } from '../lib/useFocusTrap.js';

// localStorage keys for the two persistence stores. Kept tiny and
// scoped so a future migration is trivial. We only persist IDs (not
// titles) because the registry is the source of truth and titles can
// be re-localised between versions.
const RECENTS_KEY = 'mithnah:dua-picker:recent';
const FAVORITES_KEY = 'mithnah:dua-picker:favorites';
const CUSTOM_DUAS_KEY = 'mithnah:dua-picker:custom';
// One-shot flag: shown as a welcome strip the FIRST time the library
// opens. Dismissed automatically after the operator adds a dua or
// clicks ×. Cleared from localStorage to show again requires manual
// flip — rare.
const WELCOME_KEY = 'mithnah:dua-picker:welcomed';
const RECENTS_LIMIT = 8;

// Load / save the operator's custom duas. Each entry is
// { id, title_ar, source, body }. The id prefix `custom:` makes them
// easy to distinguish from bundled content.
function loadCustomDuas() {
  try {
    const raw = localStorage.getItem(CUSTOM_DUAS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => x && typeof x === 'object' && typeof x.id === 'string') : [];
  } catch (_) { return []; }
}
function saveCustomDuas(list) {
  try { localStorage.setItem(CUSTOM_DUAS_KEY, JSON.stringify(list.slice(0, 100))); } catch (_) {}
}

function loadIdList(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch (_) { return []; }
}
function saveIdList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(0, 50))); } catch (_) {}
}

// Module-level cache — Shia content is immutable at runtime, so once
// we've loaded a tab's list over IPC we can reuse it for every future
// F4 press. Previously each open re-shipped hundreds of slides over
// IPC and re-filtered on the renderer, which read as jank.
const tabCache = new Map();

const TABS = [
  { id: 'duas',     label: 'الأدعية' },
  { id: 'ziyarat',  label: 'الزيارات' },
  { id: 'taqibat',  label: 'التعقيبات' },
  // Tasbih al-Zahra deliberately NOT in the dua library — it's the
  // post-prayer dhikr, so it appears automatically at the tail end of
  // every Prayer Tracker sequence (F5) after the salam step.
];

function ipc() {
  if (!window.electron) throw new Error('window.electron missing');
  return window.electron;
}

async function loadTab(tab) {
  if (tabCache.has(tab)) return tabCache.get(tab);
  const el = ipc();
  let list = [];
  if (tab === 'duas')    { const r = await el.shia.listDuas();    list = r?.data || []; }
  else if (tab === 'ziyarat') { const r = await el.shia.listZiyarat(); list = r?.data || []; }
  else if (tab === 'taqibat') { const r = await el.shia.listTaqibat(); list = r?.data || []; }
  tabCache.set(tab, list);
  return list;
}

async function openDeck(kind, id) {
  const el = ipc();
  await el.slideshow.openShia(kind, id);
}

export default function DuaPicker() {
  const [open, setOpen] = useState(false);
  // Take keyboard ownership while the picker is open so the
  // operator's arrows scroll the grid (and don't advance the
  // slideshow underneath).
  useModalActive(open);
  const [tab, setTab] = useState('duas');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  // Per-tab `tabKey:itemId` strings so a dua and a ziyarah with the
  // same id don't collide. Kept simple — the elderly operator just
  // sees Arabic titles.
  const [recents, setRecents] = useState(() => loadIdList(RECENTS_KEY));
  const [favorites, setFavorites] = useState(() => loadIdList(FAVORITES_KEY));
  const [customDuas, setCustomDuas] = useState(loadCustomDuas);
  const [welcomeShown, setWelcomeShown] = useState(() => {
    try { return localStorage.getItem(WELCOME_KEY) !== 'true'; } catch (_) { return true; }
  });
  const dismissWelcome = () => {
    try { localStorage.setItem(WELCOME_KEY, 'true'); } catch (_) {}
    setWelcomeShown(false);
  };
  // Editing state for the custom-dua form. null = closed;
  // { id, title, body } = editing (or creating if id is a new UUID).
  const [editor, setEditor] = useState(null);
  const lastFocusedRef = useRef(null);
  const closeBtnRef = useRef(null);
  const containerRef = useRef(null);
  useFocusTrap(containerRef, open);

  const itemKey = (it) => `${tab}:${it.id}`;
  const isFavorite = (it) => favorites.includes(itemKey(it));
  const recordRecent = (it) => {
    const k = itemKey(it);
    const next = [k, ...recents.filter((x) => x !== k)].slice(0, RECENTS_LIMIT);
    setRecents(next);
    saveIdList(RECENTS_KEY, next);
  };
  const toggleFavorite = (it, ev) => {
    ev.stopPropagation();
    const k = itemKey(it);
    const next = favorites.includes(k) ? favorites.filter((x) => x !== k) : [k, ...favorites];
    setFavorites(next);
    saveIdList(FAVORITES_KEY, next);
  };

  // 150 ms debounce — the filter runs on every keystroke otherwise, and
  // at 2700+ items it's noticeable on old hardware.
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(h);
  }, [query]);

  // Custom duas show up at the top of the duas tab alongside bundled
  // ones. Other tabs keep the original list.
  const mergedItems = useMemo(() => {
    if (tab !== 'duas') return items;
    return [...customDuas, ...items];
  }, [tab, items, customDuas]);

  const filteredItems = useMemo(() => {
    if (!debouncedQuery.trim()) return mergedItems;
    const q = debouncedQuery.trim().toLowerCase();
    return mergedItems.filter((it) =>
      (it.title_ar || '').toLowerCase().includes(q) ||
      (it.title || '').toLowerCase().includes(q) ||
      (it.subtitle_ar || '').toLowerCase().includes(q) ||
      (it.id || '').toLowerCase().includes(q)
    );
  }, [mergedItems, debouncedQuery]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F4') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (open && e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Phone-driven commands forwarded from main via picker:command. Lets
  // the operator open / close the library from the mobile control UI
  // without walking to the keyboard.
  useEffect(() => {
    if (!window.electron?.app?.onPickerCommand) return;
    const off = window.electron.app.onPickerCommand((cmd) => {
      if (!cmd || typeof cmd !== 'object') return;
      if (cmd.action === 'open')  setOpen(true);
      if (cmd.action === 'close') setOpen(false);
    });
    return off;
  }, []);

  // Retry counter — bumped by the "إعادة المحاولة" button so the
  // loader effect can re-run on demand.
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = document.activeElement;
    let cancelled = false;
    setLoading(true);
    setMsg('');
    setLoadFailed(false);
    // Force-refetch by dropping the tab cache when the operator retried,
    // so a transient IPC hiccup isn't cached as "empty forever".
    if (reloadNonce > 0) tabCache.delete(tab);
    loadTab(tab).then((list) => {
      if (!cancelled) setItems(Array.isArray(list) ? list : []);
    }).catch((err) => {
      if (!cancelled) {
        setMsg('فشل التحميل: ' + err.message);
        setLoadFailed(true);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    const id = setTimeout(() => closeBtnRef.current?.focus(), 30);
    return () => {
      clearTimeout(id);
      cancelled = true;
      if (lastFocusedRef.current?.focus) {
        try { lastFocusedRef.current.focus(); } catch (_) {}
      }
    };
  }, [open, tab, reloadNonce]);

  if (!open) return null;

  const onOpenItem = async (item) => {
    // Custom duas go through the same slideshow the bundled content
    // uses — title slide + chunker-paginated body — so they look and
    // behave identically (same font, same 3-line pages, same remote
    // controls, same font-size +/- buttons, same persistence).
    if (item?.id?.startsWith?.('custom:')) {
      try {
        const resp = await window.electron.slideshow.openCustom({
          id: item.id,
          title: item.title_ar || 'دعاء',
          body: item.body || '',
          source: item.source || 'مضاف من القائم'
        });
        if (!resp?.ok) throw new Error(resp?.error || 'open-custom failed');
        recordRecent(item);
        setOpen(false);
      } catch (err) {
        setMsg(friendlyErrorTitle(err));
      }
      return;
    }
    const kindMap = { duas: 'dua', ziyarat: 'ziyarah', taqibat: 'taqib' };
    const kind = kindMap[tab];
    try {
      await openDeck(kind, item.id);
      recordRecent(item);
      setOpen(false);
    } catch (err) {
      setMsg(friendlyErrorTitle(err));
    }
  };

  const saveCustomDua = (draft) => {
    const id = draft.id || `custom:${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`;
    const title = (draft.title || '').trim().slice(0, 200);
    const body = (draft.body || '').trim().slice(0, 20000);
    if (!title || !body) { setMsg('الرجاء إدخال العنوان والنص'); return; }
    const next = (() => {
      const exists = customDuas.find((x) => x.id === id);
      const entry = { id, title_ar: title, source: 'مضاف من القائم', body };
      if (exists) return customDuas.map((x) => (x.id === id ? entry : x));
      return [entry, ...customDuas];
    })();
    setCustomDuas(next);
    saveCustomDuas(next);
    setEditor(null);
    setMsg('تم حفظ الدعاء');
    dismissWelcome();
  };
  const deleteCustomDua = (id) => {
    const next = customDuas.filter((x) => x.id !== id);
    setCustomDuas(next);
    saveCustomDuas(next);
  };

  // Export all custom duas as a single JSON file the operator can email
  // to another mosque / backup before reinstalling Windows. Uses the
  // DOM's anchor-download path so no main-process changes are needed.
  const exportCustomDuas = () => {
    if (customDuas.length === 0) {
      setMsg('لا توجد أدعية مضافة للتصدير');
      return;
    }
    const payload = {
      format: 'mithnah.custom-duas',
      version: 1,
      exportedAt: new Date().toISOString(),
      duas: customDuas,
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mithnah-duas-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg(`تم تصدير ${customDuas.length} دعاء`);
    } catch (err) {
      setMsg('فشل التصدير: ' + err.message);
    }
  };

  // Import custom duas from a previously-exported JSON file. Merges:
  // existing IDs are kept (no clobber). Bad records are skipped; a
  // summary message tells the operator how many were added.
  const importCustomDuas = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || data.format !== 'mithnah.custom-duas' || !Array.isArray(data.duas)) {
        setMsg('الملف ليس تصديراً صالحاً لأدعية مئذنة');
        return;
      }
      const existing = new Set(customDuas.map((d) => d.id));
      const incoming = data.duas.filter((d) =>
        d && typeof d === 'object' &&
        typeof d.id === 'string' && d.id.startsWith('custom:') &&
        typeof d.title_ar === 'string' && typeof d.body === 'string'
      );
      const added = incoming.filter((d) => !existing.has(d.id));
      const next = [...added, ...customDuas];
      setCustomDuas(next);
      saveCustomDuas(next);
      const skipped = incoming.length - added.length;
      setMsg(`تمّت إضافة ${added.length} دعاء${skipped > 0 ? ` (تخطيت ${skipped} موجود مسبقاً)` : ''}`);
    } catch (err) {
      setMsg('فشل الاستيراد: ' + err.message);
    }
  };

  return (
    <div ref={containerRef} className="dua-picker open" role="dialog" aria-modal="true" dir="rtl">
      <div className="dua-picker__bg" onClick={() => setOpen(false)} />
      <div className="dua-picker__card">
        <div className="help-overlay__star help-overlay__star--tr"><ImamiStar size={20} opacity={0.6} /></div>
        <div className="help-overlay__star help-overlay__star--tl"><ImamiStar size={20} opacity={0.6} /></div>
        <div className="help-overlay__star help-overlay__star--br"><ImamiStar size={20} opacity={0.6} /></div>
        <div className="help-overlay__star help-overlay__star--bl"><ImamiStar size={20} opacity={0.6} /></div>

        <div className="help-overlay__head">
          <div className="help-overlay__head-title">
            <BrandMark size={44} showWordmark={false} />
            <div>
              <div className="help-overlay__title">مكتبة الأدعية والزيارات</div>
              <div className="help-overlay__subtitle">
                F4 أو Esc للإغلاق · اختر لعرضه على الجدار · ريموت العارض للتنقل
              </div>
            </div>
          </div>
          <button ref={closeBtnRef} className="help-overlay__close" onClick={() => setOpen(false)}>
            إغلاق · Esc
          </button>
        </div>

        <div className="dua-picker__tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`dua-picker__tab ${tab === t.id ? 'dua-picker__tab--active' : ''}`}
              onClick={() => setTab(t.id)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </div>

        {welcomeShown && tab === 'duas' && (
          <div className="dua-picker__welcome" role="note">
            <span>
              <strong>مرحباً بمكتبتك.</strong>
              {' '}الأدعية المضافة من طرفك تظهر هنا بجانب الأدعية المُرفقة مع التطبيق. اضغط «➕ إضافة دعاء» لتبدأ.
            </span>
            <button
              type="button"
              className="dua-picker__welcome-close"
              aria-label="إخفاء الترحيب"
              onClick={dismissWelcome}
            >×</button>
          </div>
        )}

        <div className="dua-picker__searchbar">
          <input
            type="search"
            className="dua-picker__search"
            placeholder={`ابحث في ${TABS.find(t => t.id === tab)?.label || ''}...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {tab === 'duas' && (
            <>
              <button
                type="button"
                className="dua-picker__add-btn"
                onClick={() => setEditor({ id: '', title: '', body: '' })}
                title="أضف دعاءك الخاص — يُحفظ على هذا الجهاز فقط"
              >
                ➕ إضافة دعاء
              </button>
              <button
                type="button"
                className="dua-picker__secondary-btn"
                onClick={exportCustomDuas}
                title="حفظ أدعيتك المضافة في ملف — لنقلها إلى جهاز آخر أو للحفظ الاحتياطي"
                disabled={customDuas.length === 0}
              >
                ⇩ تصدير
              </button>
              <label
                className="dua-picker__secondary-btn"
                title="جلب أدعية من ملف تصدير سابق"
              >
                ⇧ استيراد
                <input
                  type="file"
                  accept="application/json,.json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    importCustomDuas(f);
                    e.target.value = ''; // so the same file can be re-chosen
                  }}
                />
              </label>
            </>
          )}
        </div>

        {msg && (
          <div className="settings__msg settings__msg--err" style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{msg}</span>
            {loadFailed && (
              <button
                type="button"
                className="settings__btn"
                onClick={() => setReloadNonce((n) => n + 1)}
              >↻ إعادة المحاولة</button>
            )}
          </div>
        )}

        <div className="dua-picker__body">
          {loading && <div className="dua-picker__empty">جاري التحميل...</div>}
          {!loading && mergedItems.length === 0 && (
            <div className="dua-picker__empty">لا يوجد عناصر</div>
          )}
          {!loading && mergedItems.length > 0 && (() => {
            const filtered = filteredItems;
            if (filtered.length === 0) return <div className="dua-picker__empty">لا نتائج لـ "{query}"</div>;

            // Build the recent + favorite item lists for the CURRENT
            // tab. We only show these sections when a search hasn't
            // narrowed things down — otherwise the operator typed a
            // query and just wants the matches.
            const showQuickAccess = !debouncedQuery.trim();
            const tabPrefix = `${tab}:`;
            const favItems = showQuickAccess
              ? favorites.filter(k => k.startsWith(tabPrefix))
                  .map(k => mergedItems.find(it => it.id === k.slice(tabPrefix.length)))
                  .filter(Boolean)
              : [];
            const recentItems = showQuickAccess
              ? recents.filter(k => k.startsWith(tabPrefix))
                  .map(k => mergedItems.find(it => it.id === k.slice(tabPrefix.length)))
                  .filter(Boolean)
                  // Don't duplicate items that are already in favorites.
                  .filter(it => !favItems.includes(it))
              : [];

            const renderCard = (item) => {
              const isCustom = typeof item.id === 'string' && item.id.startsWith('custom:');
              return (
                <button
                  key={`${tab}:${item.id}`}
                  className={`dua-picker__item ${isCustom ? 'dua-picker__item--custom' : ''}`}
                  onClick={() => onOpenItem(item)}
                  type="button"
                >
                  {isCustom && <div className="dua-picker__item-badge">مضاف</div>}
                  <div className="dua-picker__item-title">{item.title_ar || item.title || item.id}</div>
                  {item.subtitle_ar && (
                    <div className="dua-picker__item-subtitle">{item.subtitle_ar}</div>
                  )}
                  {item.source && (
                    <div className="dua-picker__item-source">المصدر: {item.source}</div>
                  )}
                  <button
                    type="button"
                    className={`dua-picker__star ${isFavorite(item) ? 'dua-picker__star--on' : ''}`}
                    aria-label={isFavorite(item) ? 'إزالة من المفضّلة' : 'إضافة للمفضّلة'}
                    title={isFavorite(item) ? 'إزالة من المفضّلة' : 'إضافة للمفضّلة'}
                    onClick={(e) => toggleFavorite(item, e)}
                  >
                    {isFavorite(item) ? '★' : '☆'}
                  </button>
                  {isCustom && (
                    <>
                      <button
                        type="button"
                        className="dua-picker__edit"
                        aria-label="تعديل الدعاء"
                        title="تعديل"
                        onClick={(e) => { e.stopPropagation(); setEditor({ id: item.id, title: item.title_ar, body: item.body || '' }); }}
                      >✎</button>
                      <button
                        type="button"
                        className="dua-picker__delete"
                        aria-label="حذف الدعاء"
                        title="حذف"
                        onClick={(e) => { e.stopPropagation(); if (window.confirm('حذف هذا الدعاء؟')) deleteCustomDua(item.id); }}
                      >🗑</button>
                    </>
                  )}
                </button>
              );
            };

            return (
              <>
                {favItems.length > 0 && (
                  <div className="dua-picker__section">
                    <div className="dua-picker__section-title">⭐ المفضّلة</div>
                    <div className="dua-picker__grid">{favItems.map(renderCard)}</div>
                  </div>
                )}
                {recentItems.length > 0 && (
                  <div className="dua-picker__section">
                    <div className="dua-picker__section-title">🕒 المستخدمة مؤخراً</div>
                    <div className="dua-picker__grid">{recentItems.map(renderCard)}</div>
                  </div>
                )}
                <div className="dua-picker__section">
                  {(favItems.length > 0 || recentItems.length > 0) && (
                    <div className="dua-picker__section-title">📚 كل العناصر</div>
                  )}
                  <div className="dua-picker__grid">{filtered.map(renderCard)}</div>
                </div>
              </>
            );
          })()}
        </div>

        <SalawatLine size="sm" style={{ marginTop: 16 }} />
      </div>

      {/* Custom-dua editor — form modal triggered by ➕ or ✎. */}
      {editor && (
        <CustomDuaEditor
          initial={editor}
          onCancel={() => setEditor(null)}
          onSave={saveCustomDua}
        />
      )}

    </div>
  );
}

// -------- CustomDuaEditor --------
// Simple title + body form. Kept inside DuaPicker.jsx because it's the
// only place that uses it; extracting to its own file would add more
// import churn than it saves.
function CustomDuaEditor({ initial, onCancel, onSave }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [body, setBody]   = useState(initial?.body  || '');
  const onKeyDown = (e) => { if (e.key === 'Escape') onCancel(); };
  return (
    <div className="inline-modal" role="dialog" aria-modal="true" dir="rtl" onKeyDown={onKeyDown}>
      <div className="inline-modal__bg" onClick={onCancel} />
      <div className="inline-modal__card inline-modal__card--wide">
        <div className="inline-modal__title">{initial?.id ? 'تعديل دعاء' : 'إضافة دعاء'}</div>
        <div className="inline-modal__subtitle">يُحفظ على هذا الجهاز فقط — لن يُنقل إلى أجهزة أخرى.</div>
        <div className="inline-modal__field">
          <label className="inline-modal__label">العنوان</label>
          <input
            type="text"
            className="inline-modal__input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثال: دعاء الفرج"
            maxLength={200}
            autoFocus
          />
        </div>
        <div className="inline-modal__field">
          <label className="inline-modal__label">النص</label>
          <textarea
            className="inline-modal__input inline-modal__textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="اكتب أو الصق نص الدعاء بالكامل هنا..."
            rows={10}
          />
        </div>
        <div className="inline-modal__buttons">
          <button
            type="button"
            className="inline-modal__btn inline-modal__btn--primary"
            onClick={() => onSave({ id: initial?.id || '', title, body })}
          >حفظ</button>
          <button type="button" className="inline-modal__btn" onClick={onCancel}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

