import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Flash } from "@/components/learn/teacher-tabs";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentNames } from "@/server/insights/student-data";
import { lessonFile, selectionLabel } from "@/server/learn/files";
import { findSelection } from "@/server/learn/words";
import { lessonForSkill, myStudents } from "@/server/learn/teacher";
import { getT } from "@/i18n/server";
import { assignAction } from "../actions";
import { Combo } from "@/components/ui/combo";
import { AssignDates } from "@/components/assign/assign-dates";

export const metadata = { title: "Assign" };

type SP = { kind?: string; ref?: string; classId?: string; studentId?: string; skillId?: string; msg?: string; err?: string };
const field = "mt-1 block min-h-10 w-full rounded-lg border border-line bg-surface px-2";
/** The level groups as teachers name them (never shown to students). */
const GROUPS = [["BELOW", "Approaching group"], ["ON", "Meeting group"], ["ABOVE", "Exceeding group"]] as const;

/**
 * ⭐ Assign a Learn lesson (or a selection's words) to one student, several, a level group or a whole class, with an
 * optional level (1–4; automatic by default) and a due date. Opened from a lesson, the Words section, "Students who
 * need this lesson" and Early warning → "Send a lesson" (?skillId= picks the lesson linked to the student's skill).
 */
export default async function LearnAssignPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const kind = sp.kind === "WORDS" ? "WORDS" : "LESSON";
  let ref = sp.ref ?? "";
  if (!ref && sp.skillId) ref = (await lessonForSkill(repo, actor, sp.skillId)) ?? "";
  const lesson = kind === "LESSON" && ref ? lessonFile(ref) : null;
  const sel = kind === "WORDS" ? findSelection(ref) : null;
  const what = lesson ? lesson.title : sel ? selectionLabel(sel) : null;
  const { classes, members } = await myStudents(repo, actor);
  const sorted = [...classes].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const classId = sorted.some((c) => c.id === sp.classId) ? String(sp.classId) : sorted[0] ? String(sorted[0].id) : "";
  const ids = members.filter((m) => m.classId === classId).map((m) => String(m.studentId));
  const names = await studentNames(repo, ids);
  const kids = ids.map((id) => ({ id, name: names.get(id)?.name ?? "Student" })).sort((a, b) => a.name.localeCompare(b.name));
  const one = sp.studentId && ids.includes(sp.studentId) ? sp.studentId : null;
  const back = `/teacher/learn/assign?${new URLSearchParams(Object.entries({ kind, ref, classId, studentId: one ?? "" }).filter(([, v]) => v))}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={lesson ? { href: `/teacher/learn/${lesson.code}`, label: "Lesson" } : sel ? { href: `/teacher/learn/words?sel=${encodeURIComponent(sel.key)}`, label: "Words" } : { href: "/teacher/learn", label: "Learn" }} icon="⭐" title="Assign"
        subtitle={what ? <span lang="en">{kind === "WORDS" ? "📗 " : "📘 "}{what}</span> : undefined} />
      <Flash msg={sp.msg} err={sp.err} />
      {!what ? (
        <p className="rounded-2xl bg-surface p-6 text-muted ring-1 ring-line">{sp.skillId ? t("No lesson explains this skill yet.") : t("Choose a lesson first.")} <Link href="/teacher/learn" className="font-semibold text-teal-ink underline">{t("Learn")}</Link></p>
      ) : !sorted.length ? <p className="rounded-2xl bg-surface p-6 text-muted ring-1 ring-line">{t("You do not teach any class yet.")}</p> : (
        <div className="space-y-4">
          <form method="get" className="flex flex-wrap items-end gap-2 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
            <input type="hidden" name="kind" value={kind} /><input type="hidden" name="ref" value={ref} />
            <label className="text-sm">{t("Class")}<Combo name="classId" label={t("Class")} defaultValue={classId} submitOnChange options={sorted.map((c) => ({ value: String(c.id), label: String(c.name) }))} className="mt-1 min-w-52" /></label>
            <button className="min-h-10 rounded-lg bg-surface px-4 font-semibold text-ink ring-1 ring-line">{t("Show")}</button>
          </form>
          <form action={assignAction} className="space-y-4 rounded-2xl bg-surface p-4 shadow-card ring-1 ring-line">
            <input type="hidden" name="kind" value={kind} /><input type="hidden" name="ref" value={ref} /><input type="hidden" name="classId" value={classId} /><input type="hidden" name="back" value={back} />
            <fieldset>
              <legend className="font-semibold text-ink">{t("Who")}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="flex items-center gap-2 rounded-xl p-2 ring-1 ring-line"><input type="radio" name="target" value="CLASS" defaultChecked={!one} /> {t("The whole class")}</label>
                <label className="flex items-center gap-2 rounded-xl p-2 ring-1 ring-line"><input type="radio" name="target" value="GROUP" /> {t("A group")}
                  <select name="groupLevel" aria-label={t("Group")} className="ms-auto rounded-lg border border-line bg-surface px-1 py-1 text-sm">{GROUPS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select></label>
                <label className="flex items-center gap-2 rounded-xl p-2 ring-1 ring-line"><input type="radio" name="target" value="STUDENTS" defaultChecked={Boolean(one)} /> {t("Some students")}</label>
              </div>
              <ul className="mt-3 grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3" aria-label={t("Students")}>
                {kids.map((k) => <li key={k.id}><label className="flex min-h-10 items-center gap-2 rounded-lg px-2 hover:bg-surface-2"><input type="checkbox" name="studentIds" value={k.id} defaultChecked={k.id === one} /> <bdi>{k.name}</bdi></label></li>)}
              </ul>
              <p className="mt-1 text-xs text-muted">{t("The ticks count only when “Some students” is chosen.")}</p>
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              {kind === "LESSON" && <label className="text-sm">{t("Level")}<select name="level" defaultValue="" className={field}><option value="">{t("Automatic (from MAP or the platform)")}</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{t("Level {n}", { n })}</option>)}</select></label>}
            </div>
            <AssignDates t={t} field={field} />
            <button className="min-h-11 rounded-xl bg-brand-navy px-5 font-semibold text-white">⭐ {t("Assign")}</button>
          </form>
        </div>
      )}
    </AppShell>
  );
}
