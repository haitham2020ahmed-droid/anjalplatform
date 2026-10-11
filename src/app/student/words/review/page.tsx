import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { notebook } from "@/server/student/words";
import { reviewToday } from "@/server/vocabulary/service";
import { wordReviewAction } from "../actions";

export const metadata = { title: "Word review" };

/** Bold the word (and its forms) inside the sentence. */
function Sentence({ text, word }: { text: string; word: string }) {
  const stem = word.length > 4 ? word.slice(0, word.length - 2) : word.replace(/e$/, "");
  const re = new RegExp(`(\\b${stem.replace(/[^a-z'-]/gi, "")}[a-z'-]*)`, "i");
  const parts = text.split(re);
  return <>{parts.map((p, i) => (i % 2 === 1 ? <b key={i} className="text-brand-navy underline decoration-brand-gold decoration-2">{p}</b> : <span key={i}>{p}</span>))}</>;
}

/** 🔁 Today's word review: each word in a sentence (or example vs. not an example), 4 choices. */
export default async function WordReviewPage({ searchParams }: { searchParams: Promise<{ done?: string; wrong?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const today = await reviewToday(repo, actor);
  const [ok, total] = (sp.done ?? "").split("-").map(Number);
  const wrong = (sp.wrong ?? "").split(",").filter(Boolean);
  const meanings = wrong.length ? (await notebook(repo, actor)).filter((w) => wrong.includes(w.word)) : [];
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student/words", label: "My words" }} icon="🔁" title="Word Review" subtitle="Read each sentence, then choose what the word means. Words you know come back later; words you miss come back tomorrow." />
      {sp.done && (
        <div role="status" className="mb-4 rounded-2xl bg-emerald-50 px-5 py-4 text-emerald-900 ring-1 ring-emerald-200">
          <p className="text-lg font-bold">{ok} of {total} correct {ok === total && total > 0 ? "🎉" : ""}</p>
          {meanings.length > 0 && <ul className="mt-2 space-y-1 text-sm">{meanings.map((w) => <li key={w.word}><b>{w.word}</b>{w.definition ? `: ${w.definition}` : ""} <span className="text-emerald-700">(back tomorrow)</span></li>)}</ul>}
        </div>
      )}
      {!today.items.length ? (
        <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{today.reviewedToday ? "You finished today’s review. Come back tomorrow! ✅" : today.notebookSize ? "No words are due today." : "No words yet. Double-click words while you read, or add one to your word journal."}{today.nextDueAt ? ` Next review: ${today.nextDueAt.slice(0, 10)}.` : ""}</p>
      ) : (
        <form action={wordReviewAction} className="space-y-4 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <p className="text-sm text-slate-500">{today.items.length} word{today.items.length === 1 ? "" : "s"} today</p>
          {today.items.map((it, i) => (
            <fieldset key={it.word} className="rounded-xl bg-slate-50 p-4">
              <legend className="font-semibold text-slate-900">{i + 1}. {it.prompt}</legend>
              {it.sentence && <p className="mt-2 rounded-lg bg-white px-3 py-2 text-lg text-slate-900 ring-1 ring-slate-200"><Sentence text={it.sentence} word={it.word} /></p>}
              <div className="mt-2 grid gap-2">{it.choices.map((c) => <label key={c} className="flex items-start gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200"><input type="radio" name={`a.${it.word}`} value={c} required className="mt-1" /> <span>{c}</span></label>)}</div>
            </fieldset>
          ))}
          <button className="rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">Check my answers</button>
        </form>
      )}
    </AppShell>
  );
}
