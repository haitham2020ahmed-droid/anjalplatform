import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { articleDetail, LEVEL_NAMES } from "@/server/readmaster/service";
import { lexileBands, levelForLexile } from "@/server/curriculum-map/lexile";
import { addQuestionAction, saveVersionAction, setStatusAction } from "../actions";

/** One ReadMaster article: its three versions (text + Lexile), their questions, publishing, results. */
export default async function ReadMasterArticlePage({ params, searchParams }: { params: Promise<{ articleId: string }>; searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:read" });
  const me = (await getActor())!.user;
  const { articleId } = await params;
  const sp = await searchParams;
  const a = await articleDetail(repo, actor, articleId);
  const band = (await lexileBands(repo, actor.schoolId ?? null))[a.grade];
  const box = "rounded-lg border border-slate-300 px-3 py-2";
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href={`/admin/readmaster?grade=${a.grade}`} className="text-brand-teal hover:underline">← ReadMaster</Link></p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-3xl font-bold text-brand-navy">{a.title}</h1><p className="text-slate-600">Grade {a.grade} · {a.code}{a.skill ? ` · ${a.skill}` : ""}</p></div>
        <form action={setStatusAction}><input type="hidden" name="articleId" value={a.id} /><input type="hidden" name="status" value={a.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED"} />
          <button className={`rounded-xl px-4 py-2 font-semibold ${a.status === "PUBLISHED" ? "text-brand-navy ring-1 ring-slate-300" : "bg-brand-navy text-white hover:bg-brand-purple"}`}>{a.status === "PUBLISHED" ? "Move back to draft" : "Publish to students"}</button>
        </form>
      </div>
      {sp.msg && <p role="status" className="mt-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {(["BELOW", "ON", "ABOVE"] as const).map((l) => {
          const v = a.versionsFull.find((x) => x.level === l);
          const off = v && levelForLexile(band, v.lexile) !== l;
          return (
            <section key={l} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <h2 className="text-lg font-bold text-brand-navy">{LEVEL_NAMES[l]}</h2>
              <form action={saveVersionAction} className="mt-2 space-y-2 text-sm">
                <input type="hidden" name="articleId" value={a.id} /><input type="hidden" name="level" value={l} />
                <label className="flex items-center gap-2">Lexile<input type="number" name="lexile" min={0} max={2000} required defaultValue={v?.lexile ?? (l === "BELOW" ? band.onMin - 100 : l === "ON" ? Math.round((band.onMin + band.onMax) / 2) : band.onMax + 80)} className={`${box} w-28`} />L</label>
                {off && <p className="text-xs font-semibold text-amber-800">This Lexile is outside the {LEVEL_NAMES[l]} band for Grade {a.grade}.</p>}
                <textarea name="body" required rows={10} defaultValue={v?.body ?? ""} style={{ width: "100%" }} placeholder={`The article written for ${LEVEL_NAMES[l]} readers…`} className={box} />
                <button className="rounded-lg bg-brand-navy px-3 py-1.5 font-semibold text-white">{v ? "Save text" : "Add this version"}</button>
                {v && <span className="ms-2 text-xs text-slate-500">{v.wordCount} words</span>}
              </form>
              {v && (
                <>
                  <h3 className="mt-4 font-semibold text-slate-800">Questions ({v.questions.length})</h3>
                  <ol className="mt-1 list-decimal space-y-1 ps-5 text-sm">{v.questions.map((q) => <li key={q.id}><Link href={`/admin/questions/${q.id}`} className="hover:underline">{q.stem}</Link>{q.status !== "PUBLISHED" && <span className="ms-1 text-xs text-amber-800">({q.status.toLowerCase()})</span>}</li>)}</ol>
                  <details className="mt-2 text-sm">
                    <summary className="cursor-pointer font-semibold text-brand-teal">➕ Add a question</summary>
                    <form action={addQuestionAction} className="mt-2 space-y-2">
                      <input type="hidden" name="articleId" value={a.id} /><input type="hidden" name="versionId" value={v.id} />
                      <textarea name="stem" required rows={2} style={{ width: "100%" }} placeholder="Question" className={box} />
                      {["A", "B", "C", "D"].map((o) => <input key={o} name={`opt${o}`} required={o < "C"} placeholder={`Option ${o}${o > "B" ? " (optional)" : ""}`} style={{ width: "100%" }} className={box} />)}
                      <label className="flex items-center gap-2">Correct<select name="correct" className={box}>{["A", "B", "C", "D"].map((o) => <option key={o}>{o}</option>)}</select></label>
                      <input name="why" placeholder="Why it is correct" style={{ width: "100%" }} className={box} />
                      <button className="rounded-lg bg-brand-navy px-3 py-1.5 font-semibold text-white">Add</button>
                    </form>
                  </details>
                </>
              )}
            </section>
          );
        })}
      </div>
      <section className="mt-8">
        <h2 className="text-xl font-bold text-brand-navy">Results</h2>
        {a.results.length === 0 ? <p className="mt-2 text-slate-600">No student has read it yet.</p> : (
          <div className="mt-2 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-slate-500"><th className="p-3">Student</th><th>Version read</th><th>Score</th><th>Lexile</th><th>Date</th></tr></thead>
              <tbody>{a.results.map((r, i) => <tr key={i} className="border-b last:border-0"><td className="p-3 font-medium">{r.student}</td><td>{LEVEL_NAMES[r.level]}</td><td className="tabular-nums">{r.correct}/{r.total}</td><td className={`tabular-nums ${r.lexileAfter > r.lexileBefore ? "text-emerald-700" : r.lexileAfter < r.lexileBefore ? "text-red-700" : ""}`}>{r.lexileBefore}L → {r.lexileAfter}L</td><td>{r.at}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
