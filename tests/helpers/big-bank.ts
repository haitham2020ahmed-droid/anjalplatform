/**
 * A production-sized question bank for speed and memory checks: `n` multiple-choice questions (4 choices, an answer
 * row-free key, a WHY_CORRECT explanation) spread over the school's skills, all statuses and levels, written with
 * raw prepared statements (seconds, not minutes). Every `dupEvery`-th question is an exact copy of an earlier one
 * (same skill family), so the duplicate tools have work to do.
 */
import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { SqliteRepo } from "../../scripts/db/sqlite-repo";

const STATUSES = ["PUBLISHED", "PUBLISHED", "PUBLISHED", "DRAFT", "UNDER_REVIEW", "ARCHIVED"];
const WORDS = ["river", "garden", "lantern", "bridge", "planet", "harbor", "meadow", "castle", "forest", "island", "desert", "canyon", "valley", "market", "library"];
const id = () => "c" + Date.now().toString(36) + randomBytes(8).toString("hex");

export async function addBigBank(db: DatabaseSync, repo: SqliteRepo, opts: { n?: number; dupEvery?: number } = {}): Promise<{ questions: number; duplicates: number }> {
  const n = opts.n ?? 14_000, dupEvery = opts.dupEvery ?? 50;
  const skills = (await repo.findMany("Skill", { deletedAt: null }, { select: ["id"] })).map((k) => String(k.id));
  let type = await repo.findUnique("QuestionType", { code: "MULTIPLE_CHOICE" });
  if (!type) type = await repo.create("QuestionType", { code: "MULTIPLE_CHOICE", name: "multiple choice", isAutoScored: true });
  const typeId = String(type.id);
  const q = db.prepare(`INSERT INTO "Question" ("id","externalRef","skillId","typeId","stem","content","difficultyLevel","irtB","status","origin","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const o = db.prepare(`INSERT INTO "QuestionOption" ("id","questionId","label","text","isCorrect","rationale","order") VALUES (?,?,?,?,?,?,?)`);
  const e = db.prepare(`INSERT INTO "QuestionExplanation" ("id","questionId","kind","body","order") VALUES (?,?,?,?,?)`);
  const made: { skill: string; stem: string; opts: string[] }[] = [];
  let dups = 0;
  db.exec("BEGIN");
  try {
    for (let i = 0; i < n; i++) {
      const qid = id();
      const copy = i > 0 && i % dupEvery === 0 ? made[(i * 7) % made.length] : null;
      const skill = copy ? copy.skill : skills[i % skills.length];
      const w = WORDS[i % WORDS.length], v = WORDS[(i * 3 + 1) % WORDS.length];
      const stem = copy ? copy.stem : `Question ${i}: in the story about the ${w} and the ${v}, which detail best supports the main idea of paragraph ${1 + (i % 9)}?`;
      const opts = copy ? copy.opts : [`The ${w} was near item ${i}`, `The ${v} was far from item ${i}`, `Nobody saw item ${i}`, `Everyone left item ${i}`];
      if (copy) dups++; else made.push({ skill, stem, opts });
      const at = new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString();
      q.run(qid, `BIG-${i}`, skill, typeId, stem, "{}", 1 + (i % 7), 0, STATUSES[i % STATUSES.length], i % 5 === 0 ? "IMPORTED" : "TEACHER_AUTHORED", at, at);
      opts.forEach((t, k) => o.run(id(), qid, "ABCD"[k], t, k === 0 ? 1 : 0, k === 0 ? null : "Not this one.", k));
      e.run(id(), qid, "WHY_CORRECT", JSON.stringify([{ type: "text", text: "Because the text says so." }]), 0);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return { questions: n, duplicates: dups };
}
