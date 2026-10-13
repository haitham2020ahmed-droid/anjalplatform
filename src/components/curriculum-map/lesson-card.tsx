"use client";
import Link from "next/link";
import { useT } from "@/i18n/client";
import { BTN } from "@/components/ui-kit/tokens";
import dynamic from "next/dynamic";

// ⚡ staff-only buttons (Assign / Send): loaded only when shown, so the students' Curriculum Map never downloads them
const MapAssignButton = dynamic(() => import("./assign-button").then((m) => m.MapAssignButton));
const SendPlanButton = dynamic(() => import("./send-plan").then((m) => m.SendPlanButton));

export interface LessonCardSection { code: string; title: string; ready: boolean; kind?: string | null }
/** the sections a teacher can assign from the map (⭐ Assign beside each) */
const ASSIGNABLE = new Set(["CONCEPT_VOCABULARY", "ANALYZE_CRAFT_AND_STRUCTURE", "RESPOND_TO_READING", "REVIEW"]);
const ASSIGNABLE_TITLE = /concept vocabulary|analy[sz]e craft|respond to reading/i;
export interface LessonCardData { code: string; name: string; genre: string | null; textIdea: string | null; vocabulary: string[]; vocabularySkill: string | null; readingSkills: string[]; sections: LessonCardSection[] }

/**
 * One lesson of the Curriculum Map: name, genre, Text Idea, vocabulary words and its sections.
 * Staff see Ready / Not ready on each section and one Preview button; students see the same card without them.
 * Lesson content stays English (data-content lang="en").
 */
export function LessonCard({ lesson, previewHref, showStatus = true, canAssign = false, respondSets, respondClassId, compact = false, sent, canSend = false }: { /** 📘 "Send this selection" (opens the page's Send window) */ canSend?: boolean; lesson: LessonCardData; previewHref?: string | null; showStatus?: boolean; canAssign?: boolean; /** Respond to Reading Text Sets with a writing task (G4.U1.TS1.RTR) */ respondSets?: string[]; respondClassId?: string | null; /** staff map: one short row per section (Review · Assign · ✓ Sent) */ compact?: boolean; /** section code → the date this teacher sent it (yyyy-mm-dd) */ sent?: Record<string, string> }) {
  // Respond to Reading is a writing task: its Assign opens the Respond to Reading assign page (Below / On / Above)
  const isRtr = (sec: LessonCardSection) => sec.kind === "RESPOND_TO_READING" || /respond to reading/i.test(sec.title);
  const rtrCode = (sec: LessonCardSection) => (sec.code.match(/^(G\d+\.U\d+\.(?:TS|SEL)\d+\.RTR)/i)?.[1] ?? "").toUpperCase();
  const rtrReady = (sec: LessonCardSection) => Boolean(rtrCode(sec) && respondSets?.includes(rtrCode(sec)));
  const t = useT();
  if (compact) return <CompactLesson lesson={lesson} canAssign={canAssign} canSend={canSend} sent={sent ?? {}} isRtr={isRtr} rtrCode={rtrCode} rtrReady={rtrReady} respondClassId={respondClassId ?? null} />;
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
        {lesson.sections.map((s0) => ({ ...s0, ready: s0.ready || rtrReady(s0) })).map((s) => (
          <li key={s.code} className="flex min-h-10 items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-1.5">
            <span className="font-medium text-slate-800" data-content lang="en">{s.title}</span>
            <span className="flex shrink-0 items-center gap-1">
              {showStatus && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.ready ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>{t(s.ready ? "Ready" : "Not ready")}</span>}
              {canAssign && isRtr(s) && rtrReady(s) && respondClassId
                ? <Link href={`/teacher/respond/assign?classId=${encodeURIComponent(respondClassId)}&code=${encodeURIComponent(rtrCode(s))}`} prefetch={false} className="ms-1 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900 ring-1 ring-amber-300 hover:bg-amber-200">⭐ {t("Assign")}</Link>
                : canAssign && s.ready && !isRtr(s) && (ASSIGNABLE.has(String(s.kind ?? "")) || ASSIGNABLE_TITLE.test(s.title)) && <MapAssignButton code={s.code} label={t("Assign")} levels />}
            </span>
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

/**
 * 🧭 The compact lesson (staff Curriculum Map): name · genre on one line, skills under it, the Text Idea and the
 * vocabulary folded under "More", and one short row per section: Ready · 👁 Review · ⭐ Assign · ✓ Sent.
 */
function CompactLesson({ lesson, canAssign, canSend, sent, isRtr, rtrCode, rtrReady, respondClassId }: { lesson: LessonCardData; canAssign: boolean; canSend: boolean; sent: Record<string, string>; isRtr: (s: LessonCardSection) => boolean; rtrCode: (s: LessonCardSection) => string; rtrReady: (s: LessonCardSection) => boolean; respondClassId: string | null }) {
  const t = useT();
  const pill = "inline-flex min-h-8 items-center rounded-full px-2.5 text-xs font-bold ring-1";
  return (
    <article data-testid="map-lesson" className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div data-content lang="en" className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="font-semibold text-slate-900">{lesson.name}</h3>
          {lesson.genre && <span className="text-xs font-medium text-blue-800">{lesson.genre}</span>}
        </div>
        {canSend && <SendPlanButton kind="SELECTION" codes={[lesson.code]} label="Send this selection" small />}
      </div>
      {(lesson.vocabularySkill || lesson.readingSkills.length > 0) && <p data-content lang="en" className="mt-0.5 text-xs text-slate-500">{[lesson.vocabularySkill, ...lesson.readingSkills].filter(Boolean).join(" · ")}</p>}
      {(lesson.textIdea || lesson.vocabulary.length > 0) && (
        <details className="mt-1 text-xs">
          <summary className="cursor-pointer font-semibold text-slate-500">{t("More")}</summary>
          <div data-content lang="en" className="mt-1">
            {lesson.textIdea && <p className="leading-relaxed text-slate-700">{lesson.textIdea}</p>}
            {lesson.vocabulary.length > 0 && <p className="mt-1 text-blue-900">{lesson.vocabulary.join(" · ")}</p>}
          </div>
        </details>
      )}
      <ul className="mt-2 divide-y divide-slate-100">
        {lesson.sections.map((s0) => ({ ...s0, ready: s0.ready || rtrReady(s0) })).map((s) => {
          const sentOn = sent[s.code.toUpperCase()];
          const canReview = s.ready && !isRtr(s);
          return (
            <li key={s.code} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span className="text-sm font-medium text-slate-800" data-content lang="en">{s.title}</span>
              <span className="flex flex-wrap items-center gap-1">
                {!s.ready && <span className={`${pill} bg-slate-100 text-slate-500 ring-slate-200`}>{t("Not ready")}</span>}
                {sentOn && <span data-testid="map-sent" title={sentOn} className={`${pill} bg-emerald-50 text-emerald-800 ring-emerald-200`}>✓ {t("Sent")} {sentOn.slice(5).replace("-", "/")}</span>}
                {canReview && <Link href={`/teacher/preview?code=${encodeURIComponent(s.code)}`} prefetch={false} className={`${pill} bg-white text-brand-navy ring-slate-300 hover:bg-slate-50`}>👁 {t("Review")}</Link>}
                {canAssign && isRtr(s) && rtrReady(s) && respondClassId
                  ? <Link href={`/teacher/respond/assign?classId=${encodeURIComponent(respondClassId)}&code=${encodeURIComponent(rtrCode(s))}`} prefetch={false} className={`${pill} bg-amber-100 text-amber-900 ring-amber-300 hover:bg-amber-200`}>⭐ {t("Assign")}</Link>
                  : canAssign && s.ready && !isRtr(s) && (ASSIGNABLE.has(String(s.kind ?? "")) || ASSIGNABLE_TITLE.test(s.title)) && <MapAssignButton code={s.code} label={t(sentOn ? "Send again" : "Assign")} levels />}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
