/** 🔔 After MAP scores are saved: each student gets “Your MAP results are in” (no numbers in the message). */
import type { Repo } from "../seeding/repo";
import type { Actor } from "../auth/rbac";
import type { MapImportResult } from "./student-map";

export async function notifyMapScores(repo: Repo, actor: Actor, r: MapImportResult, now: Date): Promise<number> {
  if (!r.imported) return 0;
  const t = (v: unknown) => new Date(v instanceof Date ? v.toISOString() : String(v)).getTime();
  const rows = (await repo.findMany("MapResult", { termName: r.term }, { select: ["studentId", "importedAt"] })).filter((x) => Math.abs(t(x.importedAt) - now.getTime()) < 1000);
  const ids = [...new Set(rows.map((x) => String(x.studentId)))];
  if (!ids.length) return 0;
  const students = await repo.findMany("Student", { id: { in: ids }, schoolId: actor.schoolId }, { select: ["userId"] });
  await repo.createMany("Notification", students.map((s) => ({ userId: s.userId, type: "PARENT_PROGRESS", title: "🗺️ Your MAP results are in", body: "Open My MAP to see your results and your goal for Spring.", link: "/student/map", readAt: null, createdAt: now })));
  return students.length;
}
