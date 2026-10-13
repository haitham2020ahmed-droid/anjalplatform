import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import { BTN_SOFT } from "@/components/plans/plan-builder";
import { StatusChip } from "@/components/plans/editor-ui";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { loadPlan, type LoadedPlan } from "@/server/plans/editor";
import { fromSearchParams } from "@/server/plans/plan-form";
import { searchSkillsAnyGrade } from "@/server/plans/wizard";
import { bulkEditAction } from "../editor-actions";

export const metadata = { title: "Change several plans" };

const BOX = "min-h-11 rounded-xl border border-slate-300 bg-white px-3";

/** ⧉ One edit on several plans at once (e.g. the individual plans of several students): due date, note, goals, skills, counts. */
export default async function BulkPlansPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const { get, getAll } = fromSearchParams(await searchParams);
  const ids = [...new Set(getAll("id").filter(Boolean))].slice(0, 60);
  const plans: LoadedPlan[] = [];
  for (const id of ids) { try { plans.push(await loadPlan(repo, actor, id)); } catch (e) { if (!(e instanceof ForbiddenError || e instanceof ValidationError)) throw e; } }
  const q = String(get("q") ?? "").trim();
  const results = q ? await searchSkillsAnyGrade(repo, actor, q) : [];
  const skills = new Map<string, string>();
  for (const p of plans) for (const x of p.doc.sections) if (!x.placeCode && !skills.has(x.skillId)) skills.set(x.skillId, x.skillName);
  const hidden = plans.map((p) => <input key={String(p.row.id)} type="hidden" name="id" value={String(p.row.id)} />);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/plans", label: "Plans" }} icon="⧉" title="Change several plans" subtitle={t("One change, applied to every plan below. Sent plans are updated for their students; answers already given stay recorded.")} />
      {get("msg") && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{get("msg")}</p>}
      {!plans.length ? <EmptyState icon="⧉" title="No plans chosen" text="Tick plans in My plans first." action={{ href: "/teacher/plans", label: "Plans" }} /> : (
        <div className="space-y-5">
          <Section title="The plans" icon="📋">
            <ul className="divide-y divide-slate-100">
              {plans.map((p) => <li key={String(p.row.id)} className="flex flex-wrap items-center gap-2 py-2"><Link href={`/teacher/plans/${String(p.row.id)}`} className="font-semibold text-brand-navy hover:underline">{String(p.row.title)}</Link><StatusChip t={t} status={p.status} /><span className="text-sm text-slate-600">{String(p.klass.name)} · {t("{n} student(s)", { n: p.planStudents.length })}</span></li>)}
            </ul>
          </Section>
          <Section title="Dates, note and goals" icon="📝">
            <div className="grid gap-4 md:grid-cols-3">
              <form action={bulkEditAction} className="flex flex-col gap-2">{hidden}<input type="hidden" name="op" value="dueAt" /><label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Due date")}<input type="date" name="dueAt" className={BOX} /></label><button className={BTN_SOFT}>{t("Set for all")}</button></form>
              <form action={bulkEditAction} className="flex flex-col gap-2">{hidden}<input type="hidden" name="op" value="note" /><label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Note to students (optional)")}<input name="note" maxLength={1000} className={BOX} /></label><button className={BTN_SOFT}>{t("Set for all")}</button></form>
              <form action={bulkEditAction} className="flex flex-col gap-2">{hidden}<input type="hidden" name="op" value="goals" /><label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Goals")}<input name="goals" maxLength={1000} className={BOX} /></label><button className={BTN_SOFT}>{t("Set for all")}</button></form>
            </div>
          </Section>
          {skills.size > 0 && (
            <Section title="A skill in these plans" icon="🎯">
              <div className="grid gap-4 md:grid-cols-2">
                <form action={bulkEditAction} className="flex flex-wrap items-end gap-2">{hidden}<input type="hidden" name="op" value="count" />
                  <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold text-slate-700">{t("Skill")}<select name="skillId" className={BOX}>{[...skills].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
                  <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Number of questions")}<input type="number" name="count" min={1} max={50} defaultValue={10} className={`${BOX} w-24`} /></label>
                  <button className={BTN_SOFT}>{t("Set for all")}</button>
                </form>
                <form action={bulkEditAction} className="flex flex-wrap items-end gap-2">{hidden}<input type="hidden" name="op" value="removeSkill" />
                  <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-semibold text-slate-700">{t("Skill")}<select name="skillId" className={BOX}>{[...skills].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
                  <button className={`${BTN_SOFT} text-red-700`}>{t("Remove from all")}</button>
                </form>
              </div>
            </Section>
          )}
          <Section title="Add a skill to all" icon="➕">
            <form method="get" action="/teacher/plans/bulk" className="flex flex-wrap items-center gap-2">
              {plans.map((p) => <input key={String(p.row.id)} type="hidden" name="id" value={String(p.row.id)} />)}
              <input name="q" defaultValue={q} placeholder={t("e.g. main idea, inference, commas")} className={`${BOX} min-w-0 flex-1`} aria-label={t("Find a skill")} />
              <button className={BTN_SOFT}>{t("Find a skill")}</button>
            </form>
            {results.length > 0 && (
              <ul className="mt-3 divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
                {results.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 font-medium">{k.name} <span className="text-sm font-normal text-slate-500">· {t("{n} question(s)", { n: k.questions })}</span></span>
                    <form action={bulkEditAction} className="flex flex-wrap items-center gap-2 text-sm">{hidden}<input type="hidden" name="op" value="addSkill" /><input type="hidden" name="skillId" value={k.id} />
                      <label className="flex items-center gap-1">{t("Questions")}<input type="number" name="count" min={1} max={50} defaultValue={10} className={`${BOX} w-20`} /></label>
                      <label className="flex min-h-11 items-center gap-1"><input type="checkbox" name="lesson" className="h-5 w-5" />{t("+ lesson")}</label>
                      <button className={BTN_SOFT}>{t("Add to all")}</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </AppShell>
  );
}
