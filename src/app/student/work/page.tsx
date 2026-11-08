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
import { ProgramTabs } from "@/components/student/program-tabs";
import { myMap, type MyMap } from "@/server/map/map-more";
import { MapPlanSection } from "@/components/student/map-plan-section";
import { EmptyState } from "@/components/ui-kit";

export const metadata = { title: "My Work" };

/**
 * 📋 My Work: every piece of work the teacher assigned, organised (owner r67): Due this week · Later · Done (folded),
 * small type headers, compact cards, at most 6 per group with "Show all", and a small fixed-size ring for the
 * progress (never a long bar). ⭐ Each skill shows its star (the ONE status), a plan never asks again for a mastered
 * skill, and the review checks (3 weeks after a star, the monthly mixed review) arrive here by themselves.
 * 🔎 Rows needing attention (overdue, or a skill in progress with low mastery) are reordered to the front of their
 * group (byPriority), and a "search my work" box lets a student with many rows jump straight to one by name (?q=).
 *
 * 🆕 Nov 2026: a second tab, "🗺️ MAP" (?tab=map), right next to "My Work" — the exact same "My MAP plan from my
 * teacher" section (MapPlanSection) the My MAP page shows, with its own Start/Continue button per subject
 * (Reading, Language). It stays on the My MAP page too — this is simply a second, more visible place to reach it.
 */
export default async function MyWorkPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sid = actor.studentId!;
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const onMap = sp.tab === "map";
  const { t } = await getT();
  const tabs = [
    { href: "/student/work", label: "My Work", icon: "📋", on: !onMap },
    { href: "/student/work?tab=map", label: "MAP", icon: "🗺️", on: onMap },
  ];

  if (onMap) {
    const m = await safeIfBehind("work.map", () => myMap(repo, actor), { subjects: [], plans: [] } as MyMap);
    return (
      <AppShell name={String(me.displayName)}>
        <PageHeader back={{ href: "/student", label: "Home" }} icon="🗺️" title="My Work" subtitle={t("Your MAP plan from your teacher.")} />
        <ProgramTabs tabs={tabs} />
        {m.plans.length > 0 ? <MapPlanSection plans={m.plans} t={t} /> : (
          <EmptyState icon="🗺️" title="No MAP plan yet" text="When your teacher sends you a MAP plan, it will be here, with a Start button for Reading and one for Language." action={{ href: "/student/map", label: "My MAP" }} />
        )}
      </AppShell>
    );
  }

  const [h, stars] = await Promise.all([studentHome(repo, actor), safeIfBehind("work.stars", () => studentStarsSummary(repo, sid), null)]);
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
      <ProgramTabs tabs={tabs} />
      {stars && <StudentStarsPanel s={stars} t={t} back="/student/work" />}
      <section id="my-work" aria-label={t("My Work")}><MyWorkGroups rows={shown} t={t} query={q} totalAll={rows.length} /></section>
    </AppShell>
  );
}
