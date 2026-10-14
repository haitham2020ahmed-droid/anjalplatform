"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n/client";
import { LineIcon, type LineIconName } from "@/components/ui/line-icon";

/** The useful question pages, one tab row on each of them (admins). */
export const BANK_TABS: readonly { href: string; label: string; icon: LineIconName }[] = [
  { href: "/admin/questions", label: "Questions", icon: "book" },
  { href: "/admin/question-review", label: "Review", icon: "check" },
  { href: "/admin/question-flags", label: "Flags", icon: "flag" },
  { href: "/admin/item-quality", label: "Quality", icon: "search" },
  { href: "/admin/bank-gaps", label: "Gaps", icon: "grid" },
  { href: "/admin/questions/duplicates", label: "Duplicates", icon: "layers" },
  { href: "/admin/questions/import", label: "Import", icon: "inbox" },
  { href: "/admin/questions/load", label: "Load new questions", icon: "download" },
];

export function BankTabs() {
  const t = useT();
  const path = usePathname() ?? "";
  // the longest tab path that the page is under is the current one
  const current = [...BANK_TABS].sort((a, b) => b.href.length - a.href.length).find((x) => path === x.href || path.startsWith(`${x.href}/`))?.href;
  return (
    <nav aria-label={t("Question pages")} className="mb-5 flex flex-wrap gap-1.5 rounded-2xl bg-white p-1.5 ring-1 ring-slate-200 print:hidden">
      {BANK_TABS.map((x) => {
        const on = x.href === current;
        return (
          <Link key={x.href} href={x.href} prefetch={false} aria-current={on ? "page" : undefined}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold ${on ? "bg-brand-navy text-white" : "text-brand-navy hover:bg-slate-100"}`}>
            <LineIcon name={x.icon} className="h-4 w-4 shrink-0" />{t(x.label)}
          </Link>
        );
      })}
    </nav>
  );
}
