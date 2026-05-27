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
import { toArabicDigits } from '../lib/format.js';

// localStorage keys for the two persistence stores. Kept tiny and
// scoped so a future migration is trivial. We only persist IDs (not
// titles) because the registry is the source of truth and titles can
// be re-localised between versions.
const RECENTS_KEY = 'mithnah:dua-picker:recent';
const FAVORITES_KEY = 'mithnah:dua-picker:favorites';
// Per-tab custom storage — the user can now add personal ziyarat
// and taqibat too, not just duas (operator 2026-04-23 #8: "الزيارات
// و التعقيبات ما فيهم طريقة للاضافة"). The legacy `:custom` key
// (duas-only) is migrated into `:custom:duas` on first read so
// nothing is lost.
const CUSTOM_DUAS_LEGACY_KEY = 'mithnah:dua-picker:custom';
const CUSTOM_KEYS = {
  duas:    'mithnah:dua-picker:custom:duas',
  ziyarat: 'mithnah:dua-picker:custom:ziyarat',
  taqibat: 'mithnah:dua-picker:custom:taqibat',
};
// Arabic grammatical forms keyed by tab id. Three forms because the
// UI uses each in different contexts:
//   - singular  (no article) — "إضافة دعاء", "حذف زيارة"
//   - definite  (with article) — "تم حفظ الدعاء", "تم حذف الزيارة"
//   - plural    (with article) — "الأدعية والزيارات" tab labels, import messages
// Single source of truth so a new tab needs one edit, not seven.
const TAB_AR = {
  duas:    { singular: 'دعاء',  definite: 'الدعاء',  plural: 'الأدعية' },
  ziyarat: { singular: 'زيارة', definite: 'الزيارة', plural: 'الزيارات' },
  taqibat: { singular: 'تعقيب', definite: 'التعقيب', plural: 'التعقيبات' },
};
// One-shot flag: shown as a welcome strip the FIRST time the library
// opens. Dismissed automatically after the operator adds a dua or
// clicks ×. Cleared from localStorage to show again requires manual
// flip — rare.
const WELCOME_KEY = 'mithnah:dua-picker:welcomed';
const RECENTS_LIMIT = 8;
const CUSTOM_LIST_MAX = 100;
// Body cap for a single custom entry. The textarea, the slice that
// runs at save time, and the counter UI all read from this one
// constant so they cannot drift apart. Bumping this here moves all
// four call sites together.
const CUSTOM_BODY_MAX = 20000;
const CUSTOM_BODY_WARN = CUSTOM_BODY_MAX - 2000;

// Load the operator's custom entries for a given tab. Each entry
// is { id, title_ar, source, body }; the `custom:` id prefix makes
// them easy to distinguish from bundled content.
//
// SIDE EFFECT: on a corrupt JSON payload — either the current
// per-tab key or the legacy `:custom` migration source — this
// helper writes a timestamped backup key
// (`<original-key>:backup:<Date.now()>`) and removes the original,
// preserving the raw bytes for manual recovery while letting the
// picker continue with an empty list. The alternative (a silent
// return []) wiped operator data on the very next save. The name
// stays `loadCustomForTab` because every call site treats this as
// "give me the list"; the repair is best-effort and never blocks
// loading.
function loadCustomForTab(tab) {
  const key = CUSTOM_KEYS[tab];
  if (!key) return [];
  let raw;
  try { raw = localStorage.getItem(key); }
  catch (err) {
    console.error(`[dua-picker] localStorage.getItem(${key}) failed: ${err && err.message}`);
    return [];
  }
  // Migrate the pre-2026-04-23 single-bucket storage: anything in
  // the legacy `:custom` key belongs to the duas tab.
  if (!raw && tab === 'duas') {
    const legacy = (() => {
      try { return localStorage.getItem(CUSTOM_DUAS_LEGACY_KEY); }
      catch (_) { return null; }
    })();
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy);
        if (Array.isArray(parsed)) {
          try { localStorage.setItem(key, legacy); } catch (_) { /* migration write best-effort */ }
          return parsed.filter((x) => x && typeof x === 'object' && typeof x.id === 'string');
        }
      } catch (err) {
        // Corrupt legacy payload — preserve it under a timestamped
        // backup key so the next save doesn't silently overwrite the
        // raw bytes. Operator can recover via DevTools localStorage.
        const backupKey = `${CUSTOM_DUAS_LEGACY_KEY}:backup:${Date.now()}`;
        try { localStorage.setItem(backupKey, legacy); localStorage.removeItem(CUSTOM_DUAS_LEGACY_KEY); } catch (_) {}
        console.error(`[dua-picker] Corrupt legacy ${CUSTOM_DUAS_LEGACY_KEY}; backed up to ${backupKey}: ${err && err.message}`);
      }
    }
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => x && typeof x === 'object' && typeof x.id === 'string') : [];
  } catch (err) {
    // Corrupt blob — back the raw bytes up before the next save
    // overwrites them. Without this the load returned [] and the
    // first edit silently wiped real operator data.
    const backupKey = `${key}:backup:${Date.now()}`;
    try { localStorage.setItem(backupKey, raw); localStorage.removeItem(key); } catch (_) {}
    console.error(`[dua-picker] Corrupt ${tab} (key=${key}); backed up to ${backupKey}: ${err && err.message}`);
    return [];
  }
}
// Throws on storage failure (e.g. QuotaExceededError) so the call
// site can surface a real "couldn't save" message instead of letting
// the entry vanish on next reload. Previously a swallowed catch
// turned QuotaExceededError into invisible data loss.
function saveCustomForTab(tab, list) {
  const key = CUSTOM_KEYS[tab];
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(list.slice(0, CUSTOM_LIST_MAX)));
}
function loadAllCustom() {
  return {
    duas:    loadCustomForTab('duas'),
    ziyarat: loadCustomForTab('ziyarat'),
    taqibat: loadCustomForTab('taqibat'),
  };
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
  try { localStorage.setItem(key, JSON.stringify(list.slice(0, 50))); }
  catch (err) {
    // Recents/favorites are convenience features (not load-bearing
    // operator content), so surface in DevTools but don't toast on
    // every click — the user would see noise without any data at risk.
    console.error(`[dua-picker] saveIdList(${key}) failed: ${err && err.message}`);
  }
}

// Module-level cache — Shia content is immutable at runtime, so once
// we've loaded a tab's list over IPC we can reuse it for every future
// F4 press. Previously each open re-shipped hundreds of slides over
// IPC and re-filtered on the renderer, which read as jank.
const tabCache = new Map();

const TABS = [
  { id: 'duas',     label: TAB_AR.duas.plural },
  { id: 'ziyarat',  label: TAB_AR.ziyarat.plural },
  { id: 'taqibat',  label: TAB_AR.taqibat.plural },
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

// Approximate text-page count surfaced on each card so the operator
// knows up-front how long a dua is before opening it. Built-in items
// carry a pre-chunked `slides` array (one page per `text` entry);
// custom items only carry the raw `body` string since the main-process
// chunker runs lazily at openCustom time. We mirror the chunker's
// rules here for custom so the badge agrees with what the slideshow
// actually renders within ±1 page.
//
// IMPORTANT: these two constants MUST stay in sync with
// DEFAULT_WRAP_CHARS and DEFAULT_MAX_LINES in
// src/main/shia-content/chunker.js. If you change one side without
// the other the badge silently lies about page count.
const CHUNK_MIRROR_WRAP_CHARS = 90;
const CHUNK_MIRROR_LINES_PER_PAGE = 2;
function countPagesForItem(item) {
  if (Array.isArray(item?.slides)) {
    return item.slides.filter((s) => s && s.kind === 'text').length;
  }
  const body = String(item?.body || '').trim();
  if (!body) return 0;
  let sublineCount = 0;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    sublineCount += Math.max(1, Math.ceil(line.length / CHUNK_MIRROR_WRAP_CHARS));
  }
  return Math.max(1, Math.ceil(sublineCount / CHUNK_MIRROR_LINES_PER_PAGE));
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
  // Per-tab custom storage. The F4 editor writes into whichever tab
  // is active, so the caretaker can add زيارة مخصّصة or تعقيب مخصّص
  // the same way they used to add adua.
  const [customByTab, setCustomByTab] = useState(loadAllCustom);
  const customCurrent = customByTab[tab] || [];
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
  // Delete-confirmation modal state. window.confirm returns null
  // silently inside packaged Electron kiosk windows (no native dialog
  // attaches), so the 🗑 button looked broken in production. Replaced
  // with an in-renderer modal — null = closed; { id, tab, title } =
  // open. The `tab` field freezes which bucket the delete targets,
  // because the active tab can change between opening the modal and
  // pressing نعم (e.g. via a phone-driven IPC close+reopen).
  const [confirmDelete, setConfirmDelete] = useState(null);
  // Favorites-only filter. Activated by the FloatingMenu "⭐ المفضّلة"
  // shortcut so the caretaker reaches their starred items in one click
  // instead of opening F4 → scrolling → finding the favorites strip.
  // Resets when the picker closes so the next F4 open is a normal view.
  const [favoritesMode, setFavoritesMode] = useState(false);
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

  // Custom items show up at the top of the active tab alongside the
  // bundled ones. Each tab has its own custom store (duas, ziyarat,
  // taqibat).
  const mergedItems = useMemo(() => {
    return [...customCurrent, ...items];
  }, [items, customCurrent]);

  const filteredItems = useMemo(() => {
    let base = mergedItems;
    if (favoritesMode) {
      const favSet = new Set(favorites);
      base = base.filter((it) => favSet.has(`${tab}:${it.id}`));
    }
    if (!debouncedQuery.trim()) return base;
    const q = debouncedQuery.trim().toLowerCase();
    return base.filter((it) =>
      (it.title_ar || '').toLowerCase().includes(q) ||
      (it.title || '').toLowerCase().includes(q) ||
      (it.subtitle_ar || '').toLowerCase().includes(q) ||
      (it.id || '').toLowerCase().includes(q)
    );
  }, [mergedItems, debouncedQuery, favoritesMode, favorites, tab]);

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

  // FloatingMenu "⭐ المفضّلة" shortcut. Opens the picker AND flips on
  // the favorites-only filter so the operator lands directly on their
  // starred items instead of scrolling through the whole library.
  useEffect(() => {
    const onFav = () => { setOpen(true); setFavoritesMode(true); };
    window.addEventListener('mithnah:request-favorites', onFav);
    return () => window.removeEventListener('mithnah:request-favorites', onFav);
  }, []);
  // Reset favoritesMode when the picker closes so the next plain F4 open
  // shows the full library, not the last favorites-only view. Same
  // for confirmDelete: a phone-driven close while the modal is up
  // shouldn't leave the dialog primed for the next reopen.
  useEffect(() => {
    if (!open) {
      setFavoritesMode(false);
      setConfirmDelete(null);
    }
  }, [open]);
  // A tab switch invalidates an in-flight delete (it targets the old
  // tab's id; the new tab's list won't contain it). Clear the modal
  // so the operator can re-initiate against the new tab if needed.
  useEffect(() => { setConfirmDelete(null); }, [tab]);

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
        setMsg('فشل التحميل — ' + friendlyErrorTitle(err));
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
    const body = (draft.body || '').trim().slice(0, CUSTOM_BODY_MAX);
    if (!title || !body) { setMsg('الرجاء إدخال العنوان والنص'); return; }
    // Save to the tab the editor was OPENED on (frozen into
    // `editor.tab`), not the currently-active tab. Without this, a
    // caretaker who typed a long zeerah, then accidentally clicked
    // the Taqibat tab before pressing حفظ, would see their zeerah
    // land under the taqibat list — baffling data loss from their
    // perspective.
    const targetTab = editor?.tab || tab;
    const list = customByTab[targetTab] || [];
    const next = (() => {
      const exists = list.find((x) => x.id === id);
      const entry = { id, title_ar: title, source: 'مضاف من القائم', body };
      if (exists) return list.map((x) => (x.id === id ? entry : x));
      return [entry, ...list];
    })();
    // Persist FIRST so a quota error doesn't leave the in-memory
    // state ahead of localStorage. If save throws the entry never
    // appears in the list — the operator sees an honest failure.
    try { saveCustomForTab(targetTab, next); }
    catch (err) { setMsg('تعذّر الحفظ — ' + friendlyErrorTitle(err)); return; }
    setCustomByTab({ ...customByTab, [targetTab]: next });
    setEditor(null);
    const savedLabel = TAB_AR[targetTab]?.definite || 'العنصر';
    setMsg(`تم حفظ ${savedLabel}`);
    dismissWelcome();
  };
  // `fromTab` is REQUIRED — the tab the delete was initiated on,
  // captured into confirmDelete state at click time. Falling back to
  // the active `tab` would re-open the cross-tab misroute window
  // the confirmDelete.tab field exists to close, so we bail loudly
  // on an unset argument instead.
  const deleteCustomDua = (id, fromTab) => {
    if (!fromTab) {
      console.error('[dua-picker] deleteCustomDua called without fromTab');
      return;
    }
    const list = customByTab[fromTab] || [];
    const next = list.filter((x) => x.id !== id);
    try { saveCustomForTab(fromTab, next); }
    catch (err) { setMsg('تعذّر الحذف — ' + friendlyErrorTitle(err)); return; }
    setCustomByTab({ ...customByTab, [fromTab]: next });
    const deletedLabel = TAB_AR[fromTab]?.definite || 'العنصر';
    setMsg(`تم حذف ${deletedLabel}`);
  };

  // Export every tab's custom entries together in a single JSON
  // file. Format widened 2026-04-23 to include ziyarat+taqibat
  // alongside duas. Legacy `duas`-only files still import via the
  // backwards-compatible loader below.
  const exportCustomDuas = () => {
    const totalCount = (customByTab.duas?.length || 0)
                     + (customByTab.ziyarat?.length || 0)
                     + (customByTab.taqibat?.length || 0);
    if (totalCount === 0) {
      setMsg('لا توجد عناصر مضافة للتصدير');
      return;
    }
    const payload = {
      format: 'mithnah.custom-content',
      version: 2,
      exportedAt: new Date().toISOString(),
      duas:    customByTab.duas || [],
      ziyarat: customByTab.ziyarat || [],
      taqibat: customByTab.taqibat || [],
    };
    try {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mithnah-custom-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg(`تم تصدير ${totalCount} عنصراً`);
    } catch (err) {
      setMsg('فشل التصدير — ' + friendlyErrorTitle(err));
    }
  };

  // Import custom entries from a previously-exported JSON file.
  // Accepts BOTH the new v2 multi-tab format and the legacy v1
  // duas-only format. Merges per-tab: existing IDs are kept.
  const importCustomDuas = async (file) => {
    if (!file) return;
    try {
      // Cap at 5 MB — a legitimate custom-content export is at most
      // a few hundred KB (100 duas + 100 ziyarat + 100 taqibat, each
      // bounded to 20 KB body). Reject anything larger before the
      // renderer tries to JSON.parse a megabyte of random bytes and
      // freezes (reported by the security audit, not yet seen in
      // the field but cheap to prevent).
      if (file.size > 5 * 1024 * 1024) {
        setMsg('حجم الملف يتجاوز ٥ ميجا — ملفّات التصدير الشرعية أصغر بكثير');
        return;
      }
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object') {
        setMsg('الملف ليس تصديراً صالحاً');
        return;
      }
      const isV2 = data.format === 'mithnah.custom-content';
      const isV1 = data.format === 'mithnah.custom-duas';
      if (!isV2 && !isV1) {
        setMsg('الملف ليس تصديراً صالحاً لمئذنة');
        return;
      }
      const isValid = (d) => d && typeof d === 'object' &&
        typeof d.id === 'string' && d.id.startsWith('custom:') &&
        typeof d.title_ar === 'string' && typeof d.body === 'string';
      const incomingByTab = {
        duas:    isV2 ? (Array.isArray(data.duas)    ? data.duas.filter(isValid)    : []) : (data.duas || []).filter(isValid),
        ziyarat: isV2 && Array.isArray(data.ziyarat) ? data.ziyarat.filter(isValid) : [],
        taqibat: isV2 && Array.isArray(data.taqibat) ? data.taqibat.filter(isValid) : [],
      };
      // Build the merged list per tab first, then persist tab-by-tab
      // with its own try/catch so a quota failure on one tab doesn't
      // leave localStorage ahead of React state. Each tab's success
      // is reflected in `finalByTab`; the message at the end honestly
      // names the tabs that didn't make it.
      const addedByTab    = {};
      const skippedByTab  = {};
      const nextByTab     = { ...customByTab };
      for (const t of ['duas', 'ziyarat', 'taqibat']) {
        const existing = new Set((customByTab[t] || []).map((d) => d.id));
        const added    = (incomingByTab[t] || []).filter((d) => !existing.has(d.id));
        const skipped  = (incomingByTab[t] || []).length - added.length;
        addedByTab[t]   = added.length;
        skippedByTab[t] = skipped;
        nextByTab[t]    = [...added, ...(customByTab[t] || [])];
      }
      const finalByTab = { ...customByTab };
      const failedTabs = [];
      let savedAdded = 0, savedSkipped = 0;
      for (const t of ['duas', 'ziyarat', 'taqibat']) {
        try {
          saveCustomForTab(t, nextByTab[t]);
          finalByTab[t] = nextByTab[t];
          savedAdded   += addedByTab[t];
          savedSkipped += skippedByTab[t];
        } catch (err) {
          // Failure is recorded in failedTabs and surfaced in the
          // partial-success message below; console keeps the specific
          // reason (QuotaExceededError vs SecurityError vs unexpected)
          // for DevTools triage so the toast can stay user-friendly.
          console.error(`[dua-picker] importCustomDuas: tab ${t} failed: ${err && err.message}`);
          failedTabs.push(t);
        }
      }
      setCustomByTab(finalByTab);
      if (failedTabs.length === 0) {
        setMsg(`تمّت إضافة ${savedAdded} عنصراً${savedSkipped > 0 ? ` (تخطيت ${savedSkipped} موجود مسبقاً)` : ''}`);
      } else {
        // Honest partial-success message — names the tabs that failed,
        // reports the count actually saved. Avoids the prior misfire
        // where savedAdded === 0 (e.g. an all-duplicates duas import
        // that succeeded with zero new entries) misread as total
        // failure even though one tab persisted cleanly.
        const failedLabels = failedTabs.map((t) => TAB_AR[t].plural).join(' و');
        setMsg(`تم استيراد ${savedAdded} عنصراً — تعذّر حفظ ${failedLabels}`);
      }
    } catch (err) {
      setMsg('فشل الاستيراد — ' + friendlyErrorTitle(err));
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

        {welcomeShown && tab === 'duas' && !favoritesMode && (
          <div className="dua-picker__welcome" role="note">
            <span>
              <strong>مرحباً بمكتبتك.</strong>
              {' '}الأدعية والزيارات والتعقيبات المضافة من طرفك تظهر هنا بجانب المحتوى المُرفق مع التطبيق. اضغط «➕ إضافة» لتبدأ.
            </span>
            <button
              type="button"
              className="dua-picker__welcome-close"
              aria-label="إخفاء الترحيب"
              onClick={dismissWelcome}
            >×</button>
          </div>
        )}

        {favoritesMode && (
          <div className="dua-picker__favorites-banner" role="note">
            <span>⭐ <strong>تعرض المفضّلة فقط</strong> — استخدم التبويبات أعلاه للتنقل بين أنواع المفضّلة.</span>
            <button
              type="button"
              className="dua-picker__favorites-banner-exit"
              aria-label="إظهار كل العناصر"
              title="إظهار كل العناصر"
              onClick={() => setFavoritesMode(false)}
            >إظهار الكل</button>
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
          {/* Add/Export/Import available on every tab — the caretaker
              can now build custom زيارات and تعقيبات the same way they
              used to only add دعاء (operator 2026-04-23 #8). Labels
              shift with the active tab so nothing says "إضافة دعاء"
              on the ziyarat tab. */}
          {(() => {
            const singularLabel = TAB_AR[tab]?.singular || 'عنصر';
            const pluralLabel   = TAB_AR[tab]?.plural   || 'العناصر';
            return (
              <>
              <button
                type="button"
                className="dua-picker__add-btn"
                onClick={() => setEditor({ id: '', title: '', body: '', tab })}
                title={`أضف ${singularLabel} من طرفك — يُحفظ على هذا الجهاز فقط`}
              >
                ➕ إضافة {singularLabel}
              </button>
              <button
                type="button"
                className="dua-picker__secondary-btn"
                onClick={exportCustomDuas}
                title={`حفظ ${pluralLabel} المضافة في ملف — لنقلها إلى جهاز آخر أو للحفظ الاحتياطي`}
                disabled={(customByTab.duas?.length || 0) + (customByTab.ziyarat?.length || 0) + (customByTab.taqibat?.length || 0) === 0}
              >
                ⇩ تصدير
              </button>
              <label
                className="dua-picker__secondary-btn"
                title="جلب عناصر من ملف تصدير سابق"
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
            );
          })()}
        </div>

        {msg && (
          <div
            className="settings__msg settings__msg--err"
            role="alert"
            aria-live="assertive"
            style={{ display: 'flex', gap: 14, alignItems: 'center', justifyContent: 'space-between' }}
          >
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
            if (filtered.length === 0) {
              if (favoritesMode) {
                const tabLabel = TABS.find((t) => t.id === tab)?.label || '';
                return (
                  <div className="dua-picker__empty">
                    لا توجد عناصر مفضّلة في {tabLabel}
                    <div style={{ marginTop: 12, fontSize: 14 }}>
                      اضغط ☆ على أي عنصر لإضافته للمفضّلة، أو جرّب تبويباً آخر.
                    </div>
                  </div>
                );
              }
              return <div className="dua-picker__empty">لا نتائج لـ "{query}"</div>;
            }

            // Build the recent + favorite item lists for the CURRENT
            // tab. We only show these sections when a search hasn't
            // narrowed things down AND we're not already in
            // favorites-only mode (where the whole list IS the
            // favorites — a "Favorites" sub-section would be noise).
            const showQuickAccess = !debouncedQuery.trim() && !favoritesMode;
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
              const pageCount = countPagesForItem(item);
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
                  <div className="dua-picker__item-meta">
                    {pageCount > 0 && (
                      <span className="dua-picker__item-pages">
                        {pageCount === 1 ? 'صفحة واحدة' : `${toArabicDigits(pageCount)} صفحة`}
                      </span>
                    )}
                    {item.source && (
                      <span className="dua-picker__item-source">المصدر: {item.source}</span>
                    )}
                  </div>
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
                        onClick={(e) => { e.stopPropagation(); setEditor({ id: item.id, title: item.title_ar, body: item.body || '', tab }); }}
                      >✎</button>
                      <button
                        type="button"
                        className="dua-picker__delete"
                        aria-label="حذف الدعاء"
                        title="حذف"
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete({ id: item.id, tab, title: item.title_ar }); }}
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
                  {favoritesMode ? (
                    <div className="dua-picker__section-title">⭐ المفضّلة</div>
                  ) : (favItems.length > 0 || recentItems.length > 0) && (
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
          /* Pass the editor's FROZEN tab (snapped when it opened)
             rather than the currently-active tab — the save handler
             uses this for the target bucket too, so switching tabs
             mid-edit doesn't misroute the write. */
          tab={editor.tab || tab}
          onCancel={() => setEditor(null)}
          onSave={saveCustomDua}
        />
      )}

      {/* Delete-confirmation modal — replaces window.confirm so it
          actually shows up inside packaged Electron. autoFocus on the
          safe action so a stray Enter cancels instead of deletes. */}
      {confirmDelete && (
        <ConfirmDeleteDua
          singular={TAB_AR[confirmDelete.tab]?.singular || 'عنصر'}
          title={confirmDelete.title}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => { deleteCustomDua(confirmDelete.id, confirmDelete.tab); setConfirmDelete(null); }}
        />
      )}

    </div>
  );
}

// -------- ConfirmDeleteDua --------
// Inline replacement for window.confirm (which returns null silently
// in packaged Electron kiosk windows). Mirrors the visual shape of
// CustomDuaEditor below so both feel native to the picker.
function ConfirmDeleteDua({ singular, title, onCancel, onConfirm }) {
  const onKeyDown = (e) => { if (e.key === 'Escape') onCancel(); };
  return (
    <div className="inline-modal" role="dialog" aria-modal="true" dir="rtl" onKeyDown={onKeyDown}>
      <div className="inline-modal__bg" onClick={onCancel} />
      <div className="inline-modal__card">
        <div className="inline-modal__title">{`حذف ${singular}`}</div>
        <div className="inline-modal__subtitle">
          سيُحذف <strong>{title || 'هذا العنصر'}</strong> نهائياً من هذا الجهاز.
        </div>
        <div className="inline-modal__buttons">
          <button
            type="button"
            className="inline-modal__btn inline-modal__btn--danger"
            onClick={onConfirm}
          >نعم، احذف</button>
          <button
            type="button"
            className="inline-modal__btn inline-modal__btn--primary"
            onClick={onCancel}
            autoFocus
          >إلغاء</button>
        </div>
      </div>
    </div>
  );
}

// -------- CustomDuaEditor --------
// Simple title + body form. Kept inside DuaPicker.jsx because it's the
// only place that uses it; extracting to its own file would add more
// import churn than it saves.
function CustomDuaEditor({ initial, tab, onCancel, onSave }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [body, setBody]   = useState(initial?.body  || '');
  const onKeyDown = (e) => { if (e.key === 'Escape') onCancel(); };
  const singular    = TAB_AR[tab]?.singular || 'عنصر';
  const placeholder = { duas: 'مثال: دعاء الفرج', ziyarat: 'مثال: زيارة الأربعين المختصرة', taqibat: 'مثال: تعقيب صلاة الفجر' }[tab] || 'العنوان';
  return (
    <div className="inline-modal" role="dialog" aria-modal="true" dir="rtl" onKeyDown={onKeyDown}>
      <div className="inline-modal__bg" onClick={onCancel} />
      <div className="inline-modal__card inline-modal__card--wide">
        <div className="inline-modal__title">{initial?.id ? `تعديل ${singular}` : `إضافة ${singular}`}</div>
        <div className="inline-modal__subtitle">يُحفظ على هذا الجهاز فقط — لن يُنقل إلى أجهزة أخرى.</div>
        <div className="inline-modal__field">
          <label className="inline-modal__label" htmlFor="dua-editor-title">العنوان</label>
          <input
            id="dua-editor-title"
            type="text"
            className="inline-modal__input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={placeholder}
            maxLength={200}
            autoFocus
          />
        </div>
        <div className="inline-modal__field">
          <label className="inline-modal__label" htmlFor="dua-editor-body">النص</label>
          <textarea
            id="dua-editor-body"
            className="inline-modal__input inline-modal__textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={`اكتب أو الصق نص ${TAB_AR[tab]?.definite || 'العنصر'} بالكامل هنا...`}
            rows={10}
            maxLength={CUSTOM_BODY_MAX}
          />
          {/* Live counter so a long ziyarah (eg. Ashura zeerah) doesn't
              silently lose tail content to the saveCustomDua slice cap.
              Turns muted-red once within 2 000 chars of the limit to
              nudge the operator to trim before they paste more. */}
          <div
            className="inline-modal__hint"
            style={{
              textAlign: 'end',
              fontSize: 14,
              marginTop: 6,
              color: body.length >= CUSTOM_BODY_WARN ? '#e89898' : 'var(--m-text-muted)',
            }}
          >
            {toArabicDigits(body.length)} / {toArabicDigits(CUSTOM_BODY_MAX)}
          </div>
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

