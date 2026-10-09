"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignRespond, cancelRespond, saveRespondMarks } from "@/server/curriculum-map/respond-assign";

const friendly = (e: unknown) => { if (e instanceof ValidationError || e instanceof ForbiddenError) return e.message; throw e; };
const day = (v: FormDataEntryValue | null) => { const t = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T23:59:59`) : null; };

/** Sends a Text Set's Respond to Reading: “lv:<studentId>” = the level each student gets. */
export async function assignRespondAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), code = String(f.get("code") ?? "");
  let target: string;
  try {
    const skip = new Set(f.getAll("skip").map(String));
    const levels = Object.fromEntries([...f.keys()].filter((k) => k.startsWith("lv:") && !skip.has(k.slice(3))).map((k) => [k.slice(3), String(f.get(k) ?? "")]));
    const r = await assignRespond(repo, actor, { classId, code, levels, dueAt: day(f.get("dueAt")), note: String(f.get("note") ?? "") || null });
    const msg = `Sent to ${r.students} student(s): ${r.byLevel.BELOW} Below · ${r.byLevel.ON} On · ${r.byLevel.ABOVE} Above.${r.fallback ? ` ${r.fallback} got the On Level activity because their level has none yet.` : ""}`;
    target = `/teacher/respond/${r.assignmentId}?${new URLSearchParams({ msg })}`;
  } catch (e) { target = `/teacher/respond/assign?${new URLSearchParams({ classId, code, msg: friendly(e) })}`; }
  redirect(target);
}

export async function saveRespondMarksAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const id = String(f.get("id") ?? "");
  let msg: string;
  try {
    const ids = f.getAll("student").map(String);
    const n = await saveRespondMarks(repo, actor, id, ids.map((sid) => {
      const raw = String(f.get(`score:${sid}`) ?? "");
      return { studentId: sid, score: raw === "" ? null : Number(raw), feedback: String(f.get(`fb:${sid}`) ?? "") || null, finished: f.get(`done:${sid}`) === "1" };
    }));
    msg = `Saved (${n}).`;
  } catch (e) { msg = friendly(e); }
  redirect(`/teacher/respond/${id}?${new URLSearchParams({ msg })}`);
}

export async function cancelRespondAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const id = String(f.get("id") ?? ""), classId = String(f.get("classId") ?? "");
  let msg: string;
  try { await cancelRespond(repo, actor, id); msg = "Cancelled. Students no longer see it as a task."; } catch (e) { msg = friendly(e); }
  redirect(`/teacher/respond?${new URLSearchParams({ classId, msg })}`);
}
