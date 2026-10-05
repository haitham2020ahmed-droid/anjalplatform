"""
Authoring helpers for the original question bank.

Every item is written for this platform (origin = TEACHER_AUTHORED, status =
UNDER_REVIEW until a teacher approves it). Items cite the official CCSS code
they assess (validated against data/curriculum/ccss-standards.json) and the
platform skill family (validated against the grade's curriculum plan).

Option convention: the CORRECT option is written first; the builder shuffles
deterministically so the key is spread across A–D.
"""

PASSAGES = []
ITEMS = []
_grade = None
_counter = {}


def grade(g):
    global _grade
    _grade = g


def P(pid, title, genre, text):
    # keep paragraph breaks (blank lines) and line breaks (headings, poem lines, script lines)
    paras = [p for p in text.strip().split("\n\n") if p.strip()]
    clean = "\n\n".join("\n".join(" ".join(line.split()) for line in p.split("\n") if line.strip()) for p in paras)
    PASSAGES.append(dict(id=pid, grade=_grade, title=title, genre=genre, text=clean))
    return pid


def _ref(fam):
    n = _counter.get((_grade, fam), 0) + 1
    _counter[(_grade, fam)] = n
    return f"G{_grade}-{fam}-{n:03d}"


def _base(fam, std, lvl, stem, why, tip, passage, sub, qtype, secs):
    return dict(ref=_ref(fam), grade=_grade, family=fam, standard="CCSS.ELA-LITERACY." + std, level=lvl,
                type=qtype, stem=stem, passage=passage, subskill=sub,
                explanation=dict(whyCorrect=why, tip=tip),
                estimatedSeconds=secs or (25 + 8 * lvl + (40 if passage else 0)))


def mc(fam, std, lvl, stem, correct, wrongs, why, tip, passage=None, sub=None, secs=None):
    """Multiple choice: wrongs = [(text, why_wrong), ...]"""
    it = _base(fam, std, lvl, stem, why, tip, passage, sub, "MULTIPLE_CHOICE", secs)
    it["options"] = [dict(text=correct, correct=True, rationale=None)] + [dict(text=t, correct=False, rationale=r) for t, r in wrongs]
    ITEMS.append(it)


def ms(fam, std, lvl, stem, corrects, wrongs, why, tip, passage=None, sub=None):
    """Multiple select: all correct options must be chosen."""
    it = _base(fam, std, lvl, stem, why, tip, passage, sub, "MULTI_SELECT", None)
    it["options"] = [dict(text=t, correct=True, rationale=None) for t in corrects] + [dict(text=t, correct=False, rationale=r) for t, r in wrongs]
    ITEMS.append(it)


def tf(fam, std, lvl, statement, answer, why, tip, passage=None, sub=None):
    it = _base(fam, std, lvl, statement, why, tip, passage, sub, "TRUE_FALSE", None)
    it["answer"] = bool(answer)
    ITEMS.append(it)


def dd(fam, std, lvl, stem, correct, wrongs, why, tip, passage=None, sub=None):
    """Dropdown: stem contains ____ ; the student chooses the word that fits."""
    assert "____" in stem
    it = _base(fam, std, lvl, stem, why, tip, passage, sub, "DROPDOWN", None)
    it["options"] = [dict(text=correct, correct=True, rationale=None)] + [dict(text=t, correct=False, rationale=r) for t, r in wrongs]
    ITEMS.append(it)


def fill(fam, std, lvl, stem, answers, why, tip, passage=None, sub=None):
    """Typed fill-in: answers = accepted spellings (case-insensitive)."""
    assert "____" in stem
    it = _base(fam, std, lvl, stem, why, tip, passage, sub, "FILL_BLANK", None)
    it["answers"] = answers
    ITEMS.append(it)


def order(fam, std, lvl, stem, steps, why, tip, passage=None, sub=None, qtype="SENTENCE_ORDER"):
    """Ordering: steps are given in the CORRECT order; the UI shuffles them."""
    it = _base(fam, std, lvl, stem, why, tip, passage, sub, qtype, None)
    it["sequence"] = steps
    ITEMS.append(it)


def err(fam, std, lvl, segments, wrong_index, correction, why, tip, sub=None):
    """Error correction: sentence split into tappable segments; one is wrong."""
    stem = "Tap the part of the sentence that has an error."
    it = _base(fam, std, lvl, stem, why, tip, None, sub, "ERROR_CORRECTION", None)
    it["segments"] = segments
    it["errorIndex"] = wrong_index
    it["correction"] = correction
    ITEMS.append(it)


def match(fam, std, lvl, stem, pairs, why, tip, sub=None):
    """Matching: pairs = [(left, right), ...] in correct correspondence."""
    it = _base(fam, std, lvl, stem, why, tip, None, sub, "MATCHING", None)
    it["pairs"] = [dict(left=a, right=b) for a, b in pairs]
    ITEMS.append(it)
