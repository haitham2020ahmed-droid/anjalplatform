"use server";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { giveBonusCoins, staffClassOf } from "@/server/motivation/coins";
import { manualCertificate } from "@/server/motivation/certificates";

export type RewardFormState = { ok: boolean; msg: string } | null;
const fail = (e: unknown): RewardFormState => { if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, msg: e.message }; throw e; };

/** 🎁 Bonus coins: one student (studentId) or the whole class (classId) — the teacher's OWN classes only (server-checked). */
export async function giveBonusAction(_prev: RewardFormState, form: FormData): Promise<RewardFormState> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  try {
    const studentId = String(form.get("studentId") ?? "") || null;
    const classId = studentId ? await staffClassOf(repo, actor, studentId) : String(form.get("classId") ?? "");
    const r = await giveBonusCoins(repo, actor, { classId, studentIds: studentId ? [studentId] : null, amount: Number(form.get("amount")), note: String(form.get("note") ?? "") });
    revalidatePath(studentId ? `/teacher/students/${studentId}` : `/teacher/classes/${classId}`);
    return { ok: true, msg: `+${r.amount} × ${r.students}` };
  } catch (e) { return fail(e); }
}

/** 📜 A certificate for one of the teacher's own students. */
export async function createCertificateAction(_prev: RewardFormState, form: FormData): Promise<RewardFormState> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  try {
    const studentId = String(form.get("studentId") ?? "");
    await manualCertificate(repo, actor, { studentId, title: String(form.get("title") ?? ""), detail: String(form.get("detail") ?? "") });
    revalidatePath(`/teacher/students/${studentId}`);
    return { ok: true, msg: "✓" };
  } catch (e) { return fail(e); }
}
