/** @jsxRuntime automatic */
/** @jsxImportSource react */
import Link from "next/link";
import { qrPath } from "@/lib/qr";
import { STRIP_STEPS, type ClassSignInStrip as Strip } from "@/lib/class-signin-strip";

type T = (text: string, vars?: Record<string, string | number>) => string;

/**
 * 🖨 r85: the class sign-in strip at the top of a teacher's weekly print of ONE class — the printable QR, its class
 * name, and "Scan → tap your name → you're in". Built only from printQrForSheet (the class's own teacher, the QR
 * turned on): never on a student or parent page.
 * 🔁 fix (Oct 2026, "الكود مالوش داعي... اي حد ممكن يستخدمه"): dropped the class code — signing in no longer needs
 * one (class-print-qr.ts#signInByName).
 */
export function ClassSignInStrip({ s, t }: { s: Strip | null; t: T }) {
  if (!s) return null;
  let q: { total: number; d: string } | null = null;
  try { q = qrPath(s.url); } catch { q = null; }
  if (!q) return null;
  return (
    <div data-class-signin="1" className="mb-3 flex items-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-white p-2 text-slate-900 break-inside-avoid">
      <svg viewBox={`0 0 ${q.total} ${q.total}`} width={72} height={72} shapeRendering="crispEdges" role="img" aria-label={t("Class sign-in")} className="shrink-0">
        <rect width="100%" height="100%" fill="#fff" /><path d={q.d} fill="#000" />
      </svg>
      <div className="min-w-0">
        <p className="text-lg font-bold text-brand-navy"><bdi>{s.className}</bdi></p>
        <p className="text-sm text-slate-700">{t(STRIP_STEPS)}</p>
      </div>
    </div>
  );
}

/** The option above a print: "Include class sign-in QR" ✓ / ☐ (a link that flips signin=0). Hidden on paper. */
export function ClassSignInOption({ on, href, t }: { on: boolean; href: string; t: T }) {
  return (
    <Link prefetch={false} href={href} role="switch" aria-checked={on} data-testid="class-signin-option"
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal print:hidden">
      <span aria-hidden="true">{on ? "☑" : "☐"}</span>{t("Include class sign-in QR")}
    </Link>
  );
}
