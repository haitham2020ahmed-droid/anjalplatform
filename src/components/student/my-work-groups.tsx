import Link from "next/link";
import type { StudentHome } from "@/server/student/student-home";
import { EmptyState, StatusPill } from "@/components/ui-kit";
import type { TFn } from "@/i18n";
import { groupMyWork, type TypeGroup, type WorkGroups } from "@/lib/my-work-groups";
import { SkillStar } from "@/components/skills/skill-star";
import { MasteryMeter } from "@/components/skills/mastery-meter";
import type { StarInfo } from "@/lib/skill-stars";
import { SourceChips } from "./my-work-list";

type Row = StudentHome["work"][number];
const STATUS: Record<Row["status"], "NOT_STARTED" | "IN_PROGRESS" | "DONE"> = { "Not started": "NOT_STARTED", "In progress": "IN_PROGRESS", Done: "DONE" };
const day = (v: string | null) => (v ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

/**
 * The done / total ring: a FIXED small size (it never grows with the number of items or questions — owner r67:
 * no long progress bar).
 */
export function WorkRing({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  const r = 16, c = 2 * Math.PI * r;
  return (
    <span data-testid="work-ring" role="img" aria-label={label} className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center">
      <svg viewBox="0 0 40 40" width="44" height="44" aria-hidden="true" className="-rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="5" className="stroke-slate-200" />
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="stroke-emerald-500" strokeDasharray={`${(c * pct) / 100} ${c}`} />
      </svg>
      <span className="absolute text-[10px] font-bold text-slate-700">{pct}%</span>
    </span>
  );
}

/** One compact row: the title, its status and due date, one button. */
function CompactCard({ r, t }: { r: Row; t: TFn }) {
  const star = (r as Row & { star?: StarInfo }).star;
  // a small "stars filled x/5" meter toward mastery, only while the skill is actively being learned (Mastered
  // already shows its gold star; Not started has no progress yet to show)
  const meter = star && star.status === "IN_PROGRESS" && typeof star.score === "number";
  return (
    <li data-testid="my-work-row" data-source={r.reteach ? "RETEACH" : r.sourceKey} data-kind={r.kind ?? "SKILL"} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-brand-navy">{star && <SkillStar info={star} who="student" t={t} label={r.skill} />}<bdi className="truncate">{r.skill}</bdi></p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
          {!r.kind && (r.sources?.length ?? 0) > 1 && <SourceChips sources={r.sources!} t={t} />}
          <StatusPill status={STATUS[r.status]} />
          {meter && <MasteryMeter score={star!.score!} answered={star!.answered} />}
          {r.overdue && r.status !== "Done" && <span className="rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700 ring-1 ring-red-200">{t("Late")}</span>}
          {r.dueAt && r.status !== "Done" && !r.overdue && <span className="text-slate-600">📅 {t("Due {date}", { date: day(r.dueAt) })}</span>}
        </div>
      </div>
      <Link prefetch={false} href={r.href} className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">{t(r.action)}</Link>
    </li>
  );
}

function TypeBlock({ g, t }: { g: TypeGroup<Row>; t: TFn }) {
  return (
    <div data-testid="work-type" data-type={g.type}>
      <h3 className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><span aria-hidden="true">{g.icon}</span>{t(g.label)} <span className="font-normal">({g.rows.length})</span></h3>
      <ul className="grid gap-1.5 sm:grid-cols-2">{g.first.map((r) => <CompactCard key={r.assignmentId} r={r} t={t} />)}</ul>
      {g.more.length > 0 && (
        <details className="mt-1.5">
          <summary className="flex min-h-10 cursor-pointer items-center text-sm font-semibold text-brand-navy">{t("Show all ({n})", { n: g.rows.length })}</summary>
          <ul className="mt-1.5 grid gap-1.5 sm:grid-cols-2">{g.more.map((r) => <CompactCard key={r.assignmentId} r={r} t={t} />)}</ul>
        </details>
      )}
    </div>
  );
}

function TimeBlock({ g, t }: { g: WorkGroups<Row>; t: TFn }) {
  return (
    <section data-testid="work-time" data-time={g.time} aria-label={t(g.label)} className="space-y-3">
      <h2 className="text-base font-bold text-brand-navy">{t(g.label)} <span className="font-normal text-slate-500">({g.total})</span></h2>
      {g.types.map((x) => <TypeBlock key={x.type} g={x} t={t} />)}
    </section>
  );
}

/**
 * 📋 My Work, organised: Due this week · Later · Done (folded), each split by type with small headers; compact
 * cards; at most 6 per type group, the rest under "Show all". Calm and mobile-first; students never see level words.
 */
export function MyWorkGroups({ rows, t, now = new Date() }: { rows: readonly Row[]; t: TFn; now?: Date }) {
  const [week, later, done] = groupMyWork(rows, now);
  if (!week.total && !later.total) {
    return (
      <>
        <EmptyState compact icon={done.total ? "🎉" : "🌈"} title={done.total ? "No work right now — great job!" : "Nothing here yet"} text="Your teacher will add work here soon. Pick something to read!" />
        {done.total > 0 && <DoneBlock g={done} t={t} />}
      </>
    );
  }
  return (
    <div className="space-y-6">
      {week.total > 0 && <TimeBlock g={week} t={t} />}
      {later.total > 0 && <TimeBlock g={later} t={t} />}
      {done.total > 0 && <DoneBlock g={done} t={t} />}
    </div>
  );
}

function DoneBlock({ g, t }: { g: WorkGroups<Row>; t: TFn }) {
  return (
    <details id="my-work-done" data-testid="work-time" data-time="DONE" className="rounded-2xl bg-emerald-50/60 p-3 ring-1 ring-emerald-100">
      <summary className="flex min-h-10 cursor-pointer items-center gap-2 font-semibold text-emerald-900"><span aria-hidden="true">✅</span>{t("Done ({n})", { n: g.total })}</summary>
      <div className="mt-2 space-y-3">{g.types.map((x) => <TypeBlock key={x.type} g={x} t={t} />)}</div>
    </details>
  );
}
