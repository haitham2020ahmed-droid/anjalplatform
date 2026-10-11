import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { WordLookup } from "@/components/learn/word-lookup";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { notebook, wordQuiz } from "@/server/student/words";
import { reviewToday, unitWords } from "@/server/vocabulary/service";
import { REVIEW_STEPS } from "@/server/vocabulary/review";
import { journalAction, starWordAction, wordQuizAction } from "./actions";
import { GlossButton } from "./gloss-button";

export const metadata = { title: "My words" };

/** 📒 My words: today's review, unit words to add, my word journal, every word I looked up, and the weekly quiz. */
export default async function WordsPage({ searchParams }: { searchParams: Promise<{ score?: string; wrong?: string; quiz?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [words, quiz, today, units] = await Promise.all([notebook(repo, actor), wordQuiz(repo, actor), reviewToday(repo, actor), unitWords(repo, actor)]);
  const [ok, total] = (sp.score ?? "").split("-").map(Number);
  const box = "mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 font-normal";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "My work" }} icon="📒" title="My Words" subtitle="Double-click a word in any reading to see its meaning: it is saved here. Review a few words each day and they stay with you." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {sp.score && <p role="status" className="mb-4 rounded-2xl bg-emerald-50 px-5 py-4 text-lg font-bold text-emerald-900 ring-1 ring-emerald-200">Quiz: {ok} of {total} correct {ok === total ? "🎉" : ""}{sp.wrong ? <span className="block text-sm font-normal">Practise again: {sp.wrong.split(",").join(", ")}</span> : null}</p>}

      <section className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">🔁 Words due today</h2>
          {today.items.length ? (
            <>
              <p className="mt-1 text-sm text-slate-600">{today.items.length} word{today.items.length === 1 ? "" : "s"} to review: {today.items.map((i) => i.word).join(", ")}</p>
              <a href="/student/words/review" className="mt-3 inline-block rounded-2xl bg-brand-gold px-5 py-2.5 font-bold text-brand-navy shadow">Start today’s review</a>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-600">{today.reviewedToday ? `Done for today: ${today.reviewedToday} word${today.reviewedToday === 1 ? "" : "s"} reviewed. ✅` : "No words are due today."}{today.nextDueAt ? ` Next review: ${today.nextDueAt.slice(0, 10)}.` : ""}</p>
          )}
          <p className="mt-2 text-xs text-slate-400">A word comes back after {REVIEW_STEPS.join(", ")} days. A mistake brings it back tomorrow. Up to 10 words a day.</p>
        </div>
        <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">🔎 Context clue coach</h2>
          <p className="mt-1 text-sm text-slate-600">Learn to find a word’s meaning from the words around it. The coach picks the kind of clue you miss most.</p>
          <a href="/student/words/clues" className="mt-3 inline-block rounded-2xl bg-brand-navy px-5 py-2.5 font-bold text-white">Open the coach</a>
        </div>
      </section>

      {quiz.length > 0 && (sp.quiz === "1" ? (
        <form action={wordQuizAction} className="mb-6 space-y-4 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-xl font-bold text-brand-navy">🧠 Weekly Word Quiz</h2>
          {quiz.map((q, i) => (
            <fieldset key={q.word} className="rounded-xl bg-slate-50 p-3">
              <legend className="font-semibold text-slate-900">{i + 1}. Which word means: “{q.definition}”</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{q.choices.map((c) => <label key={c} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200"><input type="radio" name={`q.${q.word}`} value={c} required /> {c}</label>)}</div>
            </fieldset>
          ))}
          <button className="rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">Check my answers</button>
        </form>
      ) : <a href="/student/words?quiz=1" className="mb-6 inline-block rounded-2xl bg-brand-gold px-5 py-3 font-bold text-brand-navy shadow">🧠 Take this week’s word quiz ({quiz.length} questions)</a>)}

      <section id="journal" className="mb-6 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
        <h2 className="text-lg font-bold text-brand-navy">✍️ My word journal</h2>
        <p className="mt-1 text-sm text-slate-600">Add a word with your own sentence, and a sentence that is NOT an example of the word. Your teacher can read your journal.</p>
        <form action={journalAction} className="mt-3 grid gap-2 sm:grid-cols-3">
          <label className="text-sm font-semibold">Word<input name="word" required maxLength={40} className={box} /></label>
          <label className="text-sm font-semibold">My sentence (uses the word)<input name="myExample" required maxLength={300} className={box} /></label>
          <label className="text-sm font-semibold">Not an example (optional)<input name="notExample" maxLength={300} className={box} /></label>
          <div className="sm:col-span-3"><button className="rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white">Add to my journal</button></div>
        </form>
      </section>

      {units.length > 0 && (
        <section id="unit-words" className="mb-6 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <h2 className="text-lg font-bold text-brand-navy">⭐ Unit words</h2>
          <p className="mt-1 text-sm text-slate-600">Tap ⭐ to add a unit word to My Words and your review.</p>
          <div className="mt-2 space-y-2">{units.map((u) => (
            <div key={u.unit}>
              <p className="text-sm font-semibold text-slate-700">{u.unit}</p>
              <div className="mt-1 flex flex-wrap gap-1">{u.words.map((w) => w.inNotebook
                ? <span key={w.word} className="rounded-full bg-emerald-50 px-2 py-0.5 text-sm text-emerald-800">✓ {w.word}</span>
                : <form key={w.word} action={starWordAction}><input type="hidden" name="word" value={w.word} /><button className="rounded-full bg-amber-50 px-2 py-0.5 text-sm text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100">⭐ {w.word}</button></form>)}</div>
            </div>
          ))}</div>
        </section>
      )}

      {!words.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No words yet. While you read, double-click a word you do not know.</p> : (
        <WordLookup hint={false}>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {words.map((w) => (
              <li key={w.word} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-lg font-bold text-brand-navy">{w.isVocab ? "⭐ " : ""}{w.word} {w.known && <span title="You know this word" className="text-sm">✅</span>}</p>
                {w.partOfSpeech && <p className="text-xs italic text-slate-500">{w.partOfSpeech}</p>}
                <p className="mt-1 text-sm text-slate-700">{w.definition ?? "Double-click the word to look it up again."}</p>
                {w.contextSentence && <p className="mt-1 text-sm text-slate-600">“{w.contextSentence}”</p>}
                {w.arabicGloss && <GlossButton gloss={w.arabicGloss} />}
                {w.myExample && <p className="mt-2 rounded-lg bg-emerald-50 px-2 py-1 text-sm text-emerald-900"><b>My sentence:</b> {w.myExample}</p>}
                {w.notExample && <p className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-sm text-red-900"><b>Not an example:</b> {w.notExample}</p>}
                <p className="mt-1 text-xs text-slate-400">{w.lookups ? `looked up ${w.lookups}× · ` : ""}{w.nextReviewAt ? `next review ${w.nextReviewAt.slice(0, 10)}` : w.lastAt.slice(0, 10)}</p>
              </li>
            ))}
          </ul>
        </WordLookup>
      )}
    </AppShell>
  );
}
