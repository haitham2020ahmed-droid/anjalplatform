/**
 * 📅 Weekly teacher reminder: once per ISO week, per school, ONE notification per teacher — "N students need
 * attention this week" — nudging them to open the alert list / early warning and follow up on students who are
 * stuck or still not practising. Built on the existing alert follow-up (StudentAlert / alerts.ts), the existing
 * notification bell (server/notifications.ts) and the existing weekKey() used for alert dedup — no new tables, no
 * new notification type: it reuses DAILY_DIGEST (a teacher "digest" notification, just on a weekly cadence) and is
 * told apart from the daily one by its own link (?week=YYYY-Wnn), which also makes it idempotent: a week already
 * sent to a teacher is never sent to them again, even if this runs more than once.
 *
 * Gating is a school-level marker (SchoolSetting, like alerts.ts's SCAN_KEY and daily.ts's claimDay), so a page
 * visit that is not the first of the week costs one query, not a scan of every teacher.
 */
import type { Repo } from "../seeding/repo";
import { weekKey } from "./alerts";

const s = (v: unknown) => String(v ?? "");

const DIGEST_KEY = "weekly-digest.scan";

/** Teachers of classes in `classIds`, grouped: teacher userId → the class ids they teach among them. */
async function teachersOf(repo: Repo, classIds: string[]): Promise<Map<string, string[]>> {
  const byTeacher = new Map<string, string[]>();
  if (!classIds.length) return byTeacher;
  const links = await repo.findMany("ClassTeacher", { classId: { in: classIds } }, { select: ["classId", "teacherId"] });
  if (!links.length) return byTeacher;
  const teachers = await repo.findMany("Teacher", { id: { in: [...new Set(links.map((l) => s(l.teacherId)))] } }, { select: ["id", "userId"] });
  const userOf = new Map(teachers.map((t) => [s(t.id), s(t.userId)]));
  for (const l of links) {
    const u = userOf.get(s(l.teacherId));
    if (!u) continue;
    byTeacher.set(u, [...(byTeacher.get(u) ?? []), s(l.classId)]);
  }
  return byTeacher;
}

/**
 * Sends this week's reminder to every teacher of the school who has 1+ open student alert in their own classes.
 * Runs at most once per ISO week per school (a SchoolSetting marker, like the alert scan's 3-hourly one); a second
 * call the same week is a no-op. Returns how many teachers were sent a notification.
 */
export async function weeklyTeacherDigests(repo: Repo, schoolId: string, now = new Date()): Promise<number> {
  const wk = weekKey(now);
  const row = (await repo.findMany("SchoolSetting", { schoolId, key: DIGEST_KEY }))[0];
  let sentWeek = "";
  if (row) { let v: unknown = row.value; if (typeof v === "string") { try { v = JSON.parse(v); } catch { v = null; } } sentWeek = s((v as { week?: string } | null)?.week ?? ""); }
  if (sentWeek === wk) return 0;
  // claim the week first (like scanAlerts claims its 3-hour slot): two visitors the same week never both send
  await repo.upsert("SchoolSetting", { schoolId, key: DIGEST_KEY }, { value: { week: wk }, updatedAt: now }, { value: { week: wk }, updatedAt: now });

  const classes = await repo.findMany("Class", { schoolId, deletedAt: null }, { select: ["id"] });
  const classIds = classes.map((c) => s(c.id));
  const byTeacher = await teachersOf(repo, classIds);
  if (!byTeacher.size) return 0;

  // one bounded count per teacher: their own classes' still-open alerts (the same StudentAlert rows /teacher/alerts shows)
  const allClassIds = [...new Set([...byTeacher.values()].flat())];
  const open = allClassIds.length ? await repo.findMany("StudentAlert", { classId: { in: allClassIds }, status: "OPEN" }, { select: ["classId"] }) : [];
  const openByClass = new Map<string, number>();
  for (const a of open) openByClass.set(s(a.classId), (openByClass.get(s(a.classId)) ?? 0) + 1);

  const toSend: { userId: string; n: number }[] = [];
  for (const [userId, mine] of byTeacher) {
    const n = mine.reduce((sum, c) => sum + (openByClass.get(c) ?? 0), 0);
    if (n > 0) toSend.push({ userId, n });
  }
  if (!toSend.length) return 0;
  // already sent this exact week? (idempotent even if the marker above raced): the link encodes the week
  const existing = await repo.findMany("Notification", { userId: { in: toSend.map((x) => x.userId) }, type: "DAILY_DIGEST", link: `/teacher/alerts?week=${wk}` }, { select: ["userId"] });
  const already = new Set(existing.map((n) => s(n.userId)));
  const rows = toSend.filter((x) => !already.has(x.userId)).map((x) => ({
    userId: x.userId, type: "DAILY_DIGEST", readAt: null, createdAt: now,
    title: `📅 ${x.n} student${x.n === 1 ? "" : "s"} need${x.n === 1 ? "s" : ""} attention this week`,
    body: "A weekly check-in: open your alerts and the early-warning list, and follow up on students who are stuck or have not improved.",
    link: `/teacher/alerts?week=${wk}`,
  }));
  if (rows.length) await repo.createMany("Notification", rows);
  return rows.length;
}
