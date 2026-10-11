"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { aiEnv } from "@/server/ai/env";
import { approveAiDraft, assignReteach, createTask, dismissAiDraft, requestAiDraft, scoreResearchAnswers, scoreSubmission, type TaskKind } from "@/server/teacher/writing";

const STAFF = { roles: ["TEACHER", "SCHOOL_ADMIN"] as ("TEACHER" | "SCHOOL_ADMIN")[], permission: "assignments:create" as const };
const str = (f: FormData, k: string) => String(f.get(k) ?? "");
/** Runs a teacher action; validation and permission problems come back as a message. */
async function run(fn: () => Promise<string>): Promise<string> {
  try { return await fn(); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return `⚠️ ${e.message}`; throw e; }
}
const back = (f: FormData, msg: string, anchor = true) => `/teacher/writing?classId=${encodeURIComponent(str(f, "classId"))}&task=${encodeURIComponent(str(f, "taskId"))}&msg=${encodeURIComponent(msg)}${anchor && f.get("studentId") ? `#s-${str(f, "studentId")}` : ""}`;
const prefixed = (f: FormData, p: string) => { const o: Record<string, string> = {}; for (const [k, v] of f.entries()) if (k.startsWith(p)) o[k.slice(p.length)] = String(v); return o; };

export async function createTaskAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const classId = str(f, "classId");
  const sources = [1, 2, 3].map((i) => ({ title: str(f, `src${i}.title`), text: str(f, `src${i}.text`) }));
  const research = [1, 2, 3].map((i) => {
    const kind = str(f, `rq${i}.kind`) === "MC" ? "MC" : "SHORT";
    const options = ["A", "B", "C", "D"].map((l) => str(f, `rq${i}.opt${l}`).trim()).filter(Boolean);
    return { q: str(f, `rq${i}.q`), kind, options, answer: ["A", "B", "C", "D"].indexOf(str(f, `rq${i}.answer`)) };
  });
  let to = "";
  const msg = await run(async () => {
    const id = await createTask(repo, actor, {
      classId, kind: (f.get("kind") === "READ_ALOUD" ? "READ_ALOUD" : "WRITE") as TaskKind, title: str(f, "title"), prompt: str(f, "prompt"), passage: str(f, "passage") || null,
      minWords: Number(f.get("minWords")) || null, dueAt: f.get("dueAt") ? new Date(`${str(f, "dueAt")}T20:59:00Z`) : null,
      genre: str(f, "genre") || "FREE", staged: f.get("staged") === "1", aiFeedback: f.get("aiFeedback") === "1", skillId: str(f, "skillId") || null, sources, research,
    });
    to = `/teacher/writing?classId=${classId}&task=${id}&msg=${encodeURIComponent("✓ Sent. Students were notified.")}`;
    return "";
  });
  redirect(to || `/teacher/writing?classId=${classId}&msg=${encodeURIComponent(msg)}`);
}

export async function scoreAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const scores: Record<string, number> = {};
  for (const [k, v] of Object.entries(prefixed(f, "s."))) scores[k] = Number(v);
  const msg = await run(async () => {
    const r = await scoreSubmission(repo, actor, str(f, "taskId"), str(f, "studentId"), scores, str(f, "comment"), new Date(), f.get("wcpm") ? Number(f.get("wcpm")) : null, { moves: f.getAll("move").map(String).filter(Boolean), codes: f.getAll("code").map(String).filter(Boolean) });
    return r === "REVISE" ? "✓ Feedback sent. The student now revises the draft." : "✓ Scored. The student can see it.";
  });
  redirect(back(f, msg));
}

export async function approveAiAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const msg = await run(async () => {
    const r = await approveAiDraft(repo, actor, str(f, "taskId"), str(f, "studentId"), {
      scores: prefixed(f, "s."), strengths: prefixed(f, "strength."), nextSteps: prefixed(f, "next."), codes: f.getAll("code").map(String).filter(Boolean),
      summary: str(f, "summary"), comment: str(f, "comment") || null, moves: f.getAll("move").map(String).filter(Boolean),
    });
    return r === "REVISE" ? "✓ Approved. The student sees the feedback and revises." : "✓ Approved and scored. The student can see it.";
  });
  redirect(back(f, msg));
}

export async function dismissAiAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const msg = await run(async () => { await dismissAiDraft(repo, actor, str(f, "taskId"), str(f, "studentId")); return "✓ AI draft dismissed. Score by hand."; });
  redirect(back(f, msg));
}

export async function requestAiAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const msg = await run(async () => {
    const r = await requestAiDraft(repo, actor, str(f, "taskId"), str(f, "studentId"), aiEnv());
    return r.outcome === "PENDING" ? "✓ The AI draft is ready to check." : `⚠️ ${r.reason ?? "No AI draft."}`;
  });
  redirect(back(f, msg));
}

export async function researchScoreAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const msg = await run(async () => { await scoreResearchAnswers(repo, actor, str(f, "taskId"), str(f, "studentId"), prefixed(f, "r.")); return "✓ Research answers scored."; });
  redirect(back(f, msg));
}

export async function reteachAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const ids = f.getAll("studentIds").map(String).filter(Boolean);
  const msg = await run(async () => {
    const r = await assignReteach(repo, actor, { taskId: str(f, "taskId"), skillId: str(f, "skillId"), studentIds: ids.length ? ids : undefined });
    return `✓ Assigned to ${r.students} student${r.students === 1 ? "" : "s"}.`;
  });
  redirect(back(f, msg));
}
