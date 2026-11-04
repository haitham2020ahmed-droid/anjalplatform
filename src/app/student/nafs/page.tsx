import Link from "next/link";
import { nafsDbGate } from "@/components/db-update-needed";
import { hideLevels } from "@/lib/hide-levels";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { repo, requireActor } from "@/server/auth/next";
import { studentPage } from "@/server/auth/student-page";
import { PreviewFrame } from "@/components/student/preview-frame";
import { inGrade6Class } from "@/server/student/menu-flags";
import { myNafsTests } from "@/server/nafs/student";
import { myNafsPractice, nafsPracticeHistory } from "@/server/nafs/practice";
import { studentNafsReadiness } from "@/server/nafs/readiness";
import { studentSkillPlans } from "@/server/curriculum-map/plans";
import { EmptyState, BTN_PRIMARY } from "@/components/ui-kit";
import { LineChart } from "@/components/nafs/charts";
import { getT } from "@/i18n/server";

export const metadata = { title: "NAFS" };

const PARTS = [
  { key: "practice", label: "My practice" },
  { key: "tests", label: "My tests" },
  { key: "results", label: "My results" },
] as const;
type Part = (typeof PARTS)[number]["key"];
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : null);
const CARD = "flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-4 ring-1 ring-line";

/**
 * 🇸🇦 The student's NAFS icon (students in a Grade 6 class only): three simple parts —
 *   My practice  the adaptive NAFS practice the teacher gave me (and my NAFS plan, if any)
 *   My tests     the NAFS tests given to me online, with the time and the due date
 *   My results   my score and the skills to practise — only after the teacher releases them; never a level word.
 */
export default async function StudentNafsPage({ searchParams }: { searchParams: Promise<{ part?: string; preview?: string }> }) {
  const { actor, me, preview } = await studentPage((await searchParams).preview, () => requireActor({ roles: ["STUDENT"] }));
  const gate = await nafsDbGate(); if (gate) return gate; // the NAFS tables are not in the database yet: say so
  const sp = await searchParams;
  const part: Part = (PARTS.find((x) => x.key === sp.part)?.key ?? "practice") as Part;
  const [{ t }, g6] = await Promise.all([getT(), inGrade6Class(repo, actor.studentId!)]);
  if (!g6) return (
    <AppShell name={String(me.displayName)}><PreviewFrame preview={preview}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="🇸🇦" title="NAFS" />
      <EmptyState icon="🇸🇦" title="NAFS is for Grade 6 students." text="Your teacher will add work here soon." action={{ href: "/student", label: "Home" }} />
    </PreviewFrame></AppShell>
  );
  const [practice, tests, plans, readiness, history] = await Promise.all([
    myNafsPractice(repo, actor).catch(() => []), myNafsTests(repo, actor).catch(() => []),
    part === "practice" ? studentSkillPlans(repo, actor).then((l) => l.filter((p) => p.kind === "NAFS")).catch(() => []) : Promise.resolve([]),
    // 🆕 feature (Oct 2026): readiness badge + growth chart, best-effort (never break the page over them)
    part === "practice" ? studentNafsReadiness(repo, actor.studentId!).catch(() => null) : Promise.resolve(null),
    part === "practice" ? nafsPracticeHistory(repo, actor.studentId!).catch(() => []) : Promise.resolve([]),
  ]);
  const todoTests = tests.filter((x) => x.status !== "DONE");
  const results = tests.filter((x) => x.status === "DONE");
  const count: Record<Part, number> = { practice: practice.filter((x) => x.status !== "DONE").length, tests: todoTests.length, results: results.filter((x) => x.pct !== null).length };
  return (
    <AppShell name={String(me.displayName)}><PreviewFrame preview={preview}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="🇸🇦" title="NAFS" subtitle={t("Practise for the NAFS reading test, take your NAFS tests and see your results.")} />
      <nav aria-label={t("NAFS")} className="mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-card ring-1 ring-line">
        {PARTS.map((x) => (
          <Link key={x.key} href={`/student/nafs?part=${x.key}`} aria-current={part === x.key ? "page" : undefined}
            className={`min-h-12 shrink-0 whitespace-nowrap rounded-xl px-5 py-3 text-base font-semibold ${part === x.key ? "bg-brand-navy text-white" : "text-ink-2 hover:bg-surface-2"}`}>
            {t(x.label)}{count[x.key] > 0 && <span dir="ltr" className="ms-2 rounded-full bg-teal-600 px-1.5 text-xs text-white tabular-nums">{count[x.key]}</span>}
          </Link>
        ))}
      </nav>

      {part === "practice" && readiness?.show && (
        <div className={`mb-4 flex items-center gap-3 rounded-2xl p-4 ring-1 ${readiness.ready ? "bg-emerald-50 ring-emerald-200" : "bg-amber-50 ring-amber-200"}`}>
          <span className="text-2xl" aria-hidden="true">{readiness.ready ? "🌟" : "💪"}</span>
          <p className={`text-base font-semibold ${readiness.ready ? "text-emerald-900" : "text-amber-900"}`}>
            {t(readiness.ready ? "You're on track for the real test!" : "Keep practicing — you're getting there.")}
          </p>
        </div>
      )}

      {part === "practice" && history.length >= 2 && (
        <section aria-labelledby="nafs-history-h" className="mb-4 rounded-2xl bg-surface p-4 ring-1 ring-line">
          <h2 id="nafs-history-h" className="text-base font-semibold text-brand-navy">📈 {t("My practice score over time")}</h2>
          <div className="mt-2">
            <LineChart title={t("My practice score over time")} labels={history.map((x) => x.label)} series={[{ name: t("Score"), cls: "text-teal-700", points: history.map((x) => x.pct) }]} />
          </div>
        </section>
      )}

      {part === "practice" && (
        !practice.length && !plans.length ? <EmptyState icon="🎯" title="Nothing here yet" text="Your teacher will add NAFS practice here soon." action={{ href: "/student", label: "Home" }} /> : (
          <div className="grid gap-3">
            {practice.map((x) => (
              <div key={x.id} className={CARD}>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-brand-navy">🎯 <bdi>{x.title}</bdi></p>
                  <p className="text-sm text-ink-2">{x.skills.slice(0, 4).map((k) => t(k)).join(" · ")}</p>
                  <p className="text-sm text-muted">{x.status === "DONE" ? t("Done: {n} of {total} right", { n: x.correct, total: x.asked }) : t("{n} of {total} questions", { n: x.asked, total: x.max })}{x.minutes ? ` · ${t("{n} minutes", { n: x.minutes })}` : ""}{x.dueAt ? ` · ${t("Due {date}", { date: day(x.dueAt) ?? "" })}` : ""}</p>
                </div>
                {x.status !== "DONE"
                  ? <Link href={`/student/nafs/practice/${x.id}`} className={`${BTN_PRIMARY} min-h-12 rounded-2xl px-6 text-lg`}>{t(x.status === "IN_PROGRESS" ? "Continue" : "Start")}</Link>
                  : <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-900 ring-1 ring-emerald-200">✓ {t("Done")}</span>}
              </div>
            ))}
            {plans.map((p) => (
              <Link key={p.id} prefetch={false} href={`/student/plans/${p.id}`} className={`${CARD} lift`}>
                <span className="text-lg font-semibold text-brand-navy">🧾 <bdi>{hideLevels(p.title)}</bdi></span>
                <span className="text-sm text-ink-2">{t("{done} of {total} done", { done: p.done, total: p.places })}</span>
              </Link>
            ))}
          </div>
        )
      )}

      {part === "tests" && (
        !todoTests.length ? <EmptyState icon="📝" title="No NAFS tests waiting" text="Your teacher will add NAFS tests here." action={{ href: "/student/nafs?part=results", label: "My results" }} /> : (
          <ul className="grid gap-3">
            {todoTests.map((x) => (
              <li key={x.id} className={CARD}>
                <div>
                  <p className="text-lg font-semibold text-brand-navy">📝 {x.title}</p>
                  <p className="text-sm text-ink-2">{t("{n} questions", { n: x.questions })}{x.minutes ? ` · ${t("{n} minutes", { n: x.minutes })}` : ""}{x.dueAt ? ` · ${t("Due {date}", { date: day(x.dueAt) ?? "" })}` : ""}</p>
                </div>
                {x.startsLater ? <span className="text-muted">{t("Not open yet")}</span>
                  : <Link href={`/student/nafs/sim/${x.id}`} className={`${BTN_PRIMARY} min-h-12 rounded-2xl px-6 text-lg`}>{t(x.status === "IN_PROGRESS" ? "Continue" : "Start")}</Link>}
              </li>
            ))}
          </ul>
        )
      )}

      {part === "results" && (
        !results.length ? <EmptyState icon="📊" title="No results yet" text="Practice scores show right away under My practice. My results is only for official NAFS tests your teacher has released." action={{ href: "/student/nafs?part=tests", label: "My tests" }} /> : (
          <div className="grid gap-3">
          <p className="text-sm text-muted">{t("NAFS scores here are from practice the school wrote in the style of the real exam — they show how ready your child is, not an official exam result.")}</p>
          <ul className="grid gap-3">
            {results.map((x) => (
              <li key={x.id} className={CARD}>
                <div className="min-w-0">
                  <p className="text-lg font-semibold text-brand-navy">{x.title}</p>
                  {x.pct !== null
                    ? <p className="mt-1 text-ink-2"><strong className="text-2xl tabular-nums text-ink">{x.pct}%</strong>{x.practise.length ? <span className="ms-2">· {t("Skills to practise")}: {x.practise.map((k) => t(k)).join(", ")}</span> : null}</p>
                    : <p className="mt-1 text-sm text-muted">{t(x.marking && x.released ? "Your teacher is still marking your written answers." : "Handed in. Your teacher will share your score.")}</p>}
                </div>
              </li>
            ))}
          </ul>
          </div>
        )
      )}
    </PreviewFrame></AppShell>
  );
}
