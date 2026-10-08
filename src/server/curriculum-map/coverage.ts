/**
 * 🧮 Curriculum Map coverage: for every place, how many questions it has — adaptive-ready (published,
 * automatically marked), teacher-scored (Short Answer), and not yet published. The target is 20 per level.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { attachmentNodes } from "./questions";

const s = (v: unknown) => String(v ?? "");
export const COVERAGE_TARGET = 20;
export interface CoverageCell { code: string; adaptive: number; teacher: number; unpublished: number }
export interface CoverageSet { set: string; heading: string; unit: number; cells: Record<string, CoverageCell> }
export interface Coverage { grade: number; sets: CoverageSet[]; totals: { adaptive: number; teacher: number; unpublished: number; places: number; full: number } }

export async function mapCoverage(repo: Repo, actor: Actor, grade: number): Promise<Coverage> {
  const nodes = (await attachmentNodes(repo, actor.schoolId!)).filter((n) => n.grade === grade);
  const links = nodes.length ? await repo.findMany("QuestionMapLink", { nodeId: { in: nodes.map((n) => n.id) } }, { select: ["questionId", "nodeId"] }) : [];
  const qs = links.length ? await repo.findMany("Question", { id: { in: [...new Set(links.map((l) => s(l.questionId)))] }, deletedAt: null }, { select: ["id", "status", "typeId"] }) : [];
  const sa = new Set((await repo.findMany("QuestionType", { code: "SHORT_ANSWER" }, { select: ["id"] })).map((t) => s(t.id)));
  const byQ = new Map(qs.map((q) => [s(q.id), q]));
  const cells = new Map<string, CoverageCell>();
  for (const n of nodes) cells.set(n.id, { code: n.code, adaptive: 0, teacher: 0, unpublished: 0 });
  for (const l of links) {
    const q = byQ.get(s(l.questionId)); const c = cells.get(s(l.nodeId));
    if (!q || !c || q.status === "ARCHIVED") continue;
    if (q.status !== "PUBLISHED") c.unpublished++;
    else if (sa.has(s(q.typeId))) c.teacher++;
    else c.adaptive++;
  }
  const sets = new Map<string, CoverageSet>();
  for (const n of nodes) {
    const key = n.code.split(".").slice(0, 3).join(".");
    const set = sets.get(key) ?? { set: key, heading: n.heading, unit: n.unit, cells: {} };
    const col = n.code.split(".").slice(3).join(".");   // CV · ACS.BELOW · ACS.ON · ACS.ABOVE · RTR.…
    set.cells[col] = cells.get(n.id)!;
    sets.set(key, set);
  }
  const all = [...cells.values()];
  return {
    grade, sets: [...sets.values()].sort((a, b) => a.set.localeCompare(b.set, undefined, { numeric: true })),
    totals: { adaptive: all.reduce((n, c) => n + c.adaptive, 0), teacher: all.reduce((n, c) => n + c.teacher, 0), unpublished: all.reduce((n, c) => n + c.unpublished, 0), places: all.length, full: all.filter((c) => c.adaptive >= COVERAGE_TARGET).length },
  };
}
