#!/usr/bin/env python3
"""
normalize-db.py
Reads mafatih.db and regenerates JSON files for all content pages.

What it does:
  - Normalizes Urdu-script Arabic to standard Arabic (ی→ي, ھ→ه, ﷲ→الله, etc.)
  - Derives an Arabic-leaning title from the page title (Urdu izafa cleanup)
  - Uses section name as subtitle
  - Skips the 50 manually-curated legacy files (already have correct Arabic)
  - Overwrites any existing DB-generated files with clean versions

Usage:
  python scripts/normalize-db.py
"""

import sqlite3
import json
import os
import re
import sys

DB_PATH   = r"C:\Users\Ali\Desktop\mafatih_scrape\mafatih.db"
DATA_DIR  = r"C:\Users\Ali\Coding projects\mithnah\src\main\shia-content\data"

# Manually-curated files — do NOT overwrite these
LEGACY_IDS = {
    'kumayl', 'faraj', 'ahd', 'tawassul', 'sabah', 'iftitah',
    'munajat-shabaniya', 'nudbah', 'samat', 'abu-hamza', 'arafah',
    'jawshan-saghir', 'yawm-sabt', 'yawm-ahad', 'yawm-ithnayn',
    'yawm-thulatha', 'yawm-arbiaa', 'yawm-khamis', 'yawm-jumua',
    'mashlool', 'makarem', 'mujeer', 'adeela', 'asharat',
    'munajat-1-taibeen', 'munajat-2-shakin', 'munajat-3-khaifin',
    'munajat-4-rajin', 'munajat-5-raghibin', 'munajat-6-shakirin',
    'munajat-7-mutiin', 'munajat-8-muridin', 'munajat-9-muhibbin',
    'munajat-10-mutawassilin', 'munajat-11-muftaqirin',
    'munajat-12-arifin', 'munajat-13-zakirin', 'munajat-14-mutasimin',
    'munajat-15-zahidin', 'munajat-kufa', 'yastashir',
    'dua-faraj-hujjat', 'salawat-imam-zaman', 'salawat-14',
    'dua-sahar', 'sunday-ziyarah', 'monday-ziyarah',
    'tuesday-ziyarah', 'wednesday-ziyarah', 'thursday-ziyarah',
    'saturday-ziyarah',
}

# ── Arabic character normalization ──────────────────────────────────────────
# Map Urdu/Perso-Arabic Unicode variants to standard Arabic codepoints.
CHAR_MAP = {
    'ٲ': 'أ',    # ٲ → أ  (modifier letter small alef)
    'ٳ': 'إ',    # ٳ → إ
    'ھ': 'ه',    # ھ → ه  (Urdu he dochashmi)
    'ہ': 'ه',    # ہ → ه  (Urdu he goal)
    'ۃ': 'ة',    # ۃ → ة  (Urdu ta marbuta)
    'ی': 'ي',    # ی → ي  (Farsi/Urdu ya)
    'ک': 'ك',    # ک → ك  (Urdu kaf)
    'ﷲ': 'الله', # ﷲ → الله (ligature)
    'ك': 'ك',    # ك stays (already correct, included for completeness)
}

def normalize_arabic(text: str) -> str:
    if not text:
        return ''
    for src, dst in CHAR_MAP.items():
        text = text.replace(src, dst)
    return text.strip()

# ── Title cleanup ─────────────────────────────────────────────────────────
# Urdu Izafa "ئے" suffix (e.g. دعائے → دعاء) and stray honorific glyphs.
_IZAFA_RE  = re.compile(r'ئے')
_HONORIC_RE = re.compile(r'[ؑؐ]')  # superscript ain / hamza used as honorifics

def clean_title(text: str) -> str:
    if not text:
        return ''
    text = normalize_arabic(text)
    text = _IZAFA_RE.sub('ء', text)
    text = _HONORIC_RE.sub('', text)
    return text.strip()

# ── Section → readable Arabic subtitle ───────────────────────────────────
SECTION_AR = {
    1: 'مقدمة الكتاب',
    2: 'السور القرآنية المخصوصة',
    3: 'تعقيبات الصلاة',
    4: 'الأدعية والمناجات',
    5: 'الأعمال',
    6: 'زيارات المعصومين',
    7: 'ملحقات مفاتيح الجنان',
    8: 'باقيات الصالحات',
}

# ── Main ──────────────────────────────────────────────────────────────────
def main():
    if not os.path.exists(DB_PATH):
        print(f"ERROR: DB not found at {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    pages = conn.execute("""
        SELECT p.id, p.title, p.href, p.section_id
        FROM pages p
        WHERE EXISTS (
            SELECT 1 FROM content_blocks cb
            JOIN lines l ON l.block_id = cb.id
            WHERE cb.page_id = p.id
              AND l.arabic IS NOT NULL AND l.arabic != ''
        )
        ORDER BY p.section_id, p.sort_order
    """).fetchall()

    written = skipped_legacy = skipped_empty = 0

    for page in pages:
        page_id = page['href'].lstrip('/')

        if page_id in LEGACY_IDS:
            skipped_legacy += 1
            continue

        lines = conn.execute("""
            SELECT l.arabic
            FROM content_blocks cb
            JOIN lines l ON l.block_id = cb.id
            WHERE cb.page_id = ?
              AND l.arabic IS NOT NULL AND l.arabic != ''
            ORDER BY cb.sort_order, l.sort_order
        """, (page['id'],)).fetchall()

        if not lines:
            skipped_empty += 1
            continue

        title    = clean_title(page['title'] or page_id)
        subtitle = SECTION_AR.get(page['section_id'], '')

        slides = [{"kind": "title", "ar": title, "subtitle": subtitle}]
        for row in lines:
            ar = normalize_arabic(row['arabic'])
            if ar:
                slides.append({"kind": "text", "ar": ar})

        dua = {
            "id":       page_id,
            "title":    title,
            "subtitle": subtitle,
            "source":   "مفاتيح الجنان",
            "fiqh":     "shia",
            "slides":   slides,
        }

        out_path = os.path.join(DATA_DIR, f"{page_id}.json")
        with open(out_path, 'w', encoding='utf-8') as f:
            json.dump(dua, f, ensure_ascii=False, indent=2)
        written += 1

    conn.close()
    print(f"Done — written: {written}  |  skipped legacy: {skipped_legacy}  |  skipped empty: {skipped_empty}")

if __name__ == '__main__':
    main()
