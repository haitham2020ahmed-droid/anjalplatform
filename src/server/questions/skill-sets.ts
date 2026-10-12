/**
 * ➕ School-supplied MAP-style skill sets (data/questions/sets/map-skill-sets.json: Persuasive Techniques, Rhetorical
 * Questions). For each set: the skill is created in Grades 4, 5 and 6 (one family, one question pool) when missing,
 * and its questions are added to the bank under the Grade 5 skill (or the school's middle grade), PUBLISHED (the
 * school asked for them on the platform). Safe to run again: a question already in the bank is skipped.
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { createSkill } from "../curriculum-manage";
import { createDraft } from "../admin/questions";
import { libraryActor } from "../readmaster/library";

const s = (v: unknown) => String(v ?? "");
const LEVEL: Record<string, number> = { BELOW: 2, ON: 4, ABOVE: 6 };

export interface SetQuestion { ref: string; anchor: string; level: string; passageTitle: string | null; passage: string | null; stem: string; options: string[]; correct: string; why: string }
export interface SkillSet { skill: string; questions: SetQuestion[] }
export interface SetResult { skill: string; skillsCreated: number; added: number; skipped: number; errors: string[] }

export async function loadSkillSetsFile(): Promise<SkillSet[]> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const raw = JSON.parse(await readFile(join(process.cwd(), "data", "questions", "sets", "map-skill-sets.json"), "utf8")) as { sets: SkillSet[] };
  return raw.sets ?? [];
}

/** "CCRA.R.8" + grade 5 → the stored code of RI.5.8 (informational reading). */
function standardFor(anchor: string, grade: number, stored: Map<string, string>): string | null {
  const n = /R\.(\d+)/i.exec(anchor)?.[1];
  return n ? stored.get(`RI.${grade}.${n}`) ?? null : null;
}

export async function addSkillSets(repo: Repo, schoolId: string, sets: SkillSet[], actorIn?: Actor, now = new Date()): Promise<SetResult[]> {
  const actor = actorIn ?? (await libraryActor(repo, schoolId));
  const grades = (await repo.findMany("Grade", { schoolId }, { select: ["id", "level"] })).filter((g) => [4, 5, 6].includes(Number(g.level)));
  const stored = new Map((await repo.findMany("Standard", {}, { select: ["code"] })).map((x) => [s(x.code).replace(/^CCSS\.ELA-LITERACY\./i, "").toUpperCase(), s(x.code)]));
  const home = grades.find((g) => Number(g.level) === 5) ?? grades[0];
  const out: SetResult[] = [];
  for (const set of sets) {
    const r: SetResult = { skill: set.skill, skillsCreated: 0, added: 0, skipped: 0, errors: [] };
    let homeSkillId: string | null = null;
    for (const g of grades) {
      const cur = (await repo.findMany("Curriculum", { gradeId: g.id }, { select: ["id"] }))[0];
      if (!cur) continue;
      const have = (await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }, { select: ["id", "name"] })).find((k) => s(k.name).toLowerCase() === set.skill.toLowerCase());
      let id = have ? s(have.id) : null;
      if (!id) {
        const level = Number(g.level);
        const codes = [`RI.${level}.6`, `RI.${level}.8`].filter((c) => stored.has(c));
        try { id = s((await createSkill(repo, actor, { gradeId: s(g.id), name: set.skill, domain: "READING", category: "INFORMATIONAL", standardCodes: codes, confirmDuplicate: true })).id); r.skillsCreated++; }
        catch (e) { r.errors.push(`Grade ${level}: ${(e as Error).message}`); }
      }
      if (id && home && g.id === home.id) homeSkillId = id;
    }
    if (!homeSkillId) { r.errors.push("No Grade 4–6 skill to add the questions to."); out.push(r); continue; }
    const grade = Number(home!.level);
    const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const have = new Set((await repo.findMany("Question", { skillId: homeSkillId, deletedAt: null }, { select: ["stem"] })).map((x) => key(s(x.stem))));
    const added = new Set<string>();
    for (const q of set.questions) {
      const k2 = `${key(q.stem)}|${key(s(q.passageTitle))}`;
      if (have.has(key(q.stem)) || added.has(k2)) { r.skipped++; continue; }
      try {
        const correct = "ABCD".indexOf(s(q.correct).trim().toUpperCase().charAt(0));
        if (correct < 0) throw new Error("no correct answer");
        const std = standardFor(q.anchor, grade, stored);
        const qid = await createDraft(repo, actor, {
          skillId: homeSkillId, type: "MULTIPLE_CHOICE" as never, stem: q.stem, level: LEVEL[s(q.level).toUpperCase()] ?? 4, whyCorrect: q.why,
          options: q.options.map((text, i) => ({ label: "ABCD"[i], text: s(text), correct: i === correct, rationale: i === correct ? null : "Read the text again." })),
          ...(q.passage ? { passageText: q.passageTitle ? `${q.passageTitle}\n\n${q.passage}` : q.passage } : {}),
          ...(std ? { standardCode: std } : {}),
        } as never, now);
        await repo.updateMany("Question", { id: qid }, { status: "PUBLISHED", publishedAt: now, reviewedById: actor.userId });
        added.add(k2); r.added++;
      } catch (e) {
        if (/already exists|duplicate/i.test((e as Error).message)) r.skipped++;
        else r.errors.push(`${q.ref}: ${(e as Error).message}`);
      }
    }
    out.push(r);
  }
  return out;
}
