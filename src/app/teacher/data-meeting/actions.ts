"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { saveDataMeeting, MAX_DECISIONS } from "@/server/tiers/data-meeting";

/** 🗂️ Saves a data meeting: the snapshot prepared now, the decisions (who · what · how · owner · review date), notes. */
export async function saveDataMeetingAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const classId = String(f.get("classId") ?? "").slice(0, 191) || null;
  const grade = Number(f.get("grade") ?? 0) || null;
  const col = (k: string) => f.getAll(k).map((x) => String(x));
  const who = col("who"), what = col("what"), how = col("how"), owner = col("owner"), reviewOn = col("reviewOn");
  const decisions = who.slice(0, MAX_DECISIONS + 5).map((_, i) => ({ who: who[i], what: what[i], how: how[i], owner: owner[i], reviewOn: reviewOn[i] || null }));
  let msg = "✓ Meeting saved.";
  try {
    await saveDataMeeting(repo, actor, { classId, gradeLevel: classId ? null : grade, heldOn: String(f.get("heldOn") ?? "") || null, notes: String(f.get("notes") ?? "").slice(0, 5000), decisions });
  } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; msg = `⚠️ ${e.message}`; }
  const q = new URLSearchParams(classId ? { class: classId, msg } : { grade: String(grade ?? ""), msg });
  redirect(`/teacher/data-meeting?${q}`);
}
