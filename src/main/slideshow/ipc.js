const slideshow = require('./index');
const shia = require('../shia-content');
const { chunkSlides } = require('../shia-content/chunker');
const { requireMainWindow } = require('../frame-guard');

const CHANNELS = {
  getState:   'slideshow:get-state',
  command:    'slideshow:command',
  openShia:   'slideshow:open-shia',
  openCustom: 'slideshow:open-custom'
};

// Navigation-only commands exposed via IPC. OPEN is deliberately excluded —
// callers that want to start a deck must go through `openShia` with a
// { kind, id } selector that resolves against the curated shia-content
// registry. This prevents a malicious IPC caller from pushing arbitrary
// text onto the wall display via an OPEN command with a hand-crafted deck.
const SLIDESHOW_COMMANDS = ['NEXT', 'PREV', 'FIRST', 'LAST', 'GOTO', 'BLANK', 'CLOSE'];

function register(ipcMain, logger = console) {
  ipcMain.handle(CHANNELS.getState, () => ({ ok: true, data: slideshow.getState() }));

  // PRIVILEGED — slideshow commands push content onto the wall and
  // can BLANK / CLOSE the deck the congregation is currently reading.
  // The mobile-control HTTP plane has its own PIN-gated route for the
  // same operation; this guard covers the IPC path.
  ipcMain.handle(CHANNELS.command, requireMainWindow((_event, { command, payload } = {}) => {
    try {
      if (!SLIDESHOW_COMMANDS.includes(command)) {
        return { ok: false, error: `Unknown command: ${command}` };
      }
      return { ok: true, data: slideshow.dispatch(command, payload || {}) };
    } catch (err) {
      logger.error('[slideshow] command failed:', err);
      return { ok: false, error: err.message };
    }
  }));

  // Convenience: open a Shia-content deck by kind+id without the caller
  // having to fetch it first. The most common flow from the mobile-control
  // UI is "tap a dua name → load it on the main screen".
  ipcMain.handle(CHANNELS.openShia, requireMainWindow((_event, { kind, id } = {}) => {
    try {
      let deck = null;
      if (kind === 'dua')     deck = shia.getDua(id);
      else if (kind === 'ziyarah') deck = shia.getZiyarah(id);
      else if (kind === 'taqib')   deck = (shia.listTaqibat().find(t => t.id === id) || null);
      else if (kind === 'tasbih-zahra') {
        const t = shia.getTasbihZahra();
        // One page, three phrases with their counts — the full tasbih
        // visible at once, because the congregation counts along and
        // doesn't want to tap through slides between the three phrases.
        const arabicDigit = (n) => String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
        const combined = t.phrases
          .map((p) => `${arabicDigit(p.count)} × ${p.phrase}`)
          .join('\n');
        deck = {
          kind: 'tasbih',
          id: t.id,
          title: t.title,
          subtitle: t.subtitle,
          source: t.source,
          fiqh: 'shia',
          slides: [
            { kind: 'title', ar: t.title, subtitle: t.subtitle },
            { kind: 'text',  ar: combined }
          ]
        };
      }
      if (!deck) return { ok: false, error: `Unknown deck: ${kind}/${id}` };
      // shia-content returns frozen objects — can't mutate in place.
      const openable = { ...deck, kind };
      return { ok: true, data: slideshow.dispatch('OPEN', { deck: openable }) };
    } catch (err) {
      logger.error('[slideshow] openShia failed:', err);
      return { ok: false, error: err.message };
    }
  }));

  // Operator-authored "custom" dua. The renderer hands us a title + body
  // (entered in the F4 picker's inline editor, stored in localStorage).
  // We paginate it with the same chunker the curated content uses so it
  // looks and behaves identically — same font, same 3-line pages, same
  // keyboard / remote / phone controls, same persistent resume.
  //
  // Privileged because any OPEN command pushes text onto the wall; the
  // frame guard restricts callers to the trusted main window renderer.
  ipcMain.handle(CHANNELS.openCustom, requireMainWindow((_event, payload = {}) => {
    try {
      const title = typeof payload.title === 'string' ? payload.title.trim().slice(0, 200) : '';
      const body  = typeof payload.body  === 'string' ? payload.body.trim().slice(0, 20000) : '';
      const id    = typeof payload.id    === 'string' ? payload.id.slice(0, 80) : '';
      if (!title || !body) return { ok: false, error: 'title and body required' };
      // One line per raw newline → then chunker groups into ≤3-line pages.
      const rawSlides = body.split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((ar) => ({ kind: 'text', ar }));
      if (rawSlides.length === 0) return { ok: false, error: 'empty body' };
      const slides = [
        { kind: 'title', ar: title, subtitle: 'دعاء مضاف من القائم' },
        ...chunkSlides(rawSlides)
      ];
      const deck = {
        kind: 'custom',
        id: id || `custom:${Date.now()}`,
        title,
        subtitle: '',
        source: typeof payload.source === 'string' ? payload.source.slice(0, 120) : 'مضاف من القائم',
        fiqh: 'shia',
        slides
      };
      return { ok: true, data: slideshow.dispatch('OPEN', { deck }) };
    } catch (err) {
      logger.error('[slideshow] openCustom failed:', err);
      return { ok: false, error: err.message };
    }
  }));
}

module.exports = { register, CHANNELS, SLIDESHOW_COMMANDS };
