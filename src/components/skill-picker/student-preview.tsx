"use client";
import { useT } from "@/i18n/client";
import { previewQuestions, type PickerValue } from "./helpers";
import { useSkillQuestions } from "./load";

/**
 * "Preview as student": the first questions as the student will see them — the stem and the choices only
 * (no answer, no level name).
 */
export function StudentPreview({ skillId, value, n = 3 }: { skillId: string; value: PickerValue; n?: number }) {
  const t = useT();
  const { list, failed } = useSkillQuestions(skillId, true);
  const items = list ? previewQuestions(list, value, n) : [];
  return (
    <section aria-label={t("Preview as student")} className="grid gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <p className="text-sm text-slate-600">{t(value.auto ? "Examples: each student gets questions at their own level." : "The first questions your students will see.")}</p>
      {failed ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-red-800">{t("The questions could not be loaded. Please try again.")}</p>
        : !list ? <p className="text-slate-500" aria-busy="true">{t("Loading questions…")}</p>
        : !items.length ? <p className="rounded-xl bg-white px-3 py-4 text-center text-slate-600">{t("This skill has no questions yet.")}</p>
        : (
          <ol className="grid gap-2">
            {items.map((q, i) => (
              <li key={q.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-semibold text-slate-500">{t("Question {n}", { n: i + 1 })}</p>
                <p className="mt-1 text-slate-900" lang="en" dir="ltr" data-content>{q.stem}</p>
                {q.choices?.length ? (
                  <ul className="mt-2 grid gap-1.5" lang="en" dir="ltr">
                    {q.choices.map((c, j) => <li key={j} className="flex min-h-11 items-center rounded-xl px-3 ring-1 ring-slate-300">{String.fromCharCode(65 + j)}. {c}</li>)}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        )}
    </section>
  );
}
