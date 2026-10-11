import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageHeader, Section } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { openMessage } from "@/server/messages/admin-messages";

export const metadata = { title: "Message" };
export const dynamic = "force-dynamic";

/** One message from the admin (only its recipient can open it); opening marks it read. */
export default async function TeacherMessagePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER"] });
  const me = (await getActor())!.user;
  const { id } = await params;
  let m: Awaited<ReturnType<typeof openMessage>>;
  try { m = await openMessage(repo, actor, id); }
  catch (e) { if (e instanceof ForbiddenError) notFound(); throw e; }
  const date = new Date(m.createdAt).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/messages", label: "Messages" }} icon="✉️" title={m.subject} subtitle={`${m.sender} · ${date}`} />
      <Section>
        <div className="whitespace-pre-wrap break-words leading-relaxed text-slate-800">{m.body}</div>
        {m.report && (
          <Link href={m.report.href} className="mt-6 inline-block rounded-xl bg-brand-navy px-5 py-2.5 font-bold text-white hover:bg-brand-purple">📊 Open: {m.report.label}</Link>
        )}
      </Section>
    </AppShell>
  );
}
