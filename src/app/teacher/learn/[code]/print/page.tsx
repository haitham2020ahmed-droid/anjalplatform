import Link from "next/link";
import { RichText } from "@/components/learn/rich-text";
import { PrintNow } from "@/components/learn/print-now";
import { repo, requireActor } from "@/server/auth/next";
import { teacherLessonView } from "@/server/learn/teacher";
import { getT } from "@/i18n/server";

export const metadata = { title: "Learn — PDF" };

const box = "break-inside-avoid rounded-xl border border-slate-300 p-4";
const letters = ["A", "B", "C", "D"];

/**
 * ⬇️ Download PDF: one level of a lesson on paper (the browser's print dialog → Save as PDF): slides, proof, the
 * worked example, try together, point to the proof, the 3 checks, another way — and an answer key at the end.
 */
export default async function LessonPrintPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ level?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const { t } = await getT();
  const code = decodeURIComponent((await params).code);
  const v = await teacherLessonView(repo, actor, code, (await searchParams).level ?? "2");
  if (!v) return <p className="p-6">{t("This lesson is not available.")}</p>;
  const c = v.version.level;
  return (
    <main className="mx-auto max-w-3xl space-y-4 bg-white p-6 text-slate-900" lang="en">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/teacher/learn/${code}?level=${v.level}`} className="text-sm font-semibold text-teal-700">‹ {t("Back")}</Link>
        <PrintNow />
      </div>
      <header><p className="text-sm text-slate-500">Learn · {v.meta.goalArea}</p><h1 className="text-3xl">{v.meta.title}</h1></header>
      {c.slides.map((s, i) => <section key={i} className={box}><h2 className="mb-2 text-xl">{s.title}</h2><RichText text={s.text} /></section>)}
      <section className={box}><h2 className="mb-2 text-xl">{c.proof.title}</h2><RichText text={c.proof.text} /></section>
      <section className={box}><h2 className="mb-2 text-xl">Worked example</h2><p>{c.example.sentences.map((x) => x.t).join(" ")}</p><div className="mt-2"><RichText text={c.example.explain} /></div></section>
      <section className={box}><h2 className="mb-2 text-xl">Try together</h2><p className="mb-2">{c.together.passage}</p><p className="font-semibold">{c.together.stem}</p><ol className="mt-1 space-y-1">{c.together.options.map((o, k) => <li key={k}>{letters[k]}. {o}</li>)}</ol></section>
      <section className={box}><h2 className="mb-2 text-xl">Point to the proof</h2><p className="font-semibold">{c.evidence.stem}</p><ol className="mt-1 list-decimal ps-6">{c.evidence.sentences.map((x, k) => <li key={k}>{x}</li>)}</ol></section>
      {c.checks.map((q, i) => <section key={i} className={box}><h2 className="mb-2 text-xl">Check {i + 1}</h2><p className="mb-2">{q.passage}</p><p className="font-semibold">{q.stem}</p><ol className="mt-1 space-y-1">{q.options.map((o, k) => <li key={k}>{letters[k]}. {o}</li>)}</ol></section>)}
      <section className={box}><h2 className="mb-2 text-xl">{c.again.title}</h2><RichText text={c.again.text} /><div className="mt-2"><RichText text={c.again.example} /></div></section>
      <section className={`${box} break-before-page`}>
        <h2 className="mb-2 text-xl">Answer key</h2>
        <p>Try together: {letters[c.together.answer]} · Proof sentences: {c.evidence.proof.map((x) => x + 1).join(", ")}</p>
        <ol className="mt-1 space-y-1">{c.checks.map((q, i) => <li key={i}>Check {i + 1}: {letters[q.answer]} — {q.why}</li>)}</ol>
      </section>
    </main>
  );
}
