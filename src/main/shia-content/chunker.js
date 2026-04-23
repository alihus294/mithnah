// Group consecutive single-line `text` slides into multi-line pages so
// the wall displays 4–6 readable lines per slide instead of 1. The
// operator advances whole pages with the arrow key, which is MUCH less
// tiring for the congregation than a single-line teleprompter pace.
//
// Heuristics:
//   - Only consecutive `kind: 'text'` slides are merged. Titles,
//     section markers, and ritual notes stay standalone so their
//     layout and emphasis are preserved.
//   - Each merged page has a max line count (default 4) AND a max
//     character budget (default 280). The whichever-fires-first rule
//     stops a page from overflowing on a slide with very long verses.
//   - `\n` delimits the merged lines inside `ar`, which is exactly
//     what SlideshowOverlay already splits on.
//
// Source order is preserved — we never reorder or drop content.

// Defaults picked for elderly readability on a wall display. The
// operator explicitly asked for larger text, so we paginate fewer
// lines per page and let each line render bigger. At the new base
// font size (clamp up to 110px) and line-height 1.7, two lines use
// ~370px of the body row, leaving plenty of margin.
//
// An earlier build used 3 / 220; that was tuned for a 66px font
// cap with line-height 1.55 and is too dense when the font grows.
const DEFAULT_MAX_LINES = 2;
const DEFAULT_MAX_CHARS = 160;

function chunkSlides(slides, opts = {}) {
  if (!Array.isArray(slides) || slides.length === 0) return slides || [];
  const maxLines = opts.maxLines || DEFAULT_MAX_LINES;
  const maxChars = opts.maxChars || DEFAULT_MAX_CHARS;

  const out = [];
  let buffer = null; // { lines: string[], chars: number }

  const flush = () => {
    if (!buffer || buffer.lines.length === 0) return;
    out.push({ kind: 'text', ar: buffer.lines.join('\n') });
    buffer = null;
  };

  for (const slide of slides) {
    if (!slide || slide.kind !== 'text') {
      flush();
      out.push(slide);
      continue;
    }
    const line = String(slide.ar || '').trim();
    if (!line) continue;
    // Count the longest line in the slide (it may itself be multi-line
    // already if the source file used `\n`). We treat each \n-separated
    // line individually for the budget check.
    const incomingLines = line.split('\n').map(l => l.trim()).filter(Boolean);
    for (const l of incomingLines) {
      const wouldExceedLines = buffer && buffer.lines.length + 1 > maxLines;
      const wouldExceedChars = buffer && buffer.chars + l.length + 1 > maxChars;
      if (wouldExceedLines || wouldExceedChars) flush();
      if (!buffer) buffer = { lines: [], chars: 0 };
      buffer.lines.push(l);
      buffer.chars += l.length + 1;
    }
  }
  flush();
  return out;
}

module.exports = { chunkSlides, DEFAULT_MAX_LINES, DEFAULT_MAX_CHARS };
