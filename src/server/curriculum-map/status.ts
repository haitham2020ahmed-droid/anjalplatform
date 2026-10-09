/**
 * A simple status for each Curriculum Map section, for one class (the teacher's Curriculum page):
 *   NOT_ASSIGNED · IN_PROGRESS (x of y students done) · FINISHED · NEEDS_HELP (someone is late). Question sets are matched to sections through their questions' map places;
 *   Respond to Reading through its Text Set.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { assertClassRead } from "../teacher/coordinators";

const s = (v: unknown) => String(v ?? "");
export type SectionState = "NOT_ASSIGNED" | "IN_PROGRESS" | "FINISHED" | "NEEDS_HELP";
export interface SectionStatus { state: SectionState; done: number; total: number }

/** "G4.U1.TS1.ACS.ON" → "G4.U1.TS1.ACS" (the section). */
const sectionOf = (code: string) => code.replace(/\.(BELOW|ON|ABOVE)$/, "");

export async function sectionStatuses(repo: Repo, actor: Actor, classId: string): Promise<Map<string, SectionStatus>> {
  await assertClassRead(repo, actor, classId);
  const out = new Map<string, SectionStatus>();
  const as = (await repo.findMany("Assignment", { classId, deletedAt: null }, { select: ["id", "assessmentId", "dueAt"] })).filter((a) => a.assessmentId);
  if (as.length) {
    const aq = await repo.findMany("AssessmentQuestion", { assessmentId: { in: as.map((a) => a.assessmentId) } }, { select: ["assessmentId", "questionId"] });
    const links = aq.length ? await repo.findMany("QuestionMapLink", { questionId: { in: [...new Set(aq.map((x) => s(x.questionId)))] } }) : [];
    const nodes = links.length ? await repo.findMany("CurriculumMapNode", { id: { in: [...new Set(links.map((l) => s(l.nodeId)))] } }, { select: ["id", "code"] }) : [];
    const codeOfNode = new Map(nodes.map((n) => [s(n.id), sectionOf(s(n.code))]));
    const sectionsOfQ = new Map<string, Set<string>>();
    for (const l of links) { const c = codeOfNode.get(s(l.nodeId)); if (c) sectionsOfQ.set(s(l.questionId), new Set([...(sectionsOfQ.get(s(l.questionId)) ?? []), c])); }
    const rows = await repo.findMany("AssignmentStudent", { assignmentId: { in: as.map((a) => a.id) } }, { select: ["assignmentId", "status"] });
    const acc = new Map<string, { done: number; total: number; late: number }>();
    for (const a of as) {
      const secs = new Set<string>();
      for (const q of aq.filter((x) => x.assessmentId === a.assessmentId)) for (const c of sectionsOfQ.get(s(q.questionId)) ?? []) secs.add(c);
      const mine = rows.filter((r) => r.assignmentId === a.id);
      for (const c of secs) {
        const v = acc.get(c) ?? { done: 0, total: 0, late: 0 };
        v.total += mine.length; v.done += mine.filter((r) => r.status === "COMPLETED").length; v.late += mine.filter((r) => r.status === "OVERDUE").length;
        acc.set(c, v);
      }
    }
    for (const [c, v] of acc) {
      out.set(c, { state: v.late > 0 ? "NEEDS_HELP" : v.total && v.done === v.total ? "FINISHED" : "IN_PROGRESS", done: v.done, total: v.total });
    }
  }
  const rtr = await repo.findMany("RespondAssignment", { classId, deletedAt: null }, { select: ["id", "setCode", "dueAt"] });
  if (rtr.length) {
    const rows = await repo.findMany("RespondAssignmentStudent", { assignmentId: { in: rtr.map((a) => a.id) } }, { select: ["assignmentId", "finishedAt"] });
    const now = Date.now();
    for (const a of rtr) {
      const mine = rows.filter((r) => r.assignmentId === a.id), done = mine.filter((r) => r.finishedAt).length;
      const late = a.dueAt && new Date(a.dueAt instanceof Date ? a.dueAt.toISOString() : s(a.dueAt)).getTime() < now && done < mine.length;
      const prev = out.get(s(a.setCode));
      const total = (prev?.total ?? 0) + mine.length, d = (prev?.done ?? 0) + done;
      out.set(s(a.setCode), { state: late || prev?.state === "NEEDS_HELP" ? "NEEDS_HELP" : total && d === total ? "FINISHED" : "IN_PROGRESS", done: d, total });
    }
  }
  return out;
}
