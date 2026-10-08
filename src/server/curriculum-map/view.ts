/** Read-only view of the school's Curriculum Map for admins and teachers (one grade at a time). */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";

export interface MapViewNode {
  id: string; code: string; kind: string; title: string; heading: string | null; sharedRead: string | null; genre: string | null;
  categoryType: string | null; skills: string | null; level: string | null; acceptsQuestions: boolean; children: MapViewNode[];
  /** questions the adaptive sets can use on this node: published, auto-marked (attachment nodes only) */
  questions: number;
  /** adaptive (as above) · teacher-scored (published Short Answers) · waiting (drafts and questions under review) */
  counts: { adaptive: number; teacher: number; waiting: number };
}
/** The number of adaptive questions each level of a place should have. */
export const LEVEL_TARGET = 20;
export interface LevelCoverage { category: string; level: "BELOW" | "ON" | "ABOVE"; places: number; atTarget: number }
export interface MapView { grades: { level: number; name: string }[]; level: number | null; book: MapViewNode | null; attachmentNodes: number; questions: number; coverage: LevelCoverage[] }

export async function curriculumMapView(repo: Repo, actor: Actor, level?: number): Promise<MapView> {
  assertCan(actor, "curriculum:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError("Only staff can open the Curriculum Map.");
  const grades = (await repo.findMany("Grade", { schoolId: actor.schoolId })).sort((a, b) => Number(a.level) - Number(b.level));
  const withMap: Row[] = [];
  for (const g of grades) if (await repo.count("CurriculumMapNode", { gradeId: g.id })) withMap.push(g);
  const list = withMap.map((g) => ({ level: Number(g.level), name: String(g.name) }));
  const grade = withMap.find((g) => Number(g.level) === level) ?? withMap[0];
  if (!grade) return { grades: list, level: null, book: null, attachmentNodes: 0, questions: 0, coverage: [] };
  const rows = await repo.findMany("CurriculumMapNode", { gradeId: grade.id });
  const attach = rows.filter((r) => Boolean(r.acceptsQuestions)).map((r) => r.id);
  // each place's questions, counted exactly as the adaptive engine uses them
  const counts = new Map<string, { adaptive: number; teacher: number; waiting: number }>();
  const links = attach.length ? await repo.findMany("QuestionMapLink", { nodeId: { in: attach } }, { select: ["nodeId", "questionId"] }) : [];
  const qs = links.length ? await repo.findMany("Question", { id: { in: [...new Set(links.map((l) => String(l.questionId)))] } }, { select: ["id", "status", "deletedAt", "typeId"] }) : [];
  const typeCode = new Map((qs.length ? await repo.findMany("QuestionType", { id: { in: [...new Set(qs.map((q) => String(q.typeId)))] } }, { select: ["id", "code"] }) : []).map((t) => [String(t.id), String(t.code)]));
  const qById = new Map(qs.map((q) => [String(q.id), q]));
  for (const l of links) {
    const q = qById.get(String(l.questionId));
    if (!q || q.deletedAt) continue;
    const c = counts.get(String(l.nodeId)) ?? { adaptive: 0, teacher: 0, waiting: 0 };
    const manual = typeCode.get(String(q.typeId)) === "SHORT_ANSWER";
    if (q.status === "PUBLISHED") { if (manual) c.teacher++; else c.adaptive++; }
    else if (q.status === "DRAFT" || q.status === "UNDER_REVIEW") c.waiting++;
    counts.set(String(l.nodeId), c);
  }
  const kids = new Map<string, Row[]>();
  for (const r of rows) { const k = String(r.parentId ?? ""); kids.set(k, [...(kids.get(k) ?? []), r]); }
  const build = (r: Row): MapViewNode => ({
    id: String(r.id), code: String(r.code), kind: String(r.kind), title: String(r.title), heading: r.heading ? String(r.heading) : null,
    sharedRead: r.sharedRead ? String(r.sharedRead) : null, genre: r.genre ? String(r.genre) : null, categoryType: r.categoryType ? String(r.categoryType) : null,
    skills: r.skills ? String(r.skills) : null, level: r.level ? String(r.level) : null, acceptsQuestions: Boolean(r.acceptsQuestions),
    questions: counts.get(String(r.id))?.adaptive ?? 0,
    counts: counts.get(String(r.id)) ?? { adaptive: 0, teacher: 0, waiting: 0 },
    children: (kids.get(String(r.id)) ?? []).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)).map(build),
  });
  const root = (kids.get("") ?? []).find((r) => r.kind === "BOOK");
  // per category with levels (Analyze Craft and Structure, Respond to Reading) and per level
  const byId = new Map(rows.map((r) => [String(r.id), r]));
  const categoryOf = (r: Row) => { const p = byId.get(String(r.parentId ?? "")); return String(p?.title ?? "").replace(/^\d+-\s*/, ""); };
  const leveled = rows.filter((r) => r.acceptsQuestions && r.level);
  const coverage: LevelCoverage[] = [];
  for (const category of [...new Set(leveled.map(categoryOf))])
    for (const lv of ["BELOW", "ON", "ABOVE"] as const) {
      const places = leveled.filter((r) => categoryOf(r) === category && String(r.level) === lv);
      if (places.length) coverage.push({ category, level: lv, places: places.length, atTarget: places.filter((r) => (counts.get(String(r.id))?.adaptive ?? 0) >= LEVEL_TARGET).length });
    }
  return { grades: list, level: Number(grade.level), book: root ? build(root) : null, attachmentNodes: rows.filter((r) => Boolean(r.acceptsQuestions)).length, questions: [...counts.values()].reduce((a, b) => a + b.adaptive, 0), coverage };
}
