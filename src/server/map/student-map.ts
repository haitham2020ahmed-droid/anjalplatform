/**
 * MAP for students and simple MAP score imports.
 *   - importMapScores: a simple file (Student Number, Fall RIT, Spring Projection[, Percentile]) → the Fall
 *     Reading RIT and NWEA's projected growth (Spring Projection − Fall RIT) for each student, automatically.
 *   - studentMap: the student's RIT, national comparison, Spring target, and MAP practice by goal area.
 *   - MAP practice is the platform's ADAPTIVE practice on skills linked to MAP goal areas; the first question's
 *     difficulty starts at the student's RIT level (seedAbilityFromRit), then adapts after every answer.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { accessibleClasses } from "../teacher/assign";
import { assertClassAccess } from "../teacher/assignments";
import { createUser } from "../admin/users";
import { bandOf, ensureNationalNorms, nationalNorm, seasonOf } from "./rit";

const s = (v: unknown) => String(v ?? "");
// “Fall Percentile (optional)” → “fallpercentile”: the template's own headers must always be recognised
const norm = (h: string) => h.toLowerCase().replace(/\((optional|اختياري)\)/g, "").replace(/[^a-z]/g, "");
const COLS: Record<string, string[]> = {
  number: ["studentnumber", "studentid", "studentno", "id", "number", "username"],
  rit: ["fallrit", "rit", "fall", "testritscore", "ritscore", "fallritscore"],
  projection: ["springprojection", "projectedrit", "projection", "springprojectedrit", "projectedspringrit", "springprojected"],
  growth: ["projectedgrowth", "growthprojection", "expectedgrowth"],
  percentile: ["percentile", "fallpercentile", "testpercentile", "achievementpercentile"],
  lexile: ["lexile", "falllexile", "lexilescore", "testlexile", "lexilemeasure"],
};
export const MAP_TEMPLATE_HEADERS = ["Student Number", "Student Name", "Fall RIT", "Spring Projection", "Fall Percentile (optional)", "Fall Lexile (optional)"];

export interface MapImportResult { imported: number; skipped: number; errors: { row: number; message: string }[]; term: string; created: { name: string; username: string; password: string }[] }

/**
 * A student in the MAP file who is not on the platform yet: created in this class (teachers: their own class).
 * Username from the student number; a temporary password the student changes at first sign-in.
 */
async function createStudentFromMap(repo: Repo, actor: Actor, classId: string, number: string, name: string): Promise<{ id: string; username: string; password: string }> {
  const klass = await assertClassAccess(repo, actor, classId);
  const grade = Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0);
  const base = number.toLowerCase().replace(/[^a-z0-9._-]+/g, "") || `student${Date.now().toString(36)}`;
  let username = base, k = 1;
  while ((await repo.findMany("User", { username })).length) username = `${base}.${++k}`;
  // the class check above is the teacher's authority here: creation is limited to this school and class
  const asAdmin = { ...actor, role: "SCHOOL_ADMIN" } as Actor;
  const r = await createUser(repo, asAdmin, { role: "STUDENT", username, displayName: name, studentNumber: number, gradeLevel: grade, classId });
  const st = (await repo.findMany("Student", { userId: r.userId }))[0];
  await repo.create("AuditLog", { actorId: actor.userId, action: "student.create.from-map", entityType: "Student", entityId: st ? s(st.id) : null, after: { username, classId, by: actor.role }, createdAt: new Date() });
  return { id: s(st?.id), username, password: r.temporaryPassword };
}

/** Imports Fall RIT + Spring projection. Teachers: their own classes' students only; admins: the whole school. */
export async function importMapScores(repo: Repo, actor: Actor, table: string[][], fallYear: number, now = new Date(), opts: { createInClassId?: string } = {}): Promise<MapImportResult> {
  assertCan(actor, "assignments:create");
  if (!(fallYear >= 2000 && fallYear <= 2100)) throw new ValidationError("Choose the year of the Fall test (e.g. 2026).");
  const at = table.findIndex((r) => r.some((c) => s(c).trim()));
  if (at < 0) throw new ValidationError("The file is empty.");
  const header = table[at].map((h) => norm(s(h)));
  const col = (k: keyof typeof COLS) => header.findIndex((h) => COLS[k].includes(h));
  const nameCol = header.findIndex((h) => ["studentname", "name", "fullname", "student"].includes(h));
  const created: MapImportResult["created"] = [];
  const c = { number: col("number"), rit: col("rit"), projection: col("projection"), growth: col("growth"), percentile: col("percentile"), lexile: col("lexile") };
  if (c.number < 0 || c.rit < 0) throw new ValidationError("The file needs at least the columns “Student Number” and “Fall RIT” (download the template).");
  // students this actor may update
  const classes = await accessibleClasses(repo, actor);
  const members = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((k) => k.id) }, leftAt: null }, { select: ["studentId"] }) : [];
  const allowed = new Set(members.map((m) => s(m.studentId)));
  const students = allowed.size ? await repo.findMany("Student", { id: { in: [...allowed] } }, { select: ["id", "userId", "studentNumber"] }) : [];
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => x.userId) } }, { select: ["id", "username"] }) : [];
  const byKey = new Map<string, string>();
  for (const st of students) {
    if (s(st.studentNumber).trim()) byKey.set(s(st.studentNumber).trim().toLowerCase(), s(st.id));
    const u = users.find((x) => x.id === st.userId); if (u) byKey.set(s(u.username).toLowerCase(), s(st.id));
  }
  const term = `Fall ${fallYear}`;
  const errors: MapImportResult["errors"] = [];
  let imported = 0, skipped = 0;
  for (let i = at + 1; i < table.length; i++) {
    const r = table[i]; const rowNo = i + 1;
    if (!r.some((x) => s(x).trim())) continue;
    const key = s(r[c.number]).trim();
    const ritRaw = s(r[c.rit]).trim();
    if (!key && !ritRaw) continue;
    if (!ritRaw) { skipped++; continue; }                        // a student with no score yet: skipped quietly
    let sid = byKey.get(key.toLowerCase());
    const fullName = nameCol >= 0 ? s(r[nameCol]).replace(/\s+/g, " ").trim() : "";
    if (!sid && opts.createInClassId && key && fullName) {
      // a new student: added to the platform in this class, then their score is saved below
      try {
        if ((await repo.findMany("Student", { schoolId: actor.schoolId, studentNumber: key })).length) throw new ValidationError(`Student number ${key} already belongs to a student of another class.`);
        const n = await createStudentFromMap(repo, actor, opts.createInClassId, key, fullName);
        sid = n.id; byKey.set(key.toLowerCase(), n.id); created.push({ name: fullName, username: n.username, password: n.password });
      } catch (e) { errors.push({ row: rowNo, message: (e as Error).message }); continue; }
    }
    if (!sid) { errors.push({ row: rowNo, message: `Student “${key}” was not found in your classes${opts.createInClassId ? " (write the Student Name to add them)" : " (import from one class to add new students)"}.` }); continue; }
    const rit = Number(ritRaw);
    if (!Number.isInteger(rit) || rit < 100 || rit > 350) { errors.push({ row: rowNo, message: `Fall RIT “${ritRaw}” must be a whole number from 100 to 350.` }); continue; }
    let growth: number | null = null;
    const proj = c.projection >= 0 ? s(r[c.projection]).trim() : "", gr = c.growth >= 0 ? s(r[c.growth]).trim() : "";
    if (proj) { const p = Number(proj); if (!Number.isFinite(p) || p < 100 || p > 350) { errors.push({ row: rowNo, message: `Spring Projection “${proj}” must be a RIT from 100 to 350.` }); continue; } growth = Math.round(p) - rit; }
    else if (gr) { const g = Number(gr); if (!Number.isFinite(g) || g < -50 || g > 100) { errors.push({ row: rowNo, message: `Projected growth “${gr}” is not valid.` }); continue; } growth = Math.round(g); }
    const pctRaw = c.percentile >= 0 ? s(r[c.percentile]).trim() : "";
    const pct = pctRaw ? Number(pctRaw) : null;
    if (pct !== null && (!Number.isInteger(pct) || pct < 1 || pct > 99)) { errors.push({ row: rowNo, message: `Percentile “${pctRaw}” must be from 1 to 99.` }); continue; }
    const lexRaw = c.lexile >= 0 ? s(r[c.lexile]).trim().replace(/l$/i, "") : "";
    const lexile = lexRaw ? Number(lexRaw) : null;
    if (lexile !== null && (!Number.isInteger(lexile) || lexile < 0 || lexile > 2000)) { errors.push({ row: rowNo, message: `Lexile “${lexRaw}” must be a whole number from 0 to 2000.` }); continue; }
    const old = (await repo.findMany("MapResult", { studentId: sid, termName: term })).filter((x) => /read/i.test(s(x.subject)) && !x.goalName);
    if (old.length) await repo.deleteMany("MapResult", { id: { in: old.map((x) => x.id) } });
    await repo.create("MapResult", { studentId: sid, testDate: new Date(Date.UTC(fallYear, 8, 15)), subject: "Reading", goalName: null, rit, achievementPercentile: pct, projectedGrowth: growth, lexile, termName: term, importedAt: now });
    imported++;
  }
  await repo.create("AuditLog", { actorId: actor.userId, action: "map.scores.import", entityType: "MapResult", entityId: null, after: { term, imported, skipped, errors: errors.length }, createdAt: now });
  return { imported, skipped, errors, term, created };
}

/** Template rows: the actor's students (number + name) ready for the scores. */
export async function mapTemplateRows(repo: Repo, actor: Actor, classId?: string): Promise<string[][]> {
  const classes = (await accessibleClasses(repo, actor)).filter((k) => !classId || k.id === classId);
  const members = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((k) => k.id) }, leftAt: null }, { select: ["studentId"] }) : [];
  const students = members.length ? await repo.findMany("Student", { id: { in: [...new Set(members.map((m) => m.studentId))] } }, { select: ["id", "userId", "studentNumber"] }) : [];
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => x.userId) } }, { select: ["id", "username", "displayName"] }) : [];
  const rows = students.map((st) => { const u = users.find((x) => x.id === st.userId); return [s(st.studentNumber) || s(u?.username), s(u?.displayName), "", "", "", ""]; }).sort((a, b) => a[1].localeCompare(b[1]));
  return [MAP_TEMPLATE_HEADERS, ...rows];
}

// ------------------------------------------------------------------ the student's MAP page

async function studentGrade(repo: Repo, studentId: string): Promise<{ grade: number; curriculumId: string | null; schoolId: string } | null> {
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st) return null;
  const g = st.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
  const cur = g ? (await repo.findMany("Curriculum", { gradeId: g.id }))[0] : undefined;
  return g ? { grade: Number(g.level), curriculumId: cur ? s(cur.id) : null, schoolId: s(st.schoolId) } : null;
}

export interface MapArea { code: string; name: string; skills: { id: string; name: string; mastery: number | null; questions: number }[]; mastery: number | null; next: string | null }
export interface StudentMap {
  rit: { value: number; term: string; percentile: number; estimated: boolean; band: string; nationalMean: number; diff: number } | null;
  projection: { spring: number; growth: number; springTerm: string; latestSpring: number | null; met: boolean | null } | null;
  areas: MapArea[];
}

/** Skills of the student's grade that are linked to MAP goal areas and have questions to practise. */
async function practiceAreas(repo: Repo, studentId: string): Promise<MapArea[]> {
  const g = await studentGrade(repo, studentId);
  if (!g?.curriculumId) return [];
  const skills = await repo.findMany("Skill", { curriculumId: g.curriculumId, isActive: true, deletedAt: null }, { select: ["id", "name", "familyId"] });
  if (!skills.length) return [];
  const fams = await repo.findMany("SkillFamily", { id: { in: [...new Set(skills.map((k) => s(k.familyId)))] } }, { select: ["id", "mapGoalAreaId"] });
  const areaIds = [...new Set(fams.map((f) => s(f.mapGoalAreaId)).filter(Boolean))];
  if (!areaIds.length) return [];
  const areas = await repo.findMany("MapGoalArea", { id: { in: areaIds } }, { select: ["id", "code", "name"] });
  const qs = await repo.findMany("Question", { skillId: { in: skills.map((k) => k.id) }, status: "PUBLISHED", deletedAt: null }, { select: ["skillId", "typeId"] });
  const manual = new Set((await repo.findMany("QuestionType", { code: "SHORT_ANSWER" }, { select: ["id"] })).map((t) => s(t.id)));
  const count = new Map<string, number>();
  for (const q of qs) if (!manual.has(s(q.typeId))) count.set(s(q.skillId), (count.get(s(q.skillId)) ?? 0) + 1);
  const mastery = new Map((await repo.findMany("StudentSkillMastery", { studentId }, { select: ["skillId", "score"] })).map((m) => [s(m.skillId), Math.round(Number(m.score))]));
  const areaOf = new Map(fams.map((f) => [s(f.id), s(f.mapGoalAreaId)]));
  return areas.map((a) => {
    const list = skills.filter((k) => areaOf.get(s(k.familyId)) === a.id && (count.get(s(k.id)) ?? 0) > 0)
      .map((k) => ({ id: s(k.id), name: s(k.name), mastery: mastery.get(s(k.id)) ?? null, questions: count.get(s(k.id)) ?? 0 }));
    const seen = list.filter((k) => k.mastery !== null);
    // next: the weakest skill (not started counts as weakest)
    const next = [...list].sort((x, y) => (x.mastery ?? -1) - (y.mastery ?? -1) || x.name.localeCompare(y.name))[0]?.id ?? null;
    return { code: s(a.code), name: s(a.name), skills: list, mastery: seen.length ? Math.round(seen.reduce((t, k) => t + k.mastery!, 0) / seen.length) : null, next };
  }).filter((a) => a.skills.length).sort((x, y) => (x.mastery ?? -1) - (y.mastery ?? -1) || x.name.localeCompare(y.name));
}

export async function studentMap(repo: Repo, actor: Actor): Promise<StudentMap> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students have a MAP page.");
  await ensureNationalNorms(repo);
  const g = await studentGrade(repo, actor.studentId);
  const results = (await repo.findMany("MapResult", { studentId: actor.studentId })).filter((r) => /read/i.test(s(r.subject)) && !r.goalName);
  const time = (r: Row) => new Date(r.testDate instanceof Date ? r.testDate.toISOString() : s(r.testDate)).getTime();
  results.sort((a, b) => time(b) - time(a));
  const latest = results[0];
  let rit: StudentMap["rit"] = null;
  if (latest && g) {
    const season = seasonOf(latest.termName, latest.testDate);
    const n = await nationalNorm(repo, g.grade, season);
    if (n) {
      const imported = latest.achievementPercentile !== null && latest.achievementPercentile !== undefined;
      const z = (Number(latest.rit) - n.mean) / n.sd;
      const pct = imported ? Number(latest.achievementPercentile) : Math.max(1, Math.min(99, Math.round(100 * (0.5 * (1 + Math.tanh(0.7978845608 * (z + 0.044715 * z ** 3)))))));
      rit = { value: Number(latest.rit), term: s(latest.termName) || season, percentile: pct, estimated: !imported, band: bandOf(pct), nationalMean: n.mean, diff: Number(latest.rit) - n.mean };
    }
  }
  // the Spring target from the latest Fall test with a projection
  const fall = results.find((r) => seasonOf(r.termName, r.testDate) === "FALL" && r.projectedGrowth !== null && r.projectedGrowth !== undefined);
  let projection: StudentMap["projection"] = null;
  if (fall) {
    const year = new Date(fall.testDate instanceof Date ? fall.testDate.toISOString() : s(fall.testDate)).getUTCFullYear();
    const springTerm = `Spring ${year + 1}`;
    const spring = results.find((r) => s(r.termName) === springTerm || (seasonOf(r.termName, r.testDate) === "SPRING" && time(r) > time(fall)));
    const target = Number(fall.rit) + Number(fall.projectedGrowth);
    projection = { spring: target, growth: Number(fall.projectedGrowth), springTerm, latestSpring: spring ? Number(spring.rit) : null, met: spring ? Number(spring.rit) >= target : null };
  }
  return { rit, projection, areas: await practiceAreas(repo, actor.studentId) };
}

/** Practice gate for MAP practice: the skill is in the student's own MAP practice list. */
export async function isMapPracticeSkill(repo: Repo, actor: Actor, skillId: string): Promise<boolean> {
  if (actor.role !== "STUDENT" || !actor.studentId) return false;
  return (await practiceAreas(repo, actor.studentId)).some((a) => a.skills.some((k) => k.id === skillId));
}

/**
 * Starts a MAP practice skill at the student's RIT level: when the student has no ability estimate for
 * the skill yet, it is set from how far their RIT is from the national mean (in standard deviations).
 * The adaptive engine then moves it after every answer.
 */
export async function seedAbilityFromRit(repo: Repo, actor: Actor, skillId: string): Promise<number | null> {
  if (!actor.studentId) return null;
  if (await repo.findUnique("StudentAbility", { studentId: actor.studentId, scope: `SKILL:${skillId}` })) return null;
  const m = await studentMap(repo, actor);
  const g = await studentGrade(repo, actor.studentId);
  if (!m.rit || !g) return null;
  const sd = (await nationalNorm(repo, g.grade, seasonOf(m.rit.term)))?.sd ?? 18;
  // distance from the national mean in standard deviations = the engine's ability scale (theta)
  const theta = Math.max(-2.5, Math.min(2.5, Math.round((m.rit.diff / sd) * 100) / 100));
  await repo.create("StudentAbility", { studentId: actor.studentId, scope: `SKILL:${skillId}`, skillId, theta, thetaSE: 1, responses: 0 });
  return theta;
}
