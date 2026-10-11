/**
 * 🧭 Trust in the levels:
 *  - levelStory: one student's level in every section, WHERE it comes from, what every source says (teacher, own
 *    work, platform, Diagnostic, Weekly Checks, Lexile, MAP), and every change with its reason.
 *  - levelConflicts: students whose sources disagree strongly (e.g. MAP says Above, the platform says Below) —
 *    often guessing, a bad test day or a level to look at again.
 *  - dataHealth: how complete each class's data is (MAP, Diagnostic, recent practice, no data at all), so the
 *    levels can be trusted and the gaps filled first.
 */
import { diagnosticValid, levelForTheta, levelThetas, LEVEL_MIN_ANSWERS, LEVEL_THETA_COLUMNS, THETA_WINDOW_DAYS } from "../curriculum-map/level-evidence";
import type { Repo, Row } from "../seeding/repo";
import { assertCan, canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import { evidenceLevels, EVIDENCE_NAME, type Evidence } from "../curriculum-map/evidence-level";
import { lexileBands, levelForLexile } from "../curriculum-map/lexile";
import { ladderSettings } from "../curriculum-map/ladder-settings";
import { activityStats, levelsOf, mapSummaries, practiceStats, studentNames, type Level, type PracticeStats } from "./student-data";
import { readableClasses } from "../teacher/coordinators";

const s = (v: unknown) => String(v ?? "");
const d = (v: unknown) => (v instanceof Date ? v : v ? new Date(s(v)) : null);
const json = <T>(v: unknown, dflt: T): T => { if (v === null || v === undefined || v === "") return dflt; if (typeof v !== "string") return v as T; try { return JSON.parse(v) as T; } catch { return dflt; } };
const RANK: Record<Level, number> = { BELOW: 0, ON: 1, ABOVE: 2 };
export const SECTIONS = [["ALL", "Overall"], ["CV", "Concept Vocabulary"], ["ACS", "Analyze Craft and Structure"], ["RTR", "Respond to Reading"]] as const;

export interface SourceRow { key: string; name: string; level: Level | null; detail: string; date: string | null }
export interface LevelStory {
  student: { id: string; name: string; number: string; grade: number; className: string };
  sections: { key: string; name: string; level: Level; from: Evidence; fromName: string; reason: string }[];
  sources: SourceRow[];
  history: { date: string; section: string; from: string | null; to: string; source: string; reason: string | null }[];
  conflict: Conflict | null;
}
export interface Conflict { studentId: string; name: string; className: string; high: { source: string; level: Level }; low: { source: string; level: Level }; note: string }

/** What each source says about these students (not combined): the raw material of the story and the conflicts. */
async function sourcesOf(repo: Repo, schoolId: string | null, ids: string[], gradeOf: Map<string, number>, now: Date) {
  const [levels, practice, rules, saved, reading, diag, weekly, thetas] = await Promise.all([
    levelsOf(repo, ids), practiceStats(repo, ids, now), ladderSettings(repo, schoolId),
    ids.length ? repo.findMany("StudentLevel", { studentId: { in: ids } }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("StudentReadingLexile", { studentId: { in: ids } }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("DiagnosticScore", { studentId: { in: ids } }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("WeeklyCheck", { studentId: { in: ids } }) : Promise.resolve([] as Row[]),
    levelThetas(repo, ids, now),
  ]);
  const maps = await mapSummaries(repo, ids, "READING", gradeOf);
  const bands = await lexileBands(repo, schoolId);
  const out = new Map<string, SourceRow[]>();
  for (const id of ids) {
    const rows: SourceRow[] = [];
    const sl = saved.find((x) => s(x.studentId) === id);
    if (sl && s(sl.source) === "TEACHER") rows.push({ key: "TEACHER", name: "Set by the teacher", level: s(sl.level) as Level, detail: "Chosen on the Levels board or when assigning.", date: d(sl.updatedAt)?.toISOString().slice(0, 10) ?? null });
    const lv = levels.get(id)!;
    for (const [k, name] of SECTIONS.slice(1)) if (lv.categories[k]) rows.push({ key: `CATEGORY_${k}`, name: `Own work · ${name}`, level: lv.categories[k], detail: "Reached in their adaptive sets of this section.", date: null });
    const p = practice.get(id), th = thetas.get(id);
    if (th && th.effN >= LEVEL_MIN_ANSWERS) rows.push({ key: "PLATFORM", name: "Platform results (6 weeks)", level: levelForTheta(th.theta), detail: `Ability ${th.theta >= 0 ? "+" : ""}${th.theta.toFixed(1)} ± ${th.se.toFixed(1)} (0 = grade level) on ${Math.round(th.effN)} answers (rapid guesses left out)${th.declining ? " · falling in the last 2 weeks" : ""}.`, date: th.lastAt ? new Date(th.lastAt).toISOString().slice(0, 10) : null });
    else if (p && p.recentAnswers >= 10 && p.recentAccuracy !== null) rows.push({ key: "PLATFORM", name: "Platform results (30 days)", level: p.recentAccuracy >= rules.upPct ? "ABOVE" : p.recentAccuracy < 50 ? "BELOW" : "ON", detail: `${p.recentAccuracy}% correct on ${p.recentAnswers} careful answers.`, date: p.lastActive ? p.lastActive.slice(0, 10) : null });
    else rows.push({ key: "PLATFORM", name: "Platform results (6 weeks)", level: null, detail: p ? `${p.recentAnswers} careful answers (needs 10).` : "No answers yet.", date: null });
    const dg = diag.filter((x) => s(x.studentId) === id).sort((a, b) => (d(b.completedAt)?.getTime() ?? 0) - (d(a.completedAt)?.getTime() ?? 0))[0];
    const dv = diagnosticValid(dg ? { rapid: Number(dg.rapid ?? 0), total: Number(dg.total ?? 0), at: d(dg.completedAt)?.getTime() ?? 0 } : null, now);
    rows.push(dg ? { key: "DIAGNOSTIC", name: "Diagnostic Test", level: dv.valid ? (s(dg.level) as Level) : null, detail: (dv.valid ? "" : `Not used (${dv.why}). `) + `${dg.theta !== null && dg.theta !== undefined ? `Reads at Grade ${Number(dg.theta).toFixed(1)} · score ${Number(dg.pct)}${dg.ritEstimate ? ` · about RIT ${Number(dg.ritEstimate)}` : ""}` : `${Number(dg.correct)}/${Number(dg.total)} (${Number(dg.pct)}%)`}${Number(dg.rapid) >= Number(dg.total) * 0.3 ? " · ⚡ many fast answers" : ""}.`, date: d(dg.completedAt)?.toISOString().slice(0, 10) ?? null } : { key: "DIAGNOSTIC", name: "Diagnostic Test", level: null, detail: "Not taken yet.", date: null });
    const wk = weekly.filter((x) => s(x.studentId) === id && x.completedAt).sort((a, b) => s(b.week).localeCompare(s(a.week))).slice(0, 3);
    if (wk.length) { const c = wk.reduce((t, x) => t + Number(x.correct), 0), n = wk.reduce((t, x) => t + Number(x.total), 0); rows.push({ key: "WEEKLY", name: `Weekly Checks (last ${wk.length})`, level: null, detail: `${c}/${n} correct (questions aimed at the student's own level, so % correct is not a level)${wk[0].ritAfter !== null && wk[0].ritAfter !== undefined ? ` · RIT about ${Number(wk[0].ritAfter)}` : ""}.`, date: s(wk[0].week) }); }
    const m = maps.get(id);
    const rm = reading.find((x) => s(x.studentId) === id && s(x.source) === "READMASTER");
    const band = bands[gradeOf.get(id) ?? 0];
    if (rm) rows.push({ key: "LEXILE_RM", name: "Reading Lexile (ReadMaster)", level: band ? levelForLexile(band, Number(rm.lexile)) : null, detail: `${Number(rm.lexile)}L (moves after every article).`, date: d(rm.updatedAt)?.toISOString().slice(0, 10) ?? null });
    if (m?.lexile) rows.push({ key: "LEXILE_MAP", name: "MAP Lexile", level: band ? levelForLexile(band, m.lexile) : null, detail: `${m.lexile}L${band ? ` (On Level ${band.onMin}–${band.onMax}L)` : ""}.`, date: null });
    rows.push(m?.latest ? { key: "MAP", name: "MAP Reading", level: m.band, detail: `${m.latest.term}: RIT ${m.latest.rit}${m.latest.percentile !== null ? `, ${m.latest.percentile}th percentile` : ""}.`, date: null } : { key: "MAP", name: "MAP Reading", level: null, detail: "No MAP score yet.", date: null });
    out.set(id, rows);
  }
  return out;
}

/** Strong disagreement: one source says Above while another (with real evidence) says Below. */
function conflictOf(rows: SourceRow[]): { high: SourceRow; low: SourceRow } | null {
  const real = rows.filter((r) => r.level && ["PLATFORM", "DIAGNOSTIC", "MAP", "WEEKLY"].includes(r.key));
  const high = real.find((r) => r.level === "ABOVE"), low = real.find((r) => r.level === "BELOW");
  return high && low ? { high, low } : null;
}
const conflictNote = (high: SourceRow, low: SourceRow) =>
  low.key === "PLATFORM" || low.key === "WEEKLY" ? `${high.name} says Above but recent work says Below: check for guessing, effort or a gap since the test.`
  : high.key === "PLATFORM" || high.key === "WEEKLY" ? `Recent work says Above but ${low.name} says Below: the student may have grown — consider moving them up.`
  : `${high.name} and ${low.name} disagree: look at both results before deciding.`;

/** What the fast conflict path can reuse from its caller (Data Health loads these once for its own columns). */
interface ConflictPre { attempts?: Row[]; practice?: Map<string, Pick<PracticeStats, "recentAnswers" | "recentAccuracy">>; diag?: Row[]; maps?: Row[] }

/** The answers both practiceStats (30 days) and levelThetas (42 days) need, read once. */
const recentAnswers = (repo: Repo, ids: string[], now: Date) =>
  ids.length ? repo.findMany("QuestionAttempt", { studentId: { in: ids }, createdAt: { gte: new Date(now.getTime() - Math.max(30, THETA_WINDOW_DAYS) * 86_400_000) } }, { select: LEVEL_THETA_COLUMNS.filter((c) => c !== "skillId") }) : Promise.resolve([] as Row[]); // skillId: only the decline tests use it

/**
 * Only the sources a conflict is decided on — PLATFORM, DIAGNOSTIC and MAP Reading, in sourcesOf's order, with the
 * same levels and names — without detail texts, the other sources or the decline tests (Update 40: Data Health took
 * ~8 s on 200 students because sourcesOf ran every decline/trend estimate and read the answers twice).
 * `conflictOf(conflictSources(…))` equals `conflictOf(sourcesOf(…))` for every student (tests/update40-health).
 */
async function conflictSources(repo: Repo, schoolId: string | null, ids: string[], gradeOf: Map<string, number>, now: Date, pre: ConflictPre = {}): Promise<Map<string, SourceRow[]>> {
  const out = new Map<string, SourceRow[]>();
  if (!ids.length) return out;
  const [rules, diag, maps] = await Promise.all([
    ladderSettings(repo, schoolId),
    pre.diag ? Promise.resolve(pre.diag) : repo.findMany("DiagnosticScore", { studentId: { in: ids } }, { select: ["studentId", "level", "rapid", "total", "completedAt"] }),
    mapSummaries(repo, ids, "READING", gradeOf, { rows: pre.maps }),
  ]);
  const diagBy = new Map<string, Row[]>();
  for (const x of diag) { const k = s(x.studentId); const l = diagBy.get(k); if (l) l.push(x); else diagBy.set(k, [x]); }
  const other = new Map<string, SourceRow[]>();
  for (const id of ids) {
    const dg = (diagBy.get(id) ?? []).sort((a, b) => (d(b.completedAt)?.getTime() ?? 0) - (d(a.completedAt)?.getTime() ?? 0))[0];
    const dv = diagnosticValid(dg ? { rapid: Number(dg.rapid ?? 0), total: Number(dg.total ?? 0), at: d(dg.completedAt)?.getTime() ?? 0 } : null, now);
    const m = maps.get(id);
    other.set(id, [
      { key: "DIAGNOSTIC", name: "Diagnostic Test", level: dg && dv.valid ? (s(dg.level) as Level) : null, detail: "", date: null },
      { key: "MAP", name: "MAP Reading", level: m?.latest ? m.band : null, detail: "", date: null },
    ]);
  }
  // a conflict needs an Above and a Below: when neither the Diagnostic nor MAP says Above or Below, the platform alone
  // cannot make one, so its ability estimate (the slow part) is computed only for the students where it can matter
  const need = ids.filter((id) => other.get(id)!.some((r) => r.level === "ABOVE" || r.level === "BELOW"));
  const attempts = need.length ? pre.attempts ?? (await recentAnswers(repo, need, now)) : [];
  const [practice, thetas] = await Promise.all([
    pre.practice ? Promise.resolve(pre.practice) : practiceStats(repo, need, now, { attempts }),
    levelThetas(repo, need, now, { rows: attempts, only: "theta" }),
  ]);
  for (const id of ids) {
    const p = practice.get(id), th = thetas.get(id);
    let platform: SourceRow;
    if (th && th.effN >= LEVEL_MIN_ANSWERS) platform = { key: "PLATFORM", name: "Platform results (6 weeks)", level: levelForTheta(th.theta), detail: "", date: null };
    else if (p && p.recentAnswers >= 10 && p.recentAccuracy !== null) platform = { key: "PLATFORM", name: "Platform results (30 days)", level: p.recentAccuracy >= rules.upPct ? "ABOVE" : p.recentAccuracy < 50 ? "BELOW" : "ON", detail: "", date: null };
    else platform = { key: "PLATFORM", name: "Platform results (6 weeks)", level: null, detail: "", date: null };
    out.set(id, [platform, ...other.get(id)!]);
  }
  return out;
}

async function gradeOfStudents(repo: Repo, ids: string[]): Promise<Map<string, number>> {
  const sts = ids.length ? await repo.findMany("Student", { id: { in: ids } }, { select: ["id", "gradeId"] }) : [];
  const gs = sts.length ? await repo.findMany("Grade", { id: { in: [...new Set(sts.map((x) => s(x.gradeId)))] } }, { select: ["id", "level"] }) : [];
  return new Map(sts.map((x) => [s(x.id), Number(gs.find((g) => g.id === x.gradeId)?.level ?? 0)]));
}

export async function levelStory(repo: Repo, actor: Actor, studentId: string, now = new Date()): Promise<LevelStory> {
  assertCan(actor, "students:read");
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st || !canAccessStudent(actor, { studentId, schoolId: s(st.schoolId) })) throw new ForbiddenError("Student not found.");
  const gradeOf = await gradeOfStudents(repo, [studentId]);
  const grade = gradeOf.get(studentId) ?? 0;
  const m = (await repo.findMany("ClassMembership", { studentId, leftAt: null }))[0];
  const klass = m ? await repo.findUnique("Class", { id: m.classId }) : null;
  const names = await studentNames(repo, [studentId]);
  const sections: LevelStory["sections"] = [];
  for (const [key, name] of SECTIONS) {
    const e = (await evidenceLevels(repo, s(st.schoolId), [studentId], grade, { category: key === "ALL" ? null : key }, now)).get(studentId)!;
    sections.push({ key, name, level: e.level, from: e.from, fromName: EVIDENCE_NAME[e.from], reason: e.reason });
  }
  const sources = (await sourcesOf(repo, s(st.schoolId), [studentId], gradeOf, now)).get(studentId)!;
  const logs = (await repo.findMany("AuditLog", { entityType: "Student", entityId: studentId, action: "level.change" })).sort((a, b) => (d(b.createdAt)?.getTime() ?? 0) - (d(a.createdAt)?.getTime() ?? 0)).slice(0, 40);
  const SECT: Record<string, string> = { CV: "Concept Vocabulary", ACS: "Analyze Craft and Structure", RTR: "Respond to Reading", OVERALL: "Overall" };
  const SRC: Record<string, string> = { TEACHER: "Teacher", PLACEMENT: "Diagnostic Test", ADAPTIVE: "Their own work", MAP_RIT: "MAP", EVIDENCE: "All evidence (confirmed)" };
  const history = logs.map((l) => { const a = json<Record<string, unknown>>(l.after, {}), b = json<Record<string, unknown>>(l.before, {}); return { date: (d(l.createdAt) ?? now).toISOString().slice(0, 10), section: a.category ? SECT[s(a.category)] ?? s(a.category) : "Overall", from: b.level ? s(b.level) : null, to: s(a.level), source: SRC[s(a.source)] ?? s(a.source), reason: a.reason ? s(a.reason) : null }; });
  const c = conflictOf(sources);
  const name = names.get(studentId)?.name ?? "Student";
  return { student: { id: studentId, name, number: names.get(studentId)?.number ?? "", grade, className: s(klass?.name) }, sections, sources, history, conflict: c ? { studentId, name, className: s(klass?.name), high: { source: c.high.name, level: "ABOVE" }, low: { source: c.low.name, level: "BELOW" }, note: conflictNote(c.high, c.low) } : null };
}

/** The students of these classes whose data disagree strongly (the fast conflict path; `known` = rows the caller
 *  already has, so nothing is read twice). */
export async function levelConflicts(repo: Repo, actor: Actor, classIds: string[], now = new Date(), known: ConflictPre & { mem?: Row[]; classes?: Row[]; names?: Map<string, { name: string }>; gradeOf?: Map<string, number> } = {}): Promise<Conflict[]> {
  assertCan(actor, "students:read");
  const mem = known.mem ?? (classIds.length ? await repo.findMany("ClassMembership", { classId: { in: classIds }, leftAt: null }, { select: ["studentId", "classId"] }) : []);
  const ids = [...new Set(mem.map((m) => s(m.studentId)))];
  const allowed = ids.filter((id) => actor.role !== "TEACHER" || actor.teacherStudentIds?.has(id));
  if (!allowed.length) return [];
  const [gradeOf, names, classes] = await Promise.all([
    known.gradeOf ? Promise.resolve(known.gradeOf) : gradeOfStudents(repo, allowed), known.names ? Promise.resolve(known.names) : studentNames(repo, allowed),
    known.classes ? Promise.resolve(known.classes) : repo.findMany("Class", { id: { in: classIds } }, { select: ["id", "name"] }),
  ]);
  const src = await conflictSources(repo, actor.schoolId, allowed, gradeOf, now, known);
  const classOf = new Map<string, string>();
  for (const m of mem) if (!classOf.has(s(m.studentId))) classOf.set(s(m.studentId), s(m.classId));
  const className = new Map(classes.map((k) => [s(k.id), s(k.name)]));
  const out: Conflict[] = [];
  for (const id of allowed) {
    const c = conflictOf(src.get(id)!);
    if (c) out.push({ studentId: id, name: names.get(id)?.name ?? "Student", className: className.get(classOf.get(id) ?? "") ?? "", high: { source: c.high.name, level: "ABOVE" }, low: { source: c.low.name, level: "BELOW" }, note: conflictNote(c.high, c.low) });
  }
  return out.sort((a, b) => a.className.localeCompare(b.className) || a.name.localeCompare(b.name));
}

export interface HealthRow { classId: string; className: string; grade: number; students: number; noMap: string[]; noDiagnostic: string[]; inactive: string[]; noData: string[]; conflicts: number }
/** 🩺 How complete each class's data is (admin: every class; teacher: theirs). */
export async function dataHealth(repo: Repo, actor: Actor, now = new Date()): Promise<{ rows: HealthRow[]; diagnosticOpen: boolean; conflicts: Conflict[]; names: Record<string, string> }> {
  assertCan(actor, "reports:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError();
  const classes = (await readableClasses(repo, actor)).filter((c) => !c.deletedAt).sort((a, b) => s(a.name).localeCompare(s(b.name)));
  const mem = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => c.id) }, leftAt: null }, { select: ["studentId", "classId"] }) : [];
  const ids = [...new Set(mem.map((m) => s(m.studentId)))];
  // Update 40: every table is read once (answers, MAP, Diagnostic, practice) and shared with the conflict check
  const [names, maps, diag, attempts, grades, open] = await Promise.all([
    studentNames(repo, ids),
    ids.length ? repo.findMany("MapResult", { studentId: { in: ids } }) : Promise.resolve([] as Row[]),
    ids.length ? repo.findMany("DiagnosticScore", { studentId: { in: ids } }, { select: ["studentId", "level", "rapid", "total", "completedAt"] }) : Promise.resolve([] as Row[]),
    recentAnswers(repo, ids, now),
    repo.findMany("Grade", { schoolId: actor.schoolId }, { select: ["id", "level"] }),
    repo.count("DiagnosticTest", { schoolId: actor.schoolId, status: { in: ["OPEN", "CLOSED"] } }),
  ]);
  const practice = await activityStats(repo, ids, now, attempts);
  const hasMap = new Set(maps.map((x) => s(x.studentId))), hasDiag = new Set(diag.map((x) => s(x.studentId)));
  // the student's grade from their own grade row (as gradeOfStudents does), without reading the students again
  const levelOfGrade = new Map(grades.map((g) => [s(g.id), Number(g.level ?? 0)]));
  const otherGrades = [...new Set([...names.values()].map((n) => n.gradeId).filter((g) => g && !levelOfGrade.has(g)))];
  if (otherGrades.length) for (const g of await repo.findMany("Grade", { id: { in: otherGrades } }, { select: ["id", "level"] })) levelOfGrade.set(s(g.id), Number(g.level ?? 0));
  const gradeOf = new Map(ids.filter((id) => names.has(id)).map((id) => [id, levelOfGrade.get(names.get(id)!.gradeId) ?? 0]));
  const conflicts = await levelConflicts(repo, actor, classes.map((c) => s(c.id)), now, { mem, classes, names, gradeOf, attempts, practice, diag, maps });
  const twoWeeks = now.getTime() - 14 * 86_400_000;
  const byClass = new Map<string, string[]>();
  for (const m of mem) { const k = s(m.classId); const l = byClass.get(k); if (l) l.push(s(m.studentId)); else byClass.set(k, [s(m.studentId)]); }
  const conflictBy = new Map<string, number>();
  for (const x of conflicts) conflictBy.set(x.studentId, (conflictBy.get(x.studentId) ?? 0) + 1);
  const rows = classes.map((c) => {
    const st = byClass.get(s(c.id)) ?? [];
    const active = (id: string) => { const p = practice.get(id); return p?.lastActive ? new Date(p.lastActive).getTime() >= twoWeeks : false; };
    return {
      classId: s(c.id), className: s(c.name), grade: Number(grades.find((g) => g.id === c.gradeId)?.level ?? 0), students: st.length,
      noMap: st.filter((id) => !hasMap.has(id)), noDiagnostic: st.filter((id) => !hasDiag.has(id)), inactive: st.filter((id) => !active(id)),
      noData: st.filter((id) => !hasMap.has(id) && !hasDiag.has(id) && !((practice.get(id)?.recentAnswers ?? 0) >= 10)),
      conflicts: [...new Set(st)].reduce((n, id) => n + (conflictBy.get(id) ?? 0), 0),
    };
  });
  return { rows, diagnosticOpen: open > 0, conflicts, names: Object.fromEntries(ids.map((id) => [id, names.get(id)?.name ?? "Student"])) };
}

/** For the alert scan (no actor): students whose sources disagree strongly, with the two sources. */
export async function conflictsFor(repo: Repo, schoolId: string, ids: string[], gradeOf: Map<string, number>, now = new Date()): Promise<{ studentId: string; key: string; detail: string }[]> {
  if (!ids.length) return [];
  const src = await sourcesOf(repo, schoolId, ids, gradeOf, now);
  const out: { studentId: string; key: string; detail: string }[] = [];
  for (const id of ids) { const c = conflictOf(src.get(id)!); if (c) out.push({ studentId: id, key: `${c.high.key}>${c.low.key}`, detail: `${c.high.name}: Above (${c.high.detail}) · ${c.low.name}: Below (${c.low.detail}) ${conflictNote(c.high, c.low)}` }); }
  return out;
}
