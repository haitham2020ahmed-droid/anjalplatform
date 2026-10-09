import Link from "next/link";
import type { AssignedView } from "@/server/student/assigned";
import type { StudentWeek } from "@/server/teacher/classroom";
import { setMyGoalAction } from "@/app/student/goal-actions";

const LABEL = { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", COMPLETED: "Completed", OVERDUE: "Overdue" } as const;
const TONE = { NOT_STARTED: "bg-slate-100 text-slate-700", IN_PROGRESS: "bg-sky-100 text-sky-900", COMPLETED: "bg-teal-100 text-teal-900", OVERDUE: "bg-red-100 text-red-800" } as const;
const BAR = { NOT_STARTED: "bg-slate-300", IN_PROGRESS: "bg-sky-500", COMPLETED: "bg-teal-500", OVERDUE: "bg-red-500" } as const;

export interface StudentExtras { lexile: number | null; readingLevel: "ABOVE" | "ON" | "BELOW" | null; rit: number | null; ritGoal: number | null; grade?: number; plans?: number; streak?: number; points?: number; activeToday?: boolean; games?: { code: string; title: string }[]; respond?: { todo: number; next: string | null }; badges?: number; newBadge?: { icon: string; name: string } | null; week?: StudentWeek; exitTicket?: { id: string; title: string } | null; reviewDue?: number; newComments?: number; goalMsg?: string | null; mapTests?: number; challenge?: { mine: { name: string; perStudent: number; rank: number } | null; all: { classId: string; name: string; perStudent: number; rank: number }[] } | null; writingTodo?: number }

/** A completion ring (SVG). */
function Ring({ pct }: { pct: number }) {
  const r = 42, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90" role="img" aria-label={`${pct}% of my work done`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(255 255 255 / .2)" strokeWidth="10" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--color-brand-gold)" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} style={{ ["--ring-full" as string]: `${c}`, animation: "ring-fill 1s ease-out both" }} />
      <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="rotate-90" transform="rotate(90 50 50)" fill="white" fontSize="22" fontWeight="700">{pct}%</text>
    </svg>
  );
}

/** The student's home: a welcome card, the three big doors (work, ReadMaster, MAP), then the assigned work. */
export function AssignedSkills({ view, firstName, placement, area = "ALL", extras, qotd }: { view: AssignedView; firstName: string; placement: boolean; area?: "ALL" | "CURRICULUM" | "MAP" | "NAFS" | "GRAMMAR"; extras?: StudentExtras; qotd?: React.ReactNode }) {
  const { summary } = view;
  // MAP work lives in My MAP: here only a reminder
  const mapTodo = view.items.filter((i) => i.track === "MAP" && i.status !== "COMPLETED");
  const mapLate = mapTodo.some((i) => i.status === "OVERDUE");
  const items = area === "ALL" ? view.items.filter((i) => i.track !== "MAP") : area === "GRAMMAR" ? view.items.filter((i) => i.grammar) : view.items.filter((i) => i.track === area);
  const pct = summary.assigned ? Math.round((100 * summary.completed) / summary.assigned) : 0;
  const next = view.items.find((i) => i.status !== "COMPLETED" && !i.startsLater && i.track !== "MAP") ?? view.items.find((i) => i.status !== "COMPLETED" && !i.startsLater);
  const workTodo = view.items.filter((i) => i.track !== "MAP" && i.status !== "COMPLETED" && !i.startsLater).length;
  const wk = extras?.week;
  const bar = (p: number, t: number) => <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={t} aria-valuenow={Math.min(p, t)}><div className="h-full rounded-full bg-gradient-to-r bg-linear-to-r from-brand-teal to-emerald-500" style={{ width: `${Math.min(100, Math.round((100 * p) / Math.max(1, t)))}%` }} /></div>;
  const hrefOf = (i: AssignedView["items"][number]) => (i.kind === "questions" ? `/quiz/${i.assignmentId}` : `/practice/${i.skillId}`);
  const hour = new Date().getUTCHours() + 3; // Saudi time
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const chip = (active: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold transition ${active ? "bg-brand-navy text-white shadow" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <div className="space-y-6">
      {/* welcome */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br bg-linear-to-br from-brand-navy via-[#2b3f8f] to-brand-purple p-6 text-white shadow-lg sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-brand-teal/30 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-brand-gold/20 blur-2xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-sm font-medium text-white/80">{greet},</p>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{firstName} <span className="inline-block animate-float">👋</span></h1>
            <p className="mt-2 max-w-md text-white/85">{summary.assigned === 0 ? "Your teacher will assign work soon. Meanwhile, read an article in ReadMaster!" : pct === 100 ? "Everything is done. Amazing work! 🎉" : `You have ${summary.assigned - summary.completed} task${summary.assigned - summary.completed === 1 ? "" : "s"} to finish.`}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              {extras?.streak ? <span className="animate-pop rounded-full bg-orange-500 px-3 py-1 font-bold text-white shadow" title={extras.activeToday ? "You practised today!" : "Practise today to keep your streak"}>🔥 {extras.streak}-day streak{extras.activeToday ? "" : " · practise today!"}</span> : <span className="rounded-full bg-white/15 px-3 py-1 font-semibold ring-1 ring-white/25">🔥 Start a streak today</span>}
              {extras?.points ? <span className="rounded-full bg-brand-gold px-3 py-1 font-bold text-brand-navy">⭐ {extras.points.toLocaleString("en")} points</span> : null}
              <a href="/student/badges" className="rounded-full bg-white/15 px-3 py-1 font-semibold ring-1 ring-white/25 hover:bg-white/25">🏅 {extras?.badges ?? 0} badge{extras?.badges === 1 ? "" : "s"}</a>
              {extras?.lexile != null && <span className="rounded-full bg-white/15 px-3 py-1 font-semibold ring-1 ring-white/25">📖 Lexile {extras.lexile}L</span>}
              {extras?.rit != null && <span className="rounded-full bg-white/15 px-3 py-1 font-semibold ring-1 ring-white/25">🗺️ RIT {extras.rit}{extras.ritGoal ? ` → goal ${extras.ritGoal}` : ""}</span>}
              {summary.overdue > 0 && <span className="rounded-full bg-red-500/90 px-3 py-1 font-semibold">⏰ {summary.overdue} overdue</span>}
              {view.newThisWeek > 0 && <span className="rounded-full bg-brand-gold px-3 py-1 font-semibold text-brand-navy">✨ {view.newThisWeek} new this week</span>}
            </div>
          </div>
          {summary.assigned > 0 && <Ring pct={pct} />}
        </div>
        {next && (
          <a href={hrefOf(next)} className="lift relative mt-6 flex items-center justify-between gap-4 rounded-2xl bg-white/95 p-4 text-brand-navy">
            <span><span className="block text-xs font-bold uppercase tracking-wider text-brand-teal">Next up</span><span className="block text-lg font-bold">{next.skill}</span></span>
            <span className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white">{next.status === "NOT_STARTED" ? "Start ▶" : "Continue ▶"}</span>
          </a>
        )}
      </section>

      {extras?.games?.map((g) => (

        <Link key={g.code} href={`/play/${g.code}`} className="animate-pop lift flex items-center justify-between gap-3 rounded-2xl bg-brand-gold px-5 py-4 font-bold text-brand-navy shadow-lg">

          <span>🎮 A game is open: <span className="font-black">{g.title}</span></span><span className="rounded-xl bg-brand-navy px-4 py-2 text-white">Join now ▶</span>

        </Link>

      ))}

      {extras?.newBadge && (
        <a href="/student/badges" className="animate-pop lift flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r bg-linear-to-r from-amber-300 to-brand-gold px-5 py-4 font-bold text-brand-navy shadow-lg">
          <span>🎉 New badge: {extras.newBadge.icon} {extras.newBadge.name}!</span><span className="rounded-xl bg-brand-navy px-4 py-2 text-white">See ▶</span>
        </a>
      )}

      {extras?.respond && extras.respond.todo > 0 && (
        <Link href={extras.respond.next ? `/student/respond/${extras.respond.next}` : "/student/respond"} className="animate-pop lift flex items-center justify-between gap-3 rounded-2xl bg-violet-600 px-5 py-4 font-bold text-white shadow-lg">
          <span>✍️ Respond to Reading: {extras.respond.todo} to write in your book</span><span className="rounded-xl bg-white px-4 py-2 text-violet-700">Open ▶</span>
        </Link>
      )}

      {extras?.exitTicket && (
        <Link href={`/student/exit/${extras.exitTicket.id}`} className="animate-pop lift flex items-center justify-between gap-3 rounded-2xl bg-sky-600 px-5 py-4 font-bold text-white shadow-lg">
          <span>{extras.exitTicket.title}: 3 quick questions</span><span className="rounded-xl bg-white px-4 py-2 text-sky-700">Answer ▶</span>
        </Link>
      )}
      {(extras?.mapTests ?? 0) > 0 && (
        <Link href="/student/map-test" className="animate-pop lift flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r bg-linear-to-r from-sky-600 to-brand-navy px-5 py-4 font-bold text-white shadow-lg">
          <span>🧭 MAP practice test is open ({extras!.mapTests} to do) — try the warm-up first!</span><span className="rounded-xl bg-white px-4 py-2 text-brand-navy">Start ▶</span>
        </Link>
      )}
      {mapTodo.length > 0 && (
        <Link href="/student/map" className={`lift flex items-center justify-between gap-3 rounded-2xl px-5 py-4 font-bold shadow ${mapLate ? "bg-red-50 text-red-900 ring-1 ring-red-200" : "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200"}`}>
          <span>🗺️ You have {mapTodo.length} MAP task{mapTodo.length === 1 ? "" : "s"}{mapLate ? " (late)" : ""} — they are in My MAP</span><span className="rounded-xl bg-brand-navy px-4 py-2 text-white">My MAP ▶</span>
        </Link>
      )}
      {(extras?.reviewDue ?? 0) > 0 && (
        <Link href="/student/review" className="lift flex items-center justify-between gap-3 rounded-2xl bg-white px-5 py-4 font-bold text-brand-navy shadow ring-1 ring-slate-200">
          <span>🔁 {extras!.reviewDue} question{extras!.reviewDue === 1 ? "" : "s"} to review today (your past mistakes)</span><span className="rounded-xl bg-brand-navy px-4 py-2 text-white">Review ▶</span>
        </Link>
      )}
      {(extras?.newComments ?? 0) > 0 && (
        <Link href="/student/comments" className="lift flex items-center justify-between gap-3 rounded-2xl bg-white px-5 py-4 font-bold text-brand-navy shadow ring-1 ring-amber-200">
          <span>💬 {extras!.newComments} new comment{extras!.newComments === 1 ? "" : "s"} from your teacher</span><span className="rounded-xl bg-amber-400 px-4 py-2 text-brand-navy">Read ▶</span>
        </Link>
      )}

      {(extras?.writingTodo ?? 0) > 0 && (
        <Link href="/student/writing" className="lift flex items-center justify-between gap-3 rounded-2xl bg-rose-50 px-5 py-4 font-bold text-rose-900 shadow ring-1 ring-rose-200">
          <span>✍️ {extras!.writingTodo} writing / reading-aloud task{extras!.writingTodo === 1 ? "" : "s"} from your teacher</span><span className="rounded-xl bg-brand-navy px-4 py-2 text-white">Open ▶</span>
        </Link>
      )}
      {(qotd || extras?.challenge) && (
        <div className="grid gap-4 md:grid-cols-2">
          {qotd}
          {extras?.challenge && (
            <section className="rounded-3xl bg-gradient-to-br bg-linear-to-br from-indigo-50 to-white p-5 ring-1 ring-indigo-200">
              <h2 className="font-bold text-brand-navy">🏁 Class challenge this week</h2>
              <p className="text-sm text-slate-600">Answers per student, class by class. Every answer helps your class!</p>
              <ol className="mt-2 space-y-1">{extras.challenge.all.map((c) => <li key={c.classId} className={`flex items-center justify-between rounded-xl px-3 py-1.5 ${c.classId === extras.challenge!.all.find((x) => x.name === extras.challenge!.mine?.name)?.classId ? "bg-indigo-600 font-bold text-white" : "bg-white ring-1 ring-slate-200"}`}><span>{c.rank === 1 ? "🥇" : c.rank === 2 ? "🥈" : c.rank === 3 ? "🥉" : `${c.rank}.`} {c.name}</span><span className="tabular-nums">{c.perStudent}</span></li>)}</ol>
            </section>
          )}
        </div>
      )}
      {wk && (
        <section id="my-week" className="scroll-mt-24 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="font-bold text-brand-navy">🎯 My goal this week</h2>
            {extras?.goalMsg && <p className="mt-1 text-sm text-emerald-800">{extras.goalMsg}</p>}
            {wk.mine ? (
              <><p className="mt-1 text-2xl font-extrabold text-brand-navy">{wk.mine.progress} / {wk.mine.target} <span className="text-base font-semibold text-slate-500">{wk.mine.kind === "MINUTES" ? "minutes" : "answers"}</span> {wk.mine.done ? "🎉" : ""}</p>{bar(wk.mine.progress, wk.mine.target)}</>
            ) : (
              <form action={setMyGoalAction} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <input name="target" type="number" min={5} max={600} defaultValue={50} aria-label="My goal" className="w-20 rounded-lg border border-slate-300 px-2 py-1.5" />
                <select name="kind" aria-label="Goal kind" className="rounded-lg border border-slate-300 px-2 py-1.5"><option value="ANSWERS">answers</option><option value="MINUTES">minutes</option></select>
                <button className="rounded-lg bg-brand-navy px-3 py-1.5 font-semibold text-white">Set my goal</button>
              </form>
            )}
            <p className="mt-2 text-xs text-slate-500">This week: {wk.answers} answers · {wk.minutes} min</p>
          </div>
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="font-bold text-brand-navy">👥 Our class goal</h2>
            {wk.klass ? <><p className="mt-1 text-sm text-slate-600">{wk.klass.title ?? `${wk.klass.target} ${wk.klass.kind.toLowerCase()}`}</p><p className="text-2xl font-extrabold text-brand-navy">{wk.klass.progress} / {wk.klass.target} {wk.klass.done ? "🎉" : ""}</p>{bar(wk.klass.progress, wk.klass.target)}</> : <p className="mt-1 text-sm text-slate-500">Your teacher has not set a class goal this week.</p>}
          </div>
          <div className="rounded-3xl bg-white p-5 ring-1 ring-slate-200">
            <h2 className="font-bold text-brand-navy">📅 Practice days</h2>
            {wk.rhythm ? <><p className="mt-1 text-2xl font-extrabold text-brand-navy">{wk.rhythm.daysDone} / {wk.rhythm.days} <span className="text-base font-semibold text-slate-500">days</span></p><p className="text-sm text-slate-600">About {wk.rhythm.minutes} minutes each day.</p>{bar(wk.rhythm.daysDone, wk.rhythm.days)}</> : <p className="mt-1 text-sm text-slate-500">Practise a little every day: it works better than a lot at once.</p>}
          </div>
        </section>
      )}

      {placement && <Link href="/student/placement" className="block rounded-2xl bg-brand-gold px-5 py-4 font-bold text-brand-navy shadow lift">📝 Your school asks you to take the placement test first →</Link>}

      {/* the three big doors */}
      <nav aria-label="My areas" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <a href="#my-work" className="lift group rounded-3xl bg-white p-5 ring-1 ring-slate-200">
          <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-2xl bg-sky-100 text-3xl transition group-hover:scale-110">📘</span>
          <span className="mt-3 flex items-center gap-2 text-xl font-bold text-brand-navy">My work {workTodo > 0 && <span className={`rounded-full px-2 py-0.5 text-sm font-bold text-white ${view.items.some((i) => i.track !== "MAP" && i.status === "OVERDUE") ? "bg-red-600" : "bg-sky-600"}`}>{workTodo}</span>}</span>
          <span className="block text-sm text-slate-600">{summary.completed}/{summary.assigned} done</span>
        </a>
        <a href="/student/skills" className="lift group rounded-3xl bg-gradient-to-br bg-linear-to-br from-teal-50 to-white p-5 ring-1 ring-teal-200">
          <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-2xl bg-teal-100 text-3xl transition group-hover:scale-110">🧩</span>
          <span className="mt-3 block text-xl font-bold text-brand-navy">My skills</span>
          <span className="block text-sm text-slate-600">Practise or 🎮 play any skill</span>
        </a>
        <a href="/student/readmaster" className="lift group rounded-3xl bg-gradient-to-br bg-linear-to-br from-amber-50 to-white p-5 ring-1 ring-amber-200">
          <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-3xl transition group-hover:scale-110">⭐</span>
          <span className="mt-3 block text-xl font-bold text-brand-navy">ReadMaster</span>
          <span className="block text-sm text-slate-600">Articles at my level · my Lexile grows</span>
        </a>
        <Link href="/student/plans" className="lift group rounded-3xl bg-gradient-to-br bg-linear-to-br from-violet-50 to-white p-5 ring-1 ring-violet-200">
          <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-3xl transition group-hover:scale-110">🗂️</span>
          <span className="mt-3 block text-xl font-bold text-brand-navy">My plans</span>
          <span className="block text-sm text-slate-600">{extras?.plans ? `${extras.plans} plan${extras.plans === 1 ? "" : "s"} from my teacher` : "Skill plans from my teacher"}</span>
        </Link>
        <Link href="/play" className="lift group rounded-3xl bg-gradient-to-br bg-linear-to-br from-rose-50 to-white p-5 ring-1 ring-rose-200">
          <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-2xl bg-rose-100 text-3xl transition group-hover:scale-110">🎮</span>
          <span className="mt-3 block text-xl font-bold text-brand-navy">Live game</span>
          <span className="block text-sm text-slate-600">Join my class quiz with the PIN</span>
        </Link>
        <a href="/student/map" className="lift group rounded-3xl bg-gradient-to-br bg-linear-to-br from-emerald-50 to-white p-5 ring-1 ring-emerald-200">
          <span aria-hidden="true" className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-3xl transition group-hover:scale-110">🗺️</span>
          <span className="mt-3 flex items-center gap-2 text-xl font-bold text-brand-navy">My MAP {mapTodo.length > 0 && <span className={`rounded-full px-2 py-0.5 text-sm font-bold text-white ${mapLate ? "bg-red-600" : "bg-sky-600"}`}>{mapTodo.length}</span>}</span>
          <span className="block text-sm text-slate-600">My results, my goal, my plan</span>
        </a>
      </nav>

      {/* my work */}
      <section id="my-work" className="scroll-mt-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-brand-navy">My work</h2>
          <nav aria-label="Filter" className="flex gap-2">
            <Link href="/student#my-work" aria-current={area === "ALL" ? "page" : undefined} className={chip(area === "ALL")}>All</Link>
            <Link href="/student?area=curriculum#my-work" aria-current={area === "CURRICULUM" ? "page" : undefined} className={chip(area === "CURRICULUM")}>📘 Curriculum</Link>
            <Link href="/student/map" className={chip(false)}>🗺️ MAP{mapTodo.length ? ` (${mapTodo.length})` : ""} →</Link>
            {view.items.some((i) => i.grammar) && <Link href="/student?area=grammar#my-work" aria-current={area === "GRAMMAR" ? "page" : undefined} className={chip(area === "GRAMMAR")}>🔤 Grammar</Link>}
            {(extras?.grade === 6 || view.items.some((i) => i.track === "NAFS")) && <Link href="/student?area=nafs#my-work" aria-current={area === "NAFS" ? "page" : undefined} className={chip(area === "NAFS")}>🇸🇦 Nafs</Link>}
          </nav>
        </div>
        {items.length === 0 ? (
          <div className="mt-4 rounded-3xl bg-white p-8 text-center ring-1 ring-slate-200">
            <p className="text-4xl" aria-hidden="true">{summary.assigned ? "🎉" : "📭"}</p>
            <p className="mt-2 text-lg font-semibold text-brand-navy">{summary.assigned ? "All caught up here!" : "Nothing assigned yet"}</p>
            <p className="text-slate-600">{summary.assigned ? "Great job. Try a ReadMaster article while you wait." : "When your teacher assigns work, it appears here and you get a notification."}</p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {items.map((i, k) => (
              <li key={i.assignmentId} className="lift animate-fade-up relative overflow-hidden rounded-2xl bg-white p-4 ps-5 ring-1 ring-slate-200" style={{ animationDelay: `${Math.min(k, 8) * 40}ms` }}>
                <span aria-hidden="true" className={`absolute inset-y-0 start-0 w-1.5 ${BAR[i.status]}`} />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-bold text-brand-navy" title={i.skill}><span aria-label={i.grammar ? "Grammar" : i.track === "MAP" ? "MAP" : i.track === "NAFS" ? "Nafs" : "Curriculum"}>{i.grammar ? "🔤" : i.track === "MAP" ? "🗺️" : i.track === "NAFS" ? "🇸🇦" : "📘"}</span> {i.skill}</h3>
                    <p className="text-sm text-slate-600">{i.kind === "questions" ? `${i.questionCount} questions` : i.standard ?? "Practice"}{i.dueAt ? ` · due ${i.dueAt.slice(0, 10)}` : ""}</p>
                    {i.note && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-sm text-amber-900">💬 {i.note}</p>}
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${TONE[i.status]}`}>{LABEL[i.status]}</span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(i.progress * 100)} aria-label={`Progress on ${i.skill}`}>
                    <div className={`h-full rounded-full transition-all duration-700 ${BAR[i.status]}`} style={{ width: `${Math.round(i.progress * 100)}%` }} />
                  </div>
                  <span className="w-10 text-end text-sm font-semibold tabular-nums text-slate-700">{Math.round(i.progress * 100)}%</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {i.startsLater ? <span className="text-sm text-slate-600">🔒 Starts {i.startAt!.slice(0, 10)}</span>
                    : i.status === "COMPLETED" ? (
                      <>
                        <Link href={`/student/assignments/${i.assignmentId}/report`} className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-purple">View report</Link>
                        {i.kind === "skill" && <Link href={`/practice/${i.skillId}`} className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Practise again</Link>}
                      </>
                    ) : <Link href={hrefOf(i)} className="rounded-xl bg-brand-navy px-5 py-2 text-sm font-semibold text-white hover:bg-brand-purple">{i.status === "NOT_STARTED" ? "Start ▶" : "Continue ▶"}</Link>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
