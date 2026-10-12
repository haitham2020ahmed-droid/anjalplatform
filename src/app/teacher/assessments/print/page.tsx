import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { EmptyState } from "@/components/ui-kit";
import { PrintHeader, PrintMeta, PrintPage, PrintStyles } from "@/components/print/print-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { correctAnswerText, loadQuestionItems } from "@/server/practice/items";
import { getT } from "@/i18n/server";

export const metadata = { title: "Print test" };

const CSS = `
.pt-q{break-inside:avoid;margin:0 0 14px}
.pt-q p{margin:0 0 6px}
.pt-pass{break-inside:avoid;border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;margin:10px 0 14px;background:#f8fafc;white-space:pre-wrap;font-size:13px;line-height:1.55}
.pt-pass h3{margin:0 0 6px;font-size:14px}
.pt-opts{list-style:none;margin:0;padding:0 0 0 18px}
.pt-opts li{margin:3px 0}
.pt-line{border-bottom:1px solid #94a3b8;height:22px;margin:4px 0}
.pt-key{columns:3;font-size:13px}
`;

/**
 * 🖨 A test as a clean printable page (Print / Save as PDF) — before or without assigning it. Questions come from
 * the ids in the address (the builder's preview); published questions only. The answer
 * key is a separate page for the teacher (?key=1). Staff only.
 */
export default async function PrintTestPage({ searchParams }: { searchParams: Promise<{ ids?: string; title?: string; key?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const ids = [...new Set(String(sp.ids ?? "").split(",").map((x) => x.trim()).filter((x) => /^[\w-]{1,191}$/.test(x)))].slice(0, 120);
  const title = String(sp.title ?? "").trim().slice(0, 120) || t("Test");
  // all bank content is open to every teacher (access rules): published questions only
  const items = await loadQuestionItems(repo, ids);
  const school = actor.schoolId ? String((await repo.findUnique("School", { id: actor.schoolId }))?.name ?? "") : "";
  let lastPassage = "";
  return (
    <AppShell name={String(me.displayName)}>
      <PrintStyles extra={CSS} />
      <div className="print:hidden">
        <PageHeader back={{ href: "/teacher/assessments/new", label: "New test" }} icon="🖨" title="Print test"
          subtitle={t("Check the test, then print it or save it as a PDF. Printing does not assign it.")} />
        <div className="mb-4 flex flex-wrap gap-2">
          <PrintButton label={t("Print / Save as PDF")} />
          <a href={`/teacher/assessments/print?${new URLSearchParams({ ids: ids.join(","), title, key: sp.key ? "" : "1" })}`} className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 font-semibold text-brand-navy ring-1 ring-slate-300">{t(sp.key ? "Hide the answer key" : "Add the answer key")}</a>
        </div>
      </div>
      {!items.length ? <EmptyState icon="📝" title="No questions to print" text="Go back, pick skills and press Preview first." /> : (
        <>
          <PrintPage label={title}>
            <PrintHeader title={title} school={school} t={t} />
            <PrintMeta items={[{ label: t("Name"), value: "______________________" }, { label: t("Class"), value: "________" }, { label: t("Date"), value: "__________" }]} />
            <ol style={{ paddingLeft: 18 }}>
              {items.map((it) => {
                const pass = it.passageText && it.passageText !== lastPassage ? it.passageText : null;
                if (pass) lastPassage = it.passageText!;
                const opts = (it as unknown as { options?: { label: string; text: string }[] }).options ?? [];
                return (
                  <li key={it.questionId} className="pt-q">
                    {pass && <div className="pt-pass">{it.passageTitle && <h3>{it.passageTitle}</h3>}{pass}</div>}
                    <p>{it.stem}</p>
                    {opts.length ? <ul className="pt-opts">{opts.map((o) => <li key={o.label}>{o.label}. {o.text}</li>)}</ul>
                      : String(it.type) === "TRUE_FALSE" ? <ul className="pt-opts"><li>A. True</li><li>B. False</li></ul>
                      : <><div className="pt-line" /><div className="pt-line" /></>}
                  </li>
                );
              })}
            </ol>
          </PrintPage>
          {sp.key && (
            <PrintPage label={t("Answer key")}>
              <PrintHeader title={`${title} · ${t("Answer key")}`} school={school} t={t} />
              <ol className="pt-key">{items.map((it) => { let a = ""; try { a = correctAnswerText(it); } catch { a = ""; } return <li key={it.questionId}>{a}</li>; })}</ol>
            </PrintPage>
          )}
        </>
      )}
    </AppShell>
  );
}
