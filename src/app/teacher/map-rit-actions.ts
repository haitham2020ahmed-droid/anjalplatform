"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { failureMessage, isNextControl } from "@/server/lib/action-guard";
import { ValidationError } from "@/server/curriculum-admin";
import { enterRitScores, levelsFromClassAverage, updateNationalNorms, type Season } from "@/server/map/rit";
import { importMapFile, importMessage } from "@/server/map/map-files";

const back = (p: Record<string, string>) => redirect(`/teacher/map-rit?${new URLSearchParams(p)}`);
/** 🧯 r79: a known refusal's own text; anything else logged and "Something went wrong — try again" (never a white page). */
const friendly = async (e: unknown, name: string): Promise<string> => { if (isNextControl(e)) throw e; return failureMessage(e, "map", name, "/teacher/map-rit"); };

export async function enterRitAction(f: FormData): Promise<void> {
  const classId = String(f.get("classId") ?? ""), term = String(f.get("term") ?? "").trim();
  let msg: string;
  try {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
    const date = String(f.get("testDate") ?? "");
    const scores = [...f.keys()].filter((k) => k.startsWith("rit:")).map((k) => ({ studentId: k.slice(4), raw: String(f.get(k) ?? "").trim() })).filter((x) => x.raw).map((x) => ({ studentId: x.studentId, rit: Number(x.raw) }));
    const n = await enterRitScores(repo, actor, { classId, term, testDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : new Date(), scores });
    msg = `${n} RIT score(s) saved for ${term}.`;
  } catch (e) { msg = await friendly(e, "map-rit"); }
  back({ classId, term, msg });
}

export async function levelsFromRitAction(f: FormData): Promise<void> {
  const classId = String(f.get("classId") ?? ""), term = String(f.get("term") ?? "");
  let msg: string;
  try {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
    const r = await levelsFromClassAverage(repo, actor, classId, term || undefined);
    msg = `Levels set from the class average: ${r.above} Exceeding, ${r.on} Meeting, ${r.below} Approaching.`;
  } catch (e) { msg = await friendly(e, "map-rit"); }
  back({ classId, term, msg });
}

/** 🐛 fix (audit finding, Oct 2026): the form used to send a fixed [4,5,6] × Reading-only grid every time, so a
 * grade outside 4–6 (e.g. a Grade 11 class whose MAP scores the school already has) could never get a real national
 * norm — `personal-plan.ts`'s `bandOf` then silently showed "On level" for that student instead of a real
 * percentile. The admin form (map-rit/page.tsx) now lists every grade that actually has students on the platform,
 * for both Reading and Language Usage, with field names `mean:<SUBJECT>:<grade>:<season>` / `sd:<SUBJECT>:<grade>:
 * <season>`; read every one of them straight off the submitted fields instead of a hardcoded grade list, and skip
 * any box the admin left empty (so a grade/season/subject with no numbers keeps showing "no national comparison"
 * rather than being forced to some invented value).
 */
export async function updateNormsAction(f: FormData): Promise<void> {
  let msg: string;
  try {
    const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "settings:school" });
    const entries: { grade: number; season: Season; subject: "READING" | "LANGUAGE"; mean: number; sd: number }[] = [];
    for (const key of f.keys()) {
      const m = /^mean:(READING|LANGUAGE):(\d+):(FALL|WINTER|SPRING)$/.exec(key);
      if (!m) continue;
      const [, subject, gradeStr, season] = m;
      const meanRaw = f.get(key), sdRaw = f.get(`sd:${subject}:${gradeStr}:${season}`);
      if (meanRaw === null || sdRaw === null || String(meanRaw).trim() === "" || String(sdRaw).trim() === "") continue;
      entries.push({ grade: Number(gradeStr), season: season as Season, subject: subject as "READING" | "LANGUAGE", mean: Number(meanRaw), sd: Number(sdRaw) });
    }
    await updateNationalNorms(repo, actor, entries, String(f.get("source") ?? ""));
    msg = "National averages saved.";
  } catch (e) { msg = await friendly(e, "map-rit"); }
  back({ msg });
}

/** ✨ feature (requested, Oct 2026): adds a grade row to the National Averages table that has no class yet (so it
 * never shows up via `v.grades`) — e.g. preparing next year's Grade 7 ahead of time. Remembered across visits via
 * `extraGrades` in the URL, not saved anywhere: it only decides which empty rows the admin sees to fill in: once
 * real numbers are saved for that grade, nationalNorm() finds them regardless of whether it's still in this list. */
export async function addNormGradeAction(f: FormData): Promise<void> {
  try {
    await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "settings:school" });
  } catch (e) {
    if (isNextControl(e)) throw e;
    const msg = await friendly(e, "map-rit");
    const existing = String(f.get("extraGrades") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
    back({ msg, extraGrades: existing.join(",") });
    return;
  }
  const grade = Number(f.get("grade"));
  const existing = String(f.get("extraGrades") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!Number.isInteger(grade) || grade < 1 || grade > 13) { back({ msg: "Enter a grade from 1 to 13.", extraGrades: existing.join(",") }); return; }
  const merged = [...new Set([...existing, grade])].sort((a, b) => a - b).join(",");
  redirect(`/teacher/map-rit?${new URLSearchParams({ extraGrades: merged })}`);
}


/** Simple MAP import: Fall RIT + Spring Projection per student (CSV or Excel). */
export async function importMapScoresAction(f: FormData): Promise<void> {
  const file = f.get("file");
  let msg: string;
  try {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
    if (!(file instanceof File) || !file.size) throw new ValidationError("Choose the file with the scores (template, NWEA CSV export, or the ASG report PDF).");
    if (file.size > 4_000_000) throw new ValidationError("The file is larger than 4 MB.");
    const r = await importMapFile(repo, actor, file.name, new Uint8Array(await file.arrayBuffer()), Number(f.get("year")) || new Date().getFullYear());
    msg = importMessage(r);
  } catch (e) { msg = e instanceof Error && !(e instanceof ValidationError) && !(e instanceof ForbiddenError) && /read|xlsx|csv|file/i.test(e.message) ? `The file could not be read: ${e.message}` : await friendly(e, "importMapScores"); }
  back({ msg });
}

export type MapImportInlineResult = { ok: boolean; message: string; created: { name: string; username: string; password: string }[]; /** names left out because they already match a student of one of the teacher's OTHER classes (so adding them here would risk a duplicate) — each can be confirmed one at a time via confirmAmbiguousMapStudent */ ambiguous?: { name: string; classes: string[] }[] };

/** MAP import that stays on the page: new students (from one class) are created and their sign-ins returned.
 * `forceName`, when set, is the teacher's own one-click confirmation that this ONE ambiguous name (shown after
 * a previous import of the SAME file) is a genuinely different student and should be added here anyway. */
export async function importMapScoresInline(f: FormData, forceName?: string): Promise<MapImportInlineResult> {
  try {
    const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) throw new ValidationError("Choose the file with the scores (template, NWEA CSV export, or the ASG report PDF).");
    if (file.size > 4_000_000) throw new ValidationError("The file is larger than 4 MB.");
    const classId = String(f.get("classId") ?? "") || undefined;
    const r = await importMapFile(repo, actor, file.name, new Uint8Array(await file.arrayBuffer()), Number(f.get("year")) || new Date().getFullYear(), { createInClassId: classId, forceCreateName: forceName });
    const message = importMessage(r);
    const ambiguous = (r.unmatched ?? []).filter((u): u is { number: string; name: string; classes: string[] } => !!u.classes?.length);
    return { ok: true, message, created: r.created, ambiguous };
  } catch (e) {
    if (isNextControl(e)) throw e;
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, message: e.message, created: [] };
    if (e instanceof Error && /read|xlsx|csv|file/i.test(e.message)) return { ok: false, message: `The file could not be read: ${e.message}`, created: [] };
    return { ok: false, message: await friendly(e, "importMapScoresInline"), created: [] };
  }
}

/** 👆 The teacher's one-click confirmation for a single ambiguous name, from the SAME file they just imported
 * (kept client-side since the first call already consumed its bytes once — nothing is stored server-side
 * between the two calls). Re-runs the normal import with that one name force-created; everyone else already
 * matched keeps their scores unchanged (re-importing the same term just replaces it with itself). */
export async function confirmAmbiguousMapStudent(f: FormData, name: string): Promise<MapImportInlineResult> {
  return importMapScoresInline(f, name);
}
