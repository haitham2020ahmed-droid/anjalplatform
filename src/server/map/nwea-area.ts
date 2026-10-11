/**
 * 🧭 NWEA MAP Growth classification of ONE question (pure: no database).
 *
 *   map_test               "Reading" | "Language Usage"
 *   map_instructional_area Reading → "Literary Text" · "Informational Text" · "Vocabulary"
 *                          Language Usage → "Language: Understand, Edit for Grammar, Usage" ·
 *                          "Language: Understand, Edit for Mechanics" · "Writing: Write, Revise Texts for Purpose and Audience"
 *
 * The CCSS → area table is NWEA's own: every statement of the MAP Growth Learning Continuum (Reading 2–5 and
 * Language Usage 2–5) carries its CCSS codes, and they fall exactly like this —
 *   RL.x.4 and RI.x.4 (word meaning in a text) → Vocabulary; RL.x.(1–3, 5–10) → Literary Text; RI.x.(1–3, 5–10) →
 *   Informational Text; L.x.4–6 → Vocabulary; L.x.1 → Grammar, Usage; L.x.2 → Mechanics; L.x.3 and W.x.x → Writing.
 *   RF.x.x (not in the Continuum) → Vocabulary (word analysis), or Mechanics when the question is about spelling.
 * Skills that are always Mechanics: Contractions, Homophones, Capitalization, Punctuation, Abbreviations, Spelling.
 *
 * Order of evidence: the import file's own MAP columns → a Mechanics skill → the question's standard → the skill's
 * standard → the skill's category / the Curriculum Map place → the wording of the question (a suggestion to check).
 * A standard is fixed only when it is clearly wrong (written wrongly, another grade, a code that does not exist at
 * the grade, or against a Mechanics skill); a standard read from the wording is only SUGGESTED for the admin.
 */

export type AreaKey = "LIT" | "INFO" | "VOCAB" | "GRAMMAR" | "MECH" | "WRITING";
export type MapTest = "Reading" | "Language Usage";
export const MAP_AREAS: { key: AreaKey; test: MapTest; name: string; short: string }[] = [
  { key: "LIT", test: "Reading", name: "Literary Text", short: "Literary Text" },
  { key: "INFO", test: "Reading", name: "Informational Text", short: "Informational Text" },
  { key: "VOCAB", test: "Reading", name: "Vocabulary", short: "Vocabulary" },
  { key: "GRAMMAR", test: "Language Usage", name: "Language: Understand, Edit for Grammar, Usage", short: "Grammar, Usage" },
  { key: "MECH", test: "Language Usage", name: "Language: Understand, Edit for Mechanics", short: "Mechanics" },
  { key: "WRITING", test: "Language Usage", name: "Writing: Write, Revise Texts for Purpose and Audience", short: "Writing" },
];
export const areaByKey = (k: AreaKey) => MAP_AREAS.find((a) => a.key === k)!;
const squash = (x: string) => x.toLowerCase().replace(/[^a-z]/g, "");
/** “Grammar”, “Language: Understand, Edit for Grammar, Usage”, “L: Mechanics”, “Literary” … → the area. */
export function areaFromName(raw: string | null | undefined): AreaKey | null {
  const t = squash(String(raw ?? ""));
  if (!t) return null;
  const exact = MAP_AREAS.find((a) => squash(a.name) === t || squash(a.short) === t || squash(a.key) === t);
  if (exact) return exact.key;
  if (/mechanic/.test(t)) return "MECH";
  if (/grammar|usage/.test(t)) return "GRAMMAR";
  if (/writ/.test(t)) return "WRITING";
  if (/vocab/.test(t)) return "VOCAB";
  if (/informational|nonfiction/.test(t)) return "INFO";
  if (/literary|literature|fiction/.test(t)) return "LIT";
  return null;
}
export function testFromName(raw: string | null | undefined): MapTest | null {
  const t = squash(String(raw ?? ""));
  return /^read/.test(t) ? "Reading" : /lang|usage/.test(t) ? "Language Usage" : null;
}

// ------------------------------------------------------------------ CCSS codes

export interface Ccss { strand: "RL" | "RI" | "RF" | "L" | "W" | "SL"; grade: number; n: number; sub: string }
/** “CCSS.ELA-LITERACY.RL.4.2”, “rl 4.2”, “RL4.2”, “L.5.1.a” … → the code (null when it is not a CCSS ELA code). */
export function parseCcss(raw: string | null | undefined): Ccss | null {
  const t = String(raw ?? "").toUpperCase().replace(/^CCSS[.\s-]*ELA[-\s]*LITERACY[.\s]*/, "").replace(/\s+/g, "").replace(/[–—-]/g, ".");
  const m = t.match(/^(RL|RI|RF|L|W|SL)\.?(\d{1,2})\.(\d{1,2})(?:\.?([A-H]))?$/);
  if (!m) return null;
  return { strand: m[1] as Ccss["strand"], grade: Number(m[2]), n: Number(m[3]), sub: (m[4] ?? "").toLowerCase() };
}
export const ccssCode = (c: Ccss) => `${c.strand}.${c.grade}.${c.n}${c.sub ? `.${c.sub}` : ""}`;
/** Does the standard exist at that grade? (Grades 3–8 of the CCSS ELA.) */
export function ccssExists(c: Ccss): boolean {
  if (c.grade < 1 || c.grade > 12) return false;
  switch (c.strand) {
    case "RL": return c.n >= 1 && c.n <= 10 && c.n !== 8;
    case "RI": return c.n >= 1 && c.n <= 10;
    case "RF": return c.grade <= 5 && (c.grade <= 1 ? c.n >= 1 && c.n <= 4 : c.n === 3 || c.n === 4);
    case "L": return c.n >= 1 && c.n <= 6;
    case "W": return c.n >= 1 && c.n <= 10 && !(c.grade < 3 && c.n === 4) && !(c.grade < 3 && c.n === 9) && !(c.grade < 3 && c.n === 10);
    case "SL": return c.n >= 1 && c.n <= 6;
  }
}
/** The area of a CCSS code (NWEA's Continuum alignment); RF is Vocabulary (Mechanics when about spelling). */
export function areaFromCcss(c: Ccss, aboutSpelling = false): AreaKey | null {
  switch (c.strand) {
    case "RL": return c.n === 4 ? "VOCAB" : "LIT";
    case "RI": return c.n === 4 ? "VOCAB" : "INFO";
    case "RF": return aboutSpelling ? "MECH" : "VOCAB";
    case "L": return c.n === 1 ? "GRAMMAR" : c.n === 2 ? "MECH" : c.n === 3 ? "WRITING" : "VOCAB";
    case "W": return "WRITING";
    case "SL": return null;
  }
}

// ------------------------------------------------------------------ skills and wording

const MECH_SKILL = /contraction|homophone|capitali[sz]|punctuat|abbreviat|spelling|\bspell\b|comma|apostrophe|quotation mark|end mark/i;
/** A skill that is Mechanics whatever its standard says. */
export const isMechanicsSkill = (name: string | null | undefined) => MECH_SKILL.test(String(name ?? ""));
/** A skill that mixes Mechanics with something else (“Pronouns, Contractions and Homophones”, “Homographs and
 *  Homophones”): each question decides by its own wording. */
const MIXED_SKILL = /pronoun|homograph|verb|noun|adjective|adverb|grammar|meaning|vocab|word choice/i;
const HOMOPHONES = [["its", "it's"], ["their", "there", "they're"], ["your", "you're"], ["whose", "who's"], ["to", "too", "two"], ["hear", "here"], ["our", "hour"], ["weather", "whether"], ["know", "no"], ["right", "write"], ["buy", "by", "bye"], ["new", "knew"], ["which", "witch"], ["for", "four"], ["sea", "see"], ["won", "one"], ["ate", "eight"], ["flower", "flour"], ["wear", "where"], ["peace", "piece"], ["pair", "pear"], ["break", "brake"], ["tail", "tale"], ["sun", "son"], ["week", "weak"], ["road", "rode"], ["mail", "male"], ["plain", "plane"], ["threw", "through"], ["allowed", "aloud"]];
/** The question itself is about spelling, punctuation, capitals, contractions or homophones. */
export function mechanicsWording(stem: string, options: string[] = []): boolean {
  // the question asks about it (an answer choice that merely mentions spelling does not count)
  if (/contraction|homophone|apostrophe|\bspell|misspell|capital|punctuat|\bcomma|quotation mark/i.test(stem)) return true;
  if (options.some((o) => /\b[a-z]+'(?:s|re|ll|ve|t|d|m)\b/i.test(o)) && /it's|they're|you're|who's|can't|won't|don't|isn't|we're|let's/i.test(options.join(" "))) return true;
  const opts = options.map((o) => o.trim().toLowerCase().replace(/[.!?]$/, ""));
  return HOMOPHONES.some((g) => opts.filter((o) => g.includes(o)).length >= 2);
}

/** The skill category (or Curriculum Map category) → an area. */
export function areaFromCategory(category: string | null | undefined, genre?: string | null): AreaKey | null {
  const c = String(category ?? "").toUpperCase();
  if (!c) return null;
  if (/VOCAB|WORD_STUDY|PHONICS|CONCEPT_VOCABULARY/.test(c)) return "VOCAB";
  if (c === "GRAMMAR") return "GRAMMAR";
  if (c === "MECHANICS" || c === "SPELLING") return "MECH";
  if (c === "WRITING") return "WRITING";
  if (c === "INFORMATIONAL" || c === "INFORMATIONAL_TEXT") return "INFO";
  if (c === "LITERARY" || c === "LITERATURE" || c === "LITERARY_TEXT") return "LIT";
  if (genre) return /expository|argument|biograph|nonfiction|informational|persuasive|article|science|history/i.test(genre) ? "INFO" : "LIT";
  return null;
}

interface Signal { area: AreaKey; n: number; std?: string }
const RULES: { re: RegExp; area: AreaKey; std: string; w: number }[] = [
  // Mechanics
  { re: /\bcapital(?:i[sz]e|i[sz]ed|i[sz]ation)?\b|\bcapital letters?\b|\buppercase\b/i, area: "MECH", std: "L.{g}.2", w: 3 },
  { re: /\bpunctuat|\bcommas?\b|\bapostrophe|\bquotation marks?\b|\bend marks?\b|\bperiod\b(?! of)|\bquestion mark\b|\bexclamation point\b/i, area: "MECH", std: "L.{g}.2", w: 3 },
  { re: /\bspell(?:ed|ing|s)?\b|\bmisspell|\bcontractions?\b|\bhomophones?\b|\babbreviat/i, area: "MECH", std: "L.{g}.2", w: 3 },
  // Grammar, usage
  { re: /\b(?:nouns?|verbs?|adjectives?|adverbs?|pronouns?|prepositions?|prepositional|conjunctions?|interjections?|articles?)\b(?! of the| in the passage)/i, area: "GRAMMAR", std: "L.{g}.1", w: 2 },
  { re: /\bverb tense|\btense\b|\bpast tense\b|\bsubject[- ]verb|\bagreement\b|\bfragment|\brun-on|\bcomplete sentence|\bcompound sentence|\bcomplex sentence|\bmodal|\brelative pronoun|\bprogressive|\bplural\b|\bpossessive\b|\bcorrectly completes? the sentence|\bgrammatically correct/i, area: "GRAMMAR", std: "L.{g}.1", w: 3 },
  // Vocabulary
  { re: /\bwhat does (?:the )?(?:word|phrase)|\bmeaning of\b|\bclosest in meaning|\bmost nearly means?\b|\bwhich word means\b|\bmeans?\b.{0,20}\b(?:word|phrase)\b|\bas (?:it is )?used in\b/i, area: "VOCAB", std: "L.{g}.4", w: 3 },
  { re: /\bsynonyms?|\bantonyms?|\bprefix|\bsuffix|\broot word|\bgreek|\blatin|\bcontext clues?|\bmultiple[- ]meaning|\bdictionary|\bglossary/i, area: "VOCAB", std: "L.{g}.4", w: 3 },
  { re: /\bsimile|\bmetaphor|\bidiom|\bfigurative|\bpersonification|\bhyperbole|\bshades of meaning|\badage|\bproverb/i, area: "VOCAB", std: "L.{g}.5", w: 3 },
  // Writing
  { re: /\btopic sentence|\bconcluding sentence|\bconclusion to\b|\btransition|\bbest order|\brevis|\bcombine(?:s|d)? (?:the |these |two )?sentences|\bdetail should be added|\bbest (?:introduction|opening|closing)|\bwriter'?s? (?:purpose|audience)|\bwhich sentence (?:best )?(?:supports|introduces|concludes)|\bmore precise|\bbest word to replace/i, area: "WRITING", std: "W.{g}.5", w: 3 },
  // Reading: Informational
  { re: /\barticle\b|\bheadings?\b|\bsubheadings?\b|\bcaption|\bdiagram|\btimeline|\bsidebar|\btext features?|\bcentral idea|\bmain idea|\bauthor'?s? (?:purpose|reason|point)|\bcause and effect|\bcompare and contrast|\bchronolog|\bproblem and solution|\binformational|\bnonfiction|\bexperiment|\bscientists?\b|\bhistor/i, area: "INFO", std: "RI.{g}.2", w: 2 },
  // Reading: Literary
  { re: /\bstory\b|\bcharacters?\b|\bnarrator|\bpoem|\bstanza|\bthe theme|\btheme of|\bplot\b|\bsetting\b|\bfable|\bfolktale|\bmyth|\blegend|\bdrama|\bscene\b|\bchapter\b|\bpoint of view|\bprotagonist|\bfeel(?:s|ing)?\b/i, area: "LIT", std: "RL.{g}.3", w: 2 },
];
/** Within Reading, the standard number a question most likely assesses (for the suggestion). */
function readingNumber(text: string): number {
  if (/\btheme|\bcentral idea|\bmain idea|\bsummar/i.test(text)) return 2;
  if (/\bcharacter|\bsetting|\bevent|\bplot|\bcause|\bexplain (?:how|why) /i.test(text)) return 3;
  if (/\bstructure|\bstanza|\bchapter|\bscene|\bheadings?|\btext features?|\bchronolog|\bcompare and contrast|\bproblem and solution|\borganiz/i.test(text)) return 5;
  if (/\bpoint of view|\bnarrator|\bfirst[- ]person|\bthird[- ]person|\bfirsthand|\bsecondhand/i.test(text)) return 6;
  if (/\billustration|\bpicture|\bdiagram|\bchart|\bgraph|\btimeline|\bvisual/i.test(text)) return 7;
  if (/\bevidence|\breasons? (?:the author|to support)|\bsupport (?:the|a|his|her) (?:claim|point|opinion)/i.test(text)) return 8;
  if (/\bboth (?:texts|passages|stories)|\btwo (?:texts|passages|stories)/i.test(text)) return 9;
  return 1;
}
/** The wording → an area and a standard to suggest (with how sure: the strength of the signals). */
export function areaFromText(input: { stem: string; options?: string[]; passage?: string | null; grade: number }): { area: AreaKey; standard: string; sure: number } | null {
  const ask = `${input.stem} ${(input.options ?? []).join(" ")}`;
  const sig = new Map<AreaKey, Signal>();
  for (const r of RULES) {
    // reading signals come from the question; a passage alone (≥ 60 words) leans the reading areas
    if (r.re.test(ask)) { const v = sig.get(r.area) ?? { area: r.area, n: 0, std: r.std }; v.n += r.w; sig.set(r.area, v); }
  }
  const passage = String(input.passage ?? "");
  if (passage.split(/\s+/).length >= 60) {
    const lit = (passage.match(/\b(?:said|asked|smiled|laughed|cried|whispered|shouted|felt|once upon|suddenly|she|he)\b/gi) ?? []).length;
    const info = (passage.match(/\b(?:scientists?|percent|years? ago|according to|for example|in addition|however|because of|energy|species|government|history|invented|discovered)\b/gi) ?? []).length;
    const k: AreaKey = lit >= info ? "LIT" : "INFO";
    const v = sig.get(k) ?? { area: k, n: 0, std: k === "LIT" ? "RL.{g}.1" : "RI.{g}.1" }; v.n += 1; sig.set(k, v);
  }
  const best = [...sig.values()].sort((a, b) => b.n - a.n);
  if (!best.length) return null;
  // vocabulary questions about a word in a reading text keep the reading strand's .4
  const top = best[0];
  let std = String(top.std).replace("{g}", String(input.grade));
  if (top.area === "LIT" || top.area === "INFO") std = `${top.area === "LIT" ? "RL" : "RI"}.${input.grade}.${readingNumber(ask)}`;
  if (top.area === "VOCAB" && passage && /\bas (?:it is )?used in|\bin (?:the )?(?:paragraph|passage|story|article|sentence)\b/i.test(ask)) {
    const lit = sig.get("LIT")?.n ?? 0, info = sig.get("INFO")?.n ?? 0;
    std = `${lit >= info ? "RL" : "RI"}.${input.grade}.4`;
  }
  const second = best[1]?.n ?? 0;
  return { area: top.area, standard: std, sure: top.n - second };
}

// ------------------------------------------------------------------ one question

export type AreaSource = "IMPORT" | "ADMIN" | "SKILL" | "STANDARD" | "SKILL_STANDARD" | "CATEGORY" | "TEXT";
export interface ClassifyInput {
  grade: number | null;
  /** the question's own standard (code as stored) */
  standard: string | null;
  skillName: string | null;
  skillCategory?: string | null;
  /** the skill's standards (codes) */
  skillStandards?: string[];
  stem: string;
  options?: string[];
  passage?: string | null;
  genre?: string | null;
  /** the import file's own MAP columns */
  importTest?: string | null;
  importArea?: string | null;
}
export interface StandardChange { from: string | null; to: string; reason: string; sure: boolean }
export interface Classified { test: MapTest | null; area: AreaKey | null; name: string | null; source: AreaSource | null; standard: StandardChange | null; note: string | null }

/** Same strand and number at the question's grade, when that standard exists there. */
function atGrade(c: Ccss, grade: number): Ccss | null {
  const x = { ...c, grade };
  return ccssExists(x) ? x : null;
}

export function classifyQuestion(q: ClassifyInput): Classified {
  const g = q.grade && q.grade > 0 ? q.grade : null;
  const out = (area: AreaKey | null, source: AreaSource | null, standard: StandardChange | null = null, note: string | null = null): Classified =>
    ({ test: area ? areaByKey(area).test : null, area, name: area ? areaByKey(area).name : null, source, standard, note });
  const own = parseCcss(q.standard);
  const ask = `${q.stem} ${(q.options ?? []).join(" ")}`;
  const aboutSpelling = /\bspell|\bmisspell/i.test(ask) || /spell/i.test(String(q.skillName ?? ""));

  // 1 · the file said it
  const imported = areaFromName(q.importArea);
  if (imported) {
    const t = testFromName(q.importTest);
    if (!t || t === areaByKey(imported).test) return out(imported, "IMPORT");
  }

  // the standard itself: written wrongly, another grade, or a code that does not exist at the grade
  let fix: StandardChange | null = null;
  let std = own;
  if (q.standard && String(q.standard).trim()) {
    if (!own) fix = null;   // not a CCSS code at all (e.g. a school objective): left alone, the rest decides
    else if (g && own.grade !== g) {
      const moved = atGrade(own, g);
      if (moved) { fix = { from: String(q.standard), to: ccssCode(moved), reason: `Grade ${own.grade} standard on a Grade ${g} question`, sure: true }; std = moved; }
    } else if (!ccssExists(own)) {
      fix = null; std = null;   // e.g. RL.4.8: decided below from the skill / wording
    } else if (ccssCode(own) !== String(q.standard).replace(/^CCSS\.ELA-LITERACY\./i, "")) {
      // only the way it was written: keep the stored code (the platform reads both)
    }
  }

  // 2 · a Mechanics skill (whatever its standard says)
  const mixed = isMechanicsSkill(q.skillName) && MIXED_SKILL.test(String(q.skillName ?? ""));
  if (isMechanicsSkill(q.skillName) && !(own?.strand === "W") && (!mixed || mechanicsWording(q.stem, q.options))) {
    if (g && (!std || !(std.strand === "L" && std.n === 2)) && !(std?.strand === "RF" && aboutSpelling)) fix = { from: q.standard ? String(q.standard) : null, to: `L.${g}.2`, reason: `“${q.skillName}” is a Mechanics skill`, sure: true };
    return out("MECH", "SKILL", fix);
  }

  // 3 · the question's own standard
  if (std) { const a = areaFromCcss(std, aboutSpelling); if (a) return out(a, "STANDARD", fix); }

  // 4 · the skill's standards (the one of this grade first)
  const skillStds = (q.skillStandards ?? []).map(parseCcss).filter((x): x is Ccss => Boolean(x) && ccssExists(x!));
  const pick = (g ? skillStds.find((x) => x.grade === g) : null) ?? skillStds[0];
  if (pick) {
    const a = areaFromCcss(g && pick.grade !== g ? atGrade(pick, g) ?? pick : pick, aboutSpelling);
    if (a) {
      const code = g ? ccssCode(atGrade(pick, g) ?? pick) : ccssCode(pick);
      const why = !q.standard ? "No standard: the skill’s standard" : own && !ccssExists(own) ? `${ccssCode(own)} does not exist: the skill’s standard` : null;
      return out(a, "SKILL_STANDARD", why ? { from: q.standard ? String(q.standard) : null, to: code, reason: why, sure: true } : fix);
    }
  }

  // 5 · the skill's category or the Curriculum Map place
  const byCat = areaFromCategory(q.skillCategory, q.genre);
  const text = g ? areaFromText({ stem: q.stem, options: q.options, passage: q.passage, grade: g }) : null;
  if (byCat) {
    const suggest = text && text.area === byCat ? text.standard : g ? defaultStandard(byCat, g) : null;
    return out(byCat, "CATEGORY", suggest && (!own || !ccssExists(own)) ? { from: q.standard ? String(q.standard) : null, to: suggest, reason: "No usable standard: suggested from the skill category and the wording", sure: false } : fix);
  }

  // 6 · the wording (always a suggestion to check)
  if (text) return out(text.area, "TEXT", { from: q.standard ? String(q.standard) : null, to: text.standard, reason: "No usable standard: suggested from the wording of the question", sure: false }, text.sure <= 1 ? "Few clues in the wording: please check" : null);
  return out(null, null, null, !g ? "The question has no grade (its skill is not in a grade’s curriculum)" : "No standard, no skill standard and no clue in the wording");
}

export function defaultStandard(area: AreaKey, grade: number): string {
  return { LIT: `RL.${grade}.1`, INFO: `RI.${grade}.1`, VOCAB: `L.${grade}.4`, GRAMMAR: `L.${grade}.1`, MECH: `L.${grade}.2`, WRITING: `W.${grade}.5` }[area];
}
