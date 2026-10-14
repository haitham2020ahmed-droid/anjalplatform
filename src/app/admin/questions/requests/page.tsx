import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { listDeletionRequests } from "@/server/admin/question-requests";
import { decideDeletionAction, decideEditAction } from "../request-actions";
import { listEditRequests } from "@/server/admin/question-edits";
import { LineIcon } from "@/components/ui/line-icon";

export const metadata = { title: "Teacher requests" };

/** ✏️ Changes and 🗑 deletion requests from teachers: the admin approves or rejects each one. */
export default async function DeletionRequests({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const [list, edits] = await Promise.all([listDeletionRequests(repo, actor), listEditRequests(repo, actor)]);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/questions", label: "Question Bank" }} icon="pen" title="Teacher Requests"
        subtitle="Teachers can change any question or ask to delete one. Nothing changes for students until you approve." />
      {sp.msg && <p role="status" className="animate-pop mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <Section icon="pen" title="Changes waiting">
        {edits.length === 0 ? <p className="text-slate-600">No changes waiting.</p> : (
          <ul className="space-y-3">
            {edits.map((r) => (
              <li key={r.id} data-testid="edit-request" className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className="text-sm text-slate-600"><b>{r.request.byName}</b> · {r.request.at.slice(0, 10)} · {r.skill} · {r.status === "PUBLISHED" ? "live question" : r.status.toLowerCase().replace("_", " ")}</p>
                <p className="mt-1 flex flex-wrap gap-1">{r.changes.map((c) => <span key={c} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{c}</span>)}</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2" data-content lang="en">
                  <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200"><p className="text-xs font-bold text-slate-500">NOW</p><p className="mt-1 text-sm">{r.stemBefore}</p></div>
                  <div className="rounded-xl bg-white p-3 ring-1 ring-emerald-300"><p className="text-xs font-bold text-emerald-700">AFTER THE CHANGE</p><p className="mt-1 text-sm">{r.stemAfter}</p></div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Link href={`/admin/questions/${r.id}`} className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300"><LineIcon name="eye" className="me-1 inline-block h-4 w-4 align-[-3px]" />Open the question</Link>
                  <form action={decideEditAction}><input type="hidden" name="questionId" value={r.id} /><input type="hidden" name="decision" value="approve" /><button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"><LineIcon name="check" className="me-1 inline-block h-4 w-4 align-[-3px]" />Approve for everyone</button></form>
                  <form action={decideEditAction} className="flex gap-2"><input type="hidden" name="questionId" value={r.id} /><input type="hidden" name="decision" value="reject" /><input name="note" maxLength={300} placeholder="Why (optional)" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" /><button className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300"><LineIcon name="x" className="me-1 inline-block h-4 w-4 align-[-3px]" />Reject</button></form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section icon="trash" title="Deletion requests">
        {list.length === 0 ? <p className="text-slate-600">No requests waiting.</p> : (
          <ul className="space-y-3">
            {list.map((r) => (
              <li key={r.id} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <Link href={`/admin/questions/${r.id}`} className="font-semibold text-brand-navy hover:underline">{r.stem}</Link>
                <p className="mt-1 text-sm text-slate-600">Requested by <b>{r.request.byName}</b> on {r.request.at.slice(0, 10)}: “{r.request.reason}”</p>
                <div className="mt-3 flex gap-2">
                  <form action={decideDeletionAction}><input type="hidden" name="questionId" value={r.id} /><input type="hidden" name="decision" value="approve" /><button className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"><LineIcon name="check" className="me-1 inline-block h-4 w-4 align-[-3px]" />Approve deletion</button></form>
                  <form action={decideDeletionAction}><input type="hidden" name="questionId" value={r.id} /><input type="hidden" name="decision" value="reject" /><button className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300"><LineIcon name="x" className="me-1 inline-block h-4 w-4 align-[-3px]" />Reject (keep it)</button></form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </AppShell>
  );
}
