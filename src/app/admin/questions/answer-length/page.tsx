import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { BankTabs } from "../bank-tabs";
import { answerLengthReport, flaggedDetails, FLAGGED_PAGE, type AnswerLengthReport } from "@/server/admin/answer-length";
import { rewriteStatus, SOURCE_LABEL, type RewriteStatus } from "@/server/admin/option-rewrites";
import { LENGTH_RATIO, SENTENCE_WORDS } from "@/lib/length-cue";
import { RichInline } from "@/components/rich-inline";
import { LineIcon } from "@/components/ui/line-icon";
import { RewriteRunner } from "./rewrite-runner";

export const metadata = { title: "Answer-length check" };

/**
 * 🎯 Answer-length check: how often the correct choice is the longest one (chance = 25 % with 4 choices), by source
 * and by skill (worst first), the flagged questions (paged, with a link to the editor) and "Export flagged (JSON)";
 * then "Update answer choices from files" (src/server/admin/option-rewrites.ts). See src/server/admin/answer-length.ts.
 */
export default async function AnswerLengthPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  let rep: AnswerLengthReport | null = null, failed = false;
  try { rep = await answerLengthReport(repo, actor); } catch (e) { console.error("answer-length", e); failed = true; }
  let st: RewriteStatus | null = null;
  try { st = await rewriteStatus(repo, actor); } catch (e) { console.error("answer-length status", e); }
  const pages = rep ? Math.max(1, Math.ceil(rep.flagged.length / FLAGGED_PAGE)) : 1;
  const page = Math.min(pages, Math.max(1, Math.trunc(Number(sp.page) || 1)));
  const rows = rep ? await flaggedDetails(repo, rep.flagged.slice((page - 1) * FLAGGED_PAGE, page * FLAGGED_PAGE)) : [];
  const tone = (p: number) => (p >= 40 ? "text-red-700" : p >= 30 ? "text-amber-700" : "text-emerald-700");
  const card = "rounded-2xl bg-white p-4 ring-1 ring-slate-200";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/questions", label: "Questions" }} icon="search" title="Answer-length check"
        subtitle={t("When the correct answer is usually the longest choice, students can guess it without reading. With 4 choices, the correct one should be the longest only about 25% of the time.")}>
        {rep && rep.flagged.length > 0 && <a href="/api/admin/answer-length/export" className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300" data-testid="export-flagged"><LineIcon name="download" className="me-1 inline-block h-4 w-4 align-[-3px]" />{t("Export flagged (JSON)")}</a>}
      </PageHeader>
      <BankTabs />
      {failed || !rep ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900 ring-1 ring-red-200">{t("The figures could not be worked out. Open the page again in a minute.")}</p> : (
        <div className="space-y-5">
          <section className="grid gap-2 sm:grid-cols-3" data-testid="length-tiles">
            <div className={card}><p className="text-xs text-slate-600">{t("Correct answer is the longest")}</p><p className={`text-2xl font-bold tabular-nums ${tone(rep.overall.pct)}`} dir="ltr">{rep.overall.pct}%</p><p className="text-xs text-slate-500">{t("{x} of {y}", { x: rep.overall.longest, y: rep.overall.checked })}</p></div>
            <div className={card}><p className="text-xs text-slate-600">{t("Flagged questions")}</p><p className="text-2xl font-bold tabular-nums text-brand-navy">{rep.overall.flagged}</p><p className="text-xs text-slate-500">{t("Correct answer has {w}+ words and is more than {r}× the next longest", { w: SENTENCE_WORDS, r: LENGTH_RATIO })}</p></div>
            <div className={card}><p className="text-xs text-slate-600">{t("Chance level")}</p><p className="text-2xl font-bold tabular-nums text-slate-700" dir="ltr">25%</p><p className="text-xs text-slate-500">{t("Checked {n} multiple-choice questions", { n: rep.overall.checked })}</p></div>
          </section>

          <section className={card}>
            <h2 className="mb-2 font-bold text-brand-navy">{t("By source")}</h2>
            <Tally rows={rep.bySource.map((x) => ({ key: x.source, name: t(x.label), ...x }))} t={t} tone={tone} />
          </section>

          <section className={card}>
            <h2 className="mb-2 font-bold text-brand-navy">{t("By skill (worst first)")}</h2>
            <Tally rows={rep.bySkill.slice(0, 40).map((x) => ({ key: `${x.source}|${x.skill}`, name: `${x.skill} · ${t(SOURCE_LABEL[x.source])}`, ...x }))} t={t} tone={tone} />
            {rep.bySkill.length > 40 && <p className="mt-1 text-xs text-slate-500">{t("The {n} worst skills are shown.", { n: 40 })}</p>}
          </section>

          <section>
            <h2 className="mb-2 font-bold text-brand-navy">{t("Flagged questions")} <span className="text-sm font-normal text-slate-500">({rep.flagged.length})</span></h2>
            {rows.length === 0 ? <p className={`${card} text-slate-600`}>{t("No question is flagged.")}</p> : (
              <ul className="space-y-3" data-testid="flagged-list">
                {rows.map((r) => (
                  <li key={r.id} className={card}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">{t(SOURCE_LABEL[r.source])} · {r.skill} · <span dir="ltr">{t("ratio")} {r.ratio}×</span></p>
                        <p className="mt-0.5 font-semibold text-brand-navy" dir="ltr"><RichInline text={r.stem.slice(0, 600)} /></p>
                      </div>
                      {r.editHref && <Link prefetch={false} href={r.editHref} className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300"><LineIcon name="pen" className="me-1 inline-block h-4 w-4 align-[-3px]" />{t("Open in editor")}</Link>}
                    </div>
                    <ol className="mt-2 space-y-1 text-sm" dir="ltr">
                      {r.options.map((o, i) => <li key={i} className={i === r.correct ? "font-semibold text-emerald-800" : "text-slate-700"}>{"ABCDEFGH"[i]}. {o} {i === r.correct ? "✔" : ""} <span className="text-xs text-slate-400">({o.length})</span></li>)}
                    </ol>
                  </li>
                ))}
              </ul>
            )}
            {pages > 1 && (
              <nav aria-label={t("Pages")} className="mt-3 flex items-center gap-3 text-sm">
                {page > 1 && <Link prefetch={false} href={`/admin/questions/answer-length?page=${page - 1}`} className="font-semibold text-brand-navy underline">{t("Previous")}</Link>}
                <span className="text-slate-600">{t("Page {x} of {y}", { x: page, y: pages })}</span>
                {page < pages && <Link prefetch={false} href={`/admin/questions/answer-length?page=${page + 1}`} className="font-semibold text-brand-navy underline">{t("Next")}</Link>}
              </nav>
            )}
          </section>
        </div>
      )}

      <section className="mt-6 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <h2 className="mb-1 font-bold text-brand-navy">{t("Update answer choices from files")}</h2>
        <p className="mb-3 text-sm text-slate-600">{t("Reads the rewrite files (data/questions/option-rewrites) and changes only the WRONG answer choices of the matching questions. The correct answer, the order, statistics and students' answers are never changed. Preview first; running it twice changes nothing the second time.")}</p>
        {st ? <RewriteRunner files={st.files} entries={st.entries} problems={st.problems} total={st.totals.question + st.totals.readrise} resume={st.progress ? { scanned: st.progress.scanned, changed: st.progress.changed } : null} />
          : <p role="alert" className="text-sm text-red-800">{t("The rewrite files could not be read.")}</p>}
      </section>
    </AppShell>
  );
}

function Tally({ rows, t, tone }: { rows: { key: string; name: string; checked: number; longest: number; pct: number; flagged: number }[]; t: (s: string, v?: Record<string, string | number>) => string; tone: (p: number) => string }) {
  if (!rows.length) return <p className="text-sm text-slate-600">{t("No multiple-choice questions.")}</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-slate-600"><tr><th className="py-1 text-start">{t("Name")}</th><th className="text-end">{t("Questions")}</th><th className="text-end">{t("Correct answer is the longest")}</th><th className="text-end">{t("Flagged")}</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-slate-100 tabular-nums">
            <td className="py-1">{r.name}</td><td className="text-end">{r.checked}</td>
            <td className={`text-end font-semibold ${tone(r.pct)}`} dir="ltr">{r.pct}%</td><td className="text-end">{r.flagged}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
