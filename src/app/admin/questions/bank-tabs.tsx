"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/i18n/client";

/** The useful question pages, one tab row on each of them (admins). */
export const BANK_TABS: readonly { href: string; label: string; icon: string }[] = [
  { href: "/admin/questions", label: "Questions", icon: "📚" },
  { href: "/admin/question-review", label: "Review", icon: "🏷️" },
  { href: "/admin/question-flags", label: "Flags", icon: "🚩" },
  { href: "/admin/item-quality", label: "Quality", icon: "🔬" },
  { href: "/admin/bank-gaps", label: "Gaps", icon: "🕳" },
  { href: "/admin/questions/duplicates", label: "Duplicates", icon: "👯" },
  { href: "/admin/questions/import", label: "Import", icon: "📥" },
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
            <span aria-hidden="true">{x.icon}</span>{t(x.label)}
          </Link>
        );
      })}
    </nav>
  );
}
