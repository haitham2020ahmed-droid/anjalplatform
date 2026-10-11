"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { importArticleJson, previewArticleFile, type Issue, type VersionCheck } from "@/server/readrise/import";
import { deleteArticle, setArticleHidden, setArticleStatus, setOfficialLexile } from "@/server/readrise/library";

const STAFF = { roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] as ("TEACHER" | "SCHOOL_ADMIN" | "SUPER_ADMIN")[], permission: "questions:edit" as const };
const MAX_FILE = 5 * 1024 * 1024;
const msgOf = (e: unknown) => { if (e instanceof ValidationError || e instanceof ForbiddenError) return e.message; throw e; };
/** Library pages that may be the target of a redirect (never a free URL). */
const base = (f: FormData) => (String(f.get("base") ?? "") === "/teacher/readrise/library" ? "/teacher/readrise/library" : "/admin/readrise");
const go = (path: string, msg: string) => redirect(`${path}${path.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);

export interface PreviewState {
  fileName?: string;
  error?: string;
  errors?: Issue[];
  warnings?: Issue[];
  checks?: VersionCheck[];
  article?: { code: string; title: string; topic: string; keyWords: number; questions: number };
  /** the validated article, sent back with the Import button */
  payload?: string;
}

/** Upload → preview (nothing saved): per version estimated vs target, and every problem with its sheet / row. */
export async function previewReadRiseAction(_prev: PreviewState, f: FormData): Promise<PreviewState> {
  await requireActor(STAFF);
  const file = f.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose the filled Excel template (.xlsx) or a JSON article file." };
  if (file.size > MAX_FILE) return { error: "The file is too large (5 MB at most)." };
  const v = previewArticleFile(file.name, Buffer.from(await file.arrayBuffer()));
  const a = v.article;
  return {
    fileName: file.name, errors: v.errors, warnings: v.warnings, checks: v.checks,
    article: a ? { code: a.code, title: a.title, topic: a.topic, keyWords: (["LOW", "MID", "HIGH"] as const).reduce((n, b) => n + a.bands[b].keyWords.length, 0), questions: (["LOW", "MID", "HIGH"] as const).reduce((n, b) => n + a.bands[b].questions.length, 0) } : undefined,
    payload: a && !v.errors.length ? JSON.stringify(a) : undefined,
  };
}

/** Preview → import (DRAFT, or PUBLISHED when asked and allowed) → the article's review page. */
export async function importReadRiseAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const back = base(f);
  const importPage = back === "/admin/readrise" ? "/admin/readrise/import" : "/teacher/readrise/import";
  let target: string;
  try {
    let json: unknown;
    try { json = JSON.parse(String(f.get("payload") ?? "")); } catch { throw new ValidationError("Upload the file again: the preview has expired."); }
    const r = await importArticleJson(repo, actor, json, { schoolId: actor.schoolId, publish: f.get("publish") === "1" });
    if (!r.ok) throw new ValidationError(`Not imported: ${r.errors.slice(0, 3).map((e) => `${e.where}: ${e.message}`).join(" · ")}`);
    revalidatePath(back);
    target = `${back}/${r.articleId}?msg=${encodeURIComponent(`${r.created ? "Imported" : "Updated"} as ${r.status === "PUBLISHED" ? "published" : "a draft"}. Check the 12 versions${r.status === "DRAFT" ? ", then publish" : ""}.`)}`;
  } catch (e) { target = `${importPage}?msg=${encodeURIComponent(msgOf(e))}`; }
  redirect(target);
}

export async function setReadRiseStatusAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const id = String(f.get("id") ?? ""), back = base(f);
  let msg: string;
  try {
    const status = f.get("status") === "PUBLISHED" ? "PUBLISHED" : "DRAFT";
    await setArticleStatus(repo, actor, id, status);
    msg = status === "PUBLISHED" ? "Published: students can read it now." : "Unpublished: back to draft.";
  } catch (e) { msg = msgOf(e); }
  go(`${back}/${id}`, msg);
}

export async function setReadRiseHiddenAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const id = String(f.get("id") ?? ""), hide = f.get("hide") === "1";
  let msg: string;
  try { await setArticleHidden(repo, actor, id, hide); msg = hide ? "Hidden for this school: students and teachers no longer see it." : "Shown again for this school."; }
  catch (e) { msg = msgOf(e); }
  go(`/admin/readrise/${id}`, msg);
}

export async function deleteReadRiseAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const id = String(f.get("id") ?? ""), back = base(f);
  let target: string;
  try { await deleteArticle(repo, actor, id); target = `${back}?msg=${encodeURIComponent("Article deleted.")}`; }
  catch (e) { target = `${back}/${id}?msg=${encodeURIComponent(msgOf(e))}`; }
  redirect(target);
}

export async function setReadRiseLexileAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const id = String(f.get("id") ?? ""), back = base(f);
  let msg: string;
  try {
    const raw = String(f.get("officialLexile") ?? "").trim().replace(/L$/i, "");
    const value = raw === "" ? null : Number(raw);
    if (value !== null && !Number.isFinite(value)) throw new ValidationError("Official Lexile must be a number (or empty).");
    await setOfficialLexile(repo, actor, String(f.get("versionId") ?? ""), value);
    msg = value === null ? "Official Lexile removed." : `Official Lexile saved (${value}L).`;
  } catch (e) { msg = msgOf(e); }
  go(`${back}/${id}`, msg);
}
