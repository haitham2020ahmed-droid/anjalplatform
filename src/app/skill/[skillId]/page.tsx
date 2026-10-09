import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { skillHub } from "@/server/skills/hub";

export const metadata = { title: "Skill" };

/** 🧩 One skill, joined up: curriculum, MAP, standards, continuum, questions, Curriculum Map places, students. */
export default async function SkillHubPage({ params }: { params: Promise<{ skillId: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const { skillId } = await params;
  let h;
  try { h = await skillHub(repo, actor, skillId); } catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const isAdmin = actor.role !== "TEACHER";
  const pct = (n: number) => (h.students.total ? Math.round((n / h.students.total) * 100) : 0);
  const node = "rounded-2xl bg-white p-4 ring-1 ring-slate-200";
  const head = "text-sm font-semibold text-slate-500";
  const chip = "inline-block rounded-lg bg-slate-50 px-2 py-1 text-sm text-slate-700 ring-1 ring-slate-200 hover:ring-brand-teal";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: isAdmin ? "/admin/skills" : "/admin/curriculum-map", label: isAdmin ? "Skills" : "Curriculum" }} icon="🧩" title={h.name}
        subtitle={<>Grade {h.grade} · {h.family}{h.area ? <> · MAP <b className="font-semibold text-brand-purple">{h.area.name}</b></> : ""}{h.description ? <span className="mt-1 block">{h.description}</span> : null}</>}>
        <Link href={`/teacher/skill-assign?skillId=${h.id}`} className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">⭐ Assign</Link>
        <Link href={`/admin/questions?status=PUBLISHED&skill=${h.id}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Questions</Link>
        <Link href={`/teacher/worksheet?skillId=${h.id}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">🖨 Worksheet</Link>
        {isAdmin && <Link href={`/admin/curriculum/skill/${h.id}`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal">Edit</Link>}
      </PageHeader>

      {/* the skill's thread: where it comes from → what practises it → who is learning it */}
      <section aria-label="How this skill connects" className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <div className={node}>
            <p className={head}>📚 Curriculum</p>
            <p className="mt-1 text-slate-800">Grade {h.grade}{h.units.length ? ` · ${h.units.map((u) => `Unit ${u.number}`).join(", ")}` : " · not placed in a unit"}</p>
            {h.units.some((u) => u.title !== `Unit ${u.number}`) && <ul className="mt-2 space-y-0.5 text-sm text-slate-600">{h.units.filter((u) => u.title !== `Unit ${u.number}`).map((u) => <li key={u.id}>Unit {u.number}: {u.title}</li>)}</ul>}
          </div>
          <div className={node}>
            <p className={head}>📏 Standards</p>
            {!h.standards.length ? <p className="mt-1 text-sm text-amber-800">No standard linked: it will not appear in the standards reports or the Learning Continuum.</p> : (
              <ul className="mt-2 space-y-1.5 text-sm">{h.standards.map((x) => <li key={x.code}><b className="text-slate-800">{x.code}</b>{x.description && <span className="text-slate-600"> — {x.description}</span>}</li>)}</ul>
            )}
          </div>
          {(h.before.length > 0 || h.after.length > 0) && (
            <div className={node}>
              <p className={head}>🪜 Learning order</p>
              {h.before.length > 0 && <p className="mt-2 text-sm text-slate-600">Learn first: {h.before.map((x, i) => <span key={x.id}>{i > 0 && ", "}<Link href={`/skill/${x.id}`} className="font-medium text-brand-teal hover:underline">{x.name}</Link></span>)}</p>}
              {h.after.length > 0 && <p className="mt-1 text-sm text-slate-600">Leads to: {h.after.map((x, i) => <span key={x.id}>{i > 0 && ", "}<Link href={`/skill/${x.id}`} className="font-medium text-brand-teal hover:underline">{x.name}</Link></span>)}</p>}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className={node}>
            <p className={head}>❓ Questions</p>
            <p className="mt-1 text-3xl font-bold text-brand-navy tabular-nums">{h.questions.published}<span className="ms-2 text-sm font-normal text-slate-500">published{h.questions.drafts ? ` · ${h.questions.drafts} drafts` : ""}</span></p>
            <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              {(["Below", "On", "Above"] as const).map((l, i) => <span key={l} className={["bg-amber-400", "bg-brand-teal", "bg-brand-purple"][i]} style={{ width: `${h.questions.published ? (h.questions.byLevel[l] / h.questions.published) * 100 : 0}%` }} />)}
            </div>
            <p className="mt-1.5 text-xs text-slate-600">Below {h.questions.byLevel.Below} · On {h.questions.byLevel.On} · Above {h.questions.byLevel.Above}</p>
            {h.questions.byType.length > 0 && <p className="mt-2 text-xs text-slate-500">{h.questions.byType.map((t) => `${t.name} ${t.n}`).join(" · ")}</p>}
          </div>
          <div className={`${node} ring-violet-200`}>
            <p className={head}>🗺️ MAP Growth</p>
            {!h.area ? <p className="mt-1 text-sm text-amber-800">Not linked to a MAP goal area: MAP plans cannot use it. <Link href="/admin/map-links" className="underline">Link it</Link></p> : (
              <>
                <p className="mt-1 font-medium text-brand-purple">{h.area.name}</p>
                <p className="text-sm text-slate-600">{h.questions.ritLow !== null ? <>Questions from RIT {h.questions.ritLow} to {h.questions.ritHigh}{h.questions.ranges.length ? ` · ranges ${h.questions.ranges.join(", ")}` : ""}</> : "No auto-marked questions yet."}</p>
                {h.area.group && <Link href={`/teacher/map-skill-plan?group=${h.area.group}&classId=none&grade=${h.grade}`} className="mt-2 inline-block text-sm font-medium text-brand-teal hover:underline">Open the MAP Skill Plan</Link>}
              </>
            )}
          </div>
          <div className={node}>
            <p className={head}>🧭 Curriculum Map places</p>
            {!h.places.length ? <p className="mt-1 text-sm text-slate-600">Its questions are not placed on the map yet; it is practised by skill.</p> : (
              <ul className="mt-2 flex flex-wrap gap-1.5">{h.places.slice(0, 24).map((p) => <li key={p.code}><Link href={`/admin/curriculum-map/place/${p.code}`} className={chip}>{p.code}</Link></li>)}</ul>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className={node}>
            <p className={head}>👥 Students · {h.students.scope}</p>
            {!h.students.total ? <p className="mt-1 text-sm text-slate-600">No students in this grade in your classes.</p> : (
              <>
                <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${h.students.mastered} mastered, ${h.students.practising} practising, ${h.students.notStarted} not started`}>
                  <span className="bg-emerald-500" style={{ width: `${pct(h.students.mastered)}%` }} /><span className="bg-amber-400" style={{ width: `${pct(h.students.practising)}%` }} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {([["Mastered", h.students.mastered, "text-emerald-700"], ["Practising", h.students.practising, "text-amber-700"], ["Not started", h.students.notStarted, "text-slate-600"]] as const).map(([l, n, c]) => <div key={l} className="rounded-xl bg-slate-50 py-2"><dd className={`text-xl font-bold tabular-nums ${c}`}>{n}</dd><dt className="text-xs text-slate-500">{l}</dt></div>)}
                </dl>
                {h.students.avg !== null && <p className="mt-2 text-xs text-slate-500">Average mastery of those who started: {h.students.avg}% · {h.assignments} assignment(s) of this skill</p>}
                {h.students.needHelp.length > 0 && (
                  <div className="mt-3"><p className="text-sm font-medium text-slate-800">Struggling (under 50%)</p>
                    <ul className="mt-1 space-y-1 text-sm">{h.students.needHelp.map((x) => <li key={x.id} className="flex justify-between gap-2"><Link href={`/admin/student-file/${x.id}`} className="truncate text-brand-navy hover:underline">{x.name} <span className="text-xs text-slate-500">{x.className}</span></Link><span className="tabular-nums text-red-700">{x.score}%</span></li>)}</ul>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      {h.statements.length > 0 && (
        <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-brand-navy">📘 Learning Continuum statements this skill practises</h2>
          <p className="text-sm text-slate-500">Linked through the skill&apos;s standards; the RIT band shows where students usually meet each one.</p>
          <ul className="mt-3 divide-y divide-slate-100 text-sm">{h.statements.map((x, i) => <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2"><span className="text-slate-800">{x.text} <span className="text-xs text-slate-400">{x.standards}</span></span><span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-brand-purple ring-1 ring-violet-200">RIT {x.band}</span></li>)}</ul>
        </section>
      )}
    </AppShell>
  );
}
