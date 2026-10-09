import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { LevelBoard } from "@/components/teacher/level-board";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ValidationError } from "@/server/curriculum-admin";
import { ForbiddenError } from "@/server/auth/rbac";
import { respondAssignPlan, type RespondPlan } from "@/server/curriculum-map/respond-assign";
import { assignRespondAction } from "../actions";

export const metadata = { title: "Assign Respond to Reading" };

/** ⭐ Assign Respond to Reading: automatic levels (default) that the teacher can move, then send. */
export default async function AssignRespond({ searchParams }: { searchParams: Promise<{ classId?: string; code?: string; msg?: string; manual?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  let p: RespondPlan | null = null, error: string | null = null;
  try { p = await respondAssignPlan(repo, actor, String(sp.classId ?? ""), String(sp.code ?? "")); } catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) error = e.message; else throw e; }
  const manual = sp.manual === "1";
  const box = "rounded-lg border border-slate-300 px-3 py-2";
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/teacher/respond?classId=${sp.classId ?? ""}`, label: "Respond to Reading" }} icon="⭐" title={p ? `Assign: ${p.heading}` : "Assign Respond to Reading"} subtitle={p ? <>{p.unit}{p.sharedRead ? <> · 📖 {p.sharedRead}</> : null} · {p.className}</> : null} />
      {(sp.msg || error) && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-red-800">{sp.msg ?? error}</p>}
      {p && (
        <form action={assignRespondAction} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
          <input type="hidden" name="classId" value={p.classId} /><input type="hidden" name="code" value={p.setCode} />
          {p.already && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">You already sent this Text Set on {p.already.createdAt.slice(0, 10)}. <Link href={`/teacher/respond/${p.already.id}`} className="underline">Follow up</Link> — sending again creates a new task.</p>}
          <div className="flex flex-wrap gap-2 text-sm">
            <Link href={`/teacher/respond/assign?classId=${p.classId}&code=${p.setCode}`} aria-current={!manual ? "page" : undefined} className={`rounded-xl px-4 py-2 font-semibold ${!manual ? "bg-emerald-600 text-white" : "bg-white ring-1 ring-slate-300"}`}>🤖 Automatic (recommended)</Link>
            <Link href={`/teacher/respond/assign?classId=${p.classId}&code=${p.setCode}&manual=1`} aria-current={manual ? "page" : undefined} className={`rounded-xl px-4 py-2 font-semibold ${manual ? "bg-sky-600 text-white" : "bg-white ring-1 ring-slate-300"}`}>✋ Manual</Link>
          </div>
          <p className="mt-3 text-sm text-slate-600">{manual ? "Everyone starts in On Level: drag each student to the version you want them to get." : "Each student is already placed from their own data. Move anyone you want, then send."}</p>
          {p.noData > 0 && !manual && <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900">ℹ️ {p.noData} student(s) have no data yet: they get On Level.</p>}
          {(["BELOW", "ON", "ABOVE"] as const).filter((l) => !p!.has[l]).length > 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Not added yet: {(["BELOW", "ON", "ABOVE"] as const).filter((l) => !p!.has[l]).map((l) => ({ BELOW: "Below", ON: "On", ABOVE: "Above" })[l]).join(", ")} Level. Students placed there get the On Level activity.</p>}
          <div className="mt-4"><LevelBoard sendAll prefix="lv:" students={p.rows.map((r) => ({ id: r.studentId, name: r.name, start: manual ? "ON" : r.suggested, original: null, note: manual ? null : r.reason, tag: r.from === "NO_DATA" ? "No data" : null }))} /></div>
          <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold text-brand-navy">Leave some students out</summary>
            <div className="mt-2 grid gap-1 sm:grid-cols-3">{p.rows.map((r) => <label key={r.studentId} className="flex items-center gap-2"><input type="checkbox" name="skip" value={r.studentId} />{r.name}</label>)}</div>
          </details>
          <div className="mt-4 flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col">Due date (optional)<input type="date" name="dueAt" className={box} /></label>
            <label className="flex min-w-[16rem] flex-1 flex-col">Note to students (optional)<input name="note" maxLength={1000} className={box} /></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-xl bg-brand-navy px-5 py-2 font-semibold text-white hover:bg-brand-purple">⭐ Send to students</button>
            <Link href={`/admin/curriculum-map/respond/${p.setCode}`} className="rounded-xl bg-white px-5 py-2 font-semibold text-brand-navy ring-1 ring-slate-300">👀 Preview the 3 versions</Link>
          </div>
        </form>
      )}
    </AppShell>
  );
}
