import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { myTasks } from "@/server/teacher/writing";
import { GENRE_ICON } from "@/server/writing/genres";

export const metadata = { title: "Writing" };

/** ✍️ My writing and reading-aloud tasks. */
export default async function MyWritingPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const list = await myTasks(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "My work" }} icon="✍️" title="Writing & Reading Aloud" />
      {!list.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No writing task yet.</p> : (
        <ul className="grid gap-3 md:grid-cols-2">{list.map((t) => (
          <li key={t.id}><Link href={`/student/writing/${t.id}`} className="lift flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <span><span className="block font-bold text-brand-navy">{t.kind === "WRITE" ? GENRE_ICON[t.genre] : "🎙"} {t.title}</span><span className="block text-xs text-slate-500">{t.status === "SCORED" ? `✅ scored ${t.total}/${t.max}` : t.status === "SUBMITTED" ? (t.stage === "DRAFT" ? "draft sent · waiting for feedback" : "sent · waiting for the score") : t.stage === "REVISE" ? "🔧 feedback is here: revise" : t.stage === "DRAFT" ? "plan done · write your draft" : t.status === "DRAFT" ? (t.stage === "PLAN" ? "planning" : "draft saved") : "to do"}{t.dueAt ? ` · due ${t.dueAt.slice(0, 10)}` : ""}</span></span>
            <span className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-semibold text-white">{t.status === "NOT_STARTED" ? "Start ▶" : "Open ▶"}</span>
          </Link></li>
        ))}</ul>
      )}
    </AppShell>
  );
}
