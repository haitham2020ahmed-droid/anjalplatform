import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { listDeletionRequests } from "@/server/admin/question-requests";
import { decideDeletionAction } from "../request-actions";

export const metadata = { title: "Deletion requests" };

/** 🗑 Deletion requests from teachers: the admin approves or rejects each one. */
export default async function DeletionRequests({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "questions:publish" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const list = await listDeletionRequests(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin/questions", label: "Question Bank" }} icon="🗑" title="Deletion requests"
        subtitle="Teachers can ask to delete a question; nothing is removed until you approve. A question students already answered is archived instead, so their history is kept." />
      {sp.msg && <p role="status" className="animate-pop mb-5 rounded-2xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      <Section>
        {list.length === 0 ? <p className="text-slate-600">No requests waiting. ✅</p> : (
          <ul className="space-y-3">
            {list.map((r) => (
              <li key={r.id} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <Link href={`/admin/questions/${r.id}`} className="font-semibold text-brand-navy hover:underline">{r.stem}</Link>
                <p className="mt-1 text-sm text-slate-600">Requested by <b>{r.request.byName}</b> on {r.request.at.slice(0, 10)}: “{r.request.reason}”</p>
                <div className="mt-3 flex gap-2">
                  <form action={decideDeletionAction}><input type="hidden" name="questionId" value={r.id} /><input type="hidden" name="decision" value="approve" /><button className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">✅ Approve deletion</button></form>
                  <form action={decideDeletionAction}><input type="hidden" name="questionId" value={r.id} /><input type="hidden" name="decision" value="reject" /><button className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-navy ring-1 ring-slate-300">❌ Reject (keep it)</button></form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </AppShell>
  );
}
