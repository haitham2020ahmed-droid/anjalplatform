import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import { gradingStudents, studentWritings, teacherReadRiseClasses, TEACHER_BADGES, WRITING_POINTS, WRITING_RUBRIC } from "@/server/readrise/teacher";
import { ReadRiseTabs, TEACHER_TABS } from "@/app/admin/readrise/_components/tabs";
import { btn, field, Flash } from "@/app/admin/readrise/_components/ui";
import { gradeReadRiseWritingAction } from "../actions";

export const metadata = { title: "ReadRise Grading Center" };

/**
 * ✍️ ReadRise Grading Center (round 6, Achieve3000-style): class → student → their written answers (newest first):
 * the prompt, the answer with its submit time (Riyadh), a 4-row rubric (0–3), the points (5 okay / 10 good / 20
 * thoughtful), Teacher Feedback and badges. The student sees the score and the feedback.
 */
export default async function ReadRiseGrading({ searchParams }: { searchParams: Promise<{ class?: string; student?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [classes, { t }] = await Promise.all([teacherReadRiseClasses(repo, actor), getT()]);
  const klass = classes.find((c) => c.id === sp.class) ?? classes.find((c) => c.own) ?? classes[0];
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const students = klass ? await gradingStudents(repo, actor, klass.id) : [];
  const studentId = students.find((x) => x.studentId === sp.student)?.studentId ?? students.find((x) => x.toGrade > 0)?.studentId ?? null;
  const writings = klass && studentId ? await studentWritings(repo, actor, klass.id, studentId) : [];
  const canWrite = !!klass?.own;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: klass ? `/teacher/readrise?class=${klass.id}&tab=writing` : "/teacher/readrise", label: "ReadRise" }} icon="✍️" title={t("Grading Center")}
        subtitle={t("Score each written answer with the rubric, choose the points and write feedback. The student sees your score and feedback.")}>
        <ReadRiseTabs items={TEACHER_TABS} current="/teacher/readrise/grading" />
      </PageHeader>
      <Flash msg={sp.msg} />
      {!klass ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{t("You have no classes yet.")}</p> : (
        <div className="space-y-5">
          <nav aria-label={t("Class")} className="flex flex-wrap gap-2">
            {classes.map((c) => <Link key={c.id} href={`/teacher/readrise/grading?class=${c.id}`} className={chip(c.id === klass.id)}>{c.name}</Link>)}
          </nav>
          <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <Section title="Students" icon="👩‍🎓">
              {students.length === 0 ? <p className="text-sm text-slate-600">{t("No students in this class yet.")}</p> : (
                <ul className="space-y-1" data-testid="rr-grading-students">
                  {students.map((x) => (
                    <li key={x.studentId}>
                      <Link href={`/teacher/readrise/grading?class=${klass.id}&student=${x.studentId}`} aria-current={x.studentId === studentId ? "page" : undefined}
                        className={`flex items-center justify-between rounded-lg px-3 py-1.5 text-sm ${x.studentId === studentId ? "bg-brand-navy text-white" : "hover:bg-slate-50"}`}>
                        <span className="truncate font-semibold">{x.name}</span>
                        {x.toGrade > 0 && <span className="ms-2 rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-900">{x.toGrade}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <div className="space-y-4">
              {!studentId ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{t("Choose a student.")}</p>
                : writings.length === 0 ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">{t("No written answers yet.")}</p>
                : writings.map((w) => (
                  <article key={w.runId} data-testid="rr-grading-item" className={`rounded-2xl bg-white p-5 ring-1 ${w.score === null ? "ring-amber-300" : "ring-slate-200"}`}>
                    <header className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="text-lg font-bold text-brand-navy">{w.title}</h2>
                      <p className="text-xs text-slate-500">{t("Submitted {d} (Riyadh)", { d: w.submittedRiyadh ?? "—" })}{w.score !== null ? ` · ${t("Scored {n}/4", { n: w.score })}` : ""}</p>
                    </header>
                    <p className="mt-2 text-sm text-slate-700"><b>{t("Prompt")}:</b> {w.prompt || "—"}</p>
                    <p className="mt-2 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-slate-900">{w.writing}</p>
                    {w.aiScore !== null && w.score === null && <p className="mt-2 rounded-lg bg-indigo-50 p-2 text-xs text-indigo-900 ring-1 ring-indigo-200">🤖 {t("AI suggestion — check before saving:")} {w.aiScore}/4{w.aiComment ? ` · "${w.aiComment}"` : ""}</p>}
                    {canWrite ? (
                      <form action={gradeReadRiseWritingAction} className="mt-4 space-y-4 text-sm">
                        <input type="hidden" name="classId" value={klass.id} /><input type="hidden" name="studentId" value={studentId} /><input type="hidden" name="runId" value={w.runId} />
                        <fieldset>
                          <legend className="mb-1 font-semibold">{t("Rubric")} <span className="font-normal text-slate-500">(0–3)</span></legend>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {WRITING_RUBRIC.map((row, i) => (
                              <label key={row} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                                <span>{t(row)}</span>
                                <select name={`rubric${i}`} defaultValue={String(w.rubric?.[i] ?? 0)} className={field}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <fieldset>
                          <legend className="mb-1 font-semibold">{t("Points")}</legend>
                          <div className="flex flex-wrap gap-2">
                            {WRITING_POINTS.map((p) => (
                              <label key={p.points} className="cursor-pointer">
                                <input type="radio" name="points" value={p.points} required defaultChecked={w.points === p.points || (w.points === null && w.score === p.score)} className="peer sr-only" />
                                <span className="block rounded-lg px-3 py-1.5 font-semibold ring-1 ring-slate-300 peer-checked:bg-brand-navy peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-teal">{p.points} · {t(p.label)}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <label className="flex flex-col gap-1 font-semibold">{t("Teacher Feedback")}
                          <textarea name="comment" maxLength={1000} rows={3} defaultValue={w.comment ?? w.aiComment ?? ""} className={field} placeholder={t("One thing done well, one thing to improve")} />
                        </label>
                        <fieldset>
                          <legend className="mb-1 font-semibold">{t("Badges")} <span className="font-normal text-slate-500">({t("optional")})</span></legend>
                          <div className="flex flex-wrap gap-2">
                            {TEACHER_BADGES.map((b) => (
                              <label key={b} className="cursor-pointer">
                                <input type="checkbox" name="badges" value={b} defaultChecked={w.badges.includes(b)} className="peer sr-only" />
                                <span className="block rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-slate-300 peer-checked:bg-amber-400 peer-checked:text-amber-950 peer-checked:ring-amber-500">🏅 {t(b)}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                        <button className={btn}>{w.score === null ? t("Submit") : t("Update")}</button>
                      </form>
                    ) : <p className="mt-2 text-xs text-slate-500">{t("Only the class's teachers score.")}</p>}
                  </article>
                ))}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
