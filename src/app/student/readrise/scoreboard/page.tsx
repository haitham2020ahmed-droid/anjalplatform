import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { ACHIEVEMENTS, ANNUAL_GOAL, POINTS, TEACHER_BADGES, WRITING_POINTS } from "@/server/readrise/points";

export const metadata = { title: "ReadRise points" };
export const dynamic = "force-dynamic";

/** 🏆 Round 6: how ReadRise points and achievements are earned (every number comes from points.ts). */
export default async function ReadRisePointsRulesPage() {
  await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const row = (label: string, pts: number | string, key: string) => (
    <li key={key} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
      <span className="text-slate-800">{label}</span>
      <span className="shrink-0 font-bold tabular-nums text-brand-navy">{typeof pts === "number" ? t("{n} points", { n: pts }) : pts}</span>
    </li>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href="/student/readrise" className="inline-flex min-h-10 items-center text-sm font-medium text-slate-500 hover:text-brand-teal">‹ ReadRise</Link></p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-brand-navy">🏆 {t("How do I earn points?")}</h1>
      <p className="mt-1 text-slate-600">{t("ReadRise points show your reading work. They are not coins.")}</p>

      <section aria-labelledby="pr-respond" data-testid="rr-rules-respond" className="mt-6">
        <h2 id="pr-respond" className="text-xl font-bold text-brand-navy">{t("Answer the questions")}</h2>
        <ul className="mt-2 space-y-1.5">
          {row(t("Each question right on the first try"), POINTS.firstTryRight, "q1")}
          {row(t("Each question right on the second try"), POINTS.secondTryRight, "q2")}
          {row(t("Activity score 100%"), POINTS.bonus100, "b100")}
          {row(t("Activity score 88% or more"), POINTS.bonus88, "b88")}
          {row(t("Activity score 75% or more"), POINTS.bonus75, "b75")}
          {row(t("Your first 100% ever (extra)"), POINTS.first100, "f100")}
        </ul>
        <p className="mt-2 text-sm text-slate-600">{t("Only your first try on an article earns these points. Answers that come too fast, or an article read too fast, earn no points.")}</p>
      </section>

      <section aria-labelledby="pr-polls" className="mt-6">
        <h2 id="pr-polls" className="text-xl font-bold text-brand-navy">{t("The polls")}</h2>
        <ul className="mt-2 space-y-1.5">
          {row(t("The poll before reading (once a day)"), POINTS.poll, "p1")}
          {row(t("The poll after reading (once a day)"), POINTS.poll, "p2")}
        </ul>
      </section>

      <section aria-labelledby="pr-write" className="mt-6">
        <h2 id="pr-write" className="text-xl font-bold text-brand-navy">{t("Writing")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("Your teacher scores your thought question answer and can give you a badge.")}</p>
        <ul className="mt-2 space-y-1.5">
          {WRITING_POINTS.map((w) => row(t("Teacher's writing score {n}", { n: w.score }), w.points, `w${w.score}`))}
        </ul>
        <h3 className="mt-4 font-bold text-slate-700">{t("Teacher badges")}</h3>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {TEACHER_BADGES.map((b) => row(t(b.name), b.points, b.code))}
        </ul>
      </section>

      <section aria-labelledby="pr-ach" data-testid="rr-rules-achievements" className="mt-6">
        <h2 id="pr-ach" className="text-xl font-bold text-brand-navy">{t("Achievements ({n})", { n: ACHIEVEMENTS.length })}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("Each achievement is earned once and gives extra points.")}</p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {ACHIEVEMENTS.map((a) => (
            <li key={a.code} className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
              <span className="flex items-center justify-between gap-3"><b className="text-slate-800">{t(a.name)}</b><span className="shrink-0 font-bold tabular-nums text-brand-navy">{t("{n} points", { n: a.points })}</span></span>
              <span className="block text-sm text-slate-600">{t(a.description)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pr-goal" className="mt-6 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
        <h2 id="pr-goal" className="text-xl font-bold text-brand-navy">{t("Annual goal")}</h2>
        <p className="mt-1 text-slate-700">{t("Score {p}% or more on {n} activities this school year.", { n: ANNUAL_GOAL.activities, p: ANNUAL_GOAL.avg })}</p>
      </section>

      <section aria-labelledby="pr-school" className="mt-6">
        <h2 id="pr-school" className="text-xl font-bold text-brand-navy">{t("The school scoreboard")}</h2>
        <p className="mt-1 text-slate-700">{t("The scoreboard shows the three classes with the most points this week, and the school's top scorer today and this week. Students are shown by their initials and grade only.")}</p>
      </section>
    </AppShell>
  );
}
