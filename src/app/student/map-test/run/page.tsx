import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { TestPlayer } from "@/components/map/test-player";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { ForbiddenError } from "@/server/auth/rbac";
import { ValidationError } from "@/server/curriculum-admin";
import { startTest } from "@/server/map/sim";

export const metadata = { title: "MAP practice test" };

export default async function MapTestRun({ searchParams }: { searchParams: Promise<{ windowId?: string; subject?: string; warmup?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  let screen, error: string | null = null;
  try { screen = await startTest(repo, actor, { windowId: sp.windowId ?? null, subject: sp.subject === "LANGUAGE" ? "LANGUAGE" : "READING", warmup: sp.warmup === "1" }); }
  catch (e) { if (e instanceof ValidationError || e instanceof ForbiddenError) error = e.message; else throw e; }
  return (
    <AppShell name={String(me.displayName)}>
      {error || !screen ? <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200"><p className="text-slate-700">{error}</p><Link href="/student/map-test" className="mt-3 inline-block font-semibold text-brand-teal underline">Back</Link></div> : <TestPlayer initial={screen} />}
    </AppShell>
  );
}
