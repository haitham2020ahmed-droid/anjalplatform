"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { lookupWord, saveDefinition } from "@/server/student/words";
import { importWordsCsv, saveWordExtras } from "@/server/vocabulary/service";
import { fillMissingWithAi } from "@/server/vocabulary/meaning";
import { aiEnv } from "@/server/ai/env";

export async function saveDefinitionAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const word = String(f.get("word") ?? "");
  let msg = `✓ “${word}” saved. Students now see your definition first.`;
  try { await saveDefinition(repo, actor, word, { partOfSpeech: String(f.get("pos") ?? ""), definition: String(f.get("definition") ?? ""), example: String(f.get("example") ?? ""), synonyms: String(f.get("synonyms") ?? ""), antonyms: String(f.get("antonyms") ?? ""), isVocab: f.get("isVocab") === "on", nonExample: String(f.get("nonExample") ?? "") }); }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/admin/dictionary?q=${encodeURIComponent(word)}&msg=${encodeURIComponent(msg)}`);
}

export async function fetchWordAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const word = String(f.get("word") ?? "");
  let msg = "";
  try { const w = await lookupWord(repo, actor, word, new Date(), undefined, { env: aiEnv() }); msg = w.meanings.length ? `✓ “${w.word}” found${w.source === "AI" ? " (written by AI: please check it)" : ""}.` : `No meaning found for “${w.word}”: write it below.`; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/admin/dictionary?q=${encodeURIComponent(word)}&msg=${encodeURIComponent(msg)}`);
}

/** Arabic meaning (shown to students only when they tap) and the original context sentence of one word. */
export async function saveExtrasAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const word = String(f.get("word") ?? "");
  let msg = `✓ “${word}”: Arabic meaning and context sentence saved.`;
  try { await saveWordExtras(repo, actor, word, { arabicGloss: String(f.get("arabicGloss") ?? ""), contextSentence: String(f.get("contextSentence") ?? "") }); }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/admin/dictionary?q=${encodeURIComponent(word)}&msg=${encodeURIComponent(msg)}`);
}

/** Paste-CSV import: word, definition, contextSentence, arabicGloss. */
export async function importCsvAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  let msg: string;
  try { const r = await importWordsCsv(repo, actor, String(f.get("csv") ?? "")); msg = `✓ ${r.saved} word${r.saved === 1 ? "" : "s"} saved.${r.errors.length ? ` ${r.errors.length} skipped: ${r.errors.slice(0, 5).join(" · ")}` : ""}`; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/admin/dictionary?msg=${encodeURIComponent(msg)}`);
}

/** ✨ School admins: meanings for the most-tapped missing words, written by the school's AI (marked “AI · check”). */
export async function fillMissingAiAction(): Promise<void> {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  let msg: string;
  try { const r = await fillMissingWithAi(repo, actor, aiEnv()); msg = `${r.added ? `✓ ${r.added} meaning${r.added === 1 ? "" : "s"} added by AI (marked “AI · check”).` : "⚠️ No meanings added."} ${r.left} word${r.left === 1 ? "" : "s"} still waiting.${r.message ? ` ${r.message}` : ""}`; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/admin/dictionary?msg=${encodeURIComponent(msg)}`);
}
