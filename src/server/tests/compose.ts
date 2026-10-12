/**
 * 🧩 One test from several sources: Curriculum Map questions (the teacher's picks, in their order), skills where the
 * teacher ticked the questions, and skills where the platform picks N questions (Skills & grammar). The teacher's own
 * picks may never repeat (same question, or same text and answer — rejected with a message); the platform's picks
 * simply skip anything already in the test.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { describe, MAX_TEST_QUESTIONS, previewTest, type LevelMode, type PickedSkill, type TestPreview } from "./assessments";
import { assertNoDuplicateQuestions, withoutRepeats } from "./map-source";

const s = (v: unknown) => String(v ?? "");

export interface ComposeInput { skills: (PickedSkill & { questionIds?: string[] })[]; levelMode: LevelMode; seed?: string; mapQuestionIds?: string[] }

export async function composeTest(repo: Repo, actor: Actor, input: ComposeInput): Promise<TestPreview> {
  const levelMode: LevelMode = input?.levelMode === "LEVEL" ? "LEVEL" : "SAME";
  const all = Array.isArray(input?.skills) ? input.skills : [];
  const own = (k: (typeof all)[number]) => Array.isArray(k?.questionIds) && k.questionIds.length > 0;
  const auto = all.filter((k) => !own(k)).map((k) => ({ skillId: s(k?.skillId), count: Number(k?.count) || 5 }));
  const mapIds = (Array.isArray(input?.mapQuestionIds) ? input.mapQuestionIds : []).map(s).filter(Boolean);
  const explicit = [...mapIds, ...all.filter(own).flatMap((k) => k.questionIds!.map(s))];
  if (!auto.length && !explicit.length) throw new ValidationError("Choose questions first: from the Curriculum Map or from skills.");
  if (explicit.length > MAX_TEST_QUESTIONS) throw new ValidationError(`A test can have at most ${MAX_TEST_QUESTIONS} questions — lower the numbers.`);
  await assertNoDuplicateQuestions(repo, explicit);
  const base: TestPreview = auto.length ? await previewTest(repo, actor, { skills: auto, levelMode, seed: s(input?.seed) }) : { levelMode, versions: {}, notes: [] };
  const mine = explicit.length ? (await describe(repo, actor, { SAME: explicit }, all.filter(own).map((k) => s(k.skillId)))).SAME ?? [] : [];
  const mineIds = mine.map((x) => x.id);
  const keys = levelMode === "LEVEL" ? (["BELOW", "ON", "ABOVE"] as const) : (["SAME"] as const);
  const versions: TestPreview["versions"] = {};
  const notes = [...base.notes];
  for (const key of keys) {
    const rows = base.versions[key] ?? [];
    const keep = new Set(await withoutRepeats(repo, mineIds, rows.map((x) => x.id)));
    if (keep.size < rows.length) notes.push("Some questions picked by the platform were already in the test and were left out.");
    versions[key] = [...mine, ...rows.filter((x) => keep.has(x.id))];
    if ((versions[key] ?? []).length > MAX_TEST_QUESTIONS) throw new ValidationError(`A test can have at most ${MAX_TEST_QUESTIONS} questions — lower the numbers.`);
  }
  return { levelMode, versions, notes: [...new Set(notes)] };
}
