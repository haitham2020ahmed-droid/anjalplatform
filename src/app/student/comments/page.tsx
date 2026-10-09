import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { commentsFor } from "@/server/teacher/classroom";

export const metadata = { title: "Comments" };

/** 💬 What my teachers wrote about my work. */
export default async function CommentsPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const list = await commentsFor(repo, actor, actor.studentId!);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "My work" }} icon="💬" title="Comments from My Teachers" />
      {!list.length ? <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">No comments yet.</p> : (
        <ul className="space-y-3">{list.map((c) => (
          <li key={c.id} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <p className="text-sm text-slate-500">{c.author} · {c.createdAt.slice(0, 10)}{c.assignment ? ` · about “${c.assignment}”` : ""}</p>
            <p className="mt-1 whitespace-pre-line text-lg text-slate-900">{c.body}</p>
          </li>
        ))}</ul>
      )}
    </AppShell>
  );
}
