import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { RespondActivityCard } from "@/components/respond-activity";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { studentRespond } from "@/server/curriculum-map/respond";

export const metadata = { title: "Respond to Reading" };

/** ✍️ One Respond to Reading activity, at the student's level. */
export default async function StudentRespondPage({ params }: { params: Promise<{ code: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { code } = await params;
  const v = await studentRespond(repo, actor, decodeURIComponent(code));
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student/respond", label: "Respond to Reading" }} icon="✍️" title={v.page.heading}
        subtitle={<>{v.page.unit}{v.page.sharedRead ? <> · 📖 {v.page.sharedRead}</> : null}</>} />
      {v.activity ? <RespondActivityCard a={v.activity} /> : <p className="rounded-2xl bg-white p-6 text-slate-600 ring-1 ring-slate-200">Your teacher has not added this activity yet.</p>}
    </AppShell>
  );
}
