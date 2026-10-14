import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Flash, LearnTabs } from "@/components/learn/teacher-tabs";
import { WordDiff } from "@/components/learn/word-diff";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { isAdmin, openReports, proposals } from "@/server/learn/edits";
import { safeIfBehind } from "@/server/db/schema-errors";
import { getT } from "@/i18n/server";
import { closeReportAction, decideEditAction, hideLessonAction } from "../actions";

export const metadata = { title: "Proposals and reports" };

const btn = "inline-flex min-h-10 items-center rounded-xl px-4 text-sm font-semibold";

/**
 * 📥 Admin: the teachers' proposals (each change shown word by word, old vs new) → Approve (the school's version for
 * everyone) / Reject (stays the teacher's own); and the problem reports → Hide the lesson until it is fixed, or Done.
 */
export default async function LearnReviewPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  if (!isAdmin(actor)) redirect("/teacher/learn");
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const [props, reports] = await Promise.all([safeIfBehind("learn.proposals", () => proposals(repo, actor), []), safeIfBehind("learn.reports", () => openReports(repo, actor), [])]);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/learn", label: "Learn" }} icon="📥" title="Proposals and reports" subtitle={t("Teachers' changes wait here for your decision; until then each teacher's classes see their version.")} />
      <LearnTabs active="review" admin />
      <Flash msg={sp.msg} err={sp.err} />
      <section className="mb-8" aria-labelledby="props">
        <h2 id="props" className="mb-3 text-xl text-ink">{t("Proposals")} <span className="text-base text-muted" dir="ltr">({props.length})</span></h2>
        {!props.length ? <p className="rounded-2xl bg-surface p-5 text-muted ring-1 ring-line">{t("No proposal is waiting.")}</p> : (
          <ul className="space-y-4">{props.map((p) => (
            <li key={p.id} className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
                <span>{p.kind === "LESSON" ? "📘" : "📗"}</span>
                {p.kind === "LESSON" ? <Link prefetch={false} href={`/teacher/learn/${p.ref}?level=${p.level}`} className="font-semibold text-ink hover:underline" lang="en">{p.title}</Link> : <span className="font-semibold text-ink" lang="en">{p.title}</span>}
                {p.kind === "LESSON" && <span>· {t("Level {n}", { n: p.level })}</span>}
                <span>· <bdi>{p.by}</bdi> · <span dir="ltr">{p.at.slice(0, 10)}</span></span>
              </p>
              <ul className="mt-3 space-y-2">{p.changes.map((c) => (
                <li key={c.path} className="rounded-xl bg-surface-2 p-3 text-sm ring-1 ring-line">
                  <p className="mb-1 text-xs font-semibold text-muted" dir="ltr">{c.path}</p>
                  <WordDiff old={c.old} now={c.now} />
                </li>))}</ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={decideEditAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="approve" value="1" /><button className={`${btn} bg-emerald-600 text-white`}>✓ {t("Approve")}</button></form>
                <form action={decideEditAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="approve" value="0" /><button className={`${btn} bg-surface text-ink ring-1 ring-line`}>✗ {t("Reject")}</button></form>
              </div>
            </li>))}</ul>
        )}
      </section>
      <section aria-labelledby="reps">
        <h2 id="reps" className="mb-3 text-xl text-ink">{t("Problem reports")} <span className="text-base text-muted" dir="ltr">({reports.length})</span></h2>
        {!reports.length ? <p className="rounded-2xl bg-surface p-5 text-muted ring-1 ring-line">{t("No open report.")}</p> : (
          <ul className="space-y-3">{reports.map((r) => (
            <li key={r.id} className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
              <p className="text-sm text-muted">{r.kind === "LESSON" ? "📘" : "📗"} <span className="font-semibold text-ink" lang="en">{r.title}</span>{r.kind === "LESSON" && r.level ? ` · ${t("Level {n}", { n: r.level })}` : ""} · <bdi>{r.by}</bdi> · <span dir="ltr">{r.at.slice(0, 10)}</span>{r.hidden && <span className="ms-2 rounded-full bg-rose-50 px-2 text-rose-800 ring-1 ring-rose-200">{t("Hidden")}</span>}</p>
              <p className="mt-1 text-ink" dir="auto">{r.text}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {r.kind === "LESSON" && <Link prefetch={false} href={`/teacher/learn/${r.ref}${r.level ? `?level=${r.level}` : ""}`} className={`${btn} bg-surface text-ink ring-1 ring-line`}>👀 {t("Open")}</Link>}
                {r.kind === "WORD" && <Link prefetch={false} href={`/teacher/learn/words?sel=${encodeURIComponent(r.ref.split("|").slice(0, 3).join("|"))}`} className={`${btn} bg-surface text-ink ring-1 ring-line`}>👀 {t("Open")}</Link>}
                {r.kind === "LESSON" && <form action={hideLessonAction}><input type="hidden" name="code" value={r.ref} /><input type="hidden" name="hidden" value={r.hidden ? "0" : "1"} /><input type="hidden" name="reason" value={r.text.slice(0, 300)} /><input type="hidden" name="back" value="/teacher/learn/review" /><button className={`${btn} bg-surface text-ink ring-1 ring-line`}>{r.hidden ? `👁 ${t("Show the lesson again")}` : `🙈 ${t("Hide the lesson")}`}</button></form>}
                <form action={closeReportAction}><input type="hidden" name="id" value={r.id} /><button className={`${btn} bg-emerald-600 text-white`}>✓ {t("Done")}</button></form>
              </div>
            </li>))}</ul>
        )}
      </section>
    </AppShell>
  );
}
