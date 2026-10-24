"use client";
/**
 * A reading aid for a student whose working level is BELOW (see server/curriculum-map/student-level.ts): a long
 * passage is offered in smaller sections instead of the whole block of text at once. It is purely a different
 * PRESENTATION of the exact same passage — no state is saved (which section a student is on resets on reload, and
 * that is fine — see src/server/practice/session.ts and src/lib/passage-chunks.ts for the one-line comment on why).
 *
 * - For an ON/ABOVE/unknown level, or a passage too short to bother chunking, this renders exactly like the plain
 *   <PassageText> it replaces — nothing changes for those students.
 * - For a BELOW-level student on a long passage: one chunk shows at a time with a "Continue reading" button to
 *   reveal the next; once every chunk has been revealed the full passage is simply there, same as always. A
 *   "Show full passage" link is always available, so the chunking never takes away the student's ability to read
 *   the whole thing right away if they'd rather — it is a reading aid, never a restriction.
 * - The word-lookup / tap-to-define feature (components/learn/word-lookup.tsx) keeps working unchanged: this
 *   component only decides how much of the passage's own markup is on screen, not how the text inside it behaves.
 */
import { useMemo, useState } from "react";
import { useT } from "@/i18n/client";
import { chunkPassage, shouldChunk } from "@/lib/passage-chunks";
import { renderPassageBlocks, DEFAULT_PARA_CLASS, DEFAULT_HEADING_CLASS } from "@/components/passage-text";

export function ChunkedPassage({ text, level, paraClassName = DEFAULT_PARA_CLASS, headingClassName = DEFAULT_HEADING_CLASS }: {
  text: string;
  /** The student's current working level ("BELOW" | "ON" | "ABOVE"), or null/undefined when it is not known —
   *  chunking only ever turns on for "BELOW"; every other value shows the full passage, unchunked, as before. */
  level?: string | null;
  paraClassName?: string;
  headingClassName?: string;
}) {
  const t = useT();
  const chunks = useMemo(() => chunkPassage(text), [text]);
  const chunkable = shouldChunk(level, chunks);
  // how many chunks are revealed so far; irrelevant (and unused) when chunking is off
  const [shown, setShown] = useState(1);
  const [showAll, setShowAll] = useState(!chunkable);

  if (!chunkable || showAll) {
    const blocks = chunks.length ? chunks.flat() : [];
    return <>{renderPassageBlocks(blocks, paraClassName, headingClassName)}</>;
  }

  const atEnd = shown >= chunks.length;
  const visible = chunks.slice(0, shown).flat();
  const advance = () => setShown((n: number) => Math.min(chunks.length, n + 1));

  return (
    <div>
      {renderPassageBlocks(visible, paraClassName, headingClassName)}
      {!atEnd && (
        <div className="mt-4 flex flex-wrap items-center gap-3 print:hidden">
          {/* a real <button> is keyboard-operable (Tab to focus, Enter/Space to activate) with no extra wiring */}
          <button type="button" onClick={advance} className="min-h-[44px] rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">
            {t("Continue reading →")}
          </button>
          <span className="text-xs text-slate-500">{t("Part {current} of {total}", { current: shown, total: chunks.length })}</span>
        </div>
      )}
      <button type="button" onClick={() => setShowAll(true)} className="mt-3 min-h-[44px] text-sm font-semibold text-brand-navy underline-offset-2 hover:underline print:hidden">
        {t("Show full passage")}
      </button>
    </div>
  );
}
