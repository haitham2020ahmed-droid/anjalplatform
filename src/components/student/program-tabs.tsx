import Link from "next/link";
import { getT } from "@/i18n/server";

/** Two or three big tabs at the top of a program page (e.g. "Articles" | "My report"). Plain links: no client code. */
export async function ProgramTabs({ tabs, label = "Sections" }: { tabs: { href: string; label: string; icon?: string; on: boolean }[]; label?: string }) {
  const { t } = await getT();
  return (
    <nav aria-label={t(label)} className="mb-5 inline-flex flex-wrap gap-1 rounded-2xl bg-white p-1 ring-1 ring-slate-200">
      {tabs.map((x) => (
        <Link key={x.href} href={x.href} prefetch={false} aria-current={x.on ? "page" : undefined}
          className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-5 font-semibold transition ${x.on ? "bg-brand-navy text-white shadow-sm" : "text-brand-navy hover:bg-slate-50"}`}>
          {x.icon && <span aria-hidden="true">{x.icon}</span>}{t(x.label)}
        </Link>
      ))}
    </nav>
  );
}
