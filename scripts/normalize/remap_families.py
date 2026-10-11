#!/usr/bin/env python3
"""
Re-applies the (word-boundary) family matchers to the committed seed files in
data/curriculum WITHOUT the original knowledge-base inputs, and fills the Grade 6
lesson skills. Only "familyCode" values (and Grade 6 "skills") change; every other
field is kept as is. Idempotent: a second run reports 0 changes.

Usage: python3 scripts/normalize/remap_families.py [data/curriculum] [--check]
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from family_match import family_of, grammar_family, ixl_family  # noqa: E402
from g6_lesson_skills import fill_grade6  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
args = [a for a in sys.argv[1:] if not a.startswith("--")]
DATA = Path(args[0]) if args else ROOT / "data" / "curriculum"
CHECK = "--check" in sys.argv
READING_ROLES = {"VOCABULARY_STRATEGY", "STRATEGY_AND_FEATURE", "COMPREHENSION_SKILL", "AUTHORS_CRAFT"}
changes = []


def remap(link: dict, where: str):
    role, label, old = link.get("role"), link.get("label", ""), link.get("familyCode")
    if role in READING_ROLES:
        new = family_of(label)
    elif role == "GRAMMAR":
        new = grammar_family(label)
    else:
        return
    if new and new != old:
        changes.append(f"{where}: {label!r} {old} -> {new}")
        link["familyCode"] = new


def dump(path: Path, data) -> None:
    text = json.dumps(data, indent=1, ensure_ascii=False)
    if path.read_text(encoding="utf8") != text and not CHECK:
        path.write_text(text, encoding="utf8")


for g in (4, 5):
    p = DATA / f"grade-{g}.json"
    d = json.loads(p.read_text(encoding="utf8"))
    for u in d["units"]:
        for l in u["lessons"]:
            for s in l["skills"]:
                remap(s, l["code"])
    dump(p, d)

p6 = DATA / "grade-6.json"
d6 = json.loads(p6.read_text(encoding="utf8"))
before = json.dumps([l["skills"] for u in d6["units"] for l in u["lessons"]])
FAMILY_NAMES = {f["name"] for f in json.loads((DATA / "taxonomy.json").read_text(encoding="utf8"))["families"]}
for u in d6["units"]:
    for s in u.get("unitSkills", []):
        if s["label"] not in FAMILY_NAMES:  # grammar-booklet titles (pool entries named after a family are canonical)
            remap(s, f"G6-U{u['number']}")
fill_grade6(d6, ROOT / "data" / "curriculum-map" / "source.txt")
if json.dumps([l["skills"] for u in d6["units"] for l in u["lessons"]]) != before:
    changes.append("grade-6: lesson skills filled")
dump(p6, d6)

pi = DATA / "ixl-reference.json"
ixl = json.loads(pi.read_text(encoding="utf8"))
for r in ixl:
    new = ixl_family(r["externalName"])
    if new != r["familyCode"]:
        changes.append(f"IXL G{r['grade']} {r['externalCode']}: {r['externalName']!r} {r['familyCode']} -> {new}")
        r["familyCode"] = new
dump(pi, ixl)

print("\n".join(changes))
print(f"{len(changes)} change(s){' (check only, nothing written)' if CHECK else ''}")
if CHECK and changes:
    sys.exit(1)
