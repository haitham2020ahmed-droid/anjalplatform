"""
Grade 6 (StudySync) lesson -> skill links.

The StudySync sources only give a skill POOL per unit, so build_curriculum.py used
to emit every Grade 6 lesson with "skills": []. This fills each lesson from
  1. the school's Curriculum Map (data/curriculum-map/source.txt): when the
     selection appears there, its "Analyze Craft and Structure" skills are
     matched to families with the same word-boundary matcher, KEEPING ONLY
     families that are in the lesson's own unit pool;
  2. the unit pool itself, spread deterministically across the unit's lessons
     (reading skill i -> lesson i mod n, one grammar topic per lesson), so every
     pool skill is taught somewhere and every lesson gets >= 1 skill.
Labels/roles are copied from the unit pool so lesson links and unit skills share
one subskill. Teachers can still refine the links in the admin curriculum editor.
"""
import re
from pathlib import Path

from family_match import families_all


# Families that only make sense for one genre: assigned only to lessons of that genre
# (curriculum-map "Genre:" line, or a title known to be a poem/play); otherwise they
# stay unit-level skills and are not forced onto an unrelated selection.
GENRE_ONLY = {"poetry-elements": "poetry", "sound-devices": "poetry", "drama-elements": "drama"}
GENRE_HINTS = {"jabberwocky": "poetry", "i too": "poetry", "famous": "poetry", "tableau": "poetry",
               "a poem for my librarian mrs long": "poetry", "rosa": "poetry",
               "the miracle worker": "drama", "damon and pythias": "drama"}


def _norm(s: str) -> str:
    s = s.lower().replace("’", "'")
    s = re.sub(r"\(.*?\)", "", s)
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


GENRES = {}  # normalized selection title -> genre, filled by parse_map_g6


def _genres(title: str):
    out = set()
    for part in title.split(" / "):
        p = _norm(part)
        for t, g in list(GENRES.items()) + list(GENRE_HINTS.items()):
            if t == p or t.startswith(p + " ") or p.startswith(t + " "):
                out.add(g)
    return out


def parse_map_g6(source_text: str):
    """{normalized selection title: [skill phrases]} for Grade 6 of the curriculum map."""
    out, grade, title, want = {}, None, None, False
    for raw in source_text.splitlines():
        t = raw.strip()
        m = re.match(r"^Grade (\d+)$", t)
        if m:
            grade = int(m.group(1)); continue
        if grade != 6:
            continue
        m = re.match(r"^Selection \d+: (.+)$", t)
        if m:
            title = _norm(m.group(1)); out.setdefault(title, []); continue
        m = re.match(r"^Genre: (.+)$", t)
        if m and title:
            g = m.group(1).lower()
            GENRES[title] = "poetry" if "poetry" in g else "drama" if "drama" in g else g
            continue
        m = re.match(r"^[123]- (?:Concept Vocabulary|Analyze Craft and Structure)(?: \((.+)\))?$", t)
        if m and title:
            if m.group(1):
                out[title] += [p.strip() for p in m.group(1).split("\\")]
            want = "Analyze" in t and not m.group(1)
            continue
        if want:
            want = False
            m = re.match(r"^\((.+)\)$", t)
            if m and title:
                out[title] += [p.strip() for p in m.group(1).split("\\")]
    return out


def _map_phrases(title: str, mp):
    phrases = []
    for part in title.split(" / "):
        p = _norm(part)
        if not p:
            continue
        for t, sk in mp.items():
            if t == p or t.startswith(p + " ") or p.startswith(t + " "):
                phrases += sk
    return phrases


def fill_unit(unit: dict, mp) -> None:
    pool = unit.get("unitSkills", [])
    lessons = unit["lessons"]
    genres = [_genres(l["title"]) for l in lessons]
    reading, genre_only = [], []
    for s in pool:
        if s["role"] == "GRAMMAR":
            continue
        (genre_only if s["familyCode"] in GENRE_ONLY else reading).append(s)
    grammar = []
    for s in pool:  # one link per grammar family, first label wins
        if s["role"] == "GRAMMAR" and all(g["familyCode"] != s["familyCode"] for g in grammar):
            grammar.append(s)
    by_code = {s["familyCode"]: s for s in reversed(pool)}  # first occurrence wins
    n = len(lessons)
    for i, lesson in enumerate(lessons):
        codes = []
        for phrase in _map_phrases(lesson["title"], mp):
            for c in families_all(phrase):
                if c in by_code and c not in codes and (c not in GENRE_ONLY or GENRE_ONLY[c] in genres[i]):
                    codes.append(c)
        for s in genre_only:
            if GENRE_ONLY[s["familyCode"]] in genres[i] and s["familyCode"] not in codes:
                codes.append(s["familyCode"])
        for j, s in enumerate(reading):
            if (j % n == i or (len(reading) < n and i % len(reading) == j)) and s["familyCode"] not in codes:
                codes.append(s["familyCode"])
        if grammar:
            g = grammar[i % len(grammar)]["familyCode"]
            if g not in codes:
                codes.append(g)
        lesson["skills"] = [
            dict(label=by_code[c]["label"], role=by_code[c]["role"], familyCode=c) for c in codes
        ]


def fill_grade6(data: dict, map_source: Path) -> None:
    mp = parse_map_g6(map_source.read_text(encoding="utf8")) if map_source.exists() else {}
    for u in data["units"]:
        fill_unit(u, mp)
