import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import { PlanBuilder, WhoPicker } from "@/components/plans/plan-builder";
import { ProgramChip } from "@/components/plans/program-chip";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can, ForbiddenError, type Actor } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { nafsAreaList } from "@/server/plans/nafs-areas";
import { plansWizardContext, searchSkillsAnyGrade, skillsByIds, type WizardContext } from "@/server/plans/wizard";
import { suggestNafsPlan, type NafsSuggestion } from "@/server/plans/nafs-suggest";
import { fromSearchParams, readPlanForm, readQuestionPicks } from "@/server/plans/plan-form";
import { applyEdits, sentPlans } from "@/server/plans/send";
import { sendCustomPlanAction, sendNafsPlanAction } from "./actions";

export const metadata = { title: "Plans" };

type SP = Record<string, string | string[] | undefined>;
type Tab = "nafs" | "custom" | "sent";
const TABS: [Tab, string, string][] = [["nafs", "NAFS plan", "🇸🇦"], ["custom", "Custom plan", "✏️"], ["sent", "All plans sent", "📋"]];

/**
 * 🗂️ Plans: a NAFS plan (suggested from the NAFS results → preview → send), a Custom plan (pick skills → preview →
 * send), and every plan the teacher sent (any program). MAP plans are made on the MAP page, RTI plans on the RTI
 * page, Curriculum plans with the Curriculum Map — one line links to each.
 */
export default async function PlansPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const { get, getAll } = fromSearchParams(sp);
  // older links: the wizard's plan types now live on their program's page
  const cls = get("classId") ? `classId=${encodeURIComponent(String(get("classId")))}` : "";
  if (get("unit") && !get("type")) redirect(`/teacher/plans/curriculum?${new URLSearchParams({ classId: get("classId") ?? "", unit: get("unit") ?? "" })}`);
  if (get("type") === "MAP") redirect(`/teacher/map-center?tab=plan${cls ? `&${cls}` : ""}`);
  if (get("type") === "RTI" || get("type") === "SUPPORT") redirect(`/teacher/plans/support${cls ? `?${cls}` : ""}`);
  if (get("type") === "TEST") redirect(`/teacher/assessments${cls ? `?${cls}` : ""}`);
  if (get("type") === "CURRICULUM") redirect(`/teacher/plans/curriculum${cls ? `?${cls}` : ""}`);
  const tab: Tab = get("tab") === "custom" || get("type") === "CUSTOM" ? "custom" : get("tab") === "sent" ? "sent" : "nafs";
  let ctx: WizardContext | null = null;
  let msg = get("msg");
  try { ctx = await plansWizardContext(repo, actor, get("classId") || null); }
  catch (e) { if (!(e instanceof ForbiddenError)) throw e; ctx = await plansWizardContext(repo, actor); msg = e.message; }
  const klass = ctx.klass;
  const canSend = can(actor, "assignments:create");
  const tabHref = (k: Tab) => `/teacher/plans?${new URLSearchParams({ tab: k, ...(klass ? { classId: klass.id } : {}) })}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} icon="🗂️" title="Plans"
        subtitle={t("A NAFS plan or your own plan for one student, a group or the class, and every plan you sent.")} />
      <nav aria-label={t("Plans")} className="mb-3 flex flex-wrap gap-2">
        {TABS.map(([k, label, icon]) => <Link key={k} href={tabHref(k)} aria-current={k === tab ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-5 font-semibold ${k === tab ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`}><span aria-hidden="true">{icon}</span>{t(label)}</Link>)}
      </nav>
      {/* every plan type in one place: MAP · NAFS · Curriculum · Support (RTI) · Test · Custom */}
      <section aria-label={t("Plan types")} className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {([
          ["🗺️", "MAP", `/teacher/map-center?tab=plan${klass ? `&classId=${klass.id}` : ""}`],
          ["🇸🇦", "NAFS", `/teacher/plans?tab=nafs${klass ? `&classId=${klass.id}` : ""}`],
          ["🧭", "Curriculum", `/teacher/plans/curriculum${klass ? `?classId=${klass.id}` : ""}`],
          ["🛟", "Support", `/teacher/plans/support${klass ? `?classId=${klass.id}` : ""}`],
          ["📝", "Test", `/teacher/assessments${klass ? `?classId=${klass.id}` : ""}`],
          ["✏️", "Custom", `/teacher/plans?tab=custom${klass ? `&classId=${klass.id}` : ""}`],
        ] as const).map(([icon, label, href]) => (
          <Link key={label} href={href} prefetch={false} className="flex min-h-11 items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-brand-navy shadow-sm ring-1 ring-slate-200 hover:ring-brand-teal">
            <span aria-hidden="true">{icon}</span>{t(label)}
          </Link>
        ))}
      </section>
      {msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{t(msg)}</p>}
      {tab === "sent" ? <SentList t={t} actor={actor} /> : !klass ? (
        <EmptyState icon="🗂️" title="No classes yet" text="When the admin adds you to a class, you can make plans here." action={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} />
      ) : tab === "nafs" ? <NafsBuilder t={t} actor={actor} ctx={ctx} canSend={canSend} get={get} getAll={getAll} /> : <CustomBuilder t={t} actor={actor} ctx={ctx} canSend={canSend} get={get} getAll={getAll} />}
    </AppShell>
  );
}

type T = Awaited<ReturnType<typeof getT>>["t"];
type Getters = { get: (k: string) => string | null; getAll: (k: string) => string[] };

async function NafsBuilder({ t, actor, ctx, canSend, get, getAll }: { t: T; actor: Actor; ctx: WizardContext; canSend: boolean } & Getters) {
  const klass = ctx.klass!;
  const areas = await nafsAreaList(repo);
  const chosenAreas = getAll("area").filter(Boolean);
  const form = readPlanForm((k) => (k === "classId" ? klass.id : get(k)), getAll, [chosenAreas.join(",")]);
  const needsStudents = form.who !== "class" && !form.studentIds.length;
  let sug: NafsSuggestion | null = null;
  let error: string | null = null;
  if (!needsStudents) {
    try { sug = await suggestNafsPlan(repo, actor, { classId: klass.id, studentIds: form.studentIds, areas: chosenAreas.length ? chosenAreas : null }); }
    catch (e) { if (!(e instanceof ValidationError || e instanceof ForbiddenError)) throw e; error = e.message; }
  }
  const [added, results] = await Promise.all([
    form.add.length ? skillsByIds(repo, actor, form.add) : Promise.resolve([]),
    form.q && sug ? searchSkillsAnyGrade(repo, actor, form.q) : Promise.resolve([]),
  ]);
  const plan = sug ? applyEdits(sug.skills, form.keep, added, sug.students.map((s) => s.id)) : [];
  const carry: [string, string][] = [["tab", "nafs"], ["classId", klass.id], ["who", form.who], ...form.studentIds.map((id) => ["sid", id] as [string, string]), ...chosenAreas.map((a) => ["area", a] as [string, string])];
  return (
    <form method="get" action="/teacher/plans" className="space-y-5">
      <input type="hidden" name="tab" value="nafs" />
      <input type="hidden" name="classId" value={klass.id} />
      <WhoPicker t={t} classes={ctx.classes.map((c) => ({ id: c.id, name: c.name }))} classId={klass.id} classHref={(id) => `/teacher/plans?tab=nafs&classId=${id}`} students={klass.students} form={form} suggested={Boolean(sug)}>
        {sug?.source !== "RESULTS" && areas.length > 0 && (
          <fieldset className="text-sm"><legend className="font-semibold text-slate-700">{t("NAFS areas")}</legend>
            <div className="mt-1 grid gap-1 sm:grid-cols-2">{areas.map((a) => <label key={a.code} className="flex min-h-11 items-center gap-2"><input type="checkbox" name="area" value={a.code} defaultChecked={!chosenAreas.length || chosenAreas.includes(a.code)} className="h-5 w-5" />{a.name}</label>)}</div>
          </fieldset>
        )}
      </WhoPicker>
      {needsStudents && <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{t(form.who === "student" ? "Tick the student in step 1." : "Tick the students of the group in step 1.")}</p>}
      {error && <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{t(error)}</p>}
      {sug && (
        <>
          <p className="rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-900 ring-1 ring-teal-200">{sug.source === "RESULTS" ? t("Suggested from the NAFS results: {test}. Each student gets the skills they scored under 70% on.", { test: sug.testTitle ?? "" }) : t("No NAFS test results yet: this is the general NAFS plan from the NAFS areas.")}</p>
          <PlanBuilder t={t} path="/teacher/plans" carry={carry} form={form} program="NAFS" className={klass.name} students={sug.students}
            suggested={sug.skills} plan={plan} picks={readQuestionPicks(get, plan.map((k) => k.id))} results={results} notes={sug.notes} defaultTitle={`${t("NAFS Plan")} · ${klass.name}`}
            send={sendNafsPlanAction} canSend={canSend} empty={{ title: "Nothing to suggest yet", text: "Search below and tick the skills you want." }} />
        </>
      )}
    </form>
  );
}

async function CustomBuilder({ t, actor, ctx, canSend, get, getAll }: { t: T; actor: Actor; ctx: WizardContext; canSend: boolean } & Getters) {
  const klass = ctx.klass!;
  const form = readPlanForm((k) => (k === "classId" ? klass.id : get(k)), getAll, ["custom"]);
  const needsStudents = form.who !== "class" && !form.studentIds.length;
  const recipients = form.studentIds.length ? klass.students.filter((s) => form.studentIds.includes(s.id)) : klass.students;
  const [added, results] = await Promise.all([
    form.add.length ? skillsByIds(repo, actor, form.add) : Promise.resolve([]),
    form.q ? searchSkillsAnyGrade(repo, actor, form.q) : Promise.resolve([]),
  ]);
  const plan = applyEdits([], null, added, recipients.map((s) => s.id));
  const carry: [string, string][] = [["tab", "custom"], ["classId", klass.id], ["who", form.who], ...form.studentIds.map((id) => ["sid", id] as [string, string])];
  return (
    <form method="get" action="/teacher/plans" className="space-y-5">
      <input type="hidden" name="tab" value="custom" />
      <input type="hidden" name="classId" value={klass.id} />
      <WhoPicker t={t} classes={ctx.classes.map((c) => ({ id: c.id, name: c.name }))} classId={klass.id} classHref={(id) => `/teacher/plans?tab=custom&classId=${id}`} students={klass.students} form={form} suggested />
      {needsStudents ? <p role="alert" className="rounded-2xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{t(form.who === "student" ? "Tick the student in step 1." : "Tick the students of the group in step 1.")}</p> : (
        <PlanBuilder t={t} path="/teacher/plans" carry={carry} form={form} program={null} className={klass.name} students={recipients}
          suggested={[]} plan={plan} picks={readQuestionPicks(get, plan.map((k) => k.id))} results={results} defaultTitle={`${t("Custom Plan")} · ${klass.name}`}
          send={sendCustomPlanAction} canSend={canSend} empty={{ title: "Pick the skills", text: "Search below and tick the skills you want." }} />
      )}
    </form>
  );
}

async function SentList({ t, actor }: { t: T; actor: Actor }) {
  const plans = await sentPlans(repo, actor);
  if (!plans.length) return <EmptyState icon="📋" title="No plans sent yet" text="Plans you send from the MAP, RTI and Plans pages appear here." />;
  return (
    <Section title="All plans sent" icon="📋">
      <ul className="divide-y divide-slate-100">
        {plans.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-brand-navy"><span className="break-words">{p.title}</span><ProgramChip program={p.program} /></p>
              <p className="text-sm text-slate-600">{p.className} · {t("{n} student(s)", { n: p.students })} · {t("{n} skill(s)", { n: p.skills })} · {p.sentAt}</p>
            </div>
            <div className="flex w-40 items-center gap-2" title={t("Progress")}>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-teal" style={{ width: `${p.progress}%` }} /></div>
              <span className="w-10 text-end text-sm tabular-nums text-slate-700">{p.progress}%</span>
            </div>
            <Link href={p.href} className="inline-flex min-h-11 items-center rounded-xl px-4 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{t("Open")}</Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
