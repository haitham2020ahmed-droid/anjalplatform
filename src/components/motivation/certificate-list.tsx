import { getT } from "@/i18n/server";
import { achievementText, type CertificateRow } from "@/server/motivation/certificates";

/** 📜 A list of certificates with "PDF" and "Print" links (student Reports, teacher's student page). */
export async function CertificateList({ items, empty }: { items: CertificateRow[]; empty: string }) {
  const { t, lang } = await getT();
  if (!items.length) return <p className="mt-2 text-slate-600">{empty}</p>;
  const icon = { LEVEL_UP: "🚀", PLAN: "🗂️", MANUAL: "🌟" } as const;
  return (
    <ul className="mt-3 grid gap-3 sm:grid-cols-2" data-testid="certificates">
      {items.map((c) => (
        <li key={c.id} className="flex items-center gap-3 rounded-2xl bg-amber-50/60 p-3 ring-1 ring-amber-200">
          <span aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white text-2xl ring-1 ring-amber-200">{icon[c.kind]}</span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-brand-navy"><bdi>{achievementText(c, lang)}</bdi></span>
            <span className="block text-sm text-slate-600"><span dir="ltr">{c.date}</span>{c.byTeacher ? <> · {t("From my teacher")}</> : null}</span>
          </span>
          <span className="flex shrink-0 flex-col gap-1 sm:flex-row">
            <a href={`/api/certificates/${c.id}?lang=${lang}&print=1`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-xl bg-brand-navy px-3 text-sm font-semibold text-white">PDF</a>
            <a href={`/api/certificates/${c.id}?format=html&lang=${lang}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-xl bg-white px-3 text-sm font-semibold text-brand-navy ring-1 ring-slate-300">{t("Print")}</a>
          </span>
        </li>
      ))}
    </ul>
  );
}
