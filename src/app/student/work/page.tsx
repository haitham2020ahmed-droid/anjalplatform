import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentHome } from "@/server/student/student-home";
import { myWorkView } from "@/server/student/program-work";
import { MyWorkGroups, WorkRing } from "@/components/student/my-work-groups";
import { StudentStarsPanel } from "@/components/skills/student-stars-panel";
import { markMasteredWork, studentStarsSummary } from "@/server/skills/student-stars";
import { skillKeysFor, studentSchool } from "@/server/skills/status";
import { keepStarsFresh } from "@/server/skills/status-review";
import { runAfterResponse } from "@/server/lib/after-response";
import { safeIfBehind } from "@/server/db/schema-errors";
import { getT } from "@/i18n/server";
import { byPriority, searchWork } from "@/lib/my-work-groups";

export const metadata = { title: "My Work" };

/**
 * 📋 My Work: every piece of work the teacher assigned, organised (owner r67): Due this week · Later · Done (folded),
 * small type headers, compact cards, at most 6 per group with "Show all", and a small fixed-size ring for the
 * progress (never a long bar). ⭐ Each skill shows its star (the ONE status), a plan never asks again for a mastered
 * skill, and the review checks (3 weeks after a star, the monthly mixed review) arrive here by themselves.
 * 🔎 Rows needing attention (overdue, or a skill in progress with low mastery) are reordered to the front of their
 * group (byPriority), and a "search my work" box lets a student with many rows jump straight to one by name (?q=).
 */
export default async function MyWorkPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sid = actor.studentId!;
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const [{ t }, h, stars] = await Promise.all([getT(), studentHome(repo, actor), safeIfBehind("work.stars", () => studentStarsSummary(repo, sid), null)]);
  // the review checks: settled / given after the response (the page never waits for them)
  runAfterResponse("work.stars.fresh", () => keepStarsFresh(repo, sid), { key: `work.stars.fresh|${sid}` });
  let rows = h.work;
  if (stars && stars.byKey.size) {
    rows = await markMasteredWork(repo, sid, rows, stars.byKey);
    const ids = [...new Set(rows.map((r) => r.skillId).filter((x): x is string => Boolean(x)))];
    const keys = ids.length ? await skillKeysFor(repo, await studentSchool(repo, sid), ids) : new Map<string, string>();
    rows = rows.map((r) => { const v = r.skillId ? stars.byKey.get(keys.get(r.skillId) ?? "") : undefined; return v ? { ...r, star: { status: v.status, score: v.score, answered: v.answered } } : r; });
  }
  const { progress } = myWorkView(rows, h.last);
  const label = t("{done} of {total} done", { done: progress.done, total: progress.total });
  const sorted = byPriority(rows);
  const shown = q ? searchWork(sorted, q) : sorted;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="📋" title="My Work"
        subtitle={progress.total ? label : t("Your teacher will add work here soon.")}>
        {progress.total > 0 && <WorkRing done={progress.done} total={progress.total} label={label} />}
      </PageHeader>
      {stars && <StudentStarsPanel s={stars} t={t} back="/student/work" />}
      <section id="my-work" aria-label={t("My Work")}><MyWorkGroups rows={shown} t={t} query={q} totalAll={rows.length} /></section>
    </AppShell>
  );
}
