/**
 * 👀 Preview before sending: exactly what students of each level (Below / On / Above) will see for a
 * Curriculum Map section (e.g. G4.U1.TS1.ACS) or a skill (Grammar, Skills), with the answer key for the
 * teacher. Printable / saved as PDF from the browser.
 */
import { teacherMapGrades } from "../curriculum-map/view";
import type { Repo } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { attachmentNodes } from "../curriculum-map/questions";
import { MAX_REVIEW, teacherReviewQuestions } from "../curriculum-map/review-control";
import { fromDifficulty } from "../curriculum-map/leveled-run";
import { loadQuestionItems, loadSkillItems, toClientQuestion, type ClientQuestion, type PracticeItem } from "../practice/items";
import { openStudentPreview } from "../tests/student-preview";

const s = (v: unknown) => String(v ?? "");
export type Level = "BELOW" | "ON" | "ABOVE";
export const LEVELS: Level[] = ["BELOW", "ON", "ABOVE"];
export interface PreviewQuestion { id: string; type: string; stem: string; passageTitle: string | null; passageText: string | null; options: { label: string; text: string; correct: boolean }[]; answer: string | null }
export interface PreviewView {
  title: string; subtitle: string; level: Level; counts: Record<Level, number>; questions: PreviewQuestion[]; shown: number; assignHref: string | null; test?: boolean;
  /** a test: the chosen version's questions exactly as the student's quiz player gets them (no answers) */
  student?: ClientQuestion[];
}

const MAX = 40;
/** a test shows every question (a test has at most 50) */
const TEST_MAX = 60;

function answerOf(i: PracticeItem): string | null {
  if (i.options?.length) return i.options.filter((o) => o.correct).map((o) => `${o.label}. ${o.text}`).join(" · ") || null;
  if (typeof i.answer === "boolean") return i.answer ? "True" : "False";
  if (i.answers?.length) return i.answers.join(" / ");
  if (i.sequence?.length) return i.sequence.join(" → ");
  if (i.pairs?.length) return i.pairs.map((p) => `${p.left} = ${p.right}`).join(" · ");
  if (i.segments && i.errorIndex !== undefined) return `Error: “${i.segments[i.errorIndex]}” → ${i.correction ?? ""}`;
  return null;
}
const view = (i: PracticeItem): PreviewQuestion => ({
  id: i.questionId, type: s(i.type), stem: i.stem, passageTitle: i.passageTitle, passageText: i.passageText,
  options: (i.options ?? []).map((o) => ({ label: o.label, text: o.text, correct: o.correct })), answer: answerOf(i),
});

export async function previewWork(repo: Repo, actor: Actor, input: { code?: string | null; skillId?: string | null; level?: string | null; test?: string | null }): Promise<PreviewView> {
  assertCan(actor, "questions:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError("Only staff can preview.");
  const level: Level = LEVELS.includes(s(input.level).toUpperCase() as Level) ? (s(input.level).toUpperCase() as Level) : "ON";
  const byLevel: Record<Level, PracticeItem[]> = { BELOW: [], ON: [], ABOVE: [] };
  let title = "", subtitle = "", assignHref: string | null = null;
  if (input.test) {
    // 📝 a test from the builder (Assessments → New test): its questions in the test's order, per level version
    const p = await openStudentPreview(repo, actor, s(input.test));
    const ids = [...new Set(Object.values(p.questions).flat().filter(Boolean) as string[])];
    const items = new Map((await loadQuestionItems(repo, ids)).map((i) => [i.questionId, i]));
    const of = (l: string[] | undefined) => (l ?? []).map((id) => items.get(id)).filter(Boolean) as PracticeItem[];
    for (const l of LEVELS) byLevel[l] = p.levelMode === "LEVEL" ? of(p.questions[l]) : of(p.questions.SAME);
    const counts = { BELOW: byLevel.BELOW.length, ON: byLevel.ON.length, ABOVE: byLevel.ABOVE.length };
    return {
      title: p.title, subtitle: p.levelMode === "LEVEL" ? "Test · each student gets the version of their level" : "Test · every student gets these questions",
      level, counts, questions: byLevel[level].slice(0, TEST_MAX).map(view), shown: Math.min(TEST_MAX, byLevel[level].length), assignHref: null, test: true,
      student: byLevel[level].slice(0, TEST_MAX).map((i) => toClientQuestion(i, `preview:${s(input.test)}:${i.questionId}`)),
    };
  }
  if (input.code) {
    const code = s(input.code).toUpperCase().replace(/\.(BELOW|ON|ABOVE)$/, "");
    const places = (await attachmentNodes(repo, actor.schoolId!)).filter((n) => n.code === code || n.code.startsWith(`${code}.`));
    if (!places.length) throw new ValidationError("That place is not on the Curriculum Map.");
    // 🧭 a teacher opens the Curriculum Map of their own grade(s) only
    const own = await teacherMapGrades(repo, actor);
    if (own && !own.has(places[0].grade)) throw new ForbiddenError("The Curriculum Map of this grade is not one of your classes' grades.");
    // 🐛 fix (Oct 2026, "عايز اشوف المراجعه كامله"): this Preview used to always show the Review place's raw SHARED
    // questions, ignoring anything the teacher added, removed, reordered, wrote themselves or edited into a private
    // copy in their own Review (review-control.ts) — so the "👁 Preview" a teacher opened from their Review never
    // actually matched what they had built there, and never reflected what Fixed assign would actually send. When
    // this place is a Review the teacher has customized, show exactly their list, in their order, instead — a flat
    // list (a Review has no Below/On/Above versions), so it is shown under the single "ON" tab.
    if (places[0].category === "REVIEW" && actor.role === "TEACHER") {
      const mine = await teacherReviewQuestions(repo, actor, places[0]);
      if (mine && mine.length) {
        const items = new Map((await loadQuestionItems(repo, mine)).map((i) => [i.questionId, i]));
        const ordered = mine.map((id) => items.get(id)).filter(Boolean) as PracticeItem[];
        const myTitle = `${places[0].heading} · ${places[0].categoryLabel.replace(/^\d+-\s*/, "")} · My Review`;
        const mySubtitle = `Grade ${places[0].grade} · ${places[0].unitTitle}`;
        return {
          title: myTitle, subtitle: mySubtitle, level: "ON", counts: { BELOW: 0, ON: ordered.length, ABOVE: 0 },
          questions: ordered.slice(0, MAX_REVIEW).map(view), shown: Math.min(MAX_REVIEW, ordered.length),
          assignHref: null, // ⭐ Assign already lives on the Review page itself, against this same list
        };
      }
    }
    const links = await repo.findMany("QuestionMapLink", { nodeId: { in: places.map((p) => p.id) } });
    const items = await loadQuestionItems(repo, [...new Set(links.map((l) => s(l.questionId)))]);
    const nodeLevel = new Map(places.map((p) => [p.id, p.level]));
    const levelOfQ = new Map(links.map((l) => [s(l.questionId), nodeLevel.get(s(l.nodeId)) ?? null]));
    for (const i of items) byLevel[(levelOfQ.get(i.questionId) as Level | null) ?? fromDifficulty(i.level)].push(i);
    title = `${places[0].heading} · ${places[0].categoryLabel.replace(/^\d+-\s*/, "")}`;
    subtitle = `Grade ${places[0].grade} · ${places[0].unitTitle}`;
    assignHref = `/teacher/map-assign?code=${code}`;
  } else if (input.skillId) {
    const skill = await repo.findUnique("Skill", { id: s(input.skillId) });
    if (!skill || skill.deletedAt) throw new ValidationError("Skill not found.");
    const cur = await repo.findUnique("Curriculum", { id: skill.curriculumId });
    const grade = cur ? await repo.findUnique("Grade", { id: cur.gradeId }) : null;
    if (!grade || s(grade.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Skill not found.");
    for (const i of await loadSkillItems(repo, s(skill.id))) byLevel[fromDifficulty(i.level)].push(i);
    title = s(skill.name); subtitle = `Grade ${grade.level}`;
  } else throw new ValidationError("Choose a section or a skill to preview.");
  for (const l of LEVELS) byLevel[l].sort((a, b) => a.level - b.level || a.stem.localeCompare(b.stem));
  return { title, subtitle, level, counts: { BELOW: byLevel.BELOW.length, ON: byLevel.ON.length, ABOVE: byLevel.ABOVE.length }, questions: byLevel[level].slice(0, MAX).map(view), shown: Math.min(MAX, byLevel[level].length), assignHref };
}
