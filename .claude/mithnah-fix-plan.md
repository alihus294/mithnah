# Mithnah Fix Plan — Micro-Tasks for Claude Code

## Problem: src/main/index.js is 1998 lines (monolith)
## Constraint: Claude Code WSL timeout on >200-line tasks
## Strategy: Extract modules one at a time, <150 lines each

### Phase 1: Extract Constants & Config (lines 75-105)
- File: src/main/config/constants.js
- Lines: ~30
- Content: APP_NAME, ZOOM_STEP, ZOOM_MIN, ZOOM_MAX, etc.

### Phase 2: Extract Zoom State Management (lines 158-387)
- File: src/main/window/zoom-state.js
- Lines: ~230 → Split into 2 files if needed
- Content: zoomIn, zoomOut, zoomReset, getZoomState, etc.

### Phase 3: Extract Window Settings I/O (lines 179-258)
- File: src/main/window/settings-io.js
- Lines: ~80
- Content: loadWindowSettings, saveWindowSettings

### Phase 4: Extract App Lifecycle (lines 1532-1715)
- File: src/main/lifecycle/app-lifecycle.js
- Lines: ~180
- Content: app.whenReady, window-all-closed, before-quit

### Phase 5: Extract IPC Handlers (lines 1716-1998)
- File: src/main/ipc/handlers.js
- Lines: ~280 → Split into 2-3 files
- Content: All ipcMain.on handlers

### Phase 6: Update index.js to import modules
- Remove extracted code, add imports
- Verify no broken references

### Phase 7: Add outDir to vite.config.js
- Add explicit outDir: 'dist/renderer'

### Phase 8: Final verification
- npm run build (if possible)
- Check for syntax errors
