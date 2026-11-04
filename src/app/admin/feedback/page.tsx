import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { listFeedback } from "@/server/admin/feedback";
import { getT } from "@/i18n/server";
import { deleteFeedbackAction, resolveFeedbackAction } from "./actions";
import { DeleteFeedbackForm } from "./delete-button";

export const metadata = { title: "Feedback" };

const ROLE: Record<string, string> = { SCHOOL_ADMIN: "School admin", SUPER_ADMIN: "Platform admin", TEACHER: "Teacher", STUDENT: "Student", PARENT: "Parent" };

/** 💬 What users wrote with the Feedback button: open notes first; “Mark resolved” when it is dealt with. */
export default async function FeedbackPage() {
  const actor = await requireActor({ roles: ["SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  const items = await listFeedback(repo, actor);
  const open = items.filter((x) => !x.resolved).length;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/admin", label: "Home" }} icon="💬" title="Feedback" subtitle={t("{n} open", { n: open })} />
      {items.length === 0 ? <EmptyState icon="💬" title="No feedback yet" text="Notes sent with the Feedback button appear here." /> : (
        <ul className="space-y-3">
          {items.map((x) => (
            <li key={x.id} className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 ${x.resolved ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-800"><bdi>{x.name || "—"}</bdi></span>
                <span>{t(ROLE[x.role] ?? x.role)}</span>
                <span>{x.createdAt.slice(0, 16).replace("T", " ")}</span>
                {x.path && <span className="font-mono" dir="ltr">{x.path}</span>}
                {x.resolved && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-800 ring-1 ring-emerald-200">{t("Resolved")}</span>}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-slate-900" dir="auto">{x.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={resolveFeedbackAction}>
                  <input type="hidden" name="id" value={x.id} /><input type="hidden" name="resolved" value={x.resolved ? "false" : "true"} />
                  <button className="inline-flex min-h-11 items-center rounded-xl bg-white px-4 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:bg-slate-50">{x.resolved ? t("Open again") : t("Mark resolved")}</button>
                </form>
                <DeleteFeedbackForm action={deleteFeedbackAction} id={x.id} label={t("Delete")} confirmText={t("Delete this feedback? This cannot be undone.")} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
