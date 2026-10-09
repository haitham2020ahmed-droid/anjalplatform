import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/plans/print-button";
import { getActor, requireActor } from "@/server/auth/next";

export const metadata = { title: "Guide" };

type Step = [icon: string, title: string, text: string, href: string];
const GUIDES: Record<string, { title: string; intro: string; steps: Step[] }> = {
  STUDENT: { title: "How to use Al-Anjal English", intro: "Five things to know. Look for the numbers on the icons: they show what is waiting for you (red = late or due today).", steps: [
    ["📘", "Do My work first", "Your teacher's tasks are on My work. Press “Next up” to start. Practice adapts to you: harder after right answers, easier after mistakes.", "/student"],
    ["🗺️", "My MAP", "Your MAP results, your goal (how many RIT points are left) and your MAP plan. Practise your first area first. Try the MAP practice test when it opens.", "/student/map"],
    ["📖", "Double-click a word", "Any word in a reading: double-click to see its meaning, synonyms and how to say it. It goes into My words; take the weekly word quiz.", "/student/words"],
    ["🔁", "Review my mistakes", "Questions you got wrong come back after 1, 3 and 7 days. Three right answers and you have learned it.", "/student/review"],
    ["🎯", "Set your weekly goal", "On My work, choose how many answers or minutes this week. Help your class win the class challenge!", "/student#my-week"],
  ] },
  TEACHER: { title: "Teacher guide: the essentials", intro: "Start with “My week” every Monday: it tells you what each class needs and plans the week in one click.", steps: [
    ["📅", "My week", "Suggestions per class (weak skills, MAP plans to send, small groups, alerts) and ⚡ Plan next week. Set the class goal and the practice rhythm. Open an exit ticket at the end of a lesson.", "/teacher/week"],
    ["🗺️", "MAP plans", "After importing the NWEA file (or the ASG PDF), check each student's draft plan, edit it and send it — one student or the whole class. Small groups and the mid-unit check are there too.", "/teacher/map-plans"],
    ["🚨", "Alerts", "Students who need attention. Do something small, write what you did, mark it handled. Your head of department sees it.", "/teacher/alerts"],
    ["🖨", "Print box & worksheets", "Press 🖨 + next to any question; open the 🖨 box at the top to print — as it is, or in 3 levels with the answer keys.", "/teacher/worksheet"],
    ["✍️", "Writing & reading aloud", "Send a short writing task (scored 0–4 on four criteria) or a reading-aloud task; listen to the recordings and score them.", "/teacher/writing"],
    ["👪", "Reports & comments", "Write comments on a student's page (quick comments save time); share parent reports, one or the whole class.", "/teacher/reports"],
  ] },
  SCHOOL_ADMIN: { title: "Head of department guide", intro: "Your week in four pages.", steps: [
    ["🏫", "Department week", "Every class side by side: practice, accuracy, work, MAP, alerts and the hardest skills per grade. Print it or download Excel.", "/admin/department"],
    ["🚨", "Alerts & follow-up", "What each teacher did for the students who needed attention, and what is not handled yet.", "/teacher/alerts?status=ALL"],
    ["👀", "Class visit", "See any teacher's class as they see it (read only).", "/admin/visit"],
    ["🧭", "MAP practice test", "Open a window two weeks before Winter / Spring; check the bank is ready; after the real MAP, compare and correct the questions.", "/teacher/map-test"],
    ["🔗", "Bank ↔ MAP", "Every skill must have a MAP goal area to be used in MAP plans and the practice test.", "/admin/map-links"],
    ["💾", "Backup", "Download the Excel backup every week; also keep the database's own backups on.", "/admin/backup"],
  ] },
};

/** ❔ A one-page guide for the signed-in role, with links straight to each tool. Printable. */
export default async function GuidePage() {
  const actor = await requireActor();
  const me = (await getActor())!.user;
  const g = GUIDES[actor.role === "SUPER_ADMIN" ? "SCHOOL_ADMIN" : actor.role] ?? GUIDES.STUDENT;
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader icon="❔" title={g.title} subtitle={g.intro}><PrintButton /></PageHeader>
      <ol className="grid gap-4 md:grid-cols-2">
        {g.steps.map(([icon, title, text, href], i) => (
          <li key={title} className="animate-fade-up break-inside-avoid" style={{ animationDelay: `${i * 60}ms` }}>
            <Link href={href} className="lift flex h-full gap-4 rounded-3xl bg-white p-5 ring-1 ring-slate-200">
              <span aria-hidden="true" className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br bg-linear-to-br from-sky-50 to-violet-50 text-3xl ring-1 ring-slate-200">{icon}</span>
              <span><span className="block text-xs font-bold uppercase tracking-wider text-brand-teal">Step {i + 1}</span><span className="block text-lg font-bold text-brand-navy">{title}</span><span className="mt-1 block text-slate-700">{text}</span></span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-slate-500">Questions? {actor.role === "STUDENT" ? "Ask your teacher." : "Ask the head of the English department."} · <Link href="/privacy" className="underline">Privacy</Link></p>
    </AppShell>
  );
}
