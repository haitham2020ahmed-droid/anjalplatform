"use client";
import { useState } from "react";
import { useT } from "@/i18n/client";
import type { WordCard } from "@/lib/learn/format";
import { aiWordDraftAction, saveWordAction } from "@/app/teacher/learn/actions";

const field = "mt-1 block w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm font-normal text-ink";
const empty = (word: string): WordCard => ({ word, pos: "", meaning: "", example: "", arabic: "", synonyms: [], antonyms: [], family: [], check: { stem: "", options: ["", "", "", ""], answer: 0 } });

/**
 * ✏️ Write or edit a word card (every field). ✨ AI draft fills the form for the teacher to check — nothing is saved
 * until Save (then the private-edit → admin approval flow, like lessons). `newWord`: the word itself can be typed.
 */
export function WordEditForm({ sel, card, word = "", newWord = false, ai = true }: { sel: string; card: WordCard | null; word?: string; newWord?: boolean; ai?: boolean }) {
  const t = useT();
  const [c, setC] = useState<WordCard>(card ?? empty(word));
  const [v, setV] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const draft = async () => {
    if (!c.word.trim()) { setNote(t("Write the word.")); return; }
    setBusy(true); setNote(null);
    const r = await aiWordDraftAction(sel, c.word).catch(() => null);
    if (r?.ok) { setC(r.card); setV((x) => x + 1); setNote(t("AI draft ready: check every field, then Save.")); } else setNote(r && !r.ok ? r.error : t("Something went wrong. Try again."));
    setBusy(false);
  };
  return (
    <form action={saveWordAction} key={v} className="grid gap-2 sm:grid-cols-2" lang="en">
      <input type="hidden" name="sel" value={sel} />
      <label className="text-xs font-semibold text-muted">{t("Word")}<input name="word" defaultValue={c.word} readOnly={!newWord} required maxLength={64} onChange={(e) => setC({ ...c, word: e.target.value })} className={field} /></label>
      <label className="text-xs font-semibold text-muted">{t("Part of speech")}<input name="pos" defaultValue={c.pos} required className={field} /></label>
      <label className="text-xs font-semibold text-muted sm:col-span-2">{t("Meaning (14 words at most, not using the word)")}<input name="meaning" defaultValue={c.meaning} required className={field} /></label>
      <label className="text-xs font-semibold text-muted sm:col-span-2">{t("Example sentence")}<input name="example" defaultValue={c.example} required className={field} /></label>
      <label className="text-xs font-semibold text-muted">{t("Arabic meaning")}<input name="arabic" defaultValue={c.arabic} required dir="rtl" lang="ar" className={field} /></label>
      <label className="text-xs font-semibold text-muted">{t("Word family (commas)")}<input name="family" defaultValue={c.family.join(", ")} className={field} /></label>
      <label className="text-xs font-semibold text-muted">{t("Synonyms (commas, up to 3)")}<input name="synonyms" defaultValue={c.synonyms.join(", ")} className={field} /></label>
      <label className="text-xs font-semibold text-muted">{t("Antonyms (commas, up to 3)")}<input name="antonyms" defaultValue={c.antonyms.join(", ")} className={field} /></label>
      <label className="text-xs font-semibold text-muted sm:col-span-2">{t("Check question")}<input name="stem" defaultValue={c.check.stem} required className={field} /></label>
      {[0, 1, 2, 3].map((i) => <label key={i} className="text-xs font-semibold text-muted">{t("Option {n}", { n: i + 1 })}<input name={`opt${i}`} defaultValue={c.check.options[i] ?? ""} required className={field} /></label>)}
      <label className="text-xs font-semibold text-muted">{t("Correct option")}<select name="answer" defaultValue={String(c.check.answer)} className={field}>{[0, 1, 2, 3].map((i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <button className="min-h-10 rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white">✓ {t("Save")}</button>
        {ai && <button type="button" onClick={draft} disabled={busy} className="min-h-10 rounded-xl px-4 text-sm font-semibold text-ink ring-1 ring-line disabled:opacity-50">✨ {busy ? t("Writing…") : t("AI draft")}</button>}
        {note && <span role="status" className="text-sm text-ink-2">{note}</span>}
      </div>
    </form>
  );
}
