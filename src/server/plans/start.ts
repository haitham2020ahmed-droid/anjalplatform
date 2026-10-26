/**
 * Step 2 of a new plan ("What"): the platform's suggestion for the chosen students and program, made into a
 * DRAFT the teacher then edits completely (editor.ts). Nothing is sent.
 *
 *   MAP        each student's lowest MAP sub-areas → their weakest skills there (suggestMapPlan)
 *   NAFS       Grade 6 only: the latest NAFS test's results, else the NAFS areas (suggestNafsPlan)
 *   RTI        Support: each student's struggling skills (mastery under 60 after 5+ answers)
 *   Custom     the weakest skills of the chosen students on the platform (perf-suggest.ts)
 *   Curriculum empty: the teacher adds lessons of the Curriculum Map
 */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "../teacher/assignments";
import { strugglingSkills } from "../tiers/struggling";
import type { Program } from "./program";
import { assertProgramFitsGrade, createDraft, type PlanSource, type SectionSpec } from "./editor";
import { suggestMapPlan, type MapSubject } from "./map-suggest";
import { suggestNafsPlan } from "./nafs-suggest";
import { excellingSkillsFor, sourceOf, suggestPlans, weakestSkillsFor } from "./perf-suggest";

const s = (v: unknown) => String(v ?? "");

// ⚡ Enrichment: additive-only, kept out of the Program type (`null`, same safe bucket as Custom) so it never
// touches AssignSource/source-tags/the RTI-tier system — just this one extra flag, checked before the others.
export interface StartInput { classId: string; program: Program | null; studentIds: string[]; mode: "suggested" | "empty"; subject?: MapSubject; title?: string | null; enrichment?: boolean }

/** The platform's sections for a new plan of this program (empty list = nothing to suggest yet). */
export async function suggestedSections(repo: Repo, actor: Actor, input: StartInput): Promise<{ sections: SectionSpec[]; source: PlanSource | null }> {
  const klass = await assertClassAccess(repo, actor, input.classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  assertProgramFitsGrade(input.program, grade);
  const all = (await repo.findMany("ClassMembership", { classId: klass.id, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId));
  const who = input.studentIds.length ? input.studentIds : all;
  const scoped = (ids: string[]) => (ids.length >= who.length ? null : ids);
  if (input.enrichment) {
    const e = await excellingSkillsFor(repo, actor, input.classId, input.studentIds, 4);
    return { sections: e.sections.map((k) => ({ skillId: k.skillId, count: k.count, lesson: k.lesson, level: k.level, reason: k.reason })), source: e.source };
  }
  if (input.program === "MAP") {
    const sug = await suggestMapPlan(repo, actor, { classId: input.classId, studentIds: input.studentIds, subject: input.subject });
    return {
      sections: sug.skills.map((k) => ({ skillId: k.id, count: 10, studentIds: scoped(k.studentIds), reason: k.reason, level: "ON" })),
      source: sug.rows.length ? { reason: "From the MAP scores: each student's lowest sub-areas.", sources: ["MAP", "Mastery"], rows: sug.rows.map((r) => ({ name: r.name, lines: [`RIT ${r.rit ?? "—"}`, ...r.areas.map((a) => (a.rit ? `${a.name} (RIT ${a.rit})` : a.name))] })) } : null,
    };
  }
  if (input.program === "NAFS") {
    const sug = await suggestNafsPlan(repo, actor, { classId: input.classId, studentIds: input.studentIds });
    return {
      sections: sug.skills.slice(0, 12).map((k) => ({ skillId: k.id, count: 8, studentIds: scoped(k.studentIds), reason: k.reason })),
      source: sug.source === "RESULTS" ? { reason: `From the NAFS test results: ${sug.testTitle ?? ""}`, reasonT: { t: "From the NAFS test results: {test}", v: { test: sug.testTitle ?? "" } }, sources: ["NAFS"], rows: [] } : { reason: "No NAFS test results yet: the general NAFS plan from the NAFS areas.", sources: ["NAFS"], rows: [] },
    };
  }
  if (input.program === "RTI") {
    const weak = await strugglingSkills(repo, who);
    const by = new Map<string, { name: string; ids: string[]; scores: number[] }>();
    for (const [st, list] of weak) for (const k of list) { const x = by.get(k.id) ?? { name: k.name, ids: [], scores: [] }; x.ids.push(st); x.scores.push(k.score); by.set(k.id, x); }
    const top = [...by].sort((a, b) => b[1].ids.length - a[1].ids.length || a[1].name.localeCompare(b[1].name)).slice(0, 8);
    return {
      sections: top.map(([id, x]) => ({ skillId: id, count: 10, studentIds: scoped(x.ids.sort()), lesson: true, level: "BELOW", reason: "Struggling skill" })),
      source: top.length ? { reason: "Struggling skills (mastery under 60 after 5 or more answers).", sources: ["Mastery"], rows: [] } : null,
    };
  }
  if (input.program === "CURRICULUM") return { sections: [], source: null };
  const w = await weakestSkillsFor(repo, actor, input.classId, input.studentIds, 4);
  return { sections: w.sections.map((k) => ({ skillId: k.skillId, count: k.count, lesson: k.lesson, level: k.level, reason: k.reason })), source: w.source };
}

/** 1 Who → 2 What: a new draft, suggested by the platform or empty. Returns its id. */
export async function startPlan(repo: Repo, actor: Actor, input: StartInput, now = new Date()): Promise<{ planId: string; empty: boolean }> {
  if (!input.classId) throw new ValidationError("Choose a class.");
  const sug = input.mode === "suggested" ? await suggestedSections(repo, actor, input) : { sections: [], source: null };
  if (input.mode !== "suggested") {
    const klass = await assertClassAccess(repo, actor, input.classId);
    assertProgramFitsGrade(input.program, Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0));
  }
  const planId = await createDraft(repo, actor, { classId: input.classId, program: input.program, studentIds: input.studentIds, title: input.title, sections: sug.sections, suggested: sug.sections.length > 0, source: sug.source, enrichment: input.enrichment }, now);
  return { planId, empty: sug.sections.length === 0 };
}

/** 💡 A suggested plan of the Suggestions list → a draft (found again on the server by its id; nothing from the browser is trusted). */
export async function draftFromSuggestion(repo: Repo, actor: Actor, classId: string, suggestionId: string, now = new Date()): Promise<string> {
  const list = await suggestPlans(repo, actor, classId, now);
  const x = list.find((y) => y.id === suggestionId);
  if (!x) throw new ValidationError("This suggestion changed with new results. Look at the list again.");
  return createDraft(repo, actor, {
    classId, program: x.program, studentIds: x.studentIds, title: x.title,
    sections: x.sections, suggested: true, source: sourceOf(x),
  }, now);
}
