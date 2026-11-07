/** 🚀 ReadRise staff sub-navigation (library · import · dashboard). */
import Link from "next/link";
import { getT } from "@/i18n/server";

/** Round 9 review: the tab names follow the interface language (they were always English). */
export async function ReadRiseTabs({ items, current }: { items: { href: string; label: string }[]; current: string }) {
  const { t } = await getT();
  return (
    <nav aria-label="ReadRise" className="flex flex-wrap gap-2">
      {items.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i.href === current ? "page" : undefined}
          className={`rounded-full px-4 py-2 text-sm font-bold transition ${i.href === current ? "bg-brand-navy text-white shadow" : "bg-white text-brand-navy ring-1 ring-slate-200 hover:ring-brand-teal"}`}>{t(i.label)}</Link>
      ))}
    </nav>
  );
}

export const ADMIN_TABS = [
  { href: "/admin/readrise", label: "📚 Library" },
  { href: "/admin/readrise/import", label: "📥 Import" },
  { href: "/admin/readrise/dashboard", label: "📈 Dashboard" },
  { href: "/admin/readrise/reset", label: "🔄 Reset placement" },
];
export const TEACHER_TABS = [
  { href: "/teacher/readrise", label: "📈 My class" },
  { href: "/teacher/readrise/report", label: "📋 Report" },
  { href: "/teacher/readrise/grading", label: "✍️ Grading" },
  { href: "/teacher/readrise/library", label: "📚 Library" },
  { href: "/teacher/readrise/import", label: "📥 Import" },
];
