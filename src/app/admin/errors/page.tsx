import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { errorList } from "@/server/teacher/extras";

export const metadata = { title: "Errors" };

/** 🩺 What went wrong on the platform in the last 30 days (for the developer): message, page, how many times. */
export default async function ErrorsPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const rows = await errorList(repo, actor);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="🩺" title="Errors" subtitle="Problems the platform met in the last 30 days, grouped. Send a screenshot of this page to the developer if something keeps happening." />
      {!rows.length ? <p className="rounded-2xl bg-emerald-50 p-6 font-semibold text-emerald-900 ring-1 ring-emerald-200">✅ No errors in the last 30 days.</p> : (
        <ul className="space-y-2">{rows.map((r) => <li key={r.id} className="rounded-2xl bg-white p-4 text-sm ring-1 ring-slate-200"><p className="text-slate-500">{r.at.slice(0, 16).replace("T", " ")} · {r.source === "SERVER" ? "server" : "browser"}{r.path ? ` · ${r.path}` : ""}{r.digest ? ` · ref ${r.digest}` : ""} · <b className="text-red-700">{r.count}×</b></p><p className="mt-1 font-mono text-slate-900">{r.message}</p></li>)}</ul>
      )}
    </AppShell>
  );
}
