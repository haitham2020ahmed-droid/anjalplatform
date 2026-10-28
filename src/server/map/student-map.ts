/**
 * MAP for students and simple MAP score imports.
 *   - importMapScores: a simple file (Student Number, Fall RIT, Spring Projection[, Percentile]) → the Fall
 *     Reading RIT and NWEA's projected growth (Spring Projection − Fall RIT) for each student, automatically.
 *   - studentMap: the student's RIT, national comparison, Spring target, and MAP practice by goal area.
 *   - MAP practice is the platform's ADAPTIVE practice on skills linked to MAP goal areas; the first question's
 *     difficulty starts at the student's RIT level (seedAbilityFromRit), then adapts after every answer.
 */
import { countGroups } from "../db/group-count";
import { BANK_MODELS, keptWhileUnchanged } from "../cache/kept";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { accessibleClasses } from "../teacher/assign";
import { assertClassAccess } from "../teacher/assignments";
import { createUser } from "../admin/users";
import { draftPlansFor, type AutoPlans } from "./map-auto";
import { bandOf, ensureNationalNorms, nationalNorm, percentileFromNorm, seasonOf } from "./rit";

const s = (v: unknown) => String(v ?? "");
// “Fall Percentile (optional)” → “fallpercentile”: the template's own headers must always be recognised
const norm = (h: string) => h.toLowerCase().replace(/\((optional|اختياري)\)/g, "").replace(/[^a-z]/g, "");
/** Overall columns (Reading and Language Usage). Old one-subject templates still work: “Fall RIT” = Reading. */
const COLS: Record<string, string[]> = {
  number: ["studentnumber", "studentid", "studentno", "id", "number", "username"],
  rit: ["readingfallrit", "readingrit", "fallrit", "rit", "fall", "testritscore", "ritscore", "fallritscore"],
  projection: ["readingspringprojection", "readingprojection", "springprojection", "projectedrit", "projection", "springprojectedrit", "projectedspringrit", "springprojected"],
  growth: ["readingprojectedgrowth", "projectedgrowth", "growthprojection", "expectedgrowth"],
  percentile: ["readingfallpercentile", "readingpercentile", "percentile", "fallpercentile", "testpercentile", "achievementpercentile"],
  lexile: ["falllexile", "readingfalllexile", "lexile", "lexilescore", "testlexile", "lexilemeasure"],
  langRit: ["languagefallrit", "languageusagefallrit", "languagerit", "languageusagerit", "lufallrit"],
  langProjection: ["languagespringprojection", "languageusagespringprojection", "languageprojection", "luspringprojection"],
  langPercentile: ["languagefallpercentile", "languageusagefallpercentile", "languagepercentile", "lufallpercentile"],
  rapid: ["readingrapidguessing", "readingrapidguessingpercent", "readingrapidguess"],
  langRapid: ["languagerapidguessing", "languagerapidguessingpercent", "languagerapidguess"],
};
/** Goal-area columns (Fall RIT per MAP goal area): they make the skill recommendations precise. */
export const GOAL_COLUMNS: { header: string; code: string; subject: "READING" | "LANGUAGE_USAGE" }[] = [
  { header: "R: Literary Structure", code: "LIT_STRUCTURE", subject: "READING" },
  { header: "R: Literary Theme", code: "LIT_THEME", subject: "READING" },
  { header: "R: Info Structure", code: "INFO_STRUCTURE", subject: "READING" },
  { header: "R: Info Central Idea", code: "INFO_CENTRAL_IDEA", subject: "READING" },
  { header: "R: Vocabulary", code: "VOCAB", subject: "READING" },
  { header: "L: Writing Style", code: "WRITING_STYLE", subject: "LANGUAGE_USAGE" },
  { header: "L: Writing Organization", code: "WRITING_ORG", subject: "LANGUAGE_USAGE" },
  { header: "L: Writing Support", code: "WRITING_SUPPORT", subject: "LANGUAGE_USAGE" },
  { header: "L: Grammar & Usage", code: "LANG_GRAMMAR", subject: "LANGUAGE_USAGE" },
  { header: "L: Mechanics", code: "LANG_MECHANICS", subject: "LANGUAGE_USAGE" },
];
/**
 * The 3 + 3 instructional areas of NWEA's reports (Reading: Informational Text, Literary Text, Vocabulary ·
 * Language Usage: Grammar & Usage, Mechanics, Writing). One column each in the template and the manual table;
 * an area's RIT is saved to every platform goal of that area (Literary Text → Literary Structure and Theme …).
 * The older 10-column template still imports.
 */
export const AREA_COLUMNS: { header: string; key: "lit" | "info" | "vocab" | "grammar" | "mech" | "writing"; codes: string[]; subject: "READING" | "LANGUAGE_USAGE"; aliases: string[] }[] = [
  { header: "R: Informational Text", key: "info", codes: ["INFO_STRUCTURE", "INFO_CENTRAL_IDEA"], subject: "READING", aliases: ["informationaltext", "readinginformationaltext"] },
  { header: "R: Literary Text", key: "lit", codes: ["LIT_STRUCTURE", "LIT_THEME"], subject: "READING", aliases: ["literarytext", "readingliterarytext"] },
  { header: "R: Vocabulary", key: "vocab", codes: ["VOCAB"], subject: "READING", aliases: ["vocabulary", "readingvocabulary"] },
  { header: "L: Grammar & Usage", key: "grammar", codes: ["LANG_GRAMMAR"], subject: "LANGUAGE_USAGE", aliases: ["grammarusage", "languageunderstandeditforgrammarusage", "grammarandusage"] },
  { header: "L: Mechanics", key: "mech", codes: ["LANG_MECHANICS"], subject: "LANGUAGE_USAGE", aliases: ["mechanics", "languageunderstandeditformechanics"] },
  { header: "L: Writing", key: "writing", codes: ["WRITING_STYLE", "WRITING_ORG", "WRITING_SUPPORT"], subject: "LANGUAGE_USAGE", aliases: ["writing", "writingwriterevisetextsforpurposeandaudience"] },
];
export const MAP_TEMPLATE_HEADERS = [
  "Student Number", "Student Name", "Grade",
  "Reading Fall RIT", "Reading Fall Percentile", "Reading Spring Projection", "Fall Lexile",
  ...AREA_COLUMNS.filter((g) => g.subject === "READING").map((g) => g.header),
  "Language Fall RIT", "Language Fall Percentile", "Language Spring Projection",
  ...AREA_COLUMNS.filter((g) => g.subject === "LANGUAGE_USAGE").map((g) => g.header),
  "Reading Rapid-Guessing %", "Language Rapid-Guessing %",
];

/**
 * NWEA's own export (one row per student and course: Student ID, names, Grade, Course, RIT Score,
 * Rapid-Guessing %, LexileScore, goal-area RIT ranges) → one template row per student. Goal ranges use their
 * middle (151-160 → 156). The 2–5 / 6+ goal areas are spread over the platform's areas (Literary Text → both
 * Literary areas, Informational Text → both Informational, Writing → the three Writing areas).
 * Returns null when the table is not an NWEA export.
 */
export function fromNweaExport(table: string[][]): { table: string[][]; term: string; season: "FALL" | "WINTER" | "SPRING"; year: number } | null {
  const at = table.findIndex((r) => r.some((c) => s(c).trim()));
  const head = (table[at] ?? []).map((h) => norm(s(h)));
  const ix = (n: string) => head.indexOf(n);
  if (ix("course") < 0 || ix("ritscore") < 0 || ix("studentid") < 0) return null;
  const goalIx = (needle: string) => head.findIndex((h) => h.includes(needle));
  const G = { lit: goalIx("literarytext"), info: goalIx("informationaltext"), vocab: goalIx("vocabulary"), grammar: goalIx("grammarusage"), mech: goalIx("mechanics"), writing: goalIx("writingwrite") };
  const mid = (v: string) => { const m = s(v).match(/(\d{3})\s*-\s*(\d{3})/); return m ? String(Math.round((Number(m[1]) + Number(m[2])) / 2)) : ""; };
  const lex = (v: string) => { const t = s(v).trim().toUpperCase(); if (!t) return ""; if (t.startsWith("BR")) return "0"; return t.replace(/L$/, ""); };
  const H = [...MAP_TEMPLATE_HEADERS], col = (h: string) => H.indexOf(h);
  const byStudent = new Map<string, string[]>();
  let termText = "";
  for (const r of table.slice(at + 1)) {
    const id = s(r[ix("studentid")]).trim(); if (!id) continue;
    termText = termText || s(r[ix("termtested")]);
    const row = byStudent.get(id) ?? H.map(() => "");
    row[0] = id; row[1] = `${s(r[ix("studentfirstname")])} ${s(r[ix("studentlastname")])}`.replace(/\s+/g, " ").trim(); row[2] = s(r[ix("grade")]).trim();
    const course = s(r[ix("course")]).toLowerCase(), rit = s(r[ix("ritscore")]).trim(), rapid = ix("rapidguessing") >= 0 ? s(r[ix("rapidguessing")]).trim() : "";
    if (/read/.test(course)) {
      row[col("Reading Fall RIT")] = rit; row[col("Reading Rapid-Guessing %")] = rapid;
      if (ix("lexilescore") >= 0) row[col("Fall Lexile")] = lex(r[ix("lexilescore")]);
      if (G.lit >= 0) row[col("R: Literary Text")] = mid(r[G.lit]);
      if (G.info >= 0) row[col("R: Informational Text")] = mid(r[G.info]);
      if (G.vocab >= 0) row[col("R: Vocabulary")] = mid(r[G.vocab]);
    } else if (/language/.test(course)) {
      row[col("Language Fall RIT")] = rit; row[col("Language Rapid-Guessing %")] = rapid;
      if (G.grammar >= 0) row[col("L: Grammar & Usage")] = mid(r[G.grammar]);
      if (G.mech >= 0) row[col("L: Mechanics")] = mid(r[G.mech]);
      if (G.writing >= 0) row[col("L: Writing")] = mid(r[G.writing]);
    }
    byStudent.set(id, row);
  }
  const m = termText.match(/(Fall|Winter|Spring)\s+(\d{4})-(\d{4})/i);
  const season = (m ? m[1].toUpperCase() : "FALL") as "FALL" | "WINTER" | "SPRING";
  const year = m ? (season === "FALL" ? Number(m[2]) : Number(m[3])) : new Date().getFullYear();
  return { table: [H, ...byStudent.values()], term: `${season[0]}${season.slice(1).toLowerCase()} ${year}`, season, year };
}

/** What the comprehensive data file adds to one student's subject (and to each goal area). */
export interface CdfExtra {
  ritSE: number | null; percentile: number | null; growthPercentile: number | null; observedGrowth: number | null; conditionalGrowthIndex: number | null;
  metProjectedGrowth: string | null; testMinutes: number | null; lexileLow: number | null; lexileHigh: number | null; typicalGrowth: number | null; proficiency: string | null;
  goals: Record<string, { descriptor: string | null; se: number | null }>;
}
const GOAL_GROUP: Record<string, string> = { LIT_STRUCTURE: "lit", LIT_THEME: "lit", INFO_STRUCTURE: "info", INFO_CENTRAL_IDEA: "info", VOCAB: "vocab", WRITING_STYLE: "writing", WRITING_ORG: "writing", WRITING_SUPPORT: "writing", LANG_GRAMMAR: "grammar", LANG_MECHANICS: "mech" };
const groupOfGoalName = (n: string) => { const g = n.toLowerCase(); return /literary/.test(g) ? "lit" : /informational/.test(g) ? "info" : /vocab/.test(g) ? "vocab" : /mechanic/.test(g) ? "mech" : /grammar|usage/.test(g) ? "grammar" : /writ/.test(g) ? "writing" : null; };

/**
 * NWEA's Comprehensive Data File (one row per student and course, ~150 columns: TestRITScore, TestStandardError,
 * TestPercentile, growth by period, Goal1Name…Goal8RitScore with their descriptors, Lexile range, projected
 * proficiency …) → the template rows, plus the extras kept with each result. Only Reading and Language Usage are
 * read; the file's personal columns (date of birth, ethnicity, gender) are never read.
 */
export function fromNweaCdf(table: string[][]): { table: string[][]; term: string; season: "FALL" | "WINTER" | "SPRING"; year: number; extras: Map<string, CdfExtra> } | null {
  const at = table.findIndex((r) => r.some((c) => s(c).trim()));
  // digits kept (Goal1Name … Goal8Name)
  const head = (table[at] ?? []).map((h) => s(h).toLowerCase().replace(/[^a-z0-9]/g, ""));
  const ix = (n: string) => head.indexOf(n);
  if (ix("testritscore") < 0 || ix("course") < 0 || ix("studentid") < 0 || ix("termname") < 0) return null;
  const H = [...MAP_TEMPLATE_HEADERS], col = (h: string) => H.indexOf(h);
  const num = (v: unknown) => { const t = s(v).trim().replace(/%$/, ""); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
  const lex = (v: unknown) => { const t = s(v).trim().toUpperCase(); if (!t) return null; if (t.startsWith("BR")) return 0; const n = Number(t.replace(/L$/, "")); return Number.isFinite(n) ? n : null; };
  const termText = s(table[at + 1]?.[ix("termname")]);
  const m = termText.match(/(Fall|Winter|Spring)\s+(\d{4})-(\d{4})/i);
  const season = (m ? m[1].toUpperCase() : "FALL") as "FALL" | "WINTER" | "SPRING";
  const year = m ? (season === "FALL" ? Number(m[2]) : Number(m[3])) : new Date().getFullYear();
  // growth that ends at this term, and the projection to the end of the year
  const period = season === "WINTER" ? "falltowinter" : season === "SPRING" ? "falltospring" : "falltofall";
  const byStudent = new Map<string, string[]>();
  const extras = new Map<string, CdfExtra>();
  for (const r of table.slice(at + 1)) {
    const id = s(r[ix("studentid")]).trim(); if (!id) continue;
    const course = s(r[ix("course")]).toLowerCase();
    const subject = /read/.test(course) ? "READING" : /language/.test(course) ? "LANGUAGE_USAGE" : null;
    if (!subject) continue;   // Mathematics, Science … are not this platform's
    const rit = s(r[ix("testritscore")]).trim(); if (!rit) continue;
    const row = byStudent.get(id) ?? H.map(() => "");
    row[0] = id; row[1] = `${s(r[ix("studentfirstname")])} ${s(r[ix("studentlastname")])}`.replace(/\s+/g, " ").trim(); row[2] = s(r[ix("grade")]).trim();
    const pct = num(r[ix("testpercentile")]);
    const springGrowth = num(r[ix("falltospringprojectedgrowth")]) ?? (season === "WINTER" ? num(r[ix("wintertospringprojectedgrowth")]) : null);
    const rapid = num(r[ix("rapidguessingpercentage")]);
    // the goal areas: Goal1Name … Goal8Name with their RIT, descriptor and error
    const goals: Record<string, { descriptor: string | null; se: number | null }> = {};
    const goalRit: Record<string, number> = {};
    for (let g = 1; g <= 8; g++) {
      const name = s(r[ix(`goal${g}name`)]).trim(); if (!name) continue;
      const grp = groupOfGoalName(name); const gr = num(r[ix(`goal${g}ritscore`)]);
      if (!grp || gr === null) continue;
      goalRit[grp] = gr; goals[grp] = { descriptor: s(r[ix(`goal${g}adjective`)]).trim() || null, se: num(r[ix(`goal${g}stderr`)]) };
    }
    const put = (h: string, v: unknown) => { const k = col(h); if (k >= 0 && v !== null && v !== undefined && s(v) !== "") row[k] = s(v); };
    if (subject === "READING") {
      put("Reading Fall RIT", rit); put("Reading Fall Percentile", pct && pct >= 1 && pct <= 99 ? pct : null); put("Reading Spring Projection", springGrowth !== null ? Number(rit) + springGrowth : null);
      put("Fall Lexile", lex(r[ix("lexilescore")])); put("Reading Rapid-Guessing %", rapid !== null ? Math.round(rapid) : null);
    } else {
      put("Language Fall RIT", rit); put("Language Fall Percentile", pct && pct >= 1 && pct <= 99 ? pct : null); put("Language Spring Projection", springGrowth !== null ? Number(rit) + springGrowth : null);
      put("Language Rapid-Guessing %", rapid !== null ? Math.round(rapid) : null);
    }
    for (const a of AREA_COLUMNS.filter((g) => g.subject === subject)) { const v = goalRit[a.key]; if (v !== undefined) put(a.header, v); }
    byStudent.set(id, row);
    const met = s(r[ix(`${period}metprojectedgrowth`)]).trim();
    extras.set(`${id.toLowerCase()}|${subject}`, {
      ritSE: num(r[ix("teststandarderror")]), percentile: pct, growthPercentile: num(r[ix(`${period}conditionalgrowthpercentile`)]), observedGrowth: num(r[ix(`${period}observedgrowth`)]),
      conditionalGrowthIndex: num(r[ix(`${period}conditionalgrowthindex`)]), metProjectedGrowth: met || null, testMinutes: num(r[ix("testdurationminutes")]),
      lexileLow: lex(r[ix("lexilemin")]), lexileHigh: lex(r[ix("lexilemax")]), typicalGrowth: num(r[ix("typicalfalltospringgrowth")]),
      proficiency: (() => { for (let p = 1; p <= 10; p++) { const study = s(r[ix(`projectedproficiencystudy${p}`)]); if (/map growth/i.test(study)) return s(r[ix(`projectedproficiencylevel${p}`)]).trim() || null; } return null; })(),
      goals,
    });
  }
  return { table: [H, ...byStudent.values()], term: `${season[0]}${season.slice(1).toLowerCase()} ${year}`, season, year, extras };
}
const SUBJECT_NAME = { READING: "Reading", LANGUAGE_USAGE: "Language Usage" } as const;

export interface MapImportResult { imported: number; skipped: number; errors: { row: number; message: string }[]; term: string; created: { name: string; username: string; password: string }[]; /** students of the file not found on the platform (check their Student ID) */ unmatched?: { number: string; name: string }[]; /** individual plan drafts made from these scores */ plans?: AutoPlans }

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
export async function importMapScores(repo: Repo, actor: Actor, table: string[][], fallYear: number, now = new Date(), opts: { createInClassId?: string; term?: { name: string; date: Date }; wholeFile?: boolean } = {}): Promise<MapImportResult> {
  assertCan(actor, "assignments:create");
  if (!(fallYear >= 2000 && fallYear <= 2100)) throw new ValidationError("Choose the year of the Fall test (e.g. 2026).");
  // NWEA's own export: converted, its term taken from the file; it covers whole grades without classes,
  // so it only updates students who are already on the platform (no student is created from it)
  const cdf = fromNweaCdf(table);
  const nwea = cdf ?? fromNweaExport(table);
  let termName = `Fall ${fallYear}`, testDate = new Date(Date.UTC(fallYear, 8, 15));
  if (nwea) {
    table = nwea.table; termName = nwea.term;
    testDate = new Date(Date.UTC(nwea.year, nwea.season === "FALL" ? 8 : nwea.season === "WINTER" ? 0 : 3, 15));
    opts = { ...opts, createInClassId: undefined };
  } else if (opts.term) { termName = opts.term.name; testDate = opts.term.date; }   // manual entry: Fall, Winter or Spring
  const at = table.findIndex((r) => r.some((c) => s(c).trim()));
  if (at < 0) throw new ValidationError("The file is empty.");
  const header = table[at].map((h) => norm(s(h)));
  const col = (k: keyof typeof COLS) => header.findIndex((h) => COLS[k].includes(h));
  const c = { number: col("number"), rit: col("rit"), projection: col("projection"), growth: col("growth"), percentile: col("percentile"), lexile: col("lexile"), langRit: col("langRit"), langProjection: col("langProjection"), langPercentile: col("langPercentile"), rapid: col("rapid"), langRapid: col("langRapid") };
  if (c.number < 0 || (c.rit < 0 && c.langRit < 0)) throw new ValidationError("The file needs “Student Number” and at least “Reading Fall RIT” or “Language Fall RIT” (download the template).");
  const nameCol = header.findIndex((h) => ["studentname", "name", "fullname", "student"].includes(h));
  // goal-area columns, matched by the template header, the area's full name or its code
  const areas = await repo.findMany("MapGoalArea", {}, { select: ["id", "code", "name", "subject"] });
  const goalCols = GOAL_COLUMNS.map((g) => {
    const area = areas.find((a) => s(a.code) === g.code);
    const ix = header.findIndex((h) => h === norm(g.header) || (area && (h === norm(s(area.name)) || h === norm(s(area.code)))));
    return { ...g, ix, area };
  }).filter((g) => g.ix >= 0 && g.area);
  // the 3 + 3 instructional-area columns (template, manual table or NWEA's names): one column → every goal of the area
  for (const a of AREA_COLUMNS) {
    const ix = header.findIndex((h) => h === norm(a.header) || a.aliases.includes(h));
    if (ix < 0) continue;
    for (const code of a.codes) {
      if (goalCols.some((g) => g.code === code)) continue;   // the older per-goal column wins
      const area = areas.find((x) => s(x.code) === code);
      const g = GOAL_COLUMNS.find((x) => x.code === code)!;
      if (area) goalCols.push({ ...g, header: a.header, ix, area });
    }
  }
  const created: MapImportResult["created"] = [];
  // students this actor may update
  const classes = await accessibleClasses(repo, actor);
  const members = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((k) => k.id) }, leftAt: null }, { select: ["studentId"] }) : [];
  const allowed = new Set(members.map((m) => s(m.studentId)));
  const students = allowed.size ? await repo.findMany("Student", { id: { in: [...allowed] } }, { select: ["id", "userId", "studentNumber", "gradeId"] }) : [];
  const users = students.length ? await repo.findMany("User", { id: { in: students.map((x) => x.userId) } }, { select: ["id", "username", "displayName"] }) : [];
  // 🐛 r91 fix ("درجات قديمة بتتحسب بصف الطالب الحالي"): each student's CURRENT grade, stamped onto the rows this
  // import creates (their grade at test time, best available) — a file's own "Grade" column wins when given (rowGrade below).
  const gradeRows = students.length ? await repo.findMany("Grade", { id: { in: [...new Set(students.map((x) => s(x.gradeId)))] } }, { select: ["id", "level"] }) : [];
  const currentGradeOf = new Map(students.map((st) => [s(st.id), Number(gradeRows.find((g) => g.id === st.gradeId)?.level ?? 0) || null]));
  const byKey = new Map<string, string>();
  // names, as a fallback when the file's number is not the platform's (e.g. NWEA IDs): “AALBAQSHI, AHMED” = “Ahmed Aalbaqshi”
  const nameKey = (n: string) => n.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff ]+/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
  const byName = new Map<string, string | null>();
  for (const st of students) { const u = users.find((x) => x.id === st.userId); if (!u) continue; const k = nameKey(s(u.displayName)); byName.set(k, byName.has(k) ? null : s(st.id)); }
  const gradeCol = header.findIndex((h) => h === "grade" || h === "grd");
  const classGrade = opts.createInClassId ? Number((await repo.findUnique("Grade", { id: (await repo.findUnique("Class", { id: opts.createInClassId }))?.gradeId }))?.level ?? 0) : 0;
  for (const st of students) {
    if (s(st.studentNumber).trim()) byKey.set(s(st.studentNumber).trim().toLowerCase(), s(st.id));
    const u = users.find((x) => x.id === st.userId); if (u) byKey.set(s(u.username).toLowerCase(), s(st.id));
  }
  const term = termName;
  const errors: MapImportResult["errors"] = [];
  let notInClasses = 0;
  const unmatched: { number: string; name: string }[] = [];
  let imported = 0, skipped = 0;
  const touched = new Set<string>();
  // readiness S-12: the same student twice in one file (same term and subject) is a problem row, not “last one wins”
  const inFile = new Map<string, number>();
  const cell = (r: string[], ix: number) => (ix >= 0 ? s(r[ix]).trim() : "");
  // Some reports (NWEA's Class Profile) have no Student ID column at all, so every row's number is blank — that's
  // expected there, and a name-only match is the best we can do. In a file that DOES carry real numbers (the
  // platform's own template, a CSV), a single blank number is more likely a data-entry slip, so that one row still
  // requires a number before it's allowed to mint a new account — only a file with no numbers anywhere skips that.
  const anyNumberInFile = table.slice(at + 1).some((r) => !!cell(r, c.number).trim());
  const ritOf = (raw: string, what: string): number | null => { if (!raw) return null; const n = Number(raw); if (!Number.isInteger(n) || n < 100 || n > 350) throw new ValidationError(`${what} “${raw}” must be a whole number from 100 to 350.`); return n; };
  for (let i = at + 1; i < table.length; i++) {
    const r = table[i]; const rowNo = i + 1;
    if (!r.some((x) => s(x).trim())) continue;
    const key = cell(r, c.number);
    const readRaw = cell(r, c.rit), langRaw = cell(r, c.langRit);
    if (!key && !readRaw && !langRaw) continue;
    if (!readRaw && !langRaw) { skipped++; continue; }                      // no score yet: skipped quietly
    try {
      // every value is checked before anything is saved for this row
      const readRit = ritOf(readRaw, "Reading Fall RIT"), langRit = ritOf(langRaw, "Language Fall RIT");
      const proj = (raw: string, base: number | null, what: string) => { if (!raw || base === null) return null; const p = Number(raw); if (!Number.isFinite(p) || p < 100 || p > 350) throw new ValidationError(`${what} “${raw}” must be a RIT from 100 to 350.`); return Math.round(p) - base; };
      let readGrowth = proj(cell(r, c.projection), readRit, "Reading Spring Projection");
      if (readGrowth === null && cell(r, c.growth) && readRit !== null) { const g = Number(cell(r, c.growth)); if (!Number.isFinite(g) || g < -50 || g > 100) throw new ValidationError(`Projected growth “${cell(r, c.growth)}” is not valid.`); readGrowth = Math.round(g); }
      const langGrowth = proj(cell(r, c.langProjection), langRit, "Language Spring Projection");
      const pctOf = (raw: string, what: string) => { if (!raw) return null; const n = Number(raw); if (!Number.isInteger(n) || n < 1 || n > 99) throw new ValidationError(`${what} “${raw}” must be from 1 to 99.`); return n; };
      const readPct = pctOf(cell(r, c.percentile), "Reading Fall Percentile"), langPct = pctOf(cell(r, c.langPercentile), "Language Fall Percentile");
      const lexRaw = /^br/i.test(cell(r, c.lexile)) ? "0" : cell(r, c.lexile).replace(/l$/i, "");   // BR (Beginning Reader) = below 0L
      const lexile = lexRaw ? Number(lexRaw) : null;
      if (lexile !== null && (!Number.isInteger(lexile) || lexile < 0 || lexile > 2000)) throw new ValidationError(`Lexile “${lexRaw}” must be a whole number from 0 to 2000.`);
      const goals = goalCols.map((g) => ({ g, rit: ritOf(cell(r, g.ix), g.header) })).filter((x) => x.rit !== null);
      const rapidOf = (raw: string) => { if (!raw) return null; const n = Number(raw); if (!Number.isFinite(n) || n < 0 || n > 100) throw new ValidationError(`Rapid-Guessing % “${raw}” must be from 0 to 100.`); return Math.round(n); };
      const readRapid = rapidOf(cell(r, c.rapid)), langRapid = rapidOf(cell(r, c.langRapid));
      let sid = byKey.get(key.toLowerCase());
      const fullName = nameCol >= 0 ? s(r[nameCol]).replace(/\s+/g, " ").trim() : "";
      const nk = fullName ? nameKey(fullName) : "";
      // byName.has() but get()===null means 2+ accessible students share this exact name (ambiguous: e.g. the
      // same name in two of the teacher's classes) — never auto-create in that case, or we'd mint a true duplicate
      // of someone who already exists; only a name that matches NO existing student at all is genuinely new.
      const nameIsKnown = nk ? byName.has(nk) : false;
      if (!sid && nk) { const hit = byName.get(nk); if (hit) sid = hit; }   // same student, other number: no duplicate
      const rowGrade = gradeCol >= 0 ? Number(cell(r, gradeCol)) : 0;
      if (!sid && opts.createInClassId && rowGrade && classGrade && rowGrade !== classGrade) throw new ValidationError(`${fullName || key} is in Grade ${rowGrade} in the file, but this class is Grade ${classGrade}: import them from their own class.`);
      // A report with no Student ID column (e.g. NWEA's Class Profile) has an empty `key` for every row — a
      // student number isn't required to add someone this way, only a name that matches nobody already on record.
      if (!sid && opts.createInClassId && fullName && !nameIsKnown && (key || !anyNumberInFile)) {
        if (key) {
          // a student number IS given (e.g. the platform's own template): still guard against colliding with one
          // that already exists under a different name/class, same as before.
          const taken = (await repo.findMany("Student", { schoolId: actor.schoolId, studentNumber: key }))[0];
          if (taken?.deletedAt) throw new ValidationError(`Student number ${key} belongs to an archived student: bring them back with the roster import (Admin → Import users).`);
          if (taken) throw new ValidationError(`Student number ${key} already belongs to a student of another class.`);
        }
        // a new student: added to the platform in this class, then their scores are saved below
        const n = await createStudentFromMap(repo, actor, opts.createInClassId, key, fullName);
        sid = n.id; if (key) byKey.set(key.toLowerCase(), n.id); byName.set(nk, n.id); created.push({ name: fullName, username: n.username, password: n.password });
      }
      if (!sid && (nwea || opts.wholeFile)) { notInClasses++; unmatched.push({ number: key, name: fullName }); continue; }   // a grade-wide file: other classes' students are expected
      if (!sid) throw new ValidationError(`Student “${key}” was not found in your classes${opts.createInClassId ? " (write the Student Name to add them)" : " (import from one class to add new students)"}.`);
      const subjectsHere = (["READING", "LANGUAGE_USAGE"] as const).filter((sub) => (sub === "READING" ? readRit : langRit) !== null || goals.some((x) => x.g.subject === sub));
      const twice = subjectsHere.filter((sub) => inFile.has(`${sid}|${sub}`));
      if (twice.length) throw new ValidationError(`${fullName || key} is in this file more than once for ${twice.map((x) => SUBJECT_NAME[x]).join(" and ")} (${term}; first on row ${inFile.get(`${sid}|${twice[0]}`)}). Only the first row was saved: check which score is right and fix the file.`);
      for (const sub of subjectsHere) inFile.set(`${sid}|${sub}`, rowNo);
      for (const [subject, rit, growth, pct, rapid] of [["READING", readRit, readGrowth, readPct, readRapid], ["LANGUAGE_USAGE", langRit, langGrowth, langPct, langRapid]] as const) {
        const subjGoals = goals.filter((x) => x.g.subject === subject);
        if (rit === null && !subjGoals.length) continue;
        const name = SUBJECT_NAME[subject];
        // the same term imported again REPLACES — but a value the new file does not have is kept
        // (e.g. the NWEA export has no projection: the projection imported from the ASG file stays)
        const old = (await repo.findMany("MapResult", { studentId: sid, termName: term })).filter((x) => (subject === "READING" ? /read/i : /language/i).test(s(x.subject)));
        const oldOverall = old.find((x) => !x.goalName);
        const keep = <T,>(v: T | null, k: string) => (v !== null && v !== undefined ? v : oldOverall && oldOverall[k] !== null && oldOverall[k] !== undefined ? (oldOverall[k] as T) : null);
        const toDelete = old.filter((x) => (x.goalName ? subjGoals.length > 0 : rit !== null));
        if (toDelete.length) await repo.deleteMany("MapResult", { id: { in: toDelete.map((x) => x.id) } });
        // the comprehensive data file's extras (error, growth, descriptors …)
        const ex = cdf?.extras.get(`${key.toLowerCase()}|${subject}`);
        const more = ex ? { ritSE: ex.ritSE, growthPercentile: ex.growthPercentile, observedGrowth: ex.observedGrowth, conditionalGrowthIndex: ex.conditionalGrowthIndex, metProjectedGrowth: ex.metProjectedGrowth, testMinutes: ex.testMinutes, lexileLow: subject === "READING" ? ex.lexileLow : null, lexileHigh: subject === "READING" ? ex.lexileHigh : null, typicalGrowth: ex.typicalGrowth, proficiency: ex.proficiency } : {};
        const gradeAtTest = rowGrade || currentGradeOf.get(sid) || null; // 🐛 r91 fix: file's own Grade column wins, else the student's current grade
        if (rit !== null) await repo.create("MapResult", { studentId: sid, testDate, subject: name, goalName: null, rit, grade: gradeAtTest, achievementPercentile: keep(pct, "achievementPercentile"), projectedGrowth: keep(growth, "projectedGrowth"), lexile: subject === "READING" ? keep(lexile, "lexile") : null, rapidGuessPct: keep(rapid, "rapidGuessPct"), termName: term, importedAt: now, ...more });
        for (const x of subjGoals) { const gx = ex?.goals[GOAL_GROUP[x.g.code]]; await repo.create("MapResult", { studentId: sid, testDate, subject: name, goalName: s(x.g.area!.name), goalAreaId: s(x.g.area!.id), rit: x.rit, grade: gradeAtTest, termName: term, importedAt: now, ...(gx ? { descriptor: gx.descriptor, ritSE: gx.se } : {}) }); }
      }
      imported++; touched.add(sid);
    } catch (e) {
      if (e instanceof ValidationError || e instanceof ForbiddenError) { errors.push({ row: rowNo, message: e.message }); continue; }
      throw e;
    }
  }
  await repo.create("AuditLog", { actorId: actor.userId, action: "map.scores.import", entityType: "MapResult", entityId: null, after: { term, imported, skipped, errors: errors.length, goals: goalCols.length }, createdAt: now });
  if (notInClasses) errors.push({ row: 0, message: `${notInClasses} student(s) of the NWEA file are not in ${actor.role === "TEACHER" ? "your classes" : "the school's classes"} (other classes / not on the platform yet): skipped.` });
  // the new scores make the individual plans (drafts) and the 3-level groups at once
  const plans = await draftPlansFor(repo, actor, [...touched], now);
  return { imported, skipped, errors, term, created, unmatched, plans };
}

/** Template rows: the actor's students (number, name, grade) ready for the scores. */
export async function mapTemplateRows(repo: Repo, actor: Actor, classId?: string): Promise<string[][]> {
  const classes = (await accessibleClasses(repo, actor)).filter((k) => !classId || k.id === classId);
  const members = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((k) => k.id) }, leftAt: null }, { select: ["studentId", "classId"] }) : [];
  const students = members.length ? await repo.findMany("Student", { id: { in: [...new Set(members.map((m) => m.studentId))] } }, { select: ["id", "userId", "studentNumber", "gradeId"] }) : [];
  const [users, grades] = await Promise.all([
    students.length ? repo.findMany("User", { id: { in: students.map((x) => x.userId) } }, { select: ["id", "username", "displayName"] }) : Promise.resolve([]),
    students.length ? repo.findMany("Grade", { id: { in: [...new Set(students.map((x) => s(x.gradeId)))] } }, { select: ["id", "level"] }) : Promise.resolve([]),
  ]);
  const blank = MAP_TEMPLATE_HEADERS.slice(3).map(() => "");
  const rows = students.map((st) => { const u = users.find((x) => x.id === st.userId); return [s(st.studentNumber) || s(u?.username), s(u?.displayName), s(grades.find((g) => g.id === st.gradeId)?.level ?? ""), ...blank]; }).sort((a, b) => a[1].localeCompare(b[1]));
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
  // the grade's MAP skills (bank data, kept) and this student's mastery: read side by side
  const [bank, masteryRows] = await Promise.all([
    curriculumMapSkills(repo, g.curriculumId),
    repo.findMany("StudentSkillMastery", { studentId }, { select: ["skillId", "score"] }),
  ]);
  if (!bank.length) return [];
  const mastery = new Map(masteryRows.map((m) => [s(m.skillId), Math.round(Number(m.score))]));
  return bank.map((a) => {
    const list = a.skills.map((k) => ({ id: k.id, name: k.name, mastery: mastery.get(k.id) ?? null, questions: k.questions }));
    const seen = list.filter((k) => k.mastery !== null);
    // next: the weakest skill (not started counts as weakest)
    const next = [...list].sort((x, y) => (x.mastery ?? -1) - (y.mastery ?? -1) || x.name.localeCompare(y.name))[0]?.id ?? null;
    return { code: a.code, name: a.name, skills: list, mastery: seen.length ? Math.round(seen.reduce((t, k) => t + k.mastery!, 0) / seen.length) : null, next };
  }).filter((a) => a.skills.length).sort((x, y) => (x.mastery ?? -1) - (y.mastery ?? -1) || x.name.localeCompare(y.name));
}

type BankArea = { code: string; name: string; skills: { id: string; name: string; questions: number }[] };
/**
 * ⚡ The MAP goal areas of a curriculum with their skills that have questions to practise — the same for every student
 * of the grade, so it is kept while the bank is unchanged (was 6 reads one after another on every practice start and
 * every My MAP visit). Areas in the order read, skills in the order read (as before).
 */
function curriculumMapSkills(repo: Repo, curriculumId: string): Promise<BankArea[]> {
  return keptWhileUnchanged(repo, `mapskills|${curriculumId}`, BANK_MODELS, 5 * 60_000, async () => {
    const skills = await repo.findMany("Skill", { curriculumId, isActive: true, deletedAt: null }, { select: ["id", "name", "familyId"] });
    if (!skills.length) return [];
    const [fams, manualRows] = await Promise.all([
      repo.findMany("SkillFamily", { id: { in: [...new Set(skills.map((k) => s(k.familyId)))] } }, { select: ["id", "mapGoalAreaId"] }),
      repo.findMany("QuestionType", { code: "SHORT_ANSWER" }, { select: ["id"] }),
    ]);
    const areaIds = [...new Set(fams.map((f) => s(f.mapGoalAreaId)).filter(Boolean))];
    if (!areaIds.length) return [];
    const manual = [...new Set(manualRows.map((t) => s(t.id)))];
    // ⚡ counted by the database (one row per skill); teacher-marked questions left out as before
    const [areas, count] = await Promise.all([
      repo.findMany("MapGoalArea", { id: { in: areaIds } }, { select: ["id", "code", "name"] }),
      countGroups(repo, "Question", "skillId", { skillId: { in: skills.map((k) => k.id) }, status: "PUBLISHED", deletedAt: null, ...(manual.length ? { typeId: { notIn: manual } } : {}) }),
    ]);
    const areaOf = new Map(fams.map((f) => [s(f.id), s(f.mapGoalAreaId)]));
    return areas.map((a) => ({
      code: s(a.code), name: s(a.name),
      skills: skills.filter((k) => areaOf.get(s(k.familyId)) === a.id && (count.get(s(k.id)) ?? 0) > 0).map((k) => ({ id: s(k.id), name: s(k.name), questions: count.get(s(k.id)) ?? 0 })),
    }));
  });
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
    const n = await nationalNorm(repo, Number(latest.grade) || g.grade, season); // 🐛 r91 fix: this test's own grade, not the student's current one
    if (n) {
      // 🐛 r91 fix: was its own tanh approximation (disagreed with rit.ts's erf-based one near band edges) — now
      // the one shared formula, so a student's own "My MAP" page shows the same band as the teacher's RIT report.
      const imported = latest.achievementPercentile !== null && latest.achievementPercentile !== undefined;
      const pct = imported ? Number(latest.achievementPercentile) : (percentileFromNorm(Number(latest.rit), n) ?? 50);
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
  // the student's grade's MAP skills (kept bank data): no mastery needed to know whether the skill is one of them
  const g = await studentGrade(repo, actor.studentId);
  if (!g?.curriculumId) return false;
  return (await curriculumMapSkills(repo, g.curriculumId)).some((a) => a.skills.some((k) => k.id === skillId));
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
