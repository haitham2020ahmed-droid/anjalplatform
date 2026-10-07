"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { extract } from "@/imports/questions/extract";
import { importReadMaster } from "@/server/readmaster/import";
import { addVersionQuestion, saveArticle, saveVersion, setArticleStatus } from "@/server/readmaster/service";
import type { Level } from "@/server/curriculum-map/lexile";

const STAFF = { roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] as ("TEACHER" | "SCHOOL_ADMIN" | "SUPER_ADMIN")[], permission: "questions:edit" as const };
const msgOf = (e: unknown) => { if (e instanceof ValidationError || e instanceof ForbiddenError) return e.message; throw e; };

export async function createArticleAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  let target = "/admin/readmaster";
  try {
    const id = await saveArticle(repo, actor, { title: String(f.get("title") ?? ""), topic: String(f.get("topic") ?? ""), grade: Number(f.get("grade")), skillId: String(f.get("skillId") ?? "") || null, code: String(f.get("code") ?? "") });
    target = `/admin/readmaster/${id}?msg=${encodeURIComponent("Article created. Add its three versions.")}`;
  } catch (e) { target = `/admin/readmaster?msg=${encodeURIComponent(msgOf(e))}`; }
  redirect(target);
}

export async function importReadMasterAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  let msg: string;
  try {
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) throw new ValidationError("Choose the CSV or Excel file.");
    const { table } = extract(file.name, new Uint8Array(await file.arrayBuffer()));
    const r = await importReadMaster(repo, actor, table);
    msg = `${r.articles} new article(s), ${r.versions} version(s), ${r.questions} question(s) imported.${r.errors.length ? ` ${r.errors.length} problem(s): ${r.errors.slice(0, 5).map((e) => `row ${e.row}: ${e.message}`).join(" · ")}` : ""}`;
  } catch (e) { msg = e instanceof Error && !(e instanceof ValidationError) && !(e instanceof ForbiddenError) ? `The file could not be read: ${e.message}` : msgOf(e); }
  redirect(`/admin/readmaster?msg=${encodeURIComponent(msg)}`);
}

export async function saveVersionAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const articleId = String(f.get("articleId") ?? "");
  let msg: string;
  try { await saveVersion(repo, actor, articleId, String(f.get("level")) as Level, { lexile: Number(f.get("lexile")), body: String(f.get("body") ?? "") }); msg = "Version saved."; }
  catch (e) { msg = msgOf(e); }
  redirect(`/admin/readmaster/${articleId}?msg=${encodeURIComponent(msg)}`);
}

export async function addQuestionAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const articleId = String(f.get("articleId") ?? "");
  let msg: string;
  try {
    const correct = String(f.get("correct") ?? "A");
    const options = ["A", "B", "C", "D"].map((l) => ({ label: l, text: String(f.get(`opt${l}`) ?? "").trim(), correct: l === correct })).filter((o) => o.text);
    await addVersionQuestion(repo, actor, String(f.get("versionId") ?? ""), { stem: String(f.get("stem") ?? ""), options, whyCorrect: String(f.get("why") ?? "") || "The text gives the answer." });
    msg = "Question added (it is also in the Question Bank).";
  } catch (e) { msg = msgOf(e); }
  redirect(`/admin/readmaster/${articleId}?msg=${encodeURIComponent(msg)}`);
}

export async function setStatusAction(f: FormData): Promise<void> {
  const actor = await requireActor(STAFF);
  const articleId = String(f.get("articleId") ?? "");
  let msg: string;
  try { await setArticleStatus(repo, actor, articleId, f.get("status") === "PUBLISHED" ? "PUBLISHED" : "DRAFT"); msg = f.get("status") === "PUBLISHED" ? "Published: students of this grade can read it." : "Back to draft."; }
  catch (e) { msg = msgOf(e); }
  redirect(`/admin/readmaster/${articleId}?msg=${encodeURIComponent(msg)}`);
}
