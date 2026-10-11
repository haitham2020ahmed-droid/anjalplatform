/** Checks the ReadRise placement test: three passages per level (a/b/c), each within ±70 of its target on the
 *  estimator, word counts in range, and three valid questions (detail + central idea + inference/vocabulary).
 *  Usage: npx tsx scripts/readrise/check-placement.mts [data/readrise/placement.json]   (exits 1 on any failure) */
import { readFileSync } from "node:fs";
import { estimateLevel } from "../../src/server/readrise/level";

type Q = { stem: string; options: string[]; answer: string; skill: string };
type P = { id: string; level: number; title: string; text: string; questions: Q[] };

const LEVELS = [300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400];
const SUFFIXES = ["a", "b", "c"];
const TOL = 70;
const SKILLS = new Set(["detail", "central-idea", "inference", "vocabulary"]);

const file = process.argv[2] ?? "data/readrise/placement.json";
const data = JSON.parse(readFileSync(file, "utf8")) as { passages: P[] };
const problems: string[] = [];

/** Word range: 60–90 at 300 rising linearly to 150–190 at 1400. */
const wordRange = (lvl: number) => {
  const t = (lvl - 300) / 1100;
  return { min: Math.round(60 + 90 * t), max: Math.round(90 + 100 * t) };
};

// distinct ids, no strays
const seen = new Set<string>();
for (const p of data.passages) {
  if (seen.has(p.id)) problems.push(`duplicate id ${p.id}`);
  seen.add(p.id);
}
const expected = new Set(LEVELS.flatMap((l) => SUFFIXES.map((s) => `P${l}${s}`)));
for (const id of seen) if (!expected.has(id)) problems.push(`unexpected passage ${id}`);
const titles = new Set<string>();

const answerCount: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
let longestRight = 0, totalQ = 0;

console.log("ID       level   est   diff  words  range     result");
console.log("-------  -----  ----  -----  -----  -------   ------");
for (const lvl of LEVELS) {
  for (const suffix of SUFFIXES) {
    const id = `P${lvl}${suffix}`;
    const p = data.passages.find((x) => x.id === id);
    if (!p) { problems.push(`missing ${id}`); console.log(`${id.padEnd(7)}  MISSING`); continue; }
    const errs: string[] = [];
    if (p.level !== lvl) errs.push(`level field ${p.level}`);
    if (!p.title?.trim()) errs.push("no title");
    else if (titles.has(p.title)) errs.push("duplicate title");
    titles.add(p.title);
    const est = estimateLevel(p.text);
    const words = (p.text.match(/[A-Za-z’'-]+/g) ?? []).length;
    const wr = wordRange(lvl);
    if (Math.abs(est - lvl) > TOL) errs.push("level");
    if (words < wr.min || words > wr.max) errs.push("words");
    const qs = p.questions ?? [];
    if (qs.length !== 3) errs.push(`${qs.length} questions`);
    const skills = qs.map((q) => q.skill);
    if (!skills.includes("detail") || !skills.includes("central-idea") || !(skills.includes("inference") || skills.includes("vocabulary")))
      errs.push("skill mix");
    for (const [i, q] of qs.entries()) {
      if (!q.stem?.trim()) errs.push(`q${i + 1} stem`);
      if (!SKILLS.has(q.skill)) errs.push(`q${i + 1} skill`);
      if (!Array.isArray(q.options) || q.options.length !== 4 || new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4 || q.options.some((o) => !o.trim()))
        { errs.push(`q${i + 1} options`); continue; }
      if (!["A", "B", "C", "D"].includes(q.answer)) { errs.push(`q${i + 1} answer`); continue; }
      answerCount[q.answer]++;
      totalQ++;
      const ri = "ABCD".indexOf(q.answer);
      const right = q.options[ri].length;
      if (q.options.every((o, j) => j === ri || o.length < right)) longestRight++;
    }
    if (errs.length) problems.push(`${id}: ${errs.join(", ")} (est ${est}, ${words} words)`);
    const diff = est - lvl;
    console.log(
      `${id.padEnd(7)}  ${String(lvl).padStart(5)}  ${String(est).padStart(4)}  ${((diff >= 0 ? "+" : "") + diff).padStart(5)}` +
        `  ${String(words).padStart(5)}  ${`${wr.min}-${wr.max}`.padEnd(7)}   ${errs.length ? "FAIL " + errs.join(", ") : "pass"}`,
    );
  }
}

console.log(`\nAnswer spread: A ${answerCount.A}, B ${answerCount.B}, C ${answerCount.C}, D ${answerCount.D}`);
console.log(`Correct option is the strictly longest in ${longestRight}/${totalQ} questions`);
if (Object.values(answerCount).some((n) => n < totalQ * 0.18)) problems.push("answer letters poorly spread");
if (longestRight > totalQ * 0.35) problems.push("correct option is too often the longest");

if (problems.length) {
  console.log(`\nFAILED (${problems.length}):\n- ` + problems.join("\n- "));
  process.exit(1);
}
console.log(`\nAll ${data.passages.length} passages pass (±${TOL} of target level).`);
