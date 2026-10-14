import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { LearnTabs } from "@/components/learn/teacher-tabs";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { isAdmin } from "@/server/learn/edits";
import { learnCoverage } from "@/server/learn/teacher";
import { wordsCoverage } from "@/server/learn/words";
import { getT } from "@/i18n/server";

export const metadata = { title: "Learn coverage" };

type SP = { show?: string; grade?: string };
const stat = "rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line";

/**
 * 🧭 Learn coverage (owner: EVERY skill must be explained): every active platform skill (the master list — Grammar,
 * Vocabulary, Curriculum Map and MAP skills too) with its lesson(s) or "No lesson yet", how each was matched, every
 * MAP continuum statement group, and the curriculum words explained.
 */
export default async function LearnCoveragePage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const [c, w] = await Promise.all([learnCoverage(repo, actor), wordsCoverage(repo, String(actor.schoolId))]);
  const grades = [...new Set(c.skills.map((k) => k.grade))].sort((a, b) => a - b);
  const grade = grades.includes(Number(sp.grade)) ? Number(sp.grade) : null;
  const onlyMissing = sp.show === "missing";
  const rows = c.skills.filter((k) => (!grade || k.grade === grade) && (!onlyMissing || !k.lessons.length));
  const chip = (on: boolean) => `inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-surface text-ink ring-1 ring-line"}`;
  const href = (q: Record<string, string>) => `/teacher/learn/coverage?${new URLSearchParams(Object.entries({ show: sp.show ?? "", grade: sp.grade ?? "", ...q }).filter(([, v]) => v))}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/learn", label: "Learn" }} icon="🧭" title="Learn coverage" subtitle={t("Every skill of the platform must be explained by a lesson. Matching: the lesson's skill names, then skill families, then standards.")} />
      <LearnTabs active="coverage" admin={isAdmin(actor)} />
      <ul className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <li className={stat}><p className="text-sm text-muted">{t("Skills with a lesson")}</p><p className="font-display text-3xl text-ink" dir="ltr">{c.withLesson} / {c.total}</p><p className="text-xs text-muted">{t("Skills with a lesson: {x} of {y}", { x: c.withLesson, y: c.total })}</p></li>
        <li className={stat}><p className="text-sm text-muted">{t("Lessons ready")}</p><p className="font-display text-3xl text-ink" dir="ltr">{c.lessonsReady} / {c.lessonsPlanned}</p><p className="text-xs text-muted">{t("Lesson files on the platform of the planned topics")}</p></li>
        <li className={stat}><p className="text-sm text-muted">{t("Words explained")}</p><p className="font-display text-3xl text-ink" dir="ltr">{w.explained} / {w.total}</p><p className="text-xs text-muted" dir="ltr">{w.byGrade.map((g) => `G${g.grade}: ${g.explained}/${g.total}`).join(" · ")}</p></li>
      </ul>
      <section className="mb-6" aria-labelledby="cov-skills">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="cov-skills" className="text-xl text-ink">{t("Platform skills")}</h2>
          <nav className="flex flex-wrap gap-2" aria-label={t("Filter")}>
            <Link prefetch={false} href={href({ show: "" })} className={chip(!onlyMissing)}>{t("All")}</Link>
            <Link prefetch={false} href={href({ show: "missing" })} className={chip(onlyMissing)}>{t("No lesson yet")}</Link>
            {grades.map((g) => <Link key={g} prefetch={false} href={href({ grade: grade === g ? "" : String(g) })} className={chip(grade === g)}>{t("Grade {n}", { n: g })}</Link>)}
          </nav>
        </div>
        <div className="rk-box rk-cards">
          <table className="w-full text-sm">
            <thead><tr><th>{t("Skill")}</th><th>{t("Grade")}</th><th>{t("Area")}</th><th>{t("Lesson")}</th><th>{t("Matched")}</th></tr></thead>
            <tbody>{rows.map((k) => (
              <tr key={k.id}>
                <td className="rk-first" data-label={t("Skill")} lang="en">{k.name}</td>
                <td data-label={t("Grade")} dir="ltr">{k.grade}</td>
                <td data-label={t("Area")}>{k.area ?? t(k.kind === "GRAMMAR" ? "Grammar" : k.kind === "VOCABULARY" ? "Vocabulary" : k.kind === "LANGUAGE" ? "Language" : "Reading")}</td>
                <td data-label={t("Lesson")}>{k.lessons.length ? k.lessons.map((l) => <span key={l.code} className="me-2 inline-block">{l.ready ? <Link prefetch={false} href={`/teacher/learn/${l.code}`} className="font-semibold text-ink hover:underline" lang="en">{l.title}</Link> : <span className="text-muted" lang="en">{l.title} <span className="text-xs">({t("coming")})</span></span>}</span>) : <span className="font-semibold text-rose-700">{t("No lesson yet")}</span>}</td>
                <td data-label={t("Matched")} className="text-muted">{k.rule ? t(k.rule) : "—"}</td>
              </tr>))}</tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="cov-cont">
        <h2 id="cov-cont" className="mb-3 text-xl text-ink">{t("MAP continuum statement groups")}</h2>
        <ul className="grid gap-3 md:grid-cols-2">
          {c.groups.map((g) => (
            <li key={`${g.subject}${g.goalArea}${g.subtopic}`} className={stat}>
              <p className="text-xs font-semibold text-muted">{t(g.subject === "LANGUAGE" ? "Language" : "Reading")} · {t(g.goalArea)}</p>
              <p className="font-semibold text-ink" lang="en">{g.subtopic}</p>
              <p className="text-sm text-ink-2">{t("{x} of {y} statements in a lesson topic", { x: g.covered, y: g.statements })} · {t("{n} lessons", { n: g.lessons.length })} <span dir="ltr">({g.lessons.filter((l) => l.ready).length} {t("ready")})</span></p>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
