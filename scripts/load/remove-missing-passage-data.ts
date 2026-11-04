/**
 * 🧾 Removes, at the source, every bundled question whose wording needs a passage / picture it does not carry
 * (src/lib/missing-passage.ts — the same rule as the school's bank). Idempotent: a second run changes nothing.
 * Files keep their own JSON layout. No database is touched.
 *
 *   npx tsx scripts/load/remove-missing-passage-data.ts          # list only
 *   npx tsx scripts/load/remove-missing-passage-data.ts --write  # remove them from the files
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { missingPassageHit } from "../../src/lib/missing-passage";

type Q = Record<string, unknown>;
const ROOT = join(__dirname, "..", "..");

export const BUNDLED_QUESTION_FILES = (): string[] => [
  "data/questions/bank.json", "data/questions/new-types-samples.json", "data/questions/sentence-combine-items.json", "data/questions/word-study-items.json",
  ...readdirSync(join(ROOT, "data/questions/sets")).filter((f) => f.endsWith(".json")).sort().map((f) => `data/questions/sets/${f}`),
];

/** The question carries a passage (inline text or a reference) or a picture. */
export const carriesPassage = (q: Q): boolean => Boolean((typeof q.passage === "string" ? q.passage.trim() : q.passage) || q.passageRef || q.image || q.imageUrl);

export interface Removed { file: string; ref: string; stem: string; rule: string; words: string }

/** Every bundled question that needs a missing passage (pure read). */
export function findInBundledFiles(): Removed[] {
  const out: Removed[] = [];
  for (const f of BUNDLED_QUESTION_FILES()) {
    const d = JSON.parse(readFileSync(join(ROOT, f), "utf8")) as { items?: Q[]; sets?: { questions?: Q[] }[]; nodes?: { questions?: Q[] }[] };
    for (const q of [...(d.items ?? []), ...(d.sets ?? []).flatMap((x) => x.questions ?? []), ...(d.nodes ?? []).flatMap((x) => x.questions ?? [])]) {
      if (carriesPassage(q)) continue;
      const h = missingPassageHit(String(q.stem ?? ""));
      if (h) out.push({ file: f, ref: String(q.ref ?? ""), stem: String(q.stem ?? ""), rule: h.rule, words: h.words });
    }
  }
  return out;
}

/** The same JSON layout as the file had (indent 0 / 1 / 2 / none, trailing newline or not). */
function stringifyLike(raw: string, data: unknown): string {
  // Python's indent=0 (a new line per value, no spaces) is JSON.stringify with indent 1 and the spaces taken off
  // (strings never hold a raw line break in JSON)
  const layouts: ((x: unknown) => string)[] = [(x) => JSON.stringify(x, null, 1).replace(/^ +/gm, ""), (x) => JSON.stringify(x, null, 1), (x) => JSON.stringify(x, null, 2), (x) => JSON.stringify(x)];
  for (const lay of layouts) {
    const s = lay(JSON.parse(raw));
    if (s === raw || `${s}\n` === raw) return lay(data) + (raw.endsWith("\n") ? "\n" : "");
  }
  return `${JSON.stringify(data, null, 1)}\n`;
}

export function removeFromBundledFiles(): Removed[] {
  const found = findInBundledFiles();
  for (const f of [...new Set(found.map((x) => x.file))]) {
    const refs = new Set(found.filter((x) => x.file === f).map((x) => x.ref));
    const raw = readFileSync(join(ROOT, f), "utf8");
    const d = JSON.parse(raw) as { items?: Q[]; sets?: { questions?: Q[] }[]; nodes?: { questions?: Q[] }[] };
    const keep = (q: Q) => carriesPassage(q) || !refs.has(String(q.ref ?? "")) || !missingPassageHit(String(q.stem ?? ""));
    if (d.items) d.items = d.items.filter(keep);
    for (const x of [...(d.sets ?? []), ...(d.nodes ?? [])]) if (x.questions) x.questions = x.questions.filter(keep);
    writeFileSync(join(ROOT, f), stringifyLike(raw, d));
  }
  return found;
}

if (require.main === module) {
  const write = process.argv.includes("--write");
  const r = write ? removeFromBundledFiles() : findInBundledFiles();
  for (const x of r) console.log(`${x.file} ${x.ref} [${x.rule}: ${x.words}] ${x.stem}`);
  console.log(`${r.length} question(s) ${write ? "removed" : "found"}.`);
}
