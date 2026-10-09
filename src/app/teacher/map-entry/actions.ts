"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { saveMapEntry, type EntrySubject } from "@/server/map/map-entry";
import type { Season } from "@/server/map/rit";

/** ✏️ Saves the class table of MAP scores. */
export async function saveMapEntryAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "");
  const subject: EntrySubject = f.get("subject") === "LANGUAGE" ? "LANGUAGE" : "READING";
  const season = (["FALL", "WINTER", "SPRING"].includes(String(f.get("season"))) ? String(f.get("season")) : "FALL") as Season;
  const year = Number(f.get("year"));
  const ids = f.getAll("student").map(String);
  const val = (k: string) => String(f.get(k) ?? "").trim();
  const goalCodes = f.getAll("goal").map(String);
  let msg: string;
  try {
    const r = await saveMapEntry(repo, actor, {
      classId, subject, season, year,
      rows: ids.map((id) => ({ studentId: id, rit: val(`rit:${id}`), percentile: val(`pct:${id}`), projection: val(`proj:${id}`), lexile: val(`lex:${id}`), goals: Object.fromEntries(goalCodes.map((c) => [c, val(`g:${c}:${id}`)])) })),
    });
    msg = `${r.imported} student(s) saved for ${r.term}.${r.errors.length ? ` ⚠️ ${r.errors.map((e) => e.message).join(" · ")}` : ""}`;
  } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = e.message; else throw e; }
  redirect(`/teacher/map-entry?${new URLSearchParams({ classId, subject, season, year: String(year), msg })}`);
}
