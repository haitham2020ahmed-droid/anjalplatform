/** @jsxRuntime automatic */
/** @jsxImportSource react */
import type { TFn } from "@/i18n";
import { ENGINE } from "@/server/readrise/engine";
import { RR_LEVELS } from "@/server/readrise/level";

/** A point on the gauge's half circle (centre 100,100, radius 80) at fraction f of the way (0 = left, 1 = right). */
const at = (f: number) => {
  const a = Math.PI * Math.min(1, Math.max(0, f));
  return { x: +(100 - 80 * Math.cos(a)).toFixed(2), y: +(100 - 80 * Math.sin(a)).toFixed(2) };
};

/**
 * The ReadRise card's content (no link): the title, a half-circle gauge from the lowest to the highest ReadRise level,
 * the level in the display serif and "Up N since <month>" when it grew since the start — or, with no level yet, one
 * line. Below the number: "Next level: N" (the next ReadRise level). Never called Lexile; no level words.
 */
export function ReadRiseGauge({ t, lang, level, start }: { t: TFn; lang: string; level: number | null; start: { level: number; at: string } | null }) {
  if (level === null) {
    return (
      <>
        <span className="text-[15px] font-semibold text-ink">{t("Your ReadRise level")}</span>
        <span className="text-sm text-ink-2">{t("Read your first ReadRise article to see your level.")}</span>
      </>
    );
  }
  const f = (level - ENGINE.min) / (ENGINE.max - ENGINE.min);
  const p = at(f);
  const up = start && level > start.level ? level - start.level : 0;
  // the next ReadRise level above the student's (levels 300 … 1400); none at the top
  const next = (RR_LEVELS as readonly number[]).find((l) => l > level) ?? null;
  const since = start?.at ? new Date(start.at) : null;
  const month = since && !Number.isNaN(since.getTime()) ? since.toLocaleDateString(lang === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : "en-GB", { month: "long", timeZone: "Asia/Riyadh" }) : "";
  return (
    <>
      <span className="text-[15px] font-semibold text-ink">{t("Your ReadRise level")}</span>
      <svg viewBox="0 0 200 112" className="h-[104px] w-[186px]" role="img" aria-label={t("ReadRise level {n}", { n: level })}>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="var(--lr-track)" strokeWidth="14" strokeLinecap="round" />
        {f > 0.005 && <path d={`M20 100 A80 80 0 0 1 ${p.x} ${p.y}`} fill="none" stroke="var(--lr-teal)" strokeWidth="14" strokeLinecap="round" />}
        <circle cx={p.x} cy={p.y} r="8.5" fill="var(--lr-accent)" stroke="var(--lr-surface)" strokeWidth="3.5" />
        <text x="100" y="96" textAnchor="middle" fontSize="38" fill="var(--lr-ink)" style={{ fontFamily: "var(--font-young-serif), 'Young Serif', serif" }}>{level}</text>
      </svg>
      <span className="text-sm text-ink-2">{next !== null ? t("Next level: {n}", { n: next }) : t("You reached the top ReadRise level")}</span>
      {up > 0 && <span className="text-sm font-semibold text-teal-ink">{month ? t("Up {n} since {month}", { n: up, month }) : t("Up {n} since you started", { n: up })}</span>}
    </>
  );
}
