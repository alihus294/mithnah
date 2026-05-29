/**
 * Mithnah — Window Settings I/O
 *
 * Atomic read/write for window-settings.json with upgrade-migration helpers.
 *
 * This module uses a factory pattern because loadSettings() mutates zoomState
 * (a shared mutable ref held by the caller). The returned functions close over
 * SETTINGS_FILE and a private save-debounce timer.
 */

const fsp = require('fs').promises;
const crypto = require('crypto');

/**
 * @param {Object} deps
 * @param {string} deps.SETTINGS_FILE  absolute path to window-settings.json
 * @param {Object} deps.zoomState      mutable ref: { factor: number, auto: boolean }
 * @param {Function} deps.getSmartZoomFactor  () => number (screen-based default)
 */
function createSettingsIo({ SETTINGS_FILE, zoomState, getSmartZoomFactor }) {
  // In-memory snapshot of everything we persist to window-settings.json.
  let persistedSettings = { zoom: { factor: 1.0, auto: true } };
  let saveSettingsTimer = null;

  async function loadSettings() {
    try {
      const content = await fsp.readFile(SETTINGS_FILE, 'utf8');
      if (content.length > 256 * 1024) {
        throw new Error(`settings file too large (${content.length} bytes)`);
      }
      const data = JSON.parse(content);
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        persistedSettings = { ...persistedSettings, ...data };
      }
      if (persistedSettings.zoom && typeof persistedSettings.zoom === 'object') {
        Object.assign(zoomState, persistedSettings.zoom);
        console.log(`[Zoom] Loaded saved zoom: ${zoomState.factor} (Auto: ${zoomState.auto})`);
      }
      // One-time reset: 0.8.30 disabled smart-auto upscaling.
      if (!persistedSettings.zoomResetV030 && zoomState.auto && zoomState.factor > 1.0) {
        console.log(`[Zoom] Upgrade reset: auto factor ${zoomState.factor} → 1.0 (0.8.30 CSS handles scaling natively)`);
        zoomState.factor = 1.0;
        persistedSettings.zoomResetV030 = true;
        await persistSettings();
      } else if (!persistedSettings.zoomResetV030) {
        persistedSettings.zoomResetV030 = true;
        await persistSettings();
      }
    } catch (e) {
      if (e && e.code === 'ENOENT') {
        zoomState.factor = getSmartZoomFactor();
        zoomState.auto = true;
        await persistSettings();
        return;
      }
      console.error('[Zoom] Failed to load settings:', e);
      zoomState.factor = 1.0;
    }
  }

  async function persistSettings() {
    try {
      persistedSettings.zoom = { factor: zoomState.factor, auto: zoomState.auto };
      const tmp = `${SETTINGS_FILE}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(persistedSettings, null, 2), 'utf8');
      try {
        await fsp.rename(tmp, SETTINGS_FILE);
      } catch (err) {
        if (err.code === 'EXDEV') {
          // Cross-device rename — copy then unlink
          await fsp.copyFile(tmp, SETTINGS_FILE);
          await fsp.unlink(tmp).catch(() => {});
        } else {
          try { await fsp.unlink(tmp); } catch (_) {}
          throw err;
        }
      }
    } catch (e) {
      console.error('[Zoom] Failed to save settings:', e);
    }
  }

  function saveSettings() {
    if (saveSettingsTimer) clearTimeout(saveSettingsTimer);
    saveSettingsTimer = setTimeout(() => {
      void persistSettings();
    }, 120);
  }

  function getPersistedSettings() {
    return persistedSettings;
  }

  return { loadSettings, persistSettings, saveSettings, getPersistedSettings };
}

module.exports = { createSettingsIo };
