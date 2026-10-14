import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { EmptyState, ReportHeader, ReportSection } from "@/components/report-kit";
import { RepeatedMistakes } from "@/components/teacher/repeated-mistakes";
import { InsightActions } from "@/components/teacher/insight-actions";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { readableClasses } from "@/server/teacher/coordinators";
import { classErrors } from "@/server/insights/error-patterns";
import { repeatedMistakes } from "@/server/teacher/repeated-mistakes";
import { AssignSkillHost } from "../../assign-dialog";

export const metadata = { title: "Mistakes and root causes" };

const lowerFirst = (x: string) => (x ? x[0].toLowerCase() + x.slice(1) : x);

/**
 * 🔍 Mistakes and root causes (Reports → My class): the class's mistakes in plain words —
 *   class-wide (shared by 40 %+ of the class) → "Re-teach to the whole class" with the Learn lesson;
 *   each student's main mistake ("Ahmed confuses … — 5 of the last 8 wrong answers") with the action buttons;
 *   the real gaps underneath (a weak prerequisite skill) grouped, with "Assign Key Details" for those students;
 *   repeated mistakes (the same question wrong twice) — the former "Needs help" report, merged here.
 * The class comes from the report bar's class switcher. Own / readable classes only.
 */
export default async function ErrorsReport({ searchParams }: { searchParams: Promise<{ classId?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const classes = (await readableClasses(repo, actor)).map((c) => ({ id: String(c.id), name: String(c.name) })).sort((a, b) => a.name.localeCompare(b.name));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const teacher = actor.role === "TEACHER";
  const [v, repeated] = klass ? await Promise.all([classErrors(repo, actor, klass.id), repeatedMistakes(repo, actor, { classId: klass.id }).catch(() => [])]) : [null, []];
  const names = v?.names ?? new Map<string, string>();
  const nameList = (ids: string[]) => ids.map((id) => names.get(id) ?? "Student").join(", ");
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: "/teacher/reports", label: "Reports" }} icon="🔍" title="Mistakes and root causes" who={klass ? <bdi>{klass.name}</bdi> : undefined}
        subtitle="What each student gets wrong, in plain words, and the real gap underneath." />
      {!klass || !v ? <EmptyState icon="🏫" title="You do not teach any class yet." /> : (
        <>
          <ReportSection title="Re-teach to the whole class" icon="📣" hint={t("Mistakes shared by 40% or more of the class.")}>
            {!v.classWide.length ? <p className="text-sm text-slate-600">{t("No mistake is shared by most of the class.")}</p> : (
              <ul className="space-y-3">{v.classWide.map((p) => (
                <li key={p.code} className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
                  <p className="font-semibold text-rose-950">{t("{n} of {m} students {mistake}.", { n: p.students.length, m: v.size, mistake: lowerFirst(p.label) })}</p>
                  <p className="mt-1 text-sm text-rose-900">💡 <span data-content lang="en">{p.fix}</span></p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.lesson && <Link prefetch={false} href={`/teacher/learn/assign?${new URLSearchParams({ kind: "LESSON", skillId: p.lesson.skillId, classId: v.classId })}`} className="inline-flex min-h-9 items-center rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white hover:opacity-90">📘 {t("Re-teach to the whole class")} · <span className="ms-1" data-content lang="en">{p.lesson.name}</span></Link>}
                    <InsightActions t={t} target={{ classId: v.classId, studentIds: p.students, skillId: p.lesson?.skillId ?? null }} only={["plan", "group", "reteach"]} />
                  </div>
                </li>
              ))}</ul>
            )}
          </ReportSection>

          <ReportSection title="The real gap underneath" icon="🧱" hint={t("A weak skill that the struggling skill depends on: fix it first.")}>
            {!v.gaps.length ? <p className="text-sm text-slate-600">{t("No gap underneath right now.")}</p> : (
              <ul className="space-y-3">{v.gaps.map((g) => (
                <li key={g.prereqId} className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-200">
                  <p className="font-semibold text-sky-950">{g.avgMastery !== null ? t("The real gap is {skill} ({pct}%), which {target} depends on.", { skill: g.prereqName, pct: g.avgMastery, target: g.skillName }) : t("The real gap is {skill}, which {target} depends on.", { skill: g.prereqName, target: g.skillName })}</p>
                  <p className="mt-1 text-sm text-sky-900">{t("Students")}: <bdi>{nameList(g.students)}</bdi></p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Link prefetch={false} href={`/teacher/skill-assign?${new URLSearchParams({ skillId: g.prereqId, classId: v.classId })}`} className="inline-flex min-h-9 items-center rounded-lg bg-brand-navy px-3 text-sm font-semibold text-white hover:opacity-90">{t("Assign {skill}", { skill: g.prereqName })}</Link>
                    <InsightActions t={t} target={{ classId: v.classId, studentIds: g.students, skillId: g.prereqId }} only={["group", "lesson"]} />
                  </div>
                </li>
              ))}</ul>
            )}
          </ReportSection>

          <ReportSection title="Each student's main mistake" icon="🧑‍🎓">
            {!v.sentences.length ? <p className="text-sm text-slate-600">{t("No repeated mistake right now.")}</p> : (
              <ul className="space-y-2">{v.sentences.map((e) => (
                <li key={e.studentId} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                  <p className="text-slate-800"><Link prefetch={false} href={`/teacher/students/${e.studentId}`} className="font-semibold text-brand-navy hover:underline"><bdi>{e.name.split(" ")[0]}</bdi></Link> {t("{mistake} — {n} of the last {m} wrong answers.", { mistake: lowerFirst(e.label), n: e.count, m: e.of })}</p>
                  <InsightActions t={t} target={{ classId: v.classId, studentId: e.studentId }} className="mt-2" />
                </li>
              ))}</ul>
            )}
          </ReportSection>

          <ReportSection title="Repeated mistakes" icon="🧡" hint={t("Skills where a student answered the same question wrong twice.")}>
            <RepeatedMistakes rows={repeated} canAssign={teacher} />
          </ReportSection>
          {teacher && repeated.length > 0 && <AssignSkillHost classId={v.classId} className={v.className} students={[...names].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))} />}
        </>
      )}
    </AppShell>
  );
}
