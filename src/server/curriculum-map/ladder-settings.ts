/**
 * ⚙️ The school's level-movement rules (admin Settings), used by every adaptive set:
 *   - move UP when at least upPct % of the last upWindow answers at the level are correct;
 *   - move DOWN when at most downPct % of the last downWindow answers are correct;
 *   - a skill counts as MASTERED at masteredPct % accuracy over at least masteredMin answers.
 * Defaults keep the platform's original behaviour (4 of 5 up, 1 or fewer of 4 down).
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";

export interface LadderSettings { upPct: number; upWindow: number; downPct: number; downWindow: number; masteredPct: number; masteredMin: number }
export interface LadderRules { promoteCorrect: number; promoteWindow: number; minAtLevel: number; demoteMaxCorrect: number; demoteWindow: number }

export const DEFAULT_LADDER: LadderSettings = { upPct: 80, upWindow: 5, downPct: 25, downWindow: 4, masteredPct: 80, masteredMin: 10 };
const KEY = "adaptive.ladder";

export const LADDER_LIMITS: Record<keyof LadderSettings, { min: number; max: number; label: string }> = {
  upPct: { min: 50, max: 100, label: "Move up at (% correct)" },
  upWindow: { min: 3, max: 10, label: "…of the last (answers)" },
  downPct: { min: 0, max: 60, label: "Move down at or below (% correct)" },
  downWindow: { min: 3, max: 10, label: "…of the last (answers)" },
  masteredPct: { min: 50, max: 100, label: "Mastered at (% accuracy)" },
  masteredMin: { min: 3, max: 50, label: "…over at least (answers)" },
};

/** The settings → the counts the ladder uses (80 % of 5 → 4 correct of the last 5). */
export function rulesOf(v: LadderSettings): LadderRules {
  const promoteCorrect = Math.max(1, Math.min(v.upWindow, Math.ceil((v.upPct / 100) * v.upWindow - 1e-9)));
  return {
    promoteCorrect, promoteWindow: v.upWindow, minAtLevel: Math.max(2, promoteCorrect),
    demoteMaxCorrect: Math.max(0, Math.floor((v.downPct / 100) * v.downWindow + 1e-9)), demoteWindow: v.downWindow,
  };
}

export async function ladderSettings(repo: Repo, schoolId: string | null | undefined): Promise<LadderSettings> {
  if (!schoolId) return DEFAULT_LADDER;
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: KEY }))[0];
  let v: unknown = row?.value ?? null;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } }
  const out = { ...DEFAULT_LADDER };
  if (v && typeof v === "object") for (const k of Object.keys(DEFAULT_LADDER) as (keyof LadderSettings)[]) {
    const n = Number((v as Record<string, unknown>)[k]);
    if (Number.isFinite(n) && n >= LADDER_LIMITS[k].min && n <= LADDER_LIMITS[k].max) out[k] = Math.round(n);
  }
  return out;
}

export async function ladderRulesForStudent(repo: Repo, studentId: string): Promise<LadderRules> {
  const st = await repo.findUnique("Student", { id: studentId });
  return rulesOf(await ladderSettings(repo, st ? String(st.schoolId) : null));
}

/** Admin: save the rules (null = back to the defaults). */
export async function setLadderSettings(repo: Repo, actor: Actor, input: Partial<LadderSettings> | null, now = new Date()): Promise<LadderSettings> {
  assertCan(actor, "settings:school");
  const v = { ...DEFAULT_LADDER };
  if (input) for (const k of Object.keys(DEFAULT_LADDER) as (keyof LadderSettings)[]) {
    const raw = input[k];
    if (raw === undefined || raw === null || Number.isNaN(raw)) continue;
    const n = Math.round(Number(raw)), lim = LADDER_LIMITS[k];
    if (!(n >= lim.min && n <= lim.max)) throw new ValidationError(`${lim.label.replace(/^…/, "")}: choose a number from ${lim.min} to ${lim.max}.`);
    v[k] = n;
  }
  if (v.downPct >= v.upPct) throw new ValidationError("The “move down” percentage must be lower than the “move up” percentage.");
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId!, key: KEY }, { value: v, updatedById: actor.userId, updatedAt: now }, { value: v, updatedById: actor.userId, updatedAt: now });
  return v;
}
