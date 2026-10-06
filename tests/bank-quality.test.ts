/**
 * Question-bank quality rules (added with the bank expansion). Each rule caught real
 * problems while the bank grew from 229 to 1,082 items, so they now run with every build:
 *  - coverage: every Grade 4–6 curriculum quiz skill has at least 6 items
 *  - no near-duplicates: no two items share ≥ 60 % of their content words
 *  - no same-answer duplicates: no two items in the same skill family share a correct answer,
 *    except the reviewed pairs below (short common answers in clearly different sentences)
 *  - two-texts rule: a question that names another passage's title must use a paired-text passage
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./helpers/db";

type Item = { ref: string; grade: number; family: string; type: string; stem: string; passage: string | null; options?: { text: string; correct: boolean }[]; answers?: string[]; pairs?: { left: string; right: string }[]; sequence?: string[]; segments?: string[]; correction?: string };
const bank = JSON.parse(readFileSync(join(ROOT, "data/questions/bank.json"), "utf8")) as { items: Item[]; passages: { id: string; title: string; genre: string }[] };
const norm = (s: string) => s.toLowerCase().replace(/’/g, "'").replace(/[^a-z0-9 ]/g, "").trim();
const words = (i: Item) => new Set(norm([i.stem, ...(i.options ?? []).map((o) => o.text), ...(i.segments ?? []), ...(i.sequence ?? []), ...(i.pairs ?? []).map((p) => `${p.left} ${p.right}`), ...(i.answers ?? [])].join(" ")).split(/\s+/).filter(Boolean));
const answerKey = (i: Item): string | null =>
  i.options ? i.options.filter((o) => o.correct).map((o) => norm(o.text)).sort().join("|")
  : i.answers ? i.answers.map(norm).sort().join("|")
  : i.pairs ? i.pairs.map((p) => norm(p.left + p.right)).sort().join("|")
  : i.sequence ? i.sequence.map(norm).join("|")
  : i.segments ? `${norm(i.correction ?? "")}@${norm(i.segments.join(""))}` : null;

/** Reviewed: same short answer, different sentence and context. */
const ACCEPTED_SAME_ANSWER = [
  ["G4-pronoun-homophones-001", "G6-pronoun-homophones-002"], ["G5-compound-sentences-003", "G6-compound-sentences-004"],
  ["G6-pronouns-001", "G4-pronouns-004"], ["G5-negatives-004", "G4-negatives-003"],
  ["G5-subject-verb-agreement-002", "G4-subject-verb-agreement-004"], ["G6-adverbs-002", "G6-adverbs-003"],
  ["G5-figurative-language-002", "G6-figurative-language-003"], // original items: personification in two different sentences
].map((p) => p.slice().sort().join(","));

describe("question bank quality", () => {
  test("every Grade 4–6 curriculum quiz skill has at least 6 items", () => {
    const count = new Map<string, number>();
    for (const i of bank.items) count.set(`${i.grade}:${i.family}`, (count.get(`${i.grade}:${i.family}`) ?? 0) + 1);
    const thin: string[] = [];
    for (const g of [4, 5, 6]) {
      const cur = JSON.parse(readFileSync(join(ROOT, `data/curriculum/grade-${g}.json`), "utf8")) as { units: { lessons: { skills: { familyCode: string }[] }[]; unitSkills?: { familyCode: string }[] }[] };
      const fams = new Set<string>();
      for (const u of cur.units) {
        for (const l of u.lessons) for (const s of l.skills) fams.add(s.familyCode);
        for (const s of u.unitSkills ?? []) fams.add(s.familyCode);
      }
      for (const f of fams) if (!f.startsWith("writing") && (count.get(`${g}:${f}`) ?? 0) < 6) thin.push(`G${g} ${f}: ${count.get(`${g}:${f}`) ?? 0}`);
    }
    assert.deepEqual(thin, []);
  });

  test("no near-duplicate items (≥ 60 % shared content)", () => {
    const sets = bank.items.map((i) => [i.ref, words(i)] as const);
    const hits: string[] = [];
    for (let a = 0; a < sets.length; a++)
      for (let b = a + 1; b < sets.length; b++) {
        const [ra, wa] = sets[a], [rb, wb] = sets[b];
        let inter = 0;
        for (const w of wa) if (wb.has(w)) inter++;
        if (inter / (wa.size + wb.size - inter) >= 0.6) hits.push(`${ra} ~ ${rb}`);
      }
    assert.deepEqual(hits, []);
  });

  test("no two items in the same skill family share a correct answer (except reviewed pairs)", () => {
    const groups = new Map<string, string[]>();
    for (const i of bank.items) {
      const k = answerKey(i);
      if (k) groups.set(`${i.family}#${k}`, [...(groups.get(`${i.family}#${k}`) ?? []), i.ref]);
    }
    const dups = [...groups.values()].filter((v) => v.length > 1 && !ACCEPTED_SAME_ANSWER.includes(v.slice().sort().join(",")));
    assert.deepEqual(dups, []);
  });

  test("questions that name another passage use a paired-text passage", () => {
    const title = new Map(bank.passages.map((p) => [p.id, p.title]));
    const genre = new Map(bank.passages.map((p) => [p.id, p.genre]));
    const bad = bank.items.filter((i) => {
      const own = i.passage ? title.get(i.passage) : undefined;
      const namesOther = bank.passages.some((p) => p.title !== own && i.stem.includes(`“${p.title}”`));
      return namesOther && (!i.passage || genre.get(i.passage) !== "Paired Texts");
    }).map((i) => i.ref);
    assert.deepEqual(bad, []);
  });
});
