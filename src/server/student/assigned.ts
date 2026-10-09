/**
 * The student side of skill assignments.
 *
 *   assignedSkills   → the ONLY skills a student sees: what the teacher assigned, with status
 *   isAssignedSkill  → server-side gate for practice (a student practises assigned work only)
 *   due reminders    → "Due soon" (within 2 days) and "Overdue" notifications, created once each
 *   assignmentReport → the completion report (student; teacher of the class; admin)
 *   placement switch → the placement test is shown only when the school requires it
 */
import { hideLevels } from "../../lib/hide-levels";
import type { Repo, Row } from "../seeding/repo";
import { audit } from "../audit";
import { assertCan, ForbiddenError, type Actor } from "../auth/rbac";
import { assertClassAccess } from "../teacher/assignments";
import { DEFAULT_TARGET_MASTERY, MIN_ANSWERS_TO_COMPLETE, refreshQuestionSets, refreshSkillAssignments } from "../teacher/assign";
import { adaptiveNext } from "../curriculum-map/leveled-run";

type Status = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
const s = (v: unknown) => String(v ?? "");
const d = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : v instanceof Date ? v : new Date(String(v)));
const DUE_SOON_MS = 2 * 86_400_000;

function ownStudentId(actor: Actor): string {
  if (actor.role !== "STUDENT" || !actor.studentId) throw new ForbiddenError("Only students have assigned skills.");
  return actor.studentId;
}

/** The skill an assignment is about (new single-skill assignments, or older ones with one skill). */
const skillOf = (a: Row): string | null => (a.skillId ? s(a.skillId) : Array.isArray(a.skillIds) && (a.skillIds as unknown[]).length === 1 ? s((a.skillIds as unknown[])[0]) : null);

export interface AssignedSkill {
  /** skill = adaptive practice on a skill; questions = a set of questions the teacher chose */
  kind: "skill" | "questions"; questionCount?: number;
  /** CURRICULUM, MAP or NAFS (Grade 6): the student's areas */
  track: "CURRICULUM" | "MAP" | "NAFS";
  assignmentId: string; skillId: string; skill: string; standard: string | null;
  /** a 🔤 Grammar skill (shown with the grammar icon and under the Grammar filter) */
  grammar?: boolean; assignedAt: string; startAt: string | null; dueAt: string | null;
  status: Status; progress: number; note: string | null; startsLater: boolean; completedAt: string | null;
}
export interface AssignedView { summary: { assigned: number; completed: number; inProgress: number; notStarted: number; overdue: number }; newThisWeek: number; items: AssignedSkill[] }

/** Everything on the student's home page: assigned skills only, newest due first, completed ones kept. */
export async function assignedSkills(repo: Repo, actor: Actor, now = new Date()): Promise<AssignedView> {
  const studentId = ownStudentId(actor);
  const rows = await repo.findMany("AssignmentStudent", { studentId });
  const all = rows.length ? await repo.findMany("Assignment", { id: { in: rows.map((r) => r.assignmentId) }, deletedAt: null }) : [];
  const assignments = all.filter((a) => skillOf(a));
  const sets = all.filter((a) => a.assessmentId && !skillOf(a));
  // bring statuses up to date (writes only what changed)
  await Promise.all([refreshSkillAssignments(repo, assignments, [studentId], now), refreshQuestionSets(repo, sets, [studentId], now)]);
  const fresh = all.length ? await repo.findMany("AssignmentStudent", { studentId, assignmentId: { in: all.map((a) => a.id) } }) : [];
  const setSize = new Map<string, number>();
  if (sets.length) for (const x of await repo.findMany("AssessmentQuestion", { assessmentId: { in: sets.map((a) => a.assessmentId) } }, { select: ["assessmentId"] })) setSize.set(s(x.assessmentId), (setSize.get(s(x.assessmentId)) ?? 0) + 1);
  // adaptive sets: the student answers up to maxQuestions of the pool
  if (sets.length) for (const x of await repo.findMany("Assessment", { id: { in: sets.map((a) => a.assessmentId) }, isAdaptive: true }, { select: ["id", "maxQuestions"] })) setSize.set(s(x.id), Math.min(setSize.get(s(x.id)) ?? 0, Number(x.maxQuestions) || 0));
  const skillIds = [...new Set(assignments.map((a) => skillOf(a)!))];
  const [skills, links] = await Promise.all([
    skillIds.length ? repo.findMany("Skill", { id: { in: skillIds } }, { select: ["id", "name", "code"] }) : Promise.resolve([] as Row[]),
    skillIds.length ? repo.findMany("SkillStandard", { skillId: { in: skillIds } }) : Promise.resolve([] as Row[]),
  ]);
  const stds = links.length ? await repo.findMany("Standard", { id: { in: [...new Set(links.map((l) => l.standardId))] } }, { select: ["id", "code"] }) : [];
  const stdCode = new Map(stds.map((x) => [s(x.id), s(x.code).replace(/^CCSS\.ELA-LITERACY\./, "")]));
  const primary = (skillId: string) => {
    const l = links.filter((x) => x.skillId === skillId).sort((p, q) => Number(q.isPrimary) - Number(p.isPrimary))[0];
    return l ? stdCode.get(s(l.standardId)) ?? null : null;
  };
  const items: AssignedSkill[] = assignments.map((a) => {
    const r = fresh.find((x) => x.assignmentId === a.id)!;
    const skillId = skillOf(a)!;
    const startAt = d(a.startAt);
    return {
      kind: "skill" as const, track: (a.track === "MAP" ? "MAP" : a.track === "NAFS" ? "NAFS" : "CURRICULUM") as AssignedSkill["track"], assignmentId: s(a.id), skillId, skill: s(skills.find((k) => k.id === skillId)?.name ?? a.title), standard: primary(skillId),
      grammar: s(skills.find((k) => k.id === skillId)?.code).toLowerCase().includes(".grammar."),
      assignedAt: d(a.createdAt)!.toISOString(), startAt: startAt?.toISOString() ?? null, dueAt: d(a.dueAt)?.toISOString() ?? null,
      status: r.status as Status, progress: Number(r.progress), note: a.note ? s(a.note) : null, startsLater: Boolean(startAt && startAt > now),
      completedAt: d(r.completedAt)?.toISOString() ?? null,
    };
  });
  for (const a of sets) {
    const r = fresh.find((x) => x.assignmentId === a.id);
    if (!r) continue;
    const startAt = d(a.startAt);
    items.push({
      kind: "questions", track: (a.track === "MAP" ? "MAP" : a.track === "NAFS" ? "NAFS" : "CURRICULUM") as AssignedSkill["track"], questionCount: setSize.get(s(a.assessmentId)) ?? 0, assignmentId: s(a.id), skillId: "", skill: hideLevels(s(a.title)), standard: null,
      assignedAt: d(a.createdAt)!.toISOString(), startAt: startAt?.toISOString() ?? null, dueAt: d(a.dueAt)?.toISOString() ?? null,
      status: r.status as Status, progress: Number(r.progress), note: a.note ? s(a.note) : null, startsLater: Boolean(startAt && startAt > now), completedAt: d(r.completedAt)?.toISOString() ?? null,
    });
  }
  const order: Record<Status, number> = { OVERDUE: 0, IN_PROGRESS: 1, NOT_STARTED: 2, COMPLETED: 3 };
  items.sort((x, y) => order[x.status] - order[y.status] || (x.dueAt ?? "9").localeCompare(y.dueAt ?? "9") || y.assignedAt.localeCompare(x.assignedAt));
  const count = (st: Status) => items.filter((i) => i.status === st).length;
  await createDueReminders(repo, actor, items, now);
  return {
    summary: { assigned: items.length, completed: count("COMPLETED"), inProgress: count("IN_PROGRESS"), notStarted: count("NOT_STARTED"), overdue: count("OVERDUE") },
    newThisWeek: items.filter((i) => now.getTime() - Date.parse(i.assignedAt) < 7 * 86_400_000).length,
    items,
  };
}

/** "Due soon" and "Overdue" notifications: at most one of each per assignment. */
async function createDueReminders(repo: Repo, actor: Actor, items: AssignedSkill[], now: Date): Promise<void> {
  const want: { link: string; title: string; body: string }[] = [];
  for (const i of items) {
    if (i.status === "COMPLETED" || !i.dueAt) continue;
    const due = Date.parse(i.dueAt), link = `/student/assignments/${i.assignmentId}`;
    if (due < now.getTime()) want.push({ link, title: `Overdue: ${i.skill}`, body: `This skill was due on ${i.dueAt.slice(0, 10)}. You can still finish it.` });
    else if (due - now.getTime() <= DUE_SOON_MS) want.push({ link, title: `Due soon: ${i.skill}`, body: `Finish this skill by ${i.dueAt.slice(0, 10)}.` });
  }
  if (!want.length) return;
  const have = await repo.findMany("Notification", { userId: actor.userId, type: "ASSIGNMENT_DUE" }, { select: ["title", "link"] });
  const seen = new Set(have.map((n) => `${n.link}|${n.title}`));
  const fresh = want.filter((w) => !seen.has(`${w.link}|${w.title}`));
  if (fresh.length) await repo.createMany("Notification", fresh.map((w) => ({ userId: actor.userId, type: "ASSIGNMENT_DUE", ...w, createdAt: now })));
}

/** Server-side gate: a student may practise a skill only if a (started) assignment includes it. */
export async function isAssignedSkill(repo: Repo, actor: Actor, skillId: string, now = new Date()): Promise<boolean> {
  const studentId = ownStudentId(actor);
  const rows = await repo.findMany("AssignmentStudent", { studentId }, { select: ["assignmentId"] });
  if (!rows.length) return false;
  const list = await repo.findMany("Assignment", { id: { in: rows.map((r) => r.assignmentId) }, deletedAt: null }, { select: ["skillId", "skillIds", "startAt"] });
  return list.some((a) => skillOf(a) === skillId && !(d(a.startAt) && d(a.startAt)! > now));
}

// ------------------------------------------------------------------ placement switch

const PLACEMENT_KEY = "student.placement";

export async function placementRequired(repo: Repo, schoolId: string): Promise<boolean> {
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: PLACEMENT_KEY }))[0];
  const v = row ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : null;
  return Boolean(v && (v as { required?: boolean }).required);
}

export async function setPlacementRequired(repo: Repo, actor: Actor, required: boolean): Promise<void> {
  assertCan(actor, "settings:school");
  if (!actor.schoolId) throw new ForbiddenError("No school.");
  const value = { required: Boolean(required) };
  await repo.upsert("SchoolSetting", { schoolId: actor.schoolId, key: PLACEMENT_KEY }, { value, updatedBy: actor.userId }, { value, updatedBy: actor.userId });
  await audit(repo, { actorId: actor.userId, action: "settings.update", entityType: "SchoolSetting", entityId: `${actor.schoolId}:${PLACEMENT_KEY}`, after: value });
}

// ------------------------------------------------------------------ completion report

export interface AssignmentReport {
  assignmentId: string; student: string; skill: string; standard: string | null; status: Status;
  score: number; accuracy: number | null; answered: number; correct: number; timeSpentMin: number; masteryLevel: string; completedAt: string | null;
  strengths: string[]; needsPractice: string[]; nextStep: string;
}

const BAND_LABEL: Record<string, string> = { NOT_STARTED: "Not started", BEGINNING: "Beginning", DEVELOPING: "Developing", APPROACHING: "Approaching", PROFICIENT: "Proficient", MASTERED: "Mastered", ADVANCED: "Advanced" };
const TYPE_LABEL: Record<string, string> = { MULTIPLE_CHOICE: "multiple-choice questions", MULTI_SELECT: "select-all questions", TRUE_FALSE: "true/false questions", FILL_BLANK: "fill-in-the-blank questions", DROPDOWN: "drop-down questions", SENTENCE_ORDER: "ordering questions", WORD_ORDER: "word-order questions", ERROR_CORRECTION: "error-correction questions", MATCHING: "matching questions", SHORT_ANSWER: "short answers" };
const LEVEL_GROUP = (lvl: number) => (lvl <= 2 ? "easier questions" : lvl <= 4 ? "grade-level questions" : "harder questions");

/**
 * Report for one student on one assignment. Rule-based feedback from the real answers given for
 * the assignment: accuracy by question difficulty and by question type (strong ≥ 80%, needs
 * practice < 60%, at least 3 answers in a group), speed of answers, and the final mastery.
 */
export async function assignmentReport(repo: Repo, actor: Actor, assignmentId: string, studentIdArg?: string): Promise<AssignmentReport> {
  const a = await repo.findUnique("Assignment", { id: assignmentId });
  if (!a || a.deletedAt || (!skillOf(a) && !a.assessmentId)) throw new ForbiddenError("Assignment not found.");
  let studentId: string;
  if (actor.role === "STUDENT") {
    studentId = ownStudentId(actor);
    if (studentIdArg && studentIdArg !== studentId) throw new ForbiddenError("You can only see your own report.");
  } else {
    assertCan(actor, "reports:read");
    await assertClassAccess(repo, actor, s(a.classId));
    studentId = s(studentIdArg);
  }
  const row = (await repo.findMany("AssignmentStudent", { assignmentId, studentId }))[0];
  if (!row) throw new ForbiddenError("This skill was not assigned to that student.");
  if (!skillOf(a)) return questionSetReport(repo, a, row, studentId);
  const skillId = skillOf(a)!;
  const [skill, sessions, mastery, links, st] = await Promise.all([
    repo.findUnique("Skill", { id: skillId }),
    repo.findMany("PracticeSession", { assignmentId, studentId }, { select: ["id", "activeMs"] }),
    repo.findMany("StudentSkillMastery", { studentId, skillId }, { select: ["score", "band"] }),
    repo.findMany("SkillStandard", { skillId }),
    repo.findUnique("Student", { id: studentId }),
  ]);
  const attempts = sessions.length ? await repo.findMany("QuestionAttempt", { sessionId: { in: sessions.map((x) => x.id) } }, { select: ["questionId", "isCorrect", "responseMs"] }) : [];
  const questions = attempts.length ? await repo.findMany("Question", { id: { in: [...new Set(attempts.map((x) => x.questionId))] } }, { select: ["id", "difficultyLevel", "typeId"] }) : [];
  const types = questions.length ? await repo.findMany("QuestionType", { id: { in: [...new Set(questions.map((q) => q.typeId))] } }, { select: ["id", "code"] }) : [];
  const [user, std] = await Promise.all([
    st ? repo.findUnique("User", { id: st.userId }) : Promise.resolve(null),
    links.length ? repo.findUnique("Standard", { id: links.sort((p, q) => Number(q.isPrimary) - Number(p.isPrimary))[0].standardId }) : Promise.resolve(null),
  ]);
  const qById = new Map(questions.map((q) => [s(q.id), q]));
  const typeCode = new Map(types.map((t) => [s(t.id), s(t.code)]));
  const answered = attempts.length, correct = attempts.filter((x) => x.isCorrect).length;
  const groups = new Map<string, { n: number; ok: number }>();
  const add = (k: string, ok: boolean) => { const g = groups.get(k) ?? { n: 0, ok: 0 }; g.n++; if (ok) g.ok++; groups.set(k, g); };
  for (const x of attempts) {
    const q = qById.get(s(x.questionId));
    if (!q) continue;
    add(LEVEL_GROUP(Number(q.difficultyLevel)), Boolean(x.isCorrect));
    add(TYPE_LABEL[typeCode.get(s(q.typeId)) ?? ""] ?? "other questions", Boolean(x.isCorrect));
  }
  const strengths: string[] = [], needs: string[] = [];
  for (const [k, g] of groups) {
    if (g.n < 3) continue;
    const pct = Math.round((100 * g.ok) / g.n);
    if (pct >= 80) strengths.push(`${k[0].toUpperCase()}${k.slice(1)}: ${pct}% correct`);
    else if (pct < 60) needs.push(`${k[0].toUpperCase()}${k.slice(1)}: ${pct}% correct`);
  }
  const fast = attempts.filter((x) => Number(x.responseMs) < 4000).length;
  if (answered >= 5 && fast / answered > 0.3) needs.push("Slow down: many answers were given in under 4 seconds");
  const score = Math.round(Number(mastery[0]?.score ?? 0));
  const accuracy = answered ? Math.round((100 * correct) / answered) : null;
  const target = Number(a.targetMastery ?? DEFAULT_TARGET_MASTERY);
  const status = row.status as Status;
  const nextStep = status !== "COMPLETED"
    ? answered < MIN_ANSWERS_TO_COMPLETE ? `Keep practising: answer at least ${MIN_ANSWERS_TO_COMPLETE - answered} more question(s) to finish this skill.` : `Keep practising until your mastery reaches ${target}%.`
    : score >= 90 ? "Excellent! You have mastered this skill. Check your other assigned skills or ask your teacher for a new challenge."
    : needs.length ? `Well done! Review the area that needs practice (${needs[0].split(":")[0].toLowerCase()}) to make this skill even stronger.`
    : "Well done! You completed this skill. Practise it again later to keep it strong.";
  return {
    assignmentId, student: s(user?.displayName ?? "Student"), skill: s(skill?.name ?? a.title), standard: std ? s(std.code).replace(/^CCSS\.ELA-LITERACY\./, "") : null, status,
    score, accuracy, answered, correct, timeSpentMin: Math.round(sessions.reduce((n, x) => n + Number(x.activeMs ?? 0), 0) / 60000), masteryLevel: BAND_LABEL[s(mastery[0]?.band)] ?? "Not started",
    completedAt: d(row.completedAt)?.toISOString() ?? null, strengths, needsPractice: needs, nextStep,
  };
}


/** Report for a teacher's question set: score, right/wrong, time, and strengths/needs by skill. */
async function questionSetReport(repo: Repo, a: Row, row: Row, studentId: string): Promise<AssignmentReport> {
  const [sessions, setItems, st] = await Promise.all([
    repo.findMany("PracticeSession", { assignmentId: a.id, studentId, mode: "TEACHER_QUIZ" }, { select: ["id", "activeMs"] }),
    repo.findMany("AssessmentQuestion", { assessmentId: a.assessmentId }, { select: ["questionId"] }),
    repo.findUnique("Student", { id: studentId }),
  ]);
  const attempts = sessions.length ? await repo.findMany("QuestionAttempt", { sessionId: { in: sessions.map((x) => x.id) } }, { select: ["questionId", "skillId", "isCorrect"] }) : [];
  const [user, skills] = await Promise.all([
    st ? repo.findUnique("User", { id: st.userId }) : Promise.resolve(null),
    attempts.length ? repo.findMany("Skill", { id: { in: [...new Set(attempts.map((x) => x.skillId))] } }, { select: ["id", "name"] }) : Promise.resolve([] as Row[]),
  ]);
  const total = setItems.length, answered = attempts.length, correct = attempts.filter((x) => x.isCorrect).length;
  // MAP practice tests group by MAP goal area (skill → family → goal area); other sets by skill
  const set = a.assessmentId ? await repo.findUnique("Assessment", { id: a.assessmentId }) : null;
  const groupOf = new Map<string, string>();
  if (set?.type === "BENCHMARK" && skills.length) {
    const full = await repo.findMany("Skill", { id: { in: skills.map((k) => k.id) } }, { select: ["id", "familyId"] });
    const fams = await repo.findMany("SkillFamily", { id: { in: [...new Set(full.map((k) => s(k.familyId)))] } }, { select: ["id", "mapGoalAreaId"] });
    const areas = await repo.findMany("MapGoalArea", { id: { in: [...new Set(fams.map((f) => s(f.mapGoalAreaId)).filter(Boolean))] } }, { select: ["id", "name"] });
    for (const k of full) { const f = fams.find((x) => x.id === k.familyId); const ar = f ? areas.find((x) => x.id === f.mapGoalAreaId) : undefined; if (ar) groupOf.set(s(k.id), `MAP: ${s(ar.name)}`); }
  }
  const bySkill = new Map<string, { n: number; ok: number }>();
  for (const x of attempts) { const key = groupOf.get(s(x.skillId)) ?? s(x.skillId); const g = bySkill.get(key) ?? { n: 0, ok: 0 }; g.n++; if (x.isCorrect) g.ok++; bySkill.set(key, g); }
  const strengths: string[] = [], needs: string[] = [];
  for (const [skillId, g] of bySkill) {
    const name = skillId.startsWith("MAP: ") ? skillId.slice(5) : s(skills.find((k) => k.id === skillId)?.name ?? "Skill"), pct = Math.round((100 * g.ok) / g.n);
    if (g.ok === g.n) strengths.push(`${name}: ${g.ok} of ${g.n} correct`);
    else if (pct < 60) needs.push(`${name}: ${g.ok} of ${g.n} correct`);
  }
  let total2 = total;
  let reached: string | null = null;
  if (set?.isAdaptive && sessions[0]) {
    // adaptive: the score is over the questions answered; the result is the level reached and the path
    const order = (await repo.findMany("AssessmentQuestion", { assessmentId: a.assessmentId })).map((x) => s(x.questionId));
    const st = await adaptiveNext(repo, set, order, s(sessions[0].id), studentId);
    total2 = Math.max(answered, 1);
    const N = { SUPPORT: "🛟 Support (grade below)", BELOW: "Below", ON: "On", ABOVE: "Above", CHALLENGE: "🚀 Challenge (grade above)" } as const;
    const lv = st.decision.level;
    reached = `${st.done ? "Reached" : "Now at"} ${N[lv]}${lv === "SUPPORT" || lv === "CHALLENGE" ? "" : " Level"} (path: ${st.decision.path.map((l) => N[l]).join(" → ")})`;
  }
  const score = total2 ? Math.round((100 * correct) / total2) : 0;
  const status = row.status as Status;
  const nextStep = status !== "COMPLETED" ? (set?.isAdaptive ? "Keep going: 4 correct answers out of 5 move you up a level." : `Answer the remaining ${Math.max(0, total - answered)} question(s) to finish.`)
    : score >= 90 ? "Excellent work! Ask your teacher for a new challenge."
    : needs.length ? `Good effort. Review ${needs[0].split(":")[0]} and ask your teacher about the questions you missed.` : "Well done! Keep practising to stay strong.";
  return {
    assignmentId: s(a.id), student: s(user?.displayName ?? "Student"), skill: s(a.title), standard: null, status,
    score, accuracy: answered ? Math.round((100 * correct) / answered) : null, answered, correct,
    timeSpentMin: Math.round(sessions.reduce((n, x) => n + Number(x.activeMs ?? 0), 0) / 60000), masteryLevel: reached ?? `${correct} of ${total} correct`,
    completedAt: d(row.completedAt)?.toISOString() ?? null, strengths, needsPractice: needs, nextStep,
  };
}
