/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { TFn } from "@/i18n";
import { LiteriseLogo, LITERISE_BARS } from "@/components/brand/literise-logo";

/**
 * The sign-in card's navy half (Literise D1): Literise logo, "Read today. Rise tomorrow.", one short line and the four
 * rising bars. No level words (Below / On / Above) here: students see this page. Phones: a short band above the form
 * (logo and headline only).
 */
export function LoginHero({ t }: { t: TFn }) {
  return (
    <section aria-label="Literise" className="relative isolate flex flex-col gap-5 overflow-hidden bg-hero px-6 py-6 text-white sm:px-9 md:min-h-[540px] md:w-[44%] md:shrink-0 md:py-10">
      {/* a soft ribbon and the rising bars (decoration only) */}
      <svg aria-hidden="true" viewBox="0 0 420 540" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 -z-10 hidden h-full w-full md:block">
        <path d="M210 -40 C 320 30 320 120 210 175 C 100 230 100 320 210 375" fill="none" stroke="var(--lr-hero-pattern)" strokeWidth="64" strokeLinecap="round" />
        <g transform="translate(250 330)">
          {LITERISE_BARS.map((c, i) => <rect key={c} x={i * 38} y={120 - i * 46} width="26" height={64 + i * 46} rx="13" fill={c} />)}
        </g>
      </svg>
      <LiteriseLogo tone="dark" size="md" />
      <div className="relative max-w-[19rem] md:mt-14">
        <p className="font-display text-[1.625rem] leading-[1.1] md:text-[2.125rem]">{t("Read today. Rise tomorrow.")}</p>
        <p className="mt-3 hidden text-[15px] leading-relaxed text-[#c6cbef] md:block">{t("Reading, writing and vocabulary at the right level for every student in Grades 4 to 6.")}</p>
      </div>
    </section>
  );
}
