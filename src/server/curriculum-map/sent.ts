/**
 * ✓ Sent on the Curriculum Map: the places this teacher has already assigned (their own live assignments made from
 * the map), so each section shows "✓ Sent" with the date instead of looking new.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";

const s = (v: unknown) => String(v ?? "");

/** map node code → the latest date this teacher sent questions of that node (teachers only; admins: empty). */
export async function sentMapCodes(repo: Repo, actor: Actor): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  if (actor.role !== "TEACHER") return out;
  const as = await repo.findMany("Assignment", { createdById: actor.userId, track: "CURRICULUM", deletedAt: null }, { select: ["id", "assessmentId", "createdAt"] });
  const withSet = as.filter((a) => a.assessmentId);
  if (!withSet.length) return out;
  const when = new Map<string, Date>();
  for (const a of withSet) { const d = new Date(a.createdAt as string); const k = s(a.assessmentId); if (!when.has(k) || when.get(k)! < d) when.set(k, d); }
  const aq = await repo.findMany("AssessmentQuestion", { assessmentId: { in: [...when.keys()] } }, { select: ["assessmentId", "questionId"] });
  if (!aq.length) return out;
  const links = await repo.findMany("QuestionMapLink", { questionId: { in: [...new Set(aq.map((x) => s(x.questionId)))] } }, { select: ["questionId", "nodeId"] });
  if (!links.length) return out;
  const nodes = await repo.findMany("CurriculumMapNode", { id: { in: [...new Set(links.map((l) => s(l.nodeId)))] } }, { select: ["id", "code"] });
  const code = new Map(nodes.map((n) => [s(n.id), s(n.code).toUpperCase()]));
  const nodesOfQ = new Map<string, string[]>();
  for (const l of links) nodesOfQ.set(s(l.questionId), [...(nodesOfQ.get(s(l.questionId)) ?? []), s(l.nodeId)]);
  for (const x of aq) {
    const d = when.get(s(x.assessmentId))!;
    for (const n of nodesOfQ.get(s(x.questionId)) ?? []) {
      const c = code.get(n); if (!c) continue;
      if (!out.has(c) || out.get(c)! < d) out.set(c, d);
    }
  }
  return out;
}

/** a section (category code) is sent when any of its places (the code itself or a level under it) was sent */
export function sentOn(sent: Map<string, Date>, sectionCode: string): Date | null {
  const c = sectionCode.toUpperCase();
  let best: Date | null = null;
  for (const [k, d] of sent) if ((k === c || k.startsWith(`${c}.`)) && (!best || d > best)) best = d;
  return best;
}
