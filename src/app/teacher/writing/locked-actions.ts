"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { aiEnv } from "@/server/ai/env";
import { aiGradeLocked, createLockedTask, deleteRubric, reopenLocked, saveAiNotes, saveLockedGrade, saveRubric, type AssignTo } from "@/server/writing/locked";

const STAFF = { roles: ["TEACHER", "SCHOOL_ADMIN"] as ("TEACHER" | "SCHOOL_ADMIN")[], permission: "assignments:create" as const };
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
const enc = encodeURIComponent;
async function run(fn: () => Promise<string>): Promise<string> {
  try { return await fn(); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return `⚠️ ${e.message}`; throw e; }
}
/** A due date typed in the school's time (Saudi Arabia, UTC+3). */
const saudi = (v: string) => (v ? new Date(`${v.length === 10 ? `${v}T23:59` : v}:00+03:00`) : null);
const gradePage = (f: FormData, msg: string) => `/teacher/writing/task/${enc(str(f, "taskId"))}/${enc(str(f, "studentId"))}?msg=${enc(msg)}`;

export async function createLockedTaskAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const classId = str(f, "classId");
  let to = "";
  const msg = await run(async () => {
    const mode = str(f, "rubricMode"), saved = mode === "saved", text = mode === "text";
    const id = await createLockedTask(repo, actor, {
      classId, title: str(f, "title"), promptHtml: str(f, "promptHtml"), gradeLevel: Number(f.get("gradeLevel")) || null,
      minWords: Number(f.get("minWords")) || null, timeLimitMin: Number(f.get("timeLimitMin")) || null, dueAt: saudi(str(f, "dueAt")),
      rubricId: saved ? str(f, "rubricId") || null : null, rubric: saved || text ? undefined : str(f, "rubricJson"), saveRubric: f.get("saveRubric") === "1", shareRubric: f.get("shareRubric") === "1",
      rubricText: text ? str(f, "rubricText") : null, rubricTitle: text ? str(f, "rubricTitle") : null, aiNotes: str(f, "aiNotes") || null,
      assignTo: (str(f, "assignTo") || "CLASS") as AssignTo, groupId: str(f, "groupId") || null, studentIds: f.getAll("studentIds").map(String),
    });
    to = `/teacher/writing/task/${enc(id)}?msg=${enc("✓ Assigned. The students were notified.")}`;
    return "";
  });
  redirect(to || `/teacher/writing/new?classId=${enc(classId)}&msg=${enc(msg)}`);
}

export async function saveRubricAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const msg = await run(async () => {
    let r: Record<string, unknown> = {};
    try { r = JSON.parse(str(f, "rubricJson") || "{}") as Record<string, unknown>; } catch { /* validated below */ }
    await saveRubric(repo, actor, { title: r.title, criteria: r.criteria, shared: f.get("shareRubric") === "1" });
    return "✓ Rubric saved.";
  });
  redirect(`/teacher/writing/rubrics?msg=${enc(msg)}`);
}

export async function deleteRubricAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const msg = await run(async () => { await deleteRubric(repo, actor, str(f, "rubricId")); return "✓ Rubric removed. Tasks that used it keep their copy."; });
  redirect(`/teacher/writing/rubrics?msg=${enc(msg)}`);
}

/** Saves the grade (draft), or “Approve & Return” (approve=1). */
export async function saveGradeAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const approve = str(f, "approve") === "1";
  const levels: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (k.startsWith("level.")) levels[k.slice(6)] = String(v);
  const msg = await run(async () => {
    const r = await saveLockedGrade(repo, actor, str(f, "taskId"), str(f, "studentId"), { levels, comment: str(f, "comment"), sentences: str(f, "sentences") || "[]" }, approve);
    return approve ? `✓ Approved and returned (${r.total}/${r.max}, ${r.pct}%). The student can see it.` : `✓ Saved (${r.total}/${r.max}). The student sees nothing until you approve.`;
  });
  redirect(gradePage(f, msg));
}

export async function aiGradeAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const msg = await run(async () => {
    if (f.has("aiNotes")) await saveAiNotes(repo, actor, str(f, "taskId"), str(f, "aiNotes"));
    const r = await aiGradeLocked(repo, actor, str(f, "taskId"), str(f, "studentId"), aiEnv());
    return r.outcome === "READY" ? (r.runs === 2 ? "✓ The AI suggestion is ready (read twice for consistency): check and edit it, then approve." : "✓ The AI suggestion is ready: check and edit it, then approve.") : `⚠️ ${r.reason ?? "No AI suggestion."}`;
  });
  redirect(gradePage(f, msg));
}

export async function reopenAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const msg = await run(async () => { await reopenLocked(repo, actor, str(f, "taskId"), str(f, "studentId")); return "✓ Reopened. The student presses Start Writing to continue."; });
  redirect(str(f, "back") === "list" ? `/teacher/writing/task/${enc(str(f, "taskId"))}?msg=${enc(msg)}` : gradePage(f, msg));
}
