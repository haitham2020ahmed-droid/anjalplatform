import type { ReactNode } from "react";
import { RichInline } from "@/components/rich-inline";
import { stripMarks } from "@/lib/inline-marks";

/**
 * Learn lesson text → elements (never raw HTML): paragraphs split by a blank line, **bold** (and the other marks of
 * lib/inline-marks.ts), and numbered steps
 * (lines starting "1. ", "2. " …) shown as the round-numbered steps of the lesson design.
 */
export function inline(text: string): ReactNode[] {
  return [<RichInline key="t" text={text} />]; // **bold**, <u>underline</u>… (lib/inline-marks.ts)
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = String(text ?? "").replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className={`space-y-3 ${className}`} lang="en" data-content>
      {blocks.map((b, i) => {
        const lines = b.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length && lines.every((l) => /^\d+\.\s/.test(l))) {
          return (
            <ol key={i} className="space-y-3">
              {lines.map((l, j) => (
                <li key={j} className="relative min-h-8 ps-11">
                  <span aria-hidden="true" className="absolute start-0 top-0 grid h-8 w-8 place-items-center rounded-full bg-brand-navy text-sm font-bold text-white">{j + 1}</span>
                  {inline(l.replace(/^\d+\.\s+/, ""))}
                </li>
              ))}
            </ol>
          );
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br />}{inline(l)}</span>)}</p>;
      })}
    </div>
  );
}

/** Plain text for 🔊 Listen (no stars, steps read as sentences). */
export const plain = (text: string) => stripMarks(String(text ?? "")).replace(/^\d+\.\s+/gm, "").replace(/\s+/g, " ").trim();
