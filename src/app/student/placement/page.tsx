import { AppShell } from "@/components/app-shell";
import { PlacementPlayer } from "@/components/placement/placement-player";
import { PlacementResult } from "@/components/placement/placement-result";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { latestDiagnostic, startDiagnostic } from "@/server/assessment/diagnostic";
import { ValidationError } from "@/server/curriculum-admin";
import { submitPlacementAction } from "./actions";

/** Placement check: shows the latest result, or starts/resumes the check (?retake=1 to take it again). */
export default async function PlacementPage({ searchParams }: { searchParams: Promise<{ retake?: string }> }) {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const firstName = String(me.displayName).split(" ")[0];
  const { retake } = await searchParams;
  const last = await latestDiagnostic(repo, actor.studentId!);
  if (last && retake !== "1") return <AppShell name={String(me.displayName)}><PlacementResult r={last} firstName={firstName} /></AppShell>;
  try {
    const view = await startDiagnostic(repo, actor);
    return <AppShell name={String(me.displayName)}><PlacementPlayer initial={view} firstName={firstName} submit={submitPlacementAction} /></AppShell>;
  } catch (e) {
    if (!(e instanceof ValidationError)) throw e;
    return <AppShell name={String(me.displayName)}><p className="text-lg text-slate-700">{e.message}</p></AppShell>;
  }
}
