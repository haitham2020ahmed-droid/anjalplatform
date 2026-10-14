"use client";
import Link from "next/link";
import { useT } from "@/i18n/client";

const TABS = [
  { key: "lessons", href: "/teacher/learn", label: "Lessons", icon: "📘" },
  { key: "words", href: "/teacher/learn/words", label: "Words", icon: "📗" },
  { key: "coverage", href: "/teacher/learn/coverage", label: "Learn coverage", icon: "🧭" },
  { key: "review", href: "/teacher/learn/review", label: "Proposals and reports", icon: "📥", admin: true },
] as const;

/** The Learn section's tabs (teacher and admin; the review list is the admin's). */
export function LearnTabs({ active, admin }: { active: (typeof TABS)[number]["key"]; admin: boolean }) {
  const t = useT();
  return (
    <nav aria-label={t("Learn")} className="mb-5 flex gap-1 overflow-x-auto rounded-2xl bg-surface p-1 shadow-card ring-1 ring-line">
      {TABS.filter((x) => !("admin" in x) || admin).map((x) => (
        <Link key={x.key} href={x.href} prefetch={false} aria-current={active === x.key ? "page" : undefined}
          className={`min-h-11 shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold ${active === x.key ? "bg-brand-navy text-white" : "text-ink-2 hover:bg-surface-2"}`}>
          <span aria-hidden="true">{x.icon}</span> {t(x.label)}
        </Link>
      ))}
    </nav>
  );
}

/** A short status line after an action (?msg= / ?err=). */
export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return <p role="status" className={`mb-4 rounded-xl px-4 py-3 ring-1 ${err ? "bg-rose-50 text-rose-900 ring-rose-200" : "bg-teal-50 text-teal-900 ring-teal-200"}`} dir="auto">{err ?? msg}</p>;
}
