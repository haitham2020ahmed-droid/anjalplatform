#!/usr/bin/env python3
"""
Builds data/questions/bank.json (+ a teacher review CSV) from the authored
sources in data/questions/src/, and validates every item. Exits non-zero on
any error, so CI blocks a broken bank.

Usage: python3 data/questions/build_bank.py
"""
import csv, hashlib, json, sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent / "src"))
import qb  # noqa: E402
import grade4, grade5, grade6, extremes  # noqa: E402,F401  (authoring modules register items)

OFFICIAL = json.load(open(ROOT / "data/curriculum/ccss-standards.json"))
TAX = json.load(open(ROOT / "data/curriculum/taxonomy.json"))
FAMILY_NAMES = {f["code"]: f["name"] for f in TAX["families"]}


def families_in_grade(g):
    d = json.load(open(ROOT / f"data/curriculum/grade-{g}.json"))
    fams = set()
    for u in d["units"]:
        for l in u["lessons"]:
            fams.update(s["familyCode"] for s in l["skills"])
        fams.update(s["familyCode"] for s in u.get("unitSkills", []))
        fams.update(w["familyCode"] for w in u.get("writing", []))
    return fams


GRADE_FAMS = {g: families_in_grade(g) for g in (4, 5, 6)}
LEVEL_TO_B = {1: -2.25, 2: -1.5, 3: -0.75, 4: 0.0, 5: 0.75, 6: 1.5, 7: 2.25}

errors = []
passages = {p["id"]: p for p in qb.PASSAGES}
refs = Counter(i["ref"] for i in qb.ITEMS)
for r, n in refs.items():
    if n > 1:
        errors.append(f"duplicate ref {r}")

key_positions = Counter()
rotation = Counter()
for it in qb.ITEMS:
    where = it["ref"]
    g = it["grade"]
    if it["standard"] not in OFFICIAL:
        errors.append(f"{where}: standard {it['standard']} not in official CCSS text")
    elif int(it["standard"].split(".")[3]) != g:
        errors.append(f"{where}: standard {it['standard']} is not a Grade {g} standard")
    if it["family"] not in GRADE_FAMS[g]:
        errors.append(f"{where}: skill family '{it['family']}' is not in the Grade {g} curriculum")
    if not 1 <= it["level"] <= 7:
        errors.append(f"{where}: level {it['level']} out of range")
    if it["passage"] and it["passage"] not in passages:
        errors.append(f"{where}: unknown passage {it['passage']}")
    if not it["explanation"]["whyCorrect"] or not it["explanation"]["tip"]:
        errors.append(f"{where}: missing explanation or tip")
    t = it["type"]
    if t in ("MULTIPLE_CHOICE", "DROPDOWN", "MULTI_SELECT"):
        opts = it["options"]
        texts = [o["text"].strip() for o in opts]
        if len(set(texts)) != len(texts):
            errors.append(f"{where}: duplicate option text")
        nc = sum(o["correct"] for o in opts)
        if t != "MULTI_SELECT" and nc != 1:
            errors.append(f"{where}: needs exactly one correct option (has {nc})")
        if t == "MULTI_SELECT" and nc < 2:
            errors.append(f"{where}: multi-select needs at least two correct options")
        if len(opts) < 3:
            errors.append(f"{where}: needs at least 3 options")
        for o in opts:
            if not o["correct"] and not o["rationale"]:
                errors.append(f"{where}: distractor without rationale: {o['text']}")
        # deterministic order: distractors shuffled by hash; for single-key items the key
        # position rotates A, B, C, D… across the bank so answers are evenly spread
        seed = int(hashlib.sha256(it["ref"].encode()).hexdigest(), 16)
        others = [j for j in range(len(opts)) if not (t != "MULTI_SELECT" and opts[j]["correct"])]
        for k in range(len(others) - 1, 0, -1):
            seed, r = divmod(seed, k + 1)
            others[k], others[r] = others[r], others[k]
        if t != "MULTI_SELECT":
            key = next(j for j in range(len(opts)) if opts[j]["correct"])
            pos = rotation[len(opts)] % len(opts)
            rotation[len(opts)] += 1
            idx = others[:pos] + [key] + others[pos:]
        else:
            idx = others
        it["options"] = [dict(label="ABCDEFG"[n], **opts[j]) for n, j in enumerate(idx)]
        if t == "MULTIPLE_CHOICE":
            key_positions[next(o["label"] for o in it["options"] if o["correct"])] += 1
    elif t == "SENTENCE_ORDER" and len(it["sequence"]) < 3:
        errors.append(f"{where}: ordering needs at least 3 steps")
    elif t == "ERROR_CORRECTION" and not 0 <= it["errorIndex"] < len(it["segments"]):
        errors.append(f"{where}: errorIndex out of range")
    elif t == "MATCHING" and len(it["pairs"]) < 3:
        errors.append(f"{where}: matching needs at least 3 pairs")
    elif t == "FILL_BLANK" and not it["answers"]:
        errors.append(f"{where}: fill-in needs accepted answers")
    it["skillKey"] = f"G{g}.{it['family']}"
    it["irt"] = dict(a=1.0, b=LEVEL_TO_B[it["level"]], c=0.0 if t not in ("TRUE_FALSE",) else 0.25)
    it["status"] = "UNDER_REVIEW"
    it["origin"] = "TEACHER_AUTHORED"

if errors:
    print("BANK INVALID:\n  " + "\n  ".join(errors))
    sys.exit(1)

out_dir = ROOT / "data/questions"
json.dump(dict(passages=list(passages.values()), items=qb.ITEMS), open(out_dir / "bank.json", "w"), indent=1, ensure_ascii=False)

with open(out_dir / "bank-review.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["ref", "grade", "skill", "standard", "level", "type", "passage", "stem", "options / answer", "correct", "why correct", "tip", "approved (Y/N)", "reviewer notes"])
    for it in qb.ITEMS:
        if "options" in it:
            opts = " | ".join(f"{o['label']}) {o['text']}" for o in it["options"])
            correct = ", ".join(o["label"] for o in it["options"] if o["correct"])
        elif it["type"] == "TRUE_FALSE":
            opts, correct = "True | False", str(it["answer"])
        elif it["type"] == "FILL_BLANK":
            opts, correct = "(typed)", " / ".join(it["answers"])
        elif it["type"] == "SENTENCE_ORDER":
            opts, correct = " → ".join(it["sequence"]), "order as listed"
        elif it["type"] == "ERROR_CORRECTION":
            opts, correct = " | ".join(it["segments"]), f"segment {it['errorIndex'] + 1} → {it['correction']}"
        else:
            opts, correct = " | ".join(f"{p['left']} = {p['right']}" for p in it["pairs"]), "pairs as listed"
        w.writerow([it["ref"], it["grade"], FAMILY_NAMES[it["family"]], it["standard"].replace("CCSS.ELA-LITERACY.", ""), it["level"], it["type"],
                    passages[it["passage"]]["title"] if it["passage"] else "", it["stem"], opts, correct,
                    it["explanation"]["whyCorrect"], it["explanation"]["tip"], "", ""])

# ---- report
print(f"VALID: {len(qb.ITEMS)} items, {len(passages)} passages")
by_grade = Counter(i["grade"] for i in qb.ITEMS)
print("by grade:", dict(sorted(by_grade.items())))
print("by type:", dict(Counter(i["type"] for i in qb.ITEMS).most_common()))
print("by level:", dict(sorted(Counter(i["level"] for i in qb.ITEMS).items())))
print("MC key positions:", dict(sorted(key_positions.items())))
stds = defaultdict(set)
for i in qb.ITEMS:
    stds[i["grade"]].add(i["standard"])
print("distinct standards per grade:", {g: len(s) for g, s in sorted(stds.items())})
fams = defaultdict(Counter)
for i in qb.ITEMS:
    fams[i["grade"]][i["family"]] += 1
for g in sorted(fams):
    print(f"G{g} skills covered: {len(fams[g])} / {len(GRADE_FAMS[g])}")
