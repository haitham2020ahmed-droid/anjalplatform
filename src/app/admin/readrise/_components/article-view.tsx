/** 🚀 ReadRise article review (admin and teacher): 12 versions side by side, key words / questions / prompt per band. */
import type { ArticleDetail } from "@/server/readrise/library";
import { BAND_RANGE, BANDS } from "@/server/readrise/import";
import { deleteReadRiseAction, setReadRiseHiddenAction, setReadRiseLexileAction, setReadRiseStatusAction } from "../actions";
import { btn, btnGhost, RR_NOTE, SourcePill, StatusPill } from "./ui";
import { RichInline } from "@/components/rich-inline";

const BAND_STYLE = {
  LOW: { head: "bg-orange-50 text-orange-900", ring: "ring-orange-200" },
  MID: { head: "bg-sky-50 text-sky-900", ring: "ring-sky-200" },
  HIGH: { head: "bg-emerald-50 text-emerald-900", ring: "ring-emerald-200" },
} as const;
const bandOf = (l: number) => (l <= 600 ? "LOW" : l <= 1000 ? "MID" : "HIGH") as keyof typeof BAND_STYLE;
const SKILL_NAME: Record<string, string> = {
  "central-idea": "Central idea", detail: "Detail", inference: "Inference", vocabulary: "Vocabulary", "text-structure": "Text structure",
  "author-purpose": "Author's purpose", "cause-effect": "Cause and effect", sequence: "Sequence", compare: "Compare",
};
export const skillName = (k: string) => SKILL_NAME[k] ?? k;

export function ArticleActions({ a, base }: { a: ArticleDetail; base: string }) {
  return (
    <>
      <a href={`/api/readrise/articles/${a.id}`} className={btnGhost}>⬇ JSON</a>
      {a.canHide && (
        <form action={setReadRiseHiddenAction}>
          <input type="hidden" name="id" value={a.id} /><input type="hidden" name="hide" value={a.hidden ? "0" : "1"} />
          <button className={btnGhost}>{a.hidden ? "👁 Show for our school" : "🙈 Hide for our school"}</button>
        </form>
      )}
      {a.canPublish && (
        <form action={setReadRiseStatusAction}>
          <input type="hidden" name="id" value={a.id} /><input type="hidden" name="base" value={base} />
          <input type="hidden" name="status" value={a.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED"} />
          <button className={a.status === "PUBLISHED" ? btnGhost : btn}>{a.status === "PUBLISHED" ? "↩ Unpublish" : "✅ Publish to students"}</button>
        </form>
      )}
    </>
  );
}

export function ArticleView({ a, base }: { a: ArticleDetail; base: string }) {
  const warnings = a.versions.filter((v) => !v.levelOk).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusPill status={a.status} />
        <SourcePill source={a.source} hidden={a.hidden} />
        <span className="rounded-full bg-white px-3 py-0.5 font-semibold ring-1 ring-slate-200">{a.code}</span>
        <span className="rounded-full bg-white px-3 py-0.5 font-semibold ring-1 ring-slate-200">{a.topic}</span>
        <span className={`rounded-full px-3 py-0.5 font-semibold ring-1 ${warnings ? "bg-amber-50 text-amber-900 ring-amber-300" : "bg-teal-50 text-teal-900 ring-teal-200"}`}>{warnings ? `⚠ ${warnings} version${warnings === 1 ? "" : "s"} off level` : "✓ every version near its level"}</span>
      </div>
      {a.status !== "PUBLISHED" && a.canEdit && !a.canPublish && (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">This article is a draft. Publishing needs the publish permission: a school admin reviews and publishes it.</p>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</p><p className="mt-1 text-slate-800">{a.summary || "—"}</p></div>
        <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Poll (before and after reading)</p><p className="mt-1 text-slate-800">“{a.poll}”</p></div>
      </div>

      <section aria-labelledby="versions-h">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="versions-h" className="text-lg font-semibold text-brand-navy">📚 12 versions side by side</h2>
          <p className="text-xs text-slate-500">{RR_NOTE} Scroll sideways to compare.</p>
        </div>
        <div className="mt-3 overflow-x-auto rounded-2xl bg-white ring-1 ring-slate-200">
          <table className="w-full min-w-[44rem] text-center text-sm">
            <thead><tr className="border-b text-xs text-slate-500"><th className="p-2 text-left">Version</th>{a.versions.map((v) => <th key={v.id} className="p-2 tabular-nums">{v.level}</th>)}</tr></thead>
            <tbody>
              <tr className="border-b"><th className="p-2 text-left text-xs font-semibold text-slate-600">Estimated level</th>{a.versions.map((v) => <td key={v.id} className={`p-2 tabular-nums font-semibold ${v.levelOk ? "text-teal-800" : "text-amber-800"}`}>{v.levelOk ? "✓" : "⚠"} {v.estLevel}</td>)}</tr>
              <tr className="border-b"><th className="p-2 text-left text-xs font-semibold text-slate-600">Words (target)</th>{a.versions.map((v) => { const ok = v.wordCount >= Math.round(v.target.min * 0.85) && v.wordCount <= Math.round(v.target.max * 1.2); return <td key={v.id} className={`p-2 tabular-nums ${ok ? "" : "font-semibold text-amber-800"}`}>{v.wordCount}<span className="block text-[10px] text-slate-400">{v.target.min}–{v.target.max}</span></td>; })}</tr>
              <tr><th className="p-2 text-left text-xs font-semibold text-slate-600">Official Lexile</th>{a.versions.map((v) => <td key={v.id} className="p-2 tabular-nums text-slate-600">{v.officialLexile === null ? "—" : `${v.officialLexile}L`}</td>)}</tr>
            </tbody>
          </table>
        </div>
        <ol className="mt-3 flex snap-x gap-3 overflow-x-auto pb-3">
          {a.versions.map((v) => {
            const b = bandOf(v.level);
            return (
              <li key={v.id} className={`w-80 shrink-0 snap-start overflow-hidden rounded-2xl bg-white ring-2 ${BAND_STYLE[b].ring}`}>
                <div className={`flex items-center justify-between gap-2 px-4 py-2 ${BAND_STYLE[b].head}`}>
                  <span className="text-lg font-bold tabular-nums">{v.level}</span>
                  <span className="text-xs font-semibold">{b} · est. {v.estLevel} {v.levelOk ? "✓" : "⚠"} · {v.wordCount} words</span>
                </div>
                <div className="p-4">
                  <p className="font-semibold text-brand-navy">{v.title}</p>
                  <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-line rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-800">{v.body}</div>
                  {!v.levelOk && <p className="mt-2 text-xs font-semibold text-amber-800">{v.estLevel > v.level ? "Reads harder than the target: shorter sentences, simpler words." : "Reads easier than the target: longer sentences, richer words."}</p>}
                  {a.canEdit ? (
                    <form action={setReadRiseLexileAction} className="mt-3 flex items-center gap-2 text-xs">
                      <input type="hidden" name="id" value={a.id} /><input type="hidden" name="versionId" value={v.id} /><input type="hidden" name="base" value={base} />
                      <label className="flex items-center gap-1 font-semibold text-slate-600">Official Lexile
                        <input name="officialLexile" inputMode="numeric" defaultValue={v.officialLexile ?? ""} placeholder="—" className="w-20 rounded-lg border border-slate-300 px-2 py-1" />L
                      </label>
                      <button className="rounded-lg bg-white px-2 py-1 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Save</button>
                    </form>
                  ) : v.officialLexile !== null && <p className="mt-3 text-xs text-slate-600">Official Lexile: {v.officialLexile}L</p>}
                </div>
              </li>
            );
          })}
        </ol>
        {a.canEdit && <p className="text-xs text-slate-500">Official Lexile: only a value from a licensed Lexile analyzer. Leave it empty otherwise.</p>}
      </section>

      <section aria-labelledby="bands-h" className="space-y-4">
        <h2 id="bands-h" className="text-lg font-semibold text-brand-navy">🧩 Key words, questions and prompt per band</h2>
        {BANDS.map((b, i) => {
          const d = a.bands[b];
          return (
            <details key={b} open={i === 0} className={`overflow-hidden rounded-2xl bg-white ring-2 ${BAND_STYLE[b].ring}`}>
              <summary className={`cursor-pointer px-4 py-3 font-bold ${BAND_STYLE[b].head}`}>{b} band · versions {BAND_RANGE[b]} <span className="text-sm font-semibold opacity-80">· {d.keyWords.length} key words · {d.questions.length} questions</span></summary>
              <div className="grid gap-5 p-4 lg:grid-cols-[18rem_1fr]">
                <div>
                  <h3 className="font-semibold text-slate-800">Key words</h3>
                  <ul className="mt-2 space-y-2 text-sm">
                    {d.keyWords.map((k) => <li key={k.word} className="rounded-xl bg-slate-50 p-2"><b className="text-brand-navy">{k.word}</b>{k.partOfSpeech ? <i className="text-slate-500"> ({k.partOfSpeech})</i> : null}<span className="block text-slate-700">{k.definition}</span><span className="block text-xs italic text-slate-500">“{k.example}”</span></li>)}
                  </ul>
                  <h3 className="mt-4 font-semibold text-slate-800">Written answer</h3>
                  <p className="mt-1 rounded-xl bg-amber-50 p-3 text-sm text-slate-800 ring-1 ring-amber-200">{d.prompt || "—"}</p>
                  {d.checklist.length > 0 && <ul className="mt-2 list-disc ps-5 text-xs text-slate-600">{d.checklist.map((c) => <li key={c}>{c}</li>)}</ul>}
                  {d.modelAnswer ? (
                    <><h3 className="mt-4 font-semibold text-slate-800">💡 Model answer (students see this after they submit theirs)</h3>
                    <p className="mt-1 whitespace-pre-line rounded-xl bg-indigo-50 p-3 text-sm text-slate-800 ring-1 ring-indigo-200">{d.modelAnswer}</p></>
                  ) : (
                    <p className="mt-3 text-xs text-slate-400">No model answer yet.</p>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">Questions</h3>
                  <ol className="mt-2 space-y-3 text-sm">
                    {d.questions.map((q) => (
                      <li key={q.id} className="rounded-xl ring-1 ring-slate-200 p-3">
                        <p className="font-semibold text-slate-900">{q.number}. <RichInline text={q.stem} /> <span className="ms-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{skillName(q.skill)}</span></p>
                        <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                          {q.options.map((o, j) => { const L = "ABCD"[j]; const ok = L === q.answer; return <li key={L} className={`rounded-lg px-2 py-1 ${ok ? "bg-teal-50 font-semibold text-teal-900 ring-1 ring-teal-200" : "text-slate-700"}`}>{L}. <RichInline text={o} />{ok ? " ✓" : ""}</li>; })}
                        </ul>
                        {q.rationale?.[q.answer] && <p className="mt-1 text-xs text-slate-500">Why: <RichInline text={q.rationale[q.answer]} /></p>}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </details>
          );
        })}
      </section>

      {a.canEdit && a.source === "SCHOOL" && (
        <details className="rounded-2xl bg-white p-4 ring-1 ring-red-200">
          <summary className="cursor-pointer font-semibold text-red-800">🗑 Delete this article</summary>
          <form action={deleteReadRiseAction} className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <input type="hidden" name="id" value={a.id} /><input type="hidden" name="base" value={base} />
            <p className="text-slate-600">It disappears from the library and from class lists. Students' past results stay.</p>
            <button className="rounded-xl bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800">Delete</button>
          </form>
        </details>
      )}
    </div>
  );
}
