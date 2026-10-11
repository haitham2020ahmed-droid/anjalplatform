/**
 * 🧩 Lessons for teachers: assign a lesson to students, follow class progress, open one run (organizer + log),
 * a 15-minute small-group script card per skill, and the class's accuracy by question type (QAR).
 * Scope: a teacher sees only the classes they can read (their own, or their grade as coordinator), and assigns only
 * in classes they teach; admins see their school.
 */
import { misconceptionLabel, MISCONCEPTION_BY_CODE } from "../../insights/misconceptions";
import { QAR_HELP, isQar } from "../../tutor/tutor";
import { canAccessStudent, ForbiddenError, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { accuracyByTag, type TagAccuracy } from "../questions/intelligence";
import type { Repo } from "../seeding/repo";
import { assertClassAccess } from "../teacher/assignments";
import { assertClassRead } from "../teacher/coordinators";
import { ORGANIZERS, lessonFor, lessonForSkill, type LessonContent } from "./content";
import { inviteToLesson, logOf, organizerOf, PHASE_SIZE, type LogEntry } from "./run";

const s = (v: unknown) => String(v ?? "");
const iso = (v: unknown) => (v ? (v instanceof Date ? v : new Date(String(v))).toISOString() : null);

async function classStudents(repo: Repo, classId: string): Promise<{ id: string; name: string }[]> {
  const members = await repo.findMany("ClassMembership", { classId, leftAt: null }, { select: ["studentId"] });
  if (!members.length) return [];
  const st = await repo.findMany("Student", { id: { in: members.map((m) => s(m.studentId)) }, deletedAt: null }, { select: ["id", "userId"] });
  const users = st.length ? await repo.findMany("User", { id: { in: st.map((x) => s(x.userId)) } }, { select: ["id", "displayName"] }) : [];
  const un = new Map(users.map((u) => [s(u.id), s(u.displayName)]));
  return st.map((x) => ({ id: s(x.id), name: un.get(s(x.userId)) || "Student" })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The class's current students (for the assign form). */
export async function lessonRoster(repo: Repo, actor: Actor, classId: string): Promise<{ id: string; name: string }[]> {
  await assertClassRead(repo, actor, classId);
  return classStudents(repo, classId);
}

/** The skills of the class's curriculum that have a lesson, in curriculum order. */
export async function classLessonSkills(repo: Repo, actor: Actor, classId: string): Promise<{ id: string; name: string; family: string }[]> {
  const klass = await assertClassRead(repo, actor, classId);
  const curs = await repo.findMany("Curriculum", { gradeId: klass.gradeId, isActive: true });
  if (!curs.length) return [];
  const skills = await repo.findMany("Skill", { curriculumId: { in: curs.map((c) => c.id) }, deletedAt: null }, { select: ["id", "name", "code", "familyId", "isActive", "sequence"] });
  const fams = await repo.findMany("SkillFamily", { id: { in: [...new Set(skills.map((k) => s(k.familyId)))] } }, { select: ["id", "code"] });
  const famCode = new Map(fams.map((f) => [s(f.id), s(f.code)]));
  return skills
    .filter((k) => k.isActive !== false)
    // family = the family of the skill's lesson (a Grammar-bank skill gets the lesson its name points to)
    .map((k) => ({ id: s(k.id), name: s(k.name), family: lessonForSkill({ familyCode: famCode.get(s(k.familyId)), code: s(k.code), name: s(k.name) })?.family ?? "", seq: Number(k.sequence ?? 0) }))
    .filter((k) => lessonFor(k.family))
    .sort((a, b) => a.seq - b.seq || a.name.localeCompare(b.name))
    .map(({ id, name, family }) => ({ id, name, family }));
}

/** Assigns the lesson for a skill to students of a class (all of them when none are chosen): a run + a notification each. */
export async function assignLesson(repo: Repo, actor: Actor, input: { classId: string; skillId: string; studentIds?: string[] }, now = new Date()): Promise<{ assigned: number; already: number }> {
  if (actor.role !== "TEACHER" && actor.role !== "SCHOOL_ADMIN" && actor.role !== "SUPER_ADMIN") throw new ForbiddenError("Only teachers can assign lessons.");
  const klass = await assertClassAccess(repo, actor, input.classId);
  const skills = await classLessonSkills(repo, actor, s(klass.id));
  if (!skills.some((k) => k.id === input.skillId)) throw new ValidationError("Choose a skill with a lesson from this class's curriculum.");
  const members = new Set((await classStudents(repo, s(klass.id))).map((x) => x.id));
  const chosen = [...new Set((input.studentIds ?? []).filter(Boolean))];
  for (const id of chosen) if (!members.has(id)) throw new ForbiddenError("You can only assign lessons to students in this class.");
  const to = chosen.length ? chosen : [...members];
  if (!to.length) throw new ValidationError("This class has no students yet.");
  let assigned = 0, already = 0;
  for (const id of to) (await inviteToLesson(repo, id, input.skillId, "TEACHER", now, "Your teacher chose this short lesson for you: examples, hints and a quick check.")) ? assigned++ : already++;
  return { assigned, already };
}

export interface ProgressRow { runId: string; studentId: string; student: string; skillId: string; skill: string; phase: string; approach: number; attempts: number; checkPct: number | null; passed: boolean | null; organizer: "COMPLETE" | "STARTED" | null; answers: number; updatedAt: string | null; source: string }

/** Class progress: every lesson run of the class's students (newest first). */
export async function classLessonProgress(repo: Repo, actor: Actor, classId: string, skillId?: string): Promise<ProgressRow[]> {
  await assertClassRead(repo, actor, classId);
  const students = await classStudents(repo, classId);
  if (!students.length) return [];
  const where: Record<string, unknown> = { studentId: { in: students.map((x) => x.id) } };
  if (skillId) where.skillId = skillId;
  const runs = await repo.findMany("LessonRun", where, { orderBy: [{ field: "updatedAt", dir: "desc" }] });
  const skills = runs.length ? await repo.findMany("Skill", { id: { in: [...new Set(runs.map((r) => s(r.skillId)))] } }, { select: ["id", "name"] }) : [];
  const sk = new Map(skills.map((k) => [s(k.id), s(k.name)]));
  const nm = new Map(students.map((x) => [x.id, x.name]));
  return runs.map((r) => {
    const org = organizerOf(r);
    return {
      runId: s(r.id), studentId: s(r.studentId), student: nm.get(s(r.studentId)) ?? "Student", skillId: s(r.skillId), skill: sk.get(s(r.skillId)) ?? "Skill",
      phase: s(r.phase), approach: Number(r.approach), attempts: Number(r.attempts), checkPct: r.checkPct === null || r.checkPct === undefined ? null : Number(r.checkPct),
      passed: r.passed === null || r.passed === undefined ? null : Boolean(r.passed), organizer: org ? (org.complete ? "COMPLETE" : "STARTED") : null,
      answers: logOf(r).filter((e) => e.t === "ANS").length, updatedAt: iso(r.updatedAt), source: s(r.source),
    };
  });
}

/** One run for the teacher: the student's organizer and every step (scoped to the teacher's students). */
export async function lessonRunDetail(repo: Repo, actor: Actor, runId: string) {
  if (actor.role === "STUDENT" || actor.role === "PARENT") throw new ForbiddenError("Only teachers can open this.");
  const run = await repo.findUnique("LessonRun", { id: runId });
  if (!run || !canAccessStudent(actor, { studentId: s(run.studentId), schoolId: s(run.schoolId) })) throw new ForbiddenError("You cannot open this lesson.");
  const [skill, st] = await Promise.all([repo.findUnique("Skill", { id: run.skillId }), repo.findUnique("Student", { id: run.studentId })]);
  const user = st ? await repo.findUnique("User", { id: st.userId }) : null;
  const fam = skill?.familyId ? await repo.findUnique("SkillFamily", { id: skill.familyId }) : null;
  const content = lessonForSkill({ familyCode: s(fam?.code), code: s(skill?.code), name: s(skill?.name) });
  const log = logOf(run);
  const qIds = [...new Set(log.filter((e): e is Extract<LogEntry, { t: "ANS" }> => e.t === "ANS").map((e) => e.questionId))];
  const qs = qIds.length ? await repo.findMany("Question", { id: { in: qIds } }, { select: ["id", "stem"] }) : [];
  const stem = new Map(qs.map((q) => [s(q.id), s(q.stem)]));
  return {
    runId: s(run.id), student: s(user?.displayName) || "Student", studentId: s(run.studentId), skill: s(skill?.name), skillId: s(run.skillId),
    phase: s(run.phase), approach: Number(run.approach), attempts: Number(run.attempts), checkPct: run.checkPct === null || run.checkPct === undefined ? null : Number(run.checkPct),
    passed: run.passed === null || run.passed === undefined ? null : Boolean(run.passed), source: s(run.source), startedAt: iso(run.startedAt), finishedAt: iso(run.finishedAt),
    organizer: organizerOf(run), organizerSpec: content && content.organizer !== "NONE" ? ORGANIZERS[content.organizer] : null,
    reteach: content ? content.reteach : null,
    steps: log.filter((e) => e.t !== "SESSION").map((e) => ({ ...e, stem: e.t === "ANS" ? (stem.get(e.questionId) ?? "").slice(0, 160) : undefined })),
  };
}

// ------------------------------------------------------------------ small-group script card

export interface ScriptCard {
  skillId: string; skillName: string; minutes: { warmUp: number; model: number; guided: number; check: number };
  warmUp: string;
  model: { definition: string; steps: string[]; signalWords: string[]; passageTitle: string; passage: string; clues: string[]; thinkAloud: string[] };
  guided: { question: string; answer: string; why: string; frames: string[]; organizer: string | null; prompts: string[] };
  check: { prompts: string[]; passRule: string; reteach: { title: string; how: string }[] };
  misconceptions: { code: string; label: string; fix: string; count: number }[];
}

/** A 15-minute small-group script (warm-up 2 · model 4 · guided 5 · check 4), with the class's most common mistakes on the skill. */
export async function scriptCard(repo: Repo, actor: Actor, classId: string, skillId: string): Promise<ScriptCard> {
  const skills = await classLessonSkills(repo, actor, classId);
  const k = skills.find((x) => x.id === skillId);
  if (!k) throw new ValidationError("Choose a skill with a lesson from this class's curriculum.");
  const c = lessonFor(k.family) as LessonContent;
  const students = (await classStudents(repo, classId)).map((x) => x.id);
  const wrong = students.length ? await repo.findMany("QuestionAttempt", { studentId: { in: students }, skillId, isCorrect: false }, { select: ["misconception"] }) : [];
  const counts = new Map<string, number>();
  for (const w of wrong) if (w.misconception) counts.set(s(w.misconception), (counts.get(s(w.misconception)) ?? 0) + 1);
  const misconceptions = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3)
    .map(([code, count]) => ({ code, label: misconceptionLabel(code), fix: MISCONCEPTION_BY_CODE.get(code)?.fix ?? "Reteach with the model text and ask for the evidence sentence.", count }));
  const top = misconceptions[0];
  return {
    skillId, skillName: k.name, minutes: { warmUp: 2, model: 4, guided: 5, check: 4 },
    warmUp: c.warmUp,
    model: { definition: c.definition, steps: c.steps, signalWords: c.signalWords, passageTitle: c.passage.title, passage: c.passage.text, clues: c.passage.clues, thinkAloud: c.thinkAloud },
    guided: {
      question: c.worked.question, answer: c.worked.answer, why: c.worked.why, frames: [...c.frames],
      organizer: c.organizer !== "NONE" ? ORGANIZERS[c.organizer].title : null,
      prompts: [
        "Ask: which sentence in the text proves it? Students point before anyone answers.",
        `Students answer with the frame: “${c.frames[0]}”`,
        ...(top ? [`Watch for: ${top.label.toLowerCase()} (${top.count} wrong answer${top.count === 1 ? "" : "s"} in this class). ${top.fix}`] : []),
      ],
    },
    check: {
      prompts: [`Each student answers ${PHASE_SIZE.CHECK} short questions on their own (no hints), or one exit ticket: “${c.frames[1]}”`, "Each answer must name its clue sentence or signal word."],
      passRule: "4 of 5 correct = ready. Fewer: re-teach tomorrow with a different approach below (never the same one again).",
      reteach: [...c.reteach],
    },
    misconceptions,
  };
}

// ------------------------------------------------------------------ QAR report

export interface QarReport { rows: (TagAccuracy & { name: string })[]; interpretation: string }

/** The class's accuracy by question type (QAR) in the last `days`, with a one-line reading of it. */
export async function qarReport(repo: Repo, actor: Actor, classId: string, opts: { days?: number; now?: Date } = {}): Promise<QarReport> {
  await assertClassRead(repo, actor, classId);
  const students = (await classStudents(repo, classId)).map((x) => x.id);
  const rows = (await accuracyByTag(repo, students, "qar", { days: opts.days ?? 90, now: opts.now })).map((r) => ({ ...r, name: isQar(r.value) ? QAR_HELP[r.value].name : r.value }));
  return { rows, interpretation: interpretQar(rows) };
}

const QAR_MOVE: Record<string, string> = {
  RIGHT_THERE: "practise finding the question's key words in the text and reading the whole sentence around them",
  THINK_AND_SEARCH: "practise joining two parts of the text (organizers help: cause → effect, first → next)",
  AUTHOR_AND_ME: "model “text clue + what I know = my answer” with a think-aloud, then use the frame together",
  ON_MY_OWN: "let students talk about their own experience before they write, then connect it to the topic",
};

/** One line: strongest and weakest question type and what to teach next (needs 5+ answers per type). */
export function interpretQar(rows: { value: string; accuracy: number; answers: number }[]): string {
  const ok = rows.filter((r) => r.answers >= 5);
  if (!ok.length) return "Not enough answers on QAR-tagged questions yet (5 per question type are needed).";
  const sorted = [...ok].sort((a, b) => a.accuracy - b.accuracy || b.answers - a.answers);
  const low = sorted[0], high = sorted[sorted.length - 1];
  const nm = (v: string) => (isQar(v) ? QAR_HELP[v].name : v);
  if (ok.length === 1 || high.accuracy - low.accuracy < 10) return `Accuracy is similar across question types (about ${low.accuracy}–${high.accuracy}%): keep teaching all four types.`;
  return `Strongest on ${nm(high.value)} (${high.accuracy}%) and weakest on ${nm(low.value)} (${low.accuracy}%): ${QAR_MOVE[low.value] ?? "reteach this question type with a model"}.`;
}

