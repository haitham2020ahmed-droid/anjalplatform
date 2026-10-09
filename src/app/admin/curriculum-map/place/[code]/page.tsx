import Link from "next/link";
import { notFound , redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { attachmentNodes } from "@/server/curriculum-map/questions";
import { lexileBands } from "@/server/curriculum-map/lexile";
import { listQuestions } from "@/server/admin/questions";
import { ImportUpload } from "@/app/admin/questions/import/upload-form";
import { CcssNote } from "@/components/ccss-note";

const LV = { ABOVE: "Above Level", ON: "On Level", BELOW: "Below Level" } as const;

/** One place of the Curriculum Map: add one question, or many from a template made for this place. */
export default async function PlacePage({ params }: { params: Promise<{ code: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:edit" });
  // teachers add questions in the Question Bank (it asks where each one goes), not from the map
  if (actor.role === "TEACHER") redirect("/admin/questions/new");
  const me = (await getActor())!.user;
  const code = decodeURIComponent((await params).code).toUpperCase();
  const place = (await attachmentNodes(repo, actor.schoolId!)).find((p) => p.code === code);
  if (!place) return notFound();
  const band = (await lexileBands(repo, actor.schoolId ?? null))[place.grade];
  const lexHint = !place.level || !band ? null : place.level === "BELOW" ? `under ${band.onMin}L` : place.level === "ON" ? `${band.onMin}–${band.onMax}L` : `over ${band.onMax}L`;
  const [pub, draft] = await Promise.all([
    listQuestions(repo, actor, { status: "PUBLISHED", mapCode: code, limit: 100, page: 1 }),
    listQuestions(repo, actor, { status: "DRAFT", mapCode: code, limit: 100, page: 1 }),
  ]);
  const tpl = (f: string, per?: number) => `/api/question-imports/template?format=${f}&place=${code}${per ? `&per=${per}` : ""}`;
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href={`/admin/curriculum-map?grade=${place.grade}`} className="text-brand-teal hover:underline">← Curriculum Map</Link></p>
      <p className="mt-2 text-sm text-slate-500">{place.path.split(" › ").slice(0, -1).join(" › ")}</p>
      <h1 className="text-3xl font-bold text-brand-navy">{place.categoryLabel.replace(/^\d+-\s*/, "")}{place.level ? ` · ${LV[place.level]}` : ""}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <code className="rounded bg-emerald-50 px-2 py-0.5 font-mono text-emerald-800 ring-1 ring-emerald-200">{code}</code>
        <span className="text-slate-600">{pub.total} published · {draft.total} draft</span>
        {lexHint && <span className="rounded bg-sky-50 px-2 py-0.5 text-sky-900 ring-1 ring-sky-200">Lexile for this level (Grade {place.grade}): {lexHint}</span>}
      </p>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-xl font-bold text-brand-navy">➕ One Question</h2>
          <p className="mt-1 text-sm text-slate-600">Opens the question editor already set to this place.</p>
          <Link href={`/admin/questions/new?map=${code}`} className="mt-4 inline-block rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">Write a question</Link>
        </section>
        <section className="rounded-2xl bg-amber-50/60 p-5 ring-1 ring-amber-200">
          <h2 className="text-xl font-bold text-brand-navy">📥 Many Questions</h2>
          <ol className="mt-1 list-decimal space-y-1 ps-5 text-sm text-slate-700">
            <li>Download the template for <b>this place</b>: every row is already set to {code}.</li>
            <li>Write one question per row (empty rows are skipped). Add the Lexile of each question if you have it.</li>
            <li>Upload it here, check the review, then import. The questions go to this place and to the Question Bank.</li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            <a href={tpl("map-xlsx")} className="rounded-lg bg-white px-3 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">⬇ Excel (30 rows)</a>
            <a href={tpl("map-xlsx", 100)} className="rounded-lg bg-white px-3 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">⬇ Excel (100 rows)</a>
            <a href={tpl("map-csv")} className="rounded-lg bg-white px-3 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">⬇ CSV</a>
          </div>
          <div className="mt-4"><ImportUpload target="CURRICULUM" place={code} /></div>
        </section>
      </div>
      <CcssNote className="mt-4" />
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-brand-navy">Questions on This Place</h2>
          <Link href={`/admin/questions?status=PUBLISHED&map=${code}`} className="text-sm font-semibold text-brand-teal underline">Open in the Question Bank (☆ choose / assign)</Link>
        </div>
        {pub.items.length + draft.items.length === 0 ? <p className="mt-2 text-slate-600">No questions yet.</p> : (
          <ol className="mt-3 space-y-2">
            {[...pub.items, ...draft.items].map((q) => (
              <li key={q.id} className="flex items-start justify-between gap-3 rounded-xl bg-white px-4 py-2 ring-1 ring-slate-200">
                <Link href={`/admin/questions/${q.id}`} className="text-slate-900 hover:underline">{q.stem}</Link>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${q.status === "PUBLISHED" ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-600"}`}>{q.status === "PUBLISHED" ? "Published" : "Draft"}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </AppShell>
  );
}
