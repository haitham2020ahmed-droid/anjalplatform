/**
 * Question-bank import, step 2: turn extracted content into detected questions.
 * Deterministic rules handle the common layouts; AI (question-understanding.ts) is used for
 * what the rules cannot read and to map questions to skills and standards.
 *
 * Supported layouts include:
 *   table:  Question | A | B | C | D | Answer   (also Option 1…, Choices "x|y|z", Type, Level…)
 *   text:   1. What is 2+2?            Q1: Choose the correct answer:
 *           A) 3   B) 4 …              The sun ____ in the east.
 *           Answer: B                  a) rise  b) rises  c) rising
 *   json:   [{ "question": …, "options": [...], "answer": … }] or { "questions": [...] }
 */
import type { QuestionTypeCode } from "./validate";

export interface DetectedOption { label: string; text: string; correct: boolean }

export interface DetectedQuestion {
  source: string;
  type: QuestionTypeCode;
  stem: string;
  options?: DetectedOption[];
  answer?: boolean;
  answers?: string[];
  sequence?: string[];
  segments?: string[];
  errorIndex?: number;
  correction?: string;
  pairs?: { left: string; right: string }[];
  explanation?: string;
  tip?: string;
  level?: number;
  cognitiveLevel?: string;
  grade?: number;
  subject?: string;
  unit?: string;
  lesson?: string;
  skill?: string;
  standard?: string;
  /** problems found while reading (missing answer, unknown type…) */
  problems: string[];
}

const LETTERS = "ABCDEFGH";
const clean = (s: unknown) => String(s ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

// ------------------------------------------------------------------ helpers

const TYPE_WORDS: [RegExp, QuestionTypeCode][] = [
  [/multi[\s_-]*(select|ple[\s_-]*answer|ple[\s_-]*response)|select all|choose (two|all)/i, "MULTI_SELECT"],
  [/true|false|t\/f/i, "TRUE_FALSE"],
  [/drop[\s_-]*down/i, "DROPDOWN"],
  [/fill|blank|gap|cloze/i, "FILL_BLANK"],
  [/match/i, "MATCHING"],
  [/word[\s_-]*order/i, "WORD_ORDER"],
  [/order|sequence|arrange/i, "SENTENCE_ORDER"],
  [/error|correct(ion)? the|mistake/i, "ERROR_CORRECTION"],
  [/short|open|written|constructed/i, "SHORT_ANSWER"],
  [/multiple|mcq|choice|single/i, "MULTIPLE_CHOICE"],
];
export function typeFromText(s: string): QuestionTypeCode | null {
  const t = s.trim();
  if (!t) return null;
  const exact = t.toUpperCase().replace(/[\s-]+/g, "_");
  if (["MULTIPLE_CHOICE", "MULTI_SELECT", "TRUE_FALSE", "DROPDOWN", "FILL_BLANK", "SENTENCE_ORDER", "WORD_ORDER", "ERROR_CORRECTION", "MATCHING", "SHORT_ANSWER"].includes(exact)) return exact as QuestionTypeCode;
  return TYPE_WORDS.find(([re]) => re.test(t))?.[1] ?? null;
}

export function levelFromText(s: string): number | undefined {
  const t = clean(s).toLowerCase();
  if (!t) return undefined;
  const n = Number(t.match(/\d+/)?.[0]);
  if (/very easy|beginner/.test(t)) return 1;
  if (/easy|low|basic/.test(t)) return 2;
  if (/medium|moderate|average|mid/.test(t)) return 4;
  if (/very hard|advanced|expert/.test(t)) return 7;
  if (/hard|difficult|high|challeng/.test(t)) return 6;
  if (Number.isFinite(n) && n >= 1) return Math.min(7, Math.max(1, /\/\s*5|of 5|out of 5/.test(t) ? Math.round(1 + ((n - 1) * 6) / 4) : n));
  return undefined;
}

const hasBlank = (s: string) => /_{2,}|\[\s*blank\s*\]|\(\s*\)|…{2,}|\.{4,}/i.test(s);
const isTrueFalse = (opts: string[]) => opts.length === 2 && opts.map((o) => o.toLowerCase().replace(/[^a-z]/g, "")).sort().join(",") === "false,true";
const tf = (s: string): boolean | undefined => (/^(t|true|yes|correct)$/i.test(s.trim()) ? true : /^(f|false|no|incorrect)$/i.test(s.trim()) ? false : undefined);

/** Marks the correct option(s) from an answer like "B", "b)", "A, C", "2", "option b" or the option text. */
export function resolveAnswer(options: DetectedOption[], answerRaw: string): { indices: number[]; problem?: string } {
  const a = clean(answerRaw);
  if (!a) return { indices: [] };
  const byText = options.findIndex((o) => o.text.toLowerCase() === a.toLowerCase());
  if (byText >= 0) return { indices: [byText] };
  const stripped = a.replace(/^(option|choice|letter|answer)\s*/i, "");
  const letters = stripped.match(/^\(?([A-Ha-h])\)?(?:\s*(?:,|&|and|\/|;)\s*\(?([A-Ha-h])\)?)*\s*[.)]?(?:\s|$|[:\-–])/);
  if (letters) {
    const all = [...stripped.matchAll(/\b([A-Ha-h])\b/g)].map((m) => LETTERS.indexOf(m[1].toUpperCase())).filter((i) => i >= 0 && i < options.length);
    const unique = [...new Set(all.length ? all : [LETTERS.indexOf(letters[1].toUpperCase())])];
    if (unique.every((i) => i >= 0 && i < options.length)) return { indices: unique };
  }
  const num = stripped.match(/^(\d)(?:\s*(?:,|and)\s*(\d))*$/);
  if (num) {
    const idx = [...stripped.matchAll(/\d/g)].map((m) => Number(m[0]) - 1).filter((i) => i >= 0 && i < options.length);
    if (idx.length) return { indices: [...new Set(idx)] };
  }
  const starts = options.findIndex((o) => a.toLowerCase().startsWith(o.text.toLowerCase()) || o.text.toLowerCase().startsWith(a.toLowerCase()));
  if (starts >= 0 && a.length >= 2) return { indices: [starts] };
  return { indices: [], problem: `the answer “${a}” does not match any option` };
}

const markCorrect = (o: string): { text: string; correct: boolean } => {
  const m = o.match(/^\s*\*\s*(.+)$|^(.+?)\s*(\*|\(correct\)|✓|✔)\s*$/i);
  return m ? { text: clean(m[1] ?? m[2]), correct: true } : { text: clean(o), correct: false };
};

/** Builds a detected question from loose parts (shared by table, JSON and text parsers). */
export function buildQuestion(p: {
  source: string; stem: string; options: string[]; answer?: string; explanation?: string; typeHint?: string; level?: string;
  grade?: string; subject?: string; unit?: string; lesson?: string; skill?: string; standard?: string; cognitive?: string;
  pairs?: { left: string; right: string }[]; correction?: string;
}): DetectedQuestion {
  const problems: string[] = [];
  const stem = clean(p.stem);
  let options: DetectedOption[] = p.options.map(markCorrect).filter((o) => o.text).map((o, i) => ({ label: LETTERS[i], text: o.text, correct: o.correct }));
  const hinted = p.typeHint ? typeFromText(p.typeHint) : null;
  if (p.typeHint && !hinted) problems.push(`unknown question type “${p.typeHint}”`);
  const answer = clean(p.answer);
  const base: DetectedQuestion = {
    source: p.source, type: "MULTIPLE_CHOICE", stem, problems,
    explanation: p.explanation ? clean(p.explanation) : undefined, level: p.level ? levelFromText(p.level) : undefined,
    grade: p.grade ? Number(String(p.grade).match(/\d+/)?.[0]) || undefined : undefined,
    subject: p.subject ? clean(p.subject) : undefined, unit: p.unit ? clean(p.unit) : undefined, lesson: p.lesson ? clean(p.lesson) : undefined,
    skill: p.skill ? clean(p.skill) : undefined, standard: p.standard ? clean(p.standard) : undefined, cognitiveLevel: p.cognitive ? clean(p.cognitive) : undefined,
  };
  if (!stem) problems.push("question text is missing");

  // matching
  if (hinted === "MATCHING" || (p.pairs && p.pairs.length)) {
    const pairs = p.pairs?.length ? p.pairs : options.map((o) => o.text.split(/\s*(?:=|->|→|—|–| - )\s*/)).filter((x) => x.length === 2).map(([left, right]) => ({ left, right }));
    if (pairs.length < 3) problems.push("matching needs at least 3 pairs (written as “left = right”)");
    return { ...base, type: "MATCHING", pairs };
  }
  // true / false
  if (hinted === "TRUE_FALSE" || isTrueFalse(options.map((o) => o.text)) || (!options.length && tf(answer) !== undefined)) {
    let value = tf(answer);
    if (value === undefined && options.length === 2) {
      const r = resolveAnswer(options, answer);
      if (r.indices.length === 1) value = /^t/i.test(options[r.indices[0]].text);
      else if (options.some((o) => o.correct)) value = /^t/i.test(options.find((o) => o.correct)!.text);
    }
    if (value === undefined) problems.push("no correct answer (true or false) found");
    return { ...base, type: "TRUE_FALSE", answer: value };
  }
  // ordering
  if (hinted === "SENTENCE_ORDER" || hinted === "WORD_ORDER") {
    let seq = options.map((o) => o.text);
    if (answer) {
      const order = [...answer.matchAll(/\b([A-Ha-h])\b|\b(\d)\b/g)].map((m) => (m[1] ? LETTERS.indexOf(m[1].toUpperCase()) : Number(m[2]) - 1));
      if (order.length === seq.length && new Set(order).size === seq.length && order.every((i) => i >= 0 && i < seq.length)) seq = order.map((i) => seq[i]);
    }
    if (seq.length < 3) problems.push("ordering needs at least 3 items");
    return { ...base, type: hinted, sequence: seq };
  }
  // error correction: options are the sentence parts; answer = the wrong part; correction given
  if (hinted === "ERROR_CORRECTION") {
    const r = resolveAnswer(options, answer.split(/[:\-–→]/)[0]);
    const correction = clean(p.correction ?? answer.split(/[:\-–→]/).slice(1).join(" "));
    if (r.indices.length !== 1) problems.push("say which part has the error (e.g. “Answer: B”)");
    if (!correction) problems.push("give the correction (e.g. “Correction: goes”)");
    return { ...base, type: "ERROR_CORRECTION", segments: options.map((o) => o.text), errorIndex: r.indices[0], correction };
  }
  // no options: fill-in, true/false, or short answer
  if (!options.length) {
    if (!answer) problems.push("no answer found");
    const answers = answer ? answer.split(/\s*(?:\/|;|\bor\b)\s*/i).filter(Boolean) : [];
    if (hinted === "FILL_BLANK" || (hasBlank(stem) && hinted !== "SHORT_ANSWER")) return { ...base, type: "FILL_BLANK", answers };
    return { ...base, type: hinted === "SHORT_ANSWER" || !hinted ? "SHORT_ANSWER" : hinted, answers };
  }
  // options: MC / multi-select / dropdown
  if (!options.some((o) => o.correct) && answer) {
    const r = resolveAnswer(options, answer);
    if (r.problem) problems.push(r.problem);
    options = options.map((o, i) => ({ ...o, correct: r.indices.includes(i) }));
  }
  const nCorrect = options.filter((o) => o.correct).length;
  if (!nCorrect) problems.push("no correct answer found");
  if (options.length < 2) problems.push("needs at least 2 answer choices");
  const type: QuestionTypeCode = hinted === "MULTI_SELECT" || nCorrect > 1 ? "MULTI_SELECT" : hinted === "DROPDOWN" || (hasBlank(stem) && hinted !== "MULTIPLE_CHOICE") ? "DROPDOWN" : "MULTIPLE_CHOICE";
  if (type === "MULTI_SELECT" && nCorrect < 2) problems.push("multi-select needs 2 or more correct answers");
  return { ...base, type, options };
}

// ------------------------------------------------------------------ tables

const HEADER_ALIASES: Record<string, RegExp> = {
  stem: /^(question( text)?|stem|prompt|item|q|question stem)$/,
  answer: /^(answer|correct( answer| option)?|key|answer key|solution|right answer)$/,
  explanation: /^(explanation|rationale|reason|feedback|why)$/,
  type: /^(type|question type|format|item type)$/,
  level: /^(difficulty|level|difficulty level)$/,
  grade: /^(grade|grade level|class)$/,
  subject: /^(subject|course)$/,
  unit: /^(unit|module|chapter)$/,
  lesson: /^(lesson|week)$/,
  skill: /^(skill|skill code|objective|topic)$/,
  standard: /^(standard|standards|ccss|standard code)$/,
  cognitive: /^(cognitive level|bloom|bloom'?s level|dok)$/,
  choices: /^(options|choices|answers|answer choices)$/,
  correction: /^(correction|corrected)$/,
};
const normHeader = (h: string) => clean(h).toLowerCase().replace(/[_*:#]/g, " ").replace(/\s+/g, " ").trim();
const optionHeader = (h: string): number => {
  const n = normHeader(h);
  const m = n.match(/^(?:option|choice|answer|opt|distractor)?\s*([a-h]|\d)\)?$/);
  if (!m) return -1;
  return /\d/.test(m[1]) ? Number(m[1]) - 1 : LETTERS.indexOf(m[1].toUpperCase());
};

export function parseTable(rows: string[][]): { questions: DetectedQuestion[]; problems: string[] } {
  const headerAt = rows.findIndex((r) => r.some((c) => HEADER_ALIASES.stem.test(normHeader(c))));
  if (headerAt < 0) return { questions: [], problems: ["no “Question” column found in the header row"] };
  const header = rows[headerAt];
  const col: Record<string, number> = {};
  const optCols: [number, number][] = [];
  header.forEach((h, i) => {
    const n = normHeader(h);
    const key = Object.entries(HEADER_ALIASES).find(([, re]) => re.test(n))?.[0];
    if (key && col[key] === undefined) col[key] = i;
    else {
      const o = optionHeader(h);
      if (o >= 0) optCols.push([o, i]);
    }
  });
  optCols.sort((a, b) => a[0] - b[0]);
  const questions: DetectedQuestion[] = [];
  rows.slice(headerAt + 1).forEach((r, k) => {
    if (r.every((c) => !clean(c))) return;
    const get = (key: string) => (col[key] !== undefined ? clean(r[col[key]]) : "");
    let options = optCols.map(([, i]) => clean(r[i])).filter(Boolean);
    if (!options.length && get("choices")) options = get("choices").split(/\s*[|;\n]\s*/).filter(Boolean);
    const pairs = /match/i.test(get("type")) ? options.map((o) => o.split(/\s*(?:=|->|→)\s*/)).filter((x) => x.length === 2).map(([left, right]) => ({ left, right })) : undefined;
    questions.push(buildQuestion({
      source: `row ${headerAt + k + 2}: ${r.map(clean).filter(Boolean).join(" | ")}`.slice(0, 2000),
      stem: get("stem"), options, answer: get("answer"), explanation: get("explanation"), typeHint: get("type") || undefined, level: get("level"),
      grade: get("grade"), subject: get("subject"), unit: get("unit"), lesson: get("lesson"), skill: get("skill"), standard: get("standard"), cognitive: get("cognitive"),
      pairs, correction: get("correction"),
    }));
  });
  return { questions, problems: [] };
}

// -------------------------------------------------------------------- JSON

export function parseJson(data: unknown): { questions: DetectedQuestion[]; problems: string[] } {
  const list = Array.isArray(data) ? data : (["questions", "items", "data", "questionBank", "bank"].map((k) => (data as Record<string, unknown>)?.[k]).find(Array.isArray) as unknown[] | undefined);
  if (!list) return { questions: [], problems: ["the JSON has no list of questions (expected an array, or { \"questions\": [...] })"] };
  const pick = (o: Record<string, unknown>, ...keys: string[]) => {
    const lower = Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase().replace(/[_\s-]/g, ""), v]));
    for (const k of keys) if (lower[k] !== undefined && lower[k] !== null) return lower[k];
    return undefined;
  };
  const questions = list.map((raw, i) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    const optsRaw = pick(o, "options", "choices", "answers", "alternatives");
    let options: string[] = [];
    if (Array.isArray(optsRaw)) options = optsRaw.map((x) => (typeof x === "object" && x ? `${String(pick(x as Record<string, unknown>, "text", "label", "value", "option") ?? "")}${pick(x as Record<string, unknown>, "correct", "iscorrect") ? " *" : ""}` : String(x)));
    else if (optsRaw && typeof optsRaw === "object") options = Object.entries(optsRaw as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => String(v));
    for (const L of "abcdefgh") {
      const v = pick(o, L, `option${L}`, `choice${L}`);
      if (v !== undefined && !Array.isArray(optsRaw)) options.push(String(v));
    }
    const pairsRaw = pick(o, "pairs", "matches");
    const pairs = Array.isArray(pairsRaw) ? pairsRaw.map((p) => (Array.isArray(p) ? { left: String(p[0]), right: String(p[1]) } : { left: String(pick(p as Record<string, unknown>, "left", "term", "a") ?? ""), right: String(pick(p as Record<string, unknown>, "right", "definition", "b") ?? "") })) : undefined;
    const seq = pick(o, "sequence", "order", "correctorder");
    const ans = pick(o, "answer", "correct", "correctanswer", "key", "solution");
    return buildQuestion({
      source: JSON.stringify(raw).slice(0, 2000), stem: String(pick(o, "question", "stem", "prompt", "text", "q") ?? ""),
      options: Array.isArray(seq) ? seq.map(String) : options, answer: Array.isArray(ans) ? ans.join(",") : ans === undefined ? "" : String(ans),
      explanation: pick(o, "explanation", "rationale", "feedback") as string | undefined, typeHint: (pick(o, "type", "questiontype", "format") as string | undefined) ?? (Array.isArray(seq) ? "SENTENCE_ORDER" : undefined),
      level: String(pick(o, "difficulty", "level") ?? ""), grade: String(pick(o, "grade", "gradelevel") ?? ""), subject: pick(o, "subject") as string | undefined,
      unit: pick(o, "unit") as string | undefined, lesson: pick(o, "lesson") as string | undefined, skill: pick(o, "skill", "skillcode") as string | undefined,
      standard: pick(o, "standard", "standardcode", "ccss") as string | undefined, cognitive: pick(o, "cognitivelevel", "bloom", "dok") as string | undefined,
      pairs, correction: pick(o, "correction") as string | undefined,
    });
  });
  return { questions, problems: [] };
}

// -------------------------------------------------------------------- text

const Q_START = /^\s*(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.):\-–]\s*(.*)$/i;
const OPT = /^\s*\(?([A-Ha-h])\s*[).:\]]\s+(.+)$/;
const ANSWER = /^\s*(?:correct\s+answer|answer\s*key|answer|ans|key|correct)\s*[:\-–=]\s*(.+)$/i;
const EXPLAIN = /^\s*(?:explanation|rationale|reason|feedback|why)\s*[:\-–]\s*(.+)$/i;
const META = /^\s*(type|question type|difficulty|level|grade|subject|unit|lesson|skill|standard|cognitive level|bloom|correction)\s*[:\-–]\s*(.+)$/i;
const PAIR = /^\s*(?:[-•*]\s*)?(.+?)\s*(?:=|->|→)\s*(.+)$/;

/** Splits "A) 3 B) 4 C) 5" written on one line into separate options. */
function inlineOptions(line: string): string[] | null {
  const parts = line.split(/\s+(?=\(?[A-H][).]\s)/);
  if (parts.length >= 2 && parts.every((p) => OPT.test(p))) return parts;
  return null;
}

export function parseLines(lines: string[]): { questions: DetectedQuestion[]; problems: string[] } {
  const blocks: string[][] = [];
  let cur: string[] | null = null;
  for (const raw of lines) {
    const line = raw.replace(/\u00a0/g, " ");
    if (Q_START.test(line) && !OPT.test(line)) {
      if (cur) blocks.push(cur);
      cur = [line];
    } else if (cur) cur.push(line);
    else if (line.trim() && !blocks.length) cur = [line]; // a file that starts without numbering
  }
  if (cur) blocks.push(cur);
  // if there is no numbering at all, fall back to blank-line separated blocks
  const numbered = blocks.filter((b) => Q_START.test(b[0]));
  const source = numbered.length ? numbered : lines.join("\n").split(/\n\s*\n/).map((b) => b.split("\n"));
  const questions: DetectedQuestion[] = [];
  for (const block of source) {
    const ls = block.map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!ls.length) continue;
    const first = ls[0].match(Q_START);
    const stemParts: string[] = [first ? first[2] : ls[0]];
    const options: string[] = [];
    const pairs: { left: string; right: string }[] = [];
    let answer = "", explanation = "";
    const meta: Record<string, string> = {};
    for (const l of ls.slice(1)) {
      const inl = inlineOptions(l);
      let m: RegExpMatchArray | null;
      if ((m = l.match(ANSWER))) answer = m[1];
      else if ((m = l.match(EXPLAIN))) explanation = m[1];
      else if ((m = l.match(META))) meta[m[1].toLowerCase()] = m[2];
      else if (inl) options.push(...inl.map((p) => p.match(OPT)![2]));
      else if ((m = l.match(OPT))) options.push(m[2]);
      else if (/match/i.test(stemParts.join(" ")) && (m = l.match(PAIR))) pairs.push({ left: clean(m[1]), right: clean(m[2]) });
      else if (!options.length) stemParts.push(l.trim());
      else if (explanation) explanation += " " + l.trim();
      else options[options.length - 1] += " " + l.trim();
    }
    const stem = stemParts.filter(Boolean).join(" ");
    if (!stem.trim() && !options.length) continue;
    // unnumbered text must look like a question (options, an answer, a question mark or a blank)
    if (!first && !options.length && !answer && !pairs.length && !/\?|_{2,}/.test(stem)) continue;
    questions.push(buildQuestion({
      source: ls.join("\n").slice(0, 2000), stem, options, answer, explanation,
      typeHint: meta["type"] ?? meta["question type"] ?? (pairs.length ? "MATCHING" : /put .* in order|correct order|arrange/i.test(stem) && options.length >= 3 ? "SENTENCE_ORDER" : /find the (error|mistake)|which part .* (error|mistake)/i.test(stem) && options.length >= 2 ? "ERROR_CORRECTION" : /select (all|two)|choose (all|two)/i.test(stem) ? "MULTI_SELECT" : undefined),
      level: meta["difficulty"] ?? meta["level"], grade: meta["grade"], subject: meta["subject"], unit: meta["unit"], lesson: meta["lesson"],
      skill: meta["skill"], standard: meta["standard"], cognitive: meta["cognitive level"] ?? meta["bloom"], pairs: pairs.length ? pairs : undefined, correction: meta["correction"],
    }));
  }
  return { questions, problems: questions.length ? [] : ["no questions were recognized in the text"] };
}
