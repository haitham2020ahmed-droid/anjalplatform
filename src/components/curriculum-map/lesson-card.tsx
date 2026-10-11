"use client";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { BTN } from "@/components/ui-kit/tokens";

export interface LessonCardSection { code: string; title: string; ready: boolean }
export interface LessonCardData { code: string; name: string; genre: string | null; textIdea: string | null; vocabulary: string[]; vocabularySkill: string | null; readingSkills: string[]; sections: LessonCardSection[] }

/**
 * One lesson of the Curriculum Map: name, genre, Text Idea, vocabulary words and its sections.
 * Staff see Ready / Not ready on each section and one Preview button; students see the same card without them.
 * Lesson content stays English (data-content lang="en").
 */
export function LessonCard({ lesson, previewHref, showStatus = true }: { lesson: LessonCardData; previewHref?: string | null; showStatus?: boolean }) {
  const t = useT();
  return (
    <article className="flex flex-col rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div data-content lang="en">
        <h3 className="text-lg font-semibold text-slate-900">{lesson.name}</h3>
        {lesson.genre && <p className="mt-0.5 text-sm font-medium text-blue-800">{lesson.genre}</p>}
        {lesson.textIdea && <p className="mt-3 text-[15px] leading-relaxed text-slate-700">{lesson.textIdea}</p>}
        {lesson.vocabulary.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Vocabulary">
            {lesson.vocabulary.map((w) => <li key={w} className="rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-900 ring-1 ring-blue-100">{w}</li>)}
          </ul>
        )}
        {(lesson.vocabularySkill || lesson.readingSkills.length > 0) && (
          <p className="mt-3 text-sm text-slate-600">{[lesson.vocabularySkill, ...lesson.readingSkills].filter(Boolean).join(" · ")}</p>
        )}
      </div>
      <ul className="mt-4 space-y-1.5">
        {lesson.sections.map((s) => (
          <li key={s.code} className="flex min-h-10 items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-1.5">
            <span className="font-medium text-slate-800" data-content lang="en">{s.title}</span>
            {showStatus && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.ready ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>{t(s.ready ? "Ready" : "Not ready")}</span>}
          </li>
        ))}
      </ul>
      {previewHref && (
        <div className="mt-4">
          <Link href={previewHref} prefetch={false} className={`${BTN} bg-white text-brand-navy ring-1 ring-slate-300 hover:bg-slate-50`}>{t("Preview")}</Link>
        </div>
      )}
    </article>
  );
}
