import Link from "next/link";
import { nafsDbGate } from "@/components/db-update-needed";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { canSeeNafs } from "@/server/teacher/nafs-access";
import { loadNafsQuestions, nafsIndex } from "@/server/nafs/bank";
import { MOE_BY_CODE } from "@/server/nafs/framework";
import { getNafsTest, markOf } from "@/server/nafs/tests";
import { bookletGroups } from "@/server/nafs/student";
import { getT } from "@/i18n/server";
import { RichInline } from "@/components/rich-inline";

export const metadata = { title: "Print NAFS test" };

const CSS = `
.nb{font-family:var(--font-hanken),"Hanken Grotesk","Segoe UI",system-ui,sans-serif;color:#111;background:#fff;max-width:210mm;margin:0 auto 24px;padding:16mm 14mm;border-radius:16px;box-shadow:0 0 0 1px #e2e8f0}
.nb-cover{display:flex;flex-direction:column;min-height:250mm}
.nb-logo{height:22mm;max-width:60mm;object-fit:contain}
.nb-cover h1{font-size:26px;margin:14mm 0 2mm}
.nb-who{display:grid;grid-template-columns:2fr 1fr;gap:6mm 10mm;margin:10mm 0}
.nb-who div{display:flex;align-items:flex-end;gap:6px;font-size:14px}.nb-who span{flex:1;border-bottom:1px solid #000;min-height:20px;padding:0 4px;font-weight:600}
.nb-box{border:2px solid #000;border-radius:8px;padding:5mm 7mm;font-size:13.5px;line-height:1.6}
.nb-box ol{margin:2mm 0 0;padding-inline-start:6mm}
.nb-pass{border:1.5px solid #000;border-radius:8px;padding:5mm 7mm;margin:0 0 6mm;font-size:13.5px;line-height:1.65}
.nb-pass h2{font-size:16px;margin:0 0 3mm;text-align:center}
.nb-note{font-size:12px;font-style:italic;margin:0 0 2mm}
.nb-para{display:grid;grid-template-columns:7mm 1fr;margin:0 0 2mm}.nb-para b{font-size:11px;color:#444}
.nb-q{display:grid;grid-template-columns:9mm 1fr;break-inside:avoid;page-break-inside:avoid;margin:0 0 5mm;font-size:13.5px}
.nb-q ol{list-style:none;margin:1.5mm 0 0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:1.5mm 8mm}
.nb-q li{display:flex;gap:6px}.nb-mk{float:right;font-size:11px;border:1px solid #000;border-radius:99px;padding:0 6px}
.nb-key{columns:4;font-size:13px;list-style:none;padding:0}
.nb-std{font-size:13px;font-weight:700;border-bottom:1.5px solid #000;margin:4mm 0 3mm;padding-bottom:1mm;break-after:avoid;page-break-after:avoid}
.nb-std small{font-weight:400}
.nb-lines{margin:2mm 0 0;display:grid;gap:7mm}.nb-lines span{display:block;border-bottom:1px solid #000;height:1px}
.nb-rub{font-size:12px;margin:1mm 0 3mm;padding-inline-start:6mm}
.nb + .nb{margin-top:24px}
@media print{@page{size:A4;margin:12mm}body{background:#fff!important}.nb{box-shadow:none;border-radius:0;padding:0;max-width:none}.nb + .nb{break-before:page;page-break-before:always;margin-top:0}.nb-pass,.nb-q{break-inside:avoid}}
`;

/**
 * 🇸🇦 The test as an exam booklet (A4, black and white friendly): a cover with the school logo and instructions, then
 * each passage (numbered paragraphs) with its questions A–D; ?key=1 adds the answer key page (teacher only).
 */
export default async function NafsPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ key?: string; class?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  if (!(await canSeeNafs(repo, actor))) redirect("/teacher");
  const gate = await nafsDbGate(); if (gate) return gate; // the NAFS tables are not in the database yet: say so
  const me = (await getActor())!.user;
  const { t } = await getT();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const test = await getNafsTest(repo, actor, id).catch(() => null);
  if (!test) redirect("/teacher/nafs?tab=test");
  const qs = await loadNafsQuestions(repo, test.questionIds);
  const groups = bookletGroups(test.questionIds, qs);
  // the Ministry booklet model prints its questions under the standard headings, like the guide
  const byStandard = test.mode === "MINISTRY";
  const stdOf = new Map((await nafsIndex(repo, actor.schoolId!)).filter((e) => test.questionIds.includes(e.id)).map((e) => [e.id, e.standard]));
  const std = (n: number) => stdOf.get(test.questionIds[n - 1]) ?? null;
  const school = String((await repo.findUnique("School", { id: actor.schoolId }))?.name ?? "");
  const n = test.questionIds.length;
  return (
    <AppShell name={String(me.displayName)}>
      <style>{CSS}</style>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <Link href={`/teacher/nafs/tests/${id}`} className="inline-flex min-h-11 items-center rounded-xl px-3 font-semibold text-ink-2 ring-1 ring-line">‹ {t("Back")}</Link>
        <PrintButton label={t("Print / Save as PDF")} />
        <Link href={`/teacher/nafs/tests/${id}/print${sp.key ? "" : "?key=1"}`} className="inline-flex min-h-11 items-center rounded-xl bg-surface px-4 font-semibold text-ink ring-1 ring-line">{t(sp.key ? "Hide the answer key" : "Add the answer key")}</Link>
      </div>
      <div lang="en" dir="ltr">
        <section className="nb nb-cover" aria-label="Cover">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/school-logo" alt="" className="nb-logo" />
          <p style={{ margin: "2mm 0 0", fontSize: 13 }}>{school}</p>
          <h1>{test.title}</h1>
          <p style={{ fontSize: 15, margin: 0 }}>English Reading · Grade 6 · {n} questions{test.timeLimitMin ? ` · ${test.timeLimitMin} minutes` : ""}</p>
          <div className="nb-who"><div>Name: <span /></div><div>Class: <span>{sp.class ?? ""}</span></div><div>Date: <span /></div><div>Student number: <span /></div></div>
          <div className="nb-box">
            <b>Instructions</b>
            <ol>
              <li>Follow the supervisor&apos;s instructions. Do not open the booklet until you are told to.</li>
              <li>Read each passage carefully before you answer its questions.</li>
              <li>Every question has four options: A, B, C and D. Choose ONE answer.</li>
              {qs.some((q) => q.kind === "WRITTEN") ? <li>Write the answers to the written questions on the lines in this booklet.</li> : null}
              <li>Answer every question — do not leave any blank.</li>
              <li>Fill the bubble of your answer completely on the answer sheet with a dark pencil or pen.</li>
              {test.timeLimitMin ? <li>You have {test.timeLimitMin} minutes.</li> : null}
            </ol>
          </div>
        </section>
        <section className="nb">
          {groups.map((g, gi) => (
            <div key={gi}>
              {g.passage && (
                <div className="nb-pass">
                  <p className="nb-note">Read the passage. Then answer questions {g.questions[0].n}{g.questions.length > 1 ? `–${g.questions[g.questions.length - 1].n}` : ""}.</p>
                  {g.passage.title && <h2><RichInline text={g.passage.title} /></h2>}
                  {g.passage.paragraphs.map((p, i) => <p key={i} className="nb-para"><b>{i + 1}</b><span><RichInline text={p} /></span></p>)}
                </div>
              )}
              {g.questions.map((q, qi) => {
                const sc = std(q.n), head = byStandard && sc && (qi === 0 || std(g.questions[qi - 1].n) !== sc) ? MOE_BY_CODE.get(sc) : null;
                return (
                  <div key={q.n}>
                    {head && <p className="nb-std">{head.short} · {head.text} <small>({head.area === "VOC" ? "Vocabulary" : head.area === "CA" ? "Comprehension and analysis" : "Evaluation"})</small></p>}
                    <div className="nb-q">
                      <b>{q.n}.</b>
                      <div>{test.marks && <span className="nb-mk">{markOf(test.marks, test.questionIds[q.n - 1])} mark(s)</span>}<RichInline text={q.stem} />
                        {q.kind === "WRITTEN" ? <div className="nb-lines" aria-label="Write your answer"><span /><span /><span /></div>
                          : <ol>{q.options.map((o, i) => <li key={i}><b>{"ABCD"[i]}.</b><span><RichInline text={o} /></span></li>)}</ol>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
        {sp.key && (
          <section className="nb" aria-label="Answer key">
            <h2 style={{ fontSize: 18, margin: "0 0 4mm" }}>{test.title} · Answer key</h2>
            <ol className="nb-key">{test.questionIds.map((qid, i) => { const q = qs.find((x) => x.id === qid); return <li key={qid}><b>{i + 1}.</b> {q?.kind === "WRITTEN" ? "Written (rubric)" : "ABCD"[q?.correct ?? 0]}{test.marks ? ` (${markOf(test.marks, qid)})` : ""}</li>; })}</ol>
            {qs.some((q) => q.kind === "WRITTEN") && <>
              <h3 style={{ fontSize: 15, margin: "5mm 0 2mm" }}>Short written answers: model answers and rubrics (teacher scores 0 / 1 / 2)</h3>
              {test.questionIds.map((qid, i) => { const q = qs.find((x) => x.id === qid); return q?.kind === "WRITTEN" ? <div key={qid}><p style={{ margin: "2mm 0 0", fontSize: 13 }}><b>{i + 1}.</b> {q.model}</p><ul className="nb-rub">{q.rubric.map((r) => <li key={r}>{r}</li>)}</ul></div> : null; })}
            </>}
          </section>
        )}
      </div>
    </AppShell>
  );
}
