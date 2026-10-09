import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { PassageText } from "@/components/passage-text";
import { PrintToggle } from "@/components/print/print-toggle";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { levelSheets, MAX_WORKSHEET, openWorksheet, pickerSkills, skillQuestions, worksheetList, worksheetView } from "@/server/teacher/worksheet";
import { groupWorksheetIds, type GroupKey } from "@/server/map/map-plan";
import { deleteWorksheetAction, saveWorksheetAction } from "./actions";

export const metadata = { title: "Worksheets" };

type SP = { levels?: string; ids?: string; q?: string | string[]; keep?: string; title?: string; v?: string; skillId?: string; w?: string; msg?: string; classId?: string; group?: string; low?: string; high?: string; grade?: string };

/**
 * 🖨 Worksheets from chosen questions: pick questions from any skill, reorder, version A / B, print or save as PDF
 * (name / class / date at the top, each passage printed once, the answer key on its own page). Keep and share them.
 */
export default async function WorksheetPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  let saved: Awaited<ReturnType<typeof openWorksheet>> | null = null;
  if (sp.w) saved = await openWorksheet(repo, actor, sp.w);
  const picked = [...(Array.isArray(sp.q) ? sp.q : sp.q ? [sp.q] : [])];
  let ids = [...new Set([...(sp.keep ?? "").split(","), ...(sp.ids ?? "").split(","), ...picked].filter(Boolean))];
  let title = sp.title ?? saved?.title ?? "";
  if (saved && !sp.ids) ids = saved.ids;
  if (!ids.length && sp.classId && sp.group) { ids = await groupWorksheetIds(repo, actor, sp.classId, sp.group as GroupKey, Number(sp.low), Number(sp.high)); title = title || "Small group worksheet"; }
  const version = sp.v === "B" ? "B" : "A";
  const build = Boolean(sp.ids || saved || (sp.classId && sp.group)) && ids.length > 0 && !sp.skillId;
  const url = (p: Record<string, string>) => `/teacher/worksheet?${new URLSearchParams({ ids: ids.join(","), title, v: version, ...(saved ? { w: saved.id } : {}), ...p })}`;
  const move = (i: number, d: number) => { const n = [...ids]; const j = i + d; if (j < 0 || j >= n.length) return n; [n[i], n[j]] = [n[j], n[i]]; return n; };

  if (build && sp.levels === "3") {
    const sheets = await levelSheets(repo, actor, { ids, title });
    return (
      <AppShell name={String(me.displayName)}>
        <div className="print:hidden">
          <PageHeader back={{ href: url({ levels: "" }), label: "One sheet" }} icon="🎚" title="Worksheet in 3 levels" subtitle={<>The same skills on three sheets: <b>● easier</b>, <b>●● on level</b>, <b>●●● harder</b>. Each sheet starts on a new page and has its own answer key. Students see only the dots.</>}>
            <PrintButton />
          </PageHeader>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">{sheets.map((x) => <div key={x.level} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-lg font-bold text-brand-navy">{x.mark} {x.name}</p><p className="text-sm text-slate-600">{x.view.count} questions{x.filled ? ` · ${x.filled} taken from the same skills` : ""}</p></div>)}</div>
        </div>
        {sheets.map((x, si) => <Sheet key={x.level} v={x.view} version="A" first={si === 0} keyLabel={`${x.mark} = ${x.name}`} />)}
      </AppShell>
    );
  }

  if (build) {
    const v = await worksheetView(repo, actor, { ids, title, version });
    return (
      <AppShell name={String(me.displayName)}>
        <div className="print:hidden">
          <PageHeader back={{ href: "/teacher/worksheet", label: "Worksheets" }} icon="🖨" title="Worksheet" subtitle="Check it, reorder, choose version A or B, then print or “Save as PDF”. The answer key prints on its own page.">
            <PrintButton />
          </PageHeader>
          {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
          <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <form className="flex items-end gap-2" action="/teacher/worksheet">
              <input type="hidden" name="ids" value={ids.join(",")} /><input type="hidden" name="v" value={version} />{saved && <input type="hidden" name="w" value={saved.id} />}
              <label className="text-sm font-semibold text-slate-700">Title<input name="title" defaultValue={v.title} maxLength={120} className="mt-1 block w-64 rounded-lg border border-slate-300 px-2 py-1.5 font-normal" /></label>
              <button className="rounded-lg px-3 py-1.5 font-semibold ring-1 ring-slate-300">Apply</button>
            </form>
            <div className="flex gap-1">{(["A", "B"] as const).map((x) => <Link key={x} href={url({ v: x })} className={`rounded-lg px-3 py-1.5 font-semibold ${version === x ? "bg-brand-navy text-white" : "ring-1 ring-slate-300"}`}>Version {x}</Link>)}</div>
            <Link href={`/teacher/worksheet?${new URLSearchParams({ keep: ids.join(","), title })}`} className="rounded-lg px-3 py-1.5 font-semibold text-brand-navy ring-1 ring-slate-300">＋ Add questions</Link>
            <form action={saveWorksheetAction} className="flex items-center gap-2">
              <input type="hidden" name="ids" value={ids.join(",")} /><input type="hidden" name="title" value={v.title} />{saved?.mine && <input type="hidden" name="id" value={saved.id} />}
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="shared" value="1" defaultChecked={saved?.shared} /> share with colleagues</label>
              <button className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white">💾 Save</button>
            </form>
          </div>
          <details className="mb-5 rounded-2xl bg-white p-4 ring-1 ring-slate-200"><summary className="cursor-pointer font-semibold text-brand-navy">↕ Reorder or remove questions ({ids.length}/{MAX_WORKSHEET})</summary>
            <ol className="mt-2 space-y-1 text-sm">{v.ids.map((id, i) => { const q = v.blocks.flatMap((b) => b.questions).find((x) => x.id === id); return (
              <li key={id} className="flex items-center gap-2"><span className="w-6 text-end text-slate-400">{i + 1}.</span><span className="flex-1 truncate">{q?.stem}</span>
                <Link href={url({ ids: move(ids.indexOf(id), -1).join(",") })} aria-label="Move up" className="rounded px-2 ring-1 ring-slate-200">↑</Link>
                <Link href={url({ ids: move(ids.indexOf(id), 1).join(",") })} aria-label="Move down" className="rounded px-2 ring-1 ring-slate-200">↓</Link>
                <Link href={url({ ids: ids.filter((x) => x !== id).join(",") })} aria-label="Remove" className="rounded px-2 text-red-700 ring-1 ring-red-200">✕</Link></li>); })}</ol>
            <p className="mt-2 text-xs text-slate-500">Questions of the same reading passage are printed together, after the passage.</p>
          </details>
        </div>
        <Sheet v={v} version={version} first />
      </AppShell>
    );
  }

  // ---------------------------------------------------------------- picker
  const [skills, list] = await Promise.all([pickerSkills(repo, actor), worksheetList(repo, actor)]);
  const grades = [...new Set(skills.map((k) => k.grade))].sort();
  const grade = Number(sp.grade) || grades[0] || 0;
  const qs = sp.skillId ? await skillQuestions(repo, actor, sp.skillId) : [];
  const keep = ids;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} icon="🖨" title="Worksheets" subtitle="Choose questions from any skill (several skills together is fine), then build a printable worksheet with its answer key." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {keep.length > 0 && <p className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900 ring-1 ring-emerald-200"><b>{keep.length} question(s) chosen.</b><Link href={`/teacher/worksheet?${new URLSearchParams({ ids: keep.join(","), title })}`} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white">Build the worksheet ▶</Link></p>}
      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        <aside className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <nav className="flex flex-wrap gap-1">{grades.map((g) => <Link key={g} href={`/teacher/worksheet?${new URLSearchParams({ grade: String(g), keep: keep.join(","), title })}`} className={`rounded-full px-3 py-1 text-sm font-semibold ${g === grade ? "bg-brand-navy text-white" : "ring-1 ring-slate-200"}`}>Grade {g}</Link>)}</nav>
          <ul className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto text-sm">{skills.filter((k) => k.grade === grade).map((k) => <li key={k.id}><Link href={`/teacher/worksheet?${new URLSearchParams({ grade: String(grade), skillId: k.id, keep: keep.join(","), title })}`} className={`block rounded-lg px-2 py-1 ${sp.skillId === k.id ? "bg-brand-navy text-white" : "hover:bg-slate-50"}`}>{k.name} <span className="opacity-60">({k.questions})</span></Link></li>)}</ul>
        </aside>
        <section>
          {sp.skillId ? (
            <form action="/teacher/worksheet" className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <input type="hidden" name="keep" value={keep.join(",")} /><input type="hidden" name="title" value={title} /><input type="hidden" name="grade" value={grade} />
              <div className="flex items-center justify-between gap-2"><h2 className="font-bold text-brand-navy">Tick the questions you want</h2><button className="rounded-lg bg-brand-navy px-4 py-2 font-semibold text-white">＋ Add to the worksheet</button></div>
              <ul className="mt-3 space-y-1 text-sm">{qs.map((q) => <li key={q.id} className="flex items-start gap-1"><PrintToggle id={q.id} stem={q.stem} className="mt-1.5" /><label className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"><input type="checkbox" name="q" value={q.id} defaultChecked={keep.includes(q.id)} className="mt-1" /><span><span className="me-1 rounded bg-slate-100 px-1 text-xs">{q.type.replace(/_/g, " ").toLowerCase()} · {q.level <= 2 ? "easier" : q.level >= 6 ? "harder" : "middle"}</span>{q.passage && <span className="me-1 text-xs text-sky-700">📖 {q.passage}</span>}{q.stem}</span></label></li>)}</ul>
            </form>
          ) : <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">← Choose a skill to see its questions.</p>}
          <div className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <h2 className="font-bold text-brand-navy">📁 My worksheets and shared ones</h2>
            {!list.length ? <p className="mt-2 text-sm text-slate-500">None yet.</p> : (
              <ul className="mt-2 space-y-1 text-sm">{list.map((w) => <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5"><Link href={`/teacher/worksheet?w=${w.id}`} className="font-semibold text-brand-navy hover:underline">{w.title}</Link><span className="text-slate-500">{w.count} questions · {w.mine ? (w.shared ? "mine · shared" : "mine") : `by ${w.author}`} · {w.updatedAt.slice(0, 10)}</span>{w.mine && <form action={deleteWorksheetAction}><input type="hidden" name="id" value={w.id} /><button className="text-xs text-red-700 underline">delete</button></form>}</li>)}</ul>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

/** One printable sheet: header, passages once, questions, then the answer key on its own page. */
function Sheet({ v, version, first, keyLabel }: { v: Awaited<ReturnType<typeof worksheetView>>; version: "A" | "B"; first: boolean; keyLabel?: string }) {
  return (
    <article className={`mx-auto max-w-3xl rounded-3xl ${first ? "" : "mt-8 break-before-page"}  bg-white p-8 text-slate-900 shadow-sm ring-1 ring-slate-200 print:max-w-none print:p-0 print:shadow-none print:ring-0`}>
      <div className="grid grid-cols-3 gap-4 border-b-2 border-slate-800 pb-3 text-sm"><p>Name: ____________________</p><p>Class: ____________</p><p>Date: ____________</p></div>
      <h1 className="mt-4 text-2xl font-bold">{v.title}{version === "B" ? " (B)" : ""}</h1>
      {v.blocks.map((b, bi) => (
        <section key={bi} className="mt-5 break-inside-avoid-page">
          {b.passage && <div className="mb-3 rounded-xl border border-slate-300 p-4"><h2 className="text-lg font-bold">{b.passage.title || "Read the text."}</h2><PassageText text={b.passage.text} paraClassName="mt-2 whitespace-pre-line leading-relaxed" headingClassName="mt-3 font-bold" /></div>}
          <ol className="space-y-4">{b.questions.map((q) => (
            <li key={q.id} className="break-inside-avoid">
              <p className="font-semibold">{q.n}. {q.stem.replace(/_{3,}/g, "__________")}</p>
              {q.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={q.image.url} alt={q.image.alt} className="mt-1 max-h-60 w-auto" />
              )}
              {q.options.length > 0 && <ul className="mt-1 grid gap-1 ps-5 sm:grid-cols-2">{q.options.map((o) => <li key={o.label}>{o.label}. {o.text}</li>)}</ul>}
              {q.type === "TRUE_FALSE" && <p className="mt-1 ps-5">True ☐ False ☐</p>}
              {q.elements.length > 0 && <><p className="mt-1 ps-5 text-sm italic">Put in order (write 1, 2, 3…):</p><ul className="ps-5">{q.elements.map((e, k) => <li key={k}>___ {e}</li>)}</ul></>}
              {q.left.length > 0 && <div className="mt-1 grid grid-cols-2 gap-4 ps-5"><ol className="list-decimal ps-4">{q.left.map((l, k) => <li key={k}>{l} ____</li>)}</ol><ol className="list-[upper-alpha] ps-4">{q.right.map((r, k) => <li key={k}>{r}</li>)}</ol></div>}
              {q.segments.length > 0 && <p className="mt-1 ps-5">{q.segments.map((s, k) => <span key={k} className="me-1 border-b border-dotted border-slate-500">{s}</span>)}<br /><span className="text-sm italic">Find the mistake and write it correctly: ______________</span></p>}
              {Array.from({ length: q.lines }).map((_, k) => <p key={k} className="mt-3 border-b border-slate-400">&nbsp;</p>)}
            </li>
          ))}</ol>
        </section>
      ))}
      <section className="mt-10 break-before-page border-t-2 border-dashed border-slate-400 pt-4 print:border-0">
        <h2 className="text-xl font-bold">Answer key · {v.title}{version === "B" ? " (B)" : ""}{keyLabel ? <span className="ms-2 text-sm font-normal">({keyLabel})</span> : null}</h2>
        <ol className="mt-2 columns-2 gap-8 text-sm">{v.key.map((k) => <li key={k.n} className="break-inside-avoid">{k.n}. {k.answer}</li>)}</ol>
      </section>
    </article>
  );
}
