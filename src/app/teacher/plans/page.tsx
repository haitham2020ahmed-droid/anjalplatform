import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can, ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { listSkillPlans } from "@/server/curriculum-map/plans";
import { nafsAreaList } from "@/server/plans/nafs-areas";
import { getT } from "@/i18n/server";
import { EmptyState } from "@/components/ui-kit";
import { NO_CURRICULUM_MESSAGE } from "@/server/teacher/assign";
import { PLAN_TYPES, plansWizardContext, proposePlan, searchSkillsAnyGrade, skillsByIds, type PlanProposal, type WizardContext } from "@/server/plans/wizard";
import { SOURCE_LABEL, SOURCE_TAG_CLASS, sourceKeyOf, sourceOfPlanKind, type SourceKey } from "@/lib/source-tags";
import { assignPlanAction } from "./actions";
import { readWizardForm, wizardKey } from "./wizard-form";

export const metadata = { title: "Plans" };

type SP = Record<string, string | string[] | undefined>;
const all = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]).map(String);

type T = (text: string, vars?: Record<string, string | number>) => string;
function Tag({ k, t }: { k: SourceKey; t: T }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${SOURCE_TAG_CLASS[k]}`}>{t(SOURCE_LABEL[k])}</span>;
}
function GradeTag({ grade, t }: { grade: number; t: T }) {
  return <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{t("Grade {n}", { n: grade })}</span>;
}

/**
 * 🗂️ Plans — ONE place to make any plan (UI reorg, Phase 4): 1 Who → 2 Plan type → 3 Preview and edit → Assign.
 * The older plan pages stay as sub-pages under “More options” (Curriculum Map plans, MAP plans and groups, RTI weekly
 * plan, personalized MAP plan document). The preview is built on the server; Assign builds it again (never trusts
 * the browser). Old links /teacher/plans?unit=N (Plan this unit) go to the Curriculum Map plans page.
 */
export default async function PlansPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const get = (k: string) => all(sp[k])[0] ?? null;
  const getAll = (k: string) => all(sp[k]);
  if (get("unit") && !get("type")) redirect(`/teacher/plans/curriculum?${new URLSearchParams({ classId: get("classId") ?? "", unit: get("unit") ?? "" })}`);
  const w = readWizardForm(get, getAll);
  let msg = get("msg");
  let ctx: WizardContext;
  try { ctx = await plansWizardContext(repo, actor, w.classId || null); }
  catch (e) { if (!(e instanceof ForbiddenError)) throw e; ctx = await plansWizardContext(repo, actor); msg = e.message; }
  const klass = ctx.klass;
  const canAssign = can(actor, "assignments:create");
  const chosenWho = klass && (w.who === "class" || w.studentIds.length > 0);
  let proposal: PlanProposal | null = null;
  let error: string | null = null;
  if (klass && w.type && chosenWho) {
    try {
      proposal = await proposePlan(repo, actor, { classId: klass.id, studentIds: w.studentIds, type: w.type, grade: w.grade, unitId: w.unitId, subject: w.subject, areas: w.areas, skillIds: w.type === "CUSTOM" ? w.skillIds : [] });
    } catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; error = e.message; }
  } else if (klass && w.type && !chosenWho) error = t(w.who === "student" ? "Tick the student in step 1." : "Tick the students of the group in step 1.");
  const q = (get("q") ?? "").trim();
  const [results, added, plans, nafsAreas] = await Promise.all([
    q && proposal ? searchSkillsAnyGrade(repo, actor, q) : Promise.resolve([]),
    w.skillIds.length && proposal && w.type !== "CUSTOM" ? skillsByIds(repo, actor, w.skillIds) : Promise.resolve([]),
    klass ? listSkillPlans(repo, actor).then((l) => l.filter((p) => p.classId === klass.id).slice(0, 12)) : Promise.resolve([]),
    nafsAreaList(repo),
  ]);
  const tagOf = (k: SourceKey) => <Tag k={k} t={t} />;
  // "NAFS: <area>" / "MAP: <area> (RIT n)": the source word is interface, the area name is data
  const reasonOf = (r: string) => { const m = r.match(/^(NAFS|MAP): (.*)$/); return m ? `${t(m[1])}: ${m[2]}` : t(r); };
  const note = (n: string) => (n === `${NO_CURRICULUM_MESSAGE}.` ? t("This grade has no curriculum yet — you can still assign skills from any grade.") : t(n));
  const custom = w.type === "CUSTOM";
  const keepOf = (id: string) => !w.keep || w.keep.includes(id);
  const inPlan = new Set([...(proposal?.skills.map((k) => k.id) ?? []), ...w.skillIds]);
  const big = "inline-flex min-h-11 items-center justify-center rounded-xl px-5 font-semibold";
  const box = "min-h-11 rounded-xl border border-slate-300 bg-white px-3";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} icon="🗂️" title="Plans"
        subtitle={t("Make a plan for one student, a group or the whole class. It appears in each student's My Plans, and its skills appear in My Work.")} />
      {msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{msg}</p>}
      {!klass ? (
        <EmptyState icon="🗂️" title="No classes yet" text="When the admin adds you to a class, you can make plans here." action={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} />
      ) : (
        <form method="get" action="/teacher/plans" className="space-y-5">
          <input type="hidden" name="classId" value={klass.id} />
          {/* ---------- step 1: who */}
          <Section title={t("1 · Who is the plan for?")} icon="👥">
            {ctx.classes.length > 1 && (
              <nav aria-label={t("Classes")} className="mb-4 flex flex-wrap gap-2">
                {ctx.classes.map((c) => <Link key={c.id} href={`/teacher/plans?classId=${c.id}`} aria-current={c.id === klass.id ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${c.id === klass.id ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{c.name} · {t("Grade {n}", { n: c.grade })}</Link>)}
              </nav>
            )}
            {ctx.message && <p role="status" className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 font-medium text-amber-900 ring-1 ring-amber-200">{note(`${ctx.message}.`)}</p>}
            <div className="flex flex-wrap gap-3">
              {([["class", t("Whole class ({n})", { n: klass.students.length })], ["student", t("One student")], ["group", t("A group")]] as const).map(([v, label]) => (
                <label key={v} className={`${big} cursor-pointer gap-2 ring-1 ring-slate-300 has-[:checked]:bg-brand-navy has-[:checked]:text-white`}><input type="radio" name="who" value={v} defaultChecked={w.who === v} className="sr-only" />{label}</label>
              ))}
            </div>
            {klass.students.length === 0 ? <EmptyState compact icon="👥" title="No students in this class yet" className="mt-3" /> : (
              <details className="mt-4" open={w.who !== "class"}>
                <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-brand-navy">{t("Choose students (for One student or A group)")}</summary>
                <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
                  {klass.students.map((st) => <label key={st.id} className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-slate-50"><input type="checkbox" name="sid" value={st.id} defaultChecked={w.studentIds.includes(st.id)} className="h-5 w-5" />{st.name}</label>)}
                </div>
              </details>
            )}
          </Section>

          {/* ---------- step 2: type */}
          <Section title={t("2 · Plan type")} icon="🧭">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {PLAN_TYPES.map((pt) => (
                <label key={pt.type} className="flex cursor-pointer flex-col gap-1 rounded-2xl bg-white p-4 ring-1 ring-slate-200 has-[:checked]:ring-2 has-[:checked]:ring-brand-navy">
                  <span className="flex items-center gap-2 text-lg font-semibold text-brand-navy"><input type="radio" name="type" value={pt.type} defaultChecked={w.type === pt.type} className="h-5 w-5" /><span aria-hidden="true">{pt.icon}</span>{t(pt.label)}</span>
                  <span className="text-sm text-slate-600">{t(pt.text)}</span>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end"><button className={`${big} bg-brand-teal text-white hover:bg-brand-navy`}>{t("Show the plan")} <span aria-hidden="true" className="ms-1 inline-block rtl:rotate-180">▶</span></button></div>
          </Section>

          {error && <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{t(error)}</p>}

          {/* ---------- step 3: preview, edit, assign */}
          {proposal && (
            <Section title={t("3 · Preview and edit, then Assign")} icon="✅" hint={<>{t("For:")} <b>{w.who === "class" ? t("the whole class ({n})", { n: proposal.students.length }) : proposal.students.map((x) => x.name).join(", ")}</b>. {t("Untick a skill to remove it; add skills from any grade below.")}</>}>
              <input type="hidden" name="edited" value="1" />
              {/* the key of the options exactly as this form will send them (grade / unit / areas shown below) */}
              <input type="hidden" name="pkey" value={wizardKey({ ...w, grade: proposal.skillGrade, unitId: proposal.units.length ? proposal.unitId : null, areas: w.areas.length ? w.areas : nafsAreas.map((a) => a.code) })} />
              {proposal.notes.length > 0 && <ul className="mb-4 space-y-1 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{proposal.notes.map((n) => <li key={n}>{note(n)}</li>)}</ul>}
              {proposal.skills.length === 0 && !added.length ? <EmptyState compact icon="🔎" title="Nothing here yet" text={custom ? "No skills yet: search below and tick the skills you want." : "No skills found for this plan yet. Add skills below, or choose another grade under More options."} /> : (
                <ul className="divide-y divide-slate-100 rounded-2xl bg-white ring-1 ring-slate-200">
                  {proposal.skills.map((k) => (
                    <li key={k.id}><label className="flex min-h-11 flex-wrap items-center gap-3 px-4 py-2">
                      <input type="checkbox" name={custom ? "add" : "keep"} value={k.id} defaultChecked={custom ? true : keepOf(k.id)} className="h-5 w-5" />
                      <span className="font-medium text-slate-900">{k.name}</span><GradeTag grade={k.grade} t={t} />{tagOf(sourceKeyOf(k.track))}
                      <span className="text-sm text-slate-500">{reasonOf(k.reason)}{k.studentIds.length < proposal!.students.length ? ` · ${t("{n} student(s)", { n: k.studentIds.length })}` : ""}</span>
                      {k.questions === 0 && <span className="text-xs font-semibold text-amber-700">{t("no questions yet")}</span>}
                    </label></li>
                  ))}
                  {added.map((k) => (
                    <li key={k.id}><label className="flex min-h-11 flex-wrap items-center gap-3 px-4 py-2">
                      <input type="checkbox" name="add" value={k.id} defaultChecked className="h-5 w-5" />
                      <span className="font-medium text-slate-900">{k.name}</span><GradeTag grade={k.grade} t={t} />{tagOf(sourceKeyOf(w.type === "MAP" || w.type === "NAFS" || w.type === "RTI" ? w.type : k.grammar ? "GRAMMAR" : "CURRICULUM"))}
                      <span className="text-sm text-slate-500">{t("Added by you")}</span>
                    </label></li>
                  ))}
                </ul>
              )}

              <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <label className="flex flex-wrap items-center gap-2 font-semibold text-slate-700">{t("Add skills (any grade)")}
                  <input name="q" defaultValue={q} placeholder={t("e.g. main idea, inference, commas")} className={`${box} min-w-0 flex-1 font-normal`} />
                  <button className={`${big} bg-white text-brand-navy ring-1 ring-slate-300`}>{t("Search")}</button>
                </label>
                {q && results.length === 0 && <EmptyState compact icon="🔎" title="Nothing matches your search" className="mt-2" />}
                {results.length > 0 && (
                  <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                    {results.filter((k) => !inPlan.has(k.id)).map((k) => <li key={k.id}><label className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-white"><input type="checkbox" name="add" value={k.id} className="h-5 w-5" /><span>{k.name}</span><GradeTag grade={k.grade} t={t} />{k.grammar && tagOf("GRAMMAR")}</label></li>)}
                  </ul>
                )}
                {results.length > 0 && <p className="mt-2 text-sm text-slate-500">{t("Tick skills, then press Update preview (or Assign).")}</p>}
              </div>

              <details className="mt-4 rounded-2xl bg-white ring-1 ring-slate-200">
                <summary className="flex min-h-11 cursor-pointer items-center px-4 py-3 font-semibold text-brand-navy">{t("More options")}</summary>
                <div className="grid gap-4 px-4 pb-4 md:grid-cols-2">
                  {(w.type === "CURRICULUM" || w.type === "NAFS" || w.type === "MAP") && (
                    <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Take skills from")}
                      <select name="grade" defaultValue={String(proposal.skillGrade ?? "")} className={box}>
                        {ctx.grades.map((g) => <option key={g.level} value={g.level} disabled={!g.skills}>{t("Grade {n}", { n: g.level })}{g.skills ? "" : ` (${t("no curriculum yet")})`}</option>)}
                      </select>
                    </label>
                  )}
                  {w.type === "CURRICULUM" && proposal.units.length > 0 && (
                    <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Unit")}
                      <select name="unitId" defaultValue={proposal.unitId ?? ""} className={box}>{proposal.units.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}</select>
                    </label>
                  )}
                  {w.type === "MAP" && (
                    <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("MAP subject")}
                      <select name="subject" defaultValue={w.subject} className={box}><option value="READING">{t("Reading")}</option><option value="LANGUAGE">{t("Language Usage")}</option></select>
                    </label>
                  )}
                  {w.type === "NAFS" && (
                    <fieldset className="text-sm md:col-span-2"><legend className="font-semibold text-slate-700">{t("NAFS areas")}</legend>
                      <div className="mt-1 grid gap-1 sm:grid-cols-2">{nafsAreas.map((a) => <label key={a.code} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="area" value={a.code} defaultChecked={!w.areas.length || w.areas.includes(a.code)} className="h-5 w-5" />{a.name}</label>)}</div>
                      <p className="mt-1 text-slate-500">{t("After a NAFS practice test, the plan is personalized for each student from the skills they missed.")}</p>
                    </fieldset>
                  )}
                  <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Plan name")}<input name="title" defaultValue={get("title") ?? proposal.title} maxLength={191} className={box} /></label>
                  <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">{t("Due date (optional)")}<input type="date" name="dueAt" defaultValue={get("dueAt") ?? ""} className={box} /></label>
                  <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 md:col-span-2">{t("Note to students (optional)")}<input name="note" defaultValue={get("note") ?? ""} maxLength={1000} className={box} /></label>
                  <div className="md:col-span-2"><button className={`${big} bg-white text-brand-navy ring-1 ring-slate-300`}>{t("Update preview")}</button></div>
                  <div className="text-sm text-slate-600 md:col-span-2">
                    <p className="font-semibold text-slate-700">{t("Other plan tools")}</p>
                    <ul className="mt-1 flex flex-wrap gap-2">
                      <li><Link className="inline-flex min-h-11 items-center underline" href={`/teacher/plans/curriculum?classId=${klass.id}`}>{t("Curriculum Map plans and the full-year plan")}</Link></li>
                      <li><Link className="inline-flex min-h-11 items-center underline" href={`/teacher/map-plans?classId=${klass.id}`}>{t("MAP plans and small groups")}</Link></li>
                      <li><Link className="inline-flex min-h-11 items-center underline" href={`/teacher/personal-plan?classId=${klass.id}`}>{t("Personalized MAP plan (Word / PDF)")}</Link></li>
                      <li><Link className="inline-flex min-h-11 items-center underline" href={`/teacher/rti-plan?classId=${klass.id}`}>{t("RTI weekly plan")}</Link></li>
                      <li><Link className="inline-flex min-h-11 items-center underline" href="/teacher/map-assign">{t("Assign by Curriculum Map place")}</Link></li>
                    </ul>
                  </div>
                </div>
              </details>

              {canAssign && (
                <div className="mt-5 flex justify-end">
                  <button formAction={assignPlanAction} className={`${big} bg-brand-navy px-8 text-lg text-white hover:bg-brand-purple`}>{t("Assign")}</button>
                </div>
              )}
            </Section>
          )}
        </form>
      )}

      {klass && (
        <Section title={t("Plans of {name}", { name: klass.name })} icon="📋" className="mt-6">
          {plans.length === 0 ? <EmptyState compact icon="🗂️" title="No plans yet" text="Make the first one above." /> : (
            <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {plans.map((p) => (
                <li key={p.id}><Link href={`/teacher/plans/${p.id}`} className="lift block rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-brand-navy">{p.title} {tagOf(sourceOfPlanKind(p.kind))}</p>
                  <p className="text-sm text-slate-600">{t("{n} part(s)", { n: p.items })} · {t("{n} student(s)", { n: p.students })} · {p.createdAt}</p>
                </Link></li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </AppShell>
  );
}
