"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { buildAllDiagnostics, buildDiagnostic, closeDiagnostic, openDiagnostic, resetDiagnosticAttempt, swapDiagnosticQuestion } from "@/server/diagnostic/test";
import { shareDiagnosticResults } from "@/server/diagnostic/report";
import { draftReflection, type Reflection } from "@/server/diagnostic/reflection";
import { aiEnv } from "@/server/ai/env";

const day = (v: FormDataEntryValue | null, end = false) => { const x = String(v ?? ""); return /^\d{4}-\d{2}-\d{2}$/.test(x) ? new Date(`${x}T${end ? "23:59:59" : "00:00:00"}`) : null; };
const msg = (path: string, m: string) => `${path}${path.includes("?") ? "&" : "?"}msg=${encodeURIComponent(m)}`;
async function run(back: string, fn: () => Promise<string>): Promise<never> {
  let to: string;
  try { to = await fn(); } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; to = msg(back, `⚠️ ${e.message}`); }
  redirect(to);
}

/** period (BOY | MOY | EOY; empty = by today's date) and form (full | focus, MOY / EOY only) come from the form when given */
const periodOpt = (f?: FormData | null) => ({ period: String(f?.get("period") ?? "") || null, form: String(f?.get("form") ?? "") || null });
export async function buildDiagnosticAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN"], permission: "assignments:create" });
  const back = String(f.get("back") || "/admin/diagnostic");
  await run(back, async () => { const r = await buildDiagnostic(repo, actor, { grade: Number(f.get("grade")), ...periodOpt(f) }); return msg(`/admin/diagnostic/${r.id}`, `${r.period}${r.form === "focus" ? " focus form" : ""} test built: ${r.questions} skill slots, adapting over ${r.pool} questions. Review it, then open the test.`); });
}
export async function buildAllDiagnosticsAction(f?: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN"], permission: "assignments:create" });
  await run("/admin/diagnostic", async () => {
    const r = await buildAllDiagnostics(repo, actor, new Date(), periodOpt(f));
    const done = r.built.map((b) => `Grade ${b.grade}`).join(", ");
    return msg("/admin/diagnostic", `${done ? `Built: ${done} (the same 50 skills).` : "No test built."}${r.skipped.length ? ` ⚠️ ${r.skipped.map((x) => x.reason).join(" ")}` : ""}`);
  });
}
export async function swapQuestionAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN"], permission: "assignments:create" });
  const id = String(f.get("id"));
  await run(`/admin/diagnostic/${id}`, async () => { await swapDiagnosticQuestion(repo, actor, id, String(f.get("questionId"))); return msg(`/admin/diagnostic/${id}`, `Question ${String(f.get("n"))} left out of the test.`); });
}
export async function openDiagnosticAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN"], permission: "assignments:create" });
  const id = String(f.get("id"));
  await run(`/admin/diagnostic/${id}`, async () => { const r = await openDiagnostic(repo, actor, id, { opensAt: day(f.get("opensAt")), closesAt: day(f.get("closesAt"), true), above: Number(f.get("above")) || undefined, on: Number(f.get("on")) || undefined }); return msg(`/admin/diagnostic/${id}`, `The test is open for ${r.classes || "every"} class(es), ${r.students} students. They were notified.`); });
}
export async function closeDiagnosticAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN"], permission: "assignments:create" });
  const id = String(f.get("id"));
  await run(`/admin/diagnostic/${id}`, async () => { await closeDiagnostic(repo, actor, id); return msg(`/admin/diagnostic/${id}`, "The test is closed."); });
}
/** Share one student's report (with a note) or every finished report of the class. */
export async function shareDiagnosticAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const back = String(f.get("back") || "/teacher/diagnostic");
  await run(back, async () => {
    const ids = f.getAll("studentId").map(String).filter(Boolean);
    const shared = String(f.get("shared")) !== "0";
    const note = f.has("note") ? String(f.get("note") ?? "") : undefined;
    const n = await shareDiagnosticResults(repo, actor, { testId: String(f.get("testId")), studentIds: ids, shared, note });
    return msg(back, !shared ? `Stopped sharing ${n} report(s).` : actor.role === "TEACHER" ? `📨 Sent ${n} report(s) to the school admin for approval. The families see them once approved.` : `Shared with ${n} student(s) and their families.`);
  });
}

/** 🐛 r91 fix ("لو النتيجة Invalid مفيش طريقة يعيد الطالب الاختبار"): clears one student's Diagnostic attempt
 * (an invalid, rapid-guessed result most of all) so they can retake it and the new attempt is actually recorded. */
export async function resetDiagnosticAttemptAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:create" });
  const back = String(f.get("back") || "/admin/diagnostic");
  const id = String(f.get("id")), studentId = String(f.get("studentId"));
  await run(back, async () => { await resetDiagnosticAttempt(repo, actor, id, studentId); return msg(back, "The attempt was reset. The student can take the Diagnostic again."); });
}

/** 🪞 Draft the reflection (Findings & Discussion) of the class analysis; the teacher edits it. */
export async function draftReflectionAction(testId: string, classId: string | null): Promise<Reflection | { error: string }> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  try { return await draftReflection(repo, actor, testId, classId, aiEnv()); }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) return { error: e.message }; throw e; }
}
