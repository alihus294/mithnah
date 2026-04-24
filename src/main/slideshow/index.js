// Presenter-style slideshow state machine. Models a live presentation:
// one deck is loaded at a time (a dua, ziyarah, or taqib — all share the
// same slide shape), then the user pages through slides via a physical
// remote (Logitech R400 / Spotlight / any HID presenter), on-screen
// shortcuts (← → PageUp/PageDown Space B .), or the mobile-control app.
//
// The state lives in the main process (single source of truth) and is
// pushed to every connected surface via IPC + socket.io — so the wall
// display and the operator's phone always agree on what slide is showing.
//
// Commands follow the Logitech presenter convention:
//   NEXT       → advance one slide (like PageDown / →)
//   PREV       → back one slide  (like PageUp / ←)
//   FIRST      → jump to slide 0 (like Home)
//   LAST       → jump to last slide (like End)
//   GOTO       → jump to an explicit 0-indexed slide number
//   BLANK      → toggle a full-screen black overlay (like B / .)
//   CLOSE      → end the presentation (like Esc)
//   OPEN       → load a deck by { kind: 'dua'|'ziyarah'|'taqib'|'custom', id } and reset to slide 0

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const listeners = new Set();

function freshState() {
  return {
    active: false,
    deck: null,      // { kind, id, title, subtitle, source, fiqh }
    slides: [],      // array of slide objects (each has kind, ar, heading, ...)
    index: 0,
    blanked: false,
    updatedAt: 0
  };
}

let state = freshState();

// Optional persistence — the caretaker can recover from a crash mid-dua
// (e.g., power cut) and the wall resumes on the same slide without
// having to re-open the deck.
//
// IMPORTANT: We persist ONLY the lightweight position pointer
// ({active, deck, index, blanked}) — NOT the slides themselves. Slides
// are reconstructed at restore time by re-opening the deck via the
// registered reopen() callback (injected from main/index.js). This
// avoids writing ~120 KB per key press for long decks like Du'a Arafa
// (623 slides); the pointer is ~200 bytes.
let _stateFile = null;
let _reopenDeck = null; // (kind, id) → deck|null

function init(stateFile, reopenDeck) {
  _stateFile = stateFile || null;
  _reopenDeck = typeof reopenDeck === 'function' ? reopenDeck : null;
  if (!_stateFile) return;
  try {
    if (!fs.existsSync(_stateFile)) return;
    const raw = fs.readFileSync(_stateFile, 'utf8');
    const restored = JSON.parse(raw);
    // Basic shape guard — a hand-edited file shouldn't crash the app.
    if (!restored || typeof restored !== 'object') return;
    if (!restored.active || !restored.deck) return; // nothing useful to restore

    // Custom decks (kind='custom') carry their slides inline in the
    // persisted pointer — the registry doesn't know about user content,
    // so we can't reopen them by id. Everything else re-resolves
    // through the shia-content registry so stale disk data doesn't
    // linger after content upgrades.
    let freshDeck = null;
    if (restored.deck.kind === 'custom' && Array.isArray(restored.slides)) {
      freshDeck = {
        kind: 'custom',
        id: restored.deck.id,
        title: restored.deck.title,
        subtitle: restored.deck.subtitle,
        source: restored.deck.source,
        fiqh: restored.deck.fiqh || 'shia',
        slides: restored.slides,
      };
    } else if (_reopenDeck && restored.deck.kind && restored.deck.id) {
      try { freshDeck = _reopenDeck(restored.deck.kind, restored.deck.id); }
      catch (_) { freshDeck = null; }
    }
    if (!freshDeck || !Array.isArray(freshDeck.slides) || freshDeck.slides.length === 0) return;
    state = {
      active: true,
      deck: {
        kind:     freshDeck.kind     || restored.deck.kind,
        id:       freshDeck.id       || restored.deck.id,
        title:    freshDeck.title    || restored.deck.title || '',
        subtitle: freshDeck.subtitle || restored.deck.subtitle || '',
        source:   freshDeck.source   || restored.deck.source || '',
        fiqh:     freshDeck.fiqh     || 'shia'
      },
      slides: freshDeck.slides,
      index: Math.max(0, Math.min(freshDeck.slides.length - 1, Number(restored.index) || 0)),
      blanked: restored.blanked === true,
      updatedAt: Date.now()
    };
  } catch (err) {
    console.warn('[slideshow] restore failed:', err.message);
  }
}

function persistAsync() {
  if (!_stateFile) return;
  // Only serialize the lightweight pointer, not the slide content —
  // EXCEPT for kind='custom' decks, whose slides the shia-content
  // registry can't re-materialize on restore. For custom decks we
  // include the full `slides` so resume-after-crash works; it's at
  // most ~20 KB even for a long dua and only grows while a custom
  // deck is actively open.
  const pointer = {
    active: state.active,
    deck: state.deck ? { kind: state.deck.kind, id: state.deck.id, title: state.deck.title, subtitle: state.deck.subtitle, source: state.deck.source, fiqh: state.deck.fiqh } : null,
    slides: state.deck && state.deck.kind === 'custom' ? state.slides : undefined,
    index: state.index,
    blanked: state.blanked,
    updatedAt: state.updatedAt
  };
  // Atomic write: tmp file + rename, mirroring prayer-times/config.js.
  // A power cut mid-write previously left a truncated state file that
  // silently lost the resume point on next boot. Tmp name is unique
  // per call so concurrent writers don't collide on `.tmp`.
  const tmp = `${_stateFile}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.promises.writeFile(tmp, JSON.stringify(pointer), 'utf8')
    .then(() => fs.promises.rename(tmp, _stateFile))
    .then(() => {
      _lastPersistError = null;
    })
    .catch((err) => {
      // Log it — the silent-drop pattern previously meant a caretaker
      // scrolled to slide 450 of Dua Arafa, lost power, and came back
      // to slide 0 with no indication anything was wrong. Now the
      // error is visible in the main-process log so a future field
      // report can be correlated to a disk/permission failure. The
      // state remains in memory so the live UI is unaffected; only
      // the resume-after-crash path is hobbled.
      console.error('[slideshow] persist failed:', err && err.message ? err.message : err);
      _lastPersistError = { at: Date.now(), message: err && err.message ? String(err.message) : 'unknown' };
      // Best-effort tmp cleanup so repeated failures don't pile tmp files.
      fs.promises.unlink(tmp).catch(() => {});
    });
}
// Module-level surface so a future IPC handler / health check can
// ask "is slideshow state persisting correctly?" without touching
// the file system.
let _lastPersistError = null;

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function snapshot() {
  return JSON.parse(JSON.stringify(state));
}

function emit() {
  state.updatedAt = Date.now();
  const frozen = snapshot();
  for (const fn of listeners) {
    try { fn(frozen); } catch (err) { console.error('[slideshow] listener failed:', err); }
  }
  persistAsync();
}

function open(deck) {
  if (!deck || !Array.isArray(deck.slides) || deck.slides.length === 0) {
    throw new Error('slideshow.open: deck must have non-empty `slides` array');
  }
  state = {
    active: true,
    deck: {
      kind:     deck.kind     || 'custom',
      id:       deck.id       || 'custom',
      title:    deck.title    || '',
      subtitle: deck.subtitle || '',
      source:   deck.source   || '',
      fiqh:     deck.fiqh     || 'shia'
    },
    slides: deck.slides,
    index: 0,
    blanked: false,
    updatedAt: 0
  };
  emit();
  return snapshot();
}

function close() {
  state = freshState();
  emit();
  return snapshot();
}

function goto(index) {
  if (!state.active) return snapshot();
  const n = Number(index);
  if (!Number.isInteger(n)) throw new Error('slideshow.goto: index must be an integer');
  state.index = Math.max(0, Math.min(state.slides.length - 1, n));
  state.blanked = false;
  emit();
  return snapshot();
}

function next()  { return goto(state.index + 1); }
function prev()  { return goto(state.index - 1); }
function first() { return goto(0); }
function last()  { return goto(state.slides.length - 1); }

function blank(on) {
  if (!state.active) return snapshot();
  state.blanked = (typeof on === 'boolean') ? on : !state.blanked;
  emit();
  return snapshot();
}

function getState() { return snapshot(); }

// Command dispatcher — used by the IPC layer, the main-window keyboard
// shortcut handler, and the mobile-control socket so every input path goes
// through the same branch table. OPEN is accepted internally but the
// public APIs (Express + IPC) restrict callers to nav-only commands so
// arbitrary deck content can't be pushed via a hand-crafted payload;
// curated decks flow through `openShia(kind, id)` instead.
function dispatch(command, payload = {}) {
  switch (command) {
    case 'OPEN':  return open(payload.deck);
    case 'CLOSE': return close();
    case 'NEXT':  return next();
    case 'PREV':  return prev();
    case 'FIRST': return first();
    case 'LAST':  return last();
    case 'GOTO':  return goto(payload.index);
    case 'BLANK': return blank(payload.on);
    default:
      throw new Error(`Unknown slideshow command: ${command}`);
  }
}

module.exports = { init, subscribe, getState, dispatch, open, close, next, prev, first, last, goto, blank };
