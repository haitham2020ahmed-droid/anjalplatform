/**
 * Reading passages from plain text (editor and importer share this). The same text always maps to the
 * same passage row (content hash), so questions about one story share it; editing a question's
 * passage text creates or finds the passage for the NEW text and never changes other questions.
 */
import { createHash, randomBytes } from "node:crypto";
import { analyzeText, platformReadingLevelFor } from "../../reading/prl";
import { ValidationError } from "../curriculum-admin";
import type { Repo } from "../seeding/repo";

export const MAX_PASSAGE_CHARS = 20_000;
export const passageRef = (text: string) => `IMP-${createHash("sha256").update(text.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 24)}`;
const newId = () => "c" + Date.now().toString(36) + randomBytes(8).toString("hex");

/** Cleans optional passage text: "" → null; too long → error. */
export function cleanPassage(text: string | null | undefined): string | null {
  const t = String(text ?? "").replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  if (!t) return null;
  if (t.length > MAX_PASSAGE_CHARS) throw new ValidationError(`The passage is too long (${t.length} characters; the limit is ${MAX_PASSAGE_CHARS.toLocaleString("en")}).`);
  return t;
}

/** Id of the passage with exactly this text, creating it if needed. */
export async function passageForText(repo: Repo, text: string, grade: number, createdById: string | null, now = new Date()): Promise<string> {
  const ref = passageRef(text);
  const existing = await repo.findUnique("ReadingPassage", { externalRef: ref });
  if (existing) return String(existing.id);
  const st = analyzeText(text);
  const id = newId();
  const firstLine = text.split("\n")[0].trim();
  const title = (firstLine.length <= 80 && text.includes("\n") ? firstLine : `Passage: ${text.replace(/\s+/g, " ").split(" ").slice(0, 8).join(" ")}…`).slice(0, 190);
  await repo.create("ReadingPassage", {
    id, externalRef: ref, title, body: text, genre: null, gradeLevel: grade, gradeBand: String(grade),
    wordCount: st.wordCount, sentenceCount: st.sentenceCount, avgSentenceLength: st.avgSentenceLength, avgWordLength: st.avgWordLength,
    platformReadingLevel: platformReadingLevelFor(text, ""), status: "UNDER_REVIEW", origin: "TEACHER_AUTHORED", createdById, createdAt: now, updatedAt: now,
  });
  return id;
}
