"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { buildDiagnostic, closeDiagnostic, openDiagnostic, swapDiagnosticQuestion } from "@/server/diagnostic/test";
import { shareDiagnosticResults } from "@/server/diagnostic/report";

const day = (v: FormDataEntryValue | null, end = false) => { const x = String(v ?? ""); return /^\d{4}-\d{2}-\d{2}$/.test(x) ? new Date(`${x}T${end ? "23:59:59" : "00:00:00"}`) : null; };
const msg = (path: string, m: string) => `${path}${path.includes("?") ? "&" : "?"}msg=${encodeURIComponent(m)}`;
async function run(back: string, fn: () => Promise<string>): Promise<never> {
  let to: string;
  try { to = await fn(); } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; to = msg(back, `⚠️ ${e.message}`); }
  redirect(to);
}

export async function buildDiagnosticAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN"], permission: "assignments:create" });
  await run("/admin/diagnostic", async () => { const r = await buildDiagnostic(repo, actor, { grade: Number(f.get("grade")), size: Number(f.get("size")) || 50 }); return msg(`/admin/diagnostic/${r.id}`, `Test built: ${r.questions} questions. Review them, then open the test.`); });
}
export async function swapQuestionAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN"], permission: "assignments:create" });
  const id = String(f.get("id"));
  await run(`/admin/diagnostic/${id}`, async () => { await swapDiagnosticQuestion(repo, actor, id, String(f.get("questionId"))); return msg(`/admin/diagnostic/${id}`, `Question ${String(f.get("n"))} replaced.`); });
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
    return msg(back, shared ? `Shared with ${n} student(s) and their families.` : `Stopped sharing ${n} report(s).`);
  });
}
