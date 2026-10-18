import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { WindowChips, windowText } from "@/components/reports/report-ui";
import { AtAGlance, Callout, ReportHeader, ReportIntro, ReportSection, ReportSummary, ReportTable, SimpleBar } from "@/components/report-kit";
import { gamesUsageSummary } from "@/lib/report-summaries";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { gamesUsage } from "@/server/game/results";
import { windowOf } from "@/server/reports/report-access";
import { getT } from "@/i18n/server";

export const metadata = { title: "Games report" };

/**
 * 🎲 Most played and best rated games (solo Play and Live Challenge), by class (teachers: own classes; admins: the
 * whole school). Ratings in the game table are a school-wide average.
 */
export default async function GamesUsagePage({ searchParams }: { searchParams: Promise<{ days?: string; classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const days = windowOf(sp.days);
  const r = await gamesUsage(repo, actor, days, new Date(), { classId: sp.classId }).catch((e) => { if (e instanceof ForbiddenError) return gamesUsage(repo, actor, days); throw e; });
  const qs = (d: number, c: string | null) => `/teacher/reports/games-usage?days=${d}${c ? `&classId=${encodeURIComponent(c)}` : ""}`;
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const plays = r.rows.reduce((n, x) => n + x.plays, 0);
  const rated = [...r.rows].filter((x) => x.avgStars !== null).sort((a, b) => (b.avgStars ?? 0) - (a.avgStars ?? 0) || b.ratings - a.ratings);
  const className = r.classId ? r.byClass.find((c) => c.classId === r.classId)?.name : null;
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="🎲" title="Games report"
        subtitle={r.scope === "SCHOOL" ? "Most played and best rated games in the school. Game points never change levels or scores." : "Most played games by the students of your classes, and the school's star ratings. Game points never change levels or scores."}
        who={className ?? (r.scope === "SCHOOL" ? t("Whole school") : t("My classes"))} when={windowText(t, days)}
        filters={<>
          <WindowChips days={days} href={(d) => qs(d, r.classId)} />
          {r.byClass.length > 1 && (
            <nav aria-label={t("Classes")} className="mt-2 flex flex-wrap gap-2">
              <Link prefetch={false} href={qs(days, null)} className={chip(!r.classId)}>{r.scope === "SCHOOL" ? t("Whole school") : t("All my classes")}</Link>
              {r.byClass.map((c) => <Link prefetch={false} key={c.classId} href={qs(days, c.classId)} className={chip(r.classId === c.classId)}>{c.name}</Link>)}
            </nav>
          )}
        </>} />
      <ReportIntro text="Which games students play most and how well they do in them." />
      <AtAGlance items={[
        { icon: "🎮", label: t("Plays"), value: plays, meaning: t("last {n} days", { n: days }) },
        { icon: "🔥", label: t("Most played"), value: <span className="text-xl">{plays ? t(r.rows[0].name) : "—"}</span>, meaning: plays ? t("{n} plays", { n: r.rows[0].plays }) : undefined },
        { icon: "⭐", label: t("Best rated"), value: <span className="text-xl">{rated[0] ? `${t(rated[0].name)} · ${rated[0].avgStars}★` : "—"}</span>, meaning: rated[0] ? t("{n} ratings", { n: rated[0].ratings }) : undefined },
      ]} />
      <Callout kind="meaning" items={[t("Games are for practice and fun: game points never change levels or scores."), t("A game with a low % correct may be too hard for the class right now.")]} className="mb-5" />
      <ReportSection title="Most played" icon="🔥">
        {plays > 0 && <SimpleBar unit="" max={Math.max(1, ...r.rows.map((g) => g.plays))} items={r.rows.filter((g) => g.plays > 0).map((g) => ({ label: <><span aria-hidden="true">{g.icon} </span>{t(g.name)}</>, value: g.plays, display: t("{n} plays", { n: g.plays }) }))} className="mb-5" />}
        <ReportTable label={t("Most played")}
          cols={[{ key: "g", label: t("Game") }, { key: "p", label: t("Plays"), num: true }, { key: "s", label: t("Students"), num: true }, { key: "so", label: t("Solo"), num: true, more: true }, { key: "l", label: t("Live Challenge"), num: true, more: true }, { key: "c", label: t("Correct"), num: true }, { key: "st", label: t("Stars"), num: true }]}
          rows={r.rows.map((g) => ({
            id: g.gameId, sort: { g: t(g.name), c: g.correctPct, st: g.avgStars },
            cells: { g: <span className="font-semibold text-brand-navy"><span aria-hidden="true">{g.icon} </span>{t(g.name)}</span>, p: g.plays, s: g.players, so: g.solo, l: g.live,
              c: <span dir="ltr">{g.correctPct === null ? "—" : `${g.correctPct}%`}</span>, st: <span dir="ltr">{g.avgStars === null ? "—" : `${g.avgStars}★ (${g.ratings})`}</span> },
          }))} />
      </ReportSection>
      <ReportSection title="Best rated" icon="⭐">
        {rated.length ? (
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="best-rated">
            {rated.slice(0, 6).map((g, i) => (
              <li key={g.gameId} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200">
                <span className="min-w-0 truncate font-semibold text-brand-navy"><span className="text-slate-500" dir="ltr">{i + 1}. </span><span aria-hidden="true">{g.icon} </span>{t(g.name)}</span>
                <span className="shrink-0 font-semibold text-amber-600" dir="ltr">{g.avgStars}★ <span className="text-xs text-slate-500">({g.ratings})</span></span>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-slate-600">{t("No ratings yet.")}</p>}
      </ReportSection>
      {r.byClass.length > 0 && (
        <ReportSection title="By class" icon="🏫">
          <div data-testid="games-by-class">
            <ReportTable label={t("By class")}
              cols={[{ key: "c", label: t("Class") }, { key: "p", label: t("Plays"), num: true }, { key: "w", label: t("Students who played"), num: true }, { key: "l", label: t("Live Challenge"), num: true }, { key: "m", label: t("Most played") }, { key: "st", label: t("Stars"), num: true }]}
              rows={r.byClass.map((c) => ({
                id: c.classId, sort: { c: c.name, st: c.avgStars },
                cells: { c: <Link prefetch={false} href={qs(days, c.classId)} className="font-semibold text-brand-navy underline-offset-2 hover:underline">{c.name}</Link>, p: c.plays,
                  w: <span dir="ltr">{c.players} / {c.students}</span>, l: c.live, m: c.topGameName ? t(c.topGameName) : "—",
                  st: <span dir="ltr">{c.avgStars === null ? "—" : `${c.avgStars}★`}</span> },
              }))} />
          </div>
        </ReportSection>
      )}
      <ReportSummary summary={gamesUsageSummary(r.rows.map((g) => ({ ...g, name: t(g.name) })), days)} />
    </AppShell>
  );
}
