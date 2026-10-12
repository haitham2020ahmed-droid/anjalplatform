/**
 * Lesson details of the Curriculum Map (data/curriculum-map/lesson-details.json): the school's own summary of
 * each selection — genre, Text Idea, vocabulary words, vocabulary skill and reading skills — keyed by grade and
 * selection name. Grade 6 has names, genres and skills only (no vocabulary or Text Idea).
 * The text is kept exactly as the school wrote it. Merged into the lesson cards on the server.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { curriculumMapView, type MapViewNode } from "./view";
import data from "../../../data/curriculum-map/lesson-details.json";

export interface LessonDetail { unit: number; number: number; name: string; genre: string; textIdea: string | null; vocabulary: string[]; vocabularySkill: string | null; readingSkills: string[] }
type DetailFile = { grades: Record<string, Record<string, LessonDetail>> };

/** Known spelling fixes for names stored before the source was corrected. */
const FIXES: [RegExp, string][] = [[/\bCacoon\b/g, "Cocoon"]];
export const fixName = (s: string): string => FIXES.reduce((x, [re, to]) => x.replace(re, to), s);
/** “A World of Change” → A World of Change */
const bare = (s: string) => fixName(s.replace(/^[“"']+|[”"']+$/g, "").trim());

export function allLessonDetails(): Record<string, Record<string, LessonDetail>> { return (data as DetailFile).grades; }

/** The details of one lesson: by its selection title or its shared read (curly quotes ignored). */
export function lessonDetail(grade: number, name: string | null | undefined): LessonDetail | null {
  if (!name) return null;
  const g = allLessonDetails()[String(grade)];
  if (!g) return null;
  const key = bare(name);
  return g[key] ?? Object.values(g).find((l) => l.name.toLowerCase() === key.toLowerCase()) ?? null;
}

export type SectionKind = "CONCEPT_VOCABULARY" | "ANALYZE_CRAFT_AND_STRUCTURE" | "RESPOND_TO_READING" | "REVIEW";
export interface LessonSection { code: string; title: string; kind: SectionKind | null; ready: boolean }
export interface LessonCard {
  code: string; unitCode: string; unit: string; name: string; genre: string | null; textIdea: string | null;
  vocabulary: string[]; vocabularySkill: string | null; readingSkills: string[]; sections: LessonSection[];
}
export interface CurriculumUnit { code: string; title: string; lessons: LessonCard[] }

const has = (n: MapViewNode): boolean => n.counts.adaptive + n.counts.teacher > 0 || n.children.some(has);

/** Lesson cards of one unit node of the map view, with the details merged in. */
function unitCards(grade: number, u: MapViewNode, ready?: (n: MapViewNode) => boolean): CurriculumUnit {
  const title = u.title.split(":")[0].trim();
  return {
    code: u.code, title,
    lessons: u.children.map((s) => {
      const d = lessonDetail(grade, s.sharedRead) ?? lessonDetail(grade, s.title);
      const name = d?.name ?? bare(s.sharedRead ?? s.title);
      return {
        code: s.code, unitCode: u.code, unit: title, name, genre: d?.genre ?? s.genre, textIdea: d?.textIdea ?? null,
        vocabulary: d?.vocabulary ?? [], vocabularySkill: d?.vocabularySkill ?? null,
        readingSkills: d?.readingSkills?.length ? d.readingSkills : (s.children.find((c) => c.categoryType === "ANALYZE_CRAFT_AND_STRUCTURE")?.skills ?? "").split(/\s*[\\/]\s*/).filter(Boolean),
        sections: s.children.map((c) => ({ code: c.code, title: c.title.replace(/^\d+-\s*/, ""), kind: (c.categoryType as SectionKind | null) ?? null, ready: (ready ?? has)(c) })),
      };
    }),
  };
}

/** Staff: the grade's units and lesson cards (all content is open to every teacher). */
export async function curriculumLessons(repo: Repo, actor: Actor, grade?: number): Promise<{ grades: number[]; grade: number | null; units: CurriculumUnit[] }> {
  const v = await curriculumMapView(repo, actor, grade);
  const level = v.level;
  return { grades: v.grades.map((g) => g.level), grade: level, units: level === null ? [] : (v.book?.children ?? []).map((u) => unitCards(level, u)) };
}

/** A flat outline of the lessons and skills in order — what the student will see in the plan (the Preview step). */
export interface OutlineLesson { unitCode: string; unit: string; name: string; skills: string[] }
export function outlineOf(units: CurriculumUnit[]): OutlineLesson[] {
  return units.flatMap((u) => u.lessons.map((l) => ({
    unitCode: u.code, unit: u.title, name: l.name,
    skills: [...(l.vocabularySkill ? [`Vocabulary: ${l.vocabularySkill}`] : []), ...l.readingSkills, ...l.sections.filter((s) => s.kind === "RESPOND_TO_READING").map((s) => s.title)],
  })));
}

const s = (v: unknown) => String(v ?? "");

/**
 * Student: the lesson cards of their own grade (read-only, no levels shown), from the map nodes directly.
 * A section is ready when it has published questions.
 */
export async function studentCurriculumLessons(repo: Repo, actor: Actor): Promise<{ grade: number | null; units: CurriculumUnit[] }> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Students only.");
  assertCan(actor, "curriculum:read");
  const st = await repo.findUnique("Student", { id: actor.studentId });
  const gradeRow = st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
  if (!gradeRow) return { grade: null, units: [] };
  const grade = Number(gradeRow.level);
  const rows = await repo.findMany("CurriculumMapNode", { gradeId: gradeRow.id }, { select: ["id", "parentId", "code", "kind", "title", "heading", "sharedRead", "genre", "categoryType", "skills", "level", "acceptsQuestions", "sortOrder"] });
  const attach = rows.filter((r) => Boolean(r.acceptsQuestions)).map((r) => s(r.id));
  const links = attach.length ? await repo.findMany("QuestionMapLink", { nodeId: { in: attach } }, { select: ["nodeId", "questionId"] }) : [];
  const pub = links.length ? new Set((await repo.findMany("Question", { id: { in: [...new Set(links.map((l) => s(l.questionId)))] }, status: "PUBLISHED", deletedAt: null }, { select: ["id"] })).map((q) => s(q.id))) : new Set<string>();
  const withQ = new Set(links.filter((l) => pub.has(s(l.questionId))).map((l) => s(l.nodeId)));
  const kids = new Map<string, Row[]>();
  for (const r of rows) { const k = s(r.parentId); kids.set(k, [...(kids.get(k) ?? []), r]); }
  const build = (r: Row): MapViewNode => {
    const children = (kids.get(s(r.id)) ?? []).sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder)).map(build);
    const n = withQ.has(s(r.id)) ? 1 : 0;
    return { id: s(r.id), code: s(r.code), kind: s(r.kind), title: s(r.title), heading: r.heading ? s(r.heading) : null, sharedRead: r.sharedRead ? s(r.sharedRead) : null, genre: r.genre ? s(r.genre) : null, categoryType: r.categoryType ? s(r.categoryType) : null, skills: r.skills ? s(r.skills) : null, level: r.level ? s(r.level) : null, acceptsQuestions: Boolean(r.acceptsQuestions), questions: n, counts: { adaptive: n, teacher: 0, waiting: 0 }, children };
  };
  const book = (kids.get("") ?? []).find((r) => r.kind === "BOOK");
  const units = book ? build(book).children : [];
  return { grade, units: units.map((u) => unitCards(grade, u)) };
}

/**
 * The lesson of a Curriculum Map place: "Unit 2" + "Text Set 3: Poetry" → the grade's lesson details (name, Text
 * Idea, words). Matched by the unit and text-set numbers (the order in the user's curriculum document).
 */
export function lessonAt(grade: number, unitTitle: string | null | undefined, setTitle: string | null | undefined): LessonDetail | null {
  const u = Number(/unit\s*(\d+)/i.exec(String(unitTitle ?? ""))?.[1] ?? 0);
  const n = Number(/(?:text\s*set|set|week|lesson)\s*(\d+)/i.exec(String(setTitle ?? ""))?.[1] ?? 0);
  if (!u || !n) return null;
  const g = allLessonDetails()[String(grade)];
  if (!g) return null;
  return Object.values(g).find((l) => l.unit === u && l.number === n) ?? null;
}
