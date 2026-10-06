import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { card } from "@/components/admin/styles";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { can } from "@/server/auth/rbac";
import { listQuestions, STATUSES, type QuestionStatus } from "@/server/admin/questions";
import { QuestionTable } from "./question-table";

const STATUS_LABEL: Record<QuestionStatus, string> = { DRAFT: "Drafts", UNDER_REVIEW: "Waiting for review", PUBLISHED: "Published", ARCHIVED: "Archived" };

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
          <Link href="/admin/questions/import" className="rounded-xl px-4 py-2.5 font-semibold text-brand-navy ring-1 ring-slate-300">Import questions</Link>
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
        <QuestionTable
          rows={items.slice(0, 300).map((q) => ({ id: q.id, stem: q.stem, mine: q.mine, origin: q.origin, grade: q.grade, skill: q.skill, type: q.type, level: q.level, levelLabel: q.levelLabel, status: q.status, updatedAt: q.updatedAt }))}
          total={items.length}
          canPublish={can(actor, "questions:publish")}
          filter={{ status, grade: Number(sp.grade) || undefined, q: sp.q?.slice(0, 100) || undefined, mine: sp.mine === "1" || undefined, ai: sp.ai === "1" || undefined }}
        />
      </section>
    </AppShell>
  );
}
