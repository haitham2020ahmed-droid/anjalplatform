import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Flash, LearnTabs } from "@/components/learn/teacher-tabs";
import { WordsFilter } from "@/components/learn/words-filter";
import { WordCardView, WordPractice } from "@/components/learn/word-cards";
import { WordEditForm } from "@/components/learn/word-edit-form";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { isAdmin } from "@/server/learn/edits";
import { practiceQuestions, teacherWords } from "@/server/learn/words";
import { getT } from "@/i18n/server";
import { reportAction, restoreWordAction } from "../actions";

export const metadata = { title: "Words" };

type SP = { grade?: string; unit?: string; sel?: string; msg?: string; err?: string };
const btn = "inline-flex min-h-10 items-center rounded-xl bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line hover:ring-brand-teal";
const SOURCE: Record<string, string> = { FILE: "Original", SCHOOL: "School version", MINE: "Your version", TEACHER: "A teacher's version", DICTIONARY: "From the school dictionary", NONE: "No explanation yet" };

/**
 * 📗 Learn → Words (teacher and admin, full access): every Curriculum Map vocabulary word, Grade → Unit → Selection;
 * preview the cards as students see them, ✏️ edit any field (private version → admin approval, Restore original),
 * Write / ✨ AI draft for words without an explanation (e.g. Grade 6), add a word, assign the selection's words.
 */
export default async function TeacherWordsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const v = await teacherWords(repo, actor, { grade: sp.grade, unit: sp.unit, sel: sp.sel });
  const admin = isAdmin(actor);
  const view = v.view;
  const explained = view ? view.words.filter((w) => w.card).length : 0;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: admin ? "/admin" : "/teacher", label: "Home" }} icon="📗" title="Words" subtitle={t("An explanation for every vocabulary word of the Curriculum Map. Students see the same cards.")} />
      <LearnTabs active="words" admin={admin} />
      <Flash msg={sp.msg} err={sp.err} />
      <WordsFilter base="/teacher/learn/words" grades={v.grades} grade={v.grade} units={v.units} unit={v.unit} selections={v.selections} sel={view?.sel.key ?? null} />
      {view ? (
        <section aria-labelledby="sel-title" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="sel-title" className="text-xl text-ink">{t("Grade {g} · Unit {u}", { g: view.sel.grade, u: view.sel.unit })} · <span lang="en">{view.sel.name}</span></h2>
              <p className="text-sm text-muted">{t("{x} of {y} words explained", { x: explained, y: view.words.length })}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link prefetch={false} href={`/teacher/learn/assign?${new URLSearchParams({ kind: "WORDS", ref: view.sel.key })}`} className="inline-flex min-h-10 items-center rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white">⭐ {t("Assign these words")}</Link>
              <Link prefetch={false} href={`/teacher/learn/${encodeURIComponent(view.sel.key)}/results?kind=WORDS`} className={btn}>📊 {t("Results")}</Link>
            </div>
          </div>
          <WordPractice sel={view.sel.key} questions={practiceQuestions(view)} preview answers={Object.fromEntries(view.words.filter((w) => w.card).map((w) => [w.word, w.card!.check.answer]))} />
          <ul className="grid gap-3 md:grid-cols-2">
            {view.words.map((w) => (
              <li key={w.key}>
                <WordCardView w={{ key: w.key, word: w.word, card: w.card, partial: w.partial, source: w.source }}>
                  <div className="mt-1 border-t border-line pt-2">
                    <p className="mb-2 text-xs font-semibold text-muted">{t(SOURCE[w.source] ?? "Original")}</p>
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-teal-ink">{w.card ? `✏️ ${t("Edit")}` : `✍️ ${t("Write")}`}</summary>
                      <div className="mt-2"><WordEditForm sel={view.sel.key} card={w.card} word={w.word} /></div>
                    </details>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(w.source === "MINE" || (admin && w.source === "SCHOOL")) && <form action={restoreWordAction}><input type="hidden" name="sel" value={view.sel.key} /><input type="hidden" name="key" value={w.key} /><button className={btn}>↺ {t("Restore original")}</button></form>}
                      <details>
                        <summary className="cursor-pointer text-sm font-semibold text-muted">⚑ {t("Report a problem")}</summary>
                        <form action={reportAction} className="mt-2 flex flex-wrap gap-2">
                          <input type="hidden" name="kind" value="WORD" /><input type="hidden" name="ref" value={w.key} /><input type="hidden" name="level" value="0" /><input type="hidden" name="back" value={`/teacher/learn/words?sel=${encodeURIComponent(view.sel.key)}`} />
                          <input name="text" required minLength={5} maxLength={1000} aria-label={t("What is wrong?")} placeholder={t("What is wrong?")} className="min-w-[12rem] flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
                          <button className={btn}>{t("Send")}</button>
                        </form>
                      </details>
                    </div>
                  </div>
                </WordCardView>
              </li>
            ))}
          </ul>
          <details className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
            <summary className="cursor-pointer font-semibold text-ink">➕ {t("Add a word to this selection")}</summary>
            <div className="mt-3"><WordEditForm sel={view.sel.key} card={null} newWord /></div>
          </details>
        </section>
      ) : <p className="rounded-2xl bg-surface p-6 text-center text-muted ring-1 ring-line">{t("Choose a selection to see its words.")}</p>}
    </AppShell>
  );
}
