/**
 * Seeds the school's curriculum. Idempotent (upserts on natural keys), never deletes.
 * Shared by prisma/seed/curriculum.ts (MySQL) and the offline SQLite verification.
 */
import { crossGradePrerequisites, planCurriculum, type GradeFile, type Taxonomy } from "../../imports/curriculum/plan";
import type { Repo } from "./repo";

export interface CurriculumInput {
  schoolCode: string;
  schoolName: string;
  taxonomy: Taxonomy;
  grades: GradeFile[];
  officialStandards: Record<string, string>;
  ixlRefs: { grade: number; externalCode: string; externalName: string; familyCode: string | null }[];
}

export interface CurriculumReport {
  units: number;
  lessons: number;
  skills: number;
  subskills: number;
  lessonSkills: number;
  prerequisites: number;
  standards: number;
  ixlRefs: number;
}

export async function seedCurriculum(repo: Repo, input: CurriculumInput): Promise<CurriculumReport> {
  const plans = input.grades.map((g) => planCurriculum(input.taxonomy, g));
  const errors = plans.flatMap((p) => p.errors);
  if (errors.length) throw new Error(`Curriculum validation failed:\n${errors.join("\n")}`);
  const rep: CurriculumReport = { units: 0, lessons: 0, skills: 0, subskills: 0, lessonSkills: 0, prerequisites: 0, standards: 0, ixlRefs: 0 };

  const tx = repo;
    const school = await tx.upsert("School", { code: input.schoolCode }, { name: input.schoolName });

    const goalAreaId = new Map<string, string>();
    for (const a of input.taxonomy.mapGoalAreas) {
      const row = await tx.upsert("MapGoalArea", { code: a.code }, { name: a.name, subject: a.subject }, { name: a.name, subject: a.subject });
      goalAreaId.set(a.code, row.id!);
    }
    const familyId = new Map<string, string>();
    for (const f of input.taxonomy.families) {
      const data = { name: f.name, domain: f.domain, category: f.category, mapGoalAreaId: f.mapGoalArea ? goalAreaId.get(f.mapGoalArea) ?? null : null };
      const row = await tx.upsert("SkillFamily", { code: f.code }, data, data);
      familyId.set(f.code, row.id!);
    }
    // The complete official list (every Grade 4–6 standard and sub-standard), so questions can
    // cite precise sub-standards such as L.4.1.f even when the skill links to the parent L.4.1.
    const standardId = new Map<string, string>();
    const allStandards = new Map<string, string | null>(Object.entries(input.officialStandards));
    for (const s of input.taxonomy.standards) if (!allStandards.has(s.code)) allStandards.set(s.code, s.description ?? null);
    for (const [code, description] of allStandards) {
      const [, , strand, grade] = code.split(".");
      const row = await tx.upsert(
        "Standard",
        { framework: "CCSS_ELA", code },
        { gradeLevel: Number(grade), strand, description },
        { description },
      );
      standardId.set(code, row.id!);
    }
    rep.standards = standardId.size;

    const skillId = new Map<string, string>();
    for (const plan of plans) {
      const grade = await tx.upsert("Grade", { schoolId: school.id, level: plan.grade }, { name: `Grade ${plan.grade}` });
      const book = await tx.upsert("Book", { code: plan.book.code }, { title: plan.book.title, publisher: plan.book.publisher, edition: plan.book.edition }, { edition: plan.book.edition });
      const curriculum = await tx.upsert("Curriculum", { gradeId: grade.id, bookId: book.id }, { name: `Grade ${plan.grade} · ${plan.book.title}` });

      for (const s of plan.skills) {
        const row = await tx.upsert(
          "Skill",
          { curriculumId: curriculum.id, code: s.key },
          { familyId: familyId.get(s.familyCode)!, name: s.name, domain: s.domain, category: s.category, sequence: s.sequence },
          { sequence: s.sequence },
        );
        skillId.set(s.key, row.id!);
        for (const [i, code] of s.standards.entries()) {
          const std = standardId.get(code);
          if (std) await tx.upsert("SkillStandard", { skillId: row.id, standardId: std }, { isPrimary: i === 0 });
        }
      }
      const subskillId = new Map<string, string>();
      for (const ss of plan.subskills) {
        const sid = skillId.get(ss.skillKey)!;
        const row = await tx.upsert("Subskill", { skillId: sid, code: ss.code }, { name: ss.name, content: ss.content }, { content: ss.content });
        subskillId.set(`${ss.skillKey}#${ss.code}`, row.id!);
      }
      const unitId = new Map<number, string>();
      for (const u of plan.units) {
        const row = await tx.upsert("Unit", { curriculumId: curriculum.id, number: u.number }, { title: u.title }, { title: u.title });
        unitId.set(u.number, row.id!);
      }
      const lessonId = new Map<string, string>();
      for (const l of plan.lessons) {
        const data = {
          title: l.title, genre: l.genre ?? null, weeks: l.weeks ?? null, texts: l.texts ?? null,
          metadata: { vocabularyWords: l.vocabularyWords ?? [], assessedFocus: l.assessedFocus ?? [] },
        };
        const row = await tx.upsert("Lesson", { unitId: unitId.get(l.unitNumber)!, code: l.code }, { number: l.number, ...data }, data);
        lessonId.set(l.code, row.id!);
      }
      for (const ls of plan.lessonSkills) {
        await tx.upsert(
          "LessonSkill",
          { lessonId: lessonId.get(ls.lessonCode)!, skillId: skillId.get(ls.skillKey)!, label: ls.label },
          { role: ls.role, subskillId: subskillId.get(`${ls.skillKey}#${ls.subskillCode}`) ?? null },
          { role: ls.role },
        );
      }
      for (const us of plan.unitSkills) {
        await tx.upsert("UnitSkill", { unitId: unitId.get(us.unitNumber)!, skillId: skillId.get(us.skillKey)! }, { order: us.order }, { order: us.order });
      }
      rep.units += plan.units.length;
      rep.lessons += plan.lessons.length;
      rep.skills += plan.skills.length;
      rep.subskills += plan.subskills.length;
      rep.lessonSkills += plan.lessonSkills.length;
    }

    for (const p of [...plans.flatMap((x) => x.prerequisites), ...crossGradePrerequisites(plans)]) {
      const a = skillId.get(p.skillKey);
      const b = skillId.get(p.prerequisiteKey);
      if (!a || !b) continue;
      await tx.upsert("SkillPrerequisite", { skillId: a, prerequisiteSkillId: b }, { weight: p.weight, minimumMastery: p.minimumMastery }, { weight: p.weight, minimumMastery: p.minimumMastery });
      rep.prerequisites++;
    }

    const ixl = await tx.upsert("ExternalAssessmentSource", { code: "IXL" }, { name: "IXL (imported reports only)" });
    await tx.upsert("ExternalAssessmentSource", { code: "NWEA_MAP" }, { name: "NWEA MAP Growth (imported reports only)" });
    for (const r of input.ixlRefs) {
      const sk = r.familyCode ? skillId.get(`G${r.grade}.${r.familyCode}`) ?? null : null;
      await tx.upsert(
        "ExternalSkillRef",
        { sourceId: ixl.id, externalCode: r.externalCode, gradeLevel: r.grade },
        { externalName: r.externalName, skillId: sk },
        { skillId: sk },
      );
      rep.ixlRefs++;
    }
  return rep;
}
