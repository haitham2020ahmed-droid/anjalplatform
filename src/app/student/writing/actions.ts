"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { aiEnv } from "@/server/ai/env";
import { runAfterResponse } from "@/server/lib/after-response";
import { draftForSubmission, savePlan, saveWriting, submitResearch } from "@/server/teacher/writing";

const prefixed = (f: FormData, p: string) => { const o: Record<string, string> = {}; for (const [k, v] of f.entries()) if (k.startsWith(p)) o[k.slice(p.length)] = String(v); return o; };
const go = (id: string, msg: string) => redirect(`/student/writing/${encodeURIComponent(id)}?msg=${encodeURIComponent(msg)}`);

export async function saveWritingAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const id = String(f.get("taskId")), submit = f.get("submit") === "1";
  let msg = submit ? "✅ Sent to your teacher!" : "💾 Draft saved.";
  try {
    const r = await saveWriting(repo, actor, id, String(f.get("text") ?? ""), submit, new Date(), { checklist: prefixed(f, "c."), movesDone: f.getAll("moveDone").map(String) });
    if (submit && r.stage === "DRAFT") msg = "✅ Draft sent! Your teacher will give feedback, then you revise.";
    if (submit && r.stage === "FINAL") msg = "✅ Final version sent to your teacher!";
    if (r.ai) {
      // 🤖 r90 (stability audit, Oct 2026): the AI feedback draft (for the teacher to check) is made after the
      // reply, so the student does not wait — but this used to go through next/server's own after(), which has
      // no concurrency cap, unlike the project's own bounded queue every other deferred AI call uses (ReadRise's
      // writing score, readrise/student.ts). A whole class submitting writing in the same minute could otherwise
      // fire an unbounded burst of simultaneous AI calls. Now it shares the same AFTER_CONCURRENCY-limited queue.
      const studentId = actor.studentId!;
      runAfterResponse("writing.ai_feedback", () => draftForSubmission(repo, id, studentId, aiEnv()).then(() => undefined, () => undefined), { key: `writing.ai_feedback|${id}` });
    }
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  go(id, msg);
}

export async function savePlanAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const id = String(f.get("taskId")), finish = f.get("finish") === "1";
  let msg = finish ? "✅ Plan done! Now write your draft." : "💾 Plan saved.";
  try { await savePlan(repo, actor, id, prefixed(f, "p."), finish); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  go(id, msg);
}

export async function researchAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const id = String(f.get("taskId"));
  let msg: string;
  try {
    const r = await submitResearch(repo, actor, id, prefixed(f, "a."));
    msg = `✅ Answers saved${r.max ? ` (${r.points}/${r.max} so far${r.pending ? "; your teacher checks the rest" : ""})` : ""}. Now you can write.`;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  go(id, msg);
}
