"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { allowPlacementRetake, assertClassWrite, assignArticle, scoreWriting, setStudentLevel, unassignArticle } from "@/server/readrise/teacher";
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

/** 📌 Assign articles to one or more classes at once (r91: classIds[], was a single classId; r68: a start/due date). */
export async function assignReadRiseAction(f: FormData): Promise<void> {
  const actor = await requireActor({ ...STAFF, permission: "assignments:create" });
  // r91: the page shows checkboxes named "classIds" now; "classId" (singular) still works for one class, kept so
  // nothing breaks if an older tab/bookmark somehow posts the old field name.
  const classIds = [...new Set([...f.getAll("classIds"), ...f.getAll("classId")].map(String).filter(Boolean))].slice(0, 30);
  const backTo = classIds[0] ?? "";
  let msg: string;
  try {
    if (!classIds.length) throw new ValidationError("Choose at least one class.");
    const articleIds = f.getAll("articleId").map(String).filter(Boolean).slice(0, 30);
    if (!articleIds.length) throw new ValidationError("Choose at least one article.");
    const due = dueDate(String(f.get("dueAt") ?? ""));
    const dates = assignDatesOf(f);
    if (dates.error) throw new ValidationError(dates.error);
    // r97 fix: validate EVERY class before writing anything (all-or-nothing), so a bad class in the middle of the
    // list can never leave the earlier classes assigned and the later ones not.
    for (const c of classIds) await assertClassWrite(repo, actor, c);
    let created = 0;
    const total = classIds.length * articleIds.length;
    for (const c of classIds) for (const a of articleIds) if ((await assignArticle(repo, actor, c, a, due, new Date(), dates.startAt)).created) created++;
    revalidatePath("/teacher/readrise");
    const classesMsg = classIds.length > 1 ? ` across ${classIds.length} classes` : "";
    msg = `${created} article${created === 1 ? "" : "s"} assigned${classesMsg}${total - created ? `, ${total - created} updated` : ""}${due ? ` · due ${String(f.get("dueAt"))}` : ""}. Each student reads the version of their level.`;
  } catch (e) { msg = msgOf(e); }
  back(backTo, msg, "assign");
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
