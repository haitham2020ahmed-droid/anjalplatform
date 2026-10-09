import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { WordLookup } from "@/components/learn/word-lookup";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { notebook, wordQuiz } from "@/server/student/words";
import { wordQuizAction } from "./actions";

export const metadata = { title: "My words" };

/** 📒 My word notebook: every word I looked up, and a short quiz each week. */
export default async function WordsPage({ searchParams }: { searchParams: Promise<{ score?: string; wrong?: string; quiz?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [words, quiz] = await Promise.all([notebook(repo, actor), wordQuiz(repo, actor)]);
  const [ok, total] = (sp.score ?? "").split("-").map(Number);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "My work" }} icon="📒" title="My words" subtitle="Double-click a word in any reading to see its meaning: it is saved here. Learn them with the weekly quiz." />
      {sp.score && <p role="status" className="mb-4 rounded-2xl bg-emerald-50 px-5 py-4 text-lg font-bold text-emerald-900 ring-1 ring-emerald-200">Quiz: {ok} of {total} correct {ok === total ? "🎉" : ""}{sp.wrong ? <span className="block text-sm font-normal">Practise again: {sp.wrong.split(",").join(", ")}</span> : null}</p>}
      {quiz.length > 0 && (sp.quiz === "1" ? (
        <form action={wordQuizAction} className="mb-6 space-y-4 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-xl font-bold text-brand-navy">🧠 Weekly word quiz</h2>
          {quiz.map((q, i) => (
            <fieldset key={q.word} className="rounded-xl bg-slate-50 p-3">
              <legend className="font-semibold text-slate-900">{i + 1}. Which word means: “{q.definition}”</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{q.choices.map((c) => <label key={c} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200"><input type="radio" name={`q.${q.word}`} value={c} required /> {c}</label>)}</div>
            </fieldset>
          ))}
          <button className="rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">Check my answers</button>
        </form>
      ) : <a href="/student/words?quiz=1" className="mb-6 inline-block rounded-2xl bg-brand-gold px-5 py-3 font-bold text-brand-navy shadow">🧠 Take this week’s word quiz ({quiz.length} questions)</a>)}
      {!words.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No words yet. While you read, double-click a word you do not know.</p> : (
        <WordLookup hint={false}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {words.map((w) => (
              <li key={w.word} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-lg font-bold text-brand-navy">{w.word} {w.known && <span title="You know this word" className="text-sm">✅</span>}</p>
                {w.partOfSpeech && <p className="text-xs italic text-slate-500">{w.partOfSpeech}</p>}
                <p className="mt-1 text-sm text-slate-700">{w.definition ?? "Double-click the word to look it up again."}</p>
                <p className="mt-1 text-xs text-slate-400">looked up {w.lookups}× · {w.lastAt.slice(0, 10)}</p>
              </li>
            ))}
          </ul>
        </WordLookup>
      )}
    </AppShell>
  );
}
