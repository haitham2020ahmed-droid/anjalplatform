/**
 * ✍️ Writing tasks scored with a 4-point rubric (Ideas · Organization · Language · Conventions — the MAP Language
 * Usage “Writing” area), and 🎙 reading-aloud tasks (the student records the text; the teacher listens and scores
 * Fluency · Accuracy · Expression). Drafts are saved; the teacher's scores and comment are seen by the student.
 */
import type { Repo, Row } from "../seeding/repo";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { assertClassAccess } from "./assignments";
import { assertClassRead } from "./coordinators";
import { classMembers, studentNames } from "../insights/student-data";

const s = (v: unknown) => String(v ?? "");
const time = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : s(v)).getTime();
const iso = (v: unknown) => (v ? new Date(time(v)).toISOString() : null);
export type TaskKind = "WRITE" | "READ_ALOUD";
export const RUBRIC: Record<TaskKind, { key: string; name: string; what: string }[]> = {
  WRITE: [
    { key: "ideas", name: "Ideas", what: "Answers the prompt with clear ideas and details / evidence." },
    { key: "organization", name: "Organization", what: "Beginning, middle and end; ideas in a logical order; linking words." },
    { key: "language", name: "Language", what: "Precise words, varied sentences, a voice that fits the purpose." },
    { key: "conventions", name: "Conventions", what: "Grammar, capitals, punctuation and spelling." },
  ],
  READ_ALOUD: [
    { key: "fluency", name: "Fluency", what: "Reads smoothly at a good pace, not word by word." },
    { key: "accuracy", name: "Accuracy", what: "Reads the words correctly; corrects own mistakes." },
    { key: "expression", name: "Expression", what: "Pauses at punctuation; voice shows meaning." },
  ],
};
export const MAX_AUDIO = 2 * 1024 * 1024;
const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a|wav)(;.*)?$/i;
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export async function createTask(repo: Repo, actor: Actor, input: { classId: string; kind: TaskKind; title: string; prompt: string; passage?: string | null; minWords?: number | null; dueAt?: Date | null }, now = new Date()): Promise<string> {
  assertCan(actor, "assignments:create");
  await assertClassAccess(repo, actor, input.classId);
  const title = s(input.title).trim(), prompt = s(input.prompt).trim();
  if (title.length < 2 || prompt.length < 5) throw new ValidationError("Write a title and the task for the students.");
  if (input.kind === "READ_ALOUD" && s(input.passage).trim().length < 20) throw new ValidationError("Paste the text the students will read aloud.");
  const t = await repo.create("WritingTask", { schoolId: actor.schoolId!, classId: input.classId, createdById: actor.userId, kind: input.kind, title: title.slice(0, 191), prompt: prompt.slice(0, 5000), passage: s(input.passage).trim().slice(0, 20000) || null, minWords: input.kind === "WRITE" && input.minWords ? Math.max(10, Math.min(1000, Math.round(input.minWords))) : null, dueAt: input.dueAt ?? null, createdAt: now, deletedAt: null });
  const ids = await classMembers(repo, input.classId);
  const users = ids.length ? await repo.findMany("Student", { id: { in: ids } }, { select: ["userId"] }) : [];
  if (users.length) await repo.createMany("Notification", users.map((u) => ({ userId: u.userId, type: "NEW_ASSIGNMENT", title: input.kind === "WRITE" ? "✍️ A writing task from your teacher" : "🎙 Read aloud for your teacher", body: title.slice(0, 160), link: `/student/writing/${s(t.id)}`, createdAt: now })));
  return s(t.id);
}

export interface TaskSummary { id: string; kind: TaskKind; title: string; dueAt: string | null; createdAt: string; submitted: number; scored: number; members: number }
export async function classTasks(repo: Repo, actor: Actor, classId: string): Promise<TaskSummary[]> {
  assertCan(actor, "reports:read");
  await assertClassRead(repo, actor, classId);
  const tasks = await repo.findMany("WritingTask", { classId, deletedAt: null });
  const subs = tasks.length ? await repo.findMany("WritingSubmission", { taskId: { in: tasks.map((t) => t.id) } }, { select: ["taskId", "status"] }) : [];
  const members = (await classMembers(repo, classId)).length;
  return tasks.map((t) => ({ id: s(t.id), kind: s(t.kind) as TaskKind, title: s(t.title), dueAt: iso(t.dueAt), createdAt: iso(t.createdAt)!, submitted: subs.filter((x) => x.taskId === t.id && x.status !== "DRAFT").length, scored: subs.filter((x) => x.taskId === t.id && x.status === "SCORED").length, members })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface SubmissionView { studentId: string; name: string; status: "NOT_STARTED" | "DRAFT" | "SUBMITTED" | "SCORED"; text: string | null; words: number; hasAudio: boolean; scores: Record<string, number> | null; total: number | null; comment: string | null; submittedAt: string | null }
export interface TaskView { id: string; kind: TaskKind; classId: string; title: string; prompt: string; passage: string | null; minWords: number | null; dueAt: string | null; rubric: (typeof RUBRIC)[TaskKind]; subs: SubmissionView[]; canScore: boolean }

const scoresOf = (r: Row | undefined): Record<string, number> | null => { if (!r?.scores) return null; const v = typeof r.scores === "string" ? JSON.parse(r.scores) : r.scores; return v as Record<string, number>; };
function subView(r: Row | undefined, studentId: string, name: string): SubmissionView {
  const sc = scoresOf(r);
  return { studentId, name, status: (r ? s(r.status) : "NOT_STARTED") as SubmissionView["status"], text: r?.text ? s(r.text) : null, words: r?.text ? words(s(r.text)) : 0, hasAudio: Boolean(r?.audioType), scores: sc, total: sc ? Object.values(sc).reduce((t, x) => t + Number(x), 0) : null, comment: r?.comment ? s(r.comment) : null, submittedAt: iso(r?.submittedAt) };
}

export async function taskForTeacher(repo: Repo, actor: Actor, taskId: string): Promise<TaskView> {
  assertCan(actor, "reports:read");
  const t = await repo.findUnique("WritingTask", { id: taskId });
  if (!t || t.deletedAt) throw new ForbiddenError("Task not found.");
  await assertClassRead(repo, actor, s(t.classId));
  let canScore = true; try { await assertClassAccess(repo, actor, s(t.classId)); } catch { canScore = false; }
  const ids = await classMembers(repo, s(t.classId));
  const [names, subs] = await Promise.all([studentNames(repo, ids), repo.findMany("WritingSubmission", { taskId }, { select: ["studentId", "text", "audioType", "status", "scores", "comment", "submittedAt"] })]);
  const kind = s(t.kind) as TaskKind;
  return { id: s(t.id), kind, classId: s(t.classId), title: s(t.title), prompt: s(t.prompt), passage: t.passage ? s(t.passage) : null, minWords: t.minWords ? Number(t.minWords) : null, dueAt: iso(t.dueAt), rubric: RUBRIC[kind], subs: ids.map((id) => subView(subs.find((x) => x.studentId === id), id, names.get(id)?.name ?? "Student")).sort((a, b) => ["SUBMITTED", "SCORED", "DRAFT", "NOT_STARTED"].indexOf(a.status) - ["SUBMITTED", "SCORED", "DRAFT", "NOT_STARTED"].indexOf(b.status) || a.name.localeCompare(b.name)), canScore };
}

export async function scoreSubmission(repo: Repo, actor: Actor, taskId: string, studentId: string, scores: Record<string, number>, comment: string | null, now = new Date()): Promise<void> {
  assertCan(actor, "assignments:create");
  const t = await repo.findUnique("WritingTask", { id: taskId });
  if (!t) throw new ForbiddenError("Task not found.");
  await assertClassAccess(repo, actor, s(t.classId));
  const sub = await repo.findUnique("WritingSubmission", { taskId, studentId });
  if (!sub || sub.status === "DRAFT") throw new ValidationError("The student has not submitted yet.");
  const clean: Record<string, number> = {};
  for (const r of RUBRIC[s(t.kind) as TaskKind]) { const v = Number(scores[r.key]); if (!Number.isInteger(v) || v < 0 || v > 4) throw new ValidationError(`${r.name}: choose 0 to 4.`); clean[r.key] = v; }
  await repo.updateMany("WritingSubmission", { taskId, studentId }, { scores: clean, comment: s(comment).trim().slice(0, 2000) || null, status: "SCORED", scoredById: actor.userId, scoredAt: now });
  const st = await repo.findUnique("Student", { id: studentId });
  if (st) await repo.create("Notification", { userId: st.userId, type: "TEACHER_FEEDBACK", title: "✍️ Your teacher scored your work", body: s(t.title).slice(0, 160), link: `/student/writing/${taskId}`, createdAt: now });
}

// ------------------------------------------------------------------ the student

export async function myTasks(repo: Repo, actor: Actor): Promise<(TaskSummary & { status: SubmissionView["status"]; total: number | null; max: number })[]> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError();
  const cls = (await repo.findMany("ClassMembership", { studentId: actor.studentId, leftAt: null }, { select: ["classId"] })).map((m) => m.classId);
  const tasks = cls.length ? await repo.findMany("WritingTask", { classId: { in: cls }, deletedAt: null }) : [];
  const subs = tasks.length ? await repo.findMany("WritingSubmission", { taskId: { in: tasks.map((t) => t.id) }, studentId: actor.studentId }, { select: ["taskId", "status", "scores"] }) : [];
  return tasks.map((t) => { const sub = subs.find((x) => x.taskId === t.id); const v = subView(sub, actor.studentId!, ""); const kind = s(t.kind) as TaskKind; return { id: s(t.id), kind, title: s(t.title), dueAt: iso(t.dueAt), createdAt: iso(t.createdAt)!, submitted: 0, scored: 0, members: 0, status: v.status, total: v.total, max: RUBRIC[kind].length * 4 }; }).sort((a, b) => Number(a.status === "SCORED") - Number(b.status === "SCORED") || b.createdAt.localeCompare(a.createdAt));
}

async function ownTask(repo: Repo, actor: Actor, taskId: string): Promise<Row> {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError();
  const t = await repo.findUnique("WritingTask", { id: taskId });
  if (!t || t.deletedAt) throw new ForbiddenError("Task not found.");
  const ok = await repo.findMany("ClassMembership", { studentId: actor.studentId, classId: t.classId, leftAt: null });
  if (!ok.length) throw new ForbiddenError("Task not found.");
  return t;
}

export async function taskForStudent(repo: Repo, actor: Actor, taskId: string): Promise<Omit<TaskView, "subs" | "canScore"> & { mine: SubmissionView }> {
  const t = await ownTask(repo, actor, taskId);
  const sub = await repo.findUnique("WritingSubmission", { taskId, studentId: actor.studentId });
  const kind = s(t.kind) as TaskKind;
  return { id: s(t.id), kind, classId: s(t.classId), title: s(t.title), prompt: s(t.prompt), passage: t.passage ? s(t.passage) : null, minWords: t.minWords ? Number(t.minWords) : null, dueAt: iso(t.dueAt), rubric: RUBRIC[kind], mine: subView(sub ?? undefined, actor.studentId!, "") };
}

/** Saves the draft, or submits it (submitted work can no longer be changed). */
export async function saveWriting(repo: Repo, actor: Actor, taskId: string, text: string, submit: boolean, now = new Date()): Promise<void> {
  const t = await ownTask(repo, actor, taskId);
  if (s(t.kind) !== "WRITE") throw new ValidationError("This task is a recording.");
  const sub = await repo.findUnique("WritingSubmission", { taskId, studentId: actor.studentId });
  if (sub && sub.status !== "DRAFT") throw new ValidationError("You already submitted this work.");
  const body = s(text).slice(0, 20000);
  if (submit && t.minWords && words(body) < Number(t.minWords)) throw new ValidationError(`Write at least ${t.minWords} words (you have ${words(body)}).`);
  if (submit && words(body) < 3) throw new ValidationError("Write your answer first.");
  const data = { text: body, status: submit ? "SUBMITTED" : "DRAFT", submittedAt: submit ? now : null, updatedAt: now };
  if (sub) await repo.updateMany("WritingSubmission", { taskId, studentId: actor.studentId }, data); else await repo.create("WritingSubmission", { taskId, studentId: actor.studentId, ...data });
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
