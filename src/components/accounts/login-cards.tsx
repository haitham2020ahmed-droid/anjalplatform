import { qrPath } from "@/lib/qr";
import { translate } from "@/i18n";

export interface LoginCard { userId: string; name: string; username: string; number: string; className: string; grade: number; password: string | null }

/**
 * 🪪 Printable sign-in cards (one small card per student: name, username, password, the platform link and a QR code
 * that opens the sign-in page with the username filled in). The browser's "Save as PDF" makes the PDF.
 * Used by the admin's Student Sign-in Cards and the teacher's Download Accounts (own classes only).
 */
export function LoginCards({ cards, schoolName, base, t = (x: string, v?: Record<string, string | number>) => translate("en", x, v) }: { cards: LoginCard[]; schoolName: string; base: string; t?: (x: string, v?: Record<string, string | number>) => string }) {
  const site = base.replace(/^https?:\/\//, "");
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 print:mt-0 print:grid-cols-2 print:gap-2">
      {cards.map((c) => {
        const qr = qrPath(`${base}/login?u=${encodeURIComponent(c.username)}`);
        return (
          <div key={c.userId} className="flex break-inside-avoid gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white p-4 text-sm print:rounded-lg print:p-3">
            <svg viewBox={`0 0 ${qr.total} ${qr.total}`} className="h-24 w-24 shrink-0" shapeRendering="crispEdges" role="img" aria-label={`QR code to sign in as ${c.username}`}><rect width="100%" height="100%" fill="#fff" /><path d={qr.d} fill="#000" /></svg>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-teal">{schoolName}</p>
              <p className="mt-1 text-base font-bold text-brand-navy" dir="auto"><bdi>{c.name}</bdi></p>
              <p className="text-slate-500">{c.className} · {t("Grade {n}", { n: c.grade })}{c.number ? ` · No. ${c.number}` : ""}</p>
              <p className="mt-2">{t("Username")}: <b className="break-all font-mono" dir="ltr">{c.username}</b></p>
              <p>{t("Password")}: <b className="break-all font-mono" dir="ltr">{c.password ?? `— ${t("ask your teacher")}`}</b></p>
              <p className="mt-1 text-xs text-slate-500">{t("Scan the code, or sign in at {site}", { site })}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
