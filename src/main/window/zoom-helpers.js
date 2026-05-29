/**
 * Mithnah — Zoom Helpers (extracted from main/index.js monolith)
 *
 * Pure functions: getSmartZoomFactor, applyZoom, setGlobalZoom, adjustZoomStep.
 */

const { screen } = require('electron');

// Zoom level table — indexed by step for keyboard +/-
const ZOOM_LEVELS = [0.5, 0.67, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0, 1.05, 1.1, 1.15, 1.2, 1.3, 1.5, 1.75, 2.0];

function getSmartZoomFactor() {
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.workAreaSize;
  const dpr = primary.scaleFactor || 1;

  if (width >= 3840 && height >= 2160) return 1.0;
  if (width >= 2560 && height >= 1440) return 1.0;
  if (width >= 1920 && height >= 1080) return 1.0;
  if (width >= 1366 && height >= 768)  return 1.0;
  return 1.0;
}

function applyZoom(browserWindow, zoomState) {
  if (!browserWindow || browserWindow.isDestroyed()) return;
  try {
    browserWindow.webContents.setZoomFactor(zoomState.factor);
  } catch (err) {
    console.error('[Zoom] apply failed:', err);
  }
}

function setGlobalZoom(factor, isAuto, zoomState, mainWindow, saveSettingsCb) {
  const clamped = Math.max(0.5, Math.min(3.0, factor));
  zoomState.factor = clamped;
  zoomState.auto = !!isAuto;
  if (mainWindow && !mainWindow.isDestroyed()) {
    applyZoom(mainWindow, zoomState);
  }
  saveSettingsCb();
}

function adjustZoomStep(delta, zoomState, mainWindow, saveSettingsCb) {
  const current = zoomState.factor;
  let idx = ZOOM_LEVELS.findIndex(z => z >= current);
  if (idx === -1) idx = ZOOM_LEVELS.length - 1;
  idx = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx + delta));
  setGlobalZoom(ZOOM_LEVELS[idx], false, zoomState, mainWindow, saveSettingsCb);
}

module.exports = {
  ZOOM_LEVELS,
  getSmartZoomFactor,
  applyZoom,
  setGlobalZoom,
  adjustZoomStep
};
