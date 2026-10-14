"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/i18n/client";
import type { LLevel } from "@/lib/learn/format";
import { openLessonAction, submitChecksAction } from "@/app/student/learn/actions";
import { RichText, plain } from "./rich-text";
import { speak, stopSpeaking } from "./speak";

type Step =
  | { type: "slide"; kicker: string; title: string; text: string; picture?: string }
  | { type: "proof"; title: string; text: string }
  | { type: "example" }
  | { type: "together" }
  | { type: "evidence" }
  | { type: "check"; n: number }
  | { type: "end" };

const card = "rounded-3xl bg-surface p-5 shadow-card ring-1 ring-line sm:p-6";
const btn = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 font-semibold transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-45";
const primary = `${btn} bg-brand-navy text-white hover:opacity-95`;
const ghost = `${btn} bg-surface text-ink ring-1 ring-line hover:ring-brand-teal`;
const passage = "rounded-2xl bg-surface-2 px-4 py-3 ring-1 ring-line";
const HL_MAIN = "bg-[color-mix(in_oklab,var(--lr-accent)_38%,transparent)]";
const HL_DET = "bg-[color-mix(in_oklab,var(--lr-teal)_26%,transparent)]";
const OK = "bg-emerald-50 text-emerald-900 ring-emerald-300";
const NO = "bg-rose-50 text-rose-900 ring-rose-300";

/** The prototype's umbrella picture (main idea over its details), in the platform's colours. */
function Umbrella() {
  return (
    <div className="my-2 flex justify-center" aria-hidden="true">
      <svg width="230" height="150" viewBox="0 0 230 150">
        <path d="M15 70 Q115 -20 215 70 Z" fill="var(--lr-accent)" />
        <path d="M115 70 V125 q0 14 -14 14" stroke="var(--lr-ink)" strokeWidth="5" fill="none" strokeLinecap="round" />
        <rect x="30" y="92" width="44" height="22" rx="8" fill="var(--lr-teal)" /><rect x="156" y="92" width="44" height="22" rx="8" fill="var(--lr-teal)" />
        <text x="115" y="50" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--lr-on-accent)">MAIN IDEA</text>
        <text x="52" y="107" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">detail</text>
        <text x="178" y="107" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">detail</text>
      </svg>
    </div>
  );
}

/**
 * 📘 The Learn lesson player — the prototype's flow and look: teaching slides (🔊 Listen) → Prove it from the text →
 * a worked example (Show me the details highlights each sentence's role) → Try together (a hint on a wrong answer; it
 * must be right to go on) → Point to the proof (tap N sentences) → 3 checks → the result: 2 or more right = "Great work"
 * + Practise in My Work; fewer = "another way" (the again explanation) and the checks again.
 * `mode = "preview"`: the teacher sees exactly the same, nothing is saved. The level is never shown.
 */
export function LessonPlayer({ code, title, content, mode = "student", practiceHref = "/student/work" }: { code: string; title: string; content: LLevel; mode?: "student" | "preview"; practiceHref?: string }) {
  const t = useT();
  const steps = useMemo<Step[]>(() => [
    ...content.slides.map((s, k) => ({ type: "slide" as const, kicker: k === 0 ? "Let’s learn" : k === content.slides.length - 1 ? "How to do it" : "Picture it", title: s.title, text: s.text, picture: (s as { picture?: string }).picture })),
    { type: "proof", title: content.proof.title, text: content.proof.text },
    { type: "example" }, { type: "together" }, { type: "evidence" },
    ...content.checks.map((_, n) => ({ type: "check" as const, n })), { type: "end" },
  ], [content]);
  const [i, setI] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>(content.checks.map(() => null));
  const [together, setTogether] = useState<{ wrong: number[]; right: boolean }>({ wrong: [], right: false });
  const [ev, setEv] = useState<{ picked: number[]; flash: number | null; msg: "wrong" | null; done: boolean }>({ picked: [], flash: null, msg: null, done: false });
  const [shown, setShown] = useState(false);
  const [again, setAgain] = useState(false);
  const [usedAgain, setUsedAgain] = useState(false);
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(Date.now());
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => { if (mode === "student") void openLessonAction(code).catch(() => undefined); }, [code, mode]);
  useEffect(() => () => stopSpeaking(), []);

  const step = steps[i];
  const firstCheck = steps.findIndex((s) => s.type === "check");
  const go = (n: number) => { stopSpeaking(); setShown(false); setI(Math.max(0, Math.min(steps.length - 1, n))); top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  // the end: the checks are marked on the server (student) or here (preview)
  useEffect(() => {
    if (step?.type !== "end" || result || busy) return;
    const local = content.checks.reduce((n, q, k) => n + (picks[k] === q.answer ? 1 : 0), 0);
    if (mode === "preview") { setResult({ score: local, passed: local >= 2 }); return; }
    setBusy(true);
    submitChecksAction(code, picks.map((p) => (p === null ? -1 : p)), usedAgain, Math.round((Date.now() - started.current) / 1000))
      .then((r) => { if (r.ok) { setResult({ score: r.data.score, passed: r.data.passed }); if (r.data.rapid) setError(t("Take your time 😊 there's no rush — read the question carefully")); } else { setError(r.error); setResult({ score: local, passed: local >= 2 }); } })
      .catch(() => setResult({ score: local, passed: local >= 2 }))
      .finally(() => setBusy(false));
  }, [step, result, busy, mode, code, picks, usedAgain, content.checks, t]);

  const restart = () => { setPicks(content.checks.map(() => null)); setTogether({ wrong: [], right: false }); setEv({ picked: [], flash: null, msg: null, done: false }); setResult(null); setAgain(false); started.current = Date.now(); go(0); };
  const retryChecks = () => { setPicks(content.checks.map(() => null)); setResult(null); setAgain(false); go(firstCheck); };

  const listenText = (): string => {
    if (again) return [content.again.title, plain(content.again.text), plain(content.again.example)].join(". ");
    switch (step.type) {
      case "slide": case "proof": return `${step.title}. ${plain(step.text)}`;
      case "example": return `${content.example.sentences.map((x) => x.t).join(" ")} ${shown ? plain(content.example.explain) : ""}`;
      case "together": return `${content.together.passage} ${content.together.stem} ${content.together.options.join(". ")}`;
      case "evidence": return `${content.evidence.stem} ${content.evidence.sentences.join(" ")}`;
      case "check": { const q = content.checks[step.n]; return `${q.passage} ${q.stem} ${q.options.join(". ")}`; }
      default: return "";
    }
  };
  const listen = () => <button type="button" className={ghost} onClick={() => speak(listenText())}><span aria-hidden="true">🔊</span> {t("Listen")}</button>;
  const dots = () => (
    <div className="mb-3 flex gap-1.5" aria-hidden="true">
      {steps.slice(0, -1).map((_, k) => <span key={k} className={`h-1.5 flex-1 rounded-full ${k <= i ? "bg-brand-teal" : "bg-[var(--lr-track)]"}`} />)}
    </div>
  );
  const kicker = (text: string) => <p className="text-xs font-bold uppercase tracking-wider text-teal-ink">{t(text)}</p>;
  const nav = (lock = false) => (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
      {listen()}
      <span className="flex gap-2">
        {i > 0 && <button type="button" className={ghost} onClick={() => go(i - 1)}>← {t("Back")}</button>}
        <button type="button" className={primary} disabled={lock} onClick={() => go(i + 1)}>{t("Next")} →</button>
      </span>
    </div>
  );

  let body: React.ReactNode = null;
  if (again) {
    const [ex, ...rest] = content.again.example.split(/\n{2,}/);
    body = (
      <>
        {kicker("Let’s try another way")}
        <h2 className="mb-2 text-2xl text-ink" lang="en">{content.again.title}</h2>
        <RichText text={content.again.text} />
        <div className={`${passage} my-3`} lang="en" data-content data-reading><RichText text={ex} /></div>
        {rest.length > 0 && <RichText text={rest.join("\n\n")} />}
        <div className="mt-5 flex flex-wrap justify-between gap-2">{listen()}<button type="button" className={primary} onClick={retryChecks}>{t("Try the 3 checks again")}</button></div>
      </>
    );
  } else if (step.type === "slide" || step.type === "proof") {
    body = (
      <>
        {kicker(step.type === "proof" ? "Prove it from the text" : step.kicker)}
        <h2 className="mb-2 text-2xl text-ink" lang="en">{step.title}</h2>
        {step.type === "slide" && step.picture === "umbrella" && <Umbrella />}
        <RichText text={step.text} />
        {nav()}
      </>
    );
  } else if (step.type === "example") {
    body = (
      <>
        {kicker("Watch me do it")}
        <h2 className="mb-2 text-2xl text-ink">{t("A worked example")}</h2>
        <div className={passage} lang="en" data-content data-reading>
          <p>{content.example.sentences.map((x, k) => (
            <span key={k} className={`rounded px-0.5 transition-colors duration-300 ${shown ? (x.role === "main" || x.role === "key" ? HL_MAIN : x.role === "detail" ? HL_DET : "") : ""}`} style={{ transitionDelay: shown ? `${k * 350}ms` : "0ms" }}>{x.t} </span>
          ))}</p>
        </div>
        {!shown ? <button type="button" className={`${ghost} mt-3`} onClick={() => setShown(true)}>{t("Show me the details")}</button> : (
          <div className="mt-3">
            <p className="mb-2 flex flex-wrap gap-3 text-xs text-muted"><span><span className={`inline-block h-3 w-3 rounded ${HL_MAIN}`} /> {t("Main / key sentence")}</span><span><span className={`inline-block h-3 w-3 rounded ${HL_DET}`} /> {t("Detail")}</span></p>
            <RichText text={content.example.explain} />
          </div>
        )}
        {nav()}
      </>
    );
  } else if (step.type === "together") {
    const q = content.together;
    body = (
      <>
        {kicker("Let’s try together")}
        <h2 className="mb-2 text-2xl text-ink">{t("Your turn (with help)")}</h2>
        <div className={passage} lang="en" data-content data-reading><p>{q.passage}</p></div>
        <p className="mt-3 font-bold" lang="en">{q.stem}</p>
        <div className="mt-2 grid gap-2">
          {q.options.map((o, k) => {
            const right = together.right && k === q.answer, wrong = together.wrong.includes(k) && !right;
            return <button key={k} type="button" disabled={together.right} onClick={() => setTogether((s) => (k === q.answer ? { ...s, right: true } : { ...s, wrong: [...s.wrong, k] }))}
              lang="en" className={`min-h-12 rounded-2xl px-4 py-2.5 text-start ring-2 transition ${right ? OK : wrong ? NO : "bg-surface ring-line hover:ring-[var(--lr-lavender)]"}`}>{o}</button>;
          })}
        </div>
        {together.right ? <p role="status" className={`mt-3 rounded-2xl px-4 py-3 ring-1 ${OK}`} lang="en">{q.good}</p>
          : together.wrong.length > 0 && <p role="status" className={`mt-3 rounded-2xl px-4 py-3 ring-1 ${NO}`}>{t("Hint")}: <span lang="en">{q.hint}</span></p>}
        {nav(!together.right)}
      </>
    );
  } else if (step.type === "evidence") {
    const e = content.evidence;
    const tap = (k: number) => {
      if (ev.done) return;
      if (ev.picked.includes(k)) { setEv({ ...ev, picked: ev.picked.filter((x) => x !== k), msg: null }); return; }
      if (!e.proof.includes(k)) { setEv({ ...ev, flash: k, msg: "wrong" }); setTimeout(() => setEv((s) => ({ ...s, flash: null })), 900); return; }
      const picked = [...ev.picked, k];
      setEv({ picked, flash: null, msg: null, done: picked.length >= e.need });
    };
    body = (
      <>
        {kicker("Prove it from the text")}
        <h2 className="mb-2 text-2xl text-ink">{t("Point to the proof")}</h2>
        <p className="font-bold" lang="en">{e.stem}</p>
        <div className={`${passage} mt-3`} lang="en" data-content data-reading>
          <p>{e.sentences.map((x, k) => (
            <span key={k} role="button" tabIndex={0} aria-pressed={ev.picked.includes(k)} onClick={() => tap(k)} onKeyDown={(x2) => { if (x2.key === "Enter" || x2.key === " ") { x2.preventDefault(); tap(k); } }}
              className={`cursor-pointer rounded px-0.5 transition-colors ${ev.picked.includes(k) ? HL_DET : ev.flash === k ? HL_MAIN : "hover:underline"}`}>{x} </span>
          ))}</p>
        </div>
        <p className="mt-2 text-sm text-muted">{t("Tap a sentence to choose it. Tap again to unchoose.")}</p>
        {ev.done ? <p role="status" className={`mt-3 rounded-2xl px-4 py-3 ring-1 ${OK}`}>{t("Great proof! These sentences prove the answer.")}</p>
          : ev.msg === "wrong" && <p role="status" className={`mt-3 rounded-2xl px-4 py-3 ring-1 ${NO}`} lang="en">{e.wrong}</p>}
        {nav(!ev.done)}
      </>
    );
  } else if (step.type === "check") {
    const q = content.checks[step.n], p = picks[step.n];
    body = (
      <>
        <p className="text-xs font-bold uppercase tracking-wider text-teal-ink">{t("Show what you know · {n} of {m}", { n: step.n + 1, m: content.checks.length })}</p>
        <h2 className="mb-2 text-2xl text-ink">{t("Check {n}", { n: step.n + 1 })}</h2>
        <div className={passage} lang="en" data-content data-reading><p>{q.passage}</p></div>
        <p className="mt-3 font-bold" lang="en">{q.stem}</p>
        <div className="mt-2 grid gap-2">
          {q.options.map((o, k) => (
            <button key={k} type="button" disabled={p !== null} onClick={() => setPicks((s) => s.map((x, j) => (j === step.n ? k : x)))}
              lang="en" className={`min-h-12 rounded-2xl px-4 py-2.5 text-start ring-2 transition ${p !== null && k === q.answer ? OK : p === k ? NO : "bg-surface ring-line hover:ring-[var(--lr-lavender)]"}`}>{o}</button>
          ))}
        </div>
        {p !== null && <p role="status" className={`mt-3 rounded-2xl px-4 py-3 ring-1 ${p === q.answer ? OK : NO}`}>{p === q.answer ? t("Correct!") : t("Not this time. The green answer is right.")} <span lang="en">{q.why}</span></p>}
        {nav(p === null)}
      </>
    );
  } else {
    const ok = Boolean(result?.passed);
    body = !result ? <p className="py-10 text-center text-muted" role="status">{t("Checking your answers…")}</p> : (
      <>
        {kicker("All done")}
        <p className="font-display text-5xl text-ink" dir="ltr">{result.score} / {content.checks.length}</p>
        <h2 className="mt-1 text-2xl text-ink">{ok ? t("Great work! You did it.") : t("Good effort! Let’s look at it one more way.")}</h2>
        <p className="mt-1 text-ink-2">{ok ? t("Now practise this skill in My Work to make it stick.") : t("Everyone learns in their own way. This short trick will help.")}</p>
        {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-between gap-2">
          <button type="button" className={ghost} onClick={restart}>{t("Watch the lesson again")}</button>
          {ok ? (mode === "student" ? <Link href={practiceHref} className={primary}>{t("Practise in My Work")} →</Link> : <span className={`${primary} opacity-60`}>{t("Practise in My Work")} →</span>)
            : <button type="button" className={primary} onClick={() => { setUsedAgain(true); setAgain(true); }}>{t("Show me another way")} →</button>}
        </div>
      </>
    );
  }

  return (
    <div ref={top} className="mx-auto max-w-3xl scroll-mt-24">
      <section className={card} aria-label={title}>
        {dots()}
        {body}
      </section>
    </div>
  );
}
