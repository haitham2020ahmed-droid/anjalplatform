import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { LineIcon, type LineIconName } from "@/components/ui/line-icon";
import { getT } from "@/i18n/server";
import { getActor, requireActor } from "@/server/auth/next";

export const metadata = { title: "Reading" };

const TILES: { href: string; line: LineIconName; label: string; hint: string }[] = [
  { href: "/student/readmaster", line: "star", label: "ReadMaster", hint: "One article, three reading levels" },
  { href: "/teacher/readrise", line: "growth", label: "ReadRise", hint: "Articles and each student's reading level" },
  { href: "/teacher/fluency", line: "mic", label: "Reading Fluency", hint: "Fluency Coach results" },
  { href: "/teacher/respond", line: "pen", label: "Respond to Reading", hint: "Writing tasks at three levels" },
  { href: "/teacher/word-journal", line: "book", label: "Word Journals", hint: "Students' word journals" },
];

/**
 * 📚 Reading (teacher menu): ReadMaster, ReadRise, Reading Fluency and the reading tools — the ONE way in to them
 * (Writing has its own menu entry; the ReadMaster results are a report in Reports). All content is open to every teacher.
 */
export default async function TeacherReading() {
  await requireActor({ roles: ["TEACHER", "SCHOOL_ADMIN", "SUPER_ADMIN"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/teacher", label: "Home" }} title="Reading" subtitle="ReadMaster, ReadRise, Reading Fluency and the reading tools." />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((x) => (
          <li key={x.href}>
            <Link prefetch={false} href={x.href} className="group flex h-full min-h-24 items-start gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-px hover:shadow-card hover:ring-brand-teal/60">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-50 text-brand-navy ring-1 ring-slate-200 group-hover:text-brand-teal"><LineIcon name={x.line} /></span>
              <span className="min-w-0">
                <span className="block font-semibold text-slate-800 group-hover:text-brand-navy">{t(x.label)}</span>
                <span className="mt-0.5 block text-sm leading-snug text-slate-500">{t(x.hint)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
