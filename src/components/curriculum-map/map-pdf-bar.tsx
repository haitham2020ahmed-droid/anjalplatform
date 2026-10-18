"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";

export interface MapPdfClass { id: string; name: string; students: number; sentAt: string | null }
type ShareFn = (input: { grade: number; classIds: string[]; on: boolean }) => Promise<{ ok: boolean; message: string }>;

/**
 * 📘 r79 — at the very top of the Curriculum Map: "⬇ Full curriculum map (PDF)" for the grade shown (every skill in
 * it is a link) and "Send to students": tick classes of that grade (the teacher's own) → they find it on their
 * Curriculum page. A document, not an assignment.
 */
export function MapPdfBar({ grade, href, studentHref, classes, share, showDownload = true }: { grade: number; href: string; studentHref: string; classes: MapPdfClass[]; share: ShareFn | null; /** the new skill-plan header already has its own "Print skill plan" button — false hides the duplicate download buttons here and keeps only "Send to students" */ showDownload?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();
  const btn = "inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold";
  const run = (on: boolean) => {
    if (!share) return;
    const ids = on ? picked : classes.filter((c) => c.sentAt && picked.includes(c.id)).map((c) => c.id);
    if (!ids.length) { setMsg({ ok: false, text: t("Choose at least one class.") }); return; }
    start(async () => {
      const r = await share({ grade, classIds: ids, on });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) { setPicked([]); router.refresh(); }
    });
  };
  return (
    <div data-testid="map-pdf-bar" className="mb-4 rounded-2xl bg-white px-4 py-3 ring-1 ring-blue-100">
      <div className="flex flex-wrap items-center gap-2">
        {showDownload && <a href={href} data-testid="map-pdf-download" className={`${btn} bg-blue-700 text-white hover:bg-blue-800`}>⬇ {t("Full curriculum map (PDF)")}</a>}
        {showDownload && <a href={studentHref} data-testid="map-pdf-student" className={`${btn} bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal`}>{t("Students' copy")}</a>}
        {share && classes.length > 0 && <button type="button" data-testid="map-pdf-send" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={`${btn} bg-white text-brand-navy ring-1 ring-slate-300 hover:ring-brand-teal`}>📨 {t("Send to students")}</button>}
        {showDownload && <span className="text-xs text-slate-500">🔗 {t("Every skill in the map opens on the platform.")}</span>}
      </div>
      {open && share && (
        <fieldset className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <legend className="px-1 text-sm font-semibold text-brand-navy">{t("Classes of Grade {n}", { n: grade })}</legend>
          <div className="flex flex-wrap gap-2">
            {classes.map((c) => (
              <label key={c.id} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-white px-3 text-sm ring-1 ring-slate-200">
                <input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))} />
                <bdi>{c.name}</bdi> <span className="text-slate-500">· {t("{n} students", { n: c.students })}</span>
                {c.sentAt && <span className="rounded-full bg-emerald-50 px-2 text-xs font-semibold text-emerald-800">✓ {t("Sent {date}", { date: c.sentAt.slice(0, 10) })}</span>}
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => run(true)} className={`${btn} bg-brand-navy text-white disabled:opacity-60`}>{t("Send")}</button>
            {classes.some((c) => c.sentAt) && <button type="button" disabled={busy} onClick={() => run(false)} className={`${btn} bg-white text-slate-700 ring-1 ring-slate-300 disabled:opacity-60`}>{t("Stop showing")}</button>}
          </div>
        </fieldset>
      )}
      {msg && <p role="status" className={`mt-2 text-sm font-medium ${msg.ok ? "text-emerald-800" : "text-rose-700"}`}>{msg.text}</p>}
    </div>
  );
}
