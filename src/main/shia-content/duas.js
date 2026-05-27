// Shia dua registry — each dua lives in its own JSON file under
// ./data/<id>.json. This keeps the Arabic text (verified against
// mafatih.duas.co) cleanly separated from code so the imam can edit
// a single file without touching JavaScript.
//
// Order matters for display (F4 picker). Modify the ORDER array below
// to re-order.

const fs = require('fs');
const path = require('path');
const { chunkSlides } = require('./chunker');

const DATA_DIR = path.join(__dirname, 'data');
const ORDER = [
  'kumayl',
  'faraj',
  'ahd',
  'tawassul',
  'sabah',
  'iftitah',
  'munajat-shabaniya',
  'nudbah',
  'samat',
  'abu-hamza',
  'arafah',
  'jawshan-saghir',
  // أدعية الأيام السبعة (من مفاتيح الجنان)
  'yawm-sabt',
  'yawm-ahad',
  'yawm-ithnayn',
  'yawm-thulatha',
  'yawm-arbiaa',
  'yawm-khamis',
  'yawm-jumua',
  // أدعية أخرى من مفاتيح الجنان
  'mashlool',
  'makarem',
  'mujeer',
  'adeela',
  'asharat',
  // المناجاة الخمس عشرة للإمام السجاد عليه السلام
  'munajat-1-taibeen',
  'munajat-2-shakin',
  'munajat-3-khaifin',
  'munajat-4-rajin',
  'munajat-5-raghibin',
  'munajat-6-shakirin',
  'munajat-7-mutiin',
  'munajat-8-muridin',
  'munajat-9-muhibbin',
  'munajat-10-mutawassilin',
  'munajat-11-muftaqirin',
  'munajat-12-arifin',
  'munajat-13-zakirin',
  'munajat-14-mutasimin',
  'munajat-15-zahidin',
  'munajat-kufa',
];

// Each dua load is isolated — one malformed JSON file must not prevent
// the app from booting. We log the failure and fall back to a minimal
// placeholder deck so the caretaker can still open the app and notice
// that a specific dua is missing (clear message on the slide).
function load(id) {
  const file = path.join(DATA_DIR, `${id}.json`);
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Group consecutive single-line `text` slides into multi-line
    // pages — the source data is 1 verse per slide (for fine-grained
    // editing), but the wall display reads much better with 4 lines
    // per page. Titles, section markers, and notes stay standalone
    // so their emphasis isn't lost.
    return { ...raw, slides: chunkSlides(raw.slides || []) };
  } catch (err) {
    console.error(`[shia-content] failed to load ${id}.json: ${err.message}`);
    return {
      id,
      title: id,
      subtitle: '',
      source: '',
      fiqh: 'shia',
      slides: [
        { kind: 'title', ar: id, subtitle: '' },
        { kind: 'text',  ar: `تعذّر تحميل هذا الدعاء — الملف ${id}.json غير صالح. راجع سجل التطبيق.` }
      ]
    };
  }
}

const ALL = ORDER.map(load);

module.exports = { ALL };
