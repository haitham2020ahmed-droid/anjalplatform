import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { openWeeklyCheck } from "@/server/student/weekly-check";

export const dynamic = "force-dynamic";

/** 🗓️ Opens this week's check (5 questions), then goes to its questions. */
export default async function WeeklyCheckPage() {
  const actor = await requireActor({ roles: ["STUDENT"], permission: "practice:take" });
  const href = await openWeeklyCheck(repo, actor);
  if (href) redirect(href);
  const me = (await getActor())!.user;
  return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">The Weekly Check is not ready for your grade yet.</p><Link href="/student" className="mt-4 inline-block font-semibold text-brand-teal">← My Work</Link></AppShell>;
}
