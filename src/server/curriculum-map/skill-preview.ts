/**
 * 👀 r87 (owner: "عايز لما اضغط علي concept vocabulary في الـ PDF يوديني عليها"): a READ-ONLY look at one
 * Curriculum Map place (Concept Vocabulary / Analyze Craft and Structure / Review / a Grammar or Spelling skill's
 * code), for whoever opens the link printed in the Curriculum Map PDF — a STUDENT or a PARENT, not just staff.
 * `src/server/teacher/preview.ts#previewWork` already does this for staff, with the answer key and edit/assign
 * links — explicitly refused to STUDENT and PARENT (`Only staff can preview.`). This is that same place, trimmed
 * down to what a family should see: the question text and choices, NEVER which choice is correct, no edit link,
 * no "Assign" button — just "here is what this skill covers". Scoped to the student's own grade (a parent: any
 * of their children's grades), the same guard `studentCurriculumLessons` already uses for this audience.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { attachmentNodes } from "./questions";
import { loadQuestionItems, type PracticeItem } from "../practice/items";
import { parentChildren } from "../queries/parent";

const s = (v: unknown) => String(v ?? "");
const MAX = 20;

export interface FamilyPreviewQuestion { id: string; stem: string; passageTitle: string | null; passageText: string | null; options: { label: string; text: string }[] }
export interface FamilyPreviewView { title: string; subtitle: string; grade: number; questions: FamilyPreviewQuestion[]; shown: number; total: number }

const view = (i: PracticeItem): FamilyPreviewQuestion => ({
  id: i.questionId, stem: i.stem, passageTitle: i.passageTitle, passageText: i.passageText,
  // 🔒 never the `correct` flag and never `answer` — this reader may be the student who will do this skill
  options: (i.options ?? []).map((o) => ({ label: o.label, text: o.text })),
});

/** The grade(s) this actor may preview a family-safe Curriculum Map place for. */
async function familyGrades(repo: Repo, actor: Actor): Promise<Set<number>> {
  if (actor.role === "STUDENT") {
    if (!actor.studentId) throw new ForbiddenError("Students only.");
    const st = await repo.findUnique("Student", { id: actor.studentId });
    const g = st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
    return g ? new Set([Number(g.level)]) : new Set();
  }
  if (actor.role === "PARENT") {
    const kids = await parentChildren(repo, actor);
    return new Set(kids.map((k) => Number(k.grade)).filter((n) => Number.isFinite(n)));
  }
  throw new ForbiddenError("This preview is for students and parents.");
}

/** A Curriculum Map place (its code), read-only, no answer key: for the family link printed in the Curriculum Map PDF. */
export async function familySkillPreview(repo: Repo, actor: Actor, codeRaw: string): Promise<FamilyPreviewView> {
  assertCan(actor, "questions:read");
  const grades = await familyGrades(repo, actor);
  if (!grades.size) throw new ValidationError("No grade found for this account.");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  const code = s(codeRaw).toUpperCase().replace(/\.(BELOW|ON|ABOVE)$/, "");
  if (!code) throw new ValidationError("Choose a skill to preview.");
  const places = (await attachmentNodes(repo, actor.schoolId)).filter((n) => n.code === code || n.code.startsWith(`${code}.`));
  if (!places.length) throw new ValidationError("That skill is not on the Curriculum Map.");
  if (!grades.has(places[0].grade)) throw new ForbiddenError("This skill is not in your grade.");
  const links = await repo.findMany("QuestionMapLink", { nodeId: { in: places.map((p) => p.id) } });
  const items = await loadQuestionItems(repo, [...new Set(links.map((l) => s(l.questionId)))]);
  items.sort((a, b) => a.level - b.level || a.stem.localeCompare(b.stem));
  return {
    title: `${places[0].heading} · ${places[0].categoryLabel.replace(/^\d+-\s*/, "")}`,
    subtitle: `Grade ${places[0].grade} · ${places[0].unitTitle}`,
    grade: places[0].grade, questions: items.slice(0, MAX).map(view), shown: Math.min(MAX, items.length), total: items.length,
  };
}
