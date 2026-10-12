/**
 * Re-records tests/fixtures/update42b-golden.json with the CURRENT code (run only when a deliberate rule change moves
 * which question is served, e.g. the no-repeat rule): `npx tsx tests/helpers/record-update42b.ts [--write]`.
 * Without --write it prints where the current run first differs from the recording.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runScenario } from "./update42b-scenario";
import { ROOT } from "./db";

const strip = (x: unknown): unknown => Array.isArray(x) ? x.map(strip) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).filter(([k]) => k !== "continueHref").map(([k, v]) => [k, strip(v)])) : x;

(async () => {
  const now = JSON.parse(JSON.stringify(await runScenario((p) => import(join(ROOT, p)))));
  now.log = strip(now.log);
  const file = join(ROOT, "tests/fixtures/update42b-golden.json");
  const golden = JSON.parse(readFileSync(file, "utf8"));
  const first = now.log.findIndex((x: unknown, i: number) => JSON.stringify(x) !== JSON.stringify(golden.log[i]));
  console.log(`log: ${golden.log.length} → ${now.log.length} entries; first difference at #${first}`);
  if (first >= 0) console.log(JSON.stringify({ was: golden.log[first], now: now.log[first] }, null, 1).slice(0, 4000));
  if (process.argv.includes("--write")) { writeFileSync(file, JSON.stringify({ log: now.log, saved: now.saved }, null, 2) + "\n"); console.log("written"); }
  process.exit(0);
})();
