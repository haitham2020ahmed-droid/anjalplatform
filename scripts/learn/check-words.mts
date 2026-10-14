/**
 * ✓ / ✗ Learn word files (data/learn/words/G4.json, G5.json …): every vocabulary word of every selection of the grade in
 * data/curriculum-map/lesson-details.json is there (same names, same order), each with its fields and a check question
 * with 4 different options (src/lib/learn/format.ts checkWordsFile).
 *
 *   npx tsx scripts/learn/check-words.mts                  every data/learn/words/G*.json
 *   npx tsx scripts/learn/check-words.mts path/G4.json …   only these files
 *
 * Prints ✓ or ✗ per file (and up to 30 problems), exits 1 when any file has a problem.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { checkWordsFile, type ExpectedSelection } from "../../src/lib/learn/format.ts";

type Detail = { unit: number; number: number; name: string; vocabulary: string[] };
const details = (JSON.parse(readFileSync(join(process.cwd(), "data", "curriculum-map", "lesson-details.json"), "utf8")) as { grades: Record<string, Record<string, Detail>> }).grades;
const expectedFor = (grade: number): ExpectedSelection[] =>
  Object.values(details[String(grade)] ?? {}).map((d) => ({ unit: d.unit, number: d.number, name: d.name, vocabulary: d.vocabulary ?? [] })).sort((a, b) => a.unit - b.unit || a.number - b.number);

const args = process.argv.slice(2);
const dir = join(process.cwd(), "data", "learn", "words");
let files: string[] = [];
try { files = args.length ? args : readdirSync(dir).filter((f) => /^G\d{1,2}\.json$/.test(f)).sort().map((f) => join(dir, f)); } catch { files = []; }
let bad = 0;
for (const f of files) {
  let problems: string[];
  try {
    const raw = JSON.parse(readFileSync(f, "utf8")) as { grade?: unknown };
    const grade = Number(raw?.grade ?? basename(f).replace(/\D/g, ""));
    const exp = expectedFor(grade);
    problems = exp.length ? checkWordsFile(raw, exp) : [`no Curriculum Map selections for grade ${grade}`];
    if (/^G\d+\.json$/.test(basename(f)) && basename(f) !== `G${grade}.json`) problems.push(`grade ${grade} does not match the file name`);
    if (!problems.length) {
      const n = exp.reduce((a, e) => a + e.vocabulary.length, 0);
      console.log(`✓ ${f} (${n} words)`);
      continue;
    }
  } catch (e) {
    problems = [`invalid JSON: ${(e as Error).message}`];
  }
  console.log(`✗ ${f}`);
  for (const p of problems.slice(0, 30)) console.log(`    ${p}`);
  if (problems.length > 30) console.log(`    … ${problems.length - 30} more`);
  bad++;
}
if (!files.length) console.log("No word files.");
process.exit(bad ? 1 : 0);
