"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { extract } from "@/imports/questions/extract";
import { cellLines, importActivities, rtrSetCode, saveActivity } from "@/server/curriculum-map/respond";

const ADMIN = { roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] as ("SCHOOL_ADMIN" | "SUPER_ADMIN")[], permission: "questions:publish" as const };
const msgOf = (e: unknown) => { if (e instanceof ValidationError || e instanceof ForbiddenError) return e.message; throw e; };

/** Save one level's activity from the edit form (one line per step / word / starter / checklist item). */
export async function saveActivityAction(f: FormData): Promise<void> {
  const actor = await requireActor(ADMIN);
  const code = String(f.get("code") ?? "");
  const level = code.split(".").pop() ?? "ON";
  let msg: string, back = "/admin/curriculum-map/respond";
  try {
    back = `/admin/curriculum-map/respond/${rtrSetCode(code)}?level=${level}`;
    await saveActivity(repo, actor, code, {
      title: String(f.get("title") ?? ""), prompt: String(f.get("prompt") ?? ""), instructions: cellLines(String(f.get("instructions") ?? "")),
      wordBank: cellLines(String(f.get("wordBank") ?? "")), sentenceStarters: cellLines(String(f.get("sentenceStarters") ?? "")),
      checklist: cellLines(String(f.get("checklist") ?? "")), hint: String(f.get("hint") ?? ""),
    });
    msg = "Saved: students at this level see the new version.";
  } catch (e) { msg = msgOf(e); }
  redirect(`${back}${back.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
}

/** Many activities from an Excel / CSV file (one row per level). */
export async function importRespondAction(f: FormData): Promise<void> {
  const actor = await requireActor(ADMIN);
  let msg: string;
  try {
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) throw new ValidationError("Choose the Excel or CSV file.");
    const { table } = extract(file.name, new Uint8Array(await file.arrayBuffer()));
    const r = await importActivities(repo, actor, table);
    msg = `${r.saved} activit${r.saved === 1 ? "y" : "ies"} saved.${r.errors.length ? ` ${r.errors.length} row(s) not saved: ${r.errors.slice(0, 5).map((e) => `row ${e.row}: ${e.message}`).join(" · ")}` : ""}`;
  } catch (e) { msg = e instanceof ValidationError || e instanceof ForbiddenError ? e.message : `The file could not be read: ${(e as Error).message}`; }
  redirect(`/admin/curriculum-map/respond?msg=${encodeURIComponent(msg)}`);
}
