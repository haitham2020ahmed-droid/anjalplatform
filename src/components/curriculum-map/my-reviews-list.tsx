"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/client";
import type { MyReviewRow } from "@/server/curriculum-map/review-control";
import { deleteMyReviewAction } from "@/app/teacher/my-reviews/actions";

const btn = "inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-semibold ring-1 ring-slate-300 hover:ring-brand-teal disabled:opacity-50";
const main = "inline-flex min-h-10 items-center rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white disabled:opacity-50";
const field = "mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

/**
 * 📚 r92 "My Reviews": every Review this teacher has built — ⭐ open any of them to keep editing, ➖ remove one
 * no longer needed. See src/server/curriculum-map/review-control.ts myReviews/deleteTeacherReview.
 * 🔁 fix (Oct 2026, "عايز اضيف icon review"): + a "start a new Review" grade picker, so this page alone (reached
 * from the teacher's own 🔁 Review menu icon) is enough to begin a whole-grade Review Builder for any grade — no
 * need to open Curriculum Map first, even for a teacher with no Curriculum Map content set up at all (Review
 * Builder can be built entirely from skill search).
 */
export function MyReviewsList({ initial, grades }: { initial: MyReviewRow[]; grades: { level: number; name: string }[] }) {
  const t = useT();
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [grade, setGrade] = useState(String(grades[0]?.level ?? ""));

  const remove = (id: string) => start(async () => {
    setMsg(null);
    const r = await deleteMyReviewAction(id);
    if (r.ok) { setRows((rs) => rs.filter((x) => x.id !== id)); setMsg({ ok: true, text: t("Removed ✓") }); }
    else setMsg({ ok: false, text: r.message });
  });

  const startNew = grades.length > 0 && (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200" aria-label={t("Start a new Review")}>
      <h2 className="font-semibold text-slate-900">➕ {t("Start a new Review")}</h2>
      <p className="mt-1 text-sm text-slate-600">{t("Pick a grade to open its Review Builder — collect questions from any Text Set or skill (search works too), then assign.")}</p>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (grade) router.push(`/teacher/review-builder?grade=${grade}`); }}>
        <label className="text-sm font-semibold text-slate-700">{t("Grade")}
          <select value={grade} onChange={(e) => setGrade(e.target.value)} className={`${field} w-40`}>
            {grades.map((g) => <option key={g.level} value={g.level}>{g.name}</option>)}
          </select>
        </label>
        <button className={main} disabled={!grade}>🔁 {t("Open Review Builder")}</button>
      </form>
    </section>
  );

  if (!rows.length) {
    return (
      <div className="space-y-3">
        {startNew}
        <p className="rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-slate-200">{t("You haven't built any Reviews yet. Open a Text Set's Review (🔁 on the Curriculum Map), or start a whole-grade Review Builder above.")}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {startNew}
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl px-4 py-2 text-sm ${msg.ok ? "bg-teal-50 text-teal-900" : "bg-red-50 text-red-800"}`}>{msg.text}</p>}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900" dir="ltr">
                {r.title}
                {r.stale && <span className="ms-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">{t("No longer on the map")}</span>}
              </p>
              <p className="mt-0.5 text-sm text-slate-600">{t("{chosen} questions · students answer {count}", { chosen: r.chosen, count: r.count })} · {new Date(r.updatedAt).toLocaleDateString()}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              {!r.stale && <Link href={r.href} className={btn}>{t("Open")}</Link>}
              <button type="button" className={btn} disabled={busy} onClick={() => { if (window.confirm(t("Remove this Review? This cannot be undone."))) remove(r.id); }}>➖ {t("Remove")}</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
