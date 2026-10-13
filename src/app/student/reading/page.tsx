import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { getActor, requireActor } from "@/server/auth/next";
import { LineIcon, type LineIconName } from "@/components/ui/line-icon";
import { getT } from "@/i18n/server";

export const metadata = { title: "ReadMaster / ReadRise" };

type TFn = Awaited<ReturnType<typeof getT>>["t"];
function Tile({ href, line, label, hint, t }: { href: string; line: LineIconName; label: string; hint: string; t: TFn }) {
  return (
    <li>
      <Link prefetch={false} href={href} className="group flex h-full min-h-28 flex-col gap-3 rounded-2xl bg-white p-5 ring-1 ring-slate-200/80 transition hover:shadow-card hover:ring-brand-teal/60">
        <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-50 text-brand-navy ring-1 ring-slate-200/80 group-hover:bg-brand-teal/10 group-hover:text-brand-teal"><LineIcon name={line} /></span>
        <span><span className="block font-semibold text-brand-navy">{t(label)}</span><span className="mt-0.5 block text-[13px] text-slate-500">{t(hint)}</span></span>
      </Link>
    </li>
  );
}

/**
 * Reading in one place (student menu): ReadMaster, ReadRise, Fluency Coach and My Words — calm line-icon cards.
 * Respond to Reading opens from the Curriculum Map study plan.
 */
export default async function StudentReading() {
  await requireActor({ roles: ["STUDENT"] });
  const me = (await getActor())!.user;
  const { t } = await getT();
  return (
    <AppShell name={String(me.displayName)}>
      <PageHeader back={{ href: "/student", label: "Home" }} title="ReadMaster / ReadRise" subtitle={t("Read, listen and practise reading.")} />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile href="/student/readmaster" line="star" label="ReadMaster" hint="All the articles for your grade" t={t} />
        <Tile href="/student/readrise" line="rise" label="ReadRise" hint="Articles on every topic" t={t} />
        <Tile href="/student/fluency-coach" line="mic" label="Fluency Coach" hint="Read aloud and get feedback" t={t} />
        <Tile href="/student/words" line="words" label="My Words" hint="The words you collected" t={t} />
      </ul>
    </AppShell>
  );
}
