import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentScreenView } from "@/server/word-study/screener";
import { STRANDS } from "@/server/word-study/strands";
import { ScreenPlayer } from "./screen-player";

export const dynamic = "force-dynamic";
export const metadata = { title: "Word Check" };

const LOOK = {
  MASTERED: { text: "Strong", icon: "🌟", cls: "bg-emerald-50 text-emerald-900 ring-emerald-200" },
  REVIEW: { text: "Getting there", icon: "🌱", cls: "bg-amber-50 text-amber-900 ring-amber-200" },
  RETEACH: { text: "Let's practise", icon: "💪", cls: "bg-rose-50 text-rose-900 ring-rose-200" },
} as const;

/** 🔤 The decoding screener for the student: hear a word, choose its spelling. */
export default async function DecodingPage() {
  const actor = await requireActor({ roles: ["STUDENT"], permission: "practice:take" });
  const me = (await getActor())!.user;
  const v = await studentScreenView(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "My Work" }} icon="🔤" title="Word Check" subtitle="Listen to a word, then choose how it is spelled. Some words are real and some are made up — made-up words show how well you sound out new words!" />
      {(v.state === "INVITED" || v.state === "NONE" || v.state === "IN_PROGRESS") && (
        <div className="space-y-4">
          {v.state !== "IN_PROGRESS" && (
            <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <h2 className="text-lg font-bold text-brand-navy">{v.state === "INVITED" ? (v.reason === "TIER" ? "This word check will help us choose the best practice for you." : "Your teacher asked you to take this word check.") : "Want to check your word skills?"}</h2>
              <ul className="mt-2 list-disc space-y-1 ps-5 text-slate-700">
                <li>Use headphones if you can. Press <b>🔊 Hear it again</b> as many times as you like, or <b>🐢 Slower</b>.</li>
                <li>Choose the spelling of the word you hear. There are 10 words in each part.</li>
                <li>It takes about 10 minutes. Do your best — it is not a test for marks.</li>
              </ul>
            </div>
          )}
          <ScreenPlayer initial={v.question} startLabel={v.state === "INVITED" ? "Start the word check" : "Start"} />
        </div>
      )}
      {v.state === "DONE" && v.result && (
        <div className="space-y-4">
          <p className="rounded-2xl bg-teal-50 px-4 py-3 text-lg text-teal-900 ring-1 ring-teal-200">🎉 Well done! You finished the word check{v.completedAt ? ` on ${new Date(v.completedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}. Your teacher will use it to choose your word practice.</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {STRANDS.filter((st) => v.result!.strands[String(st.n)]).map((st) => {
              const r = v.result!.strands[String(st.n)];
              const look = LOOK[r.status];
              return (
                <li key={st.n} className={`rounded-2xl p-4 ring-1 ${look.cls}`}>
                  <p className="font-bold"><span aria-hidden="true">{look.icon}</span> {st.name}</p>
                  <p className="text-sm">{look.text} · {r.correct} of {r.total} words</p>
                  {r.reteach.length > 0 && <p className="mt-1 text-sm">Practise: {r.reteach.join(", ")}</p>}
                </li>
              );
            })}
          </ul>
          {v.canStart ? <ScreenPlayer initial={null} startLabel="Take the word check again" /> : <p className="text-sm text-slate-600">You can take the word check again in about a month.</p>}
        </div>
      )}
      <Link href="/student" className="mt-6 inline-block font-semibold text-brand-teal">← My Work</Link>
    </AppShell>
  );
}
