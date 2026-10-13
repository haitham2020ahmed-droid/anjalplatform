/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { SCHOOL_NAME_AR, SCHOOL_NAME_EN, SCHOOL_SINCE } from "@/i18n/school-name";

/**
 * Al-Anjal Private Schools — the school logo as crisp vectors (the uploaded PNG was blurry). Pure, server-safe, no
 * client code. `mark` = the coloured blocks + "Since ✦ 1985" (inline SVG, traced 1:1 from the original);
 * `full` = the mark on the right and the two name lines (real text: Arabic in IBM Plex Sans Arabic, English in
 * Hanken Grotesk) right-aligned to it. Always laid out left-to-right, so it looks the same in the English and the
 * Arabic interface. At night the name turns light (--lr-school-ink) and the mark keeps its colours.
 * Static copy for e-mails and PDFs: public/brand/al-anjal-logo.svg. Schools that upload their own logo still have it
 * at /api/school-logo (reports and printed branding).
 */
export const SCHOOL_COLORS = { navy: "#1639b2", yellow: "#f4b840", sky: "#86b1f7", teal: "#49a2b1", purple: "#7f46bd", since: "#3352b9" } as const;

const BLOCKS: { fill: string; points: string }[] = [
  { fill: SCHOOL_COLORS.navy, points: "67,3 75,3 79.5,70.5 64.5,70.5" },
  { fill: SCHOOL_COLORS.yellow, points: "86,35 119,39.5 119,50 86,50" },
  { fill: SCHOOL_COLORS.sky, points: "24,60 57.5,55.5 57.5,70.5 24,70.5" },
  { fill: SCHOOL_COLORS.teal, points: "86,60 132.5,55 132.5,70.5 86,70.5" },
  { fill: SCHOOL_COLORS.purple, points: "9,75.5 81,80.5 81,90.5 9,90.5" },
];
const LATIN = "var(--font-hanken), 'Hanken Grotesk', 'Segoe UI', sans-serif";
const ARABIC = "var(--font-plex-arabic), 'IBM Plex Sans Arabic', 'Segoe UI', sans-serif";

/** The mark alone (viewBox 0 0 140 118). Decorative unless `label` is given. */
export function SchoolMark({ className = "h-10 w-auto", label, style }: { className?: string; label?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 140 118" className={className} style={style} {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })} focusable="false">
      {BLOCKS.map((b) => <polygon key={b.points} points={b.points} fill={b.fill} stroke={b.fill} strokeWidth="1.5" strokeLinejoin="round" />)}
      <text x="70" y="108" textAnchor="middle" fontSize="11" fontWeight="600" fill={SCHOOL_COLORS.since} style={{ fontFamily: LATIN }}>Since {"✦"} {SCHOOL_SINCE}</text>
    </svg>
  );
}

/** font size of the name (the mark is 2.6 × as tall): sm ≈ 34 px tall (top bar), md ≈ 42 px, lg ≈ 52 px (sign-in) */
const SIZE = { sm: 13, md: 16, lg: 20 } as const;

export function SchoolLogo({ variant = "full", size = "md", className = "" }: { variant?: "full" | "mark"; size?: keyof typeof SIZE; className?: string }) {
  const label = `${SCHOOL_NAME_EN}, since ${SCHOOL_SINCE}`;
  if (variant === "mark") return <SchoolMark className={className || "h-10 w-auto"} label={label} />;
  return (
    <span role="img" aria-label={label} dir="ltr" data-school-logo="" className={`inline-flex shrink-0 items-center ${className}`.trim()} style={{ fontSize: SIZE[size], gap: ".55em" }}>
      <span aria-hidden="true" className="flex flex-col items-end whitespace-nowrap text-end" style={{ color: "var(--lr-school-ink)", lineHeight: 1.2, paddingBottom: ".5em" }}>
        <span lang="ar" dir="rtl" style={{ fontFamily: ARABIC, fontWeight: 600, fontSize: "1em" }}>{SCHOOL_NAME_AR}</span>
        <span lang="en" dir="ltr" style={{ fontFamily: LATIN, fontWeight: 500, fontSize: ".84em", letterSpacing: ".005em" }}>{SCHOOL_NAME_EN}</span>
      </span>
      <SchoolMark className="w-auto shrink-0" style={{ height: "2.6em" }} />
    </span>
  );
}
