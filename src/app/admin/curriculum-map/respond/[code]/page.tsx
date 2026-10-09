import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { RespondActivityCard } from "@/components/respond-activity";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { RESPOND_LEVEL_NAME, RESPOND_LEVELS, respondPage, type RespondLevel } from "@/server/curriculum-map/respond";
import { saveActivityAction } from "../actions";
import { PrintButton } from "@/components/plans/print-button";

export const metadata = { title: "Respond to Reading" };

/**
 * ✍️ Respond to Reading of one Text Set: Below Level → On Level → Above Level, each its own page with that
 * level's activity. Admins write or edit it here; teachers open and print it.
 */
export default async function RespondLevelPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ level?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "curriculum:read" });
  const me = (await getActor())!.user;
  const { code } = await params;
  const sp = await searchParams;
  const p = await respondPage(repo, actor, decodeURIComponent(code));
  const level: RespondLevel = (RESPOND_LEVELS as readonly string[]).includes(String(sp.level).toUpperCase()) ? (String(sp.level).toUpperCase() as RespondLevel) : "BELOW";
  const cur = p.levels.find((l) => l.level === level)!;
  const canEdit = can(actor, "questions:publish") && actor.role !== "TEACHER";
  const a = cur.activity;
  const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2";
  const label = "flex flex-col gap-1 text-sm font-semibold text-slate-700";
  const tab = (on: boolean) => `flex items-center gap-2 rounded-2xl px-5 py-3 font-bold transition ${on ? "bg-brand-navy text-white shadow" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: `/admin/curriculum-map?grade=${p.grade}&unit=${Number(p.setCode.match(/\.U(\d+)\./)?.[1] ?? 1)}`, label: "Curriculum Map" }} icon="✍️" title="Respond to Reading"
        subtitle={<>Grade {p.grade} · {p.unit} · <b>{p.heading}</b>{p.sharedRead ? <> · 📖 {p.sharedRead}</> : null}{p.genre ? ` · ${p.genre}` : ""}</>}>
        <PrintButton />
        {canEdit && <Link href={`/admin/curriculum-map/respond/${p.setCode}/all`} className="rounded-xl bg-white px-4 py-2 font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal print:hidden">📝 Edit all 3 levels</Link>}
        {actor.role === "TEACHER" && <Link href="/teacher/respond" className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple print:hidden">⭐ Assign</Link>}
      </PageHeader>
      {sp.msg && <p role="status" className="animate-pop mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}

      <nav aria-label="Level" className="mb-5 flex flex-wrap items-center gap-3 print:hidden">
        <span className="text-sm font-semibold text-slate-500">Respond to Reading ›</span>
        {p.levels.map((l) => (
          <Link key={l.level} href={`/admin/curriculum-map/respond/${p.setCode}?level=${l.level}`} aria-current={l.level === level ? "page" : undefined} className={tab(l.level === level)}>
            {l.level === "BELOW" ? "🟠" : l.level === "ON" ? "🔵" : "🟢"} {RESPOND_LEVEL_NAME[l.level]} {l.activity ? "" : <span className="text-xs font-normal opacity-80">(empty)</span>}
          </Link>
        ))}
      </nav>

      {a ? <RespondActivityCard a={a} /> : <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">The {RESPOND_LEVEL_NAME[level]} activity has not been written yet.{canEdit ? " Write it below, or import all activities from the Respond to Reading page." : ""}</p>}

      {canEdit && (
        <details className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-slate-200 print:hidden" open={!a}>
          <summary className="cursor-pointer text-lg font-bold text-brand-navy">✏️ {a ? "Edit" : "Write"} the {RESPOND_LEVEL_NAME[level]} activity</summary>
          <form action={saveActivityAction} className="mt-4 space-y-4">
            <input type="hidden" name="code" value={cur.code} />
            <label className={label}>Title<input name="title" required maxLength={255} defaultValue={a?.title ?? ""} className={field} /></label>
            <label className={label}>Prompt (the question students answer)<textarea name="prompt" required rows={3} maxLength={3000} defaultValue={a?.prompt ?? ""} className={field} /></label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className={label}>Steps <span className="font-normal text-slate-400">(one per line)</span><textarea name="instructions" rows={5} defaultValue={a?.instructions.join("\n") ?? ""} className={field} /></label>
              <label className={label}>Word bank <span className="font-normal text-slate-400">(one per line: word — meaning)</span><textarea name="wordBank" rows={5} defaultValue={a?.wordBank.join("\n") ?? ""} className={field} /></label>
              <label className={label}>Sentence starters <span className="font-normal text-slate-400">(one per line; ____ for a blank)</span><textarea name="sentenceStarters" rows={5} defaultValue={a?.sentenceStarters.join("\n") ?? ""} className={field} /></label>
              <label className={label}>Checklist <span className="font-normal text-slate-400">(one per line)</span><textarea name="checklist" rows={5} defaultValue={a?.checklist.join("\n") ?? ""} className={field} /></label>
            </div>
            <label className={label}>Hint <span className="font-normal text-slate-400">(optional, hidden until the student opens it)</span><textarea name="hint" rows={2} maxLength={2000} defaultValue={a?.hint ?? ""} className={field} /></label>
            <label className={label}>Model answer <span className="font-normal text-slate-400">(teachers only — students never see it)</span><textarea name="modelAnswer" rows={4} maxLength={5000} defaultValue={a?.modelAnswer ?? ""} className={field} /></label>
            <div className="flex justify-end"><button className="rounded-xl bg-brand-navy px-6 py-2.5 font-bold text-white hover:bg-brand-purple">Save</button></div>
          </form>
        </details>
      )}
    </AppShell>
  );
}
