/**
 * 🧭 MAP → MAP Test (one place for every MAP-style test; the old admin-only "MAP practice test" page is merged here).
 *
 *   Automatic (simulates MAP Growth): the adaptive engine of sim.ts — starts at the student's latest real RIT (else
 *     the grade's national mean), every answer moves the estimate, the next item is the closest to it inside the
 *     goal-area blueprint. Reading ≈ 42 items, Language Usage ≈ 52 (the teacher can change it), the share of each goal
 *     area can be changed, and any question of the pool can be taken out.
 *   Manual (fixed, MAP style): the teacher picks the goal areas, the number of items and a RIT band, "Suggest for me"
 *     builds it from the bank's MAP-mapped questions, then everything can be edited (remove, replace, reorder, add,
 *     pick one by one); assigned online (graded automatically: a score per area and an RIT estimate from the items'
 *     RIT) or printed with its answer key.
 *
 * Both are rows of MapSimWindow (kind AUTO | MANUAL, the classes / students it is for); the student's test is the
 * same player (MapSimSession / MapSimAnswer). Teachers see and make tests for their own classes; the admin sees every
 * class. The result is an ESTIMATE (NWEA's items and calibration are not available) and is always labelled so.
 * Students see their RIT number and the goal areas to practise — never a level word (Low / LoAvg … are teacher-facing).
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { readableClasses } from "../teacher/coordinators";
import { assertClassAccess } from "../teacher/assignments";
import { studentNames } from "../insights/student-data";
import { loadQuestionItems } from "../practice/items";
import { GROUPS, groupOf, mapProfiles, type Descriptor, type GroupKey, type PoolQ, type Subject } from "./map-plan";
import { bandOf, ensureNationalNorms, nationalNorm, type Season } from "./rit";
import { accuracy, blueprint, expectedNow, idList, jsonOf, manualItems, simPool, windowView, type Accuracy, type ManualItem, type TestKind, type WindowView } from "./sim";
import type { Column, ReportDoc, TableRow } from "../../reports/model";
import { loadFonts } from "../../reports/fonts";
import { renderHtml } from "../../reports/html";
import { renderXlsx } from "../../reports/xlsx";
import { consumeRateLimit } from "../auth/rate-limit";
import { CONTENT_TYPES, loadBranding, RateLimitedError, REPORT_RATE, type ReportDeps } from "../reports/service";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const DAY = 86_400_000;

/** Like the real MAP Growth test: Reading 40–43 items, Language Usage 50–53. */
export const DEFAULT_ITEMS: Record<Subject, number> = { READING: 42, LANGUAGE: 52 };
export const AUTO_RANGE = { min: 20, max: 60 } as const;
export const MANUAL_RANGE = { min: 5, max: 60 } as const;
export const ESTIMATE_NOTE = "Estimated RIT — NWEA items and calibration are not available";
export const SUBJECT_NAME: Record<Subject, string> = { READING: "Reading", LANGUAGE: "Language Usage" };
export const groupsOf = (subject: Subject) => GROUPS.filter((g) => g.subject === subject);

const isAdmin = (a: Actor) => a.role === "SCHOOL_ADMIN" || a.role === "SUPER_ADMIN";
function staff(a: Actor): void { if (a.role !== "TEACHER" && !isAdmin(a)) throw new ForbiddenError("Teachers and admins only."); }
const asSubject = (v: unknown): Subject => (s(v) === "LANGUAGE" ? "LANGUAGE" : "READING");

/** The real MAP season a test made on this day prepares for (Aug–Dec → Winter, Jan–May → Spring, else Fall). */
export function seasonFor(d: Date): Season {
  const m = d.getUTCMonth();
  return m >= 7 ? "WINTER" : m <= 4 ? "SPRING" : "FALL";
}

/** Clean shares: whole percents of the subject's groups (null = even). */
export function cleanShares(subject: Subject, raw: Partial<Record<string, unknown>> | null | undefined): Record<GroupKey, number> | null {
  if (!raw) return null;
  const gs = groupsOf(subject).map((g) => g.key);
  const vals = gs.map((g) => Math.round(Number(raw[g] ?? 0)));
  if (vals.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) throw new ValidationError("Each goal area's share is 0 to 100 %.");
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new ValidationError("Give at least one goal area a share.");
  if (vals.every((v) => v === vals[0])) return null;
  return Object.fromEntries(gs.map((g, i) => [g, vals[i]])) as Record<GroupKey, number>;
}

/** The shares as percents (even when not set). */
export function sharesOf(subject: Subject, w: Row): Record<GroupKey, number> {
  const gs = groupsOf(subject);
  const set = jsonOf<Partial<Record<GroupKey, number>> | null>(w.areaShares, null);
  const vals = gs.map((g) => (set ? Math.max(0, Number(set[g.key] ?? 0)) : 1));
  const sum = vals.reduce((a, b) => a + b, 0) || 1;
  return Object.fromEntries(gs.map((g, i) => [g.key, Math.round((100 * vals[i]) / sum)])) as Record<GroupKey, number>;
}

// ------------------------------------------------------------------ who can see / edit a test

interface Scope { classes: Row[]; classIds: Set<string>; grades: Map<string, number> }
async function scopeOf(repo: Repo, actor: Actor): Promise<Scope> {
  const classes = await readableClasses(repo, actor);
  const gIds = [...new Set(classes.map((c) => s(c.gradeId)))];
  const grades = gIds.length ? await repo.findMany("Grade", { id: { in: gIds } }, { select: ["id", "level"] }) : [];
  const lv = new Map(grades.map((g) => [s(g.id), Number(g.level)]));
  return { classes, classIds: new Set(classes.map((c) => s(c.id))), grades: new Map(classes.map((c) => [s(c.id), lv.get(s(c.gradeId)) ?? 0])) };
}
function visible(actor: Actor, v: WindowView, sc: Scope): boolean {
  if (isAdmin(actor)) return true;
  if (v.createdById === actor.userId) return true;
  if (v.classIds) return v.classIds.some((c) => sc.classIds.has(c));
  return [...sc.grades.values()].some((g) => v.grade === null || v.grade === g);
}
/** The classes of the test the actor can read (school-wide windows: the readable classes of its grade). */
function classesIn(v: WindowView, sc: Scope): Row[] {
  return sc.classes.filter((c) => (v.classIds ? v.classIds.includes(s(c.id)) : v.grade === null || sc.grades.get(s(c.id)) === v.grade));
}

export interface LoadedTest { w: Row; v: WindowView; scope: Scope; canEdit: boolean }
export async function loadTest(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<LoadedTest> {
  staff(actor);
  const w = await repo.findUnique("MapSimWindow", { id: s(id) });
  if (!w || s(w.schoolId) !== s(actor.schoolId)) throw new ForbiddenError("Test not found.");
  const v = windowView(w, now);
  const scope = await scopeOf(repo, actor);
  if (!visible(actor, v, scope)) throw new ForbiddenError("Test not found.");
  let canEdit = isAdmin(actor);
  if (!canEdit && v.classIds) {
    canEdit = v.createdById === actor.userId;
    if (!canEdit) { try { for (const c of v.classIds) await assertClassAccess(repo, actor, c); canEdit = true; } catch (e) { if (!(e instanceof ForbiddenError)) throw e; } }
  }
  return { w, v, scope, canEdit };
}

/** Has any student started it? (then only the dates and the students can change) */
export async function hasStarted(repo: Repo, id: string): Promise<boolean> {
  return (await repo.findMany("MapSimSession", { windowId: id, kind: "SIM" }, { select: ["id"], take: 1 })).length > 0;
}

// ------------------------------------------------------------------ the list (the tab)

export type TestStatus = "open" | "closed" | "draft" | "scheduled";
export interface TestRow { id: string; title: string; subjects: Subject[]; kind: TestKind; classes: string[]; opensAt: string; closesAt: string; status: TestStatus; finished: number; total: number; schoolWide: boolean; mine: boolean }
export const statusOf = (v: WindowView, now: Date): TestStatus => (v.draft ? "draft" : v.open ? "open" : time(v.opensAt) > now.getTime() ? "scheduled" : "closed");

/** The teacher's MAP tests (their classes) and the admin's school-wide windows, newest first; finished x of y. */
export async function mapTestList(repo: Repo, actor: Actor, subject: Subject | null = null, now = new Date()): Promise<TestRow[]> {
  staff(actor);
  const [rows, sc] = await Promise.all([
    repo.findMany("MapSimWindow", { schoolId: actor.schoolId }, { orderBy: [{ field: "createdAt", dir: "desc" }], take: 300 }),
    scopeOf(repo, actor),
  ]);
  const views = rows.map((w) => windowView(w, now)).filter((v) => visible(actor, v, sc) && (!subject || v.subjects.includes(subject)));
  if (!views.length) return [];
  const classIds = [...new Set(views.flatMap((v) => classesIn(v, sc).map((c) => s(c.id))))];
  const [members, done] = await Promise.all([
    classIds.length ? repo.findMany("ClassMembership", { classId: { in: classIds }, leftAt: null }, { select: ["classId", "studentId"] }) : Promise.resolve([] as Row[]),
    repo.findMany("MapSimSession", { windowId: { in: views.map((v) => v.id) }, kind: "SIM", status: "DONE" }, { select: ["windowId", "studentId", "subject"] }),
  ]);
  const name = new Map(sc.classes.map((c) => [s(c.id), s(c.name)]));
  return views.map((v) => {
    const cls = classesIn(v, sc).map((c) => s(c.id));
    const who = new Set(members.filter((m) => cls.includes(s(m.classId)) && (!v.studentIds?.length || v.studentIds.includes(s(m.studentId)))).map((m) => s(m.studentId)));
    const subs = subject ? [subject] : v.subjects;
    return {
      id: v.id, title: v.title, subjects: v.subjects, kind: v.kind, classes: v.classIds ? cls.map((c) => name.get(c) ?? "").filter(Boolean) : [v.grade ? `Grade ${v.grade}` : "All grades"],
      opensAt: v.opensAt, closesAt: v.closesAt, status: statusOf(v, now),
      finished: done.filter((x) => x.windowId === v.id && who.has(s(x.studentId)) && subs.includes(s(x.subject) as Subject)).length, total: who.size * subs.length,
      schoolWide: !v.classIds, mine: v.createdById === actor.userId,
    };
  });
}

// ------------------------------------------------------------------ make a test

export interface CreateInput {
  kind: TestKind; subject: Subject; title?: string; classIds: string[]; studentIds?: string[] | null;
  opensAt: Date; closesAt: Date; items?: number | null; shares?: Partial<Record<string, unknown>> | null; season?: Season | null;
  /** MANUAL: what "Suggest for me" builds from */
  manual?: { areas: GroupKey[]; count: number; ritLow: number; ritHigh: number } | null;
}

async function checkWho(repo: Repo, actor: Actor, classIds: string[], studentIds: string[] | null | undefined): Promise<{ classes: Row[]; grade: number; students: string[] | null }> {
  const ids = [...new Set(classIds.map(s).filter(Boolean))];
  if (!ids.length) throw new ValidationError("Choose a class.");
  const classes: Row[] = [];
  for (const c of ids) classes.push(await assertClassAccess(repo, actor, c));   // teacher: own classes only
  const gradeRows = await repo.findMany("Grade", { id: { in: [...new Set(classes.map((c) => s(c.gradeId)))] } }, { select: ["id", "level"] });
  const grade = Number(gradeRows[0]?.level ?? 0);
  const chosen = [...new Set((studentIds ?? []).map(s).filter(Boolean))];
  if (chosen.length) {
    const members = new Set((await repo.findMany("ClassMembership", { classId: { in: ids }, leftAt: null }, { select: ["studentId"] })).map((m) => s(m.studentId)));
    for (const id of chosen) if (!members.has(id)) throw new ForbiddenError("You can only give the test to students of these classes.");
  }
  return { classes, grade, students: chosen.length ? chosen : null };
}

function checkDates(opensAt: Date, closesAt: Date): void {
  if (!(opensAt instanceof Date) || Number.isNaN(opensAt.getTime()) || !(closesAt instanceof Date) || Number.isNaN(closesAt.getTime())) throw new ValidationError("Choose the open and close dates.");
  if (!(closesAt.getTime() > opensAt.getTime())) throw new ValidationError("The test must close after it opens.");
}

/** Automatic or manual test for the actor's classes. Automatic: open on its dates (students told); manual: a draft to build. */
export async function createMapTest(repo: Repo, actor: Actor, input: CreateInput, now = new Date()): Promise<string> {
  staff(actor);
  assertCan(actor, "assignments:create");
  const subject = asSubject(input.subject);
  const kind: TestKind = input.kind === "MANUAL" ? "MANUAL" : "AUTO";
  checkDates(input.opensAt, input.closesAt);
  const who = await checkWho(repo, actor, input.classIds, input.studentIds);
  const title = s(input.title).replace(/\s+/g, " ").trim().slice(0, 160) || `MAP Test · ${SUBJECT_NAME[subject]} · ${input.opensAt.toISOString().slice(0, 10)}`;
  const base = { schoolId: actor.schoolId!, title, grade: who.grade || null, season: input.season ?? seasonFor(input.opensAt), subjects: [subject], opensAt: input.opensAt, closesAt: input.closesAt, createdById: actor.userId, createdAt: now, updatedAt: now, kind, classIds: who.classes.map((c) => s(c.id)), studentIds: who.students };
  let row: Row;
  if (kind === "AUTO") {
    const items = input.items ? Math.round(Number(input.items)) : DEFAULT_ITEMS[subject];
    if (!Number.isInteger(items) || items < AUTO_RANGE.min || items > AUTO_RANGE.max) throw new ValidationError(`Questions: ${AUTO_RANGE.min} to ${AUTO_RANGE.max}.`);
    row = await repo.create("MapSimWindow", { ...base, items, areaShares: cleanShares(subject, input.shares), excludedIds: null, itemIds: null, draft: false, settings: null });
    await notifyStudents(repo, row, now);
  } else {
    const m = cleanManual(subject, input.manual, input.items);
    const items = await suggestManual(repo, actor.schoolId!, who.grade, subject, m);
    if (!items.length) throw new ValidationError("The bank has no MAP-mapped questions for these goal areas yet.");
    row = await repo.create("MapSimWindow", { ...base, items: items.length, itemIds: items, areaShares: null, excludedIds: null, draft: true, settings: m });
  }
  await audit(repo, { actorId: actor.userId, action: "maptest.create", entityType: "MapSimWindow", entityId: s(row.id), after: { kind, subject, classIds: base.classIds, students: who.students?.length ?? null }, at: now });
  return s(row.id);
}

export interface ManualSettings { areas: GroupKey[]; count: number; ritLow: number; ritHigh: number }
function cleanManual(subject: Subject, m: CreateInput["manual"], items?: number | null): ManualSettings {
  const gs = groupsOf(subject).map((g) => g.key);
  const areas = (m?.areas ?? []).filter((a) => gs.includes(a));
  const count = Math.round(Number(m?.count ?? items ?? 20));
  if (!Number.isInteger(count) || count < MANUAL_RANGE.min || count > MANUAL_RANGE.max) throw new ValidationError(`Questions: ${MANUAL_RANGE.min} to ${MANUAL_RANGE.max}.`);
  let lo = Math.round(Number(m?.ritLow ?? 180)), hi = Math.round(Number(m?.ritHigh ?? 230));
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new ValidationError("Type the RIT band (for example 190 to 220).");
  if (lo > hi) [lo, hi] = [hi, lo];
  return { areas: areas.length ? areas : gs, count, ritLow: Math.max(120, lo), ritHigh: Math.min(320, hi) };
}

/**
 * "Suggest for me": the bank's MAP-mapped questions of the chosen goal areas, shared evenly between them, spread
 * over the RIT band (easy → hard), widened a little when a band has too few; items in `avoid` are left out.
 */
export async function suggestManual(repo: Repo, schoolId: string, grade: number, subject: Subject, m: ManualSettings, avoid: Set<string> = new Set()): Promise<ManualItem[]> {
  const pool = await simPool(repo, schoolId, grade || 4, subject);
  const areas = m.areas.filter((a) => pool.byGroup.has(a));
  if (!areas.length) return [];
  const per = blueprint(subject, m.count, Object.fromEntries(groupsOf(subject).map((g) => [g.key, areas.includes(g.key) ? 1 : 0])) as Record<GroupKey, number>);
  const taken = new Set(avoid), out: ManualItem[] = [];
  for (const a of areas) {
    const want = per.get(a) ?? 0;
    const list = (pool.byGroup.get(a) ?? []).filter((q) => !taken.has(q.id));
    const inBand = list.filter((q) => q.rit >= m.ritLow && q.rit <= m.ritHigh).sort((x, y) => x.rit - y.rit);
    const mid = (m.ritLow + m.ritHigh) / 2;
    const extra = list.filter((q) => q.rit < m.ritLow || q.rit > m.ritHigh).sort((x, y) => Math.abs(x.rit - mid) - Math.abs(y.rit - mid));
    const pick: PoolQ[] = [];
    // spread over the band: evenly spaced picks from the sorted list
    if (inBand.length <= want) pick.push(...inBand);
    else for (let i = 0; i < want; i++) pick.push(inBand[Math.floor(((i + 0.5) * inBand.length) / want)]);
    for (const q of extra) { if (pick.length >= want) break; pick.push(q); }
    for (const q of pick) { taken.add(q.id); out.push({ id: q.id, area: a, rit: Math.round(q.rit) }); }
  }
  return out.sort((x, y) => x.rit - y.rit);
}

async function notifyStudents(repo: Repo, w: Row, now: Date): Promise<void> {
  const v = windowView(w, now);
  if (v.draft || !v.classIds) return;
  const members = await repo.findMany("ClassMembership", { classId: { in: v.classIds }, leftAt: null }, { select: ["studentId"] });
  const ids = [...new Set(members.map((m) => s(m.studentId)).filter((id) => !v.studentIds?.length || v.studentIds.includes(id)))];
  if (!ids.length) return;
  const users = await repo.findMany("Student", { id: { in: ids } }, { select: ["userId"] });
  const body = `${SUBJECT_NAME[v.subjects[0] ?? "READING"]}: opens ${v.opensAt.slice(0, 10)}, closes ${v.closesAt.slice(0, 10)}. It is in My Work.`;
  for (let i = 0; i < users.length; i += 200) await repo.createMany("Notification", users.slice(i, i + 200).map((u) => ({ userId: u.userId, type: "ASSESSMENT_AVAILABLE", title: "🧭 MAP Test", body, link: "/student/map-test", createdAt: now })));
}

// ------------------------------------------------------------------ edit

export interface UpdateInput {
  title?: string; opensAt?: Date; closesAt?: Date; classIds?: string[]; studentIds?: string[] | null;
  items?: number; shares?: Partial<Record<string, unknown>> | null; excludedIds?: string[]; publish?: boolean;
}

/** Edits: everything before anyone starts; after that only the dates and the students. */
export async function updateMapTest(repo: Repo, actor: Actor, id: string, input: UpdateInput, now = new Date()): Promise<void> {
  const { w, v, canEdit } = await loadTest(repo, actor, id, now);
  if (!canEdit) throw new ForbiddenError("Only the class teacher can change this test.");
  const subject = v.subjects[0] ?? "READING";
  const started = await hasStarted(repo, v.id);
  const data: Record<string, unknown> = { updatedAt: now };
  const content = input.title !== undefined || input.items !== undefined || input.shares !== undefined || input.excludedIds !== undefined;
  if (started && content) throw new ValidationError("Students have started this test: only the dates and the students can change now.");
  if (input.title !== undefined) data.title = s(input.title).replace(/\s+/g, " ").trim().slice(0, 160) || v.title;
  if (input.opensAt || input.closesAt) { const o = input.opensAt ?? new Date(v.opensAt), c = input.closesAt ?? new Date(v.closesAt); checkDates(o, c); data.opensAt = o; data.closesAt = c; }
  if (input.classIds !== undefined || input.studentIds !== undefined) {
    if (!v.classIds) throw new ValidationError("This school-wide test is for a whole grade.");
    const who = await checkWho(repo, actor, input.classIds ?? v.classIds, input.studentIds === undefined ? v.studentIds : input.studentIds);
    data.classIds = who.classes.map((c) => s(c.id)); data.studentIds = who.students;
  }
  if (input.items !== undefined && v.kind === "AUTO") {
    const n = Math.round(Number(input.items));
    if (!Number.isInteger(n) || n < AUTO_RANGE.min || n > AUTO_RANGE.max) throw new ValidationError(`Questions: ${AUTO_RANGE.min} to ${AUTO_RANGE.max}.`);
    data.items = n;
  }
  if (input.shares !== undefined && v.kind === "AUTO") data.areaShares = cleanShares(subject, input.shares);
  if (input.excludedIds !== undefined) data.excludedIds = [...new Set(input.excludedIds.map(s).filter(Boolean))];
  let publish = false;
  if (input.publish && v.draft) {
    if (v.kind === "MANUAL" && manualItems(w).length < MANUAL_RANGE.min) throw new ValidationError(`A manual test needs at least ${MANUAL_RANGE.min} questions.`);
    data.draft = false; publish = true;
  }
  await repo.updateMany("MapSimWindow", { id: v.id }, data);
  if (publish) await notifyStudents(repo, { ...w, ...data }, now);
  await audit(repo, { actorId: actor.userId, action: "maptest.update", entityType: "MapSimWindow", entityId: v.id, after: Object.fromEntries(Object.keys(data).filter((k) => k !== "updatedAt").map((k) => [k, k === "excludedIds" ? (data[k] as string[]).length : data[k]])), at: now });
}

export type ItemOp = { op: "remove" | "up" | "down" | "replace"; id: string } | { op: "add"; id?: string | null; area?: GroupKey | null } | { op: "resuggest"; manual: ManualSettings };

/** Manual test, before anyone starts: remove / move / replace / add an item (one by one), or suggest again. */
export async function editManualItems(repo: Repo, actor: Actor, id: string, op: ItemOp, now = new Date()): Promise<void> {
  const { w, v, canEdit } = await loadTest(repo, actor, id, now);
  if (!canEdit) throw new ForbiddenError("Only the class teacher can change this test.");
  if (v.kind !== "MANUAL") throw new ValidationError("This is an automatic test: change its pool instead.");
  if (await hasStarted(repo, v.id)) throw new ValidationError("Students have started this test: only the dates and the students can change now.");
  const subject = v.subjects[0] ?? "READING";
  const settings = jsonOf<ManualSettings | null>(w.settings, null) ?? { areas: groupsOf(subject).map((g) => g.key), count: 20, ritLow: 180, ritHigh: 230 };
  let list = manualItems(w);
  const at = "id" in op && op.id ? list.findIndex((x) => x.id === op.id) : -1;
  if (op.op === "remove") { if (at < 0) throw new ValidationError("That question is not in the test."); list.splice(at, 1); }
  else if (op.op === "up" || op.op === "down") {
    if (at < 0) throw new ValidationError("That question is not in the test.");
    const to = op.op === "up" ? at - 1 : at + 1;
    if (to >= 0 && to < list.length) [list[at], list[to]] = [list[to], list[at]];
  } else if (op.op === "replace" || op.op === "add") {
    const pool = await simPool(repo, s(w.schoolId), Number(w.grade) || 4, subject);
    const inTest = new Set(list.map((x) => x.id));
    if (op.op === "replace") {
      if (at < 0) throw new ValidationError("That question is not in the test.");
      const old = list[at];
      const alt = (pool.byGroup.get(old.area) ?? []).filter((q) => !inTest.has(q.id)).sort((a, b) => Math.abs(a.rit - old.rit) - Math.abs(b.rit - old.rit))[0];
      if (!alt) throw new ValidationError("No other question of this goal area in the bank.");
      list[at] = { id: alt.id, area: old.area, rit: Math.round(alt.rit) };
    } else {
      if (list.length >= MANUAL_RANGE.max) throw new ValidationError(`A test has at most ${MANUAL_RANGE.max} questions.`);
      if (op.id) {
        if (inTest.has(op.id)) throw new ValidationError("That question is already in the test.");
        const area = pool.group.get(op.id);
        if (!area) throw new ValidationError("That question is not a MAP question of this subject.");
        list.push({ id: op.id, area, rit: Math.round(pool.rit.get(op.id) ?? 200) });
      } else {
        const want = (op as { area?: GroupKey | null }).area; const area = want && pool.byGroup.has(want) ? want : settings.areas[0];
        const mid = (settings.ritLow + settings.ritHigh) / 2;
        const q = (pool.byGroup.get(area) ?? []).filter((x) => !inTest.has(x.id)).sort((a, b) => Math.abs(a.rit - mid) - Math.abs(b.rit - mid))[0];
        if (!q) throw new ValidationError("No other question of this goal area in the bank.");
        list.push({ id: q.id, area, rit: Math.round(q.rit) });
      }
    }
  } else if (op.op === "resuggest") {
    const m = cleanManual(subject, op.manual);
    list = await suggestManual(repo, s(w.schoolId), Number(w.grade) || 4, subject, m);
    if (!list.length) throw new ValidationError("The bank has no MAP-mapped questions for these goal areas yet.");
    await repo.updateMany("MapSimWindow", { id: v.id }, { itemIds: list, items: list.length, settings: m, updatedAt: now });
    return;
  }
  await repo.updateMany("MapSimWindow", { id: v.id }, { itemIds: list, items: list.length, updatedAt: now });
}

// ------------------------------------------------------------------ details (the test page)

export interface TestDetail {
  v: WindowView; subject: Subject; grade: number; canEdit: boolean; started: boolean; status: TestStatus;
  classes: { id: string; name: string }[]; students: { id: string; name: string }[] | null;
  shares: Record<GroupKey, number>; plan: { key: GroupKey; name: string; icon: string; n: number }[];
  excluded: string[]; settings: ManualSettings | null;
  items: (ManualItem & { n: number; stem: string; name: string })[];
}

export async function testDetail(repo: Repo, actor: Actor, id: string, now = new Date()): Promise<TestDetail> {
  const { w, v, scope, canEdit } = await loadTest(repo, actor, id, now);
  const subject = v.subjects[0] ?? "READING";
  const list = v.kind === "MANUAL" ? manualItems(w) : [];
  const [started, stems, names] = await Promise.all([
    hasStarted(repo, v.id),
    list.length ? repo.findMany("Question", { id: { in: list.map((x) => x.id) } }, { select: ["id", "stem"] }) : Promise.resolve([] as Row[]),
    v.studentIds?.length ? studentNames(repo, v.studentIds) : Promise.resolve(new Map<string, { name: string }>()),
  ]);
  const stem = new Map(stems.map((q) => [s(q.id), s(q.stem)]));
  const shares = sharesOf(subject, w);
  const plan = blueprint(subject, v.items, jsonOf<Partial<Record<GroupKey, number>> | null>(w.areaShares, null));
  return {
    v, subject, grade: Number(w.grade ?? 0), canEdit, started, status: statusOf(v, now),
    classes: classesIn(v, scope).map((c) => ({ id: s(c.id), name: s(c.name) })),
    students: v.studentIds?.length ? v.studentIds.map((sid) => ({ id: sid, name: names.get(sid)?.name ?? "Student" })) : null,
    shares, plan: groupsOf(subject).map((g) => ({ key: g.key, name: g.name, icon: g.icon, n: plan.get(g.key) ?? 0 })),
    excluded: idList(w.excludedIds) ?? [], settings: v.kind === "MANUAL" ? jsonOf<ManualSettings | null>(w.settings, null) : null,
    items: list.map((x, i) => ({ ...x, n: i + 1, stem: stem.get(x.id) ?? "(question removed from the bank)", name: groupOf(x.area)?.name ?? x.area })),
  };
}

export interface PoolArea { key: GroupKey; name: string; icon: string; total: number; excluded: number; low: number; high: number; items: { id: string; rit: number; stem: string; excluded: boolean; inTest: boolean }[] }

/**
 * The item pool per goal area (counts; with `area`, that area's items with their RIT and a short stem, at most
 * `limit`, easiest first) — the automatic test's pool (with the teacher's exclusions) or the manual builder's bank.
 */
export async function testPool(repo: Repo, actor: Actor, id: string, opts: { area?: GroupKey | null; limit?: number } = {}, now = new Date()): Promise<PoolArea[]> {
  const { w, v } = await loadTest(repo, actor, id, now);
  const subject = v.subjects[0] ?? "READING";
  const pool = await simPool(repo, s(w.schoolId), Number(w.grade) || 4, subject);
  const excluded = new Set(idList(w.excludedIds) ?? []);
  const inTest = new Set(manualItems(w).map((x) => x.id));
  const limit = Math.max(1, Math.min(400, opts.limit ?? 200));
  const shown = opts.area ? (pool.byGroup.get(opts.area) ?? []).slice().sort((a, b) => a.rit - b.rit).slice(0, limit) : [];
  const stems = shown.length ? await repo.findMany("Question", { id: { in: shown.map((q) => q.id) } }, { select: ["id", "stem"] }) : [];
  const stem = new Map(stems.map((q) => [s(q.id), s(q.stem).replace(/\s+/g, " ").slice(0, 140)]));
  return groupsOf(subject).map((g) => {
    const list = pool.byGroup.get(g.key) ?? [];
    const rits = list.map((q) => q.rit);
    return {
      key: g.key, name: g.name, icon: g.icon, total: list.length, excluded: list.filter((q) => excluded.has(q.id)).length,
      low: rits.length ? Math.round(Math.min(...rits)) : 0, high: rits.length ? Math.round(Math.max(...rits)) : 0,
      items: g.key === opts.area ? shown.map((q) => ({ id: q.id, rit: Math.round(q.rit), stem: stem.get(q.id) ?? "", excluded: excluded.has(q.id), inTest: inTest.has(q.id) })) : [],
    };
  });
}

// ------------------------------------------------------------------ results and reports

export interface AreaResult { key: GroupKey; name: string; icon: string; rit: number | null; n: number; ok: number; pct: number | null }
export interface StudentResult {
  studentId: string; name: string; classId: string; className: string; status: "NOT_STARTED" | "IN_PROGRESS" | "DONE";
  answered: number; total: number; rapid: number; rapidPct: number | null; retest: boolean;
  rit: number | null; low: number | null; high: number | null; se: number | null; percentile: number | null;
  /** teacher-facing only (NWEA achievement descriptor) */
  descriptor: Descriptor | null;
  score: number | null; areas: AreaResult[];
  real: { rit: number; term: string | null } | null; fall: number | null; goal: number | null; expected: number | null; onTrack: boolean | null; growth: number | null;
}
export interface ItemStat { n: number; questionId: string; area: GroupKey; areaName: string; rit: number; stem: string; answered: number; pct: number | null; topWrong: string | null; topWrongCount: number }
export interface PlanGroup { key: string; classId: string; className: string; area: GroupKey; name: string; icon: string; students: { id: string; name: string; rit: number }[]; skillIds: string[]; href: string }
export interface TestReport {
  id: string; title: string; subject: Subject; kind: TestKind; season: string; grade: number; opensAt: string; closesAt: string; note: string;
  progress: { targets: number; started: number; finished: number; notStarted: number; rapidFlags: number };
  students: StudentResult[];
  summary: { avg: number | null; median: number | null; distribution: { band: string; n: number }[]; areas: { key: GroupKey; name: string; icon: string; avg: number | null }[]; strongest: string | null; weakest: string | null; onTrack: number; offTrack: number };
  groups: PlanGroup[]; items: ItemStat[]; accuracy: Accuracy;
}

const median = (xs: number[]) => { if (!xs.length) return null; const a = [...xs].sort((p, q) => p - q), m = Math.floor(a.length / 2); return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2); };

/** The test page's progress and reports (one subject), for the students of the test the actor can read. */
export async function testReport(repo: Repo, actor: Actor, id: string, subjectArg?: Subject | null, now = new Date()): Promise<TestReport> {
  assertCan(actor, "reports:read");
  const { w, v, scope } = await loadTest(repo, actor, id, now);
  const subject = subjectArg && v.subjects.includes(subjectArg) ? subjectArg : v.subjects[0] ?? "READING";
  const classes = classesIn(v, scope);
  const members = classes.length ? await repo.findMany("ClassMembership", { classId: { in: classes.map((c) => s(c.id)) }, leftAt: null }, { select: ["classId", "studentId"] }) : [];
  const classOf = new Map<string, string>();
  for (const m of members) if (!v.studentIds?.length || v.studentIds.includes(s(m.studentId))) if (!classOf.has(s(m.studentId))) classOf.set(s(m.studentId), s(m.classId));
  const ids = [...classOf.keys()];
  const className = new Map(classes.map((c) => [s(c.id), s(c.name)]));
  const grade = Number(w.grade ?? 0) || [...scope.grades.values()][0] || 0;
  const [names, profiles, sessions] = await Promise.all([
    studentNames(repo, ids), ids.length ? mapProfiles(repo, actor.schoolId!, ids, subject) : Promise.resolve(new Map()),
    ids.length ? repo.findMany("MapSimSession", { windowId: v.id, subject, kind: "SIM", studentId: { in: ids } }) : Promise.resolve([] as Row[]),
  ]);
  const answers = sessions.length ? await repo.findMany("MapSimAnswer", { sessionId: { in: sessions.map((x) => s(x.id)) } }, { select: ["sessionId", "n", "questionId", "area", "itemRit", "isCorrect", "rapid", "response"], take: 60_000 }) : [];
  await ensureNationalNorms(repo);
  const norm = await nationalNorm(repo, grade || 5, (s(w.season) as Season) || "WINTER");
  const pctOf = (rit: number) => (norm ? Math.max(1, Math.min(99, Math.round(100 / (1 + Math.exp(-1.702 * ((rit - norm.mean) / norm.sd)))))) : null);
  const gs = groupsOf(subject);
  const students: StudentResult[] = ids.map((sid) => {
    const x = sessions.find((y) => s(y.studentId) === sid);
    const p = profiles.get(sid);
    const done = x?.status === "DONE";
    const rit = done ? Number(x!.resultRit) : null;
    const ar = jsonOf<Record<string, { rit: number; n: number; ok?: number }>>(x?.areas, {});
    const mine = x ? answers.filter((a) => a.sessionId === x.id) : [];
    const areas: AreaResult[] = gs.map((g) => {
      const list = mine.filter((a) => a.area === g.key && !a.rapid);
      const ok = list.filter((a) => a.isCorrect).length;
      return { key: g.key, name: g.name, icon: g.icon, rit: done && ar[g.key] ? Number(ar[g.key].rit) : null, n: list.length, ok, pct: list.length ? Math.round((100 * ok) / list.length) : null };
    });
    const fall = p?.fall?.rit ?? null, goal = p?.fall?.projection ?? null;
    const expected = fall !== null && p?.fall?.growth !== null && p?.fall?.growth !== undefined ? expectedNow(fall, p.fall.growth, s(w.season)) : null;
    const answered = Number(x?.answered ?? 0), rapid = Number(x?.rapid ?? 0);
    const rapidPct = answered ? Math.round((100 * rapid) / answered) : null;
    const pc = rit === null ? null : pctOf(rit);
    const careful = mine.filter((a) => !a.rapid);
    return {
      studentId: sid, name: names.get(sid)?.name ?? "Student", classId: classOf.get(sid)!, className: className.get(classOf.get(sid)!) ?? "",
      status: (x ? s(x.status) : "NOT_STARTED") as StudentResult["status"], answered, total: Number(x?.total ?? v.items), rapid, rapidPct, retest: (rapidPct ?? 0) >= 30,
      rit, low: done ? Number(x!.resultLow) : null, high: done ? Number(x!.resultHigh) : null, se: done && x!.se !== null && x!.se !== undefined ? Math.round(Number(x!.se) * 10) / 10 : null,
      percentile: pc, descriptor: pc === null ? null : (bandOf(pc) as Descriptor), score: careful.length ? Math.round((100 * careful.filter((a) => a.isCorrect).length) / careful.length) : null, areas,
      real: p?.overall ? { rit: p.overall.rit, term: p.term } : null, fall, goal, expected,
      onTrack: rit !== null && expected !== null ? rit >= expected - 2 : null, growth: rit !== null && fall !== null ? rit - fall : null,
    };
  }).sort((a, b) => (a.rit ?? 999) - (b.rit ?? 999) || a.name.localeCompare(b.name));

  const done = students.filter((r) => r.status === "DONE");
  const rits = done.map((r) => r.rit!);
  const bands = new Map<string, number>();
  for (const r of rits) { const lo = Math.floor(r / 10) * 10; const k = `${lo}–${lo + 9}`; bands.set(k, (bands.get(k) ?? 0) + 1); }
  const areaAvg = gs.map((g) => { const xs = done.map((r) => r.areas.find((a) => a.key === g.key)?.rit).filter((x): x is number => x !== null && x !== undefined); return { key: g.key, name: g.name, icon: g.icon, avg: xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null }; });
  const scored = areaAvg.filter((a) => a.avg !== null).sort((a, b) => a.avg! - b.avg!);

  // item analysis: % correct of careful answers and the most chosen wrong answer
  const qids = [...new Set(answers.map((a) => s(a.questionId)))];
  const items = qids.length ? await loadQuestionItems(repo, qids) : [];
  const itemOf = new Map(items.map((i) => [i.questionId, i]));
  const order = v.kind === "MANUAL" ? manualItems(w).map((x) => x.id) : [];
  const stats: ItemStat[] = qids.map((q) => {
    const list = answers.filter((a) => s(a.questionId) === q && !a.rapid);
    const wrong = new Map<string, number>();
    for (const a of list) if (!a.isCorrect && a.response !== null && a.response !== undefined) { const k = typeof a.response === "string" ? s(a.response) : JSON.stringify(a.response); wrong.set(k, (wrong.get(k) ?? 0) + 1); }
    const top = [...wrong].sort((a, b) => b[1] - a[1])[0];
    const it = itemOf.get(q);
    let label: string | null = null;
    if (top) { let k = top[0]; try { const p = JSON.parse(k); if (typeof p === "string") k = p; } catch { /* plain text */ } const opt = it?.options?.find((o) => o.label === k); label = opt ? `${opt.label}. ${opt.text}`.slice(0, 80) : k.slice(0, 80); }
    const first = answers.find((a) => s(a.questionId) === q)!;
    return { n: 0, questionId: q, area: s(first.area) as GroupKey, areaName: groupOf(s(first.area))?.name ?? s(first.area), rit: Math.round(Number(first.itemRit)), stem: s(it?.stem).replace(/\s+/g, " ").slice(0, 140), answered: list.length, pct: list.length ? Math.round((100 * list.filter((a) => a.isCorrect).length) / list.length) : null, topWrong: label, topWrongCount: top?.[1] ?? 0 };
  }).sort((a, b) => (order.length ? order.indexOf(a.questionId) - order.indexOf(b.questionId) : (a.pct ?? 101) - (b.pct ?? 101) || a.rit - b.rit));
  stats.forEach((x, i) => { x.n = i + 1; });

  // ready-made groups: each finished student's lowest goal area, per class → "Make a plan" (the MAP plan tab)
  const pool = done.length ? await simPool(repo, s(w.schoolId), grade || 4, subject) : null;
  const skillOfQ = new Map<string, string>();
  if (pool) for (const list of pool.byGroup.values()) for (const q of list) skillOfQ.set(q.id, q.skillId);
  const groups = new Map<string, PlanGroup>();
  for (const r of done) {
    const low = r.areas.filter((a) => a.rit !== null).sort((a, b) => a.rit! - b.rit!)[0];
    if (!low) continue;
    const key = `${r.classId}:${low.key}`;
    const g = groups.get(key) ?? { key, classId: r.classId, className: r.className, area: low.key, name: low.name, icon: low.icon, students: [], skillIds: [], href: "" };
    g.students.push({ id: r.studentId, name: r.name, rit: r.rit! });
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    const sess = new Set(sessions.filter((x) => g.students.some((st) => st.id === s(x.studentId))).map((x) => s(x.id)));
    const missed = new Map<string, number>();
    for (const a of answers) if (sess.has(s(a.sessionId)) && a.area === g.area && !a.isCorrect) { const k = skillOfQ.get(s(a.questionId)); if (k) missed.set(k, (missed.get(k) ?? 0) + 1); }
    g.skillIds = [...missed].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
    const p = new URLSearchParams({ tab: "plan", mode: "group", who: "group", classId: g.classId, subject });
    for (const st of g.students) p.append("sid", st.id);
    for (const k of g.skillIds) p.append("add", k);
    g.href = `/teacher/map-center?${p}`;
  }

  const acc = await accuracy(repo, actor, v.id, subject);
  return {
    id: v.id, title: v.title, subject, kind: v.kind, season: s(w.season), grade, opensAt: v.opensAt, closesAt: v.closesAt, note: ESTIMATE_NOTE,
    progress: { targets: ids.length, started: students.filter((r) => r.status !== "NOT_STARTED").length, finished: done.length, notStarted: students.filter((r) => r.status === "NOT_STARTED").length, rapidFlags: students.filter((r) => r.retest).length },
    students,
    summary: { avg: rits.length ? Math.round(rits.reduce((a, b) => a + b, 0) / rits.length) : null, median: median(rits), distribution: [...bands].sort((a, b) => a[0].localeCompare(b[0])).map(([band, n]) => ({ band, n })), areas: areaAvg, strongest: scored.length > 1 ? scored[scored.length - 1].name : null, weakest: scored.length > 1 ? scored[0].name : null, onTrack: students.filter((r) => r.onTrack === true).length, offTrack: students.filter((r) => r.onTrack === false).length },
    groups: [...groups.values()].sort((a, b) => a.className.localeCompare(b.className) || b.students.length - a.students.length), items: stats, accuracy: acc,
  };
}

/** Exactly which items one student got (in order): area, item RIT, right / wrong, rapid, time. */
export async function studentItems(repo: Repo, actor: Actor, id: string, studentId: string, subjectArg?: Subject | null, now = new Date()): Promise<{ name: string; items: { n: number; questionId: string; areaName: string; rit: number; correct: boolean; rapid: boolean; seconds: number; stem: string }[] }> {
  const r = await testReport(repo, actor, id, subjectArg, now);
  const st = r.students.find((x) => x.studentId === studentId);
  if (!st) throw new ForbiddenError("Student not found.");
  const sess = (await repo.findMany("MapSimSession", { windowId: id, studentId, subject: r.subject, kind: "SIM" }, { select: ["id"], take: 1 }))[0];
  const ans = sess ? await repo.findMany("MapSimAnswer", { sessionId: sess.id }, { select: ["n", "questionId", "area", "itemRit", "isCorrect", "rapid", "responseMs"] }) : [];
  const stems = ans.length ? await repo.findMany("Question", { id: { in: ans.map((a) => s(a.questionId)) } }, { select: ["id", "stem"] }) : [];
  const stem = new Map(stems.map((q) => [s(q.id), s(q.stem).replace(/\s+/g, " ").slice(0, 140)]));
  return { name: st.name, items: ans.sort((a, b) => Number(a.n) - Number(b.n)).map((a) => ({ n: Number(a.n), questionId: s(a.questionId), areaName: groupOf(s(a.area))?.name ?? s(a.area), rit: Math.round(Number(a.itemRit)), correct: Boolean(a.isCorrect), rapid: Boolean(a.rapid), seconds: Math.round(Number(a.responseMs) / 1000), stem: stem.get(s(a.questionId)) ?? "" })) };
}

// ------------------------------------------------------------------ Excel / PDF

const slug = (x: string) => x.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "map-test";

export function mapTestDoc(r: TestReport, base: Pick<ReportDoc, "branding" | "generatedAt" | "generatedBy">): ReportDoc {
  const gs = groupsOf(r.subject);
  const studentCols: Column[] = [
    { key: "name", label: "Student", kind: "name", width: 2.2 }, { key: "className", label: "Class", kind: "latin", nowrap: true }, { key: "status", label: "Status", kind: "text" },
    { key: "rit", label: "Estimated RIT", kind: "int" }, { key: "range", label: "Range (±SE)", kind: "latin", nowrap: true }, { key: "percentile", label: "Percentile", kind: "int" },
    ...gs.map((g) => ({ key: g.key, label: g.name, kind: "int" as const })),
    { key: "real", label: "Latest real MAP", kind: "int" }, { key: "goal", label: "Spring goal", kind: "int" }, { key: "onTrack", label: "On track", kind: "text" }, { key: "rapid", label: "Rapid answers %", kind: "pct" },
  ];
  return {
    ...base, kind: "class", locale: "en", audience: "teacher", accent: "map", title: `${r.title} — MAP Test results`, subtitle: `${SUBJECT_NAME[r.subject]} · ${r.note}`, primaryTable: "students", fileStem: `map-test_${slug(r.title)}_${r.subject.toLowerCase()}`,
    meta: [{ label: "Test", value: r.title, isolate: "auto" }, { label: "Subject", value: SUBJECT_NAME[r.subject] }, { label: "Type", value: r.kind === "AUTO" ? "Automatic (adaptive)" : "Manual (fixed)" }, { label: "Dates", value: `${r.opensAt.slice(0, 10)} → ${r.closesAt.slice(0, 10)}` }],
    sections: [
      { type: "kpis", title: "Summary", items: [
        { label: "Finished", value: `${r.progress.finished} / ${r.progress.targets}`, kind: "latin", glance: true }, { label: "Average RIT", value: r.summary.avg, kind: "int", glance: true },
        { label: "Strongest area", value: r.summary.strongest ?? "—", kind: "latin", glance: true }, { label: "Weakest area", value: r.summary.weakest ?? "—", kind: "latin", glance: true },
        { label: "On track", value: r.summary.onTrack, kind: "int" }, { label: "Need support", value: r.summary.offTrack, kind: "int" }, { label: "Rapid-guess flags", value: r.progress.rapidFlags, kind: "int" },
      ] },
      { type: "bars", title: "RIT distribution", items: r.summary.distribution.map((d) => ({ label: d.band, value: d.n, isolate: "latin" as const })), max: Math.max(1, ...r.summary.distribution.map((d) => d.n)), kind: "int" },
      { type: "table", id: "students", title: "Students", sheet: "Students", empty: "No results yet.", note: r.note, columns: studentCols,
        rows: r.students.map((x): TableRow => ({ name: x.name, className: x.className, status: x.status === "DONE" ? "Finished" : x.status === "IN_PROGRESS" ? `${x.answered}/${x.total}` : "Not started", rit: x.rit, range: x.low !== null ? `${x.low}–${x.high}` : "—", percentile: x.percentile, ...Object.fromEntries(gs.map((g) => [g.key, x.areas.find((a) => a.key === g.key)?.rit ?? null])), real: x.real?.rit ?? null, goal: x.goal, onTrack: x.onTrack === null ? "—" : x.onTrack ? "Yes" : "No", rapid: x.rapidPct })) },
      { type: "table", id: "items", title: "Item analysis", sheet: "Items", empty: "—", note: "% correct of careful answers (rapid guesses are not counted) and the most chosen wrong answer.",
        columns: [{ key: "n", label: "#", kind: "int", width: 0.4 }, { key: "area", label: "Goal area", kind: "latin" }, { key: "rit", label: "Item RIT", kind: "int" }, { key: "answered", label: "Answers", kind: "int" }, { key: "pct", label: "Correct", kind: "pct" }, { key: "top", label: "Most chosen wrong", kind: "latin" }, { key: "stem", label: "Question", kind: "text", width: 3 }],
        rows: r.items.map((x): TableRow => ({ n: x.n, area: x.areaName, rit: x.rit, answered: x.answered, pct: x.pct, top: x.topWrong ? `${x.topWrong} (${x.topWrongCount})` : "—", stem: x.stem })) },
      { type: "table", id: "groups", title: "Ready-made groups (lowest goal area)", sheet: "Groups", empty: "—",
        columns: [{ key: "className", label: "Class", kind: "latin" }, { key: "area", label: "Goal area", kind: "latin" }, { key: "students", label: "Students", kind: "text", width: 3 }],
        rows: r.groups.map((g): TableRow => ({ className: g.className, area: g.name, students: g.students.map((x) => `${x.name} (${x.rit})`).join(", ") })) },
      { type: "notes", title: "About this estimate", items: [r.note, r.accuracy.pairs ? `Compared with the real MAP: ${r.accuracy.pairs} students, average difference ${r.accuracy.meanAbs} RIT, ${r.accuracy.within5}% within 5 RIT.` : "After the real MAP scores are imported, the predicted and real scores are compared here."] },
    ],
  };
}

export async function exportMapTest(deps: ReportDeps, actor: Actor, req: { id: string; subject?: Subject | null; format: "pdf" | "xlsx" }): Promise<{ bytes: Uint8Array; contentType: string; filename: string }> {
  const { repo } = deps;
  const now = deps.now?.() ?? new Date();
  assertCan(actor, "reports:export");
  const rl = await consumeRateLimit(repo, `report:${actor.userId}`, REPORT_RATE.max, REPORT_RATE.windowMs, now);
  if (!rl.allowed) throw new RateLimitedError(Math.ceil(rl.retryAfterMs / 1000));
  const r = await testReport(repo, actor, req.id, req.subject ?? null, now);
  const { warning: _w, ...branding } = await loadBranding(repo, String(actor.schoolId), deps.brandingDir);
  const me = await repo.findUnique("User", { id: actor.userId });
  const doc = mapTestDoc(r, { branding, generatedAt: now, generatedBy: String(me?.displayName ?? "") });
  let bytes: Uint8Array;
  if (req.format === "pdf") {
    if (!deps.pdf) throw new Error("PDF rendering is not configured.");
    const fonts = loadFonts(deps.fontDir);
    bytes = await deps.pdf.render(renderHtml(doc, { fontCss: fonts.css, fontStack: fonts.stack }), doc, fonts.stack);
  } else bytes = renderXlsx(doc);
  await audit(repo, { actorId: actor.userId, action: "report.export", entityType: "MapSimWindow", entityId: req.id, after: { kind: "map-test", format: req.format, bytes: bytes.length }, at: now });
  return { bytes, contentType: CONTENT_TYPES[req.format], filename: `${doc.fileStem}.${req.format}` };
}

export const _test = { DAY };
