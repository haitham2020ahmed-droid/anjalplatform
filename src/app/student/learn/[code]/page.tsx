import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PreviewFrame } from "@/components/student/preview-frame";
import { EmptyState } from "@/components/ui-kit";
import { LessonPlayer } from "@/components/learn/lesson-player";
import { repo, requireActor } from "@/server/auth/next";
import { studentPage } from "@/server/auth/student-page";
import { studentLesson } from "@/server/learn/student";
import { SkillStar } from "@/components/skills/skill-star";
import { starOfSkill } from "@/server/skills/status";
import { safeIfBehind } from "@/server/db/schema-errors";
import { getT } from "@/i18n/server";

export const metadata = { title: "Learn" };

/**
 * 📘 One Learn lesson (student): ONE lesson file read from memory, the version the student's teachers chose, at the
 * level chosen for this student (never shown). The player marks the 3 checks on the server.
 */
export default async function StudentLessonPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { actor, me, preview } = await studentPage((await searchParams).preview, () => requireActor({ roles: ["STUDENT"] }));
  const { code } = await params;
  const v = await studentLesson(repo, actor, decodeURIComponent(code)).catch((e) => { console.error("learn lesson", e); return null; });
  // ⭐ the lesson's skill: the student's ONE status of it (Learn checks never give a star)
  const skillId = v?.practiceHref?.match(/^\/practice\/([^/?#]+)/)?.[1] ?? null;
  const [{ t }, star] = await Promise.all([getT(), skillId && actor.studentId ? safeIfBehind("learn.star", () => starOfSkill(repo, actor.studentId!, decodeURIComponent(skillId)), null) : Promise.resolve(null)]);
  return (
    <AppShell name={String(me.displayName)}><PreviewFrame preview={preview}>
      <PageHeader back={{ href: "/student/learn", label: "Learn" }} icon="📘" title={v?.title ?? "Learn"} />
      {v && star && <p data-testid="learn-star" className="mb-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-200"><SkillStar info={star} who="student" t={t} label={v.title} />{t("My star for this skill")}</p>}
      {v ? <LessonPlayer code={v.code} title={v.title} content={v.content} mode={preview ? "preview" : "student"} practiceHref={v.practiceHref} />
        : <EmptyState icon="📘" title="This lesson is not available." action={{ href: "/student/learn", label: "Learn" }} />}
    </PreviewFrame></AppShell>
  );
}
