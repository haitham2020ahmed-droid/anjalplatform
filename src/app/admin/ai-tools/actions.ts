"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { aiEnv } from "@/server/ai/env";
import { setAiSettings, type ProviderName } from "@/server/ai/engine";
import { createJob, reviewMany, reviewSuggestion, runDuplicates, runWeekly, stopJob, tick, type Tool } from "@/server/ai/jobs";
import { finishStep, resetWizard, startStep, type StepKey } from "@/server/ai/wizard";

const friendly = (e: unknown) => { if (e instanceof ValidationError || e instanceof ForbiddenError) return e.message; throw e; };

/** One step of the AI queue (called again and again by the progress bar). */
export async function tickAction(jobId: string | null): Promise<{ done: number; total: number; failed: number; status: string | null; waitMs: number; message: string | null; idle: boolean }> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  try {
    const r = await tick(repo, actor, aiEnv(), { jobId: jobId ?? undefined });
    return { done: r.job?.done ?? 0, total: r.job?.total ?? 0, failed: r.job?.failed ?? 0, status: r.job?.status ?? null, waitMs: r.waitMs, message: r.message, idle: r.idle };
  } catch (e) { return { done: 0, total: 0, failed: 0, status: null, waitMs: 0, message: friendly(e), idle: true }; }
}

export async function startToolAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const tool = String(f.get("tool") ?? ""), grade = Number(f.get("grade")) || undefined, skillId = String(f.get("skillId") ?? "") || undefined, section = String(f.get("section") ?? "") || undefined;
  let q: Record<string, string>;
  try {
    if (tool === "DUPLICATE") { const n = await runDuplicates(repo, actor, { grade, skillId, section }); q = { tab: "review", tool: "DUPLICATE", msg: `${n} possible duplicate(s) found.` }; }
    else { const j = await createJob(repo, actor, tool as Tool, { grade, skillId, section }); q = { tab: "tools", job: j.id, msg: `Started: ${j.total} item(s).` }; }
  } catch (e) { q = { tab: "tools", msg: friendly(e) }; }
  redirect(`/admin/ai-tools?${new URLSearchParams(q)}`);
}

export async function stopJobAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  await stopJob(repo, actor, String(f.get("jobId") ?? ""));
  redirect("/admin/ai-tools?tab=tools&msg=Stopped.");
}

export async function reviewAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const back = String(f.get("back") ?? "/admin/ai-tools?tab=review");
  const [one, oneDecision] = String(f.get("one") ?? "").split("|");
  const decision = (one ? oneDecision : f.get("decision")) === "REJECT" ? "REJECT" : "APPROVE";
  let msg: string;
  try {
    if (one) { await reviewSuggestion(repo, actor, one, decision); msg = decision === "APPROVE" ? "Approved." : "Rejected."; }
    else { const ids = f.getAll("ids").map(String); const n = await reviewMany(repo, actor, ids, decision); msg = `${decision === "APPROVE" ? "Approved" : "Rejected"}: ${n}.`; }
  } catch (e) { msg = friendly(e); }
  redirect(`${back}${back.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
}

export async function weeklyAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  let msg: string;
  try { const r = await runWeekly(repo, actor); msg = r.queued ? `Queued Quality Check and Auto-Tag for ${r.queued} new question(s).` : "No new questions to check."; } catch (e) { msg = friendly(e); }
  redirect(`/admin/ai-tools?tab=tools&msg=${encodeURIComponent(msg)}`);
}

export async function settingsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "settings:engine" });
  let msg: string;
  try { await setAiSettings(repo, actor, { provider: String(f.get("provider")) as ProviderName, perMinute: Number(f.get("perMinute")), perDay: Number(f.get("perDay")), batch: Number(f.get("batch")) }); msg = "Saved."; } catch (e) { msg = friendly(e); }
  revalidatePath("/admin/ai-tools");
  redirect(`/admin/ai-tools?tab=settings&msg=${encodeURIComponent(msg)}`);
}

export async function wizardAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const skillId = String(f.get("skillId") ?? ""), step = String(f.get("step") ?? "") as StepKey, op = String(f.get("op") ?? "");
  let msg = "";
  try {
    if (op === "start") await startStep(repo, actor, skillId, step);
    else if (op === "next") await finishStep(repo, actor, skillId, step);
    else if (op === "reset") await resetWizard(repo, actor, skillId);
  } catch (e) { msg = friendly(e); }
  redirect(`/admin/ai-tools/wizard/${skillId}${msg ? `?msg=${encodeURIComponent(msg)}` : ""}`);
}
