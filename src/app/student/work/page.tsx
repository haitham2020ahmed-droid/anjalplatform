import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentHome } from "@/server/student/student-home";
import { myWorkView } from "@/server/student/program-work";
import { MyWorkList } from "@/components/student/my-work-list";
import { getT } from "@/i18n/server";

export const metadata = { title: "My Work" };

/** 📋 My Work: every piece of work the teacher assigned (📌, with its due date), open first; finished work folded. */
export default async function MyWorkPage() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [{ t }, h] = await Promise.all([getT(), studentHome(repo, actor)]);
  const { open, done, progress } = myWorkView(h.work, h.last);
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "Home" }} icon="📋" title="My Work"
        subtitle={progress.total ? t("{done} of {total} done", { done: progress.done, total: progress.total }) : t("Your teacher will add work here soon.")} />
      {progress.total > 0 && (
        <div className="bar-track mb-4 h-2.5 overflow-hidden rounded-full" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label={t("{done} of {total} done", { done: progress.done, total: progress.total })}>
          <div className="bar-fill h-full rounded-full" style={{ width: `${progress.pct}%` }} />
        </div>
      )}
      <section id="my-work" aria-label={t("My Work")}><MyWorkList open={open} done={done} t={t} first={20} /></section>
    </AppShell>
  );
}
