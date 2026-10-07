/**
 * Practice items: load from the DB into a scoring model, and build the SAFE
 * payload sent to the browser (no keys, no rationales, no explanations).
 */
import { createHash } from "node:crypto";
import type { BankItem, BankOption, QuestionTypeCode } from "../../imports/questions/validate";
import type { CandidateItem } from "../../types/domain";
import type { Repo, Row } from "../seeding/repo";
import { bankVersion } from "../cache/bank-version";

export interface PracticeItem extends BankItem {
  questionId: string;
  passageText: string | null;
  passageTitle: string | null;
  hint: string | null;
}

/** What the student's browser receives. Contains nothing that reveals the answer. */
export interface ClientQuestion {
  questionId: string;
  type: QuestionTypeCode;
  stem: string;
  level: number;
  passage: { title: string; text: string } | null;
  options?: { label: string; text: string }[];
  multiple?: boolean;
  elements?: string[]; // ordering: shuffled
  segments?: string[]; // error correction
  left?: string[]; // matching
  right?: string[]; // matching: shuffled
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
  // adaptive practice needs automatic scoring: teacher-scored types (SHORT_ANSWER) are never served
  const autoScored = new Set(types.filter((t) => t.isAutoScored !== false && t.code !== "SHORT_ANSWER").map((t) => str(t.id)));
  return qs.filter((q) => autoScored.has(str(q.typeId))).map((q) => ({ ...toPracticeItem(q, opts, answers, expl, typeCode, passage), skillKey: String(q.skillId) }));
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
        .map((o) => ({ label: str(o.label), text: str(o.text), correct: Boolean(o.isCorrect), rationale: o.rationale ? str(o.rationale) : null }))
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
    irt: { a: Number(q.irtA), b: Number(q.irtB), c: Number(q.irtC) },
    options,
    passageText: p ? str(p.body) : null,
    passageTitle: p ? str(p.title) : null,
    hint: q.hint ? str(q.hint) : null,
  };
  if (type === "TRUE_FALSE") item.answer = Boolean(ans[0]);
  if (type === "FILL_BLANK") item.answers = ans.map(str);
  if (type === "SENTENCE_ORDER" || type === "WORD_ORDER") item.sequence = (content.elements as string[]) ?? (ans[0] as string[]);
  if (type === "ERROR_CORRECTION") {
    item.segments = content.segments as string[];
    const a = ans[0] as { errorIndex: number; correction: string };
    item.errorIndex = a.errorIndex;
    item.correction = a.correction;
  }
  if (type === "MATCHING") item.pairs = ans[0] as { left: string; right: string }[];
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
    hasHint: Boolean(item.hint),
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
      return { ...base, segments: item.segments };
    case "MATCHING":
      return { ...base, left: item.pairs!.map((p) => p.left), right: seededShuffle(item.pairs!.map((p) => p.right), seed) };
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
    case "ERROR_CORRECTION":
      return `“${i.segments![i.errorIndex!]}” should be “${i.correction}”`;
    case "MATCHING":
      return i.pairs!.map((p) => `${p.left} = ${p.right}`).join("; ");
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
    case "ERROR_CORRECTION":
      return typeof response === "number" && i.segments![response] !== undefined ? `“${i.segments![response]}”` : "No answer";
    case "MATCHING":
      return Object.entries((response ?? {}) as Record<string, string>).map(([l, r]) => `${l} = ${r}`).join("; ") || "No answer";
    default:
      return "";
  }
}

/** Why the chosen option was wrong (single-choice types only). */
export function whyChosenWrong(i: PracticeItem, response: unknown): string | null {
  if (i.type !== "MULTIPLE_CHOICE" && i.type !== "DROPDOWN") return null;
  const o = i.options!.find((x) => x.label === response);
  return o && !o.correct ? o.rationale : null;
}
