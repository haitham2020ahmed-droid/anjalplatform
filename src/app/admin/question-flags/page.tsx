import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { flagList } from "@/server/teacher/classroom";
import { resolveFlagsAction } from "./actions";

export const metadata = { title: "Flagged questions" };

/** 🚩 Questions students marked as unclear (most reported first): open, fix, mark done. */
export default async function FlagsPage({ searchParams }: { searchParams: Promise<{ msg?: string; status?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:review" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const status = sp.status === "FIXED" || sp.status === "DISMISSED" ? sp.status : "OPEN";
  const rows = await flagList(repo, actor, status);
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🚩" title="Flagged questions" subtitle="Students pressed “This question is not clear”. Most reported first. Open the question, fix it, then mark it fixed." />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <div className="mb-4 flex gap-2">{([["OPEN", "To check"], ["FIXED", "Fixed"], ["DISMISSED", "Not a problem"]] as const).map(([k, l]) => <Link key={k} href={`/admin/question-flags?status=${k}`} className={chip(status === k)}>{l}</Link>)}</div>
      {!rows.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">Nothing here. ✅</p> : (
        <ul className="space-y-3">{rows.map((r) => (
          <li key={r.questionId} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-500">{r.skill} · <b className="text-red-700">{r.count} report(s)</b> · last {r.lastAt.slice(0, 10)}</p>
                <p className="mt-1 font-semibold text-brand-navy">{r.stem}</p>
                <p className="mt-1 text-sm text-slate-700">{r.reasons.join(" · ")}</p>
                {r.notes.length > 0 && <ul className="mt-1 list-disc ps-5 text-sm text-slate-600">{r.notes.map((n, i) => <li key={i}>“{n}”</li>)}</ul>}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/admin/questions/${r.questionId}`} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300">✏️ Open</Link>
                {status === "OPEN" && <>
                  <form action={resolveFlagsAction}><input type="hidden" name="questionId" value={r.questionId} /><input type="hidden" name="status" value="FIXED" /><button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">✓ Fixed</button></form>
                  <form action={resolveFlagsAction}><input type="hidden" name="questionId" value={r.questionId} /><input type="hidden" name="status" value="DISMISSED" /><button className="rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-300">Not a problem</button></form>
                </>}
              </div>
            </div>
          </li>
        ))}</ul>
      )}
    </AppShell>
  );
}
