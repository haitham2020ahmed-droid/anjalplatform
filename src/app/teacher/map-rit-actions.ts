"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { enterRitScores, levelsFromClassAverage, SEASONS, updateNationalNorms, type Season } from "@/server/map/rit";
import { importMapFile, importMessage } from "@/server/map/map-files";

const back = (p: Record<string, string>) => redirect(`/teacher/map-rit?${new URLSearchParams(p)}`);
const friendly = (e: unknown) => { if (e instanceof ValidationError || e instanceof ForbiddenError) return e.message; throw e; };

export async function enterRitAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), term = String(f.get("term") ?? "").trim();
  let msg: string;
  try {
    const date = String(f.get("testDate") ?? "");
    const scores = [...f.keys()].filter((k) => k.startsWith("rit:")).map((k) => ({ studentId: k.slice(4), raw: String(f.get(k) ?? "").trim() })).filter((x) => x.raw).map((x) => ({ studentId: x.studentId, rit: Number(x.raw) }));
    const n = await enterRitScores(repo, actor, { classId, term, testDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : new Date(), scores });
    msg = `${n} RIT score(s) saved for ${term}.`;
  } catch (e) { msg = friendly(e); }
  back({ classId, term, msg });
}

export async function levelsFromRitAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const classId = String(f.get("classId") ?? ""), term = String(f.get("term") ?? "");
  let msg: string;
  try { const r = await levelsFromClassAverage(repo, actor, classId, term || undefined); msg = `Levels set from the class average: ${r.above} Above, ${r.on} On, ${r.below} Below Level.`; }
  catch (e) { msg = friendly(e); }
  back({ classId, term, msg });
}

export async function updateNormsAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "settings:school" });
  let msg: string;
  try {
    const entries = [4, 5, 6].flatMap((grade) => SEASONS.map((season: Season) => ({ grade, season, mean: Number(f.get(`mean:${grade}:${season}`)), sd: Number(f.get(`sd:${grade}:${season}`)) })));
    await updateNationalNorms(repo, actor, entries, String(f.get("source") ?? ""));
    msg = "National averages saved.";
  } catch (e) { msg = friendly(e); }
  back({ msg });
}


/** Simple MAP import: Fall RIT + Spring Projection per student (CSV or Excel). */
export async function importMapScoresAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const file = f.get("file");
  let msg: string;
  try {
    if (!(file instanceof File) || !file.size) throw new ValidationError("Choose the file with the scores (template, NWEA CSV export, or the ASG report PDF).");
    if (file.size > 4_000_000) throw new ValidationError("The file is larger than 4 MB.");
    const r = await importMapFile(repo, actor, file.name, new Uint8Array(await file.arrayBuffer()), Number(f.get("year")) || new Date().getFullYear());
    msg = importMessage(r);
  } catch (e) { msg = e instanceof Error && !(e instanceof ValidationError) && !(e instanceof ForbiddenError) && /read|xlsx|csv|file/i.test(e.message) ? `The file could not be read: ${e.message}` : friendly(e); }
  back({ msg });
}

/** MAP import that stays on the page: new students (from one class) are created and their sign-ins returned. */
export async function importMapScoresInline(f: FormData): Promise<{ ok: boolean; message: string; created: { name: string; username: string; password: string }[] }> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  try {
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) throw new ValidationError("Choose the file with the scores (template, NWEA CSV export, or the ASG report PDF).");
    if (file.size > 4_000_000) throw new ValidationError("The file is larger than 4 MB.");
    const classId = String(f.get("classId") ?? "") || undefined;
    const r = await importMapFile(repo, actor, file.name, new Uint8Array(await file.arrayBuffer()), Number(f.get("year")) || new Date().getFullYear(), { createInClassId: classId });
    const message = importMessage(r);
    return { ok: true, message, created: r.created };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, message: e.message, created: [] };
    return { ok: false, message: `The file could not be read: ${(e as Error).message}`, created: [] };
  }
}
