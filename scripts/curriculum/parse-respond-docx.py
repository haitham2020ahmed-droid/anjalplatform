"""
Respond to Reading, Grades 4 & 5 (the school's own "Differentiated Writing Tasks — Units 1–6" Word file)
→ data/curriculum-map/respond-to-reading-g4-g5.json

    python3 -I scripts/curriculum/parse-respond-docx.py <respond.docx> [out.json]

Reads the document in order (paragraphs and tables): for every selection (Grade 4 then Grade 5) its header
(Unit, Text Set, Selection, Genre), the prompt and the three versions —
    BELOW  Word Bank + six fill-in-the-gap sentences (then copied as one paragraph)
    ON     seven Sentence Starters
    ABOVE  independent writing: a success checklist + a Challenge Sentence Starter
— and, from the Teacher Answer Key at the end, the model answer of each level. The school's text is kept
exactly as written (only list numbers "1." and the "✅" marks in front of list items are dropped).
Uses python-docx when installed, else reads word/document.xml from the zip. Validates the counts and exits 1
when anything is missing.
"""
import json, re, sys, zipfile
import xml.etree.ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def blocks_from_xml(path):
    """[("p", style, text) | ("t", rows: [[cell text with \\n between paragraphs]])] in document order."""
    root = ET.fromstring(zipfile.ZipFile(path).read("word/document.xml"))
    body = root.find(f"{W}body")

    def ptext(p):
        out = []
        for el in p.iter():
            if el.tag == f"{W}t": out.append(el.text or "")
            elif el.tag == f"{W}tab": out.append("\t")
            elif el.tag in (f"{W}br", f"{W}cr"): out.append("\n")
        return "".join(out)

    def pstyle(p):
        ps = p.find(f"{W}pPr/{W}pStyle")
        return ps.get(f"{W}val") if ps is not None else ""

    out = []
    for ch in body:
        if ch.tag == f"{W}p":
            out.append(("p", pstyle(ch), ptext(ch)))
        elif ch.tag == f"{W}tbl":
            rows = []
            for tr in ch.findall(f"{W}tr"):
                rows.append(["\n".join(ptext(p) for p in tc.findall(f".//{W}p")) for tc in tr.findall(f"{W}tc")])
            out.append(("t", rows))
    return out


def blocks(path):
    try:
        import docx  # python-docx
        from docx.table import Table
        from docx.text.paragraph import Paragraph
    except ImportError:
        return blocks_from_xml(path)
    d = docx.Document(path)
    out = []
    for ch in d.element.body.iterchildren():
        tag = ch.tag.split("}")[1]
        if tag == "p":
            p = Paragraph(ch, d)
            out.append(("p", p.style.name if p.style is not None else "", p.text))
        elif tag == "tbl":
            rows = []
            for r in Table(ch, d).rows:
                cells = []
                for c in r.cells:
                    if cells and cells[-1][0] is c._tc: continue   # merged cells repeat
                    cells.append((c._tc, c.text))
                rows.append([t for _, t in cells])
            out.append(("t", rows))
    return out


clean = lambda s: re.sub(r"[ \t]+", " ", s.replace(" ", " ")).strip()
unquote = lambda s: re.sub(r'^[“"]+|[”"]+$', "", s.strip())
LEVEL = {"Below Level": "BELOW", "On Level": "ON", "Above Level": "ABOVE"}
HEAD = re.compile(r"Grade (\d)\s*·\s*Unit (\d+)\s*·\s*Text Set (\d+)\s*\nSelection:\s*(.+?)\s*\nGenre:\s*(.+)", re.S)
KEY_HEAD = re.compile(r"Grade (\d)\s*·\s*Unit (\d+)\s*·\s*Text Set (\d+):\s*(.+?)\s*\nPrompt:\s*(.+)", re.S)


def parse(path):
    bl = blocks(path)
    tasks = {}
    cur = None  # (task, level)
    i = 0
    in_key = False
    key_task = None
    while i < len(bl):
        b = bl[i]
        if b[0] == "p" and clean(b[2]).startswith("Teacher Answer Key"):
            in_key = True; cur = None
        if b[0] == "t" and len(b[1]) == 1 and len(b[1][0]) == 2:
            m = HEAD.match(b[1][0][0].strip())
            lv = b[1][0][1].strip().split("\n")
            if m and lv[0].strip() in LEVEL:
                g, u, ts, sel, genre = m.groups()
                code = f"G{g}.U{u}.TS{ts}"
                t = tasks.setdefault(code, {"code": f"{code}.RTR", "grade": int(g), "unit": int(u), "textSet": int(ts), "selection": unquote(clean(sel)), "genre": clean(genre), "prompt": None, "promptNote": None, "levels": {}, "modelAnswers": {}})
                level = LEVEL[lv[0].strip()]
                t["levels"][level] = {"title": clean(lv[1]) if len(lv) > 1 else "", "instructions": [], "wordBank": [], "gapSentences": [], "starters": [], "checklist": [], "challengeStarter": None}
                cur = (t, level)
                i += 1; continue
        # a grade's cover ("Grade 5 · Respond to Reading …") and its list of selections end the previous task
        if (b[0] == "t" and len(b[1]) == 1 and len(b[1][0]) == 1 and re.match(r"^Grade \d\s*\n\s*Respond to Reading", b[1][0][0].strip())) or (b[0] == "p" and re.match(r"^Unit \d+ · Text Set \d+:", clean(b[2]))):
            cur = None; i += 1; continue
        if in_key and b[0] == "t":
            if len(b[1]) == 1 and len(b[1][0]) == 1:
                m = KEY_HEAD.match(b[1][0][0].strip())
                if m:
                    g, u, ts = m.group(1), m.group(2), m.group(3)
                    key_task = tasks.get(f"G{g}.U{u}.TS{ts}")
                    if key_task is None: raise SystemExit(f"answer key for an unknown selection: {b[1][0][0]!r}")
                    key_task["_keyPrompt"] = clean(m.group(5))
            elif key_task is not None:
                for row in b[1]:
                    if len(row) == 2 and row[0].strip() in LEVEL:
                        key_task["modelAnswers"][LEVEL[row[0].strip()]] = clean(row[1])
            i += 1; continue
        if cur and not in_key:
            t, level = cur
            L = t["levels"][level]
            if b[0] == "t":
                txt = b[1][0][0] if b[1] and b[1][0] else ""
                if txt.strip().startswith("Prompt:"):
                    lines = [clean(x) for x in txt.split("\n") if clean(x)]
                    prompt = clean(lines[0][len("Prompt:"):])
                    note = " ".join(lines[1:]) or None
                    if t["prompt"] is None: t["prompt"], t["promptNote"] = prompt, note
                    elif t["prompt"] != prompt: raise SystemExit(f"{t['code']} {level}: the prompt differs from the other levels")
                elif txt.strip().startswith("Challenge Sentence Starter"):
                    L["challengeStarter"] = clean(" ".join(txt.strip().split("\n")[1:]))
                elif L.get("_expect") == "wordbank":
                    L["wordBank"] = [clean(w) for w in re.split(r"\s+[–—]\s+", txt.strip()) if clean(w)]
                    L["_expect"] = None
                # empty writing lines: nothing to keep
            else:
                style, txt = b[1], clean(b[2])
                if not txt or txt.startswith("Name:") or txt == "Differentiated Writing Task: Respond to Reading": pass
                elif txt == "Word Bank": L["_expect"] = "wordbank"
                elif style.replace(" ", "") == "ListParagraph" and level == "BELOW": L["gapSentences"].append(txt)
                elif level == "ON" and re.match(r"^\d+\.\s", txt): L["starters"].append(re.sub(r"^\d+\.\s+", "", txt))
                elif level == "ABOVE" and txt.startswith("✅"): L["checklist"].append(clean(txt.lstrip("✅")))
                elif txt == "My Paragraph:": pass
                else: L["instructions"].append(txt)
        i += 1
    out = []
    for code, t in tasks.items():
        for L in t["levels"].values(): L.pop("_expect", None)
        kp = t.pop("_keyPrompt", None)
        if kp and kp != t["prompt"]: raise SystemExit(f"{code}: the answer key prompt differs: {kp!r} vs {t['prompt']!r}")
        t["levels"] = {k: t["levels"][k] for k in ("BELOW", "ON", "ABOVE") if k in t["levels"]}
        t["modelAnswers"] = {k: t["modelAnswers"][k] for k in ("BELOW", "ON", "ABOVE") if k in t["modelAnswers"]}
        out.append(t)
    return out


def validate(tasks):
    problems = []
    for g in (4, 5):
        mine = [t for t in tasks if t["grade"] == g]
        if not (1 <= len(mine) <= 18): problems.append(f"Grade {g}: {len(mine)} selections (expected up to 18)")
        if sorted({t["unit"] for t in mine}) != [1, 2, 3, 4, 5, 6]: problems.append(f"Grade {g}: units {sorted({t['unit'] for t in mine})}")
    for t in tasks:
        c = t["code"]
        if not t["prompt"]: problems.append(f"{c}: no prompt")
        if list(t["levels"]) != ["BELOW", "ON", "ABOVE"]: problems.append(f"{c}: levels {list(t['levels'])}")
        if list(t["modelAnswers"]) != ["BELOW", "ON", "ABOVE"]: problems.append(f"{c}: model answers {list(t['modelAnswers'])}")
        b, o, a = (t["levels"].get(k, {}) for k in ("BELOW", "ON", "ABOVE"))
        if not b.get("wordBank"): problems.append(f"{c} BELOW: no word bank")
        if len(b.get("gapSentences", [])) != 6: problems.append(f"{c} BELOW: {len(b.get('gapSentences', []))} gap sentences")
        if len(o.get("starters", [])) != 7: problems.append(f"{c} ON: {len(o.get('starters', []))} starters")
        if not a.get("checklist"): problems.append(f"{c} ABOVE: no checklist")
        if not a.get("challengeStarter"): problems.append(f"{c} ABOVE: no challenge starter")
    return problems


if __name__ == "__main__":
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else "data/curriculum-map/respond-to-reading-g4-g5.json"
    tasks = parse(src)
    problems = validate(tasks)
    for p in problems: print("problem:", p)
    doc = {
        "source": "Grades 4 & 5 Respond to Reading — Differentiated Writing Tasks — Units 1–6 (the school's own document)",
        "levels": {
            "BELOW": "Word Bank + Fill in the Gaps: students complete six guided sentences, then copy them as one paragraph.",
            "ON": "Sentence Starters: seven starters that walk students through claim, evidence, explanation and conclusion.",
            "ABOVE": "Independent Writing: a success checklist and a Challenge Sentence Starter for a full paragraph.",
        },
        "tasks": {t["code"].replace(".RTR", ""): t for t in tasks},
    }
    with open(dst, "w", encoding="utf8") as f: json.dump(doc, f, ensure_ascii=False, indent=1); f.write("\n")
    per = {g: sum(1 for t in tasks if t["grade"] == g) for g in (4, 5)}
    print(f"Grade 4: {per[4]} selections · Grade 5: {per[5]} selections · {len(tasks) * 3} level tasks · {sum(len(t['modelAnswers']) for t in tasks)} model answers → {dst}")
    sys.exit(1 if problems else 0)
