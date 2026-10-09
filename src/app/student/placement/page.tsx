import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { myDiagnostic } from "@/server/diagnostic/test";

/** The placement check is now the Diagnostic Test: go to it when it is open. */
export default async function Placement() {
  const actor = await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const d = await myDiagnostic(repo, actor);
  if (d && d.status !== "DONE") redirect(d.href);
  return (
    <AppShell name={String(me.displayName)}>
      <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-slate-200">
        <p className="text-5xl" aria-hidden="true">📝</p>
        <h1 className="mt-2 text-2xl font-bold text-brand-navy">{d ? "You finished the Diagnostic Test 🎉" : "The Diagnostic Test is not open yet"}</h1>
        <p className="mt-2 text-slate-700">{d ? "Your teacher will share your report. Your plans already start at the right level for you." : "Your school opens it at the start of the year. Until then, keep practising your plans."}</p>
        <Link href="/student" className="mt-6 inline-block rounded-xl bg-brand-navy px-6 py-3 font-semibold text-white">My Work</Link>
      </div>
    </AppShell>
  );
}
