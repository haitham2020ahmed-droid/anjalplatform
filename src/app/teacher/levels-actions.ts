"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { assignFromMap, giveTest, setStudentLevels, type Level } from "@/server/curriculum-map/levels";
import { setLexileBands } from "@/server/curriculum-map/lexile";

const day = (v: FormDataEntryValue | null, end: boolean) => { const t = String(v ?? "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T${end ? "23:59:59" : "00:00:00"}`) : null; };
const back = (path: string, params: Record<string, string>) => redirect(`${path}?${new URLSearchParams(params)}`);
const friendly = (e: unknown) => { if (e instanceof ValidationError || e instanceof ForbiddenError) return e.message; throw e; };

/** Saves the levels chosen on the Student levels page. */
export async function saveLevelsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "");
  let msg: string;
  try {
    const entries = [...f.keys()].filter((k) => k.startsWith("level:")).map((k) => ({ studentId: k.slice(6), level: (String(f.get(k) ?? "") || null) as Level | null }));
    const n = await setStudentLevels(repo, actor, classId, entries);
    msg = `Levels saved (${n}).`;
  } catch (e) { msg = friendly(e); }
  back("/teacher/levels", { classId, msg });
}

/** Placement test or MAP practice test for the class. */
export async function giveTestAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? "");
  const kind = f.get("kind") === "MAP_TEST" ? "MAP_TEST" : "PLACEMENT";
  let msg: string;
  try {
    const r = await giveTest(repo, actor, { classId, kind, questions: Number(f.get("questions") ?? 20) || 20, dueAt: day(f.get("dueAt"), true) });
    msg = `${kind === "PLACEMENT" ? "Placement test" : "MAP practice test"} assigned: ${r.questions} questions to ${r.students} students. They have been notified.`;
  } catch (e) { msg = friendly(e); }
  back("/teacher/levels", { classId, msg });
}

/** Assign a Curriculum Map category by level. */
export async function assignFromMapAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), code = String(f.get("code") ?? "");
  let msg: string;
  try {
    const picked = f.get("who") === "students" ? f.getAll("studentIds").map(String).filter(Boolean) : [];
    if (f.get("who") === "students" && !picked.length) throw new ValidationError("Choose at least one student.");
    const r = await assignFromMap(repo, actor, { classId, categoryCode: code, studentIds: picked.length ? picked : undefined, dueAt: day(f.get("dueAt"), true), startAt: day(f.get("startAt"), false), note: String(f.get("note") ?? "") || null, maxQuestions: Number(f.get("max") ?? 20) || 20, mode: f.get("mode") === "BY_LEVEL" ? "BY_LEVEL" : "ADAPTIVE" });
    const parts = r.groups.map((g) => `${g.level ? { ABOVE: "Above", ON: "On", BELOW: "Below" }[g.level] : "All"}: ${g.students} student(s), ${g.questions} question(s)`);
    msg = `Assigned. ${parts.join(" · ")}.${r.notes.length ? ` ${r.notes.join(" ")}` : ""}`;
  } catch (e) { msg = friendly(e); }
  back("/teacher/map-assign", { classId, code, msg });
}


/** Admins: the Lexile On Level band of each grade. */
export async function saveLexileBandsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "settings:school" });
  let msg: string;
  try {
    const bands = Object.fromEntries([4, 5, 6].map((g) => [g, { onMin: Number(f.get(`min:${g}`)), onMax: Number(f.get(`max:${g}`)) }]));
    await setLexileBands(repo, actor, bands);
    msg = "Lexile bands saved.";
  } catch (e) { msg = friendly(e); }
  back("/teacher/levels", { msg });
}
