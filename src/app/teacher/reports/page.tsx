import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Callout, ReportHeader } from "@/components/report-kit";
import { getActor, repo, requireActor } from "@/server/auth/next";
import { readableClasses } from "@/server/teacher/coordinators";
import { classMembers, studentNames } from "@/server/insights/student-data";
import { isReportShared } from "@/server/insights/parent-report";
import { staffFamilyReports } from "@/server/reports/family-reports";
import { shareManyAction } from "./actions";

export const metadata = { title: "Reports" };

/**
 * 📊 Reports hub: every report of the platform from one place — family reports (with the admin's approval),
 * MAP reports in NWEA style, practice analytics, the Diagnostic, reading fluency and the exports.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ classId?: string; msg?: string }> }) {
  const actor = await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"], permission: "reports:read" });
  const me = (await getActor())!.user;
  const sp = await searchParams;
  const teacher = actor.role === "TEACHER";
  const classes = (await readableClasses(repo, actor)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const klass = classes.find((c) => c.id === sp.classId) ?? classes[0];
  const cid = klass ? String(klass.id) : "";
  const ids = klass ? await classMembers(repo, cid) : [];
  const names = await studentNames(repo, ids);
  const fam = await staffFamilyReports(repo, actor).catch(() => []);
  const mine = fam.filter((r) => ids.includes(r.studentId));
  const pendingProgress = new Set(mine.filter((r) => r.kind === "PROGRESS" && r.status === "PENDING").map((r) => r.studentId));
  const rows = await Promise.all(ids.map(async (id) => ({ id, name: names.get(id)?.name ?? "Student", shared: await isReportShared(repo, String(actor.schoolId), id), waiting: pendingProgress.has(id) })));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  const count = (st: string) => fam.filter((r) => r.status === st).length;
  const chip = (on: boolean) => `rounded-full px-4 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "bg-white ring-1 ring-slate-200 hover:ring-brand-teal"}`;
  const tile = "lift flex flex-col rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 hover:ring-brand-teal";
  const btn = "rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal";
  const Group = ({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) => (
    <section className="mt-7"><h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-brand-navy sm:text-xl"><span aria-hidden="true">{icon}</span> {title}</h2><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</div></section>
  );
  const Tile = ({ icon, title, text, children, strong }: { icon: string; title: string; text: string; children: React.ReactNode; strong?: boolean }) => (
    <div className={`${tile} ${strong ? "ring-2 ring-teal-300" : ""}`}><p className="text-lg font-bold text-brand-navy"><span aria-hidden="true">{icon}</span> {title}</p><p className="flex-1 text-sm text-slate-600">{text}</p><div className="mt-3 flex flex-wrap gap-2">{children}</div></div>
  );
  return (
    <AppShell name={String(me.displayName)}>
      <ReportHeader back={{ href: teacher ? "/teacher" : "/admin", label: "Home" }} icon="📊" title="Reports" print={false}
        subtitle="Every report in one place: for families (approved by the school admin before they are sent), MAP in NWEA style, practice on the platform, the Diagnostic and reading fluency. Each one prints or saves as PDF."
        who={klass ? String(klass.name) : undefined}
        filters={classes.length ? <nav aria-label="Classes" className="flex flex-wrap gap-2">{classes.map((c) => <Link key={String(c.id)} href={`/teacher/reports?classId=${c.id}`} className={chip(c.id === klass?.id)}>{String(c.name)}</Link>)}</nav> : undefined} />
      {sp.msg && <p role="status" className="mb-4 rounded-xl bg-teal-50 px-4 py-3 text-teal-900 ring-1 ring-teal-200">{sp.msg}</p>}
      {cid && (
        <Callout kind="next" title="Start here" items={[
          <><Link className="font-semibold text-brand-teal underline" href={`/teacher/progress?classId=${cid}&sort=status`}>Students dashboard</Link> — who needs help first (at risk, late work).</>,
          <><Link className="font-semibold text-brand-teal underline" href={`/teacher/reports/grammar?classId=${cid}`}>Grammar results</Link> · <Link className="font-semibold text-brand-teal underline" href="/teacher/curriculum-results">Curriculum results</Link> — what to reteach this week.</>,
          <><Link className="font-semibold text-brand-teal underline" href={`/teacher/rti-plan?classId=${cid}`}>RTI weekly plan</Link> — this week's Tier 2 and Tier 3 groups.</>,
        ]} />
      )}

      {/* one hub, five categories (UI reorg Phase 3 H): the quickest way to each kind of report */}
      <Group icon="🗂️" title="Find a report">
        <Tile icon="🏫" title="Class overview" strong text="Every student of the class: progress, accuracy, status; MAP class profile.">{cid && <><Link className={btn} href={`/teacher/progress?classId=${cid}`}>Open</Link><Link className={btn} href={`/map-report/class/${cid}/profile?subject=READING`}>MAP</Link></>}</Tile>
        <Tile icon="🧑‍🎓" title="Each student" text="One page with everything about a student: work, plans, tests, MAP, skills, time and reports.">
          <form action="/teacher/students/go" className="flex flex-wrap gap-2"><select name="id" aria-label="Student" className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">{rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select><button className={btn}>Open</button></form>
        </Tile>
        <Tile icon="🧩" title="Skills" text="How the class did on each skill and section; grammar skills.">{cid && <><Link className={btn} href="/teacher/curriculum-results">Curriculum</Link><Link className={btn} href={`/teacher/reports/grammar?classId=${cid}`}>Grammar</Link></>}</Tile>
        <Tile icon="⏱️" title="Time spent" text="Questions and minutes by day, by skill and per student, at school or at home.">{cid && <Link className={btn} href={`/teacher/practice-analytics?classId=${cid}`}>Open</Link>}</Tile>
        <Tile icon="📝" title="Test results by type" text="NAFS, MAP, Diagnostic, Weekly Quiz, Chapter Test and your own tests: results by skill.">{cid && <Link className={btn} href={`/teacher/assessments?classId=${cid}`}>Open</Link>}</Tile>
      </Group>

      <Group icon="👪" title="For families">
        <Tile icon="👪" title="Family Reports" strong text={`Prepare one with a click or write your own, then send it for approval. ${count("DRAFT")} draft · ${count("PENDING")} waiting · ${count("RETURNED")} returned · ${count("APPROVED")} approved.`}>
          <Link className={btn} href={`/teacher/family-reports${cid ? `?classId=${cid}` : ""}`}>Open</Link>{!teacher && <Link className={btn} href="/admin/report-approvals">📨 To approve · {count("PENDING")}</Link>}
        </Tile>
        <Tile icon="📈" title="MAP Family Reports" text="Achievement, growth, the RIT history against the national average and the goal — for parents, 2 pages per student.">{cid && <Link className={btn} href={`/map-report/class/${cid}/family`}>Whole class</Link>}</Tile>
        <Tile icon="📝" title="Diagnostic reports" text="Each student's strengths and next steps from the Diagnostic; share (after approval) with the family.">
          <Link className={btn} href="/teacher/diagnostic">Open</Link>
        </Tile>
      </Group>

      <Group icon="🗺️" title="MAP Growth (NWEA style)">
        <Tile icon="📊" title="Class Profile" strong text="Percentile bands, class vs national, instructional areas, test details with retest flags, growth, projected proficiency, achievement × growth.">{cid && <><Link className={btn} href={`/map-report/class/${cid}/profile?subject=READING`}>📖 Reading</Link><Link className={btn} href={`/map-report/class/${cid}/profile?subject=LANGUAGE`}>✍️ Language</Link></>}</Tile>
        <Tile icon="🧑‍🎓" title="Student Profile" text="One student: tiles, growth over the percentile bands, instructional areas (strength / focus), action plan and the Learning Continuum.">
          <form action="/map-report/profile/go" className="flex flex-wrap gap-2"><select name="id" aria-label="Student" className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">{rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select><button className={btn}>Open</button></form>
        </Tile>
        <Tile icon="🏫" title="Grade & School Overview" text="Every grade and class side by side: mean RIT vs national, bands, growth, tests to check."><Link className={btn} href="/teacher/map-overview">Open</Link></Tile>
        <Tile icon="📘" title="Study plans · Continuum" text="Reinforce · Develop · Introduce for each student and group, with the skills to assign."><Link className={btn} href={`/teacher/map-reports${cid ? `?classId=${cid}` : ""}`}>All MAP reports</Link></Tile>
        <Tile icon="🌱" title="MAP Growth" text="After Winter / Spring: who reached the expected growth, by class and grade."><Link className={btn} href="/teacher/growth">Open</Link></Tile>
      </Group>

      <Group icon="💻" title="Practice on the platform">
        <Tile icon="📊" title="Practice Analytics" strong text="Any date range: questions, time, at school or at home, by day, by skill, per student (with each skill), trouble spots.">{cid && <Link className={btn} href={`/teacher/practice-analytics?classId=${cid}`}>Open</Link>}</Tile>
        <Tile icon="📈" title="Students dashboard" text="Progress, accuracy, trend and status of every student; PDF.">{cid && <Link className={btn} href={`/teacher/progress?classId=${cid}`}>Open</Link>}</Tile>
        <Tile icon="🎙️" title="Reading fluency" text="Words correct per minute against the school's rubric, and the words to practise."><Link className={btn} href="/teacher/fluency">Open</Link></Tile>
      </Group>

      <Group icon="🧩" title="Skills, games, reading and RTI">
        <Tile icon="🗓" title="RTI weekly plan" strong text="This week's Tier 2 and Tier 3 groups: students, focus skill, lesson, minutes, progress checks and decisions. Printable.">{cid && <Link className={btn} href={`/teacher/rti-plan?classId=${cid}`}>Open</Link>}</Tile>
        <Tile icon="🔤" title="Grammar results" text="Grammar and mechanics skills: mastery, accuracy, common errors and what to reteach; per student too.">{cid && <Link className={btn} href={`/teacher/reports/grammar?classId=${cid}`}>Open</Link>}</Tile>
        <Tile icon="🎮" title="Live games" text="Participation, accuracy by skill, rapid guessing and the most missed questions of the class's live games.">{cid && <Link className={btn} href={`/teacher/reports/games?classId=${cid}`}>Open</Link>}</Tile>
        <Tile icon="🎲" title="Games report" text="The most played and best rated games (Play and Live Challenge)."><Link className={btn} href="/teacher/reports/games-usage">Open</Link></Tile>
        <Tile icon="⭐" title="ReadMaster" text="Articles read, ReadMaster reading Lexile start → now, accuracy by question type and time.">{cid && <Link className={btn} href={`/teacher/reports/readmaster?classId=${cid}`}>Open</Link>}</Tile>
        <Tile icon="🚀" title="ReadRise" text="ReadRise Level (estimate) start, now and growth, readings, first-try accuracy and goals — with an Excel / CSV / PDF export.">{cid && <Link className={btn} href={`/teacher/readrise?class=${cid}`}>Open</Link>}</Tile>
        {!teacher && <Tile icon="⚖️" title="Below / On / Above" text="The school's level distribution by grade, class and strand, the change since last month and the tiers."><Link className={btn} href="/admin/levels">Open</Link></Tile>}
      </Group>

      {klass && (
        <>
          <form action={shareManyAction} className="mt-8 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <input type="hidden" name="classId" value={cid} />
            <h2 className="text-lg font-bold text-brand-navy">📄 Progress reports for parents · {String(klass.name)}</h2>
            <p className="text-sm text-slate-600">{teacher ? "Sharing sends the report to the school admin first; parents see it once it is approved." : "As an admin, sharing is immediate."}</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">{rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 ring-1 ring-slate-200">
                <label className="flex min-h-10 items-center gap-2"><input type="checkbox" name="student" value={r.id} /><span className="font-medium">{r.name}</span></label>
                <span className="flex items-center gap-2 text-sm">{r.shared ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">Shared</span> : r.waiting ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Waiting for approval</span> : <span className="text-xs text-slate-500">Not shared</span>}<Link href={`/teacher/progress/${r.id}/report`} className="font-semibold text-brand-teal underline">Open</Link></span>
              </li>
            ))}</ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <button name="op" value="all" className="rounded-xl bg-brand-navy px-4 py-2 font-semibold text-white hover:bg-brand-purple">👪 {teacher ? "Send the whole class for approval" : "Share the whole class"}</button>
              <button name="op" value="share" className="rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700">{teacher ? "Send ticked for approval" : "Share ticked reports"}</button>
              <button name="op" value="stop" className="rounded-xl bg-white px-4 py-2 font-semibold text-slate-700 ring-1 ring-slate-300">Stop sharing ticked</button>
            </div>
          </form>
          <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-lg font-bold text-brand-navy">⬇️ Exports</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`/api/progress-export?classId=${cid}&subject=READING`} className={btn}>📊 Students (Reading) · Excel</a>
              <a href={`/api/progress-export?classId=${cid}&subject=LANGUAGE`} className={btn}>📊 Students (Language) · Excel</a>
              <Link href={`/teacher/progress?classId=${cid}`} className={btn}>🖨 Students dashboard · PDF</Link>
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}
