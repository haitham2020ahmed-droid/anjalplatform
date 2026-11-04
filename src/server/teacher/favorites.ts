/**
 * ⭐ A teacher's favourite reports (Oct 2026, daily-reports consolidation): pinned to the top of the Reports hub.
 * reportKey is one of src/lib/report-keys.ts's ReportKey values. Toggle semantics — calling it again un-favourites.
 */
import type { Repo } from "../seeding/repo";
import { assertCan, type Actor } from "../auth/rbac";
import { ValidationError } from "../curriculum-admin";
import { isReportKey, type ReportKey } from "../../lib/report-keys";

const s = (v: unknown) => String(v ?? "");

async function myTeacherId(repo: Repo, actor: Actor): Promise<string> {
  const t = (await repo.findMany("Teacher", { userId: actor.userId }, { select: ["id"] }))[0];
  if (!t) throw new ValidationError("Not a teacher.");
  return s(t.id);
}

export async function toggleFavoriteReport(repo: Repo, actor: Actor, reportKey: string, now = new Date()): Promise<{ favorited: boolean }> {
  assertCan(actor, "reports:read");
  if (!isReportKey(reportKey)) throw new ValidationError("Unknown report.");
  const teacherId = await myTeacherId(repo, actor);
  const existing = (await repo.findMany("TeacherReportFavorite", { teacherId, reportKey }))[0];
  if (existing) { await repo.deleteMany("TeacherReportFavorite", { teacherId, reportKey }); return { favorited: false }; }
  await repo.create("TeacherReportFavorite", { teacherId, reportKey, createdAt: now });
  return { favorited: true };
}

export async function favoriteReportsFor(repo: Repo, actor: Actor): Promise<ReportKey[]> {
  if (actor.role !== "TEACHER") return [];
  const teacherId = await myTeacherId(repo, actor).catch(() => null);
  if (!teacherId) return [];
  const rows = await repo.findMany("TeacherReportFavorite", { teacherId }, { select: ["reportKey", "createdAt"] });
  return rows.map((r) => s(r.reportKey)).filter(isReportKey) as ReportKey[];
}
