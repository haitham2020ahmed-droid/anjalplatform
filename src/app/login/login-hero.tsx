/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { TFn } from "@/i18n";
import { LiteriseLogo, LITERISE_BARS } from "@/components/brand/literise-logo";

/** Floating letters and sparkles (decoration only, hidden from screen readers; still under "reduce motion"). */
const LETTERS = [
  { ch: "A", cls: "start-[46%] top-[9%] text-5xl text-[#f5c542] rotate-[-8deg]" },
  { ch: "b", cls: "end-[8%] top-[52%] text-5xl text-[#2bb3b3] rotate-[6deg]" },
  { ch: "c", cls: "start-[3%] top-[40%] text-4xl text-white/30" },
  { ch: "?", cls: "end-[10%] top-[6%] text-5xl text-[#a9c4ee]/80 rotate-[10deg]" },
] as const;
const SPARKLES = ["start-[12%] top-[12%] h-3 w-3 text-white/60", "start-[56%] top-[22%] h-4 w-4 text-[#f5c542]/80", "end-[22%] top-[34%] h-2.5 w-2.5 text-white/50", "start-[30%] top-[62%] h-3 w-3 text-[#a9c4ee]/70"];

function Sparkle({ className }: { className: string }) {
  return <svg viewBox="0 0 16 16" className={`absolute ${className}`} fill="currentColor"><path d="M8 0c.5 3.9 2.1 6.5 8 8-5.9 1.5-7.5 4.1-8 8-.5-3.9-2.1-6.5-8-8 5.9-1.5 7.5-4.1 8-8Z" /></svg>;
}

/**
 * The sign-in page's brand side: Literise logo, the "English Language Arts" pill, "Every reader rises." and one
 * short line; rising bars at the bottom. No level words (Below / On / Above) here: students see this page.
 * Desktop: the deep-navy left panel. Phones: a short banner above the form (no bars, no description).
 */
export function LoginHero({ t }: { t: TFn }) {
  return (
    <section aria-label="Literise" className="relative isolate flex flex-col overflow-hidden px-5 pb-6 pt-16 text-white sm:px-10 lg:min-h-screen lg:px-14 lg:pb-0 lg:pt-24">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 hidden lg:block">
        {LETTERS.map((l) => <span key={l.ch} className={`absolute font-display leading-none animate-float ${l.cls}`}>{l.ch}</span>)}
        {SPARKLES.map((c) => <Sparkle key={c} className={c} />)}
      </div>
      <div className="relative max-w-xl">
        <LiteriseLogo tone="dark" size="lg" />
        <p className="mt-5 inline-block rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f5c542] lg:mt-7">{t("English Language Arts")}</p>
        <p className="mt-4 font-display text-[2.1rem] leading-[1.08] tracking-tight sm:text-5xl lg:mt-6 lg:text-[3.6rem]">
          {t("Every reader")}{" "}
          <span className="relative inline-block whitespace-nowrap text-[#f5c542]">
            {t("rises.")}
            <svg aria-hidden="true" viewBox="0 0 120 12" preserveAspectRatio="none" className="absolute -bottom-2 start-0 h-2.5 w-full text-[#2bb3b3]"><path d="M2 8c22-6 50-7 116-2" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" /></svg>
          </span>
        </p>
        <p className="mt-6 hidden max-w-md text-base leading-relaxed text-white/85 sm:block lg:text-lg">{t("Read, write and grow at your own level. Every lesson meets you where you are, then helps you climb higher.")}</p>
      </div>
      {/* rising bars: in the page flow under the words, so they never cover the text */}
      <div aria-hidden="true" className="relative mt-auto hidden items-end gap-4 pt-12 lg:flex">
        {LITERISE_BARS.map((c, i) => <span key={c} className="block w-14 rounded-t-2xl xl:w-16" style={{ background: c, height: `${5 + i * 3.25}rem`, opacity: 0.92 }} />)}
      </div>
    </section>
  );
}
