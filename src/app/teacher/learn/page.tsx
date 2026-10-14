import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Flash, LearnTabs } from "@/components/learn/teacher-tabs";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { teacherLessons } from "@/server/learn/teacher";
import { ensureLearnLessons } from "@/server/learn/load";
import { isAdmin } from "@/server/learn/edits";
import { getT } from "@/i18n/server";
import { autoPanel } from "@/server/learn/auto";
import { AutoPanel } from "@/components/learn/auto-panel";
import { StarAssign } from "@/components/assign/star-assign";
import { endOfSchoolWeek, starredLessons } from "@/server/assign/star";
import { accessibleClasses } from "@/server/teacher/assign";

export const metadata = { title: "Learn" };

type SP = { area?: string; subtopic?: string; standard?: string; q?: string; msg?: string; err?: string; classId?: string };
const btn = "inline-flex min-h-9 items-center rounded-lg bg-surface px-3 text-sm font-semibold text-ink ring-1 ring-line hover:ring-brand-teal";
const field = "mt-1 block min-h-10 w-full rounded-lg border border-line bg-surface px-2";

/**
 * 📘 Learn (teacher and admin): ALL lessons, filtered by goal area, sub-topic, standard or a search → Preview (exactly as
 * the student sees it), Edit, Assign (a student, several, a group or a class), Results. Lesson files are read from
 * memory; nothing here reads a lesson's text from the database. At the top: "Sent automatically" (learn/auto.ts).
 */
export default async function TeacherLearnPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  void ensureLearnLessons(repo, actor.schoolId);
  const { t } = await getT();
  const sp = await searchParams;
  const [v, auto] = await Promise.all([
    teacherLessons(repo, actor, { area: sp.area || null, subtopic: sp.subtopic || null, standard: sp.standard || null, q: sp.q || null }),
    autoPanel(repo, actor),
  ]);
  const admin = isAdmin(actor);
  // ☆ quick assign of a lesson to one of my classes (owner r67): the class (first by name, or ?classId=) and its open lessons
  const myClasses = actor.role === "TEACHER" ? (await accessibleClasses(repo, actor)).map((c) => ({ id: String(c.id), name: String(c.name) })).sort((a, b) => a.name.localeCompare(b.name)) : [];
  const starClass = myClasses.find((c) => c.id === sp.classId) ?? myClasses[0] ?? null;
  const starred = starClass ? await starredLessons(repo, starClass.id, v.lessons.filter((l) => l.ready && !l.hidden).map((l) => l.code)) : new Map<string, string>();
  const due = endOfSchoolWeek(new Date());
  const keep = (classId: string) => `/teacher/learn?${new URLSearchParams(Object.entries({ area: sp.area, subtopic: sp.subtopic, standard: sp.standard, q: sp.q, classId }).filter(([, x]) => x) as [string, string][])}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: admin ? "/admin" : "/teacher", label: "Home" }} icon="📘" title="Learn" subtitle={t("Short lessons that explain every skill in 4 levels. Preview a lesson exactly as your students see it, edit it, assign it and see the results.")} />
      <LearnTabs active="lessons" admin={admin} />
      <Flash msg={sp.msg} err={sp.err} />
      <AutoPanel v={auto} />
      <form method="get" className="mb-5 grid gap-3 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm">{t("Goal area")}<select name="area" defaultValue={sp.area ?? ""} className={field}><option value="">{t("All")}</option>{v.areas.map((a) => <option key={a} value={a}>{t(a)}</option>)}</select></label>
        <label className="text-sm lg:col-span-2">{t("Sub-topic")}<select name="subtopic" defaultValue={sp.subtopic ?? ""} className={field}><option value="">{t("All")}</option>{v.subtopics.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
        <label className="text-sm">{t("Standard")}<input name="standard" list="learn-standards" defaultValue={sp.standard ?? ""} placeholder="RI.4.2" className={field} dir="ltr" /></label>
        <label className="text-sm">{t("Search")}<input name="q" type="search" defaultValue={sp.q ?? ""} className={field} /></label>
        <datalist id="learn-standards">{v.standards.map((s) => <option key={s} value={s} />)}</datalist>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-5"><button className="min-h-10 rounded-lg bg-brand-navy px-4 font-semibold text-white">{t("Show")}</button><Link href="/teacher/learn" className={btn}>{t("Clear")}</Link></div>
      </form>
      {admin && v.invalid.length > 0 && (
        <details className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200">
          <summary className="cursor-pointer font-semibold">{t("{n} lesson file(s) skipped: they have problems", { n: v.invalid.length })}</summary>
          <ul className="mt-2 space-y-1" dir="ltr">{v.invalid.map((x) => <li key={x.file}><b>{x.file}</b>: {x.problems.slice(0, 3).join("; ")}</li>)}</ul>
        </details>
      )}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted">
        <span>{t("{n} lessons", { n: v.lessons.length })}</span>
        {starClass && <span className="ms-auto">☆ {t("Quick assign to")}:</span>}
        {myClasses.length > 1 ? myClasses.map((c) => <Link key={c.id} prefetch={false} href={keep(c.id)} aria-current={c.id === starClass?.id ? "page" : undefined} className={`inline-flex min-h-8 items-center rounded-full px-3 font-semibold ${c.id === starClass?.id ? "bg-brand-navy text-white" : "bg-surface ring-1 ring-line"}`}>{c.name}</Link>) : starClass && <b>{starClass.name}</b>}
      </div>
      {v.lessons.length ? (
        <ul className="grid gap-3 lg:grid-cols-2">
          {v.lessons.map((l) => (
            <li key={l.code} className="flex flex-col gap-2 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
              <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted">
                <span dir="ltr">{l.code}</span><span>· {t(l.goalArea)}</span>{l.hidden && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-800 ring-1 ring-rose-200">{t("Hidden")}</span>}
              </p>
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 font-display text-lg text-ink" lang="en">{l.title}</p>
                {starClass && l.ready && !l.hidden && <StarAssign kind="LESSON" refId={l.code} classId={starClass.id} assignedId={starred.get(l.code) ?? null} defaultDue={due} label={l.title} />}
              </div>
              {l.summary && <p className="text-sm text-ink-2" lang="en">{l.summary}</p>}
              <p className="text-xs text-muted" dir="ltr">{l.subtopic}{l.standards.length ? ` · ${l.standards.slice(0, 6).join(" ")}${l.standards.length > 6 ? " …" : ""}` : ""}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Link prefetch={false} href={`/teacher/learn/${l.code}`} className={btn}>👀 {t("Preview")}</Link>
                <Link prefetch={false} href={`/teacher/learn/${l.code}?edit=1`} className={btn}>✏️ {t("Edit")}</Link>
                <Link prefetch={false} href={`/teacher/learn/assign?${new URLSearchParams({ kind: "LESSON", ref: l.code })}`} className={btn}>⭐ {t("Assign")}</Link>
                <Link prefetch={false} href={`/teacher/learn/${l.code}/results`} className={btn}>📊 {t("Results")}</Link>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="rounded-2xl bg-surface p-6 text-center text-muted ring-1 ring-line">{t("No lesson matches. Clear the filters, or load the lessons (Admin → Load new questions → Learn lessons).")}</p>}
    </AppShell>
  );
}
