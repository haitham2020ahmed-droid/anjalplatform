/** @jsxRuntime automatic */
/** @jsxImportSource react */
import Link from "next/link";
import { ReadRiseGauge } from "./readrise-gauge";
import type { TFn } from "@/i18n";

/**
 * "Your ReadRise level" on the student home (Literise D1): a half-circle gauge from the lowest to the highest ReadRise
 * level, the level number in the display serif and "Up N since <month>" when the level grew since the start. Never
 * called Lexile; no level words. No level yet → one line that opens ReadRise. Data: studentHome (no extra read).
 */
export function ReadRiseLevelCard({ t, lang, level, start }: { t: TFn; lang: string; level: number | null; start: { level: number; at: string } | null }) {
  return (
    <Link prefetch={false} href="/student/readrise" data-testid="readrise-level" className="flex h-full flex-col items-center justify-center gap-1 rounded-[1.25rem] bg-surface px-5 py-4 text-center ring-1 ring-line transition hover:ring-brand-teal/60">
      <ReadRiseGauge t={t} lang={lang} level={level} start={start} />
    </Link>
  );
}

