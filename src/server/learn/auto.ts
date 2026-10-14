/**
 * 📘 Learn lessons sent AUTOMATICALLY — only for clear, strong problems on one skill (the rules and their thresholds:
 * ./auto-rules.ts). Runs inside the existing 3-hourly alert scan (src/server/insights/alerts.ts → scanAlerts), so pages
 * pay nothing: the school is read 50 students at a time with a fixed number of queries per round.
 *
 * What is sent is an ordinary assignment (LearnAssign + LearnAssignee, level chosen as usual when the student opens it):
 * the student sees it in Learn and My Work like any assigned lesson — no level word, no "you are weak". Each send is
 * kept in LearnAuto (reason + evidence numbers) for the teacher's "Sent automatically" panel at the top of Learn:
 * Keep / Undo (removes it from the student before they start; never sent again) / Change lesson or level. The teachers
 * of the classes concerned get ONE bell notice per scan. Switches: the admin's school switch (on by default) and each
 * class's switch (teachers), both in SchoolSetting. New table read through safeIfBehind.
 */
import type { Repo, Row } from "../seeding/repo";
import { ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { safeIfBehind } from "../db/schema-errors";
import { readableClasses } from "../teacher/coordinators";
import { studentNames } from "../insights/student-data";
import { isHiddenSkill } from "../skills/master";
import { audit } from "../audit";
import { lessonCatalog, lessonFile } from "./files";
import { hiddenCodes, isAdmin, staffSchool } from "./edits";
import { learnSkills, lessonsForSkill, type LearnSkill, type MatchRule } from "./match";
import { assignLearn } from "./teacher";
import {
  AUTO_PANEL_DAYS, AUTO_PER_STUDENT, AUTO_REPEAT_DAYS, AUTO_SCAN_MAX, AUTO_STUDENT_DAYS, AUTO_WINDOW_DAYS,
  detectProblems, reasonParts, reasonText, skillStats, type Answer, type AutoTrigger, type Evidence,
} from "./auto-rules";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => (v instanceof Date ? v.getTime() : v === null || v === undefined || v === "" ? NaN : new Date(s(v)).getTime());
const json = (v: unknown): Record<string, unknown> => { if (!v) return {}; if (typeof v === "string") { try { return JSON.parse(v) as Record<string, unknown>; } catch { return {}; } } return v as Record<string, unknown>; };
const DAY = 86_400_000;
/** Students per round of the scan. */
const CHUNK = 50;
/** Only strong lesson ↔ skill links are used for an automatic lesson. */
const STRONG: MatchRule[] = ["NAME", "FAMILY", "STANDARD"];
/** SchoolSetting keys of the switches. */
export const AUTO_SCHOOL_KEY = "learn.auto";
export const autoClassKey = (classId: string) => `learn.auto.class:${classId}`;
/** LearnAssign.createdById of an automatic send (no person). */
export const AUTO_BY = "auto";
/** A teacher's decision that means "not this lesson for this student" (never sent again). */
const DISMISSED = new Set(["UNDONE", "CHANGED"]);

// ------------------------------------------------------------------ switches

const isOn = (row: Row | undefined) => json(row?.value).on !== false; // no row = on (the default)

/** The school's switch and the classes switched off. */
export async function autoSwitches(repo: Repo, schoolId: string, classIds: readonly string[]): Promise<{ school: boolean; off: Set<string> }> {
  const keys = [AUTO_SCHOOL_KEY, ...classIds.map(autoClassKey)];
  const rows = await repo.findMany("SchoolSetting", { schoolId, key: { in: keys } }, { select: ["key", "value"] });
  const by = new Map(rows.map((r) => [s(r.key), r]));
  return { school: isOn(by.get(AUTO_SCHOOL_KEY)), off: new Set(classIds.filter((id) => !isOn(by.get(autoClassKey(id))))) };
}

/** The admin turns automatic lessons on / off for the school (classId null); a teacher for one of their classes. */
export async function setAutoSwitch(repo: Repo, actor: Actor, classId: string | null, on: boolean, now = new Date()): Promise<void> {
  const schoolId = staffSchool(actor);
  if (!classId) { if (!isAdmin(actor)) throw new ForbiddenError("Only the admin can do this."); }
  else if (!(await readableClasses(repo, actor)).some((c) => s(c.id) === classId)) throw new ForbiddenError("Not your class.");
  const key = classId ? autoClassKey(classId) : AUTO_SCHOOL_KEY;
  await repo.upsert("SchoolSetting", { schoolId, key }, { schoolId, key, value: { on }, updatedBy: actor.userId, updatedAt: now }, { value: { on }, updatedBy: actor.userId, updatedAt: now });
  await audit(repo, { actorId: actor.userId, action: "learn.auto.switch", entityType: classId ? "Class" : "School", entityId: classId ?? schoolId, after: { on }, at: now });
}

// ------------------------------------------------------------------ the scan

interface Send { studentId: string; classId: string; skill: LearnSkill; code: string; title: string; trigger: AutoTrigger; evidence: Evidence }

/**
 * Sends the automatic lessons of a school (called by scanAlerts, at most every 3 hours). `urgent` = the students the
 * same scan found Urgent in the Early warning. Returns how many lessons were sent.
 */
export async function autoLearnScan(repo: Repo, schoolId: string, now: Date, urgent: ReadonlySet<string> = new Set()): Promise<number> {
  const classes = await repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id"] });
  if (!classes.length) return 0;
  const sw = await autoSwitches(repo, schoolId, classes.map((c) => s(c.id)));
  if (!sw.school) return 0;
  const active = classes.map((c) => s(c.id)).filter((id) => !sw.off.has(id));
  if (!active.length) return 0;
  const hidden = await safeIfBehind("learn.hidden", () => hiddenCodes(repo, schoolId), new Set<string>());
  const catalog = lessonCatalog().filter((l) => l.ready && !hidden.has(l.code));
  if (!catalog.length) return 0;
  const members = await repo.findMany("ClassMembership", { classId: { in: active }, leftAt: null }, { select: ["studentId", "classId"] });
  const classOf = new Map(members.map((m) => [s(m.studentId), s(m.classId)]));
  const ids = [...classOf.keys()];
  if (!ids.length) return 0;
  const skills = await learnSkills(repo, schoolId);
  const skillById = new Map(skills.filter((k) => !isHiddenSkill(k.code)).map((k) => [k.id, k]));
  const lessonOf = new Map<string, string | null>();
  const lessonFor = (k: LearnSkill) => {
    if (!lessonOf.has(k.id)) { const m = lessonsForSkill({ name: k.name, family: k.family, standards: k.standards }, catalog); lessonOf.set(k.id, m && STRONG.includes(m.rule) ? m.codes[0] : null); }
    return lessonOf.get(k.id)!;
  };
  const sends: Send[] = [];
  const t = now.getTime();
  for (let i = 0; i < ids.length && sends.length < AUTO_SCAN_MAX; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const rows = await repo.findMany("QuestionAttempt", { studentId: { in: chunk }, rapidGuess: false, createdAt: { gte: new Date(t - AUTO_WINDOW_DAYS * DAY) } }, { select: ["studentId", "skillId", "isCorrect", "createdAt"] });
    const answers = new Map<string, Answer[]>();
    for (const r of rows) { if (!r.skillId) continue; const id = s(r.studentId); (answers.get(id) ?? answers.set(id, []).get(id)!).push({ skillId: s(r.skillId), correct: Boolean(r.isCorrect), at: time(r.createdAt) }); }
    const found = new Map<string, ReturnType<typeof detectProblems>>();
    for (const id of chunk) {
      const c = detectProblems(skillStats(answers.get(id) ?? [], t), urgent.has(id)).filter((x) => skillById.has(x.skillId) && lessonFor(skillById.get(x.skillId)!));
      if (c.length) found.set(id, c);
    }
    if (!found.size) continue;
    const who = [...found.keys()];
    // the guards: the student's automatic lessons (week cap, dismissed), assigned and worked-on lessons (14 days)
    const [autos, assigned, progress] = await Promise.all([
      repo.findMany("LearnAuto", { studentId: { in: who } }, { select: ["studentId", "ref", "status", "createdAt"], take: 5000 }),
      repo.findMany("LearnAssignee", { studentId: { in: who }, kind: "LESSON" }, { select: ["studentId", "ref", "status", "createdAt"], take: 5000 }),
      repo.findMany("LearnProgress", { studentId: { in: who }, kind: "LESSON" }, { select: ["studentId", "ref", "openedAt", "updatedAt"], take: 5000 }),
    ]);
    for (const id of who) {
      const mine = autos.filter((a) => s(a.studentId) === id);
      if (mine.filter((a) => time(a.createdAt) > t - AUTO_STUDENT_DAYS * DAY).length >= AUTO_PER_STUDENT) continue;
      const dismissed = new Set(mine.filter((a) => DISMISSED.has(s(a.status))).map((a) => s(a.ref)));
      const recent = new Set([
        ...assigned.filter((a) => s(a.studentId) === id && (s(a.status) !== "DONE" || time(a.createdAt) > t - AUTO_REPEAT_DAYS * DAY)).map((a) => s(a.ref)),
        ...progress.filter((p) => s(p.studentId) === id && Math.max(time(p.openedAt) || 0, time(p.updatedAt) || 0) > t - AUTO_REPEAT_DAYS * DAY).map((p) => s(p.ref)),
      ]);
      for (const c of found.get(id)!) {
        const k = skillById.get(c.skillId)!, code = lessonFor(k)!;
        if (dismissed.has(code) || recent.has(code)) continue;
        sends.push({ studentId: id, classId: classOf.get(id)!, skill: k, code, title: lessonFile(code)?.title ?? code, trigger: c.trigger, evidence: c.evidence });
        break;
      }
    }
  }
  if (!sends.length) return 0;
  const list = sends.slice(0, AUTO_SCAN_MAX);
  // one assignment per class and lesson; the student rows; the LearnAuto rows
  const groups = new Map<string, Send[]>();
  for (const x of list) { const g = `${x.classId}|${x.code}`; (groups.get(g) ?? groups.set(g, []).get(g)!).push(x); }
  const autoRows: Row[] = [];
  for (const g of groups.values()) {
    const a = await repo.create("LearnAssign", { schoolId, kind: "LESSON", ref: g[0].code, title: g[0].title.slice(0, 191), classId: g[0].classId, target: "STUDENTS", groupLevel: null, level: null, dueAt: null, createdById: AUTO_BY, createdAt: now });
    await repo.createMany("LearnAssignee", g.map((x) => ({ assignId: s(a.id), schoolId, studentId: x.studentId, kind: "LESSON", ref: x.code, title: x.title.slice(0, 191), level: null, dueAt: null, status: "NOT_STARTED", createdAt: now, updatedAt: now })));
    for (const x of g) autoRows.push({ schoolId, studentId: x.studentId, classId: x.classId, skillId: x.skill.id, skillName: x.skill.name.slice(0, 191), ref: x.code, title: x.title.slice(0, 191), trigger: x.trigger, reason: reasonText(x.evidence, x.skill.name), evidence: x.evidence, assignId: s(a.id), status: "SENT", scanAt: now, createdAt: now });
  }
  await repo.createMany("LearnAuto", autoRows);
  await audit(repo, { actorId: null, action: "learn.auto.sent", entityType: "School", entityId: schoolId, after: { lessons: list.length, assignments: groups.size }, at: now });
  // ONE bell notice per teacher for this scan
  const classIds = [...new Set(list.map((x) => x.classId))];
  const ct = await repo.findMany("ClassTeacher", { classId: { in: classIds } }, { select: ["classId", "teacherId"] });
  const teachers = ct.length ? await repo.findMany("Teacher", { id: { in: [...new Set(ct.map((c) => s(c.teacherId)))] } }, { select: ["id", "userId"] }) : [];
  const userOf = new Map(teachers.map((x) => [s(x.id), s(x.userId)]));
  const perUser = new Map<string, Set<string>>();
  for (const x of list) for (const c of ct) if (s(c.classId) === x.classId) { const u = userOf.get(s(c.teacherId)); if (u) (perUser.get(u) ?? perUser.set(u, new Set()).get(u)!).add(x.studentId); }
  if (perUser.size) await repo.createMany("Notification", [...perUser].map(([userId, st]) => ({
    userId, type: "NEW_ASSIGNMENT", title: `📘 Lessons sent automatically to ${st.size} student${st.size === 1 ? "" : "s"}`,
    body: "A clear problem on one skill: the platform sent a short Learn lesson. Keep it, undo it or change it in Learn.", link: "/teacher/learn", createdAt: now,
  })));
  return list.length;
}

// ------------------------------------------------------------------ the teacher's panel

export interface AutoStudent { id: string; studentId: string; name: string; trigger: AutoTrigger; skill: string; reason: { key: string; vars: Record<string, string | number> }; evidence: Evidence; status: string; started: boolean; level: number | null; note: string | null }
export interface AutoItem { assignId: string; ref: string; title: string; classId: string; className: string; createdAt: string; students: AutoStudent[]; open: number }
export interface AutoPanel { items: AutoItem[]; school: boolean; admin: boolean; classes: { id: string; name: string; on: boolean }[]; lessons: { code: string; title: string }[] }

/** The "Sent automatically" panel: the last AUTO_PANEL_DAYS days of my classes (admin: the school), and the switches. */
export async function autoPanel(repo: Repo, actor: Actor, now = new Date()): Promise<AutoPanel> {
  const schoolId = staffSchool(actor);
  const admin = isAdmin(actor);
  const classes = await readableClasses(repo, actor);
  const sw = await autoSwitches(repo, schoolId, classes.map((c) => s(c.id)));
  const allowed = new Set(classes.map((c) => s(c.id)));
  const rows = (await safeIfBehind("learn.auto", () => repo.findMany("LearnAuto", { schoolId, createdAt: { gte: new Date(now.getTime() - AUTO_PANEL_DAYS * DAY) } }, { orderBy: [{ field: "createdAt", dir: "desc" }], take: 300 }), [] as Row[]))
    .filter((r) => admin || allowed.has(s(r.classId)));
  const base = { school: sw.school, admin, classes: classes.map((c) => ({ id: s(c.id), name: s(c.name), on: !sw.off.has(s(c.id)) })), lessons: [] as AutoPanel["lessons"] };
  if (!rows.length) return { items: [], ...base };
  const [names, asg, cls] = await Promise.all([
    studentNames(repo, [...new Set(rows.map((r) => s(r.studentId)))]),
    repo.findMany("LearnAssignee", { assignId: { in: [...new Set(rows.map((r) => s(r.assignId)))] } }, { select: ["assignId", "studentId", "status", "level"] }),
    admin ? repo.findMany("Class", { schoolId }, { select: ["id", "name"] }) : Promise.resolve(classes),
  ]);
  const items = new Map<string, AutoItem>();
  for (const r of rows) {
    const k = s(r.assignId);
    let it = items.get(k);
    if (!it) items.set(k, (it = { assignId: k, ref: s(r.ref), title: s(r.title), classId: s(r.classId), className: s(cls.find((c) => s(c.id) === s(r.classId))?.name), createdAt: new Date(time(r.createdAt)).toISOString(), students: [], open: 0 }));
    const a = asg.find((x) => s(x.assignId) === k && s(x.studentId) === s(r.studentId));
    const ev = json(r.evidence) as unknown as Evidence;
    const st: AutoStudent = { id: s(r.id), studentId: s(r.studentId), name: names.get(s(r.studentId))?.name ?? "Student", trigger: s(r.trigger) as AutoTrigger, skill: s(r.skillName), reason: reasonParts(ev, s(r.skillName)), evidence: ev, status: s(r.status), started: Boolean(a) && s(a!.status) !== "NOT_STARTED", level: a?.level === null || a?.level === undefined ? null : Number(a.level), note: r.note ? s(r.note) : null };
    it.students.push(st);
    if (st.status === "SENT") it.open++;
  }
  const lessons = lessonCatalog().filter((l) => l.ready).map((l) => ({ code: l.code, title: l.title }));
  return { items: [...items.values()].sort((a, b) => Number(b.open > 0) - Number(a.open > 0) || b.createdAt.localeCompare(a.createdAt)), ...base, lessons };
}

/** The automatic sends `ids` this person may decide on (their classes; admin: the school). */
async function mineOf(repo: Repo, actor: Actor, ids: readonly string[]): Promise<Row[]> {
  const schoolId = staffSchool(actor);
  const want = [...new Set(ids.map(s).filter(Boolean))].slice(0, 200);
  if (!want.length) throw new ValidationError("Choose a student.");
  const rows = await repo.findMany("LearnAuto", { id: { in: want }, schoolId });
  if (!rows.length) throw new ValidationError("Not found.");
  if (!isAdmin(actor)) {
    const allowed = new Set((await readableClasses(repo, actor)).map((c) => s(c.id)));
    if (rows.some((r) => !allowed.has(s(r.classId)))) throw new ForbiddenError("Not your student.");
  }
  return rows;
}

/** Has the student started the lesson of this send? (its assignment is not "not started", or worked on since it was sent) */
async function startedSet(repo: Repo, rows: Row[]): Promise<Set<string>> {
  const [asg, prog] = await Promise.all([
    repo.findMany("LearnAssignee", { assignId: { in: [...new Set(rows.map((r) => s(r.assignId)))] }, studentId: { in: [...new Set(rows.map((r) => s(r.studentId)))] } }, { select: ["assignId", "studentId", "status"] }),
    repo.findMany("LearnProgress", { studentId: { in: [...new Set(rows.map((r) => s(r.studentId)))] }, kind: "LESSON", ref: { in: [...new Set(rows.map((r) => s(r.ref)))] } }, { select: ["studentId", "ref", "openedAt", "updatedAt"] }),
  ]);
  const out = new Set<string>();
  for (const r of rows) {
    const a = asg.find((x) => s(x.assignId) === s(r.assignId) && s(x.studentId) === s(r.studentId));
    if ((a && s(a.status) !== "NOT_STARTED") || prog.some((p) => s(p.studentId) === s(r.studentId) && s(p.ref) === s(r.ref) && Math.max(time(p.openedAt) || 0, time(p.updatedAt) || 0) >= time(r.createdAt))) out.add(s(r.id));
  }
  return out;
}

/** ✔ Keep: the teacher agrees (the lesson stays). */
export async function keepAuto(repo: Repo, actor: Actor, ids: readonly string[], now = new Date()): Promise<number> {
  const rows = (await mineOf(repo, actor, ids)).filter((r) => s(r.status) === "SENT");
  if (rows.length) await repo.updateMany("LearnAuto", { id: { in: rows.map((r) => s(r.id)) } }, { status: "KEPT", decidedById: actor.userId, decidedAt: now });
  return rows.length;
}

/** ↩ Undo: removes the lesson from each student who has not started it (it is never sent to them again). */
export async function undoAuto(repo: Repo, actor: Actor, ids: readonly string[], now = new Date()): Promise<{ undone: number; started: number }> {
  const rows = (await mineOf(repo, actor, ids)).filter((r) => !DISMISSED.has(s(r.status)));
  const started = await startedSet(repo, rows);
  const go = rows.filter((r) => !started.has(s(r.id)));
  for (const r of go) await repo.deleteMany("LearnAssignee", { assignId: s(r.assignId), studentId: s(r.studentId), status: "NOT_STARTED" });
  if (go.length) {
    await repo.updateMany("LearnAuto", { id: { in: go.map((r) => s(r.id)) } }, { status: "UNDONE", decidedById: actor.userId, decidedAt: now, note: "Undone by the teacher before the student started." });
    await closeEmptyAssigns(repo, go, now);
    await audit(repo, { actorId: actor.userId, action: "learn.auto.undo", entityType: "LearnAuto", entityId: s(go[0].id), after: { students: go.length }, at: now });
  }
  return { undone: go.length, started: started.size };
}

/** An automatic assignment with no student left is deleted (soft). */
async function closeEmptyAssigns(repo: Repo, rows: Row[], now: Date): Promise<void> {
  const ids = [...new Set(rows.map((r) => s(r.assignId)))];
  const left = new Set((await repo.findMany("LearnAssignee", { assignId: { in: ids } }, { select: ["assignId"] })).map((r) => s(r.assignId)));
  const empty = ids.filter((id) => !left.has(id));
  if (empty.length) await repo.updateMany("LearnAssign", { id: { in: empty } }, { deletedAt: now });
}

/**
 * ✏️ Change lesson or level (students who have not started): the same lesson → only the level changes (null =
 * automatic); another lesson → the automatic one is removed and the teacher's choice is assigned instead.
 */
export async function changeAuto(repo: Repo, actor: Actor, ids: readonly string[], ref: string, level: number | null, now = new Date()): Promise<{ changed: number; started: number }> {
  const rows = (await mineOf(repo, actor, ids)).filter((r) => !DISMISSED.has(s(r.status)));
  const lv = level && level >= 1 && level <= 4 ? Math.trunc(level) : null;
  const code = s(ref).trim() || s(rows[0]?.ref);
  if (!lessonFile(code)) throw new ValidationError("This lesson is not on the platform.");
  const started = await startedSet(repo, rows);
  const go = rows.filter((r) => !started.has(s(r.id)));
  if (!go.length) return { changed: 0, started: started.size };
  const same = go.filter((r) => s(r.ref) === code), other = go.filter((r) => s(r.ref) !== code);
  for (const r of same) await repo.updateMany("LearnAssignee", { assignId: s(r.assignId), studentId: s(r.studentId) }, { level: lv, updatedAt: now });
  if (same.length) await repo.updateMany("LearnAuto", { id: { in: same.map((r) => s(r.id)) } }, { status: "KEPT", decidedById: actor.userId, decidedAt: now, note: lv ? `Level set by the teacher: ${lv}.` : "Level: automatic." });
  if (other.length) {
    const byClass = new Map<string, Row[]>();
    for (const r of other) (byClass.get(s(r.classId)) ?? byClass.set(s(r.classId), []).get(s(r.classId))!).push(r);
    for (const [classId, list] of byClass) {
      for (const r of list) await repo.deleteMany("LearnAssignee", { assignId: s(r.assignId), studentId: s(r.studentId), status: "NOT_STARTED" });
      await assignLearn(repo, actor, { kind: "LESSON", ref: code, classId, target: "STUDENTS", studentIds: list.map((r) => s(r.studentId)), level: lv }, now);
    }
    await repo.updateMany("LearnAuto", { id: { in: other.map((r) => s(r.id)) } }, { status: "CHANGED", decidedById: actor.userId, decidedAt: now, note: `Changed by the teacher to ${code}${lv ? ` (level ${lv})` : ""}.`.slice(0, 300) });
    await closeEmptyAssigns(repo, other, now);
  }
  await audit(repo, { actorId: actor.userId, action: "learn.auto.change", entityType: "LearnAuto", entityId: s(go[0].id), after: { ref: code, level: lv, students: go.length }, at: now });
  return { changed: go.length, started: started.size };
}
