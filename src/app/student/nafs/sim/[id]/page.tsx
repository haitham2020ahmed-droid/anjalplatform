import Link from "next/link";
import { nafsDbGate } from "@/components/db-update-needed";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { openBooklet } from "@/server/nafs/student";
import { getT } from "@/i18n/server";
import { NafsBooklet } from "@/components/nafs/booklet";

export const metadata = { title: "NAFS practice" };

/**
 * 🇸🇦 The student's NAFS simulation: one booklet (each passage with its questions), the timer, a warning about
 * unanswered questions before handing in, no hints or explanations. The score shows in the NAFS icon (My results)
 * once the teacher releases the results.
 */
export default async function NafsSimulationPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const gate = await nafsDbGate(); if (gate) return gate; // the NAFS tables are not in the database yet: say so
  const me = (await getActor())!.user;
  const { t } = await getT();
  const { id } = await params;
  let error: string | null = null;
  const b = await openBooklet(repo, actor, id).catch((e: Error) => { error = e.message; return null; });
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student/nafs?part=tests", label: "NAFS" }} icon="📝" title={b?.title ?? "NAFS practice"} />
      {!b ? <p className="rounded-2xl bg-surface p-5 text-ink-2 ring-1 ring-line">{t(error ?? "Test not found.")}</p>
        : b.done ? (
          <div className="rounded-2xl bg-emerald-50 p-6 text-center ring-1 ring-emerald-200">
            <p className="text-xl font-semibold text-emerald-900">✓ {t("You handed in this test.")}</p>
            <p className="mt-1 text-emerald-800">{t("Your teacher will share your score.")}</p>
            <Link href="/student/nafs?part=results" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-5 font-semibold text-white">{t("My results")}</Link>
          </div>
        ) : <NafsBooklet id={b.id} endsAt={b.endsAt} stamp={b.stamp} groups={b.groups} initial={b.answers} initialTexts={b.texts} total={b.total} />}
    </AppShell>
  );
}
