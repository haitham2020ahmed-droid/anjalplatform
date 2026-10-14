/**
 * ✓ / ✗ Learn lesson files — the content writers' check (same rules as check.py, src/lib/learn/format.ts).
 *
 *   npx tsx scripts/learn/check.mts                       every data/learn/lessons/LN-*.json
 *   npx tsx scripts/learn/check.mts path/LN-001.json …    only these files
 *
 * Prints ✓ or ✗ per file (and up to 20 problems), exits 1 when any file has a problem.
 */
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { checkLesson } from "../../src/lib/learn/format.ts";

const args = process.argv.slice(2);
const dir = join(process.cwd(), "data", "learn", "lessons");
const files = args.length ? args : readdirSync(dir).filter((f) => /^LN-[A-Za-z0-9-]+\.json$/.test(f)).sort().map((f) => join(dir, f));
let bad = 0;
for (const f of files) {
  let problems: string[];
  try {
    const raw = JSON.parse(readFileSync(f, "utf8")) as unknown;
    problems = checkLesson(raw);
    const code = String((raw as { code?: unknown })?.code ?? "");
    if (!problems.length && /^LN-/.test(basename(f)) && basename(f).replace(/\.json$/, "") !== code) problems.push(`code ${code} does not match the file name`);
  } catch (e) {
    problems = [`invalid JSON: ${(e as Error).message}`];
  }
  console.log(`${problems.length ? "✗" : "✓"} ${f}`);
  for (const p of problems.slice(0, 20)) console.log(`    ${p}`);
  if (problems.length) bad++;
}
if (!files.length) console.log("No lesson files.");
process.exit(bad ? 1 : 0);
