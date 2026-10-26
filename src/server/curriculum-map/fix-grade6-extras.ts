/**
 * 🩹 One-off repair (Oct 2026): the `gradeSixExtras` pack (data/questions/sets/grade6-extra-skill-sets.json)
 * created and published 100 questions each for two new Grade 6 skills — "Analyzing Figurative, Connotative,
 * and Technical Language" (Mother to Son, Unit 2 Selection 4) and "Analyzing Informational Text Elements"
 * (Shakespeare in Harlem, Unit 3 Selection 3) — through addSkillSets(), which never places a question on
 * the Curriculum Map (it does not pass a mapNodeCode to createDraft). So the questions exist and are
 * published (they work fine in Practice/adaptive), but the Skill-plan page's "ready" status — which comes
 * only from QuestionMapLink rows (src/server/curriculum-map/view.ts) — never saw them: both lessons' "Analyze
 * Craft and Structure" section stayed "Not ready" even though every question was authored.
 *
 * This retroactively links the already-published questions to their lesson's three Level nodes (Above / On /
 * Below), by the question's own difficultyLevel (2 = Below, 4 = On, 6 = Above — the same mapping addSkillSets
 * used when it created them). It never touches an already-linked question (additive only, never replaces or
 * deletes a link, unlike the editor's "move this question" action) — safe to run again.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { libraryActor } from "../readmaster/library";
import { attachmentNodes } from "./questions";
import { normalizeSkillName } from "../questions/skill-questions";

const s = (v: unknown) => String(v ?? "");
const LEVEL_OF: Record<number, "BELOW" | "ON" | "ABOVE"> = { 2: "BELOW", 4: "ON", 6: "ABOVE" };

/** skill name → the Grade 6 lesson's "Analyze Craft and Structure" category node (its three Level children take the questions). */
export const GRADE6_EXTRAS_MAP_TARGETS = [
  { skill: "Analyzing Figurative, Connotative, and Technical Language", nodeCode: "G6.U2.SEL4.ACS", lesson: "Mother to Son" },
  { skill: "Analyzing Informational Text Elements", nodeCode: "G6.U3.SEL3.ACS", lesson: "Shakespeare in Harlem" },
] as const;

export interface FixResult { skill: string; lesson: string; linked: number; alreadyLinked: number; skippedUnknownLevel: number; errors: string[] }

export async function linkGradeSixExtrasToMap(repo: Repo, schoolId: string, actorIn?: Actor, now = new Date()): Promise<FixResult[]> {
  const actor = actorIn ?? (await libraryActor(repo, schoolId));
  const nodes = await attachmentNodes(repo, schoolId);
  const byCode = new Map(nodes.map((n) => [n.code.toUpperCase(), n]));
  const grade6 = (await repo.findMany("Grade", { schoolId, level: 6 }, { select: ["id"] }))[0];
  const curId = grade6 ? s((await repo.findMany("Curriculum", { gradeId: grade6.id }, { select: ["id"] }))[0]?.id ?? "") : "";
  const out: FixResult[] = [];
  for (const target of GRADE6_EXTRAS_MAP_TARGETS) {
    const r: FixResult = { skill: target.skill, lesson: target.lesson, linked: 0, alreadyLinked: 0, skippedUnknownLevel: 0, errors: [] };
    const levelNodes = {
      BELOW: byCode.get(`${target.nodeCode}.BELOW`), ON: byCode.get(`${target.nodeCode}.ON`), ABOVE: byCode.get(`${target.nodeCode}.ABOVE`),
    } as const;
    if (!levelNodes.BELOW || !levelNodes.ON || !levelNodes.ABOVE) { r.errors.push(`This school's Curriculum Map has no ${target.nodeCode} (seed the map first).`); out.push(r); continue; }
    if (!curId) { r.errors.push("No Grade 6 curriculum on this school."); out.push(r); continue; }
    const want = normalizeSkillName(target.skill);
    const skill = (await repo.findMany("Skill", { curriculumId: curId, deletedAt: null }, { select: ["id", "name"] })).find((k) => normalizeSkillName(s(k.name)) === want);
    if (!skill) { r.errors.push("The skill is not on this school's platform (nothing to link)."); out.push(r); continue; }
    const questions = await repo.findMany("Question", { skillId: skill.id, deletedAt: null, status: "PUBLISHED" }, { select: ["id", "difficultyLevel"] });
    if (!questions.length) { out.push(r); continue; }
    const already = new Set(
      (await repo.findMany("QuestionMapLink", { questionId: { in: questions.map((q) => s(q.id)) } }, { select: ["questionId"] })).map((x) => s(x.questionId)),
    );
    const toLink: { questionId: string; nodeId: string }[] = [];
    for (const q of questions) {
      if (already.has(s(q.id))) { r.alreadyLinked++; continue; }
      const lvl = LEVEL_OF[Number(q.difficultyLevel)];
      const node = lvl ? levelNodes[lvl] : undefined;
      if (!node) { r.skippedUnknownLevel++; continue; }
      toLink.push({ questionId: s(q.id), nodeId: s(node.id) });
    }
    for (let i = 0; i < toLink.length; i += 100) {
      await repo.createMany("QuestionMapLink", toLink.slice(i, i + 100).map((x) => ({ ...x, createdById: actor.userId, createdAt: now })));
    }
    r.linked = toLink.length;
    out.push(r);
  }
  return out;
}
