/**
 * 🔁 One question taken out of (or swapped in) every place that lists it — shared by the admin's "Delete" of an answered
 * question (src/server/admin/question-delete.ts: old → null) and by publishing a new version (src/server/admin/
 * questions.ts: old → new), so the two never disagree about what "everywhere" means.
 *
 *   pools        Curriculum Map place, Placement / MAP test uses, ReadMaster article, NAFS bank item: moved to the new
 *                version (or removed). Practice / adaptive / Learn pools read the bank itself, so they follow the
 *                question's status and the shared-bank rule (private-copies.ts) on their own.
 *   sets         every set a teacher made that NO student has started yet: assessments (AssessmentQuestion),
 *                assignments (Assignment.questionIds), NAFS tests and practices, exit tickets, live games still in
 *                the lobby, worksheets and Review sets. A started set keeps its questions as they were (its answers
 *                belong to them).
 *   current      a practice session waiting on the question forgets it (the next question is picked again).
 *
 * Students' answers (QuestionAttempt and the other answer tables) are never touched. Reads are batched.
 */
import type { Repo, Row } from "../seeding/repo";

const s = (v: unknown) => String(v ?? "");
const parse = (v: unknown): unknown => { if (typeof v !== "string") return v; try { return JSON.parse(v); } catch { return v; } };

export interface SwapResult { pools: number; sets: number; startedKept: number }

/** The list with each old id replaced (null = removed); duplicates are dropped. undefined when nothing changed. */
function swapList(raw: unknown, swap: Map<string, string | null>): unknown[] | undefined {
  const list = parse(raw);
  if (!Array.isArray(list)) return undefined;
  let changed = false;
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    const id = typeof x === "string" ? x : x && typeof x === "object" && "questionId" in (x as Record<string, unknown>) ? s((x as Record<string, unknown>).questionId) : null;
    if (id === null || !swap.has(id)) {
      if (typeof x === "string") { if (seen.has(x)) { changed = true; continue; } seen.add(x); }
      out.push(x);
      continue;
    }
    changed = true;
    const to = swap.get(id)!;
    if (to === null || seen.has(to)) continue;
    seen.add(to);
    out.push(typeof x === "string" ? to : { ...(x as Record<string, unknown>), questionId: to });
  }
  return changed ? out : undefined;
}

const touches = (raw: unknown, ids: Set<string>) => {
  const list = parse(raw);
  return Array.isArray(list) && list.some((x) => ids.has(typeof x === "string" ? x : s((x as Record<string, unknown>)?.questionId)));
};

async function* paged(repo: Repo, model: string, where: Record<string, unknown>, select: string[]): AsyncGenerator<Row[]> {
  let after = "";
  for (let guard = 0; guard < 2000; guard++) {
    const page = await repo.findMany(model, { ...where, ...(after ? { id: { gt: after } } : {}) }, { select, orderBy: [{ field: "id", dir: "asc" }], take: 500 });
    if (!page.length) return;
    yield page;
    if (page.length < 500) return;
    after = s(page[page.length - 1].id);
  }
}

/**
 * Takes each `old` question out of every pool and not-yet-started set of the school, or puts its new version `new`
 * in its place. Idempotent.
 */
export async function swapInSets(repo: Repo, schoolId: string, swap: Map<string, string | null>, now = new Date()): Promise<SwapResult> {
  const out: SwapResult = { pools: 0, sets: 0, startedKept: 0 };
  const olds = [...swap.keys()];
  if (!olds.length) return out;
  const oldSet = new Set(olds);
  const removed = olds.filter((o) => swap.get(o) === null);
  const moved = olds.filter((o) => swap.get(o));

  // ---- pools
  if (removed.length) {
    out.pools += await repo.deleteMany("QuestionMapLink", { questionId: { in: removed } });
    out.pools += await repo.deleteMany("QuestionUse", { questionId: { in: removed } });
    out.pools += await repo.deleteMany("ReadMasterQuestion", { questionId: { in: removed } });
    out.pools += await repo.deleteMany("NafsBankItem", { schoolId, questionId: { in: removed } });
  }
  for (const o of moved) {
    const to = swap.get(o)!;
    // the new version already carries the map place and the uses (copied when it was made): the old rows go
    if (await repo.count("QuestionMapLink", { questionId: to })) out.pools += await repo.deleteMany("QuestionMapLink", { questionId: o });
    else out.pools += await repo.updateMany("QuestionMapLink", { questionId: o }, { questionId: to });
    if (await repo.count("QuestionUse", { questionId: to })) out.pools += await repo.deleteMany("QuestionUse", { questionId: o });
    else out.pools += await repo.updateMany("QuestionUse", { questionId: o }, { questionId: to });
    for (const r of await repo.findMany("ReadMasterQuestion", { questionId: o }, { select: ["versionId"] })) {
      if (await repo.count("ReadMasterQuestion", { versionId: r.versionId, questionId: to })) await repo.deleteMany("ReadMasterQuestion", { versionId: r.versionId, questionId: o });
      else await repo.updateMany("ReadMasterQuestion", { versionId: r.versionId, questionId: o }, { questionId: to });
      out.pools++;
    }
    if (await repo.count("NafsBankItem", { schoolId, questionId: to })) out.pools += await repo.deleteMany("NafsBankItem", { schoolId, questionId: o });
    else out.pools += await repo.updateMany("NafsBankItem", { schoolId, questionId: o }, { questionId: to });
  }
  await repo.updateMany("PracticeSession", { currentQuestionId: { in: olds } }, { currentQuestionId: null, currentServedAt: null });

  // ---- assessments: only those no student has started (no session yet)
  const aq = await repo.findMany("AssessmentQuestion", { questionId: { in: olds } }, { select: ["assessmentId", "questionId"] });
  for (const a of aq) {
    if (await repo.count("PracticeSession", { assessmentId: a.assessmentId })) { out.startedKept++; continue; }
    const to = swap.get(s(a.questionId));
    if (to && !(await repo.count("AssessmentQuestion", { assessmentId: a.assessmentId, questionId: to }))) await repo.updateMany("AssessmentQuestion", { assessmentId: a.assessmentId, questionId: a.questionId }, { questionId: to });
    else await repo.deleteMany("AssessmentQuestion", { assessmentId: a.assessmentId, questionId: a.questionId });
    out.sets++;
  }

  // ---- teacher-made sets of the school (JSON id lists)
  const classes = (await repo.findMany("Class", { schoolId }, { select: ["id"] })).map((c) => s(c.id));
  const list = async (model: string, where: Record<string, unknown>, started: (row: Row) => Promise<boolean>, extra: Record<string, unknown> = {}) => {
    for await (const page of paged(repo, model, where, ["id", "questionIds"])) {
      for (const row of page) {
        if (!touches(row.questionIds, oldSet)) continue;
        if (await started(row)) { out.startedKept++; continue; }
        const next = swapList(row.questionIds, swap);
        if (!next) continue;
        await repo.updateMany(model, { id: row.id }, { questionIds: next, ...extra });
        out.sets++;
      }
    }
  };
  for (let i = 0; i < classes.length; i += 300) {
    await list("Assignment", { classId: { in: classes.slice(i, i + 300) }, deletedAt: null }, async (r) => (await repo.count("AssignmentStudent", { assignmentId: r.id, status: { not: "NOT_STARTED" } })) > 0);
  }
  await list("NafsTest", { schoolId, deletedAt: null }, async (r) => (await repo.count("NafsResult", { testId: r.id })) > 0, { updatedAt: now });
  await list("NafsPractice", { schoolId, deletedAt: null }, async (r) => (await repo.count("NafsPracticeRun", { practiceId: r.id })) > 0);
  await list("ExitTicket", { schoolId, status: "OPEN" }, async (r) => (await repo.count("ExitTicketAnswer", { ticketId: r.id })) > 0);
  await list("LiveGame", { schoolId, status: "LOBBY" }, async () => false);
  await list("Worksheet", { schoolId }, async () => false, { updatedAt: now });
  await list("TeacherReviewSet", { schoolId }, async () => false, { updatedAt: now });
  return out;
}
