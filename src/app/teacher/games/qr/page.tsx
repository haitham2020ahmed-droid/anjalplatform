import Link from "next/link";
import { headers } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { accessibleClasses } from "@/server/teacher/assign";
import { masterSkills, KIND_NAME } from "@/server/skills/master";
import { qrJoins } from "@/server/game/skill-games";
import { qrPath } from "@/lib/qr";

export const metadata = { title: "Skill game QR codes" };

/** 📱 QR cards for skill games: one per skill, for the board or a printed sheet; who joined by QR. */
export default async function SkillQrPage({ searchParams }: { searchParams: Promise<{ classId?: string; skill?: string | string[] }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN"], permission: "assignments:create" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const classes = (await accessibleClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const grade = klass ? Number((await repo.findUnique("Grade", { id: klass.gradeId }))?.level ?? 0) : 0;
  const skills = klass ? await masterSkills(repo, actor.schoolId!, { grade, withQuestionsOnly: true }) : [];
  const picked = (Array.isArray(sp.skill) ? sp.skill : sp.skill ? [sp.skill] : []).filter((id) => skills.some((k) => k.id === id));
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const joins = klass ? await qrJoins(repo, actor, String(klass.id)) : [];
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher/games", label: "Games" }} icon="📱" title="Skill Game QR Codes"
        subtitle="Each student plays alone at their own level; every answer counts toward their progress. Show one QR on the board, or print a sheet of cards. Students scan with a tablet or phone, sign in, and the game opens.">
        {picked.length > 0 && <PrintButton />}
      </PageHeader>
      <nav aria-label="Classes" className="flex flex-wrap gap-2 print:hidden">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/games/qr?classId=${c.id}`} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${c.id === klass?.id ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200"}`}>{String(c.name)}</Link>)}</nav>
      {klass && (
        <form method="get" className="mt-4 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:hidden">
          <input type="hidden" name="classId" value={String(klass.id)} />
          <p className="font-bold text-brand-navy">Tick the skills (Grade {grade}), then make the cards</p>
          <div className="mt-2 grid max-h-80 gap-1 overflow-y-auto rounded-2xl p-3 ring-1 ring-slate-200 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((k) => <label key={k.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50"><input type="checkbox" name="skill" value={k.id} defaultChecked={picked.includes(k.id)} /><span className="flex-1">{k.name}</span><span className="text-xs text-slate-400">{KIND_NAME[k.kind]}</span></label>)}
          </div>
          <button className="mt-3 rounded-xl bg-brand-navy px-6 py-2.5 font-bold text-white hover:bg-brand-purple">📱 Make QR cards</button>
        </form>
      )}
      {picked.length > 0 && (
        <ul className={`mt-6 grid gap-4 ${picked.length === 1 ? "" : "sm:grid-cols-2 lg:grid-cols-3 print:grid-cols-3"}`}>
          {picked.map((id) => {
            const k = skills.find((x) => x.id === id)!;
            const url = `${proto}://${host}/game/${id}?via=qr`;
            const qr = qrPath(url);
            return (
              <li key={id} className="break-inside-avoid rounded-3xl bg-white p-5 text-center shadow-sm ring-2 ring-brand-navy/20">
                <p className="text-sm font-bold uppercase tracking-wide text-brand-teal">🎮 Skill game · Grade {grade}</p>
                <p className="mt-1 text-xl font-extrabold text-brand-navy">{k.name}</p>
                <svg viewBox={`0 0 ${qr.total} ${qr.total}`} className={`mx-auto mt-3 ${picked.length === 1 ? "h-80 w-80" : "h-44 w-44"}`} shapeRendering="crispEdges" role="img" aria-label={`QR code for ${k.name}`}><rect width="100%" height="100%" fill="#fff" /><path d={qr.d} fill="#000" /></svg>
                <p className="mt-2 break-all text-xs text-slate-500">{url}</p>
              </li>
            );
          })}
        </ul>
      )}
      {klass && (
        <section className="mt-8 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200 print:hidden">
          <h2 className="text-lg font-bold text-brand-navy">Who joined (last 7 days) · {String(klass.name)}</h2>
          {joins.length === 0 ? <p className="mt-2 text-slate-600">No one yet.</p> : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">{joins.slice(0, 60).map((j, i) => <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5"><span><b>{j.name}</b> · {j.skill}</span><span className="text-slate-500">{j.via === "QR" ? "📱 QR" : "🔗 link"} · {new Date(j.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span></li>)}</ul>
          )}
        </section>
      )}
    </AppShell>
  );
}
