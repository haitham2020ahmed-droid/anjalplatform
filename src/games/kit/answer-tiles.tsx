"use client";
import { TILES } from "@/components/game/tiles";
import { RichInline } from "../../components/rich-inline";

/**
 * Big answer tiles (colour + shape, so colour-blind players can tell them apart). Used by Quiz Race and by every
 * game's Live Challenge device unless the game brings its own LivePad. Option text is English content: it is never
 * translated and keeps its own direction.
 */
export function AnswerTiles({ options, hidden = [], disabled, onPick, reveal, big }: {
  options: { label: string; text: string }[];
  hidden?: string[];
  disabled?: boolean;
  onPick: (label: string) => void;
  /** after answering: the right label and the one picked */
  reveal?: { right: string | null; picked: string | null } | null;
  big?: boolean;
}) {
  return (
    <div className={`grid gap-3 ${options.length > 2 ? "sm:grid-cols-2" : "grid-cols-2"}`}>
      {options.map((o, i) => {
        const gone = hidden.includes(o.label);
        const isRight = reveal && reveal.right === o.label;
        const isPicked = reveal && reveal.picked === o.label;
        const dim = reveal && !isRight && !isPicked;
        return (
          <button key={o.label} type="button" data-label={o.label} disabled={disabled || gone || !!reveal} onClick={() => onPick(o.label)}
            className={`flex ${big ? "min-h-28 text-xl" : "min-h-16 text-lg"} items-center gap-3 rounded-2xl p-4 text-start font-semibold text-white shadow transition active:scale-[.98] ${TILES[i % 4].bg} ${gone ? "invisible" : ""} ${dim ? "opacity-35" : ""} ${isRight ? "ring-4 ring-emerald-300" : ""} ${isPicked && !isRight ? "ring-4 ring-white" : ""} disabled:cursor-default`}>
            <span aria-hidden="true" className="text-2xl">{TILES[i % 4].shape}</span>
            <span dir="ltr" lang="en" className="flex-1"><RichInline text={o.text} /></span>
            {isRight && <span aria-hidden="true" className="text-2xl">✓</span>}
            {isPicked && !isRight && <span aria-hidden="true" className="text-2xl">✗</span>}
          </button>
        );
      })}
    </div>
  );
}
