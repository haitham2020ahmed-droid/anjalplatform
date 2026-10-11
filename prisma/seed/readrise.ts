/**
 * `npx tsx prisma/seed/readrise.ts` — the ReadRise PLATFORM library only: data/readrise/articles/*.json →
 * RRArticle (schoolId null, PUBLISHED). Idempotent by code (re-running updates the same rows); never touches the
 * demo / test school. `npm run db:seed:questions` runs the same seed after the question bank.
 */
import { join } from "node:path";
import { seedReadRiseLibrary } from "../../src/server/readrise/seed";
import { runSeed } from "./run";

void runSeed("ReadRise library seed", 1200, (repo) => seedReadRiseLibrary(repo, join(__dirname, "..", "..")));
