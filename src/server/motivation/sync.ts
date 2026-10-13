/**
 * 🔄 Rewards sync (Games Part 3): brings one student's coins, badges and automatic certificates up to date from
 * their OWN learning records — READ ONLY on learning data (the adaptive engine, levels and mastery are never written).
 *
 *   My Work skill finished (AssignmentStudent COMPLETED)  → coins (once per assignment)
 *   skill mastered (the school's mastered rule)            → coins (once per skill)
 *   moved up a level (AuditLog level.change, up)          → coins + certificate (once per change)
 *   every part of a plan finished                          → coins + certificate (once per plan)
 *   badges                                                 → re-checked (studentBadges saves new ones)
 *
 * Runs on events (the student home's Question of the Day card, at most once per SYNC_EVERY_MS per student) and in
 * the daily job for students active in the last day and a half (bounded). Every read is one student's rows.
 */
import type { Repo, Row } from "../seeding/repo";
import { ladderSettings } from "../curriculum-map/ladder-settings";
import { CATEGORY_NAME, type Category } from "../curriculum-map/student-level";
import { studentSkillPlans } from "../curriculum-map/plans";
import { COINS, insertLedger, recomputeCoins, type CoinReason } from "./coins";
import { autoCertificate } from "./certificates";
import { evaluateBadges } from "./badges";
import { log } from "../monitoring/log";

const s = (v: unknown) => String(v ?? "");
const DAY = 86_400_000;
const ms = (v: unknown) => (v instanceof Date ? v.getTime() : new Date(s(v)).getTime());
const json = (v: unknown): Record<string, unknown> => { if (typeof v === "string") { try { return JSON.parse(v) as Record<string, unknown>; } catch { return {}; } } return (v ?? {}) as Record<string, unknown>; };
export const SYNC_EVERY_MS = 10 * 60_000;
/** the first sync looks back this far for coins; certificates only for the last FIRST_CERT_DAYS */
const FIRST_LOOKBACK_DAYS = 365, FIRST_CERT_DAYS = 14;
const RANK: Record<string, number> = { BELOW: 0, ON: 1, ABOVE: 2 };
const LEVEL_NAME: Record<string, string> = { BELOW: "Approaching", ON: "Meeting", ABOVE: "Exceeding" };

/** Level-up events in these audit rows (up moves only; a first level is not a move). */
export function levelUps(rows: Row[]): { id: string; at: number; level: string; category: string | null }[] {
  const out: { id: string; at: number; level: string; category: string | null }[] = [];
  for (const r of rows) {
    const a = json(r.after), b = json(r.before);
    if (a.outcome !== "CHANGED" || !b.level || !(s(a.level) in RANK) || !(s(b.level) in RANK)) continue;
    if (RANK[s(a.level)] > RANK[s(b.level)]) out.push({ id: s(r.id), at: ms(r.createdAt), level: s(a.level), category: a.category ? s(a.category) : null });
  }
  return out;
}

export interface SyncResult { newCoins: number; coins: number; certificates: number; badges: string[] }

export async function syncRewards(repo: Repo, studentId: string, now = new Date(), opts: { force?: boolean } = {}): Promise<SyncResult | null> {
  const w = await repo.findUnique("StudentReward", { studentId });
  const last = w?.syncedAt ? ms(w.syncedAt) : null;
  if (!opts.force && last !== null && now.getTime() - last < SYNC_EVERY_MS && now.getTime() >= last) return null;
  const st = await repo.findUnique("Student", { id: studentId });
  if (!st) return null;
  // claim the slot first so two page loads at once do the work once
  await repo.upsert("StudentReward", { studentId }, { studentId, syncedAt: now }, { syncedAt: now });
  const schoolId = s(st.schoolId);
  const since = new Date(last === null ? now.getTime() - FIRST_LOOKBACK_DAYS * DAY : last - 2 * DAY);
  const certSince = last === null ? now.getTime() - FIRST_CERT_DAYS * DAY : last - 2 * DAY;
  const actor = { userId: s(st.userId), role: "STUDENT" as const, schoolId, studentId };
  const [done, mastery, rules, audits, paid, plans] = await Promise.all([
    repo.findMany("AssignmentStudent", { studentId, status: "COMPLETED" }, { select: ["assignmentId"], take: 3000 }),
    repo.findMany("StudentSkillMastery", { studentId }, { select: ["skillId", "attempts", "correct"], take: 3000 }),
    ladderSettings(repo, schoolId),
    repo.findMany("AuditLog", { entityType: "Student", entityId: studentId, action: "level.change", createdAt: { gte: since } }, { select: ["id", "before", "after", "createdAt"], take: 500 }),
    repo.findMany("CoinLedger", { studentId, reason: { in: ["work", "mastered", "levelup", "plan"] } }, { select: ["reason", "refId"], take: 8000 }),
    studentSkillPlans(repo, actor).catch(() => [] as Awaited<ReturnType<typeof studentSkillPlans>>),
  ]);
  const have = new Set(paid.map((p) => `${s(p.reason)}|${s(p.refId)}`));
  const due: { reason: CoinReason; refId: string; amount: number; note: string }[] = [];
  const add = (reason: CoinReason, refId: string, amount: number, note: string) => { if (!have.has(`${reason}|${refId}`)) { have.add(`${reason}|${refId}`); due.push({ reason, refId, amount, note }); } };
  for (const d of done) add("work", s(d.assignmentId), COINS.work, "My Work skill finished");
  for (const m of mastery) if (Number(m.attempts) >= rules.masteredMin && (Number(m.correct) / Math.max(1, Number(m.attempts))) * 100 >= rules.masteredPct) add("mastered", s(m.skillId), COINS.mastered, "Skill mastered");
  const ups = levelUps(audits);
  for (const u of ups) add("levelup", u.id, COINS.levelup, `Moved up to ${LEVEL_NAME[u.level]}`);
  const finished = plans.filter((p) => p.places > 0 && p.done >= p.places);
  for (const p of finished) add("plan", p.id, COINS.plan, `Finished the plan: ${p.title}`.slice(0, 200));
  let newCoins = 0;
  for (let i = 0; i < due.length; i += 20) {
    const r = await Promise.all(due.slice(i, i + 20).map((d) => insertLedger(repo, { studentId, amount: d.amount, reason: d.reason, refId: d.refId, note: d.note, createdAt: now }).then((ok) => (ok ? d.amount : 0))));
    newCoins += r.reduce((a, b) => a + b, 0);
  }
  // automatic certificates: a level up, a finished plan (once each)
  let certificates = 0;
  for (const u of ups.filter((x) => x.at >= certSince)) {
    const cat = u.category && u.category in CATEGORY_NAME ? CATEGORY_NAME[u.category as Category] : null;
    if (await autoCertificate(repo, { schoolId, studentId, kind: "LEVEL_UP", refId: u.id, title: `Moved up to ${LEVEL_NAME[u.level]}`, detail: cat, now })) certificates++;
  }
  for (const p of finished) if (await autoCertificate(repo, { schoolId, studentId, kind: "PLAN", refId: p.id, title: `Finished the plan: ${p.title}`, now })) certificates++;
  const { coins } = await recomputeCoins(repo, studentId);
  const badges = await evaluateBadges(repo, studentId, now).catch((e) => { log("error", "rewards.badges_failed", { error: e }); return [] as string[]; });
  return { newCoins, coins, certificates, badges };
}

/** The daily job: students of the school active in the last 36 hours (answers, ReadRise, level changes), bounded. */
export const DAILY_MAX_STUDENTS = 1500;
export async function syncSchoolRewards(repo: Repo, schoolId: string, now = new Date()): Promise<{ students: number; coins: number; certificates: number; badges: number }> {
  const ids = (await repo.findMany("Student", { schoolId }, { select: ["id"] })).map((x) => s(x.id));
  const since = new Date(now.getTime() - 1.5 * DAY);
  const active = new Set<string>();
  for (let i = 0; i < ids.length && active.size < DAILY_MAX_STUDENTS; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const [qa, rr, lv, done] = await Promise.all([
      repo.findMany("QuestionAttempt", { studentId: { in: chunk }, createdAt: { gte: since } }, { select: ["studentId"] }),
      repo.findMany("RRRun", { studentId: { in: chunk }, startedAt: { gte: since } }, { select: ["studentId"] }),
      repo.findMany("AuditLog", { entityType: "Student", entityId: { in: chunk }, action: "level.change", createdAt: { gte: since } }, { select: ["entityId"] }),
      repo.findMany("AssignmentStudent", { studentId: { in: chunk }, status: "COMPLETED", completedAt: { gte: since } }, { select: ["studentId"] }).catch(() => [] as Row[]),
    ]);
    for (const r of [...qa, ...rr, ...done]) active.add(s(r.studentId));
    for (const r of lv) active.add(s(r.entityId));
  }
  const list = [...active].slice(0, DAILY_MAX_STUDENTS);
  let coins = 0, certificates = 0, badges = 0;
  for (let i = 0; i < list.length; i += 5) {
    const rs = await Promise.all(list.slice(i, i + 5).map((id) => syncRewards(repo, id, now, { force: true }).catch((e) => { log("error", "rewards.sync_failed", { error: e }); return null; })));
    for (const r of rs) if (r) { coins += r.newCoins; certificates += r.certificates; badges += r.badges.length; }
  }
  return { students: list.length, coins, certificates, badges };
}
