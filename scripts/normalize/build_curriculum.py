#!/usr/bin/env python3
"""
Curriculum normalization pipeline (one-off, reproducible).

Input : the knowledge-base JSON extracted from the school's uploaded documents
        (Wonders Reading/Writing Companions G4/G5, Wonders Practice Books G4/G5,
        Progress Monitoring keys, IXL alignment PDFs, StudySync G6 booklets,
        MAP skills documents).
Output: canonical, de-duplicated seed files in data/curriculum/ that the
        TypeScript importer (prisma/seed/curriculum.ts) loads idempotently.

Only STRUCTURE and METADATA are emitted (units, lessons, skill names, standards,
word lists, grammar topics). No publisher passages or test items are copied.

Usage: python3 scripts/normalize/build_curriculum.py <kb_dir> <out_dir>
"""
import json, re, sys
from pathlib import Path

KB, OUT = Path(sys.argv[1]), Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", s.lower().replace("’", "").replace("'", "")).strip("-")

# --------------------------------------------------------------------------
# 1. Canonical skill families (cross-grade concepts = the learning continuum)
#    code -> (name, domain, category, MAP goal area, CCSS stem)
# --------------------------------------------------------------------------
F = {}
def fam(code, name, domain, category, map_area, ccss):
    F[code] = dict(code=code, name=name, domain=domain, category=category, mapGoalArea=map_area, ccssStems=ccss)

# Literature
fam("theme", "Theme", "READING", "LITERATURE", "LIT_THEME", ["RL.{g}.2"])
fam("summarize", "Summarize", "READING", "COMPREHENSION", "LIT_THEME", ["RL.{g}.2", "RI.{g}.2"])
fam("character", "Character Traits & Development", "READING", "LITERATURE", "LIT_THEME", ["RL.{g}.3"])
fam("character-perspective", "Character Perspective", "READING", "LITERATURE", "LIT_STRUCTURE", ["RL.{g}.6"])
fam("point-of-view", "Point of View and Perspective", "READING", "LITERATURE", "LIT_STRUCTURE", ["RL.{g}.6"])
fam("plot-conflict", "Plot: Conflict and Resolution", "READING", "LITERATURE", "LIT_THEME", ["RL.{g}.3"])
fam("plot-events", "Plot: Sequence of Events", "READING", "LITERATURE", "LIT_STRUCTURE", ["RL.{g}.3", "RL.{g}.5"])
fam("plot-setting", "Plot: Setting", "READING", "LITERATURE", "LIT_THEME", ["RL.{g}.3"])
fam("plot-flashback", "Plot: Flashback", "READING", "LITERATURE", "LIT_STRUCTURE", ["RL.{g}.5"])
fam("plot-foreshadowing", "Plot: Foreshadowing", "READING", "LITERATURE", "LIT_STRUCTURE", ["RL.{g}.5"])
fam("make-predictions", "Make Predictions", "READING", "COMPREHENSION", "LIT_THEME", ["RL.{g}.1"])
fam("visualize", "Visualize", "READING", "COMPREHENSION", "LIT_STRUCTURE", ["RL.{g}.7"])
fam("ask-answer-questions", "Ask and Answer Questions", "READING", "COMPREHENSION", "INFO_CENTRAL_IDEA", ["RI.{g}.1"])
fam("reread", "Reread to Clarify", "READING", "COMPREHENSION", "INFO_CENTRAL_IDEA", ["RI.{g}.1"])
fam("drama-elements", "Elements of Drama", "READING", "LITERATURE", "LIT_STRUCTURE", ["RL.{g}.5"])
fam("poetry-elements", "Poetry: Structure, Rhyme, Meter and Form", "READING", "LITERATURE", "LIT_STRUCTURE", ["RL.{g}.5"])
fam("sound-devices", "Sound Devices (Assonance, Consonance, Alliteration)", "READING", "LITERATURE", "VOCAB", ["RL.{g}.4", "L.{g}.5"])
fam("imagery", "Imagery and Sensory Language", "READING", "LITERATURE", "VOCAB", ["RL.{g}.4"])
fam("inference", "Make Inferences", "READING", "COMPREHENSION", "LIT_THEME", ["RL.{g}.1", "RI.{g}.1"])
fam("text-evidence", "Cite Text Evidence", "READING", "COMPREHENSION", "INFO_CENTRAL_IDEA", ["RL.{g}.1", "RI.{g}.1"])
fam("compare-texts", "Compare and Contrast Texts", "READING", "COMPREHENSION", "INFO_CENTRAL_IDEA", ["RL.{g}.9", "RI.{g}.9"])
# Informational
fam("central-idea", "Central Idea and Relevant Details", "READING", "INFORMATIONAL", "INFO_CENTRAL_IDEA", ["RI.{g}.2"])
fam("compare-contrast", "Text Structure: Compare and Contrast", "READING", "INFORMATIONAL", "INFO_STRUCTURE", ["RI.{g}.5"])
fam("cause-effect", "Text Structure: Cause and Effect", "READING", "INFORMATIONAL", "INFO_STRUCTURE", ["RI.{g}.3", "RI.{g}.5"])
fam("problem-solution", "Text Structure: Problem and Solution", "READING", "INFORMATIONAL", "INFO_STRUCTURE", ["RI.{g}.5"])
fam("sequence", "Text Structure: Sequence and Chronology", "READING", "INFORMATIONAL", "INFO_STRUCTURE", ["RI.{g}.3", "RI.{g}.5"])
fam("text-features", "Text Features", "READING", "INFORMATIONAL", "INFO_STRUCTURE", ["RI.{g}.7"])
fam("author-perspective", "Author's Perspective", "READING", "INFORMATIONAL", "INFO_STRUCTURE", ["RI.{g}.6", "RI.{g}.8"])
fam("author-purpose", "Author's Purpose", "READING", "INFORMATIONAL", "INFO_STRUCTURE", ["RI.{g}.6"])
fam("author-claim", "Author's Claim and Evidence", "READING", "INFORMATIONAL", "INFO_STRUCTURE", ["RI.{g}.8"])
fam("description", "Text Structure: Description", "READING", "INFORMATIONAL", "INFO_STRUCTURE", ["RI.{g}.5"])
# Vocabulary
fam("context-clues", "Context Clues", "VOCABULARY", "VOCABULARY", "VOCAB", ["L.{g}.4.a"])
fam("multiple-meaning", "Multiple-Meaning Words", "VOCABULARY", "VOCABULARY", "VOCAB", ["L.{g}.4.a"])
fam("homographs-homophones", "Homographs and Homophones", "VOCABULARY", "VOCABULARY", "VOCAB", ["L.{g}.5.c"])
fam("synonyms-antonyms", "Synonyms and Antonyms", "VOCABULARY", "VOCABULARY", "VOCAB", ["L.{g}.5.c"])
fam("prefixes", "Prefixes", "VOCABULARY", "WORD_STUDY", "VOCAB", ["L.{g}.4.b"])
fam("suffixes", "Suffixes", "VOCABULARY", "WORD_STUDY", "VOCAB", ["L.{g}.4.b"])
fam("greek-latin-roots", "Greek and Latin Roots", "VOCABULARY", "WORD_STUDY", "VOCAB", ["L.{g}.4.b"])
fam("idioms-adages", "Idioms, Adages and Proverbs", "VOCABULARY", "VOCABULARY", "VOCAB", ["L.{g}.5.b"])
fam("figurative-language", "Figurative Language (Similes, Metaphors, Personification, Hyperbole)", "VOCABULARY", "VOCABULARY", "VOCAB", ["L.{g}.5.a", "RL.{g}.4"])
fam("connotation", "Connotation and Denotation", "VOCABULARY", "VOCABULARY", "VOCAB", ["L.{g}.5", "RL.{g}.4"])
fam("reference-materials", "Dictionary, Glossary and Thesaurus", "VOCABULARY", "VOCABULARY", "VOCAB", ["L.{g}.4.c"])
fam("academic-vocabulary", "Academic and Domain-Specific Vocabulary", "VOCABULARY", "VOCABULARY", "VOCAB", ["L.{g}.6", "RI.{g}.4"])
fam("puns", "Puns and Wordplay", "VOCABULARY", "VOCABULARY", "VOCAB", ["L.{g}.5"])
# Grammar / usage
fam("sentences", "Sentences and Sentence Types", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1"])
fam("subjects-predicates", "Subjects and Predicates", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1"])
fam("fragments-run-ons", "Fragments and Run-On Sentences", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1"])
fam("compound-sentences", "Compound Sentences and Conjunctions", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1", "L.{g}.2"])
fam("clauses-complex", "Clauses and Complex Sentences", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1"])
fam("combining-sentences", "Combining Sentences", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.3"])
fam("nouns", "Nouns: Common, Proper, Concrete, Abstract, Collective", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1"])
fam("plural-nouns", "Singular, Plural and Irregular Plural Nouns", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1", "L.{g}.2"])
fam("possessive-nouns", "Possessive Nouns", "GRAMMAR", "GRAMMAR", "LANG_MECHANICS", ["L.{g}.2"])
fam("verbs", "Action, Main, Helping and Linking Verbs", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1"])
fam("verb-tenses", "Verb Tenses (Simple, Progressive, Perfect)", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1"])
fam("irregular-verbs", "Irregular Verbs", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1"])
fam("subject-verb-agreement", "Subject-Verb Agreement", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1"])
fam("pronouns", "Pronouns and Antecedents", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1"])
fam("pronoun-homophones", "Pronouns, Contractions and Homophones", "GRAMMAR", "GRAMMAR", "LANG_MECHANICS", ["L.{g}.1.g"])
fam("adjectives", "Adjectives, Articles and Order of Adjectives", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1"])
fam("comparatives", "Comparing with Adjectives and Adverbs", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1"])
fam("adverbs", "Adverbs and Relative Adverbs", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1"])
fam("negatives", "Negatives and Double Negatives", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1"])
fam("prepositions", "Prepositions and Prepositional Phrases", "GRAMMAR", "GRAMMAR", "LANG_GRAMMAR", ["L.{g}.1"])
# Mechanics
fam("capitalization", "Capitalization", "LANGUAGE", "MECHANICS", "LANG_MECHANICS", ["L.{g}.2.a"])
fam("commas", "Punctuation and Commas", "LANGUAGE", "MECHANICS", "LANG_MECHANICS", ["L.{g}.2"])
fam("quotations-dialogue", "Quotation Marks and Dialogue", "LANGUAGE", "MECHANICS", "LANG_MECHANICS", ["L.{g}.2.b"])
fam("titles-abbreviations", "Titles, Abbreviations and Letter Format", "LANGUAGE", "MECHANICS", "LANG_MECHANICS", ["L.{g}.2"])
fam("apostrophes-contractions", "Apostrophes and Contractions", "LANGUAGE", "MECHANICS", "LANG_MECHANICS", ["L.{g}.2"])
# Spelling / word study
fam("spelling", "Spelling Patterns", "WORD_STUDY", "PHONICS_WORD_STUDY", "LANG_MECHANICS", ["L.{g}.2.e", "RF.{g}.3"])
# Writing
fam("writing-argument", "Argumentative / Opinion Writing", "WRITING", "WRITING", "WRITING_ORG", ["W.{g}.1"])
fam("writing-informative", "Informative / Expository Writing", "WRITING", "WRITING", "WRITING_ORG", ["W.{g}.2"])
fam("writing-narrative", "Narrative Writing", "WRITING", "WRITING", "WRITING_ORG", ["W.{g}.3"])
fam("writing-poetry", "Poetry Writing", "WRITING", "WRITING", "WRITING_STYLE", ["W.{g}.3"])
fam("writing-research", "Research and Sources", "WRITING", "WRITING", "WRITING_SUPPORT", ["W.{g}.7", "W.{g}.8"])
fam("precise-language", "Precise Language, Style and Tone", "WRITING", "WRITING", "WRITING_STYLE", ["W.{g}.2.d", "L.{g}.3"])

# keyword -> family (order matters: first match wins)
KW = [
    (r"assonance|consonance|alliteration|sound device", "sound-devices"),
    (r"imagery", "imagery"), (r"flashback", "flashback"), (r"foreshadow", "plot-foreshadowing"),
    (r"character perspective|character’s perspective", "character-perspective"),
    (r"point of view", "point-of-view"), (r"characterization|character development|character", "character"),
    (r"conflict", "plot-conflict"), (r"setting", "plot-setting"), (r"plot: events|^plot$|plot\b", "plot-events"),
    (r"theme", "theme"), (r"summariz", "summarize"), (r"predict", "make-predictions"), (r"visualize", "visualize"),
    (r"ask and answer", "ask-answer-questions"), (r"reread", "reread"),
    (r"play|drama", "drama-elements"),
    (r"rhyme|meter|stanza|line break|form and|free verse|lyric|haiku|narrative poetry|repetition|structure/", "poetry-elements"),
    (r"central idea|main idea", "central-idea"), (r"compare and contrast|comparison", "compare-contrast"),
    (r"cause and effect", "cause-effect"), (r"problem and solution", "problem-solution"),
    (r"sequence|chronology|timeline", "sequence"),
    (r"diagram|heading|caption|photograph|graph|chart|map|sidebar|primary and secondary|print and graphic|pronunciation", "text-features"),
    (r"author.s perspective", "author-perspective"), (r"author.s purpose", "author-purpose"),
    (r"author.s claim", "author-claim"), (r"description", "description"),
    (r"multiple-meaning", "multiple-meaning"), (r"homograph|homophone", "homographs-homophones"),
    (r"synonym|antonym", "synonyms-antonyms"), (r"prefix", "prefixes"), (r"suffix", "suffixes"),
    (r"root|mythology", "greek-latin-roots"), (r"idiom|adage|proverb", "idioms-adages"),
    (r"simile|metaphor|personification|hyperbole|figurative|literal", "figurative-language"),
    (r"connotation", "connotation"), (r"dictionary|glossary|thesaurus", "reference-materials"),
    (r"context clue|paragraph clue|sentence clue", "context-clues"), (r"pun", "puns"),
]
def family_of(label: str):
    l = label.lower()
    for rx, code in KW:
        if re.search(rx, l):
            return "plot-flashback" if code == "flashback" else code
    return None

GRAMMAR_KW = [
    (r"run-on|fragment", "fragments-run-ons"), (r"subject.*predicate", "subjects-predicates"),
    (r"pronoun.*homophone|homophone|contraction", "pronoun-homophones"), (r"pronoun", "pronouns"),
    (r"adverb", "adverbs"), (r"preposition", "prepositions"),
    (r"compound sentence|conjunction|simple and compound", "compound-sentences"),
    (r"clause|complex", "clauses-complex"), (r"combining", "combining-sentences"),
    (r"possessive noun|plural possessive", "possessive-nouns"),
    (r"plural|irregular plural|collective", "plural-nouns"), (r"\bnouns?\b", "nouns"),
    (r"irregular verb|irregular past", "irregular-verbs"), (r"agreement", "subject-verb-agreement"),
    (r"tense|participle|perfect|progressive", "verb-tenses"), (r"\bverbs?\b", "verbs"),
    (r"compare|comparing|good|bad|more and most", "comparatives"),
    (r"adjective|article|this, that", "adjectives"), (r"negative", "negatives"),
    (r"sentence", "sentences"),
]
MECH_KW = [
    (r"capitaliz", "capitalization"), (r"comma|punctuat|colon|dash|hyphen|parenthes", "commas"), (r"dialogue|quotation", "quotations-dialogue"),
    (r"title|abbreviation|letter|e-mail|poetry", "titles-abbreviations"),
    (r"apostrophe|contraction|possessive", "apostrophes-contractions"),
]
def grammar_family(title: str, default="sentences"):
    t = title.lower()
    table = MECH_KW + GRAMMAR_KW if t.startswith("mechanics") else GRAMMAR_KW + MECH_KW
    for rx, code in table:
        if re.search(rx, t):
            return code
    return default

SPELL_KW = r"spell|vowel|syllable|blend|digraph|silent|plural with|word sort|soft c|diphthong|r-controlled|compound word"
WRITE_KW = [(r"opinion|reason|counterclaim|thesis|claim", "writing-argument"), (r"topic sentence|concluding|transition|linking|organize|order", "writing-informative"),
            (r"plagiarism|citation|works cited|source|research", "writing-research"), (r"formal|tone|stronger verb|precise|sensory|imagery to stories|varied sentences", "precise-language")]
def ixl_family(name: str):
    n = name.lower()
    EXTRA = [(r"purpose", "author-purpose"), (r"text feature|graphic organizer", "text-features"), (r"causes and effects", "cause-effect"),
             (r"problems with their solutions", "problem-solution"), (r"points? of view", "point-of-view"), (r"text structure", "compare-contrast"),
             (r"context", "context-clues"), (r"story elements|read .*(fiction|fantasy|drama|poetry)|^read about", "plot-events"),
             (r"with (pre-|re-|mis-|un-|dis-|sub-)|words with (pre|mis|sub|un|dis)", "prefixes"),
             (r"-ful|-less|-ly|-ness|-able|-ment|-ible|suffix", "suffixes"), (r"abbreviat", "titles-abbreviations"),
             (r"frequently confused|signs|errors in everyday", "pronoun-homophones"), (r"related words", "connotation"),
             (r"fallac|trace an argument|argumentative", "author-claim"), (r"quotation|dialogue", "quotations-dialogue"),
             (r"sensory", "imagery"), (r"figures of speech", "figurative-language"), (r"antecedent", "pronouns"), (r"guide words", "reference-materials"), (r"ellipses", "commas"), (r"revisions", "precise-language"), (r"short stories", "plot-events"), (r"compare information|two texts|different genres", "compare-texts"),
             (r"emotions and traits|actions and dialogue", "character")]
    if re.search(SPELL_KW, n) and "context" not in n: return "spelling"
    for rx, code in EXTRA:
        if re.search(rx, n): return code
    for rx, code in WRITE_KW:
        if re.search(rx, n): return code
    return family_of(name) or grammar_family(name, default=None) or (
        "inference" if "inference" in n else "text-evidence" if "supporting details" in n else
        "academic-vocabulary" if re.search(r"academic|domain-specific|read about", n) else None)

WRITING = {"argumentative essay": "writing-argument", "expository essay": "writing-informative",
           "personal narrative": "writing-narrative", "fictional narrative": "writing-narrative",
           "historical fiction": "writing-narrative", "research report": "writing-research",
           "free verse poem": "writing-poetry", "narrative poem": "writing-poetry"}

# --------------------------------------------------------------------------
# 2. Grades 4 & 5 — Wonders (edition taken from the uploaded books: 2023)
# --------------------------------------------------------------------------
spine = json.load(open(KB / "rwc_spine.json"))
grammar = json.load(open(KB / "grammar_rules.json"))
spelling = json.load(open(KB / "spelling.json"))
vocab = json.load(open(KB / "rwc_vocab.json"))
pm = json.load(open(KB / "progress_monitoring_map.json"))
pvocab = json.load(open(KB / "practice_vocab.json"))  # Practice Book vocabulary-strategy pages

def weeks_for_set(s): return {1: [1, 2], 2: [3, 4], 3: [5]}[s]

def build_wonders(g: int):
    G = f"G{g}"
    units = {}
    for ts in spine:
        if ts["grade"] != G: continue
        u = units.setdefault(ts["unit"], dict(number=ts["unit"], title=f"Unit {ts['unit']}", lessons=[], writing=[], crossCurricular=[]))
        if ts["set"] == "EXTENDED WRITING":
            for it in ts["items"]:
                genre = re.sub(r"PROJECT \d ", "", it).strip()
                u["writing"].append(dict(title=it, familyCode=WRITING.get(genre.lower(), "writing-informative")))
            continue
        if ts["set"] == "CONNECT AND REFLECT":
            u["crossCurricular"] = [re.sub(r'["“”]', "", i) for i in ts["items"]]
            continue
        lesson = dict(number=ts["set"], code=f"{G}-U{ts['unit']}-TS{ts['set']}",
                      title=f"Text Set {ts['set']}: {ts['genre']}", genre=ts["genre"],
                      weeks=weeks_for_set(ts["set"]), texts={}, skills=[])
        for it in ts["items"]:
            m = re.match(r"(SHARED READ|ANCHOR TEXT|PAIRED SELECTION)\s+(?:Analyze\s+)?(.*)", it)
            if m:
                lesson["texts"][m.group(1).lower().replace(" ", "_")] = re.sub(r'^["“]|["”]$', "", m.group(2).strip())
                continue
            role = "VOCABULARY_STRATEGY" if it.startswith("Vocabulary/") else \
                   "AUTHORS_CRAFT" if "Craft" in it else \
                   "STRATEGY_AND_FEATURE" if "/" in it else "COMPREHENSION_SKILL"
            parts = [p.strip() for p in re.sub(r"^(Vocabulary/|Author.s Craft:\s*)", "", it).split("/")]
            for p in parts:
                fc = family_of(p) or family_of(it)
                if fc: lesson["skills"].append(dict(label=p, role=role, familyCode=fc))
        # grammar + mechanics topics for the lesson's weeks
        for gp in grammar[str(g)]:
            if gp["unit"] == ts["unit"] and gp["week"] in lesson["weeks"]:
                lesson["skills"].append(dict(label=gp["title"], role="GRAMMAR", familyCode=grammar_family(gp["title"]),
                                             week=gp["week"], ruleSummary=gp["rules"][:5]))
        # spelling lists
        for sp in spelling[str(g)]:
            if sp["unit"] == ts["unit"] and sp["week"] in lesson["weeks"]:
                lesson["skills"].append(dict(label=f"Spelling: {sp['pattern']}", role="SPELLING", familyCode="spelling",
                                             week=sp["week"], wordList=dict(core=sp["words"][:20], review=sp["words"][20:23], challenge=sp["words"][23:])))
        # vocabulary strategies taught on the Practice Book pages for these weeks
        for pv in pvocab[str(g)]:
            if pv["unit"] == ts["unit"] and pv["week"] in lesson["weeks"]:
                fc = family_of(pv["label"])
                if fc and not any(sk["familyCode"] == fc and sk["role"] == "VOCABULARY_STRATEGY" for sk in lesson["skills"]):
                    lesson["skills"].append(dict(label=pv["label"], role="VOCABULARY_STRATEGY", familyCode=fc, week=pv["week"]))
        # shared-read vocabulary words
        for v in vocab:
            if v["grade"] == G and v["unit"] == ts["unit"] and v["set"] == ts["set"]:
                lesson["vocabularyWords"] = v["words"]
        # skills assessed on the matching progress-monitoring test (focus labels only)
        key = f"U{ts['unit']} " + {1: "Weeks 1 and 2", 2: "Weeks 3 and 4", 3: "Week 5"}[ts["set"]]
        lesson["assessedFocus"] = sorted({i["focus"] for i in pm[G].get(key, {}).get("items", [])})
        units[ts["unit"]]["lessons"].append(lesson)
    # Practised in every Wonders text set ("Respond to Reading", "Cite Text Evidence",
    # "Make Connections", writing revision for word choice)
    for u in units.values():
        u["unitSkills"] = [dict(label=F[c]["name"], role=r, familyCode=c) for c, r in
                           [("text-evidence", "COMPREHENSION_SKILL"), ("inference", "COMPREHENSION_SKILL"),
                            ("compare-texts", "COMPREHENSION_SKILL"), ("precise-language", "WRITING")]]
    return dict(grade=g, book=dict(code=f"WONDERS-G{g}", title="Wonders", publisher="McGraw Hill", edition="2023",
                                   note="Uploaded books are the 2023 edition; brief says 2020 — confirm before import."),
                units=[units[k] for k in sorted(units)])

# --------------------------------------------------------------------------
# 3. Grade 6 — StudySync (units from the IXL alignment + school booklets)
# --------------------------------------------------------------------------
G6_UNITS = [
    (1, "Testing Our Limits", ["Eleven", "The Mighty Miss Malone", "Red Scarf Girl / Hatchet", "The Magic Marker Mystery", "Scout's Honor", "The Good Samaritan", "Jabberwocky / Gathering Blue / A Wrinkle in Time"],
     ["context-clues", "text-evidence", "inference", "figurative-language", "character", "compare-texts", "drama-elements", "summarize"],
     ["adjectives", "adverbs", "pronouns", "nouns"]),
    (2, "You and Me", ["Walk Two Moons", "Roll of Thunder, Hear My Cry", "Teenagers", "Tableau", "The Voice in My Head / We're on the Same Team", "The Treasure of Lemon Brown", "The Circuit / That Day / A Poem for My Librarian, Mrs. Long"],
     ["imagery", "figurative-language", "text-evidence", "theme", "connotation", "poetry-elements", "point-of-view", "compare-texts", "author-claim"],
     ["nouns", "fragments-run-ons", "subjects-predicates", "commas", "spelling", "pronoun-homophones"]),
    (3, "In the Dark", ["Heroes Every Child Should Know: Perseus", "The Lightning Thief", "Elena / Hatshepsut", "I, Too", "Everybody Jump", "Hoot", "Donna O'Meara / Dare to be Creative! / Margaret Bourke-White"],
     ["character", "reference-materials", "plot-events", "central-idea", "poetry-elements", "cause-effect", "synonyms-antonyms", "theme", "inference"],
     ["compound-sentences", "adjectives", "prefixes"]),
    (4, "Personal Best", ["I Am Malala", "Malala Yousafzai – Nobel Lecture", "Priscilla and the Wimps / All Summer in a Day", "Bullying in Schools", "Freedom Walkers / Letter to Xavier High School / Freedom's Daughters", "Celebrities as Heroes", "Famous"],
     ["connotation", "author-purpose", "author-perspective", "theme", "author-claim", "central-idea", "compare-texts", "poetry-elements"],
     ["commas", "pronouns", "homographs-homophones"]),
    (5, "Making Your Mark", ["Warriors Don't Cry", "Damon and Pythias", "Amigo Brothers", "Listen, Slowly", "Charles", "Saying Yes / The All American Slurp", "Helen Keller / The Story of My Life (Ch. IV) / The Miracle Worker"],
     ["context-clues", "greek-latin-roots", "character", "precise-language", "point-of-view", "imagery", "drama-elements", "text-evidence", "theme"],
     ["pronouns", "clauses-complex", "sentences"]),
    (6, "True to Yourself", ["Bronx Masquerade", "A BEACON of Hope / Shree Bose", "Letter to His Daughter", "The Story Behind the Bus / Rosa / Rosa Parks: My Story", "Eleanor Roosevelt / Brave", "I Never Had It Made (Jackie Robinson)", "Touching Spirit Bear"],
     ["central-idea", "homographs-homophones", "figurative-language", "idioms-adages", "cause-effect", "compare-contrast", "character", "author-purpose"],
     ["quotations-dialogue", "fragments-run-ons", "commas"]),
]
G6_GRAMMAR_BOOKLET = ["Kinds of Sentences", "Sentence Fragments", "Run-On Sentences", "Nouns: Proper and Common",
                      "Nouns: Singular and Plural", "Nouns: Collective", "Nouns: Possessives", "Verb Tenses: Present, Past, and Future",
                      "Present and Past Progressive", "Perfect Tenses: Present and Past", "Irregular Verbs", "Using Pronouns Correctly",
                      "Pronouns and Antecedents", "Indefinite Pronouns", "Adjectives and Proper Adjectives", "Articles and Demonstratives"]
def build_studysync():
    units = []
    for n, title, selections, reading, lang in G6_UNITS:
        lessons = []
        for i, sel in enumerate(selections, 1):
            lessons.append(dict(number=i, code=f"G6-U{n}-L{i}", title=sel, genre=None, texts={"selection": sel}, skills=[]))
        # skill pool attached at unit level (lesson-level mapping refined by teachers in the admin UI)
        unit_skills = [dict(label=F[c]["name"], role="COMPREHENSION_SKILL", familyCode=c) for c in reading] + \
                      [dict(label=F[c]["name"], role="GRAMMAR", familyCode=c) for c in lang]
        units.append(dict(number=n, title=f"Unit {n}: {title}", lessons=lessons, unitSkills=unit_skills,
                          writing=[dict(title="Writing Project", familyCode=["writing-narrative", "writing-argument", "writing-informative", "writing-argument", "writing-informative", "writing-research"][n - 1])]))
    units[0]["unitSkills"] += [dict(label=t, role="GRAMMAR", familyCode=grammar_family(t)) for t in G6_GRAMMAR_BOOKLET[:7]]
    units[1]["unitSkills"] += [dict(label=t, role="GRAMMAR", familyCode=grammar_family(t)) for t in G6_GRAMMAR_BOOKLET[7:]]
    return dict(grade=6, book=dict(code="STUDYSYNC-G6", title="StudySync ELA", publisher="McGraw Hill", edition=None),
                units=units)

# --------------------------------------------------------------------------
# 4. Standards: CCSS ELA codes referenced by the families for grades 4-6 + MAP areas
# --------------------------------------------------------------------------
OFFICIAL = json.load(open(OUT / "ccss-standards.json"))  # parsed from the school's CCSS PDF (parse_ccss.py)
# grade-specific corrections where the CCSS numbering differs by grade
OVERRIDE = {
    ("spelling", 4): ["L.4.2.d", "RF.4.3.a"], ("spelling", 5): ["L.5.2.e", "RF.5.3.a"], ("spelling", 6): ["L.6.2.b"],
    ("pronoun-homophones", 5): ["L.5.1"], ("pronoun-homophones", 6): ["L.6.1"],
}
REJECTED = []
def resolve(fam_code, stems, g):
    raw = OVERRIDE.get((fam_code, g)) or [st.format(g=g) for st in stems]
    good = []
    for c in raw:
        full = "CCSS.ELA-LITERACY." + c
        if full in OFFICIAL: good.append(full)
        else: REJECTED.append(full)
    return good

def standards():
    out = {}
    for g in (4, 5, 6):
        for f in F.values():
            f.setdefault("standardsByGrade", {})[str(g)] = resolve(f["code"], f["ccssStems"], g)
            for code in f["standardsByGrade"][str(g)]:
                out[code] = dict(code=code, framework="CCSS_ELA", grade=g, strand=code.split(".")[2], description=OFFICIAL[code])
    return sorted(out.values(), key=lambda s: s["code"])

MAP_AREAS = [
    dict(code="LIT_STRUCTURE", name="Literary Text: Analyze Structure, Point of View, and Multimedia Elements", subject="READING"),
    dict(code="LIT_THEME", name="Literary Text: Analyze Theme and Literary Elements; Summarize", subject="READING"),
    dict(code="INFO_STRUCTURE", name="Informational Text: Analyze Point of View, Purpose, Features, and Structure", subject="READING"),
    dict(code="INFO_CENTRAL_IDEA", name="Informational Text: Analyze Central Idea, Concepts, and Events; Summarize", subject="READING"),
    dict(code="VOCAB", name="Vocabulary: Acquisition and Use", subject="READING"),
    dict(code="WRITING_STYLE", name="Writing: Establish and Maintain Style; Use Precise Language", subject="LANGUAGE_USAGE"),
    dict(code="WRITING_ORG", name="Writing: Plan, Organize; Create Cohesion, Use Transitions", subject="LANGUAGE_USAGE"),
    dict(code="WRITING_SUPPORT", name="Writing: Provide Support; Develop Topics; Conduct Research", subject="LANGUAGE_USAGE"),
    dict(code="LANG_GRAMMAR", name="Language: Understand, Edit for Grammar, Usage", subject="LANGUAGE_USAGE"),
    dict(code="LANG_MECHANICS", name="Language: Understand, Edit for Mechanics", subject="LANGUAGE_USAGE"),
]
# Goal-area NAMES mirror the school's MAP skills documents so imported RIT rows can be matched.

# --------------------------------------------------------------------------
# 5. Prerequisite graph (learning continuum) between families
# --------------------------------------------------------------------------
PREREQ = [  # (skill, prerequisite, weight, minimumMastery)
    ("subjects-predicates", "nouns", 0.6, 60), ("subjects-predicates", "verbs", 0.6, 60),
    ("sentences", "subjects-predicates", 0.7, 60), ("fragments-run-ons", "sentences", 0.8, 60),
    ("compound-sentences", "sentences", 0.8, 60), ("clauses-complex", "compound-sentences", 0.8, 60),
    ("combining-sentences", "compound-sentences", 0.6, 60), ("combining-sentences", "clauses-complex", 0.5, 60),
    ("plural-nouns", "nouns", 0.7, 60), ("possessive-nouns", "plural-nouns", 0.8, 60),
    ("verb-tenses", "verbs", 0.8, 60), ("irregular-verbs", "verb-tenses", 0.7, 60),
    ("subject-verb-agreement", "subjects-predicates", 0.7, 60), ("subject-verb-agreement", "verb-tenses", 0.5, 60),
    ("pronouns", "nouns", 0.6, 60), ("pronoun-homophones", "pronouns", 0.6, 60),
    ("comparatives", "adjectives", 0.8, 60), ("comparatives", "adverbs", 0.5, 60),
    ("commas", "compound-sentences", 0.5, 60), ("quotations-dialogue", "capitalization", 0.4, 60),
    ("inference", "text-evidence", 0.8, 60), ("theme", "summarize", 0.6, 60), ("theme", "inference", 0.6, 60),
    ("central-idea", "summarize", 0.6, 60), ("author-claim", "central-idea", 0.7, 60),
    ("author-perspective", "author-purpose", 0.6, 60), ("character-perspective", "point-of-view", 0.6, 60),
    ("plot-conflict", "plot-events", 0.6, 60), ("plot-flashback", "plot-events", 0.7, 60),
    ("plot-foreshadowing", "make-predictions", 0.6, 60), ("compare-texts", "central-idea", 0.5, 60),
    ("multiple-meaning", "context-clues", 0.8, 60), ("homographs-homophones", "context-clues", 0.5, 60),
    ("greek-latin-roots", "prefixes", 0.5, 60), ("greek-latin-roots", "suffixes", 0.5, 60),
    ("idioms-adages", "context-clues", 0.6, 60), ("figurative-language", "context-clues", 0.5, 60),
    ("connotation", "synonyms-antonyms", 0.6, 60),
]

# --------------------------------------------------------------------------
# 6. IXL reference alignment (skill NAMES + codes only, for mapping imported IXL reports)
# --------------------------------------------------------------------------
ixl = json.load(open(KB / "ixl.json"))
ixl_ref = []
for book, rows in ixl.items():
    g = int(book[1])
    for name, code in rows:
        ixl_ref.append(dict(grade=g, source=book, externalCode=code, externalName=name, familyCode=ixl_family(name)))

_stds = standards()
out = dict(
    families=list(F.values()), standards=_stds, mapGoalAreas=MAP_AREAS,
    prerequisites=[dict(skill=a, prerequisite=b, weight=w, minimumMastery=m) for a, b, w, m in PREREQ],
)
(OUT / "taxonomy.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
for g in (4, 5):
    (OUT / f"grade-{g}.json").write_text(json.dumps(build_wonders(g), indent=1, ensure_ascii=False))
(OUT / "grade-6.json").write_text(json.dumps(build_studysync(), indent=1, ensure_ascii=False))
(OUT / "ixl-reference.json").write_text(json.dumps(ixl_ref, indent=1, ensure_ascii=False))
(OUT / "fluency-norms.json").write_text((KB / "fluency_norms.json").read_text())

# quick stats for the log
for g in (4, 5, 6):
    d = json.load(open(OUT / f"grade-{g}.json"))
    sk = [s for u in d["units"] for l in u["lessons"] for s in l["skills"]] + [s for u in d["units"] for s in u.get("unitSkills", [])]
    unmapped = [s["label"] for s in sk if not s.get("familyCode")]
    print(f"grade {g}: units={len(d['units'])} lessons={sum(len(u['lessons']) for u in d['units'])} skill-links={len(sk)} unmapped={unmapped}")
print("rejected (not in official CCSS text):", sorted(set(REJECTED)))
print("families", len(F), "standards", len(out["standards"]), "ixl refs", len(ixl_ref),
      "ixl unmapped", sum(1 for r in ixl_ref if not r["familyCode"]))
