/**
 * ✍️ Respond to Reading: each Text Set's Respond to Reading has three level pages, Below → On → Above,
 * each holding that level's version of the writing activity (prompt, steps, word bank, sentence starters,
 * checklist and an optional hidden hint).
 *
 *   respondPage        → staff: the Text Set, its three levels and their activities
 *   studentRespond     → a student: the activity at THEIR Respond to Reading level (category level, else
 *                        their working level, else On), for a Text Set of their own grade
 *   saveActivity       → admin: write or edit one level's activity
 *   importActivities   → admin: many activities from an Excel/CSV file (one row per level)
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { audit } from "../audit";
import { startLevel } from "./leveled-run";

export const RESPOND_LEVELS = ["BELOW", "ON", "ABOVE"] as const;
export type RespondLevel = (typeof RESPOND_LEVELS)[number];
export const RESPOND_LEVEL_NAME: Record<RespondLevel, string> = { BELOW: "Below Level", ON: "On Level", ABOVE: "Above Level" };

const s = (v: unknown) => String(v ?? "").trim();
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean) : []);

export interface RespondActivityView { code: string; level: RespondLevel; title: string; prompt: string; instructions: string[]; wordBank: string[]; sentenceStarters: string[]; checklist: string[]; hint: string | null; updatedAt: string | null; /** staff only (removed for students) */ modelAnswer?: string | null }
export interface RespondPage {
  grade: number; setCode: string; heading: string; sharedRead: string | null; genre: string | null; unit: string;
  levels: { level: RespondLevel; code: string; activity: RespondActivityView | null }[];
}
export interface ActivityInput { title: string; prompt: string; instructions: string[]; wordBank: string[]; sentenceStarters: string[]; checklist: string[]; hint?: string | null; modelAnswer?: string | null }

/** "G4.U1.TS1.RTR" (or a level code under it) → the Text Set's RTR code. */
export function rtrSetCode(code: string): string {
  const c = s(code).toUpperCase();
  const m = c.match(/^(G\d+\.U\d+\.(?:TS|SEL)\d+\.RTR)(?:\.(BELOW|ON|ABOVE))?$/);
  if (!m) throw new ValidationError(`“${code}” is not a Respond to Reading place (e.g. G4.U1.TS1.RTR).`);
  return m[1];
}

function view(r: Row, level: RespondLevel): RespondActivityView {
  return {
    code: s(r.code), level, title: s(r.title), prompt: s(r.prompt), instructions: list(r.instructions), wordBank: list(r.wordBank),
    sentenceStarters: list(r.sentenceStarters), checklist: list(r.checklist), hint: s(r.hint) || null, modelAnswer: s(r.modelAnswer) || null,
    updatedAt: r.updatedAt ? new Date(s(r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt)).toISOString() : null,
  };
}

async function setNode(repo: Repo, schoolId: string, setCode: string): Promise<{ grade: Row; node: Row; parent: Row | null; unit: Row | null }> {
  const level = Number(setCode.match(/^G(\d+)\./)?.[1]);
  const grade = (await repo.findMany("Grade", { schoolId, level }))[0];
  if (!grade) throw new ValidationError(`Grade ${level} is not set up for this school.`);
  const node = (await repo.findMany("CurriculumMapNode", { gradeId: grade.id, code: setCode }))[0];
  if (!node) throw new ValidationError(`${setCode} is not on the Curriculum Map.`);
  const parent = node.parentId ? await repo.findUnique("CurriculumMapNode", { id: node.parentId }) : null;
  const unit = parent?.parentId ? await repo.findUnique("CurriculumMapNode", { id: parent.parentId }) : null;
  return { grade, node, parent, unit };
}

async function activitiesOf(repo: Repo, schoolId: string, setCode: string): Promise<Map<string, Row>> {
  const codes = RESPOND_LEVELS.map((l) => `${setCode}.${l}`);
  return new Map((await repo.findMany("RespondActivity", { schoolId, code: { in: codes } })).map((r) => [s(r.code), r]));
}

/** Staff: the Text Set and its three Respond to Reading level pages (Below → On → Above). */
export async function respondPage(repo: Repo, actor: Actor, code: string): Promise<RespondPage> {
  assertCan(actor, "curriculum:read");
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError("Only staff can open this page.");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  const setCode = rtrSetCode(code);
  const { grade, parent, unit } = await setNode(repo, actor.schoolId, setCode);
  const acts = await activitiesOf(repo, actor.schoolId, setCode);
  return {
    grade: Number(grade.level), setCode, heading: s(parent?.heading ?? parent?.title), sharedRead: parent?.sharedRead ? s(parent.sharedRead) : null,
    genre: parent?.genre ? s(parent.genre) : null, unit: s(unit?.title),
    levels: RESPOND_LEVELS.map((l) => { const r = acts.get(`${setCode}.${l}`); return { level: l, code: `${setCode}.${l}`, activity: r ? view(r, l) : null }; }),
  };
}

/** The RTR codes of the school that have an activity (for the Curriculum Map badges). */
export async function respondCodes(repo: Repo, schoolId: string): Promise<Set<string>> {
  return new Set((await repo.findMany("RespondActivity", { schoolId }, { select: ["code"] })).map((r) => s(r.code)));
}

const clean = (v: string[] | undefined, max: number, name: string) => {
  const out = (v ?? []).map((x) => s(x).replace(/\s+/g, " ")).filter(Boolean);
  if (out.length > max) throw new ValidationError(`${name}: at most ${max} lines.`);
  for (const x of out) if (x.length > 500) throw new ValidationError(`${name}: each line must be 500 characters or fewer.`);
  return out;
};

/** Admin: write or replace one level's activity (code G4.U1.TS1.RTR.BELOW). */
export async function saveActivity(repo: Repo, actor: Actor, code: string, input: ActivityInput, now = new Date()): Promise<void> {
  assertCan(actor, "questions:publish");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  const c = s(code).toUpperCase();
  const m = c.match(/^(G\d+\.U\d+\.(?:TS|SEL)\d+\.RTR)\.(BELOW|ON|ABOVE)$/);
  if (!m) throw new ValidationError(`“${code}” is not a Respond to Reading level (e.g. G4.U1.TS1.RTR.BELOW).`);
  await setNode(repo, actor.schoolId, m[1]);
  const title = s(input.title).slice(0, 255), prompt = s(input.prompt);
  if (!title) throw new ValidationError("Write a title.");
  if (!prompt) throw new ValidationError("Write the prompt (the question students answer).");
  if (prompt.length > 3000) throw new ValidationError("The prompt must be 3,000 characters or fewer.");
  const data = {
    title, prompt, instructions: clean(input.instructions, 12, "Instructions"), wordBank: clean(input.wordBank, 30, "Word bank"),
    sentenceStarters: clean(input.sentenceStarters, 12, "Sentence starters"), checklist: clean(input.checklist, 12, "Checklist"),
    hint: s(input.hint).slice(0, 2000) || null, ...(input.modelAnswer !== undefined ? { modelAnswer: s(input.modelAnswer).slice(0, 5000) || null } : {}), updatedById: actor.userId, updatedAt: now,
  };
  const before = (await repo.findMany("RespondActivity", { schoolId: actor.schoolId, code: c }))[0];
  await repo.upsert("RespondActivity", { schoolId: actor.schoolId, code: c }, { ...data, createdAt: now }, data);
  await audit(repo, { actorId: actor.userId, action: before ? "respond.update" : "respond.create", entityType: "RespondActivity", entityId: c, after: { title }, at: now });
}

/** Splits a cell into lines: new lines, or " | " between items. */
export const cellLines = (v: string) => s(v).split(/\r?\n|\s\|\s/).map((x) => x.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").trim()).filter(Boolean);

export const RESPOND_HEADERS = ["Curriculum Map ID", "Title", "Prompt", "Instructions", "Word Bank", "Sentence Starters", "Checklist", "Hint", "Model Answer"] as const;

/** Admin: one activity per row (Curriculum Map ID = the level, e.g. G4.U1.TS1.RTR.BELOW). Rows with problems are reported, the rest saved. */
export async function importActivities(repo: Repo, actor: Actor, table: string[][], now = new Date()): Promise<{ saved: number; errors: { row: number; message: string }[] }> {
  assertCan(actor, "questions:publish");
  const at = table.findIndex((r) => r.some((c) => s(c).toLowerCase() === "curriculum map id"));
  if (at < 0) throw new ValidationError(`The file needs the columns: ${RESPOND_HEADERS.join(", ")}.`);
  const head = table[at].map((h) => s(h).toLowerCase());
  const col = (h: string) => head.indexOf(h.toLowerCase());
  for (const h of ["Curriculum Map ID", "Title", "Prompt"]) if (col(h) < 0) throw new ValidationError(`The file is missing the column “${h}”.`);
  const get = (r: string[], h: string) => (col(h) >= 0 ? s(r[col(h)]) : "");
  const out = { saved: 0, errors: [] as { row: number; message: string }[] };
  for (let i = at + 1; i < table.length; i++) {
    const r = table[i];
    if (!r.some((c) => s(c))) continue;
    if (!get(r, "Title") && !get(r, "Prompt")) continue;   // a template row not filled in yet
    try {
      await saveActivity(repo, actor, get(r, "Curriculum Map ID"), {
        title: get(r, "Title"), prompt: get(r, "Prompt"), instructions: cellLines(get(r, "Instructions")), wordBank: cellLines(get(r, "Word Bank")),
        sentenceStarters: cellLines(get(r, "Sentence Starters")), checklist: cellLines(get(r, "Checklist")), hint: get(r, "Hint") || null,
        ...(col("Model Answer") >= 0 ? { modelAnswer: get(r, "Model Answer") || null } : {}),
      }, now);
      out.saved++;
    } catch (e) {
      if (!(e instanceof ValidationError)) throw e;
      out.errors.push({ row: i + 1, message: e.message });
    }
  }
  return out;
}

/** Admin overview: every Text Set with Respond to Reading, and which levels have an activity. */
export type RespondOverview = { grade: number; units: { unit: string; sets: { setCode: string; heading: string; sharedRead: string | null; levels: Record<RespondLevel, boolean> }[] }[] }[];
export async function respondOverview(repo: Repo, actor: Actor): Promise<RespondOverview> {
  assertCan(actor, "curriculum:read");
  if (!actor.schoolId) throw new ForbiddenError("Choose a school first.");
  return overviewFor(repo, actor.schoolId);
}

async function overviewFor(repo: Repo, schoolId: string, onlyGrade?: number): Promise<RespondOverview> {
  const have = await respondCodes(repo, schoolId);
  const grades = (await repo.findMany("Grade", { schoolId })).filter((g) => !onlyGrade || Number(g.level) === onlyGrade).sort((a, b) => Number(a.level) - Number(b.level));
  const out = [];
  for (const g of grades) {
    const nodes = await repo.findMany("CurriculumMapNode", { gradeId: g.id });
    const byId = new Map(nodes.map((n) => [s(n.id), n]));
    const rtr = nodes.filter((n) => n.kind === "CATEGORY" && n.categoryType === "RESPOND_TO_READING");
    if (!rtr.length) continue;
    const units = new Map<string, { unit: string; order: number; sets: { setCode: string; heading: string; sharedRead: string | null; order: number; levels: Record<RespondLevel, boolean> }[] }>();
    for (const c of rtr) {
      const set = byId.get(s(c.parentId)), unit = set ? byId.get(s(set.parentId)) : undefined;
      const key = s(unit?.code);
      if (!units.has(key)) units.set(key, { unit: s(unit?.title), order: Number(unit?.sortOrder ?? 0), sets: [] });
      units.get(key)!.sets.push({ setCode: s(c.code), heading: s(set?.heading ?? set?.title), sharedRead: set?.sharedRead ? s(set.sharedRead) : null, order: Number(set?.sortOrder ?? 0), levels: { BELOW: have.has(`${s(c.code)}.BELOW`), ON: have.has(`${s(c.code)}.ON`), ABOVE: have.has(`${s(c.code)}.ABOVE`) } });
    }
    out.push({ grade: Number(g.level), units: [...units.values()].sort((a, b) => a.order - b.order).map((u) => ({ unit: u.unit, sets: u.sets.sort((a, b) => a.order - b.order).map(({ order: _o, ...x }) => x) })) });
  }
  return out;
}

// ------------------------------------------------------------------ students

async function ownStudent(repo: Repo, actor: Actor): Promise<{ studentId: string; grade: number }> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students open this page.");
  const st = await repo.findUnique("Student", { id: actor.studentId });
  const g = st?.gradeId ? await repo.findUnique("Grade", { id: st.gradeId }) : null;
  return { studentId: actor.studentId, grade: Number(g?.level ?? 0) };
}

/** The level a student writes at: their Respond to Reading level (Support → Below, Challenge → Above). */
export async function studentRespondLevel(repo: Repo, studentId: string): Promise<RespondLevel> {
  const lv = String((await startLevel(repo, studentId, "ON", "RTR")).level);
  return lv === "BELOW" || lv === "SUPPORT" ? "BELOW" : lv === "ABOVE" || lv === "CHALLENGE" ? "ABOVE" : "ON";
}

/** A student: the Text Sets of their grade that have Respond to Reading activities, at their level. */
export async function studentRespondList(repo: Repo, actor: Actor): Promise<{ level: RespondLevel; units: { unit: string; sets: { setCode: string; heading: string; sharedRead: string | null }[] }[] }> {
  const me = await ownStudent(repo, actor);
  const level = await studentRespondLevel(repo, me.studentId);
  const g = (await overviewFor(repo, actor.schoolId!, me.grade))[0];
  return { level, units: (g?.units ?? []).map((u) => ({ unit: u.unit, sets: u.sets.filter((x) => x.levels[level] || x.levels.ON).map(({ setCode, heading, sharedRead }) => ({ setCode, heading, sharedRead })) })).filter((u) => u.sets.length) };
}

/** A student: one Text Set's activity at their level (On when their level has none yet). */
export async function studentRespond(repo: Repo, actor: Actor, code: string): Promise<{ page: Omit<RespondPage, "levels">; activity: RespondActivityView | null; level: RespondLevel }> {
  const me = await ownStudent(repo, actor);
  const setCode = rtrSetCode(code);
  if (Number(setCode.match(/^G(\d+)\./)?.[1]) !== me.grade) throw new ForbiddenError("This activity is for another grade.");
  const { grade, parent, unit } = await setNode(repo, actor.schoolId!, setCode);
  const assigned = (await repo.findMany("RespondAssignmentStudent", { studentId: me.studentId }));
  const live = assigned.length ? (await repo.findMany("RespondAssignment", { id: { in: assigned.map((a) => a.assignmentId) }, setCode })).filter((a) => !a.deletedAt) : [];
  const task = assigned.find((a) => live.some((l) => l.id === a.assignmentId));
  // the level the teacher sent wins; otherwise the student's own level
  const level = task ? (String(task.level) as RespondLevel) : await studentRespondLevel(repo, me.studentId);
  const acts = await activitiesOf(repo, actor.schoolId!, setCode);
  const r = acts.get(`${setCode}.${level}`) ?? acts.get(`${setCode}.ON`);
  const page = { grade: Number(grade.level), setCode, heading: s(parent?.heading ?? parent?.title), sharedRead: parent?.sharedRead ? s(parent.sharedRead) : null, genre: parent?.genre ? s(parent.genre) : null, unit: s(unit?.title) };
  // the model answer is for teachers only
  return { page, activity: r ? { ...view(r, (s(r.code).split(".").pop() as RespondLevel)), modelAnswer: null } : null, level };
}
