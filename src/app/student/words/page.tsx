import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PreviewFrame } from "@/components/student/preview-frame";
import { ProgramTabs } from "@/components/student/program-tabs";
import { EmptyState } from "@/components/ui-kit";
import { WordLookup } from "@/components/learn/word-lookup";
import { WordsFilter } from "@/components/learn/words-filter";
import { WordCardView, WordPractice } from "@/components/learn/word-cards";
import type { Actor } from "@/server/auth/rbac";
import { repo, requireActor } from "@/server/auth/next";
import { studentPage } from "@/server/auth/student-page";
import { practiceQuestions, studentWords } from "@/server/learn/words";
import { notebook, wordQuiz } from "@/server/student/words";
import { reviewToday, unitWords } from "@/server/vocabulary/service";
import { REVIEW_STEPS } from "@/server/vocabulary/review";
import { getT } from "@/i18n/server";
import { journalAction, starWordAction, wordQuizAction } from "./actions";
import { GlossButton } from "./gloss-button";

export const metadata = { title: "My Words" };

type Search = { preview?: string; tab?: string; grade?: string; unit?: string; sel?: string; score?: string; wrong?: string; quiz?: string; msg?: string };

/**
 * 📒 My Words — the ONE home of vocabulary (owner's request; Learn links here, the old Learn → Words opens this page):
 *  - "Curriculum words" (default): every Curriculum Map word of Grades 4, 5 and 6, Grade → Unit → Selection (my own
 *    grade first, any grade can be browsed), each with its explanation (🔊, meaning, example, Arabic on tap,
 *    synonyms / antonyms, word family, a quick check) and "Practise these words".
 *  - "Words I saved" (?tab=saved): today's review, the context clue coach, the weekly quiz, my word journal, unit words
 *    to star and every word I looked up while reading.
 */
export default async function WordsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { actor, me, preview } = await studentPage(sp.preview, () => requireActor({ roles: ["STUDENT"] }));
  const { t } = await getT();
  // the saved words' own links and messages (quiz, journal, ⭐) land on their tab
  const saved = sp.tab === "saved" || Boolean(sp.score || sp.quiz || sp.msg);
  const pv = preview ? `preview=${encodeURIComponent(preview.studentId)}` : "";
  return (
    <AppShell name={String(me.displayName)}><PreviewFrame preview={preview}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="📒" title="My Words" subtitle={t("The words of your Curriculum Map and the words you saved while reading.")} />
      <ProgramTabs label="My Words" tabs={[
        { href: `/student/words${pv ? `?${pv}` : ""}`, label: "Curriculum words", icon: "📗", on: !saved },
        { href: `/student/words?tab=saved${pv ? `&${pv}` : ""}`, label: "Words I saved", icon: "📒", on: saved },
      ]} />
      {saved ? <SavedWords actor={actor} sp={sp} /> : <CurriculumWords actor={actor} sp={sp} preview={preview} t={t} />}
    </PreviewFrame></AppShell>
  );
}

/** 📗 The Curriculum Map words (was Learn → Words): one selection per request. */
async function CurriculumWords({ actor, sp, preview, t }: { actor: Actor; sp: Search; preview: { studentId: string } | null; t: Awaited<ReturnType<typeof getT>>["t"] }) {
  const v = await studentWords(repo, actor, { grade: sp.grade, unit: sp.unit, sel: sp.sel });
  const view = v.view;
  return (
    <>
      <p className="mb-4 text-slate-600">{t("The vocabulary of your Curriculum Map: listen to each word, see what it means and try it.")}</p>
      <WordsFilter base="/student/words" grades={v.grades} grade={v.grade} units={v.units} unit={v.unit} selections={v.selections} sel={view?.sel.key ?? null} extra={preview ? { preview: preview.studentId } : {}} />
      {view ? (
        <section aria-labelledby="sel-title">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="sel-title" className="text-xl text-ink">{t("Grade {g} · Unit {u}", { g: view.sel.grade, u: view.sel.unit })} · <span lang="en">{view.sel.name}</span></h2>
            <WordPractice sel={view.sel.key} questions={practiceQuestions(view)} preview={Boolean(preview)} answers={preview ? Object.fromEntries(view.words.filter((w) => w.card).map((w) => [w.word, w.card!.check.answer])) : undefined} />
          </div>
          {view.words.length ? (
            <ul className="grid gap-3 md:grid-cols-2">
              {view.words.map((w) => <li key={w.key}><WordCardView w={{ key: w.key, word: w.word, card: w.card, partial: w.partial, source: w.source }} /></li>)}
            </ul>
          ) : <EmptyState compact icon="📗" title="No words for this selection yet." />}
        </section>
      ) : <EmptyState compact icon="📗" title="Choose a selection to see its words." />}
    </>
  );
}

/** 📒 Words I saved: today's review, unit words to add, my word journal, every word I looked up, and the weekly quiz. */
async function SavedWords({ actor, sp }: { actor: Actor; sp: Search }) {
  const [words, quiz, today, units] = await Promise.all([notebook(repo, actor), wordQuiz(repo, actor), reviewToday(repo, actor), unitWords(repo, actor)]);
  const [ok, total] = (sp.score ?? "").split("-").map(Number);
  const box = "mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 font-normal";
  return (
    <>
      <p className="mb-4 text-slate-600">Double-click a word in any reading to see its meaning: it is saved here. Review a few words each day and they stay with you.</p>
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
      ) : <a href="/student/words?tab=saved&quiz=1" className="mb-6 inline-block rounded-2xl bg-brand-gold px-5 py-3 font-bold text-brand-navy shadow">🧠 Take this week’s word quiz ({quiz.length} questions)</a>)}

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
                <p className="mt-1 text-xs text-slate-600">{w.lookups ? `looked up ${w.lookups}× · ` : ""}{w.nextReviewAt ? `next review ${w.nextReviewAt.slice(0, 10)}` : w.lastAt.slice(0, 10)}</p>
              </li>
            ))}
          </ul>
        </WordLookup>
      )}
    </>
  );
}
