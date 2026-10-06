/** `npm run db:seed:curriculum -- --school=ALANJAL` — real school curriculum (idempotent, safe to re-run). */
import { join } from "node:path";
import { seedCurriculum } from "../../src/server/seeding/curriculum";
import { loadCurriculumInput } from "../../src/server/seeding/load-files";
import { runSeed } from "./run";

const school = process.argv.find((a) => a.startsWith("--school="))?.split("=")[1] ?? "ALANJAL";
void runSeed("Curriculum seed", 3000, (repo) => seedCurriculum(repo, loadCurriculumInput(join(__dirname, "..", ".."), school, "Al-Anjal Private Schools")));
