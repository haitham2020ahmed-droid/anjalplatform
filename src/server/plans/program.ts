/**
 * Programs: each piece of work belongs to ONE program, sent from that program's own page —
 *   MAP (/teacher/map-center) · RTI (/teacher/rti-plan) · NAFS and Custom (/teacher/plans) · CURRICULUM (Curriculum Map).
 *
 * Stored in Assignment.program (MAP | RTI | CURRICULUM | NAFS; null = an older row or a custom plan). programOf()
 * reads it, and for older rows infers it from the fields that already existed (track, curriculumPlanId).
 * Pure helpers + one bounded read; no server-only imports (the type is shared with client components).
 */
import type { Repo, Row } from "../seeding/repo";
import { hideLevels } from "../../lib/hide-levels";

export type Program = "MAP" | "RTI" | "CURRICULUM" | "NAFS";
export const PROGRAMS: readonly Program[] = ["MAP", "RTI", "CURRICULUM", "NAFS"];
export const isProgram = (v: unknown): v is Program => (PROGRAMS as readonly unknown[]).includes(v);

/**
 * The program of an assignment: Assignment.program when set; otherwise inferred from the older fields —
 * track MAP / RTI / NAFS → that program; CURRICULUM or GRAMMAR track, or a full-curriculum plan place → CURRICULUM;
 * CUSTOM → null (a custom plan belongs to no program).
 */
export function programOf(a: Record<string, unknown> | { program?: unknown; track?: unknown; curriculumPlanId?: unknown } | null | undefined): Program | null {
  if (!a) return null;
  const r = a as { program?: unknown; track?: unknown; curriculumPlanId?: unknown };
  if (isProgram(r.program)) return r.program;
  const track = String(r.track ?? "");
  if (track === "MAP" || track === "RTI" || track === "NAFS") return track;
  if (r.curriculumPlanId) return "CURRICULUM";
  if (track === "CUSTOM") return null;
  return "CURRICULUM"; // CURRICULUM, GRAMMAR and rows from before the track column
}

/** The program of a plan (SkillPlan.kind): MAP / RTI / NAFS keep theirs; CUSTOM and ENRICHMENT → null; every other kind is Curriculum. */
export function programOfPlanKind(kind: unknown): Program | null {
  const k = String(kind ?? "");
  if (k === "MAP" || k === "RTI" || k === "NAFS") return k;
  return k === "CUSTOM" || k === "ENRICHMENT" ? null : "CURRICULUM";
}

/** SkillPlan.kind for a plan sent from a program's page (Curriculum plans made here are UNIT plans). */
export const planKindOf = (p: Program | null): string => (p === null ? "CUSTOM" : p === "CURRICULUM" ? "UNIT" : p);

/** Assignment.track for a program's work (the source tag My Work already shows); a grammar skill outside MAP/RTI/NAFS is Grammar. */
export function trackOfProgram(p: Program | null, grammar = false): "MAP" | "RTI" | "NAFS" | "CURRICULUM" | "GRAMMAR" | "CUSTOM" {
  if (p === "MAP" || p === "RTI" || p === "NAFS") return p;
  if (grammar) return "GRAMMAR";
  return p === "CURRICULUM" ? "CURRICULUM" : "CUSTOM";
}

/** Marks freshly sent assignments with their program (additive; a null program leaves them untouched). */
export async function tagProgram(repo: Repo, assignmentIds: string[], program: Program | null): Promise<void> {
  if (!program || !assignmentIds.length) return;
  await repo.updateMany("Assignment", { id: { in: assignmentIds } }, { program });
}

export type ProgramWorkStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
export interface ProgramWorkItem {
  assignmentId: string;
  /** the work's title as the student sees it (level words removed) */
  title: string;
  skillId: string | null;
  program: Program;
  status: ProgramWorkStatus;
  /** 0–100 */
  progress: number;
  dueAt: string | null;
  /** where the student starts / continues (or the report when done) */
  href: string;
}

const iso = (v: unknown): string | null => (v ? new Date(v instanceof Date ? v.toISOString() : String(v)).toISOString() : null);

/**
 * The student's assigned work for ONE program (the student pages show it inside each program's section).
 * Removed work, work that starts later and full-curriculum plan places (shown in the plan itself) are left out.
 * Open work first (overdue, in progress, not started), then by due date. Bounded: one student's rows.
 */
export async function myWorkByProgram(repo: Repo, studentId: string, program: Program, now = new Date()): Promise<ProgramWorkItem[]> {
  if (!studentId || !isProgram(program)) return [];
  const links = await repo.findMany("AssignmentStudent", { studentId }, { select: ["assignmentId", "status", "progress"] });
  if (!links.length) return [];
  const rows: Row[] = await repo.findMany("Assignment", { id: { in: [...new Set(links.map((l) => String(l.assignmentId)))] }, deletedAt: null },
    { select: ["id", "title", "skillId", "track", "program", "curriculumPlanId", "startAt", "dueAt"] });
  const rank: Record<ProgramWorkStatus, number> = { OVERDUE: 0, IN_PROGRESS: 1, NOT_STARTED: 2, COMPLETED: 3 };
  const out: ProgramWorkItem[] = [];
  for (const a of rows) {
    if (a.curriculumPlanId || programOf(a) !== program) continue;
    if (a.startAt && new Date(String(iso(a.startAt))).getTime() > now.getTime()) continue;
    const l = links.find((x) => String(x.assignmentId) === String(a.id))!;
    const st = String(l.status) as ProgramWorkStatus;
    const status: ProgramWorkStatus = rank[st] === undefined ? "NOT_STARTED" : st;
    const id = String(a.id), skillId = a.skillId ? String(a.skillId) : null;
    out.push({
      assignmentId: id, title: hideLevels(String(a.title ?? "")), skillId, program, status,
      progress: status === "COMPLETED" ? 100 : Math.round(100 * Math.max(0, Math.min(1, Number(l.progress) || 0))),
      dueAt: iso(a.dueAt),
      href: status === "COMPLETED" ? `/student/assignments/${id}/report` : skillId ? `/practice/${skillId}` : `/quiz/${id}`,
    });
  }
  return out.sort((x, y) => rank[x.status] - rank[y.status] || (x.dueAt ?? "9999").localeCompare(y.dueAt ?? "9999") || x.title.localeCompare(y.title));
}
