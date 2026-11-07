import Link from "next/link";
import type { ArticleCard, Library } from "@/server/readrise/student";
import { ARTICLE_STATUS_LABEL } from "@/server/readrise/first-try";
import { reasonLabel } from "@/server/readrise/recommend";
import { formatLevel } from "@/server/readrise/level";
import type { TFn } from "@/i18n";
import type { ReactNode } from "react";

/**
 * 🚀 The ReadRise library (server component). Round 5 (owner: "nothing disappears"), shelves in this order:
 *   ⏳ Continue reading      the first try is open (In progress / Finish steps 4–5)
 *   📌 From my teacher       assigned (started, not cancelled), not done
 *   ✨ Recommended for you   recommend.ts, each card with its reason
 *   ✅ Finished              done, newest first — the first-try score and the version actually READ
 *   📚 All articles          search box + topic filter + pages of 24
 * Every card opens /student/readrise/[articleId] (the 5-step routine). Cards show the student's level ("Your level
 * 1400") with the version's measured difficulty small ("text ≈1390"); a finished card shows the version it read.
 */
const fmtDue = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const plain: TFn = ((text: string, vars?: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? `{${k}}`))) as TFn;
const FINISHED_FIRST = 12;

function StatusPill({ c, t }: { c: ArticleCard; t: TFn }) {
  const label = t(ARTICLE_STATUS_LABEL[c.status]);
  if (c.status === "IN_PROGRESS") return <span data-status={c.status} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{label}</span>;
  if (c.status === "FINISH_STEPS") return <span data-status={c.status} className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900">✍️ {label}</span>;
  if (c.status === "DONE") return <span data-status={c.status} className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">✓ {label}{c.firstTryScore !== null ? ` · ${c.firstTryScore}%` : ""}</span>;
  return <span data-status={c.status} className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-900">{label}</span>;
}

export function ArticleTile({ c, showLevel = true, level, t = plain }: { c: ArticleCard; showLevel?: boolean; level?: number; t?: TFn }) {
  const cta = c.status === "IN_PROGRESS" || c.status === "FINISH_STEPS" ? t("Continue") : c.status === "DONE" ? (c.canStretch ? t("Stretch it") : t("Open")) : t("Read");
  const done = c.status === "DONE" && c.readLevel;
  return (
    <li>
      <Link href={`/student/readrise/${c.id}`} data-testid="rr-card" data-status={c.status} className="lift flex h-full flex-col rounded-2xl bg-white p-4 ring-1 ring-slate-200 hover:ring-brand-teal focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-teal">
        <span className="flex flex-wrap items-center gap-2 text-xs">
          {c.topic && <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-800">{t(c.topic)}</span>}
          <StatusPill c={c} t={t} />
          {c.assigned && <span className="rounded-full bg-purple-100 px-2 py-0.5 font-semibold text-purple-900">{t("From my teacher")}{c.dueAt ? ` · ${t("due {date}", { date: fmtDue(c.dueAt) })}` : ""}</span>}
        </span>
        <span lang="en" className="mt-2 block text-lg font-bold leading-snug text-brand-navy">{c.title}</span>
        {c.reason && <span data-testid="rr-reason" className="mt-1 block text-xs font-semibold text-brand-teal">{reasonLabel(c.reason, t)}</span>}
        {c.summary && <span lang="en" className="mt-1 line-clamp-2 block text-sm text-slate-600">{c.summary}</span>}
        <span className="mt-auto flex items-center justify-between gap-2 pt-3 text-sm">
          <span className="text-slate-500">
            {t("About {n} min", { n: c.minutes })}
            {showLevel && (done
              ? <> · <span data-testid="rr-read-level">{t("Read at level {n}", { n: formatLevel(c.readLevel!) })}</span></>
              : <> · <span data-testid="rr-your-level">{t("Your level {n}", { n: formatLevel(level ?? c.versionLevel) })}</span>{c.textLevel ? <span className="text-xs text-slate-400"> ({t("text ≈{n}", { n: formatLevel(c.textLevel) })})</span> : null}</>)}
          </span>
          <span className="rounded-lg bg-brand-navy px-3 py-1 font-semibold text-white" aria-hidden="true">{cta} ▶</span>
        </span>
      </Link>
    </li>
  );
}

function Shelf({ id, title, hint, cards, showLevel, level, t, children }: { id: string; title: string; hint?: string; cards: ArticleCard[]; showLevel: boolean; level: number; t: TFn; children?: ReactNode }) {
  if (!cards.length) return null;
  return (
    <section aria-labelledby={id} data-testid={id} className="mt-6">
      <h2 id={id} className="text-xl font-bold text-brand-navy">{title}</h2>
      {hint && <p className="text-sm text-slate-600">{hint}</p>}
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map((c) => <ArticleTile key={c.id} c={c} showLevel={showLevel} level={level} t={t} />)}</ul>
      {children}
    </section>
  );
}

/**
 * showLevel = false before the placement (no level number is shown: readRisePlaced). `panel` (round 6) = the
 * scoreboard panel, placed after the reading the student has to finish (Continue / From my teacher).
 */
export function ReadRiseLibrary({ lib, showLevel = true, t = plain, panel }: { lib: Library; showLevel?: boolean; t?: TFn; panel?: ReactNode }) {
  const filtered = Boolean(lib.query || lib.topic);
  const link = (topic: string, page = 1) => {
    const p = new URLSearchParams();
    if (lib.query) p.set("q", lib.query);
    if (topic) p.set("topic", topic);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return `/student/readrise${qs ? `?${qs}` : ""}#rr-all`;
  };
  const props = { showLevel, level: lib.level, t };
  return (
    <div id="library" className="mt-6">
      <Shelf id="rr-continue" title={`⏳ ${t("Continue reading")}`} cards={lib.continueReading} {...props} />
      <Shelf id="rr-assigned" title={`📌 ${t("From my teacher")}`} cards={lib.assigned} {...props} />
      {panel}
      {!filtered && <Shelf id="rr-rec" title={`✨ ${t("Recommended for you")}`} cards={lib.recommended} {...props} />}
      <Shelf id="rr-finished" title={`✅ ${t("Finished")}`} cards={lib.finished.slice(0, FINISHED_FIRST)} {...props}>
        {lib.finished.length > FINISHED_FIRST && (
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-semibold text-brand-teal">{t("Show all {n} finished articles", { n: lib.finished.length })}</summary>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{lib.finished.slice(FINISHED_FIRST).map((c) => <ArticleTile key={c.id} c={c} {...props} />)}</ul>
          </details>
        )}
      </Shelf>

      <section aria-labelledby="rr-all" className="mt-8">
        <h2 id="rr-all" className="text-xl font-bold text-brand-navy">{filtered ? t("Results ({n})", { n: lib.total }) : `📚 ${t("All articles")}`}</h2>
        <form method="get" action="/student/readrise#rr-all" role="search" className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-sm font-semibold text-slate-700">{t("Find an article")}
            <input type="search" name="q" defaultValue={lib.query} placeholder={t("Search by title or topic")} className="mt-1 w-full rounded-xl border-slate-300 text-base" />
          </label>
          {lib.topic && <input type="hidden" name="topic" value={lib.topic} />}
          <button type="submit" className="rounded-xl bg-brand-navy px-4 py-2.5 font-semibold text-white hover:bg-brand-purple">{t("Search")}</button>
        </form>
        {lib.topics.length > 0 && (
          <nav aria-label={t("Topics")} className="mt-3 flex flex-wrap gap-2">
            {["", ...lib.topics].map((x) => (
              <Link key={x || "all"} href={link(x)} aria-current={lib.topic === x ? "true" : undefined}
                className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${lib.topic === x ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-slate-700 ring-slate-300 hover:ring-brand-teal"}`}>{x ? t(x) : t("All topics")}</Link>
            ))}
          </nav>
        )}
        {lib.all.length > 0 && <ul data-testid="rr-all-list" className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{lib.all.map((c) => <ArticleTile key={c.id} c={c} {...props} />)}</ul>}
        {lib.pages > 1 && (
          <nav aria-label={t("Pages")} data-testid="rr-pages" className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            {lib.page > 1 && <Link href={link(lib.topic, lib.page - 1)} className="rounded-lg bg-white px-3 py-1.5 font-semibold text-brand-navy ring-1 ring-slate-300">‹ {t("Previous")}</Link>}
            <span className="text-slate-600">{t("Page {n} of {m}", { n: lib.page, m: lib.pages })}</span>
            {lib.page < lib.pages && <Link href={link(lib.topic, lib.page + 1)} className="rounded-lg bg-white px-3 py-1.5 font-semibold text-brand-navy ring-1 ring-slate-300">{t("Next")} ›</Link>}
          </nav>
        )}
        {lib.all.length === 0 && (
          <p className="mt-6 rounded-2xl bg-white p-5 text-slate-600 ring-1 ring-slate-200">
            {filtered ? <>{t("No articles match.")} <Link href="/student/readrise#rr-all" className="text-brand-teal underline">{t("Show all articles")}</Link></> : t("No articles yet. Check back soon!")}
          </p>
        )}
      </section>
    </div>
  );
}
