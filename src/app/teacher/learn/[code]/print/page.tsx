import Link from "next/link";
import { RichText } from "@/components/learn/rich-text";
import { PrintNow } from "@/components/learn/print-now";
import { repo, requireActor } from "@/server/auth/next";
import { teacherLessonView } from "@/server/learn/teacher";
import { getT } from "@/i18n/server";
import { RichInline } from "@/components/rich-inline";
import { planHref } from "@/lib/plan-links";
import { PlanA, PlanLinksNote, PlanQr } from "@/components/plans/plan-links";

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
      {/* 🔗 r79: the paper copy is for students — the title opens this lesson, each skill its practice (QR on paper) */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Learn · {v.meta.goalArea}</p>
          <h1 className="text-3xl"><PlanA href={planHref({ kind: "lesson", code: v.meta.code }, "student")}>{v.meta.title}</PlanA></h1>
          {v.skills.length > 0 && <p className="mt-1 text-sm text-slate-600">{t("Practise")}: {v.skills.map((k, i) => <span key={k.id}>{i ? " · " : ""}<PlanA href={planHref({ kind: "skill", id: k.id }, "student")}>{k.name}</PlanA></span>)}</p>}
          <PlanLinksNote t={t} className="mt-2 inline-block" />
        </div>
        <PlanQr href={planHref({ kind: "lesson", code: v.meta.code }, "student")} size={64} />
      </header>
      {c.slides.map((s, i) => <section key={i} className={box}><h2 className="mb-2 text-xl">{s.title}</h2><RichText text={s.text} /></section>)}
      <section className={box}><h2 className="mb-2 text-xl">{c.proof.title}</h2><RichText text={c.proof.text} /></section>
      <section className={box}><h2 className="mb-2 text-xl">Worked example</h2><p>{c.example.sentences.map((x) => x.t).join(" ")}</p><div className="mt-2"><RichText text={c.example.explain} /></div></section>
      <section className={box}><h2 className="mb-2 text-xl">Try together</h2><p className="mb-2"><RichInline text={c.together.passage} /></p><p className="font-semibold"><RichInline text={c.together.stem} /></p><ol className="mt-1 space-y-1">{c.together.options.map((o, k) => <li key={k}>{letters[k]}. <RichInline text={o} /></li>)}</ol></section>
      <section className={box}><h2 className="mb-2 text-xl">Point to the proof</h2><p className="font-semibold"><RichInline text={c.evidence.stem} /></p><ol className="mt-1 list-decimal ps-6">{c.evidence.sentences.map((x, k) => <li key={k}><RichInline text={x} /></li>)}</ol></section>
      {c.checks.map((q, i) => <section key={i} className={box}><h2 className="mb-2 text-xl">Check {i + 1}</h2><p className="mb-2"><RichInline text={q.passage} /></p><p className="font-semibold"><RichInline text={q.stem} /></p><ol className="mt-1 space-y-1">{q.options.map((o, k) => <li key={k}>{letters[k]}. <RichInline text={o} /></li>)}</ol></section>)}
      <section className={box}><h2 className="mb-2 text-xl">{c.again.title}</h2><RichText text={c.again.text} /><div className="mt-2"><RichText text={c.again.example} /></div></section>
      <section className={`${box} break-before-page`}>
        <h2 className="mb-2 text-xl">Answer key</h2>
        <p>Try together: {letters[c.together.answer]} · Proof sentences: {c.evidence.proof.map((x) => x + 1).join(", ")}</p>
        <ol className="mt-1 space-y-1">{c.checks.map((q, i) => <li key={i}>Check {i + 1}: {letters[q.answer]} — <RichInline text={q.why} /></li>)}</ol>
      </section>
    </main>
  );
}
