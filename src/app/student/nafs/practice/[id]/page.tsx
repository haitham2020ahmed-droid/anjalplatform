import Link from "next/link";
import { nafsDbGate } from "@/components/db-update-needed";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { nafsPracticeView } from "@/server/nafs/practice";
import { getT } from "@/i18n/server";
import { NafsPracticePlayer } from "@/components/nafs/practice-player";

export const metadata = { title: "NAFS practice" };
export const dynamic = "force-dynamic";

/**
 * 🇸🇦 Adaptive NAFS practice (student): one question at a time (with its passage), the next one adapts to my answers;
 * after each answer I see whether it was right and why. Finishes by itself. No level words.
 */
export default async function NafsPracticePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const gate = await nafsDbGate(); if (gate) return gate; // the NAFS tables are not in the database yet: say so
  const me = (await getActor())!.user;
  const { t } = await getT();
  const { id } = await params;
  let error: string | null = null;
  const v = await nafsPracticeView(repo, actor, id).catch((e: Error) => { error = e.message; return null; });
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student/nafs?part=practice", label: "NAFS" }} icon="🎯" title={v?.title ?? "NAFS practice"} />
      {!v ? <p className="rounded-2xl bg-surface p-5 text-ink-2 ring-1 ring-line">{t(error ?? "Practice not found.")}</p>
        : v.done || !v.question ? (
          <div className="rounded-2xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-200">
            <p className="text-xl font-semibold text-emerald-900">🎉 {t("Practice finished!")}</p>
            <p className="mt-1 text-emerald-800">{t("{n} of {total} right", { n: v.correct, total: v.asked })}</p>
            <Link href="/student/nafs?part=practice" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-5 font-semibold text-white">{t("My practice")}</Link>
          </div>
        ) : <NafsPracticePlayer key={v.question.id} id={v.id} n={v.n} max={v.max} minutesLeft={v.minutesLeft} question={v.question} />}
    </AppShell>
  );
}
