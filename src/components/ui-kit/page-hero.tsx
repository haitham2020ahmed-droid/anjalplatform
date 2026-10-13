import type { ReactNode } from "react";

/** the welcome band's title style (for a page that passes its own <h1> as `title`) */
export const HERO_TITLE = "text-2xl leading-snug text-ink sm:text-3xl";

export type HeroTone = "student" | "teacher" | "admin";

/** Soft shapes drawn in CSS/SVG (no images): playful for students, two calm blobs for staff. Decorative only. */
function HeroDeco({ tone }: { tone: HeroTone }) {
  if (tone === "student") {
    return (
      <svg aria-hidden="true" focusable="false" className="hero-deco" viewBox="0 0 420 220" preserveAspectRatio="xMaxYMid slice">
        <circle cx="410" cy="10" r="96" fill="var(--lr-surface-2)" opacity=".55" />
        <circle cx="400" cy="232" r="64" fill="#c7f0e6" opacity=".6" />
        <circle cx="236" cy="212" r="40" fill="#ffd9a8" opacity=".45" />
        <path className="tw" d="M190 52l5 12 13 1-10 8 3 13-11-7-11 7 3-13-10-8 13-1z" fill="#f5b800" />
        <path className="tw" d="M396 140l4 9 10 1-8 6 3 10-9-6-9 6 3-10-8-6 10-1z" fill="#1fa3a3" opacity=".8" />
        <circle className="tw" cx="160" cy="150" r="5" fill="#5b3fa0" opacity=".45" />
        <circle cx="300" cy="58" r="4" fill="#f472b6" opacity=".7" />
        <circle cx="250" cy="96" r="3" fill="#38bdf8" opacity=".8" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" focusable="false" className="hero-deco" viewBox="0 0 420 220" preserveAspectRatio="xMaxYMid slice">
      <circle cx="380" cy="30" r="110" fill="var(--lr-surface-2)" opacity=".6" />
      <circle cx="330" cy="210" r="80" fill={tone === "teacher" ? "#bfe9e4" : "#dbe5f3"} opacity=".55" />
    </svg>
  );
}

/**
 * The welcome band at the top of the three home pages: a gentle gradient, soft shapes, a clear title, one
 * line under it, an optional picture on the start side (the student's avatar) and the page's actions.
 * `children` sits under the text (e.g. the big number tiles). Strings are passed already translated.
 * `title` may also be the page's own <h1> element (styled with HERO_TITLE); it is then used as is.
 */
export function PageHero({ title, subtitle, eyebrow, tone = "teacher", lead, actions, children, titleId, titleTestId, className = "" }: {
  title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; tone?: HeroTone; lead?: ReactNode; actions?: ReactNode; children?: ReactNode;
  titleId?: string; titleTestId?: string; className?: string;
}) {
  return (
    <section aria-labelledby={titleId} data-hero={tone} className={`hero hero-${tone} p-5 ${tone === "student" ? "sm:px-7 sm:py-8" : "sm:p-7"} ${className}`}>
      <HeroDeco tone={tone} />
      <div className="flex flex-wrap items-center gap-4 sm:gap-5">
        {lead && <div className="shrink-0">{lead}</div>}
        <div className="min-w-0 flex-1 basis-60">
          {eyebrow && <p className="text-sm font-medium text-muted">{eyebrow}</p>}
          {typeof title === "object" && title !== null && (title as { type?: unknown }).type === "h1" ? title : <h1 id={titleId} data-testid={titleTestId} className={HERO_TITLE}>{title}</h1>}
          {subtitle && <div className="mt-1 text-base text-ink-2">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}
