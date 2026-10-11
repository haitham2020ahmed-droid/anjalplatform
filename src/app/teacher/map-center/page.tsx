import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, requireActor } from "@/server/auth/next";

export const metadata = { title: "MAP Center" };

type Tab = "student" | "class" | "school";
interface Tile { href: string; icon: string; title: string; what: string; admin?: boolean }

/** Every MAP page, organised by the question it answers: one student, one class, the whole school. */
const TILES: Record<Tab, { title: string; tiles: Tile[] }> = {
  student: { title: "One student", tiles: [
    { href: "/admin/student-file", icon: "🔎", title: "Student file", what: "Find a student: MAP profile, instructional areas, growth, plans and the 🔮 next-MAP prediction." },
    { href: "/teacher/personal-plan", icon: "🎚", title: "Personal & 3-level plan", what: "A plan for each student from their MAP areas, at their level." },
    { href: "/teacher/map-skill-plan", icon: "🧭", title: "MAP skill plan", what: "The skills behind a student's weakest instructional area." },
    { href: "/teacher/growth", icon: "📈", title: "Growth", what: "Fall → Winter → Spring RIT and whether the projected growth was met." },
  ] },
  class: { title: "My class", tiles: [
    { href: "/teacher/map-overview", icon: "📊", title: "Class MAP profile", what: "NWEA-style class profile: RIT bands, instructional areas, who needs what." },
    { href: "/teacher/map-plans", icon: "📋", title: "MAP plans", what: "Build and send the class plan from MAP, by instructional area and level." },
    { href: "/teacher/map-reports", icon: "📑", title: "MAP reports", what: "Printable class and student MAP reports." },
    { href: "/teacher/map-test", icon: "🧭", title: "MAP practice test", what: "A practice test in MAP style, scored by instructional area." },
    { href: "/teacher/learning-loop", icon: "🔄", title: "Learning Loop", what: "Weakest area vs practice, Weekly Checks and the next-MAP prediction for every student." },
  ] },
  school: { title: "Whole school", tiles: [
    { href: "/teacher/map-rit", icon: "🗺️", title: "MAP data", what: "Import or enter MAP scores (3 Reading + 3 Language areas) and check them." },
    { href: "/teacher/grade-summary", icon: "🏫", title: "Grade summary", what: "Each grade's RIT, growth and students at risk." },
    { href: "/admin/map-classification", icon: "🧩", title: "MAP classification", what: "Every bank question's MAP test and instructional area.", admin: true },
    { href: "/admin/map-links", icon: "🔗", title: "Bank ↔ MAP", what: "How the question bank covers each MAP goal.", admin: true },
    { href: "/admin/map-continuum", icon: "📘", title: "Learning continuum", what: "NWEA learning statements by RIT band.", admin: true },
  ] },
};

export default async function MapCenterPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const tab: Tab = sp.tab === "class" || sp.tab === "school" ? sp.tab : "student";
  const admin = actor.role !== "TEACHER";
  const chip = (on: boolean) => `rounded-full px-5 py-2 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: admin ? "/admin" : "/teacher", label: "Home" }} icon="🗺️" title="MAP Center" subtitle="All MAP work in one place, by what you want to know: one student, your class, or the whole school." />
      <nav aria-label="MAP Center" className="flex flex-wrap gap-2">
        {(Object.keys(TILES) as Tab[]).map((k) => <Link key={k} href={`/teacher/map-center?tab=${k}`} aria-current={k === tab ? "page" : undefined} className={chip(k === tab)}>{TILES[k].title}</Link>)}
      </nav>
      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TILES[tab].tiles.filter((t) => admin || !t.admin).map((t) => (
          <Link key={t.href} href={t.href} className="lift rounded-3xl bg-white p-5 ring-1 ring-slate-200 hover:ring-brand-teal">
            <span className="text-3xl">{t.icon}</span>
            <span className="mt-2 block text-lg font-bold text-brand-navy">{t.title}</span>
            <span className="mt-1 block text-sm text-slate-600">{t.what}</span>
          </Link>
        ))}
      </section>
    </AppShell>
  );
}
