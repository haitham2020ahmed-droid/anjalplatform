#!/usr/bin/env python3
"""
Extracts Grade 4, 5 and 6 standards (code + full text) from the school's
CCSS ELA PDF (pdftotext -layout output). The PDF prints three grades side by
side; columns are sliced at the x-positions of the "Grade N students:" headers.

Usage: python3 parse_ccss.py <ccss_layout.txt> <out.json>
Codes: CCSS.ELA-LITERACY.<STRAND>.<GRADE>.<n>[.<letter>]
"""
import json, re, sys

src, out = sys.argv[1], sys.argv[2]
pages = open(src, encoding="utf-8", errors="ignore").read().split("\f")

STRANDS = [
    (r"Reading Standards for Literature", "RL"),
    (r"Reading Standards for Informational Text", "RI"),
    (r"Reading Standards: Foundational Skills", "RF"),
    (r"Writing Standards", "W"),
    (r"Speaking and Listening Standards", "SL"),
    (r"Language Standards", "L"),
]
WANT = {4, 5, 6}
standards = {}

def strand_of(page):
    head = "\n".join(page.split("\n")[:12])
    if "History/Social Studies" in head and "Literacy in" in head and "Standards for Literacy" in head:
        return None
    for rx, code in STRANDS:
        if re.search(rx, head):
            return code
    return None

for page in pages:
    strand = strand_of(page)
    if not strand:
        continue
    lines = page.split("\n")
    hdr_i = next((i for i, l in enumerate(lines) if re.search(r"Grade \d students:", l)), None)
    if hdr_i is None:
        continue
    hdr = lines[hdr_i]
    cols = [(m.start(), int(m.group(1))) for m in re.finditer(r"Grade (\d+) students:", hdr)]
    if not any(g in WANT for _, g in cols):
        continue
    # column boundaries: start a bit left of each header (numbers sit left of header text)
    # where do item numbers ("1.   ", "a.   ") actually start in each column?
    starts = []
    for l in lines[hdr_i + 1:]:
        for m in re.finditer(r"(?:(?<=\s)|^)(?:\d{1,2}|[a-g])\.\s{2,}\S", l):
            starts.append(m.start())
    def col_start(hx):
        near = [x for x in starts if hx - 30 <= x <= hx + 2]
        return min(near) if near else hx - 16
    xs = [col_start(x) for x, _ in cols]
    bounds = []
    for i, (_, g) in enumerate(cols):
        left = 0 if i == 0 else xs[i] - 1
        right = xs[i + 1] - 1 if i + 1 < len(cols) else 10_000
        bounds.append((left, right, g))
    for left, right, g in bounds:
        if g not in WANT:
            continue
        text = "\n".join(l[left:right] for l in lines[hdr_i + 1:])
        cur_num, cur_letter = None, None
        for raw in text.split("\n"):
            s = raw.strip()
            if not s or re.fullmatch(r"\|?\d*", s):
                continue
            m = re.match(r"^(\d{1,2})\.\s+(.*)", s)
            ml = re.match(r"^([a-g])\.\s+(.*)", s)
            if m and 1 <= int(m.group(1)) <= 10:
                cur_num, cur_letter = int(m.group(1)), None
                key = f"{strand}.{g}.{cur_num}"
                standards[key] = standards.get(key, "") + " " + m.group(2)
            elif ml and cur_num:
                cur_letter = ml.group(1)
                key = f"{strand}.{g}.{cur_num}.{cur_letter}"
                standards[key] = ml.group(2)
            elif cur_num:
                # skip cluster headings (Title Case lines without terminal punctuation are headings)
                if re.match(r"^(Key Ideas|Craft and|Integration of|Range of|range of|Phonics|Fluency|Text Types|Production and|Research to|Comprehension and|Presentation of|Conventions of|Knowledge of|Vocabulary Acquisition)", s, re.I):
                    cur_num, cur_letter = None, None
                    continue
                key = f"{strand}.{g}.{cur_num}" + (f".{cur_letter}" if cur_letter else "")
                standards[key] = standards.get(key, "") + " " + s

clean = {}
for k, v in standards.items():
    v = re.sub(r"\s+", " ", v).strip()
    v = re.sub(r"(\w)- (\w)", r"\1\2", v)
    clean["CCSS.ELA-LITERACY." + k] = v
json.dump(dict(sorted(clean.items())), open(out, "w"), indent=1, ensure_ascii=False)
by = {}
for k in clean:
    s, g = k.split(".")[2], k.split(".")[3]
    by.setdefault(g, {}).setdefault(s, 0)
    by[g][s] += 1
print(len(clean), "standards", by)
