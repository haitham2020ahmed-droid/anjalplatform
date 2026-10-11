/** `npm run db:seed:questions -- --school=ALANJAL` — question bank (imports as UNDER_REVIEW; idempotent, safe to re-run). */
import { join } from "node:path";
import { loadBank } from "../../src/server/seeding/load-files";
import { seedQuestions, withNewTypeSamples, withSentenceCombineItems, withWordStudyItems } from "../../src/server/seeding/questions";
import { runSeed } from "./run";

const school = process.argv.find((a) => a.startsWith("--school="))?.split("=")[1] ?? "ALANJAL";
void runSeed("Question bank seed", 7100, (repo) => seedQuestions(repo, { schoolCode: school, bank: withSentenceCombineItems(join(__dirname, "..", ".."), withWordStudyItems(join(__dirname, "..", ".."), withNewTypeSamples(join(__dirname, "..", ".."), loadBank(join(__dirname, "..", ".."))))) }));
void import("../../src/server/readrise/seed").then((m) => runSeed("ReadRise library seed", 1200, (repo) => m.seedReadRiseLibrary(repo, join(__dirname, "..", ".."))));
