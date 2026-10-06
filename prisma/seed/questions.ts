/** `npm run db:seed:questions -- --school=ALANJAL` — question bank (imports as UNDER_REVIEW; idempotent, safe to re-run). */
import { join } from "node:path";
import { loadBank } from "../../src/server/seeding/load-files";
import { seedQuestions } from "../../src/server/seeding/questions";
import { runSeed } from "./run";

const school = process.argv.find((a) => a.startsWith("--school="))?.split("=")[1] ?? "ALANJAL";
void runSeed("Question bank seed", 7100, (repo) => seedQuestions(repo, { schoolCode: school, bank: loadBank(join(__dirname, "..", "..")) }));
