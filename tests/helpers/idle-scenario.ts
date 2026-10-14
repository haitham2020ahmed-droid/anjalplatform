/**
 * 🧠 "A school day, then the evening" (r68): what the server keeps in memory once everybody has gone home.
 *
 * A production-sized bank (14,000 generated questions + the platform bank, in-memory SQLite — never a real database),
 * then the hot work of a day: practice pools for many skills, the admin's bank-wide pages (question intelligence,
 * coverage, MAP links, search, the bank list), the teachers' Learn / NAFS / question-pack content. The heap after a full
 * garbage collection is measured before the day, after it (what an idle server keeps), and after the idle clean-up
 * (expired cache entries removed, idle content released) — the clean-up is skipped where the code has none.
 */
import type { Actor } from "../../src/server/auth/rbac";
import { resolveActor } from "../../src/server/auth/actor";
import { loadSkillItems } from "../../src/server/practice/items";
import { DEMO_SCHOOL_CODE } from "../../src/server/seeding/demo";
import { loadBank } from "../../src/server/seeding/load-files";
import { seedQuestions } from "../../src/server/seeding/questions";
import { addBigBank } from "./big-bank";
import { demoDatabase } from "./db";
import { ROOT } from "./db";

const MB = 1048576;
const gc = (globalThis as { gc?: () => void }).gc;
export const heapNow = (): number => { gc?.(); gc?.(); return process.memoryUsage().heapUsed / MB; };

export interface DayMemory { before: number; afterDay: number; afterIdle: number; steps: { name: string; mb: number }[]; cleanup: boolean }

export async function schoolDayMemory(opts: { bank?: number; skills?: number } = {}): Promise<DayMemory> {
  const { db, repo } = await demoDatabase({ classesPerGrade: 1, studentsPerClass: 25 });
  await addBigBank(db, repo, { n: opts.bank ?? 14_000 });
  await seedQuestions(repo, { schoolCode: DEMO_SCHOOL_CODE, bank: loadBank(ROOT) });
  const pending = await repo.findMany("Question", { status: "UNDER_REVIEW" }, { select: ["id"] });
  await repo.updateMany("Question", { id: { in: pending.map((q) => q.id) } }, { status: "PUBLISHED" });
  const admin: Actor = await resolveActor(repo, (await repo.findUnique("User", { username: "demo.admin" }))!);
  const schoolId = admin.schoolId!;
  const skills = (await repo.findMany("Skill", { deletedAt: null, isActive: true }, { select: ["id"], orderBy: [{ field: "id", dir: "asc" }] })).map((k) => String(k.id)).slice(0, opts.skills ?? 150);
  // modules the day uses, loaded before the first measurement (their code is not what we measure)
  const [intel, mapMore, search, list, learn, booklets, practiceSets, packs] = await Promise.all([
    import("../../src/server/questions/intelligence"), import("../../src/server/map/map-more"), import("../../src/server/search/everything"),
    import("../../src/server/admin/questions-list"), import("../../src/server/learn/files"), import("../../src/server/nafs/booklets"),
    import("../../src/server/nafs/practice-sets"), import("../../src/server/questions/load-packs"),
  ]);
  const steps: { name: string; mb: number }[] = [];
  const before = heapNow();
  let last = before;
  const step = async (name: string, fn: () => Promise<unknown> | unknown) => { await fn(); const h = heapNow(); steps.push({ name, mb: Math.round((h - last) * 10) / 10 }); last = h; };
  await step("practice pools (students, many skills)", async () => { for (const id of skills) { await loadSkillItems(repo, id); await loadSkillItems(repo, id, { wholePool: true }); } });
  await step("question intelligence + coverage (admin)", async () => { await intel.intelligenceOverview(repo, schoolId); await intel.coverage(repo, schoolId); for (const g of [4, 5, 6]) { await intel.intelligenceOverview(repo, schoolId, g); await intel.coverage(repo, schoolId, g); } });
  await step("MAP links (admin)", () => mapMore.mapLinks(repo, admin).catch(() => null));
  await step("search + bank list (admin)", async () => { for (const w of ["river", "garden", "planet", "castle"]) await search.searchEverything(repo, admin, w).catch(() => null); await list.listBankPage(repo, admin, {} as never).catch(() => null); await list.bankStatusCounts(repo, admin, {} as never).catch(() => null); });
  await step("Learn / NAFS content (teachers)", () => { learn.lessonCatalog(); learn.readContinuum(); learn.readWordFiles(); booklets.readBooklets(); practiceSets.readPracticeSets(); });
  await step("question packs (Load new questions)", async () => { for (const p of packs.PACKS) await packs.loadPack(p).catch(() => null); });
  const afterDay = heapNow();
  let cleanup = false;
  try {
    const idle = await import("../../src/server/cache/idle");
    // the evening: an hour later the sweeper has removed every expired entry and released the idle content files
    idle.sweepCaches(Date.now() + 3_600_000);
    idle.releaseIdleContent(0);
    cleanup = true;
  } catch { /* no idle clean-up in this version of the code */ }
  const afterIdle = heapNow();
  return { before: Math.round(before), afterDay: Math.round(afterDay), afterIdle: Math.round(afterIdle), steps, cleanup };
}
