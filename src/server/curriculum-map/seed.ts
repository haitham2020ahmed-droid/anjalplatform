/**
 * Curriculum Map: build the expected tree from the source file, back up the curriculum tables,
 * seed (adds missing nodes, updates our own nodes to match the source, never deletes), and verify.
 * Touches only CurriculumMapNode. Grades are never created here (admins create grades); books are
 * linked when they exist (WONDERS-G4, WONDERS-G5, STUDYSYNC-G6).
 */
import { randomUUID } from "node:crypto";
import type { Repo, Row } from "../seeding/repo";
import type { CategoryType, MapGrade, LevelName } from "./source";

export const BOOKS: Record<number, { title: string; code: string }> = {
  4: { title: "Wonders", code: "WONDERS-G4" }, 5: { title: "Wonders", code: "WONDERS-G5" }, 6: { title: "StudySync ELA", code: "STUDYSYNC-G6" },
};
const CAT_CODE: Record<CategoryType, string> = { CONCEPT_VOCABULARY: "CV", ANALYZE_CRAFT_AND_STRUCTURE: "ACS", RESPOND_TO_READING: "RTR" };
const LEVEL: Record<LevelName, "ABOVE" | "ON" | "BELOW"> = { "Above Level": "ABOVE", "On Level": "ON", "Below Level": "BELOW" };

/** The fields the map stores (everything except ids and timestamps). */
export interface ExpectedNode {
  code: string; parentCode: string | null; kind: "BOOK" | "UNIT" | "TEXT_SET" | "SELECTION" | "CATEGORY" | "LEVEL";
  number: number | null; title: string; heading: string | null; sharedRead: string | null; genre: string | null;
  categoryType: CategoryType | null; skills: string | null; level: "ABOVE" | "ON" | "BELOW" | null; acceptsQuestions: boolean; sortOrder: number;
}
export const COMPARED_FIELDS = ["parentCode", "kind", "number", "title", "heading", "sharedRead", "genre", "categoryType", "skills", "level", "acceptsQuestions", "sortOrder"] as const;

/** The full expected tree for one grade, in the exact order of the source. */
export function expectedNodes(g: MapGrade): ExpectedNode[] {
  const out: ExpectedNode[] = [];
  const blank = { number: null, heading: null, sharedRead: null, genre: null, categoryType: null, skills: null, level: null, acceptsQuestions: false };
  const book = `G${g.level}.BOOK`;
  out.push({ ...blank, code: book, parentCode: null, kind: "BOOK", title: BOOKS[g.level]?.title ?? `Grade ${g.level}`, sortOrder: 1 });
  g.units.forEach((u, ui) => {
    const uc = `G${g.level}.U${u.number}`;
    out.push({ ...blank, code: uc, parentCode: book, kind: "UNIT", number: u.number, title: u.title, sortOrder: ui + 1 });
    u.sets.forEach((st, si) => {
      const sc = `${uc}.${st.kind === "TEXT_SET" ? "TS" : "SEL"}${st.number}`;
      out.push({ ...blank, code: sc, parentCode: uc, kind: st.kind, number: st.number, title: st.title, heading: st.heading, sharedRead: st.sharedRead, genre: st.genre || null, sortOrder: si + 1 });
      st.categories.forEach((c, ci) => {
        const cc = `${sc}.${CAT_CODE[c.type]}`;
        // Concept Vocabulary takes questions itself; the other categories only through their levels
        out.push({ ...blank, code: cc, parentCode: sc, kind: "CATEGORY", title: c.label, categoryType: c.type, skills: c.skills, acceptsQuestions: c.type === "CONCEPT_VOCABULARY", sortOrder: ci + 1 });
        c.levels.forEach((l, li) => out.push({ ...blank, code: `${cc}.${LEVEL[l]}`, parentCode: cc, kind: "LEVEL", title: l, level: LEVEL[l], acceptsQuestions: true, sortOrder: li + 1 }));
      });
    });
  });
  return out;
}

/** Tables backed up before the migration (everything curriculum-related). */
export const CURRICULUM_TABLES = ["Grade", "Book", "Curriculum", "Unit", "Lesson", "Skill", "SkillFamily", "UnitSkill", "LessonSkill", "Standard", "SkillStandard", "SkillPrerequisite", "MapGoalArea", "CurriculumMapNode"] as const;

export async function backupCurriculum(repo: Repo, now = new Date()): Promise<{ format: string; createdAt: string; counts: Record<string, number>; tables: Record<string, Row[]> }> {
  const tables: Record<string, Row[]> = {};
  for (const t of CURRICULUM_TABLES) {
    try { tables[t] = await repo.findMany(t, {}); } catch { tables[t] = []; /* table not created yet (before the migration) */ }
  }
  return { format: "alanjal-curriculum-backup", createdAt: now.toISOString(), counts: Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length])), tables };
}

export interface SeedResult { schools: number; grades: { schoolId: string; level: number; created: number; updated: number; skipped?: string }[]; questionsBefore: number; questionsAfter: number }

/** Seeds every school that has Grades 4, 5 or 6 (or one school). Adds missing nodes; never deletes. */
export async function seedCurriculumMap(repo: Repo, map: MapGrade[], opts: { schoolId?: string } = {}, now = new Date()): Promise<SeedResult> {
  const questionsBefore = await repo.count("Question", {});
  const levels = map.map((g) => g.level);
  const grades = await repo.findMany("Grade", { level: { in: levels }, ...(opts.schoolId ? { schoolId: opts.schoolId } : {}) });
  const books = await repo.findMany("Book", { code: { in: Object.values(BOOKS).map((b) => b.code) } });
  const out: SeedResult["grades"] = [];
  for (const grade of grades) {
    const g = map.find((x) => x.level === Number(grade.level))!;
    const want = expectedNodes(g);
    const have = new Map((await repo.findMany("CurriculumMapNode", { gradeId: grade.id })).map((n) => [String(n.code), n]));
    const idOf = new Map<string, string>([...have].map(([code, n]) => [code, String(n.id)]));
    for (const n of want) if (!idOf.has(n.code)) idOf.set(n.code, `cmn${randomUUID().replace(/-/g, "")}`);
    const bookId = books.find((b) => b.code === BOOKS[g.level]?.code)?.id ?? null;
    const row = (n: ExpectedNode) => ({
      gradeId: grade.id, parentId: n.parentCode ? idOf.get(n.parentCode)! : null, kind: n.kind, code: n.code, number: n.number, title: n.title, heading: n.heading,
      sharedRead: n.sharedRead, genre: n.genre, categoryType: n.categoryType, skills: n.skills, level: n.level, acceptsQuestions: n.acceptsQuestions,
      bookId: n.kind === "BOOK" ? bookId : null, sortOrder: n.sortOrder,
    });
    const missing = want.filter((n) => !have.has(n.code));
    // parents before children: the expected list is already in tree order
    for (let i = 0; i < missing.length; i += 100) await repo.createMany("CurriculumMapNode", missing.slice(i, i + 100).map((n) => ({ id: idOf.get(n.code)!, ...row(n), createdAt: now, updatedAt: now })));
    let updated = 0;
    for (const n of want) {
      const cur = have.get(n.code);
      if (!cur) continue;
      const r = row(n);
      const differs = Object.entries(r).some(([k, v]) => (cur[k] ?? null) !== (v ?? null) && !(typeof v === "boolean" && Boolean(cur[k]) === v));
      if (differs) { await repo.updateMany("CurriculumMapNode", { id: cur.id }, { ...r, updatedAt: now }); updated++; }
    }
    out.push({ schoolId: String(grade.schoolId), level: g.level, created: missing.length, updated });
  }
  return { schools: new Set(grades.map((g) => String(g.schoolId))).size, grades: out, questionsBefore, questionsAfter: await repo.count("Question", {}) };
}

export interface GradeCheck {
  schoolId: string; level: number; units: number; sets: number; setWord: "Text Sets" | "Selections";
  conceptVocabulary: number; analyzeLevels: number; respondLevels: number; attachmentNodes: number;
  missing: string[]; extra: string[]; mismatched: string[];
}
export interface VerifyResult { grades: GradeCheck[]; totalAttachment: number; questionsLinked: number; ok: boolean; problems: string[] }

/** Compares the database with the source, node by node and field by field (exact text). */
export async function verifyCurriculumMap(repo: Repo, map: MapGrade[], expected = { 4: { units: 6, sets: 18, nodes: 126 }, 5: { units: 6, sets: 18, nodes: 126 }, 6: { units: 6, sets: 23, nodes: 92 } } as Record<number, { units: number; sets: number; nodes: number }>, opts: { schoolId?: string } = {}): Promise<VerifyResult> {
  const grades = await repo.findMany("Grade", { level: { in: map.map((g) => g.level) }, ...(opts.schoolId ? { schoolId: opts.schoolId } : {}) });
  const checks: GradeCheck[] = [];
  const problems: string[] = [];
  for (const grade of grades) {
    const g = map.find((x) => x.level === Number(grade.level))!;
    const want = expectedNodes(g);
    const rows = await repo.findMany("CurriculumMapNode", { gradeId: grade.id });
    const byCode = new Map(rows.map((r) => [String(r.code), r]));
    const codeOfId = new Map(rows.map((r) => [String(r.id), String(r.code)]));
    const missing = want.filter((n) => !byCode.has(n.code)).map((n) => n.code);
    const extra = rows.filter((r) => !want.some((n) => n.code === r.code)).map((r) => String(r.code));
    const mismatched: string[] = [];
    for (const n of want) {
      const r = byCode.get(n.code); if (!r) continue;
      const actual: Record<string, unknown> = { ...r, parentCode: r.parentId ? codeOfId.get(String(r.parentId)) ?? null : null, acceptsQuestions: Boolean(r.acceptsQuestions), number: r.number === null || r.number === undefined ? null : Number(r.number), sortOrder: Number(r.sortOrder) };
      for (const f of COMPARED_FIELDS) if ((actual[f] ?? null) !== (n[f] ?? null)) mismatched.push(`${n.code}.${f}: expected ${JSON.stringify(n[f])}, found ${JSON.stringify(actual[f])}`);
    }
    const live = rows.filter((r) => want.some((n) => n.code === r.code));
    const cats = live.filter((r) => r.kind === "CATEGORY");
    const levelUnder = (t: string) => live.filter((r) => r.kind === "LEVEL" && Boolean(r.acceptsQuestions) && cats.some((c) => c.id === r.parentId && c.categoryType === t)).length;
    const c: GradeCheck = {
      schoolId: String(grade.schoolId), level: g.level, units: live.filter((r) => r.kind === "UNIT").length,
      sets: live.filter((r) => r.kind === "TEXT_SET" || r.kind === "SELECTION").length, setWord: g.level === 6 ? "Selections" : "Text Sets",
      conceptVocabulary: cats.filter((r) => r.categoryType === "CONCEPT_VOCABULARY" && Boolean(r.acceptsQuestions)).length,
      analyzeLevels: levelUnder("ANALYZE_CRAFT_AND_STRUCTURE"), respondLevels: levelUnder("RESPOND_TO_READING"), attachmentNodes: live.filter((r) => Boolean(r.acceptsQuestions)).length,
      missing, extra, mismatched,
    };
    const e = expected[g.level];
    if (e && (c.units !== e.units || c.sets !== e.sets || c.attachmentNodes !== e.nodes)) problems.push(`Grade ${g.level}: expected ${e.units} units, ${e.sets} ${c.setWord}, ${e.nodes} nodes; found ${c.units}, ${c.sets}, ${c.attachmentNodes}`);
    if (missing.length || extra.length || mismatched.length) problems.push(`Grade ${g.level} (school ${c.schoolId}): ${missing.length} missing, ${extra.length} extra, ${mismatched.length} different`);
    checks.push(c);
  }
  // questions are not linked to the map in this phase (no link table exists yet)
  const questionsLinked = 0;
  const totalAttachment = checks.reduce((n, c) => n + c.attachmentNodes, 0);
  return { grades: checks, totalAttachment, questionsLinked, ok: problems.length === 0, problems };
}

/** The verification summary, in the school's requested format. */
export function printSummary(v: VerifyResult, questionsCreated: number): void {
  const bySchool = new Map<string, VerifyResult["grades"]>();
  for (const g of v.grades) bySchool.set(g.schoolId, [...(bySchool.get(g.schoolId) ?? []), g]);
  for (const [school, gs] of bySchool) {
    if (bySchool.size > 1) console.log(`\nSchool ${school}`);
    for (const g of gs.sort((a, b) => a.level - b.level)) {
      const parts = g.level === 6 ? `${g.conceptVocabulary} Concept Vocabulary + ${g.analyzeLevels} Analyze Craft and Structure levels, no Respond to Reading`
        : `${g.conceptVocabulary} Concept Vocabulary + ${g.analyzeLevels} Analyze Craft and Structure levels + ${g.respondLevels} Respond to Reading levels`;
      console.log(`- Grade ${g.level}: ${g.units} Units, ${g.sets} ${g.setWord} → ${g.attachmentNodes} question attachment nodes\n  (${parts})`);
      for (const m of g.missing) console.log(`    MISSING: ${m}`);
      for (const m of g.extra) console.log(`    EXTRA:   ${m}`);
      for (const m of g.mismatched) console.log(`    DIFFERENT: ${m}`);
    }
    console.log(`- Total question attachment nodes: ${gs.reduce((n, g) => n + g.attachmentNodes, 0)}`);
  }
  console.log(`- Questions created: ${questionsCreated}`);
  console.log(v.ok ? "\nAll numbers match. Every name matches the source exactly." : `\nPROBLEMS:\n${v.problems.map((p) => `  - ${p}`).join("\n")}`);
}
