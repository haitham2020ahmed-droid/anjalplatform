/**
 * ✍️ Writing tasks and 🎙 reading-aloud tasks.
 *
 *   Writing has a genre (NARRATIVE · INFORMATIONAL · OPINION · HOW_TO · RESEARCH · FREE). Each genre has its own
 *   4-trait rubric scored 1–4 and a self-check the student ticks before submitting; FREE writing keeps the older
 *   0–4 rubric (Ideas · Organization · Language · Conventions), so older tasks and scores stay valid.
 *
 *   Staged tasks go PLAN (organizer + sentence frames) → DRAFT (submitted for feedback) → REVISE (the first
 *   draft is kept; 1–2 targeted revision steps from the feedback) → FINAL (scored).
 *
 *   Source-based tasks carry up to 3 sources and up to 3 research questions answered before writing
 *   (multiple choice scored automatically, short answers 0–2 by the teacher).
 *
 *   AI trait feedback (when the task turns it on): drafted after a submission, PENDING until the teacher edits and
 *   approves it (→ scores + comment) or dismisses it. The student never sees an unapproved draft.
 *
 *   Reteach routing: traits scored 2 or lower point to curriculum skills, assigned with the normal skill assignment;
 *   the class's most frequent convention error codes are summed up on the teacher's page.
 *
 * Reading aloud: the student records the text; the teacher listens and scores Fluency · Accuracy · Expression.
 */
import { feedWriting, safeFeed } from "../practice/skill-evidence";
import type { Repo, Row } from "../seeding/repo";
import { safeIfBehind } from "../db/schema-errors";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "./assignments";
import { assertClassRead } from "./coordinators";
import { assignSkill } from "./assign";
import { skillPickerList, type PickerSkill } from "../skills/picker";
import { classMembers, studentNames } from "../insights/student-data";
import { MISCONCEPTION_BY_CODE } from "../../insights/misconceptions";
import type { EnvLike } from "../ai/engine";
import type { anthropicProvider, geminiProvider } from "../ai/question-generator";
import {
  CHECKLISTS, FREE_RUBRIC, GENRE_LABEL, ORGANIZERS, REVISION_MOVE_BY_ID, checkChecklist, checkMoves, checkPlan, checklistRequired,
  isGenre, movesForRubric, pickMoves, rubricFor, type CheckItem, type Genre, type Organizer, type Rubric, type Trait,
} from "../writing/genres";
import {
  citesSource, cleanResearch, cleanSources, researchTotal, scoreResearch, studentView, teacherScoreResearch,
  type ResearchAnswers, type ResearchQuestion, type ResearchQuestionView, type Source,
} from "../writing/research";
import { draftAiFeedback, readDraft, type AiDraft, type AiOutcome } from "../writing/ai-feedback";
import { CODE_FAMILIES, WRITING_ERROR_CODES, reteachFor, skillsForFamilies, type ReteachRow, type ReteachSkill } from "../writing/reteach";
import { assignedIds, isAssignedTo, isLocked, lockedStatus, scoreMax, type LockedStatus } from "../writing/locked";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const iso = (v: unknown) => (v ? new Date(time(v)).toISOString() : null);
const bool = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";
const json = <T>(v: unknown): T | null => { if (v === null || v === undefined || v === "") return null; if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return null; } } return v as T; };

export type TaskKind = "WRITE" | "READ_ALOUD";
export type Stage = "PLAN" | "DRAFT" | "REVISE" | "FINAL";
export type AiStatus = "NONE" | "PENDING" | "APPROVED" | "DISMISSED";

/** The reading-aloud rubric (0–4 each). Writing uses the genre's rubric (rubricFor). */
export const READ_ALOUD_RUBRIC: Rubric = {
  min: 0, max: 4, traits: [
    { key: "fluency", name: "Fluency", what: "Reads smoothly at a good pace, not word by word.", levels: {} },
    { key: "accuracy", name: "Accuracy", what: "Reads the words correctly; corrects own mistakes.", levels: {} },
    { key: "expression", name: "Expression", what: "Pauses at punctuation; voice shows meaning.", levels: {} },
  ],
};
/** The older shape (kept for callers): WRITE = the 0–4 rubric of FREE writing. */
export const RUBRIC: Record<TaskKind, { key: string; name: string; what: string }[]> = {
  WRITE: FREE_RUBRIC.traits.map(({ key, name, what }) => ({ key, name, what })),
  READ_ALOUD: READ_ALOUD_RUBRIC.traits.map(({ key, name, what }) => ({ key, name, what })),
};
export const MAX_AUDIO = 2 * 1024 * 1024;
const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a|wav)(;.*)?$/i;
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

const genreOf = (t: Row): Genre => (s(t.kind) === "READ_ALOUD" ? "FREE" : isGenre(t.genre) ? t.genre : "FREE");
/** The rubric of a task (reading aloud, the genre's 1–4 rubric, or the older 0–4 one). */
export const taskRubric = (t: Row): Rubric => (s(t.kind) === "READ_ALOUD" ? READ_ALOUD_RUBRIC : rubricFor(genreOf(t)));
const researchOf = (t: Row): ResearchQuestion[] => json<ResearchQuestion[]>(t.research) ?? [];
const sourcesOf = (t: Row): Source[] => json<Source[]>(t.sources) ?? [];
const staged = (t: Row) => s(t.kind) === "WRITE" && bool(t.staged);

// ------------------------------------------------------------------ the teacher: create

export interface CreateTaskInput {
  classId: string; kind: TaskKind; title: string; prompt: string; passage?: string | null; minWords?: number | null; dueAt?: Date | null;
  genre?: string | null; staged?: boolean; sources?: unknown; research?: unknown; aiFeedback?: boolean; skillId?: string | null;
}

export async function createTask(repo: Repo, actor: Actor, input: CreateTaskInput, now = new Date()): Promise<string> {
  assertCan(actor, "assignments:create");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const title = s(input.title).trim(), prompt = s(input.prompt).trim();
  if (title.length < 2 || prompt.length < 5) throw new ValidationError("Write a title and the task for the students.");
  const write = input.kind !== "READ_ALOUD";
  if (!write && s(input.passage).trim().length < 20) throw new ValidationError("Paste the text the students will read aloud.");
  const g = s(input.genre || "FREE").toUpperCase();
  if (write && !isGenre(g)) throw new ValidationError("Choose a genre.");
  const genre: Genre = write ? (g as Genre) : "FREE";
  const sources = write ? cleanSources(input.sources) : [];
  const research = write ? cleanResearch(input.research) : [];
  if (genre === "RESEARCH" && !sources.length) throw new ValidationError("A research task needs at least one source for the students to read.");
  if (research.length && !sources.length && s(input.passage).trim().length < 20) throw new ValidationError("Research questions need a source (or the text) to answer them from.");
  let skillId: string | null = null;
  if (input.skillId) {
    const skill = await repo.findUnique("Skill", { id: input.skillId });
    const curs = await repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true }, { select: ["id"] });
    if (!skill || skill.deletedAt || skill.isActive === false || !curs.some((c) => c.id === skill.curriculumId)) throw new ValidationError("Choose an active skill of this class's curriculum.");
    skillId = s(skill.id);
  }
  const t = await repo.create("WritingTask", {
    schoolId: actor.schoolId!, classId: input.classId, createdById: actor.userId, kind: write ? "WRITE" : "READ_ALOUD", title: title.slice(0, 191), prompt: prompt.slice(0, 5000),
    passage: s(input.passage).trim().slice(0, 20000) || null, minWords: write && input.minWords ? Math.max(10, Math.min(1000, Math.round(input.minWords))) : null, dueAt: input.dueAt ?? null,
    genre, skillId, staged: write && Boolean(input.staged), sources: sources.length ? sources : null, research: research.length ? research : null, aiFeedback: write && Boolean(input.aiFeedback),
    createdAt: now, deletedAt: null,
  });
  const ids = await classMembers(repo, input.classId);
  const users = ids.length ? await repo.findMany("Student", { id: { in: ids } }, { select: ["userId"] }) : [];
  if (users.length) await repo.createMany("Notification", users.map((u) => ({ userId: u.userId, type: "NEW_ASSIGNMENT", title: write ? "✍️ A writing task from your teacher" : "🎙 Read aloud for your teacher", body: title.slice(0, 160), link: `/student/writing/${s(t.id)}`, createdAt: now })));
  return s(t.id);
}

/** The skills a writing task can practise: the active skills of the class's curriculum, by name. */
/**
 * The skills a writing task may practise: the one picker list for the class's grade (a task's skill is a skill of the
 * class's curriculum — that grade's copy of every shared skill), A–Z, in domain tabs (Writing among them).
 */
export async function writingSkillOptions(repo: Repo, actor: Actor, classId: string): Promise<PickerSkill[]> {
  assertCan(actor, "reports:read");
  await assertClassRead(repo, actor, classId);
  const klass = await repo.findUnique("Class", { id: classId });
  const grade = klass ? Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0) : 0;
  return grade ? skillPickerList(repo, actor, { onlyGrade: grade }) : [];
}

// ------------------------------------------------------------------ the teacher: lists and the scoring view

export interface TaskSummary { id: string; kind: TaskKind; genre: Genre; staged: boolean; locked: boolean; title: string; dueAt: string | null; createdAt: string; submitted: number; scored: number; members: number; aiPending: number }
export async function classTasks(repo: Repo, actor: Actor, classId: string): Promise<TaskSummary[]> {
  assertCan(actor, "reports:read");
  await assertClassRead(repo, actor, classId);
  const tasks = await safeIfBehind("writing.class", repo.findMany("WritingTask", { classId, deletedAt: null }), [] as Row[]);
  const subs = tasks.length ? await repo.findMany("WritingSubmission", { taskId: { in: tasks.map((t) => t.id) } }, { select: ["taskId", "status", "aiStatus"] }) : [];
  const memberIds = await classMembers(repo, classId);
  return tasks.map((t) => ({
    id: s(t.id), kind: s(t.kind) as TaskKind, genre: genreOf(t), staged: staged(t), locked: isLocked(t), title: s(t.title), dueAt: iso(t.dueAt), createdAt: iso(t.createdAt)!,
    submitted: subs.filter((x) => x.taskId === t.id && x.status !== "DRAFT").length, scored: subs.filter((x) => x.taskId === t.id && x.status === "SCORED").length, members: assignedIds(t, memberIds).length,
    aiPending: subs.filter((x) => x.taskId === t.id && x.aiStatus === "PENDING").length,
  })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface SubmissionView {
  studentId: string; name: string; status: "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "SCORED"; stage: Stage | null;
  text: string | null; words: number; hasAudio: boolean; scores: Record<string, number> | null; total: number | null; comment: string | null; submittedAt: string | null;
  plan: Record<string, string> | null; firstDraft: string | null; checklist: Record<string, true> | null;
  /** the 1–2 revision steps of the REVISE stage */
  moves: { id: string; text: string }[];
  research: ResearchAnswers | null; researchScore: { points: number; max: number; pending: number } | null;
  /** names a source (source-based tasks only) */
  citesSource: boolean | null;
  /** the AI draft (teacher view: any status; student view: only once approved) */
  aiStatus: AiStatus; ai: AiDraft | null;
}
export interface TaskView {
  id: string; kind: TaskKind; locked: boolean; classId: string; title: string; prompt: string; passage: string | null; minWords: number | null; dueAt: string | null;
  genre: Genre; genreLabel: string; staged: boolean; aiFeedback: boolean; skill: { id: string; name: string } | null;
  sources: Source[]; research: ResearchQuestion[]; rubric: Rubric; checklist: CheckItem[]; organizer: Organizer;
  subs: (SubmissionView & { reteach: ReteachRow[] })[]; canScore: boolean; moveOptions: { trait: string; id: string; text: string }[];
}

const SUB_FIELDS = ["studentId", "text", "audioType", "status", "scores", "comment", "submittedAt", "stage", "plan", "firstDraft", "checklist", "researchAnswers", "aiDraft", "aiStatus"];

function subView(t: Row, r: Row | undefined, studentId: string, name: string): SubmissionView {
  const sc = json<Record<string, number>>(r?.scores);
  const planRaw = json<Record<string, unknown>>(r?.plan);
  const moveIds = Array.isArray(planRaw?._moves) ? (planRaw!._moves as unknown[]).map(s) : [];
  const plan = planRaw ? Object.fromEntries(Object.entries(planRaw).filter(([k]) => !k.startsWith("_")).map(([k, v]) => [k, s(v)])) : null;
  const research = json<ResearchAnswers>(r?.researchAnswers);
  const qs = researchOf(t), sources = sourcesOf(t);
  const text = r?.text ? s(r.text) : null;
  return {
    studentId, name, status: (r ? s(r.status) : "NOT_STARTED") as SubmissionView["status"], stage: staged(t) ? ((r?.stage ? s(r.stage) : "PLAN") as Stage) : null,
    text, words: text ? words(text) : 0, hasAudio: Boolean(r?.audioType), scores: sc, total: sc ? Object.values(sc).reduce((a, x) => a + Number(x), 0) : null,
    comment: r?.comment ? s(r.comment) : null, submittedAt: iso(r?.submittedAt),
    plan: plan && Object.keys(plan).length ? plan : null, firstDraft: r?.firstDraft ? s(r.firstDraft) : null, checklist: json<Record<string, true>>(r?.checklist),
    moves: moveIds.filter((id) => REVISION_MOVE_BY_ID.has(id)).map((id) => ({ id, text: REVISION_MOVE_BY_ID.get(id)! })),
    research, researchScore: qs.length ? researchTotal(qs, research) : null,
    citesSource: sources.length && text ? citesSource(text, sources) : null,
    aiStatus: (r?.aiStatus ? s(r.aiStatus) : "NONE") as AiStatus, ai: readDraft(r?.aiDraft),
  };
}

async function loadTask(repo: Repo, taskId: string): Promise<Row> {
  const t = await repo.findUnique("WritingTask", { id: taskId });
  if (!t || t.deletedAt) throw new ForbiddenError("Task not found.");
  return t;
}

const ORDER = ["SUBMITTED", "SCORED", "DRAFT", "NOT_STARTED"];
export async function taskForTeacher(repo: Repo, actor: Actor, taskId: string): Promise<TaskView> {
  assertCan(actor, "reports:read");
  const t = await loadTask(repo, taskId);
  const classId = s(t.classId);
  await assertClassRead(repo, actor, classId);
  let canScore = true; try { await assertClassAccess(repo, actor, classId); } catch { canScore = false; }
  const ids = assignedIds(t, await classMembers(repo, classId));
  const [names, subs, skill] = await Promise.all([
    studentNames(repo, ids), repo.findMany("WritingSubmission", { taskId }, { select: SUB_FIELDS }), t.skillId ? repo.findUnique("Skill", { id: t.skillId }) : Promise.resolve(null),
  ]);
  const rubric = taskRubric(t), genre = genreOf(t);
  const cache = new Map<string, Promise<ReteachSkill[]>>();
  const views = await Promise.all(ids.map(async (id) => {
    const v = subView(t, subs.find((x) => x.studentId === id), id, names.get(id)?.name ?? "Student");
    const codes = v.aiStatus === "APPROVED" || v.aiStatus === "PENDING" ? (v.ai?.conventions ?? []).map((c) => c.code) : [];
    const reteach = s(t.kind) === "WRITE" ? await reteachFor(repo, classId, genre, rubric.traits, v.scores, codes, cache) : [];
    return { ...v, reteach };
  }));
  return {
    id: s(t.id), kind: s(t.kind) as TaskKind, locked: isLocked(t), classId, title: s(t.title), prompt: s(t.prompt), passage: t.passage ? s(t.passage) : null, minWords: t.minWords ? Number(t.minWords) : null, dueAt: iso(t.dueAt),
    genre, genreLabel: s(t.kind) === "READ_ALOUD" ? "Reading aloud" : GENRE_LABEL[genre], staged: staged(t), aiFeedback: bool(t.aiFeedback), skill: skill ? { id: s(skill.id), name: s(skill.name) } : null,
    sources: sourcesOf(t), research: researchOf(t), rubric, checklist: CHECKLISTS[genre], organizer: ORGANIZERS[genre],
    subs: views.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.name.localeCompare(b.name)), canScore, moveOptions: movesForRubric(rubric),
  };
}

// ------------------------------------------------------------------ the teacher: scoring, AI drafts, research answers

async function scorable(repo: Repo, actor: Actor, taskId: string, studentId: string): Promise<{ t: Row; sub: Row }> {
  assertCan(actor, "assignments:create");
  const t = await repo.findUnique("WritingTask", { id: taskId });
  if (!t) throw new ForbiddenError("Task not found.");
  await assertClassAccess(repo, actor, s(t.classId));
  if (isLocked(t)) throw new ValidationError("Grade this essay on its grading page (rubric task).");
  const sub = await repo.findUnique("WritingSubmission", { taskId, studentId });
  if (!sub || sub.status === "DRAFT") throw new ValidationError("The student has not submitted yet.");
  return { t, sub };
}

function cleanScores(rubric: Rubric, scores: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rubric.traits) {
    const v = Number(scores[r.key]);
    if (scores[r.key] === "" || scores[r.key] === undefined || !Number.isInteger(v) || v < rubric.min || v > rubric.max) throw new ValidationError(`${r.name}: choose ${rubric.min} to ${rubric.max}.`);
    out[r.key] = v;
  }
  return out;
}

const cleanCodes = (codes: unknown): string[] => {
  const allowed = new Set(WRITING_ERROR_CODES);
  const list = [...new Set((Array.isArray(codes) ? codes : []).map((c) => s(c).trim().toUpperCase()).filter(Boolean))];
  const bad = list.filter((c) => !allowed.has(c));
  if (bad.length) throw new ValidationError(`Unknown error code(s): ${bad.join(", ")}.`);
  return list.slice(0, 10);
};

/**
 * Saves the scores and comment. A staged task's DRAFT goes to REVISE (the first draft is kept, 1–2 revision steps
 * are set, the student edits again); otherwise the work is SCORED.
 */
async function applyScore(repo: Repo, actor: Actor, t: Row, sub: Row, clean: Record<string, number>, comment: string | null, now: Date, extra: Record<string, unknown>, movesIn?: unknown): Promise<"REVISE" | "SCORED"> {
  const taskId = s(t.id), studentId = s(sub.studentId);
  const toRevise = staged(t) && s(sub.stage) === "DRAFT" && sub.status === "SUBMITTED";
  const data: Record<string, unknown> = { scores: clean, comment: s(comment).trim().slice(0, 2000) || null, scoredById: actor.userId, scoredAt: now, ...extra };
  if (toRevise) {
    const rubric = taskRubric(t);
    const chosen = Array.isArray(movesIn) && movesIn.length ? checkMoves(rubric, movesIn) : pickMoves(rubric, clean);
    const plan = json<Record<string, unknown>>(sub.plan) ?? {};
    Object.assign(data, { status: "DRAFT", stage: "REVISE", firstDraft: s(sub.text) || null, checklist: null, plan: { ...plan, _moves: chosen }, submittedAt: null });
  } else Object.assign(data, { status: "SCORED", ...(staged(t) ? { stage: "FINAL" } : {}) });
  await repo.updateMany("WritingSubmission", { taskId, studentId }, data);
  const st = await repo.findUnique("Student", { id: studentId });
  if (st) await repo.create("Notification", { userId: st.userId, type: "TEACHER_FEEDBACK", title: toRevise ? "✍️ Feedback on your draft: time to revise" : "✍️ Your teacher scored your work", body: s(t.title).slice(0, 160), link: `/student/writing/${taskId}`, createdAt: now });
  return toRevise ? "REVISE" : "SCORED";
}

export async function scoreSubmission(
  repo: Repo, actor: Actor, taskId: string, studentId: string, scores: Record<string, number>, comment: string | null, now = new Date(), wcpm?: number | null,
  opts: { moves?: string[]; codes?: string[] } = {},
): Promise<"REVISE" | "SCORED"> {
  const { t, sub } = await scorable(repo, actor, taskId, studentId);
  const clean = cleanScores(taskRubric(t), scores);
  // 🔊 reading aloud: the words correct per minute the teacher counted (kept as a fluency check too)
  const w = s(t.kind) === "READ_ALOUD" && wcpm !== undefined && wcpm !== null && String(wcpm) !== "" ? Math.round(Number(wcpm)) : null;
  if (w !== null && (!Number.isFinite(w) || w < 0 || w > 400)) throw new ValidationError("Words correct per minute must be a number from 0 to 400.");
  const extra: Record<string, unknown> = w !== null ? { wcpm: w } : {};
  // the teacher's own error tags (no AI): kept as an approved, teacher-made draft with conventions only
  const codes = opts.codes ? cleanCodes(opts.codes) : [];
  if (codes.length) extra.aiDraft = { traits: {}, conventions: codes.map((code) => ({ code, example: "" })), summary: "", at: now.toISOString(), by: "TEACHER" } satisfies AiDraft;
  if (codes.length) extra.aiStatus = "APPROVED";
  else if (s(sub.aiStatus) === "PENDING") extra.aiStatus = "DISMISSED"; // scored by hand: the waiting AI draft is set aside
  const out = await applyScore(repo, actor, t, sub, clean, comment, now, extra, opts.moves);
  // 🔗 a graded piece feeds the writing skill (and conventions → Capitalization) at low weight (Update 39B)
  if (out === "SCORED" && s(t.kind) === "WRITE") await safeFeed("writing", () => feedWriting(repo, studentId, taskId, clean as Record<string, number>, s(t.genre), now, t.skillId ? s(t.skillId) : null));
  if (w !== null) await repo.create("FluencyCheck", { studentId, wcpm: w, accuracy: null, note: `Reading aloud: ${s(t.title).slice(0, 120)}`, source: "RECORDING", checkedById: actor.userId, checkedAt: now });
  return out;
}

export interface AiApproval { scores: Record<string, unknown>; strengths?: Record<string, string>; nextSteps?: Record<string, string>; codes?: string[]; summary?: string; comment?: string | null; moves?: string[] }
/** The teacher approves the AI draft (with their edits): its scores and comment become the feedback the student sees. */
export async function approveAiDraft(repo: Repo, actor: Actor, taskId: string, studentId: string, edit: AiApproval, now = new Date()): Promise<"REVISE" | "SCORED"> {
  const { t, sub } = await scorable(repo, actor, taskId, studentId);
  const draft = readDraft(sub.aiDraft);
  if (s(sub.aiStatus) !== "PENDING" || !draft) throw new ValidationError("There is no AI draft waiting for this student.");
  const rubric = taskRubric(t);
  const clean = cleanScores(rubric, edit.scores);
  const txt = (v: unknown, d: string) => (v === undefined ? d : s(v).replace(/\s+/g, " ").trim().slice(0, 300));
  const traits = Object.fromEntries(rubric.traits.map((tr) => [tr.key, { score: clean[tr.key], strength: txt(edit.strengths?.[tr.key], draft.traits[tr.key]?.strength ?? ""), nextStep: txt(edit.nextSteps?.[tr.key], draft.traits[tr.key]?.nextStep ?? "") }]));
  const keep = edit.codes ? cleanCodes(edit.codes) : draft.conventions.map((c) => c.code);
  const conventions = [...draft.conventions.filter((c) => keep.includes(c.code)), ...keep.filter((c) => !draft.conventions.some((x) => x.code === c)).map((code) => ({ code, example: "" }))];
  const summary = txt(edit.summary, draft.summary).slice(0, 400);
  const final: AiDraft = { traits, conventions, summary, at: now.toISOString(), by: "TEACHER" };
  const comment = s(edit.comment).trim() || summary;
  return applyScore(repo, actor, t, sub, clean, comment, now, { aiDraft: final, aiStatus: "APPROVED" }, edit.moves);
}

export async function dismissAiDraft(repo: Repo, actor: Actor, taskId: string, studentId: string): Promise<void> {
  const { sub } = await scorable(repo, actor, taskId, studentId);
  if (s(sub.aiStatus) !== "PENDING") throw new ValidationError("There is no AI draft waiting for this student.");
  await repo.updateMany("WritingSubmission", { taskId, studentId }, { aiStatus: "DISMISSED" });
}

type Make = { gemini?: typeof geminiProvider; anthropic?: typeof anthropicProvider };
/**
 * Drafts the AI feedback of one submission (after the student submits, or when the teacher asks again). Only the
 * text, the genre and the rubric are sent. Never throws for AI problems.
 */
export async function draftForSubmission(repo: Repo, taskId: string, studentId: string, env: EnvLike, now = new Date(), make: Make = {}): Promise<{ outcome: AiOutcome | "SKIP"; reason: string | null }> {
  const t = await repo.findUnique("WritingTask", { id: taskId });
  const sub = await repo.findUnique("WritingSubmission", { taskId, studentId });
  if (!t || t.deletedAt || s(t.kind) !== "WRITE" || !bool(t.aiFeedback) || !sub || sub.status !== "SUBMITTED") return { outcome: "SKIP", reason: "AI feedback is not on for this task, or there is nothing submitted." };
  return draftAiFeedback(repo, { schoolId: s(t.schoolId), taskId, studentId, genre: genreOf(t), rubric: taskRubric(t), text: s(sub.text) }, env, now, make);
}

/** The teacher asks the AI again (e.g. after a limit or a failure). */
export async function requestAiDraft(repo: Repo, actor: Actor, taskId: string, studentId: string, env: EnvLike, now = new Date(), make: Make = {}): Promise<{ outcome: AiOutcome | "SKIP"; reason: string | null }> {
  const { t, sub } = await scorable(repo, actor, taskId, studentId);
  if (!bool(t.aiFeedback)) throw new ValidationError("AI feedback is off for this task.");
  if (sub.status !== "SUBMITTED") throw new ValidationError("AI feedback is drafted for submitted work that is not scored yet.");
  if (s(sub.aiStatus) === "PENDING") throw new ValidationError("An AI draft is already waiting for you.");
  return draftForSubmission(repo, taskId, studentId, env, now, make);
}

/** The teacher's 0–2 scores of the short research answers. */
export async function scoreResearchAnswers(repo: Repo, actor: Actor, taskId: string, studentId: string, scores: Record<string, unknown>): Promise<void> {
  assertCan(actor, "assignments:create");
  const t = await loadTask(repo, taskId);
  await assertClassAccess(repo, actor, s(t.classId));
  const sub = await repo.findUnique("WritingSubmission", { taskId, studentId });
  const ra = json<ResearchAnswers>(sub?.researchAnswers);
  if (!sub || !ra?.submittedAt) throw new ValidationError("The student has not answered the research questions yet.");
  await repo.updateMany("WritingSubmission", { taskId, studentId }, { researchAnswers: teacherScoreResearch(researchOf(t), ra, scores) });
}

// ------------------------------------------------------------------ the teacher: reteach and the class's writing errors

/** Assigns a reteach skill (from a weak trait or a frequent error) with the normal skill assignment. */
export async function assignReteach(repo: Repo, actor: Actor, input: { taskId: string; skillId: string; studentIds?: string[] }, now = new Date()): Promise<{ assignmentId: string; students: number }> {
  assertCan(actor, "assignments:create");
  const t = await loadTask(repo, input.taskId);
  await assertClassAccess(repo, actor, s(t.classId));
  return assignSkill(repo, actor, { classId: s(t.classId), skillId: input.skillId, studentIds: input.studentIds, note: `Reteach after the writing task “${s(t.title).slice(0, 120)}”.` }, now);
}

export interface WritingErrorRow { code: string; label: string; fix: string; count: number; students: number; skills: ReteachSkill[] }
/** The class's most frequent convention errors (approved feedback only), with the skills to reteach each. */
export async function classWritingErrors(repo: Repo, actor: Actor, classId: string, limit = 6): Promise<{ rows: WritingErrorRow[]; pending: number; pieces: number }> {
  assertCan(actor, "reports:read");
  await assertClassRead(repo, actor, classId);
  const tasks = await repo.findMany("WritingTask", { classId, kind: "WRITE", deletedAt: null }, { select: ["id"] });
  const subs = tasks.length ? await repo.findMany("WritingSubmission", { taskId: { in: tasks.map((t) => t.id) } }, { select: ["studentId", "aiDraft", "aiStatus"] }) : [];
  const by = new Map<string, { count: number; students: Set<string> }>();
  let pieces = 0;
  for (const x of subs) {
    if (s(x.aiStatus) !== "APPROVED") continue;
    const d = readDraft(x.aiDraft);
    if (!d) continue;
    pieces++;
    for (const c of d.conventions) { const e = by.get(c.code) ?? { count: 0, students: new Set<string>() }; e.count++; e.students.add(s(x.studentId)); by.set(c.code, e); }
  }
  const top = [...by.entries()].sort((a, b) => b[1].count - a[1].count || b[1].students.size - a[1].students.size || a[0].localeCompare(b[0])).slice(0, limit);
  const rows: WritingErrorRow[] = [];
  for (const [code, e] of top) {
    const m = MISCONCEPTION_BY_CODE.get(code);
    rows.push({ code, label: m?.label ?? code, fix: m?.fix ?? "", count: e.count, students: e.students.size, skills: (await skillsForFamilies(repo, classId, CODE_FAMILIES[code] ?? [])).slice(0, 2) });
  }
  return { rows, pending: subs.filter((x) => s(x.aiStatus) === "PENDING").length, pieces };
}

// ------------------------------------------------------------------ the student

export async function myTasks(repo: Repo, actor: Actor): Promise<(TaskSummary & { status: SubmissionView["status"]; stage: Stage | null; total: number | null; max: number; lockedStatus: LockedStatus | null; timeLimitMin: number | null })[]> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError();
  const cls = (await repo.findMany("ClassMembership", { studentId: actor.studentId, leftAt: null }, { select: ["classId"] })).map((m) => m.classId);
  const tasks = (cls.length ? await safeIfBehind("writing.mine", repo.findMany("WritingTask", { classId: { in: cls }, deletedAt: null }, { select: ["id", "kind", "genre", "staged", "title", "dueAt", "createdAt", "locked", "rubric", "studentIds", "timeLimitMin", "research", "sources"] }), [] as Row[]) : [])
    .filter((t) => isAssignedTo(t, actor.studentId!));
  const subs = tasks.length ? await repo.findMany("WritingSubmission", { taskId: { in: tasks.map((t) => t.id) }, studentId: actor.studentId }, { select: ["taskId", "status", "scores", "stage", "startedAt", "submitMode", "text"] }) : [];
  return tasks.map((t) => {
    const sub = subs.find((x) => x.taskId === t.id);
    const v = subView(t, sub, actor.studentId!, "");
    const lk = isLocked(t);
    return { id: s(t.id), kind: s(t.kind) as TaskKind, genre: genreOf(t), staged: staged(t), locked: lk, title: s(t.title), dueAt: iso(t.dueAt), createdAt: iso(t.createdAt)!, submitted: 0, scored: 0, members: 0, aiPending: 0, status: v.status, stage: v.stage, total: v.status === "SCORED" ? v.total : null, max: scoreMax(t), lockedStatus: lk ? lockedStatus(sub) : null, timeLimitMin: lk && t.timeLimitMin ? Number(t.timeLimitMin) : null };
  }).sort((a, b) => Number(a.status === "SCORED") - Number(b.status === "SCORED") || b.createdAt.localeCompare(a.createdAt));
}

async function ownTask(repo: Repo, actor: Actor, taskId: string): Promise<Row> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError();
  const t = await loadTask(repo, taskId);
  const ok = await repo.findMany("ClassMembership", { studentId: actor.studentId, classId: t.classId, leftAt: null });
  if (!ok.length || !isAssignedTo(t, actor.studentId)) throw new ForbiddenError("Task not found.");
  return t;
}

export interface StudentTaskView extends Omit<TaskView, "subs" | "canScore" | "research" | "moveOptions"> {
  research: ResearchQuestionView[];
  /** research questions are answered before planning or writing */
  needsResearch: boolean;
  mine: SubmissionView;
}

export async function taskForStudent(repo: Repo, actor: Actor, taskId: string): Promise<StudentTaskView> {
  const t = await ownTask(repo, actor, taskId);
  const sub = await repo.findUnique("WritingSubmission", { taskId, studentId: actor.studentId });
  const mine = subView(t, sub ?? undefined, actor.studentId!, "");
  // the student sees AI feedback only once the teacher approved it; scores of a submitted (not yet scored) final stay hidden
  if (mine.aiStatus !== "APPROVED") mine.ai = null;
  const qs = researchOf(t), genre = genreOf(t);
  const skill = t.skillId ? await repo.findUnique("Skill", { id: t.skillId }) : null;
  return {
    id: s(t.id), kind: s(t.kind) as TaskKind, locked: isLocked(t), classId: s(t.classId), title: s(t.title), prompt: s(t.prompt), passage: t.passage ? s(t.passage) : null, minWords: t.minWords ? Number(t.minWords) : null, dueAt: iso(t.dueAt),
    genre, genreLabel: s(t.kind) === "READ_ALOUD" ? "Reading aloud" : GENRE_LABEL[genre], staged: staged(t), aiFeedback: bool(t.aiFeedback), skill: skill ? { id: s(skill.id), name: s(skill.name) } : null,
    sources: sourcesOf(t), research: studentView(qs), needsResearch: qs.length > 0 && !mine.research?.submittedAt, rubric: taskRubric(t), checklist: CHECKLISTS[genre], organizer: ORGANIZERS[genre], mine,
  };
}

async function upsertSub(repo: Repo, taskId: string, studentId: string, sub: Row | null, data: Record<string, unknown>): Promise<void> {
  if (sub) await repo.updateMany("WritingSubmission", { taskId, studentId }, data);
  else await repo.create("WritingSubmission", { taskId, studentId, status: "DRAFT", aiStatus: "NONE", ...data });
}

/** The research answers (all at once, before planning or writing): multiple choice scored now, short answers by the teacher. */
export async function submitResearch(repo: Repo, actor: Actor, taskId: string, answers: Record<string, unknown>, now = new Date()): Promise<{ points: number; max: number; pending: number }> {
  const t = await ownTask(repo, actor, taskId);
  const qs = researchOf(t);
  if (!qs.length) throw new ValidationError("This task has no research questions.");
  const sub = await repo.findUnique("WritingSubmission", { taskId, studentId: actor.studentId });
  if (json<ResearchAnswers>(sub?.researchAnswers)?.submittedAt) throw new ValidationError("You already answered the research questions.");
  const ra = scoreResearch(qs, answers, now);
  await upsertSub(repo, taskId, actor.studentId!, sub, { researchAnswers: ra, updatedAt: now, ...(sub ? {} : staged(t) ? { stage: "PLAN" } : {}) });
  return researchTotal(qs, ra);
}

function researchGate(t: Row, sub: Row | null): void {
  if (researchOf(t).length && !json<ResearchAnswers>(sub?.researchAnswers)?.submittedAt) throw new ValidationError("Answer the research questions first.");
}

/** The plan stage of a staged task: save the organizer; finishing it moves the student to the draft. */
export async function savePlan(repo: Repo, actor: Actor, taskId: string, plan: Record<string, unknown>, finish: boolean, now = new Date()): Promise<Stage> {
  const t = await ownTask(repo, actor, taskId);
  if (!staged(t)) throw new ValidationError("This task has no plan stage.");
  const sub = await repo.findUnique("WritingSubmission", { taskId, studentId: actor.studentId });
  researchGate(t, sub);
  if (sub?.stage && s(sub.stage) !== "PLAN") throw new ValidationError("Your plan is finished: keep writing your draft.");
  const r = checkPlan(genreOf(t), plan, finish);
  if (!r.ok) throw new ValidationError(r.error);
  const stage: Stage = finish ? "DRAFT" : "PLAN";
  await upsertSub(repo, taskId, actor.studentId!, sub, { plan: r.value, stage, updatedAt: now });
  return stage;
}

/**
 * Saves the draft, or submits it. Submitting needs the genre's self-check (every item ticked) and, in the REVISE
 * stage, every revision step done and a changed text. Submitted work can no longer be changed (until a staged
 * draft comes back for revision). Returns whether an AI draft should be made now (the caller runs it).
 */
export async function saveWriting(repo: Repo, actor: Actor, taskId: string, text: string, submit: boolean, now = new Date(), opts: { checklist?: Record<string, unknown>; movesDone?: string[] } = {}): Promise<{ ai: boolean; stage: Stage | null }> {
  const t = await ownTask(repo, actor, taskId);
  if (s(t.kind) !== "WRITE") throw new ValidationError("This task is a recording.");
  if (isLocked(t)) throw new ValidationError("This task is written on the locked writing page: press “Start Writing”.");
  const sub = await repo.findUnique("WritingSubmission", { taskId, studentId: actor.studentId });
  if (sub && sub.status !== "DRAFT") throw new ValidationError("You already submitted this work.");
  researchGate(t, sub);
  const st = staged(t) ? ((sub?.stage ? s(sub.stage) : "PLAN") as Stage) : null;
  if (st === "PLAN") throw new ValidationError("Finish your plan first.");
  const body = s(text).slice(0, 20000);
  const data: Record<string, unknown> = { text: body, status: "DRAFT", submittedAt: null, updatedAt: now };
  if (submit) {
    if (t.minWords && words(body) < Number(t.minWords)) throw new ValidationError(`Write at least ${t.minWords} words (you have ${words(body)}).`);
    if (words(body) < 3) throw new ValidationError("Write your answer first.");
    const genre = genreOf(t);
    if (checklistRequired(genre)) {
      const c = checkChecklist(genre, opts.checklist);
      if (!c.ok) throw new ValidationError(c.error);
      data.checklist = c.value;
    }
    if (st === "REVISE") {
      const moves = subView(t, sub ?? undefined, s(actor.studentId), "").moves;
      const done = new Set(opts.movesDone ?? []);
      const left = moves.find((m) => !done.has(m.id));
      if (left) throw new ValidationError(`Do your revision step first: “${left.text}” Then tick it.`);
      if (sub?.firstDraft && body.replace(/\s+/g, " ").trim() === s(sub.firstDraft).replace(/\s+/g, " ").trim()) throw new ValidationError("Your writing is the same as your first draft. Make the revision steps in your text.");
    }
    Object.assign(data, { status: "SUBMITTED", submittedAt: now, ...(st ? { stage: st === "REVISE" ? "FINAL" : "DRAFT" } : {}) });
    if (bool(t.aiFeedback)) Object.assign(data, { aiStatus: "NONE", aiDraft: null });
  }
  await upsertSub(repo, taskId, actor.studentId!, sub, data);
  const stage = submit && st ? (data.stage as Stage) : st;
  return { ai: submit && bool(t.aiFeedback), stage };
}

/** The reading-aloud recording (at most 2 MB of audio). */
export async function saveRecording(repo: Repo, actor: Actor, taskId: string, bytes: Uint8Array, type: string, now = new Date()): Promise<void> {
  const t = await ownTask(repo, actor, taskId);
  if (s(t.kind) !== "READ_ALOUD") throw new ValidationError("This task is a writing task.");
  if (!AUDIO_TYPES.test(type)) throw new ValidationError("This recording type is not supported.");
  if (!bytes.length || bytes.length > MAX_AUDIO) throw new ValidationError("The recording is too long (at most about 3 minutes).");
  const sub = await repo.findUnique("WritingSubmission", { taskId, studentId: actor.studentId });
  if (sub && sub.status === "SCORED") throw new ValidationError("Your teacher already scored this reading.");
  const data = { audio: Buffer.from(bytes), audioType: type.slice(0, 60), status: "SUBMITTED", submittedAt: now, updatedAt: now };
  if (sub) await repo.updateMany("WritingSubmission", { taskId, studentId: actor.studentId }, data); else await repo.create("WritingSubmission", { taskId, studentId: actor.studentId, text: null, ...data });
}

/** The audio for the student themself, or the teachers / admin of the class. */
export async function recording(repo: Repo, actor: Actor, taskId: string, studentId: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const t = await repo.findUnique("WritingTask", { id: taskId });
  if (!t) return null;
  if (actor.role === "STUDENT") { if (actor.studentId !== studentId) throw new ForbiddenError(); }
  else if (actor.role === "PARENT") throw new ForbiddenError();
  else await assertClassRead(repo, actor, s(t.classId));
  const sub = await repo.findUnique("WritingSubmission", { taskId, studentId });
  if (!sub?.audio) return null;
  return { bytes: sub.audio as Uint8Array, type: s(sub.audioType) || "audio/webm" };
}

export type { Trait, Rubric, Genre, CheckItem, Organizer, Source, ResearchQuestion, ResearchQuestionView, ResearchAnswers, AiDraft, ReteachRow };
