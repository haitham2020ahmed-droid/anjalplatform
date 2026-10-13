/**
 * Profile one unit of each question pack: the database calls by model and operation
 *   npx tsx scripts/perf/profile-load.ts          (PACKS=gap,span,map  FROM=0)
 */
import { demoDatabase, ROOT } from "../../tests/helpers/db";
import { resolveActor } from "../../src/server/auth/actor";
import type { FindOptions, Repo, Row, Where } from "../../src/server/seeding/repo";
import { seedQuestions } from "../../src/server/seeding/questions";
import { loadBank } from "../../src/server/seeding/load-files";
import { DEMO_SCHOOL_CODE } from "../../src/server/seeding/demo";
import { PACKS, runPackChunk } from "../../src/server/questions/load-packs";

const by = new Map<string, number>();
let calls = 0;
const note = (k: string) => { calls++; by.set(k, (by.get(k) ?? 0) + 1); };
class P implements Repo {
  constructor(private readonly i: Repo) {}
  upsert(m: string, w: Record<string, unknown>, c: Row, u?: Row) { note(`upsert ${m}`); return this.i.upsert(m, w, c, u); }
  create(m: string, d: Row) { note(`create ${m}`); return this.i.create(m, d); }
  createMany(m: string, rows: Row[]) { note(`createMany ${m}`); return this.i.createMany(m, rows); }
  findUnique(m: string, w: Record<string, unknown>) { note(`findUnique ${m}`); return this.i.findUnique(m, w); }
  findMany(m: string, w?: Where, o?: FindOptions) { note(`findMany ${m}`); return this.i.findMany(m, w, o); }
  count(m: string, w?: Where) { note(`count ${m}`); return this.i.count(m, w); }
  updateMany(m: string, w: Where, d: Row) { note(`updateMany ${m}`); return this.i.updateMany(m, w, d); }
  deleteMany(m: string, w: Where) { note(`deleteMany ${m}`); return this.i.deleteMany(m, w); }
  transaction<T>(fn: (tx: Repo) => Promise<T>): Promise<T> { note("transaction"); return this.i.transaction((tx) => fn(new P(tx))); }
}

async function main() {
  const { repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 2 });
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  const admin = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
  const want = (process.env.PACKS ?? "gap,span,map").split(",");
  for (const def of PACKS.filter((p) => want.includes(p.key))) {
    if (def.kind === "map") await runPackChunk(repo, admin.schoolId!, def, 0, { maxUnits: 1 }); // the map seed first
    by.clear(); calls = 0;
    const t = Date.now();
    const w = await runPackChunk(new P(repo), admin.schoolId!, def, def.kind === "map" ? 1 : Number(process.env.FROM ?? 0), { maxUnits: 1 });
    console.log(`\n${def.key}: added ${w.added} skipped ${w.skipped} calls ${calls} (${(calls / Math.max(1, w.added)).toFixed(1)}/question) ${Date.now() - t} ms ${w.errors.slice(0, 2).join(" | ")}`);
    for (const [k, v] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${String(v).padStart(5)}  ${k}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
