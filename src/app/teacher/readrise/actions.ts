"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { allowPlacementRetake, assignArticle, scoreWriting, setStudentLevel, unassignArticle } from "@/server/readrise/teacher";
import { assignDatesOf } from "@/lib/assign-dates";

const STAFF = { roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] as ("TEACHER" | "SCHOOL_ADMIN" | "SUPER_ADMIN")[] };
const msgOf = (e: unknown) => { if (e instanceof ValidationError || e instanceof ForbiddenError) return e.message; throw e; };
const id = (f: FormData, k: string) => String(f.get(k) ?? "").slice(0, 64);
/** Back to the class dashboard (a fixed page; never a free URL), optionally on a tab / anchor. */
const back = (classId: string, msg: string, tab = "") =>
  redirect(`/teacher/readrise?class=${encodeURIComponent(classId)}${tab ? `&tab=${tab}` : ""}&msg=${encodeURIComponent(msg)}`);

/** Riyadh is UTC+3 with no daylight saving: a due date means the end of that school day there. */
function dueDate(raw: string): Date | null {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new ValidationError("The due date is not valid.");
  return new Date(`${raw}T23:59:00+03:00`);
}

/** 📌 Assign articles to a class (r68: a start date and an end / due date). */
export async function assignReadRiseAction(f: FormData): Promise<void> {
  const actor = await requireActor({ ...STAFF, permission: "assignments:create" });
  const classId = id(f, "classId");
  let msg: string;
  try {
    const articleIds = f.getAll("articleId").map(String).filter(Boolean).slice(0, 30);
    if (!articleIds.length) throw new ValidationError("Choose at least one article.");
    const due = dueDate(String(f.get("dueAt") ?? ""));
    const dates = assignDatesOf(f);
    if (dates.error) throw new ValidationError(dates.error);
    let created = 0;
    for (const a of articleIds) if ((await assignArticle(repo, actor, classId, a, due, new Date(), dates.startAt)).created) created++;
    revalidatePath("/teacher/readrise");
    msg = `${created} article${created === 1 ? "" : "s"} assigned${articleIds.length - created ? `, ${articleIds.length - created} updated` : ""}${due ? ` · due ${String(f.get("dueAt"))}` : ""}. Each student reads the version of their level.`;
  } catch (e) { msg = msgOf(e); }
  back(classId, msg, "assign");
}

export async function unassignReadRiseAction(f: FormData): Promise<void> {
  const actor = await requireActor({ ...STAFF, permission: "assignments:create" });
  const classId = id(f, "classId");
  let msg: string;
  try { await unassignArticle(repo, actor, classId, id(f, "articleId")); msg = "Removed from the class list."; }
  catch (e) { msg = msgOf(e); }
  back(classId, msg, "assign");
}

export async function scoreReadRiseWritingAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const classId = id(f, "classId");
  let msg: string;
  try {
    const raw = String(f.get("score") ?? "");
    if (raw === "") throw new ValidationError("Choose a score from 0 to 4.");
    await scoreWriting(repo, actor, id(f, "runId"), Number(raw), String(f.get("comment") ?? ""));
    msg = "Score saved: the student sees it with your comment.";
  } catch (e) { msg = msgOf(e); }
  back(classId, msg, "writing");
}

export async function setReadRiseLevelAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const classId = id(f, "classId");
  let msg: string;
  try {
    const r = await setStudentLevel(repo, actor, id(f, "studentId"), Number(f.get("level")), String(f.get("reason") ?? ""));
    msg = `ReadRise Level changed: ${r.from} → ${r.to}.`;
  } catch (e) { msg = msgOf(e); }
  back(classId, msg);
}

export async function allowReadRiseRetakeAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const classId = id(f, "classId");
  let msg: string;
  try {
    const r = await allowPlacementRetake(repo, actor, id(f, "studentId"), String(f.get("reason") ?? ""));
    msg = r.restarted ? "The placement test starts again from the first passage." : "Placement retake allowed: the student sees the placement test next time they open ReadRise.";
  }
  catch (e) { msg = msgOf(e); }
  back(classId, msg);
}
