"use client";
/**
 * 💡 Prompt ideas picker for the "New genre task" form (src/app/teacher/writing/page.tsx). Purely a convenience:
 * picking an idea fills the form's own genre / title / prompt fields (by name, via the form's id) — it writes
 * nothing itself, so every idea still goes through the normal createTaskAction → rubric / checklist / organizer
 * pipeline exactly like a prompt the teacher typed by hand.
 */
import { useMemo, useState } from "react";

export interface PromptIdeaView { id: string; genre: string; genreLabel: string; title: string; prompt: string }

export function PromptPicker({ ideas, formId }: { ideas: PromptIdeaView[]; formId: string }) {
  const genres = useMemo(() => [...new Set(ideas.map((i) => i.genre))], [ideas]);
  const [genre, setGenre] = useState(genres[0] ?? "");
  const options = ideas.filter((i) => i.genre === genre);
  const [pickId, setPickId] = useState(options[0]?.id ?? "");
  const chosen = options.find((o) => o.id === pickId) ?? options[0] ?? null;

  function use() {
    if (!chosen) return;
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    const g = form.elements.namedItem("genre") as HTMLSelectElement | null;
    const t = form.elements.namedItem("title") as HTMLInputElement | null;
    const p = form.elements.namedItem("prompt") as HTMLTextAreaElement | null;
    if (g) g.value = chosen.genre;
    if (t) t.value = chosen.title;
    if (p) p.value = chosen.prompt;
    t?.focus();
  }

  if (!ideas.length) return null;
  return (
    <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200 md:col-span-2">
      <p className="font-semibold text-amber-950">💡 Prompt ideas for this grade</p>
      <p className="mt-0.5 text-xs text-amber-900">Pick a genre and an idea, then “Use this idea” fills the genre, title and prompt below — you can still edit them.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={genre} onChange={(e) => { setGenre(e.target.value); setPickId(""); }} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          {genres.map((g) => <option key={g} value={g}>{ideas.find((i) => i.genre === g)?.genreLabel ?? g}</option>)}
        </select>
        <select value={chosen?.id ?? ""} onChange={(e) => setPickId(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
          {options.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>
        <button type="button" onClick={use} className="rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-purple">Use this idea</button>
      </div>
      {chosen && <p className="mt-2 text-xs text-slate-600">{chosen.prompt}</p>}
    </div>
  );
}
