/**
 * Curriculum import planner (pure).
 *
 * Input : normalized seed files in data/curriculum (taxonomy.json, grade-N.json)
 * Output: a de-duplicated, validated plan of records with deterministic natural
 *         keys, which prisma/seed/curriculum.ts upserts. Because keys are
 *         deterministic (e.g. lesson "G4-U1-TS1", skill "G4.context-clues"),
 *         re-running the import never creates duplicates and never deletes
 *         existing data.
 *
 * Normalization rules
 *  - A skill exists ONCE per curriculum, keyed by its family code; the same
 *    skill taught in several lessons becomes several LessonSkill links.
 *  - The printed label (e.g. "Plot: Flashback", "Spelling: Long a") becomes a
 *    Subskill of that skill, keyed by a slug of the label.
 *  - Unknown family codes are reported as errors, not silently dropped.
 */

export interface Family {
  code: string;
  name: string;
  domain: string;
  category: string;
  mapGoalArea: string | null;
  ccssStems: string[];
  /** Per-grade codes validated against the official CCSS text (preferred over stems). */
  standardsByGrade?: Record<string, string[]>;
}
export interface Taxonomy {
  families: Family[];
  standards: { code: string; framework: string; grade: number; strand: string; description?: string }[];
  mapGoalAreas: { code: string; name: string; subject: string }[];
  prerequisites: { skill: string; prerequisite: string; weight: number; minimumMastery: number }[];
}
export interface SkillLink {
  label: string;
  role: string;
  familyCode: string;
  week?: number;
  ruleSummary?: string[];
  wordList?: { core: string[]; review: string[]; challenge: string[] };
}
export interface LessonIn {
  number: number;
  code: string;
  title: string;
  genre: string | null;
  weeks?: number[];
  texts?: Record<string, string>;
  skills: SkillLink[];
  vocabularyWords?: string[];
  assessedFocus?: string[];
}
export interface UnitIn {
  number: number;
  title: string;
  lessons: LessonIn[];
  unitSkills?: SkillLink[];
  writing?: { title: string; familyCode: string }[];
  crossCurricular?: string[];
}
export interface GradeFile {
  grade: number;
  book: { code: string; title: string; publisher: string | null; edition: string | null };
  units: UnitIn[];
}

export interface PlannedSkill {
  key: string; // "G4.context-clues"
  familyCode: string;
  name: string;
  domain: string;
  category: string;
  sequence: number;
  standards: string[]; // full CCSS codes
}
export interface PlannedSubskill {
  skillKey: string;
  code: string;
  name: string;
  content: Record<string, unknown> | null;
}
export interface PlannedLessonSkill {
  lessonCode: string;
  skillKey: string;
  subskillCode: string;
  role: string;
  label: string;
}
export interface CurriculumPlan {
  grade: number;
  book: GradeFile["book"];
  units: { number: number; title: string }[];
  lessons: (Omit<LessonIn, "skills"> & { unitNumber: number })[];
  skills: PlannedSkill[];
  subskills: PlannedSubskill[];
  lessonSkills: PlannedLessonSkill[];
  unitSkills: { unitNumber: number; skillKey: string; order: number }[];
  prerequisites: { skillKey: string; prerequisiteKey: string; weight: number; minimumMastery: number }[];
  errors: string[];
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function planCurriculum(tax: Taxonomy, file: GradeFile): CurriculumPlan {
  const families = new Map(tax.families.map((f) => [f.code, f]));
  const g = file.grade;
  const errors: string[] = [];
  const skills = new Map<string, PlannedSkill>();
  const subskills = new Map<string, PlannedSubskill>();
  const lessonSkills = new Map<string, PlannedLessonSkill>();
  const unitSkills = new Map<string, { unitNumber: number; skillKey: string; order: number }>();
  let seq = 0;

  const ensureSkill = (familyCode: string, where: string): string | null => {
    const fam = families.get(familyCode);
    if (!fam) {
      errors.push(`Unknown skill family "${familyCode}" at ${where}`);
      return null;
    }
    const key = `G${g}.${familyCode}`;
    if (!skills.has(key)) {
      skills.set(key, {
        key,
        familyCode,
        name: fam.name,
        domain: fam.domain,
        category: fam.category,
        sequence: seq++,
        standards: fam.standardsByGrade?.[String(g)] ?? fam.ccssStems.map((s) => "CCSS.ELA-LITERACY." + s.replace("{g}", String(g))),
      });
    }
    return key;
  };

  const addSub = (skillKey: string, link: SkillLink): string => {
    const code = slugify(link.label) || "general";
    const id = `${skillKey}#${code}`;
    if (!subskills.has(id)) {
      const content: Record<string, unknown> = {};
      if (link.ruleSummary?.length) content.rules = link.ruleSummary;
      if (link.wordList) content.wordList = link.wordList;
      if (link.week) content.week = link.week;
      subskills.set(id, { skillKey, code, name: link.label, content: Object.keys(content).length ? content : null });
    }
    return code;
  };

  const lessons: CurriculumPlan["lessons"] = [];
  const seenLessonCodes = new Set<string>();
  for (const u of file.units) {
    let order = 0;
    const touchUnit = (key: string) => {
      const id = `${u.number}|${key}`;
      if (!unitSkills.has(id)) unitSkills.set(id, { unitNumber: u.number, skillKey: key, order: order++ });
    };
    for (const l of u.lessons) {
      if (seenLessonCodes.has(l.code)) errors.push(`Duplicate lesson code ${l.code}`);
      seenLessonCodes.add(l.code);
      const { skills: links, ...rest } = l;
      lessons.push({ ...rest, unitNumber: u.number });
      for (const link of links) {
        const key = ensureSkill(link.familyCode, `${l.code} "${link.label}"`);
        if (!key) continue;
        const sub = addSub(key, link);
        lessonSkills.set(`${l.code}|${key}|${link.label}`, { lessonCode: l.code, skillKey: key, subskillCode: sub, role: link.role, label: link.label });
        touchUnit(key);
      }
    }
    for (const link of u.unitSkills ?? []) {
      const key = ensureSkill(link.familyCode, `Unit ${u.number} "${link.label}"`);
      if (!key) continue;
      addSub(key, link);
      touchUnit(key);
    }
    for (const w of u.writing ?? []) {
      const key = ensureSkill(w.familyCode, `Unit ${u.number} writing "${w.title}"`);
      if (key) touchUnit(key);
    }
  }

  const prerequisites = tax.prerequisites
    .map((p) => ({ skillKey: `G${g}.${p.skill}`, prerequisiteKey: `G${g}.${p.prerequisite}`, weight: p.weight, minimumMastery: p.minimumMastery }))
    .filter((p) => skills.has(p.skillKey) && skills.has(p.prerequisiteKey));

  return {
    grade: g,
    book: file.book,
    units: file.units.map((u) => ({ number: u.number, title: u.title })),
    lessons,
    skills: [...skills.values()],
    subskills: [...subskills.values()],
    lessonSkills: [...lessonSkills.values()],
    unitSkills: [...unitSkills.values()],
    prerequisites,
    errors,
  };
}

/** Cross-grade continuum links: G5.theme depends (softly) on G4.theme, etc. */
export function crossGradePrerequisites(plans: CurriculumPlan[]): { skillKey: string; prerequisiteKey: string; weight: number; minimumMastery: number }[] {
  const byGrade = new Map(plans.map((p) => [p.grade, new Set(p.skills.map((s) => s.familyCode))]));
  const out: { skillKey: string; prerequisiteKey: string; weight: number; minimumMastery: number }[] = [];
  for (const p of plans) {
    const lower = byGrade.get(p.grade - 1);
    if (!lower) continue;
    for (const s of p.skills) if (lower.has(s.familyCode)) out.push({ skillKey: s.key, prerequisiteKey: `G${p.grade - 1}.${s.familyCode}`, weight: 0.4, minimumMastery: 60 });
  }
  return out;
}
