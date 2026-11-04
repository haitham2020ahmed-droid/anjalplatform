/**
 * ⭐ THE skill-status icon (owner r67 §2): five statuses, each with its own colour AND shape, the same size and style on
 * every page — ☆ gray outline (Not started) · ◐ half-filled blue (In progress) · ⭐ full glowing gold (Mastered; a
 * small level number when mastered at a higher level) · ☆⬆ gold outline with an up-arrow (Next level) · 🔄 orange
 * circular arrow (Needs review). Every icon has a tooltip / popover (hover, keyboard focus or tap): its meaning, when,
 * and the next step. No hooks: usable in server and client components (pass `t` to translate).
 * StarLegend: the slim collapsible legend line for the top of every page that shows stars (links to the guide).
 */
import Link from "next/link";
import { STAR_ORDER, STAR_SYMBOL, STUDENT_MEANING, TEACHER_MEANING, starTooltip, teacherWordOf, wordOf, type Audience, type StarInfo, type StarStatus } from "@/lib/skill-stars";

type T = (text: string, vars?: Record<string, string | number>) => string;
const same: T = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? "")) : text);
const STAR = "M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.5L12 17.5l-5.8 3.05 1.1-6.5-4.7-4.6 6.5-.95z";

/** The bare icon (16 px by default; `size` in px). */
export function StarGlyph({ status, level = 1, size = 16 }: { status: StarStatus; level?: number; size?: number }) {
  const box = { width: size, height: size };
  switch (status) {
    case "NOT_STARTED":
      return <svg viewBox="0 0 24 24" style={box} aria-hidden="true" data-star="NOT_STARTED"><path d={STAR} fill="none" stroke="#94a3b8" strokeWidth="1.8" strokeLinejoin="round" /></svg>;
    case "IN_PROGRESS":
      return (
        <svg viewBox="0 0 24 24" style={box} aria-hidden="true" data-star="IN_PROGRESS">
          <svg x="0" y="0" width="12" height="24" viewBox="0 0 12 24"><path d={STAR} fill="#3b82f6" /></svg>
          <path d={STAR} fill="none" stroke="#2563eb" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case "MASTERED":
      return (
        <span className="relative inline-flex" style={box} data-star="MASTERED">
          <svg viewBox="0 0 24 24" style={{ ...box, filter: "drop-shadow(0 0 2.5px rgba(245,158,11,.75))" }} aria-hidden="true"><path d={STAR} fill="#f59e0b" stroke="#d97706" strokeWidth="1.2" strokeLinejoin="round" /></svg>
          {level > 1 && <span aria-hidden="true" className="absolute -right-1.5 -top-1 rounded-full bg-amber-600 px-[3px] text-[8px] font-bold leading-[10px] text-white" dir="ltr">{level}</span>}
        </span>
      );
    case "NEXT_LEVEL":
      return (
        <svg viewBox="0 0 24 24" style={box} aria-hidden="true" data-star="NEXT_LEVEL">
          <path d={STAR} fill="none" stroke="#d97706" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M12 15.5V8.8M9.4 11.2 12 8.6l2.6 2.6" fill="none" stroke="#b45309" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "NEEDS_REVIEW":
      return (
        <svg viewBox="0 0 24 24" style={box} aria-hidden="true" data-star="NEEDS_REVIEW">
          <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" fill="none" stroke="#ea580c" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M19.8 3.8v4.6h-4.6" fill="none" stroke="#ea580c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

/**
 * The status icon with its tooltip (one component, everywhere). `who` = whose words (students never see level words);
 * `label` = the skill's name for screen readers.
 */
export function SkillStar({ info, who = "teacher", t = same, label, size = 16, now, inLink = false }: { info: StarInfo; who?: Audience; t?: T; label?: string; size?: number; now?: number; /** inside a link: the link takes the focus */ inLink?: boolean }) {
  const tip = starTooltip(info, who, t, now);
  const word = who === "teacher" ? t(teacherWordOf(info)) : t(wordOf(info.status, who));
  return (
    <span tabIndex={inLink ? undefined : 0} data-testid="skill-star" data-status={info.status} title={tip} aria-label={`${label ? `${label}: ` : ""}${word}. ${tip}`}
      className="group/star relative inline-flex shrink-0 cursor-help items-center align-middle outline-none focus-visible:ring-2 focus-visible:ring-brand-teal rounded">
      <StarGlyph status={info.status} level={who === "student" ? 1 : info.level ?? 1} size={size} />
      <span role="tooltip" className="pointer-events-none invisible absolute bottom-full start-1/2 z-30 mb-1.5 w-max max-w-[16rem] -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-start text-xs font-normal leading-snug text-white opacity-0 shadow-lg transition group-hover/star:visible group-hover/star:opacity-100 group-focus/star:visible group-focus/star:opacity-100 rtl:translate-x-1/2 print:hidden">
        <b className="block">{word}</b>{tip}
      </span>
    </span>
  );
}

/** The slim collapsible legend line (top of every page with stars). Links to the full guide for teachers. */
export function StarLegend({ who = "teacher", t = same, className = "" }: { who?: Audience; t?: T; className?: string }) {
  const meaning = who === "student" ? STUDENT_MEANING : TEACHER_MEANING;
  return (
    <details data-testid="star-legend" className={`group/legend rounded-lg bg-white/70 px-3 py-1.5 text-xs text-slate-600 ring-1 ring-slate-200 print:hidden ${className}`}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
        {STAR_ORDER.map((k) => <span key={k} className="inline-flex items-center gap-1"><StarGlyph status={k} size={14} />{t(wordOf(k, who))}</span>)}
        <span className="ms-auto font-semibold text-brand-teal group-open/legend:hidden">{t("What do the stars mean?")}</span>
      </summary>
      <ul className="mt-2 space-y-1">
        {STAR_ORDER.map((k) => <li key={k} className="flex items-start gap-2"><StarGlyph status={k} size={14} /><span><b>{t(wordOf(k, who))}</b> — {t(meaning[k])}</span></li>)}
      </ul>
      {who === "teacher" && <Link prefetch={false} href="/guide/skill-stars" className="mt-2 inline-block font-semibold text-brand-teal underline">{t("Skill stars guide")}</Link>}
    </details>
  );
}

/** One plain line for printed reports and PDFs (footer): "☆ Not started · ◐ In progress · ⭐ Mastered · …". */
export function StarLegendLine({ who = "teacher", t = same }: { who?: Audience; t?: T }) {
  return <p data-testid="star-legend-line" className="text-[10px] text-slate-500">{STAR_ORDER.map((k) => `${STAR_SYMBOL[k]} ${t(wordOf(k, who))}`).join(" · ")}</p>;
}
