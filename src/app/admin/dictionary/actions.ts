"use server";
import { redirect } from "next/navigation";
import { repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { lookupWord, saveDefinition } from "@/server/student/words";

export async function saveDefinitionAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const word = String(f.get("word") ?? "");
  let msg = `✓ “${word}” saved. Students now see your definition first.`;
  try { await saveDefinition(repo, actor, word, { partOfSpeech: String(f.get("pos") ?? ""), definition: String(f.get("definition") ?? ""), example: String(f.get("example") ?? ""), synonyms: String(f.get("synonyms") ?? ""), antonyms: String(f.get("antonyms") ?? ""), isVocab: f.get("isVocab") === "on" }); }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/admin/dictionary?q=${encodeURIComponent(word)}&msg=${encodeURIComponent(msg)}`);
}

export async function fetchWordAction(f: FormData): Promise<void> {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const word = String(f.get("word") ?? "");
  let msg = "";
  try { const w = await lookupWord(repo, actor, word); msg = w.meanings.length ? `✓ “${w.word}” found.` : `No meaning found for “${w.word}”: write it below.`; }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) msg = `⚠️ ${e.message}`; else throw e; }
  redirect(`/admin/dictionary?q=${encodeURIComponent(word)}&msg=${encodeURIComponent(msg)}`);
}
