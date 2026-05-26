## Agent C — Wall renderer

**Files owned:** `src/renderer/components/Dashboard.jsx`, `src/renderer/components/DashboardFeatures.jsx`, `src/renderer/components/DuaPicker.jsx`, `src/renderer/styles.css`.

**Items (3 + 1 optional from A.7):**

| Item | Phase | Effort |
|------|-------|--------|
| C.1 Custom-dua localStorage quota handling (was 3.4) | Phase 3 | 30 min |
| C.2 Dashboard re-render — memoize children (was 3.6) | Phase 3 | 2 h |
| C.3 Default-location badge on Dashboard (was 3.8) | Phase 3 | 1 h |
| C.4 (optional) Clock-skew toast handler (pairs with A.7) | Phase 3 | 30 min |

**Total Agent C effort:** ~3.5 hours (or 4 with C.4).

**Suggested internal order:** C.1 → C.3 → C.4 → C.2.

### C.1 Custom-dua localStorage quota handling

**Why:** Verified `src/renderer/components/DuaPicker.jsx:65-71`. `saveCustomForTab` has no try/catch around `localStorage.setItem`. At 100 entries × 20 KB × 3 tabs = 6 MB worst-case → can exceed Chromium's 5 MB quota.

**Steps:**
1. Wrap `localStorage.setItem(key, JSON.stringify(list.slice(0, 100)))` in try/catch.
2. On `QuotaExceededError` (or any error): set `msg` state to `تجاوز حدّ التخزين — احذف بعض الأدعية المضافة قبل إضافة جديد`.
3. Don't roll back in-memory `customByTab` — leave the new entry so the operator can copy the text out before deleting old entries. (`saveCustomForTab` is called after `setCustomByTab` so this is automatic.)

**Acceptance:** Manually fill localStorage near quota (devtools `Application > Storage > Clear` and re-fill), try to save another dua → toast appears, app doesn't crash.

---

### C.2 Dashboard re-render — memoize children

**Why:** Verified `Dashboard.jsx:23-30`. `useClock` triggers a render every second; no `React.memo` on children, so the entire tree re-evaluates.

**Steps:**
1. Wrap these components in `React.memo`:
   - `PrayerCell` (Dashboard.jsx:245)
   - `EventStrip` (Dashboard.jsx:195)
   - `HonorifiedTitle` (Dashboard.jsx:184)
   - `AnnouncementBanner`, `RamadanCountdown`, `QiblaBadge` from `DashboardFeatures.jsx`
2. Verify prop stability — they receive string/number props, which are reference-stable across renders.
3. Optional: profile with Chrome devtools Performance tab. 30-second recording; count `commit` phases.

**Acceptance:** React profiler shows `PrayerCell` rendering only when its `time` prop changes (minute roll-over), not every second.

---

### C.3 Default-location badge on Dashboard

**Why:** Verified — `Dashboard.jsx` has no visual indicator when the operator skipped onboarding and the wall shows default Najaf prayer times. Silent wrong-location risk.

**Steps:**
1. In `Dashboard.jsx`, compute `const isDefaultLocation = config?.locationSource === null && config?.onboardingCompleted === true`.
2. When true, render a yellow badge near the masthead location label:
   ```jsx
   {isDefaultLocation && (
     <div className="masthead__default-loc-warn" role="alert">
       📍 موقع افتراضي (النجف) — اضغط F3 لضبط موقع مسجدك
     </div>
   )}
   ```
3. In `src/renderer/styles.css` add `.masthead__default-loc-warn` with warning colors: light yellow background, dark yellow border, padding, small font, fades after 30 s of operator clicking dismiss (optional — keep visible until location is set is fine).
4. Confirm `isDefaultLocation` flips to false once F3's "تحديد الموقع بـ GPS" or city pick fires (`locationSource` becomes `'gps'`/`'manual'`/etc).

**Acceptance:** Fresh install → skip onboarding → badge visible. Set location via F3 → badge disappears.

---

### C.4 Clock-skew toast handler (optional — pairs with A.7)

**Why:** Agent A's A.7 emits `app:clock-skew` IPC when system clock is >5 min off. Renderer should surface it.

**Steps:**
1. In `Dashboard.jsx`, add a `useEffect` subscribing to `window.electron?.app?.onClockSkew?.((data) => {...})`.
2. Show a toast: `ساعة الجهاز ${data.skewMs > 0 ? 'متقدّمة' : 'متأخّرة'} بـ ${Math.abs(Math.round(data.skewMs/60000))} دقيقة. أوقات الصلاة قد تكون خاطئة — اضبط ساعة ويندوز.`
3. Toast persists until operator dismisses (no auto-hide).

**Acceptance:** With system clock skewed >5 min, toast appears within seconds of launch.

**Note:** Skip this item if Agent A's A.7 is deferred — they're paired.

---

