/** @jsxRuntime automatic */
/** @jsxImportSource react */
/**
 * Literise brand: the rising-bars mark (four rounded bars growing taller: lavender, light blue, teal, gold) and the
 * serif wordmark. The wordmark is the platform's name and always stays in Latin letters, also in Arabic mode.
 * Static copies for e-mails, favicons and other sites: /brand/literise-logo-on-light.svg, -on-dark.svg, literise-mark.svg.
 * No client code: usable from server and client components.
 */
export const LITERISE = "Literise";
export const LITERISE_BARS = ["#9b8bdb", "#a9c4ee", "#1fa3a3", "#f2b705"] as const;

/** The four rising bars only (decorative; the wordmark next to it carries the name). */
export function LiteriseMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 41 40" className={className} aria-hidden="true" focusable="false">
      {LITERISE_BARS.map((c, i) => <rect key={c} x={2 + i * 10} y={24 - i * 7} width="7" height={13 + i * 7} rx="3.5" fill={c} />)}
    </svg>
  );
}

const SIZE = { sm: { mark: "h-6 w-6", text: "text-[1.25rem]" }, md: { mark: "h-7 w-7", text: "text-[1.5rem]" }, lg: { mark: "h-9 w-9", text: "text-[1.75rem]" } } as const;

/** Mark + "Literise" in the brand serif. `tone="dark"` = white letters for a dark background; default navy on light. */
export function LiteriseLogo({ tone = "light", size = "md", className = "" }: { tone?: "light" | "dark"; size?: keyof typeof SIZE; className?: string }) {
  const s = SIZE[size];
  return (
    <span dir="ltr" className={`inline-flex items-center gap-2 ${className}`.trim()}>
      <LiteriseMark className={s.mark} />
      <span className={`font-display ${s.text} leading-none tracking-tight ${tone === "dark" ? "text-white" : "text-ink"}`}>{LITERISE}</span>
    </span>
  );
}
