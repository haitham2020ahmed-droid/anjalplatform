import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { wordList } from "@/server/student/words";
import { fetchWordAction, saveDefinitionAction } from "./actions";

export const metadata = { title: "Dictionary" };

/** 📖 The school's dictionary: meanings students saw, words not found, and the unit vocabulary to define. */
export default async function DictionaryPage({ searchParams }: { searchParams: Promise<{ q?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const v = await wordList(repo, actor, sp.q ?? "");
  const defined = new Set(v.entries.filter((e) => e.source !== "NONE").map((e) => e.word));
  const box = "mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 font-normal";
  const one = v.entries.find((e) => e.word === (sp.q ?? "").toLowerCase().trim());
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} icon="📖" title="Dictionary" subtitle="Students double-click a word to see its meaning (from a free English dictionary, saved here). Write or correct any definition: your school's version is always shown first. Unit vocabulary words are marked ⭐." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <form className="flex gap-2" action="/admin/dictionary"><input name="q" defaultValue={sp.q ?? ""} placeholder="Find a word…" className="flex-1 rounded-lg border border-slate-300 px-3 py-2" /><button className="rounded-lg bg-brand-navy px-4 py-2 font-semibold text-white">Find</button></form>
          {sp.q && !one && <form action={fetchWordAction} className="mt-2"><input type="hidden" name="word" value={sp.q} /><button className="text-sm font-semibold text-brand-teal underline">Look “{sp.q}” up in the dictionary</button></form>}
          <ul className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto">{v.entries.map((e) => (
            <li key={e.word} className="rounded-xl bg-slate-50 p-3 text-sm">
              <a href={`/admin/dictionary?q=${encodeURIComponent(e.word)}`} className="font-bold text-brand-navy hover:underline">{e.isVocab ? "⭐ " : ""}{e.word}</a> {e.phonetic && <span className="text-slate-500">{e.phonetic}</span>} <span className={`ms-1 rounded-full px-2 py-0.5 text-xs ${e.source === "SCHOOL" ? "bg-emerald-100 text-emerald-800" : e.source === "NONE" ? "bg-red-100 text-red-800" : "bg-slate-200 text-slate-700"}`}>{e.source === "SCHOOL" ? "school" : e.source === "NONE" ? "not found" : "dictionary"}</span>
              {e.meanings[0] && <p className="mt-1 text-slate-700"><i>{e.meanings[0].partOfSpeech}</i> — {e.meanings[0].definition}</p>}
            </li>
          ))}</ul>
        </section>
        <section className="space-y-5">
          <form action={saveDefinitionAction} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <h2 className="font-bold text-brand-navy">✏️ Write / Correct a Definition</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-sm font-semibold">Word<input name="word" required defaultValue={one?.word ?? sp.q ?? ""} className={box} /></label>
              <label className="text-sm font-semibold">Part of speech<input name="pos" list="pos" defaultValue={one?.meanings[0]?.partOfSpeech ?? ""} className={box} /></label>
            </div>
            <label className="mt-2 block text-sm font-semibold">Definition (simple English)<textarea name="definition" required rows={2} defaultValue={one?.source === "SCHOOL" ? one.meanings[0]?.definition : ""} className={box} /></label>
            <label className="mt-2 block text-sm font-semibold">Example sentence<input name="example" defaultValue={one?.meanings[0]?.example ?? ""} className={box} /></label>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-sm font-semibold">Synonyms (commas)<input name="synonyms" defaultValue={one?.meanings[0]?.synonyms.join(", ") ?? ""} className={box} /></label>
              <label className="text-sm font-semibold">Antonyms (commas)<input name="antonyms" defaultValue={one?.meanings[0]?.antonyms.join(", ") ?? ""} className={box} /></label>
            </div>
            <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="isVocab" defaultChecked={one?.isVocab} /> Unit vocabulary word ⭐</label>
            <button className="mt-3 rounded-lg bg-brand-navy px-4 py-2 font-semibold text-white">Save</button>
            <datalist id="pos">{["noun", "verb", "adjective", "adverb", "pronoun", "preposition", "conjunction", "interjection", "phrase"].map((p) => <option key={p} value={p} />)}</datalist>
          </form>
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <h2 className="font-bold text-brand-navy">⭐ Unit vocabulary ({v.vocab.length}) · {v.vocab.filter((w) => defined.has(w)).length} with a meaning</h2>
            <p className="mt-1 flex flex-wrap gap-1 text-sm">{v.vocab.map((w) => <a key={w} href={`/admin/dictionary?q=${encodeURIComponent(w)}`} className={`rounded-full px-2 py-0.5 ${defined.has(w) ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900 ring-1 ring-amber-200"}`}>{w}</a>)}</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
