import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { card } from "@/components/admin/styles";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { listQuestions, STATUSES, type QuestionStatus } from "@/server/admin/questions";

const STATUS_LABEL: Record<QuestionStatus, string> = { DRAFT: "Drafts", UNDER_REVIEW: "Waiting for review", PUBLISHED: "Published", ARCHIVED: "Archived" };
const CHIP: Record<QuestionStatus, string> = { DRAFT: "bg-slate-100 text-slate-700", UNDER_REVIEW: "bg-amber-100 text-amber-800", PUBLISHED: "bg-teal-100 text-teal-800", ARCHIVED: "bg-slate-200 text-slate-500" };

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ status?: string; grade?: string; q?: string; mine?: string; ai?: string }> }) {
  const actor = await requireActor({ permission: "questions:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as QuestionStatus) : "UNDER_REVIEW";
  const { items, counts, aiPending } = await listQuestions(repo, actor, { status, gradeLevel: Number(sp.grade) || undefined, q: sp.q?.slice(0, 100), mine: sp.mine === "1", aiOnly: sp.ai === "1" });
  const tab = (s: QuestionStatus) => `/admin/questions?status=${s}${sp.grade ? `&grade=${sp.grade}` : ""}${sp.mine ? "&mine=1" : ""}${sp.ai ? "&ai=1" : ""}`;
  return (
    <AppShell name={String(me.displayName)}>
      <p><Link href={actor.role === "TEACHER" ? "/teacher" : "/admin"} className="text-brand-teal hover:underline">← Back</Link></p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold text-brand-navy">Questions</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/questions?status=DRAFT&ai=1" className="rounded-xl bg-amber-100 px-4 py-2.5 font-semibold text-amber-900">AI drafts to review ({aiPending})</Link>
          <Link href="/admin/question-bank" className="rounded-xl px-4 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300">Coverage</Link>
          <Link href="/admin/questions/new" className="rounded-xl bg-brand-navy px-5 py-2.5 font-semibold text-white hover:bg-brand-purple">New question</Link>
        </div>
      </div>
      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Question status">
        {STATUSES.map((s) => <Link key={s} href={tab(s)} aria-current={s === status ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${s === status ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{STATUS_LABEL[s]} ({counts[s]})</Link>)}
      </nav>
      <form method="get" className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="status" value={status} />
        <select name="grade" defaultValue={sp.grade ?? ""} className="rounded-lg border border-slate-300 px-3 py-2"><option value="">All grades</option>{[4, 5, 6].map((g) => <option key={g} value={g}>Grade {g}</option>)}</select>
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Search question text" className="rounded-lg border border-slate-300 px-3 py-2" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={sp.mine === "1"} />Only mine</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ai" value="1" defaultChecked={sp.ai === "1"} />Only AI-drafted</label>
        <button className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white">Filter</button>
      </form>
      <section className={card}>
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b text-slate-500"><th className="py-2">Question</th><th>Skill</th><th>Type</th><th>Level</th><th>Status</th><th>Updated</th></tr></thead>
          <tbody>
            {items.slice(0, 300).map((q) => (
              <tr key={q.id} className="border-b align-top last:border-0">
                <td className="max-w-md py-2"><Link href={`/admin/questions/${q.id}`} className="text-brand-navy hover:underline">{q.stem}</Link>{q.mine && <span className="ml-2 text-xs text-brand-purple">mine</span>}{q.origin === "AI_GENERATED" && <span className="ml-2 text-xs text-amber-700">AI-drafted</span>}</td>
                <td>G{q.grade} · {q.skill}</td>
                <td className="text-xs">{q.type.replace(/_/g, " ").toLowerCase()}</td>
                <td>{q.level} · {q.levelLabel}</td>
                <td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CHIP[q.status]}`}>{STATUS_LABEL[q.status]}</span></td>
                <td>{q.updatedAt.slice(0, 10)}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-slate-500">No questions here.</td></tr>}
          </tbody>
        </table>
        {items.length > 300 && <p className="mt-2 text-sm text-slate-500">Showing the 300 most recent of {items.length}. Use the filters to narrow the list.</p>}
      </section>
    </AppShell>
  );
}
