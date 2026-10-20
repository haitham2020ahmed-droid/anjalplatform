import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import { BTN, BTN_MAIN, BTN_SOFT } from "@/components/plans/plan-builder";
import { ProgramChip } from "@/components/plans/program-chip";
import { say, StatusChip } from "@/components/plans/editor-ui";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can, ForbiddenError, type Actor } from "@/server/auth/rbac";
import { plansWizardContext, skillsByIds, type WizardContext } from "@/server/plans/wizard";
import { fromSearchParams } from "@/server/plans/plan-form";
import { NAFS_GRADE, plansOverview, type PlanBucket, type PlanListRow } from "@/server/plans/editor";
import { suggestPlans, type SuggestedPlan } from "@/server/plans/perf-suggest";
import { isProgram } from "@/server/plans/program";
import { deletePlanAction, startPlanAction, useSuggestionAction, withdrawFromListAction } from "./editor-actions";

export const metadata = { title: "Plans" };

type SP = Record<string, string | string[] | undefined>;
type Tab = "plans" | "suggested" | "new";
const TABS: [Tab, string, string][] = [["plans", "My plans", "📋"], ["suggested", "Suggested plans", "💡"], ["new", "New plan", "✏️"]];
const BUCKETS: [PlanBucket | "ALL", string][] = [["ALL", "All"], ["DRAFTS", "Drafts"], ["SENT", "Sent"], ["ACTIVE", "Active"], ["FINISHED", "Finished"]];
const PROGRAM_CHOICES: [string, string, string][] = [
  ["CUSTOM", "Custom", "Any skills and questions you choose."],
  ["RTI", "Support", "Struggling skills of students who need support."],
  ["MAP", "MAP", "From each student's lowest MAP sub-areas."],
  ["CURRICULUM", "Curriculum", "Lessons of the Curriculum Map."],
  ["NAFS", "NAFS", "Grade 6 only: from the NAFS results or areas."],
];
const chip = (on: boolean) => `inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`;

/**
 * 🗂️ Plans — one clear flow for every plan: 1 Who → 2 What (the platform's suggestion or your own choice, fully
 * editable) → 3 Preview → 4 Send. My plans lists Drafts / Sent / Active / Finished with progress; Suggested plans
 * come from the students' real results (each with its reason and data). Nothing is ever sent by itself.
 */
export default async function PlansPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const sp = await searchParams;
  const { get, getAll } = fromSearchParams(sp);
  // older links
  const cls = get("classId") ? `classId=${encodeURIComponent(String(get("classId")))}` : "";
  if (get("unit") && !get("type")) redirect(`/teacher/plans/curriculum?${new URLSearchParams({ classId: get("classId") ?? "", unit: get("unit") ?? "" })}`);
  if (get("type") === "MAP") redirect(`/teacher/map-center?tab=plan${cls ? `&${cls}` : ""}`);
  if (get("type") === "RTI" || get("type") === "SUPPORT") redirect(`/teacher/plans/support${cls ? `?${cls}` : ""}`);
  if (get("type") === "TEST") redirect(`/teacher/assessments${cls ? `?${cls}` : ""}`);
  if (get("type") === "CURRICULUM") redirect(`/teacher/plans/curriculum${cls ? `?${cls}` : ""}`);
  const old = get("tab");
  const tab: Tab = old === "suggested" ? "suggested" : old === "new" || old === "custom" || old === "nafs" || get("type") === "CUSTOM" ? "new" : "plans";
  const program = old === "nafs" ? "NAFS" : get("program") ?? "CUSTOM"; // NAFS is refused for non-Grade-6 classes (editor + NewPlan)
  let ctx: WizardContext;
  let msg = get("msg");
  try { ctx = await plansWizardContext(repo, actor, get("classId") || null); }
  catch (e) { if (!(e instanceof ForbiddenError)) throw e; ctx = await plansWizardContext(repo, actor); msg = e.message; }
  const canSend = can(actor, "assignments:create");
  const href = (k: Tab, extra: Record<string, string> = {}) => `/teacher/plans?${new URLSearchParams({ tab: k, ...(ctx.klass && k !== "plans" ? { classId: ctx.klass.id } : {}), ...extra })}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} icon="🗂️" title="Plans"
        subtitle={t("Plans for one student, a group or the class. You see and change everything; nothing reaches students before you press Send.")} />
      <ol aria-label={t("How a plan is made")} className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-700">
        {["1 · Who", "2 · What", "3 · Preview", "4 · Send"].map((x, i) => <li key={x} className="flex items-center gap-2">{i > 0 && <span aria-hidden="true" className="text-slate-400 rtl:rotate-180">→</span>}<span className="rounded-full bg-white px-3 py-1 font-semibold text-brand-navy ring-1 ring-slate-200">{t(x)}</span></li>)}
      </ol>
      <nav aria-label={t("Plans")} className="mb-5 flex flex-wrap gap-2">
        {TABS.map(([k, label, icon]) => <Link key={k} href={href(k)} aria-current={k === tab ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-5 font-semibold ${k === tab ? "bg-brand-navy text-white" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`}><span aria-hidden="true">{icon}</span>{t(label)}</Link>)}
      </nav>
      {msg && <p role="status" className="mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{t(msg)}</p>}
      {!ctx.klass ? <EmptyState icon="🗂️" title="No classes yet" text="When the admin adds you to a class, you can make plans here." action={{ href: actor.role === "TEACHER" ? "/teacher" : "/admin", label: "Home" }} />
        : tab === "plans" ? <PlanList t={t} actor={actor} ctx={ctx} classId={get("classId")} bucket={get("bucket")} />
        : tab === "suggested" ? <Suggested t={t} actor={actor} ctx={ctx} canSend={canSend} />
        : <NewPlan t={t} actor={actor} ctx={ctx} canSend={canSend} program={program} who={get("who")} sids={getAll("sid")} add={getAll("add")} subject={get("subject")} />}
      <p className="mt-6 text-sm text-slate-600">{t("Also:")}{" "}
        <Link href={`/teacher/map-center?tab=plan${ctx.klass ? `&classId=${ctx.klass.id}` : ""}`} className="font-semibold text-brand-teal underline">{t("MAP page")}</Link> ·{" "}
        <Link href={`/teacher/plans/support${ctx.klass ? `?classId=${ctx.klass.id}` : ""}`} className="font-semibold text-brand-teal underline">{t("Support plan")}</Link> ·{" "}
        <Link href={`/teacher/plans/curriculum${ctx.klass ? `?classId=${ctx.klass.id}` : ""}`} className="font-semibold text-brand-teal underline">{t("Full curriculum plan")}</Link>
      </p>
    </AppShell>
  );
}

type T = Awaited<ReturnType<typeof getT>>["t"];

function ClassChips({ t, ctx, hrefOf, all }: { t: T; ctx: WizardContext; hrefOf: (id: string | null) => string; all?: { on: boolean } }) {
  if (ctx.classes.length < 2 && !all) return null;
  return (
    <nav aria-label={t("Classes")} className="mb-4 flex flex-wrap gap-2">
      {all && <Link href={hrefOf(null)} aria-current={all.on ? "page" : undefined} className={chip(all.on)}>{t("All classes")}</Link>}
      {ctx.classes.map((c) => <Link key={c.id} href={hrefOf(c.id)} aria-current={!all?.on && c.id === ctx.klass?.id ? "page" : undefined} className={chip(!all?.on && c.id === ctx.klass?.id)}>{c.name}</Link>)}
    </nav>
  );
}

const SCOPE: Record<PlanListRow["scope"], string> = { CLASS: "Whole class", GROUP: "Group", STUDENT: "One student" };

async function PlanList({ t, actor, ctx, classId, bucket }: { t: T; actor: Actor; ctx: WizardContext; classId: string | null; bucket: string | null }) {
  const b = (BUCKETS.find(([k]) => k === bucket)?.[0] ?? "ALL") as PlanBucket | "ALL";
  const all = await plansOverview(repo, actor, { classId: classId || null });
  const count = (k: PlanBucket | "ALL") => all.filter((r) => k === "ALL" || (k === "DRAFTS" ? r.status === "DRAFT" : k === "SENT" ? r.status !== "DRAFT" : k === "ACTIVE" ? (r.status === "SENT" || r.status === "PAUSED") && !r.finished : r.status !== "DRAFT" && r.finished)).length;
  const rows = all.filter((r) => b === "ALL" || (b === "DRAFTS" ? r.status === "DRAFT" : b === "SENT" ? r.status !== "DRAFT" : b === "ACTIVE" ? (r.status === "SENT" || r.status === "PAUSED") && !r.finished : r.status !== "DRAFT" && r.finished));
  const link = (k: string, cid: string | null) => `/teacher/plans?${new URLSearchParams({ tab: "plans", ...(k !== "ALL" ? { bucket: k } : {}), ...(cid ? { classId: cid } : {}) })}`;
  return (
    <>
      <ClassChips t={t} ctx={ctx} hrefOf={(id) => link(b, id)} all={{ on: !classId }} />
      <nav aria-label={t("Plan status")} className="mb-4 flex flex-wrap gap-2">
        {BUCKETS.map(([k, label]) => <Link key={k} href={link(k, classId)} aria-current={k === b ? "page" : undefined} className={chip(k === b)}>{t(label)} <span className="ms-1 tabular-nums opacity-80">{count(k)}</span></Link>)}
      </nav>
      {!rows.length ? <EmptyState icon="📋" title="No plans here yet" text="Start a New plan, or open a Suggested plan." /> : (
        <form method="get" action="/teacher/plans/bulk">
          <Section title={t(BUCKETS.find(([k]) => k === b)![1])} icon="📋" hint={t("Tick several plans to change them together (for example the individual plans of several students).")}>
            <ul className="divide-y divide-slate-100">
              {rows.map((p) => (
                <li key={p.id} className="flex flex-wrap items-start gap-3 py-3">
                  <label className="flex min-h-11 items-center px-1"><input type="checkbox" name="id" value={p.id} className="h-5 w-5" aria-label={p.title} /></label>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-brand-navy"><span className="break-words">{p.title}</span><ProgramChip program={p.program} /><StatusChip t={t} status={p.status} finished={p.finished} /></p>
                    <p className="text-sm text-slate-600">{p.className} · {t(SCOPE[p.scope])} · {t("{n} student(s)", { n: p.students })} · {t("{n} part(s)", { n: p.sections })}{p.questions ? ` · ${t("{n} question(s)", { n: p.questions })}` : ""}{p.dueAt ? ` · ${t("Due {date}", { date: p.dueAt })}` : ""} · {p.date}</p>
                  </div>
                  {p.status !== "DRAFT" && (
                    <div className="flex w-40 items-center gap-2" title={t("Progress")}>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-brand-teal" style={{ width: `${p.progress}%` }} /></div>
                      <span className="w-10 text-end text-sm tabular-nums text-slate-700">{p.progress}%</span>
                    </div>
                  )}
                  <div className="flex flex-col items-end gap-1.5">
                    <Link href={p.href} className="inline-flex min-h-11 items-center rounded-xl px-4 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{t(p.status === "DRAFT" ? "Edit" : "Open")}</Link>
                    {/* 🗑 r87: the teacher's own choice — stop it but keep the record, or delete it for good */}
                    <details className="text-end">
                      <summary className="cursor-pointer text-xs font-semibold text-rose-700">{t("Cancel this plan")}</summary>
                      <div className="mt-2 flex max-w-xs flex-col gap-2 rounded-xl bg-slate-50 p-3 text-start text-xs ring-1 ring-slate-200">
                        {(p.status === "SENT" || p.status === "PAUSED") && (
                          <form action={withdrawFromListAction} className="flex flex-col gap-1">
                            <input type="hidden" name="planId" value={p.id} /><input type="hidden" name="bucket" value={b} />
                            <p className="text-slate-600">{t("Stop sending to students. Answers already given are kept, and the plan stays in your Finished list.")}</p>
                            <label className="flex items-center gap-1.5"><input type="checkbox" name="confirm" required className="h-4 w-4" />{t("Yes, stop this plan")}</label>
                            <button className="self-start rounded-lg bg-white px-3 py-1 font-semibold text-amber-800 ring-1 ring-amber-300 hover:bg-amber-50">{t("Stop (keep saved)")}</button>
                          </form>
                        )}
                        <form action={deletePlanAction} className="flex flex-col gap-1 border-t border-slate-200 pt-2 first:border-t-0 first:pt-0">
                          <input type="hidden" name="planId" value={p.id} /><input type="hidden" name="bucket" value={b} />
                          <p className="text-slate-600">{t("Gone from here for good; no Undo. Answers already given are not deleted.")}</p>
                          <label className="flex items-center gap-1.5"><input type="checkbox" name="confirm" required className="h-4 w-4" />{t("Yes, delete permanently")}</label>
                          <button className="self-start rounded-lg bg-rose-700 px-3 py-1 font-semibold text-white hover:bg-rose-800">{t("Delete permanently")}</button>
                        </form>
                      </div>
                    </details>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex justify-end"><button className={BTN_SOFT}>{t("Change the ticked plans together")}</button></div>
          </Section>
        </form>
      )}
    </>
  );
}

const SCOPE_ICON: Record<SuggestedPlan["scope"], string> = { CLASS: "🏫", GROUP: "👥", STUDENT: "🧑‍🎓" };

async function Suggested({ t, actor, ctx, canSend }: { t: T; actor: Actor; ctx: WizardContext; canSend: boolean }) {
  const klass = ctx.klass!;
  const list = await suggestPlans(repo, actor, klass.id);
  return (
    <>
      <ClassChips t={t} ctx={ctx} hrefOf={(id) => `/teacher/plans?tab=suggested&classId=${id}`} />
      <p className="mb-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200">{t("Made from your students' real results on the platform: accuracy and mastery per skill, recent practice, the Diagnostic, MAP, missed questions and fluency. Open one to check and change it; nothing is sent until you press Send.")}</p>
      {!list.length ? <EmptyState icon="💡" title="No suggestions yet" text="Suggestions appear when students have answered at least 5 questions of a skill. You can still make a New plan." action={{ href: `/teacher/plans?tab=new&classId=${klass.id}`, label: "New plan" }} /> : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {list.map((x) => (
            <li key={x.id} className="flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500"><span aria-hidden="true">{SCOPE_ICON[x.scope]}</span> {t(x.scope === "CLASS" ? "Whole class" : x.scope === "GROUP" ? "Group" : "One student")}</p>
              <h3 className="mt-1 text-lg font-semibold text-brand-navy">{say(t, x.reasonT)}</h3>
              <p className="text-sm font-semibold text-slate-700">→ {say(t, x.summaryT)}</p>
              <ul className="mt-2 space-y-1 text-sm text-slate-700">{x.sections.map((k) => <li key={k.skillId}>• {k.skillName} · {t("{n} question(s)", { n: k.count })}{k.lesson ? ` · 🧩 ${t("lesson")}` : ""}</li>)}</ul>
              {x.sources.length > 0 && <p className="mt-2 flex flex-wrap gap-1 text-xs">{x.sources.map((s) => <span key={s} className="rounded-full bg-slate-100 px-2 py-0.5">{t(s)}</span>)}</p>}
              <details className="mt-2">
                <summary className="min-h-11 cursor-pointer text-sm font-semibold text-brand-navy">{t("See the data ({n} student(s))", { n: x.rows.length })}</summary>
                <ul className="mt-1 space-y-2 text-sm">{x.rows.map((r) => <li key={r.studentId} className="rounded-xl bg-slate-50 p-2 ring-1 ring-slate-200"><p className="font-semibold"><bdi>{r.name}</bdi></p><ul className="list-disc ps-5 text-slate-700">{r.lines.map((l, j) => <li key={j}>{say(t, l)}</li>)}</ul></li>)}</ul>
              </details>
              {canSend && (
                <form action={useSuggestionAction} className="mt-auto pt-3 text-end">
                  <input type="hidden" name="classId" value={klass.id} /><input type="hidden" name="suggestion" value={x.id} />
                  <button className={BTN_MAIN}>{t("Review and edit")}</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

async function NewPlan({ t, actor, ctx, canSend, program, who, sids, add, subject }: { t: T; actor: Actor; ctx: WizardContext; canSend: boolean; program: string; who: string | null; sids: string[]; add: string[]; subject: string | null }) {
  const klass = ctx.klass!;
  const chosenProgram = isProgram(program) ? program : "CUSTOM";
  const w = who === "student" || who === "group" ? who : "class";
  const start = add.length ? await skillsByIds(repo, actor, add.slice(0, 20)) : [];
  return (
    <form action={startPlanAction} className="space-y-5">
      <input type="hidden" name="classId" value={klass.id} />
      {start.map((k) => <input key={k.id} type="hidden" name="add" value={k.id} />)}
      <Section title="1 · Who is it for?" icon="👥">
        <ClassChips t={t} ctx={ctx} hrefOf={(id) => `/teacher/plans?tab=new&classId=${id}&program=${chosenProgram}`} />
        <div className="flex flex-wrap gap-2">
          {([["class", t("Whole class ({n})", { n: klass.students.length })], ["group", t("A group")], ["student", t("One student")]] as const).map(([v, label]) => (
            <label key={v} className={`${BTN} cursor-pointer gap-2 ring-1 ring-slate-300 has-[:checked]:bg-brand-navy has-[:checked]:text-white`}><input type="radio" name="who" value={v} defaultChecked={w === v} className="sr-only" />{label}</label>
          ))}
        </div>
        {klass.students.length === 0 ? <EmptyState compact icon="👥" title="No students in this class yet" className="mt-3" /> : (
          <div className="mt-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <p className="text-sm text-slate-600">{t("For a group or one student, tick the students.")}</p>
            <div className="mt-2 grid max-h-80 gap-1 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4">
              {klass.students.map((st) => <label key={st.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-white px-2 ring-1 ring-slate-100 hover:ring-brand-teal"><input type="checkbox" name="sid" value={st.id} defaultChecked={sids.includes(st.id)} className="h-5 w-5 accent-brand-teal" /><bdi>{st.name}</bdi></label>)}
            </div>
          </div>
        )}
        <fieldset className="mt-4">
          <legend className="font-semibold text-slate-700">{t("Kind of plan")}</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {PROGRAM_CHOICES.filter(([k]) => k !== "NAFS" || klass.grade === NAFS_GRADE).map(([k, label, text]) => {
              // NAFS is offered only for Grade 6 classes (other teachers never see it)
              const off = false;
              return (
                <label key={k} className={`flex cursor-pointer flex-col gap-1 rounded-xl p-3 ring-1 ring-slate-200 has-[:checked]:bg-teal-50 has-[:checked]:ring-2 has-[:checked]:ring-brand-teal ${off ? "cursor-not-allowed opacity-50" : ""}`}>
                  <span className="flex items-center gap-2 font-semibold text-brand-navy"><input type="radio" name="program" value={k} defaultChecked={chosenProgram === k || (k === "CUSTOM" && chosenProgram === "NAFS" && off)} disabled={off} className="h-5 w-5" />{t(label)}</span>
                  <span className="text-xs text-slate-600">{t(off ? "NAFS plans are for Grade 6 classes only." : text)}</span>
                </label>
              );
            })}
          </div>
          <label className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">{t("MAP subject")}
            <select name="subject" defaultValue={subject === "LANGUAGE" ? "LANGUAGE" : "READING"} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3"><option value="READING">{t("Reading")}</option><option value="LANGUAGE">{t("Language Usage")}</option></select>
          </label>
        </fieldset>
      </Section>
      <Section title="2 · What" icon="✅" hint={t("Start from the platform's suggestion (made from these students' results) or start empty. Either way you then see and change every part and every question.")}>
        {start.length > 0 && <p className="mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{t("Skills to start with:")} {start.map((k) => k.name).join(" · ")}</p>}
        {canSend ? (
          <div className="flex flex-wrap justify-end gap-3">
            {!start.length && <button name="mode" value="empty" className={BTN_SOFT}>{t("Start empty and choose myself")}</button>}
            <button name="mode" value="suggested" className={`${BTN_MAIN} px-8`}>{start.length ? t("Make the draft") : t("Suggest from their results")}</button>
          </div>
        ) : <p className="text-sm text-slate-600">{t("Only teachers can make plans.")}</p>}
      </Section>
    </form>
  );
}
