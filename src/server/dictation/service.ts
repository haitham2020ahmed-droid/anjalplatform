/**
 * 📝 Daily Dictation: repo-touching half of the feature (the pure rules live in engine.ts / diff.ts). A student
 * listens to one short item (read aloud by the browser's voice, up to MAX_REPLAYS times), types what they heard,
 * and gets a word-level diff of what's wrong. One attempt counts per calendar day (dictationDay); a second submit
 * the same day is rejected, not silently ignored, so the UI can show "come back tomorrow" instead of overwriting
 * today's attempt.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { clampTier, dictationDay, dictationDecision, itemForDay, DICTATION_ENGINE, MAX_REPLAYS } from "./engine";
import { gradeDictation, type DiffOp } from "./diff";
import { ITEM_BY_ID } from "./items";

const s = (v: unknown) => String(v ?? "");

function studentOf(actor: Actor): { studentId: string; schoolId: string } {
  if (!actor.studentId) throw new ForbiddenError("Only a student has a Daily Dictation.");
  return { studentId: actor.studentId, schoolId: s(actor.schoolId) };
}

/** The DictationStudent row, created at tier 1 on first use. */
export async function ensureDictationStudent(repo: Repo, studentId: string, schoolId: string): Promise<Row> {
  const have = await repo.findUnique("DictationStudent", { studentId });
  if (have) return have;
  return repo.upsert("DictationStudent", { studentId }, { studentId, schoolId, tier: DICTATION_ENGINE.minTier, startTier: DICTATION_ENGINE.minTier }, {});
}

export interface DictationAttemptView {
  typed: string;
  ops: DiffOp[];
  errorCount: number;
  clean: boolean;
  tierBefore: number;
  tierAfter: number;
  reason: string;
}

export interface DictationHome {
  tier: number;
  item: { id: string; text: string };
  day: string;
  /** today's attempt, if the student already did it (the UI shows this instead of the listen/type form) */
  today: DictationAttemptView | null;
  /** most recent attempts first, today's excluded */
  history: { day: string; tierBefore: number; tierAfter: number; clean: boolean; errorCount: number }[];
  maxReplays: typeof MAX_REPLAYS;
}

/** Today's item (or today's finished attempt) plus a short history, for the Daily Dictation tab. */
export async function dictationHome(repo: Repo, actor: Actor, now = new Date()): Promise<DictationHome> {
  const { studentId, schoolId } = studentOf(actor);
  const dst = await ensureDictationStudent(repo, studentId, schoolId);
  const tier = clampTier(Number(dst.tier));
  const day = dictationDay(now);
  const item = itemForDay(tier, studentId, now);
  const rows = (await repo.findMany("DictationAttempt", { studentId }))
    .sort((a, b) => s(b.day).localeCompare(s(a.day)));
  const todayRow = rows.find((r) => s(r.day) === day) ?? null;
  const today: DictationAttemptView | null = todayRow ? {
    typed: s(todayRow.typed),
    ops: (todayRow.diff ?? []) as DiffOp[],
    errorCount: Number(todayRow.errorCount),
    clean: Boolean(todayRow.clean),
    tierBefore: Number(todayRow.tierBefore),
    tierAfter: Number(todayRow.tierAfter),
    reason: dictationDecision(Number(todayRow.errorCount)).reason,
  } : null;
  const history = rows.filter((r) => s(r.day) !== day).slice(0, 14)
    .map((r) => ({ day: s(r.day), tierBefore: Number(r.tierBefore), tierAfter: Number(r.tierAfter), clean: Boolean(r.clean), errorCount: Number(r.errorCount) }));
  return { tier, item: { id: item.id, text: item.text }, day, today, history, maxReplays: MAX_REPLAYS };
}

/**
 * Grades `typed` against today's item, records the attempt and moves the tier. Throws ValidationError when the
 * student already has an attempt for today (one per calendar day) or `typed` is empty.
 */
export async function submitDictation(repo: Repo, actor: Actor, typed: string, now = new Date()): Promise<DictationAttemptView> {
  const { studentId, schoolId } = studentOf(actor);
  const clean = (typed ?? "").trim();
  if (!clean) throw new ValidationError("Type what you heard first.");
  const dst = await ensureDictationStudent(repo, studentId, schoolId);
  const before = clampTier(Number(dst.tier));
  const day = dictationDay(now);
  const have = await repo.findUnique("DictationAttempt", { studentId, day });
  if (have) throw new ValidationError("You already did today's dictation. Come back tomorrow for the next one.");
  const item = itemForDay(before, studentId, now);
  const graded = gradeDictation(item.text, clean);
  const dec = dictationDecision(graded.errorCount);
  const after = clampTier(before + dec.delta);
  await repo.create("DictationAttempt", {
    studentId, schoolId, day, itemId: item.id, tier: before, typed: clean.slice(0, 500),
    diff: graded.ops, errorCount: graded.errorCount, clean: graded.clean, tierBefore: before, tierAfter: after,
  });
  if (after !== before) await repo.updateMany("DictationStudent", { studentId }, { tier: after });
  return { typed: clean, ops: graded.ops, errorCount: graded.errorCount, clean: graded.clean, tierBefore: before, tierAfter: after, reason: dec.reason };
}

/** The item bank's text for an item id (DictationAttempt.itemId), for teacher/report views. Never deleted, see items.ts. */
export function dictationItemText(itemId: string): string | null {
  return ITEM_BY_ID.get(itemId)?.text ?? null;
}
