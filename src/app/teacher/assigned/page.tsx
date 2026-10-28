import Link from "next/link";
import { SkillStar, StarLegend } from "@/components/skills/skill-star";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit";
import { ConfirmForm } from "@/components/teacher/confirm-form";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { getT } from "@/i18n/server";
import type { TFn } from "@/i18n";
import { ASSIGNED_KIND_LABEL, ASSIGNED_KINDS, ASSIGNED_STATUS_LABEL, assignedList, assignedStudents, isAssignedKind, type AssignedItem, type AssignedStatus } from "@/server/teacher/assigned";
import { cancelAssignedAction, restoreAssignedAction } from "./actions";
import { AssignedBulkBar } from "@/components/teacher/assigned-bulk";
import { WORK_TABS, WORK_TAB_LABEL, isWorkTab } from "@/lib/work-tab";

export const metadata = { title: "Assigned" };

type SP = { classId?: string; kind?: string; status?: string; from?: string; to?: string; teacher?: string; open?: string; done?: string; k?: string; i?: string; s?: string; err?: string; all?: string; tab?: string };
const SHOWN = 100;
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");
const TONE: Record<AssignedStatus, string> = {
  SCHEDULED: "bg-violet-50 text-violet-800 ring-violet-200", OPEN: "bg-sky-50 text-sky-800 ring-sky-200", LATE: "bg-amber-50 text-amber-900 ring-amber-200",
  DONE: "bg-emerald-50 text-emerald-800 ring-emerald-200", CANCELLED: "bg-slate-100 text-slate-600 ring-slate-300",
};
/** 🔴🟢⏳ the status groups, in this order; Late opens by default (most urgent), the rest start collapsed. */
const STATUS_ORDER: AssignedStatus[] = ["LATE", "OPEN", "SCHEDULED", "DONE", "CANCELLED"];
const STATUS_ICON: Record<AssignedStatus, string> = { LATE: "🔴", OPEN: "🟢", SCHEDULED: "⏳", DONE: "✅", CANCELLED: "🗂️" };
/** a real table's columns: a leading checkbox cell, then Skill · Class · Due · Progress · Status · Tab · Actions. */
const COLS = "grid grid-cols-[1.75rem_minmax(0,1.6fr)_minmax(0,10rem)_7rem_3.5rem_6rem_6rem_2.25rem] items-center gap-x-2";

/** Rows sharing the same kind + title grouped together (the user's screenshot: the same skill assigned 3 times). */
function groupBySkill(rows: AssignedItem[]): { key: string; title: string; rows: AssignedItem[] }[] {
  const order: string[] = [];
  const by = new Map<string, AssignedItem[]>();
  for (const x of rows) {
    const key = `${x.kind}:${x.title}`;
    if (!by.has(key)) { by.set(key, []); order.push(key); }
    by.get(key)!.push(x);
  }
  return order.map((key) => ({ key, title: by.get(key)![0].title, rows: by.get(key)! }));
}

/** 📂 Rows grouped by status (Late / Open / Scheduled / Done / Cancelled), in STATUS_ORDER, only the statuses present. */
function groupByStatus(rows: AssignedItem[]): { status: AssignedStatus; rows: AssignedItem[] }[] {
  const by = new Map<AssignedStatus, AssignedItem[]>();
  for (const x of rows) by.set(x.status, [...(by.get(x.status) ?? []), x]);
  return STATUS_ORDER.filter((st) => by.has(st)).map((status) => ({ status, rows: by.get(status)! }));
}

/** ⋮ a small overflow menu (native <details>, no client JS) replacing the always-visible per-row buttons. */
function RowActions({ x, t, href, back }: { x: AssignedItem; t: TFn; href: (e: Record<string, string | null>) => string; back: string }) {
  return (
    <details className="relative justify-self-end">
      <summary aria-label={t("Actions")} className="flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-md text-ink-2 ring-1 ring-line hover:ring-brand-teal">⋮</summary>
      <div className="absolute end-0 top-8 z-10 w-48 space-y-1 rounded-lg bg-surface p-1.5 shadow-card ring-1 ring-line">
        <Link prefetch={false} href={href({ open: `${x.kind}:${x.id}` })} className="block rounded-md px-2.5 py-1.5 text-start text-xs font-semibold text-brand-navy hover:bg-surface-2">{t("Students")}</Link>
        {x.cancelled
          ? <ConfirmForm action={restoreAssignedAction} fields={{ kind: x.kind, id: x.id, studentId: "", back }} label={t("Undo")} />
          : <ConfirmForm action={cancelAssignedAction} fields={{ kind: x.kind, id: x.id, studentId: "", back }} label={t("Cancel assignment")} tone="danger" ask={t("Cancel “{title}” for everyone? Students will no longer see it; their answers are kept.", { title: x.title })} />}
      </div>
    </details>
  );
}

/** One table row: a single assignment (a leaf row, whether shown directly or nested under its skill's group). */
function ItemRow({ x, t, who, href, back, admin }: { x: AssignedItem; t: TFn; who: (x: AssignedItem) => string; href: (e: Record<string, string | null>) => string; back: string; admin: boolean }) {
  return (
    <div className={`${COLS} px-3 py-1.5 text-sm ${x.cancelled ? "bg-surface-2/60" : ""}`}>
      <input type="checkbox" name="sel" value={`${x.kind}:${x.id}`} data-kind={x.kind} data-unit={x.unit ?? ""} aria-label={`${t("Select")}: ${x.title}`} className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate">
        <span className={`font-semibold ${x.cancelled ? "text-muted" : "text-ink"}`} data-content lang="en">{x.title}</span>
        <span className="ms-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-xs text-ink-2 ring-1 ring-line">{t(ASSIGNED_KIND_LABEL[x.kind])}{x.detail ? ` · ${x.detail}` : ""}</span>
      </span>
      <span className="min-w-0 truncate text-xs text-muted"><bdi>{who(x)}</bdi>{admin && x.teacher ? <> · <bdi>{x.teacher.name}</bdi></> : null}</span>
      <span className="truncate text-xs text-muted" dir="ltr">{x.startAt ? <>{t("Start")}: {day(x.startAt)} · </> : null}{day(x.dueAt)}</span>
      <span className="text-xs tabular-nums text-ink-2" dir="ltr" title={t("Finished / students")}>{x.done}/{x.recipients}</span>
      <span className={`justify-self-start rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${TONE[x.status]}`}>{t(ASSIGNED_STATUS_LABEL[x.status])}</span>
      <span>{x.tab ? <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200">📂 {t(WORK_TAB_LABEL[x.tab])}</span> : null}</span>
      <RowActions x={x} t={t} href={href} back={back} />
    </div>
  );
}

/** One skill group within a status section: a single row directly, or (same title repeated) a nested accordion. */
function SkillGroup({ g, t, who, href, back, admin }: { g: { key: string; title: string; rows: AssignedItem[] }; t: TFn; who: (x: AssignedItem) => string; href: (e: Record<string, string | null>) => string; back: string; admin: boolean }) {
  if (g.rows.length === 1) return <ItemRow x={g.rows[0]} t={t} who={who} href={href} back={back} admin={admin} />;
  return (
    <details>
      <summary className="flex min-h-9 cursor-pointer items-center gap-1.5 px-3 py-1.5 text-sm">
        <span className="min-w-0 truncate font-semibold text-ink" data-content lang="en">{g.title}</span>
        <span className="font-normal text-muted">({g.rows.length})</span>
      </summary>
      <div className="divide-y divide-line border-t border-line ps-5">
        {g.rows.map((x) => <ItemRow key={`${x.kind}:${x.id}`} x={x} t={t} who={who} href={href} back={back} admin={admin} />)}
      </div>
    </details>
  );
}

/** One status section (🔴 Late / 🟢 Open / ⏳ Scheduled / …): its own column header, then its skill groups. */
function StatusSection({ g, t, who, href, back, admin, defaultOpen }: { g: { status: AssignedStatus; rows: AssignedItem[] }; t: TFn; who: (x: AssignedItem) => string; href: (e: Record<string, string | null>) => string; back: string; admin: boolean; defaultOpen: boolean }) {
  return (
    <details open={defaultOpen}>
      <summary className="flex min-h-10 cursor-pointer items-center gap-1.5 bg-surface-2/50 px-3 py-2 text-sm font-semibold text-ink">
        <span aria-hidden="true">{STATUS_ICON[g.status]}</span>{t(ASSIGNED_STATUS_LABEL[g.status])} <span className="font-normal text-muted">({g.rows.length})</span>
      </summary>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className={`${COLS} border-b border-line px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted`}>
            <span aria-hidden="true" />
            <span>{t("Skill")}</span><span>{t("Class")}</span><span dir="ltr">{t("Due")}</span><span>{t("Progress")}</span><span>{t("Status")}</span><span>{t("Tab")}</span><span className="text-end">{t("Actions")}</span>
          </div>
          <div className="divide-y divide-line">
            {groupBySkill(g.rows).map((sg) => <SkillGroup key={sg.key} g={sg} t={t} who={who} href={href} back={back} admin={admin} />)}
          </div>
        </div>
      </div>
    </details>
  );
}

/**
 * 📌 Assigned: everything the teacher assigned in one list (skills, plans, tests of every type, MAP and NAFS tests,
 * NAFS practice, Learn lessons, words, ReadRise, writing, fluency, exit tickets, Respond to Reading, progress checks,
 * short lessons) — who it went to, due date, progress x / y — with Cancel (for everyone, or one student) and Undo.
 * Cancel is soft: the students' answers and results are kept. The admin sees every teacher's (filter by teacher).
 * Data and rules: src/server/teacher/assigned.ts.
 */
export default async function AssignedPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "assignments:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [{ t }, v] = await Promise.all([getT(), assignedList(repo, actor, { classId: sp.classId, kind: sp.kind, status: sp.status, from: sp.from, to: sp.to, teacher: sp.teacher })]);
  const [openKind, openId] = String(sp.open ?? "").split(":");
  const open = isAssignedKind(openKind) && openId ? await assignedStudents(repo, actor, openKind, openId).catch(() => null) : null;
  // the query string kept by every button (filters stay after Cancel / Undo)
  const keep = new URLSearchParams(Object.entries({ classId: sp.classId, kind: sp.kind, status: sp.status, from: sp.from, to: sp.to, teacher: sp.teacher, open: sp.open, all: sp.all, tab: sp.tab }).filter((e): e is [string, string] => Boolean(e[1])));
  const back = `?${keep.toString()}`;
  const href = (extra: Record<string, string | null>) => { const q = new URLSearchParams(keep); for (const [k, x] of Object.entries(extra)) { if (x) q.set(k, x); else q.delete(k); } return `/teacher/assigned?${q.toString()}`; };
  // 📂 My Work tab filter: "NONE" = untagged skills only; a tab value = that tab only; unset = everyone
  const byTab = sp.tab === "NONE" ? v.items.filter((x) => !x.tab) : isWorkTab(sp.tab) ? v.items.filter((x) => x.tab === sp.tab) : v.items;
  const shown = sp.all ? byTab : byTab.slice(0, SHOWN);
  const field = "h-9 rounded-lg bg-surface px-2 text-sm text-ink ring-1 ring-line";
  const who = (x: AssignedItem) => x.scope === "class" ? (x.classNames.join(", ") || t("Whole class")) : `${x.classNames.join(", ")}${x.classNames.length ? " · " : ""}${t("{n} chosen students", { n: x.recipients + x.removed })}`;
  const doneMsg = sp.done === "cancelled" ? t("Cancelled. Students no longer see it; their answers are kept.") : sp.done === "removed" ? t("Removed for this student. Their answers are kept.") : sp.done === "restored" ? t("Restored: it is back in the students' My Work.") : null;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader title="Assigned" subtitle={v.admin ? t("Everything the teachers assigned. Cancel hides it from the students at once; their answers are kept.") : t("Everything you assigned. Cancel hides it from the students at once; their answers are kept.")} />

      {doneMsg && (
        <p role="status" className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-900 ring-1 ring-teal-200">
          {doneMsg}
          {sp.done !== "restored" && isAssignedKind(sp.k) && sp.i && <ConfirmForm action={restoreAssignedAction} fields={{ kind: sp.k, id: sp.i, studentId: sp.s ?? "", back }} label={t("Undo")} />}
        </p>
      )}
      {sp.err && <p role="alert" className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 ring-1 ring-rose-200">{t(sp.err)}</p>}

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2 rounded-xl bg-surface p-3 ring-1 ring-line" aria-label={t("Filter")}>
        <label className="grid gap-0.5 text-xs font-semibold text-muted">{t("Class")}
          <select name="classId" defaultValue={sp.classId ?? ""} className={field}><option value="">{t("All classes")}</option>{v.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="grid gap-0.5 text-xs font-semibold text-muted">{t("Type")}
          <select name="kind" defaultValue={sp.kind ?? ""} className={field}><option value="">{t("All types")}</option>{ASSIGNED_KINDS.map((k) => <option key={k} value={k}>{t(ASSIGNED_KIND_LABEL[k])}</option>)}</select></label>
        <label className="grid gap-0.5 text-xs font-semibold text-muted">{t("Status")}
          <select name="status" defaultValue={sp.status ?? ""} className={field}><option value="">{t("Not cancelled")}</option><option value="ALL">{t("All")}</option>{(Object.keys(ASSIGNED_STATUS_LABEL) as AssignedStatus[]).map((k) => <option key={k} value={k}>{t(ASSIGNED_STATUS_LABEL[k])}</option>)}</select></label>
        <label className="grid gap-0.5 text-xs font-semibold text-muted">{t("My Work tab")}
          <select name="tab" defaultValue={sp.tab ?? ""} className={field}><option value="">{t("All")}</option><option value="NONE">{t("No tab")}</option>{WORK_TABS.map((k) => <option key={k} value={k}>{t(WORK_TAB_LABEL[k])}</option>)}</select></label>
        <label className="grid gap-0.5 text-xs font-semibold text-muted">{t("From")}<input type="date" name="from" defaultValue={sp.from ?? ""} className={field} dir="ltr" /></label>
        <label className="grid gap-0.5 text-xs font-semibold text-muted">{t("To")}<input type="date" name="to" defaultValue={sp.to ?? ""} className={field} dir="ltr" /></label>
        {v.admin && <label className="grid gap-0.5 text-xs font-semibold text-muted">{t("Teacher")}
          <select name="teacher" defaultValue={sp.teacher ?? ""} className={field}><option value="">{t("All teachers")}</option>{v.teachers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        <button className="h-9 rounded-lg bg-brand-navy px-4 text-sm font-semibold text-white">{t("Show")}</button>
        {keep.size > 0 && <Link prefetch={false} href="/teacher/assigned" className="inline-flex h-9 items-center px-2 text-sm font-semibold text-brand-teal hover:underline">{t("Clear")}</Link>}
      </form>

      {open && (
        <section aria-labelledby="open-h" className="mb-4 rounded-xl bg-surface p-3 shadow-card ring-1 ring-line">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="open-h" className="text-base font-semibold text-ink"><span data-content lang="en">{open.item.title}</span> <span className="text-sm font-normal text-muted">· {t(ASSIGNED_KIND_LABEL[open.item.kind])} · <span dir="ltr">{open.item.done}/{open.item.recipients}</span></span></h2>
            <Link prefetch={false} href={href({ open: null })} className="text-sm font-semibold text-brand-teal hover:underline">{t("Close")}</Link>
          </div>
          {open.students.some((x) => x.star) && <StarLegend t={t} className="mt-2" />}
          <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {open.students.map((x) => (
              <li key={x.id} className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm ring-1 ring-line ${x.removed ? "opacity-60" : ""}`}>
                <span className="min-w-0 truncate">{x.star && <span className="me-1 inline-flex align-middle"><SkillStar info={{ status: x.star }} t={t} label={x.name} size={14} /></span>}<bdi>{x.name}</bdi> <span className={`text-xs ${x.done ? "text-emerald-700" : "text-muted"}`}>· {x.removed ? t("Removed") : x.done ? t("Done") : t("Not done")}</span></span>
                {!open.item.cancelled && (x.removed
                  ? <ConfirmForm action={restoreAssignedAction} fields={{ kind: open.item.kind, id: open.item.id, studentId: x.id, back }} label={t("Undo")} />
                  : <ConfirmForm action={cancelAssignedAction} fields={{ kind: open.item.kind, id: open.item.id, studentId: x.id, back }} label={t("Remove")} tone="danger" ask={t("Remove this work for {name}? Their answers are kept.", { name: x.name })} />)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {v.items.length === 0 ? <EmptyState icon="📌" title="Nothing assigned yet" text="Work you assign (skills, tests, MAP, NAFS, Learn, ReadRise, writing …) is listed here." /> : (
        <section aria-label={t("Assigned")} className="overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-line">
          <p className="border-b border-line px-3 py-2 text-xs text-muted">{t("{n} items", { n: byTab.length })}</p>
          <AssignedBulkBar listId="assigned-list" cancelledView={sp.status === "CANCELLED"}
            kinds={ASSIGNED_KINDS.filter((k) => shown.some((x) => x.kind === k)).map((k) => ({ key: k, label: t(ASSIGNED_KIND_LABEL[k]) }))}
            units={[...new Set(shown.map((x) => x.unit).filter((u): u is string => Boolean(u)))].sort((a, b) => Number(a.slice(5)) - Number(b.slice(5)))} />
          {/* 🔴🟢⏳ status groups (Late open by default, the rest collapsed) → same-skill groups → table rows */}
          <div id="assigned-list" className="divide-y divide-line">
            {groupByStatus(shown).map((g) => <StatusSection key={g.status} g={g} t={t} who={who} href={href} back={back} admin={v.admin} defaultOpen={g.status === "LATE"} />)}
          </div>
          {!sp.all && byTab.length > SHOWN && <p className="border-t border-line px-3 py-2"><Link prefetch={false} href={href({ all: "1" })} className="text-sm font-semibold text-brand-teal hover:underline">{t("Show all ({n})", { n: byTab.length })}</Link></p>}
        </section>
      )}
    </AppShell>
  );
}
