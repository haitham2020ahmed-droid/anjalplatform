import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TestPlayer } from "@/components/map/test-player";
import { getT } from "@/i18n/server";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { startTest } from "@/server/map/sim";

export const metadata = { title: "MAP Test" };

/** The MAP Test player (automatic or manual test, or the warm-up): one question per screen, no going back. */
export default async function MapTestRun({ searchParams }: { searchParams: Promise<{ windowId?: string; subject?: string; warmup?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const [{ t }, sp] = await Promise.all([getT(), searchParams]);
  let screen, error: string | null = null;
  try { screen = await startTest(repo, actor, { windowId: sp.windowId ?? null, subject: sp.subject === "LANGUAGE" ? "LANGUAGE" : "READING", warmup: sp.warmup === "1" }); }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) error = e.message; else throw e; }
  return (
    <AppShell name={String(me.displayName)}>
      {error || !screen ? <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200"><p className="text-slate-700">{t(error ?? "")}</p><Link href="/student/map-test" className="mt-3 inline-block font-semibold text-brand-teal underline">{t("Back")}</Link></div> : <TestPlayer initial={screen} />}
    </AppShell>
  );
}
