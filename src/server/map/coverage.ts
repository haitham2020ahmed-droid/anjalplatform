/**
 * 📊 MAP coverage of the Question Bank (admin): is every skill a MAP plan can show linked to the bank, and how many
 * questions does it have?
 *
 * Where MAP plan skills come from (the same code as the plans themselves):
 *   - with the school's Learning Continuum imported: every statement (Reading + Language Usage, every RIT band) is
 *     linked to the platform's skills through its CCSS codes (continuum.ts skillsFor), per grade;
 *   - always: every skill of a grade whose family has a MAP goal area (map-plan.ts groupPools).
 * One row per platform skill (grade, MAP strand, the RIT bands it appears in, published questions — the same shared
 * count as everywhere else), plus:
 *   missing        → continuum statements no skill of any grade links to (the skill does not exist on the platform)
 *   notLinked      → skills with questions whose family has no MAP goal area (they never reach a MAP plan)
 * Counts: red = 0 questions, orange = fewer than ENOUGH_QUESTIONS. Read only; always computed fresh, so it
 * re-checks itself after every question import.
 */
import type { Repo } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { continuumIndex, groupOfGoal, skillsFor } from "./continuum";
import { GROUPS, groupPools, type GroupKey, type Subject } from "./map-plan";
import { masterSkills } from "../skills/master";

export const ENOUGH_QUESTIONS = 25;
const s = (v: unknown) => String(v ?? "");

export type CoverageTone = "RED" | "ORANGE" | "OK";
export const toneOf = (n: number): CoverageTone => (n <= 0 ? "RED" : n < ENOUGH_QUESTIONS ? "ORANGE" : "OK");

export interface CoverageRow {
  skillId: string; skill: string; grade: number; subject: "Reading" | "Language Usage"; strand: string;
  /** the RIT bands of the continuum statements that link to it ("161–170 · 171–180"); "" without a continuum */
  bands: string; statements: number; exists: true; linked: boolean; questions: number; tone: CoverageTone;
}
export interface MissingStatement { subject: "Reading" | "Language Usage"; strand: string; band: string; topic: string; statement: string; standards: string }
export interface CoverageReport {
  hasContinuum: boolean; grades: number[]; rows: CoverageRow[]; missing: MissingStatement[];
  notLinked: { skillId: string; skill: string; grade: number; questions: number }[];
  summary: { skills: number; zero: number; under: number; ok: number; missing: number; notLinked: number };
}

const SUBJECT_NAME: Record<Subject, "Reading" | "Language Usage"> = { READING: "Reading", LANGUAGE: "Language Usage" };
const groupName = (g: GroupKey) => GROUPS.find((x) => x.key === g)?.name ?? g;

export async function mapCoverage(repo: Repo, actor: Actor): Promise<CoverageReport> {
  if (actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only an admin can see the coverage report.");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  const schoolId = actor.schoolId;
  const all = await masterSkills(repo, schoolId);
  const grades = [...new Set(all.map((k) => k.grade))].filter((g) => g > 0).sort((a, b) => a - b);
  const byId = new Map(all.map((k) => [k.id, k]));
  const statementCount = await repo.count("LearningStatement", {});
  const hasContinuum = statementCount > 0;

  const rows = new Map<string, CoverageRow & { bandSet: Set<string> }>();
  const linkedStatements = new Set<string>();
  const statementRows = new Map<string, MissingStatement>();
  for (const grade of grades) {
    const pk = await groupPools(repo, schoolId, grade);
    // every MAP-linked skill of the grade (a plan can show it even without a continuum)
    for (const k of pk.skills.values()) {
      if (rows.has(k.id)) continue;
      const g = GROUPS.find((x) => x.key === k.group)!;
      const n = byId.get(k.id)?.questions ?? 0;
      rows.set(k.id, { skillId: k.id, skill: k.name, grade, subject: SUBJECT_NAME[g.subject], strand: g.name, bands: "", statements: 0, exists: true, linked: true, questions: n, tone: toneOf(n), bandSet: new Set() });
    }
    if (!hasContinuum) continue;
    for (const subject of ["READING", "LANGUAGE"] as Subject[]) {
      const ix = await continuumIndex(repo, schoolId, grade, subject);
      for (const r of ix.rows) {
        const group = groupOfGoal(s(r.goalArea));
        const codes = s(r.standards).split(/\s+/).filter(Boolean);
        const band = `${r.ritLow}–${r.ritHigh}`;
        const id = s(r.id);
        if (!statementRows.has(id)) statementRows.set(id, { subject: SUBJECT_NAME[subject], strand: group ? groupName(group) : s(r.goalArea), band, topic: s(r.topic), statement: s(r.statement), standards: codes.join(" ") });
        const skills = skillsFor(ix, codes, group, 3, `${s(r.topic)} ${s(r.statement)}`);
        if (skills.length) linkedStatements.add(id);
        for (const k of skills) {
          const row = rows.get(k.id);
          if (!row) continue;
          row.bandSet.add(band); row.statements++;
        }
      }
    }
  }
  const out: CoverageRow[] = [...rows.values()].map(({ bandSet, ...r }) => ({
    ...r, bands: [...bandSet].sort((a, b) => Number(a.split("–")[0]) - Number(b.split("–")[0])).join(" · "),
  })).sort((a, b) => a.subject.localeCompare(b.subject) || a.strand.localeCompare(b.strand) || a.grade - b.grade || a.questions - b.questions || a.skill.localeCompare(b.skill));
  const missing = [...statementRows.entries()].filter(([id]) => !linkedStatements.has(id)).map(([, m]) => m)
    .sort((a, b) => a.subject.localeCompare(b.subject) || a.strand.localeCompare(b.strand) || Number(a.band.split("–")[0]) - Number(b.band.split("–")[0]));
  const notLinked = all.filter((k) => k.questions > 0 && !rows.has(k.id) && !k.area && (k.kind === "READING" || k.kind === "LANGUAGE" || k.kind === "VOCABULARY" || k.kind === "GRAMMAR"))
    .map((k) => ({ skillId: k.id, skill: k.name, grade: k.grade, questions: k.questions }));
  return {
    hasContinuum, grades, rows: out, missing, notLinked,
    summary: { skills: out.length, zero: out.filter((r) => r.tone === "RED").length, under: out.filter((r) => r.tone === "ORANGE").length, ok: out.filter((r) => r.tone === "OK").length, missing: missing.length, notLinked: notLinked.length },
  };
}

/** The report as Excel sheets: All skills · 0 questions · Under 25 · Missing skills · Not linked to MAP. */
export function coverageSheets(r: CoverageReport): { name: string; headerStyle: boolean; freeze: boolean; report: boolean; widths: number[]; rows: string[][] }[] {
  const head = ["Skill", "Grade", "Subject", "Strand", "RIT bands", "Exists on platform", "Linked to bank", "Questions"];
  const line = (x: CoverageRow) => [x.skill, String(x.grade), x.subject, x.strand, x.bands || "—", "Yes", x.linked ? "Yes" : "No", String(x.questions)];
  const sheet = (name: string, list: CoverageRow[]) => ({ name, headerStyle: true, freeze: true, report: true, widths: [42, 8, 16, 22, 30, 12, 12, 10], rows: [head, ...list.map(line)] });
  return [
    sheet("All skills", r.rows),
    sheet("0 questions", r.rows.filter((x) => x.tone === "RED")),
    sheet(`Under ${ENOUGH_QUESTIONS}`, r.rows.filter((x) => x.tone === "ORANGE")),
    { name: "Missing skills", headerStyle: true, freeze: true, report: true, widths: [16, 22, 12, 24, 70, 24], rows: [["Subject", "Strand", "RIT band", "Topic", "Statement (no platform skill)", "Standards"], ...r.missing.map((m) => [m.subject, m.strand, m.band, m.topic, m.statement, m.standards])] },
    { name: "Not linked to MAP", headerStyle: true, freeze: true, report: true, widths: [42, 8, 10], rows: [["Skill", "Grade", "Questions"], ...r.notLinked.map((k) => [k.skill, String(k.grade), String(k.questions)])] },
  ];
}
