/**
 * Practice items: load from the DB into a scoring model, and build the SAFE
 * payload sent to the browser (no keys, no rationales, no explanations).
 */
import { createHash } from "node:crypto";
import { combineGuidance, errorKey, isClassicErrorItem, readErrorResponse, storedParts, twoPartScores, scoreResponse, type BankItem, type BankOption, type QuestionTypeCode } from "../../imports/questions/validate";
import { chosenMisconception } from "../../insights/misconceptions";
import type { CandidateItem } from "../../types/domain";
import type { Repo, Row } from "../seeding/repo";
import { bankVersion } from "../cache/bank-version";
import { heldBackQuestionIds } from "../questions/held-back";
import { diagnoseSpelling } from "../word-study/spelling-diagnosis";
import { encodeSpeech } from "../word-study/speech-code";
import { effectiveGuessing } from "../../adaptive/guessing";

export interface PracticeItem extends BankItem {
  questionId: string;
  passageText: string | null;
  passageTitle: string | null;
  hint: string | null;
  /** optional picture (diagram, chart…) shown with the question */
  image: { id: string; alt: string } | null;
}

/** What the student's browser receives. Contains nothing that reveals the answer. */
export interface ClientQuestion {
  questionId: string;
  type: QuestionTypeCode;
  stem: string;
  level: number;
  passage: { title: string; text: string } | null;
  image: { url: string; alt: string } | null;
  options?: { label: string; text: string }[];
  multiple?: boolean;
  elements?: string[]; // ordering: shuffled
  segments?: string[]; // error correction
  left?: string[]; // matching
  right?: string[]; // matching: shuffled
  /** ERROR_CORRECTION (newer items): a “No error” choice, a typed fix after the tap, several errors */
  errorMode?: { noError: boolean; typeFix: boolean; multiple: boolean };
  /** TWO_PART: Part A and Part B, shown together (no key) */
  parts?: { a: { stem: string; options: { label: string; text: string }[] }; b: { stem: string; options: { label: string; text: string }[]; multiple: boolean } };
  /** GRID: rows and columns (one choice per row) */
  grid?: { rows: { id: string; text: string }[]; columns: { id: string; text: string }[] };
  /** HOT_TEXT: the excerpt's selectable sentences */
  hot?: { segments: { id: string; text: string }[]; maxSelect: number };
  /** DICTATION: what the browser says, scrambled with the question id (src/server/word-study/speech-code.ts) */
  dictation?: { say: string; hasSentence: boolean };
  /** SENTENCE_COMBINE: the short sentences to join and the joining word to use (no accepted answers) */
  combine?: { sentences: string[]; connector: string | null };
  hasHint: boolean;
}

const str = (v: unknown) => String(v ?? "");

/**
 * In-memory cache of each skill's published items (performance: practice used to rebuild them from
 * six tables on every answer). An entry is used only while the bank version is unchanged (any write
 * to the question tables in this process changes it) and for at most ITEM_CACHE_MS (covers changes
 * made by another process, e.g. the item-statistics job). Callers get their own copy.
 */
const ITEM_CACHE_MS = 60_000;
const ITEM_CACHE_MAX = 500;
const itemCache = new Map<string, { version: number; at: number; items: PracticeItem[] }>();

/** Load every PUBLISHED item for a skill (cached; batched on a miss: one query per table). */
export async function loadSkillItems(repo: Repo, skillId: string): Promise<PracticeItem[]> {
  const hit = itemCache.get(skillId);
  if (hit && hit.version === bankVersion() && Date.now() - hit.at < ITEM_CACHE_MS) return structuredClone(hit.items);
  const version = bankVersion();
  const items = await loadItemsForSkills(repo, [skillId]);
  if (itemCache.size >= ITEM_CACHE_MAX) itemCache.clear();
  itemCache.set(skillId, { version, at: Date.now(), items: structuredClone(items) });
  return items;
}

/** Load every PUBLISHED item for several skills at once (used by placement checks). */
export async function loadItemsForSkills(repo: Repo, skillIds: string[]): Promise<PracticeItem[]> {
  if (!skillIds.length) return [];
  const qs = await repo.findMany("Question", { skillId: { in: skillIds }, status: "PUBLISHED", deletedAt: null });
  return buildItems(repo, qs, true);
}

/** Specific PUBLISHED questions (a teacher's question set), in the order given. Missing ones are skipped. */
export async function loadQuestionItems(repo: Repo, questionIds: string[]): Promise<PracticeItem[]> {
  if (!questionIds.length) return [];
  const qs = await repo.findMany("Question", { id: { in: questionIds }, status: "PUBLISHED", deletedAt: null });
  const items = await buildItems(repo, qs);
  const pos = new Map(questionIds.map((id, i) => [id, i]));
  return items.sort((a, b) => (pos.get(a.questionId) ?? 0) - (pos.get(b.questionId) ?? 0));
}

async function buildItems(repo: Repo, qs: Row[], holdBack = false): Promise<PracticeItem[]> {
  // holdBack (adaptive pools only, never a teacher's own set): misleading questions are held back, see below
  if (!qs.length) return [];
  const ids = qs.map((q) => q.id);
  const [opts, answers, expl, types] = await Promise.all([
    repo.findMany("QuestionOption", { questionId: { in: ids } }),
    repo.findMany("QuestionAnswer", { questionId: { in: ids } }),
    repo.findMany("QuestionExplanation", { questionId: { in: ids } }),
    repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => q.typeId))] } }),
  ]);
  const passageIds = [...new Set(qs.map((q) => q.passageId).filter(Boolean))];
  const passages = passageIds.length ? await repo.findMany("ReadingPassage", { id: { in: passageIds } }) : [];
  const typeCode = new Map(types.map((t) => [str(t.id), str(t.code) as QuestionTypeCode]));
  const passage = new Map(passages.map((p) => [str(p.id), p]));
  // images: only the description is read here (the picture itself is served separately)
  const imageIds = [...new Set(qs.map((q) => q.imageId).filter(Boolean))];
  const imageAlt = new Map((imageIds.length ? await repo.findMany("QuestionImage", { id: { in: imageIds } }, { select: ["id", "altText"] }) : []).map((x) => [str(x.id), str(x.altText ?? "")]));
  // adaptive practice needs automatic scoring: teacher-scored types (SHORT_ANSWER) are never served
  const autoScored = new Set(types.filter((t) => t.isAutoScored !== false && t.code !== "SHORT_ANSWER").map((t) => str(t.id)));
  // 🔁 question effectiveness: a question whose data says it misleads (strong students miss it more, or the key looks
  // wrong) is held back for review while the skill has 4+ other questions
  const stats = holdBack ? await repo.findMany("QuestionStats", { questionId: { in: ids } }, { select: ["questionId", "flags"] }) : [];
  const bad = new Set(stats.filter((x) => { const f = typeof x.flags === "string" ? JSON.parse(x.flags) : x.flags; return Array.isArray(f) && f.some((k) => k === "NEGATIVE_DISCRIMINATION" || k === "POSSIBLE_KEY_ERROR"); }).map((x) => str(x.questionId)));
  if (holdBack) for (const id of await heldBackQuestionIds(repo, qs.map((q) => str(q.id)))) bad.add(id); // open data alerts (src/server/questions/reclassify.ts)
  const perSkill = new Map<string, number>();
  for (const q of qs) if (!bad.has(str(q.id))) perSkill.set(str(q.skillId), (perSkill.get(str(q.skillId)) ?? 0) + 1);
  qs = qs.filter((q) => !bad.has(str(q.id)) || (perSkill.get(str(q.skillId)) ?? 0) < 4);
  return qs.filter((q) => autoScored.has(str(q.typeId))).map((q) => ({ ...toPracticeItem(q, opts, answers, expl, typeCode, passage), image: q.imageId && imageAlt.has(str(q.imageId)) ? { id: str(q.imageId), alt: imageAlt.get(str(q.imageId))! } : null, skillKey: String(q.skillId) }));
}

function toPracticeItem(q: Row, opts: Row[], answers: Row[], expl: Row[], typeCode: Map<string, QuestionTypeCode>, passage: Map<string, Row>): PracticeItem {
  const type = typeCode.get(str(q.typeId))!;
  const content = (q.content ?? {}) as Record<string, unknown>;
  const ans = answers.filter((a) => a.questionId === q.id).map((a) => a.value);
  const ex = expl.filter((e) => e.questionId === q.id);
  const text = (kind: string) => {
    const body = ex.find((e) => e.kind === kind)?.body as { text?: string }[] | undefined;
    return body?.map((b) => b.text ?? "").join(" ").trim() ?? "";
  };
  const options: BankOption[] | undefined = ["MULTIPLE_CHOICE", "MULTI_SELECT", "DROPDOWN"].includes(type)
    ? opts.filter((o) => o.questionId === q.id).sort((a, b) => Number(a.order) - Number(b.order))
        .map((o) => ({ label: str(o.label), text: str(o.text), correct: Boolean(o.isCorrect), rationale: o.rationale ? str(o.rationale) : null, misconception: o.misconception ? str(o.misconception) : null }))
    : undefined;
  const p = q.passageId ? passage.get(str(q.passageId)) : undefined;
  const item: PracticeItem = {
    questionId: str(q.id),
    ref: str(q.externalRef ?? q.id),
    grade: 0,
    family: "",
    skillKey: "",
    standard: "",
    level: Number(q.difficultyLevel),
    type,
    stem: str(q.stem),
    passage: p ? str(p.id) : null,
    subskill: null,
    explanation: { whyCorrect: text("WHY_CORRECT"), tip: text("TIP") },
    estimatedSeconds: Number(q.estimatedSeconds),
    // c: the stored value or the item format's guessing floor (1/options for multiple choice, 0.5 true/false)
    irt: { a: Number(q.irtA), b: Number(q.irtB), c: effectiveGuessing(q.irtC, type, options?.length ?? null) },
    options,
    passageText: p ? str(p.body) : null,
    passageTitle: p ? str(p.title) : null,
    hint: q.hint ? str(q.hint) : null,
    image: null,
  };
  if (type === "TRUE_FALSE") item.answer = Boolean(ans[0]);
  if (type === "FILL_BLANK") item.answers = ans.map(str);
  if (type === "SENTENCE_ORDER" || type === "WORD_ORDER") item.sequence = (content.elements as string[]) ?? (ans[0] as string[]);
  if (type === "ERROR_CORRECTION") Object.assign(item, storedParts(type, content, ans[0]));
  if (type === "MATCHING") item.pairs = ans[0] as { left: string; right: string }[];
  if (type === "TWO_PART" || type === "GRID" || type === "HOT_TEXT" || type === "DICTATION" || type === "SENTENCE_COMBINE") Object.assign(item, storedParts(type, content, ans[0]));
  // sentence combining: the item's own hint (content) when the question has none
  if (type === "SENTENCE_COMBINE" && !item.hint && item.combine?.hint) item.hint = item.combine.hint;
  return item;
}

export function toCandidate(i: PracticeItem, skillId: string): CandidateItem {
  return { id: i.questionId, skillId, level: i.level, a: i.irt.a, b: i.irt.b, c: i.irt.c, estimatedSeconds: i.estimatedSeconds };
}

/** Deterministic shuffle (seeded by session + question) so a reload shows the same order. */
export function seededShuffle<T>(arr: T[], seed: string): T[] {
  const out = [...arr];
  let h = BigInt("0x" + createHash("sha256").update(seed).digest("hex"));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Number(h % BigInt(i + 1));
    h /= BigInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  // never present an ordering task already in the correct order
  if (out.length > 1 && out.every((v, k) => v === arr[k])) [out[0], out[1]] = [out[1], out[0]];
  return out;
}

export function toClientQuestion(item: PracticeItem, seed: string): ClientQuestion {
  const base: ClientQuestion = {
    questionId: item.questionId,
    type: item.type,
    stem: item.stem,
    level: item.level,
    passage: item.passageText ? { title: item.passageTitle ?? "", text: item.passageText } : null,
    image: item.image ? { url: `/api/question-images/${item.image.id}`, alt: item.image.alt || "Picture for this question" } : null,
    hasHint: Boolean(item.hint || item.explanation.tip),
  };
  switch (item.type) {
    case "MULTIPLE_CHOICE":
    case "DROPDOWN":
    case "MULTI_SELECT":
      return { ...base, options: item.options!.map((o) => ({ label: o.label, text: o.text })), multiple: item.type === "MULTI_SELECT" };
    case "SENTENCE_ORDER":
    case "WORD_ORDER":
      return { ...base, elements: seededShuffle(item.sequence!, seed) };
    case "ERROR_CORRECTION":
      return isClassicErrorItem(item) ? { ...base, segments: item.segments } : { ...base, segments: item.segments, errorMode: { noError: Boolean(item.noErrorOption), typeFix: Boolean(item.typeCorrection), multiple: errorKey(item).indexes.length > 1 } };
    case "MATCHING":
      return { ...base, left: item.pairs!.map((p) => p.left), right: seededShuffle(item.pairs!.map((p) => p.right), seed) };
    case "TWO_PART": {
      const safe = (o: BankOption) => ({ label: o.label, text: o.text });
      const tp = item.twoPart!;
      // Part A's question is not repeated when it is the question text itself (imported items)
      return { ...base, parts: { a: { stem: tp.partA.stem.trim() === item.stem.trim() ? "" : tp.partA.stem, options: tp.partA.options.map(safe) }, b: { stem: tp.partB.stem, options: tp.partB.options.map(safe), multiple: Boolean(tp.partB.multiple) } } };
    }
    case "GRID":
      return { ...base, grid: { rows: item.grid!.rows.map((r) => ({ id: r.id, text: r.text })), columns: item.grid!.columns.map((c) => ({ id: c.id, text: c.text })) } };
    case "HOT_TEXT":
      return { ...base, hot: { segments: item.hotText!.segments.map((x) => ({ id: x.id, text: x.text })), maxSelect: item.hotText!.maxSelect } };
    case "DICTATION": {
      const d = item.dictation!;
      return { ...base, dictation: { say: encodeSpeech({ w: d.word, s: d.sentence ?? null }, item.questionId), hasSentence: Boolean(d.sentence) } };
    }
    case "SENTENCE_COMBINE":
      return { ...base, combine: { sentences: [...item.combine!.sentences], connector: item.combine!.connector?.trim() || null } };
    default:
      return base; // TRUE_FALSE, FILL_BLANK, SHORT_ANSWER
  }
}

/** Human-readable correct answer, for the feedback panel. */
export function correctAnswerText(i: PracticeItem): string {
  switch (i.type) {
    case "MULTIPLE_CHOICE":
    case "DROPDOWN":
      return i.options!.filter((o) => o.correct).map((o) => `${o.label}. ${o.text}`).join("");
    case "MULTI_SELECT":
      return i.options!.filter((o) => o.correct).map((o) => `${o.label}. ${o.text}`).join("; ");
    case "TRUE_FALSE":
      return i.answer ? "True" : "False";
    case "FILL_BLANK":
      return i.answers![0];
    case "SENTENCE_ORDER":
    case "WORD_ORDER":
      return i.sequence!.map((s, k) => `${k + 1}. ${s}`).join("  ");
    case "ERROR_CORRECTION": {
      const { indexes, corrections } = errorKey(i);
      if (!indexes.length) return "No error: the sentence is correct.";
      return indexes.map((k, n) => `“${i.segments![k]}” should be “${String(corrections[n] ?? "").split("|")[0].trim()}”`).join("; ");
    }
    case "MATCHING":
      return i.pairs!.map((p) => `${p.left} = ${p.right}`).join("; ");
    case "TWO_PART": {
      const tp = i.twoPart!;
      const c = (os: BankOption[]) => os.filter((o) => o.correct).map((o) => `${o.label}. ${o.text}`).join("; ");
      return `Part A: ${c(tp.partA.options)}  Part B: ${c(tp.partB.options)}`;
    }
    case "GRID":
      return i.grid!.rows.map((r) => `${r.text} = ${i.grid!.columns.find((c) => c.id === i.grid!.answer[r.id])?.text ?? ""}`).join("; ");
    case "HOT_TEXT":
      return i.hotText!.segments.filter((x) => i.hotText!.correct.includes(x.id)).map((x) => `“${x.text}”`).join(" ");
    case "DICTATION":
      return i.dictation!.word;
    case "SENTENCE_COMBINE":
      return i.combine!.accepted[0] ?? "";
    default:
      return "";
  }
}

/** What the student answered, in words. */
export function studentAnswerText(i: PracticeItem, response: unknown): string {
  switch (i.type) {
    case "MULTIPLE_CHOICE":
    case "DROPDOWN": {
      const o = i.options!.find((x) => x.label === response);
      return o ? `${o.label}. ${o.text}` : "No answer";
    }
    case "MULTI_SELECT":
      return (Array.isArray(response) ? (response as string[]) : []).map((l) => i.options!.find((o) => o.label === l)).filter(Boolean).map((o) => `${o!.label}. ${o!.text}`).join("; ") || "No answer";
    case "TRUE_FALSE":
      return response === true ? "True" : response === false ? "False" : "No answer";
    case "FILL_BLANK":
      return typeof response === "string" && response.trim() ? response.trim() : "No answer";
    case "SENTENCE_ORDER":
    case "WORD_ORDER":
      return Array.isArray(response) ? (response as string[]).map((s, k) => `${k + 1}. ${s}`).join("  ") : "No answer";
    case "ERROR_CORRECTION": {
      const r = readErrorResponse(response);
      if (r.none) return "No error";
      const parts = r.picks.filter((k) => i.segments![k] !== undefined).map((k) => `“${i.segments![k]}”${r.fixes[k]?.trim() ? ` → “${r.fixes[k].trim()}”` : ""}`);
      return parts.join("; ") || "No answer";
    }
    case "MATCHING":
      return Object.entries((response ?? {}) as Record<string, string>).map(([l, r]) => `${l} = ${r}`).join("; ") || "No answer";
    case "TWO_PART": {
      const r = (response && typeof response === "object" ? response : {}) as { a?: unknown; b?: unknown };
      const tp = i.twoPart!;
      const a = tp.partA.options.find((o) => o.label === r.a);
      const bl = (Array.isArray(r.b) ? r.b : r.b ? [r.b] : []).map(String);
      const b = tp.partB.options.filter((o) => bl.includes(o.label));
      if (!a && !b.length) return "No answer";
      return `Part A: ${a ? `${a.label}. ${a.text}` : "no answer"}  Part B: ${b.length ? b.map((o) => `${o.label}. ${o.text}`).join("; ") : "no answer"}`;
    }
    case "GRID": {
      const map = (response && typeof response === "object" && !Array.isArray(response) ? response : {}) as Record<string, string>;
      const out = i.grid!.rows.filter((r) => map[r.id]).map((r) => `${r.text} = ${i.grid!.columns.find((c) => c.id === map[r.id])?.text ?? "?"}`);
      return out.join("; ") || "No answer";
    }
    case "HOT_TEXT": {
      const ids = Array.isArray(response) ? (response as unknown[]).map(String) : [];
      return i.hotText!.segments.filter((x) => ids.includes(x.id)).map((x) => `“${x.text}”`).join(" ") || "No answer";
    }
    case "DICTATION":
    case "SENTENCE_COMBINE":
      return typeof response === "string" && response.trim() ? response.trim() : "No answer";
    default:
      return "";
  }
}

/** Why the chosen option was wrong (single-choice types, and Part A / Part B of a two-part item). */
export function whyChosenWrong(i: PracticeItem, response: unknown): string | null {
  if (i.type === "TWO_PART") {
    const r = (response && typeof response === "object" ? response : {}) as { a?: unknown; b?: unknown };
    const a = i.twoPart!.partA.options.find((o) => o.label === r.a);
    if (a && !a.correct) return a.rationale;
    const bl = (Array.isArray(r.b) ? r.b : r.b ? [r.b] : []).map(String);
    const b = i.twoPart!.partB.options.find((o) => !o.correct && bl.includes(o.label));
    if (b) return b.rationale || "Your answer to Part A is right, but the sentence you chose in Part B does not prove it. Find the sentence that shows your answer is true.";
    return null;
  }
  // dictation: the spelling pattern that was missed (never the word itself)
  if (i.type === "DICTATION") return typeof response === "string" ? diagnoseSpelling(i.dictation!.word, response)?.message ?? null : null;
  // sentence combining: what to check (the joining word, a missing idea, the comma), never the model answer itself
  if (i.type === "SENTENCE_COMBINE") return combineGuidance(i.combine!, response);
  if (i.type !== "MULTIPLE_CHOICE" && i.type !== "DROPDOWN") return null;
  const o = i.options!.find((x) => x.label === response);
  return o && !o.correct ? o.rationale : null;
}

/**
 * The misconception recorded on a wrong (or partly right) attempt. TWO_PART: right answer with wrong evidence →
 * EVIDENCE_MISMATCH; a wrong Part A → its option's misconception. ERROR_CORRECTION: the item's errorKind.
 * Other types: the chosen option's misconception.
 */
export function attemptMisconception(i: BankItem, response: unknown): string | null {
  if (i.type === "TWO_PART") {
    const s = twoPartScores(i, response);
    if (s.a >= 1 && s.b < 1) return "EVIDENCE_MISMATCH";
    if (s.a < 1) {
      const r = (response && typeof response === "object" ? response : {}) as { a?: unknown };
      return i.twoPart!.partA.options.find((o) => o.label === r.a && !o.correct)?.misconception ?? null;
    }
    return null;
  }
  if (i.type === "ERROR_CORRECTION") return i.errorKind && scoreResponse(i, response) < 1 ? i.errorKind : null;
  // dictation: the pattern the typed spelling missed (vowel team, doubling, silent letter, y → i …)
  if (i.type === "DICTATION") return typeof response === "string" ? diagnoseSpelling(i.dictation!.word, response)?.code ?? null : null;
  // sentence combining: a wrong join is a sentence-boundary error (fragment, run-on, missing comma or joining word)
  if (i.type === "SENTENCE_COMBINE") return scoreResponse(i, response) < 1 ? "SENTENCE_BOUNDARY" : null;
  return chosenMisconception(i.type, i.options, response);
}

/** Every text that would give the answer away (the tutor must not say any of them before guiding). */
export function answerTexts(i: PracticeItem): string[] {
  const out = [correctAnswerText(i), ...(i.options ?? []).filter((o) => o.correct).map((o) => o.text)];
  if (i.twoPart) out.push(...[...i.twoPart.partA.options, ...i.twoPart.partB.options].filter((o) => o.correct).map((o) => o.text));
  if (i.hotText) out.push(...i.hotText.segments.filter((x) => i.hotText!.correct.includes(x.id)).map((x) => x.text));
  if (i.grid) out.push(...i.grid.rows.map((r) => `${r.text} ${i.grid!.columns.find((c) => c.id === i.grid!.answer[r.id])?.text ?? ""}`));
  if (i.type === "ERROR_CORRECTION") out.push(...errorKey(i).corrections.flatMap((c) => c.split("|").map((x) => x.trim())).filter(Boolean));
  if (i.dictation) out.push(i.dictation.word);
  if (i.combine) out.push(...i.combine.accepted);
  return out.filter(Boolean);
}

