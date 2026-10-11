"""
Label -> skill-family matchers shared by build_curriculum.py and remap_families.py.

Every keyword is matched on WORD BOUNDARIES. The earlier version used plain
substring search, which produced wrong links such as
  "Homographs"                     -> text-features  ("graph" inside "homographs")
  "Context Clues: Paragraph Clues" -> text-features  ("graph" inside "paragraph")
  "Commands and Exclamations"      -> commas         ("comma" inside "commands")
  "What does the punctuation ..."  -> puns           ("pun" inside "punctuation")
  "Form and use plurals"           -> poetry-elements ("form and")
  "... geographic features"        -> text-features  ("graph" inside "geographic")
Vocabulary strategies are also checked BEFORE text features so a label that
names both (e.g. "Homophones and Homographs") lands in the vocabulary family.
Order still matters: the first matching rule wins.
"""
import re

# reading / vocabulary skill labels
KW = [
    (r"\bassonance\b|\bconsonance\b|\balliteration\b|\bsound devices?\b", "sound-devices"),
    (r"\bimagery\b", "imagery"), (r"\bflashbacks?\b", "flashback"), (r"\bforeshadow", "plot-foreshadowing"),
    (r"\bcharacter perspective\b|\bcharacter[’']s perspective\b", "character-perspective"),
    (r"\bpoints? of view\b", "point-of-view"),
    (r"\bcharacterization\b|\bcharacter development\b|\bcharacters?\b", "character"),
    (r"\bconflicts?\b", "plot-conflict"), (r"\bsetting\b", "plot-setting"), (r"^plot\b|\bplot: events\b|\bplot\b|\bstory structure\b", "plot-events"),
    (r"\bthemes?\b", "theme"), (r"\bsummariz", "summarize"), (r"\bpredict", "make-predictions"), (r"\bvisualiz", "visualize"),
    (r"\bask and answer\b", "ask-answer-questions"), (r"\breread", "reread"),
    (r"\bplays?\b|\bdrama\b|\bdramatic\b|\bstage directions?\b", "drama-elements"),
    (r"\brhyme\b|\bmeter\b|\bstanzas?\b|\bline breaks?\b|\bfree verse\b|\blyric\b|\bhaiku\b|\bnarrative poetry\b|\brepetition\b|^structure$", "poetry-elements"),
    (r"\bcentral idea\b|\bmain idea\b", "central-idea"), (r"\bcompare and contrast\b|\bcomparison\b", "compare-contrast"),
    (r"\bcause and effect\b", "cause-effect"), (r"\bproblem and solution\b", "problem-solution"),
    (r"\bsequence\b|\bchronology\b|\btimelines?\b", "sequence"),
    # vocabulary strategies whose names contain text-feature words ("homoGRAPHs", "paraGRAPH clues")
    (r"\bcontext clues?\b|\bparagraph clues?\b|\bsentence clues?\b", "context-clues"),
    (r"\bmultiple-meaning\b", "multiple-meaning"), (r"\bhomographs?\b|\bhomophones?\b", "homographs-homophones"),
    (r"\bdiagrams?\b|\bheadings?\b|\bcaptions?\b|\bphotographs?\b|\bgraphs?\b|\bcharts?\b|\bmaps?\b|\bsidebars?\b"
     r"|\bprimary and secondary\b|\bprint and graphic\b|\bpronunciations?\b", "text-features"),
    (r"\bauthor[’']s perspective\b", "author-perspective"), (r"\bauthor[’']s purpose\b", "author-purpose"),
    (r"\bauthor[’']s claim\b|\bclaims? and evidence\b|\bargument and claims?\b", "author-claim"), (r"\bdescription\b", "description"),
    (r"\bsynonyms?\b|\bantonyms?\b", "synonyms-antonyms"), (r"\bprefix", "prefixes"), (r"\bsuffix", "suffixes"),
    (r"\broots?\b|\bmythology\b", "greek-latin-roots"), (r"\bidioms?\b|\badages?\b|\bproverbs?\b", "idioms-adages"),
    (r"\bsimiles?\b|\bmetaphors?\b|\bpersonification\b|\bhyperbole\b|\bfigurative\b|\bliteral\b", "figurative-language"),
    (r"\bconnotations?\b", "connotation"), (r"\bdictionary\b|\bglossary\b|\bthesaurus\b", "reference-materials"),
    (r"\bpuns?\b", "puns"),
    (r"\btext(ual)? evidence\b", "text-evidence"),
    (r"\bword choice\b|\btone\b|\bauthor[’']s style\b", "precise-language"),
]


def family_of(label: str):
    l = label.lower()
    for rx, code in KW:
        if re.search(rx, l):
            return "plot-flashback" if code == "flashback" else code
    return None


GRAMMAR_KW = [
    (r"\brun-ons?\b|\bfragments?\b", "fragments-run-ons"), (r"\bsubjects?\b.*\bpredicates?\b", "subjects-predicates"),
    (r"\bpronouns?\b.*\bhomophones?\b|\bhomophones?\b|\bcontractions?\b", "pronoun-homophones"), (r"\bpronouns?\b", "pronouns"),
    (r"\badverbs?\b", "adverbs"), (r"\bprepositions?\b|\bprepositional\b", "prepositions"),
    (r"\bcompound sentences?\b|\bconjunctions?\b|\bsimple and compound\b", "compound-sentences"),
    (r"\bclauses?\b|\bcomplex\b", "clauses-complex"), (r"\bcombining\b", "combining-sentences"),
    (r"\bpossessive nouns?\b|\bplural possessives?\b|-[’']s\b", "possessive-nouns"),
    (r"\bplurals?\b|\bcollective\b", "plural-nouns"), (r"\bnouns?\b", "nouns"),
    (r"\birregular verbs?\b|\birregular past\b", "irregular-verbs"), (r"\bagreement\b", "subject-verb-agreement"),
    (r"\btenses?\b|\bparticiples?\b|\bperfect\b|\bprogressive\b", "verb-tenses"), (r"\bverbs?\b", "verbs"),
    (r"\bcompare\b|\bcomparing\b|\bcomparatives?\b|\bgood\b|\bbad\b|\bmore and most\b", "comparatives"),
    (r"\badjectives?\b|\barticles?\b|\bthis, that\b|\ba, an,? and the\b", "adjectives"), (r"\bnegatives?\b", "negatives"),
    (r"\bappositives?\b", "commas"),
    (r"\bsentences?\b", "sentences"),
]
MECH_KW = [
    (r"\bcapitaliz", "capitalization"),
    (r"\bcommas?\b|\bpunctuat|\bcolons?\b|\bdash(es)?\b|\bhyphens?\b|\bparenthes", "commas"),
    (r"\bdialogue\b|\bquotations?\b", "quotations-dialogue"),
    (r"\btitles?\b|\babbreviations?\b|\bletters?\b|\be-mails?\b|\bpoetry\b", "titles-abbreviations"),
    (r"\bapostrophes?\b|\bcontractions?\b|\bpossessives?\b", "apostrophes-contractions"),
]


def grammar_family(title: str, default="sentences"):
    t = title.lower()
    table = MECH_KW + GRAMMAR_KW if t.startswith("mechanics") else GRAMMAR_KW + MECH_KW
    for rx, code in table:
        if re.search(rx, t):
            return code
    return default


SPELL_KW = r"\bspell|\bvowels?\b|\bsyllables?\b|\bblends?\b|\bdigraphs?\b|\bsilent\b|\bplural with\b|\bword sort\b|\bsoft c\b|\bdiphthongs?\b|\br-controlled\b|\bcompound words?\b"
WRITE_KW = [(r"\bopinions?\b|\breasons?\b|\bcounterclaims?\b|\bthesis\b|\bclaims?\b", "writing-argument"),
            (r"\btopic sentences?\b|\bconcluding\b|\btransitions?\b|\blinking\b|\borganiz|\border\b", "writing-informative"),
            (r"\bplagiarism\b|\bcitations?\b|\bworks cited\b|\bsources?\b|\bresearch\b", "writing-research"),
            (r"\bformal\b|\btone\b|\bstronger verbs?\b|\bprecise\b|\bsensory\b|\bimagery to stories\b|\bvaried sentences\b", "precise-language")]


def ixl_family(name: str):
    n = name.lower()
    EXTRA = [(r"\bpurpose\b", "author-purpose"), (r"\btext features?\b|\bgraphic organizers?\b", "text-features"), (r"\bcauses and effects\b", "cause-effect"),
             (r"\bproblems with their solutions\b", "problem-solution"), (r"\bpoints? of view\b", "point-of-view"), (r"\btext structures?\b", "compare-contrast"),
             (r"\bwhich definition matches\b|\bmatches the definition\b", "multiple-meaning"),
             (r"\bcontext\b", "context-clues"), (r"\bthemes?\b", "theme"),
             (r"\bstory elements\b|\bread .*(fiction|fantasy|drama|poetry)|^read about\b", "plot-events"),
             (r"with (pre-|re-|mis-|un-|dis-|sub-)|words with (pre|mis|sub|un|dis)", "prefixes"),
             (r"-ful\b|-less\b|-ly\b|-ness\b|-able\b|-ment\b|-ible\b|\bsuffix", "suffixes"), (r"\babbreviat", "titles-abbreviations"),
             (r"\bfrequently confused\b|\bsigns\b|\berrors in everyday\b", "pronoun-homophones"), (r"\brelated words\b", "connotation"),
             (r"\bfallac|\btrace an argument\b|\bargumentative\b", "author-claim"), (r"\bquotations?\b|\bdialogue\b", "quotations-dialogue"),
             (r"\bsensory\b", "imagery"), (r"\bfigures of speech\b", "figurative-language"), (r"\bantecedents?\b", "pronouns"), (r"\bguide words\b", "reference-materials"), (r"\bellipses\b", "commas"), (r"\brevisions?\b", "precise-language"), (r"\bshort stories\b", "plot-events"), (r"\bcompare information\b|\btwo texts\b|\bdifferent genres\b", "compare-texts"),
             (r"\bemotions and traits\b|\bactions and dialogue\b", "character"),
             (r"\bcapitaliz", "capitalization"), (r"\bpunctuation\b", "commas")]
    if re.search(SPELL_KW, n) and "context" not in n:
        return "spelling"
    for rx, code in EXTRA:
        if re.search(rx, n):
            return code
    for rx, code in WRITE_KW:
        if re.search(rx, n):
            return code
    return family_of(name) or grammar_family(name, default=None) or (
        "inference" if "inference" in n else "text-evidence" if "supporting details" in n else
        "academic-vocabulary" if re.search(r"\bacademic\b|\bdomain-specific\b|\bread about\b", n) else None)


def families_all(label: str):
    """Every family a label names, in rule order (e.g. "Point of View and Theme" -> both)."""
    l = label.lower()
    out = []
    for rx, code in KW:
        code = "plot-flashback" if code == "flashback" else code
        if re.search(rx, l) and code not in out:
            out.append(code)
    return out
