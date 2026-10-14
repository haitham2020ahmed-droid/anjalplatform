import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Flash } from "@/components/learn/teacher-tabs";
import { LessonPlayer } from "@/components/learn/lesson-player";
import { LessonEditForm } from "@/components/learn/lesson-edit-form";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { isAdmin } from "@/server/learn/edits";
import { teacherLessonView } from "@/server/learn/teacher";
import { getT } from "@/i18n/server";
import { hideLessonAction, reportAction, restoreLessonAction } from "../actions";

export const metadata = { title: "Learn" };

type SP = { level?: string; edit?: string; msg?: string; err?: string };
const btn = "inline-flex min-h-10 items-center gap-1 rounded-xl bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line hover:ring-brand-teal";
const SOURCE: Record<string, string> = { FILE: "Original lesson", SCHOOL: "School version (approved by the admin)", MINE: "Your version — your classes see it", TEACHER: "A teacher's version" };

/**
 * 👀 Preview one lesson exactly as the student sees it (the same player; nothing is saved), with the level switch
 * 1–4 for the teacher only, and the teacher's tools: Assign, ✏️ Edit, ↺ Restore original, ⚑ Report a problem, Results,
 * Download PDF (admin: Hide / Show). Below: the skills it explains and "Students who need this lesson".
 */
export default async function TeacherLessonPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const code = decodeURIComponent((await params).code);
  const sp = await searchParams;
  const v = await teacherLessonView(repo, actor, code, sp.level ?? "2");
  const admin = isAdmin(actor);
  if (!v) return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/learn", label: "Learn" }} icon="📘" title="Learn" />
      <p className="rounded-2xl bg-surface p-6 text-muted ring-1 ring-line">{t("This lesson is not available.")}</p>
    </AppShell>
  );
  const editing = sp.edit === "1";
  const lv = (n: string) => `/teacher/learn/${code}?${new URLSearchParams({ level: n, ...(editing ? { edit: "1" } : {}) })}`;
  const back = `/teacher/learn/${code}?level=${v.level}`;
  const canRestore = v.version.source === "MINE" || (admin && v.version.source === "SCHOOL");
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/learn", label: "Learn" }} icon="📘" title={v.meta.title}
        subtitle={<span dir="ltr">{v.meta.code} · {v.meta.goalArea} · {v.meta.subtopic}</span>} />
      <Flash msg={sp.msg} err={sp.err} />
      <section className="mb-5 rounded-2xl bg-amber-50 p-4 text-amber-950 ring-1 ring-amber-200 print:hidden" aria-label={t("Teacher view")}>
        <p><b>{t("Teacher view")}</b> · {t("This is the same lesson your students see. Students get their level automatically and never see it.")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{t("Level")}</span>
          <span className="flex rounded-full bg-surface p-1 ring-1 ring-line">
            {["1", "2", "3", "4"].map((n) => <Link key={n} prefetch={false} href={lv(n)} aria-current={v.level === n ? "page" : undefined} className={`min-h-9 min-w-10 rounded-full px-3 py-1.5 text-center text-sm font-semibold ${v.level === n ? "bg-brand-navy text-white" : "text-ink-2"}`}>{n}</Link>)}
          </span>
          <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold ring-1 ring-line">{t(SOURCE[v.version.source] ?? "Original lesson")}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link prefetch={false} href={`/teacher/learn/assign?${new URLSearchParams({ kind: "LESSON", ref: code })}`} className="inline-flex min-h-10 items-center rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white">⭐ {t("Assign")}</Link>
          {editing ? <Link prefetch={false} href={back} className={btn}>👀 {t("Preview")}</Link> : <Link prefetch={false} href={`${back}&edit=1`} className="inline-flex min-h-10 items-center rounded-xl bg-[var(--lr-accent)] px-4 text-sm font-semibold text-[var(--lr-on-accent)]">✏️ {t("Edit lesson")}</Link>}
          {canRestore && <form action={restoreLessonAction}><input type="hidden" name="code" value={code} /><input type="hidden" name="level" value={v.level} /><button className={btn}>↺ {t("Restore original")}</button></form>}
          <Link prefetch={false} href={`/teacher/learn/${code}/results`} className={btn}>📊 {t("Results")}</Link>
          <Link prefetch={false} href={`/teacher/learn/${code}/print?level=${v.level}`} className={btn}>⬇️ {t("Download PDF")}</Link>
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold">⚑ {t("Report a problem")}</summary>
          <form action={reportAction} className="mt-2 flex flex-wrap gap-2">
            <input type="hidden" name="kind" value="LESSON" /><input type="hidden" name="ref" value={code} /><input type="hidden" name="level" value={v.level} /><input type="hidden" name="back" value={back} />
            <input name="text" required minLength={5} maxLength={1000} placeholder={t("What is wrong?")} aria-label={t("What is wrong?")} className="min-w-[14rem] flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm" />
            <button className={btn}>{t("Send")}</button>
          </form>
        </details>
        {admin && (
          <form action={hideLessonAction} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="code" value={code} /><input type="hidden" name="back" value={back} /><input type="hidden" name="hidden" value={v.meta.hidden ? "0" : "1"} />
            {!v.meta.hidden && <input name="reason" maxLength={300} placeholder={t("Why (optional)")} aria-label={t("Why (optional)")} className="min-w-[12rem] rounded-lg border border-line bg-surface px-3 py-2 text-sm" />}
            <button className={btn}>{v.meta.hidden ? `👁 ${t("Show the lesson again")}` : `🙈 ${t("Hide the lesson")}`}</button>
          </form>
        )}
      </section>
      {editing ? <LessonEditForm code={code} level={v.level} content={v.version.level} t={t} />
        : <LessonPlayer key={`${v.level}:${v.version.editId ?? "file"}`} code={code} title={v.meta.title} content={v.version.level} mode="preview" />}
      <div className="mt-6 grid gap-5 lg:grid-cols-2 print:hidden">
        <section className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
          <h2 className="mb-2 text-lg text-ink">{t("Skills this lesson explains")}</h2>
          {v.skills.length ? <ul className="space-y-1 text-sm">{v.skills.slice(0, 20).map((k) => <li key={k.id}><span lang="en">{k.name}</span> <span className="text-muted">· {t("Grade {n}", { n: k.grade })} · {t(k.rule)}</span></li>)}</ul> : <p className="text-sm text-muted">{t("No platform skill is linked yet.")}</p>}
        </section>
        <section className="rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
          <h2 className="mb-2 text-lg text-ink">{t("Students who need this lesson")}</h2>
          {v.needs.length ? (
            <ul className="divide-y divide-line text-sm">{v.needs.map((n) => (
              <li key={n.studentId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                <span><bdi>{n.name}</bdi> <span className="text-muted">· {n.className} · <span lang="en">{n.skill}</span> <span dir="ltr">{n.score}%</span></span></span>
                <Link prefetch={false} href={`/teacher/learn/assign?${new URLSearchParams({ kind: "LESSON", ref: code, classId: n.classId, studentId: n.studentId })}`} className={btn}>⭐ {t("Assign")}</Link>
              </li>))}</ul>
          ) : <p className="text-sm text-muted">{t("None of your students is weak on these skills right now.")}</p>}
        </section>
      </div>
    </AppShell>
  );
}
