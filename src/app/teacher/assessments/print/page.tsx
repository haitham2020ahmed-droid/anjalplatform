import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { EmptyState } from "@/components/ui-kit";
import { PrintHeader, PrintPage, PrintStyles } from "@/components/print/print-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { loadQuestionItems } from "@/server/practice/items";
import { printLayout, type PrintAnswer } from "@/server/tests/print-layout";
import { getT } from "@/i18n/server";
import { RichInline } from "@/components/rich-inline";

export const metadata = { title: "Print test" };

const CSS = `
.pt-who{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px 18px;margin:4px 0 16px;font-size:13px}
.pt-who div{display:flex;align-items:flex-end;gap:6px;white-space:nowrap}
.pt-who span{flex:1;border-bottom:1px solid #64748b;min-height:18px;padding:0 4px;font-weight:600}
.pt-group{margin:0 0 6px}
.pt-pass{break-inside:avoid;border:1px solid #cbd5e1;border-radius:10px;padding:10px 14px;margin:6px 0 12px;background:#f8fafc;white-space:pre-wrap;font-size:13px;line-height:1.6}
.pt-pass h3{margin:0 0 6px;font-size:14px}
.pt-pass-note{font-size:11.5px;color:#475569;margin:0 0 6px}
.pt-q{display:grid;grid-template-columns:28px 1fr;gap:0 4px;break-inside:avoid;page-break-inside:avoid;margin:0 0 14px}
.pt-n{font-weight:700;color:#0f2a4a}
.pt-mk{float:right;margin-left:8px;font-size:11.5px;font-weight:600;color:#475569;border:1px solid #cbd5e1;border-radius:999px;padding:0 7px}
.pt-stem{margin:0 0 6px;line-height:1.5}
.pt-opts{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:4px 18px}
.pt-opts.pt-wide{grid-template-columns:1fr}
.pt-opts li{display:flex;gap:8px;align-items:baseline}
.pt-bub{display:inline-block;flex:none;width:13px;height:13px;border:1.5px solid #475569;border-radius:50%;transform:translateY(2px)}
.pt-list{margin:0;padding:0;list-style:none;display:grid;gap:4px}
.pt-list li{display:flex;gap:8px;align-items:baseline}
.pt-box{display:inline-block;flex:none;width:26px;border-bottom:1px solid #64748b;height:14px}
.pt-match{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}
.pt-line{border-bottom:1px solid #94a3b8;height:24px}
.pt-key{columns:2;column-gap:28px;font-size:13px;margin:0;padding:0;list-style:none}
.pt-key li{break-inside:avoid;margin:0 0 4px}
@media (max-width:640px){.pt-who{grid-template-columns:1fr}.pt-opts,.pt-match{grid-template-columns:1fr}}
@media print{
  @page{size:A4;margin:14mm 12mm}
  body{background:#fff!important}
  .pt-q,.pt-pass{break-inside:avoid;page-break-inside:avoid}
  .pt-pass{background:#fff}
  .pt-key{columns:3}
}
`;

function Answer({ a, t }: { a: PrintAnswer; t: (x: string) => string }) {
  if (a.kind === "CHOICES") return <ul className={`pt-opts ${a.wide ? "pt-wide" : ""}`}>{a.options.map((o) => <li key={o.label}><span className="pt-bub" aria-hidden="true" /><span><b>{o.label}.</b> <RichInline text={o.text} /></span></li>)}</ul>;
  if (a.kind === "TRUE_FALSE") return <ul className="pt-opts"><li><span className="pt-bub" aria-hidden="true" /><span>True</span></li><li><span className="pt-bub" aria-hidden="true" /><span>False</span></li></ul>;
  if (a.kind === "ORDER") return <><p className="pt-pass-note">{t("Number them in the right order.")}</p><ul className="pt-list">{a.elements.map((e, i) => <li key={i}><span className="pt-box" aria-hidden="true" /><span><RichInline text={e} /></span></li>)}</ul></>;
  if (a.kind === "MATCH") return <><p className="pt-pass-note">{t("Write the letter of the match.")}</p><div className="pt-match"><ul className="pt-list">{a.left.map((l, i) => <li key={i}><span className="pt-box" aria-hidden="true" /><span>{i + 1}. <RichInline text={l} /></span></li>)}</ul><ul className="pt-list">{a.right.map((r, i) => <li key={i}><span><b>{String.fromCharCode(65 + i)}.</b> <RichInline text={r} /></span></li>)}</ul></div></>;
  return <>{Array.from({ length: a.lines }, (_, i) => <div key={i} className="pt-line" />)}</>;
}

/**
 * 🖨 A test as a clean printable page (Print / Save as PDF) — before or without assigning it. Questions come from
 * the ids in the address (the builder's preview), published questions only, numbered; questions that share a
 * passage sit under it and the passage is printed once. Header: test title, class, date and a name line. The
 * answer key is a separate page for the teacher (?key=1). Staff only.
 */
export default async function PrintTestPage({ searchParams }: { searchParams: Promise<{ ids?: string; title?: string; key?: string; class?: string; marks?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const ids = [...new Set(String(sp.ids ?? "").split(",").map((x) => x.trim()).filter((x) => /^[\w-]{1,191}$/.test(x)))].slice(0, 120);
  const title = String(sp.title ?? "").trim().slice(0, 120) || t("Test");
  const className = String(sp.class ?? "").trim().slice(0, 80);
  // marks per question (same order as ids; from the builder): shown beside each question and in the header
  const markList = String(sp.marks ?? "").split(",").map((x) => Number(x));
  const marks = sp.marks && markList.length === ids.length && markList.every((x) => Number.isFinite(x) && x >= 0 && x <= 100) ? new Map(ids.map((id, i) => [id, Math.round(markList[i] * 100) / 100])) : null;
  // all bank content is open to every teacher (access rules): published questions only
  const groups = printLayout(await loadQuestionItems(repo, ids));
  const count = groups.reduce((n, g) => n + g.questions.length, 0);
  const school = actor.schoolId ? String((await repo.findUnique("School", { id: actor.schoolId }))?.name ?? "") : "";
  const totalMarks = marks ? Math.round(groups.flatMap((g) => g.questions).reduce((a, q) => a + (marks.get(q.id) ?? 1), 0) * 100) / 100 : null;
  const keyHref = `/teacher/assessments/print?${new URLSearchParams({ ids: ids.join(","), title, ...(className ? { class: className } : {}), ...(marks ? { marks: String(sp.marks) } : {}), ...(sp.key ? {} : { key: "1" }) })}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PrintStyles extra={CSS} />
      <div className="print:hidden">
        <PageHeader back={{ href: "/teacher/assessments/new", label: "New test" }} icon="🖨" title="Print test"
          subtitle={t("Check the test, then print it or save it as a PDF. Printing does not assign it.")} />
        <div className="mb-4 flex flex-wrap gap-2">
          <PrintButton label={t("Print / Save as PDF")} />
          <a href={keyHref} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 font-semibold text-brand-navy ring-1 ring-slate-300">{t(sp.key ? "Hide the answer key" : "Add the answer key")}</a>
        </div>
      </div>
      {!count ? <EmptyState icon="📝" title="No questions to print" text="Go back, choose questions and press Preview first." /> : (
        <>
          <PrintPage label={title}>
            <PrintHeader title={title} subtitle={totalMarks !== null ? `${t("{n} questions", { n: count })} · ${t("{n} marks", { n: totalMarks })}` : t("{n} questions", { n: count })} school={school} date={null} t={t} />
            <div className="pt-who">
              <div>{t("Name")}: <span /></div>
              <div>{t("Class")}: <span>{className}</span></div>
              <div>{t("Date")}: <span /></div>
            </div>
            {groups.map((g, gi) => (
              <div key={gi} className="pt-group" lang="en" dir="ltr">
                {g.passage && (
                  <div className="pt-pass">
                    <p className="pt-pass-note">{g.questions.length > 1 ? `Read the passage. Then answer questions ${g.questions[0].n}–${g.questions[g.questions.length - 1].n}.` : `Read the passage. Then answer question ${g.questions[0].n}.`}</p>
                    {g.passage.title && <h3><RichInline text={g.passage.title} /></h3>}
                    <RichInline text={g.passage.text} />
                  </div>
                )}
                {g.questions.map((q) => (
                  <div key={q.id} className="pt-q">
                    <span className="pt-n">{q.n}.</span>
                    <div>{marks && <span className="pt-mk">{marks.get(q.id) === 1 ? "1 mark" : `${marks.get(q.id) ?? 1} marks`}</span>}<p className="pt-stem"><RichInline text={q.stem} /></p><Answer a={q.answer} t={t} /></div>
                  </div>
                ))}
              </div>
            ))}
          </PrintPage>
          {sp.key && (
            <PrintPage label={t("Answer key")}>
              <PrintHeader title={`${title} · ${t("Answer key")}`} subtitle={className || undefined} school={school} t={t} />
              <ol className="pt-key" lang="en" dir="ltr">{groups.flatMap((g) => g.questions).map((q) => <li key={q.id}><b>{q.n}.</b> {q.key ? <RichInline text={q.key} /> : "—"}{marks ? ` (${marks.get(q.id) ?? 1})` : ""}</li>)}</ol>
            </PrintPage>
          )}
        </>
      )}
    </AppShell>
  );
}
