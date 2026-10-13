/**
 * 🗺️ Curriculum Map question sets (Update 56): data/questions/sets/map-vocab-review-sets.json —
 * 30 more Concept Vocabulary questions per selection (…CV) and a 30-question Review per selection (…REV), Grades 4–6.
 * Each question is placed on its map node (and so is in the Question Bank), PUBLISHED, with every MAP answer type.
 *   - Concept Vocabulary questions go to the grade's Concept Vocabulary skill when the curriculum has one;
 *     otherwise (and for Review) to the grade's "Unclassified (Curriculum Map)" skill, as for any map question.
 *   - Safe to run again: a question already on that node (same text and same right answer) is skipped.
 */
import type { Repo, Row } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import { createDraft } from "../admin/questions";
import { libraryActor } from "../readmaster/library";
import { attachmentNodes } from "../curriculum-map/questions";
import { analyseAndPublish, answerText, typeFields, withPassages, type SetQuestion } from "./skill-sets";

const s = (v: unknown) => String(v ?? "");
const LEVEL: Record<string, number> = { BELOW: 2, ON: 4, ABOVE: 6 };
const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export interface MapSetNode { code: string; words: string[]; questions: SetQuestion[] }
export interface MapSetResult { code: string; added: number; skipped: number; errors: string[] }

export async function loadMapSetsFile(file = "map-vocab-review-sets.json"): Promise<MapSetNode[]> {
  const { readFile } = await import("node:fs/promises");
  const { resolve } = await import("node:path");
  const raw = JSON.parse(await readFile(resolve(process.cwd(), "data", "questions", "sets", file), "utf8")) as { nodes: MapSetNode[]; passages?: Record<string, { title: string; text: string }> };
  return withPassages(raw.nodes ?? [], raw.passages);
}

/** The grade's Concept Vocabulary skill (name says so), or null. */
async function conceptVocabularySkill(repo: Repo, schoolId: string, grade: number): Promise<string | null> {
  const g = (await repo.findMany("Grade", { schoolId, level: grade }, { select: ["id"] }))[0];
  if (!g) return null;
  const cur = (await repo.findMany("Curriculum", { gradeId: g.id }, { select: ["id"] }))[0];
  if (!cur) return null;
  const sk = (await repo.findMany("Skill", { curriculumId: cur.id, deletedAt: null }, { select: ["id", "name"] })).find((k) => /concept\s*vocab/i.test(s(k.name)));
  return sk ? s(sk.id) : null;
}

export async function addMapSets(repo: Repo, schoolId: string, nodes: MapSetNode[], actorIn?: Actor, now = new Date()): Promise<MapSetResult[]> {
  const actor = actorIn ?? (await libraryActor(repo, schoolId));
  const places = new Map((await attachmentNodes(repo, schoolId)).map((n) => [n.code.toUpperCase(), n]));
  const cvSkill = new Map<number, string | null>();
  const out: MapSetResult[] = [];
  for (const node of nodes) {
    const r: MapSetResult = { code: node.code, added: 0, skipped: 0, errors: [] };
    const place = places.get(node.code.toUpperCase());
    if (!place) { r.errors.push("This Curriculum Map place does not exist in this school (seed the map first)."); out.push(r); continue; }
    let skillId: string | null = null;
    if (place.category === "CONCEPT_VOCABULARY") {
      if (!cvSkill.has(place.grade)) cvSkill.set(place.grade, await conceptVocabularySkill(repo, schoolId, place.grade));
      skillId = cvSkill.get(place.grade) ?? null;
    }
    // what is already on the node: text + right answer (choices) or text alone (other types)
    const links = await repo.findMany("QuestionMapLink", { nodeId: place.id }, { select: ["questionId"] });
    const ids = links.map((l) => s(l.questionId));
    const qs = ids.length ? await repo.findMany("Question", { id: { in: ids }, deletedAt: null }, { select: ["id", "stem"] }) : [];
    const right = ids.length ? await repo.findMany("QuestionOption", { questionId: { in: ids }, isCorrect: true }, { select: ["questionId", "label", "text"] }) : [];
    const ans = new Map<string, string[]>();
    for (const o of right.sort((a, b) => s(a.label).localeCompare(s(b.label)))) ans.set(s(o.questionId), [...(ans.get(s(o.questionId)) ?? []), s(o.text)]);
    const have = new Set(qs.map((q) => ans.has(s(q.id)) ? `${key(s(q.stem))}|${key(ans.get(s(q.id))!.join(" "))}` : `${key(s(q.stem))}|*`));
    // ⚡ created first, analysed together (one pass per place), then published (one statement)
    const made: { qid: string; data: Row }[] = [];
    for (const q of node.questions) {
      const k = `${key(q.stem)}|${key(answerText(q))}`;
      if (have.has(k) || have.has(`${key(q.stem)}|*`)) { r.skipped++; continue; }
      try {
        const qid = await createDraft(repo, actor, {
          ...(skillId ? { skillId } : {}), mapNodeCode: place.code, stem: q.stem, level: LEVEL[s(q.level).toUpperCase()] ?? 4, whyCorrect: q.why, ...typeFields(q),
          ...(q.passage ? { passageText: q.passageTitle ? `${q.passageTitle}\n\n${q.passage}` : q.passage } : {}),
        } as never, now, { deferAnalysis: true });
        made.push({ qid, data: { status: "PUBLISHED", publishedAt: now, reviewedById: actor.userId } });
        have.add(k); r.added++;
      } catch (e) {
        if (/already exists|duplicate/i.test((e as Error).message)) r.skipped++;
        else r.errors.push(`${q.ref}: ${(e as Error).message}`);
      }
    }
    await analyseAndPublish(repo, schoolId, made, now);
    out.push(r);
  }
  return out;
}
