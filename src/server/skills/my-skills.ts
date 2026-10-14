/**
 * ⭐ STUDENT "My Skills" (owner r68 spec B) and the teacher's read-only copy of it (Reports → Student Skills → Student).
 *
 * Four tabs with counts: ⭐ Mastered · ◐ Learning · 🔄 Review · ☆ Not started. The status is the ONE skill status
 * (skills/status.ts): Mastered = ⭐; Learning = ◐ (and ☆⬆ "new challenge"); Review = 🔄. "Not started" lists ONLY the
 * skills inside the student's own plans — the teacher's assignments (Grammar, MAP / NAFS / RTI / custom plans and single
 * skills: each plan item is an assignment), a MAP plan the teacher sent (MapPlan) and the class's Year plan once it was
 * sent to students — never the whole skill list. Cancelled work, tests and work that starts later are left out.
 * Rows are grouped by strand (Literature · Informational · Vocabulary · Grammar, and Writing when there is any), each
 * with its count. One button per row: Mastered → "Practice again" (+ the small mastered date; practice never takes the
 * star away) · Learning → "Continue" (+ a small mastery bar, no question counts) · Review → "Review now" · Not started →
 * "Start". Students never see level words.
 *
 * Light: one read of the student's statuses, one of their assignment rows (+ the assignments, bounded), the sent MAP
 * plans and the Year plan (one row); names and strands come from the cached skill index. No heavy job.
 */
import type { Repo, Row } from "../seeding/repo";
import taxonomy from "../../../data/curriculum/taxonomy.json";
import { currentRows, skillKeyIndex, studentSchool, viewOf, type StarStatus, type StarView } from "./status";
import { schoolSkillIndex } from "../questions/skill-questions";
import { hiddenWorkKeys } from "../student/cancelled-work";
import { safeIfBehind } from "../db/schema-errors";

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const ms = (v: unknown): number => (v === null || v === undefined || v === "" ? 0 : v instanceof Date ? v.getTime() : new Date(String(v)).getTime() || 0);
const json = <T>(v: unknown, fb: T): T => { if (v === null || v === undefined || v === "") return fb; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return fb; } } return v as T; };

export type MySkillsTab = "LEARNING" | "MASTERED" | "REVIEW" | "NOT_STARTED";
/** the tab order on the page */
export const MY_SKILLS_TABS: readonly MySkillsTab[] = ["MASTERED", "LEARNING", "REVIEW", "NOT_STARTED"];
export const TAB_LABEL: Record<MySkillsTab, string> = { MASTERED: "Mastered", LEARNING: "Learning", REVIEW: "Review", NOT_STARTED: "Not started" };
export const TAB_ICON: Record<MySkillsTab, string> = { MASTERED: "⭐", LEARNING: "◐", REVIEW: "🔄", NOT_STARTED: "☆" };
export type Strand = "LITERATURE" | "INFORMATIONAL" | "VOCABULARY" | "GRAMMAR" | "WRITING";
export const STRANDS: readonly Strand[] = ["LITERATURE", "INFORMATIONAL", "VOCABULARY", "GRAMMAR", "WRITING"];
export const STRAND_LABEL: Record<Strand, string> = { LITERATURE: "Literature", INFORMATIONAL: "Informational", VOCABULARY: "Vocabulary", GRAMMAR: "Grammar", WRITING: "Writing" };
export const ACTION_LABEL: Record<MySkillsTab, string> = { MASTERED: "Practice again", LEARNING: "Continue", REVIEW: "Review now", NOT_STARTED: "Start" };

/** The tab of a status (pure). */
export function tabOf(status: StarStatus): MySkillsTab {
  if (status === "MASTERED") return "MASTERED";
  if (status === "NEEDS_REVIEW") return "REVIEW";
  if (status === "IN_PROGRESS" || status === "NEXT_LEVEL") return "LEARNING";
  return "NOT_STARTED";
}

/** Default tab: Learning when it has skills, else Mastered (owner). */
export function defaultTab(counts: Record<MySkillsTab, number>): MySkillsTab {
  return counts.LEARNING > 0 ? "LEARNING" : counts.MASTERED > 0 ? "MASTERED" : counts.REVIEW > 0 ? "REVIEW" : "NOT_STARTED";
}
/** The tabs shown: Review only when it has skills. */
export const visibleTabs = (counts: Record<MySkillsTab, number>): MySkillsTab[] => MY_SKILLS_TABS.filter((t) => t !== "REVIEW" || counts.REVIEW > 0);

interface TaxFamily { code: string; domain: string; ccssStems?: string[] }
const FAMILY = new Map((taxonomy as { families: TaxFamily[] }).families.map((f) => [f.code, f]));

/** The strand of a skill (pure): its category, else its domain, else the taxonomy family's standards. */
export function strandOf(key: string, skill: { category?: string; domain?: string } | null): Strand {
  const cat = s(skill?.category).toUpperCase(), dom = s(skill?.domain).toUpperCase();
  const fam = key.startsWith("fam:") ? FAMILY.get(key.slice(4)) : undefined;
  if (cat === "LITERATURE") return "LITERATURE";
  if (cat === "INFORMATIONAL") return "INFORMATIONAL";
  if (cat === "VOCABULARY" || cat === "WORD_STUDY" || cat === "PHONICS_WORD_STUDY") return "VOCABULARY";
  if (cat === "GRAMMAR" || cat === "MECHANICS") return "GRAMMAR";
  if (cat === "WRITING") return "WRITING";
  const d = s(fam?.domain).toUpperCase() || dom;
  if (d === "VOCABULARY" || d === "WORD_STUDY") return "VOCABULARY";
  if (d === "GRAMMAR" || d === "LANGUAGE") return "GRAMMAR";
  if (d === "WRITING") return "WRITING";
  const stems = fam?.ccssStems ?? [];
  if (stems.length && stems.every((x) => x.startsWith("RI"))) return "INFORMATIONAL";
  if (stems.some((x) => x.startsWith("RL"))) return "LITERATURE";
  return /\binformational|\bri\./i.test(key) ? "INFORMATIONAL" : "LITERATURE";
}

export interface MySkillRow {
  key: string; name: string; skillId: string | null; strand: Strand; status: StarStatus; tab: MySkillsTab;
  /** Mastered: the small date (yyyy-mm-dd) */ masteredAt: string | null;
  /** Learning: the mastery bar (0–99 before the star; no question counts shown) */ score: number;
  href: string | null; action: string;
  /** the plans the skill comes from (small tags): MAP plan, Year plan, Grammar, Assigned */ from: string[];
}
export interface MySkillsGroup { strand: Strand; label: string; rows: MySkillRow[] }
export interface MySkills { counts: Record<MySkillsTab, number>; tabs: MySkillsTab[]; tab: MySkillsTab; groups: Record<MySkillsTab, MySkillsGroup[]>; total: number }

/** The skills of the student's own plans: skill id → where from. Bounded reads (see the header). */
export async function planSkillIdsOf(repo: Repo, studentId: string, schoolId: string, now = new Date()): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const add = (id: string, from: string) => { if (!id) return; const x = out.get(id) ?? new Set<string>(); x.add(from); out.set(id, x); };
  const [mine, hidden, mapPlans, classes] = await Promise.all([
    repo.findMany("AssignmentStudent", { studentId }, { select: ["assignmentId"], take: 600 }),
    hiddenWorkKeys(repo, studentId, schoolId).catch(() => new Set<string>()),
    safeIfBehind("myskills.mapplan", () => repo.findMany("MapPlan", { studentId, status: "SENT" }, { select: ["items"], take: 20 }), [] as Row[]),
    repo.findMany("ClassMembership", { studentId, leftAt: null }, { select: ["classId"] }),
  ]);
  const aids = mine.map((r) => s(r.assignmentId)).filter((a) => !hidden.has(a));
  const as: Row[] = [];
  for (let i = 0; i < aids.length; i += 400) as.push(...(await repo.findMany("Assignment", { id: { in: aids.slice(i, i + 400) }, deletedAt: null }, { select: ["id", "skillId", "skillIds", "testId", "curriculumPlanId", "track", "program", "startAt"] })));
  for (const a of as) {
    if (a.testId || ["TEST", "WEEKLY_CHECK"].includes(s(a.curriculumPlanId))) continue;
    if (ms(a.startAt) > now.getTime()) continue;
    const from = s(a.track) === "GRAMMAR" ? "Grammar" : s(a.program) === "MAP" || s(a.track) === "MAP" ? "MAP plan" : s(a.program) === "NAFS" || s(a.track) === "NAFS" ? "NAFS plan" : "Assigned";
    for (const id of [...new Set([...(a.skillId ? [s(a.skillId)] : []), ...json<unknown[]>(a.skillIds, []).map(s)])]) add(id, from);
  }
  for (const p of mapPlans) for (const it of json<{ skillIds?: unknown[] }[]>(p.items, [])) for (const k of it?.skillIds ?? []) add(s(k), "MAP plan");
  // the class's Year plan, once the teacher sent it to students (map/year-plan.ts sendYearPlan)
  const cids = classes.map((c) => s(c.classId));
  if (cids.length) {
    const { sentYearPlanSkills } = await import("../map/year-plan-share");
    for (const id of await sentYearPlanSkills(repo, schoolId, cids).catch(() => [] as string[])) add(id, "Year plan");
  }
  return out;
}

/** The student's My Skills (the student's own page, or the teacher's read-only view of it). */
export async function mySkills(repo: Repo, studentId: string, now = new Date(), opts: { href?: boolean } = {}): Promise<MySkills> {
  const schoolId = await studentSchool(repo, studentId);
  const [rows, ix, idx, plan] = await Promise.all([
    repo.findMany("SkillStatus", { studentId }, { select: ["studentId", "skillKey", "level", "status", "skillId", "answered", "correct", "score", "startedAt", "masteredAt", "reviewDueAt", "needsSupportAt", "selfCheck", "updatedAt"] }),
    skillKeyIndex(repo, schoolId), schoolSkillIndex(repo, schoolId),
    planSkillIdsOf(repo, studentId, schoolId, now),
  ]);
  const byKey = new Map<string, StarView>([...currentRows(rows)].map(([k, r]) => [k, viewOf(r)]));
  // plan skills by key (each skill once, whichever copy the plan used)
  const planKeys = new Map<string, { skillId: string; from: Set<string> }>();
  for (const [id, from] of plan) {
    const key = ix.keyOf.get(id);
    if (!key) continue;
    const x = planKeys.get(key) ?? { skillId: id, from: new Set<string>() };
    for (const f of from) x.from.add(f);
    planKeys.set(key, x);
  }
  const out: MySkillRow[] = [];
  const keys = new Set([...byKey.keys(), ...planKeys.keys()]);
  for (const key of keys) {
    const v = byKey.get(key) ?? null;
    const status: StarStatus = v?.status ?? "NOT_STARTED";
    const tab = tabOf(status);
    if (tab === "NOT_STARTED" && !planKeys.has(key)) continue; // never the whole list
    const skillId = v?.skillId ?? planKeys.get(key)?.skillId ?? ix.skillsOf.get(key)?.[0] ?? null;
    const sk = skillId ? idx.skillOf.get(skillId) ?? null : null;
    out.push({
      key, name: ix.nameOf.get(key) ?? sk?.name ?? "Skill", skillId, strand: strandOf(key, sk), status, tab,
      masteredAt: v?.masteredAt ? v.masteredAt.slice(0, 10) : null, score: v ? Math.min(99, v.score) : 0,
      href: opts.href === false || !skillId ? null : `/practice/${encodeURIComponent(skillId)}?from=free`, action: ACTION_LABEL[tab],
      from: [...(planKeys.get(key)?.from ?? [])],
    });
  }
  const counts: Record<MySkillsTab, number> = { MASTERED: 0, LEARNING: 0, REVIEW: 0, NOT_STARTED: 0 };
  for (const r of out) counts[r.tab]++;
  const groups = {} as Record<MySkillsTab, MySkillsGroup[]>;
  for (const t of MY_SKILLS_TABS) {
    const mineT = out.filter((r) => r.tab === t);
    groups[t] = STRANDS.map((st) => ({ strand: st, label: STRAND_LABEL[st], rows: mineT.filter((r) => r.strand === st).sort((a, b) => (t === "MASTERED" ? (b.masteredAt ?? "").localeCompare(a.masteredAt ?? "") : 0) || a.name.localeCompare(b.name)) })).filter((g) => g.rows.length);
  }
  return { counts, tabs: visibleTabs(counts), tab: defaultTab(counts), groups, total: out.length };
}

/** "8 mastered · 3 learning · 1 to review · 5 not started" (the teacher's summary line; plain English). */
export function summaryLine(c: Record<MySkillsTab, number>): string {
  return `${c.MASTERED} mastered · ${c.LEARNING} learning · ${c.REVIEW} to review · ${c.NOT_STARTED} not started`;
}

/**
 * 🇸🇦 NAFS practice answers count toward the star (status.ts countedAnswers); the NAFS center writes them in its own
 * tables, so a skill whose newest NAFS practice answer is newer than its status is brought up to date here — when the
 * student (or the teacher) opens My Skills. Bounded: the last 30 days' answers (take 300), at most 12 skills a visit.
 */
export async function syncNafsPracticeStars(repo: Repo, studentId: string, now = new Date()): Promise<number> {
  try {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const answers = await repo.findMany("NafsPracticeAnswer", { studentId, at: { gte: since } }, { select: ["questionId", "at"], orderBy: [{ field: "at", dir: "desc" }], take: 300 });
    if (!answers.length) return 0;
    const qs = await repo.findMany("Question", { id: { in: [...new Set(answers.map((a) => s(a.questionId)))] } }, { select: ["id", "skillId"] });
    const skillOfQ = new Map(qs.map((q) => [s(q.id), s(q.skillId)]));
    const schoolId = await studentSchool(repo, studentId);
    const ix = await skillKeyIndex(repo, schoolId);
    const newest = new Map<string, { at: number; skillId: string }>();
    for (const a of answers) {
      const sk = skillOfQ.get(s(a.questionId)); const key = sk ? ix.keyOf.get(sk) : undefined;
      if (!sk || !key) continue;
      if (!newest.has(key) || newest.get(key)!.at < ms(a.at)) newest.set(key, { at: ms(a.at), skillId: sk });
    }
    if (!newest.size) return 0;
    const rows = await repo.findMany("SkillStatus", { studentId, skillKey: { in: [...newest.keys()] } }, { select: ["skillKey", "updatedAt"] });
    const upd = new Map<string, number>();
    for (const r of rows) upd.set(s(r.skillKey), Math.max(upd.get(s(r.skillKey)) ?? 0, ms(r.updatedAt)));
    const stale = [...newest].filter(([k, x]) => (upd.get(k) ?? 0) < x.at).slice(0, 12);
    const { refreshSkillStatus } = await import("./status");
    for (const [, x] of stale) await refreshSkillStatus(repo, studentId, x.skillId, now, { schoolId, index: ix });
    return stale.length;
  } catch { return 0; } // an older database without the NAFS tables
}
