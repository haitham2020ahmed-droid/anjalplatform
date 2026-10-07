/** Read-only view of the school's Curriculum Map for admins and teachers (one grade at a time). */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";

export interface MapViewNode {
  id: string; code: string; kind: string; title: string; heading: string | null; sharedRead: string | null; genre: string | null;
  categoryType: string | null; skills: string | null; level: string | null; acceptsQuestions: boolean; children: MapViewNode[];
  /** questions placed on this node (attachment nodes only) */
  questions: number;
}
export interface MapView { grades: { level: number; name: string }[]; level: number | null; book: MapViewNode | null; attachmentNodes: number; questions: number }

export async function curriculumMapView(repo: Repo, actor: Actor, level?: number): Promise<MapView> {
  assertCan(actor, "curriculum:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError("Only staff can open the Curriculum Map.");
  const grades = (await repo.findMany("Grade", { schoolId: actor.schoolId })).sort((a, b) => Number(a.level) - Number(b.level));
  const withMap: Row[] = [];
  for (const g of grades) if (await repo.count("CurriculumMapNode", { gradeId: g.id })) withMap.push(g);
  const list = withMap.map((g) => ({ level: Number(g.level), name: String(g.name) }));
  const grade = withMap.find((g) => Number(g.level) === level) ?? withMap[0];
  if (!grade) return { grades: list, level: null, book: null, attachmentNodes: 0, questions: 0 };
  const rows = await repo.findMany("CurriculumMapNode", { gradeId: grade.id });
  const attach = rows.filter((r) => Boolean(r.acceptsQuestions)).map((r) => r.id);
  const counts = new Map<string, number>();
  if (attach.length) for (const l of await repo.findMany("QuestionMapLink", { nodeId: { in: attach } }, { select: ["nodeId"] })) counts.set(String(l.nodeId), (counts.get(String(l.nodeId)) ?? 0) + 1);
  const kids = new Map<string, Row[]>();
  for (const r of rows) { const k = String(r.parentId ?? ""); kids.set(k, [...(kids.get(k) ?? []), r]); }
  const build = (r: Row): MapViewNode => ({
    id: String(r.id), code: String(r.code), kind: String(r.kind), title: String(r.title), heading: r.heading ? String(r.heading) : null,
    sharedRead: r.sharedRead ? String(r.sharedRead) : null, genre: r.genre ? String(r.genre) : null, categoryType: r.categoryType ? String(r.categoryType) : null,
    skills: r.skills ? String(r.skills) : null, level: r.level ? String(r.level) : null, acceptsQuestions: Boolean(r.acceptsQuestions),
    questions: counts.get(String(r.id)) ?? 0,
    children: (kids.get(String(r.id)) ?? []).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)).map(build),
  });
  const root = (kids.get("") ?? []).find((r) => r.kind === "BOOK");
  return { grades: list, level: Number(grade.level), book: root ? build(root) : null, attachmentNodes: rows.filter((r) => Boolean(r.acceptsQuestions)).length, questions: [...counts.values()].reduce((a, b) => a + b, 0) };
}
