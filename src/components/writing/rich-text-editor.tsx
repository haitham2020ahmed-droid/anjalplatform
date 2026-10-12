"use client";
import { useRef, useState } from "react";
import { useT } from "@/i18n/client";

/**
 * ✍️ A light rich-text box for the writing prompt (no library): bold, italic, bulleted / numbered lists and a heading.
 * The HTML goes in a hidden input; the server keeps only an allow-list of tags (src/server/writing/rich-text.ts).
 */
export function RichTextEditor({ name, placeholder }: { name: string; placeholder?: string }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState("");
  const run = (cmd: string, arg?: string) => {
    box.current?.focus();
    // execCommand is old but still the lightest way to format a contentEditable box in every browser
    document.execCommand(cmd, false, arg);
    setHtml(box.current?.innerHTML ?? "");
  };
  const btn = "inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg bg-white px-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
  return (
    <div className="mt-1 rounded-xl border border-slate-300 bg-white">
      <div role="toolbar" aria-label={t("Formatting")} className="flex flex-wrap gap-1 border-b border-slate-200 p-1.5">
        <button type="button" className={btn} onClick={() => run("bold")} aria-label={t("Bold")}><b>B</b></button>
        <button type="button" className={btn} onClick={() => run("italic")} aria-label={t("Italic")}><i>I</i></button>
        <button type="button" className={btn} onClick={() => run("formatBlock", "<h3>")} aria-label={t("Heading")}>H</button>
        <button type="button" className={btn} onClick={() => run("formatBlock", "<p>")} aria-label={t("Paragraph")}>¶</button>
        <button type="button" className={btn} onClick={() => run("insertUnorderedList")} aria-label={t("Bulleted list")}>•</button>
        <button type="button" className={btn} onClick={() => run("insertOrderedList")} aria-label={t("Numbered list")}>1.</button>
      </div>
      <div
        ref={box} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={placeholder ?? t("Writing prompt")}
        className="prose-sm min-h-32 px-3 py-2 font-normal outline-none [&_h3]:text-lg [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:ps-6 [&_ul]:list-disc [&_ul]:ps-6"
        onInput={(e) => setHtml((e.target as HTMLDivElement).innerHTML)}
      />
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
