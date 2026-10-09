"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { extract } from "@/imports/questions/extract";
import { cellLines, importActivities, RESPOND_LEVELS, rtrSetCode, saveActivity } from "@/server/curriculum-map/respond";
import { documentText, parseRespondText } from "@/server/curriculum-map/respond-doc";

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
      checklist: cellLines(String(f.get("checklist") ?? "")), hint: String(f.get("hint") ?? ""), ...(f.has("modelAnswer") ? { modelAnswer: String(f.get("modelAnswer") ?? "") } : {}),
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
    if (!(file instanceof File) || !file.size) throw new ValidationError("Choose the Word, Excel or CSV file.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { table } = /\.(docx|txt|md)$/i.test(file.name) ? { table: parseRespondText(documentText(file.name, bytes)) } : extract(file.name, bytes);
    const r = await importActivities(repo, actor, table);
    msg = `${r.saved} activit${r.saved === 1 ? "y" : "ies"} saved.${r.errors.length ? ` ${r.errors.length} row(s) not saved: ${r.errors.slice(0, 5).map((e) => `row ${e.row}: ${e.message}`).join(" · ")}` : ""}`;
  } catch (e) { msg = e instanceof ValidationError || e instanceof ForbiddenError ? e.message : `The file could not be read: ${(e as Error).message}`; }
  redirect(`/admin/curriculum-map/respond?msg=${encodeURIComponent(msg)}`);
}

/** ✍️ All three levels of a Text Set from one screen (a level left without Title and Prompt is not touched). */
export async function saveAllLevelsAction(f: FormData): Promise<void> {
  const actor = await requireActor(ADMIN);
  const setCode = String(f.get("setCode") ?? "");
  const saved: string[] = [], problems: string[] = [];
  for (const l of RESPOND_LEVELS) {
    const g = (k: string) => String(f.get(`${k}:${l}`) ?? "");
    if (!g("title").trim() && !g("prompt").trim()) continue;
    try {
      await saveActivity(repo, actor, `${setCode}.${l}`, {
        title: g("title"), prompt: g("prompt"), instructions: cellLines(g("instructions")), wordBank: cellLines(g("wordBank")),
        sentenceStarters: cellLines(g("sentenceStarters")), checklist: cellLines(g("checklist")), hint: g("hint"), ...(f.has(`modelAnswer:${l}`) ? { modelAnswer: g("modelAnswer") } : {}),
      });
      saved.push(l === "BELOW" ? "Below" : l === "ON" ? "On" : "Above");
    } catch (e) { problems.push(`${l === "BELOW" ? "Below" : l === "ON" ? "On" : "Above"}: ${msgOf(e)}`); }
  }
  const msg = `${saved.length ? `Saved: ${saved.join(", ")} Level.` : "Nothing to save (write a Title and a Prompt)."}${problems.length ? ` Not saved — ${problems.join(" · ")}` : ""}`;
  redirect(`/admin/curriculum-map/respond/${setCode}/all?msg=${encodeURIComponent(msg)}`);
}
