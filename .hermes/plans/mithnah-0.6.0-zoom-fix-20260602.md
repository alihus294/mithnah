# Plan: mithnah-0.6.0 Zoom Fix

## Problem
Sudden zoom-in after v0.6.0 caused by duplicated Chromium DPI switches.

## Root Cause
1. `high-dpi-support` and `force-device-scale-factor` set in BOTH `index.js` and `lifecycle.js`
2. `applyZoom()` never called after `createWindow()` — zoom factor from settings.json not applied
3. Dead files (`zoom-state.js`, `zoom-helpers.js`) cause confusion

## Solution
1. **index.js**: Keep DPI switches ONLY. Remove GPU switches. Restore `autoplay-policy`.
2. **lifecycle.js**: Keep GPU switches. Call `applyZoom(win)` after `createWindow()` with `typeof === 'function'` guard.
3. **activate path**: Call `applyZoom(created)` on macOS window recreation.
4. **Cleanup**: Delete `zoom-state.js` and `zoom-helpers.js`.

## Files Changed
- `src/main/index.js` (DPI switches, add applyZoom to deps)
- `src/main/lifecycle.js` (call applyZoom after createWindow + activate)
- `src/main/window/zoom-state.js` (DELETE)
- `src/main/window/zoom-helpers.js` (DELETE)

## Verification
- `npm run build` passes
- `node --check` on modified files passes
- No functional regressions (autoplay-policy preserved)
