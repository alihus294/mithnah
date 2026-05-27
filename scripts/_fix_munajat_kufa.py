import sqlite3, json, os, re

DB_PATH  = r"C:\Users\Ali\Desktop\mafatih_scrape\mafatih.db"
DATA_DIR = r"C:\Users\Ali\Coding projects\mithnah\src\main\shia-content\data"

CHAR_MAP = {"ٲ":"أ","ٳ":"إ","ھ":"ه","ہ":"ه","ۃ":"ة","ی":"ي","ک":"ك","ﷲ":"الله"}
IZAFA_RE   = re.compile("ئے")
HONORIC_RE = re.compile("[ِّ]")

def norm(t):
    if not t: return ""
    for s, d in CHAR_MAP.items():
        t = t.replace(s, d)
    return t.strip()

def clean_title(t):
    t = norm(t or "")
    t = IZAFA_RE.sub("ء", t)
    t = HONORIC_RE.sub("", t)
    return t.strip()

conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row

lines = conn.execute(
    'SELECT l.arabic FROM pages p JOIN content_blocks cb ON cb.page_id=p.id '
    'JOIN lines l ON l.block_id=cb.id '
    'WHERE p.href="/munajat-kufa" AND l.arabic IS NOT NULL AND l.arabic != "" '
    'ORDER BY cb.sort_order, l.sort_order'
).fetchall()

page  = conn.execute('SELECT * FROM pages WHERE href="/munajat-kufa"').fetchone()
title = clean_title(page["title"])

slides = [{"kind": "title", "ar": title, "subtitle": "الأدعية والمناجات"}]
for row in lines:
    ar = norm(row["arabic"])
    if ar:
        slides.append({"kind": "text", "ar": ar})

dua = {
    "id": "munajat-kufa",
    "title": title,
    "subtitle": "الأدعية والمناجات",
    "source": "مفاتيح الجنان",
    "fiqh": "shia",
    "slides": slides,
}

out = os.path.join(DATA_DIR, "munajat-kufa.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump(dua, f, ensure_ascii=False, indent=2)

print(f"munajat-kufa: {len(lines)} lines written")
conn.close()
