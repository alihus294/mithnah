/**
 * Mithnah — Window Manager (extracted from main/index.js monolith)
 *
 * Creates and manages the main BrowserWindow with security hardening,
 * zoom management, and remote-control state broadcasting.
 */

const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const url = require('url');

// ── Zoom helpers ───────────────────────────────────────────────────────────

function getZoomFactor() {
  return mainWindow?.webContents?.getZoomFactor?.() ?? 1;
}

function setZoomFactor(factor) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.setZoomFactor(factor);
  mainWindow.webContents.send('zoom-changed', factor);
}

// ── State ──────────────────────────────────────────────────────────────────

let mainWindow = null;

// ── Window creation ────────────────────────────────────────────────────────

function createWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

  mainWindow = new BrowserWindow({
    title: 'Mithnah',
    fullscreen: true,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    titleBarOverlay: {
      color: '#0a0a0a',
      symbolColor: '#ffffff',
      height: 0
    },
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webSecurity: true
    },
    show: false,
    backgroundColor: '#0a0a0a'
  });

  // Load renderer
  const startUrl = process.env.ELECTRON_START_URL || url.format({
    pathname: path.join(__dirname, '../../../dist/renderer/index.html'),
    protocol: 'file:',
    slashes: true
  });
  mainWindow.loadURL(startUrl);

  // Show when ready to avoid visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.env.ELECTRON_START_URL) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Security: block new-window requests, force external links to OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    const { shell } = require('electron');
    const parsed = new URL(targetUrl);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      shell.openExternal(targetUrl);
    }
    return { action: 'deny' };
  });

  // Zoom IPC handlers (local to this window) — removed; now handled by ipc-handlers.js
  // with frame-guard protection.

  // Cleanup on close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// ── Accessors ──────────────────────────────────────────────────────────────

function getMainWindow() {
  return mainWindow;
}

function isMainWindowFocused() {
  return mainWindow?.isFocused() ?? false;
}

// ── Exports ────────────────────────────────────────────────────────────────

module.exports = {
  createWindow,
  getMainWindow,
  isMainWindowFocused,
  getZoomFactor,
  setZoomFactor
};
