"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { aiEnv } from "@/server/ai/env";
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
      // 🤖 the AI feedback draft (for the teacher to check) is made after the reply, so the student does not wait
      const studentId = actor.studentId!;
      const job = () => draftForSubmission(repo, id, studentId, aiEnv()).then(() => undefined, () => undefined);
      if (typeof after === "function") after(job); else await job();
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
