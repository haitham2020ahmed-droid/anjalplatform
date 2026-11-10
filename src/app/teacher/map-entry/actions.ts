"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { failureMessage, isNextControl } from "@/server/lib/action-guard";
import { deleteMapEntryRow, saveMapEntry, type EntrySubject } from "@/server/map/map-entry";
import type { Season } from "@/server/map/rit";

/** ✏️ Saves the class table of MAP scores. */
export async function saveMapEntryAction(f: FormData): Promise<void> {
  const classId = String(f.get("classId") ?? "");
  const subject: EntrySubject = f.get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING";
  const season = (["FALL", "WINTER", "SPRING"].includes(String(f.get("season"))) ? String(f.get("season")) : "FALL") as Season;
  const year = Number(f.get("year"));
  const ids = f.getAll("student").map(String);
  const val = (k: string) => String(f.get(k) ?? "").trim();
  const goalCodes = f.getAll("goal").map(String);
  let msg: string;
  try {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
    const r = await saveMapEntry(repo, actor, {
      classId, subject, season, year,
      rows: ids.map((id) => ({ studentId: id, rit: val(`rit:${id}`), percentile: val(`pct:${id}`), projection: val(`proj:${id}`), lexile: val(`lex:${id}`), goals: Object.fromEntries(goalCodes.map((c) => [c, val(`g:${c}:${id}`)])) })),
    });
    msg = `${r.imported} student(s) saved for ${r.term}.${r.plans?.plans ? ` 📋 ${r.plans.plans} MAP plan(s) sent to students.` : ""}${r.errors.length ? ` ⚠️ ${r.errors.map((e) => e.message).join(" · ")}` : ""}`;
  } catch (e) { if (isNextControl(e)) throw e; msg = await failureMessage(e, "map", "saveMapEntry", "/teacher/map-entry"); } // r79: never a white page
  redirect(`/teacher/map-entry?${new URLSearchParams({ classId, subject, season, year: String(year), msg })}`);
}

/**
 * 🗑️ Nov 2026 (owner request): deletes one student's score for the currently-shown class/subject/term —
 * for a wrong manual entry or a bad import that needs to be taken back out, not just edited. Bound to a specific
 * studentId per row with `.bind(null, studentId)` on the row's own delete button (a `formAction`, not a separate
 * nested form — HTML forms can't nest, and this lets each row keep its own target inside the one big save form).
 */
export async function deleteMapEntryAction(studentId: string, f: FormData): Promise<void> {
  const classId = String(f.get("classId") ?? "");
  const subject: EntrySubject = f.get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING";
  const season = (["FALL", "WINTER", "SPRING"].includes(String(f.get("season"))) ? String(f.get("season")) : "FALL") as Season;
  const year = Number(f.get("year"));
  let msg: string;
  try {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
    const r = await deleteMapEntryRow(repo, actor, { classId, subject, season, year, studentId });
    msg = r.deleted ? `🗑️ Deleted this student's score (${r.deleted} row(s)) for this term.` : "Nothing was saved for this student in this term — nothing to delete.";
  } catch (e) { if (isNextControl(e)) throw e; msg = await failureMessage(e, "map", "deleteMapEntryRow", "/teacher/map-entry"); }
  redirect(`/teacher/map-entry?${new URLSearchParams({ classId, subject, season, year: String(year), msg })}`);
}
