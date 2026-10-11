/**
 * 🗺️ MAP plan drafts made when MAP scores are imported (map-auto.ts → ensureDrafts: one MapPlan DRAFT per student and
 * subject) shown on the MAP page's plan tab as "Drafts ready to review": Preview → Send, or Dismiss. Nothing is
 * ever sent automatically: a draft goes to the student only when the teacher presses Send (sendPlans, unchanged).
 * Dismiss keeps the row (status DISMISSED) so the same term's draft is not made again; new scores make a new one.
 *
 * Access: the class must be the teacher's own (assertClassAccess; a school admin any class of the school).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { classMembers, studentNames } from "../insights/student-data";
import { groupOf, sendPlans, type PlanItem, type Subject } from "../map/map-plan";
import { audit } from "../audit";

const s = (v: unknown) => String(v ?? "");
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? new Date(s(v)).toISOString() : "");
const itemsOf = (v: unknown): PlanItem[] => { try { const x = typeof v === "string" ? JSON.parse(v) : v; return Array.isArray(x) ? (x as PlanItem[]) : []; } catch { return []; } };
/** at most this many drafts are listed at once */
export const MAX_DRAFTS = 80;

export interface MapDraftArea { name: string; icon: string; skills: string[] }
export interface MapDraft { id: string; studentId: string; studentName: string; subject: Subject; term: string; createdAt: string; areas: MapDraftArea[]; note: string | null }

/** The class's MAP plan drafts waiting for the teacher (not sent, not dismissed), by student name. Read only. */
export async function mapDraftsForClass(repo: Repo, actor: Actor, classId: string): Promise<MapDraft[]> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, classId);
  const ids = new Set(await classMembers(repo, classId));
  const rows = (await repo.findMany("MapPlan", { classId, status: "DRAFT" })).filter((r) => ids.has(s(r.studentId))).slice(0, MAX_DRAFTS);
  if (!rows.length) return [];
  const names = await studentNames(repo, [...new Set(rows.map((r) => s(r.studentId)))]);
  const skillIds = [...new Set(rows.flatMap((r) => itemsOf(r.items).flatMap((it) => (it.skillIds ?? []).map(s))))];
  const skills = skillIds.length ? await repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name"] }) : [];
  const skillName = new Map(skills.map((k) => [s(k.id), s(k.name)]));
  return rows.map((r: Row): MapDraft => ({
    id: s(r.id), studentId: s(r.studentId), studentName: names.get(s(r.studentId))?.name ?? "Student", subject: s(r.subject) === "LANGUAGE" ? "LANGUAGE" : "READING",
    term: s(r.term), createdAt: iso(r.createdAt), note: r.note ? s(r.note) : null,
    areas: itemsOf(r.items).map((it) => {
      const g = groupOf(s(it.group));
      return { name: g?.name ?? s(it.group), icon: g?.icon ?? "🗺️", skills: [...new Set((it.skillIds ?? []).map((id) => skillName.get(s(id)) ?? "").filter(Boolean))] };
    }),
  })).sort((a, b) => a.studentName.localeCompare(b.studentName) || a.subject.localeCompare(b.subject));
}

async function ownDraft(repo: Repo, actor: Actor, planId: string): Promise<Row> {
  assertCan(actor, "assignments:create");
  const r = await repo.findUnique("MapPlan", { id: s(planId) });
  if (!r || s(r.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Plan not found.");
  await assertClassAccess(repo, actor, s(r.classId)); // a teacher: their own class only
  if (s(r.status) !== "DRAFT") throw new ValidationError("This draft was already sent or dismissed.");
  return r;
}

/** Send: the teacher pressed Send after the preview (the only way a draft reaches the student). */
export async function sendMapDraft(repo: Repo, actor: Actor, planId: string, now = new Date()): Promise<{ sets: number; skipped: string[] }> {
  await ownDraft(repo, actor, planId);
  const r = await sendPlans(repo, actor, [s(planId)], now);
  if (!r.sent) throw new ValidationError("Nothing could be sent: these areas have no questions yet.");
  return { sets: r.sets, skipped: r.skipped };
}

/** Dismiss: the draft leaves the list; nothing is deleted or sent. */
export async function dismissMapDraft(repo: Repo, actor: Actor, planId: string, now = new Date()): Promise<void> {
  await ownDraft(repo, actor, planId);
  await repo.updateMany("MapPlan", { id: s(planId), status: "DRAFT" }, { status: "DISMISSED", updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "map.plan.dismiss", entityType: "MapPlan", entityId: s(planId), at: now });
}
